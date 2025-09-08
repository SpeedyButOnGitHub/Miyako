const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const theme = require("../utils/theme");

// Recursively collect .js files excluding common non-source folders
function walkForJS(dir, baseDir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // skip hidden
    if (e.isDirectory()) {
      const skip = [
        "node_modules",
        ".git",
        ".vscode",
        "dist"
      ].includes(e.name);
      if (skip) continue;
      walkForJS(path.join(dir, e.name), baseDir, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".js")) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(baseDir, abs).replace(/\\/g, "/");
      try {
        const content = fs.readFileSync(abs, "utf8");
        const lines = content.split(/\r?\n/).length;
        out.push({ file: rel, lines });
      } catch {}
    }
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildEmbed(pageItems, page, totalPages, totalFiles, totalLines) {
  const desc = pageItems
    .map((it, idx) => `**${(page * 10) + idx + 1}.** ${it.file} — ${it.lines.toLocaleString()} line${it.lines === 1 ? "" : "s"}`)
    .join("\n");
  return new EmbedBuilder()
    .setTitle("📜 Scripts Leaderboard")
    .setColor(theme.colors.primary)
    .setDescription(desc || "*No .js files found*")
    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${totalFiles} files • ${totalLines.toLocaleString()} total lines` })
    .setTimestamp();
}

async function handleScriptsCommand(client, message) {
  // Build dataset
  const baseDir = path.resolve(__dirname, "..");
  const files = walkForJS(baseDir, baseDir);
  files.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
  const totalFiles = files.length;
  const totalLines = files.reduce((s, f) => s + f.lines, 0);

  const pages = chunk(files, 10);
  const totalPages = Math.max(1, pages.length);
  let page = 0;
  const embed = buildEmbed(pages[page] || [], page, totalPages, totalFiles, totalLines);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("scripts_prev").setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId("scripts_next").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId("scripts_close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  const reply = await message.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 2 * 60 * 1000 });
  collector.on("collect", async (interaction) => {
    if (interaction.customId === "scripts_close") {
      collector.stop();
      return interaction.update({ components: [] });
    }
    if (interaction.customId === "scripts_prev" && page > 0) page--;
    if (interaction.customId === "scripts_next" && page < totalPages - 1) page++;
    const newEmbed = buildEmbed(pages[page] || [], page, totalPages, totalFiles, totalLines);
    const newRow = new ActionRowBuilder().addComponents(
      ButtonBuilder.from(row.components[0]).setDisabled(page === 0),
      ButtonBuilder.from(row.components[1]).setDisabled(page >= totalPages - 1),
      ButtonBuilder.from(row.components[2])
    );
    await interaction.update({ embeds: [newEmbed], components: [newRow] });
  });

  collector.on("end", () => reply.edit({ components: [] }).catch(() => {}));
}

module.exports = { handleScriptsCommand };
