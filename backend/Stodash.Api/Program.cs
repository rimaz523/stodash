using System.Net;
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

builder.Services.AddScoped<MarketDataService>();
builder.Services.AddScoped<SecCompanyLookup>();
builder.Services.AddScoped<FinancialsService>();
builder.Services.AddScoped<NewsService>();
builder.Services.AddScoped<FilingsService>();

// The Vite dev server proxies /api, so CORS only matters if the frontend is opened another way.
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .WithMethods("GET")));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();

if (app.Environment.IsDevelopment())
    app.MapOpenApi(); // /openapi/v1.json

app.MapMarketEndpoints();

app.Run();
