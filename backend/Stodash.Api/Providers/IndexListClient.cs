using System.Net;
using System.Text;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>One index member as the constituent list gives it. <see cref="Symbol"/> is as listed (BRK.B).</summary>
public sealed record IndexMember(string Symbol, string Name, string Sector, string? Industry);

/// <summary>
/// The S&amp;P 500 constituent list for EQS, from the open "datasets/s-and-p-500-companies" CSV on GitHub (kept up to
/// date from Wikipedia's list). No key needed. Columns: Symbol, Security, GICS Sector, GICS Sub-Industry, ...
/// </summary>
public sealed class IndexListClient(HttpClient http, ProviderHealth health)
{
    public const string Sp500Url =
        "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";

    public async Task<IReadOnlyList<IndexMember>> GetSp500Async(CancellationToken ct)
    {
        var (status, body) = await ProviderHttp.GetAsync(http, Sp500Url, ProviderHealth.IndexList, "The S&P 500 list", health, ct);
        if (status != HttpStatusCode.OK) throw Fail($"The S&P 500 list returned {(int)status}.");

        var rows = ParseCsv(body);
        if (rows.Count < 2) throw Fail("The S&P 500 list was empty.");

        var header = rows[0];
        int Col(string name) => header.FindIndex(h => h.Equals(name, StringComparison.OrdinalIgnoreCase));
        var (sym, name, sector, industry) = (Col("Symbol"), Col("Security"), Col("GICS Sector"), Col("GICS Sub-Industry"));
        if (sym < 0 || name < 0 || sector < 0) throw Fail("The S&P 500 list has unexpected columns.");

        var members = rows.Skip(1)
            .Where(r => r.Count > Math.Max(sym, Math.Max(name, sector)) && r[sym].Length > 0)
            .Select(r => new IndexMember(r[sym].Trim(), r[name].Trim(), r[sector].Trim(),
                industry >= 0 && industry < r.Count && r[industry].Length > 0 ? r[industry].Trim() : null))
            .ToList();
        // A real list has about 503 members (some companies have two share classes); far fewer means a broken file.
        if (members.Count < 400) throw Fail($"The S&P 500 list only had {members.Count} rows.");
        return members;
    }

    private UpstreamException Fail(string message)
    {
        health.Fail(ProviderHealth.IndexList, message);
        return new UpstreamException(message);
    }

    /// <summary>A small RFC 4180 reader: quoted fields may hold commas, newlines and doubled quotes.</summary>
    public static List<List<string>> ParseCsv(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else field.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == ',') { row.Add(field.ToString()); field.Clear(); }
            else if (c is '\n' or '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(field.ToString());
                field.Clear();
                if (row.Count > 1 || row[0].Length > 0) rows.Add(row);
                row = [];
            }
            else field.Append(c);
        }
        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row);
        }
        return rows;
    }
}
