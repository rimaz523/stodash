using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Stodash.Api.Data;

namespace Stodash.Api.Infrastructure;

/// <summary>
/// Caches provider results. Everything is kept in memory. Results marked <c>durable</c> (slow-changing data such as
/// profiles, statements and filings) are also stored in the database, so they survive API restarts and we don't
/// re-download them. Failures are never cached. On Azure this can be swapped for a Redis-backed implementation.
/// </summary>
public interface IMarketCache
{
    Task<T> GetOrLoadAsync<T>(string key, TimeSpan ttl, Func<Task<T>> load, bool durable = false);

    /// <summary>Stores (or replaces) a value, e.g. one rebuilt in the background. Only call it with good data.</summary>
    Task SetAsync<T>(string key, T value, TimeSpan ttl, bool durable = false);
}

public sealed class MarketCache(
    IMemoryCache memory,
    IDbContextFactory<StodashDb> dbFactory,
    ProviderHealth health,
    ILogger<MarketCache> log) : IMarketCache
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // After a database error, skip the database for a minute rather than slowing every request down.
    private static readonly TimeSpan DbBackoff = TimeSpan.FromMinutes(1);
    private DateTimeOffset _skipDbUntil;

    public async Task<T> GetOrLoadAsync<T>(string key, TimeSpan ttl, Func<Task<T>> load, bool durable = false)
    {
        if (memory.TryGetValue(key, out T? hit) && hit is not null) return hit;

        if (durable && await ReadAsync<T>(key) is { } stored)
        {
            memory.Set(key, stored.Value, stored.ExpiresAt);
            return stored.Value;
        }

        var value = await load(); // failures throw and are deliberately not cached
        memory.Set(key, value, ttl);
        if (durable) await WriteAsync(key, value, DateTimeOffset.UtcNow + ttl);
        return value;
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan ttl, bool durable = false)
    {
        memory.Set(key, value, ttl);
        if (durable) await WriteAsync(key, value, DateTimeOffset.UtcNow + ttl);
    }

    private bool DbAvailable => DateTimeOffset.UtcNow >= _skipDbUntil;

    private async Task<(T Value, DateTimeOffset ExpiresAt)?> ReadAsync<T>(string key)
    {
        if (!DbAvailable) return null;
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync();
            var row = await db.CacheEntries.AsNoTracking()
                .Where(c => c.Key == key && c.ExpiresAt > DateTimeOffset.UtcNow)
                .Select(c => new { c.Json, c.ExpiresAt })
                .FirstOrDefaultAsync();
            health.Ok(ProviderHealth.Database);
            if (row is null) return null;
            return JsonSerializer.Deserialize<T>(row.Json, Json) is { } value ? (value, row.ExpiresAt) : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            DbFailed(ex, "read");
            return null;
        }
    }

    private async Task WriteAsync<T>(string key, T value, DateTimeOffset expiresAt)
    {
        if (!DbAvailable) return;
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync();
            var json = JsonSerializer.Serialize(value, Json);
            var row = await db.CacheEntries.FindAsync(key);
            if (row is null) db.CacheEntries.Add(new CacheEntry { Key = key, Json = json, ExpiresAt = expiresAt });
            else (row.Json, row.ExpiresAt) = (json, expiresAt);
            await db.SaveChangesAsync();
            health.Ok(ProviderHealth.Database);
        }
        catch (DbUpdateException)
        {
            // Another request stored the same key a moment earlier. Either copy is fine.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            DbFailed(ex, "write");
        }
    }

    private void DbFailed(Exception ex, string action)
    {
        _skipDbUntil = DateTimeOffset.UtcNow + DbBackoff;
        health.Fail(ProviderHealth.Database, "Database unavailable: " + ex.GetBaseException().Message);
        log.LogWarning("Cache {Action} skipped the database for {Minutes} min: {Message}",
            action, DbBackoff.TotalMinutes, ex.GetBaseException().Message);
    }
}

/// <summary>Deletes expired cache rows once an hour.</summary>
public sealed class CacheJanitor(IDbContextFactory<StodashDb> dbFactory, ILogger<CacheJanitor> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                await using var db = await dbFactory.CreateDbContextAsync(stoppingToken);
                var removed = await db.CacheEntries.Where(c => c.ExpiresAt < DateTimeOffset.UtcNow).ExecuteDeleteAsync(stoppingToken);
                if (removed > 0) log.LogInformation("Removed {Count} expired cache rows.", removed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogDebug("Cache cleanup skipped: {Message}", ex.GetBaseException().Message);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
