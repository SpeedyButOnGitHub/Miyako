const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { addSchedule, getSchedules, removeSchedule, getSchedule, updateSchedule } = require("../utils/scheduleStorage"); // kept for compatibility (not UI-exposed now)
const { getEvents, getEvent, addEvent, updateEvent, removeEvent } = require("../utils/eventsStorage");
const { computeNextRun } = require("../utils/scheduler");
const { OWNER_ID } = require("./moderation/permissions");
const theme = require("../utils/theme");
const ActiveMenus = require("../utils/activeMenus");
const { applyFooterWithPagination } = require("../utils/ui");

// --- Event Manager (ActiveMenus) ---

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function summarizeEvent(ev) {
  const times = (ev.times || []).join(", ") || "–";
  const days = (ev.days || []).map(d => DAY_NAMES[d] || d).join(" ") || "All";
  return `${ev.enabled ? theme.emojis.enable : theme.emojis.disable} **${ev.name}** • Times: \`${times}\` • Days: \`${days}\` • ID: \`${ev.id}\``;
}

function buildMainEmbed(guild) {
  const evs = getEvents();
  const embed = new EmbedBuilder()
    .setTitle(`${theme.emojis.toggle} Events Manager`)
    .setColor(theme.colors.primary)
    .setDescription(evs.length ? evs.map(summarizeEvent).join("\n") : "*No events defined yet.*");
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: `${evs.length} event${evs.length === 1 ? '' : 's'}` });
  return embed;
}

function buildDetailEmbed(guild, ev) {
  const times = (ev.times || []).length ? ev.times.join(", ") : "(none)";
  const days = (ev.days || []).length ? ev.days.map(d => DAY_NAMES[d] || d).join(", ") : "(none)";
  const embed = new EmbedBuilder()
    .setTitle(`${ev.enabled ? theme.emojis.enable : theme.emojis.disable} ${ev.name}`)
    .setColor(ev.enabled ? theme.colors.success : theme.colors.danger)
    .setDescription(ev.description || "No description provided.")
    .addFields(
      { name: "Status", value: ev.enabled ? "Enabled" : "Disabled", inline: true },
      { name: "Type", value: ev.type || "multi-daily", inline: true },
      { name: "Channel", value: ev.channelId ? `<#${ev.channelId}>` : "(none)", inline: true },
      { name: "Times", value: times, inline: false },
      { name: "Days", value: days, inline: false },
      { name: "Message", value: ev.message ? (ev.message.length > 300 ? ev.message.slice(0,297)+"..." : ev.message) : "(none)" }
    );
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: `Event ID ${ev.id}` });
  return embed;
}

function mainRows() {
  const evs = getEvents();
  return [ new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("events_create").setLabel("Create").setEmoji(theme.emojis.create).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("events_select_mode").setLabel("Select").setEmoji(theme.emojis.events).setStyle(ButtonStyle.Primary).setDisabled(!evs.length),
    new ButtonBuilder().setCustomId("events_delete_mode").setLabel("Delete").setEmoji(theme.emojis.delete).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("events_close").setLabel("Close").setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
  )];
}

function buildSelectRows(kind) {
  const evs = getEvents();
  const options = evs.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(' ').slice(0,100), emoji: kind === 'delete' ? theme.emojis.delete : (e.enabled?theme.emojis.enable:theme.emojis.disable) }));
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`events_${kind === 'delete' ? 'delete' : 'select'}`).setPlaceholder(kind==='delete'? 'Select event to delete' : 'Select event...').addOptions(options)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('events_back').setLabel('Back').setEmoji(theme.emojis.back).setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('events_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖'))
  ];
}

function detailRows(ev) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`events_toggle_${ev.id}`).setLabel(ev.enabled? 'Disable':'Enable').setStyle(ev.enabled?ButtonStyle.Danger:ButtonStyle.Success).setEmoji(ev.enabled?theme.emojis.disable:theme.emojis.enable),
      new ButtonBuilder().setCustomId(`events_edit_times_${ev.id}`).setLabel('Times').setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.times),
      new ButtonBuilder().setCustomId(`events_edit_days_${ev.id}`).setLabel('Days').setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.days)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`events_edit_msg_${ev.id}`).setLabel('Message').setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.message),
      new ButtonBuilder().setCustomId(`events_delete_${ev.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.delete),
      new ButtonBuilder().setCustomId('events_back').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.back),
      new ButtonBuilder().setCustomId('events_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
    )
  ];
}

async function handleScheduleCommand(client, message) {
  if (message.author.id !== OWNER_ID) return;
  const embed = buildMainEmbed(message.guild);
  const sent = await message.reply({ embeds: [embed], components: mainRows(), allowedMentions: { repliedUser: false } });
  ActiveMenus.registerMessage(sent, { type: 'events', userId: message.author.id, data: { mode: 'main' } });
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
  // Basic validation
  if (!/^\d{1,32}$/.test(channelId)) { await interaction.reply({ content: '❌ Invalid channel ID.', ephemeral: true }); return; }
  if (!name) { await interaction.reply({ content: '❌ Name required.', ephemeral: true }); return; }
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
            new ButtonBuilder().setCustomId("ev_select_mode").setLabel("Select").setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.events).setDisabled(!evs.length)
          )
        ] });
      }
    } catch {}
  }
}

// ActiveMenus handler
ActiveMenus.registerHandler('events', async (interaction, session) => {
  if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Not for you.', ephemeral: true });
  const data = session.data || {}; // { mode, currentId }
  const customId = interaction.customId;

  // Close
  if (customId === 'events_close') {
    try { await interaction.message.edit({ components: [] }); } catch {}
    if (interaction.isRepliable()) {
      if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: 'Closed.', ephemeral: true });
    }
    return;
  }

  // Main actions
  if (customId === 'events_create') {
    const modal = new ModalBuilder().setCustomId(`event_create_modal_${interaction.message.id}`).setTitle('Create Event')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID or #channel').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM,comma)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
    await interaction.showModal(modal); return;
  }
  if (customId === 'events_select_mode') {
    data.mode = 'select';
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('select') });
    session.data = data; return;
  }
  if (customId === 'events_delete_mode') {
    data.mode = 'delete';
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('delete') });
    session.data = data; return;
  }
  if (customId === 'events_back') {
    data.mode = 'main'; data.currentId = null;
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
    session.data = data; return;
  }

  // Detail actions
  if (customId.startsWith('events_toggle_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const updated = updateEvent(id, { enabled: !ev.enabled });
    await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, updated)], components: detailRows(updated) });
    return;
  }
  if (customId.startsWith('events_edit_times_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_times_modal_${id}_${interaction.message.id}`).setTitle('Edit Times')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM,comma)').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((ev.times||[]).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_days_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_days_modal_${id}_${interaction.message.id}`).setTitle('Edit Days')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true).setValue((ev.days||[]).map(d=>DAY_NAMES[d]||d).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_msg_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_msg_modal_${id}_${interaction.message.id}`).setTitle('Edit Message')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message Content').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(ev.message || '')));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_delete_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    removeEvent(id);
    data.mode = 'main'; data.currentId = null;
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
    return;
  }

  // Select menus
  if (interaction.isStringSelectMenu()) {
    if (customId === 'events_select') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', ephemeral: true });
      data.mode = 'detail'; data.currentId = id;
      await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, ev)], components: detailRows(ev) });
      return;
    }
    if (customId === 'events_delete') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', ephemeral: true });
      removeEvent(id);
      // Stay in delete mode or back to main if empty
      const evs = getEvents();
      if (!evs.length) {
        data.mode = 'main';
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
      } else {
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('delete') });
      }
      return;
    }
  }
});

async function handleEventEditModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^event_(times|days|msg)_modal_/.test(interaction.customId)) return;
  // pattern: event_<kind>_modal_<eventId>[_<managerMessageId>]
  const parts = interaction.customId.split("_");
  const eventId = parts[3];
  const managerMessageId = parts[4] || null;
  if (!/^\d+$/.test(eventId)) { await interaction.reply({ content: '❌ Bad event id.', ephemeral: true }).catch(()=>{}); return; }
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

module.exports = { handleScheduleCommand, handleScheduleModal, handleEventCreateModal, handleEventEditModal };
