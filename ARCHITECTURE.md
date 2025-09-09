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

## Embed Standardization
All embeds originate via `utils/embeds.js` (`createEmbed`, `successEmbed`, etc.). Field additions must use `safeAddField` or `addChunkedField` for safety.

## Active Menus
`utils/activeMenus.js` manages interactive state. Commands register handlers with a session descriptor. Services should remain stateless relative to session objects.

## Scheduling & Events
`utils/scheduler.js` runs periodic dispatch for schedules and multi-daily events. A thin `scheduleService` now wraps start + compute helpers to decouple commands from raw utils and stage future expansion (conflict detection, validation, caching).

## Economy
- `utils/cash.js`, `utils/bank.js` perform file-backed persistence with debounce writes.
- Progressive tax logic lives in `bank.js`; service exposes simplified operations.

## Leveling
- XP accrual throttled per-user (60s) with streak-based multiplier.
- Level XP curve: `xpForLevel(level) = 150 * level^(1/0.7)`.

## Future Enhancements
- Add cache invalidation + snapshot diff for heavy read modules (leaderboard snapshots).
- Expand queued write system (writeQueue) to all JSON persistence; currently bank & cash use it (now flushed on shutdown).
- Introduce a `data/` adapter layer abstracting JSON vs. DB.
- Add broader test harness (tax edge bands, VC vs text leveling, schedule calculations).

## Error Handling
- Central utility: `utils/errorUtil.js` (extend with structured logging if needed).

## Deployment Notes
- Graceful shutdown now flushes any pending queued writes (`writeQueue.flushAll`) before exit, then emits shutdown message via status service.
- Restart logic includes inline changelog summary.

---
This file will evolve as new services or caching layers are added.
