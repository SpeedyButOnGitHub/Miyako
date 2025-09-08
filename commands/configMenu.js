const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder } = require("discord.js");
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
          // CHANGED: use unambiguous IDs
          { id: "modeWhitelist", label: "Whitelist", style: ButtonStyle.Success },
          { id: "modeBlacklist", label: "Blacklist", style: ButtonStyle.Danger }
        ]
      },
      ChannelList: {
        description: () =>
          config.snipeMode === "blacklist"
            ? "Channels where snipes are **not** allowed."
            : "Channels where snipes are allowed.",
        getDisplay: () => {
          if (config.snipeMode === "whitelist") {
            return config.snipingWhitelist && config.snipingWhitelist.length
              ? config.snipingWhitelist.map(id => `<#${id}>`).join("\n")
              : "*None*";
          } else {
            return config.snipingChannelList && config.snipingChannelList.length
              ? config.snipingChannelList.map(id => `<#${id}>`).join("\n")
              : "*None*";
          }
        },
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
  ,
  Leveling: {
    description: "Settings for the leveling system.",
    settings: {
      LevelRewards: {
        description: "Configure roles automatically granted at levels. Supports multiple roles per level.",
        getDisplay: () => {
          const entries = Object.entries(config.levelRewards || {});
          if (!entries.length) return "*None*";
          entries.sort((a,b) => Number(a[0]) - Number(b[0]));
          return entries.map(([lvl, roleIds]) => {
            const list = (Array.isArray(roleIds) ? roleIds : [roleIds]).map(id => `<@&${id}>`).join(", ");
            return `Lvl ${lvl} → ${list}`;
          }).join("\n");
        },
        buttons: [
          { id: "addLevel", label: "Add level", style: ButtonStyle.Success },
          { id: "addReward", label: "Add rewards", style: ButtonStyle.Success },
          { id: "removeReward", label: "Remove rewards", style: ButtonStyle.Danger }
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
      `**${typeof setting.description === "function" ? setting.description() : setting.description}**\n\n__Current value(s):__\n${setting.getDisplay()}`
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

  // SHOW Help only when not in Sniping SnipeMode/ChannelList (and not in the excluded Moderation settings)
  const shouldShowHelp =
    !(
      (categoryName === "Sniping" && (settingKey === "SnipeMode" || settingKey === "ChannelList")) ||
      (categoryName === "Moderation" && (settingKey === "ModeratorRoles" || settingKey === "RoleLogBlacklist")) ||
      (categoryName === "Leveling" && (settingKey === "LevelRewards"))
    );

  if (shouldShowHelp) {
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
  collector = mainMsg.createMessageComponentCollector({ time: collectorTimeout });

    collector.on("collect", async interaction => {
      if (String(interaction.user.id) !== String(OWNER_ID)) {
        await interaction.reply({ content: `${EMOJI_ERROR} Only the Owner can use this.`, ephemeral: true }).catch(() => {});
        return;
      }

      // Handle select menus for LevelRewards flow
  if (interaction.isStringSelectMenu()) {
        // Pick level to remove from
        if (interaction.customId === "lr_pickLevel") {
          const levelStr = interaction.values[0];
          const roles = Array.isArray(config.levelRewards[levelStr]) ? config.levelRewards[levelStr] : (config.levelRewards[levelStr] ? [config.levelRewards[levelStr]] : []);
          const valid = roles.filter(id => interaction.guild.roles.cache.has(id));
          if (!valid.length) {
            await interaction.update({
              embeds: [new EmbedBuilder().setTitle("⚙️ Leveling — LevelRewards").setColor(0x5865F2).setDescription(`No valid roles configured for level ${levelStr}.`)],
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary)
                )
              ]
            }).catch(() => {});
            return;
          }

          const select = new StringSelectMenuBuilder()
            .setCustomId(`lr_pickRoles_${levelStr}`)
            .setPlaceholder(`Select reward roles to remove (level ${levelStr})`)
            .setMinValues(1)
            .setMaxValues(Math.min(25, valid.length))
            .addOptions(valid.slice(0, 25).map(id => ({ label: interaction.guild.roles.cache.get(id)?.name || id, value: id })));

          const embed = new EmbedBuilder()
            .setTitle(`⚙️ Leveling — Remove rewards for level ${levelStr}`)
            .setColor(0x5865F2)
            .setDescription(`Select one or more rewards to remove. Selecting all will clear the level.`);

          await interaction.update({
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(select),
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary)
              )
            ]
          }).catch(() => {});
          return;
        }

        // Remove selected roles for given level
        if (interaction.customId.startsWith("lr_pickRoles_")) {
          const levelStr = interaction.customId.substring("lr_pickRoles_".length);
          const selected = interaction.values;
          const current = Array.isArray(config.levelRewards[levelStr]) ? config.levelRewards[levelStr] : (config.levelRewards[levelStr] ? [config.levelRewards[levelStr]] : []);
          const filtered = current.filter(id => !selected.includes(id));
          if (filtered.length) config.levelRewards[levelStr] = Array.from(new Set(filtered)); else delete config.levelRewards[levelStr];
          saveConfig();

          const { embed, row } = renderSettingEmbed("Leveling", "LevelRewards");
          await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
          return;
        }

        // Add rewards: pick a level to add roles to
        if (interaction.customId === "lr_add_pickLevel") {
          const levelStr = interaction.values[0];
          const embed = new EmbedBuilder()
            .setTitle(`⚙️ Leveling — Add rewards for level ${levelStr}`)
            .setColor(0x5865F2)
            .setDescription("Type the role(s) to add: mention them or paste role IDs, separated by spaces.");

          await interaction.update({
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary)
              )
            ]
          }).catch(() => {});

          // Wait for owner input
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 }).catch(() => null);
          const msg = collected && collected.first ? collected.first() : null;
          if (!msg) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No input provided.`, ephemeral: true }).catch(() => {});
            return;
          }
          const parts = msg.content.trim().split(/\s+/);
          const mentioned = [...msg.mentions.roles.keys()];
          const idsFromText = parts.map(p => p.replace(/[^0-9]/g, "")).filter(Boolean);
          const roleIds = Array.from(new Set([...mentioned, ...idsFromText]));
          if (!roleIds.length) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No roles provided.`, ephemeral: true }).catch(() => {});
            await msg.delete().catch(() => {});
            return;
          }
          const validIds = roleIds.filter(id => interaction.guild.roles.cache.has(id));
          if (!validIds.length) {
            await interaction.followUp({ content: `${EMOJI_ERROR} None of the provided roles exist in this server.`, ephemeral: true }).catch(() => {});
            await msg.delete().catch(() => {});
            return;
          }
          const current = Array.isArray(config.levelRewards[levelStr]) ? config.levelRewards[levelStr] : (config.levelRewards[levelStr] ? [config.levelRewards[levelStr]] : []);
          const merged = Array.from(new Set([...(current || []), ...validIds]));
          config.levelRewards[levelStr] = merged;
          saveConfig();
          await interaction.followUp({ content: `${EMOJI_SUCCESS} Added to level ${levelStr}: ${validIds.map(id => `<@&${id}>`).join(', ')}`, ephemeral: true }).catch(() => {});
          const { embed: backEmbed, row } = renderSettingEmbed("Leveling", "LevelRewards");
          await interaction.message.edit({ embeds: [backEmbed], components: [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return;
        }
      }

      // Handle button interactions
      if (!interaction.isButton()) return;

      // Help Menu button
      if (interaction.customId === "config_help") {
        // Stop this collector with a custom reason so the 'end' handler won't delete anything
        try { collector.stop("switch"); } catch {}

        // remove this menu from activeMenus
        try {
          activeMenus = activeMenus.filter(
            m => m.messageId !== mainMsg.id && m.commandId !== message.id
          );
          fs.writeFileSync(ACTIVE_MENUS_FILE, JSON.stringify(activeMenus, null, 2));
        } catch {}

        // delete the current config menu and the triggering .config command
        await interaction.message.delete().catch(() => {});
        await message.delete().catch(() => {});

        // open help menu
        const { handleHelpCommand } = require("./help");
        const fakeHelpMsg = {
          author: interaction.user,
          guild: interaction.guild,
          channel: interaction.channel,
          reply: (...args) => interaction.channel.send(...args)
        };
        await handleHelpCommand(client, fakeHelpMsg);
        return; // do not restart this collector
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
        await interaction.update({ embeds: [embed], components: [row] });
        return startCollector();
      }

      // Handle add/remove actions
      if (type === "settingButton") {
        const setting = configCategories[categoryName]?.settings[settingKey];
        if (!setting) {
          await interaction.reply({ content: `${EMOJI_ERROR} Setting not found.`, ephemeral: true }).catch(() => {});
          return;
        }

        // Sniping: toggle mode
        if (categoryName === "Sniping" && settingKey === "SnipeMode" && (action === "modeWhitelist" || action === "modeBlacklist")) {
          const newMode = action === "modeWhitelist" ? "whitelist" : "blacklist";
          if (config.snipeMode !== newMode) {
            config.snipeMode = newMode;
            saveConfig();
          }
          const { embed, row } = renderSettingEmbed("Sniping", "SnipeMode");
          await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
          return startCollector();
        }

        // Sniping: channel list add/remove
        if (categoryName === "Sniping" && settingKey === "ChannelList" && (action === "addChannel" || action === "removeChannel")) {
          await interaction.reply({ content: `Please mention or type the channel ID to ${action === "addChannel" ? "add" : "remove"}:`, ephemeral: true });
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 });
          const msg = collected.first();
          if (!msg) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No channel provided.`, ephemeral: true });
            return;
          }
          const channelId = msg.mentions.channels.first()?.id || msg.content.replace(/[^0-9]/g, "");
          const channel = interaction.guild.channels.cache.get(channelId);
          if (!channel) {
            await interaction.followUp({ content: `${EMOJI_ERROR} Invalid channel.`, ephemeral: true });
            await msg.delete().catch(() => {});
            return;
          }

          const listKey = config.snipeMode === "whitelist" ? "snipingWhitelist" : "snipingChannelList";
          const list = config[listKey] || [];
          if (action === "addChannel") {
            if (!list.includes(channelId)) {
              list.push(channelId);
              config[listKey] = list;
              saveConfig();
              await interaction.followUp({ content: `${EMOJI_SUCCESS} Channel <#${channelId}> added.`, ephemeral: true });
            } else {
              await interaction.followUp({ content: `${EMOJI_ERROR} Channel already listed.`, ephemeral: true });
            }
          } else {
            if (list.includes(channelId)) {
              config[listKey] = list.filter(id => id !== channelId);
              saveConfig();
              await interaction.followUp({ content: `${EMOJI_SUCCESS} Channel <#${channelId}> removed.`, ephemeral: true });
            } else {
              await interaction.followUp({ content: `${EMOJI_ERROR} Channel not in list.`, ephemeral: true });
            }
          }

          const { embed, row } = renderSettingEmbed("Sniping", "ChannelList");
          await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return startCollector();
        }

        // Leveling: add rewards -> open level select flow
        if (categoryName === "Leveling" && settingKey === "LevelRewards" && action === "addReward") {
          const levelKeys = Object.keys(config.levelRewards || {}).sort((a,b) => Number(a) - Number(b));
          if (!levelKeys.length) {
            await interaction.reply({ content: `${EMOJI_ERROR} No levels configured yet. Use 'Add level' first.`, ephemeral: true }).catch(() => {});
            return;
          }

          const levelSelect = new StringSelectMenuBuilder()
            .setCustomId("lr_add_pickLevel")
            .setPlaceholder("Select a level to add rewards to")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(levelKeys.slice(0,25).map(lvl => ({ label: `Level ${lvl}`, value: String(lvl) })));

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Leveling — Choose level")
            .setColor(0x5865F2)
            .setDescription("Pick a level. You’ll then type the role(s) to add.");

          await interaction.update({
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(levelSelect),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary))
            ]
          }).catch(() => {});
          return startCollector();
        }

        // Leveling: add level
        if (categoryName === "Leveling" && settingKey === "LevelRewards" && action === "addLevel") {
          await interaction.reply({ content: "Enter a level number to add:", ephemeral: true }).catch(() => {});
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 }).catch(() => null);
          const msg = collected && collected.first ? collected.first() : null;
          if (!msg) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No input provided.`, ephemeral: true }).catch(() => {});
            return;
          }
          const levelNum = Number(msg.content.trim());
          if (!Number.isFinite(levelNum) || levelNum <= 0) {
            await interaction.followUp({ content: `${EMOJI_ERROR} Invalid level.`, ephemeral: true }).catch(() => {});
            await msg.delete().catch(() => {});
            return;
          }
          const key = String(levelNum);
          if (!config.levelRewards[key]) {
            config.levelRewards[key] = [];
            saveConfig();
            await interaction.followUp({ content: `${EMOJI_SUCCESS} Added level ${levelNum}.`, ephemeral: true }).catch(() => {});
          } else {
            await interaction.followUp({ content: `${EMOJI_ERROR} Level ${levelNum} already exists.`, ephemeral: true }).catch(() => {});
          }
          const { embed, row } = renderSettingEmbed("Leveling", "LevelRewards");
          await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return startCollector();
        }

        // Leveling: remove rewards -> open select flow
        if (categoryName === "Leveling" && settingKey === "LevelRewards" && action === "removeReward") {
          const levelKeys = Object.keys(config.levelRewards || {}).sort((a,b) => Number(a) - Number(b));
          if (!levelKeys.length) {
            await interaction.reply({ content: `${EMOJI_ERROR} No levels have rewards configured.`, ephemeral: true });
            return;
          }

          const levelSelect = new StringSelectMenuBuilder()
            .setCustomId("lr_pickLevel")
            .setPlaceholder("Select a level to remove rewards from")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(levelKeys.slice(0,25).map(lvl => ({ label: `Level ${lvl}`, value: String(lvl) })));

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Leveling — Choose level")
            .setColor(0x5865F2)
            .setDescription("Pick a level. You’ll then choose the specific rewards to remove.");

          await interaction.update({
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(levelSelect),
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary))
            ]
          }).catch(() => {});
          return startCollector();
        }

        // Other settings could be handled here...
      }

      // Reset collector timer after any button interaction
      startCollector();
    });

    collector.on("end", async (_, reason) => {
      // Do not delete anything if we intentionally switched menus or reset
      if (reason === "switch" || reason === "reset") return;

      // Otherwise, old behavior: clean up stale menu
      try {
        await mainMsg.delete().catch(() => {});
        await message.delete().catch(() => {});
      } finally {
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
  handleConfigCommand,
  renderSettingEmbed
};