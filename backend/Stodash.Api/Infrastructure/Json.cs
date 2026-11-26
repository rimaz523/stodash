using System.Text.Json.Nodes;

namespace Stodash.Api.Infrastructure;

/// <summary>
/// Lenient readers for provider JSON. Yahoo wraps many numbers as {"raw": 1.2, "fmt": "1.20"}
/// and uses {} for "no value", so every reader here returns null rather than throwing.
/// </summary>
public static class J
{
    public static double? Num(JsonNode? node) => node switch
    {
        JsonValue v when v.TryGetValue<double>(out var d) && double.IsFinite(d) => d,
        JsonObject o when o["raw"] is JsonValue raw && raw.TryGetValue<double>(out var r) && double.IsFinite(r) => r,
        _ => null,
    };

    public static double? Num(JsonNode? parent, string key) => Num(parent?[key]);

    public static long? Long(JsonNode? parent, string key) =>
        Num(parent, key) is { } d ? (long)Math.Round(d) : null;

    public static int? Int(JsonNode? parent, string key) =>
        Num(parent, key) is { } d ? (int)Math.Round(d) : null;

    public static string? Str(JsonNode? parent, string key) => parent?[key] switch
    {
        JsonValue v when v.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) => s,
        JsonObject o when o["fmt"] is JsonValue f && f.TryGetValue<string>(out var s) => s,
        _ => null,
    };

    public static string? FirstStr(JsonNode? parent, params string[] keys)
    {
        foreach (var key in keys)
            if (Str(parent, key) is { } s) return s;
        return null;
    }
}
