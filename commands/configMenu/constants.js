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
          { id: "addChannel", label: "Add", style: ButtonStyle.Secondary, emoji: "#️⃣" },
          { id: "removeChannel", label: "Remove", style: ButtonStyle.Secondary, emoji: "🚫" }
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
          { id: "addRole", label: "Add", style: ButtonStyle.Secondary, emoji: "🛡️" },
          { id: "removeRole", label: "Remove", style: ButtonStyle.Secondary, emoji: "🧹" }
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
          { id: "addBlacklistRole", label: "Add", style: ButtonStyle.Secondary, emoji: "➕" },
          { id: "removeBlacklistRole", label: "Remove", style: ButtonStyle.Secondary, emoji: "🚫" }
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
          { id: "addChannel", label: "Add", style: ButtonStyle.Secondary, emoji: "#️⃣" },
          { id: "removeChannel", label: "Remove", style: ButtonStyle.Secondary, emoji: "🚫" }
        ]
      },
      RoleXPBlacklist: {
        description: "Members with these roles will not gain XP.",
        getDisplay: () => (config.roleXPBlacklist && config.roleXPBlacklist.length)
          ? config.roleXPBlacklist.map(id => `<@&${id}>`).join("\n")
          : "*None*",
        getLabel: () => "roles",
        getSummary: () => `${config.roleXPBlacklist?.length || 0}`,
        buttons: [
          { id: "addRole", label: "Add", style: ButtonStyle.Secondary, emoji: "🚫" },
          { id: "removeRole", label: "Remove", style: ButtonStyle.Secondary, emoji: "🧹" }
        ]
      },
      GlobalXPMultiplier: {
        description: () => `Set a global XP multiplier applied to all XP gains. Current: **x${(config.globalXPMultiplier ?? 1).toFixed(2)}**`,
        getDisplay: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          const badge = mult > 1 ? "🔥 Boost Active" : (mult === 1 ? "➖ Normal" : "🧪 Custom");
          return `Multiplier: **x${mult.toFixed(2)}**  •  ${badge}`;
        },
        getLabel: () => "xp",
        getSummary: () => {
          const mult = typeof config.globalXPMultiplier === 'number' ? config.globalXPMultiplier : 1;
          return `x${mult.toFixed(2)}`;
        },
        buttons: [
          { id: "set", label: "Set", style: ButtonStyle.Secondary, emoji: "📈" },
          { id: "reset", label: "Reset", style: ButtonStyle.Secondary, emoji: "🔄" }
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
        getLabel: () => "rewards",
        getSummary: () => {
          const levels = Object.keys(config.levelRewards || {}).length;
          return `${levels} tier${levels === 1 ? '' : 's'}`;
        },
        buttons: [
          { id: "addLevel", label: "Add Lvl", style: ButtonStyle.Secondary, emoji: "🏆" },
          { id: "addReward", label: "Add", style: ButtonStyle.Secondary, emoji: "🎁" },
          { id: "removeReward", label: "Rm Rwd", style: ButtonStyle.Secondary, emoji: "✖️" },
          { id: "removeLevel", label: "Rm Lvl", style: ButtonStyle.Secondary, emoji: "🗑️" }
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
        getLabel: () => "vc rewards",
        getSummary: () => {
          const levels = Object.keys(config.vcLevelRewards || {}).length;
          return `${levels} tier${levels === 1 ? '' : 's'}`;
        },
        buttons: [
          { id: "addLevel", label: "Add Lvl", style: ButtonStyle.Secondary, emoji: "🎙️" },
          { id: "addReward", label: "Add", style: ButtonStyle.Secondary, emoji: "🔊" },
          { id: "removeReward", label: "Rm Rwd", style: ButtonStyle.Secondary, emoji: "✖️" },
          { id: "removeLevel", label: "Rm Lvl", style: ButtonStyle.Secondary, emoji: "🗑️" }
        ]
      }
    }
  },
  Economy: {
    description: "Economy and cash drops settings.",
    settings: {
      CashDrops: {
        description: () => {
          const e = config.cashDrops || {};
          const chance = (e.dropChance ?? 0.02) * 100;
          const min = e.minAmount ?? 25;
          const max = e.maxAmount ?? 125;
          const life = Math.floor((e.lifetimeMs ?? 60000) / 1000);
          return `Random cash drops during active chat. Chance: ${chance.toFixed(1)}% per message, Amount: ${min}-${max}, Lifetime: ${life}s.`;
        },
        getDisplay: () => {
          const e = config.cashDrops || {};
          return [
            `Chance per message: ${(Math.max(0, Math.min(1, e.dropChance ?? 0.02)) * 100).toFixed(2)}%`,
            `Amount range: ${e.minAmount ?? 25} - ${e.maxAmount ?? 125}`,
            `Lifetime: ${Math.floor((e.lifetimeMs ?? 60000) / 1000)}s`,
          ].join("\n");
        },
        getLabel: () => "Cash Drops",
        getSummary: () => {
          const e = config.cashDrops || {};
          const chance = (e.dropChance ?? 0.02) * 100;
          return `${chance.toFixed(1)}%`;
        },
        buttons: [
          { id: "setChance", label: "Chance", style: ButtonStyle.Secondary, emoji: "🎲" },
          { id: "setAmount", label: "Amounts", style: ButtonStyle.Secondary, emoji: "💰" },
          { id: "setLifetime", label: "Lifetime", style: ButtonStyle.Secondary, emoji: "⏱️" },
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
          { id: "enable", label: "Enable", style: ButtonStyle.Secondary, emoji: "✅" },
          { id: "disable", label: "Disable", style: ButtonStyle.Secondary, emoji: "🛑" }
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
          { id: "reseed", label: "Reseed", style: ButtonStyle.Secondary, emoji: "🌱" },
          { id: "clear", label: "Clear", style: ButtonStyle.Secondary, emoji: "🧹" }
        ]
      }
    }
  }
};

module.exports = { ACTIVE_MENUS_FILE, configCategories };
