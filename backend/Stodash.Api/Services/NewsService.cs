using System.Text.Json.Nodes;
using Microsoft.Extensions.Caching.Memory;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// Company news (N). Yahoo search's news always runs (no key needed). Finnhub's company news is merged in
/// when a key is configured. Headlines are de-duplicated and sorted newest first.
/// </summary>
public sealed class NewsService(
    YahooClient yahoo,
    FinnhubClient finnhub,
    MarketDataService market,
    IMemoryCache cache,
    ILogger<NewsService> log)
{
    private const int MaxItems = 50;

    public Task<NewsFeed> GetCompanyNewsAsync(string rawSymbol, CancellationToken ct)
    {
        var symbol = MarketDataService.NormalizeSymbol(rawSymbol);
        return cache.GetOrLoadAsync($"news:{symbol}", TimeSpan.FromMinutes(5), async () =>
        {
            var sources = new List<(string Name, Task<List<NewsItem>> Task)> { ("Yahoo", FromYahooAsync(symbol, ct)) };
            // Finnhub's company news only knows stock tickers; skip indexes, currencies and futures.
            if (finnhub.IsConfigured && !symbol.StartsWith('^') && !symbol.Contains('='))
                sources.Add(("Finnhub", FromFinnhubAsync(symbol, ct)));

            var items = new List<NewsItem>();
            var used = new List<string>();
            UpstreamException? firstError = null;
            foreach (var (name, task) in sources)
            {
                try
                {
                    items.AddRange(await task);
                    used.Add(name);
                }
                catch (UpstreamException ex)
                {
                    log.LogWarning("{Provider} news failed for {Symbol}: {Message}", name, symbol, ex.Message);
                    firstError ??= ex;
                }
            }
            if (used.Count == 0) throw firstError!;

            var merged = items
                .OrderByDescending(i => i.Published)
                .DistinctBy(i => Normalize(i.Headline))
                .DistinctBy(i => i.Url)
                .Take(MaxItems)
                .ToList();

            // No headlines at all: make an unknown ticker a 404 rather than an empty list.
            if (merged.Count == 0) await market.GetQuoteAsync(symbol, ct);
            return new NewsFeed(symbol, merged, used);
        });
    }

    private async Task<List<NewsItem>> FromYahooAsync(string symbol, CancellationToken ct)
    {
        var news = await yahoo.SearchNewsAsync(symbol, 30, ct);
        return news
            .Select(n =>
            {
                if (J.Str(n, "title") is not { } title || SafeUrl(J.Str(n, "link")) is not { } url ||
                    J.Long(n, "providerPublishTime") is not { } time)
                    return null;
                var tickers = (n?["relatedTickers"] as JsonArray ?? [])
                    .Select(t => t is JsonValue v && v.TryGetValue<string>(out var s) ? s : null)
                    .OfType<string>()
                    .ToList();
                return new NewsItem(title, url, J.Str(n, "publisher"), DateTimeOffset.FromUnixTimeSeconds(time),
                    null, tickers, "Yahoo");
            })
            .OfType<NewsItem>()
            .ToList();
    }

    private async Task<List<NewsItem>> FromFinnhubAsync(string symbol, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        // Finnhub writes share classes with a dot: BRK.B.
        var news = await finnhub.GetCompanyNewsAsync(symbol.Replace('-', '.'), today.AddDays(-14), today, ct);
        return news
            .Select(n =>
            {
                if (J.Str(n, "headline") is not { } headline || SafeUrl(J.Str(n, "url")) is not { } url ||
                    J.Long(n, "datetime") is not { } time || time <= 0)
                    return null;
                var related = (J.Str(n, "related") ?? symbol)
                    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                return new NewsItem(headline, url, J.Str(n, "source"), DateTimeOffset.FromUnixTimeSeconds(time),
                    J.Str(n, "summary"), related, "Finnhub");
            })
            .OfType<NewsItem>()
            .ToList();
    }

    /// <summary>Only absolute http(s) links reach the browser, never javascript: or relative ones.</summary>
    private static string? SafeUrl(string? raw) =>
        Uri.TryCreate(raw, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? uri.AbsoluteUri
            : null;

    private static string Normalize(string headline) =>
        new string(headline.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
}
