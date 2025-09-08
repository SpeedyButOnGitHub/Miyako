const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const theme = require("../../utils/theme");
const { config } = require("../../utils/storage");
const { configCategories } = require("./constants");

function buildRootEmbed() {
  const e = new EmbedBuilder()
    .setTitle(`⚙️ Configuration`)
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
function buildCategorySelect() {
  const row = new ActionRowBuilder();
  const emojiByCat = {
    Sniping: "🔭",
    Moderation: "🛡️",
    Leveling: "📈",
    Economy: "💰",
    Testing: "🧪",
  };
  for (const name of Object.keys(configCategories)) {
    const btn = new ButtonBuilder()
      .setCustomId(`cfg:cat:${name}`)
      .setLabel(name)
      .setEmoji(emojiByCat[name] || "⚙️")
      .setStyle(ButtonStyle.Primary);
    if (row.components.length < 5) row.addComponents(btn);
  }
  return row;
}

function buildSettingButtons(categoryName, settingName) {
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingName];
  if (!setting) return [];

  const rows = [];
  let row = new ActionRowBuilder();
  for (const btn of (setting.buttons || [])) {
    const b = new ButtonBuilder()
      .setCustomId(`config:${categoryName}:${settingName}:${btn.id}`)
      .setLabel(btn.label)
      .setEmoji(btn.emoji || undefined)
      .setStyle(btn.style);
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
    .setTitle(`📁 ${categoryName}`)
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
    .setTitle(`🔧 ${categoryName} • ${setting.getLabel ? setting.getLabel() : settingName}`)
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
  const row = new ActionRowBuilder();
  for (const name of Object.keys(cat.settings)) {
    if (row.components.length >= 4) break; // leave room for Back
    const s = cat.settings[name];
    const label = s.getLabel ? s.getLabel() : name;
    const btn = new ButtonBuilder()
      .setCustomId(`cfg:set:${categoryName}:${name}`)
      .setLabel(label)
      .setEmoji("🔧")
      .setStyle(ButtonStyle.Primary);
    row.addComponents(btn);
  }
  // Back to root
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('cfg:back:root')
      .setLabel('Back')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  return row;
}

// Build a single row for a specific setting: optional mode toggles + actions + Back
function buildSettingRow(categoryName, settingName) {
  const row = new ActionRowBuilder();
  const isSnipingChannels = categoryName === "Sniping" && settingName === "ChannelList";
  const isLevelingChannels = categoryName === "Leveling" && settingName === "LevelingChannels";
  if (isSnipingChannels || isLevelingChannels) {
    const mode = isSnipingChannels ? (config.snipeMode || "whitelist") : (config.levelingMode || "blacklist");
    const wlActive = mode === "whitelist";
    const blActive = mode === "blacklist";
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`settingMode_${categoryName}_${settingName}_whitelist`)
        .setLabel('Whitelist')
        .setEmoji('✅')
        .setStyle(wlActive ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    if (row.components.length < 4) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`settingMode_${categoryName}_${settingName}_blacklist`)
          .setLabel('Blacklist')
          .setEmoji('🚫')
          .setStyle(blActive ? ButtonStyle.Danger : ButtonStyle.Secondary)
      );
    }
  }
  const cat = configCategories[categoryName];
  const setting = cat?.settings?.[settingName];
  for (const btn of (setting?.buttons || [])) {
    if (row.components.length >= 4) break; // leave room for Back
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`config:${categoryName}:${settingName}:${btn.id}`)
        .setLabel(btn.label)
        .setEmoji(btn.emoji || undefined)
        .setStyle(btn.style)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:back:${categoryName}`)
      .setLabel('Back')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
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
        ? "🗺️"
        : settingKey.toLowerCase().includes("multiplier")
        ? "🧠"
        : settingKey.toLowerCase().includes("reward")
        ? "🎁"
        : "📈"
      : categoryName === "Sniping"
      ? settingKey.toLowerCase().includes("channel")
        ? "🔭"
        : "🔧"
      : categoryName === "Economy"
      ? "💰"
      : "🛡️";
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
