const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { isModerator } = require("./moderation/index");
const { handleMessageCreate } = require("./configMenu");
const { OWNER_ID } = require("./moderation/permissions");
const ActiveMenus = require("../utils/activeMenus");

const EMOJI_ERROR = "❌";

// If this file defines interactive help menus elsewhere, consider routing through ActiveMenus

const categories = [
  {
    name: "Moderation",
    emoji: "🛡️",
    commands: [
      { name: "Mute", value: "`mute (user) (time) (reason)`\nDefault duration: 1 hour" },
      { name: "Unmute", value: "`unmute (user)`" },
      { name: "Timeout", value: "`timeout (user) (time) (reason)`\nDefault duration: 1 hour" },
      { name: "Untimeout", value: "`untimeout (user)`" },
      { name: "Ban", value: "`ban (user) (reason)`" },
      { name: "Kick", value: "`kick (user) (reason)`" },
      { name: "Warn", value: "`warn (user) (reason)`\nDefault reason: 'You have been warned in Late Night Hours'." },
      { name: "Remove Warning", value: "`removewarn (user) (index)`\nRemoves a specific warning by index or the latest if no index is given." },
      { name: "Warnings", value: "`warnings (user)`\nShows all warnings for a user." }
    ]
  },
  {
    name: "Leveling",
    emoji: "🧮",
    commands: [
      { name: "Level", value: "`level`\nShows your current level and XP progress." },
      { name: "Profile", value: "`profile` or `p`\nOpens your profile with progress, bonuses, and rewards." },
      { name: "Leaderboard", value: "`leaderboard` or `lb`\nShows the top users by level and XP." }
    ]
  },
  {
    name: "Misc",
    emoji: "✨",
    commands: [
      { name: "Snipe", value: "`snipe` or `s`\nShows the last deleted message in this channel." },
      { name: "Delete Snipe", value: "`ds`\nDeletes the last snipe in this channel." },
      { name: "Scripts Leaderboard", value: "`scripts`\nLists repo .js files by line count with pagination." },
      { name: "Help", value: "`help`\nShows this help menu." }
    ]
  }
];

async function handleHelpCommand(client, message) {
  if (!message.guild) return;

  // Determine which categories to show
  let shownCategories;
  const isOwner = message.author?.id === OWNER_ID;
  const isMod = message.member && isModerator(message.member);
  if (isOwner || isMod) {
    shownCategories = categories;
  } else {
    shownCategories = categories.filter(cat => cat.name === "Misc");
  }

  // Build main help menu embed
  const embed = new EmbedBuilder()
    .setTitle("🌙 Command Help Menu")
    .setColor(0x5865F2)
    .setDescription(
  "Welcome to the help menu!\n\n" +
  "Tip: durations accept values like `30m`, `2h`, `1d`.\n\n" +
  "Select a category below to view available commands.\n\n" +
      shownCategories.map(cat => `${cat.emoji} **${cat.name}**`).join("\n")
    );

  const user = message.author;
  let avatarURL = null;
  let tag = null;

  // If it's a real User object, use its methods
  if (user && typeof user.displayAvatarURL === "function") {
    avatarURL = user.displayAvatarURL({ dynamic: true });
    tag = user.tag;
  } else if (message.member && message.member.user) {
    avatarURL = message.member.user.displayAvatarURL({ dynamic: true });
    tag = message.member.user.tag;
  } else if (user && user.id) {
    // Fallback: use default avatar and ID as tag
    avatarURL = `https://cdn.discordapp.com/embed/avatars/0.png`;
    tag = `User ${user.id}`;
  }

  embed.setFooter({ 
    text: `Requested by ${message.author.tag}`, 
    iconURL: (message.member && message.member.user && typeof message.member.user.displayAvatarURL === "function")
      ? message.member.user.displayAvatarURL({ dynamic: true })
      : (typeof message.author.displayAvatarURL === "function"
        ? message.author.displayAvatarURL({ dynamic: true })
        : "https://cdn.discordapp.com/embed/avatars/0.png")
  });
  embed.setTimestamp();

  // Buttons for categories and config
  const row = new ActionRowBuilder();
  shownCategories.forEach(cat => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_${cat.name.toLowerCase()}`)
        .setLabel(cat.name)
        .setStyle(cat.name === "Moderation" ? ButtonStyle.Primary : ButtonStyle.Success)
        .setEmoji(cat.emoji)
    );
  });
  // Config button (owner only)
  if (isOwner) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("help_config")
        .setLabel("Config Menu")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⚙️")
    );
  }

  const replyMsg = await message.reply({ embeds: [embed], components: [row] });

  // Button interaction for category details
  const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
  collector.on("collect", async interaction => {
    try {
      const id = interaction.customId;

      // Open Config (owner only)
      if (id === "help_config") {
        if (interaction.user.id !== OWNER_ID) {
          await interaction.reply({ content: "Only the Owner can use this", ephemeral: true }).catch(() => {});
          return;
        }

        // Stop this collector first so its 'end' handler won't race and delete after we switch
        try { collector.stop("switch"); } catch {}

        // Ack, delete help, then open config
        await interaction.deferUpdate();
        await replyMsg.delete().catch(() => {});
        const fakeMessage = {
          author: { id: interaction.user.id },
          content: ".config",
          guild: interaction.guild,
          channel: interaction.channel,
          reply: (...args) => interaction.channel.send(...args)
        };
        await handleMessageCreate(client, fakeMessage);
        return;
      }

      // Moderation gate (no ack yet; reply ephemerally if blocked)
      if (id === "help_moderation") {
        const isMod = interaction.member && isModerator(interaction.member);
        const isOwner = interaction.user.id === OWNER_ID;
        if (!isMod && !isOwner) {
          await interaction.reply({ content: "Only Moderators can use this", ephemeral: true }).catch(() => {});
          return;
        }
      }

      // Category buttons
      const selectedCat = shownCategories.find(cat => `help_${cat.name.toLowerCase()}` === id);
      if (selectedCat) {
        if (selectedCat.name === "Moderation") {
          const isMod = interaction.member && isModerator(interaction.member);
          const isOwner = interaction.user.id === OWNER_ID;
          if (!isMod && !isOwner) {
            await interaction.reply({ content: "Only Moderators can use this", ephemeral: true }).catch(() => {});
            return;
          }
        }

        const footerIcon = (message.member && message.member.user && typeof message.member.user.displayAvatarURL === "function")
          ? message.member.user.displayAvatarURL({ dynamic: true })
          : (typeof message.author.displayAvatarURL === "function"
            ? message.author.displayAvatarURL({ dynamic: true })
            : "https://cdn.discordapp.com/embed/avatars/0.png");

        const catEmbed = new EmbedBuilder()
          .setTitle(`${selectedCat.emoji} ${selectedCat.name} Commands`)
          .setColor(0x5865F2)
          .setDescription(selectedCat.commands.map(cmd => `**${cmd.name}:**\n${cmd.value}`).join("\n\n"))
          .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: footerIcon })
          .setTimestamp();

        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("help_back")
            .setLabel("⬅️ Back")
            .setStyle(ButtonStyle.Secondary)
        );
        await interaction.deferUpdate();
        await replyMsg.edit({ embeds: [catEmbed], components: [backRow] }).catch(() => {});
        return;
      }

      // Back button
      if (id === "help_back") {
        await interaction.deferUpdate();
        await replyMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
        return;
      }

      await interaction.reply({ content: `${EMOJI_ERROR} Please provide a valid input.`, ephemeral: true }).catch(() => {});
    } catch (err) {
      try { await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true }); } catch {}
    }
  });
  collector.on("end", async (_collected, reason) => {
    if (reason === "switch") return; // already handled when opening config
    try {
      const { timeoutRow } = require("../utils/activeMenus");
      await replyMsg.edit({ components: timeoutRow() });
    } catch {
      try { await replyMsg.edit({ components: [] }); } catch {}
    }
  });
}

module.exports = {
  handleHelpCommand
};
