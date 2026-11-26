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
   config, and the key read from user-secrets or env. Map transport failures, timeouts and 429s to
   `UpstreamException`, and "no such symbol" to `SymbolNotFoundException`.
3. **Service:** add a method to `Services/MarketDataService.cs` (or a sibling service for macro/news data).
   - Call `NormalizeSymbol` first for ticker functions.
   - Wrap in `Cached(key, ttl, …)` with a sensible TTL. Never cache failures.
   - Map JSON with the lenient `J.Num / J.Str / J.Long` helpers.
   - Add a fallback provider when one exists (`catch (UpstreamException) when (other.IsConfigured)`).
4. **Endpoint:** add `api.MapGet(...)` in `Endpoints/MarketEndpoints.cs` with `.WithSummary(...)`.
5. `dotnet build backend/Stodash.Api` must give 0 warnings and 0 errors. Curl the endpoint, including a bad symbol (expect 404)
   and bad input (expect 400).

## Frontend (`frontend/src`)

6. **Types:** mirror the records in `api/types.ts` (camelCase), with the same unit comments.
7. **Client:** add a method to `api` in `api/client.ts`, URL-encoding user input with `enc`.
8. **Command registry** in `lib/commands.ts`:
   - Ticker function: add to `FUNCTIONS` (`label`, `hint`). `FunctionCode` and autocomplete pick it up automatically.
   - Global command: add to `GLOBAL_COMMANDS`, then handle it in `runCommand` in `App.tsx`.
   - If it takes extra args (like GP's range), extend `parseCommand` and `ParsedCommand`.
9. **Panel state:** extend `PanelSpec` in `panels/types.ts` if the panel needs new persisted fields, and widen
   `isWorkspace` in `App.tsx` so saved layouts that use the new kind still validate.
10. **Panel component:** create `panels/<Name>Panel.tsx`.
    - Wrap in `PanelFrame` with `fn`, `PanelTitle` and `FunctionSwitch` (ticker functions).
    - Load with `useApi(key, loader, refreshMs?)`. Show skeletons while loading and `LoadError` on failure.
    - Reuse `QuoteHeader`, the `.section-title` / `.stats` / `.facts` styles, and the formatters in `lib/format.ts`.
    - Put new CSS in `index.css` under a `/* ---- XX panel */` banner, using only theme variables.
11. **Routing:** render the panel for its kind in the `panels.map` in `App.tsx`.
12. **Docs in the app:** add the command to `COMMANDS` in `panels/HelpPanel.tsx`.

## Tests (`frontend/e2e`)

13a. Add the endpoint to `defaultReply` in `e2e/mock-api.ts` with a small typed fixture builder.
13b. Add `e2e/<name>.spec.ts`: happy path, the "doesn't apply" note (if any), an unknown ticker, and a provider
     error via `mock.on(...)`. Add a line to `e2e/live/smoke.spec.ts`. Run `npm run test:e2e`.

## Wrap up

13. Update the README command table and roadmap checkboxes, and `docs/ROADMAP.md`.
14. Run the `verify-stodash` skill. Test the happy path, an unknown ticker, a non-equity (index, FX or crypto),
    and switching the panel between functions.
