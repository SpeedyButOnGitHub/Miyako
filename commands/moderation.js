const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require("discord.js");
const { OWNER_ID } = require("./moderation/permissions");
const { sendModLog } = require("../utils/modLogs");
const { config, saveConfig } = require("../utils/storage");
const { handleModerationCommands } = require("./moderation/moderationCommands");

// Moderation command handler export only. All testing logic has been removed.

module.exports = {
  handleModerationCommands
};