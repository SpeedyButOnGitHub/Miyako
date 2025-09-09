const { handleHelpCommand } = require("../commands/help");
const path = require('path'); // needed for restart spawn entry resolution
const { handleModerationCommands } = require("../commands/moderation/moderationCommands");
const { handlePurgeCommand } = require("../commands/moderation/purge");
const { handleWarningsCommand } = require("../commands/moderation/warnings");
const { handleSnipeCommands } = require("../commands/snipes");
const { handleMessageCreate } = require("../commands/configMenu");
// Rank/profile consolidated in profile command
const { handleRankCommand } = require("../commands/profile");
const { handleTestCommand } = require("../commands/test");
const { handleLeaderboardCommand } = require("../commands/leaderboard");
const { handleProfileCommand } = require("../commands/profile");
const { handleDiagnosticsCommand } = require("../commands/diagnostics");
const { handleLeveling } = require("../utils/leveling");
const { handleScheduleCommand } = require("../commands/schedule");
const { handleScriptsCommand } = require("../commands/scripts");
const { maybeSpawnDrop, tryClaimDrop } = require("../utils/cashDrops");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { semanticButton, buildNavRow } = require('../utils/ui');
const { config } = require("../utils/storage");
const { handleCashCommand } = require("../commands/cash");
const { handleBalanceCommand } = require("../commands/balance");
const theme = require("../utils/theme");
const { TEST_LOG_CHANNEL } = require("../utils/logChannels");
const { snapshotSessions } = require("../utils/activeMenus");
const { levels } = require("../utils/levels");
const { vcLevels } = require("../utils/vcLevels");
const { getTopCash } = require("../utils/cash");
const { getRecentErrors, clearErrorLog } = require('../utils/errorUtil');
// Simple in-memory command cooldowns
const _cooldowns = new Map(); // key cmd:user -> lastTs
function cdOk(userId, cmd, ms=2000) {
  const k = cmd+':'+userId; const now = Date.now(); const prev = _cooldowns.get(k)||0; if (now - prev < ms) return false; _cooldowns.set(k, now); return true;
}
const ActiveMenus = require('../utils/activeMenus');

const LEVEL_ROLES = {
  5: "1232701768362754147",
  10: "1232701768362754148",
  16: "1232701768375210145",
  20: "1232701768375210146",
  25: "1232701768375210147",
  40: "1232701768375210149",
  75: "1382911184058978454",
  100: "1232701768375210148"
};

function attachMessageEvents(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    // Award leveling XP for all non-bot messages (gated in handleLeveling by channel rules)
    await handleLeveling(message, LEVEL_ROLES);
    // Cash drops: first check if a drop can be claimed by this message
    const claimed = tryClaimDrop(message);
    if (claimed) {
      const testTag = claimed.testing ? " [TEST]" : "";
      const claimEmbed = new EmbedBuilder()
        .setTitle(`🎉 Cash Claimed${testTag}`)
        .setColor(theme.colors.success)
        .setDescription(`Looks like someone snagged the bag! You received **$${claimed.amount.toLocaleString()}**.`)
        .addFields({ name: "New Balance", value: `${claimed.testing ? "(test) " : ""}$${Number(claimed.newBalance || 0).toLocaleString()}` , inline: true })
        .setFooter({ text: "Keep chatting for more surprise drops!" });
      const row = buildNavRow([
        semanticButton('primary', { id: claimed.testing ? 'cash:check:test' : 'cash:check', label: 'Balance', emoji: '💳' })
      ]);
      try { await message.reply({ embeds: [claimEmbed], components: [row], allowedMentions: { repliedUser: false } }); } catch {}
    } else {
      const drop = maybeSpawnDrop(message, config);
      if (drop) {
        const isTest = !!drop.testing;
    const spawnEmbed = new EmbedBuilder()
          .setTitle(`${isTest ? "🧪 " : ""}💸 A Wild Cash Drop Appeared!`)
          .setColor(theme.colors.warning)
          .setDescription(
            `It looks like someone dropped some cash!\n` +
            `Type this word to claim it first:\n\n` +
            `→ \`${drop.word}\``
          )
          .addFields(
      { name: "Reward", value: `**$${drop.amount.toLocaleString()}**`, inline: true },
            { name: "How", value: "Send the word exactly as shown.", inline: true }
          )
          .setFooter({ text: "First correct message wins. Good luck!" });
  try { await message.reply({ embeds: [spawnEmbed], allowedMentions: { repliedUser: false } }); } catch {}
      }
    }

    if (!message.content.startsWith(".")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    try {
      if (command === "help") {
        await handleHelpCommand(client, message);
      } else if (["mute", "unmute", "timeout", "untimeout", "ban", "kick", "warn", "removewarn"].includes(command)) {
        if (!cdOk(message.author.id, command, 2500)) return;
        await handleModerationCommands(client, message, command, args);
      } else if (command === 'purge' || command === 'clean') {
        if (!cdOk(message.author.id, 'purge', 5000)) return;
        await handlePurgeCommand(client, message, args);
      } else if (["snipe", "s", "ds"].includes(command)) {
        await handleSnipeCommands(client, message, command, args);
      } else if (command === "warnings" || command === "warns") {
        await handleWarningsCommand(client, message);
      } else if (command === "config") {
        await handleMessageCreate(client, message);
      } else if (command === "level" || command === "rank") {
        await handleRankCommand(client, message);
      } else if (command === "profile" || command === "p") {
        await handleProfileCommand(client, message);
      } else if (command === "test") {
        await handleTestCommand(client, message);
      } else if (command === "leaderboard" || command === "lb") {
        await handleLeaderboardCommand(client, message);
      } else if (command === "restart") {
        if (message.author.id !== process.env.OWNER_ID) return;
        // Record restart timestamp for next boot to compute downtime
        try {
          const fs = require("fs");
            fs.writeFileSync("./config/lastShutdown.json", JSON.stringify({ ts: Date.now() }));
        } catch {}
        await message.reply({ content: "🔄 Restarting bot...", allowedMentions: { repliedUser: false } }).catch(() => {});
        // Spawn a new detached process then exit current
        try {
          const { spawn } = require('child_process');
          const nodeExec = process.argv[0];
          const entry = path.resolve(__dirname, '..', 'index.js');
          const child = spawn(nodeExec, [entry], {
            cwd: process.cwd(),
            env: process.env,
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
        } catch (e) {
          console.error('[restart spawn failed]', e);
          // Fall back to plain exit (expect external supervisor like pm2/systemd/VSCode to restart)
        }
        setTimeout(() => process.exit(0), 200);
      } else if (command === "stop") {
        if (message.author.id !== process.env.OWNER_ID) return;
        await message.reply("🛑 Stopping bot...");
        process.exit(0);
      } else if (command === "schedule") {
        await handleScheduleCommand(client, message);
      } else if (command === "scripts") {
        await handleScriptsCommand(client, message);
      } else if (command === "cash") {
        await handleCashCommand(client, message);
      } else if (command === "balance" || command === "bal") {
        await handleBalanceCommand(client, message);
      } else if (command === "diag" || command === "diagnostics") {
        await handleDiagnosticsCommand(client, message);
  } else if (command === 'errors' || command === 'err') {
        if (message.author.id !== process.env.OWNER_ID) return;
        // Accept patterns: .errors, .errors 25, .errors embed 25, .errors 25 embed
        const embedMode = args.some(a => a.toLowerCase() === 'embed');
        const numArg = args.find(a => /^(\d+)$/.test(a));
        const limit = Math.min(50, Number(numArg) || 15);
        const recent = getRecentErrors(limit);
        if (!recent.length) return message.reply({ content: '✅ No recent errors recorded.', allowedMentions: { repliedUser: false } });
        const rows = recent.map((e,i) => ({
          idx: i,
          ts: new Date(e.ts).toISOString().replace('T',' ').replace('Z',''),
          scope: e.scope,
          first: (e.message||'').split('\n')[0].slice(0, 200)
        }));
        if (!embedMode) {
          const lines = rows.map(r => `#${r.idx} ${r.ts.split(' ')[1]} [${r.scope}] ${r.first}`);
          const content = '🧾 Recent Errors (newest last)\n' + lines.join('\n');
          return void message.reply({ content: content.slice(0, 1900), allowedMentions: { repliedUser: false } });
        }
        // Embed mode
        const { createEmbed, safeAddField } = require('../utils/embeds');
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const buildPage = (page) => {
          const start = page * pageSize;
          const slice = rows.slice(start, start + pageSize);
          const embed = createEmbed({ title: '🧾 Recent Errors', description: `Page ${page+1}/${totalPages} • ${rows.length} item(s)`, color: 'danger' });
          for (const r of slice) {
            safeAddField(embed, `#${r.idx} [${r.scope}] ${r.ts.split(' ')[1]}`, r.first || '(no message)');
          }
          return embed;
        };
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = (page) => buildNavRow([
          semanticButton('nav', { id: 'err_prev', label: 'Prev', enabled: page!==0 }),
          semanticButton('nav', { id: 'err_next', label: 'Next', enabled: page < totalPages-1 }),
          semanticButton('primary', { id: 'err_refresh', label: 'Refresh' })
        ]);
        const sent = await message.reply({ embeds: [buildPage(0)], components: [row(0)], allowedMentions: { repliedUser: false } });
        ActiveMenus.registerMessage(sent, { type: 'errors', userId: message.author.id, data: { page: 0, limit } });
      } else if (command === 'clearerrors' || command === 'cerr') {
        if (message.author.id !== process.env.OWNER_ID) return;
        clearErrorLog();
        await message.reply({ content: '🧹 Error log cleared.', allowedMentions: { repliedUser: false } });
      } else if (command === 'errdetail') {
        if (message.author.id !== process.env.OWNER_ID) return;
        const idx = Number(args[0]);
        if (!Number.isInteger(idx)) return message.reply({ content: 'Provide an index from .errors list.', allowedMentions:{repliedUser:false}});
        const full = getRecentErrors(100);
        if (idx < 0 || idx >= full.length) return message.reply({ content: 'Index out of range.', allowedMentions:{repliedUser:false}});
        const entry = full[idx];
        const { createEmbed, addChunkedField } = require('../utils/embeds');
        const embed = createEmbed({ title: `Error #${idx} [${entry.scope}]`, description: new Date(entry.ts).toISOString(), color: 'danger' });
        addChunkedField(embed, 'Stack / Message', entry.message, 950);
        await message.reply({ embeds:[embed], allowedMentions:{repliedUser:false}});
      }
    } catch (err) {
      console.error(`[Message Command Error]:`, err);
      message.reply(`<:VRLSad:1413770577080094802> An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
    }

    // Already handled above for all messages
  });
}

module.exports = { attachMessageEvents };

// Register interactive errors menu handler
try {
  const { createEmbed, safeAddField } = require('../utils/embeds');
  ActiveMenus.registerHandler('errors', async (interaction, session) => {
    if (!interaction.isButton()) return;
    if (interaction.user.id !== session.userId) {
  return interaction.reply({ content: 'Not your session.', flags: 1<<6 }).catch(()=>{});
    }
    const { customId } = interaction;
    const { getRecentErrors } = require('../utils/errorUtil');
    let page = session.data.page || 0;
    const limit = session.data.limit || 15;
    const rows = getRecentErrors(limit).map((e,i) => ({
      idx: i,
      ts: new Date(e.ts).toISOString().replace('T',' ').replace('Z',''),
      scope: e.scope,
      first: (e.message||'').split('\n')[0].slice(0, 200)
    }));
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (customId === 'err_prev') page = Math.max(0, page - 1);
    if (customId === 'err_next') page = Math.min(totalPages - 1, page + 1);
    if (customId === 'err_refresh') page = Math.min(page, totalPages - 1);
  // Close button removed per design request
    const start = page * pageSize;
  const slice = rows.slice(start, start + pageSize);
  const embed = createEmbed({ title: '🧾 Recent Errors', description: `Page ${page+1}/${totalPages} • ${rows.length} item(s)`, color: 'danger' });
  for (const r of slice) safeAddField(embed, `#${r.idx} [${r.scope}] ${r.ts.split(' ')[1]}`, r.first || '(no message)');
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = buildNavRow([
      semanticButton('nav', { id: 'err_prev', label: 'Prev', enabled: page!==0 }),
      semanticButton('nav', { id: 'err_next', label: 'Next', enabled: page < totalPages-1 }),
      semanticButton('primary', { id: 'err_refresh', label: 'Refresh' }),
      semanticButton('danger', { id: 'err_close', label: 'Close' })
    ]);
    session.data.page = page;
    try { await interaction.update({ embeds: [embed], components: [row] }); } catch {}
  });
} catch {}

// Purge confirmation handler
try {
  const { executePurge } = require('../commands/moderation/purge');
  ActiveMenus.registerHandler('purgeConfirm', async (interaction, session) => {
    if (!interaction.isButton()) return;
    if (interaction.user.id !== session.userId) {
  return interaction.reply({ content: 'Not your confirmation.', flags: 1<<6 }).catch(()=>{});
    }
    const { customId } = interaction;
    if (customId === 'purge_cancel') {
      try { await interaction.update({ content: 'Purge cancelled.', embeds: [], components: [] }); } catch {}
      return;
    }
    if (customId === 'purge_confirm') {
      const { count, userFilter } = session.data || {};
      try { await interaction.update({ content: 'Executing purge...', embeds: [], components: [] }); } catch {}
      // Reconstruct a pseudo message object interface for executePurge (needs channel & reply)
      const channel = interaction.channel;
      const fakeMessage = {
        channel,
        author: interaction.user,
        member: interaction.member,
        reply: (opts) => interaction.followUp ? interaction.followUp(opts) : channel.send(opts)
      };
      await require('../commands/moderation/purge').executePurge(interaction.client, fakeMessage, count, userFilter);
    }
  });
} catch {}
