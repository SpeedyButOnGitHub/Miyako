const { Message, BaseInteraction } = require("discord.js");
const { config } = require("../../utils/storage");

const EMOJI_SUCCESS = "<a:kyoukoThumbsUp:1413767126547828757>";
const EMOJI_ERROR = "<:VRLSad:1413770577080094802>";

function replySuccess(target, text) {
  if (target instanceof Message || target instanceof BaseInteraction) {
    return target.reply(`${EMOJI_SUCCESS} ${text}`);
  }
  return `${EMOJI_SUCCESS} ${text}`;
}

function replyError(target, text) {
  if (target instanceof Message || target instanceof BaseInteraction) {
    return target.reply(`${EMOJI_ERROR} ${text}`);
  }
  return `${EMOJI_ERROR} ${text}`;
}

module.exports = {
  replySuccess,
  replyError,
  EMOJI_SUCCESS,
  EMOJI_ERROR
};