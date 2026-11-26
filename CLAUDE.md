# Stodash: notes for Claude

Stodash is a personal, keyboard-driven market terminal inspired by the Bloomberg Terminal and built only on
**free** data. It's for the owner's own research and isn't a product, so never deploy it publicly or
redistribute the data, because free provider terms forbid that.

**Status:** Phase 1 is done (command bar, `DES`, `GP`, market strip). Phase 2 is next, but don't start it
until the user asks. See @docs/ROADMAP.md for the phase plans and the decisions already made.

## Stack (chosen by the user; don't swap)

- **Backend:** ASP.NET Core minimal API on **.NET 10** in `backend/Stodash.Api`, at http://localhost:5080
- **Frontend:** **React 19 + TypeScript + Vite** in `frontend`, at http://localhost:5173. Vite proxies `/api` to :5080.
- **Charts:** TradingView `lightweight-charts` v5 (`chart.addSeries(CandlestickSeries, …)` API). Keep its attribution logo; its license requires it.
- **Look:** modern dark theme, not the classic Bloomberg black and orange. Tokens live in `frontend/src/index.css`,
  and `frontend/src/lib/theme.ts` mirrors them for the canvas chart. Change both together.
- Plain CSS with variables. No Tailwind and no UI kit.

## Commands

```powershell
.\scripts\start.ps1 [-NoBrowser]                   # both servers in their own windows, waits, opens browser
.\scripts\stop.ps1                                 # closes those windows + anything on :5080/:5173
dotnet run --project backend/Stodash.Api          # manual: API on :5080
cd frontend; npm install; npm run dev              # manual: web on :5173
```

`scripts/*.ps1` must stay **Windows PowerShell 5.1 compatible** (the `.cmd` double-click wrappers use it): no `??`,
no ternary, no `&&`, and ASCII-only text. Don't detect ports with `Get-NetTCPConnection -State Listen`, because Vite's `[::1]`
listener reports an empty state on this machine. `start.ps1` test-connects instead, and `stop.ps1` matches any socket
whose local port is ours. `scripts/.pids.json` (gitignored) records the windows `start.ps1` opened.

Checks to run before calling work done (all must pass cleanly):

```powershell
dotnet build backend/Stodash.Api                  # 0 warnings expected
cd frontend; npx tsc -b; npx oxlint src; npx vite build
```

There's no test project yet. Verify behavior by curling the API and using the app in a browser. The
`/verify-stodash` skill has the full checklist.

## Architecture

```
scripts/                       start/stop .ps1 + double-click .cmd wrappers
backend/Stodash.Api/
  Program.cs                   DI, ProblemDetails, exception handler, CORS, OpenAPI (/openapi/v1.json in dev)
  Endpoints/MarketEndpoints.cs All routes under /api (MapGroup)
  Services/MarketDataService   The ONE place endpoints get data from: symbol validation, provider choice,
                               fallbacks, JSON→model mapping, IMemoryCache with per-kind TTLs
  Providers/YahooClient        Singleton. Unofficial Yahoo endpoints; owns cookie jar + "crumb" token
  Providers/FinnhubClient      Typed HttpClient. Optional fallback, active only if Finnhub:ApiKey is set
  Models/MarketModels.cs       Response records (camelCase JSON by default)
  Infrastructure/Errors.cs     SymbolNotFoundException→404, ArgumentException→400, UpstreamException→502
  Infrastructure/Json.cs       J.Num/J.Str/J.Long: lenient readers for Yahoo's {raw,fmt} and {} values
frontend/src/
  App.tsx                      Workspace state (≤4 panels, active panel) in localStorage; command routing; Alt+1–4
  lib/commands.ts              Command parser + FUNCTIONS / GLOBAL_COMMANDS registries
  components/CommandBar.tsx    Autocomplete (search API + function list), history, global key capture
  components/PriceChart.tsx    lightweight-charts wrapper: candles/area, SMA20/50, volume, legend
  panels/                      DescriptionPanel (DES), ChartPanel (GP), HelpPanel; PanelFrame wraps each
  hooks/useApi.ts              Fetch-by-key with abort, background refresh, and keeps last good data
  api/client.ts + types.ts     Typed client; types mirror the C# records by hand
```

## Conventions and gotchas

- **Adding a terminal function** (FA, N, ECO, …) touches about 10 places across both halves. Use the
  `/add-terminal-function` skill, which has the checklist.
- **Percent units differ:** `Quote.changePercent` is already a percent (1.25 means +1.25%). `KeyStats` margins,
  growth, yield and ROE are **fractions** (0.25 means 25%). Use `fmt.signedPct` for the first and `fmt.pct` for the second.
  Yahoo's `price` module returns a fraction, which the backend multiplies by 100. Yahoo's chart meta is already a percent.
- **Yahoo needs a crumb** for `quoteSummary`: GET `fc.yahoo.com` (returns 404 but sets the cookie), then
  `/v1/test/getcrumb`. `YahooClient` does this lazily and retries once on 401/403. Chart, search and
  history endpoints don't need it. Yahoo is unofficial, so if it breaks, check this flow first.
- **Fallback chain for quotes:** quoteSummary `price`, then chart meta, then Finnhub (if a key is set).
  Profiles go Yahoo, then Finnhub. Charts have no fallback yet.
- **Caching:** quote 15 s, intraday history 1–5 min, daily 15–30 min, profile 6 h, search 1 h. Never cache
  failures. The cache is in memory for now; SQLite is planned.
- **Symbols** are validated by `^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$` in both `MarketDataService` and `lib/commands.ts`.
  Keep the two in sync. Supported forms include `^GSPC`, `EURUSD=X`, `BTC-USD`, `GC=F`, `RY.TO` and `BRK-B`.
- **Chart time:** bars arrive as UTC unix seconds. `PriceChart` shifts them to exchange wall-clock time with
  `tzOffsetSeconds`, because lightweight-charts has no time zones. Legend dates are then formatted as UTC.
- **API keys stay on the backend**, in user-secrets or env vars (`Finnhub__ApiKey`). Never put them in the frontend
  or in committed appsettings.
- Batch endpoint `/api/quotes?symbols=` skips symbols that fail instead of failing the whole request (≤20 symbols).
- Panel/workspace state and chart prefs persist in localStorage under keys ending in `.v1`. Bump the version if
  the shape changes, and the validator falls back to defaults.
- Frontend uses TypeScript 7 (`tsc -b`) with `erasableSyntaxOnly`: no enums, no parameter properties.

## Working with the user

- They prefer to **plan first, then build one phase at a time**, and to check in after each phase.
- They run things on **Windows** (PowerShell). Give commands in PowerShell syntax.
- When a phase is done, update the README's command table and roadmap, and update `docs/ROADMAP.md`.
