using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;
using Stodash.Api.Services;

namespace Stodash.Api.Endpoints;

public static class MarketEndpoints
{
    public static IEndpointRouteBuilder MapMarketEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").WithTags("Market");

        api.MapGet("/health", async (bool? check, ProviderHealth health, FinnhubClient finnhub, SecClient sec, FredClient fred,
                QuoteStream stream, HealthCheckService checker, CancellationToken ct) =>
            {
                // With ?check=true, first call every configured provider once, so the states below are fresh.
                var checks = check == true ? await checker.RunAsync(ct) : null;
                return new
                {
                    status = "ok",
                    providers = new
                    {
                        yahoo = health.Status(ProviderHealth.Yahoo, configured: true),
                        sec = health.Status(ProviderHealth.Sec, sec.IsConfigured),
                        finnhub = health.Status(ProviderHealth.Finnhub, finnhub.IsConfigured),
                        fred = health.Status(ProviderHealth.Fred, fred.IsConfigured),
                        treasury = health.Status(ProviderHealth.Treasury, configured: true),
                        coingecko = health.Status(ProviderHealth.CoinGecko, configured: true),
                        frankfurter = health.Status(ProviderHealth.Frankfurter, configured: true),
                        rss = health.Status(ProviderHealth.Rss, configured: true),
                        indexlist = health.Status(ProviderHealth.IndexList, configured: true),
                        database = health.Status(ProviderHealth.Database, configured: true),
                    },
                    // The live watchlist stream: off (no Finnhub key), idle (no one watching), connecting, live or error.
                    stream = new { state = stream.State, error = stream.State == "error" ? stream.LastError : null },
                    // Only with ?check=true: each provider's test call (ok, failed or skipped), with timing and error.
                    check = checks,
                };
            })
            .WithSummary("API status and each provider's configuration and last outcome. Add ?check=true to test every " +
                         "configured provider and key with one small call each (repeats within 30 s reuse the result).");

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

        api.MapGet("/financials/{symbol}", (string symbol, string? period, FinancialsService data, CancellationToken ct) =>
                data.GetFinancialsAsync(symbol, period, ct))
            .WithSummary("Income statement, balance sheet, cash flow and ratios. period = annual | quarterly (default annual).");

        api.MapGet("/news/{symbol}", (string symbol, NewsService data, CancellationToken ct) =>
                data.GetCompanyNewsAsync(symbol, ct))
            .WithSummary("Latest company headlines from Yahoo, plus Finnhub when a key is configured.");

        api.MapGet("/filings/{symbol}", (string symbol, FilingsService data, CancellationToken ct) =>
                data.GetFilingsAsync(symbol, ct))
            .WithSummary("Recent SEC EDGAR filings (10-K, 10-Q, 8-K, ...). Needs Sec:UserAgent.");

        return app;
    }
}
