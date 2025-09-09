// Auto-convert deprecated { ephemeral: true } interaction response options to { flags: 64 }.
// Centralizes migration so we don't have to manually change every call site immediately.
// Safe to include multiple times (idempotent).
const { Interaction } = require('discord.js');
const EPHEMERAL_FLAG = 1 << 6; // 64

function convert(opts) {
  if (!opts || typeof opts !== 'object') return opts;
  if (Object.prototype.hasOwnProperty.call(opts, 'ephemeral')) {
    // If ephemeral true -> ensure flags includes 64. If false just remove field.
    if (opts.ephemeral) {
      if (opts.flags == null) opts.flags = EPHEMERAL_FLAG; else opts.flags |= EPHEMERAL_FLAG;
    }
    delete opts.ephemeral;
  }
  return opts;
}

function wrapMethod(proto, name) {
  if (typeof proto[name] !== 'function') return;
  const orig = proto[name];
  if (orig.__ephemeralWrapped) return; // already wrapped
  proto[name] = function(...args) {
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      args[0] = convert(args[0]);
    }
    return orig.apply(this, args);
  };
  proto[name].__ephemeralWrapped = true;
}

try {
  wrapMethod(Interaction.prototype, 'reply');
  wrapMethod(Interaction.prototype, 'followUp');
  wrapMethod(Interaction.prototype, 'editReply');
  wrapMethod(Interaction.prototype, 'deferReply');
  wrapMethod(Interaction.prototype, 'deferUpdate');
} catch {/* ignore */}

module.exports = { EPHEMERAL_FLAG };
