const { addSchedule, getSchedules, removeSchedule } = require("../utils/scheduleStorage");

async function handleScheduleCommand(client, message) {
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "list") {
    const all = getSchedules();
    if (all.length === 0) return message.reply("No schedules yet.");
    const lines = all.map(s => `• ${s.id} — <#${s.channelId}> — ${s.cron || s.when || "manual"} — ${s.content?.slice(0,60) || "(no content)"}`);
    return message.reply(lines.join("\n"));
  }

  if (sub === "add") {
    const content = args.slice(1).join(" ");
    if (!content) return message.reply("Usage: .schedule add <message to send>");
    const sched = addSchedule({ channelId: message.channel.id, content, createdBy: message.author.id, createdAt: Date.now() });
    return message.reply(`Added schedule ${sched.id}.`);
  }

  if (sub === "remove" && args[1]) {
    const ok = removeSchedule(args[1]);
    return message.reply(ok ? `Removed ${args[1]}.` : `No schedule with id ${args[1]}.`);
  }

  return message.reply("Usage: .schedule [list|add <content>|remove <id>]");
}

module.exports = { handleScheduleCommand };
