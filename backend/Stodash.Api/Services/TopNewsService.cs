using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// TOP: market headlines from free RSS feeds, plus Finnhub's general news when a key is set. All feeds are read in
/// parallel; a feed that fails is listed in <see cref="TopNewsFeed.Failed"/> and the rest still show. Headlines are
/// de-duplicated across feeds and sorted newest first. Cached in memory for 5 minutes.
/// </summary>
public sealed class TopNewsService(RssClient rss, FinnhubClient finnhub, ProviderHealth health, IMarketCache cache,
    ILogger<TopNewsService> log)
{
    public const string FinnhubName = "Finnhub";
    private const int MaxItems = 80;
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(7); // some feeds keep serving very old stories

    /// <summary>The feeds, by display name. Reuters closed its public RSS in 2020, and WSJ's markets feed stopped updating.</summary>
    public static readonly (string Name, string Url)[] Feeds =
    [
        ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"),
        ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
        ("Yahoo Finance", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US"),
        ("Investing.com", "https://www.investing.com/rss/news_25.rss"),
    ];

    public Task<TopNewsFeed> GetAsync(CancellationToken ct) =>
        cache.GetOrLoadAsync("topnews", TimeSpan.FromMinutes(5), async () =>
        {
            var sources = Feeds.Select(f => (f.Name, Task: FromRssAsync(f.Name, f.Url, ct))).ToList();
            if (finnhub.IsConfigured) sources.Add((FinnhubName, FromFinnhubAsync(ct)));

            var items = new List<NewsItem>();
            var used = new List<string>();
            var failed = new List<(string Name, string Error)>();
            foreach (var (name, task) in sources)
            {
                try
                {
                    items.AddRange(await task);
                    used.Add(name);
                }
                catch (UpstreamException ex)
                {
                    log.LogWarning("TOP: {Feed} failed: {Message}", name, ex.Message);
                    failed.Add((name, ex.Message));
                }
            }

            var rssUsed = used.Count(n => n != FinnhubName);
            if (rssUsed > 0) health.Ok(ProviderHealth.Rss);
            else health.Fail(ProviderHealth.Rss, "Every headline feed failed: " + string.Join("; ", failed.Select(f => f.Error)));
            if (used.Count == 0) throw new UpstreamException("None of the headline feeds answered. Try again shortly.");

            var cutoff = DateTimeOffset.UtcNow - MaxAge;
            var soon = DateTimeOffset.UtcNow.AddHours(1); // a wrong time zone shouldn't pin a story to the top
            var merged = items
                .Where(i => i.Published > cutoff)
                .Select(i => i.Published > soon ? i with { Published = DateTimeOffset.UtcNow } : i)
                .OrderByDescending(i => i.Published)
                .DistinctBy(i => NewsText.Key(i.Headline))
                .DistinctBy(i => i.Url)
                .Take(MaxItems)
                .ToList();
            return new TopNewsFeed(merged, used, failed.Select(f => f.Name).ToList(), DateTimeOffset.UtcNow);
        });

    private async Task<List<NewsItem>> FromRssAsync(string name, string url, CancellationToken ct)
    {
        var feed = await rss.GetFeedAsync(name, url, ct);
        return feed
            .Select(i => NewsText.SafeUrl(i.Link) is { } link
                ? new NewsItem(i.Title, link, name, i.Published, i.Summary, [], name)
                : null)
            .OfType<NewsItem>()
            .ToList();
    }

    private async Task<List<NewsItem>> FromFinnhubAsync(CancellationToken ct)
    {
        var news = await finnhub.GetGeneralNewsAsync(ct);
        return news
            .Select(n =>
            {
                if (J.Str(n, "headline") is not { } headline || NewsText.SafeUrl(J.Str(n, "url")) is not { } url ||
                    J.Long(n, "datetime") is not { } time || time <= 0)
                    return null;
                var related = (J.Str(n, "related") ?? "")
                    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                // Finnhub's "source" is the publisher (Reuters, CNBC, ...); the provider stays Finnhub for filtering.
                return new NewsItem(headline, url, J.Str(n, "source") ?? FinnhubName, DateTimeOffset.FromUnixTimeSeconds(time),
                    J.Str(n, "summary"), related, FinnhubName);
            })
            .OfType<NewsItem>()
            .ToList();
    }
}

/// <summary>Helpers shared by N and TOP.</summary>
public static class NewsText
{
    /// <summary>Only absolute http(s) links reach the browser, never javascript: or relative ones.</summary>
    public static string? SafeUrl(string? raw) =>
        Uri.TryCreate(raw?.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? uri.AbsoluteUri
            : null;

    /// <summary>A headline reduced to lowercase letters and digits, so near-identical copies from two feeds match.</summary>
    public static string Key(string headline) =>
        new string(headline.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
}
