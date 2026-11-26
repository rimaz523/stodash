using System.Net;
using Microsoft.EntityFrameworkCore;
using Stodash.Api.Data;
using Stodash.Api.Endpoints;
using Stodash.Api.Infrastructure;
using Stodash.Api.Providers;
using Stodash.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ProviderHealth>();

// SQL Server: LocalDB in development (appsettings.Development.json), Azure SQL when hosted.
var connection = builder.Configuration.GetConnectionString("Stodash")
                 ?? throw new InvalidOperationException("ConnectionStrings:Stodash is not set.");
var localDbInstance = LocalDbPipe.InstanceToResolve(connection);
if (localDbInstance is not null)
    builder.Services.AddSingleton(sp => new LocalDbPipe(localDbInstance, sp.GetRequiredService<ILogger<LocalDbPipe>>()));
builder.Services.AddDbContextFactory<StodashDb>((sp, o) =>
{
    // Retry briefly on dropped or missing connections (error 2/53/233: the server or pipe wasn't found),
    // which also covers LocalDB restarting under a new pipe name.
    o.UseSqlServer(connection, sql => sql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(2), [2, 53, 233]));
    if (localDbInstance is not null) o.AddInterceptors(new LocalDbPipeInterceptor(sp.GetRequiredService<LocalDbPipe>()));
});
builder.Services.AddScoped(sp => sp.GetRequiredService<IDbContextFactory<StodashDb>>().CreateDbContext());
builder.Services.AddSingleton<IMarketCache, MarketCache>();
builder.Services.AddHostedService<CacheJanitor>();
builder.Services.AddSingleton<ICurrentUser, LocalUser>();

builder.Services.Configure<FinnhubOptions>(builder.Configuration.GetSection("Finnhub"));
builder.Services.AddSingleton<YahooClient>();
builder.Services.AddHttpClient<FinnhubClient>(c =>
{
    c.BaseAddress = new Uri("https://finnhub.io/api/v1/");
    c.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.Configure<SecOptions>(builder.Configuration.GetSection("Sec"));
builder.Services.AddHttpClient<SecClient>(c => c.Timeout = TimeSpan.FromSeconds(20))
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AutomaticDecompression = DecompressionMethods.All });

builder.Services.Configure<FredOptions>(builder.Configuration.GetSection("Fred"));
builder.Services.AddHttpClient<FredClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient<TreasuryClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(20);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("Stodash/1.0");
});
builder.Services.Configure<CoinGeckoOptions>(builder.Configuration.GetSection("CoinGecko"));
builder.Services.AddHttpClient<CoinGeckoClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(15);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("Stodash/1.0");
});
builder.Services.AddHttpClient<FrankfurterClient>(c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddHttpClient<RssClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(10);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Stodash/1.0)");
    c.DefaultRequestHeaders.Accept.ParseAdd("application/rss+xml, application/atom+xml, application/xml, text/xml");
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AutomaticDecompression = DecompressionMethods.All });
builder.Services.AddHttpClient<IndexListClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(20);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("Stodash/1.0");
});

// One Finnhub WebSocket for the whole app, relayed to browsers at /ws/quotes.
builder.Services.AddSingleton<QuoteStream>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<QuoteStream>());

builder.Services.AddScoped<MarketDataService>();
builder.Services.AddScoped<SecCompanyLookup>();
builder.Services.AddScoped<FinancialsService>();
builder.Services.AddScoped<NewsService>();
builder.Services.AddScoped<FilingsService>();
builder.Services.AddScoped<WatchlistService>();
builder.Services.AddScoped<EcoService>();
builder.Services.AddScoped<YieldCurveService>();
builder.Services.AddScoped<FxService>();
builder.Services.AddScoped<CryptoService>();
builder.Services.AddScoped<HealthCheckService>();
builder.Services.AddScoped<TopNewsService>();
builder.Services.AddScoped<LayoutService>();

// EQS keeps one snapshot of the S&P 500 for everyone, rebuilt in the background (see ScreenerService).
builder.Services.AddSingleton<ScreenerService>();
builder.Services.AddHostedService<ScreenerRefresher>();

// The Vite dev server proxies /api, so CORS only matters if the frontend is opened another way.
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")));

var app = builder.Build();

// Create or upgrade the database on startup in development. If LocalDB isn't available the API still starts:
// market data works without it, and watchlists answer 503 with a hint until the database is back.
if (app.Environment.IsDevelopment())
{
    var health = app.Services.GetRequiredService<ProviderHealth>();
    try
    {
        await using var scope = app.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<StodashDb>().Database.MigrateAsync();
        health.Ok(ProviderHealth.Database);
    }
    catch (Exception ex)
    {
        health.Fail(ProviderHealth.Database, "Database unavailable: " + ex.GetBaseException().Message);
        app.Logger.LogError("Could not create or upgrade the database: {Message}", ex.GetBaseException().Message);
    }
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

if (app.Environment.IsDevelopment())
    app.MapOpenApi(); // /openapi/v1.json

app.MapMarketEndpoints();
app.MapWatchlistEndpoints();
app.MapMacroEndpoints();
app.MapLayoutEndpoints();

app.Run();
