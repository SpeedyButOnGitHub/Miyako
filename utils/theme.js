// Centralized theme: colors and emojis used across embeds (now supports external override config/theme.json)
const fs = require('fs');
const path = require('path');
const { cfgPath } = require('./paths');
let external = null;
try {
  const ext = cfgPath('theme.json');
  if (fs.existsSync(ext)) external = JSON.parse(fs.readFileSync(ext,'utf8'));
} catch { external = null; }

const baseTheme = {
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
    delete: "➖",
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
  }
};

const theme = Object.assign({}, baseTheme, external || {});
theme.color = function(name, fallback = 0x2f3136) { return (theme.colors||{})[name] ?? fallback; };
theme.emoji = function(name, fallback = '❔') { return (theme.emojis||{})[name] ?? fallback; };
module.exports = theme;
