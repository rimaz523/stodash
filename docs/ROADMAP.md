# Stodash roadmap and decisions

## Decisions already made (don't re-ask)

| Decision | Choice | Why / note |
|---|---|---|
| Backend | .NET 10 minimal API | User's choice (originally planned as Python/FastAPI) |
| Frontend | React + TypeScript + Vite | User's choice |
| Theme | Modern dark | User picked it over classic Bloomberg black/orange |
| Data | Free sources only | Personal use; no paid feeds, no public deployment |
| Primary source | Yahoo Finance public endpoints | No key needed; unofficial, so keep fallbacks |
| Secondary source | Finnhub (optional key) | Fallback for quotes and profiles; used for news in phase 2 |
| Workflow | Plan, then one phase at a time, checking in after each | User prefers to review between phases |
| Panels | Max 4; Enter = active panel, Shift+Enter = new | Bloomberg-like "load into current window" |
| FA depth | ~15–20 key rows per statement + an "expand" toggle for all rows | User's choice (phase 2) |
| FA source | Yahoo fundamentals-timeseries first, SEC companyfacts fallback | quoteSummary statement modules are too sparse |
| News | Yahoo always; Finnhub merged in when a key is set | User wants free services only; Finnhub's free plan qualifies |
| SEC contact | `Sec:UserAgent` in user-secrets, never committed | SEC requires a contact email; it's set on the user's machine |
| Database | SQL Server via EF Core: LocalDB now, Azure SQL when hosted | User's choice (phase 3) over SQLite: same engine and migrations locally and on Azure |
| Watchlists | Several named lists, each owned by a `UserId` (a fixed "local" user until sign-in exists) | Ready for sign-in without a schema change |
| Hosting (future) | Azure, signed-in users only: the owner plus one or two invited people | Never public. Yahoo/Finnhub terms are personal-use, so revisit data sources before inviting anyone |
| FRED key | `Fred:ApiKey` in user-secrets (empty placeholder in appsettings) | User will add the key later; ECO shows a "not configured" state until then |
| EQS data | Bulk snapshot, never per-screen provider calls | User's choice (phase 4): S&P 500 list daily + Yahoo batch quotes (5 calls), kept in SQL, refreshed in the background |
| Saved layouts | In the database, per `UserId` | User's choice (phase 4) over localStorage, so they're ready for sign-in |
| Phase 4 order | All of TOP, EQS and layouts at once | User's choice |

## Free data sources (researched)

| Source | Gives | Key | Free-tier limit (approx., check current terms) |
|---|---|---|---|
| Yahoo Finance (direct HTTP) | Quotes, history, fundamentals, profiles, search, options | No | Unofficial; rate-limits without warning |
| Finnhub | Real-time US quotes, news, profiles, earnings calendar, WebSocket trades | Yes | ~60 calls/min |
| FRED (St. Louis Fed) | 800k+ economic series: CPI, rates, GDP, unemployment, yields | Yes (free) | Generous |
| SEC EDGAR | Filings list, XBRL "company facts" financials | No | Must send a User-Agent with contact info; ~10 req/s |
| US Treasury Fiscal Data | Treasury yields, auctions | No | — |
| CoinGecko | Crypto prices, market caps | Optional demo key | ~30 calls/min |
| Frankfurter | ECB FX reference rates | No | — |
| RSS (CNBC, MarketWatch, Yahoo, Investing.com) | Headlines | No | — (Reuters closed its feeds in 2020; WSJ's markets feed is stale) |
| datasets/s-and-p-500-companies (GitHub) | S&P 500 constituents with GICS sectors (CSV) | No | — |
| Alpha Vantage / Twelve Data / FMP / Tiingo / Polygon | Alternates | Yes | Tight free tiers; use only as fallbacks |

## Phases

### Phase 1: Foundation ✅ done
Command bar with autocomplete and history; `DES` (quote, ranges, ~25 key stats, profile, officers); `GP`
(9 ranges, candles/line, SMA 20/50, volume, legend, prev-close line on 1D, exchange-time axis); market strip
(11 instruments); world clocks; status bar with API health; HELP; CLEAR; up to 4 panels saved in localStorage;
Alt+1–4; Enter on a company name opens the best match. Verified in a browser.

### Phase 2: Core research ✅ done
Built as planned below, with Yahoo fundamentals-timeseries (not quoteSummary) as FA's main source. Extras: the `FA Q`
shortcut, a YoY/QoQ Change column, ratios (margins, growth, ROE/ROA, D/E, current ratio), filing categories with
counts, and 8-K item descriptions. Verified in a browser.
- `FA`: financial statements (income, balance sheet, cash flow; annual and quarterly toggle) plus key ratios.
  Source: Yahoo `quoteSummary` modules `incomeStatementHistory`, `balanceSheetHistory`, `cashflowStatementHistory`
  (and `*Quarterly`), or the Yahoo fundamentals-timeseries endpoint. Fallback: SEC EDGAR `companyfacts` for US
  companies (needs ticker→CIK mapping from `https://www.sec.gov/files/company_tickers.json`, cached daily).
- `N`: company news. Source: Finnhub `company-news` (needs a key), with Yahoo search's `news` array as the keyless fallback.
  Show headline, source, time ago, and a link that opens in a new tab.
- `CF`: SEC filings list (10-K, 10-Q, 8-K, …) with form-type filter chips and links to EDGAR. Source:
  `https://data.sec.gov/submissions/CIK##########.json`. A User-Agent header with contact info is required; make it
  configurable in appsettings (`Sec:UserAgent`) instead of hard-coding the user's email.
- Add a simple provider-health line to `/api/health`.

### Phase 3: Live and macro ✅ done
Built as planned below, in one go, and verified in a browser plus 52 mocked and 8 live Playwright tests. Notes:
- On ARM64 Windows, LocalDB (x64-only) is reached through its named pipe, which `LocalDbPipe` looks up and refreshes.
- Clicking a row in W, FX or CRYPTO opens it in another panel so the list stays visible.
- `W <function>` (e.g. `W DES`) is the ticker W (Wayfair), not the watchlist command.
- ECO is built and tested against fakes. It needs the user's FRED key before it shows real data.

Plan as written:
- `W`: several named watchlists, stored in SQL Server (LocalDB) with live quotes through Finnhub WebSocket,
  relayed by a backend WebSocket `/ws/quotes` so the key stays server-side. Falls back to polling.
  First run creates a "Main" list with the Magnificent 7: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA.
- `ECO`: macro dashboard from FRED, 9 tiles: CPI YoY, core PCE YoY, unemployment, fed funds, real GDP growth, 10Y-2Y,
  30-year mortgage rate, initial jobless claims, consumer sentiment (U. of Michigan).
- `YC`: US Treasury yield curve (today against 1 month and 1 year ago). Source: Treasury's daily CSV, no key.
- `FX`: 8 pairs against USD (EUR, GBP, JPY, CHF, CAD, AUD, NZD, CNY) plus a cross-rate matrix (Yahoo `=X`,
  Frankfurter fallback). `CRYPTO`: top coins (CoinGecko, no key needed).
- Persist the cache in SQL Server so it survives restarts, behind an interface so hosting can swap it for Redis.

### Phase 4: Power features ✅ done
Built as planned below, all at once, and verified in a browser plus 81 mocked and 11 live Playwright tests. Notes:
- `TOP` reads CNBC, MarketWatch, Yahoo Finance (^GSPC headlines) and Investing.com RSS, plus Finnhub general news
  with a key. Each item's `provider` is its feed (the panel's filter chips); a failing feed is listed in `failed`.
- `EQS` screens a snapshot: the S&P 500 CSV from github.com/datasets (24 h, durable) joined with Yahoo's v7 batch quote
  (needs the crumb, 100 symbols per call). `ScreenerService` is a singleton: it serves stale-while-refreshing after
  15 min, and `ScreenerRefresher` rebuilds it daily. Filters and sorting run on the backend.
- `LAYOUT` stores the frontend's workspace JSON in `SavedLayouts` (per `UserId`); the backend only checks its outline.
  Commands: `LAYOUT`, `LAYOUT SAVE name`, `LAYOUT name`, `LAYOUT DEL name`. `LAYOUT DES` is a ticker, like `W DES`.
- Panels resize by dragging (or arrow keys on a focused divider); sizes live in the workspace and in saved layouts.
- New shortcuts: Alt+M maximize, Alt+X close, Alt+[ / Alt+] move, Alt+, / Alt+. cycle, Alt+L layouts,
  Alt+Shift+1–9 load layout n, ? help.

Plan as written:
- `TOP`: top market headlines (RSS + Finnhub general news).
- `EQS`: screener over a preset universe (S&P 500 list, refreshed daily) with filters (P/E, market cap, sector, % change).
- Saved layouts (named workspaces), more keyboard shortcuts, resizable panels.

### Phase 5: Polish (next)
Error and empty states, loading skeletons everywhere, theme tweaks, accessibility pass, README and screenshots,
and optionally backend unit tests (xUnit) for the mappers and the command parser.

### Later: Azure hosting and sign-in (not scheduled)
Host on Azure (App Service + Azure SQL) for the owner and one or two invited people, with Microsoft Entra ID sign-in.
Watchlists already carry a `UserId`. Before inviting anyone, replace or restrict the personal-use sources
(Yahoo, Finnhub free tier) for those users.

## Out of scope
Trading or order execution, paid real-time data, public hosting or open sign-up, and deep bond or options analytics.
