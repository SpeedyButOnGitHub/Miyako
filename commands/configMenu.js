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
  getLabel: () => 'Channels',
        getSummary: () => {
          const count = config.snipeMode === 'whitelist'
            ? (config.snipingWhitelist?.length || 0)
            : (config.snipingChannelList?.length || 0);
          return `${count}`;
        },
        buttons: [
          { id: "addChannel", label: "Add Channel", style: ButtonStyle.Success },
          { id: "removeChannel", label: "Remove Channel", style: ButtonStyle.Danger }
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
        getLabel: () => "Moderator Roles",
        getSummary: () => {
          const n = config.moderatorRoles?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addRole", label: "Add Role", style: ButtonStyle.Success },
          { id: "removeRole", label: "Remove Role", style: ButtonStyle.Danger }
        ]
      },
      RoleLogBlacklist: {
        description: "Roles that will NOT be logged in role logs.",
        getDisplay: () =>
          (config.roleLogBlacklist && config.roleLogBlacklist.length)
            ? config.roleLogBlacklist.map(id => `<@&${id}>`).join("\n")
            : "*None*",
        getLabel: () => "Role Log Blacklist",
        getSummary: () => {
          const n = config.roleLogBlacklist?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addBlacklistRole", label: "Add Role", style: ButtonStyle.Success },
          { id: "removeBlacklistRole", label: "Remove Role", style: ButtonStyle.Danger }
        ]
      }
    }
  }
  ,
  Leveling: {
    description: "Settings for the leveling system.",
    settings: {
      LevelingChannels: {
        description: () =>
          config.levelingMode === "blacklist"
            ? "Channels where leveling XP is NOT awarded."
            : "Channels where leveling XP is awarded.",
        getDisplay: () => {
          const list = config.levelingChannelList || [];
          return list.length ? list.map(id => `<#${id}>`).join("\n") : "*None*";
        },
  getLabel: () => 'Channels',
        getSummary: () => {
          const n = config.levelingChannelList?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addChannel", label: "Add Channel", style: ButtonStyle.Success },
          { id: "removeChannel", label: "Remove Channel", style: ButtonStyle.Danger }
        ]
      },
      RoleXPBlacklist: {
        description: "Members with these roles will not gain XP.",
        getDisplay: () => (config.roleXPBlacklist && config.roleXPBlacklist.length)
          ? config.roleXPBlacklist.map(id => `<@&${id}>`).join("\n")
          : "*None*",
        getLabel: () => "Blocked Roles",
        getSummary: () => {
          const n = config.roleXPBlacklist?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addRole", label: "Add Roles", style: ButtonStyle.Success },
          { id: "removeRole", label: "Remove Roles", style: ButtonStyle.Danger }
        ]
      },
      GlobalXPMultiplier: {
        description: () => `Set a global XP multiplier applied to all XP gains. Current: **x${(config.globalXPMultiplier ?? 1).toFixed(2)}**`,
        getDisplay: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          const badge = mult > 1 ? "🔥 Boost Active" : (mult === 1 ? "➖ Normal" : "🧪 Custom");
          return `Multiplier: **x${mult.toFixed(2)}**  •  ${badge}`;
        },
        getLabel: () => "XP Multiplier",
        getSummary: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          return `x${mult.toFixed(2)}`;
        },
        buttons: [
          { id: "set", label: "Set Multiplier", style: ButtonStyle.Primary },
          { id: "reset", label: "Reset to 1x", style: ButtonStyle.Secondary }
        ]
      },
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
        getLabel: () => "Level Rewards",
        getSummary: () => {
          const levels = Object.keys(config.levelRewards || {}).length;
          return `${levels} tier${levels === 1 ? '' : 's'}`;
        },
        buttons: [
          { id: "addLevel", label: "Add Level", style: ButtonStyle.Success },
          { id: "addReward", label: "Add Rewards", style: ButtonStyle.Success },
          { id: "removeReward", label: "Remove Rewards", style: ButtonStyle.Danger },
          { id: "removeLevel", label: "Remove Level", style: ButtonStyle.Danger }
        ]
      }
    }
  }
};

// Utils: chunk an array into arrays of at most size n
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Helper to format a setting embed with buttons
function renderSettingEmbed(categoryName, settingKey) {
  const setting = configCategories[categoryName].settings[settingKey];

  // Prettier titles with emojis per setting
  const keyLabel = setting.getLabel ? setting.getLabel() : settingKey;
  const titleEmoji = (categoryName === 'Leveling')
    ? (settingKey.toLowerCase().includes('channel') ? '🗺️' : settingKey.toLowerCase().includes('multiplier') ? '💠' : settingKey.toLowerCase().includes('reward') ? '🎁' : '📈')
    : (categoryName === 'Sniping' ? (settingKey.toLowerCase().includes('channel') ? '🔭' : '🔧') : '🛡️');
  const prettyTitle = `${titleEmoji} ${categoryName} — ${keyLabel}`;
  const color = categoryName === 'Leveling' ? 0x00B2FF : (categoryName === 'Sniping' ? 0x2b2d31 : 0x5865F2);
  const itemEmbed = new EmbedBuilder()
    .setTitle(prettyTitle)
    .setColor(color)
    .setDescription(`**${typeof setting.description === "function" ? setting.description() : setting.description}**`)
    .addFields({ name: "Current", value: setting.getDisplay() });

  // Build rows. Primary row holds action buttons with Back at end.
  const rows = [];

  // If this is a Channels setting, add a mode toggle row here
  const isSnipingChannels = categoryName === 'Sniping' && settingKey === 'ChannelList';
  const isLevelingChannels = categoryName === 'Leveling' && settingKey === 'LevelingChannels';
  if (isSnipingChannels || isLevelingChannels) {
    const mode = isSnipingChannels ? (config.snipeMode || 'whitelist') : (config.levelingMode || 'blacklist');
    const wlActive = mode === 'whitelist';
    const blActive = mode === 'blacklist';
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`settingMode_${categoryName}_${settingKey}_whitelist`)
        .setLabel('Whitelist')
        .setEmoji('✅')
        .setStyle(wlActive ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`settingMode_${categoryName}_${settingKey}_blacklist`)
        .setLabel('Blacklist')
        .setEmoji('🚫')
        .setStyle(blActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
    ));
  }

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
      .setEmoji('↩️')
  );

  rows.push(itemRow);

  return { embed: itemEmbed, row: rows.length === 1 ? itemRow : rows };
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
    const emoji = category === 'Leveling' ? '📈' : category === 'Sniping' ? '🔎' : '🛡️';
    mainRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`category_${category}`)
        .setLabel(`${emoji} ${category}`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  // Add Help Menu button
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId("config_help")
      .setLabel("❓ Help")
      .setStyle(ButtonStyle.Secondary)
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
  // Pick level to remove from (any page)
  if (interaction.customId.startsWith("lr_pickLevel_")) {
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

          const options = valid.map(id => ({ label: interaction.guild.roles.cache.get(id)?.name?.slice(0, 100) || id, value: id }));
          const chunks = chunk(options, 25);
          const rows = chunks.map((opts, idx) => new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`lr_pickRoles_${levelStr}_${idx}`)
              .setPlaceholder(`Select rewards to remove${chunks.length > 1 ? ` (page ${idx+1}/${chunks.length})` : ""}`)
              .setMinValues(1)
              .setMaxValues(Math.min(25, opts.length))
              .addOptions(opts)
          ));

          const embed = new EmbedBuilder()
            .setTitle(`⚙️ Leveling — Remove rewards for level ${levelStr}`)
            .setColor(0x5865F2)
            .setDescription(`Select one or more rewards to remove. Selecting all will clear the level.`);

          await interaction.update({
            embeds: [embed],
            components: [
              ...rows,
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary)
              )
            ]
          }).catch(() => {});
          return;
        }

        // Remove selected roles for given level (any page)
        if (interaction.customId.startsWith("lr_pickRoles_")) {
          const parts = interaction.customId.split("_");
          const levelStr = parts[2];
          const selected = interaction.values || [];
          const current = Array.isArray(config.levelRewards[levelStr]) ? config.levelRewards[levelStr] : (config.levelRewards[levelStr] ? [config.levelRewards[levelStr]] : []);
          const filtered = current.filter(id => !selected.includes(id));
          if (filtered.length) config.levelRewards[levelStr] = Array.from(new Set(filtered)); else delete config.levelRewards[levelStr];
          saveConfig();

          const { embed, row } = renderSettingEmbed("Leveling", "LevelRewards");
          await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return;
        }

        // Remove levels: handle selection (any page)
        if (interaction.customId.startsWith("lr_remove_levels_")) {
          const selectedLevels = interaction.values || [];
          const embed = new EmbedBuilder()
            .setTitle("⚠️ Confirm removal")
            .setColor(0xffaa00)
            .setDescription(`Remove the following level${selectedLevels.length > 1 ? 's' : ''} permanently?\n\n${selectedLevels.map(l => `• Level ${l}`).join('\n')}`);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lr_confirm_remove_${selectedLevels.join('-')}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("setting_Leveling_LevelRewards").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
          );

          await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return;
        }

        // Add rewards: pick a level to add roles to
  if (interaction.customId.startsWith("lr_add_pickLevel_")) {
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
          await interaction.message.edit({ embeds: [backEmbed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return;
        }
      }

  // Handle button interactions
      if (!interaction.isButton()) return;
      // Confirm remove levels
      if (interaction.customId.startsWith("lr_confirm_remove_")) {
        const levelStrs = interaction.customId.replace("lr_confirm_remove_", "").split("-").filter(Boolean);
        let removed = [];
        for (const lvl of levelStrs) {
          if (config.levelRewards[lvl] !== undefined) {
            delete config.levelRewards[lvl];
            removed.push(lvl);
          }
        }
        if (removed.length) saveConfig();
  const { embed, row } = renderSettingEmbed("Leveling", "LevelRewards");
  await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
        if (removed.length) {
          await interaction.followUp({ content: `${EMOJI_SUCCESS} Removed level${removed.length > 1 ? 's' : ''}: ${removed.join(', ')}`, ephemeral: true }).catch(() => {});
        } else {
          await interaction.followUp({ content: `${EMOJI_ERROR} No levels removed.`, ephemeral: true }).catch(() => {});
        }
        return startCollector();
      }

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

      // Category-level mode switches (Sniping/Leveling)
      if (interaction.customId.startsWith("catmode_")) {
        const [, categoryName, mode] = interaction.customId.split("_");
        if (categoryName === 'Sniping') {
          const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
          if (config.snipeMode !== newMode) { config.snipeMode = newMode; saveConfig(); }
        } else if (categoryName === 'Leveling') {
          const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
          if (config.levelingMode !== newMode) { config.levelingMode = newMode; saveConfig(); }
        }
        // Re-render category
        const category = configCategories[categoryName];
        if (!category) return;

        let description = `**${category.description}**`;
        if (categoryName === "Leveling") {
          const modeStr = config.levelingMode === "whitelist" ? "Whitelist" : "Blacklist";
          const chCount = Array.isArray(config.levelingChannelList) ? config.levelingChannelList.length : 0;
          const roleBlk = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist.length : 0;
          const mult = (typeof config.globalXPMultiplier === 'number' && Number.isFinite(config.globalXPMultiplier)) ? config.globalXPMultiplier : 1;
          description += `\n\n📊 Summary • Mode: ${modeStr} • Channels: ${chCount} • Blocked roles: ${roleBlk} • Multiplier: x${mult.toFixed(2)}`;
        } else if (categoryName === "Sniping") {
          const modeStr = config.snipeMode === 'whitelist' ? 'Whitelist' : 'Blacklist';
          const chCount = (config.snipeMode === 'whitelist' ? (config.snipingWhitelist?.length || 0) : (config.snipingChannelList?.length || 0));
          description += `\n\n📊 Summary • Mode: ${modeStr} • Channels: ${chCount}`;
        } else if (categoryName === "Moderation") {
          const modCount = Array.isArray(config.moderatorRoles) ? config.moderatorRoles.length : 0;
          const blkCount = Array.isArray(config.roleLogBlacklist) ? config.roleLogBlacklist.length : 0;
          description += `\n\n📊 Summary • Mod roles: ${modCount} • Role log blacklist: ${blkCount}`;
        }
        description += `\n\n__Current settings:__\n` +
          Object.entries(category.settings)
            .map(([key, setting]) => {
              const label = setting.getLabel ? setting.getLabel() : key;
              return `• **${label}** — ${setting.getSummary ? setting.getSummary() : setting.getDisplay()}`;
            })
            .join("\n");

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x5865F2)
          .setDescription(description);

        const settingButtons = Object.keys(category.settings).map(key => {
          const labelSrc = category.settings[key];
          const friendly = labelSrc.getLabel ? labelSrc.getLabel() : key;
          const emoji = key.toLowerCase().includes('channel') ? '🗺️' : key.toLowerCase().includes('multiplier') ? '💠' : key.toLowerCase().includes('reward') ? '🎁' : key.toLowerCase().includes('role') ? '👥' : '⚙️';
          return new ButtonBuilder()
            .setCustomId(`setting_${categoryName}_${key}`)
            .setLabel(`${emoji} ${friendly}`)
            .setStyle(ButtonStyle.Primary);
        });
        const rows = [];
    if (categoryName === 'Sniping' || categoryName === 'Leveling') {
          const isSniping = categoryName === 'Sniping';
          const modeVal = isSniping ? (config.snipeMode || 'whitelist') : (config.levelingMode || 'blacklist');
          const wlActive = modeVal === 'whitelist';
          const blActive = modeVal === 'blacklist';
      rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_whitelist`)
    .setLabel('Whitelist')
      .setEmoji('✅')
              .setStyle(wlActive ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_blacklist`)
    .setLabel('Blacklist')
      .setEmoji('🚫')
              .setStyle(blActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
          ));
        }
        for (let i = 0; i < settingButtons.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(...settingButtons.slice(i, i + 5)));
        }
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("back_main").setLabel("Back").setStyle(ButtonStyle.Secondary)
        ));

        await interaction.update({ embeds: [categoryEmbed], components: rows }).catch(() => {});
        return startCollector();
      }

      // Back to category view
      if (interaction.customId.startsWith("back_category_")) {
        const categoryName = interaction.customId.replace("back_category_", "");
        const category = configCategories[categoryName];
        if (!category)
          return interaction.reply({ content: `${EMOJI_ERROR} Category not found.`, ephemeral: true });

        // Build description with concise header summary and per-setting summaries
        let description = `**${category.description}**`;
        if (categoryName === "Leveling") {
          const mode = config.levelingMode === "whitelist" ? "Whitelist" : "Blacklist";
          const chCount = Array.isArray(config.levelingChannelList) ? config.levelingChannelList.length : 0;
          const roleBlk = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist.length : 0;
          const mult = (typeof config.globalXPMultiplier === 'number' && Number.isFinite(config.globalXPMultiplier)) ? config.globalXPMultiplier : 1;
          description += `\n\n📊 Summary • Mode: ${mode} • Channels: ${chCount} • Blocked roles: ${roleBlk} • Multiplier: x${mult.toFixed(2)}`;
        } else if (categoryName === "Sniping") {
          const mode = config.snipeMode === 'whitelist' ? 'Whitelist' : 'Blacklist';
          const chCount = (config.snipeMode === 'whitelist' ? (config.snipingWhitelist?.length || 0) : (config.snipingChannelList?.length || 0));
          description += `\n\n📊 Summary • Mode: ${mode} • Channels: ${chCount}`;
        } else if (categoryName === "Moderation") {
          const modCount = Array.isArray(config.moderatorRoles) ? config.moderatorRoles.length : 0;
          const blkCount = Array.isArray(config.roleLogBlacklist) ? config.roleLogBlacklist.length : 0;
          description += `\n\n📊 Summary • Mod roles: ${modCount} • Role log blacklist: ${blkCount}`;
        }
        description += `\n\n__Current settings:__\n` +
          Object.entries(category.settings)
            .map(([key, setting]) => {
              const label = setting.getLabel ? setting.getLabel() : key;
              return `• **${label}** — ${setting.getSummary ? setting.getSummary() : setting.getDisplay()}`;
            })
            .join("\n");

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x5865F2)
          .setDescription(description);

        // Build setting buttons in rows of max 5, and put Back in its own row
        const settingButtons = Object.keys(category.settings).map(key => {
          const labelSrc = category.settings[key];
          const friendly = labelSrc.getLabel ? labelSrc.getLabel() : key;
          const emoji = key.toLowerCase().includes('channel') ? '🗺️' : key.toLowerCase().includes('multiplier') ? '💠' : key.toLowerCase().includes('reward') ? '🎁' : key.toLowerCase().includes('role') ? '👥' : '⚙️';
          return new ButtonBuilder()
            .setCustomId(`setting_${categoryName}_${key}`)
            .setLabel(`${emoji} ${friendly}`)
            .setStyle(ButtonStyle.Primary);
        });
        const rows = [];
        // Add category-level mode toggle for Sniping/Leveling
    if (categoryName === 'Sniping' || categoryName === 'Leveling') {
          const isSniping = categoryName === 'Sniping';
          const mode = isSniping ? (config.snipeMode || 'whitelist') : (config.levelingMode || 'blacklist');
          const wlActive = mode === 'whitelist';
          const blActive = mode === 'blacklist';
      rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_whitelist`)
    .setLabel('Whitelist')
      .setEmoji('✅')
              .setStyle(wlActive ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_blacklist`)
    .setLabel('Blacklist')
      .setEmoji('🚫')
              .setStyle(blActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
          ));
        }
        for (let i = 0; i < settingButtons.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(...settingButtons.slice(i, i + 5)));
        }
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("back_main").setLabel("Back").setStyle(ButtonStyle.Secondary)
        ));

  await interaction.update({ embeds: [categoryEmbed], components: rows });
        return startCollector();
      }

      const parts = interaction.customId.split("_");
      const [type, categoryName, settingKey, action] = parts;

      // Open category
      if (type === "category") {
        const category = configCategories[categoryName];
        // Build description with concise header summary and per-setting summaries
        let description = `**${category.description}**`;
        if (categoryName === "Leveling") {
          const mode = config.levelingMode === "whitelist" ? "Whitelist" : "Blacklist";
          const chCount = Array.isArray(config.levelingChannelList) ? config.levelingChannelList.length : 0;
          const roleBlk = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist.length : 0;
          const mult = (typeof config.globalXPMultiplier === 'number' && Number.isFinite(config.globalXPMultiplier)) ? config.globalXPMultiplier : 1;
          description += `\n\n📊 Summary • Mode: ${mode} • Channels: ${chCount} • Blocked roles: ${roleBlk} • Multiplier: x${mult.toFixed(2)}`;
        } else if (categoryName === "Sniping") {
          const mode = config.snipeMode === 'whitelist' ? 'Whitelist' : 'Blacklist';
          const chCount = (config.snipeMode === 'whitelist' ? (config.snipingWhitelist?.length || 0) : (config.snipingChannelList?.length || 0));
          description += `\n\n📊 Summary • Mode: ${mode} • Channels: ${chCount}`;
        } else if (categoryName === "Moderation") {
          const modCount = Array.isArray(config.moderatorRoles) ? config.moderatorRoles.length : 0;
          const blkCount = Array.isArray(config.roleLogBlacklist) ? config.roleLogBlacklist.length : 0;
          description += `\n\n📊 Summary • Mod roles: ${modCount} • Role log blacklist: ${blkCount}`;
        }
        description += `\n\n__Current settings:__\n` +
          Object.entries(category.settings)
            .map(([key, setting]) => {
              const label = setting.getLabel ? setting.getLabel() : key;
              return `• **${label}** — ${setting.getSummary ? setting.getSummary() : setting.getDisplay()}`;
            })
            .join("\n");

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x5865F2)
          .setDescription(description);

        // Build setting buttons in rows of max 5, and put Back in its own row
        const settingButtons = Object.keys(category.settings).map(key => {
          const labelSrc = category.settings[key];
          const friendly = labelSrc.getLabel ? labelSrc.getLabel() : key;
          const emoji = key.toLowerCase().includes('channel') ? '🗺️' : key.toLowerCase().includes('multiplier') ? '💠' : key.toLowerCase().includes('reward') ? '🎁' : key.toLowerCase().includes('role') ? '👥' : '⚙️';
          return new ButtonBuilder()
            .setCustomId(`setting_${categoryName}_${key}`)
            .setLabel(`${emoji} ${friendly}`)
            .setStyle(ButtonStyle.Primary);
        });
        const rows = [];
        // Add category-level mode toggle for Sniping/Leveling
    if (categoryName === 'Sniping' || categoryName === 'Leveling') {
          const isSniping = categoryName === 'Sniping';
          const mode = isSniping ? (config.snipeMode || 'whitelist') : (config.levelingMode || 'blacklist');
          const wlActive = mode === 'whitelist';
          const blActive = mode === 'blacklist';
      rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_whitelist`)
    .setLabel('Whitelist')
      .setEmoji('✅')
              .setStyle(wlActive ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`catmode_${categoryName}_blacklist`)
    .setLabel('Blacklist')
      .setEmoji('🚫')
              .setStyle(blActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
          ));
        }
        for (let i = 0; i < settingButtons.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(...settingButtons.slice(i, i + 5)));
        }
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("back_main").setLabel("Back").setStyle(ButtonStyle.Secondary)
        ));

  await interaction.update({ embeds: [categoryEmbed], components: rows });
        return startCollector();
      }

      // Open setting
      if (type === "setting") {
  const { embed, row } = renderSettingEmbed(categoryName, settingKey);
  await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] });
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
    await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return startCollector();
        }

  // Sniping: channel list add/remove
        if (categoryName === "Sniping" && settingKey === "ChannelList" && (action === "addChannel" || action === "removeChannel")) {
          await interaction.reply({ content: `Mention or paste channel IDs to ${action === "addChannel" ? "add" : "remove"} (you can provide multiple, separated by spaces):`, ephemeral: true });
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 });
          const msg = collected.first();
          if (!msg) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No channel provided.`, ephemeral: true });
            return;
          }
          const mentionedIds = [...msg.mentions.channels.keys()];
          const textIds = msg.content.split(/\s+/).map(p => p.replace(/[^0-9]/g, "")).filter(Boolean);
          const ids = Array.from(new Set([...mentionedIds, ...textIds]));
          const validIds = ids.filter(id => interaction.guild.channels.cache.has(id));
          const invalidIds = ids.filter(id => !interaction.guild.channels.cache.has(id));

          const listKey = config.snipeMode === "whitelist" ? "snipingWhitelist" : "snipingChannelList";
          const list = config[listKey] || [];
          let added = [];
          let removed = [];
          if (action === "addChannel") {
            for (const id of validIds) {
              if (!list.includes(id)) {
                list.push(id);
                added.push(id);
              }
            }
            config[listKey] = list;
            if (added.length) saveConfig();
          } else {
            const before = new Set(list);
            config[listKey] = list.filter(id => !validIds.includes(id));
            removed = [...before].filter(id => !config[listKey].includes(id));
            if (removed.length) saveConfig();
          }

          const parts = [];
          if (added.length) parts.push(`${EMOJI_SUCCESS} Added: ${added.map(id => `<#${id}>`).join(", ")}`);
          if (removed.length) parts.push(`${EMOJI_SUCCESS} Removed: ${removed.map(id => `<#${id}>`).join(", ")}`);
          if (invalidIds.length) parts.push(`${EMOJI_ERROR} Invalid: ${invalidIds.join(", ")}`);
          if (!parts.length) parts.push(`${EMOJI_ERROR} No changes.`);
          await interaction.followUp({ content: parts.join("\n"), ephemeral: true });

          const { embed, row } = renderSettingEmbed("Sniping", "ChannelList");
          await interaction.message.edit({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return startCollector();
        }

        // Leveling: toggle leveling mode
        if (categoryName === "Leveling" && settingKey === "LevelingMode" && (action === "modeWhitelist" || action === "modeBlacklist")) {
          const newMode = action === "modeWhitelist" ? "whitelist" : "blacklist";
          if (config.levelingMode !== newMode) {
            config.levelingMode = newMode;
            saveConfig();
          }
          const { embed, row } = renderSettingEmbed("Leveling", "LevelingMode");
    await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return startCollector();
        }

        // Leveling: channel list add/remove
        if (categoryName === "Leveling" && settingKey === "LevelingChannels" && (action === "addChannel" || action === "removeChannel")) {
          await interaction.reply({ content: `Mention or paste channel IDs to ${action === "addChannel" ? "add" : "remove"} (you can provide multiple, separated by spaces):`, ephemeral: true });
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 });
          const msg = collected.first();
          if (!msg) {
            await interaction.followUp({ content: `${EMOJI_ERROR} No channel provided.`, ephemeral: true });
            return;
          }
          const mentionedIds = [...msg.mentions.channels.keys()];
          const textIds = msg.content.split(/\s+/).map(p => p.replace(/[^0-9]/g, "")).filter(Boolean);
          const ids = Array.from(new Set([...mentionedIds, ...textIds]));
          const validIds = ids.filter(id => interaction.guild.channels.cache.has(id));
          const invalidIds = ids.filter(id => !interaction.guild.channels.cache.has(id));

          const list = Array.isArray(config.levelingChannelList) ? config.levelingChannelList : [];
          let added = [];
          let removed = [];
          if (action === "addChannel") {
            for (const id of validIds) {
              if (!list.includes(id)) {
                list.push(id);
                added.push(id);
              }
            }
            config.levelingChannelList = list;
            if (added.length) saveConfig();
          } else {
            const before = new Set(list);
            config.levelingChannelList = list.filter(id => !validIds.includes(id));
            removed = [...before].filter(id => !config.levelingChannelList.includes(id));
            if (removed.length) saveConfig();
          }

          const parts = [];
          if (added.length) parts.push(`${EMOJI_SUCCESS} Added: ${added.map(id => `<#${id}>`).join(", ")}`);
          if (removed.length) parts.push(`${EMOJI_SUCCESS} Removed: ${removed.map(id => `<#${id}>`).join(", ")}`);
          if (invalidIds.length) parts.push(`${EMOJI_ERROR} Invalid: ${invalidIds.join(", ")}`);
          if (!parts.length) parts.push(`${EMOJI_ERROR} No changes.`);
          await interaction.followUp({ content: parts.join("\n"), ephemeral: true });

          const { embed, row } = renderSettingEmbed("Leveling", "LevelingChannels");
          await interaction.message.edit({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return startCollector();
        }

        // Leveling: role XP blacklist add/remove (multi-role input)
        if (categoryName === "Leveling" && settingKey === "RoleXPBlacklist" && (action === "addRole" || action === "removeRole")) {
          await interaction.reply({ content: `Mention or paste role IDs to ${action === "addRole" ? "add" : "remove"} (multiple allowed, space-separated):`, ephemeral: true });
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 });
          const msg = collected.first();
          if (!msg) { await interaction.followUp({ content: `${EMOJI_ERROR} No roles provided.`, ephemeral: true }); return; }
          const mentioned = [...msg.mentions.roles.keys()];
          const idsFromText = msg.content.split(/\s+/).map(p => p.replace(/[^0-9]/g, "")).filter(Boolean);
          const ids = Array.from(new Set([...mentioned, ...idsFromText]));
          const validIds = ids.filter(id => interaction.guild.roles.cache.has(id));
          const invalidIds = ids.filter(id => !interaction.guild.roles.cache.has(id));
          const list = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist : [];
          let added = [], removed = [];
          if (action === "addRole") {
            for (const id of validIds) if (!list.includes(id)) { list.push(id); added.push(id); }
            config.roleXPBlacklist = list;
            if (added.length) saveConfig();
          } else {
            const before = new Set(list);
            config.roleXPBlacklist = list.filter(id => !validIds.includes(id));
            removed = [...before].filter(id => !config.roleXPBlacklist.includes(id));
            if (removed.length) saveConfig();
          }
          const parts = [];
          if (added.length) parts.push(`${EMOJI_SUCCESS} Added: ${added.map(id => `<@&${id}>`).join(', ')}`);
          if (removed.length) parts.push(`${EMOJI_SUCCESS} Removed: ${removed.map(id => `<@&${id}>`).join(', ')}`);
          if (invalidIds.length) parts.push(`${EMOJI_ERROR} Invalid: ${invalidIds.join(', ')}`);
          if (!parts.length) parts.push(`${EMOJI_ERROR} No changes.`);
          await interaction.followUp({ content: parts.join('\n'), ephemeral: true });
          const { embed, row } = renderSettingEmbed("Leveling", "RoleXPBlacklist");
          await interaction.message.edit({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          await msg.delete().catch(() => {});
          return startCollector();
        }

        // Leveling: Global XP Multiplier set/reset
        if (categoryName === "Leveling" && settingKey === "GlobalXPMultiplier" && (action === "set" || action === "reset")) {
          if (action === "reset") {
            config.globalXPMultiplier = 1.0; saveConfig();
            const { embed, row } = renderSettingEmbed("Leveling", "GlobalXPMultiplier");
            await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
            return startCollector();
          }
          await interaction.reply({ content: `Enter a multiplier (e.g. 1, 1.5, 2):`, ephemeral: true });
          const filter = m => m.author.id === OWNER_ID && m.channel.id === interaction.channel.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 20000 });
          const msg = collected.first();
          if (!msg) { await interaction.followUp({ content: `${EMOJI_ERROR} No value provided.`, ephemeral: true }); return; }
          const val = Number(msg.content.trim());
          if (!Number.isFinite(val) || val < 0 || val > 10) { // simple safety bounds
            await interaction.followUp({ content: `${EMOJI_ERROR} Invalid multiplier. Provide a number between 0 and 10.`, ephemeral: true });
            await msg.delete().catch(() => {});
            return;
          }
          config.globalXPMultiplier = val; saveConfig();
          await interaction.followUp({ content: `${EMOJI_SUCCESS} Global XP multiplier set to x${val.toFixed(2)}.`, ephemeral: true });
          const { embed, row } = renderSettingEmbed("Leveling", "GlobalXPMultiplier");
          await interaction.message.edit({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
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

          const levelOptions = levelKeys.map(lvl => ({ label: `Level ${lvl}`, value: String(lvl) }));
          const pages = chunk(levelOptions, 25);
          const rows = pages.map((opts, idx) => new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`lr_add_pickLevel_${idx}`)
              .setPlaceholder(`Select a level to add rewards${pages.length > 1 ? ` (page ${idx+1}/${pages.length})` : ""}`)
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(opts)
          ));

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Leveling — Choose level")
            .setColor(0x5865F2)
            .setDescription("Pick a level. You’ll then type the role(s) to add.");

          await interaction.update({
            embeds: [embed],
            components: [
              ...rows,
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
          await interaction.message.edit({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
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

          const levelOptions = levelKeys.map(lvl => ({ label: `Level ${lvl}`, value: String(lvl) }));
          const pages = chunk(levelOptions, 25);
          const rows = pages.map((opts, idx) => new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`lr_pickLevel_${idx}`)
              .setPlaceholder(`Select a level to remove rewards${pages.length > 1 ? ` (page ${idx+1}/${pages.length})` : ""}`)
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(opts)
          ));

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Leveling — Choose level")
            .setColor(0x5865F2)
            .setDescription("Pick a level. You’ll then choose the specific rewards to remove.");

          await interaction.update({
            embeds: [embed],
            components: [
              ...rows,
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary))
            ]
          }).catch(() => {});
          return startCollector();
        }

        // Leveling: remove level -> open select flow (multi-select allowed)
        if (categoryName === "Leveling" && settingKey === "LevelRewards" && action === "removeLevel") {
          const levelKeys = Object.keys(config.levelRewards || {}).sort((a,b) => Number(a) - Number(b));
          if (!levelKeys.length) {
            await interaction.reply({ content: `${EMOJI_ERROR} There are no levels to remove.`, ephemeral: true });
            return;
          }

          const levelOptions = levelKeys.map(lvl => ({ label: `Level ${lvl}`, value: String(lvl) }));
          const pages = chunk(levelOptions, 25);
          const rows = pages.map((opts, idx) => new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`lr_remove_levels_${idx}`)
              .setPlaceholder(`Select level(s) to remove${pages.length > 1 ? ` (page ${idx+1}/${pages.length})` : ""}`)
              .setMinValues(1)
              .setMaxValues(Math.min(25, opts.length))
              .addOptions(opts)
          ));

          const embed = new EmbedBuilder()
            .setTitle("⚙️ Leveling — Remove level(s)")
            .setColor(0x5865F2)
            .setDescription("Pick one or more levels to remove. This deletes the configured rewards for those levels.");

          await interaction.update({
            embeds: [embed],
            components: [
              ...rows,
              new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`setting_Leveling_LevelRewards`).setLabel("Back").setStyle(ButtonStyle.Secondary))
            ]
          }).catch(() => {});
          return startCollector();
        }

        // Other settings could be handled here...
      }

      // Handle per-setting mode toggles for Channels
      if (interaction.customId.startsWith('settingMode_')) {
        const [, cat, key, mode] = interaction.customId.split('_');
        if (cat === 'Sniping' && key === 'ChannelList') {
          const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
          if (config.snipeMode !== newMode) { config.snipeMode = newMode; saveConfig(); }
          const { embed, row } = renderSettingEmbed('Sniping', 'ChannelList');
          await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return startCollector();
        }
        if (cat === 'Leveling' && key === 'LevelingChannels') {
          const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
          if (config.levelingMode !== newMode) { config.levelingMode = newMode; saveConfig(); }
          const { embed, row } = renderSettingEmbed('Leveling', 'LevelingChannels');
          await interaction.update({ embeds: [embed], components: Array.isArray(row) ? row : [row] }).catch(() => {});
          return startCollector();
        }
      }

      // Reset collector timer after any button interaction
      startCollector();
    });

    collector.on("end", async (_, reason) => {
      // If we intentionally switched/reset, don't touch UI
      if (reason === "switch" || reason === "reset") return;
      // Replace all rows with a single disabled timeout button
      try {
        const timeoutRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("expired")
            .setLabel("Timed out — use the command again")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        await mainMsg.edit({ components: [timeoutRow] }).catch(() => {});
      } finally {
        // Remove from legacy active menus tracker
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