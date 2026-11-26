using Microsoft.EntityFrameworkCore;

namespace Stodash.Api.Data;

/// <summary>A named list of symbols, owned by one user.</summary>
public sealed class Watchlist
{
    public int Id { get; set; }

    /// <summary>Who owns the list. A fixed "local" user until sign-in exists (see <see cref="Infrastructure.ICurrentUser"/>).</summary>
    public required string UserId { get; set; }

    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<WatchlistItem> Items { get; set; } = [];
}

public sealed class WatchlistItem
{
    public int Id { get; set; }
    public int WatchlistId { get; set; }
    public Watchlist? Watchlist { get; set; }
    public required string Symbol { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset AddedAt { get; set; }
}

/// <summary>A named workspace (panels, active panel, panel sizes) saved by one user, for LAYOUT.</summary>
public sealed class SavedLayout
{
    public int Id { get; set; }

    /// <summary>Who owns the layout; see <see cref="Watchlist.UserId"/>.</summary>
    public required string UserId { get; set; }

    public required string Name { get; set; }

    /// <summary>The frontend's workspace JSON, stored as is.</summary>
    public required string WorkspaceJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>One cached API result, serialized as JSON. Lets slow-changing data survive API restarts.</summary>
public sealed class CacheEntry
{
    public required string Key { get; set; }
    public required string Json { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

/// <summary>
/// The Stodash database: SQL Server LocalDB in development, Azure SQL when hosted.
/// Change the model, then add a migration: <c>dotnet ef migrations add Name -p backend/Stodash.Api -o Data/Migrations</c>.
/// </summary>
public sealed class StodashDb(DbContextOptions<StodashDb> options) : DbContext(options)
{
    public const int MaxNameLength = 40;
    public const int MaxSymbolLength = 20;

    public DbSet<Watchlist> Watchlists => Set<Watchlist>();
    public DbSet<WatchlistItem> WatchlistItems => Set<WatchlistItem>();
    public DbSet<CacheEntry> CacheEntries => Set<CacheEntry>();
    public DbSet<SavedLayout> Layouts => Set<SavedLayout>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Watchlist>(e =>
        {
            e.Property(w => w.UserId).HasMaxLength(128);
            e.Property(w => w.Name).HasMaxLength(MaxNameLength);
            e.HasIndex(w => new { w.UserId, w.Name }).IsUnique();
            e.HasMany(w => w.Items).WithOne(i => i.Watchlist).HasForeignKey(i => i.WatchlistId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<WatchlistItem>(e =>
        {
            e.Property(i => i.Symbol).HasMaxLength(MaxSymbolLength);
            e.HasIndex(i => new { i.WatchlistId, i.Symbol }).IsUnique();
        });

        b.Entity<CacheEntry>(e =>
        {
            e.HasKey(c => c.Key);
            e.Property(c => c.Key).HasMaxLength(200);
            e.HasIndex(c => c.ExpiresAt);
        });

        b.Entity<SavedLayout>(e =>
        {
            e.ToTable("SavedLayouts");
            e.Property(l => l.UserId).HasMaxLength(128);
            e.Property(l => l.Name).HasMaxLength(MaxNameLength);
            e.HasIndex(l => new { l.UserId, l.Name }).IsUnique();
        });
    }
}
