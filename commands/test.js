const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require("discord.js");
const { OWNER_ID } = require("./moderation/permissions");
const { sendModLog } = require("../utils/modLogs");
const { config, saveConfig } = require("../utils/storage");
const { logMemberLeave } = require("../utils/memberLogs");

const TEST_CHANNEL_ID = "1413966369296220233";
const MOD_LOG_CHANNEL_ID = "1232701768383729791";
const MEMBER_LEAVE_LOG_CHANNEL = "1232701769859993628";

// Track test log message IDs in memory and export for use in moderationCommands.js
let testLogMessageIds = [];

/**
 * Format a duration in ms to a readable string.
 */
function formatDuration(ms) {
  if (ms >= 24 * 60 * 60 * 1000) return `${Math.floor(ms / (24 * 60 * 60 * 1000))} day(s)`;
  if (ms >= 60 * 60 * 1000) return `${Math.floor(ms / (60 * 60 * 1000))} hour(s)`;
  if (ms >= 60 * 1000) return `${Math.floor(ms / (60 * 1000))} minute(s)`;
  return `${ms / 1000} seconds`;
}

/**
 * Pick a random element from an array.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get the test menu embed.
 */
function getTestEmbed(testingMode) {
  return new EmbedBuilder()
    .setTitle("🧪 Test Menu")
    .setColor(testingMode ? 0xffd700 : 0x5865F2)
    .setDescription(
      "Choose a test category below:\n\n" +
      "🔧 **Bot Tests**: Test bot moderation features.\n" +
      "🛡️ **Native Discord Tests**: Test Discord's built-in moderation actions.\n\n" +
      `Testing mode is currently **${testingMode ? "ENABLED" : "DISABLED"}**.`
    );
}

/**
 * Get the main test menu button row.
 */
function getMainTestRow(testingMode) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("test_bot_category")
        .setLabel("Bot Tests")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔧"),
      new ButtonBuilder()
        .setCustomId("test_native_category")
        .setLabel("Native Discord Tests")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🛡️"),
      new ButtonBuilder()
        .setCustomId("toggle_testing")
        .setLabel(testingMode ? "Disable Testing Mode" : "Enable Testing Mode")
        .setStyle(testingMode ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(testingMode ? "🛑" : "🧪")
    );
}

/**
 * Get the bot tests button row.
 */
function getBotTestRow(testingMode) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("test_warn")
        .setLabel("Test Warning")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⚠️"),
      new ButtonBuilder()
        .setCustomId("test_mute")
        .setLabel("Test Mute")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔇"),
      new ButtonBuilder()
        .setCustomId("test_kick")
        .setLabel("Test Kick")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("👢"),
      new ButtonBuilder()
        .setCustomId("test_member_leave")
        .setLabel("Test Member Leave")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("👋"),
      new ButtonBuilder()
        .setCustomId("test_back_main")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️")
    );
}

/**
 * Get the native Discord tests button row.
 */
function getNativeTestRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("native_ban")
        .setLabel("Ban")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔨"),
      new ButtonBuilder()
        .setCustomId("native_unban")
        .setLabel("Unban")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🔓"),
      new ButtonBuilder()
        .setCustomId("native_kick")
        .setLabel("Kick")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("👢"),
      new ButtonBuilder()
        .setCustomId("native_mute")
        .setLabel("Mute/Timeout")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔇"),
      new ButtonBuilder()
        .setCustomId("native_unmute")
        .setLabel("Unmute/Untimeout")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🔊"),
      new ButtonBuilder()
        .setCustomId("native_warn")
        .setLabel("Warn")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⚠️"),
      new ButtonBuilder()
        .setCustomId("native_removewarn")
        .setLabel("Remove Warn")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId("native_back_main")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️")
    );
}

/**
 * Handle the test command and menu.
 */
async function handleTestCommand(client, message) {
  if (message.author.id !== OWNER_ID) {
    return message.reply({ content: "Only the Owner can use this command.", ephemeral: true });
  }

  // Quick prefix: .test testing on/off
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args[0] === "testing" && (args[1] === "on" || args[1] === "off")) {
    const enable = args[1] === "on";
    if (enable && config.testingMode) {
      return message.reply("🧪 Testing mode is already enabled.");
    }
    if (!enable && !config.testingMode) {
      return message.reply("🧪 Testing mode is already disabled.");
    }
    config.testingMode = enable;
    saveConfig();
    if (!enable) {
      await message.reply("🧪 Testing mode is now **DISABLED**.");
    } else {
      await message.reply("🧪 Testing mode is now **ENABLED**.");
    }
    return;
  }

  // Pick random test subject (from guild members, including bots and yourself)
  const members = await message.guild.members.fetch();
  const testSubjects = members;

  // Initial embed and row
  let testingMode = !!config.testingMode;
  let embed = getTestEmbed(testingMode);
  let row = getMainTestRow(testingMode);

  let replyMsg = await message.reply({ embeds: [embed], components: [row] });

  // Collector management
  let collector;
  let collectorTimeout = 5 * 60 * 1000; // 5 minutes

  function startCollector(currentCategory = "main") {
    if (collector) collector.stop("reset");
    collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: collectorTimeout });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: "Only the Owner can use this.", ephemeral: true });
        return;
      }

      // Refresh testing mode in case it changed
      testingMode = !!config.testingMode;

      // Toggle testing mode button (always available)
      if (interaction.customId === "toggle_testing") {
        if (testingMode) {
          config.testingMode = false;
          saveConfig();
          testingMode = false;
        } else {
          config.testingMode = true;
          saveConfig();
          testingMode = true;
        }
        embed = getTestEmbed(testingMode);
        row = getMainTestRow(testingMode);
        await interaction.update({ embeds: [embed], components: [row] });
        startCollector("main");
        return;
      }

      // Category navigation
      if (interaction.customId === "test_bot_category") {
        const botEmbed = new EmbedBuilder()
          .setTitle("🔧 Bot Tests")
          .setColor(0x5865F2)
          .setDescription("Test bot moderation features below.");
        await interaction.update({ embeds: [botEmbed], components: [getBotTestRow(testingMode)] });
        startCollector("bot");
        return;
      }
      if (interaction.customId === "test_native_category") {
        const nativeEmbed = new EmbedBuilder()
          .setTitle("🛡️ Native Discord Tests")
          .setColor(0x5865F2)
          .setDescription("Test Discord's built-in moderation actions below.");
        await interaction.update({ embeds: [nativeEmbed], components: [getNativeTestRow()] });
        startCollector("native");
        return;
      }
      if (interaction.customId === "test_back_main" || interaction.customId === "native_back_main") {
        embed = getTestEmbed(testingMode);
        row = getMainTestRow(testingMode);
        await interaction.update({ embeds: [embed], components: [row] });
        startCollector("main");
        return;
      }

      // Bot test buttons
      if (currentCategory === "bot") {
        const subject = pickRandom([...testSubjects.values()]);
        const reason = `[TEST EVENT] ${pickRandom([
          "Because the cake is a lie.",
          "For science!",
          "Just testing the waters.",
          "To boldly go where no bot has gone before.",
          "Because Miyako said so.",
          "It's just a prank, bro.",
          "Testing, testing, 1, 2, 3.",
          "No actual users were harmed in this test.",
          "This is only a drill.",
          "For the memes."
        ])}`;
        const duration = formatDuration(pickRandom([
          60 * 60 * 1000,
          5 * 60 * 1000,
          24 * 60 * 60 * 1000,
          10 * 60 * 1000,
          30 * 60 * 1000
        ]));
        let action;
        let currentWarnings = Math.floor(Math.random() * 5) + 1;

        if (interaction.customId === "test_warn") {
          action = "warned";
        } else if (interaction.customId === "test_mute") {
          action = "muted";
        } else if (interaction.customId === "test_kick") {
          action = "kicked";
        } else if (interaction.customId === "test_member_leave") {
          const members = [...message.guild.members.cache.values()].filter(m => !m.user.bot);
          const subject = pickRandom(members);
          const originalTestingMode = config.testingMode;
          if (testingMode) {
            config.testingMode = true;
            await logMemberLeave(client, subject, true);
            config.testingMode = originalTestingMode;
            await interaction.reply({ content: `Test member leave log sent for <@${subject.id}> in <#${TEST_CHANNEL_ID}>!`, ephemeral: true });
          } else {
            config.testingMode = false;
            await logMemberLeave(client, subject, true);
            config.testingMode = originalTestingMode;
            await interaction.reply({ content: `Test member leave log sent for <@${subject.id}> in <#${MEMBER_LEAVE_LOG_CHANNEL}>!`, ephemeral: true });
          }
          startCollector("bot");
          return;
        }

        if (action) {
          // Send mod log ONLY to the correct channel based on testing mode
          const originalTestingMode = config.testingMode;
          config.testingMode = testingMode;
          await sendModLog(
            client,
            subject,
            message.author,
            action,
            reason,
            true,
            action === "muted" ? duration : null,
            action === "warned" ? currentWarnings : null
          );
          config.testingMode = originalTestingMode;

          await interaction.reply({ content: `Test event sent to <#${testingMode ? TEST_CHANNEL_ID : MOD_LOG_CHANNEL_ID}>!`, ephemeral: true });
          startCollector("bot");
          return;
        }
      }

      // Native Discord test buttons
      if (currentCategory === "native") {
        const subject = pickRandom([...testSubjects.values()].filter(m => !m.user.bot));
        const reason = `[NATIVE TEST] ${pickRandom([
          "Manual moderation via Discord UI.",
          "Native Discord action.",
          "Testing audit log integration.",
          "Simulated Discord moderation.",
          "Native moderation test."
        ])}`;
        const duration = formatDuration(pickRandom([
          60 * 60 * 1000,
          5 * 60 * 1000,
          24 * 60 * 60 * 1000,
          10 * 60 * 1000,
          30 * 60 * 1000
        ]));
        let moderator = message.author;
        let currentWarnings = Math.floor(Math.random() * 5) + 1;

        if (interaction.customId === "native_ban") {
          await sendModLog(
            client,
            subject,
            moderator,
            "banned",
            `[Native Discord Test]\nReason: ${reason}`,
            true
          );
          await interaction.reply({ content: `Native Discord ban test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_unban") {
          await sendModLog(
            client,
            subject,
            moderator,
            "unbanned",
            `[Native Discord Test]\nReason: ${reason}`,
            false
          );
          await interaction.reply({ content: `Native Discord unban test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_kick") {
          await sendModLog(
            client,
            subject,
            moderator,
            "kicked",
            `[Native Discord Test]\nReason: ${reason}`,
            true
          );
          await interaction.reply({ content: `Native Discord kick test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_mute") {
          await sendModLog(
            client,
            subject,
            moderator,
            "muted",
            `[Native Discord Test]\nReason: ${reason}`,
            true,
            duration
          );
          await interaction.reply({ content: `Native Discord mute/timeout test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_unmute") {
          await sendModLog(
            client,
            subject,
            moderator,
            "unmuted",
            `[Native Discord Test]\nReason: ${reason}`,
            false
          );
          await interaction.reply({ content: `Native Discord unmute/untimeout test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_warn") {
          await sendModLog(
            client,
            subject,
            moderator,
            "warned",
            `[Native Discord Test]\nReason: ${reason}`,
            true,
            null,
            currentWarnings
          );
          await interaction.reply({ content: `Native Discord warn test sent for <@${subject.id}>!`, ephemeral: true });
        } else if (interaction.customId === "native_removewarn") {
          await sendModLog(
            client,
            subject,
            moderator,
            "warning removed",
            `[Native Discord Test]\nReason: ${reason}`,
            true,
            null,
            currentWarnings
          );
          await interaction.reply({ content: `Native Discord remove warn test sent for <@${subject.id}>!`, ephemeral: true });
        }
        startCollector("native");
        return;
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "reset") {
        await replyMsg.delete().catch(() => {});
        await message.delete().catch(() => {});
      }
    });
  }

  startCollector("main");
}

module.exports = {
  handleTestCommand,
  testLogMessageIds
};