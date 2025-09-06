const fs = require("fs");
const CONFIG_FILE = "./config/botConfig.json";

let config = { snipingWhitelist: [], moderatorRoles: [], warnings: {} };

if (fs.existsSync(CONFIG_FILE)) {
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE)); } 
  catch { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
}

const saveConfig = () => fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

module.exports = { config, saveConfig };
