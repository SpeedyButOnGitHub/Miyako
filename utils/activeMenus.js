const fs = require("fs");
const path = require("path");
const ACTIVE_MENUS_FILE = path.resolve("./config/activeMenus.json");

async function cleanupActiveMenus(client) {
  if (!fs.existsSync(ACTIVE_MENUS_FILE)) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(ACTIVE_MENUS_FILE, "utf8"));
  } catch (err) {
    console.error("Failed to parse activeMenus.json:", err);
    try { fs.writeFileSync(ACTIVE_MENUS_FILE, "[]"); } catch {}
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    try { fs.writeFileSync(ACTIVE_MENUS_FILE, "[]"); } catch {}
    return;
  }

  for (const entry of data) {
    try {
      if (!entry || !entry.channelId || !entry.messageId) continue;
      const channel = await client.channels.fetch(entry.channelId).catch(() => null);
      if (!channel || !channel.messages) continue;
      const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    } catch (err) {
      // non-fatal: continue cleaning others
      console.error("Failed to delete active menu message:", err);
    }
  }

  try {
    fs.writeFileSync(ACTIVE_MENUS_FILE, "[]");
  } catch (err) {
    console.error("Failed to reset activeMenus.json:", err);
  }
}

module.exports = {
  cleanupActiveMenus
};