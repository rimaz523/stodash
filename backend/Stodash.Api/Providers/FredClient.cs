using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;

namespace Stodash.Api.Providers;

public sealed class FredOptions
{
    /// <summary>Free key: https://fred.stlouisfed.org/docs/api/api_key.html. Set with user-secrets or Fred__ApiKey.</summary>
    public string? ApiKey { get; set; }
}

/// <summary>FRED (St. Louis Fed): US economic time series for ECO. Needs a free key.</summary>
public sealed class FredClient(HttpClient http, IOptions<FredOptions> options, ProviderHealth health)
{
    private readonly string? _key = options.Value.ApiKey?.Trim();

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key);

    /// <summary>Observations from <paramref name="start"/> onward, oldest first. Missing values (".") are skipped.</summary>
    public async Task<List<EcoPoint>> GetObservationsAsync(string seriesId, DateOnly start, CancellationToken ct)
    {
        if (!IsConfigured) throw new UpstreamException("FRED is not configured. Set Fred:ApiKey (see README).");

        var url = "https://api.stlouisfed.org/fred/series/observations" +
                  $"?series_id={Uri.EscapeDataString(seriesId)}&api_key={Uri.EscapeDataString(_key!)}" +
                  $"&file_type=json&observation_start={start:yyyy-MM-dd}";
        var (status, body) = await ProviderHttp.GetAsync(http, url, ProviderHealth.Fred, "FRED", health, ct);

        JsonNode? root;
        try { root = JsonNode.Parse(body); }
        catch (JsonException ex) { throw new UpstreamException("FRED returned a response that was not JSON.", ex); }

        if (status != HttpStatusCode.OK)
        {
            // FRED explains problems in error_message, e.g. an unregistered key.
            var message = $"FRED: {J.Str(root, "error_message") ?? $"returned {(int)status}"}";
            health.Fail(ProviderHealth.Fred, message);
            throw new UpstreamException(message);
        }

        return (root?["observations"] as JsonArray ?? [])
            .Select(o => J.Str(o, "date") is { } date && double.TryParse(J.Str(o, "value"),
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v)
                ? new EcoPoint(date, v)
                : null)
            .OfType<EcoPoint>()
            .ToList();
    }
}
