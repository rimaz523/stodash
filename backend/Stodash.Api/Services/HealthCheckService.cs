using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Stodash.Api.Data;
using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// The outcome of checking one provider. State is "ok", "failed" or "skipped" (no key configured).
/// <see cref="Ms"/> is how long the call took.
/// </summary>
public sealed record ProviderCheck(string State, long? Ms, string? Error);

/// <summary>
/// <c>GET /api/health?check=true</c>: makes one small, cheap call to every configured provider and reports whether each
/// key and connection actually works. Only runs when asked (never on a timer), and repeats within 30 seconds return the
/// previous result, so it can't burn through free-tier limits.
/// </summary>
public sealed class HealthCheckService(
    YahooClient yahoo,
    FinnhubClient finnhub,
    SecClient sec,
    FredClient fred,
    TreasuryClient treasury,
    CoinGeckoClient coinGecko,
    FrankfurterClient frankfurter,
    RssClient rss,
    IndexListClient indexList,
    IDbContextFactory<StodashDb> dbFactory,
    ProviderHealth health,
    IMemoryCache memory)
{
    private static readonly TimeSpan PerCheckTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan ReuseFor = TimeSpan.FromSeconds(30);
    private static readonly SemaphoreSlim OneAtATime = new(1, 1);

    public async Task<IReadOnlyDictionary<string, ProviderCheck>> RunAsync(CancellationToken ct)
    {
        const string key = "health:check";
        if (memory.TryGetValue(key, out IReadOnlyDictionary<string, ProviderCheck>? recent) && recent is not null) return recent;

        await OneAtATime.WaitAsync(ct);
        try
        {
            if (memory.TryGetValue(key, out recent) && recent is not null) return recent; // another request just ran it

            var checks = new (string Name, bool Configured, Func<CancellationToken, Task> Call)[]
            {
                (ProviderHealth.Yahoo, true, c => yahoo.GetQuoteSummaryAsync("AAPL", "price", c)), // also tests the crumb flow
                (ProviderHealth.Sec, sec.IsConfigured, c => sec.GetSubmissionsAsync(320193, c)), // Apple's filing index
                (ProviderHealth.Finnhub, finnhub.IsConfigured, c => finnhub.GetQuoteAsync("AAPL", c)),
                (ProviderHealth.Fred, fred.IsConfigured,
                    c => fred.GetObservationsAsync("DFF", DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-7), c)),
                (ProviderHealth.Treasury, true, c => treasury.GetYearAsync(DateTime.UtcNow.Year, c)),
                (ProviderHealth.CoinGecko, true, coinGecko.PingAsync),
                (ProviderHealth.Frankfurter, true, c => frankfurter.GetUsdRatesAsync(["EUR"], c)),
                (ProviderHealth.Rss, true, c => rss.CheckAsync(TopNewsService.Feeds[0].Name, TopNewsService.Feeds[0].Url, c)),
                (ProviderHealth.IndexList, true, indexList.GetSp500Async),
                (ProviderHealth.Database, true, CheckDatabaseAsync),
            };

            var results = await Task.WhenAll(checks.Select(async check =>
            {
                if (!check.Configured) return (check.Name, Result: new ProviderCheck("skipped", null, "Not configured."));
                return (check.Name, Result: await TimeAsync(check.Name, check.Call, ct));
            }));

            IReadOnlyDictionary<string, ProviderCheck> byName = results.ToDictionary(r => r.Name, r => r.Result);
            memory.Set(key, byName, ReuseFor);
            return byName;
        }
        finally
        {
            OneAtATime.Release();
        }
    }

    private async Task<ProviderCheck> TimeAsync(string name, Func<CancellationToken, Task> call, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(PerCheckTimeout);
        var watch = Stopwatch.StartNew();
        try
        {
            await call(timeout.Token);
            return new ProviderCheck("ok", watch.ElapsedMilliseconds, null);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            var message = $"No answer within {PerCheckTimeout.TotalSeconds:0} seconds.";
            health.Fail(name, message);
            return new ProviderCheck("failed", watch.ElapsedMilliseconds, message);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The clients already record UpstreamExceptions in ProviderHealth; record anything else too.
            if (ex is not UpstreamException) health.Fail(name, ex.GetBaseException().Message);
            return new ProviderCheck("failed", watch.ElapsedMilliseconds, ex.GetBaseException().Message);
        }
    }

    private async Task CheckDatabaseAsync(CancellationToken ct)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        if (!await db.Database.CanConnectAsync(ct))
            throw new InvalidOperationException("Can't connect. Is SQL Server LocalDB running? Try: sqllocaldb start MSSQLLocalDB");
        health.Ok(ProviderHealth.Database);
    }
}
