import fs from "fs";
import { ROLES, ROLE_ORDER, ROLE_EMOJIS, CHANNEL_ID } from "../config/roles.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
let levels = fs.existsSync(LEVELS_FILE) ? JSON.parse(fs.readFileSync(LEVELS_FILE)) : {};
const BOT_PREFIX = "**🌙 Late Night Hours Staff Team**\n\n";
function getXP(userId) {
// Allowed staff chatbox roles as constants
const STAFF_MANAGER_ROLE = "1380277718091829368";
const STAFF_SECURITY_ROLE = "1380323145621180466";
const STAFF_MODERATOR_ROLE = "1375958589658632313";
const STAFF_STAFF_ROLE = "1375958480380493844";
const STAFF_ADMIN_ROLE = "1381077407074750594";P per level
  return Math.floor(Math.pow(xp / 50, 0.7));
const ALLOWED_ROLES = [
  STAFF_MANAGER_ROLE,
  STAFF_SECURITY_ROLE, amount) {
  STAFF_MODERATOR_ROLE,levels[userId] = { xp: 0, level: 0 };
  STAFF_STAFF_ROLE, += amount;
  STAFF_ADMIN_ROLE getLevel(userId);
];if (newLevel > levels[userId].level) {
    levels[userId].level = newLevel;
const CHATBOX_BUTTON_ID = "staffteam_chatbox";
const CHATBOX_CHANNEL_ID = "1232701768383729790";
  return null;
const formatMembersListInline = (membersArray) =>
  membersArray.length ? membersArray.map(m => `<@${m.id}>`).join(", ") : "*None*";
function saveLevels() {
const generateStaffList = async (guild) => {fy(levels, null, 2));
  await guild.members.fetch();
  let alreadyListed = new Set();      staffMessage = await channel.send({ content: newContent, components: [getStaffMessageRow()] });      await staffMessage.pin();    }  } catch (err) { console.error("Failed to update staff message:", err); }};export {  updateStaffMessage,  ALLOWED_ROLES,  CHATBOX_BUTTON_ID,  CHATBOX_CHANNEL_ID};
  let output = BOT_PREFIX;addXP, saveLevels, levels };  for (const roleName of ROLE_ORDER) {    const roleId = ROLES[roleName];    const emoji = ROLE_EMOJIS[roleName] || "";    const roleMention = `<@&${roleId}>`;    const members = guild.members.cache.filter(      m => m.roles.cache.has(roleId) && !alreadyListed.has(m.id)    );    members.forEach(m => alreadyListed.add(m.id));    const memberList = formatMembersListInline([...members.values()]);    let header = "# ";    if (roleName === "Manager" || roleName === "Security") header = "## ";    if (["Staff","Trainee","Inactive"].includes(roleName)) header = "### ";    output += `${header}${emoji} ${roleMention} (${members.size})\n${memberList}\n\n`;  }  return output;};const getStaffMessageRow = () =>  new ActionRowBuilder().addComponents(    new ButtonBuilder()      .setCustomId(CHATBOX_BUTTON_ID)      .setLabel("Open Staff Chatbox")      .setStyle(ButtonStyle.Primary)      .setEmoji("💬")  );const updateStaffMessage = async (guild) => {  try {    const channel = await guild.channels.fetch(CHANNEL_ID);    let messages = await channel.messages.fetch({ limit: 50 });    let staffMessage = messages.find(msg => msg.author.id === guild.client.user.id && msg.content.startsWith(BOT_PREFIX));    const newContent = await generateStaffList(guild);    if (staffMessage) {      await staffMessage.edit({ content: newContent, components: [getStaffMessageRow()] });    } else {