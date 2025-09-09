const { getEvents, updateEvent } = require('./eventsStorage');
const { ensureAnchor } = require('../commands/schedule');
const { updateStaffMessage } = require('./staffTeam');
const ActiveMenus = require('./activeMenus');

/**
 * Perform startup health checks for dynamic, auto-edited messages (event anchors, staff team message).
 * Returns an array of status objects: { kind, id, name, ok, url, error }
 */
async function runHealthChecks(client) {
  const results = [];
  const guild = client.guilds.cache.first();
  if (!guild) return results;

  // Events (anchor messages)
  try {
    const events = getEvents();
    for (const ev of events) {
      if (!ev.enabled) continue;
      if (!ev.anchorChannelId || !ev.anchorMessageId) {
        // Attempt to (re)create anchor if the event has times/ranges
        try {
          await ensureAnchor(client, ev);
        } catch (e) {
          results.push({ kind: 'event', id: ev.id, name: ev.name, ok: false, error: 'anchor create failed: '+e.message });
          continue;
        }
      }
      if (ev.anchorChannelId && ev.anchorMessageId) {
        try {
          const channel = await client.channels.fetch(ev.anchorChannelId).catch(()=>null);
          if (!channel || !channel.messages) throw new Error('channel inaccessible');
          const msg = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
          if (!msg) throw new Error('message missing');

          // Validate notification button for Midnight Bar; if missing attempt repair
          let buttonHealthy = true;
          if (/Midnight Bar/i.test(ev.name || '')) {
            const expectedId = `event_notify_${ev.id}`;
            const hasButton = Array.isArray(msg.components) && msg.components.some(r => r.components?.some?.(c => c.customId === expectedId));
            if (!hasButton) {
              buttonHealthy = false;
              try {
                await ensureAnchor(client, ev); // will enforce button
                const repaired = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
                if (repaired) {
                  const repairedHas = Array.isArray(repaired.components) && repaired.components.some(r => r.components?.some?.(c => c.customId === expectedId));
                  buttonHealthy = repairedHas;
                }
              } catch { /* ignore repair errors */ }
            }
          }

          // Auto-fix outdated timestamps for Midnight Bar style message
          try {
            if (/Midnight Bar/i.test(ev.name || '') && ev.ranges && Array.isArray(ev.ranges) && ev.ranges.length) {
              const baseContent = ev.dynamicBaseContent || ev.messageJSON?.content || ev.message || msg.content || '';
              // Pattern '# The Midnight bar is opening:' followed by a discord relative timestamp
              const lineRegex = /(#+\s*The Midnight bar is opening:).*/i;
              // Compute next upcoming opening start epoch from today's or next valid day based on ev.days and first range start
              const range = ev.ranges[0];
              const startStr = range.start; // e.g. '6:00'
              // Parse startStr to hours:minutes
              const [shRaw, smRaw] = startStr.split(':');
              const sh = parseInt(shRaw, 10) || 0; const sm = parseInt(smRaw,10)||0;
              const now = new Date();
              const todayWd = now.getDay();
              const validDays = Array.isArray(ev.days) && ev.days.length ? ev.days : [todayWd];
              let target = null;
              for (let offset=0; offset<8; offset++) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+offset, sh, sm, 0, 0);
                const wd = d.getDay();
                if (!validDays.includes(wd)) continue;
                if (d.getTime() <= Date.now()) continue; // we want next future opening
                target = d; break;
              }
              if (!target) {
                // fallback: tomorrow at start time
                target = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, sh, sm, 0, 0);
              }
              const epoch = Math.floor(target.getTime()/1000);
              const desiredLine = `# The Midnight bar is opening: <t:${epoch}:R>`;
              if (lineRegex.test(baseContent)) {
                const newContent = baseContent.replace(lineRegex, desiredLine);
                if (newContent !== msg.content) {
                  if (ev.messageJSON) {
                    const payload = { ...ev.messageJSON, content: newContent };
                    if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
                    await msg.edit(payload).catch(()=>{});
                  } else {
                    await msg.edit({ content: newContent }).catch(()=>{});
                  }
                  if (newContent !== ev.dynamicBaseContent) updateEvent(ev.id, { dynamicBaseContent: newContent });
                }
              }
            }
          } catch (tsErr) { /* ignore timestamp fix errors */ }
          results.push({ kind: 'event', id: ev.id, name: ev.name, ok: buttonHealthy, url: buttonHealthy ? `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}` : null, error: buttonHealthy ? undefined : 'notification button missing' });
        } catch (e) {
          results.push({ kind: 'event', id: ev.id, name: ev.name, ok: false, error: e.message });
        }
      }
    }
  } catch (e) {
    results.push({ kind: 'event', id: 'all', name: 'Events', ok: false, error: e.message });
  }

  // Staff Team message
  try {
    const staffMsg = await updateStaffMessage(guild);
    if (staffMsg) {
      results.push({ kind: 'staffTeam', id: staffMsg.id, name: 'Staff Team', ok: true, url: `https://discord.com/channels/${staffMsg.guildId}/${staffMsg.channelId}/${staffMsg.id}` });
    } else {
      results.push({ kind: 'staffTeam', id: 'staff', name: 'Staff Team', ok: false, error: 'update failed' });
    }
  } catch (e) {
    results.push({ kind: 'staffTeam', id: 'staff', name: 'Staff Team', ok: false, error: e.message });
  }

  // ActiveMenus sanity: ensure no session with empty component rows
  try {
    const snapshot = ActiveMenus.snapshotSessions ? ActiveMenus.snapshotSessions() : [];
    let stale = 0; let emptyRows = 0;
    const now = Date.now();
    for (const s of snapshot) {
      if (s.expiresAt && s.expiresAt < now) stale++;
      if (Array.isArray(s.components)) {
        for (const row of s.components) {
          if (row && Array.isArray(row.components) && row.components.length === 0) emptyRows++;
        }
      }
    }
    results.push({ kind: 'activeMenus', id: 'activeMenus', name: 'Active Menus', ok: stale === 0 && emptyRows === 0, error: (stale||emptyRows)?`stale:${stale} emptyRows:${emptyRows}`:undefined });
  } catch (e) {
    results.push({ kind: 'activeMenus', id: 'activeMenus', name: 'Active Menus', ok: false, error: e.message });
  }

  return results;
}

function formatHealthLines(results) {
  return results.map(r => {
    const symbol = r.ok ? '✔️' : '✖️';
    const name = r.name || r.kind;
    const link = r.url ? `[${name}](${r.url})` : name;
    return `${symbol} ${link} ${r.ok ? 'is up and running!' : 'is currently down' + (r.error?` (${r.error})`:'!')}`;
  }).join('\n');
}

module.exports = { runHealthChecks, formatHealthLines };
