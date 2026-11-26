using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

public sealed class CoinGeckoOptions
{
    /// <summary>Optional free "demo" key for higher limits. Works without one.</summary>
    public string? ApiKey { get; set; }
}

/// <summary>CoinGecko's public API: top coins by market cap for CRYPTO. No key needed.</summary>
public sealed class CoinGeckoClient(HttpClient http, IOptions<CoinGeckoOptions> options, ProviderHealth health)
{
    private readonly string? _key = options.Value.ApiKey?.Trim();

    /// <summary>The raw <c>coins/markets</c> array, with 7-day sparklines and 24h/7d % changes.</summary>
    public async Task<JsonArray> GetMarketsAsync(int count, CancellationToken ct)
    {
        var url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc" +
                  $"&per_page={count}&page=1&sparkline=true&price_change_percentage=24h,7d";
        var (status, body) = await ProviderHttp.GetAsync(http, url, ProviderHealth.CoinGecko, "CoinGecko", health, ct,
            req => { if (!string.IsNullOrWhiteSpace(_key)) req.Headers.Add("x-cg-demo-api-key", _key); });
        if (status != HttpStatusCode.OK) throw new UpstreamException($"CoinGecko returned {(int)status}.");

        try { return JsonNode.Parse(body) as JsonArray ?? []; }
        catch (JsonException ex) { throw new UpstreamException("CoinGecko returned a response that was not JSON.", ex); }
    }
}
