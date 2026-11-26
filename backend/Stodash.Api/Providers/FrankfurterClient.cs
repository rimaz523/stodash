using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>
/// Frankfurter: European Central Bank daily reference rates. No key. FX's fallback when Yahoo has no rate.
/// https://frankfurter.dev
/// </summary>
public sealed class FrankfurterClient(HttpClient http, ProviderHealth health)
{
    /// <summary>How many units of each currency one US dollar buys, and the ECB date those rates are from.</summary>
    public async Task<(Dictionary<string, double> PerUsd, string? Date)> GetUsdRatesAsync(IEnumerable<string> currencies, CancellationToken ct)
    {
        var url = $"https://api.frankfurter.dev/v1/latest?base=USD&symbols={string.Join(',', currencies)}";
        var (status, body) = await ProviderHttp.GetAsync(http, url, ProviderHealth.Frankfurter, "Frankfurter (ECB)", health, ct);
        if (status != HttpStatusCode.OK) throw new UpstreamException($"Frankfurter returned {(int)status}.");

        JsonNode? root;
        try { root = JsonNode.Parse(body); }
        catch (JsonException ex) { throw new UpstreamException("Frankfurter returned a response that was not JSON.", ex); }

        var rates = new Dictionary<string, double>();
        if (root?["rates"] is JsonObject obj)
            foreach (var (ccy, value) in obj)
                if (J.Num(value) is { } r) rates[ccy] = r;
        return (rates, J.Str(root, "date"));
    }
}
