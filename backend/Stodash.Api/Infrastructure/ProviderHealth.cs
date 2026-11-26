using System.Collections.Concurrent;

namespace Stodash.Api.Infrastructure;

/// <summary>
/// How a provider is doing. State is "off" (not configured), "unknown" (no calls yet),
/// "up" (the last call worked) or "down" (the last call failed).
/// </summary>
public sealed record ProviderStatus(
    bool Configured,
    string State,
    DateTimeOffset? LastOk,
    DateTimeOffset? LastFailure,
    string? LastError);

/// <summary>
/// Remembers each provider's most recent success and failure. It only watches real traffic and never
/// sends test requests of its own, so checking health costs nothing against free-tier limits.
/// </summary>
public sealed class ProviderHealth
{
    public const string Yahoo = "yahoo";
    public const string Finnhub = "finnhub";
    public const string Sec = "sec";
    public const string Fred = "fred";
    public const string Treasury = "treasury";
    public const string CoinGecko = "coingecko";
    public const string Frankfurter = "frankfurter";
    public const string Database = "database";

    private sealed record Entry(DateTimeOffset? LastOk, DateTimeOffset? LastFailure, string? LastError);

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.OrdinalIgnoreCase);

    public void Ok(string provider)
    {
        var now = DateTimeOffset.UtcNow;
        _entries.AddOrUpdate(provider, _ => new Entry(now, null, null), (_, e) => e with { LastOk = now });
    }

    public void Fail(string provider, string error)
    {
        var now = DateTimeOffset.UtcNow;
        _entries.AddOrUpdate(provider, _ => new Entry(null, now, error),
            (_, e) => e with { LastFailure = now, LastError = error });
    }

    public ProviderStatus Status(string provider, bool configured)
    {
        if (!configured) return new ProviderStatus(false, "off", null, null, null);
        if (!_entries.TryGetValue(provider, out var e)) return new ProviderStatus(true, "unknown", null, null, null);

        var up = e.LastFailure is null || (e.LastOk is { } ok && ok > e.LastFailure);
        return new ProviderStatus(true, up ? "up" : "down", e.LastOk, e.LastFailure, e.LastError);
    }
}
