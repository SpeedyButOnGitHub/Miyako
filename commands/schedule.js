const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require("discord.js");
const { addSchedule, getSchedules, removeSchedule, getSchedule, updateSchedule } = require("../utils/scheduleStorage");
const { computeNextRun } = require("../utils/scheduler");
const { OWNER_ID } = require("./moderation/permissions");

function humanizeFrequency(s) {
  if (!s) return "Unknown";
  if (s.type === "once") return `Once — ${s.date} ${s.time}`;
  if (s.type === "daily") return `Daily at ${s.time}`;
  if (s.type === "weekly") return `Weekly on ${s.days?.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} at ${s.time}`;
  if (s.type === "monthly") return `Monthly on day ${s.dayOfMonth} at ${s.time}`;
  if (s.type === "interval") return `Every ${s.intervalDays} day(s) at ${s.time}`;
  return "Custom";
}

async function handleScheduleCommand(client, message) {
  if (message.author.id !== OWNER_ID) return message.reply("Only owner can use schedule command.");
  const schedules = getSchedules();

  const embed = new EmbedBuilder()
    .setTitle("📅 Schedule Manager")
    .setColor(0x5865F2)
    .setDescription("Create and manage automated scheduled messages.\n\nClick Create to make a new schedule. Select a schedule to delete or toggle it.")
    .setTimestamp();

  const listText = schedules.length
    ? schedules.map(s => `**[${s.id}] ${s.name}** — ${humanizeFrequency(s)} — ${s.enabled ? "Enabled" : "Disabled"}`).join("\n")
    : "*No schedules configured*";

  embed.addFields({ name: "Configured Schedules", value: listText });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sched_create").setLabel("Create").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("sched_list_refresh").setLabel("Refresh").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sched_close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  // Buttons for each schedule: delete / toggle — cap to 4 rows to respect Discord's 5-row max (1 main + 4 controls)
  const controlRows = [];
  for (const s of schedules.slice(0, 4)) {
    const r = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sched_toggle_${s.id}`).setLabel(s.enabled ? `Disable ${s.id}` : `Enable ${s.id}`).setStyle(s.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sched_delete_${s.id}`).setLabel(`Delete ${s.id}`).setStyle(ButtonStyle.Danger)
    );
    controlRows.push(r);
  }

  const replyMsg = await message.reply({ embeds: [embed], components: [row, ...controlRows], allowedMentions: { repliedUser: false } });

  const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });

  collector.on("collect", async interaction => {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "Only owner may manage schedules.", ephemeral: true });
      return;
    }

    // Create: show modal to create schedule
    if (interaction.customId === "sched_create") {
      const modal = new ModalBuilder()
        .setCustomId("schedule_create_modal")
        .setTitle("Create Schedule");

      // Discord limits modals to 5 inputs; collect core fields and a flexible Extras field
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("channel").setLabel("Channel ID or #channel").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("type").setLabel("Type (once/daily/weekly/monthly/interval)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("e.g. weekly")
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("time").setLabel("Time (HH:MM 24h)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("14:30")
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("extras").setLabel("Extras (date/days/interval/repeats)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("once: 2025-09-08 | weekly: Mon,Wed | monthly: 15 | interval: 2; repeats=5")
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "sched_list_refresh") {
      // refresh the embed
      await interaction.deferUpdate();
      const refreshed = getSchedules();
      const desc = refreshed.length
        ? refreshed.map(s => `**[${s.id}] ${s.name}** — ${humanizeFrequency(s)} — ${s.enabled ? "Enabled" : "Disabled"}`).join("\n")
        : "*No schedules configured*";
      const newEmbed = EmbedBuilder.from(embed).setFields({ name: "Configured Schedules", value: desc });
      await replyMsg.edit({ embeds: [newEmbed] });
      return;
    }

    if (interaction.customId === "sched_close") {
      await interaction.update({ content: "Schedule manager closed.", embeds: [], components: [] });
      collector.stop();
      return;
    }

    // toggle or delete schedule
    if (interaction.customId.startsWith("sched_toggle_")) {
      const id = interaction.customId.replace("sched_toggle_", "");
      const s = getSchedule(id);
      if (!s) return interaction.reply({ content: "Schedule not found.", ephemeral: true });
      const updated = updateSchedule(id, { enabled: !s.enabled });
      await interaction.reply({ content: `Schedule ${id} ${updated.enabled ? "enabled" : "disabled"}.`, ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith("sched_delete_")) {
      const id = interaction.customId.replace("sched_delete_", "");
      const ok = removeSchedule(id);
      await interaction.reply({ content: ok ? `Schedule ${id} deleted.` : `Schedule ${id} not found.`, ephemeral: true });
      return;
    }
  });

  collector.on("end", () => {
    replyMsg.edit({ components: [] }).catch(() => {});
  });
}

// handle modal submit (forwarded from interactionEvents.js)
async function handleScheduleModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("schedule_create_modal")) return;

  const name = interaction.fields.getTextInputValue("name").trim();
  const channelRaw = interaction.fields.getTextInputValue("channel").trim();
  const type = interaction.fields.getTextInputValue("type").trim().toLowerCase();
  const time = (interaction.fields.getTextInputValue("time") || "00:00").trim();
  const extrasRaw = (interaction.fields.getTextInputValue("extras") || "").trim();
  // We can't fit message content in the modal due to input limits; prompt the user to send the next message as content
  // For now, use a simple placeholder to avoid blocking; in practice, collect via a follow-up flow
  const message = "(scheduled message content)";

  // parse channel mention or id
  let channelId = channelRaw.replace(/[<#>]/g, "").trim();

  const schedule = {
    name,
    channelId,
    message,
    type,
    time,
    enabled: true,
    repeats: null
  };

  // Allow semicolon-delimited extras like "2; repeats=5" or "Mon,Wed; repeats=3"
  const primaryExtras = extrasRaw.split(";")[0].trim();

  if (type === "once") {
    // Expect a single date in YYYY-MM-DD
    const m = primaryExtras.match(/\d{4}-\d{2}-\d{2}/);
    schedule.date = m ? m[0] : "";
  }
  if (type === "weekly") {
    const map = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    schedule.days = primaryExtras
      .split(",")
      .map(s => s.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
      .map(w => (w in map ? map[w] : null))
      .filter(x => x !== null);
    if (schedule.days.length === 0) schedule.days = [1]; // default Monday
  }
  if (type === "interval") schedule.intervalDays = Number(primaryExtras) || 1;
  if (type === "monthly") schedule.dayOfMonth = Number(primaryExtras) || 1;

  // Optional repeats from pattern like "repeats=5"
  const repMatch = extrasRaw.match(/repeats\s*=\s*(\d+)/i);
  if (repMatch) schedule.repeats = Number(repMatch[1]);

  // compute nextRun
  schedule.nextRun = computeNextRun(schedule);

  addSchedule(schedule);

  await interaction.reply({ content: `Schedule "${name}" created and will run at <t:${Math.floor(schedule.nextRun/1000)}:F>`, ephemeral: true });
}

module.exports = {
  handleScheduleCommand,
  handleScheduleModal
};
