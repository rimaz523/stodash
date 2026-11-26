namespace Stodash.Api.Models;

/// <summary>A point-in-time quote for one instrument.</summary>
public sealed record Quote(
    string Symbol,
    string? Name,
    string? Exchange,
    string? Currency,
    string? QuoteType,
    double? Price,
    double? Change,
    /// <summary>Percent change, e.g. 1.25 means +1.25%.</summary>
    double? ChangePercent,
    double? PreviousClose,
    double? Open,
    double? DayHigh,
    double? DayLow,
    long? Volume,
    double? MarketCap,
    string? MarketState,
    DateTimeOffset? Time,
    string Source);

/// <summary>One OHLCV bar. <see cref="Time"/> is Unix seconds (UTC).</summary>
public sealed record PriceBar(long Time, double Open, double High, double Low, double Close, long Volume);

public sealed record PriceHistory(
    string Symbol,
    string Range,
    string Interval,
    bool Intraday,
    string? Currency,
    string? Timezone,
    double? PreviousClose,
    IReadOnlyList<PriceBar> Bars);

public sealed record CompanyOfficer(string Name, string? Title, int? Age);

public sealed record KeyStats(
    double? MarketCap,
    double? EnterpriseValue,
    double? TrailingPE,
    double? ForwardPE,
    double? PegRatio,
    double? PriceToBook,
    double? TrailingEps,
    double? ForwardEps,
    double? DividendYield,
    double? Beta,
    double? FiftyTwoWeekHigh,
    double? FiftyTwoWeekLow,
    double? FiftyDayAverage,
    double? TwoHundredDayAverage,
    long? AverageVolume,
    long? SharesOutstanding,
    double? TotalRevenue,
    double? RevenueGrowth,
    double? GrossMargin,
    double? OperatingMargin,
    double? ProfitMargin,
    double? ReturnOnEquity,
    double? TotalCash,
    double? TotalDebt,
    double? TargetMeanPrice,
    string? Recommendation)
{
    public static readonly KeyStats Empty = new(null, null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
}

public sealed record CompanyProfile(
    string Symbol,
    string? Name,
    string? Exchange,
    string? Currency,
    string? QuoteType,
    string? Sector,
    string? Industry,
    string? Country,
    string? City,
    string? State,
    string? Website,
    long? Employees,
    string? Summary,
    IReadOnlyList<CompanyOfficer> Officers,
    KeyStats Stats,
    string Source);

public sealed record SearchResult(string Symbol, string? Name, string? Type, string? Exchange);
