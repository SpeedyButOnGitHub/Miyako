const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { semanticButton, buildNavRow } = require('../../utils/ui');
const theme = require("../../utils/theme");
const { config } = require("../../utils/storage");
const { configCategories } = require("./constants");

function buildRootEmbed() {
  const e = new EmbedBuilder()
    .setTitle(`${theme.emojis.settings} Configuration`)
    .setColor(theme.colors.primary)
    .setDescription(
      "Select a category to view and manage settings.\n\n" +
        Object.entries(configCategories)
          .map(
            ([name, cat]) =>
              `• **${name}** — ${
                typeof cat.description === "function" ? cat.description() : cat.description
              }`
          )
          .join("\n")
    )
    .setFooter({ text: `Testing Mode: ${config.testingMode ? "ON" : "OFF"}` });
  return e;
}

// Build category navigation as buttons (uniform with Help UI)
function buildCategorySelect(currentCategory) {
  const row = buildNavRow([]);
  const emojiByCat = {
    Sniping: "🔭",
    Moderation: "🛡️",
    Leveling: "📈",
    Economy: "💰",
    Testing: "🧪",
  };
  for (const name of Object.keys(configCategories)) {
    const active = currentCategory === name;
    if (row.components.length < 5) row.addComponents(
      semanticButton(active ? 'primary' : 'nav', { id: `cfg:cat:${name}`, label: name, emoji: emojiByCat[name] || theme.emojis.settings, active })
    );
  }
  return row;
}

function buildSettingButtons(categoryName, settingName) {
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingName];
  if (!setting) return [];

  const rows = [];
  let row = buildNavRow([]);
  for (const btn of (setting.buttons || [])) {
  const compact = (btn.label || '').length > 14 ? btn.label.slice(0,11) + '…' : btn.label;
  const kind = btn.style === ButtonStyle.Danger ? 'danger' : (btn.style === ButtonStyle.Success ? 'success' : (btn.style === ButtonStyle.Primary ? 'primary' : 'nav'));
  const b = semanticButton(kind, { id: `config:${categoryName}:${settingName}:${btn.id}`, label: compact, emoji: btn.emoji });
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(b);
  }
  if (row.components.length) rows.push(row);
  return rows;
}

function buildCategoryEmbed(categoryName) {
  const cat = configCategories[categoryName];
  const e = new EmbedBuilder()
  .setTitle(`${theme.emojis.select} ${categoryName}`)
    .setColor(theme.colors.primary)
    .setDescription(
      typeof cat.description === "function" ? cat.description() : cat.description || ""
    );

  const lines = [];
  for (const [settingName, setting] of Object.entries(cat.settings)) {
    const label = setting.getLabel ? setting.getLabel() : settingName;
    const summary = setting.getSummary ? setting.getSummary() : '';
    lines.push(`• **${label}** — ${summary}`);
  }
  if (lines.length) e.addFields({ name: "Settings", value: lines.join("\n") });

  return e;
}

function buildSettingEmbed(categoryName, settingName) {
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingName];
  const e = new EmbedBuilder()
  .setTitle(`${theme.emojis.edit} ${categoryName} • ${setting.getLabel ? setting.getLabel() : settingName}`)
    .setColor(theme.colors.neutral)
    .setDescription(
      typeof setting.description === "function"
        ? setting.description()
        : setting.description || ""
    )
    .addFields({
      name: "Current",
      value: setting.getDisplay ? setting.getDisplay() : "—",
    });
  return e;
}

// Build per-category setting list as a single row of buttons + Back
function buildSettingSelect(categoryName) {
  const cat = configCategories[categoryName];
  const row = buildNavRow([]);
  for (const name of Object.keys(cat.settings)) {
    if (row.components.length >= 4) break; // leave room for Back
    const s = cat.settings[name];
    const label = s.getLabel ? s.getLabel() : name;
    const compact = label.length > 12 ? label.slice(0,9)+'…' : label;
    row.addComponents(semanticButton('primary', { id: `cfg:set:${categoryName}:${name}`, label: compact, emoji: theme.emojis.edit }));
  }
  // Back to root
  row.addComponents(semanticButton('nav', { id: 'cfg:back:root', label: 'Back', emoji: theme.emojis.back }));
  return row;
}

// Build a single row for a specific setting: optional mode toggles + actions + Back
function buildSettingRow(categoryName, settingName) {
  const row = buildNavRow([]);
  const isSnipingChannels = categoryName === "Sniping" && settingName === "ChannelList";
  const isLevelingChannels = categoryName === "Leveling" && settingName === "LevelingChannels";
  if (isSnipingChannels || isLevelingChannels) {
    const mode = isSnipingChannels ? (config.snipeMode || "whitelist") : (config.levelingMode || "blacklist");
    const wlActive = mode === "whitelist";
    const blActive = mode === "blacklist";
    row.addComponents(semanticButton(wlActive ? 'success' : 'nav', { id: `settingMode_${categoryName}_${settingName}_whitelist`, label: 'White', emoji: theme.emojis.enable, active: wlActive }));
    if (row.components.length < 4) {
      row.addComponents(semanticButton(blActive ? 'danger' : 'nav', { id: `settingMode_${categoryName}_${settingName}_blacklist`, label: 'Black', emoji: theme.emojis.disable, active: blActive }));
    }
  }
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingName];
  for (const btn of (setting?.buttons || [])) {
    if (row.components.length >= 4) break; // leave room for Back
    const compactBtn = btn.label.length > 12 ? btn.label.slice(0,9)+'…' : btn.label;
    const kind = btn.style === ButtonStyle.Danger ? 'danger' : (btn.style === ButtonStyle.Success ? 'success' : (btn.style === ButtonStyle.Primary ? 'primary' : 'nav'));
    row.addComponents(semanticButton(kind, { id: `config:${categoryName}:${settingName}:${btn.id}`, label: compactBtn, emoji: btn.emoji }));
  }
  row.addComponents(semanticButton('nav', { id: `cfg:back:${categoryName}`, label: 'Back', emoji: theme.emojis.back }));
  return row;
}

module.exports = {
  buildRootEmbed,
  buildCategorySelect,
  buildCategoryEmbed,
  buildSettingEmbed,
  buildSettingButtons,
  buildSettingSelect,
  buildSettingRow,
};

// Legacy-compatible helper used by interactionEvents to refresh a single setting view.
function renderSettingEmbed(categoryName, settingKey) {
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingKey];
  if (!cat || !setting) {
    const e = new EmbedBuilder()
      .setTitle("Not Found")
      .setColor(theme.colors.danger)
      .setDescription("Unknown setting.");
    return { embed: e, row: new ActionRowBuilder() };
  }

  // Title
  const keyLabel = setting.getLabel ? setting.getLabel() : settingKey;
  const titleEmoji =
    categoryName === "Leveling"
      ? settingKey.toLowerCase().includes("channel")
        ? theme.emojis.select
        : settingKey.toLowerCase().includes("multiplier")
        ? theme.emojis.counter
        : settingKey.toLowerCase().includes("reward")
        ? "🎁"
        : theme.emojis.rank
      : categoryName === "Sniping"
      ? settingKey.toLowerCase().includes("channel")
        ? "🔭"
        : theme.emojis.edit
      : categoryName === "Economy"
      ? theme.emojis.cash
      : theme.emojis.moderator;
  const prettyTitle = `${titleEmoji} ${categoryName} — ${keyLabel}`;
  const color =
    categoryName === "Leveling"
      ? theme.colors.primary
      : categoryName === "Sniping"
      ? theme.colors.neutral
      : theme.colors.primary;
  const itemEmbed = new EmbedBuilder()
    .setTitle(prettyTitle)
    .setColor(color)
    .setDescription(
      `**${
        typeof setting.description === "function"
          ? setting.description()
          : setting.description
      }**`
    )
    .addFields({ name: "Current", value: setting.getDisplay ? setting.getDisplay() : "—" });

  // Single row with toggles/actions/back
  const row = buildSettingRow(categoryName, settingKey);
  return { embed: itemEmbed, row };
}

module.exports.renderSettingEmbed = renderSettingEmbed;
