import fs from "fs";
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
  testingMode: false
};

// Load config and merge with defaults
let config = { ...defaultConfig };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE));
    // Merge loaded config with defaults, filling in missing keys
    config = { ...defaultConfig, ...loaded };
    // Deep merge for nested objects like escalation
    if (loaded.escalation) {
      config.escalation = { ...defaultConfig.escalation, ...loaded.escalation };
    }
  } catch {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Save config function
const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

export { config, saveConfig };
