namespace Stodash.Api.Models;

// ------------------------------------------------------------------------ EQS

/// <summary>One stock in the screener universe with its latest price and valuation numbers.</summary>
public sealed record ScreenerRow(
    /// <summary>Yahoo's form of the ticker: BRK-B, not BRK.B.</summary>
    string Symbol,
    string Name,
    /// <summary>GICS sector, e.g. "Information Technology".</summary>
    string Sector,
    string? Industry,
    double? Price,
    /// <summary>Percent change today, e.g. 1.25 means +1.25%.</summary>
    double? ChangePercent,
    double? MarketCap,
    double? TrailingPE,
    double? ForwardPE,
    double? PriceToBook,
    /// <summary>A fraction: 0.015 means 1.5%.</summary>
    double? DividendYield,
    double? FiftyTwoWeekHigh,
    double? FiftyTwoWeekLow,
    long? Volume);

/// <summary>Everything the screener filters over: the universe with prices, rebuilt in the background.</summary>
public sealed record ScreenerSnapshot(
    string Universe,
    DateTimeOffset UniverseAsOf,
    DateTimeOffset PricesAsOf,
    IReadOnlyList<ScreenerRow> Rows,
    string Source);

public sealed record SectorCount(string Sector, int Count);

/// <summary>What <c>GET /api/screener</c> filters by. Nulls mean "no limit". Market caps in dollars, changes in percent.</summary>
public sealed record ScreenerQuery(
    string? Sector,
    double? MinCap,
    double? MaxCap,
    double? MinPe,
    double? MaxPe,
    double? MinChange,
    double? MaxChange,
    string? Sort,
    bool? Desc,
    int? Limit);

public sealed record ScreenerResult(
    string Universe,
    /// <summary>Stocks in the universe.</summary>
    int Total,
    /// <summary>Stocks that pass the filters. <see cref="Rows"/> holds at most <c>limit</c> of them.</summary>
    int Matched,
    IReadOnlyList<ScreenerRow> Rows,
    /// <summary>Every sector in the universe with its size, for the sector picker.</summary>
    IReadOnlyList<SectorCount> Sectors,
    DateTimeOffset UniverseAsOf,
    DateTimeOffset PricesAsOf,
    /// <summary>True while newer prices are being fetched in the background.</summary>
    bool Refreshing,
    string Source);
