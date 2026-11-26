using System.Text.Json.Nodes;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;
using Stodash.Api.Providers;

namespace Stodash.Api.Services;

/// <summary>
/// EQS: screens the S&amp;P 500 from a snapshot, never by calling providers per screen. The snapshot is the
/// constituent list (refreshed daily) joined with Yahoo batch quotes (all ~500 stocks in 5 calls). It is kept in
/// memory and in the database, so it survives restarts. When its prices are more than 15 minutes old, a screen
/// still answers at once from it and starts a refresh in the background; <see cref="ScreenerRefresher"/> also
/// rebuilds it once a day. A singleton, so there's only ever one refresh running.
/// </summary>
public sealed class ScreenerService(
    IServiceScopeFactory scopes,
    YahooClient yahoo,
    IMarketCache cache,
    IHostApplicationLifetime lifetime,
    ILogger<ScreenerService> log)
{
    public const string Universe = "S&P 500";
    public const int DefaultLimit = 100;
    public const int MaxLimit = 600;

    public static readonly TimeSpan PricesFreshFor = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan UniverseFreshFor = TimeSpan.FromHours(24);
    private static readonly TimeSpan KeepSnapshot = TimeSpan.FromDays(7);
    private const string SnapshotKey = "eqs:snapshot";
    private const string UniverseKey = "eqs:universe:sp500";
    private const int BatchSize = 100;

    private sealed record UniverseList(DateTimeOffset AsOf, IReadOnlyList<IndexMember> Members);

    /// <summary>Sort keys for <c>?sort=</c>. Missing values always sort last.</summary>
    public static readonly IReadOnlyDictionary<string, Func<ScreenerRow, IComparable?>> SortKeys =
        new Dictionary<string, Func<ScreenerRow, IComparable?>>(StringComparer.OrdinalIgnoreCase)
        {
            ["symbol"] = r => r.Symbol,
            ["name"] = r => r.Name,
            ["sector"] = r => r.Sector,
            ["price"] = r => r.Price,
            ["change"] = r => r.ChangePercent,
            ["marketCap"] = r => r.MarketCap,
            ["pe"] = r => r.TrailingPE,
            ["forwardPe"] = r => r.ForwardPE,
            ["pb"] = r => r.PriceToBook,
            ["yield"] = r => r.DividendYield,
            ["volume"] = r => r.Volume,
        };

    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private ScreenerSnapshot? _latest;

    public bool Refreshing => _refreshLock.CurrentCount == 0;

    public async Task<ScreenerResult> ScreenAsync(ScreenerQuery q, CancellationToken ct)
    {
        Validate(q); // bad input is a 400 before any snapshot work
        var snap = await GetSnapshotAsync(ct);
        if (DateTimeOffset.UtcNow - snap.PricesAsOf > PricesFreshFor) StartBackgroundRefresh();
        return Screen(snap, q, Refreshing);
    }

    /// <summary>Checks a query's limit, sort and ranges. Returns the limit and sort to use.</summary>
    internal static (int Limit, string SortKey, Func<ScreenerRow, IComparable?> SortBy) Validate(ScreenerQuery q)
    {
        var limit = q.Limit ?? DefaultLimit;
        if (limit is < 1 or > MaxLimit) throw new ArgumentException($"limit must be between 1 and {MaxLimit}.");
        var sortKey = string.IsNullOrWhiteSpace(q.Sort) ? "marketCap" : q.Sort.Trim();
        if (!SortKeys.TryGetValue(sortKey, out var sortBy))
            throw new ArgumentException($"Unknown sort '{q.Sort}'. Use one of: {string.Join(", ", SortKeys.Keys)}.");
        CheckRange("market cap", q.MinCap, q.MaxCap);
        CheckRange("P/E", q.MinPe, q.MaxPe);
        CheckRange("% change", q.MinChange, q.MaxChange);
        return (limit, sortKey, sortBy);
    }

    /// <summary>Filters and sorts a snapshot. Pure, so it's unit-tested directly.</summary>
    internal static ScreenerResult Screen(ScreenerSnapshot snap, ScreenerQuery q, bool refreshing)
    {
        var (limit, sortKey, sortBy) = Validate(q);
        var sectors = snap.Rows.GroupBy(r => r.Sector)
            .Select(g => new SectorCount(g.Key, g.Count()))
            .OrderBy(s => s.Sector, StringComparer.Ordinal)
            .ToList();
        var sector = string.IsNullOrWhiteSpace(q.Sector) ? null : q.Sector.Trim();
        if (sector is not null && !sectors.Any(s => s.Sector.Equals(sector, StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException($"Unknown sector '{q.Sector}'. Use one of: {string.Join(", ", sectors.Select(s => s.Sector))}.");

        var matches = snap.Rows.Where(r =>
                (sector is null || r.Sector.Equals(sector, StringComparison.OrdinalIgnoreCase)) &&
                InRange(r.MarketCap, q.MinCap, q.MaxCap) &&
                InRange(r.TrailingPE, q.MinPe, q.MaxPe) &&
                InRange(r.ChangePercent, q.MinChange, q.MaxChange))
            .ToList();

        var desc = q.Desc ?? sortKey is not ("symbol" or "name" or "sector");
        var withValue = matches.Where(r => sortBy(r) is not null);
        var sorted = (desc ? withValue.OrderByDescending(sortBy) : withValue.OrderBy(sortBy))
            .ThenBy(r => r.Symbol, StringComparer.Ordinal)
            .Concat(matches.Where(r => sortBy(r) is null).OrderBy(r => r.Symbol, StringComparer.Ordinal));

        return new ScreenerResult(snap.Universe, snap.Rows.Count, matches.Count, sorted.Take(limit).ToList(), sectors,
            snap.UniverseAsOf, snap.PricesAsOf, refreshing, snap.Source);
    }

    /// <summary>The latest snapshot: from memory, else the copy saved in the database, else built now.</summary>
    public async Task<ScreenerSnapshot> GetSnapshotAsync(CancellationToken ct)
    {
        if (_latest is { } latest) return latest;
        var snap = await cache.GetOrLoadAsync(SnapshotKey, KeepSnapshot, () => RefreshAsync(ct, store: false), durable: true);
        return _latest ??= snap;
    }

    /// <summary>
    /// Rebuilds the snapshot unless another caller just did. Throws <see cref="UpstreamException"/> when Yahoo
    /// answers none of the batches; the previous snapshot then stays in use.
    /// </summary>
    public async Task<ScreenerSnapshot> RefreshAsync(CancellationToken ct, bool store = true)
    {
        await _refreshLock.WaitAsync(ct);
        try
        {
            if (_latest is { } recent && DateTimeOffset.UtcNow - recent.PricesAsOf < PricesFreshFor) return recent;

            var snap = await BuildAsync(ct);
            _latest = snap;
            if (store) await cache.SetAsync(SnapshotKey, snap, KeepSnapshot, durable: true);
            log.LogInformation("EQS snapshot rebuilt: {Count} stocks, {Priced} with prices.",
                snap.Rows.Count, snap.Rows.Count(r => r.Price is not null));
            return snap;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private void StartBackgroundRefresh()
    {
        if (Refreshing) return;
        _ = Task.Run(async () =>
        {
            try { await RefreshAsync(lifetime.ApplicationStopping); }
            catch (OperationCanceledException) { /* shutting down */ }
            catch (Exception ex) { log.LogWarning("EQS background refresh failed: {Message}", ex.Message); }
        });
    }

    private async Task<ScreenerSnapshot> BuildAsync(CancellationToken ct)
    {
        var universe = await GetUniverseAsync(ct);

        // The list writes share classes as BRK.B; Yahoo wants BRK-B.
        var members = new List<(string Symbol, IndexMember Member)>();
        foreach (var m in universe.Members)
        {
            try { members.Add((MarketDataService.NormalizeSymbol(m.Symbol.Replace('.', '-')), m)); }
            catch (ArgumentException) { log.LogDebug("EQS skipped odd symbol {Symbol}.", m.Symbol); }
        }
        members = members.DistinctBy(m => m.Symbol).ToList();

        var quotes = new Dictionary<string, JsonNode>(StringComparer.OrdinalIgnoreCase);
        UpstreamException? lastError = null;
        foreach (var batch in members.Select(m => m.Symbol).Chunk(BatchSize))
        {
            try
            {
                foreach (var q in await yahoo.GetQuotesAsync(batch, ct))
                    if (q is not null && J.Str(q, "symbol") is { } s) quotes[s] = q;
            }
            catch (UpstreamException ex)
            {
                log.LogWarning("EQS: a Yahoo batch failed: {Message}", ex.Message);
                lastError = ex;
            }
        }
        if (quotes.Count == 0)
            throw new UpstreamException("Yahoo didn't return prices for the screener. Try again shortly.", lastError);

        var rows = members.Select(m =>
        {
            var q = quotes.GetValueOrDefault(m.Symbol);
            // v7 gives dividendYield as a percent (1.64) and trailingAnnualDividendYield as a fraction (0.0164).
            var yield = J.Num(q, "dividendYield") / 100 ?? J.Num(q, "trailingAnnualDividendYield");
            return new ScreenerRow(
                Symbol: m.Symbol,
                Name: m.Member.Name,
                Sector: m.Member.Sector,
                Industry: m.Member.Industry,
                Price: J.Num(q, "regularMarketPrice"),
                ChangePercent: J.Num(q, "regularMarketChangePercent"), // already a percent in v7
                MarketCap: J.Num(q, "marketCap"),
                TrailingPE: J.Num(q, "trailingPE"),
                ForwardPE: J.Num(q, "forwardPE"),
                PriceToBook: J.Num(q, "priceToBook"),
                DividendYield: yield,
                FiftyTwoWeekHigh: J.Num(q, "fiftyTwoWeekHigh"),
                FiftyTwoWeekLow: J.Num(q, "fiftyTwoWeekLow"),
                Volume: J.Long(q, "regularMarketVolume"));
        }).ToList();

        return new ScreenerSnapshot(Universe, universe.AsOf, DateTimeOffset.UtcNow, rows,
            "S&P 500 list: github.com/datasets (from Wikipedia) · prices: Yahoo");
    }

    /// <summary>The constituent list, cached for a day. If it can't be fetched, the previous snapshot's list is reused.</summary>
    private async Task<UniverseList> GetUniverseAsync(CancellationToken ct)
    {
        try
        {
            return await cache.GetOrLoadAsync(UniverseKey, UniverseFreshFor, durable: true, load: async () =>
            {
                using var scope = scopes.CreateScope();
                var client = scope.ServiceProvider.GetRequiredService<IndexListClient>();
                return new UniverseList(DateTimeOffset.UtcNow, await client.GetSp500Async(ct));
            });
        }
        catch (UpstreamException ex) when (_latest is { } prev)
        {
            log.LogWarning("EQS: couldn't refresh the S&P 500 list ({Message}); keeping the previous one.", ex.Message);
            return new UniverseList(prev.UniverseAsOf,
                prev.Rows.Select(r => new IndexMember(r.Symbol, r.Name, r.Sector, r.Industry)).ToList());
        }
    }

    private static bool InRange(double? value, double? min, double? max) =>
        (min is null && max is null) || (value is { } v && (min is null || v >= min) && (max is null || v <= max));

    private static void CheckRange(string what, double? min, double? max)
    {
        if (min is { } a && max is { } b && a > b)
            throw new ArgumentException($"The minimum {what} is above the maximum.");
    }
}

/// <summary>Builds the EQS snapshot shortly after startup if there's none, then rebuilds it once a day.</summary>
public sealed class ScreenerRefresher(ScreenerService screener, ILogger<ScreenerRefresher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                var snap = await screener.GetSnapshotAsync(stoppingToken);
                if (DateTimeOffset.UtcNow - snap.PricesAsOf > ScreenerService.UniverseFreshFor)
                    await screener.RefreshAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                log.LogWarning("EQS daily refresh failed; will retry within the hour: {Message}", ex.Message);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
