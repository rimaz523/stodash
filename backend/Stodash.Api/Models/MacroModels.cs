namespace Stodash.Api.Models;

// ------------------------------------------------------------------------ ECO

/// <summary>One observation. <see cref="Date"/> is yyyy-MM-dd.</summary>
public sealed record EcoPoint(string Date, double Value);

/// <summary>
/// A dashboard tile. <see cref="Unit"/> says how to read the values: "percent" (4.2 means 4.2%),
/// "points" (percentage points, e.g. the 10Y–2Y spread), "count" (e.g. jobless claims) or "index".
/// </summary>
public sealed record EcoIndicator(
    string Id,
    string Label,
    string SeriesId,
    string Unit,
    string Frequency,
    string Description,
    double? Latest,
    double? Previous,
    /// <summary>Latest minus previous, in the indicator's unit.</summary>
    double? Change,
    string? LatestDate,
    /// <summary>About two years of points for the tile's small chart.</summary>
    IReadOnlyList<EcoPoint> Sparkline);

public sealed record EcoDashboard(
    bool Configured,
    /// <summary>Why the dashboard is empty, e.g. no FRED key. Null when there is data.</summary>
    string? Note,
    IReadOnlyList<EcoIndicator> Indicators,
    string Source);

public sealed record EcoSeries(
    string Id, string Label, string SeriesId, string Unit, string Frequency, string Description, string Range,
    IReadOnlyList<EcoPoint> Points, string Source);

// ------------------------------------------------------------------------- YC

/// <summary>A point on the curve, e.g. "2Y" = 24 months.</summary>
public sealed record YieldMaturity(string Label, double Months);

/// <summary>One curve. <see cref="Yields"/> are percents (4.25 means 4.25%) and line up with the maturities.</summary>
public sealed record YieldCurveLine(string Label, string Date, IReadOnlyList<double?> Yields);

/// <summary>A spread between two maturities in basis points (100 bp = 1 percentage point). Negative means inverted.</summary>
public sealed record YieldSpread(string Label, double? Bp);

public sealed record YieldCurve(
    IReadOnlyList<YieldMaturity> Maturities,
    /// <summary>Latest, about 1 month ago, about 1 year ago.</summary>
    IReadOnlyList<YieldCurveLine> Curves,
    IReadOnlyList<YieldSpread> Spreads,
    string Source);

// ------------------------------------------------------------------------- FX

/// <summary>
/// A currency pair in market convention: 1 <see cref="Base"/> = <see cref="Rate"/> <see cref="Quote"/>.
/// <see cref="ChangePercent"/> is a percent (0.25 means +0.25%). <see cref="Source"/> is "Yahoo" or "ECB" (daily reference rate).
/// </summary>
public sealed record FxPair(
    string Pair, string Base, string Quote, string Symbol,
    double? Rate, double? Change, double? ChangePercent, string Source, DateTimeOffset? Time);

public sealed record FxBoard(
    IReadOnlyList<FxPair> Pairs,
    IReadOnlyList<string> Currencies,
    /// <summary>Matrix[i][j] = how many units of Currencies[j] one unit of Currencies[i] buys.</summary>
    IReadOnlyList<IReadOnlyList<double?>> Matrix);

// --------------------------------------------------------------------- CRYPTO

/// <summary>Change24h and Change7d are percents (3.2 means +3.2%). Prices are in USD.</summary>
public sealed record CryptoCoin(
    int Rank, string Id, string Symbol, string Name,
    double? Price, double? Change24h, double? Change7d, double? MarketCap, double? Volume24h,
    /// <summary>About 7 days of prices for the row's small chart.</summary>
    IReadOnlyList<double> Sparkline,
    /// <summary>The Yahoo ticker for charting, e.g. BTC-USD.</summary>
    string YahooSymbol);

public sealed record CryptoBoard(IReadOnlyList<CryptoCoin> Coins, string Source, DateTimeOffset AsOf);
