const { handleHelpCommand } = require("../commands/help");
const { handleModerationCommands } = require("../commands/moderation/moderationCommands");
const { handleSnipeCommands } = require("../commands/snipes");
const { handleMessageCreate } = require("../commands/configMenu");
const { handleLevelCommand } = require("../commands/level");
const { handleTestCommand } = require("../commands/test");
const { handleLeaderboardCommand } = require("../commands/leaderboard");
const { handleLeveling } = require("../utils/leveling");
const { handleScheduleCommand } = require("../commands/schedule");

const LEVEL_ROLES = {
  5: "1232701768362754147",
  10: "1232701768362754148",
  16: "1232701768375210145",
  20: "1232701768375210146",
  25: "1232701768375210147",
  40: "1232701768375210149",
  75: "1382911184058978454",
  100: "1232701768375210148"
};

function attachMessageEvents(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(".")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    try {
      if (command === "help") {
        await handleHelpCommand(client, message);
      } else if (["mute", "unmute", "timeout", "untimeout", "ban", "kick", "warn", "removewarn"].includes(command)) {
        await handleModerationCommands(client, message, command, args);
      } else if (["snipe", "s", "ds"].includes(command)) {
        await handleSnipeCommands(client, message, command, args);
      } else if (command === "config") {
        await handleMessageCreate(client, message);
      } else if (command === "level" || command === "profile") {
        await handleLevelCommand(client, message);
      } else if (command === "test") {
        await handleTestCommand(client, message);
      } else if (command === "leaderboard" || command === "lb") {
        await handleLeaderboardCommand(client, message);
      } else if (command === "restart") {
        if (message.author.id !== process.env.OWNER_ID) return;
        await message.reply("🔄 Restarting bot...");
        process.exit(0);
      } else if (command === "stop") {
        if (message.author.id !== process.env.OWNER_ID) return;
        await message.reply("🛑 Stopping bot...");
        process.exit(0);
      } else if (command === "schedule") {
        await handleScheduleCommand(client, message);
      }
    } catch (err) {
      console.error(`[Message Command Error]:`, err);
      message.reply(`<:VRLSad:1413770577080094802> An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
    }

    await handleLeveling(message, LEVEL_ROLES);
  });
}

module.exports = { attachMessageEvents };
