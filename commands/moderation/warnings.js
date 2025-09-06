import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, Message } from "discord.js";
import { replyError, EMOJI_SUCCESS } from "./replies.js";
import { sendUserDM } from "./dm.js";
import { sendModLog } from "../../utils/modLogs.js";
import { isModerator } from "./permissions.js";
import { config, saveConfig } from "../../utils/storage.js";

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
function getWarnLogLink(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return "";
  return `[🔗 View Log](https://discord.com/channels/${guildId}/${channelId}/${messageId})`;
}

function buildWarningsEmbed(userOrMember, guild) {
  const warnings = cleanWarnings(userOrMember.id);
  return new EmbedBuilder()
    .setAuthor({
      name: userOrMember.displayName || userOrMember.username,
      iconURL: userOrMember.displayAvatarURL({ dynamic: true })
    })
    .setTitle("⚠️ Warnings")
    .setColor(0xffd700)
    .setDescription(
      warnings.length > 0
        ? warnings.map((w, i) => {
            let jumpLink;
            if (w.logMsgId) {
              jumpLink = `[Jump to message](https://discord.com/channels/${guild.id}/1232701768383729791/${w.logMsgId})`;
            } else {
              jumpLink = "*Unable to provide message link*";
            }
            return (
              `**${i + 1}.** ${w.reason || "No reason"}\n` +
              `👮 By: <@${w.moderator}>\n` +
              `⏰ Expires: ${formatExpiresTimestamp(w.date)}\n` +
              `${jumpLink}`
            );
          }).join("\n\n")
        : "No warnings"
    )
    .setFooter({ text: `${warnings.length} total warnings` })
    .setTimestamp();
}

function buildWarningsRow(userOrMember) {
  return new ActionRowBuilder()
    .addComponents(
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
  // If no userOrMember is provided, show all warnings in the server
  if (!userOrMember) {
    const { client, guild } = context;
    const warningsData = config.warnings;
    let totalWarnings = 0;
    let fields = [];

    for (const userId in warningsData) {
      const warnings = cleanWarnings(userId);
      if (warnings.length === 0) continue;
      totalWarnings += warnings.length;

      let member = guild ? guild.members.cache.get(userId) : null;
      let user = member ? member.user : await client.users.fetch(userId).catch(() => null);

      const name = member?.displayName || user?.username || `User ${userId}`;
      const avatar = member?.displayAvatarURL({ dynamic: true }) || user?.displayAvatarURL?.({ dynamic: true }) || null;

      fields.push({
        name: `⚠️ ${name} (${warnings.length} warning${warnings.length > 1 ? "s" : ""})`,
        value: warnings.map((w, i) => {
          let jumpLink;
          if (w.logMsgId) {
            jumpLink = `[Jump to message](https://discord.com/channels/${guild.id}/1232701768383729791/${w.logMsgId})`;
          } else {
            jumpLink = "*Unable to provide message link*";
          }
          return `**${i + 1}.** ${w.reason || "No reason"}\n👮 By: <@${w.moderator}>\n⏰ Expires: ${formatExpiresTimestamp(w.date)}\n${jumpLink}`;
        }).join("\n\n"),
        inline: false
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Server Warnings Overview")
      .setColor(0xffd700)
      .setDescription(
        fields.length > 0
          ? `Total warnings: **${totalWarnings}**\n\n`
          : "No warnings found in the server."
      )
      .addFields(fields)
      .setTimestamp();

    await context.reply({ embeds: [embed] });
    return;
  }

  // Otherwise, show warnings for the specific user/member
  const embed = buildWarningsEmbed(userOrMember, context.guild);
  const row = buildWarningsRow(userOrMember);

  if (context instanceof Message) {
    await context.reply({ embeds: [embed], components: [row] });
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
      let warnings = cleanWarnings(targetId);

      // Send mod log and get the message object
      const logMsg = await sendModLog(client, userOrMember, interaction.user, "warned", reason, true, null, warnings.length + 1);

      // Store log message ID for linking
      warnings.push({ moderator: interaction.user.id, reason, date: Date.now(), logMsgId: logMsg?.id });
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(userOrMember, "warned", null, reason, `Current warnings: ${warnings.length}`);
      // No need to sendModLog again, already sent above

      // Update the original warnings message if possible
      if (interaction.message && interaction.message.edit) {
        const embed = buildWarningsEmbed(userOrMember, interaction.guild);
        const row = buildWarningsRow(userOrMember);
        await interaction.message.edit({ embeds: [embed], components: [row] });
      }

      await interaction.reply({
        content: `${EMOJI_SUCCESS} Warning added: **${reason}**`,
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

      const removed = warnings.splice(index - 1, 1)[0];
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(userOrMember, "warning removed", null, removed.reason, `Current warnings: ${warnings.length}`);
      await sendModLog(client, userOrMember, interaction.user, "warning removed", removed.reason, true, null, warnings.length);

      // Update the original warnings message if possible
      if (interaction.message && interaction.message.edit) {
        const embed = buildWarningsEmbed(userOrMember, interaction.guild);
        const row = buildWarningsRow(userOrMember);
        await interaction.message.edit({ embeds: [embed], components: [row] });
      }

      await interaction.reply({
        content: `${EMOJI_SUCCESS} Warning #${index} removed.`,
        ephemeral: true
      });
      return;
    }
  }
}

export { showWarnings, handleWarningButtons, cleanWarnings };