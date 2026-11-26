using Stodash.Api.Models;
using Stodash.Api.Services;

namespace Stodash.Api.Endpoints;

/// <summary>The current user's named watchlists (W), under /api/watchlists.</summary>
public static class WatchlistEndpoints
{
    public static IEndpointRouteBuilder MapWatchlistEndpoints(this IEndpointRouteBuilder app)
    {
        var lists = app.MapGroup("/api/watchlists").WithTags("Watchlists");

        lists.MapGet("/", (WatchlistService svc, CancellationToken ct) => svc.GetAllAsync(ct))
            .WithSummary("Your watchlists with their symbols. A first visit creates \"Main\" with the Magnificent 7.");

        lists.MapPost("/", async (WatchlistNameRequest body, WatchlistService svc, CancellationToken ct) =>
            {
                var created = await svc.CreateAsync(body.Name, ct);
                return Results.Created($"/api/watchlists/{created.Id}", created);
            })
            .WithSummary("Create a watchlist: {\"name\": \"Tech\"}. 409 if the name is taken.");

        lists.MapPatch("/{id:int}", (int id, WatchlistNameRequest body, WatchlistService svc, CancellationToken ct) =>
                svc.RenameAsync(id, body.Name, ct))
            .WithSummary("Rename a watchlist.");

        lists.MapDelete("/{id:int}", async (int id, WatchlistService svc, CancellationToken ct) =>
            {
                await svc.DeleteAsync(id, ct);
                return Results.NoContent();
            })
            .WithSummary("Delete a watchlist. The last one can't be deleted.");

        lists.MapPost("/{id:int}/items", (int id, WatchlistSymbolRequest body, WatchlistService svc, CancellationToken ct) =>
                svc.AddSymbolAsync(id, body.Symbol, ct))
            .WithSummary("Add a symbol: {\"symbol\": \"NVDA\"}. 404 for unknown tickers, 409 if already there.");

        lists.MapDelete("/{id:int}/items/{symbol}", (int id, string symbol, WatchlistService svc, CancellationToken ct) =>
                svc.RemoveSymbolAsync(id, symbol, ct))
            .WithSummary("Remove a symbol.");

        lists.MapPut("/{id:int}/order", (int id, WatchlistOrderRequest body, WatchlistService svc, CancellationToken ct) =>
                svc.ReorderAsync(id, body.Symbols, ct))
            .WithSummary("Reorder: {\"symbols\": [...]} with every symbol in the list exactly once.");

        lists.MapGet("/{id:int}/quotes", (int id, WatchlistService svc, CancellationToken ct) => svc.GetQuotesAsync(id, ct))
            .WithSummary("Quotes for every symbol in the list, in order. Symbols that fail are left out.");

        return app;
    }
}
