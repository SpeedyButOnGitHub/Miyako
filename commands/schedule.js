const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, StringSelectMenuBuilder } = require("discord.js");
const { addSchedule, getSchedules, removeSchedule, getSchedule, updateSchedule } = require("../utils/scheduleStorage"); // legacy (kept for compatibility)
const { getEvents, getEvent, addEvent, updateEvent, removeEvent } = require("../utils/eventsStorage");
const { computeNextRun } = require("../utils/scheduler");
const { OWNER_ID } = require("./moderation/permissions");
const theme = require("../utils/theme");

// --- Event Manager Implementation ---

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function buildEventsMainEmbed() {
  const evs = getEvents();
  const lines = evs.map(e => {
    const times = (e.times || []).join(", ") || "–";
    const days = (e.days || []).map(d => DAY_NAMES[d] || d).join(" ") || "All";
  return `${e.enabled ? theme.emojis.enable : theme.emojis.disable} **${e.name}** • Times: \`${times}\` • Days: \`${days}\` • ID: \`${e.id}\``;
  });
  return new EmbedBuilder()
  .setTitle(`${theme.emojis.toggle} Events Manager`)
    .setColor(theme.colors?.primary || 0x5865F2)
    .setDescription(lines.length ? lines.join("\n") : "*No events defined yet.*")
    .setFooter({ text: `${evs.length} event${evs.length === 1 ? '' : 's'} total • Use buttons below` });
}

function buildEventDetailEmbed(ev) {
  const times = (ev.times || []).length ? ev.times.join(", ") : "(none)";
  const days = (ev.days || []).length ? ev.days.map(d => DAY_NAMES[d] || d).join(", ") : "(none)";
  return new EmbedBuilder()
  .setTitle(`${ev.enabled ? theme.emojis.enable : theme.emojis.disable} ${ev.name}`)
    .setColor(ev.enabled ? (theme.colors?.success || 0x2ecc71) : (theme.colors?.danger || 0xe74c3c))
    .setDescription(ev.description || "No description provided.")
    .addFields(
      { name: "Status", value: ev.enabled ? "Enabled" : "Disabled", inline: true },
      { name: "Type", value: ev.type || "multi-daily", inline: true },
      { name: "Channel", value: ev.channelId ? `<#${ev.channelId}>` : "(none)", inline: true },
      { name: "Times", value: times, inline: false },
      { name: "Days", value: days, inline: false },
      { name: "Message", value: ev.message ? (ev.message.length > 300 ? ev.message.slice(0, 297) + "..." : ev.message) : "(none)" }
    )
    .setFooter({ text: `Event ID ${ev.id}` });
}

async function handleScheduleCommand(client, message) {
  if (message.author.id !== OWNER_ID) return message.reply("Only owner can use schedule command.");

  let mode = "main"; // main | select | delete | detail
  let currentEventId = null;

  const buildMainComponents = () => {
    const evs = getEvents();
    return [
      new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("ev_create").setLabel("Create").setStyle(ButtonStyle.Success).setEmoji(theme.emojis.create),
  new ButtonBuilder().setCustomId("ev_delete_mode").setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.delete),
  new ButtonBuilder().setCustomId("ev_select_mode").setLabel("Select").setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.select).setDisabled(!evs.length)
      )
    ];
  };

  const replyMsg = await message.reply({ embeds: [buildEventsMainEmbed()], components: buildMainComponents(), allowedMentions: { repliedUser: false } });

  const collector = replyMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

  collector.on("collect", async interaction => {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "Only owner may manage schedules.", ephemeral: true });
      return;
    }
    // --- Main mode buttons ---
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === "ev_create") {
        const modal = new ModalBuilder()
          .setCustomId(`event_create_modal_${replyMsg.id}`)
          .setTitle("Create Event")
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("channel").setLabel("Channel ID or #channel").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("times").setLabel("Times (HH:MM,comma)").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("days").setLabel("Days (Sun,Mon,...)").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("message").setLabel("Message").setStyle(TextInputStyle.Paragraph).setRequired(true))
          );
        await interaction.showModal(modal);
        return;
      }
      if (id === "ev_select_mode") {
        mode = "select";
        await interaction.deferUpdate();
        const evs = getEvents();
  const options = evs.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(" ").slice(0,100), emoji: e.enabled?theme.emojis.enable:theme.emojis.disable }));
        const rowSel = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("ev_select").setPlaceholder("Select an event...").addOptions(options)
        );
        const rowBack = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ev_back_main").setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.back)
        );
        await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: [rowSel, rowBack] });
        return;
      }
      if (id === "ev_delete_mode") {
        mode = "delete";
        await interaction.deferUpdate();
        const evs = getEvents();
        if (!evs.length) {
          await interaction.followUp({ content: "No events to delete.", ephemeral: true });
          mode = "main";
          return;
        }
        const rowSel = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("ev_delete_select").setPlaceholder("Select event to delete").addOptions(
            evs.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(" ").slice(0,100), emoji: theme.emojis.delete }))
          )
        );
        const rowBack = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ev_back_main").setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.back)
        );
        await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: [rowSel, rowBack] });
        return;
      }
      if (id === "ev_back_main") {
        mode = "main"; currentEventId = null;
        await interaction.deferUpdate();
        await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: buildMainComponents() });
        return;
      }
      // Detail mode buttons
      if (id.startsWith("ev_toggle_")) {
        const eid = id.split("_").pop();
        const ev = getEvent(eid);
        if (!ev) { await interaction.reply({ content: "Event missing.", ephemeral: true }); return; }
        const updated = updateEvent(eid, { enabled: !ev.enabled });
        await interaction.deferUpdate();
        const detailRows = buildDetailRows(updated);
        await replyMsg.edit({ embeds: [buildEventDetailEmbed(updated)], components: detailRows });
        return;
      }
      if (id.startsWith("ev_edit_times_")) {
        const eid = id.split("_").pop();
        const ev = getEvent(eid); if (!ev) { await interaction.reply({ content: "Event missing.", ephemeral:true }); return; }
        const modal = new ModalBuilder().setCustomId(`event_times_modal_${eid}_${replyMsg.id}`).setTitle("Edit Times").addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("times").setLabel("Times (HH:MM,comma)").setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((ev.times||[]).join(",")))
        );
        await interaction.showModal(modal); return;
      }
      if (id.startsWith("ev_edit_days_")) {
        const eid = id.split("_").pop();
        const ev = getEvent(eid); if (!ev) { await interaction.reply({ content: "Event missing.", ephemeral:true }); return; }
        const modal = new ModalBuilder().setCustomId(`event_days_modal_${eid}_${replyMsg.id}`).setTitle("Edit Days").addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("days").setLabel("Days (Sun,Mon,...)").setStyle(TextInputStyle.Short).setRequired(true).setValue((ev.days||[]).map(d=>DAY_NAMES[d]||d).join(",")))
        );
        await interaction.showModal(modal); return;
      }
      if (id.startsWith("ev_edit_msg_")) {
        const eid = id.split("_").pop();
        const ev = getEvent(eid); if (!ev) { await interaction.reply({ content: "Event missing.", ephemeral:true }); return; }
        const modal = new ModalBuilder().setCustomId(`event_msg_modal_${eid}_${replyMsg.id}`).setTitle("Edit Message").addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("message").setLabel("Message Content").setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(ev.message || ""))
        );
        await interaction.showModal(modal); return;
      }
      if (id.startsWith("ev_delete_")) {
        const eid = id.split("_").pop();
        const ev = getEvent(eid); if (!ev) { await interaction.reply({ content: "Event missing.", ephemeral:true }); return; }
        removeEvent(eid);
        mode = "main"; currentEventId = null;
        await interaction.reply({ content: `Deleted event ${ev.name}.`, ephemeral:true });
        await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: buildMainComponents() });
        return;
      }
    }

    // Select menu interactions
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === "ev_select") {
        const eid = interaction.values[0];
        const ev = getEvent(eid);
        if (!ev) { await interaction.reply({ content: "Event not found.", ephemeral: true }); return; }
        currentEventId = eid; mode = "detail";
        await interaction.deferUpdate();
  const detailRows = buildDetailRows(ev);
  await replyMsg.edit({ embeds: [buildEventDetailEmbed(ev)], components: detailRows });
        return;
      }
      if (id === "ev_delete_select") {
        const eid = interaction.values[0];
        const ev = getEvent(eid);
        if (!ev) { await interaction.reply({ content: "Event not found.", ephemeral: true }); return; }
        removeEvent(eid);
        await interaction.deferUpdate();
        // Return to delete selection (update list) or main if none left
        const remaining = getEvents();
        if (!remaining.length) {
          mode = "main";
          await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: buildMainComponents() });
        } else {
          const rowSel = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId("ev_delete_select").setPlaceholder("Select event to delete").addOptions(
              remaining.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(" ").slice(0,100), emoji: "🗑️" }))
            )
          );
            const rowBack = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("ev_back_main").setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
            );
          await replyMsg.edit({ embeds: [buildEventsMainEmbed()], components: [rowSel, rowBack] });
        }
        return;
      }
    }

  // Legacy schedule management removed from UI (still accessible via code if needed)
  });

  collector.on("end", async () => {
    try { await replyMsg.edit({ components: [] }); } catch {}
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

// Handle Event creation modal (called from interactionEvents if imported, or extend export usage)
async function handleEventCreateModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("event_create_modal")) return;
  const mm = interaction.customId.match(/^event_create_modal_(\d+)/);
  const managerMessageId = mm ? mm[1] : null;
  const name = interaction.fields.getTextInputValue("name").trim();
  let channelId = interaction.fields.getTextInputValue("channel").trim().replace(/[<#>]/g, "");
  const timesRaw = interaction.fields.getTextInputValue("times").trim();
  const daysRaw = interaction.fields.getTextInputValue("days").trim();
  const message = interaction.fields.getTextInputValue("message").trim();
  const times = timesRaw.split(/[\,\s]+/).map(t => t.trim()).filter(Boolean);
  const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const days = daysRaw.split(/[\,\s]+/).map(d => d.trim().toLowerCase()).filter(Boolean).map(d => dayMap[d]).filter(d => d !== undefined);
  if (!days.length) { await interaction.reply({ content: "❌ Invalid days.", ephemeral: true }); return; }
  if (!times.length) { await interaction.reply({ content: "❌ Provide at least one time.", ephemeral: true }); return; }
  const ev = addEvent({
    name,
    description: name,
    channelId,
    message,
    enabled: true,
    times,
    days,
    type: "multi-daily",
    color: 0x00aa00
  });
  await interaction.reply({ content: `✅ Event ${ev.name} created with ${ev.times.length} time(s).`, ephemeral: true });
  if (managerMessageId) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId);
      if (mgrMsg) {
        const evs = getEvents();
        await mgrMsg.edit({ embeds: [buildEventsMainEmbed()], components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ev_create").setLabel("Create").setStyle(ButtonStyle.Success).setEmoji(theme.emojis.create),
            new ButtonBuilder().setCustomId("ev_delete_mode").setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.delete),
            new ButtonBuilder().setCustomId("ev_select_mode").setLabel("Select").setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.select).setDisabled(!evs.length)
          )
        ] });
      }
    } catch {}
  }
}

function buildDetailRows(ev) {
  const toggleLabel = ev.enabled ? "Disable" : "Enable";
  const toggleStyle = ev.enabled ? ButtonStyle.Danger : ButtonStyle.Success;
  const toggleEmoji = ev.enabled ? theme.emojis.disable : theme.emojis.enable;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ev_toggle_${ev.id}`).setLabel(toggleLabel).setStyle(toggleStyle).setEmoji(toggleEmoji),
  new ButtonBuilder().setCustomId(`ev_edit_times_${ev.id}`).setLabel("Times").setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.times),
  new ButtonBuilder().setCustomId(`ev_edit_days_${ev.id}`).setLabel("Days").setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.days)
    ),
    new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`ev_edit_msg_${ev.id}`).setLabel("Message").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.message),
  new ButtonBuilder().setCustomId(`ev_delete_${ev.id}`).setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.delete),
  new ButtonBuilder().setCustomId("ev_back_main").setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.back)
    )
  ];
}

async function handleEventEditModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^event_(times|days|msg)_modal_/.test(interaction.customId)) return;
  // pattern: event_<kind>_modal_<eventId>[_<managerMessageId>]
  const parts = interaction.customId.split("_");
  const eventId = parts[3];
  const managerMessageId = parts[4] || null;
  const ev = getEvent(eventId);
  if (!ev) { await interaction.reply({ content: "Event not found.", ephemeral:true }); return; }
  let updatedEv = null;
  if (interaction.customId.startsWith("event_times_modal_")) {
    const raw = interaction.fields.getTextInputValue("times");
    const times = raw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
    if (!times.length) { await interaction.reply({ content: "❌ Provide times.", ephemeral:true }); return; }
    updatedEv = updateEvent(ev.id, { times });
    await interaction.reply({ content: "✅ Times updated.", ephemeral:true });
  } else if (interaction.customId.startsWith("event_days_modal_")) {
    const raw = interaction.fields.getTextInputValue("days");
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    const days = raw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
    if (!days.length) { await interaction.reply({ content: "❌ Invalid days.", ephemeral:true }); return; }
    updatedEv = updateEvent(ev.id, { days });
    await interaction.reply({ content: "✅ Days updated.", ephemeral:true });
  } else if (interaction.customId.startsWith("event_msg_modal_")) {
    const messageContent = interaction.fields.getTextInputValue("message");
    updatedEv = updateEvent(ev.id, { message: messageContent });
    await interaction.reply({ content: "✅ Message updated.", ephemeral:true });
  }
  if (managerMessageId && updatedEv) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId);
      if (mgrMsg) {
        const hasDetail = mgrMsg.components.some(r => r.components.some(c => c.customId === `ev_toggle_${updatedEv.id}`));
        if (hasDetail) {
          await mgrMsg.edit({ embeds: [buildEventDetailEmbed(updatedEv)], components: buildDetailRows(updatedEv) });
        } else if (mgrMsg.components.some(r => r.components.some(c => c.customId === 'ev_create'))) {
          const evs = getEvents();
            await mgrMsg.edit({ embeds: [buildEventsMainEmbed()], components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("ev_create").setLabel("Create").setStyle(ButtonStyle.Success).setEmoji("➕"),
                new ButtonBuilder().setCustomId("ev_delete_mode").setLabel("Delete").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
                new ButtonBuilder().setCustomId("ev_select_mode").setLabel("Select").setStyle(ButtonStyle.Primary).setEmoji("🎯").setDisabled(!evs.length)
              )
            ] });
        }
      }
    } catch {}
  }
}

module.exports = {
  handleScheduleCommand,
  handleScheduleModal,
  handleEventCreateModal,
  handleEventEditModal
};
