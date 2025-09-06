require("dotenv/config");
const { Client, GatewayIntentBits, Partials, InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const { handleMessageCreate, handleConfigCommand } = require("./commands/configMenu");
const { handleModerationCommands, showWarnings, handleWarningButtons } = require("./commands/moderation/index");
const { handleSnipeCommands, handleMessageDelete } = require("./commands/snipes");
const { handleHelpCommand } = require("./commands/help");
const { updateStaffMessage } = require("./utils/staffTeam");
const { addXP, getLevel, saveLevels } = require("./utils/levels");
const { handleLevelCommand } = require("./commands/level");
const { logMessageDelete, logMessageEdit } = require("./utils/messageLogs");
const { logRoleChange } = require("./utils/roleLogs");
const { handleTestCommand } = require("./commands/test");

const { OWNER_ID, ALLOWED_ROLES, CHATBOX_BUTTON_ID } = require("./commands/moderation/permissions");

const BOT_STATUS_FILE = "./config/botStatus.json";
const STATUS_CHANNEL_ID = "1413966369296220233";

// Cooldowns and modifiers for XP
const userCooldowns = new Map(); // userId -> timestamp
const userModifiers = new Map(); // userId -> { streak, modifier, lastMinute }

const XP_MIN = 15; // minimum XP per message
const XP_MAX = 30; // maximum XP per message
const MODIFIER_CAP = 2.0; // max multiplier
const MODIFIER_STEP = 0.1; // how much modifier increases per minute of activity

// Role rewards mapping
const LEVEL_ROLES = {
  5: "ROLE_ID_FOR_LEVEL_5",
  10: "ROLE_ID_FOR_LEVEL_10",
  20: "ROLE_ID_FOR_LEVEL_20"
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Helper to send bot startup/restart message
async function sendBotStatusMessage(client) {
  let lastOnline = 0;
  if (fs.existsSync(BOT_STATUS_FILE)) {
    try {
      const status = JSON.parse(fs.readFileSync(BOT_STATUS_FILE));
      lastOnline = status.lastOnline || 0;
    } catch {}
  }
  const now = Date.now();
  const diff = now - lastOnline;
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (channel) {
    let title, color, desc;
    if (diff >= 5 * 60 * 1000) {
      title = "🟢 Bot Started";
      color = 0x5865F2;
      desc = "Miyako has woken up.";
    } else {
      title = "🔄 Bot Restarted";
      color = 0xffd700;
      desc = "Miyako has restarted.";
    }
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(desc)
      .setFooter({ text: `Timestamp: ${new Date(now).toLocaleString()}` })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
  // Save current time as lastOnline
  fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ lastOnline: now }, null, 2));
}

// Ready event
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendBotStatusMessage(client);
  client.guilds.cache.forEach(guild => updateStaffMessage(guild));
});

// Get random XP value
function getRandomXP() {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

// Get level from XP value
function getLevelFromXP(xp) {
  // Example: Level curve, increases required XP per level
  return Math.floor(Math.pow(xp / 50, 0.7));
}

// Message Create Event
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(".")) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    if (command === "help") {
      await handleHelpCommand(client, message);
    } 
    else if (["mute", "unmute", "timeout", "untimeout", "ban", "kick", "warn", "removewarn"].includes(command)) {
      await handleModerationCommands(client, message, command, args);
    } 
    else if (command === "warnings") {
      const target = message.mentions.members.first() || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
      // If no target, show all warnings in the server
      if (!target) {
        await showWarnings({ client, guild: message.guild, reply: (...args) => message.reply(...args) });
      } else {
        await showWarnings(message, target);
      }
    } 
    else if (["snipe", "snipes", "ds", "s"].includes(command)) {
      await handleSnipeCommands(client, message, command, args);
    } 
    else if (command === "config") {
      // Only allow owner to use .config
      if (message.author.id !== OWNER_ID) return;
      // If message is exactly ".config", show the interactive menu
      if (message.content.trim().toLowerCase() === ".config") {
        await handleMessageCreate(client, message);
      } else {
        // Otherwise, run the text-based config command
        await handleConfigCommand(client, message);
      }
    } else if (command === "level") {
      await handleLevelCommand(client, message);
    } else if (command === "test") {
      await handleTestCommand(client, message);
    }
  } catch (err) {
    console.error(`[Mod Log Error]:`, err);
    message.reply(`<:VRLSad:1413770577080094802> An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
  }

  // Leveling system
  const userId = message.author.id;
  const now = Date.now();
  const lastXP = userCooldowns.get(userId) || 0;

  // Only give XP if at least 1 minute has passed since last XP
  if (now - lastXP >= 60 * 1000) {
    // Modifier logic
    let modData = userModifiers.get(userId) || { streak: 0, modifier: 1.0, lastMinute: 0 };
    if (modData.lastMinute && now - modData.lastMinute <= 65 * 1000) {
      // User is still active, increase streak and modifier
      modData.streak += 1;
      modData.modifier = Math.min(MODIFIER_CAP, 1.0 + modData.streak * MODIFIER_STEP);
    } else {
      // Reset streak and modifier
      modData.streak = 0;
      modData.modifier = 1.0;
    }
    modData.lastMinute = now;
    userModifiers.set(userId, modData);

    // Calculate XP
    const baseXP = getRandomXP();
    const totalXP = Math.floor(baseXP * modData.modifier);

    // Add XP and check for level up
    const leveledUp = addXP(userId, totalXP);
    saveLevels();

    userCooldowns.set(userId, now);

    // Role rewards logic
    if (leveledUp && LEVEL_ROLES[leveledUp]) {
      const roleId = LEVEL_ROLES[leveledUp];
      const member = await message.guild.members.fetch(userId);
      await member.roles.add(roleId).catch(() => {});
      await message.reply(`🎉 Congrats <@${userId}>, you reached level ${leveledUp} and earned a new role!`);
    } else if (leveledUp) {
      await message.reply(`🎉 Congrats <@${userId}>, you reached level ${leveledUp}!`);
    }
  }
});

// Message Delete Event
client.on("messageDelete", (message) => logMessageDelete(client, message));
client.on("messageUpdate", (oldMsg, newMsg) => logMessageEdit(client, oldMsg, newMsg));

// Interaction Event (Buttons / Modals)
client.on("interactionCreate", async (interaction) => {
  try {
    // StaffTeam Chatbox Button
    if (interaction.isButton() && interaction.customId === CHATBOX_BUTTON_ID) {
      try {
        const member = interaction.member;
        const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        if (!hasRole) {
          await interaction.reply({ content: "You are not allowed to use this", ephemeral: true });
          return;
        }
        // Show modal (do not reply/defer before or after)
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId("staffteam_chatbox_modal")
            .setTitle("Staff Team Chatbox")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("chatbox_input")
                  .setLabel("Type your message")
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
              )
            )
        );
      } catch (err) {
        console.error("Error handling staffTeam button:", err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "An error occurred.", ephemeral: true });
        }
      }
      return;
    }

    // StaffTeam Chatbox Modal Submit
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "staffteam_chatbox_modal") {
      const member = interaction.member;
      const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
      if (!hasRole) {
        await interaction.reply({ content: "You are not allowed to use this.", ephemeral: true });
        return;
      }
      const messageContent = interaction.fields.getTextInputValue("chatbox_input");
      // Send to the designated channel
      const channel = await client.channels.fetch("1232701768383729790");
      await channel.send({
        content: `💬 **Staff Chatbox Message from <@${member.id}>:**\n${messageContent}`
      });
      await interaction.reply({ content: "Your message has been sent!", ephemeral: true });
      return;
    }

    // Only handle warning buttons/modals here
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))
    ) {
      await handleWarningButtons(client, interaction);
    } else if (interaction.type === InteractionType.ModalSubmit &&
      (interaction.customId.startsWith("addwarn_") || interaction.customId.startsWith("removewarn_"))
    ) {
      await handleWarningButtons(client, interaction);
    }
    // Other interaction types (config menu, etc.) should be handled in their own handler
  } catch (err) {
    console.error("Error handling interaction:", err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: `<:VRLSad:1413770577080094802> An error occurred.\nDetails: \`${err.message || err}\``, ephemeral: true }).catch(() => {});
    }
  }
});

// Update staff messages on member changes
client.on("guildMemberUpdate", (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
  for (const role of addedRoles.values()) logRoleChange(client, newMember, role, "add");
  for (const role of removedRoles.values()) logRoleChange(client, newMember, role, "remove");
});
client.on("guildMemberAdd", (member) => updateStaffMessage(member.guild));
client.on("guildMemberRemove", (member) => updateStaffMessage(member.guild));

client.login(process.env.DISCORD_TOKEN);
