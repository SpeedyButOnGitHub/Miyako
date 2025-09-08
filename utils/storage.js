const fs = require("fs");
const CONFIG_FILE = "./config/botConfig.json";

// Define all required default options here
const defaultConfig = {
  snipingWhitelist: [],
  moderatorRoles: [],
  warnings: {},
  escalation: {
    muteThreshold: 2,
    muteDuration: 2 * 60 * 60 * 1000,
    kickThreshold: 3
  },
  defaultMuteDuration: 60 * 60 * 1000,
  modLogChannelId: "1232701768383729791",
  testingMode: false,
  roleLogBlacklist: [],
  snipeMode: "whitelist",
  snipingChannelList: [],
  // Map of level -> roleId
  levelRewards: {}
};

function validateConfig(cfg) {
  if (!Array.isArray(cfg.snipingWhitelist)) cfg.snipingWhitelist = [];
  if (!Array.isArray(cfg.moderatorRoles)) cfg.moderatorRoles = [];
  if (typeof cfg.warnings !== "object" || cfg.warnings === null) cfg.warnings = {};
  if (typeof cfg.escalation !== "object" || cfg.escalation === null) cfg.escalation = { ...defaultConfig.escalation };
  if (typeof cfg.defaultMuteDuration !== "number") cfg.defaultMuteDuration = defaultConfig.defaultMuteDuration;
  if (typeof cfg.modLogChannelId !== "string") cfg.modLogChannelId = defaultConfig.modLogChannelId;
  if (typeof cfg.testingMode !== "boolean") cfg.testingMode = false;
  if (!Array.isArray(cfg.roleLogBlacklist)) cfg.roleLogBlacklist = [];
  if (!["whitelist", "blacklist"].includes(cfg.snipeMode)) cfg.snipeMode = "whitelist";
  if (!Array.isArray(cfg.snipingChannelList)) cfg.snipingChannelList = [];
  if (typeof cfg.levelRewards !== "object" || cfg.levelRewards === null) cfg.levelRewards = {};
  // Sanitize levelRewards: ensure string numeric keys mapping to arrays of role IDs (strings)
  const cleanedRewards = {};
  for (const [lvl, val] of Object.entries(cfg.levelRewards)) {
    const n = Number(lvl);
    if (!Number.isFinite(n) || n <= 0) continue;
    const arr = Array.isArray(val) ? val : (val ? [val] : []);
    const roleIds = arr
      .map(v => (typeof v === "string" ? v : String(v || "")))
      .map(s => s.replace(/[^0-9]/g, ""))
      .filter(s => s.length > 0);
    if (roleIds.length) cleanedRewards[String(n)] = Array.from(new Set(roleIds));
  }
  cfg.levelRewards = cleanedRewards;
  // escalation sub-keys
  if (typeof cfg.escalation.muteThreshold !== "number") cfg.escalation.muteThreshold = defaultConfig.escalation.muteThreshold;
  if (typeof cfg.escalation.muteDuration !== "number") cfg.escalation.muteDuration = defaultConfig.escalation.muteDuration;
  if (typeof cfg.escalation.kickThreshold !== "number") cfg.escalation.kickThreshold = defaultConfig.escalation.kickThreshold;
  return cfg;
}

// Load config and merge with defaults
let config = { ...defaultConfig };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    // Some past corruption placed defaults inside escalation; flatten if necessary
    const cleaned = { ...loaded };
    if (cleaned.escalation && typeof cleaned.escalation === "object") {
      // Remove accidental nested defaults from escalation
      for (const k of ["snipingWhitelist","moderatorRoles","warnings","defaultMuteDuration","modLogChannelId","testingMode","roleLogBlacklist","snipeMode","snipingChannelList"]) {
        if (k in cleaned.escalation) delete cleaned.escalation[k];
      }
    }
    config = validateConfig({ ...defaultConfig, ...cleaned, escalation: { ...defaultConfig.escalation, ...(cleaned.escalation || {}) } });
  } catch (e) {
    // rewrite with defaults if corrupted
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Save config function
const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

module.exports = { config, saveConfig };
