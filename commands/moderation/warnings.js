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

async function showWarnings(context, target) {
  const warnings = cleanWarnings(target.id);
  const embed = new EmbedBuilder()
    .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
    .setTitle("Warnings")
    .setDescription(
      warnings.length > 0
        ? warnings.map((w, i) => `**${i + 1}.** ${w.reason || "No reason"} (by <@${w.moderator}>)`).join("\n")
        : "No warnings"
    )
    .setColor(0xffff00)
    .setFooter({ text: `${warnings.length} total warnings` });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`addwarn_${target.id}`)
        .setLabel("Add Warning")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`removewarn_${target.id}`)
        .setLabel("Remove Warning")
        .setStyle(ButtonStyle.Danger)
    );

  if (context instanceof Message) {
    await context.reply({ embeds: [embed], components: [row] });
  }
}

async function handleWarningButtons(client, interaction) {
  if (interaction.isButton()) {
    const [action, targetId] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) return replyError(interaction, "User not found.");
    if (!isModerator(interaction.member)) return replyError(interaction, "You are not allowed.");

    if (action === "addwarn") {
      const modal = new ModalBuilder()
        .setCustomId(`addwarn_${targetId}`)
        .setTitle(`Add Warning for ${member.user.tag}`)
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
      let warnings = cleanWarnings(targetId);
      if (warnings.length === 0) return replyError(interaction, "No warnings to remove.");
      const removed = warnings.pop();
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(member, "warning removed", null, removed.reason, `Current warnings: ${warnings.length}`);
      await sendModLog(client, member, interaction.user, "warning removed", removed.reason, true, null, warnings.length);
      await interaction.reply({ content: `${EMOJI_SUCCESS} Warning removed.`, ephemeral: true });
      return;
    }
  } else if (interaction.type === InteractionType.ModalSubmit) {
    const [action, targetId] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) return replyError(interaction, "User not found.");
    if (!isModerator(interaction.member)) return replyError(interaction, "You are not allowed.");

    if (action === "addwarn") {
      const reason = interaction.fields.getTextInputValue("warnReason") || "No reason";
      let warnings = cleanWarnings(targetId);

      warnings.push({ moderator: interaction.user.id, reason, date: Date.now() });
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(member, "warned", null, reason, `Current warnings: ${warnings.length}`);
      await sendModLog(client, member, interaction.user, "warned", reason, true, null, warnings.length);
      await interaction.reply({ content: `${EMOJI_SUCCESS} Warning added.`, ephemeral: true });
      return;
    }
  }
}

module.exports = { showWarnings, handleWarningButtons, cleanWarnings };