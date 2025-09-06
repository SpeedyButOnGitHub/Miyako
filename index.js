require("dotenv").config();
const { Client, GatewayIntentBits, Partials, InteractionType } = require("discord.js");

const { handleMessageCreate, handleConfigCommand } = require("./commands/configMenu");
const { handleModerationCommands, showWarnings, handleWarningButtons } = require("./commands/moderation");
const { handleSnipeCommands, handleMessageDelete } = require("./commands/snipes");
const { handleHelpCommand } = require("./commands/help");
const { updateStaffMessage } = require("./utils/helpers");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Ready event
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(guild => updateStaffMessage(guild));
});

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
    else if (["mute", "unmute", "timeout", "untimeout", "ban", "kick", "warn"].includes(command)) {
      await handleModerationCommands(client, message, command, args);
    } 
    else if (command === "warnings") {
      const target = message.mentions.members.first() || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
      if (!target) return message.reply("<:VRLSad:1413770577080094802> You must mention a user or provide a valid user ID.");
      await showWarnings(message, target);
    } 
    else if (["snipe", "snipes"].includes(command)) {
      await handleSnipeCommands(client, message, command, args);
    } 
    else if (command === "config") {
      // Only allow owner to use .config
      if (message.author.id !== process.env.OWNER_ID) return;
      // If message is exactly ".config", show the interactive menu
      if (message.content.trim().toLowerCase() === ".config") {
        await handleMessageCreate(client, message);
      } else {
        // Otherwise, run the text-based config command
        await handleConfigCommand(client, message);
      }
    }
  } catch (err) {
    console.error("Error handling command:", err);
    message.reply("<:VRLSad:1413770577080094802> An error occurred while executing this command.");
  }
});

// Message Delete Event
client.on("messageDelete", (message) => handleMessageDelete(message));

// Interaction Event (Buttons / Modals)
client.on("interactionCreate", async (interaction) => {
  try {
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
      await interaction.reply({ content: "<:VRLSad:1413770577080094802> An error occurred.", ephemeral: true }).catch(() => {});
    }
  }
});

// Update staff messages on member changes
client.on("guildMemberUpdate", (oldMember, newMember) => {
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) updateStaffMessage(newMember.guild);
});
client.on("guildMemberAdd", (member) => updateStaffMessage(member.guild));
client.on("guildMemberRemove", (member) => updateStaffMessage(member.guild));

client.login(process.env.DISCORD_TOKEN);
