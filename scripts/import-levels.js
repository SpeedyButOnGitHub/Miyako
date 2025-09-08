require('dotenv/config');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1232701768832516100';
const LEVELS_FILE = path.resolve(__dirname, '../config/levels.json');

function xpForLevel(level) {
  const BASE_XP = 150;
  return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

function loadLevels() {
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      const raw = fs.readFileSync(LEVELS_FILE, 'utf8');
      return JSON.parse(raw || '{}') || {};
    }
  } catch {}
  return {};
}

function saveLevels(levels) {
  try {
    const dir = path.dirname(LEVELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2));
  } catch (e) {
    console.error('Failed to save levels.json:', e);
  }
}

function extractTextFromMessage(msg) {
  let text = msg.content || '';
  if (Array.isArray(msg.embeds) && msg.embeds.length) {
    for (const emb of msg.embeds) {
      if (emb.title) text += `\n${emb.title}`;
      if (emb.description) text += `\n${emb.description}`;
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields) {
          if (f && f.name) text += `\n${f.name}`;
          if (f && f.value) text += `\n${f.value}`;
        }
      }
      if (emb.footer && emb.footer.text) text += `\n${emb.footer.text}`;
    }
  }
  return text.trim();
}

// Try to extract a plain "@Name" (no true mention markup) from text
function extractAtName(text) {
  if (!text) return null;
  // Capture the first @... token up to a common delimiter; allow spaces inside up to 24 chars (display names can have spaces)
  // Prefer a conservative token (letters/numbers/_), then fall back to a looser one if nothing found
  const tight = text.match(/@([A-Za-z0-9_]{2,32})\b/);
  if (tight) return tight[1];
  const loose = text.match(/@\s*([^\n,!.?:]{2,32})/);
  if (loose) return loose[1].trim();
  return null;
}

function parseLevelEvent(text, msg) {
  if (!text) return null;
  // Try to find a mentioned user ID
  const mentionMatch = text.match(/<@!?(\d+)>/);
  const userId = mentionMatch ? mentionMatch[1] : (msg.mentions?.users?.first()?.id || null);
  // Also try to capture a plain @Name string for later resolution
  const userName = userId ? null : extractAtName(text);

  // Find a level number near common keywords
  // Patterns:
  //  - reached level 12
  //  - leveled up to 12
  //  - is now level 12
  //  - climbed from level 29 to 30
  //  - level 12 (generic fallback)
  // Normalize formatting (remove markdown symbols like **, __, `, ~) so digits are contiguous
  const normText = String(text).replace(/[\*`_~]/g, '');
  const patterns = [
    /reached\s+(?:level|lvl)\s*(\d+)/i,
    /leveled?\s+up\s+(?:to\s*)?(\d+)/i,
    /is\s+now\s+(?:level|lvl)\s*(\d+)/i,
    /climbed\s+from\s+(?:level|lvl)\s*\d+\s+to\s+(\d+)/i,
    /(?:level|lvl)\s*(\d+)/i,
  ];
  let level = null;
  for (const re of patterns) {
    const m = normText.match(re);
    if (m && m[1]) { level = parseInt(m[1], 10); break; }
  }
  if (!level || level <= 0) return null;

  return { userId, userName, level };
}

async function fetchAllMessages(channel) {
  const out = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = Array.from(batch.values());
    out.push(...arr);
    before = arr[arr.length - 1].id;
    // small delay to be gentle
    await new Promise(r => setTimeout(r, 350));
  }
  return out;
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN missing in environment');
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      // Needed to resolve plain "@Name" to a user ID by scanning members
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once('ready', async () => {
    console.log(`[import-levels] Logged in as ${client.user?.tag || client.user?.id}`);
    try {
  console.log('[import-levels] LEVELS_FILE path:', LEVELS_FILE);
      const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.error(`[import-levels] Channel ${CHANNEL_ID} not found or not text-based.`);
        process.exitCode = 1;
        return client.destroy();
      }

      console.log('[import-levels] Fetching messages...');
      const messages = await fetchAllMessages(channel);
      console.log(`[import-levels] Fetched ${messages.length} messages.`);

      // Prepare member resolvers if needed
      const guild = channel.guild;
      let resolvedFromNames = 0;
      let unresolvedNames = new Map(); // name -> count
      // Build lookup maps once
      let memberRecords = null; // Array<{id, u, d, nu, nd}>
      const norm = (s) => String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '');
      async function ensureMemberIndex() {
        if (memberRecords) return;
        try {
          // Fetch all members into cache; requires Server Members Intent enabled for the bot
          await guild.members.fetch();
        } catch (e) {
          console.warn('[import-levels] Warning: Failed to fetch all members. Name resolution may be incomplete.', e?.message || e);
        }
        memberRecords = [];
        guild.members.cache.forEach(m => {
          const u = m.user?.username || '';
          const d = m.displayName || m.nickname || '';
          memberRecords.push({ id: String(m.id), u, d, nu: norm(u), nd: norm(d) });
        });
        console.log(`[import-levels] Member index built for ${memberRecords.length} members.`);
      }

      function resolveNameToId(name) {
        if (!name || !memberRecords) return null;
        // Try raw then normalized
        const raw = String(name).trim();
        const nraw = norm(raw);
        if (!nraw) return null;
        const exact = memberRecords.filter(m => m.u.toLowerCase() === raw.toLowerCase() || m.d.toLowerCase() === raw.toLowerCase() || m.nu === nraw || m.nd === nraw);
        if (exact.length === 1) return exact[0].id;
        if (exact.length > 1) return null; // ambiguous
        // startsWith on normalized
        const starts = memberRecords.filter(m => m.nu.startsWith(nraw) || m.nd.startsWith(nraw));
        if (starts.length === 1) return starts[0].id;
        if (starts.length > 1) return null;
        // includes on normalized (may be ambiguous)
        const incl = memberRecords.filter(m => m.nu.includes(nraw) || m.nd.includes(nraw));
        if (incl.length === 1) return incl[0].id;
        return null;
      }

      const highest = new Map(); // userId -> level
      let nonEmptyText = 0;
      let containsCongrats = 0;
      let containsLevelWord = 0;
      let sampleLogged = 0;
      for (const msg of messages) {
        const text = extractTextFromMessage(msg);
        if (text && text.length) {
          nonEmptyText++;
          const ltext = text.toLowerCase();
          if (ltext.includes('congrat')) containsCongrats++;
          if (/(?:\blevel\b|\blvl\b)/i.test(text)) containsLevelWord++;
          if (sampleLogged < 3 && (ltext.includes('congrat') || /\bclimbed\b/i.test(text))) {
            console.log('[sample]', text.substring(0, 200).replace(/\n/g, ' '));
            sampleLogged++;
          }
        }
        const parsed = parseLevelEvent(text, msg);
        if (!parsed) continue;
        let uid = parsed.userId;
        if (!uid && parsed.userName) {
          await ensureMemberIndex();
          uid = resolveNameToId(parsed.userName);
          if (uid) resolvedFromNames++;
          else unresolvedNames.set(parsed.userName, (unresolvedNames.get(parsed.userName) || 0) + 1);
        }
        if (!uid) continue;
        const prev = highest.get(uid) || 0;
        if (parsed.level > prev) highest.set(uid, parsed.level);
      }

      console.log(`[import-levels] Parsed ${highest.size} users with levels.`);
  console.log(`[import-levels] Text stats: nonEmpty=${nonEmptyText}, containsCongrats=${containsCongrats}, containsLevelWord=${containsLevelWord}`);
      if (resolvedFromNames) {
        console.log(`[import-levels] Resolved ${resolvedFromNames} users from plain @Name.`);
      }
      if (unresolvedNames.size) {
        // Show top 10 unresolved names by frequency
        const top = Array.from(unresolvedNames.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
        console.log(`[import-levels] Unresolved @Name samples (top ${top.length}):`, top.map(([n,c])=>`${n} x${c}`).join(', '));
      }

      const current = loadLevels();
      const beforeCount = Object.keys(current).length;
      console.log(`[import-levels] Entries before update: ${beforeCount}`);
      let updated = 0;
      for (const [userId, level] of highest.entries()) {
        const existing = current[userId] || { xp: 0, level: 0 };
        if ((existing.level || 0) >= level) continue; // keep higher existing
        current[userId] = {
          xp: xpForLevel(level),
          level
        };
        updated++;
      }

      saveLevels(current);
      const afterCount = Object.keys(current).length;
      console.log(`[import-levels] Updated ${updated} users. Entries after update (in-memory): ${afterCount}`);
      try {
        const verify = JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8') || '{}');
        console.log(`[import-levels] Verify on-disk entry count: ${Object.keys(verify).length}`);
      } catch (e) {
        console.warn('[import-levels] Post-save verification failed:', e?.message || e);
      }
    } catch (e) {
      console.error('[import-levels] Error:', e);
      process.exitCode = 1;
    } finally {
      setTimeout(() => client.destroy(), 250);
    }
  });

  client.login(token).catch(err => {
    console.error('Login failed:', err);
    process.exitCode = 1;
  });
}

main();
