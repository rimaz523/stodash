using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// The one place the API gets market data from. Picks a provider, falls back when it fails,
/// maps provider JSON into our models and caches results so we stay inside free-tier limits.
/// </summary>
public sealed partial class MarketDataService(
    YahooClient yahoo,
    FinnhubClient finnhub,
    IMarketCache cache,
    ILogger<MarketDataService> log)
{
    private sealed record RangeSpec(string YahooRange, string Interval, bool Intraday, TimeSpan Ttl);

    private static readonly Dictionary<string, RangeSpec> Ranges = new(StringComparer.OrdinalIgnoreCase)
    {
        ["1D"] = new("1d", "5m", true, TimeSpan.FromMinutes(1)),
        ["5D"] = new("5d", "15m", true, TimeSpan.FromMinutes(2)),
        ["1M"] = new("1mo", "60m", true, TimeSpan.FromMinutes(5)),
        ["3M"] = new("3mo", "1d", false, TimeSpan.FromMinutes(15)),
        ["6M"] = new("6mo", "1d", false, TimeSpan.FromMinutes(15)),
        ["YTD"] = new("ytd", "1d", false, TimeSpan.FromMinutes(15)),
        ["1Y"] = new("1y", "1d", false, TimeSpan.FromMinutes(30)),
        ["5Y"] = new("5y", "1wk", false, TimeSpan.FromHours(6)),
        ["MAX"] = new("max", "1mo", false, TimeSpan.FromHours(12)),
    };

    public static IReadOnlyCollection<string> SupportedRanges => Ranges.Keys;

    // Letters, digits and the punctuation Yahoo uses: BRK-B, ^GSPC, EURUSD=X, RY.TO, BTC-USD.
    [GeneratedRegex(@"^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$")]
    private static partial Regex SymbolPattern();

    public static string NormalizeSymbol(string? raw)
    {
        var symbol = (raw ?? "").Trim().ToUpperInvariant();
        if (!SymbolPattern().IsMatch(symbol))
            throw new ArgumentException($"'{raw}' is not a valid ticker symbol.");
        return symbol;
    }

    // ---------------------------------------------------------------- quote

    public Task<Quote> GetQuoteAsync(string rawSymbol, CancellationToken ct)
    {
        var symbol = NormalizeSymbol(rawSymbol);
        return Cached($"quote:{symbol}", TimeSpan.FromSeconds(15), async () =>
        {
            try
            {
                var summary = await yahoo.GetQuoteSummaryAsync(symbol, "price", ct);
                return MapQuote(symbol, summary["price"]);
            }
            catch (UpstreamException ex)
            {
                log.LogWarning("Yahoo quoteSummary failed for {Symbol} ({Message}); trying chart meta.", symbol, ex.Message);
            }

            try
            {
                var chart = await yahoo.GetChartAsync(symbol, "1d", "5m", ct);
                return QuoteFromChart(symbol, chart);
            }
            catch (UpstreamException) when (finnhub.IsConfigured)
            {
                return await finnhub.GetQuoteAsync(symbol, ct);
            }
        });
    }

    /// <summary>Quotes for several symbols at once. Symbols that fail are left out rather than failing the batch.</summary>
    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(string? rawSymbols, CancellationToken ct)
    {
        var symbols = (rawSymbols ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeSymbol)
            .Distinct()
            .ToList();
        if (symbols.Count == 0) throw new ArgumentException("Pass at least one symbol, e.g. ?symbols=AAPL,MSFT.");
        if (symbols.Count > 20) throw new ArgumentException("At most 20 symbols per request.");
        return await GetQuotesAsync(symbols, ct);
    }

    /// <summary>Quotes for already-validated symbols, in the same order, with no count limit (watchlists, FX).</summary>
    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(IReadOnlyList<string> symbols, CancellationToken ct)
    {
        var tasks = symbols.Select(async s =>
        {
            try { return await GetQuoteAsync(s, ct); }
            catch (Exception ex) when (ex is SymbolNotFoundException or UpstreamException)
            {
                log.LogDebug("Batch quote skipped {Symbol}: {Message}", s, ex.Message);
                return null;
            }
        });
        return (await Task.WhenAll(tasks)).OfType<Quote>().ToList();
    }

    private static Quote MapQuote(string symbol, JsonNode? p)
    {
        if (p is null) throw new SymbolNotFoundException(symbol);
        var price = J.Num(p, "regularMarketPrice");
        if (price is null) throw new SymbolNotFoundException(symbol);

        var time = J.Long(p, "regularMarketTime") is { } t ? DateTimeOffset.FromUnixTimeSeconds(t) : (DateTimeOffset?)null;
        return new Quote(
            Symbol: J.Str(p, "symbol") ?? symbol,
            Name: J.FirstStr(p, "longName", "shortName"),
            Exchange: J.FirstStr(p, "exchangeName", "exchange"),
            Currency: J.Str(p, "currency"),
            QuoteType: J.Str(p, "quoteType"),
            Price: price,
            Change: J.Num(p, "regularMarketChange"),
            ChangePercent: J.Num(p, "regularMarketChangePercent") * 100, // Yahoo gives a fraction here
            PreviousClose: J.Num(p, "regularMarketPreviousClose"),
            Open: J.Num(p, "regularMarketOpen"),
            DayHigh: J.Num(p, "regularMarketDayHigh"),
            DayLow: J.Num(p, "regularMarketDayLow"),
            Volume: J.Long(p, "regularMarketVolume"),
            MarketCap: J.Num(p, "marketCap"),
            MarketState: J.Str(p, "marketState"),
            Time: time,
            Source: "Yahoo");
    }

    private static Quote QuoteFromChart(string symbol, JsonObject chart)
    {
        var meta = chart["meta"];
        var price = J.Num(meta, "regularMarketPrice") ?? throw new SymbolNotFoundException(symbol);
        var prev = J.Num(meta, "chartPreviousClose") ?? J.Num(meta, "previousClose");
        var firstOpen = chart["indicators"]?["quote"]?[0]?["open"] is JsonArray opens
            ? opens.Select(J.Num).FirstOrDefault(o => o is not null)
            : null;
        var time = J.Long(meta, "regularMarketTime") is { } t ? DateTimeOffset.FromUnixTimeSeconds(t) : (DateTimeOffset?)null;

        return new Quote(symbol, J.FirstStr(meta, "longName", "shortName"), J.Str(meta, "fullExchangeName"),
            J.Str(meta, "currency"), J.Str(meta, "instrumentType"), price,
            prev is { } pc ? price - pc : null,
            prev is { } pc2 && pc2 != 0 ? (price - pc2) / pc2 * 100 : null,
            prev, firstOpen, J.Num(meta, "regularMarketDayHigh"), J.Num(meta, "regularMarketDayLow"),
            J.Long(meta, "regularMarketVolume"), null, null, time, "Yahoo (chart)");
    }

    // -------------------------------------------------------------- history

    public Task<PriceHistory> GetHistoryAsync(string rawSymbol, string? rawRange, CancellationToken ct)
    {
        var symbol = NormalizeSymbol(rawSymbol);
        var range = string.IsNullOrWhiteSpace(rawRange) ? "6M" : rawRange.Trim().ToUpperInvariant();
        if (!Ranges.TryGetValue(range, out var spec))
            throw new ArgumentException($"Unknown range '{rawRange}'. Use one of: {string.Join(", ", Ranges.Keys)}.");

        // Daily and longer bars change slowly, so they're kept across restarts; intraday bars stay in memory.
        return Cached($"history:{symbol}:{range}", spec.Ttl, durable: !spec.Intraday, load: async () =>
        {
            var chart = await yahoo.GetChartAsync(symbol, spec.YahooRange, spec.Interval, ct);
            var meta = chart["meta"];
            var timestamps = chart["timestamp"] as JsonArray ?? [];
            var q = chart["indicators"]?["quote"]?[0];
            var opens = q?["open"] as JsonArray;
            var highs = q?["high"] as JsonArray;
            var lows = q?["low"] as JsonArray;
            var closes = q?["close"] as JsonArray;
            var volumes = q?["volume"] as JsonArray;

            var bars = new List<PriceBar>(timestamps.Count);
            long lastTime = long.MinValue;
            for (var i = 0; i < timestamps.Count; i++)
            {
                // Yahoo leaves nulls in the arrays for halted or empty intervals; skip those bars.
                if (J.Num(timestamps[i]) is not { } ts ||
                    J.Num(opens?[i]) is not { } o || J.Num(highs?[i]) is not { } h ||
                    J.Num(lows?[i]) is not { } l || J.Num(closes?[i]) is not { } c)
                    continue;

                var time = (long)ts;
                if (time <= lastTime) continue; // charts need strictly increasing time
                lastTime = time;
                bars.Add(new PriceBar(time, o, h, l, c, (long)(J.Num(volumes?[i]) ?? 0)));
            }

            return new PriceHistory(symbol, range, spec.Interval, spec.Intraday, J.Str(meta, "currency"),
                J.Str(meta, "exchangeTimezoneName"), J.Num(meta, "chartPreviousClose"), bars);
        });
    }

    // -------------------------------------------------------------- profile

    private const string ProfileModules =
        "price,assetProfile,summaryProfile,summaryDetail,defaultKeyStatistics,financialData";

    public Task<CompanyProfile> GetProfileAsync(string rawSymbol, CancellationToken ct)
    {
        var symbol = NormalizeSymbol(rawSymbol);
        return Cached($"profile:{symbol}", TimeSpan.FromHours(6), durable: true, load: async () =>
        {
            try
            {
                var summary = await yahoo.GetQuoteSummaryAsync(symbol, ProfileModules, ct);
                return MapProfile(symbol, summary);
            }
            catch (UpstreamException ex) when (finnhub.IsConfigured)
            {
                log.LogWarning("Yahoo profile failed for {Symbol} ({Message}); using Finnhub.", symbol, ex.Message);
                return await finnhub.GetProfileAsync(symbol, ct);
            }
        });
    }

    private static CompanyProfile MapProfile(string symbol, JsonObject s)
    {
        var price = s["price"];
        // Stocks carry assetProfile; funds and some other types only have summaryProfile.
        var ap = s["assetProfile"] ?? s["summaryProfile"];
        var sd = s["summaryDetail"];
        var ks = s["defaultKeyStatistics"];
        var fd = s["financialData"];

        var officers = (ap?["companyOfficers"] as JsonArray ?? [])
            .Select(o => J.Str(o, "name") is { } name ? new CompanyOfficer(name, J.Str(o, "title"), J.Int(o, "age")) : null)
            .OfType<CompanyOfficer>()
            .Take(5)
            .ToList();

        var stats = new KeyStats(
            MarketCap: J.Num(price, "marketCap") ?? J.Num(sd, "marketCap"),
            EnterpriseValue: J.Num(ks, "enterpriseValue"),
            TrailingPE: J.Num(sd, "trailingPE"),
            ForwardPE: J.Num(sd, "forwardPE") ?? J.Num(ks, "forwardPE"),
            PegRatio: J.Num(ks, "pegRatio"),
            PriceToBook: J.Num(ks, "priceToBook"),
            TrailingEps: J.Num(ks, "trailingEps"),
            ForwardEps: J.Num(ks, "forwardEps"),
            DividendYield: J.Num(sd, "dividendYield") ?? J.Num(sd, "yield"),
            Beta: J.Num(sd, "beta") ?? J.Num(ks, "beta"),
            FiftyTwoWeekHigh: J.Num(sd, "fiftyTwoWeekHigh"),
            FiftyTwoWeekLow: J.Num(sd, "fiftyTwoWeekLow"),
            FiftyDayAverage: J.Num(sd, "fiftyDayAverage"),
            TwoHundredDayAverage: J.Num(sd, "twoHundredDayAverage"),
            AverageVolume: J.Long(sd, "averageVolume"),
            SharesOutstanding: J.Long(ks, "sharesOutstanding"),
            TotalRevenue: J.Num(fd, "totalRevenue"),
            RevenueGrowth: J.Num(fd, "revenueGrowth"),
            GrossMargin: J.Num(fd, "grossMargins"),
            OperatingMargin: J.Num(fd, "operatingMargins"),
            ProfitMargin: J.Num(fd, "profitMargins") ?? J.Num(ks, "profitMargins"),
            ReturnOnEquity: J.Num(fd, "returnOnEquity"),
            TotalCash: J.Num(fd, "totalCash"),
            TotalDebt: J.Num(fd, "totalDebt"),
            TargetMeanPrice: J.Num(fd, "targetMeanPrice"),
            Recommendation: J.Str(fd, "recommendationKey"));

        return new CompanyProfile(
            Symbol: J.Str(price, "symbol") ?? symbol,
            Name: J.FirstStr(price, "longName", "shortName"),
            Exchange: J.FirstStr(price, "exchangeName", "exchange"),
            Currency: J.Str(price, "currency"),
            QuoteType: J.Str(price, "quoteType"),
            Sector: J.FirstStr(ap, "sectorDisp", "sector"),
            Industry: J.FirstStr(ap, "industryDisp", "industry"),
            Country: J.Str(ap, "country"),
            City: J.Str(ap, "city"),
            State: J.Str(ap, "state"),
            Website: J.Str(ap, "website"),
            Employees: J.Long(ap, "fullTimeEmployees"),
            Summary: J.FirstStr(ap, "longBusinessSummary", "description"),
            Officers: officers,
            Stats: stats,
            Source: "Yahoo");
    }

    // --------------------------------------------------------------- search

    private static readonly HashSet<string> SearchableTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "EQUITY", "ETF", "INDEX", "MUTUALFUND", "CRYPTOCURRENCY", "CURRENCY", "FUTURE",
    };

    public Task<IReadOnlyList<SearchResult>> SearchAsync(string? rawQuery, CancellationToken ct)
    {
        var query = (rawQuery ?? "").Trim();
        if (query.Length == 0) return Task.FromResult<IReadOnlyList<SearchResult>>([]);
        if (query.Length > 50) throw new ArgumentException("Search text is too long.");

        return Cached($"search:{query.ToLowerInvariant()}", TimeSpan.FromHours(1), async () =>
        {
            var quotes = await yahoo.SearchAsync(query, 10, ct);
            IReadOnlyList<SearchResult> results = quotes
                .Where(q => J.Str(q, "symbol") is not null && SearchableTypes.Contains(J.Str(q, "quoteType") ?? ""))
                .Select(q => new SearchResult(
                    J.Str(q, "symbol")!,
                    J.FirstStr(q, "longname", "shortname"),
                    J.FirstStr(q, "typeDisp", "quoteType"),
                    J.FirstStr(q, "exchDisp", "exchange")))
                .Take(8)
                .ToList();
            return results;
        });
    }

    // ---------------------------------------------------------------- cache

    private Task<T> Cached<T>(string key, TimeSpan ttl, Func<Task<T>> load, bool durable = false) =>
        cache.GetOrLoadAsync(key, ttl, load, durable);
}
