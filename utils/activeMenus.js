const fs = require("fs");
const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const ACTIVE_FILE = path.resolve(__dirname, "../config/buttonSessions.json");

// In-memory state
const sessions = new Map(); // messageId -> { channelId, guildId, type, userId?, data, expiresAt }
const timers = new Map(); // messageId -> timeout
const handlers = new Map(); // type -> async (interaction, session) => void
let clientRef = null;

function loadFile() {
  try {
    if (!fs.existsSync(ACTIVE_FILE)) return [];
    const raw = fs.readFileSync(ACTIVE_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFile() {
  const arr = Array.from(sessions.values());
  try {
    fs.writeFileSync(ACTIVE_FILE, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error("[ActiveMenus] save error", e);
  }
}

function setExpiryTimer(messageId) {
  clearExpiryTimer(messageId);
  const sess = sessions.get(messageId);
  if (!sess || !clientRef) return;
  const delay = Math.max(0, sess.expiresAt - Date.now());
  const t = setTimeout(async () => {
    try {
      await expireSession(messageId);
    } catch (e) {
      // ignore
    }
  }, delay);
  if (typeof t.unref === "function") t.unref();
  timers.set(messageId, t);
}

function clearExpiryTimer(messageId) {
  const t = timers.get(messageId);
  if (t) {
    try { clearTimeout(t); } catch {}
    timers.delete(messageId);
  }
}

async function expireSession(messageId) {
  const sess = sessions.get(messageId);
  if (!sess) return;
  // Edit message components to disabled "Timed out" buttons
  try {
    const channel = await clientRef.channels.fetch(sess.channelId).catch(() => null);
    const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (msg) {
      const disabledRows = (msg.components || []).map(row => {
        const newRow = new ActionRowBuilder();
        // @ts-ignore - access components
        const comps = row.components || [];
        comps.forEach(c => {
          if (c?.data?.type === 2 || c?.type === 2 || c?.customId) {
            const bb = new ButtonBuilder()
              .setCustomId(c.customId || "expired")
              .setLabel("Timed out — use command again")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true);
            newRow.addComponents(bb);
          }
        });
        return newRow;
      });
      await msg.edit({ components: disabledRows });
    }
  } catch {}
  clearExpiryTimer(messageId);
  sessions.delete(messageId);
  saveFile();
}

function registerHandler(type, fn) {
  handlers.set(type, fn);
}

function registerMessage(message, { type, userId = null, data = {} } = {}) {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  const sess = {
    messageId: message.id,
    channelId: message.channel.id,
    guildId: message.guildId,
    type,
    userId,
    data,
    expiresAt,
  };
  sessions.set(message.id, sess);
  saveFile();
  setExpiryTimer(message.id);
  return sess;
}

function touchMessage(messageId) {
  const sess = sessions.get(messageId);
  if (!sess) return null;
  sess.expiresAt = Date.now() + 5 * 60 * 1000;
  sessions.set(messageId, sess);
  saveFile();
  setExpiryTimer(messageId);
  return sess;
}

async function processInteraction(interaction) {
  if (!interaction.isButton()) return { handled: false };
  const message = interaction.message;
  const mid = message?.id;
  if (!mid) return { handled: false };
  let sess = sessions.get(mid);
  // Auto-register generic sessions for any message with buttons
  if (!sess) {
    const created = message.createdTimestamp || Date.now();
    const expired = Date.now() - created > 5 * 60 * 1000;
    if (expired) {
      // Expire immediately and inform user
      await expireSession(mid).catch(() => {});
      try { await interaction.reply({ content: "This menu has timed out. Please use the command again.", ephemeral: true }); } catch {}
      return { handled: true, expired: true };
    }
    // Create a new generic session and then allow original handler to continue
    sess = {
      messageId: mid,
      channelId: message.channel.id,
      guildId: message.guildId,
      type: "generic",
      userId: null,
      data: {},
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    sessions.set(mid, sess);
    saveFile();
    setExpiryTimer(mid);
    // Do not handle; let the original command's code continue
    return { handled: false, session: sess };
  }
  // Expired?
  if (Date.now() > sess.expiresAt) {
    await expireSession(mid);
    try { await interaction.reply({ content: "This menu has timed out. Please use the command again.", ephemeral: true }); } catch {}
    return { handled: true, expired: true };
  }
  // Refresh expiry
  touchMessage(mid);
  const handler = handlers.get(sess.type);
  if (!handler) return { handled: false, session: sess };
  try {
    await handler(interaction, sess);
    return { handled: true, session: sess };
  } catch (e) {
    console.error("[ActiveMenus] handler error", e);
    return { handled: true, session: sess, error: e };
  }
}

async function init(client) {
  clientRef = client;
  const arr = loadFile();
  const now = Date.now();
  for (const it of arr) {
    const sess = { ...it };
    sessions.set(it.messageId || it.message?.id || it.id, sess);
    if (sess.expiresAt <= now) {
      // Expire shortly to update UI
      setTimeout(() => expireSession(sess.messageId), 200);
    } else {
      setExpiryTimer(sess.messageId);
    }
  }
}

module.exports = {
  init,
  registerMessage,
  registerHandler,
  processInteraction,
  touchMessage,
};
