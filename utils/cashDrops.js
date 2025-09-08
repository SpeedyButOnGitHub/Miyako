const { addCash, addTestingCash } = require("./cash");
const { config } = require("./storage");
const { TEST_LOG_CHANNEL } = require("./logChannels");

// Simple in-memory drop store per channel
// channelId -> { amount, word, createdAt, expiresAt, claimedBy, testing?: boolean }
const activeDrops = new Map();

// Fun claim words list
const FUN_WORDS = [
  "mochi", "uwu", "sparkle", "vibes", "zoomies", "bonk", "boba", "pudding", "noot", "boop",
  "meow", "purr", "senpai", "neko", "comfy", "snacc", "pog", "yeet", "glow", "shiny",
  "cosmic", "starlit", "sprout", "cozy", "sugar", "sprinkle", "waffle", "pancake", "taco", "nugget",
  "gizmo", "pebble", "bean", "blossom", "bubbles", "crunch", "bling", "zesty", "pep", "swirl",
  "spark", "fizz", "whisk", "minty", "sunny", "honey", "echo", "nova", "ripple", "plush"
];

function pickFunWord() {
  return FUN_WORDS[Math.floor(Math.random() * FUN_WORDS.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function maybeSpawnDrop(message) {
  // Only in guild text channels; obey leveling channel mode as a reasonable proxy
  if (!message.guild || !message.channel || message.author.bot) return null;
  const channelId = message.channel.id;
  // Respect blacklist/whitelist leveling mode
  const mode = config.levelingMode || "blacklist";
  const list = config.levelingChannelList || [];
  if (mode === "blacklist" && list.includes(channelId)) return null;
  if (mode === "whitelist" && !list.includes(channelId)) return null;

  // Don't spawn if a drop is already active in the channel
  const existing = activeDrops.get(channelId);
  if (existing && !existing.claimedBy && existing.expiresAt > Date.now()) return null;

  const e = config.cashDrops || {};
  const chance = typeof e.dropChance === 'number' ? e.dropChance : 0.02;
  if (Math.random() > chance) return null;

  const min = Math.max(0, Math.floor(e.minAmount ?? 25));
  const max = Math.max(min, Math.floor(e.maxAmount ?? 125));
  const amount = randomInt(min, max);
  const now = Date.now();
  const life = Math.max(5000, Math.floor(e.lifetimeMs ?? 60000));
  const word = pickFunWord();
  const drop = { amount, word, createdAt: now, expiresAt: now + life, claimedBy: null };
  activeDrops.set(channelId, drop);
  return drop;
}

function normalizeContent(s) {
  if (!s) return "";
  return String(s).trim().toLowerCase().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '');
}

function tryClaimDrop(message) {
  if (!message.guild || !message.channel || message.author.bot) return null;
  const channelId = message.channel.id;
  const drop = activeDrops.get(channelId);
  if (!drop) return null;
  if (drop.claimedBy) return null;
  if (drop.expiresAt <= Date.now()) {
    activeDrops.delete(channelId);
    return null;
  }
  // Require the user to type the correct fun word to claim
  const content = normalizeContent(message.content);
  if (!content || content !== String(drop.word || "").toLowerCase()) {
    return null; // incorrect message, no claim
  }
  drop.claimedBy = message.author.id;
  activeDrops.set(channelId, drop);
  if (drop.testing) {
    const newBal = addTestingCash(message.author.id, drop.amount);
    return { amount: drop.amount, newBalance: newBal, testing: true };
  }
  const newBal = addCash(message.author.id, drop.amount);
  return { amount: drop.amount, newBalance: newBal };
}

// Explicit test drop spawner for the test channel; does not affect real balances
function spawnTestDrop(amount) {
  const channelId = TEST_LOG_CHANNEL;
  const now = Date.now();
  const e = config.cashDrops || {};
  const life = Math.max(5000, Math.floor(e.lifetimeMs ?? 60000));
  const amt = Math.max(1, Math.floor(Number(amount) || Math.max(0, Math.floor(e.minAmount ?? 25))));
  const word = pickFunWord();
  const drop = { amount: amt, word, createdAt: now, expiresAt: now + life, claimedBy: null, testing: true };
  activeDrops.set(channelId, drop);
  return drop;
}

function cleanupExpiredDrops() {
  const now = Date.now();
  for (const [cid, drop] of activeDrops.entries()) {
    if (drop.expiresAt <= now || drop.claimedBy) {
      activeDrops.delete(cid);
    }
  }
}

let interval = null;
function startCashDrops() {
  if (interval) return;
  interval = setInterval(cleanupExpiredDrops, 30 * 1000);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = {
  startCashDrops,
  maybeSpawnDrop,
  tryClaimDrop,
  spawnTestDrop,
  activeDrops,
};
