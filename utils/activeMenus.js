const fs = require("fs");
const path = require("path");

const SESSIONS_FILE = path.resolve(__dirname, "../config/buttonSessions.json");

// Handlers by session.type
const handlers = new Map();
// Sessions in memory keyed by messageId
const sessions = new Map();
// Timers by messageId
const timers = new Map();

// Build a single disabled "Timed out — use command again" row
function timeoutRow() {
  return [{
    type: 1,
    components: [{
      type: 2,
      custom_id: "timeout",
      label: "Timed out — use command again",
      style: 2,
      disabled: true
    }]
  }];
}

function loadSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")) || {};
  } catch { return {}; }
}

function saveSessions() {
  try {
    const obj = {};
    for (const [messageId, s] of sessions.entries()) {
      obj[messageId] = { ...s, // strip functions/timers
        // keep only serializable data
        client: undefined
      };
    }
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch {}
}

function scheduleTimer(client, messageId) {
  const existing = timers.get(messageId);
  if (existing) clearTimeout(existing);
  const s = sessions.get(messageId);
  if (!s) return;

  const delay = Math.max(0, s.expiresAt - Date.now());
  const t = setTimeout(async () => {
    timers.delete(messageId);
    // If still present and expired, disable the UI
    const sess = sessions.get(messageId);
    if (!sess || Date.now() < sess.expiresAt) return;

    try {
      const channel = await client.channels.fetch(sess.channelId).catch(() => null);
      const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (msg) await msg.edit({ components: timeoutRow() }).catch(() => {});
    } finally {
      sessions.delete(messageId);
      saveSessions();
    }
  }, delay);
  if (typeof t.unref === "function") t.unref();
  timers.set(messageId, t);
}

async function init(client) {
  // Load persisted sessions and disable any already-expired UIs
  const raw = loadSessions();
  for (const [messageId, s] of Object.entries(raw)) {
    const expired = !s.expiresAt || s.expiresAt <= Date.now();
    sessions.set(messageId, { ...s });
    if (expired) {
      // Best-effort disable
      try {
        const channel = await client.channels.fetch(s.channelId).catch(() => null);
        const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (msg) await msg.edit({ components: timeoutRow() }).catch(() => {});
      } catch {}
      sessions.delete(messageId);
    } else {
      scheduleTimer(client, messageId);
    }
  }
  saveSessions();
}

function registerHandler(type, fn) {
  handlers.set(type, fn);
}

function registerMessage(message, session) {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  sessions.set(message.id, {
    type: session.type,
    userId: session.userId || null,
    guildId: message.guildId || null,
    channelId: message.channelId,
    expiresAt,
    data: session.data || {}
  });
  saveSessions();
  // schedule when client attached via processInteraction
}

function snapshotSessions() {
  const out = [];
  for (const [id, s] of sessions.entries()) {
    out.push({ id, type: s.type, userId: s.userId, channelId: s.channelId, expiresIn: s.expiresAt - Date.now() });
  }
  return out.sort((a,b)=>a.expiresIn - b.expiresIn);
}

async function processInteraction(interaction) {
  const messageId = interaction.message?.id;
  if (!messageId) return { handled: false };

  const sess = sessions.get(messageId);
  if (!sess) {
    // Exemption: allow certain global/permanent buttons to function forever without being force-disabled
    // Currently needed for event notification signup buttons (custom_id starts with 'event_notify_').
    if (interaction.isButton && interaction.isButton() && interaction.customId && interaction.customId.startsWith('event_notify_')) {
      return { handled: false }; // let upstream interaction handler process it; do NOT timeout
    }
    // If message is older than 5 minutes AND was originally a managed session, we would normally disable it.
    // Since we don't have a session record, conservatively leave it alone to avoid breaking long-lived utility buttons.
    // (Previous behavior force-disabled ANY unknown older message.)
    return { handled: false };
  }

  // Expired? disable and stop
  if (Date.now() > sess.expiresAt) {
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.update({ components: timeoutRow() });
      } else {
        const channel = await interaction.client.channels.fetch(sess.channelId).catch(() => null);
        const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (msg) await msg.edit({ components: timeoutRow() }).catch(() => {});
      }
    } catch {}
    sessions.delete(messageId);
    saveSessions();
    return { handled: true };
  }

  // Renew window on every press
  sess.expiresAt = Date.now() + 5 * 60 * 1000;
  sessions.set(messageId, sess);
  saveSessions();
  scheduleTimer(interaction.client, messageId);

  // Route to handler
  const fn = handlers.get(sess.type);
  if (!fn) return { handled: false };
  await fn(interaction, { ...sess, id: messageId });
  return { handled: true };
}

module.exports = {
  init,
  registerHandler,
  registerMessage,
  processInteraction,
  snapshotSessions,
  // expose standardized timeout row for other ephemeral collectors
  timeoutRow
};
