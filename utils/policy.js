// Declarative permission policies for commands
const { isModerator } = require('../commands/moderation/permissions');
function isOwnerId(id) { return String(id) === String(process.env.OWNER_ID); }
const policies = {
  config: (ctx) => isOwnerId(ctx.author?.id || ctx.user?.id),
  test: (ctx) => isOwnerId(ctx.author?.id || ctx.user?.id),
  purge: (ctx) => isModerator(ctx.member),
  mute: (ctx) => isModerator(ctx.member),
  unmute: (ctx) => isModerator(ctx.member),
  timeout: (ctx) => isModerator(ctx.member),
  untimeout: (ctx) => isModerator(ctx.member),
  ban: (ctx) => isModerator(ctx.member),
  kick: (ctx) => isModerator(ctx.member),
  warn: (ctx) => isModerator(ctx.member),
  removewarn: (ctx) => isModerator(ctx.member)
};
function checkPolicy(command, ctx) {
  const fn = policies[command];
  if (!fn) return true; // permissive by default
  try { return !!fn(ctx); } catch { return false; }
}
module.exports = { checkPolicy };