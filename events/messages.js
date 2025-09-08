const { handleHelpCommand } = require("../commands/help");
const { handleModerationCommands } = require("../commands/moderation/moderationCommands");
const { handleWarningsCommand } = require("../commands/moderation/warnings");
const { handleSnipeCommands } = require("../commands/snipes");
const { handleMessageCreate } = require("../commands/configMenu");
const { handleLevelCommand } = require("../commands/level");
const { handleTestCommand } = require("../commands/test");
const { handleLeaderboardCommand } = require("../commands/leaderboard");
const { handleProfileCommand } = require("../commands/profile");
const { handleLeveling } = require("../utils/leveling");
const { handleScheduleCommand } = require("../commands/schedule");
const { handleScriptsCommand } = require("../commands/scripts");
const { maybeSpawnDrop, tryClaimDrop } = require("../utils/cashDrops");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { config } = require("../utils/storage");
const { handleCashCommand } = require("../commands/cash");
const { handleBalanceCommand } = require("../commands/balance");
const theme = require("../utils/theme");
const { TEST_LOG_CHANNEL } = require("../utils/logChannels");

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
    // Award leveling XP for all non-bot messages (gated in handleLeveling by channel rules)
    await handleLeveling(message, LEVEL_ROLES);
    // Cash drops: first check if a drop can be claimed by this message
    const claimed = tryClaimDrop(message);
    if (claimed) {
      const testTag = claimed.testing ? " [TEST]" : "";
      const claimEmbed = new EmbedBuilder()
        .setTitle(`🎉 Cash Claimed${testTag}`)
        .setColor(theme.colors.success)
        .setDescription(`Looks like someone snagged the bag! You received **${claimed.amount}**.`)
        .addFields({ name: "New Balance", value: `${claimed.testing ? "(test) " : ""}${claimed.newBalance}`, inline: true })
        .setFooter({ text: "Keep chatting for more surprise drops!" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(claimed.testing ? "cash:check:test" : "cash:check").setLabel("Check Balance").setEmoji("💳").setStyle(ButtonStyle.Primary)
      );
      try { await message.reply({ embeds: [claimEmbed], components: [row], allowedMentions: { repliedUser: false } }); } catch {}
    } else {
      const drop = maybeSpawnDrop(message, config);
      if (drop) {
        const isTest = !!drop.testing;
        const spawnEmbed = new EmbedBuilder()
          .setTitle(`${isTest ? "🧪 " : ""}💸 A Wild Cash Drop Appeared!`)
          .setColor(theme.colors.warning)
          .setDescription(
            `It looks like someone dropped some cash!\n` +
            `Type this word to claim it first:\n\n` +
            `→ \`${drop.word}\``
          )
          .addFields(
            { name: "Reward", value: `**${drop.amount}** coins`, inline: true },
            { name: "How", value: "Send the word exactly as shown.", inline: true }
          )
          .setFooter({ text: "First correct message wins. Good luck!" });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("cash:check").setLabel("Check Balance").setEmoji("💳").setStyle(ButtonStyle.Secondary)
        );
        try { await message.reply({ embeds: [spawnEmbed], components: [row], allowedMentions: { repliedUser: false } }); } catch {}
      }
    }

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
      } else if (command === "warnings" || command === "warns") {
        await handleWarningsCommand(client, message);
      } else if (command === "config") {
        await handleMessageCreate(client, message);
      } else if (command === "level") {
        await handleLevelCommand(client, message);
      } else if (command === "profile" || command === "p") {
        await handleProfileCommand(client, message);
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
      } else if (command === "scripts") {
        await handleScriptsCommand(client, message);
      } else if (command === "cash") {
        await handleCashCommand(client, message);
      } else if (command === "balance" || command === "bal") {
        await handleBalanceCommand(client, message);
      }
    } catch (err) {
      console.error(`[Message Command Error]:`, err);
      message.reply(`<:VRLSad:1413770577080094802> An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
    }

    // Already handled above for all messages
  });
}

module.exports = { attachMessageEvents };
