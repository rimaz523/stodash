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
    private readonly ProviderHealth _health;
    private readonly SemaphoreSlim _crumbLock = new(1, 1);
    private string? _crumb;

    public YahooClient(ILogger<YahooClient> log, ProviderHealth health)
    {
        _log = log;
        _health = health;
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

    /// <summary>
    /// Returns <c>quoteResponse.result</c> from the batch quote endpoint: one entry per known symbol (unknown ones are
    /// left out) with price, change, market cap, P/E, P/B and dividend fields. At most 100 symbols per call. Needs the crumb.
    /// </summary>
    public async Task<JsonArray> GetQuotesAsync(IReadOnlyCollection<string> symbols, CancellationToken ct)
    {
        if (symbols.Count is 0 or > 100) throw new ArgumentException("Ask for 1 to 100 symbols at a time.");
        var list = string.Join(',', symbols.Select(Uri.EscapeDataString));
        for (var attempt = 0; ; attempt++)
        {
            var crumb = await GetCrumbAsync(forceRefresh: attempt > 0, ct);
            var url = $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={list}&crumb={Uri.EscapeDataString(crumb)}";
            var (status, root) = await GetJsonAsync(url, ct);

            if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden && attempt == 0)
            {
                _log.LogInformation("Yahoo rejected crumb ({Status}); refreshing.", (int)status);
                continue;
            }
            if (status != HttpStatusCode.OK)
                throw Fail($"Yahoo batch quotes returned {(int)status}.");
            return root?["quoteResponse"]?["result"] as JsonArray ?? [];
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

    /// <summary>
    /// Returns <c>timeseries.result</c>: one entry per requested type (e.g. <c>annualTotalRevenue</c>), each holding
    /// an array of <c>{asOfDate, currencyCode, reportedValue: {raw}}</c> points. Unknown symbols come back empty.
    /// No crumb is needed.
    /// </summary>
    public async Task<JsonArray> GetFundamentalsAsync(
        string symbol, IEnumerable<string> types, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        var url = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/" +
                  $"{Uri.EscapeDataString(symbol)}?type={string.Join(',', types)}" +
                  $"&period1={from.ToUnixTimeSeconds()}&period2={to.ToUnixTimeSeconds()}";
        var (status, root) = await GetJsonAsync(url, ct);
        if (status == HttpStatusCode.NotFound) return [];
        if (status != HttpStatusCode.OK)
            throw new UpstreamException($"Yahoo fundamentals returned {(int)status} for {symbol}.");
        return root?["timeseries"]?["result"] as JsonArray ?? [];
    }

    /// <summary>
    /// Returns the raw <c>news</c> array from Yahoo's search for <paramref name="query"/>:
    /// <c>{title, publisher, link, providerPublishTime, relatedTickers}</c>.
    /// </summary>
    public async Task<JsonArray> SearchNewsAsync(string query, int count, CancellationToken ct)
    {
        var url = "https://query1.finance.yahoo.com/v1/finance/search" +
                  $"?q={Uri.EscapeDataString(query)}&quotesCount=0&newsCount={count}&listsCount=0&enableFuzzyQuery=false";
        var (status, root) = await GetJsonAsync(url, ct);
        if (status != HttpStatusCode.OK)
            throw new UpstreamException($"Yahoo news returned {(int)status}.");
        return root?["news"] as JsonArray ?? [];
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
            throw Fail("Yahoo is rate-limiting requests; try again shortly.");
        if ((int)resp.StatusCode >= 500)
            _health.Fail(ProviderHealth.Yahoo, $"Yahoo returned {(int)resp.StatusCode}.");

        try
        {
            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            var root = await JsonNode.ParseAsync(stream, cancellationToken: ct);
            if ((int)resp.StatusCode < 500) _health.Ok(ProviderHealth.Yahoo);
            return (resp.StatusCode, root);
        }
        catch (JsonException) when (!resp.IsSuccessStatusCode)
        {
            return (resp.StatusCode, null);
        }
        catch (JsonException ex)
        {
            throw Fail("Yahoo returned a response that was not JSON.", ex);
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
            throw Fail("Could not reach Yahoo Finance.", ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw Fail("Yahoo Finance timed out.", ex);
        }
    }

    private UpstreamException Fail(string message, Exception? inner = null)
    {
        _health.Fail(ProviderHealth.Yahoo, message);
        return new UpstreamException(message, inner);
    }

    public void Dispose()
    {
        _http.Dispose();
        _crumbLock.Dispose();
    }
}
