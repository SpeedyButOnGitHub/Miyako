const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { config, saveConfig } = require("../utils/storage");
const { logConfigChange } = require("../utils/configLogs");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("./moderation/replies");
const { OWNER_ID } = require("./moderation/permissions");
const fs = require("fs");

const ACTIVE_MENUS_FILE = "./config/activeMenus.json";
let activeMenus = [];
if (fs.existsSync(ACTIVE_MENUS_FILE)) {
  try {
    activeMenus = JSON.parse(fs.readFileSync(ACTIVE_MENUS_FILE));
  } catch { activeMenus = []; }
}

const configCategories = {
  Sniping: {
    description: "Settings for sniping commands.",
    settings: {
      SnipeMode: {
        description: "Choose whether to use a whitelist or blacklist for sniping channels.",
        getDisplay: () => config.snipeMode === "blacklist" ? "Blacklist" : "Whitelist",
        buttons: [
          { id: "setWhitelist", label: "Whitelist", style: ButtonStyle.Success },
          { id: "setBlacklist", label: "Blacklist", style: ButtonStyle.Danger }
        ]
      },
      ChannelList: {
        description: () =>
          config.snipeMode === "blacklist"
            ? "Channels where snipes are **not** allowed."
            : "Channels where snipes are allowed.",
        getDisplay: () =>
          config.snipingChannelList && config.snipingChannelList.length
            ? config.snipingChannelList.map(id => `<#${id}>`).join("\n")
            : "*None*",
        buttons: [
          { id: "addChannel", label: "Add channel", style: ButtonStyle.Success },
          { id: "removeChannel", label: "Remove channel", style: ButtonStyle.Danger }
        ]
      }
    }
  },
  Moderation: {
    description: "Settings for moderation commands.",
    settings: {
      ModeratorRoles: {
        description: "Roles allowed to use moderation commands.",
        getDisplay: () =>
          config.moderatorRoles.length
            ? config.moderatorRoles.map(id => `<@&${id}>`).join("\n")
            : "*None*",
        buttons: [
          { id: "addRole", label: "Add role", style: ButtonStyle.Success },
          { id: "removeRole", label: "Remove role", style: ButtonStyle.Danger }
        ]
      },
      RoleLogBlacklist: {
        description: "Roles that will NOT be logged in role logs.",
        getDisplay: () =>
          (config.roleLogBlacklist && config.roleLogBlacklist.length)
            ? config.roleLogBlacklist.map(id => `<@&${id}>`).join("\n")
            : "*None*",
        buttons: [
          { id: "addBlacklistRole", label: "Add role", style: ButtonStyle.Success },
          { id: "removeBlacklistRole", label: "Remove role", style: ButtonStyle.Danger }
        ]
      }
    }
  }
};

// Helper to format a setting embed with buttons
function renderSettingEmbed(categoryName, settingKey) {
  const setting = configCategories[categoryName].settings[settingKey];

  const itemEmbed = new EmbedBuilder()
    .setTitle(`⚙️ ${categoryName} — ${settingKey}`)
    .setColor(0x5865F2)
    .setDescription(
      `**${setting.description}**\n\n__Current value(s):__\n${setting.getDisplay()}`
    );

  const itemRow = new ActionRowBuilder();
  setting.buttons.forEach(btn => {
    itemRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`settingButton_${categoryName}_${settingKey}_${btn.id}`)
        .setLabel(btn.label)
        .setStyle(btn.style)
    );
  });
  itemRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`back_category_${categoryName}`)
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
  );

  // Only add Help Menu button if NOT ModeratorRoles or RoleLogBlacklist
  if (!(categoryName === "Moderation" && (settingKey === "ModeratorRoles" || settingKey === "RoleLogBlacklist"))) {
    itemRow.addComponents(
      new ButtonBuilder()
        .setCustomId("config_help")
        .setLabel("Help Menu")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❓")
    );
  }

  return { embed: itemEmbed, row: itemRow };
}

// Main message handler
async function handleMessageCreate(client, message) {
  if (String(message.author.id) !== String(OWNER_ID)) {
    const errMsg = await message.reply(`${EMOJI_ERROR} Only the Owner can use this`);
    setTimeout(() => errMsg.delete().catch(() => {}), 3000);
    return;
  }
  if (message.content.trim().toLowerCase() !== ".config") {
    await message.reply(`${EMOJI_ERROR} Invalid config command.`);
    return;
  }

  // ===== Main Embed =====
  const mainEmbed = new EmbedBuilder()
    .setTitle("⚙️ Bot Configuration")
    .setColor(0x5865F2)
    .setDescription(
      "Welcome to the configuration menu!\n\n" +
      "Select a category below to configure settings.\n\n" +
      Object.entries(configCategories)
        .map(([cat, obj]) => `**${cat}** — ${obj.description}`)
        .join("\n")
    );

  const mainRow = new ActionRowBuilder();
  for (const category in configCategories) {
    mainRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`category_${category}`)
        .setLabel(`⚙️ ${category}`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  // Add Help Menu button
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId("config_help")
      .setLabel("Help Menu")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❓")
  );

  const mainMsg = await message.reply({
    embeds: [mainEmbed],
    components: [mainRow],
    allowedMentions: { repliedUser: false }
  });

  activeMenus.push({ channelId: mainMsg.channel.id, messageId: mainMsg.id, commandId: message.id });
  fs.writeFileSync(ACTIVE_MENUS_FILE, JSON.stringify(activeMenus, null, 2));

  // Collector management
  let collector;
  let collectorTimeout = 5 * 60 * 1000; // 5 minutes

  function startCollector() {
    if (collector) collector.stop("reset");
    collector = mainMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: collectorTimeout
    });

    collector.on("collect", async interaction => {
      console.log("Config button pressed:", interaction.customId);
      if (String(interaction.user.id) !== String(OWNER_ID)) {
        await interaction.deferUpdate();
        const tempMsg = await interaction.followUp({ content: `${EMOJI_ERROR} Only the Owner can use this`, ephemeral: true });
        setTimeout(() => tempMsg.delete().catch(() => {}), 3000);
        return;
      }

      // Help Menu button
      if (interaction.customId === "config_help") {
        await interaction.deferUpdate();
        const tempMsg = await interaction.followUp({ content: "Help: Use the buttons to navigate. Add/remove prompts will show modals.", ephemeral: true });
        setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
        return;
      }

      // Back to main menu
      if (interaction.customId === "back_main") {
        await interaction.update({ embeds: [mainEmbed], components: [mainRow] });
        startCollector();
        return;
      }

      // Back to category view
      if (interaction.customId.startsWith("back_category_")) {
        const categoryName = interaction.customId.replace("back_category_", "");
        const category = configCategories[categoryName];
        if (!category) return;

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName}`)
          .setColor(0x5865F2)
          .setDescription(
            `${category.description}\n\n` +
            Object.keys(category.settings).map(setting => `**${setting}** — ${category.settings[setting].description}`).join("\n")
          );

        const categoryRow = new ActionRowBuilder();
        Object.keys(category.settings).forEach(setting => {
          categoryRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`setting_${categoryName}_${setting}`)
              .setLabel(setting)
              .setStyle(ButtonStyle.Primary)
          );
        });
        categoryRow.addComponents(
          new ButtonBuilder()
            .setCustomId("back_main")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [categoryEmbed], components: [categoryRow] });
        startCollector();
        return;
      }

      const parts = interaction.customId.split("_");
      const [type, categoryName, settingKey, action] = parts;

      // Open category
      if (type === "category") {
        const category = configCategories[categoryName];
        if (!category) return;

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName}`)
          .setColor(0x5865F2)
          .setDescription(
            `${category.description}\n\n` +
            Object.keys(category.settings).map(setting => `**${setting}** — ${category.settings[setting].description}`).join("\n")
          );

        const categoryRow = new ActionRowBuilder();
        Object.keys(category.settings).forEach(setting => {
          categoryRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`setting_${categoryName}_${setting}`)
              .setLabel(setting)
              .setStyle(ButtonStyle.Primary)
          );
        });
        categoryRow.addComponents(
          new ButtonBuilder()
            .setCustomId("back_main")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [categoryEmbed], components: [categoryRow] });
        startCollector();
        return;
      }

      // Open setting
      if (type === "setting") {
        const { embed, row } = renderSettingEmbed(categoryName, settingKey);
        await interaction.update({ embeds: [embed], components: [row] });
        startCollector();
        return;
      }

      // Handle add/remove actions and mode toggles
      if (type === "settingButton") {
        if (action === "setWhitelist" || action === "setBlacklist") {
          const oldMode = config.snipeMode;
          config.snipeMode = action === "setWhitelist" ? "whitelist" : "blacklist";
          saveConfig();
          await logConfigChange(interaction.client, interaction.user, `Changed snipe mode from ${oldMode} to ${config.snipeMode}`);
          const { embed, row } = renderSettingEmbed(categoryName, settingKey);
          await interaction.update({ embeds: [embed], components: [row] });
        } else if (action === "addChannel" || action === "removeChannel") {
          const modal = new ModalBuilder()
            .setCustomId(`modal_${categoryName}_${settingKey}_${action}`)
            .setTitle(`${action === "addChannel" ? "Add" : "Remove"} Channel`);

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input")
                .setLabel("Channel ID or #mention")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

          await interaction.showModal(modal);
        } else if (action === "addRole" || action === "removeRole" || action === "addBlacklistRole" || action === "removeBlacklistRole") {
          const modal = new ModalBuilder()
            .setCustomId(`modal_${categoryName}_${settingKey}_${action}`)
            .setTitle(`${action.includes("add") ? "Add" : "Remove"} Role`);

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("input")
                .setLabel("Role ID or @mention")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

          await interaction.showModal(modal);
        }
        startCollector();
        return;
      }

      // Reset collector timer after any button interaction
      startCollector();
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "reset") {
        await mainMsg.edit({ components: [] }).catch(() => {});
      }
    });
  }

  startCollector();
}

async function handleConfigCommand(client, message) {
  const args = message.content.trim().split(/\s+/);
  if (args[0] !== ".config") return;

  if (String(message.author.id) !== String(OWNER_ID)) {
    return message.reply(`${EMOJI_ERROR} Only the Owner can use this.`);
  }

  const sub = (args[1] || "").toLowerCase();

  // Helper to extract a channel ID from mention or raw ID
  const toChannelId = (s) => (s || "").replace(/[^0-9]/g, "");
  const channelsToMentions = (ids) => ids.map(id => `<#${id}>`).join("\n");

  // New syntax: .config snipe ...
  if (["snipe", "sniping"].includes(sub)) {
    const action = (args[2] || "").toLowerCase();

    // .config snipe mode whitelist|blacklist
    if (action === "mode") {
      const mode = (args[3] || "").toLowerCase();
      if (!["whitelist", "blacklist"].includes(mode)) {
        return message.reply(`${EMOJI_ERROR} Invalid mode. Use 'whitelist' or 'blacklist'.`);
      }
      const old = config.snipeMode;
      config.snipeMode = mode;
      saveConfig();
      try {
        await logConfigChange(client, message.author, `Changed snipe mode from ${old} to ${mode}`);
      } catch {}
      return message.reply(`${EMOJI_SUCCESS} Snipe mode set to: ${mode}.`);
    }

    // .config snipe add/remove <channelId|mention>
    if (["add", "remove"].includes(action)) {
      const raw = args.slice(3);
      if (!raw.length) return message.reply(`${EMOJI_ERROR} Provide channel(s) to ${action}.`);
      const ids = raw.map(toChannelId).filter(Boolean);
      const valid = ids.filter(id => message.guild.channels.cache.has(id));
      const invalid = ids.filter(id => !valid.includes(id));
      if (!valid.length) return message.reply(`${EMOJI_ERROR} No valid channels found.`);

      if (action === "add") {
        config.snipingChannelList = [...new Set([...config.snipingChannelList, ...valid])];
      } else {
        config.snipingChannelList = config.snipingChannelList.filter(id => !valid.includes(id));
      }
      saveConfig();
      try {
        await logConfigChange(client, message.author, `${action === "add" ? "Added" : "Removed"} channels: ${channelsToMentions(valid)}`);
      } catch {}
      const summary = channelsToMentions(valid);
      const note = invalid.length ? `\nNote: ignored invalid IDs: ${invalid.map(i => `\`${i}\``).join(", ")}` : "";
      return message.reply(`${EMOJI_SUCCESS} ${action === "add" ? "Added" : "Removed"}:\n${summary}${note}`);
    }

    // .config snipe list
    if (action === "list") {
      const list = config.snipingChannelList.length ? channelsToMentions(config.snipingChannelList) : "*None*";
      return message.reply(`Snipe mode: ${config.snipeMode}\nChannels: ${list}`);
    }

    // Help for .config snipe
    return message.reply(
      "Usage:\n" +
      "`.config snipe mode <whitelist|blacklist>`\n" +
      "`.config snipe add <channel...>`\n" +
      "`.config snipe remove <channel...>`\n" +
      "`.config snipe list`"
    );
  }

  // Back-compat: old whitelist alias maps to sniping list (does not toggle mode automatically)
  if (sub === "whitelist") {
    const action = (args[2] || "").toLowerCase();
    if (["add", "remove"].includes(action)) {
      const raw = args.slice(3);
      if (!raw.length) return message.reply(`${EMOJI_ERROR} Provide channel(s) to ${action}.`);
      const ids = raw.map(toChannelId).filter(Boolean);
      const valid = ids.filter(id => message.guild.channels.cache.has(id));
      if (!valid.length) return message.reply(`${EMOJI_ERROR} No valid channels found.`);

      if (action === "add") {
        config.snipingChannelList = [...new Set([...config.snipingChannelList, ...valid])];
      } else {
        config.snipingChannelList = config.snipingChannelList.filter(id => !valid.includes(id));
      }
      saveConfig();
      try {
        await logConfigChange(client, message.author, `${action === "add" ? "Added" : "Removed"} channels: ${channelsToMentions(valid)}`);
      } catch {}
      const summary = channelsToMentions(valid);
      return message.reply(`${EMOJI_SUCCESS} ${action === "add" ? "Added" : "Removed"}:\n${summary}`);
    }
    if (action === "list") {
      const list = config.snipingChannelList.length ? channelsToMentions(config.snipingChannelList) : "*None*";
      return message.reply(`Channels: ${list}`);
    }
    return message.reply(
      "Usage (alias for snipe list):\n" +
      "`.config whitelist add <channel>`\n" +
      "`.config whitelist remove <channel>`\n" +
      "`.config whitelist list`"
    );
  }

  // Default help landing
  return message.reply(
    "Usage:\n" +
    "`.config snipe mode <whitelist|blacklist>`\n" +
    "`.config snipe add <channel...>`\n" +
    "`.config snipe remove <channel...>`\n" +
    "`.config snipe list`"
  );
}

module.exports = {
  handleMessageCreate,
  handleConfigCommand
};


