const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.resolve("./config/botConfig.json");

// Default configuration
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
  levelRewards: {},
  // Leveling message gating
  levelingMode: "blacklist", // 'whitelist' or 'blacklist'
  levelingChannelList: [],
  // Leveling role gating and multiplier
  roleXPBlacklist: [],
  globalXPMultiplier: 1.0
};

<<<<<<< HEAD
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
  // Leveling gating
  if (!["whitelist", "blacklist"].includes(cfg.levelingMode)) cfg.levelingMode = "blacklist";
  if (!Array.isArray(cfg.levelingChannelList)) cfg.levelingChannelList = [];
  // Leveling role blacklist and multiplier
  if (!Array.isArray(cfg.roleXPBlacklist)) cfg.roleXPBlacklist = [];
  if (typeof cfg.globalXPMultiplier !== "number" || !Number.isFinite(cfg.globalXPMultiplier)) cfg.globalXPMultiplier = 1.0;
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
=======
function ensureDir() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function validateAndFix(cfg) {
  const c = { ...defaultConfig, ...(cfg || {}) };

  c.snipingWhitelist = asArray(c.snipingWhitelist).map(String);
  c.moderatorRoles = asArray(c.moderatorRoles).map(String);
  c.roleLogBlacklist = asArray(c.roleLogBlacklist).map(String);
  c.snipingChannelList = asArray(c.snipingChannelList).map(String);
  if (typeof c.warnings !== "object" || c.warnings === null) c.warnings = {};

  if (typeof c.escalation !== "object" || c.escalation === null) c.escalation = { ...defaultConfig.escalation };
  c.escalation.muteThreshold = Number.isFinite(c.escalation.muteThreshold) ? c.escalation.muteThreshold : defaultConfig.escalation.muteThreshold;
  c.escalation.muteDuration = Number.isFinite(c.escalation.muteDuration) ? c.escalation.muteDuration : defaultConfig.escalation.muteDuration;
  c.escalation.kickThreshold = Number.isFinite(c.escalation.kickThreshold) ? c.escalation.kickThreshold : defaultConfig.escalation.kickThreshold;

  if (!Number.isFinite(c.defaultMuteDuration)) c.defaultMuteDuration = defaultConfig.defaultMuteDuration;
  if (typeof c.modLogChannelId !== "string") c.modLogChannelId = defaultConfig.modLogChannelId;
  if (typeof c.testingMode !== "boolean") c.testingMode = defaultConfig.testingMode;
  if (!['whitelist','blacklist'].includes(c.snipeMode)) c.snipeMode = defaultConfig.snipeMode;

  return c;
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
}

let config = { ...defaultConfig };
<<<<<<< HEAD
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
=======
try {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    config = validateAndFix(parsed);
  } else {
    config = validateAndFix(defaultConfig);
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
} catch (err) {
  console.error("[Config] Failed to read config, using defaults:", err);
  config = { ...defaultConfig };
}

const saveConfig = () => {
  try {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(validateAndFix(config), null, 2));
  } catch (err) {
    console.error("[Config] Failed to save config:", err);
  }
};

module.exports = { config, saveConfig };
