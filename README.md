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

## Startup summary and tests

When the bot starts it runs a small set of non-blocking startup checks and writes a JSON summary to `config/startup-summary.json`.

- The summary includes: timestamp, individual quick-check results, a small changelog snapshot digest (added/removed/modified counts), and a health-check array from `src/utils/health.js`.
- The summary is safe to inspect and will not cause the bot to crash when checks fail.

To run the lightweight startup tests manually (node context required):

```powershell
node -e "require('./src/utils/startupTests').runStartupTests(null).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>console.error(e))"
```

The project also includes Jest tests under `tests/` that cover some startup and interaction flows. Run them with:

```powershell
npm test
```

## Running as a background service

Recommended: use pm2 for cross-platform background running and log rotation.

- Install pm2 globally:

```powershell
npm i -g pm2
pm2 install pm2-logrotate
```

- Start with the provided ecosystem file:

```powershell
pm2 start ecosystem.config.js --env production
```

- Useful pm2 commands:

```powershell
pm2 status
pm2 logs miyako-bot
pm2 restart miyako-bot
pm2 stop miyako-bot
```

Windows alternative: if you prefer a Windows service, use NSSM (Non-Sucking Service Manager) or a Scheduled Task to run `node index.js` at startup. Configure log rotation by pointing logs to a folder and using a scheduled PowerShell script to rotate or compress them periodically.

If you'd like, I can add a sample PowerShell script and NSSM instructions for installing the bot as a service.

