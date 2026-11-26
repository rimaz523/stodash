using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>One headline from a feed. <see cref="Link"/> is not checked yet; callers keep only safe http(s) links.</summary>
public sealed record RssItem(string Title, string Link, DateTimeOffset Published, string? Summary);

/// <summary>
/// Reads RSS 2.0 and Atom feeds for TOP. No key needed. Each feed's outcome is recorded in <see cref="ProviderHealth"/>
/// under <c>rss:&lt;name&gt;</c>; the caller reports the group as a whole under <see cref="ProviderHealth.Rss"/>.
/// </summary>
public sealed partial class RssClient(HttpClient http, ProviderHealth health)
{
    private const int MaxSummary = 280;

    private static readonly XmlReaderSettings SafeXml = new()
    {
        DtdProcessing = DtdProcessing.Ignore, // never expand entities or fetch DTDs from a feed
        XmlResolver = null,
        IgnoreComments = true,
    };

    public async Task<IReadOnlyList<RssItem>> GetFeedAsync(string name, string url, CancellationToken ct)
    {
        var (status, body) = await ProviderHttp.GetAsync(http, url, $"{ProviderHealth.Rss}:{name}", name, health, ct);
        if (status != HttpStatusCode.OK) throw new UpstreamException($"{name} returned {(int)status}.");

        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(body), SafeXml);
            doc = XDocument.Load(reader);
        }
        catch (XmlException ex)
        {
            throw new UpstreamException($"{name} returned a feed that isn't valid XML.", ex);
        }

        // RSS 2.0 puts <item>s under <channel>; Atom uses <entry>. Match on local names so namespaces don't matter.
        var items = doc.Descendants().Where(e => e.Name.LocalName is "item" or "entry");
        return items.Select(Read).OfType<RssItem>().ToList();
    }

    private static RssItem? Read(XElement e)
    {
        var title = Clean(Child(e, "title"));
        var link = Child(e, "link") is { Length: > 0 } text
            ? text.Trim()
            : e.Elements().FirstOrDefault(x => x.Name.LocalName == "link")?.Attribute("href")?.Value; // Atom
        var date = ParseDate(Child(e, "pubDate") ?? Child(e, "published") ?? Child(e, "updated") ?? Child(e, "date"));
        if (string.IsNullOrEmpty(title) || string.IsNullOrWhiteSpace(link) || date is null) return null;

        var summary = Clean(Child(e, "description") ?? Child(e, "summary"));
        if (summary is { Length: > MaxSummary }) summary = summary[..MaxSummary].TrimEnd() + "…";
        return new RssItem(title, link, date.Value, string.IsNullOrEmpty(summary) ? null : summary);
    }

    private static string? Child(XElement e, string localName) =>
        e.Elements().FirstOrDefault(x => x.Name.LocalName == localName)?.Value;

    /// <summary>Plain text: tags stripped, entities decoded, whitespace collapsed.</summary>
    private static string? Clean(string? raw)
    {
        if (raw is null) return null;
        var text = WebUtility.HtmlDecode(Tags().Replace(raw, " "));
        return Spaces().Replace(text, " ").Trim();
    }

    // US zone names some feeds use instead of offsets.
    private static readonly (string Name, string Offset)[] Zones =
        [("EDT", "-04:00"), ("EST", "-05:00"), ("CDT", "-05:00"), ("CST", "-06:00"), ("PDT", "-07:00"), ("PST", "-08:00")];

    /// <summary>RFC 822 ("Thu, 26 Nov 2026 17:52:15 GMT", "... -0500"), ISO 8601, or "2026-11-26 19:00:41" (taken as UTC).</summary>
    public static DateTimeOffset? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = raw.Trim();
        foreach (var (name, offset) in Zones)
            if (s.EndsWith(" " + name, StringComparison.Ordinal)) s = s[..^name.Length] + offset;
        return DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AllowWhiteSpaces, out var d)
            ? d
            : null;
    }

    /// <summary>For <c>/api/health?check=true</c>: reads one feed and reports the group's state.</summary>
    public async Task CheckAsync(string name, string url, CancellationToken ct)
    {
        try
        {
            if ((await GetFeedAsync(name, url, ct)).Count == 0) throw new UpstreamException($"{name}'s feed was empty.");
            health.Ok(ProviderHealth.Rss);
        }
        catch (UpstreamException ex)
        {
            health.Fail(ProviderHealth.Rss, ex.Message);
            throw;
        }
    }

    [GeneratedRegex("<[^>]*>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}
