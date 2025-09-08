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
  const isButton = interaction.isButton();
  const isModal = interaction.type === InteractionType.ModalSubmit;
  const [action, targetId] = interaction.customId.split("_");

  let member = await interaction.guild.members.fetch(targetId).catch(() => null);
  let user = member ? member.user : await interaction.client.users.fetch(targetId).catch(() => null);
  if (!user) return replyError(interaction, "User not found.");
  if (!isModerator(interaction.member)) return replyError(interaction, "You are not allowed.");

  const userOrMember = member || user;

  if (isButton) {
    if (action === "addwarn") {
      const modal = new ModalBuilder()
        .setCustomId(`addwarn_${targetId}`)
        .setTitle(`Add Warning for ${userOrMember.displayName || userOrMember.username}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("warnReason")
              .setLabel("Reason")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }
    if (action === "removewarn") {
      const warnings = cleanWarnings(targetId);
      if (warnings.length === 0) return replyError(interaction, "No warnings to remove.");

      const modal = new ModalBuilder()
        .setCustomId(`removewarn_${targetId}`)
        .setTitle(`Remove Warning for ${userOrMember.displayName || userOrMember.username}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("warnIndex")
              .setLabel(`Enter warning number (1-${warnings.length})`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }
  } else if (isModal) {
    if (action === "addwarn") {
      const reason = interaction.fields.getTextInputValue("warnReason") || "No reason";
      const isTesting = !!config.testingMode;
      let warnings = cleanWarnings(targetId);

  // Determine thresholds (updated: mute at 3, kick at 5)
  const escalation = config.escalation || {};
  const kickThreshold = 5;
  const muteThreshold = 3;
  const muteDuration = typeof escalation.muteDuration === "number" ? escalation.muteDuration : 2 * 60 * 60 * 1000;

      // Calculate the new count (without mutating yet in testing mode)
      const newCount = (warnings?.length || 0) + 1;

      // Apply persistence only if not testing
      let savedWarningEntry = null;
      if (!isTesting) {
        savedWarningEntry = { moderator: interaction.user.id, reason, date: Date.now(), logMsgId: null };
        warnings.push(savedWarningEntry);
        config.warnings[targetId] = warnings;
        saveConfig();
      }

  // Check and perform escalation (mute/kick) if thresholds reached and member exists
  let escalationNote = null;
  let muteDurationText = null;
      if (member) {
        try {
          if (newCount >= kickThreshold) {
            if (!isTesting) await member.kick("Auto-kicked for reaching warning threshold");
            escalationNote = `Auto-kicked for reaching ${kickThreshold} warnings`;
          } else if (newCount >= muteThreshold) {
            if (!isTesting) {
              await member.timeout(muteDuration, "Auto-muted for reaching warning threshold");
              // Attempt to add mute role if configured elsewhere; best-effort
            }
    const ms = require("ms");
    muteDurationText = ms(muteDuration, { long: true });
    const endTs = `<t:${Math.floor((Date.now() + muteDuration) / 1000)}:R>`;
    escalationNote = `Auto-muted for ${muteDurationText} (threshold ${muteThreshold}) (ends ${endTs})`;
          }
        } catch (e) {
          console.error("[Warnings] Escalation error:", e);
        }
      }

      // Remaining-to-threshold info
      const remainingToMute = Math.max(0, muteThreshold - newCount);
      const remainingToKick = Math.max(0, kickThreshold - newCount);
      const remainingLine = `Warnings until actions: ${remainingToMute} to auto-mute, ${remainingToKick} to auto-kick.`;

      // Send a single consolidated mod log entry (warn + thresholds + possible escalation note)
      const combinedReason = `${reason} • ${remainingLine}${escalationNote ? ` • ${escalationNote}` : ""}`;
      const logMsg = await sendModLog(
        client,
        userOrMember,
        interaction.user,
        "warned",
        combinedReason,
        true,
        muteDurationText || null,
        newCount
      );

      // Store log msg id on the saved entry
      if (!isTesting && savedWarningEntry) {
        savedWarningEntry.logMsgId = logMsg?.id || null;
        saveConfig();
      }

      // DM the user; include escalation note in DM extra
      await sendUserDM(
        userOrMember,
        "warned",
        muteDurationText || null,
        reason,
        `Current warnings: ${newCount}\n${remainingLine}${escalationNote ? `\n${escalationNote}` : ""}`
      );

      // Update the original warnings message if possible
      if (interaction.message && interaction.message.edit) {
        const { embed: updatedEmbed, page: p, totalPages: tp } = buildWarningsEmbed(userOrMember, interaction.guild);
        const row = buildWarningsRow(userOrMember);
        const nav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`warn_user_prev_${userOrMember.id}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
          new ButtonBuilder().setCustomId(`warn_user_page_${userOrMember.id}`).setLabel(`Page ${p}/${tp}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(`warn_user_next_${userOrMember.id}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(p >= tp),
        );
        await interaction.message.edit({ content: `<@${userOrMember.id}>`, embeds: [updatedEmbed], components: [row, nav], allowedMentions: { users: [userOrMember.id] } }).catch(() => {});
      }

      await interaction.reply({
        content: `${EMOJI_SUCCESS} Warning ${isTesting ? "(TEST) would be " : ""}added: **${reason}**`,
        ephemeral: true
      });
      return;
    }

    if (action === "removewarn") {
      let warnings = cleanWarnings(targetId);
      if (warnings.length === 0) return replyError(interaction, "No warnings to remove.");

      const indexStr = interaction.fields.getTextInputValue("warnIndex");
      const index = parseInt(indexStr, 10);
      if (isNaN(index) || index < 1 || index > warnings.length)
        return replyError(interaction, `Invalid warning number. Please enter a number between 1 and ${warnings.length}.`);
      const isTesting = !!config.testingMode;
      const removed = isTesting ? warnings[index - 1] : warnings.splice(index - 1, 1)[0];
      if (!isTesting) {
        config.warnings[targetId] = warnings;
        saveConfig();
      }

  const remainingToMute2 = Math.max(0, 3 - warnings.length);
  const remainingToKick2 = Math.max(0, 5 - warnings.length);
  const remainingLine2 = `Warnings until actions: ${remainingToMute2} to auto-mute, ${remainingToKick2} to auto-kick.`;

  await sendUserDM(userOrMember, "warning removed", null, removed.reason, `Current warnings: ${warnings.length}\n${remainingLine2}`);
  await sendModLog(client, userOrMember, interaction.user, "warning removed", `${removed.reason} • ${remainingLine2}`, true, null, warnings.length);

      // Update the original warnings message if possible
      if (interaction.message && interaction.message.edit) {
        const { embed: updatedEmbed, page: p, totalPages: tp } = buildWarningsEmbed(userOrMember, interaction.guild);
        const row = buildWarningsRow(userOrMember);
        const nav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`warn_user_prev_${userOrMember.id}`).setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
          new ButtonBuilder().setCustomId(`warn_user_page_${userOrMember.id}`).setLabel(`Page ${p}/${tp}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(`warn_user_next_${userOrMember.id}`).setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(p >= tp),
        );
        await interaction.message.edit({ content: `<@${userOrMember.id}>`, embeds: [updatedEmbed], components: [row, nav], allowedMentions: { users: [userOrMember.id] } }).catch(() => {});
      }

      await interaction.reply({
        content: `${EMOJI_SUCCESS} Warning #${index} ${isTesting ? "(TEST) would be " : ""}removed.`,
        ephemeral: true
      });
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