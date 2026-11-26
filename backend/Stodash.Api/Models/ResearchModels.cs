namespace Stodash.Api.Models;

// ------------------------------------------------------------------------- FA

/// <summary>
/// One line of a statement or ratio table. <see cref="Values"/> lines up with <see cref="FinancialStatements.Periods"/>.
/// <see cref="Unit"/> says how to read the numbers:
/// "money" (in the statement currency), "perShare" (currency per share), "shares" (a share count),
/// "fraction" (0.25 means 25%) or "multiple" (a plain ratio such as 1.8 for debt/equity).
/// </summary>
public sealed record StatementRow(
    string Id,
    string Label,
    string Unit,
    /// <summary>One of the ~15 key rows shown by default. The rest appear when the panel is expanded.</summary>
    bool Core,
    /// <summary>A subtotal or total, shown in bold.</summary>
    bool Total,
    IReadOnlyList<double?> Values);

public sealed record FinancialStatements(
    string Symbol,
    /// <summary>"annual" or "quarterly".</summary>
    string Period,
    string? Currency,
    /// <summary>Period end dates (yyyy-MM-dd), newest first.</summary>
    IReadOnlyList<string> Periods,
    IReadOnlyList<StatementRow> Income,
    IReadOnlyList<StatementRow> Balance,
    IReadOnlyList<StatementRow> CashFlow,
    IReadOnlyList<StatementRow> Ratios,
    /// <summary>Why there's nothing to show, e.g. for an index, currency or crypto. Null when there is data.</summary>
    string? Note,
    string Source);

// -------------------------------------------------------------------------- N

public sealed record NewsItem(
    string Headline,
    /// <summary>Always an absolute http(s) link.</summary>
    string Url,
    string? Source,
    DateTimeOffset Published,
    string? Summary,
    IReadOnlyList<string> Tickers,
    string Provider);

public sealed record NewsFeed(string Symbol, IReadOnlyList<NewsItem> Items, IReadOnlyList<string> Providers);

// ------------------------------------------------------------------------ TOP

/// <summary>
/// Market headlines from several RSS feeds plus Finnhub's general news. Each item's <see cref="NewsItem.Provider"/> names
/// the feed it came from ("CNBC", "Finnhub", ...), which the panel filters on.
/// </summary>
public sealed record TopNewsFeed(
    IReadOnlyList<NewsItem> Items,
    /// <summary>Feeds that answered.</summary>
    IReadOnlyList<string> Providers,
    /// <summary>Feeds that failed this time. Their headlines are missing until they answer again.</summary>
    IReadOnlyList<string> Failed,
    DateTimeOffset AsOf);

// ------------------------------------------------------------------------- CF

public sealed record Filing(
    string Form,
    /// <summary>"annual", "quarterly", "current", "proxy", "insider" or "other". Drives the panel's filter chips.</summary>
    string Category,
    /// <summary>yyyy-MM-dd</summary>
    string FilingDate,
    /// <summary>The period the filing covers (yyyy-MM-dd), when there is one.</summary>
    string? ReportDate,
    string Description,
    /// <summary>The filing's main document on sec.gov.</summary>
    string Url,
    /// <summary>The filing's index page on sec.gov, listing every document and exhibit.</summary>
    string IndexUrl,
    string AccessionNumber);

public sealed record FilingList(
    string Symbol,
    long? Cik,
    string? Company,
    /// <summary>Newest first.</summary>
    IReadOnlyList<Filing> Items,
    /// <summary>Why there are no filings (e.g. a non-US listing). Null when the company is on EDGAR.</summary>
    string? Note,
    string Source);
