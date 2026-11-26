using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// Financial statements and ratios (FA). Yahoo's fundamentals-timeseries endpoint comes first, since it covers
/// US and non-US stocks. SEC EDGAR's XBRL company facts are the fallback for US filers.
/// </summary>
public sealed class FinancialsService(
    YahooClient yahoo,
    SecClient sec,
    SecCompanyLookup secLookup,
    MarketDataService market,
    IMarketCache cache,
    ILogger<FinancialsService> log)
{
    /// <summary>
    /// One statement line. <paramref name="Id"/> is Yahoo's series name without its annual/quarterly prefix.
    /// <paramref name="Sec"/> lists us-gaap XBRL tags to try, most common first. <paramref name="SecNegate"/> flips
    /// the sign of outflows that XBRL reports as positive (capex, buybacks, dividends) to match Yahoo.
    /// </summary>
    private sealed record Line(
        string Id, string Label, bool Core = false, bool Total = false, string Unit = "money",
        string[]? Sec = null, bool SecNegate = false);

    private static readonly Line[] IncomeLines =
    [
        new("TotalRevenue", "Revenue", Core: true, Total: true,
            Sec: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenuesNetOfInterestExpense"]),
        new("CostOfRevenue", "Cost of revenue", Core: true, Sec: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"]),
        new("GrossProfit", "Gross profit", Core: true, Total: true, Sec: ["GrossProfit"]),
        new("ResearchAndDevelopment", "Research & development", Core: true, Sec: ["ResearchAndDevelopmentExpense"]),
        new("SellingGeneralAndAdministration", "Selling, general & admin", Core: true, Sec: ["SellingGeneralAndAdministrativeExpense"]),
        new("OperatingExpense", "Total operating expenses", Sec: ["OperatingExpenses"]),
        new("TotalExpenses", "Total expenses", Sec: ["CostsAndExpenses"]),
        new("OperatingIncome", "Operating income", Core: true, Total: true, Sec: ["OperatingIncomeLoss"]),
        new("InterestIncome", "Interest income", Sec: ["InvestmentIncomeInterest"]),
        new("InterestExpense", "Interest expense", Sec: ["InterestExpense"]),
        new("NetInterestIncome", "Net interest income", Sec: ["InterestIncomeExpenseNet"]),
        new("OtherIncomeExpense", "Other income (expense)", Sec: ["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense"]),
        new("PretaxIncome", "Pretax income", Core: true, Total: true,
            Sec: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
                  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"]),
        new("TaxProvision", "Income tax", Core: true, Sec: ["IncomeTaxExpenseBenefit"]),
        new("NetIncome", "Net income", Core: true, Total: true, Sec: ["NetIncomeLoss"]),
        new("NetIncomeCommonStockholders", "Net income to common", Sec: ["NetIncomeLossAvailableToCommonStockholdersBasic"]),
        new("EBIT", "EBIT"),
        new("EBITDA", "EBITDA", Core: true),
        new("NormalizedEBITDA", "Normalized EBITDA"),
        new("ReconciledDepreciation", "Depreciation & amortization"),
        new("BasicEPS", "EPS (basic)", Unit: "perShare", Sec: ["EarningsPerShareBasic"]),
        new("DilutedEPS", "EPS (diluted)", Core: true, Unit: "perShare", Sec: ["EarningsPerShareDiluted"]),
        new("BasicAverageShares", "Average shares (basic)", Unit: "shares", Sec: ["WeightedAverageNumberOfSharesOutstandingBasic"]),
        new("DilutedAverageShares", "Average shares (diluted)", Core: true, Unit: "shares",
            Sec: ["WeightedAverageNumberOfDilutedSharesOutstanding"]),
    ];

    private static readonly Line[] BalanceLines =
    [
        new("CashAndCashEquivalents", "Cash & equivalents", Core: true, Sec: ["CashAndCashEquivalentsAtCarryingValue"]),
        new("OtherShortTermInvestments", "Short-term investments", Sec: ["MarketableSecuritiesCurrent", "ShortTermInvestments"]),
        new("CashCashEquivalentsAndShortTermInvestments", "Cash & short-term investments", Core: true,
            Sec: ["CashCashEquivalentsAndShortTermInvestments"]),
        new("Receivables", "Receivables", Core: true, Sec: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"]),
        new("Inventory", "Inventory", Core: true, Sec: ["InventoryNet"]),
        new("CurrentAssets", "Total current assets", Core: true, Total: true, Sec: ["AssetsCurrent"]),
        new("NetPPE", "Property, plant & equipment", Core: true, Sec: ["PropertyPlantAndEquipmentNet"]),
        new("Goodwill", "Goodwill", Sec: ["Goodwill"]),
        new("GoodwillAndOtherIntangibleAssets", "Goodwill & intangibles"),
        new("TotalNonCurrentAssets", "Total non-current assets", Total: true, Sec: ["AssetsNoncurrent"]),
        new("TotalAssets", "Total assets", Core: true, Total: true, Sec: ["Assets"]),
        new("AccountsPayable", "Accounts payable", Core: true, Sec: ["AccountsPayableCurrent"]),
        new("CurrentDebt", "Current debt", Sec: ["LongTermDebtCurrent", "DebtCurrent"]),
        new("CurrentLiabilities", "Total current liabilities", Core: true, Total: true, Sec: ["LiabilitiesCurrent"]),
        new("LongTermDebt", "Long-term debt", Core: true, Sec: ["LongTermDebtNoncurrent"]),
        new("TotalLiabilitiesNetMinorityInterest", "Total liabilities", Core: true, Total: true, Sec: ["Liabilities"]),
        new("RetainedEarnings", "Retained earnings", Sec: ["RetainedEarningsAccumulatedDeficit"]),
        new("StockholdersEquity", "Shareholders' equity", Core: true, Total: true, Sec: ["StockholdersEquity"]),
        new("TotalEquityGrossMinorityInterest", "Equity incl. minority interest",
            Sec: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]),
        new("TotalDebt", "Total debt", Core: true),
        new("NetDebt", "Net debt"),
        new("WorkingCapital", "Working capital"),
        new("TangibleBookValue", "Tangible book value"),
        new("InvestedCapital", "Invested capital"),
        new("OrdinarySharesNumber", "Shares outstanding", Core: true, Unit: "shares", Sec: ["CommonStockSharesOutstanding"]),
        new("ShareIssued", "Shares issued", Unit: "shares", Sec: ["CommonStockSharesIssued"]),
    ];

    private static readonly Line[] CashFlowLines =
    [
        new("NetIncomeFromContinuingOperations", "Net income", Sec: ["ProfitLoss", "NetIncomeLoss"]),
        new("DepreciationAndAmortization", "Depreciation & amortization", Core: true,
            Sec: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"]),
        new("StockBasedCompensation", "Stock-based compensation", Core: true, Sec: ["ShareBasedCompensation"]),
        new("ChangeInWorkingCapital", "Change in working capital"),
        new("OperatingCashFlow", "Operating cash flow", Core: true, Total: true, Sec: ["NetCashProvidedByUsedInOperatingActivities"]),
        new("CapitalExpenditure", "Capital expenditure", Core: true, Sec: ["PaymentsToAcquirePropertyPlantAndEquipment"], SecNegate: true),
        new("InvestingCashFlow", "Investing cash flow", Core: true, Total: true, Sec: ["NetCashProvidedByUsedInInvestingActivities"]),
        new("IssuanceOfDebt", "Debt issued", Sec: ["ProceedsFromIssuanceOfLongTermDebt"]),
        new("RepaymentOfDebt", "Debt repaid", Sec: ["RepaymentsOfLongTermDebt"], SecNegate: true),
        new("RepurchaseOfCapitalStock", "Share buybacks", Core: true, Sec: ["PaymentsForRepurchaseOfCommonStock"], SecNegate: true),
        new("CashDividendsPaid", "Dividends paid", Core: true, Sec: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], SecNegate: true),
        new("FinancingCashFlow", "Financing cash flow", Core: true, Total: true, Sec: ["NetCashProvidedByUsedInFinancingActivities"]),
        new("ChangesInCash", "Net change in cash",
            Sec: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
                  "CashAndCashEquivalentsPeriodIncreaseDecrease"]),
        new("EndCashPosition", "Cash at end of period", Sec: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]),
        new("FreeCashFlow", "Free cash flow", Core: true, Total: true), // derived from OCF + capex for SEC data
    ];

    private static readonly Line[] AllLines = [.. IncomeLines, .. BalanceLines, .. CashFlowLines];

    /// <summary>A line's values by period end date (yyyy-MM-dd).</summary>
    private sealed class SeriesSet : Dictionary<string, Dictionary<string, double>>;

    public Task<FinancialStatements> GetFinancialsAsync(string rawSymbol, string? rawPeriod, CancellationToken ct)
    {
        var symbol = MarketDataService.NormalizeSymbol(rawSymbol);
        var period = (rawPeriod ?? "").Trim().ToLowerInvariant() switch
        {
            "" or "annual" or "a" => "annual",
            "quarterly" or "q" => "quarterly",
            _ => throw new ArgumentException($"Unknown period '{rawPeriod}'. Use annual or quarterly."),
        };

        return cache.GetOrLoadAsync($"financials:{symbol}:{period}", TimeSpan.FromHours(12), durable: true, load: async () =>
        {
            UpstreamException? failure = null;
            try
            {
                if (await FromYahooAsync(symbol, period, ct) is { } fromYahoo) return fromYahoo;
            }
            catch (UpstreamException ex)
            {
                log.LogWarning("Yahoo fundamentals failed for {Symbol} ({Message}); trying SEC.", symbol, ex.Message);
                failure = ex;
            }

            if (secLookup.IsConfigured)
            {
                try
                {
                    if (await FromSecAsync(symbol, period, ct) is { } fromSec) return fromSec;
                }
                catch (UpstreamException ex)
                {
                    log.LogWarning("SEC company facts failed for {Symbol}: {Message}", symbol, ex.Message);
                    failure ??= ex;
                }
            }

            // Don't cache "no data" if a provider failed: the next request should try again.
            if (failure is not null) throw failure;

            // Unknown tickers throw a 404 here. Indexes, currencies, crypto and funds get an explanation instead.
            var quote = await market.GetQuoteAsync(symbol, ct);
            var kind = quote.QuoteType?.ToUpperInvariant() switch
            {
                "INDEX" => "an index",
                "CURRENCY" => "a currency",
                "CRYPTOCURRENCY" => "a cryptocurrency",
                "FUTURE" => "a futures contract",
                "ETF" => "an ETF",
                "MUTUALFUND" => "a fund",
                _ => null,
            };
            var note = kind is null
                ? $"No financial statements are available for {symbol}."
                : $"{symbol} is {kind}, so it has no financial statements. FA covers individual companies.";
            return new FinancialStatements(symbol, period, quote.Currency, [], [], [], [], [], note, "Yahoo");
        });
    }

    // ------------------------------------------------------------------ Yahoo

    private async Task<FinancialStatements?> FromYahooAsync(string symbol, string period, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var types = AllLines.Select(l => period + l.Id);
        var results = await yahoo.GetFundamentalsAsync(symbol, types, now.AddYears(-10), now, ct);

        var series = new SeriesSet();
        string? currency = null;
        foreach (var result in results)
        {
            var type = result?["meta"]?["type"]?[0] is JsonValue v && v.TryGetValue<string>(out var t) ? t : null;
            if (type is null || !type.StartsWith(period, StringComparison.Ordinal)) continue;
            if (result![type] is not JsonArray points) continue;

            var values = new Dictionary<string, double>();
            foreach (var point in points)
            {
                if (J.Str(point, "asOfDate") is not { } date || J.Num(point?["reportedValue"]) is not { } value) continue;
                values[date] = value;
                currency ??= J.Str(point, "currencyCode");
            }
            if (values.Count > 0) series[type[period.Length..]] = values;
        }

        return series.Count == 0 ? null : Build(symbol, period, currency, series, "Yahoo");
    }

    // -------------------------------------------------------------------- SEC

    private async Task<FinancialStatements?> FromSecAsync(string symbol, string period, CancellationToken ct)
    {
        if (await secLookup.FindAsync(symbol, ct) is not { } company) return null;
        var facts = await sec.GetCompanyFactsAsync(company.Cik, ct);
        if (facts?["facts"]?["us-gaap"] is not JsonObject gaap) return null;

        var series = new SeriesSet();
        string? currency = null;
        foreach (var line in AllLines)
        {
            if (line.Sec is null) continue;

            // Companies switch tags over the years (SalesRevenueNet → RevenueFromContract...). Merge them,
            // letting the tag with the most recent data win any date both report.
            var perTag = line.Sec
                .Select(tag => ReadTag(gaap[tag], line.Unit, period))
                .Where(r => r.Values.Count > 0)
                .OrderByDescending(r => r.Values.Keys.Max())
                .ToList();
            if (perTag.Count == 0) continue;

            var merged = new Dictionary<string, double>();
            foreach (var (values, unit) in perTag)
            {
                foreach (var (date, value) in values)
                    merged.TryAdd(date, line.SecNegate ? -value : value);
                if (line.Unit == "money") currency ??= unit;
            }
            series[line.Id] = merged;
        }

        // XBRL has no free cash flow tag; derive it like Yahoo does (capex is already negative).
        if (series.GetValueOrDefault("OperatingCashFlow") is { } ocf && series.GetValueOrDefault("CapitalExpenditure") is { } capex)
            series["FreeCashFlow"] = ocf.Keys.Where(capex.ContainsKey).ToDictionary(d => d, d => ocf[d] + capex[d]);

        return series.Count == 0 ? null : Build(symbol, period, currency, series, "SEC EDGAR");
    }

    /// <summary>
    /// The values one XBRL tag reported for the wanted period type, by end date, keeping the most recently
    /// filed figure when a later filing restates a number.
    /// </summary>
    private static (Dictionary<string, double> Values, string? Unit) ReadTag(JsonNode? tag, string unitKind, string period)
    {
        var byDate = new Dictionary<string, (double Value, string Filed)>();
        if (tag?["units"] is not JsonObject units) return ([], null);

        var (unit, points) = units.FirstOrDefault(u => unitKind switch
        {
            "perShare" => u.Key.EndsWith("/shares", StringComparison.Ordinal),
            "shares" => u.Key == "shares",
            _ => !u.Key.Contains('/') && u.Key != "shares" && u.Key != "pure",
        });
        if (points is not JsonArray list) return ([], null);

        foreach (var p in list)
        {
            var form = J.Str(p, "form");
            if (form is null || !(form.StartsWith("10-K", StringComparison.Ordinal) || form.StartsWith("10-Q", StringComparison.Ordinal)))
                continue;
            if (J.Str(p, "end") is not { } end || J.Num(p, "val") is not { } value) continue;

            if (J.Str(p, "start") is { } start)
            {
                // A flow (income or cash flow): keep only full years or single quarters, not 6- or 9-month YTD sums.
                if (!DateOnly.TryParse(start, out var s) || !DateOnly.TryParse(end, out var e)) continue;
                var days = e.DayNumber - s.DayNumber;
                var fits = period == "annual" ? days is >= 340 and <= 390 : days is >= 80 and <= 100;
                if (!fits) continue;
            }
            else if (period == "annual" && !form.StartsWith("10-K", StringComparison.Ordinal))
            {
                continue; // a balance at a quarter end, not a fiscal year end
            }

            var filed = J.Str(p, "filed") ?? "";
            if (!byDate.TryGetValue(end, out var existing) || string.CompareOrdinal(filed, existing.Filed) > 0)
                byDate[end] = (value, filed);
        }
        return (byDate.ToDictionary(kv => kv.Key, kv => kv.Value.Value), unit);
    }

    // ------------------------------------------------------------ assembling

    private static FinancialStatements Build(string symbol, string period, string? currency, SeriesSet series, string source)
    {
        // Columns are the dates at least half as many lines report as the best-covered date. That drops sparse
        // dates such as a prior-year comparative that only a few lines carry.
        var counts = series.Values.SelectMany(v => v.Keys).GroupBy(d => d).ToDictionary(g => g.Key, g => g.Count());
        var best = counts.Count == 0 ? 0 : counts.Values.Max();
        var periods = counts
            .Where(kv => kv.Value * 2 >= best)
            .Select(kv => kv.Key)
            .OrderDescending()
            .Take(period == "annual" ? 5 : 6)
            .ToList();

        List<StatementRow> Rows(Line[] lines) => lines
            .Select(l => series.TryGetValue(l.Id, out var values)
                ? new StatementRow(l.Id, l.Label, l.Unit, l.Core, l.Total,
                    periods.Select(d => values.TryGetValue(d, out var x) ? x : (double?)null).ToList())
                : null)
            .OfType<StatementRow>()
            .Where(r => r.Values.Any(v => v is not null))
            .ToList();

        return new FinancialStatements(symbol, period, currency, periods,
            Rows(IncomeLines), Rows(BalanceLines), Rows(CashFlowLines), Ratios(series, periods, period), null, source);
    }

    private static List<StatementRow> Ratios(SeriesSet series, List<string> periods, string period)
    {
        double? Get(string id, int i) =>
            i < periods.Count && series.TryGetValue(id, out var v) && v.TryGetValue(periods[i], out var x) ? x : null;
        static double? Div(double? a, double? b) => a is { } x && b is { } y && y != 0 ? x / y : null;
        static double? DivPositive(double? a, double? b) => b is > 0 ? Div(a, b) : null;

        // ROE and ROA from a single quarter are annualized so they compare with annual figures.
        var annualize = period == "quarterly" ? 4 : 1;
        var defs = new (string Id, string Label, string Unit, Func<int, double?> At)[]
        {
            ("GrossMargin", "Gross margin", "fraction", i => Div(Get("GrossProfit", i), Get("TotalRevenue", i))),
            ("OperatingMargin", "Operating margin", "fraction", i => Div(Get("OperatingIncome", i), Get("TotalRevenue", i))),
            ("NetMargin", "Net margin", "fraction", i => Div(Get("NetIncome", i), Get("TotalRevenue", i))),
            // Banks and insurers report no operating income, and their cash flow swings with lending and deposits,
            // so an FCF margin would be noise (e.g. -425% one quarter, +261% the next). Show it for other companies only.
            ("FcfMargin", "Free cash flow margin", "fraction", i => series.ContainsKey("OperatingIncome")
                ? Div(Get("FreeCashFlow", i), Get("TotalRevenue", i))
                : null),
            ("RevenueGrowth", period == "annual" ? "Revenue growth (YoY)" : "Revenue growth (QoQ)", "fraction",
                i => Div(Get("TotalRevenue", i), Get("TotalRevenue", i + 1)) - 1),
            ("ReturnOnEquity", period == "annual" ? "Return on equity" : "Return on equity (annualized)", "fraction",
                i => DivPositive(Get("NetIncome", i), Get("StockholdersEquity", i)) * annualize),
            ("ReturnOnAssets", period == "annual" ? "Return on assets" : "Return on assets (annualized)", "fraction",
                i => DivPositive(Get("NetIncome", i), Get("TotalAssets", i)) * annualize),
            ("DebtToEquity", "Debt / equity", "multiple", i => DivPositive(Get("TotalDebt", i), Get("StockholdersEquity", i))),
            ("CurrentRatio", "Current ratio", "multiple", i => Div(Get("CurrentAssets", i), Get("CurrentLiabilities", i))),
        };

        return defs
            .Select(d => new StatementRow(d.Id, d.Label, d.Unit, true, false,
                Enumerable.Range(0, periods.Count).Select(d.At).ToList()))
            .Where(r => r.Values.Any(v => v is not null))
            .ToList();
    }
}
