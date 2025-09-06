const Discord = require("discord.js");
const EMOJI_SUCCESS = "<a:kyoukoThumbsUp:1413767126547828757>";
const EMOJI_ERROR = "<:VRLSad:1413770577080094802>";

async function replySuccess(context, content) {
  if (context instanceof Discord.Message) {
    return context.reply(`${EMOJI_SUCCESS} ${content}`);
  } else if (context instanceof Discord.Interaction && context.isRepliable()) {
    return context.reply({ content: `${EMOJI_SUCCESS} ${content}`, ephemeral: true });
  }
}

async function replyError(context, content) {
  if (context instanceof Discord.Message) {
    const msg = await context.reply(`${EMOJI_ERROR} ${content}`);
    setTimeout(() => {
      context.delete().catch(() => {});
      msg.delete().catch(() => {});
    }, 5000);
  } else if (context instanceof Discord.Interaction && context.isRepliable()) {
    await context.reply({ content: `${EMOJI_ERROR} ${content}`, ephemeral: true });
  }
}

module.exports = { replySuccess, replyError, EMOJI_SUCCESS, EMOJI_ERROR };