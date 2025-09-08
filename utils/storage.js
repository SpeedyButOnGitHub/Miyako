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
  // Level rewards: { [level]: string[] }
  levelRewards: {},
  // Leveling gating
  levelingMode: "blacklist",
  levelingChannelList: [],
  // Leveling role blacklist and multiplier
  roleXPBlacklist: [],
  globalXPMultiplier: 1.0
};

function ensureDir() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

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
  if (!["whitelist", "blacklist"].includes(cfg.levelingMode)) cfg.levelingMode = "blacklist";
  if (!Array.isArray(cfg.levelingChannelList)) cfg.levelingChannelList = [];
  if (!Array.isArray(cfg.roleXPBlacklist)) cfg.roleXPBlacklist = [];
  if (typeof cfg.globalXPMultiplier !== "number" || !Number.isFinite(cfg.globalXPMultiplier)) cfg.globalXPMultiplier = 1.0;

  // Sanitize levelRewards to { "level": [roleIds] }
  const cleanedRewards = {};
  for (const [lvl, val] of Object.entries(cfg.levelRewards)) {
    const n = Number(lvl);
    if (!Number.isFinite(n) || n <= 0) continue;
    const arr = Array.isArray(val) ? val : (val ? [val] : []);
    const roleIds = arr
      .map(v => (typeof v === "string" ? v : String(v || "")))
      .map(s => s.replace(/[^0-9]/g, ""))
      .filter(Boolean);
    if (roleIds.length) cleanedRewards[String(n)] = Array.from(new Set(roleIds));
  }
  cfg.levelRewards = cleanedRewards;

  // Ensure escalation sub-keys
  if (typeof cfg.escalation.muteThreshold !== "number") cfg.escalation.muteThreshold = defaultConfig.escalation.muteThreshold;
  if (typeof cfg.escalation.muteDuration !== "number") cfg.escalation.muteDuration = defaultConfig.escalation.muteDuration;
  if (typeof cfg.escalation.kickThreshold !== "number") cfg.escalation.kickThreshold = defaultConfig.escalation.kickThreshold;

  return cfg;
}

let config = { ...defaultConfig };

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

    // Some past corruption placed defaults inside escalation; flatten if necessary
    const cleaned = { ...loaded };
    if (cleaned.escalation && typeof cleaned.escalation === "object") {
      for (const k of [
        "snipingWhitelist","moderatorRoles","warnings","defaultMuteDuration",
        "modLogChannelId","testingMode","roleLogBlacklist","snipeMode","snipingChannelList"
      ]) {
        if (k in cleaned.escalation) delete cleaned.escalation[k];
      }
    }

    config = validateConfig({
      ...defaultConfig,
      ...cleaned,
      escalation: { ...defaultConfig.escalation, ...(cleaned.escalation || {}) }
    });
  } else {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    config = { ...defaultConfig };
  }
} catch (err) {
  console.error("[Config] Failed to read/parse config, rewriting defaults:", err?.message || err);
  try {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  } catch {}
  config = { ...defaultConfig };
}

function saveConfig() {
  try {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(validateConfig({ ...config }), null, 2));
  } catch (err) {
    console.error("[Config] Failed to save config:", err?.message || err);
  }
}

module.exports = { config, saveConfig };
