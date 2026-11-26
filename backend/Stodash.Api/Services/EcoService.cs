using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>The ECO dashboard: nine US indicators from FRED, some turned into year-over-year rates.</summary>
public sealed class EcoService(FredClient fred, IMarketCache cache)
{
    private const string Source = "FRED (Federal Reserve Bank of St. Louis)";
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(6);

    /// <param name="Yoy">Show the change from a year earlier (in percent) instead of the raw level.</param>
    private sealed record Indicator(
        string Id, string Label, string SeriesId, string Unit, string Frequency, string Description, bool Yoy = false);

    private static readonly Indicator[] Indicators =
    [
        new("CPI", "CPI inflation", "CPIAUCSL", "percent", "Monthly", "Consumer prices, all items, change from a year earlier.", Yoy: true),
        new("PCE", "Core PCE inflation", "PCEPILFE", "percent", "Monthly",
            "Core PCE prices (excluding food and energy), change from a year earlier. The Fed's preferred inflation gauge.", Yoy: true),
        new("UNEMP", "Unemployment", "UNRATE", "percent", "Monthly", "Unemployment rate."),
        new("FEDFUNDS", "Fed funds rate", "DFF", "percent", "Daily", "Effective federal funds rate."),
        new("GDP", "Real GDP growth", "A191RL1Q225SBEA", "percent", "Quarterly",
            "Real GDP, change from the previous quarter at an annual rate."),
        new("SPREAD", "10Y–2Y spread", "T10Y2Y", "points", "Daily",
            "10-year minus 2-year Treasury yield, in percentage points. Below zero means the curve is inverted."),
        new("MORTGAGE", "30-year mortgage rate", "MORTGAGE30US", "percent", "Weekly", "Average 30-year fixed mortgage rate (Freddie Mac)."),
        new("CLAIMS", "Initial jobless claims", "ICSA", "count", "Weekly", "New claims for unemployment insurance, seasonally adjusted."),
        new("SENTIMENT", "Consumer sentiment", "UMCSENT", "index", "Monthly", "University of Michigan consumer sentiment (1966 Q1 = 100)."),
    ];

    public static IReadOnlyList<string> Ids => Indicators.Select(i => i.Id).ToList();
    public static readonly string[] Ranges = ["1Y", "5Y", "10Y", "20Y"];

    private string NotConfigured =>
        "FRED isn't configured. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html, then run: " +
        "dotnet user-secrets set \"Fred:ApiKey\" \"YOUR_KEY\" --project backend/Stodash.Api";

    public async Task<EcoDashboard> GetDashboardAsync(CancellationToken ct)
    {
        if (!fred.IsConfigured) return new EcoDashboard(false, NotConfigured, [], Source);

        var tiles = await Task.WhenAll(Indicators.Select(async ind =>
        {
            var points = await SeriesAsync(ind, ct);
            var last = points.Count > 0 ? points[^1] : null;
            var prev = points.Count > 1 ? points[^2] : null;
            var cutoff = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-2).ToString("yyyy-MM-dd");
            return new EcoIndicator(ind.Id, ind.Label, ind.SeriesId, ind.Unit, ind.Frequency, ind.Description,
                last?.Value, prev?.Value, last is not null && prev is not null ? last.Value - prev.Value : null, last?.Date,
                Downsample(points.Where(p => string.CompareOrdinal(p.Date, cutoff) >= 0).ToList(), 60));
        }));
        return new EcoDashboard(true, null, tiles, Source);
    }

    public async Task<EcoSeries> GetSeriesAsync(string rawId, string? rawRange, CancellationToken ct)
    {
        var id = (rawId ?? "").Trim().ToUpperInvariant();
        var ind = Indicators.FirstOrDefault(i => i.Id == id || i.SeriesId == id)
                  ?? throw new NotFoundException($"Unknown indicator '{rawId}'. Use one of: {string.Join(", ", Ids)}.");
        var range = string.IsNullOrWhiteSpace(rawRange) ? "5Y" : rawRange.Trim().ToUpperInvariant();
        if (!Ranges.Contains(range)) throw new ArgumentException($"Unknown range '{rawRange}'. Use one of: {string.Join(", ", Ranges)}.");
        if (!fred.IsConfigured) throw new UpstreamException(NotConfigured);

        var years = int.Parse(range[..^1]);
        var cutoff = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-years).ToString("yyyy-MM-dd");
        var points = (await SeriesAsync(ind, ct)).Where(p => string.CompareOrdinal(p.Date, cutoff) >= 0).ToList();
        return new EcoSeries(ind.Id, ind.Label, ind.SeriesId, ind.Unit, ind.Frequency, ind.Description, range,
            Downsample(points, 600), Source);
    }

    /// <summary>The indicator's values as shown (YoY applied), oldest first, covering about 20 years.</summary>
    private async Task<List<EcoPoint>> SeriesAsync(Indicator ind, CancellationToken ct)
    {
        var raw = await cache.GetOrLoadAsync($"fred:{ind.SeriesId}", Ttl, durable: true, load: () =>
            fred.GetObservationsAsync(ind.SeriesId, DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-21), ct));
        return ind.Yoy ? YearOverYear(raw) : raw;
    }

    /// <summary>Percent change from the observation 12 months earlier (monthly series).</summary>
    private static List<EcoPoint> YearOverYear(List<EcoPoint> points)
    {
        var byDate = points.ToDictionary(p => p.Date, p => p.Value);
        var result = new List<EcoPoint>(points.Count);
        foreach (var p in points)
        {
            var yearAgo = DateOnly.Parse(p.Date).AddYears(-1).ToString("yyyy-MM-dd");
            if (byDate.TryGetValue(yearAgo, out var before) && before != 0)
                result.Add(new EcoPoint(p.Date, Math.Round((p.Value / before - 1) * 100, 2)));
        }
        return result;
    }

    /// <summary>Keeps at most <paramref name="max"/> evenly spaced points, always including the latest.</summary>
    private static List<EcoPoint> Downsample(List<EcoPoint> points, int max)
    {
        if (points.Count <= max) return points;
        var step = (double)(points.Count - 1) / (max - 1);
        return Enumerable.Range(0, max).Select(i => points[(int)Math.Round(i * step)]).ToList();
    }
}
