using System.Net;
using Stodash.Api.Infrastructure;

namespace Stodash.Api.Providers;

/// <summary>
/// The shared GET used by the smaller providers (FRED, Treasury, CoinGecko, Frankfurter): maps transport failures,
/// timeouts, 429s and 5xx to <see cref="UpstreamException"/> and records the outcome in <see cref="ProviderHealth"/>.
/// </summary>
public static class ProviderHttp
{
    /// <summary>Returns the status and body. Non-2xx statuses below 500 (other than 429) are returned for the caller to read.</summary>
    public static async Task<(HttpStatusCode Status, string Body)> GetAsync(
        HttpClient http, string url, string provider, string displayName, ProviderHealth health, CancellationToken ct,
        Action<HttpRequestMessage>? configure = null)
    {
        HttpResponseMessage resp;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            configure?.Invoke(req);
            resp = await http.SendAsync(req, ct);
        }
        catch (HttpRequestException ex) { throw Fail($"Could not reach {displayName}.", ex); }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw Fail($"{displayName} timed out.", ex); }

        using (resp)
        {
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
                throw Fail($"{displayName} is rate-limiting requests; try again shortly.");
            if ((int)resp.StatusCode >= 500)
                throw Fail($"{displayName} returned {(int)resp.StatusCode}.");

            var body = await resp.Content.ReadAsStringAsync(ct);
            health.Ok(provider);
            return (resp.StatusCode, body);
        }

        UpstreamException Fail(string message, Exception? inner = null)
        {
            health.Fail(provider, message);
            return new UpstreamException(message, inner);
        }
    }
}
