# Miyako

A modular Discord bot for moderation, leveling, and utilities.

## Quick start

1. Install dependencies

```powershell
npm install
```

2. Configure environment

- Copy `.env.example` to `.env` and fill in your values.
- Ensure your log channel IDs in `src/utils/logChannels.js` match your server.

3. Run a quick smoke test (loads modules only)

```powershell
npm run smoke
```

4. Start the bot

```powershell
npm start
```

## Commands

- `.help` — interactive help menu
- `.config` — owner-only config menu
- `.level`, `.profile`, `.leaderboard` — leveling
- `.mute`, `.unmute`, `.timeout`, `.untimeout`, `.ban`, `.kick`, `.warn`, `.removewarn`, `.warnings` — moderation
- `.snipe`, `.ds` — snipes
- `.schedule` — schedules (owner)
- `.scripts` — JS files leaderboard

## Notes

- Testing Mode banner and config changes are logged to the config log channel.
- Interactive menus time out and are cleaned up on restart.
- Services layer introduced (see ARCHITECTURE.md) for status, economy, and leveling to simplify future caching or DB migration.

## Development

Start the bot:

```powershell
npm start
```

Run module smoke load only:

```powershell
npm run smoke
```

### Pre-commit guard (ephemeral deprecation)

Discord.js v14 deprecates `ephemeral:true` in favor of interaction `flags` (64). A helper shim converts, but new code should use `flags: 1<<6` directly.

Add a local pre-commit hook to block deprecated usage:

```powershell
echo node scripts/check-ephemeral.js > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook aborts the commit if any `ephemeral:true` remains.

## Project layout

- `src/` — primary code (commands, services, utils, events)
- `config/` — JSON-backed state and settings
- `scripts/` — maintenance and export scripts

Note: The old root-level modules have been migrated; the temporary `legacy/` folder is no longer used and can be safely removed.

### Dev mode

- To auto-restart on changes (excluding config JSON), use:
	- `npm run start:dev`
	- Nodemon watches `src/` and ignores `config/*.json` to avoid restart storms while state files change.
