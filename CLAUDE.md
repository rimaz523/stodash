# Stodash: notes for Claude

Stodash is a personal, keyboard-driven market terminal inspired by the Bloomberg Terminal and built only on
**free** data. It's for the owner's own research and isn't a product. Never deploy it publicly or redistribute the
data, because free provider terms forbid that. Azure hosting for the owner plus one or two signed-in people is planned
for later (see the roadmap), so design user data (watchlists) with a `UserId`, but don't build hosting or sign-in until asked.

**Status:** Phases 1–3 are done (command bar, `DES`, `GP`, `FA`, `N`, `CF`, `W` with live prices, `ECO`, `YC`,
`FX`, `CRYPTO`, market strip, provider health, database cache). Phase 4 is next, but don't start it until the user asks. See @docs/ROADMAP.md for the phase plans and the decisions already made.

## Stack (chosen by the user; don't swap)

- **Backend:** ASP.NET Core minimal API on **.NET 10** in `backend/Stodash.Api`, at http://localhost:5080
- **Frontend:** **React 19 + TypeScript + Vite** in `frontend`, at http://localhost:5173. Vite proxies `/api` and the
  `/ws` WebSocket to :5080.
- **Charts:** TradingView `lightweight-charts` v5 (`chart.addSeries(CandlestickSeries, …)` API). Keep its attribution logo; its license requires it.
- **Database:** SQL Server via EF Core. LocalDB (`(localdb)\MSSQLLocalDB`) for development, Azure SQL when hosted.
  Not SQLite: the user chose SQL Server so the same engine and migrations run locally and on Azure.
- **Look:** modern dark theme, not the classic Bloomberg black and orange. Tokens live in `frontend/src/index.css`,
  and `frontend/src/lib/theme.ts` mirrors them for the canvas chart. Change both together.
- Plain CSS with variables. No Tailwind and no UI kit.

## Commands

```powershell
.\scripts\start.ps1 [-NoBrowser]                   # both servers in their own windows, waits, opens browser
.\scripts\stop.ps1                                 # closes those windows + anything on :5080/:5173
dotnet run --project backend/Stodash.Api          # manual: API on :5080
cd frontend; npm install; npm run dev              # manual: web on :5173
dotnet ef migrations add Name -p backend/Stodash.Api -o Data/Migrations   # after changing StodashDb's model
```

`dotnet-ef` is a local tool pinned in `dotnet-tools.json` (run `dotnet tool restore` once). EF Core and the tool are
pinned to 10.0.x: version 11 needs .NET 11. In Development the API applies migrations on startup, so a new migration
needs no manual `database update`.

`scripts/*.ps1` must stay **Windows PowerShell 5.1 compatible** (the `.cmd` double-click wrappers use it): no `??`,
no ternary, no `&&`, and ASCII-only text. Don't detect ports with `Get-NetTCPConnection -State Listen`, because Vite's `[::1]`
listener reports an empty state on this machine. `start.ps1` test-connects instead, and `stop.ps1` matches any socket
whose local port is ours. `scripts/.pids.json` (gitignored) records the windows `start.ps1` opened.

Checks to run before calling work done (all must pass cleanly):

```powershell
dotnet build backend/Stodash.Api                  # 0 warnings expected
cd frontend; npx tsc -b; npx oxlint src; npx vite build
```

Browser tests (Playwright, in `frontend/e2e`) must also pass:

```powershell
cd frontend; npm run test:e2e        # 52 tests against a mocked API; no backend needed, ~15 s
cd frontend; npm run test:e2e:live   # 8 smoke tests against the real API on :5080 (start it first)
```

The mocked suite runs its own Vite server on :5199 and answers every `/api` call from `e2e/mock-api.ts`, whose
fixtures are typed with `src/api/types.ts`. When an API record changes, update the fixture too. The mock also fakes
`/ws/quotes` (`mock.streamState`, `mock.pushTrades(...)`) and keeps watchlists in memory (`mock.watchlists`). There are no backend
unit tests yet. Also verify by curling the API and using the app in a browser; the `/verify-stodash` skill has the
full checklist.

## Architecture

```
scripts/                       start/stop .ps1 + double-click .cmd wrappers
backend/Stodash.Api/
  Program.cs                   DI, ProblemDetails, exception handler, CORS, OpenAPI (/openapi/v1.json in dev)
  Endpoints/                   MarketEndpoints (/api market + health), WatchlistEndpoints (/api/watchlists),
                               MacroEndpoints (/api/eco, yieldcurve, fx, crypto + the /ws/quotes WebSocket)
  Data/StodashDb.cs            EF Core context + entities: Watchlists, WatchlistItems, CacheEntries; Migrations/
  Services/MarketDataService   Quotes, charts, profiles, search: symbol validation, provider choice,
                               fallbacks, JSON→model mapping, cached through IMarketCache
  Services/FinancialsService   FA: Yahoo fundamentals-timeseries, then SEC companyfacts; line defs + ratios
  Services/NewsService         N: Yahoo search news + Finnhub company-news (if key), merged and de-duplicated
  Services/FilingsService      CF: SEC submissions → filings with category + description
  Services/SecCompanyLookup    Ticker → CIK from SEC's company_tickers.json (cached 24 h)
  Services/WatchlistService    W: named lists per ICurrentUser; seeds "Main" with the Magnificent 7; validates symbols
  Services/QuoteStream         Singleton BackgroundService: ONE Finnhub WebSocket, relayed to browsers at /ws/quotes
  Services/Eco|YieldCurve|Fx|CryptoService   ECO (FRED, YoY transforms), YC (Treasury CSV), FX (Yahoo + ECB), CRYPTO
  Providers/YahooClient        Singleton. Unofficial Yahoo endpoints; owns cookie jar + "crumb" token
  Providers/FinnhubClient      Typed HttpClient. Optional, active only if Finnhub:ApiKey is set
  Providers/SecClient          Typed HttpClient. Needs Sec:UserAgent ("Stodash email") or SEC answers 403
  Providers/Fred|Treasury|CoinGecko|FrankfurterClient   Typed HttpClients over ProviderHttp.GetAsync (shared
                               error mapping + health). FRED needs Fred:ApiKey; the rest need no key
  Models/MarketModels.cs       Response records (camelCase JSON by default); ResearchModels.cs for FA/N/CF
  Infrastructure/ProviderHealth Singleton; clients record each call's success/failure for /api/health
  Infrastructure/MarketCache   IMarketCache: memory, plus the CacheEntries table for `durable: true` results
  Infrastructure/LocalDbPipe   ARM64 workaround: connects to x64-only LocalDB through its named pipe (see gotchas)
  Infrastructure/CurrentUser   ICurrentUser → "local" until sign-in exists
  Infrastructure/Errors.cs     SymbolNotFound/NotFound→404, Argument→400, Conflict→409, Upstream→502, DB errors→503
  Infrastructure/Json.cs       J.Num/J.Str/J.Long: lenient readers for Yahoo's {raw,fmt} and {} values
frontend/src/
  App.tsx                      Workspace state (≤4 panels, active panel) in localStorage; command routing; Alt+1–4
  lib/commands.ts              Command parser + FUNCTIONS / GLOBAL_COMMANDS registries
  components/CommandBar.tsx    Autocomplete (search API + function list), history, global key capture
  components/PriceChart.tsx    lightweight-charts wrapper: candles/area, SMA20/50, volume, legend
  panels/                      DES, GP, FA, N, CF (symbol panels); W, ECO, YC, FX, CRYPTO, HELP (global panels);
                               PanelFrame wraps each. panels/types.ts: SymbolSpec | GlobalSpec, GLOBAL_KINDS
  hooks/useApi.ts              Fetch-by-key with abort, background refresh, and keeps last good data
  hooks/useQuoteStream.ts      One /ws/quotes connection per W panel: status, live symbols, latest trades
  api/client.ts + types.ts     Typed client; types mirror the C# records by hand
frontend/e2e/                  Playwright: fixtures.ts (auto-installed mock, openWith/panel/run helpers),
                               mock-api.ts (fake /api), one spec per area, live/ for real-backend smoke tests
```

## Conventions and gotchas

- **Line endings are always CRLF**, in every file you create or edit (code, docs, config, tests, scripts).
  `.gitattributes` (`* text=auto eol=crlf`) and `.editorconfig` enforce this. The Write tool, heredocs, `sed` and
  node scripts all produce LF, so convert after writing (e.g. `node -e` with `s.replace(/\r?\n/g, '\r\n')`) and
  check with node that no LF-only lines remain. Don't count endings with `grep -c $'\r$'` in Git Bash here: it reports
  every file as CRLF.

- **Adding a terminal function** (FA, N, ECO, …) touches about 10 places across both halves. Use the
  `/add-terminal-function` skill, which has the checklist.
- **Percent units differ:** `Quote.changePercent` is already a percent (1.25 means +1.25%). `KeyStats` margins,
  growth, yield and ROE are **fractions** (0.25 means 25%). Use `fmt.signedPct` for the first and `fmt.pct` for the second.
  Yahoo's `price` module returns a fraction, which the backend multiplies by 100. Yahoo's chart meta is already a percent.
- **Yahoo needs a crumb** for `quoteSummary`: GET `fc.yahoo.com` (returns 404 but sets the cookie), then
  `/v1/test/getcrumb`. `YahooClient` does this lazily and retries once on 401/403. Chart, search and
  history endpoints don't need it. Yahoo is unofficial, so if it breaks, check this flow first.
- **"Doesn't apply" vs "unknown":** FA, N and CF return `200` with an empty list and a `note` for instruments the
  function doesn't cover (an index, a non-US listing). They confirm unknown tickers through `GetQuoteAsync`, which gives a 404.
- **FA rows** are defined once in `FinancialsService` (`Line`: Yahoo id, label, core/total, unit, SEC tags).
  A row's `unit` drives frontend formatting: money, perShare, shares, fraction, multiple.
- **SEC** asks for at most 10 requests/s. Everything SEC-backed is cached (tickers 24 h, filings 1 h, financials 12 h).
- **Fallback chain for quotes:** quoteSummary `price`, then chart meta, then Finnhub (if a key is set).
  Profiles go Yahoo, then Finnhub. Charts have no fallback yet.
- **Caching:** go through `IMarketCache.GetOrLoadAsync(key, ttl, load, durable)`. Pass `durable: true` for
  slow-changing data (profiles, financials, filings, daily charts, ECO, YC, SEC tickers) so it's also stored in SQL
  and survives restarts. Keep quotes, intraday and news memory-only. Durable values round-trip through
  System.Text.Json, so use records or classes with properties: tuples lose their fields. Never cache failures. If the
  database is down, the cache skips it for a minute and works from memory.
- **LocalDB on ARM64:** this machine is Windows on ARM. LocalDB is x64-only, so a `(localdb)\` connection string fails
  in an ARM64 process ("%1 is not a valid Win32 application"). `LocalDbPipe` + its interceptor resolve the instance's
  named pipe with `sqllocaldb info` and refresh it after failures (the pipe changes on every LocalDB restart).
  Don't remove this. On x64 and Azure SQL it does nothing.
- **Global commands:** `W`, `ECO`, `YC`, `FX`, `CRYPTO`, `HELP`, `CLEAR` don't take a ticker. If a function follows
  (`W DES`), it's a ticker (W is Wayfair). ECO/YC/FX/CRYPTO/HELP open once (running them again focuses the panel);
  W can be open several times. Rows in W/FX/CRYPTO open into another panel (`openFrom` in App), never replacing the list.
- **Live prices:** only US stock tickers stream (`^[A-Z]{1,5}(-[A-Z])?$`, max 50, Finnhub free plan). Everything else
  polls every 15 s. The browser never talks to Finnhub directly.
- **ECO units:** percent (4.2 = 4.2%), points (percentage points), count, index. CPI and core PCE are converted to
  year-over-year on the backend.
- **Symbols** are validated by `^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$` in both `MarketDataService` and `lib/commands.ts`.
  Keep the two in sync. Supported forms include `^GSPC`, `EURUSD=X`, `BTC-USD`, `GC=F`, `RY.TO` and `BRK-B`.
- **Chart time:** bars arrive as UTC unix seconds. `PriceChart` shifts them to exchange wall-clock time with
  `tzOffsetSeconds`, because lightweight-charts has no time zones. Legend dates are then formatted as UTC.
- **API keys and the SEC contact email stay on the backend**, in user-secrets or env vars (`Finnhub__ApiKey`,
  `Sec__UserAgent`, `Fred__ApiKey`, `CoinGecko__ApiKey`). Never put them in the frontend or in committed appsettings.
  appsettings.json holds empty placeholders only.
- **Watchlists are per user:** every query goes through `WatchlistService.Mine()` (filtered by `ICurrentUser.Id`).
  Keep it that way, so sign-in later only means swapping `LocalUser`.
- Batch endpoint `/api/quotes?symbols=` skips symbols that fail instead of failing the whole request (≤20 symbols).
- Panel/workspace state and chart prefs persist in localStorage under keys ending in `.v1`. Bump the version if
  the shape changes, and the validator falls back to defaults.
- Frontend uses TypeScript 7 (`tsc -b`) with `erasableSyntaxOnly`: no enums, no parameter properties.

## Working with the user

- They prefer to **plan first, then build one phase at a time**, and to check in after each phase.
- They run things on **Windows** (PowerShell). Give commands in PowerShell syntax.
- When a phase is done, update the README's command table and roadmap, and update `docs/ROADMAP.md`.
