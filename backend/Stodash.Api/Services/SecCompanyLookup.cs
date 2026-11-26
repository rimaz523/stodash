using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

public sealed record SecCompany(long Cik, string Ticker, string Title);

/// <summary>Maps tickers to SEC CIK numbers using SEC's own ticker list, refreshed daily.</summary>
public sealed class SecCompanyLookup(SecClient sec, IMarketCache cache)
{
    public bool IsConfigured => sec.IsConfigured;

    /// <summary>
    /// The SEC registrant for a ticker, or null if there isn't one. Indexes, currencies, futures and most
    /// non-US listings (RY.TO, VOD.L) never match, because EDGAR only lists US tickers.
    /// </summary>
    public async Task<SecCompany?> FindAsync(string symbol, CancellationToken ct)
    {
        if (symbol.StartsWith('^') || symbol.Contains('=')) return null;

        var map = await cache.GetOrLoadAsync("sec:tickers", TimeSpan.FromHours(24), durable: true, load: async () =>
        {
            var root = await sec.GetCompanyTickersAsync(ct) as JsonObject
                       ?? throw new UpstreamException("SEC's ticker list was empty.");
            var byTicker = new Dictionary<string, SecCompany>(StringComparer.OrdinalIgnoreCase);
            foreach (var (_, entry) in root)
            {
                if (J.Str(entry, "ticker") is not { } ticker || J.Long(entry, "cik_str") is not { } cik) continue;
                byTicker.TryAdd(ticker, new SecCompany(cik, ticker, J.Str(entry, "title") ?? ticker));
            }
            return byTicker;
        });

        // SEC writes share classes as BRK-B, some sources use BRK.B.
        foreach (var candidate in new[] { symbol, symbol.Replace('.', '-'), symbol.Replace('-', '.') })
            if (map.TryGetValue(candidate, out var company))
                return company;
        return null;
    }
}
