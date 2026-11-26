---
name: verify-stodash
description: Build, run and smoke-test Stodash (the .NET API and the React frontend) before calling a change done. Use after any code change, when asked to run or start the app, or when something looks broken.
---

# Verify Stodash

Run from the repo root. All shell examples are PowerShell (the user is on Windows).

## 1. Static checks (must all be clean)

```powershell
dotnet build Stodash.slnx
dotnet test backend/Stodash.Api.Tests
```
Expect `0 Warning(s)`, `0 Error(s)` and `Passed!`. If the API is running, the build can't overwrite its exe: stop it first.

```powershell
cd frontend; npx tsc -b; npx oxlint src; npx vite build
```
`tsc` and `oxlint` print nothing on success, and `vite build` ends with `✓ built`.

If `frontend/node_modules` is missing, run `npm install` in `frontend` first.

```powershell
cd frontend; npm run test:e2e
```
All Playwright tests must pass (mocked API, no backend needed). If Chromium is missing, run
`npx playwright install chromium`. With the servers running (step 2), `npm run test:e2e:live` also checks real data.

## 2. Start both servers

The easiest way is `.\scripts\start.ps1 -NoBrowser`, which waits until both answer. Stop them afterwards with
`.\scripts\stop.ps1`. Or start them manually in the background:

```powershell
dotnet run --project backend/Stodash.Api
```
```powershell
cd frontend; npm run dev
```
The API runs on http://localhost:5080 and the web app on http://localhost:5173. If port 5080 is taken, an old API
is still running, so stop it rather than changing ports.

## 3. API smoke test

```powershell
curl.exe -s localhost:5080/api/health
curl.exe -s "localhost:5080/api/health?check=true"   # every configured provider/key: ok, failed (why) or skipped
curl.exe -s localhost:5080/api/quote/AAPL
curl.exe -s "localhost:5080/api/history/AAPL?range=1D"
curl.exe -s localhost:5080/api/profile/MSFT
curl.exe -s "localhost:5080/api/search?q=nvid"
curl.exe -s "localhost:5080/api/quotes?symbols=^GSPC,EURUSD=X,BTC-USD"
curl.exe -s -o NUL -w "%{http_code}" localhost:5080/api/quote/ZZZZZZ    # expect 404
curl.exe -s -o NUL -w "%{http_code}" "localhost:5080/api/history/AAPL?range=7X"  # expect 400
curl.exe -s localhost:5080/api/watchlists          # needs LocalDB; first call creates "Main" (Magnificent 7)
curl.exe -s localhost:5080/api/yieldcurve
curl.exe -s localhost:5080/api/fx
curl.exe -s localhost:5080/api/crypto
curl.exe -s localhost:5080/api/eco                 # configured=false with a note when there's no FRED key
curl.exe -s localhost:5080/api/topnews             # headlines; "failed" lists feeds that didn't answer
curl.exe -s "localhost:5080/api/screener?sector=Energy&limit=5"   # first call after a fresh DB builds the snapshot (~3 s)
curl.exe -s localhost:5080/api/layouts             # needs LocalDB; don't leave test layouts behind
```
Check for any new endpoint as well. A 502 means the provider failed. Yahoo may be rate-limiting, or its crumb flow
may have changed (see CLAUDE.md). A 503 on watchlists means the database is unreachable: run
`sqllocaldb start MSSQLLocalDB`, and on ARM64 check the "Using LocalDB instance ... through np:" line in the API log.
Don't leave test data in the user's watchlists: undo any adds, renames or reorders you make while checking.

## 4. In the browser (http://localhost:5173)

- The default layout loads (AAPL DES + AAPL GP), the market strip fills in, and the status bar says "API connected".
- Type `tesla` and press Enter: it opens TSLA. `MSFT GP 1Y` then Shift+Enter opens a new panel.
- `AAPL XYZ` shows an inline "Unknown function" error. `ZZZZQQ` shows "Couldn't load" inside the panel.
- `^GSPC GP 1D` shows an intraday line or candles with a dashed prev-close line, and the axis is in New York time.
- Hovering the chart updates the legend, and Line, SMA and Volume toggles work. `HELP` opens the help panel.
- `W` shows the watchlist with "Live" (US market hours, Finnhub key) or "Polling". `W ADD AMD` then `W DEL AMD` both
  report success. `W DES` opens Wayfair, not watchlists.
- `YC`, `FX` and `CRYPTO` fill in. `ECO` shows tiles, or the FRED setup hint without a key. Clicking a row in W, FX or
  CRYPTO opens it in another panel.
- The browser console has no errors other than expected 404s from deliberate bad-ticker tests.
- Exercise whatever you just changed.

## 5. Report

Say what you checked and what you couldn't (for example, data looks stale because the market is closed). Stop
any servers you started unless the user wants them left running.
