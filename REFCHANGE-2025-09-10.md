# REFCHANGE — 2025-09-10

Scope: idempotent attach, TTL-based send guards, scheduler/manual trigger dedup, small unit test.

Changes
- events/interactionEvents.js
  - Add client.__interactionListenerAttached sentinel to avoid double registration of interactionCreate.
- utils/sendOnce.js (new)
  - Small in-memory TTL guard: seenRecently(key, ttlMs) used to prevent rapid duplicate sends.
- utils/scheduler.js
  - runScheduleOnce(): uses TTL guard keyed by schedule + channel to avoid rare double fires due to drift.
  - autoMessages loop: add TTL guard per (eventId, notifId, time, channel) before sending. Keep existing 60s per-fireKey protection.
  - Preserve existing clock-in dedup (lastSentTs + message age) and pruning.
- commands/schedule.js
  - manualTriggerAutoMessage(): add TTL send guard for rapid double-clicks; no behavior change otherwise.
- __tests__/sendOnce.test.js (new)
  - Unit test validating TTL guard behavior.

Notes
- Guards are in-memory and per-process; if you run multiple instances, consider a shared store (Redis) for cross-process dedup.
- TTLs used: 7–8 seconds for manual/scheduled sends; clock-in keeps 5-minute window via existing state.
- No user-visible changes except fewer accidental duplicates under race conditions.

Quality gates
- Build: N/A (Node runtime)
- Lint/Typecheck: N/A (no TS)
- Tests: jest run expected to pass for new test.

