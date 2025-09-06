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

function buildWarningsEmbed(userOrMember) {
  const warnings = cleanWarnings(userOrMember.id);
  return new EmbedBuilder()
    .setAuthor({
      name: userOrMember.displayName || userOrMember.username,
      iconURL: userOrMember.displayAvatarURL({ dynamic: true })
    })
    .setTitle("Warnings")
    .setDescription(
      warnings.length > 0
        ? warnings.map((w, i) => `**${i + 1}.** ${w.reason || "No reason"} (by <@${w.moderator}>)`).join("\n")
        : "No warnings"
    )
    .setColor(0xffff00)
    .setFooter({ text: `${warnings.length} total warnings` });
}

function buildWarningsRow(userOrMember) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`addwarn_${userOrMember.id}`)
        .setLabel("Add Warning")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`removewarn_${userOrMember.id}`)
        .setLabel("Remove Warning")
        .setStyle(ButtonStyle.Danger)
    );
}

async function showWarnings(context, userOrMember) {
  const embed = buildWarningsEmbed(userOrMember);
  const row = buildWarningsRow(userOrMember);

  if (context instanceof Message) {
    await context.reply({ embeds: [embed], components: [row] });
  }
}

async function handleWarningButtons(client, interaction) {
  const isButton = interaction.isButton();
  const isModal = interaction.type === InteractionType.ModalSubmit;
  const [action, targetId] = interaction.customId.split("_");

  // Try to fetch member, fallback to user
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

      warnings.push({ moderator: interaction.user.id, reason, date: Date.now() });
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(userOrMember, "warned", null, reason, `Current warnings: ${warnings.length}`);
      await sendModLog(client, userOrMember, interaction.user, "warned", reason, true, null, warnings.length);

      // Update the original warnings message if possible
      if (interaction.message && interaction.message.edit) {
        const embed = buildWarningsEmbed(userOrMember);
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
        const embed = buildWarningsEmbed(userOrMember);
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

module.exports = { showWarnings, handleWarningButtons, cleanWarnings };