// Startup configuration validation utility
// Scans botConfig and reports potential issues (missing channels/roles, invalid modes, thresholds)

const { config } = require('./storage');

function validateConfig(guild) {
  const issues = [];
  if (!guild) {
    issues.push('Guild not available during validation.');
    return issues;
  }
  // Channels
  const channelIds = [config.modLogChannelId, ...(config.levelingChannelList||[]), ...(config.snipingChannelList||[])];
  for (const id of channelIds) {
    if (!id) continue;
    if (!guild.channels.cache.has(id)) issues.push(`Missing channel: ${id}`);
  }
  // Roles sets
  for (const rid of config.moderatorRoles || []) {
    if (!guild.roles.cache.has(rid)) issues.push(`Missing moderator role: ${rid}`);
  }
  // Level rewards shape
  if (config.levelRewards && typeof config.levelRewards === 'object') {
    for (const [lvl, roleIds] of Object.entries(config.levelRewards)) {
      const arr = Array.isArray(roleIds) ? roleIds : (roleIds ? [roleIds] : []);
      for (const rid of arr) {
        if (!guild.roles.cache.has(rid)) issues.push(`Level reward role missing (level ${lvl} -> ${rid})`);
      }
    }
  }
  // Modes
  const snipeModes = ['whitelist','blacklist'];
  if (config.snipeMode && !snipeModes.includes(config.snipeMode)) issues.push(`Invalid snipeMode: ${config.snipeMode}`);
  const levelingModes = ['whitelist','blacklist'];
  if (config.levelingMode && !levelingModes.includes(config.levelingMode)) issues.push(`Invalid levelingMode: ${config.levelingMode}`);
  // Escalation thresholds
  if (config.escalation && config.escalation.kickThreshold && config.escalation.kickThreshold <= 0) {
    issues.push('Escalation kickThreshold must be > 0');
  }
  return issues;
}

module.exports = { validateConfig };
