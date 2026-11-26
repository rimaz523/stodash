using System.Text.Json;
using System.Text.Json.Nodes;
using Stodash.Api.Models;
using Stodash.Api.Services;

namespace Stodash.Api.Tests;

/// <summary>EQS filtering and sorting over a fixed snapshot.</summary>
public class ScreenerTests
{
    private static ScreenerRow Row(string symbol, string sector, double cap, double? pe, double change) =>
        new(symbol, symbol + " Inc.", sector, null, 100, change, cap, pe, null, null, null, null, null, null);

    private static readonly ScreenerSnapshot Snapshot = new("S&P 500", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch,
    [
        Row("AAA", "Energy", 5e11, 10, 2.5),
        Row("BBB", "Energy", 2e10, null, -1), // losses: no P/E
        Row("CCC", "Information Technology", 3e12, 35, 0.5),
        Row("DDD", "Information Technology", 9e10, 18, -3.2),
        Row("EEE", "Financials", 8e11, 14, 1.1),
    ], "test");

    private static ScreenerQuery Q(string? sector = null, double? minCap = null, double? maxCap = null, double? minPe = null,
        double? maxPe = null, double? minChange = null, double? maxChange = null, string? sort = null, bool? desc = null, int? limit = null) =>
        new(sector, minCap, maxCap, minPe, maxPe, minChange, maxChange, sort, desc, limit);

    private static string[] Symbols(ScreenerResult r) => r.Rows.Select(x => x.Symbol).ToArray();

    [Fact]
    public void Defaults_to_everything_by_market_cap_descending_with_sector_counts()
    {
        var r = ScreenerService.Screen(Snapshot, Q(), refreshing: false);
        Assert.Equal(["CCC", "EEE", "AAA", "DDD", "BBB"], Symbols(r));
        Assert.Equal(5, r.Total);
        Assert.Equal(5, r.Matched);
        Assert.Equal([("Energy", 2), ("Financials", 1), ("Information Technology", 2)], r.Sectors.Select(s => (s.Sector, s.Count)));
    }

    [Fact]
    public void Filters_by_sector_case_insensitively_and_by_ranges()
    {
        Assert.Equal(["AAA", "BBB"], Symbols(ScreenerService.Screen(Snapshot, Q(sector: "energy"), false)));
        Assert.Equal(["EEE", "AAA"], Symbols(ScreenerService.Screen(Snapshot, Q(minCap: 1e11, maxCap: 1e12), false)));
        Assert.Equal(["EEE", "AAA"], Symbols(ScreenerService.Screen(Snapshot, Q(minChange: 1), false))); // by market cap
    }

    [Fact]
    public void A_PE_filter_leaves_out_companies_without_a_PE()
    {
        var r = ScreenerService.Screen(Snapshot, Q(maxPe: 100), false);
        Assert.DoesNotContain("BBB", Symbols(r));
        Assert.Equal(4, r.Matched);
    }

    [Fact]
    public void Sorts_text_ascending_and_numbers_descending_by_default_with_missing_values_last()
    {
        Assert.Equal(["AAA", "BBB", "CCC", "DDD", "EEE"], Symbols(ScreenerService.Screen(Snapshot, Q(sort: "symbol"), false)));
        Assert.Equal(["CCC", "DDD", "EEE", "AAA", "BBB"], Symbols(ScreenerService.Screen(Snapshot, Q(sort: "pe"), false)));
        Assert.Equal(["AAA", "EEE", "DDD", "CCC", "BBB"], Symbols(ScreenerService.Screen(Snapshot, Q(sort: "pe", desc: false), false)));
    }

    [Fact]
    public void Limit_caps_the_rows_but_not_the_match_count()
    {
        var r = ScreenerService.Screen(Snapshot, Q(limit: 2), false);
        Assert.Equal(2, r.Rows.Count);
        Assert.Equal(5, r.Matched);
    }

    [Theory]
    [InlineData("Bogus", null, null, null, "Unknown sector")]
    [InlineData(null, "nope", null, null, "Unknown sort")]
    [InlineData(null, null, 0, null, "limit must be")]
    [InlineData(null, null, null, 30.0, "minimum P/E is above")]
    public void Rejects_bad_queries(string? sector, string? sort, int? limit, double? minPe, string message)
    {
        var q = Q(sector: sector, sort: sort, limit: limit, minPe: minPe, maxPe: minPe is null ? null : 10);
        var ex = Assert.Throws<ArgumentException>(() => ScreenerService.Screen(Snapshot, q, false));
        Assert.Contains(message, ex.Message);
    }
}

/// <summary>FA's SEC fallback: picking the right XBRL values for annual and quarterly columns.</summary>
public class FinancialsTests
{
    private static JsonNode Tag(string unit, params object[] points) =>
        new JsonObject { ["units"] = new JsonObject { [unit] = JsonSerializer.SerializeToNode(points) } };

    private static object Flow(string start, string end, double val, string form, string filed) => new { start, end, val, form, filed };

    [Fact]
    public void Annual_keeps_full_years_from_10Ks_and_the_latest_restatement()
    {
        var tag = Tag("USD",
            Flow("2024-01-01", "2024-12-31", 100, "10-K", "2025-02-01"),
            Flow("2024-01-01", "2024-12-31", 110, "10-K/A", "2025-05-01"), // restated later: wins
            Flow("2024-07-01", "2024-09-30", 30, "10-Q", "2024-11-01"),   // a quarter: not annual
            Flow("2024-01-01", "2024-09-30", 80, "10-Q", "2024-11-01"),   // 9-month YTD: never used
            Flow("2023-01-01", "2023-12-31", 90, "8-K", "2024-02-01"));   // not a 10-K/10-Q
        var (values, unit) = FinancialsService.ReadTag(tag, "money", "annual");
        Assert.Equal("USD", unit);
        Assert.Equal(new Dictionary<string, double> { ["2024-12-31"] = 110 }, values);
    }

    [Fact]
    public void Quarterly_keeps_single_quarters_only()
    {
        var tag = Tag("USD",
            Flow("2024-07-01", "2024-09-30", 30, "10-Q", "2024-11-01"),
            Flow("2024-01-01", "2024-06-30", 50, "10-Q", "2024-08-01"));  // 6-month YTD
        var (values, _) = FinancialsService.ReadTag(tag, "money", "quarterly");
        Assert.Equal(["2024-09-30"], values.Keys);
    }

    [Fact]
    public void Picks_the_unit_that_matches_the_line()
    {
        var tag = new JsonObject
        {
            ["units"] = new JsonObject
            {
                ["USD"] = JsonSerializer.SerializeToNode(new[] { new { end = "2024-12-31", val = 1e9, form = "10-K", filed = "2025-02-01" } }),
                ["USD/shares"] = JsonSerializer.SerializeToNode(new[] { new { end = "2024-12-31", val = 6.1, form = "10-K", filed = "2025-02-01" } }),
            },
        };
        Assert.Equal(6.1, FinancialsService.ReadTag(tag, "perShare", "annual").Values["2024-12-31"]);
        Assert.Equal(1e9, FinancialsService.ReadTag(tag, "money", "annual").Values["2024-12-31"]);
    }
}

/// <summary>CF's form categories and descriptions.</summary>
public class FilingsTests
{
    [Theory]
    [InlineData("10-K", "annual")]
    [InlineData("10-K/A", "annual")]
    [InlineData("20-F", "annual")]
    [InlineData("10-Q", "quarterly")]
    [InlineData("8-K", "current")]
    [InlineData("4", "insider")]
    [InlineData("DEF 14A", "proxy")]
    [InlineData("S-8", "other")]
    public void Categorize(string form, string category) => Assert.Equal(category, FilingsService.Categorize(form));

    [Fact]
    public void Describe_spells_out_8K_items_and_amendments()
    {
        Assert.Equal("Current report: Results of operations, Officer or director change",
            FilingsService.Describe("8-K", "2.02,5.02,9.01", null));
        Assert.Equal("Annual report (amended)", FilingsService.Describe("10-K/A", null, null));
        Assert.Equal("Something custom", FilingsService.Describe("XYZ", null, "Something custom"));
    }

    [Fact]
    public void MapFilings_builds_EDGAR_links_and_skips_incomplete_rows()
    {
        var recent = JsonNode.Parse("""
            {"accessionNumber": ["0000320193-26-000001", null],
             "form": ["10-K", "8-K"], "filingDate": ["2026-11-01", "2026-10-01"],
             "reportDate": ["2026-09-27", null], "primaryDocument": ["aapl-10k.htm", null],
             "items": ["", ""], "primaryDocDescription": [null, null]}
            """);
        var f = Assert.Single(FilingsService.MapFilings(320193, recent));
        Assert.Equal("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-10k.htm", f.Url);
        Assert.Equal("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/0000320193-26-000001-index.htm", f.IndexUrl);
        Assert.Equal("annual", f.Category);
    }
}

/// <summary>LAYOUT's outline check on the workspace JSON the frontend sends.</summary>
public class LayoutTests
{
    private static JsonElement Json(string s) => JsonDocument.Parse(s).RootElement.Clone();

    [Fact]
    public void Accepts_a_workspace_and_stores_it_as_compact_json()
    {
        var json = LayoutService.CheckWorkspace(Json("""{ "panels": [ {"id": "a", "kind": "DES", "symbol": "AAPL"} ], "activeId": "a" }"""));
        Assert.Contains("\"kind\": \"DES\"", json.Replace("\"kind\":\"DES\"", "\"kind\": \"DES\""));
        Assert.Equal(JsonSerializer.Serialize(Json(json)), JsonSerializer.Serialize(Json(json))); // valid JSON
    }

    [Theory]
    [InlineData("""[1, 2]""", "must be an object")]
    [InlineData("""{"panels": 3}""", "must be an object")]
    [InlineData("""{"panels": []}""", "at least one panel")]
    [InlineData("""{"panels": [{"kind":"A"},{"kind":"B"},{"kind":"C"},{"kind":"D"},{"kind":"E"}]}""", "at most 4")]
    [InlineData("""{"panels": [{"id": "x"}]}""", "needs a \"kind\"")]
    [InlineData("""{"panels": [{"kind": 7}]}""", "needs a \"kind\"")]
    public void Rejects_malformed_workspaces(string workspace, string message)
    {
        var ex = Assert.Throws<ArgumentException>(() => LayoutService.CheckWorkspace(Json(workspace)));
        Assert.Contains(message, ex.Message);
    }

    [Fact]
    public void Rejects_a_missing_workspace() =>
        Assert.Throws<ArgumentException>(() => LayoutService.CheckWorkspace(null));

    [Fact]
    public void Rejects_oversized_workspaces()
    {
        var big = "{\"panels\": [{\"kind\": \"W\", \"list\": \"" + new string('x', 40_000) + "\"}]}";
        var ex = Assert.Throws<ArgumentException>(() => LayoutService.CheckWorkspace(Json(big)));
        Assert.Contains("too large", ex.Message);
    }
}
