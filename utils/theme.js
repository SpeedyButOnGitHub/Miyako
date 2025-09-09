// Centralized theme: colors and emojis used across embeds
const theme = {
  colors: {
    primary: 0x5865F2,
    success: 0x00ff00,
    warning: 0xffd700,
    danger: 0xff5555,
    neutral: 0x2f3136,
  },
  emojis: {
    // Generic status
    info: "ℹ️",
    success: "✅",
    warn: "⚠️",
    danger: "🚨",
    error: "❌",
    // Time / meta
    duration: "⏰",
    counter: "🧮",
    id: "🆔",
    // CRUD / navigation
    create: "➕",
    delete: "🗑️",
    back: "⬅️",
    select: "🎯",
    events: "📅",
    times: "🕒",
    days: "📅",
    message: "📝",
    enable: "✅",
    disable: "🛑",
    toggle: "🔁",
    settings: "⚙️",
    edit: "✏️",
    // Profile / leveling / economy
    profile: "👤",
    rank: "📊",
    leaderboard: "🏆",
    bank: "🏦",
    cash: "💸",
    deposit: "📈",
    withdraw: "📉",
    vc: "🎙️",
    text: "💬",
    // Moderation / targets
    action: "🧰",
    target: "🎯",
    moderator: "🛡️",
    mute: "🔇",
    unmute: "🔊",
    kick: "👢",
    ban: "🔨"
  },
  color(name, fallback = 0x2f3136) { return this.colors[name] ?? fallback; },
  emoji(name, fallback = "❔") { return this.emojis[name] ?? fallback; }
};

module.exports = theme;
