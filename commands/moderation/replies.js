const { Message, BaseInteraction } = require("discord.js");
const { config } = require("../../utils/storage");

function replySuccess(context, content) {
  if (context && typeof context.reply === "function" && context.constructor.name === "Message") {
    return context.reply(`${EMOJI_SUCCESS} ${content}`);
  } else if (context && typeof context.reply === "function" && typeof context.isRepliable === "function" && context.isRepliable()) {
    if (context.replied || context.deferred) {
      return context.followUp({ content: `${EMOJI_SUCCESS} ${content}`, ephemeral: true });
    } else {
      return context.reply({ content: `${EMOJI_SUCCESS} ${content}`, ephemeral: true });
    }
  }
}

function replyError(context, content) {
  if (context && typeof context.reply === "function" && context.constructor.name === "Message") {
    const msg = await context.reply(`${EMOJI_ERROR} ${content}`);
    // Only auto-delete if NOT in testing mode
    if (!config.testingMode) {
      setTimeout(() => {
        context.delete().catch(() => {});
        msg.delete().catch(() => {});
      }, 5000);
    }
  } else if (
    context &&
    typeof context.reply === "function" &&
    typeof context.isRepliable === "function" &&
    context.isRepliable()
  ) {
    // If already replied or deferred, use followUp
    if (context.replied || context.deferred) {
      await context.followUp({ content: `${EMOJI_ERROR} ${content}`, ephemeral: true });
    } else {
      await context.reply({ content: `${EMOJI_ERROR} ${content}`, ephemeral: true });
    }
  }
}

const EMOJI_SUCCESS = "✅";
const EMOJI_ERROR = "❌";

module.exports = {
  replySuccess,
  replyError,
  EMOJI_SUCCESS,
  EMOJI_ERROR
};