// Global mention sanitization utility (wrap outbound content before send when in testing or forced safe mode)
function sanitizeMentions(content, { codeWrap = true } = {}) {
	if (!content || typeof content !== 'string') return content;
	return content.replace(/<@&?\d+>/g, m => codeWrap ? `\`${m}\`` : m);
}
module.exports = { sanitizeMentions };
