using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

public sealed class SecOptions
{
    /// <summary>
    /// SEC requires every automated client to identify itself with a name and contact email,
    /// e.g. "Stodash you@example.com". Set it with user-secrets or the Sec__UserAgent environment variable.
    /// </summary>
    public string? UserAgent { get; set; }
}

/// <summary>
/// SEC EDGAR's free JSON APIs: the ticker→CIK list, a company's filing history and its XBRL financial facts.
/// No key is needed, but SEC blocks clients without a contact User-Agent and asks for at most 10 requests per second.
/// </summary>
public sealed class SecClient(HttpClient http, IOptions<SecOptions> options, ProviderHealth health)
{
    private readonly string? _userAgent = options.Value.UserAgent?.Trim();

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_userAgent);

    /// <summary>About 10,000 entries shaped like <c>{"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}}</c>.</summary>
    public Task<JsonNode?> GetCompanyTickersAsync(CancellationToken ct) =>
        GetAsync("https://www.sec.gov/files/company_tickers.json", ct);

    /// <summary>Company details plus <c>filings.recent</c>: parallel arrays of the latest ~1,000 filings.</summary>
    public Task<JsonNode?> GetSubmissionsAsync(long cik, CancellationToken ct) =>
        GetAsync($"https://data.sec.gov/submissions/CIK{cik:D10}.json", ct);

    /// <summary>Every XBRL fact the company has reported, grouped by taxonomy and tag. Several MB for large filers.</summary>
    public Task<JsonNode?> GetCompanyFactsAsync(long cik, CancellationToken ct) =>
        GetAsync($"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:D10}.json", ct);

    /// <summary>Returns null when SEC answers 404 (for example, a company with no XBRL facts).</summary>
    private async Task<JsonNode?> GetAsync(string url, CancellationToken ct)
    {
        if (!IsConfigured)
            throw new UpstreamException("SEC EDGAR is not configured. Set Sec:UserAgent to \"Stodash your@email\" (see README).");

        HttpResponseMessage resp;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            // An email isn't a valid HTTP product token, so skip header validation.
            req.Headers.TryAddWithoutValidation("User-Agent", _userAgent);
            resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (HttpRequestException ex) { throw Fail("Could not reach SEC EDGAR.", ex); }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw Fail("SEC EDGAR timed out.", ex); }

        using (resp)
        {
            if (resp.StatusCode == HttpStatusCode.NotFound)
            {
                health.Ok(ProviderHealth.Sec);
                return null;
            }
            if (resp.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.Forbidden)
                throw Fail($"SEC EDGAR refused the request ({(int)resp.StatusCode}). It may be rate-limiting, or Sec:UserAgent is missing a contact email.");
            if (!resp.IsSuccessStatusCode)
                throw Fail($"SEC EDGAR returned {(int)resp.StatusCode}.");

            try
            {
                await using var stream = await resp.Content.ReadAsStreamAsync(ct);
                var root = await JsonNode.ParseAsync(stream, cancellationToken: ct);
                health.Ok(ProviderHealth.Sec);
                return root;
            }
            catch (JsonException ex) { throw Fail("SEC EDGAR returned a response that was not JSON.", ex); }
        }
    }

    private UpstreamException Fail(string message, Exception? inner = null)
    {
        health.Fail(ProviderHealth.Sec, message);
        return new UpstreamException(message, inner);
    }
}
