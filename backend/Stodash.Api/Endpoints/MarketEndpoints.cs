using Stodash.Api.Providers;
using Stodash.Api.Services;

namespace Stodash.Api.Endpoints;

public static class MarketEndpoints
{
    public static IEndpointRouteBuilder MapMarketEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").WithTags("Market");

        api.MapGet("/health", (FinnhubClient finnhub) => new
        {
            status = "ok",
            providers = new { yahoo = true, finnhub = finnhub.IsConfigured },
        });

        api.MapGet("/quote/{symbol}", (string symbol, MarketDataService data, CancellationToken ct) =>
                data.GetQuoteAsync(symbol, ct))
            .WithSummary("Latest quote (about 15 minutes delayed for most exchanges).");

        api.MapGet("/quotes", (string? symbols, MarketDataService data, CancellationToken ct) =>
                data.GetQuotesAsync(symbols, ct))
            .WithSummary("Several quotes at once: ?symbols=AAPL,MSFT,^GSPC (max 20).");

        api.MapGet("/history/{symbol}", (string symbol, string? range, MarketDataService data, CancellationToken ct) =>
                data.GetHistoryAsync(symbol, range, ct))
            .WithSummary($"OHLCV bars. range = {string.Join(" | ", MarketDataService.SupportedRanges)} (default 6M).");

        api.MapGet("/profile/{symbol}", (string symbol, MarketDataService data, CancellationToken ct) =>
                data.GetProfileAsync(symbol, ct))
            .WithSummary("Company description, officers and key statistics.");

        api.MapGet("/search", (string? q, MarketDataService data, CancellationToken ct) =>
                data.SearchAsync(q, ct))
            .WithSummary("Ticker autocomplete.");

        return app;
    }
}
