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
  snipingChannelList: []
};

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
}

let config = { ...defaultConfig };
try {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    config = validateAndFix(parsed);
  } else {
    config = validateAndFix(defaultConfig);
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

module.exports = {
  config,
  saveConfig
};
