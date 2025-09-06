const { ROLES, ROLE_ORDER, ROLE_EMOJIS, CHANNEL_ID } = require("../config/roles");

const BOT_PREFIX = "**🌙 Late Night Hours Staff Team**\n\n";

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

const updateStaffMessage = async (guild) => {
  try {
    const channel = await guild.channels.fetch(CHANNEL_ID);
    let messages = await channel.messages.fetch({ limit: 50 });
    let staffMessage = messages.find(msg => msg.author.id === guild.client.user.id && msg.content.startsWith(BOT_PREFIX));
    const newContent = await generateStaffList(guild);

    if (staffMessage) await staffMessage.edit(newContent);
    else {
      staffMessage = await channel.send(newContent);
      await staffMessage.pin();
    }
  } catch (err) { console.error("Failed to update staff message:", err); }
};

module.exports = { updateStaffMessage };
