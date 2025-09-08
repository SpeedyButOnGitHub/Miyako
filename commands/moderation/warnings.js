const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, Message } = require("discord.js");
const { replyError, EMOJI_SUCCESS } = require("./replies");
const { sendUserDM } = require("./dm");
const { sendModLog } = require("../../utils/modLogs");
const { isModerator } = require("./permissions");
const { config, saveConfig } = require("../../utils/storage");

const WARNING_EXPIRY = 1000 * 60 * 60 * 24 * 60;

function cleanWarnings(targetId) {
  if (!config.warnings[targetId]) return [];
  const now = Date.now();
  config.warnings[targetId] = config.warnings[targetId].filter(w => now - w.date < WARNING_EXPIRY);
  saveConfig();
  return config.warnings[targetId];
}

// Helper to format "in x days/hours" for Discord timestamp
function formatExpiresTimestamp(date) {
  const expiresAt = date + WARNING_EXPIRY;
  return `<t:${Math.floor(expiresAt / 1000)}:R>`; // "in x days"
}

// Helper to get message link for warn log (if available)
function getWarnLogLink(guildId, messageId) {
  if (!guildId || !messageId) return "*Unable to provide message link*";
  const channelId = config.testingMode ? "1413966369296220233" : (config.modLogChannelId || "1232701768383729791");
  return `[Jump to message](https://discord.com/channels/${guildId}/${channelId}/${messageId})`;
}

function buildWarningsEmbed(userOrMember, guild, page = 1, pageSize = 6, override = null) {
  // Show synthetic warnings in testing mode for any user
  let warnings = override ?? cleanWarnings(userOrMember.id);
  if (config.testingMode && !override) {
    const count = 6 + Math.floor(Math.random() * 9); // 6-14 warnings for readability test
    warnings = Array.from({ length: count }).map((_, i) => ({
      moderator: guild.ownerId || userOrMember.id,
      reason: `Test warning #${i + 1}`,
      date: Date.now() - Math.floor(Math.random() * (WARNING_EXPIRY / 2)),
      logMsgId: null,
    }));
  }

  const total = warnings.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = warnings.slice(start, start + pageSize);

  const fields = slice.map((w, i) => {
    const idx = start + i + 1;
    const jumpLink = w.logMsgId ? getWarnLogLink(guild.id, w.logMsgId) : "*No log link*";
    return {
      name: `#${idx} • ${w.reason || "No reason"}`,
      value: `👮 By: <@${w.moderator}>  •  ⏰ Expires: ${formatExpiresTimestamp(w.date)}\n${jumpLink}`,
      inline: false
    };
  });

  const displayName = userOrMember.displayName || userOrMember.username || userOrMember.tag || userOrMember.id;
  const avatar = userOrMember.displayAvatarURL ? userOrMember.displayAvatarURL({ dynamic: true }) : undefined;

  const embed = new EmbedBuilder()
    .setAuthor({ name: displayName, iconURL: avatar })
    // Avoid mention in title; use description to show the mention safely
    .setTitle("⚠️ Warnings")
    .setDescription(userOrMember.id ? `User: <@${userOrMember.id}>` : displayName)
    .setColor(0xffd700)
    .addFields(fields.length ? fields : [{ name: "No warnings", value: "—", inline: false }])
    .setFooter({ text: `Page ${safePage}/${totalPages} • ${total} total warnings` })
    .setTimestamp();

  return { embed, page: safePage, totalPages, total };
}

function buildWarningsRow(userOrMember) {
  // Only show Add/Remove; no Back button for direct .warnings @user view
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`addwarn_${userOrMember.id}`)
      .setLabel("Add Warning")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚠️"),
    new ButtonBuilder()
      .setCustomId(`removewarn_${userOrMember.id}`)
      .setLabel("Remove Warning")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
  );
}

async function showWarnings(context, userOrMember) {
  // If no userOrMember is provided, show overview with pagination
  if (!userOrMember) {
    const guild = context.guild;
    const isTesting = !!config.testingMode;
    // Base map from config (cleaned)
    const baseMap = Object.entries(config.warnings || {}).reduce((acc, [uid, arr]) => {
      acc[uid] = (arr || []).filter(w => Date.now() - w.date < WARNING_EXPIRY);
      return acc;
    }, {});
    // Synthetic map for testing mode (non-persistent)
    let map = baseMap;
    if (isTesting) {
      const members = (await guild.members.fetch().catch(() => null)) || guild.members.cache;
      const ids = members.filter(m => !m.user.bot).map(m => m.id);
      map = {};
      const nUsers = Math.min(24, ids.length);
      for (let i = 0; i < nUsers; i++) {
        const uid = ids[i];
        const count = 1 + Math.floor(Math.random() * 3);
        map[uid] = Array.from({ length: count }).map(() => ({ moderator: context.author?.id || context.user?.id || uid, reason: "Test warning", date: Date.now() - Math.floor(Math.random() * (WARNING_EXPIRY / 2)), logMsgId: null }));
      }
    }
    // First page
    const users = Object.keys(map).filter(uid => (map[uid] || []).length > 0);
    const totalPages = Math.max(1, Math.ceil(users.length / 6));
    const page = 1;
    const start = (page - 1) * 6;
    const slice = users.slice(start, start + 6);
    const fields = slice.map(uid => {
      const arr = map[uid] || [];
      const name = guild.members.cache.get(uid)?.displayName || guild.client.users.cache.get(uid)?.username || `User ${uid}`;
      const val = arr.map((w, i) => {
        const link = w.logMsgId ? getWarnLogLink(guild.id, w.logMsgId) : "*Unable to provide message link*";
        return `**${i + 1}.** ${w.reason || "No reason"} — <@${w.moderator}>\n${link}`;
      }).join("\n");
      return { name: `⚠️ ${name} (${arr.length})`, value: val || "—", inline: false };
    });
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Server Warnings Overview")
      .setColor(0xffd700)
      .addFields(fields)
      .setFooter({ text: `Page ${page}/${totalPages}` })
      .setTimestamp();
    const rows = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("warns_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("warns_page").setLabel(`Page ${page}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("warns_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
    )];
    const sent = await context.reply({ embeds: [embed], components: rows }).catch(() => null);
    if (sent) {
      ActiveMenus.registerMessage(sent, { type: "warnings", userId: context.author?.id || context.user?.id, data: { page, warningsOverride: isTesting ? map : undefined } });
    }
    return;
  }

  // Otherwise, show warnings for the specific user/member
  const { embed, page, totalPages } = buildWarningsEmbed(userOrMember, context.guild);
  const row = buildWarningsRow(userOrMember);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`warn_user_prev_${userOrMember.id}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`warn_user_page_${userOrMember.id}`).setLabel(`Page ${page}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`warn_user_next_${userOrMember.id}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
  );
  if (context instanceof Message) {
    const sent = await context.reply({ content: `<@${userOrMember.id}>`, embeds: [embed], components: [row, nav], allowedMentions: { users: [userOrMember.id] } }).catch(() => null);
    if (sent) {
      ActiveMenus.registerMessage(sent, { type: "warn_user", userId: context.author?.id, data: { userId: userOrMember.id, page } });
    }
  }
}

async function handleWarningButtons(client, interaction) {
  // Always acknowledge buttons quickly by showing a modal
  if (interaction.isButton()) {
    const [id, userId] = interaction.customId.split("_"); // addwarn_<id> | removewarn_<id>
    if (id === "addwarn" && userId) {
      const modal = new ModalBuilder()
        .setCustomId(`addwarn_${userId}`)
        .setTitle("Add Warning")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal).catch(() => {});
      return;
    }
    if (id === "removewarn" && userId) {
      const modal = new ModalBuilder()
        .setCustomId(`removewarn_${userId}`)
        .setTitle("Remove Warning")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("index")
              .setLabel("Warning index (1 = oldest, empty = latest)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal).catch(() => {});
      return;
    }
    return;
  }

  // Modal submits
  if (interaction.type === InteractionType.ModalSubmit) {
    const [action, userId] = interaction.customId.split("_"); // addwarn_<id> | removewarn_<id>
    const guild = interaction.guild;
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    const user = member ? member.user : await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) {
      await interaction.reply({ content: "User not found.", ephemeral: true }).catch(() => {});
      return;
    }

    if (action === "addwarn") {
      const reason = interaction.fields.getTextInputValue("reason") || "No reason provided";
      // Delegate to moderation command logic via config store
      if (!Array.isArray(config.warnings[user.id])) config.warnings[user.id] = [];
      config.warnings[user.id].push({ moderator: interaction.user.id, reason, date: Date.now(), logMsgId: null });
      saveConfig();
      await interaction.reply({ content: "Warning added.", ephemeral: true }).catch(() => {});
      return;
    }

    if (action === "removewarn") {
      const raw = interaction.fields.getTextInputValue("index");
      const list = config.warnings[user.id] || [];
      if (!list.length) {
        await interaction.reply({ content: "This user has no warnings.", ephemeral: true }).catch(() => {});
        return;
      }
      let index = parseInt(raw, 10);
      if (isNaN(index) || index < 1 || index > list.length) index = list.length;
      list.splice(index - 1, 1);
      config.warnings[user.id] = list;
      saveConfig();
      await interaction.reply({ content: `Removed warning #${index}.`, ephemeral: true }).catch(() => {});
      return;
    }
  }
}

async function handleWarningsCommand(client, message) {
  const mention = message.mentions.members.first() || message.mentions.users.first();
  if (mention) {
    return showWarnings(message, mention);
  }
  const arg = message.content.trim().split(/\s+/)[1];
  if (arg && /^\d{5,}$/.test(arg)) {
    const member = await message.guild.members.fetch(arg).catch(() => null);
    const user = member ? member.user : await client.users.fetch(arg).catch(() => null);
    return showWarnings(message, member || user || null);
  }
  return showWarnings(message, null);
}

module.exports = {
  showWarnings,
  handleWarningButtons,
  cleanWarnings,
  handleWarningsCommand
};

// Warnings overview pagination handler
const ActiveMenus = require("../../utils/activeMenus");
ActiveMenus.registerHandler("warnings", async (interaction, session) => {
  if (!interaction.isButton()) return;
  const id = interaction.customId;
  if (!["warns_prev", "warns_next", "warns_page"].includes(id)) return;
  const map = session?.data?.warningsOverride || config.warnings || {};
  const users = Object.keys(map).filter(uid => (map[uid] || []).length > 0);
  const totalPages = Math.max(1, Math.ceil(users.length / 6));
  let page = Number(session?.data?.page) || 1;
  if (id === "warns_prev") page = Math.max(1, page - 1);
  if (id === "warns_next") page = Math.min(totalPages, page + 1);
  session.data.page = page;

  const start = (page - 1) * 6;
  const slice = users.slice(start, start + 6);
  const fields = slice.map(uid => {
    const arr = map[uid] || [];
    const name = interaction.guild.members.cache.get(uid)?.displayName || interaction.client.users.cache.get(uid)?.username || `User ${uid}`;
    const val = arr.map((w, i) => {
      const link = w.logMsgId ? getWarnLogLink(interaction.guild.id, w.logMsgId) : "*No log link*";
      return `**${i + 1}.** ${w.reason || "No reason"} — <@${w.moderator}>\n${link}`;
    }).join("\n");
    return { name: `⚠️ ${name} (${arr.length})`, value: val || "—", inline: false };
  });
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Server Warnings Overview")
    .setColor(0xffd700)
    .addFields(fields)
    .setFooter({ text: `Page ${page}/${totalPages}` })
    .setTimestamp();
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("warns_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("warns_page").setLabel(`Page ${page}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("warns_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  )];
  await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
});

// Per-user warnings pagination handler
ActiveMenus.registerHandler("warn_user", async (interaction, session) => {
  if (!interaction.isButton()) return;
  const id = interaction.customId;
  const userId = session?.data?.userId;
  if (!userId) return;
  if (!id.startsWith("warn_user_")) return;
  const [, , action, btnUserId] = id.split("_");
  if (btnUserId !== userId) return;

  let member = await interaction.guild.members.fetch(userId).catch(() => null);
  const userOrMember = member || (await interaction.client.users.fetch(userId).catch(() => null));
  if (!userOrMember) return;

  let page = Number(session?.data?.page) || 1;
  if (action === "prev") page = Math.max(1, page - 1);
  if (action === "next") page = page + 1;

  const { embed, page: safePage, totalPages } = buildWarningsEmbed(userOrMember, interaction.guild);
  session.data.page = safePage;

  const row = buildWarningsRow(userOrMember);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`warn_user_prev_${userId}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 1),
    new ButtonBuilder().setCustomId(`warn_user_page_${userId}`).setLabel(`Page ${safePage}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`warn_user_next_${userId}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages),
  );
  await interaction.update({ embeds: [embed], components: [row, nav] }).catch(() => {});
});