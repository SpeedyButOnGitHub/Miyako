const { ButtonStyle } = require("discord.js");
const { config } = require("../../utils/storage");

// Keep same file path semantics as legacy implementation
const ACTIVE_MENUS_FILE = "./config/activeMenus.json";

// Category/setting registry used by UI builders and handlers
const configCategories = {
  Sniping: {
    description: "Settings for sniping commands.",
    settings: {
      ChannelList: {
        description: () =>
          config.snipeMode === "blacklist"
            ? "Channels where snipes are **not** allowed."
            : "Channels where snipes are allowed.",
        getDisplay: () => {
          if (config.snipeMode === "whitelist") {
            return config.snipingWhitelist && config.snipingWhitelist.length
              ? config.snipingWhitelist.map(id => `<#${id}>`).join("\n")
              : "*None*";
          } else {
            return config.snipingChannelList && config.snipingChannelList.length
              ? config.snipingChannelList.map(id => `<#${id}>`).join("\n")
              : "*None*";
          }
        },
        getLabel: () => 'Channels',
        getSummary: () => {
          const count = config.snipeMode === 'whitelist'
            ? (config.snipingWhitelist?.length || 0)
            : (config.snipingChannelList?.length || 0);
          return `${count}`;
        },
        buttons: [
          { id: "addChannel", label: "Add Channel", style: ButtonStyle.Success, emoji: "➕" },
          { id: "removeChannel", label: "Remove Channel", style: ButtonStyle.Danger, emoji: "➖" }
        ]
      }
    }
  },
  Moderation: {
    description: "Settings for moderation commands.",
    settings: {
      ModeratorRoles: {
        description: "Roles allowed to use moderation commands.",
        getDisplay: () =>
          config.moderatorRoles.length
            ? config.moderatorRoles.map(id => `<@&${id}>`).join("\n")
            : "*None*",
        getLabel: () => "Moderator Roles",
        getSummary: () => {
          const n = config.moderatorRoles?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addRole", label: "Add Role", style: ButtonStyle.Success, emoji: "🛡️" },
          { id: "removeRole", label: "Remove Role", style: ButtonStyle.Danger, emoji: "🧹" }
        ]
      },
      RoleLogBlacklist: {
        description: "Roles that will NOT be logged in role logs.",
        getDisplay: () =>
          (config.roleLogBlacklist && config.roleLogBlacklist.length)
            ? config.roleLogBlacklist.map(id => `<@&${id}>`).join("\n")
            : "*None*",
        getLabel: () => "Role Log Blacklist",
        getSummary: () => {
          const n = config.roleLogBlacklist?.length || 0;
          return `${n}`;
        },
        buttons: [
          { id: "addBlacklistRole", label: "Add Role", style: ButtonStyle.Success, emoji: "➕" },
          { id: "removeBlacklistRole", label: "Remove Role", style: ButtonStyle.Danger, emoji: "➖" }
        ]
      }
    }
  },
  Leveling: {
    description: "Settings for the leveling system.",
    settings: {
      LevelingChannels: {
        description: () =>
          config.levelingMode === "blacklist"
            ? "Channels where leveling XP is NOT awarded."
            : "Channels where leveling XP is awarded.",
        getDisplay: () => {
          const list = config.levelingChannelList || [];
          return list.length ? list.map(id => `<#${id}>`).join("\n") : "*None*";
        },
        getLabel: () => 'Channels',
        getSummary: () => `${config.levelingChannelList?.length || 0}`,
        buttons: [
          { id: "addChannel", label: "Add Channel", style: ButtonStyle.Success, emoji: "➕" },
          { id: "removeChannel", label: "Remove Channel", style: ButtonStyle.Danger, emoji: "➖" }
        ]
      },
      RoleXPBlacklist: {
        description: "Members with these roles will not gain XP.",
        getDisplay: () => (config.roleXPBlacklist && config.roleXPBlacklist.length)
          ? config.roleXPBlacklist.map(id => `<@&${id}>`).join("\n")
          : "*None*",
        getLabel: () => "Blocked Roles",
        getSummary: () => `${config.roleXPBlacklist?.length || 0}`,
        buttons: [
          { id: "addRole", label: "Add Roles", style: ButtonStyle.Success, emoji: "➕" },
          { id: "removeRole", label: "Remove Roles", style: ButtonStyle.Danger, emoji: "➖" }
        ]
      },
      GlobalXPMultiplier: {
        description: () => `Set a global XP multiplier applied to all XP gains. Current: **x${(config.globalXPMultiplier ?? 1).toFixed(2)}**`,
        getDisplay: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          const badge = mult > 1 ? "🔥 Boost Active" : (mult === 1 ? "➖ Normal" : "🧪 Custom");
          return `Multiplier: **x${mult.toFixed(2)}**  •  ${badge}`;
        },
        getLabel: () => "XP Multiplier",
        getSummary: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          return `x${mult.toFixed(2)}`;
        },
        buttons: [
          { id: "set", label: "Set Multiplier", style: ButtonStyle.Primary, emoji: "🧮" },
          { id: "reset", label: "Reset to 1x", style: ButtonStyle.Secondary, emoji: "♻️" }
        ]
      },
      LevelRewards: {
        description: "Configure roles automatically granted at levels. Supports multiple roles per level.",
        getDisplay: () => {
          const entries = Object.entries(config.levelRewards || {});
          if (!entries.length) return "*None*";
          entries.sort((a,b) => Number(a[0]) - Number(b[0]));
          return entries.map(([lvl, roleIds]) => {
            const list = (Array.isArray(roleIds) ? roleIds : [roleIds]).map(id => `<@&${id}>`).join(", ");
            return `Lvl ${lvl} → ${list}`;
          }).join("\n");
        },
        getLabel: () => "Level Rewards",
        getSummary: () => {
          const levels = Object.keys(config.levelRewards || {}).length;
          return `${levels} tier${levels === 1 ? '' : 's'}`;
        },
        buttons: [
          { id: "addLevel", label: "Add Level", style: ButtonStyle.Success, emoji: "➕" },
          { id: "addReward", label: "Add Rewards", style: ButtonStyle.Success, emoji: "🎁" },
          { id: "removeReward", label: "Remove Rewards", style: ButtonStyle.Danger, emoji: "🧹" },
          { id: "removeLevel", label: "Remove Level", style: ButtonStyle.Danger, emoji: "🗑️" }
        ]
      },
      VCLevelRewards: {
        description: "Configure roles granted at VC levels (voice leveling). Separate from text chat rewards.",
        getDisplay: () => {
          const entries = Object.entries(config.vcLevelRewards || {});
          if (!entries.length) return "*None*";
          entries.sort((a,b) => Number(a[0]) - Number(b[0]));
          return entries.map(([lvl, roleIds]) => {
            const list = (Array.isArray(roleIds) ? roleIds : [roleIds]).map(id => `<@&${id}>`).join(", ");
            return `Lvl ${lvl} → ${list}`;
          }).join("\n");
        },
        getLabel: () => "VC Level Rewards",
        getSummary: () => {
          const levels = Object.keys(config.vcLevelRewards || {}).length;
          return `${levels} tier${levels === 1 ? '' : 's'}`;
        },
        buttons: [
          { id: "addLevel", label: "Add Level", style: ButtonStyle.Success, emoji: "➕" },
          { id: "addReward", label: "Add Rewards", style: ButtonStyle.Success, emoji: "🎁" },
          { id: "removeReward", label: "Remove Rewards", style: ButtonStyle.Danger, emoji: "🧹" },
          { id: "removeLevel", label: "Remove Level", style: ButtonStyle.Danger, emoji: "🗑️" }
        ]
      }
    }
  },
  Testing: {
    description: "Owner-only testing utilities.",
    settings: {
      TestingMode: {
        description: () => `Toggle testing mode. When enabled, certain logs route to a test channel and the warnings UI can use seeded data. Currently: **${config.testingMode ? "Enabled" : "Disabled"}**`,
        getDisplay: () => (config.testingMode ? "Enabled" : "Disabled"),
        getLabel: () => "Testing Mode",
        getSummary: () => (config.testingMode ? "On" : "Off"),
        buttons: [
          { id: "enable", label: "Enable", style: ButtonStyle.Success, emoji: "✅" },
          { id: "disable", label: "Disable", style: ButtonStyle.Danger, emoji: "🛑" }
        ]
      },
      TestingWarnings: {
        description: () => {
          const explicitUsers = Object.keys(config.testingWarnings || {}).length;
          const seededUsers = Object.keys(config.testingSeed || {}).length;
          return `Manage testing warnings used by the .warnings UI. Explicit: ${explicitUsers}, Seeded: ${seededUsers}.`;
        },
        getDisplay: () => {
          const explicitUsers = Object.keys(config.testingWarnings || {}).length;
          const seededUsers = Object.keys(config.testingSeed || {}).length;
          return `Explicit users: ${explicitUsers}\nSeeded users: ${seededUsers}`;
        },
        getLabel: () => "Testing Warnings",
        getSummary: () => {
          const explicitUsers = Object.keys(config.testingWarnings || {}).length;
          const seededUsers = Object.keys(config.testingSeed || {}).length;
          return `${explicitUsers} explicit • ${seededUsers} seeded`;
        },
        buttons: [
          { id: "reseed", label: "Reseed", style: ButtonStyle.Primary, emoji: "🌱" },
          { id: "clear", label: "Clear", style: ButtonStyle.Secondary, emoji: "🧹" }
        ]
      }
    }
  }
};

module.exports = { ACTIVE_MENUS_FILE, configCategories };
