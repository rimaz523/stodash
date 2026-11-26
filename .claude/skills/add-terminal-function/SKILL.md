---
name: add-terminal-function
description: Checklist for adding a new Stodash terminal function (a ticker command like FA, N or CF, or a global one like ECO, YC or TOP) end to end, across the .NET backend and the React frontend. Use whenever a new command or panel is being added.
---

# Add a terminal function to Stodash

A function is a command the user types (`AAPL FA`, `ECO`) that opens a panel. Adding one touches both halves.
Work through these steps in order, then run the `verify-stodash` skill.

## Backend (`backend/Stodash.Api`)

1. **Model:** add response records to `Models/MarketModels.cs` (or a new file in `Models/`). Use nullable
   fields for anything a provider may omit. Document units in a comment: say whether it's a percent or a fraction.
2. **Provider:** add the raw call to the right client in `Providers/`. If it's a new provider, create a class like
   `FinnhubClient`: a typed `HttpClient` registered with `AddHttpClient<T>` in `Program.cs`, options bound from
   config, and the key read from user-secrets or env (with an empty placeholder in appsettings.json). Simple
   GET-based providers can use `ProviderHttp.GetAsync`, which maps transport failures, timeouts, 429s and 5xx to
   `UpstreamException` and records `ProviderHealth`. Add a name in `ProviderHealth`, to `/api/health`, and to
   `PROVIDERS` / `NAMES` in the frontend. Map "no such symbol" to `SymbolNotFoundException`.
3. **Service:** add a method to `Services/MarketDataService.cs` (or a sibling service for macro/news data).
   - Call `NormalizeSymbol` first for ticker functions.
   - Cache through `IMarketCache.GetOrLoadAsync(key, ttl, load, durable)` with a sensible TTL. Use `durable: true` for
     slow-changing data (it then also survives restarts in SQL), and only on records or classes, never tuples.
     Never cache failures.
   - Map JSON with the lenient `J.Num / J.Str / J.Long` helpers.
   - Add a fallback provider when one exists (`catch (UpstreamException) when (other.IsConfigured)`).
   - User data goes in `Data/StodashDb` (add a migration) and is always filtered by `ICurrentUser`.
4. **Endpoint:** add `api.MapGet(...)` with `.WithSummary(...)`: market data in `Endpoints/MarketEndpoints.cs`,
   market-wide data in `MacroEndpoints.cs`, user data in its own file like `WatchlistEndpoints.cs`.
5. `dotnet build backend/Stodash.Api` must give 0 warnings and 0 errors. Curl the endpoint, including a bad symbol (expect 404)
   and bad input (expect 400).

## Frontend (`frontend/src`)

6. **Types:** mirror the records in `api/types.ts` (camelCase), with the same unit comments.
7. **Client:** add a method to `api` in `api/client.ts`, URL-encoding user input with `enc`.
8. **Command registry** in `lib/commands.ts`:
   - Ticker function: add to `FUNCTIONS` (`label`, `hint`). `FunctionCode` and autocomplete pick it up automatically.
   - Global command (no ticker, like ECO or YC): add to `GLOBAL_COMMANDS`. Arguments go in `parseGlobal`. Keep the
     rule that a function after the word (`W DES`) means a ticker. Handle it in `runCommand` in `App.tsx`, and add
     it to `SINGLE_INSTANCE` there if a second copy makes no sense.
   - If it takes extra args (like GP's range), extend `parseCommand` and `ParsedCommand`.
9. **Panel state:** ticker panels extend `SymbolSpec` and global panels add a member to `GlobalSpec` plus
   `GLOBAL_KINDS` in `panels/types.ts`. `isWorkspace` in `App.tsx` accepts both, so saved layouts still validate.
   Validate any persisted setting when rendering (fall back to a default).
10. **Panel component:** create `panels/<Name>Panel.tsx`.
    - Wrap in `PanelFrame` with `fn`, `PanelTitle` and `FunctionSwitch` (ticker functions).
    - Load with `useApi(key, loader, refreshMs?)`. Show skeletons while loading, `LoadError` with `onRetry={x.reload}` on
      failure, a real empty state, and pass `stale={staleOf(...)}` to `PanelFrame`.
    - Rows that open something use `openRowProps` from `lib/rows.ts` (click, Enter, Shift+Enter).
    - Colors only from CSS tokens (both themes); charts via `chartTheme()`. Add the panel to `e2e/a11y.spec.ts`.
    - Reuse `QuoteHeader`, the `.section-title` / `.stats` / `.facts` styles, and the formatters in `lib/format.ts`.
    - Put new CSS in `index.css` under a `/* ---- XX panel */` banner, using only theme variables.
11. **Routing:** render the panel for its kind in the `panels.map` in `App.tsx`. A panel that lists symbols opens
    them with `openFrom(p.id)`, so clicking a row never replaces the list itself.
12. **Docs in the app:** add the command to `COMMANDS` in `panels/HelpPanel.tsx`.

## Tests (`frontend/e2e`)

13a. Add the endpoint to `defaultReply` in `e2e/mock-api.ts` with a small typed fixture builder.
13b. Add `e2e/<name>.spec.ts`: happy path, the "doesn't apply" note (if any), an unknown ticker, and a provider
     error via `mock.on(...)`. Add a line to `e2e/live/smoke.spec.ts`. Run `npm run test:e2e`.

## Wrap up

13. Update the README command table and roadmap checkboxes, and `docs/ROADMAP.md`.
14. Run the `verify-stodash` skill. Test the happy path, an unknown ticker, a non-equity (index, FX or crypto),
    and switching the panel between functions.
