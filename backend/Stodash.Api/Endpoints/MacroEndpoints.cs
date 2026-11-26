using Stodash.Api.Services;

namespace Stodash.Api.Endpoints;

/// <summary>Market-wide functions (ECO, YC, FX, CRYPTO) under /api, plus the live quote stream at /ws/quotes.</summary>
public static class MacroEndpoints
{
    public static IEndpointRouteBuilder MapMacroEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").WithTags("Macro");

        api.MapGet("/eco", (EcoService svc, CancellationToken ct) => svc.GetDashboardAsync(ct))
            .WithSummary("ECO: nine US indicators from FRED. Configured=false with a note when there's no FRED key.");

        api.MapGet("/eco/{id}", (string id, string? range, EcoService svc, CancellationToken ct) => svc.GetSeriesAsync(id, range, ct))
            .WithSummary($"One indicator's history. id = {string.Join(" | ", EcoService.Ids)}; range = {string.Join(" | ", EcoService.Ranges)}.");

        api.MapGet("/yieldcurve", (YieldCurveService svc, CancellationToken ct) => svc.GetAsync(ct))
            .WithSummary("YC: US Treasury par yield curve now, about 1 month ago and about 1 year ago.");

        api.MapGet("/fx", (FxService svc, CancellationToken ct) => svc.GetAsync(ct))
            .WithSummary("FX: eight major pairs against USD and a cross-rate matrix.");

        api.MapGet("/crypto", (CryptoService svc, CancellationToken ct) => svc.GetAsync(ct))
            .WithSummary($"CRYPTO: top {CryptoService.Count} coins by market cap.");

        // Browsers connect here for live watchlist prices; see QuoteStream for the message format.
        app.Map("/ws/quotes", async (HttpContext ctx, QuoteStream stream) =>
        {
            if (!ctx.WebSockets.IsWebSocketRequest)
            {
                ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }
            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            await stream.HandleClientAsync(ws, ctx.RequestAborted);
        });

        return app;
    }
}
