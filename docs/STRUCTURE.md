# Project Structure (Phase 2 Refactor)

```
Miyako/
  config/            # Static configuration & templates (non-volatile)
  data/              # Runtime mutable JSON (migrated from config/) via runtimeFile()
  logs/              # Rotating structured logs (bot.log + archives)
  src/
    ui/              # Presentation layer (embeds, theme, ui helpers)
    commands/        # Command handlers (.balance, .cash, .schedule, etc.)
    events/          # Discord event wiring (message, interaction, guild)
    services/        # Domain services (leaderboards, banking, leveling)
    utils/           # Cross-cutting utilities (storage, paths, logger, queue)
  scripts/           # One-off or operational scripts (migration, export, smoke)
  tests/             # Jest test suites
  legacy/            # Archived legacy code (not loaded at runtime)
  docs/              # Documentation (this file, architecture notes)
```

## Key Concepts

- runtimeFile(name): Resolves mutable JSON to /data with backward-compatible read from /config until migrated.
- logger: Structured JSONL logging with size-based rotation; debug gated by config.debugMode.
- ActiveMenus: Central ephemeral UI/session tracking with persistent state.
- Clock-In System: Event auto-message + interaction fallback heuristics (message id, notif id, channel affinity) to eliminate "Event missing" cases.
- Testing Mode: Overlay economies (testingCash/testingBank), seeded warnings, sanitized mention outputs.

## Migration Notes

On startup, `scripts/migrate-runtime-data.js` copies first-time runtime JSON from `config/` to `data/` if not already present. Safe & idempotent.

## Next Planned Steps (Phase 3+)

- Move additional presentation helpers from utils/ui.js fully into src/ui.
- Centralize command logging & scheduler instrumentation using logger (partial).
- Consolidate leaderboard & XP bar builders.
- Expand docs with service-specific READMEs.

```

```
