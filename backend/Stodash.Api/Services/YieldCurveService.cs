using System.Globalization;
using System.Text.RegularExpressions;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>YC: the US Treasury par yield curve now, about a month ago and about a year ago.</summary>
public sealed partial class YieldCurveService(TreasuryClient treasury, IMarketCache cache)
{
    private const string Source = "US Treasury (daily par yield curve rates)";

    public Task<YieldCurve> GetAsync(CancellationToken ct) =>
        cache.GetOrLoadAsync("yieldcurve", TimeSpan.FromHours(1), durable: true, load: async () =>
        {
            var year = DateTime.UtcNow.Year;
            var thisYear = await YearAsync(year, TimeSpan.FromHours(1), ct);
            var lastYear = await YearAsync(year - 1, TimeSpan.FromHours(24), ct);
            var rows = thisYear.Rows.Concat(lastYear.Rows).ToList(); // newest first
            if (rows.Count == 0) throw new UpstreamException("US Treasury returned no yield data.");
            var headers = thisYear.Maturities.Count > 0 ? thisYear.Maturities : lastYear.Maturities;

            // Keep maturities in the CSV's order (shortest first), skipping any we can't read.
            var maturities = headers
                .Select(h => (Header: h, Months: Months(h)))
                .Where(m => m.Months is not null)
                .Select(m => (m.Header, Months: m.Months!.Value))
                .ToList();

            var latest = rows[0];
            TreasuryRow? OnOrBefore(DateOnly date) => rows.FirstOrDefault(r => r.Date <= date);
            var curves = new[]
                {
                    ("Latest", latest),
                    ("1 month ago", OnOrBefore(latest.Date.AddMonths(-1))),
                    ("1 year ago", OnOrBefore(latest.Date.AddYears(-1))),
                }
                .Where(c => c.Item2 is not null)
                .Select(c => new YieldCurveLine(c.Item1, c.Item2!.Date.ToString("yyyy-MM-dd"),
                    maturities.Select(m => c.Item2.Yields.TryGetValue(m.Header, out var y) ? y : (double?)null).ToList()))
                .ToList();

            double? Bp(string a, string b) =>
                latest.Yields.TryGetValue(a, out var x) && latest.Yields.TryGetValue(b, out var y) ? Math.Round((x - y) * 100) : null;
            var tenYear = maturities.FirstOrDefault(m => m.Months == 120).Header;
            var twoYear = maturities.FirstOrDefault(m => m.Months == 24).Header;
            var threeMonth = maturities.FirstOrDefault(m => m.Months == 3).Header;
            var spreads = new List<YieldSpread>
            {
                new("10Y–2Y", tenYear is null || twoYear is null ? null : Bp(tenYear, twoYear)),
                new("10Y–3M", tenYear is null || threeMonth is null ? null : Bp(tenYear, threeMonth)),
            };

            return new YieldCurve(
                maturities.Select(m => new YieldMaturity(Label(m.Months), m.Months)).ToList(), curves, spreads, Source);
        });

    private Task<TreasuryYear> YearAsync(int year, TimeSpan ttl, CancellationToken ct) =>
        cache.GetOrLoadAsync($"treasury:{year}", ttl, durable: true, load: () => treasury.GetYearAsync(year, ct));

    /// <summary>"1 Mo" → 1, "1.5 Month" → 1.5, "10 Yr" → 120. Null for anything else.</summary>
    private static double? Months(string header)
    {
        var m = MaturityPattern().Match(header);
        if (!m.Success) return null;
        var n = double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        return m.Groups[2].Value.StartsWith("Y", StringComparison.OrdinalIgnoreCase) ? n * 12 : n;
    }

    private static string Label(double months) =>
        months < 12 ? $"{months.ToString(CultureInfo.InvariantCulture)}M" : $"{(months / 12).ToString(CultureInfo.InvariantCulture)}Y";

    [GeneratedRegex(@"^\s*(\d+(?:\.\d+)?)\s*(Mo|Month|Months|Yr|Year|Years)\b", RegexOptions.IgnoreCase)]
    private static partial Regex MaturityPattern();
}
