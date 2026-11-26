# Stodash

A personal, keyboard-driven market terminal inspired by the Bloomberg Terminal, built on free data.
**Phase 1:** command bar, company description (`DES`) and price charts (`GP`).

- **Backend:** ASP.NET Core minimal API on .NET 10 (`backend/Stodash.Api`)
- **Frontend:** React 19 + TypeScript + Vite, charts by TradingView Lightweight Charts (`frontend`)
- **Data:** Yahoo Finance public endpoints (no key needed), with optional Finnhub fallback

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

Check that they're installed:

```powershell
dotnet --list-sdks
```

```powershell
node --version
```

The first should list a `10.x` version, and the second should print `v20` or higher.

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
| `dotnet` or `npm` is not recognized | The prerequisite isn't installed, or the terminal was opened before installing. Open a new terminal. |
| The page looks stale after updating code | Refresh the browser. If it's still stale, stop both terminals and start them again. |

### Optional: Finnhub fallback

If Yahoo fails, quotes and profiles can fall back to Finnhub. Get a free key at https://finnhub.io/register, then:

```powershell
dotnet user-secrets init --project backend/Stodash.Api
```

```powershell
dotnet user-secrets set "Finnhub:ApiKey" "YOUR_KEY" --project backend/Stodash.Api
```

The key stays on the backend and never reaches the browser. The status bar shows "+ Finnhub fallback" when it's active.

## Using it

Type into the command bar (or just start typing anywhere):

| Command | What it does |
|---|---|
| `AAPL` or `AAPL DES` | Description: price, day and 52-week ranges, key stats, profile, management |
| `AAPL GP` | Price chart: 1D–MAX ranges, candles or line, SMA 20/50, volume, hover legend |
| `AAPL GP 1Y` | Chart opened at a given range |
| `tesla` | A company name works too: Enter opens the best match |
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

Click a market in the top strip to chart it (Shift-click for a new panel). The layout, chart settings and
command history are saved in your browser's local storage.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/quote/{symbol}` | Latest quote |
| `GET /api/quotes?symbols=A,B,C` | Up to 20 quotes (failed symbols are skipped) |
| `GET /api/history/{symbol}?range=6M` | OHLCV bars; range `1D 5D 1M 3M 6M YTD 1Y 5Y MAX` |
| `GET /api/profile/{symbol}` | Company profile and key statistics |
| `GET /api/search?q=apple` | Ticker autocomplete |
| `GET /api/health` | API status and configured providers |

Errors come back as RFC 7807 problem details: `400` bad input, `404` unknown symbol, `502` provider failure.
The OpenAPI document is at `/openapi/v1.json` in development.

Responses are cached in memory (quotes 15 s, intraday charts 1–5 min, daily charts 15–30 min,
profiles 6 h, search 1 h) to stay within free-tier limits. Failures are never cached.

## Layout

```
backend/Stodash.Api/
  Program.cs                 DI, error handling, CORS, OpenAPI
  Endpoints/                 Route definitions
  Services/MarketDataService Provider choice, fallbacks, mapping, caching
  Providers/                 YahooClient (cookie + crumb handling), FinnhubClient
  Models/                    Response records
  Infrastructure/            Errors and lenient JSON readers
frontend/src/
  App.tsx                    Workspace: panels, command routing, shortcuts
  components/                Command bar, market strip, chart, quote header, chrome
  panels/                    DES, GP and HELP panels
  lib/                       Command parser, formatting, time zones, theme
  api/                       Typed API client
```

## Known limits

- Yahoo's endpoints are unofficial and can change or rate-limit without notice; the Finnhub fallback covers quotes and profiles, not charts.
- Prices are delayed for most exchanges; the "as of" time on each quote shows how fresh it is.
- The cache is in memory, so it resets when the API restarts (SQLite is planned for a later phase).

## Roadmap

1. ~~Foundation: command bar, DES, GP~~ ✅
2. Core research: financial statements (`FA`), news (`N`), SEC filings (`CF`)
3. Live and macro: streaming watchlist (`W`), economics (`ECO`), yield curve (`YC`), `FX`, `CRYPTO`
4. Power features: top news (`TOP`), screener (`EQS`), saved layouts
5. Polish
