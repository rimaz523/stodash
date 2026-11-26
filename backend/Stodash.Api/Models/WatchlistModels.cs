namespace Stodash.Api.Models;

/// <summary>A watchlist as the API returns it. <see cref="Symbols"/> are in the user's chosen order.</summary>
public sealed record WatchlistDto(int Id, string Name, IReadOnlyList<string> Symbols);

public sealed record WatchlistNameRequest(string? Name);

public sealed record WatchlistSymbolRequest(string? Symbol);

public sealed record WatchlistOrderRequest(IReadOnlyList<string>? Symbols);
