using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;
using Stodash.Api.Services;

namespace Stodash.Api.Tests;

/// <summary>Symbol validation and the lenient JSON readers every provider mapping relies on.</summary>
public class SymbolAndJsonTests
{
    [Theory]
    [InlineData("aapl", "AAPL")]
    [InlineData(" brk-b ", "BRK-B")]
    [InlineData("^GSPC", "^GSPC")]
    [InlineData("EURUSD=X", "EURUSD=X")]
    [InlineData("RY.TO", "RY.TO")]
    [InlineData("GC=F", "GC=F")]
    public void NormalizeSymbol_accepts_every_supported_form(string raw, string expected) =>
        Assert.Equal(expected, MarketDataService.NormalizeSymbol(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("AAPL MSFT")]
    [InlineData("<script>")]
    [InlineData(".AAPL")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTU")] // 21 characters
    public void NormalizeSymbol_rejects_anything_else(string? raw) =>
        Assert.Throws<ArgumentException>(() => MarketDataService.NormalizeSymbol(raw));

    [Fact]
    public void Num_reads_plain_numbers_and_Yahoo_raw_wrappers_and_returns_null_for_empty_objects()
    {
        var node = JsonNode.Parse("""{"a": 1.5, "b": {"raw": 2.5, "fmt": "2.50"}, "c": {}, "d": "x", "e": null}""");
        Assert.Equal(1.5, J.Num(node, "a"));
        Assert.Equal(2.5, J.Num(node, "b"));
        Assert.Null(J.Num(node, "c"));
        Assert.Null(J.Num(node, "d"));
        Assert.Null(J.Num(node, "e"));
        Assert.Null(J.Num(node, "missing"));
        Assert.Null(J.Num(null, "a"));
    }

    [Fact]
    public void Str_reads_strings_and_fmt_wrappers_and_skips_blanks()
    {
        var node = JsonNode.Parse("""{"a": "hi", "b": {"raw": 1, "fmt": "1.00"}, "c": "  ", "d": 3}""");
        Assert.Equal("hi", J.Str(node, "a"));
        Assert.Equal("1.00", J.Str(node, "b"));
        Assert.Null(J.Str(node, "c"));
        Assert.Null(J.Str(node, "d"));
        Assert.Equal("hi", J.FirstStr(node, "missing", "c", "a"));
    }

    [Fact]
    public void Long_rounds()
    {
        Assert.Equal(3L, J.Long(JsonNode.Parse("""{"v": 2.6}"""), "v"));
    }
}

/// <summary>The RSS/Atom reader behind TOP and the headline helpers shared with N.</summary>
public class RssTests
{
    [Theory]
    [InlineData("Thu, 26 Nov 2026 17:52:15 GMT", "2026-11-26T17:52:15+00:00")]
    [InlineData("Mon, 27 Jan 2025 14:26:00 -0500", "2025-01-27T19:26:00+00:00")]
    [InlineData("Thu, 26 Nov 2026 18:31:19 +0000", "2026-11-26T18:31:19+00:00")]
    [InlineData("2026-11-26 19:00:41", "2026-11-26T19:00:41+00:00")] // Investing.com: no zone, taken as UTC
    [InlineData("2026-11-26T19:00:41Z", "2026-11-26T19:00:41+00:00")]
    [InlineData("Thu, 26 Nov 2026 12:00:00 EST", "2026-11-26T17:00:00+00:00")]
    public void ParseDate_reads_the_formats_feeds_use(string raw, string expectedUtc) =>
        Assert.Equal(DateTimeOffset.Parse(expectedUtc), RssClient.ParseDate(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("yesterday")]
    public void ParseDate_returns_null_for_unreadable_dates(string? raw) => Assert.Null(RssClient.ParseDate(raw));

    [Fact]
    public void Parse_reads_RSS_items_strips_html_and_skips_incomplete_ones()
    {
        const string xml = """
            <?xml version="1.0"?>
            <rss version="2.0"><channel>
              <item>
                <title>Stocks &amp; bonds rally</title>
                <link>https://example.com/a</link>
                <description><![CDATA[<p>Yields <b>fell</b>.</p>]]></description>
                <pubDate>Thu, 26 Nov 2026 17:52:15 GMT</pubDate>
              </item>
              <item><title>No link</title><pubDate>Thu, 26 Nov 2026 17:52:15 GMT</pubDate></item>
              <item><title>No date</title><link>https://example.com/b</link></item>
            </channel></rss>
            """;
        var item = Assert.Single(RssClient.Parse("Test", xml));
        Assert.Equal("Stocks & bonds rally", item.Title);
        Assert.Equal("https://example.com/a", item.Link);
        Assert.Equal("Yields fell .", item.Summary);
    }

    [Fact]
    public void Parse_reads_Atom_entries_with_href_links()
    {
        const string xml = """
            <feed xmlns="http://www.w3.org/2005/Atom">
              <entry><title>Atom story</title><link href="https://example.com/atom"/><updated>2026-11-26T10:00:00Z</updated></entry>
            </feed>
            """;
        var item = Assert.Single(RssClient.Parse("Test", xml));
        Assert.Equal("https://example.com/atom", item.Link);
    }

    [Fact]
    public void Parse_never_expands_entities_from_a_DTD()
    {
        // An XXE-style feed: the entity must not be resolved into the title.
        const string xml = """
            <?xml version="1.0"?>
            <!DOCTYPE rss [<!ENTITY secret "LEAKED">]>
            <rss><channel><item><title>&secret;</title><link>https://example.com/x</link>
            <pubDate>Thu, 26 Nov 2026 17:52:15 GMT</pubDate></item></channel></rss>
            """;
        // The DTD is ignored, so the entity is undeclared and the feed is rejected rather than expanded.
        var ex = Assert.Throws<UpstreamException>(() => RssClient.Parse("Test", xml));
        Assert.DoesNotContain("LEAKED", ex.ToString());
    }

    [Fact]
    public void Parse_turns_broken_xml_into_an_upstream_error() =>
        Assert.Throws<UpstreamException>(() => RssClient.Parse("Test", "<html><body>Not a feed"));

    [Theory]
    [InlineData("https://example.com/a?b=1", "https://example.com/a?b=1")]
    [InlineData("http://example.com/", "http://example.com/")]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("/relative/path", null)]
    [InlineData("ftp://example.com/file", null)]
    [InlineData(null, null)]
    public void SafeUrl_keeps_only_absolute_http_links(string? raw, string? expected) =>
        Assert.Equal(expected, NewsText.SafeUrl(raw));

    [Fact]
    public void Headline_key_matches_near_identical_copies() =>
        Assert.Equal(NewsText.Key("Fed holds rates — again!"), NewsText.Key("FED HOLDS RATES: again"));
}

/// <summary>The CSV reader for the S&amp;P 500 constituent list.</summary>
public class CsvTests
{
    [Fact]
    public void Reads_quoted_fields_with_commas_quotes_and_newlines()
    {
        var rows = IndexListClient.ParseCsv("Symbol,Security,HQ\r\nMMM,3M,\"Saint Paul, Minnesota\"\nX,\"The \"\"X\"\" Co\",\"Line1\nLine2\"\n");
        Assert.Equal(3, rows.Count);
        Assert.Equal(["MMM", "3M", "Saint Paul, Minnesota"], rows[1]);
        Assert.Equal(["X", "The \"X\" Co", "Line1\nLine2"], rows[2]);
    }

    [Fact]
    public void Handles_a_last_line_without_a_newline_and_skips_blank_lines()
    {
        var rows = IndexListClient.ParseCsv("a,b\n\n1,2");
        Assert.Equal(2, rows.Count);
        Assert.Equal(["1", "2"], rows[1]);
    }

    [Fact]
    public void Keeps_empty_fields()
    {
        var row = Assert.Single(IndexListClient.ParseCsv("a,,c\n"));
        Assert.Equal(["a", "", "c"], row);
    }
}
