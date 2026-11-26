using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>
/// Thin client over Yahoo Finance's public (unofficial) JSON endpoints. No API key is needed,
/// but quoteSummary requires a session cookie plus a "crumb" token, which we fetch lazily and
/// refresh when Yahoo rejects it. Registered as a singleton so the cookie jar is shared.
/// </summary>
public sealed class YahooClient : IDisposable
{
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

    private readonly HttpClient _http;
    private readonly ILogger<YahooClient> _log;
    private readonly SemaphoreSlim _crumbLock = new(1, 1);
    private string? _crumb;

    public YahooClient(ILogger<YahooClient> log)
    {
        _log = log;
        var handler = new SocketsHttpHandler
        {
            UseCookies = true,
            CookieContainer = new CookieContainer(),
            AutomaticDecompression = DecompressionMethods.All,
            PooledConnectionLifetime = TimeSpan.FromMinutes(15),
        };
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        _http.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
    }

    /// <summary>Returns <c>chart.result[0]</c>: meta, timestamps and OHLCV arrays.</summary>
    public async Task<JsonObject> GetChartAsync(string symbol, string range, string interval, CancellationToken ct)
    {
        var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}" +
                  $"?range={range}&interval={interval}&includePrePost=false";
        var (status, root) = await GetJsonAsync(url, ct);

        var chart = root?["chart"];
        if (status == HttpStatusCode.NotFound || J.Str(chart?["error"], "code") == "Not Found")
            throw new SymbolNotFoundException(symbol);
        if (status != HttpStatusCode.OK)
            throw new UpstreamException($"Yahoo chart returned {(int)status} for {symbol}.");

        return chart?["result"]?[0] as JsonObject ?? throw new SymbolNotFoundException(symbol);
    }

    /// <summary>Returns <c>quoteSummary.result[0]</c> with the requested modules.</summary>
    public async Task<JsonObject> GetQuoteSummaryAsync(string symbol, string modules, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var crumb = await GetCrumbAsync(forceRefresh: attempt > 0, ct);
            var url = $"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{Uri.EscapeDataString(symbol)}" +
                      $"?modules={modules}&crumb={Uri.EscapeDataString(crumb)}";
            var (status, root) = await GetJsonAsync(url, ct);

            if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden && attempt == 0)
            {
                _log.LogInformation("Yahoo rejected crumb ({Status}); refreshing.", (int)status);
                continue;
            }
            if (status == HttpStatusCode.NotFound)
                throw new SymbolNotFoundException(symbol);
            if (status != HttpStatusCode.OK)
                throw new UpstreamException($"Yahoo quoteSummary returned {(int)status} for {symbol}.");

            return root?["quoteSummary"]?["result"]?[0] as JsonObject
                   ?? throw new SymbolNotFoundException(symbol);
        }
    }

    /// <summary>Returns the raw <c>quotes</c> array from Yahoo's symbol search.</summary>
    public async Task<JsonArray> SearchAsync(string query, int count, CancellationToken ct)
    {
        var url = "https://query1.finance.yahoo.com/v1/finance/search" +
                  $"?q={Uri.EscapeDataString(query)}&quotesCount={count}&newsCount=0&listsCount=0&enableFuzzyQuery=false";
        var (status, root) = await GetJsonAsync(url, ct);
        if (status != HttpStatusCode.OK)
            throw new UpstreamException($"Yahoo search returned {(int)status}.");
        return root?["quotes"] as JsonArray ?? [];
    }

    private async Task<string> GetCrumbAsync(bool forceRefresh, CancellationToken ct)
    {
        if (!forceRefresh && _crumb is { } cached) return cached;

        await _crumbLock.WaitAsync(ct);
        try
        {
            if (!forceRefresh && _crumb is { } again) return again;

            // This host answers 404 but sets the session cookie the crumb is tied to.
            try { using var _ = await _http.GetAsync("https://fc.yahoo.com", ct); }
            catch (HttpRequestException) { /* cookie may already be present */ }

            using var resp = await SendAsync("https://query1.finance.yahoo.com/v1/test/getcrumb", ct);
            var crumb = (await resp.Content.ReadAsStringAsync(ct)).Trim();
            if (!resp.IsSuccessStatusCode || crumb.Length == 0 || crumb.Contains('<') || crumb.Contains('{'))
                throw new UpstreamException($"Could not get a Yahoo session token ({(int)resp.StatusCode}).");

            return _crumb = crumb;
        }
        finally
        {
            _crumbLock.Release();
        }
    }

    private async Task<(HttpStatusCode Status, JsonNode? Root)> GetJsonAsync(string url, CancellationToken ct)
    {
        using var resp = await SendAsync(url, ct);
        if (resp.StatusCode == HttpStatusCode.TooManyRequests)
            throw new UpstreamException("Yahoo is rate-limiting requests; try again shortly.");

        try
        {
            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            var root = await JsonNode.ParseAsync(stream, cancellationToken: ct);
            return (resp.StatusCode, root);
        }
        catch (JsonException) when (!resp.IsSuccessStatusCode)
        {
            return (resp.StatusCode, null);
        }
        catch (JsonException ex)
        {
            throw new UpstreamException("Yahoo returned a response that was not JSON.", ex);
        }
    }

    private async Task<HttpResponseMessage> SendAsync(string url, CancellationToken ct)
    {
        try
        {
            return await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new UpstreamException("Could not reach Yahoo Finance.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new UpstreamException("Yahoo Finance timed out.", ex);
        }
    }

    public void Dispose()
    {
        _http.Dispose();
        _crumbLock.Dispose();
    }
}
