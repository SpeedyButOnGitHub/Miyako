import { ROLES, ROLE_ORDER, ROLE_EMOJIS, CHANNEL_ID } from "../config/roles.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const BOT_PREFIX = "**🌙 Late Night Hours Staff Team**\n\n";

// Allowed staff chatbox roles as constants
const STAFF_MANAGER_ROLE = "1380277718091829368";
const STAFF_SECURITY_ROLE = "1380323145621180466";
const STAFF_MODERATOR_ROLE = "1375958589658632313";
const STAFF_STAFF_ROLE = "1375958480380493844";
const STAFF_ADMIN_ROLE = "1381077407074750594";

const ALLOWED_ROLES = [
  STAFF_MANAGER_ROLE,
  STAFF_SECURITY_ROLE,
  STAFF_MODERATOR_ROLE,
  STAFF_STAFF_ROLE,
  STAFF_ADMIN_ROLE
];

const CHATBOX_BUTTON_ID = "staffteam_chatbox";
const CHATBOX_CHANNEL_ID = "1232701768383729790";

const formatMembersListInline = (membersArray) =>
  membersArray.length ? membersArray.map(m => `<@${m.id}>`).join(", ") : "*None*";

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
    if (["Staff","Trainee","Inactive"].includes(roleName)) header = "### ";

    output += `${header}${emoji} ${roleMention} (${members.size})\n${memberList}\n\n`;
  }
  return output;
};

const getStaffMessageRow = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CHATBOX_BUTTON_ID)
      .setLabel("Open Staff Chatbox")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("💬")
  );

const updateStaffMessage = async (guild) => {
  try {
    const channel = await guild.channels.fetch(CHANNEL_ID);
    let messages = await channel.messages.fetch({ limit: 50 });
    let staffMessage = messages.find(msg => msg.author.id === guild.client.user.id && msg.content.startsWith(BOT_PREFIX));
    const newContent = await generateStaffList(guild);

    if (staffMessage) {
      await staffMessage.edit({ content: newContent, components: [getStaffMessageRow()] });
    } else {
      staffMessage = await channel.send({ content: newContent, components: [getStaffMessageRow()] });
      await staffMessage.pin();
    }
  } catch (err) { console.error("Failed to update staff message:", err); }
};

export {
  updateStaffMessage,
  ALLOWED_ROLES,
  CHATBOX_BUTTON_ID,
  CHATBOX_CHANNEL_ID
};
