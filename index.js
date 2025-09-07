require("dotenv/config");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { config, saveConfig } = require("./utils/storage");
const { sendBotStatusMessage, setStatusChannelName } = require("./utils/botStatus");
const { startScheduler } = require("./utils/scheduler");

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Handle shutdown signals and uncaught exceptions
require("./utils/processHandlers")(client);

// Register event handlers
require("./events/messageEvents")(client);
require("./events/guildEvents")(client);
require("./events/interactionEvents")(client);

// Cleanup active menus saved from previous runs
require("./utils/activeMenus").cleanupActiveMenus(client);

// Start the schedule system
startScheduler(client);

// Login
client.login(process.env.DISCORD_TOKEN);

// On ready
client.once("ready", async () => {
  config.testingMode = false;
  saveConfig();
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendBotStatusMessage(client);
  await setStatusChannelName(client, true);
  // Any other startup logic...
});


