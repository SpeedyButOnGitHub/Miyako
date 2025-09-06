const { sendModLog } = require("../utils/modLogs");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  Message,
  Interaction
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const ms = require("ms");

const EMOJI_SUCCESS = "<a:kyoukoThumbsUp:1413767126547828757>";
const EMOJI_ERROR = "<:VRLSad:1413770577080094802>";

const CONFIG_FILE = path.join(__dirname, "../botConfig.json");
let config = { moderatorRoles: [], warnings: {}, escalation: { mute: 2, kick: 3 }, muteDuration: 2 * 60 * 60 * 1000 };
if (fs.existsSync(CONFIG_FILE)) {
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE)); }
  catch { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
}
if (!config.moderatorRoles) config.moderatorRoles = [];
if (!config.warnings) config.warnings = {};

const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

const OWNER_ID = process.env.OWNER_ID || "349282473085239298";
const MUTE_ROLE_ID = "1391535514901020744";
const DEFAULT_MUTE = 60 * 60 * 1000;
const lastLogMessages = {};
const WARNING_EXPIRY = 1000 * 60 * 60 * 24 * 60;

const isModerator = member =>
  config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)) || member.id === OWNER_ID;

function formatDuration(duration) {
  return ms(duration, { long: true });
}

async function replySuccess(context, content) {
  if (context instanceof Message) {
    return context.reply(`${EMOJI_SUCCESS} ${content}`);
  } else if (context instanceof Interaction && context.isRepliable()) {
    return context.reply({ content: `${EMOJI_SUCCESS} ${content}`, ephemeral: true });
  }
}

async function replyError(context, content) {
  if (context instanceof Message) {
    const msg = await context.reply(`${EMOJI_ERROR} ${content}`);
    setTimeout(() => {
      context.delete().catch(() => {});
      msg.delete().catch(() => {});
    }, 5000);
  } else if (context instanceof Interaction && context.isRepliable()) {
    await context.reply({ content: `${EMOJI_ERROR} ${content}`, ephemeral: true });
  }
}

async function sendUserDM(target, action, duration = null, reason = null, extra = null) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
    .setColor(action === "warned" ? 0xffff00 : ["warning removed"].includes(action) ? 0x00ff00 : 0xff0000)
    .setDescription(
      action === "warned" ? `You have been warned in Late Night Hours.` :
      action === "warning removed" ? `A warning has been removed from your account.` :
      `You have been ${action} in Late Night Hours.`
    );

  if (duration) embed.addFields({ name: "Duration", value: duration, inline: true });
  if (reason) embed.addFields({ name: "Reason", value: reason, inline: true });
  if (extra) embed.addFields({ name: "Info", value: extra, inline: false });
  embed.setTimestamp();

  try {
    await target.send({ embeds: [embed] });
  } catch (err) {
    console.log(`Could not DM ${target.user.tag}: ${err.message}`);
  }
}

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
    .setDescription(warnings.length > 0
      ? warnings.map((w, i) => `**${i + 1}.** ${w.reason || "No reason"} (by <@${w.moderator}>)`).join("\n")
      : "No warnings")
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
        .setLabel("Remove Latest Warning")
        .setStyle(ButtonStyle.Danger)
    );

  if (context instanceof Message) {
    await context.reply({ embeds: [embed], components: [row] });
  } else if (context.isRepliable() && !context.replied && !context.deferred) {
    await context.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else if (typeof context.editReply === "function") {
    await context.editReply({ embeds: [embed], components: [row] });
  } else if (typeof context.update === "function") {
    await context.update({ embeds: [embed], components: [row] });
  }
}

async function handleWarningButtons(client, interaction) {
  if (!interaction.isButton() && interaction.type !== InteractionType.ModalSubmit) return;

  const [action, targetId] = interaction.customId.split("_");
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return replyError(interaction, "User not found.");
  if (!isModerator(interaction.member)) return replyError(interaction, "You are not allowed.");

  if (interaction.type === InteractionType.ModalSubmit) {
    const reason = interaction.fields.getTextInputValue("warnReason") || "No reason";
    let warnings = cleanWarnings(targetId);

    if (action === "addwarn") {
      warnings.push({ moderator: interaction.user.id, reason, date: Date.now() });
      config.warnings[targetId] = warnings;
      saveConfig();

      await sendUserDM(member, "warned", null, reason, `Current warnings: ${warnings.length}`);
      await sendModLog(client, member, interaction.user, "warned", reason, true, null, warnings.length);
    }

    await showWarnings(interaction, member);
    return;
  }

  await interaction.deferUpdate();

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
    await showWarnings(interaction, member);
    return;
  }
}

async function handleModerationCommands(client, message, command, args) {
  if (!isModerator(message.member)) return replyError(message, "You are not allowed to use this command.");
  const target = message.mentions.members.first() || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
  if (!target) return replyError(message, "You must mention a user or provide a valid user ID.");

  if (target.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
  if (target.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
  if (target.roles.highest.comparePositionTo(message.member.roles.highest) >= 0 && message.author.id !== OWNER_ID)
    return replyError(message, "You cannot moderate this user due to role hierarchy.");
  if (config.moderatorRoles.some(roleId => target.roles.cache.has(roleId)))
    return replyError(message, "Cannot moderate this user (they are a configured moderator).");

  let reason = args.slice(1).join(" ") || null;
  let duration = ["mute","timeout"].includes(command) ? ms(args[1]) || DEFAULT_MUTE : null;
  let durationDisplay = duration ? formatDuration(duration) : null;

  try {
    switch(command) {
      case "mute":
        if (!target.moderatable) throw new Error("Cannot mute this person.");
        await target.timeout(duration, reason || `Muted by ${message.author.tag}`);
        if (!target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.add(MUTE_ROLE_ID).catch(() => {});
        lastLogMessages[target.id] = { ...(lastLogMessages[target.id] || {}), muted: await sendModLog(client, target, message.author, "muted", reason, true, durationDisplay) };
        await sendUserDM(target, "muted", durationDisplay, reason);
        await replySuccess(message, `Muted ${target} for ${durationDisplay}`);
        break;

      case "unmute":
        await target.timeout(null, `Unmuted by ${message.author.tag}`);
        if (target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.remove(MUTE_ROLE_ID).catch(() => {});
        lastLogMessages[target.id] = { ...(lastLogMessages[target.id] || {}), unmuted: await sendModLog(client, target, message.author, "unmuted", null, false) };
        await sendUserDM(target, "unmuted");
        await replySuccess(message, `Unmuted ${target}`);
        break;

      case "warn":
        let warnings = cleanWarnings(target.id);
        warnings.push({ moderator: message.author.id, reason, date: Date.now() });
        config.warnings[target.id] = warnings;
        saveConfig();

        let escalationMessage = null;
        if (warnings.length >= (config.escalation?.kick || 3)) {
          await target.kick("Auto-kicked for reaching warning threshold");
          escalationMessage = `You have been kicked for reaching ${config.escalation.kick || 3} warnings.`;
          await sendModLog(client, target, message.author, "kicked", "Reached warning threshold", true, null, warnings.length);
        } else if (warnings.length >= (config.escalation?.mute || 2)) {
          const muteDur = config.muteDuration || 2 * 60 * 60 * 1000;
          await target.timeout(muteDur, "Auto-muted for reaching warning threshold");
          if (!target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.add(MUTE_ROLE_ID).catch(() => {});
          escalationMessage = `You have been muted for ${formatDuration(muteDur)} for reaching ${config.escalation.mute || 2} warnings.`;
          await sendModLog(client, target, message.author, "muted", "Reached warning threshold", true, formatDuration(muteDur), warnings.length);
        }

        await sendUserDM(target, "warned", null, reason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        await sendModLog(client, target, message.author, "warned", reason, true, null, warnings.length);
        await replySuccess(message, `Warned ${target}${reason ? ` for: ${reason}` : ""}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        break;
    }
  } catch (err) {
    console.error("Error in moderation command:", err);
    await replyError(message, "An error occurred while executing this command.");
  }
}

module.exports = {
  handleModerationCommands,
  isModerator,
  showWarnings,
  handleWarningButtons
};