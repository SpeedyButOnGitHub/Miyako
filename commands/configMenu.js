const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { config, saveConfig } = require("../utils/storage");
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
          { id: "addChannel", label: "Add role", style: ButtonStyle.Success },
          { id: "removeChannel", label: "Remove role", style: ButtonStyle.Danger }
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
        .setCustomId(`settingButton_${categoryName}_${settingKey}_${btn.id}`) // This is unique per button
        .setLabel(btn.label)
        .setStyle(btn.style)
    );
  });
  itemRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`back_category_${categoryName}`) // Unique per category
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
  );

  // Only add Help Menu button if NOT ModeratorRoles or RoleLogBlacklist
  if (!(categoryName === "Moderation" && (settingKey === "ModeratorRoles" || settingKey === "RoleLogBlacklist"))) {
    itemRow.addComponents(
      new ButtonBuilder()
        .setCustomId("config_help") // Only one Help Menu button per row
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
      if (String(interaction.user.id) !== String(OWNER_ID)) {
        await interaction.deferUpdate();
        const errMsg = await interaction.followUp({ content: "Only the Owner can use this", ephemeral: true });
        setTimeout(() => errMsg.delete().catch(() => {}), 3000);
        return;
      }

      // Help Menu button
      if (interaction.customId === "config_help") {
        await interaction.deferUpdate();
        // Create a fake message object for help
        const fakeHelpMsg = {
          author: { id: interaction.user.id },
          guild: interaction.guild,
          channel: interaction.channel,
          reply: (...args) => interaction.channel.send(...args)
        };
        const { handleHelpCommand } = require("./help");
        await handleHelpCommand(client, fakeHelpMsg);
        return startCollector();
      }

      // Back to main menu
      if (interaction.customId === "back_main") {
        await interaction.update({ embeds: [mainEmbed], components: [mainRow] });
        return startCollector();
      }

      // Back to category view
      if (interaction.customId.startsWith("back_category_")) {
        const categoryName = interaction.customId.replace("back_category_", "");
        const category = configCategories[categoryName];
        if (!category)
          return interaction.reply({ content: `${EMOJI_ERROR} Category not found.`, ephemeral: true });

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x5865F2)
          .setDescription(
            `**${category.description}**\n\n__Current settings:__\n` +
            Object.entries(category.settings)
              .map(([key, setting]) => `**${key}:**\n${setting.getDisplay()}`)
              .join("\n\n")
          );

        const settingsRow = new ActionRowBuilder();
        for (const key in category.settings) {
          settingsRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`setting_${categoryName}_${key}`)
              .setLabel(`⚙️ ${key}`)
              .setStyle(ButtonStyle.Primary)
          );
        }
        settingsRow.addComponents(
          new ButtonBuilder()
            .setCustomId("back_main")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [categoryEmbed], components: [settingsRow] });
        return startCollector();
      }

      const parts = interaction.customId.split("_");
      const [type, categoryName, settingKey, action] = parts;

      // Open category
      if (type === "category") {
        const category = configCategories[categoryName];
        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x5865F2)
          .setDescription(
            `**${category.description}**\n\n__Current settings:__\n` +
            Object.entries(category.settings)
              .map(([key, setting]) => `**${key}:**\n${setting.getDisplay()}`)
              .join("\n\n")
          );

        const settingsRow = new ActionRowBuilder();
        for (const key in category.settings) {
          settingsRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`setting_${categoryName}_${key}`)
              .setLabel(`⚙️ ${key}`)
              .setStyle(ButtonStyle.Primary)
          );
        }
        settingsRow.addComponents(
          new ButtonBuilder()
            .setCustomId("back_main")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [categoryEmbed], components: [settingsRow] });
        return startCollector();
      }

      // Open setting
      if (type === "setting") {
        const { embed, row } = renderSettingEmbed(categoryName, settingKey);
        // Only add Help Menu button if NOT RoleLogBlacklist
        if (!(categoryName === "Moderation" && settingKey === "RoleLogBlacklist")) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("config_help")
              .setLabel("Help Menu")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("❓")
          );
        }
        await interaction.update({ embeds: [embed], components: [row] });
        return startCollector();
      }

      // Handle add/remove actions
      if (type === "settingButton") {
        const setting = configCategories[categoryName]?.settings[settingKey];
        if (!setting)
          return interaction.reply({ content: `${EMOJI_ERROR} Setting not found.`, ephemeral: true });

        const promptMsg = await interaction.reply({
          content: `Type ${action.includes("add") ? "IDs or mentions to add" : "IDs or mentions to remove"} (comma-separated).`,
          ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id;
        const msgCollector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

        msgCollector.on("collect", async m => {
          const inputs = m.content
            .split(",")
            .map(s => s.trim().replace(/[<#&>]/g, ""))
            .filter(Boolean);

          if (categoryName === "Sniping") {
            const matchedChannels = [];
            const invalidChannels = [];
            inputs.forEach(input => {
              const channel = interaction.guild.channels.cache.get(input);
              if (channel) {
                matchedChannels.push(channel.id);
              } else {
                invalidChannels.push(input);
              }
            });

            if (invalidChannels.length > 0) {
              await interaction.followUp({
                content: `${EMOJI_ERROR} Please type a valid channel ping or id. Invalid: ${invalidChannels.map(i => `\`${i}\``).join(", ")}`,
                ephemeral: true
              });
              m.delete().catch(() => {});
              return;
            }

            if (action === "addChannel")
              matchedChannels.forEach(id => {
                if (!config.snipingChannelList.includes(id)) config.snipingChannelList.push(id);
              });
            else if (action === "removeChannel")
              config.snipingChannelList = config.snipingChannelList.filter(id => !matchedChannels.includes(id));
          }

          if (categoryName === "Moderation") {
            const matchedRoles = [];
            const invalidInputs = [];
            inputs.forEach(input => {
              const role = interaction.guild.roles.cache.find(
                r => r.id === input || r.name.toLowerCase() === input.toLowerCase()
              );
              if (role) {
                matchedRoles.push(role);
              } else {
                invalidInputs.push(input);
              }
            });

            if (invalidInputs.length > 0) {
              await interaction.followUp({
                content: `${EMOJI_ERROR} Please type a valid role ping or id. Invalid: ${invalidInputs.map(i => `\`${i}\``).join(", ")}`,
                ephemeral: true
              });
              m.delete().catch(() => {});
              return;
            }

            if (action === "addRole")
              matchedRoles.forEach(r => {
                if (!config.moderatorRoles.includes(r.id)) config.moderatorRoles.push(r.id);
              });
            else if (action === "removeRole") {
              const idsToRemove = matchedRoles.map(r => r.id);
              config.moderatorRoles = config.moderatorRoles.filter(id => !idsToRemove.includes(id));
            }
          }

          if (categoryName === "Moderation" && settingKey === "RoleLogBlacklist") {
            const matchedRoles = [];
            const invalidInputs = [];
            inputs.forEach(input => {
              const role = interaction.guild.roles.cache.find(
                r => r.id === input || r.name.toLowerCase() === input.toLowerCase()
              );
              if (role) {
                matchedRoles.push(role);
              } else {
                invalidInputs.push(input);
              }
            });

            if (invalidInputs.length > 0) {
              await interaction.followUp({
                content: `${EMOJI_ERROR} Please type a valid role ping or id. Invalid: ${invalidInputs.map(i => `\`${i}\``).join(", ")}`,
                ephemeral: true
              });
              m.delete().catch(() => {});
              return;
            }

            if (action === "addBlacklistRole")
              matchedRoles.forEach(r => {
                if (!config.roleLogBlacklist.includes(r.id)) config.roleLogBlacklist.push(r.id);
              });
            else if (action === "removeBlacklistRole") {
              const idsToRemove = matchedRoles.map(r => r.id);
              config.roleLogBlacklist = config.roleLogBlacklist.filter(id => !idsToRemove.includes(id));
            }
            saveConfig();
          }

          saveConfig();

          // Edit original message with updated config
          const { embed, row } = renderSettingEmbed(categoryName, settingKey);
          // Only add Help Menu button if NOT RoleLogBlacklist
          if (!(categoryName === "Moderation" && settingKey === "RoleLogBlacklist")) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId("config_help")
                .setLabel("Help Menu")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("❓")
            );
          }
          await interaction.message.edit({ embeds: [embed], components: [row] });

          await interaction.followUp({
            content: `${EMOJI_SUCCESS} Settings updated successfully.`,
            ephemeral: true
          });
          m.delete().catch(() => {});
        });

        msgCollector.on("end", () => promptMsg.delete().catch(() => {}));
        return startCollector();
      }

      // Reset collector timer after any button interaction
      startCollector();
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "reset") {
        await mainMsg.delete().catch(() => {});
        await message.delete().catch(() => {});
        // Remove from activeMenus.json
        activeMenus = activeMenus.filter(
          m => m.messageId !== mainMsg.id && m.commandId !== message.id
        );
        fs.writeFileSync(ACTIVE_MENUS_FILE, JSON.stringify(activeMenus, null, 2));
      }
    });
  }

  startCollector();
}

async function handleConfigCommand(client, message) {
  const args = message.content.trim().split(/\s+/);
  if (args[0] !== ".config") return;

  // Example: .config whitelist add <channelId>
  if (args[1] === "whitelist" && args[2] === "add" && args[3]) {
    if (!config.snipingWhitelist.includes(args[3])) {
      config.snipingWhitelist.push(args[3]);
      saveConfig();
      return message.reply(`${EMOJI_SUCCESS} Channel <#${args[3]}> added to sniping whitelist.`);
    } else {
      return message.reply(`${EMOJI_ERROR} Channel <#${args[3]}> is already whitelisted.`);
    }
  }

  // Example: .config whitelist remove <channelId>
  if (args[1] === "whitelist" && args[2] === "remove" && args[3]) {
    const index = config.snipingWhitelist.indexOf(args[3]);
    if (index !== -1) {
      config.snipingWhitelist.splice(index, 1);
      saveConfig();
      return message.reply(`${EMOJI_SUCCESS} Channel <#${args[3]}> removed from sniping whitelist.`);
    } else {
      return message.reply(`${EMOJI_ERROR} Channel <#${args[3]}> is not whitelisted.`);
    }
  }

  // Show current whitelist
  if (args[1] === "whitelist" && args[2] === "list") {
    if (config.snipingWhitelist.length === 0) {
      return message.reply(`${EMOJI_ERROR} No channels are whitelisted for sniping.`);
    }
    return message.reply(
      "Whitelisted channels:\n" +
        config.snipingWhitelist.map(id => `<#${id}>`).join("\n")
    );
  }

  // Default help
  return message.reply(
    "Usage:\n" +
      "`.config whitelist add <channelId>`\n" +
      "`.config whitelist remove <channelId>`\n" +
      "`.config whitelist list`"
  );
}

module.exports = {
  handleMessageCreate,
  handleConfigCommand
};


