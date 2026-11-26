using System.Text.Json;

namespace Stodash.Api.Models;

/// <summary>
/// A saved workspace as the API returns it. <see cref="Workspace"/> is the frontend's own JSON (panels, active panel,
/// panel sizes), stored as is; the frontend validates it again before loading it.
/// </summary>
public sealed record LayoutDto(int Id, string Name, JsonElement Workspace, DateTimeOffset UpdatedAt);

/// <summary>Body for creating a layout (both fields), overwriting one (workspace) or renaming one (name).</summary>
public sealed record LayoutRequest(string? Name, JsonElement? Workspace);
