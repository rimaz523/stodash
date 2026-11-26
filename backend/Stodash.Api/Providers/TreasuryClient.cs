using System.Globalization;
using System.Net;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>One day of par yields. <see cref="Yields"/> maps the CSV's column header (e.g. "10 Yr") to a percent.</summary>
public sealed record TreasuryRow(DateOnly Date, Dictionary<string, double> Yields);

/// <summary>A year of rows, newest first, plus the CSV's maturity headers in order (shortest first).</summary>
public sealed record TreasuryYear(List<string> Maturities, List<TreasuryRow> Rows);

/// <summary>
/// US Treasury daily par yield curve rates, from Treasury's public CSV download. No key needed.
/// https://home.treasury.gov/resource-center/data-chart-center/interest-rates
/// </summary>
public sealed class TreasuryClient(HttpClient http, ProviderHealth health)
{
    /// <summary>Every trading day of <paramref name="year"/>, newest first, plus the CSV's maturity headers in order.</summary>
    public async Task<TreasuryYear> GetYearAsync(int year, CancellationToken ct)
    {
        var url = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/" +
                  $"{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv";
        var (status, body) = await ProviderHttp.GetAsync(http, url, ProviderHealth.Treasury, "US Treasury", health, ct);
        if (status == HttpStatusCode.NotFound) return new TreasuryYear([], []);
        if (status != HttpStatusCode.OK) throw new UpstreamException($"US Treasury returned {(int)status}.");

        var lines = body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length == 0) return new TreasuryYear([], []);

        // Read columns by header name, not position, so a new or removed maturity doesn't shift everything.
        var headers = Split(lines[0]);
        var maturities = headers.Skip(1).ToList();
        var rows = new List<TreasuryRow>();
        foreach (var line in lines.Skip(1))
        {
            var cells = Split(line);
            if (cells.Count == 0 || !DateOnly.TryParseExact(cells[0], "MM/dd/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                continue;
            var yields = new Dictionary<string, double>();
            for (var i = 1; i < cells.Count && i < headers.Count; i++)
                if (double.TryParse(cells[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
                    yields[headers[i]] = y;
            rows.Add(new TreasuryRow(date, yields));
        }
        rows.Sort((a, b) => b.Date.CompareTo(a.Date));
        return new TreasuryYear(maturities, rows);
    }

    // The CSV has no commas inside values; headers are quoted.
    private static List<string> Split(string line) => line.Split(',').Select(c => c.Trim().Trim('"')).ToList();
}
