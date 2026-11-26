using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;

namespace Stodash.Api.Providers;

public sealed class FinnhubOptions
{
    /// <summary>Optional. Set with user-secrets or the Finnhub__ApiKey environment variable.</summary>
    public string? ApiKey { get; set; }
}

/// <summary>
/// Optional provider, active only when an API key is configured: a fallback for quotes and profiles,
/// and a second news source next to Yahoo. Free key: https://finnhub.io/register
/// </summary>
public sealed class FinnhubClient(HttpClient http, IOptions<FinnhubOptions> options, ProviderHealth health)
{
    private readonly string? _key = options.Value.ApiKey;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key);

    public async Task<Quote> GetQuoteAsync(string symbol, CancellationToken ct)
    {
        var q = await GetAsync($"quote?symbol={Uri.EscapeDataString(symbol)}", ct);
        // Finnhub answers unknown symbols with all-zero fields rather than an error.
        if (J.Num(q, "c") is not { } price || price == 0)
            throw new SymbolNotFoundException(symbol);

        var time = J.Long(q, "t") is { } t and > 0 ? DateTimeOffset.FromUnixTimeSeconds(t) : (DateTimeOffset?)null;
        return new Quote(symbol, null, null, null, null, price, J.Num(q, "d"), J.Num(q, "dp"),
            J.Num(q, "pc"), J.Num(q, "o"), J.Num(q, "h"), J.Num(q, "l"), null, null, null, time, "Finnhub");
    }

    public async Task<CompanyProfile> GetProfileAsync(string symbol, CancellationToken ct)
    {
        var p = await GetAsync($"stock/profile2?symbol={Uri.EscapeDataString(symbol)}", ct);
        if (J.Str(p, "name") is null)
            throw new SymbolNotFoundException(symbol);

        // Finnhub reports market cap and shares in millions.
        var stats = KeyStats.Empty with
        {
            MarketCap = J.Num(p, "marketCapitalization") * 1_000_000,
            SharesOutstanding = J.Num(p, "shareOutstanding") is { } s ? (long)(s * 1_000_000) : null,
        };
        return new CompanyProfile(symbol, J.Str(p, "name"), J.Str(p, "exchange"), J.Str(p, "currency"), "EQUITY",
            null, J.Str(p, "finnhubIndustry"), J.Str(p, "country"), null, null, J.Str(p, "weburl"), null, null,
            [], stats, "Finnhub");
    }

    /// <summary>
    /// Company headlines between two dates: <c>[{headline, source, url, datetime, summary, related}]</c>.
    /// The free tier covers North American companies; anything else comes back empty.
    /// </summary>
    public async Task<JsonArray> GetCompanyNewsAsync(string symbol, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var node = await GetAsync(
            $"company-news?symbol={Uri.EscapeDataString(symbol)}&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}", ct);
        return node as JsonArray ?? [];
    }

    private async Task<JsonNode?> GetAsync(string path, CancellationToken ct)
    {
        if (!IsConfigured) throw new UpstreamException("Finnhub is not configured.");

        HttpResponseMessage resp;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, path);
            req.Headers.Add("X-Finnhub-Token", _key);
            resp = await http.SendAsync(req, ct);
        }
        catch (HttpRequestException ex) { throw Fail("Could not reach Finnhub.", ex); }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw Fail("Finnhub timed out.", ex); }

        using (resp)
        {
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
                throw Fail("Finnhub rate limit reached.");
            if (!resp.IsSuccessStatusCode)
                throw Fail($"Finnhub returned {(int)resp.StatusCode}.");
            try
            {
                var root = JsonNode.Parse(await resp.Content.ReadAsStringAsync(ct));
                health.Ok(ProviderHealth.Finnhub);
                return root;
            }
            catch (System.Text.Json.JsonException ex) { throw Fail("Finnhub returned a response that was not JSON.", ex); }
        }
    }

    private UpstreamException Fail(string message, Exception? inner = null)
    {
        health.Fail(ProviderHealth.Finnhub, message);
        return new UpstreamException(message, inner);
    }
}
