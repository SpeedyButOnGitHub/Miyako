# Miyako

A modular Discord bot for moderation, leveling, and utilities.

## Quick start

1. Install dependencies

```powershell
npm install
```

2. Configure environment

- Copy `.env.example` to `.env` and fill in your values.
- Ensure your log channel IDs in `utils/logChannels.js` match your server.

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
