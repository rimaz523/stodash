using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>CRYPTO: the top coins by market cap from CoinGecko.</summary>
public sealed class CryptoService(CoinGeckoClient coinGecko, IMarketCache cache)
{
    public const int Count = 25;

    public Task<CryptoBoard> GetAsync(CancellationToken ct) =>
        cache.GetOrLoadAsync("crypto", TimeSpan.FromMinutes(2), async () =>
        {
            var markets = await coinGecko.GetMarketsAsync(Count, ct);
            var coins = markets.Select((c, i) =>
                {
                    if (J.Str(c, "id") is not { } id || J.Str(c, "symbol") is not { } symbol) return null;
                    var sparkline = (c?["sparkline_in_7d"]?["price"] as JsonArray ?? [])
                        .Select(J.Num).OfType<double>().ToList();
                    return new CryptoCoin(
                        Rank: J.Int(c, "market_cap_rank") ?? i + 1,
                        Id: id,
                        Symbol: symbol.ToUpperInvariant(),
                        Name: J.Str(c, "name") ?? symbol,
                        Price: J.Num(c, "current_price"),
                        Change24h: J.Num(c, "price_change_percentage_24h_in_currency") ?? J.Num(c, "price_change_percentage_24h"),
                        Change7d: J.Num(c, "price_change_percentage_7d_in_currency"),
                        MarketCap: J.Num(c, "market_cap"),
                        Volume24h: J.Num(c, "total_volume"),
                        Sparkline: Every(sparkline, 4), // hourly → every 4 hours keeps the payload small
                        YahooSymbol: $"{symbol.ToUpperInvariant()}-USD");
                })
                .OfType<CryptoCoin>()
                .ToList();
            if (coins.Count == 0) throw new UpstreamException("CoinGecko returned no coins.");
            return new CryptoBoard(coins, "CoinGecko", DateTimeOffset.UtcNow);
        });

    private static List<double> Every(List<double> values, int step) =>
        values.Where((_, i) => i % step == 0 || i == values.Count - 1).ToList();
}
