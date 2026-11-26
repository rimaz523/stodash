using Microsoft.EntityFrameworkCore;
using Stodash.Api.Data;
using Stodash.Api.Infrastructure;
using Stodash.Api.Models;

namespace Stodash.Api.Services;

/// <summary>
/// The current user's named watchlists (W). A user with no lists gets a "Main" list of the Magnificent 7.
/// Every query is filtered by <see cref="ICurrentUser"/>, so one user can never see or change another's lists.
/// </summary>
public sealed class WatchlistService(StodashDb db, ICurrentUser user, MarketDataService market)
{
    public const int MaxLists = 20;
    public const int MaxSymbols = 50;
    public const string DefaultName = "Main";
    public static readonly string[] DefaultSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

    public async Task<IReadOnlyList<WatchlistDto>> GetAllAsync(CancellationToken ct)
    {
        if (!await Mine().AnyAsync(ct)) await CreateDefaultAsync(ct);
        var lists = await Mine().Include(w => w.Items).OrderBy(w => w.SortOrder).ThenBy(w => w.Id).ToListAsync(ct);
        return lists.Select(ToDto).ToList();
    }

    public async Task<WatchlistDto> CreateAsync(string? rawName, CancellationToken ct)
    {
        var name = CleanName(rawName);
        var count = await Mine().CountAsync(ct);
        if (count >= MaxLists) throw new ArgumentException($"You can have up to {MaxLists} watchlists.");
        await EnsureNameFreeAsync(name, null, ct);

        var list = new Watchlist { UserId = user.Id, Name = name, SortOrder = count, CreatedAt = DateTimeOffset.UtcNow };
        db.Watchlists.Add(list);
        await db.SaveChangesAsync(ct);
        return ToDto(list);
    }

    public async Task<WatchlistDto> RenameAsync(int id, string? rawName, CancellationToken ct)
    {
        var list = await FindAsync(id, ct);
        var name = CleanName(rawName);
        await EnsureNameFreeAsync(name, id, ct);
        list.Name = name;
        await db.SaveChangesAsync(ct);
        return ToDto(list);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var list = await FindAsync(id, ct);
        if (await Mine().CountAsync(ct) == 1)
            throw new ArgumentException("You need at least one watchlist. Create another before deleting this one.");
        db.Watchlists.Remove(list);
        await db.SaveChangesAsync(ct);
    }

    public async Task<WatchlistDto> AddSymbolAsync(int id, string? rawSymbol, CancellationToken ct)
    {
        var symbol = MarketDataService.NormalizeSymbol(rawSymbol);
        var list = await FindAsync(id, ct);
        if (list.Items.Any(i => i.Symbol == symbol)) throw new ConflictException($"{symbol} is already in \"{list.Name}\".");
        if (list.Items.Count >= MaxSymbols) throw new ArgumentException($"A watchlist can hold up to {MaxSymbols} symbols.");

        await market.GetQuoteAsync(symbol, ct); // unknown tickers throw a 404 here, so typos never get saved

        list.Items.Add(new WatchlistItem
        {
            Symbol = symbol,
            SortOrder = list.Items.Count == 0 ? 0 : list.Items.Max(i => i.SortOrder) + 1,
            AddedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return ToDto(list);
    }

    public async Task<WatchlistDto> RemoveSymbolAsync(int id, string? rawSymbol, CancellationToken ct)
    {
        var symbol = MarketDataService.NormalizeSymbol(rawSymbol);
        var list = await FindAsync(id, ct);
        var item = list.Items.FirstOrDefault(i => i.Symbol == symbol)
                   ?? throw new NotFoundException($"{symbol} isn't in \"{list.Name}\".");
        list.Items.Remove(item);
        await db.SaveChangesAsync(ct);
        return ToDto(list);
    }

    /// <summary>Sets the order of a list's symbols. <paramref name="symbols"/> must contain exactly the list's symbols.</summary>
    public async Task<WatchlistDto> ReorderAsync(int id, IReadOnlyList<string>? symbols, CancellationToken ct)
    {
        var list = await FindAsync(id, ct);
        var wanted = (symbols ?? []).Select(MarketDataService.NormalizeSymbol).ToList();
        var current = list.Items.Select(i => i.Symbol).ToHashSet();
        if (wanted.Count != current.Count || !current.SetEquals(wanted))
            throw new ArgumentException("The new order must list every symbol in the watchlist exactly once.");

        for (var i = 0; i < wanted.Count; i++)
            list.Items.First(x => x.Symbol == wanted[i]).SortOrder = i;
        await db.SaveChangesAsync(ct);
        return ToDto(list);
    }

    /// <summary>Quotes for every symbol in a list, in list order. Symbols that fail are left out.</summary>
    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(int id, CancellationToken ct)
    {
        var list = await FindAsync(id, ct);
        return await market.GetQuotesAsync(ToDto(list).Symbols, ct);
    }

    // -------------------------------------------------------------- helpers

    private IQueryable<Watchlist> Mine() => db.Watchlists.Where(w => w.UserId == user.Id);

    private async Task<Watchlist> FindAsync(int id, CancellationToken ct) =>
        await Mine().Include(w => w.Items).FirstOrDefaultAsync(w => w.Id == id, ct)
        ?? throw new NotFoundException($"Watchlist {id} doesn't exist.");

    private async Task CreateDefaultAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        db.Watchlists.Add(new Watchlist
        {
            UserId = user.Id,
            Name = DefaultName,
            CreatedAt = now,
            Items = DefaultSymbols.Select((s, i) => new WatchlistItem { Symbol = s, SortOrder = i, AddedAt = now }).ToList(),
        });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two first requests raced to create "Main". The other one won, which is what we wanted.
            db.ChangeTracker.Clear();
        }
    }

    private async Task EnsureNameFreeAsync(string name, int? exceptId, CancellationToken ct)
    {
        // SQL Server's default collation compares names case-insensitively, so "main" clashes with "Main".
        if (await Mine().AnyAsync(w => w.Name == name && w.Id != exceptId, ct))
            throw new ConflictException($"You already have a watchlist called \"{name}\".");
    }

    private static string CleanName(string? raw)
    {
        var name = string.Join(' ', (raw ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (name.Length == 0) throw new ArgumentException("Give the watchlist a name.");
        if (name.Length > StodashDb.MaxNameLength)
            throw new ArgumentException($"Watchlist names can be at most {StodashDb.MaxNameLength} characters.");
        return name;
    }

    private static WatchlistDto ToDto(Watchlist w) => new(
        w.Id,
        w.Name,
        w.Items.OrderBy(i => i.SortOrder).ThenBy(i => i.Id).Select(i => i.Symbol).ToList());
}
