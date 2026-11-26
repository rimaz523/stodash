using Stodash.Api.Models;
using Stodash.Api.Services;

namespace Stodash.Api.Endpoints;

/// <summary>The current user's saved layouts (LAYOUT), under /api/layouts.</summary>
public static class LayoutEndpoints
{
    public static IEndpointRouteBuilder MapLayoutEndpoints(this IEndpointRouteBuilder app)
    {
        var layouts = app.MapGroup("/api/layouts").WithTags("Layouts");

        layouts.MapGet("/", (LayoutService svc, CancellationToken ct) => svc.GetAllAsync(ct))
            .WithSummary("Your saved layouts, by name.");

        layouts.MapPost("/", async (LayoutRequest body, LayoutService svc, CancellationToken ct) =>
            {
                var created = await svc.CreateAsync(body, ct);
                return Results.Created($"/api/layouts/{created.Id}", created);
            })
            .WithSummary("Save a layout: {\"name\": \"Morning\", \"workspace\": {\"panels\": [...], ...}}. 409 if the name is taken.");

        layouts.MapPatch("/{id:int}", (int id, LayoutRequest body, LayoutService svc, CancellationToken ct) =>
                svc.UpdateAsync(id, body, ct))
            .WithSummary("Rename a layout ({\"name\"}), replace its panels ({\"workspace\"}), or both.");

        layouts.MapDelete("/{id:int}", async (int id, LayoutService svc, CancellationToken ct) =>
            {
                await svc.DeleteAsync(id, ct);
                return Results.NoContent();
            })
            .WithSummary("Delete a layout.");

        return app;
    }
}
