# Miyako Architecture

This document summarizes the refactored structure and design conventions.

## Goals
- Uniform UI styling (centralized embed helpers)
- Clear layering: commands -> services -> utils -> storage (JSON files)
- Easier future migration to database or caching layer
- Maintain CommonJS for compatibility

## Layers
1. Commands (`commands/`): Parse user input, orchestrate services, assemble responses.
2. Services (`services/`): High-level domain operations (status, economy, leveling). Thin wrappers now; can add caching, batching, analytics later.
3. Utils (`utils/`): Low-level modules (file-backed persistence, embed helpers, logging, scheduling, events).
4. Config (`config/`): JSON state and configuration snapshots.

## Key Services
- `statusService`: Startup/shutdown announcements and channel name updates.

## UI Conventions (Semantic Layer)
All interactive UIs use `utils/ui.js` helpers:
* `semanticButton(kind, opts)` enforces styling (nav, primary, success, danger, toggle) and auto Title-Case labels.
* Back buttons are suppressed globally (inline expansion pattern replaces hierarchical back navigation).
* `applyToggleVisual(embed,{on})` standardizes success/neutral coloring + ✅/❌ prefix.
* `getToggleVisual(on)` central mapping for emoji/color/prefix.
* `buildSettingEmbedUnified` builds per-setting embeds with optional toggle state and last-updated metadata.

### Inline Expansion Pattern
Menus (config, schedule; others in progress) render all navigation context inline:
1. Category rows always visible (no hidden stack).
2. Selecting a category adds setting rows beneath without destroying category context.
3. Selecting a setting adds its action rows while preserving above rows.
4. No empty component rows permitted (health check enforces).

### Toggle Registry
`registerToggle({ key, getter, kind, on })` records boolean or mode states for uniform UI updates and future automation (bulk refresh, analytics, tests).

## Error & Crash Pipeline
* Early `crashReporter.initEarly()` attaches uncaught/unhandled/signal handlers before other imports.
* `errorUtil` wraps and persists errors (bounded retention) and supports live listener embeds.
* Instrumentation layer in `interactionEvents` logs deprecated `ephemeral` usage to trace regressions.

## Health Checks
`utils/health.runHealthChecks()` validates:
* Event anchor messages (existence & Midnight Bar button repair, timestamp auto-fix).
* Staff team message regeneration.
* ActiveMenus snapshot: no stale expired sessions and no rows with zero components.

## Performance Notes
* Write queue batches JSON persistence.
* Leaderboard service caches sorted data for short TTL.
* Planned: diff-aware component update helper to reduce interaction edit churn (placeholder; not yet implemented).

## Testing Aids
Minimal Jest tests cover leveling progression, tax calculation, leaderboard caching, VC leveling, XP modifier streak. Future: embed/toggle diagnostics command verifying capitalization & indicator compliance.
- `economyService`: Deposit / withdraw orchestration and aggregate balances.
- `levelingService`: XP & levels access (text + VC) + message handling entry point.
- `scheduleService`: Thin facade over scheduler + schedule/event storage (enables future validations & caching).
- `leaderboardService`: 5s TTL cached leaderboard construction (text + VC) to avoid repeated full sorts.

## Embed Standardization
All embeds originate via `utils/embeds.js` (`createEmbed`, `successEmbed`, etc.). Field additions must use `safeAddField` or `addChunkedField` for safety.

## Active Menus
`utils/activeMenus.js` manages interactive state. Commands register handlers with a session descriptor. Services should remain stateless relative to session objects.

## Scheduling & Events
`utils/scheduler.js` runs periodic dispatch for schedules and multi-daily events. `scheduleService` wraps start + compute helpers and exposes event CRUD used by `schedule` command.

## Economy
- `utils/cash.js`, `utils/bank.js` perform file-backed persistence with debounce writes.
- Progressive tax logic lives in `bank.js`; service exposes simplified operations.

## Leveling
- XP accrual throttled per-user (60s) with streak-based multiplier.
- Level XP curve: `xpForLevel(level) = 150 * level^(1/0.7)`.

## Future Enhancements
- Potential DB migration (introduce adapters under a `data/` layer) if JSON scaling becomes limiting.
- Optional extended metrics collection (message XP distribution, bank tax histograms) feeding analytics service.
- Snapshot diffing for leaderboards if generating large paginated variants for external export.

## Error Handling
- Central utility: `utils/errorUtil.js`.
- Errors (console, uncaughtException, unhandledRejection, explicit logError calls) are captured and appended to `config/errorLog.json` (rotating; max ~500 kept).
- On startup a summary of the latest errors (up to 5) is appended to the status/startup embed; log then cleared (toggle via future retention flag if needed).

## Deployment Notes
- Graceful shutdown flushes pending queued writes (`writeQueue.flushAll`) before exit, then emits shutdown message via status service.
- Level + VC level persistence now batched via writeQueue (250ms coalescing) to reduce sync fs churn.
- Restart logic includes inline changelog summary.

---
This file will evolve as new services or caching layers are added.
