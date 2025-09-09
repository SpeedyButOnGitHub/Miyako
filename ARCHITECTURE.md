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
