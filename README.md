# Stodash

A personal, keyboard-driven market terminal inspired by the Bloomberg Terminal, built on free data.
**Phases 1–3:** command bar, company description (`DES`), price charts (`GP`), financial statements (`FA`),
company news (`N`), SEC filings (`CF`), watchlists with live prices (`W`), the US economy (`ECO`), the Treasury yield
curve (`YC`), currencies (`FX`) and crypto (`CRYPTO`).

- **Backend:** ASP.NET Core minimal API on .NET 10 (`backend/Stodash.Api`)
- **Frontend:** React 19 + TypeScript + Vite, charts by TradingView Lightweight Charts (`frontend`)
- **Database:** SQL Server LocalDB via EF Core (watchlists, and a cache that survives restarts)
- **Data:** Yahoo Finance (no key), SEC EDGAR (free, needs a contact email), FRED (free key), US Treasury, CoinGecko
  and the ECB (no key), with optional Finnhub for live watchlist prices

> For personal research only. Free data is usually delayed ~15 minutes, and provider terms
> generally forbid redistributing it, so don't deploy this publicly.

## Build and run

Stodash has two parts that run at the same time:

| Part | Folder | Address | Started with |
|---|---|---|---|
| API (backend) | `backend/Stodash.Api` | http://localhost:5080 | `dotnet run` |
| Web app (frontend) | `frontend` | http://localhost:5173 | `npm run dev` |

You open the web app in your browser. It talks to the API, and the API fetches the market data.

### Quick start: the scripts

The `scripts` folder does everything in steps 2–4 for you:

| Script | What it does |
|---|---|
| `scripts\start.cmd` | **Double-click to start.** Checks prerequisites, runs `npm install` if needed, opens the API and web app in two windows ("Stodash API" and "Stodash Web", where the logs appear), waits until both are up, then opens your browser. If Stodash is already running, it just opens the browser. |
| `scripts\stop.cmd` | **Double-click to stop.** Closes both windows and frees ports 5080 and 5173, including servers you started by hand. |
| `scripts\start.ps1` / `stop.ps1` | The same, from a PowerShell prompt. `start.ps1 -NoBrowser` skips opening the browser. |

From PowerShell in this folder:

```powershell
.\scripts\start.ps1
```

```powershell
.\scripts\stop.ps1
```

If PowerShell says running scripts is disabled, use the `.cmd` files instead. They run the same scripts without changing
your system's PowerShell settings.

The rest of this section is the manual way, which is useful for understanding what the scripts do or when one fails.

### 1. Install the prerequisites (once)

- **.NET 10 SDK:** https://dotnet.microsoft.com/download/dotnet/10.0
- **Node.js 20 or newer** (includes npm): https://nodejs.org
- **SQL Server LocalDB:** comes with Visual Studio (the "Data storage and processing" workload), or install
  [SQL Server Express LocalDB](https://learn.microsoft.com/sql/database-engine/configure-windows/sql-server-express-localdb).
  Without it Stodash still runs, but watchlists don't work and the cache resets on every restart.

Check that they're installed:

```powershell
dotnet --list-sdks
```

```powershell
node --version
```

```powershell
sqllocaldb info
```

The first should list a `10.x` version, the second should print `v20` or higher, and the third should list
`MSSQLLocalDB`. The API creates its `Stodash` database on first start. You don't need to set anything up.

### 2. First-time setup (once)

Open PowerShell in this folder (`C:\Users\rimaz\source\repos\vibe-code\stodash`), then install the front-end packages:

```powershell
cd frontend; npm install; cd ..
```

The backend downloads its packages automatically the first time it builds.

### 3. Start the app (every time)

You need **two terminals**, both opened in this folder.

**Terminal 1, the API.** Leave it running:

```powershell
dotnet run --project backend/Stodash.Api
```

Wait for `Now listening on: http://localhost:5080`.

**Terminal 2, the web app.** Leave it running:

```powershell
cd frontend; npm run dev
```

Wait for `Local: http://localhost:5173/`.

**Then open http://localhost:5173 in your browser.** The status bar at the bottom should say **API connected**.

### 4. Stop the app

Press `Ctrl+C` in each terminal.

### Build and check without running

Use these to confirm everything compiles, for example after editing code:

```powershell
dotnet build backend/Stodash.Api
```

```powershell
cd frontend; npx tsc -b; npx oxlint src; npm run build; cd ..
```

The .NET build should end with `0 Warning(s)` and `0 Error(s)`. The `tsc` and `oxlint` steps print nothing when everything
is fine, and `npm run build` ends with `✓ built` and writes the optimized site to `frontend/dist`.

To run that optimized build instead of the dev server, start the API as in step 3, then:

```powershell
cd frontend; npm run build; npm run preview
```

It serves on http://localhost:4173 and still talks to the API on :5080.

### Using Visual Studio or VS Code instead

- **Visual Studio:** open `Stodash.slnx` and press F5 to run the API. Then start the web app from a terminal as in step 3.
- **VS Code:** open this folder, then use two integrated terminals (`` Ctrl+` ``) for the two commands in step 3.

### Troubleshooting

| Problem | Fix |
|---|---|
| Status bar says **API offline** | Terminal 1 isn't running, or it crashed. Start it again and check its output for errors. |
| `address already in use` on 5080 or 5173 | An old copy is still running. Close the other terminal, or find it with `Get-NetTCPConnection -LocalPort 5080` and stop that process. |
| Panels say **Data provider unavailable** (502) | Yahoo is rate-limiting or briefly down. Wait a minute and retry, or add a Finnhub key (below). |
| Watchlists say **Database unavailable** (503) | LocalDB isn't running or isn't installed. Run `sqllocaldb start MSSQLLocalDB`, or install it (step 1). |
| Watchlists show **Polling** instead of **Live** | No Finnhub key, the market is closed, or the symbols aren't US stocks. Hover over the badge for details. |
| `dotnet` or `npm` is not recognized | The prerequisite isn't installed, or the terminal was opened before installing. Open a new terminal. |
| The page looks stale after updating code | Refresh the browser. If it's still stale, stop both terminals and start them again. |

### SEC EDGAR setup (for `CF`, and the `FA` fallback)

SEC's data is free with no sign-up, but SEC asks every automated client to identify itself with a name and contact
email in its User-Agent header, and blocks requests without one. The address is only sent to sec.gov and only appears
in their server logs. Set it once with user-secrets so it never ends up in the repo:

```powershell
dotnet user-secrets set "Sec:UserAgent" "Stodash you@example.com" --project backend/Stodash.Api
```

Without it, `CF` shows "SEC EDGAR is not configured" and the status bar shows SEC as off. Everything else still works.

### FRED key (for `ECO`)

`ECO` uses the St. Louis Fed's free FRED data, which needs a free key: https://fred.stlouisfed.org/docs/api/api_key.html.
Then:

```powershell
dotnet user-secrets set "Fred:ApiKey" "YOUR_KEY" --project backend/Stodash.Api
```

Restart the API afterwards. Until then, `ECO` shows how to set the key, and everything else works.

### Optional: Finnhub

Finnhub has a free plan (sign up with an email, no card). With a key:
- watchlist prices for US stocks stream live (otherwise they refresh every 15 seconds),
- quotes and profiles fall back to Finnhub when Yahoo fails,
- and `N` merges Finnhub's company news with Yahoo's.

Get a free key at https://finnhub.io/register, then:

```powershell
dotnet user-secrets init --project backend/Stodash.Api
```

```powershell
dotnet user-secrets set "Finnhub:ApiKey" "YOUR_KEY" --project backend/Stodash.Api
```

The key stays on the backend and never reaches the browser.

`CRYPTO` works without a key. A free CoinGecko "demo" key raises its rate limits:
`dotnet user-secrets set "CoinGecko:ApiKey" "YOUR_KEY" --project backend/Stodash.Api`.

The status bar shows "Data: ● 7/7 ok". Hover over it to see every provider's state. A failing provider is also named
in red, and "● Live" appears while watchlist prices are streaming.

## Running the tests

Stodash has browser tests written with [Playwright](https://playwright.dev). They open the app in a real Chromium
browser and click and type through it the way you would. There are two suites:

| Suite | Command (from `frontend`) | Needs the backend? | What it checks |
|---|---|---|---|
| **Main** (52 tests, ~15 s) | `npm run test:e2e` | No | Every usual scenario, using a fake API with fixed data |
| **Live smoke** (8 tests) | `npm run test:e2e:live` | Yes, on :5080 | Every function loads with real data (W needs LocalDB) |

The main suite covers:
- the default layout, the market strip and the status bar;
- the command bar: Enter, Shift+Enter, the 4-panel limit, suggestions, company names, error messages, history,
  HELP, CLEAR, and `W DES` meaning the ticker W;
- every panel: FA, N and CF; watchlists (create, rename, delete, add, remove, `W ADD`, live prices through a
  simulated stream, the polling fallback); and ECO, YC, FX and CRYPTO;
- settings that survive a reload, and what happens when the backend, the database or a provider fails.

Its fake API lives in `frontend/e2e/mock-api.ts`, so results never depend on Yahoo, SEC or market hours.

### 1. One-time setup

After installing the prerequisites in step 1 above, open PowerShell in this folder and run:

```powershell
cd frontend; npm install; npx playwright install chromium; cd ..
```

The last command downloads the Chromium build Playwright drives (about 150 MB, stored under
`%LOCALAPPDATA%\ms-playwright`). Repeat it after updating `@playwright/test`.

### 2. Run the main suite

```powershell
cd frontend; npm run test:e2e
```

You don't need to start anything first. The tests start their own copy of the web app on http://localhost:5199 and
stop it afterwards, so they won't clash with an app you have open on :5173. A passing run ends with `52 passed`.

### 3. Run the live smoke tests (optional)

Start Stodash first (`.\scripts\start.ps1 -NoBrowser`), then:

```powershell
cd frontend; npm run test:e2e:live
```

These hit real providers, so a failure can just mean Yahoo is rate-limiting. Check the status bar and try again in a
minute.

### Handy variations

Run these from the `frontend` folder:

| To | Run |
|---|---|
| Pick and watch tests in Playwright's interactive runner | `npm run test:e2e:ui` |
| Watch the browser while tests run | `npm run test:e2e -- --headed` |
| Run one file | `npm run test:e2e -- e2e/financials.spec.ts` |
| Run tests whose name matches some text (a regex) | `npm run test:e2e -- -g "up to four"` |
| Step through a test with the inspector | `npm run test:e2e -- -g "up to four" --debug` |
| Check for flaky tests | `npm run test:e2e -- --repeat-each=3` |

### When a test fails

The terminal shows which step failed and what the page contained. For more detail, open the HTML report with
`npx playwright show-report`. Each failure has a screenshot and a trace you can step through, before and after every
action. The files are in `frontend/test-results` and `frontend/playwright-report`, which git ignores.

| Problem | Fix |
|---|---|
| `Executable doesn't exist` or "browser not installed" | Run `npx playwright install chromium` |
| `Port 5199 is already in use` | A previous test run is still going. Close it, or find it with `Get-NetTCPConnection -LocalPort 5199` |
| A test fails after you changed an API response | Update the matching fixture in `frontend/e2e/mock-api.ts` so the fake API returns the new shape |
| Live tests fail with "Couldn't load" | Make sure the API is running on :5080 and the status bar says "API connected" |

### Adding a test

Specs live in `frontend/e2e`, one file per area (`shell`, `command-bar`, `financials`, `news`, `filings`). Import
`test` and the helpers from `./fixtures.ts`. The fake API is installed automatically for every test, and
`openWith(page, panels)` starts the app with a given layout. To simulate a failure, override a route:

```ts
mock.on(/^\/api\/news\//, { status: 502, body: { title: 'Data provider unavailable', detail: 'Yahoo is down.' } })
```

## Using it

Type into the command bar (or just start typing anywhere):

| Command | What it does |
|---|---|
| `AAPL` or `AAPL DES` | Description: price, day and 52-week ranges, key stats, profile, management |
| `AAPL GP` | Price chart: 1D–MAX ranges, candles or line, SMA 20/50, volume, hover legend |
| `AAPL GP 1Y` | Chart opened at a given range |
| `AAPL FA` | Financials: income statement, balance sheet, cash flow and ratios; key rows with an "All rows" toggle |
| `AAPL FA Q` | Financials opened on quarterly periods (`A` for annual) |
| `AAPL N` | Latest company headlines, newest first; links open in a new tab |
| `AAPL CF` | SEC filings with filters (Annual, Quarterly, 8-K, Proxy, Insider, Other) and links to EDGAR |
| `tesla` | A company name works too: Enter opens the best match |
| `W` | Watchlists: tabs per list, ＋ to create, Rename, Delete; live prices for US stocks; drag rows to reorder |
| `W Tech` | Open the watchlist called Tech |
| `W ADD NVDA` / `W DEL NVDA` | Add or remove a symbol (add `TO Tech` / `FROM Tech` for another list) |
| `ECO` / `ECO CPI` | US economy: 9 indicators from FRED; click a tile (or name it) for its history |
| `YC` | US Treasury yield curve: now, a month ago and a year ago, with spreads and inversion |
| `FX` | 8 major pairs against USD and a cross-rate matrix |
| `CRYPTO` | Top 25 coins by market cap, sortable, with 7-day sparklines |
| `HELP` | Commands, ticker formats and shortcuts |
| `CLEAR` | Close all panels |

Ticker formats: indexes `^GSPC`, FX `EURUSD=X`, crypto `BTC-USD`, futures `GC=F`, non-US `RY.TO`, `VOD.L`.

| Key | Action |
|---|---|
| `/` or `Ctrl K` | Focus the command bar |
| `Enter` | Load into the active panel |
| `Shift Enter` | Open in a new panel (max 4) |
| `↑` `↓` / `Tab` | Pick / complete a suggestion; `↑` with the list closed walks history |
| `Alt 1–4` | Switch active panel |

Click a market in the top strip to chart it (Shift-click for a new panel). In `W`, `FX` and `CRYPTO`, clicking a row
opens it in another panel so the list stays put (Shift-click: a new panel). `W` followed by a function, like
`W DES`, means the ticker W (Wayfair). The layout, chart settings and command history are saved in your browser's
local storage. Watchlists are saved in the database.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/quote/{symbol}` | Latest quote |
| `GET /api/quotes?symbols=A,B,C` | Up to 20 quotes (failed symbols are skipped) |
| `GET /api/history/{symbol}?range=6M` | OHLCV bars; range `1D 5D 1M 3M 6M YTD 1Y 5Y MAX` |
| `GET /api/profile/{symbol}` | Company profile and key statistics |
| `GET /api/search?q=apple` | Ticker autocomplete |
| `GET /api/financials/{symbol}?period=annual` | Statements and ratios; period `annual` or `quarterly` |
| `GET /api/news/{symbol}` | Up to 50 recent headlines |
| `GET /api/filings/{symbol}` | Recent SEC filings (needs `Sec:UserAgent`) |
| `GET /api/watchlists` | Your watchlists (a first visit creates "Main" with the Magnificent 7) |
| `POST /api/watchlists` · `PATCH` · `DELETE /api/watchlists/{id}` | Create `{name}`, rename `{name}`, delete |
| `POST /api/watchlists/{id}/items` · `DELETE …/items/{symbol}` | Add `{symbol}`, remove |
| `PUT /api/watchlists/{id}/order` · `GET …/{id}/quotes` | Reorder `{symbols}`; quotes for the list |
| `GET /api/eco` · `/api/eco/{id}?range=5Y` | ECO tiles; one indicator's history (`1Y 5Y 10Y 20Y`) |
| `GET /api/yieldcurve` | Treasury curve now, about 1 month and 1 year ago |
| `GET /api/fx` · `GET /api/crypto` | FX pairs and cross rates; top 25 coins |
| `WS /ws/quotes` | Live trades: send `{"subscribe": ["AAPL"]}`, receive status and trade messages |
| `GET /api/health` | API status, each provider's configuration and last success or failure, and the stream state |

Errors come back as RFC 7807 problem details: `400` bad input, `404` unknown symbol or list, `409` duplicate,
`502` provider failure, `503` database unavailable.
When a function doesn't apply to an instrument (FA for an index, CF for a non-US listing), the API returns `200` with an
empty list and a `note` explaining why.
The OpenAPI document is at `/openapi/v1.json` in development.

Responses are cached to stay within free-tier limits: quotes 15 s, FX 60 s, crypto 2 min, intraday charts 1–5 min,
news 5 min, daily charts 15–30 min, filings and the yield curve 1 h, profiles and ECO 6 h, financials 12 h, and the SEC
ticker list 24 h. Slow-changing data (profiles, financials, filings, daily charts, ECO, YC, SEC tickers) is also stored
in the database, so it survives API restarts. Failures are never cached.

## Layout

```
backend/Stodash.Api/
  Program.cs                 DI, error handling, CORS, OpenAPI
  Endpoints/                 Route definitions: market, watchlists, macro (+ /ws/quotes)
  Data/                      EF Core: StodashDb (watchlists, cache) and Migrations/
  Services/                  MarketDataService (quotes, charts, profiles, search), FinancialsService,
                             NewsService, FilingsService, SecCompanyLookup (ticker → CIK), WatchlistService,
                             QuoteStream (Finnhub WebSocket relay), EcoService, YieldCurveService, FxService, CryptoService
  Providers/                 YahooClient (cookie + crumb handling), FinnhubClient, SecClient, FredClient,
                             TreasuryClient, CoinGeckoClient, FrankfurterClient
  Models/                    Response records
  Infrastructure/            Errors, lenient JSON readers, provider health, the two-level cache, current user,
                             and the LocalDB-on-ARM64 workaround
frontend/src/
  App.tsx                    Workspace: panels, command routing, shortcuts
  components/                Command bar, market strip, charts, sparkline, quote header, chrome
  hooks/                     useApi, useLocalStorage, useQuoteStream (live prices)
  panels/                    DES, GP, FA, N, CF, W, ECO, YC, FX, CRYPTO and HELP panels
  lib/                       Command parser, formatting, time zones, theme
  api/                       Typed API client
```

## Known limits

- Yahoo's endpoints are unofficial and can change or rate-limit without notice; the Finnhub fallback covers quotes and profiles, not charts.
- `FA` falls back to SEC data for US companies if Yahoo fails. SEC reports quarterly cash flow only as year-to-date
  totals with no separate Q4, so quarterly cash flow from that fallback is sparse.
- `CF` only covers companies registered with the US SEC under a US ticker: `RY.TO` has no filings, though `RY` does.
- Yahoo's news for a ticker includes market-wide stories that mention it, not only company-specific ones.
- Prices are delayed for most exchanges; the "as of" time on each quote shows how fresh it is.
- Live watchlist prices need a Finnhub key and only cover US stock tickers (up to 50 at a time on the free plan).
  Indexes, FX, futures, crypto and non-US listings refresh every 15 seconds instead. Outside market hours nothing
  streams, so prices stay at the last trade.
- `ECO` needs a FRED key. FRED's data comes out monthly, weekly or quarterly, so "latest" can be a few weeks old.
- On Windows on ARM (e.g. a Surface), LocalDB is x64-only, so the API connects to it through its named pipe, which it
  looks up automatically. If watchlists say the database is unavailable, run `sqllocaldb start MSSQLLocalDB`.

## Roadmap

1. ~~Foundation: command bar, DES, GP~~ ✅
2. ~~Core research: financial statements (`FA`), news (`N`), SEC filings (`CF`)~~ ✅
3. ~~Live and macro: streaming watchlists (`W`), economics (`ECO`), yield curve (`YC`), `FX`, `CRYPTO`, persistent cache~~ ✅
4. Power features: top news (`TOP`), screener (`EQS`), saved layouts
5. Polish
