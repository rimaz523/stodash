using System.Text.Json.Nodes;
using Microsoft.Extensions.Caching.Memory;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>SEC filings (CF) from EDGAR's submissions API.</summary>
public sealed class FilingsService(SecClient sec, SecCompanyLookup lookup, MarketDataService market, IMemoryCache cache)
{
    private const string Source = "SEC EDGAR";

    public Task<FilingList> GetFilingsAsync(string rawSymbol, CancellationToken ct)
    {
        var symbol = MarketDataService.NormalizeSymbol(rawSymbol);
        return cache.GetOrLoadAsync($"filings:{symbol}", TimeSpan.FromHours(1), async () =>
        {
            if (!sec.IsConfigured)
                throw new UpstreamException("SEC EDGAR is not configured. Set Sec:UserAgent to \"Stodash your@email\" (see README).");

            var company = await lookup.FindAsync(symbol, ct);
            if (company is null)
            {
                await market.GetQuoteAsync(symbol, ct); // unknown tickers throw a 404 here
                return new FilingList(symbol, null, null, [],
                    "No SEC filings. EDGAR only covers companies registered with the US SEC under a US ticker, " +
                    "so non-US listings, indexes, currencies, futures and crypto have none.", Source);
            }

            var root = await sec.GetSubmissionsAsync(company.Cik, ct)
                       ?? throw new UpstreamException($"SEC has no filing history for CIK {company.Cik}.");
            return new FilingList(symbol, company.Cik, J.Str(root, "name") ?? company.Title,
                MapFilings(company.Cik, root["filings"]?["recent"]), null, Source);
        });
    }

    private static List<Filing> MapFilings(long cik, JsonNode? recent)
    {
        var accessions = recent?["accessionNumber"] as JsonArray ?? [];
        var filings = new List<Filing>(accessions.Count);
        for (var i = 0; i < accessions.Count; i++)
        {
            var accession = Str(accessions[i]);
            var form = Str(recent!["form"]?[i]);
            var filed = Str(recent["filingDate"]?[i]);
            if (accession is null || form is null || filed is null) continue;

            var folder = $"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.Replace("-", "")}";
            var indexUrl = $"{folder}/{accession}-index.htm";
            var doc = Str(recent["primaryDocument"]?[i]);

            filings.Add(new Filing(
                Form: form,
                Category: Categorize(form),
                FilingDate: filed,
                ReportDate: Str(recent["reportDate"]?[i]),
                Description: Describe(form, Str(recent["items"]?[i]), Str(recent["primaryDocDescription"]?[i])),
                Url: doc is null ? indexUrl : $"{folder}/{doc}",
                IndexUrl: indexUrl,
                AccessionNumber: accession));
        }
        return filings;
    }

    private static string? Str(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) ? s : null;

    private static string Categorize(string form)
    {
        var f = form.EndsWith("/A", StringComparison.Ordinal) ? form[..^2] : form;
        return f switch
        {
            "10-K" or "10-KT" or "20-F" or "40-F" => "annual",
            "10-Q" or "10-QT" => "quarterly",
            "8-K" or "6-K" => "current",
            "3" or "4" or "5" or "144" => "insider",
            _ when f.StartsWith("DEF", StringComparison.Ordinal) || f.StartsWith("PRE ", StringComparison.Ordinal) => "proxy",
            _ => "other",
        };
    }

    private static readonly Dictionary<string, string> FormNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["10-K"] = "Annual report",
        ["10-Q"] = "Quarterly report",
        ["8-K"] = "Current report",
        ["20-F"] = "Annual report (foreign issuer)",
        ["40-F"] = "Annual report (Canadian issuer)",
        ["6-K"] = "Report of foreign issuer",
        ["DEF 14A"] = "Proxy statement",
        ["DEFA14A"] = "Additional proxy materials",
        ["PRE 14A"] = "Preliminary proxy statement",
        ["3"] = "Initial insider ownership",
        ["4"] = "Insider transaction",
        ["5"] = "Annual insider ownership",
        ["144"] = "Notice of proposed insider sale",
        ["SC 13G"] = "Passive ownership over 5%",
        ["SC 13D"] = "Active ownership over 5%",
        ["SCHEDULE 13G"] = "Passive ownership over 5%",
        ["SCHEDULE 13D"] = "Active ownership over 5%",
        ["S-1"] = "Registration statement",
        ["S-3"] = "Shelf registration",
        ["S-3ASR"] = "Automatic shelf registration",
        ["S-8"] = "Employee stock plan registration",
        ["11-K"] = "Employee plan annual report",
        ["ARS"] = "Annual report to shareholders",
        ["SD"] = "Specialized disclosure (conflict minerals)",
        ["FWP"] = "Free writing prospectus",
        ["CORRESP"] = "Letter to SEC",
        ["UPLOAD"] = "Letter from SEC",
    };

    // The 8-K items worth spelling out; 9.01 (exhibits) is on nearly every 8-K, so it's left out.
    private static readonly Dictionary<string, string> EightKItems = new()
    {
        ["1.01"] = "Material agreement",
        ["1.02"] = "Agreement terminated",
        ["2.01"] = "Acquisition or disposal",
        ["2.02"] = "Results of operations",
        ["2.03"] = "New debt obligation",
        ["2.05"] = "Exit or restructuring costs",
        ["2.06"] = "Impairment",
        ["3.01"] = "Delisting notice",
        ["3.02"] = "Unregistered share sale",
        ["4.01"] = "Auditor change",
        ["5.02"] = "Officer or director change",
        ["5.03"] = "Charter or bylaw amendment",
        ["5.07"] = "Shareholder vote results",
        ["7.01"] = "Regulation FD disclosure",
        ["8.01"] = "Other events",
    };

    private static string Describe(string form, string? items, string? docDescription)
    {
        var amended = form.EndsWith("/A", StringComparison.Ordinal);
        var baseForm = amended ? form[..^2] : form;
        var name = FormNames.GetValueOrDefault(baseForm) ?? docDescription ?? form;
        if (amended) name += " (amended)";

        if (baseForm == "8-K" && items is not null)
        {
            var details = items.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(i => EightKItems.GetValueOrDefault(i))
                .OfType<string>()
                .ToList();
            if (details.Count > 0) name += ": " + string.Join(", ", details);
        }
        return name;
    }
}
