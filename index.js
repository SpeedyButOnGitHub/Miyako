require("dotenv").config();
const fs = require("fs");
const { 
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField
} = require("discord.js");

const ms = require("ms"); // for flexible time parsing, install with `npm i ms`

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== CONFIG =====
const OWNER_ID = "349282473085239298";
const CONFIG_FILE = "./botConfig.json";

const ROLES = {
  Owners: "1385448879822213161",
  Manager: "1375958480380493844",
  Security: "1375958589658632313",
  Staff: "1380323145621180466",
  Trainee: "1380277718091829368",
  Inactive: "1412983968227262605"
};

const ROLE_ORDER = ["Owners", "Manager", "Security", "Staff", "Trainee", "Inactive"];
const ROLE_EMOJIS = {
  Owners: "👑",
  Manager: "📋",
  Security: "🛡️",
  Staff: "💼",
  Trainee: "🎓",
  Inactive: "💤"
};

const BOT_PREFIX = "**🌙 Late Night Hours Staff Team**\n\n";
const CHANNEL_ID = "1412917089840398346";

// Load or create config
let config = { snipingWhitelist: [], moderatorRoles: [], warnings: {} };
if (fs.existsSync(CONFIG_FILE)) {
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE)); } 
  catch { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
}
if (!config.snipingWhitelist) config.snipingWhitelist = [];
if (!config.moderatorRoles) config.moderatorRoles = [];
if (!config.warnings) config.warnings = {};

const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2, "\t"));

// ===== SNIPES =====
const snipes = new Map(); // channelId => {content, nickname, avatarURL, timestamp, attachments, deleted, expiresAt}

// ===== HELPERS =====
const formatMembersListInline = (membersArray) => membersArray.length ? membersArray.map(m => `<@${m.id}>`).join(", ") : "*None*";

const generateStaffList = async (guild) => {
  await guild.members.fetch();
  let alreadyListed = new Set();
  let output = BOT_PREFIX;

  for (const roleName of ROLE_ORDER) {
    const roleId = ROLES[roleName];
    const emoji = ROLE_EMOJIS[roleName] || "";
    const roleMention = `<@&${roleId}>`;

    const members = guild.members.cache.filter(
      m => m.roles.cache.has(roleId) && !alreadyListed.has(m.id)
    );
    members.forEach(m => alreadyListed.add(m.id));
    const memberList = formatMembersListInline([...members.values()]);

    let header = "# ";
    if (roleName === "Manager" || roleName === "Security") header = "## ";
    if (roleName === "Staff" || roleName === "Trainee" || roleName === "Inactive") header = "### ";

    output += `${header}${emoji} ${roleMention} (${members.size})\n${memberList}\n\n`;
  }

  return output;
};

const updateStaffMessage = async (guild) => {
  try {
    const channel = await guild.channels.fetch(CHANNEL_ID);
    let messages = await channel.messages.fetch({ limit: 50 });
    let staffMessage = messages.find(msg => msg.author.id === client.user.id && msg.content.startsWith(BOT_PREFIX));
    const newContent = await generateStaffList(guild);

    if (staffMessage) await staffMessage.edit(newContent);
    else {
      staffMessage = await channel.send(newContent);
      await staffMessage.pin();
    }
  } catch (err) { console.error("Failed to update staff message:", err); }
};

// ===== CONFIG CATEGORIES =====
const configCategories = {
  Sniping: {
    description: "Settings for sniping commands",
    settings: {
      WhitelistedChannels: {
        description: "Manage channels where snipes are allowed",
        getDisplay: () => config.snipingWhitelist.length ? config.snipingWhitelist.map(id => `<#${id}>`).join("\n") : "*None*",
        buttons: [
          { id: "viewChannels", label: "View Channels", style: ButtonStyle.Primary },
          { id: "addChannel", label: "➕ Add Channel", style: ButtonStyle.Success },
          { id: "removeChannel", label: "➖ Remove Channel", style: ButtonStyle.Danger },
        ]
      }
    }
  },
  Moderation: {
    description: "Settings for moderation commands",
    settings: {
      ModeratorRoles: {
        description: "Roles allowed to use moderation commands",
        getDisplay: () => config.moderatorRoles.length ? config.moderatorRoles.map(id => `<@&${id}>`).join("\n") : "*None*",
        buttons: [
          { id: "viewRoles", label: "View Roles", style: ButtonStyle.Primary },
          { id: "addRole", label: "➕ Add Role", style: ButtonStyle.Success },
          { id: "removeRole", label: "➖ Remove Role", style: ButtonStyle.Danger },
        ]
      }
    }
  }
};

// ===== UTILITY =====
const parseTime = (str) => {
  if (!str) return null;
  try { return ms(str); } catch { return null; }
};

const isModerator = (member) => config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)) || member.id === OWNER_ID;

// ===== MESSAGE EVENTS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // ===== CONFIG COMMAND =====
  if (content.toLowerCase() === ".config") {
    if (message.author.id !== OWNER_ID) return;

    const mainEmbed = new EmbedBuilder()
      .setTitle("⚙️ Bot Configuration")
      .setColor(0x2c2f33)
      .setDescription("Select a category below to configure settings:");

    const row = new ActionRowBuilder();
    for (const category in configCategories) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`category_${category}`).setLabel(category).setStyle(ButtonStyle.Primary)
      );
    }

    const mainMsg = await message.reply({ embeds: [mainEmbed], components: [row], allowedMentions: { repliedUser: false } });

    const collector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5*60*1000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ You cannot use these buttons.", ephemeral: true });

      // CATEGORY BUTTON
      if (interaction.customId.startsWith("category_")) {
        const categoryName = interaction.customId.split("_")[1];
        const category = configCategories[categoryName];
        if (!category) return interaction.reply({ content: "❌ Category not found.", ephemeral: true });

        const categoryEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${categoryName} Settings`)
          .setColor(0x2c2f33)
          .setDescription(category.description);

        const settingsRow = new ActionRowBuilder();
        for (const settingKey in category.settings) {
          settingsRow.addComponents(
            new ButtonBuilder().setCustomId(`setting_${categoryName}_${settingKey}`).setLabel(settingKey).setStyle(ButtonStyle.Primary)
          );
        }

        await interaction.update({ embeds: [categoryEmbed], components: [settingsRow] });
      }

      // SETTING BUTTON
      if (interaction.customId.startsWith("setting_")) {
        const [, categoryName, settingKey] = interaction.customId.split("_");
        const setting = configCategories[categoryName]?.settings[settingKey];
        if (!setting) return interaction.reply({ content: "❌ Setting not found.", ephemeral: true });

        const itemEmbed = new EmbedBuilder()
          .setTitle(`⚙️ ${settingKey}`)
          .setColor(0x2c2f33)
          .setDescription(`${setting.description}\n\nCurrent value(s):\n${setting.getDisplay()}`);

        const itemRow = new ActionRowBuilder();
        setting.buttons.forEach(btn => {
          itemRow.addComponents(
            new ButtonBuilder().setCustomId(`settingButton_${categoryName}_${settingKey}_${btn.id}`).setLabel(btn.label).setStyle(btn.style)
          );
        });

        await interaction.update({ embeds: [itemEmbed], components: [itemRow] });
      }

      // BUTTON ACTIONS
      if (interaction.customId.startsWith("settingButton_")) {
        const [, categoryName, settingKey, action] = interaction.customId.split("_");

        // SNIPING
        if (categoryName === "Sniping") {
          if (action === "viewChannels") {
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle("📋 Whitelisted Channels").setColor(0x2c2f33).setDescription(config.snipingWhitelist.length ? config.snipingWhitelist.map(c => `<#${c}>`).join("\n") : "*None*")], ephemeral: true, allowedMentions: { repliedUser: false } });
          }
          if (action === "addChannel") {
            const channelId = interaction.channel.id;
            if (!config.snipingWhitelist.includes(channelId)) config.snipingWhitelist.push(channelId);
            saveConfig();
            await interaction.reply({ content: `✅ Added <#${channelId}> to whitelist.`, ephemeral: true, allowedMentions: { repliedUser: false } });
          }
          if (action === "removeChannel") {
            const channelId = interaction.channel.id;
            config.snipingWhitelist = config.snipingWhitelist.filter(c => c !== channelId);
            saveConfig();
            await interaction.reply({ content: `❌ Removed <#${channelId}> from whitelist.`, ephemeral: true, allowedMentions: { repliedUser: false } });
          }
        }

        // MODERATOR ROLES
        if (categoryName === "Moderation") {
          if (action === "viewRoles") {
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle("📋 Moderator Roles").setColor(0x2c2f33).setDescription(config.moderatorRoles.length ? config.moderatorRoles.map(r => `<@&${r}>`).join("\n") : "*None*")], ephemeral: true, allowedMentions: { repliedUser: false } });
          }
          if (action === "addRole") {
            const roleId = interaction.member.roles.highest.id;
            if (!config.moderatorRoles.includes(roleId)) config.moderatorRoles.push(roleId);
            saveConfig();
            await interaction.reply({ content: `✅ Added <@&${roleId}> as a moderator role.`, ephemeral: true, allowedMentions: { repliedUser: false } });
          }
          if (action === "removeRole") {
            const roleId = interaction.member.roles.highest.id;
            config.moderatorRoles = config.moderatorRoles.filter(r => r !== roleId);
            saveConfig();
            await interaction.reply({ content: `❌ Removed <@&${roleId}> from moderator roles.`, ephemeral: true, allowedMentions: { repliedUser: false } });
          }
        }
      }
    });
  }

  // ===== DELETE SNIPE =====
  if (content.toLowerCase() === ".ds") {
    const snipe = snipes.get(message.channel.id);
    if (snipe) {
      snipe.deleted = true;
      snipe.attachments = [];
      snipes.set(message.channel.id, snipe);
      const confirmMsg = await message.reply({ content: "✅ Snipe deleted!", allowedMentions: { repliedUser: false } });
      setTimeout(() => { confirmMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 3000);
    } else {
      const confirmMsg = await message.reply({ content: "⚠️ No snipe to delete.", allowedMentions: { repliedUser: false } });
      setTimeout(() => { confirmMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 3000);
    }
    return;
  }

  // ===== SNIPES =====
  if (content.toLowerCase() === ".snipe" || content.toLowerCase() === ".s") {
    const snipe = snipes.get(message.channel.id);
    if (!snipe || Date.now() > snipe.expiresAt) {
      const msg = await message.reply({ content: "⚠️ No message has been deleted in the past 2 hours.", allowedMentions: { repliedUser: false } });
      setTimeout(() => { msg.delete().catch(() => {}); message.delete().catch(() => {}); }, 5000);
      return;
    }
    if (!config.snipingWhitelist.includes(message.channel.id)) {
      const msg = await message.reply({ content: "❌ Cannot snipe in this channel!", allowedMentions: { repliedUser: false } });
      setTimeout(() => { msg.delete().catch(() => {}); message.delete().catch(() => {}); }, 5000);
      return;
    }

    let displayContent = snipe.deleted ? "⚠️ This snipe has been deleted" : snipe.content;
    if (displayContent.length > 1024) displayContent = displayContent.slice(0, 1021) + "...(truncated)";

    const deletedTime = new Date(snipe.timestamp);
    const formattedTime = deletedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const footerText = `Today at ${formattedTime}`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
      .setDescription(displayContent)
      .setColor(0x2c2f33)
      .setFooter({ text: footerText });

    if (!snipe.deleted && snipe.attachments.length > 0) embed.setImage(snipe.attachments[0]);
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  // ===== MODERATION COMMANDS =====
  if (!isModerator(message.member)) return;

  const args = content.split(/\s+/);
  const command = args.shift().toLowerCase();

  const member = message.mentions.members.first();
  if (!member && ["mute","ban","kick","timeout","warn"].includes(command)) {
    return message.reply({ content: "❌ You must mention a user.", allowedMentions: { repliedUser: false } });
  }

  if (command === ".mute") {
    let duration = parseTime(args.join(" ")) || 60*60*1000; // default 1h
    member.timeout(duration, `Muted by ${message.author.tag}`).catch(() => {});
    await message.reply({ content: `✅ Muted ${member} for ${ms(duration, { long: true })}`, allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  if (command === ".timeout") {
    let duration = parseTime(args.join(" ")) || 60*60*1000; // default 1h
    member.timeout(duration, `Timeout by ${message.author.tag}`).catch(() => {});
    await message.reply({ content: `✅ Timed out ${member} for ${ms(duration, { long: true })}`, allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  if (command === ".ban") {
    let days = parseInt(args[1]) || 7;
    member.ban({ deleteMessageDays: days, reason: `Banned by ${message.author.tag}` }).catch(() => {});
    await message.reply({ content: `✅ Banned ${member} (deleted ${days} days of messages)`, allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  if (command === ".kick") {
    member.kick(`Kicked by ${message.author.tag}`).catch(() => {});
    await message.reply({ content: `✅ Kicked ${member}`, allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  if (command === ".warn") {
    const reason = args.join(" ") || "No reason provided";
    if (!config.warnings[member.id]) config.warnings[member.id] = [];
    config.warnings[member.id].push({ moderator: message.author.id, reason, date: Date.now() });
    saveConfig();
    await message.reply({ content: `⚠️ Warned ${member} for: ${reason}`, allowedMentions: { repliedUser: false } });
    message.delete().catch(() => {});
  }

  if (command === ".slowmode") {
    let duration = parseTime(args[0]) || 3*1000;
    message.channel.setRateLimitPerUser(Math.floor(duration/1000), `Slowmode set by ${message.author.tag}`).catch(() => {});
    await message.reply({ content: `✅ Set slowmode to ${ms(duration, { long: true })} for 2 hours`, allowedMentions: { repliedUser: false } });
    setTimeout(() => message.channel.setRateLimitPerUser(0).catch(() => {}), 2*60*60*1000); // reset after 2h
    message.delete().catch(() => {});
  }
});

// ===== MESSAGE DELETE (SNIPES) =====
client.on("messageDelete", (message) => {
  if (message.partial || message.author.bot) return;
  const member = message.member || message.guild.members.cache.get(message.author.id);
  snipes.set(message.channel.id, {
    content: message.content || "*No text content*",
    nickname: member ? member.displayName : message.author.username,
    avatarURL: member ? member.displayAvatarURL({ dynamic: true }) : message.author.displayAvatarURL({ dynamic: true }),
    timestamp: Date.now(),
    attachments: message.attachments.map(a => a.url),
    deleted: false,
    expiresAt: Date.now() + 2*60*60*1000
  });
});

// ===== READY =====
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(guild => updateStaffMessage(guild));
});

// ===== MEMBER UPDATES =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (!oldMember.guild) return;
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) await updateStaffMessage(newMember.guild);
});
client.on("guildMemberAdd", async (member) => updateStaffMessage(member.guild));
client.on("guildMemberRemove", async (member) => updateStaffMessage(member.guild));

// ===== CLEANUP EXPIRED SNIPES =====
setInterval(() => {
  const now = Date.now();
  for (const [channelId, snipe] of snipes) {
    if (snipe.expiresAt && now > snipe.expiresAt) snipes.delete(channelId);
  }
}, 5*60*1000);

client.login(process.env.DISCORD_TOKEN);
