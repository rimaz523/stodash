using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Stodash.Api.Data;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;

namespace Stodash.Api.Services;

/// <summary>
/// The current user's saved layouts (LAYOUT). The workspace JSON belongs to the frontend; this service only checks
/// its outline (an object with 1 to 4 panels that each name a kind) and its size. Every query is filtered by
/// <see cref="ICurrentUser"/>, like watchlists.
/// </summary>
public sealed class LayoutService(StodashDb db, ICurrentUser user)
{
    public const int MaxLayouts = 20;
    public const int MaxPanels = 4;
    public const int MaxJsonLength = 32_000;

    public async Task<IReadOnlyList<LayoutDto>> GetAllAsync(CancellationToken ct)
    {
        var layouts = await Mine().AsNoTracking().OrderBy(l => l.Name).ToListAsync(ct);
        return layouts.Select(ToDto).ToList();
    }

    public async Task<LayoutDto> CreateAsync(LayoutRequest? body, CancellationToken ct)
    {
        var name = CleanName(body?.Name);
        var json = CheckWorkspace(body?.Workspace);
        if (await Mine().CountAsync(ct) >= MaxLayouts)
            throw new ArgumentException($"You can save up to {MaxLayouts} layouts. Delete one first.");
        await EnsureNameFreeAsync(name, null, ct);

        var now = DateTimeOffset.UtcNow;
        var layout = new SavedLayout { UserId = user.Id, Name = name, WorkspaceJson = json, CreatedAt = now, UpdatedAt = now };
        db.Layouts.Add(layout);
        await SaveAsync(name, ct);
        return ToDto(layout);
    }

    /// <summary>Renames the layout (when a name is given), replaces its workspace (when one is given), or both.</summary>
    public async Task<LayoutDto> UpdateAsync(int id, LayoutRequest? body, CancellationToken ct)
    {
        if (body?.Name is null && body?.Workspace is null)
            throw new ArgumentException("Send a new name, a workspace, or both.");
        var layout = await FindAsync(id, ct);
        if (body.Name is not null)
        {
            var name = CleanName(body.Name);
            await EnsureNameFreeAsync(name, id, ct);
            layout.Name = name;
        }
        if (body.Workspace is not null) layout.WorkspaceJson = CheckWorkspace(body.Workspace);
        layout.UpdatedAt = DateTimeOffset.UtcNow;
        await SaveAsync(layout.Name, ct);
        return ToDto(layout);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        db.Layouts.Remove(await FindAsync(id, ct));
        await db.SaveChangesAsync(ct);
    }

    // -------------------------------------------------------------- helpers

    private IQueryable<SavedLayout> Mine() => db.Layouts.Where(l => l.UserId == user.Id);

    private async Task<SavedLayout> FindAsync(int id, CancellationToken ct) =>
        await Mine().FirstOrDefaultAsync(l => l.Id == id, ct) ?? throw new NotFoundException($"Layout {id} doesn't exist.");

    private async Task EnsureNameFreeAsync(string name, int? exceptId, CancellationToken ct)
    {
        // Case-insensitive under SQL Server's default collation, like watchlist names.
        if (await Mine().AnyAsync(l => l.Name == name && l.Id != exceptId, ct))
            throw new ConflictException($"You already have a layout called \"{name}\".");
    }

    private async Task SaveAsync(string name, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.GetBaseException() is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        {
            // Two saves with the same name raced past the check above; the unique index caught the second.
            throw new ConflictException($"You already have a layout called \"{name}\".");
        }
    }

    private static string CleanName(string? raw)
    {
        var name = string.Join(' ', (raw ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (name.Length == 0) throw new ArgumentException("Give the layout a name.");
        if (name.Length > StodashDb.MaxNameLength)
            throw new ArgumentException($"Layout names can be at most {StodashDb.MaxNameLength} characters.");
        return name;
    }

    /// <summary>The workspace as compact JSON, after checking its outline: {"panels": [{"kind": "...", ...}, ...], ...}.</summary>
    private static string CheckWorkspace(JsonElement? workspace)
    {
        if (workspace is not { ValueKind: JsonValueKind.Object } ws ||
            !ws.TryGetProperty("panels", out var panels) || panels.ValueKind != JsonValueKind.Array)
            throw new ArgumentException("The workspace must be an object with a \"panels\" array.");
        var count = panels.GetArrayLength();
        if (count == 0) throw new ArgumentException("Open at least one panel before saving a layout.");
        if (count > MaxPanels) throw new ArgumentException($"A layout can hold at most {MaxPanels} panels.");
        if (panels.EnumerateArray().Any(p =>
                p.ValueKind != JsonValueKind.Object || !p.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String))
            throw new ArgumentException("Every panel needs a \"kind\".");

        var json = ws.GetRawText();
        if (json.Length > MaxJsonLength) throw new ArgumentException("That workspace is too large to save.");
        return json;
    }

    private static LayoutDto ToDto(SavedLayout l)
    {
        using var doc = JsonDocument.Parse(l.WorkspaceJson);
        return new LayoutDto(l.Id, l.Name, doc.RootElement.Clone(), l.UpdatedAt);
    }
}
