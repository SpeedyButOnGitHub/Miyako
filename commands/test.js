const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require("discord.js");
const { OWNER_ID } = require("./moderation/permissions");
const { sendModLog } = require("../utils/modLogs");
const { config, saveConfig } = require("../utils/storage");

const TEST_CHANNEL_ID = "1413966369296220233";
const MOD_LOG_CHANNEL_ID = "1232701768383729791";

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
      "Select a test below to trigger a test event or log.\n\n" +
      `**All test logs will be sent to <#${TEST_CHANNEL_ID}>.**\n` +
      `Testing mode is currently **${testingMode ? "ENABLED" : "DISABLED"}**.\n` +
      "These are **test events only** and do not perform real moderation actions."
    );
}

/**
 * Get the test menu button row.
 */
function getTestRow(testingMode) {
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
        .setCustomId("toggle_testing")
        .setLabel(testingMode ? "Disable Testing Mode" : "Enable Testing Mode")
        .setStyle(testingMode ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(testingMode ? "🛑" : "🧪")
    );
}

/**
 * Delete all test logs from the moderation log channel.
 */
async function deleteTestLogs(client) {
  if (!testLogMessageIds.length) return;
  const channel = await client.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  for (const msgId of testLogMessageIds) {
    try {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    } catch {}
  }
  testLogMessageIds = [];
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
      await message.reply("🧪 Testing mode is now **DISABLED**. Deleting test logs...");
      await deleteTestLogs(client);
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
  let row = getTestRow(testingMode);

  const replyMsg = await message.reply({ embeds: [embed], components: [row] });

  const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
  collector.on("collect", async interaction => {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "Only the Owner can use this.", ephemeral: true });
      return;
    }

    // Refresh testing mode in case it changed
    testingMode = !!config.testingMode;

    // Toggle testing mode button
    if (interaction.customId === "toggle_testing") {
      if (testingMode) {
        config.testingMode = false;
        saveConfig();
        testingMode = false;
        embed = getTestEmbed(testingMode);
        row = getTestRow(testingMode);
        await interaction.update({ embeds: [embed], components: [row] });
        await interaction.followUp({ content: "🧪 Testing mode is now **DISABLED**. Deleting test logs...", ephemeral: true });
        await deleteTestLogs(client);
      } else {
        config.testingMode = true;
        saveConfig();
        testingMode = true;
        embed = getTestEmbed(testingMode);
        row = getTestRow(testingMode);
        await interaction.update({ embeds: [embed], components: [row] });
        await interaction.followUp({ content: "🧪 Testing mode is now **ENABLED**.", ephemeral: true });
      }
      return;
    }

    // Test event buttons
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
    }

    if (action) {
      const testChannel = await client.channels.fetch(TEST_CHANNEL_ID).catch(() => null);
      if (testChannel) {
        const embedObj = await sendModLog(
          client,
          subject,
          message.author,
          action,
          reason,
          true,
          action === "muted" ? duration : null,
          action === "warned" ? currentWarnings : null
        );
        // Track the log message ID if in testing mode
        if (config.testingMode && embedObj && embedObj.id) {
          testLogMessageIds.push(embedObj.id);
        }
        if (embedObj && embedObj.channel.id !== TEST_CHANNEL_ID) {
          await testChannel.send({ embeds: [embedObj.embeds[0]] });
          await embedObj.delete().catch(() => {});
        }
        await interaction.reply({ content: `Test event sent to <#${TEST_CHANNEL_ID}>!`, ephemeral: true });
      } else {
        await interaction.reply({ content: "Test channel not found.", ephemeral: true });
      }
    }
  });
}

module.exports = {
  handleTestCommand,
  testLogMessageIds
};