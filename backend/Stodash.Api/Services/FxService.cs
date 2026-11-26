using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// FX: eight major pairs against the US dollar, quoted the way the market quotes them (EUR/USD but USD/JPY), plus a
/// cross-rate matrix. Prices come from Yahoo; any pair Yahoo can't price falls back to the ECB's daily reference rate.
/// </summary>
public sealed class FxService(MarketDataService market, FrankfurterClient frankfurter, IMarketCache cache, ILogger<FxService> log)
{
    private sealed record PairDef(string Base, string Quote, string Symbol);

    private static readonly PairDef[] Pairs =
    [
        new("EUR", "USD", "EURUSD=X"),
        new("GBP", "USD", "GBPUSD=X"),
        new("USD", "JPY", "JPY=X"),
        new("USD", "CHF", "CHF=X"),
        new("USD", "CAD", "CAD=X"),
        new("AUD", "USD", "AUDUSD=X"),
        new("NZD", "USD", "NZDUSD=X"),
        new("USD", "CNY", "CNY=X"),
    ];

    private static readonly string[] Currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"];

    public Task<FxBoard> GetAsync(CancellationToken ct) =>
        cache.GetOrLoadAsync("fx", TimeSpan.FromSeconds(60), async () =>
        {
            var quotes = (await market.GetQuotesAsync(Pairs.Select(p => p.Symbol).ToList(), ct))
                .ToDictionary(q => q.Symbol, StringComparer.OrdinalIgnoreCase);

            var pairs = Pairs.Select(p => quotes.TryGetValue(p.Symbol, out var q) && q.Price is not null
                    ? new FxPair($"{p.Base}/{p.Quote}", p.Base, p.Quote, p.Symbol, q.Price, q.Change, q.ChangePercent, "Yahoo", q.Time)
                    : null)
                .ToList();

            // Fill gaps from the ECB. Its rates are daily, so there's no intraday change to show.
            var missing = Pairs.Where((_, i) => pairs[i] is null).ToList();
            if (missing.Count > 0)
            {
                try
                {
                    var (perUsd, date) = await frankfurter.GetUsdRatesAsync(missing.Select(p => p.Base == "USD" ? p.Quote : p.Base), ct);
                    var time = DateTimeOffset.TryParse(date, out var d) ? d : (DateTimeOffset?)null;
                    for (var i = 0; i < Pairs.Length; i++)
                    {
                        if (pairs[i] is not null) continue;
                        var p = Pairs[i];
                        var other = p.Base == "USD" ? p.Quote : p.Base;
                        if (!perUsd.TryGetValue(other, out var r) || r == 0) continue;
                        var rate = p.Base == "USD" ? r : 1 / r;
                        pairs[i] = new FxPair($"{p.Base}/{p.Quote}", p.Base, p.Quote, p.Symbol, rate, null, null, "ECB", time);
                    }
                }
                catch (UpstreamException ex)
                {
                    log.LogWarning("Frankfurter fallback failed: {Message}", ex.Message);
                }
            }

            var shown = pairs.Select((p, i) => p ?? new FxPair($"{Pairs[i].Base}/{Pairs[i].Quote}", Pairs[i].Base, Pairs[i].Quote,
                Pairs[i].Symbol, null, null, null, "none", null)).ToList();
            if (shown.All(p => p.Rate is null)) throw new UpstreamException("No FX rates are available from Yahoo or the ECB right now.");

            return new FxBoard(shown, Currencies, Matrix(shown));
        });

    /// <summary>Matrix[i][j] = units of currency j per one unit of currency i, derived from each currency's rate to USD.</summary>
    private static List<IReadOnlyList<double?>> Matrix(List<FxPair> pairs)
    {
        var perUsd = new Dictionary<string, double> { ["USD"] = 1 };
        foreach (var p in pairs)
        {
            if (p.Rate is not { } rate || rate == 0) continue;
            if (p.Base == "USD") perUsd[p.Quote] = rate;
            else perUsd[p.Base] = 1 / rate;
        }
        return Currencies
            .Select(from => (IReadOnlyList<double?>)Currencies
                .Select(to => perUsd.TryGetValue(from, out var f) && perUsd.TryGetValue(to, out var t) ? t / f : (double?)null)
                .ToList())
            .ToList();
    }
}
