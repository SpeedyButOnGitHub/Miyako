const { Message, BaseInteraction } = require('discord.js');
const theme = require('../../utils/theme');

// Centralize via theme; retain exported constants for downstream compatibility
const EMOJI_SUCCESS = theme.emojis.success;
const EMOJI_ERROR = theme.emojis.error || '❌';

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

module.exports = { replySuccess, replyError, EMOJI_SUCCESS, EMOJI_ERROR };
