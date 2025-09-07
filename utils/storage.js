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
  snipingChannelList: []
};

function validateConfig(cfg) {
  if (!Array.isArray(cfg.snipingWhitelist)) cfg.snipingWhitelist = [];
  if (!Array.isArray(cfg.moderatorRoles)) cfg.moderatorRoles = [];
  if (typeof cfg.warnings !== "object" || cfg.warnings === null) cfg.warnings = {};
  if (typeof cfg.escalation !== "object" || cfg.escalation === null) cfg.escalation = { ...defaultConfig.escalation };
  // Validate escalation subkeys
  if (typeof cfg.escalation.muteThreshold !== "number") cfg.escalation.muteThreshold = defaultConfig.escalation.muteThreshold;
  if (typeof cfg.escalation.muteDuration !== "number") cfg.escalation.muteDuration = defaultConfig.escalation.muteDuration;
  if (typeof cfg.escalation.kickThreshold !== "number") cfg.escalation.kickThreshold = defaultConfig.escalation.kickThreshold;
  if (typeof cfg.escalation.defaultMuteDuration !== "number") cfg.escalation.defaultMuteDuration = defaultConfig.defaultMuteDuration;
  if (typeof cfg.escalation.modLogChannelId !== "string") cfg.escalation.modLogChannelId = defaultConfig.modLogChannelId;
  if (typeof cfg.escalation.testingMode !== "boolean") cfg.escalation.testingMode = false;
  if (!Array.isArray(cfg.escalation.roleLogBlacklist)) cfg.escalation.roleLogBlacklist = [];
  if (!["whitelist", "blacklist"].includes(cfg.escalation.snipeMode)) cfg.escalation.snipeMode = "whitelist";
  if (!Array.isArray(cfg.escalation.snipingChannelList)) cfg.escalation.snipingChannelList = [];
  return cfg;
}

// Load config and merge with defaults
let config = { ...defaultConfig };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE));
    config = validateConfig({ ...defaultConfig, ...loaded });
    if (loaded.escalation) {
      config.escalation = validateConfig({ ...defaultConfig.escalation, ...loaded.escalation });
    }
  } catch {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Save config function
const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

module.exports = {
  config,
  saveConfig
};
};
