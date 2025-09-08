// Thin compatibility layer: re-export modular API used elsewhere
const { renderSettingEmbed } = require("./configMenu/render");
const { OWNER_ID } = require("./moderation/permissions");

async function handleMessageCreate(client, message) {
  // Delegate to new modular menu (lazy require to avoid circular warnings)
  if (String(message.author?.id) !== String(OWNER_ID)) {
    try { await message.reply("⚙️ Only the Owner can use the config menu."); } catch {}
    return;
  }
  const { handleConfigMenuCommand } = require("./configMenu/index.js");
  return handleConfigMenuCommand(message);
}

// Legacy CLI handler can be gradually ported later; for now export a stub that shows the menu
async function handleConfigCommand(client, message) {
  if (String(message.author?.id) !== String(OWNER_ID)) {
    try { await message.reply("⚙️ Only the Owner can use the config menu."); } catch {}
    return;
  }
  const { handleConfigMenuCommand } = require("./configMenu/index.js");
  return handleConfigMenuCommand(message);
}

module.exports = { renderSettingEmbed, handleMessageCreate, handleConfigCommand };