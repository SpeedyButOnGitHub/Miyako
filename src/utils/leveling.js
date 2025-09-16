const { addXP, saveLevels } = require('./levels');
const { addCash } = require('./cash');
const { config } = require('./storage');

const userCooldowns = new Map();
const userModifiers = new Map();

function getUserModifier(userId) {
	const data = userModifiers.get(userId);
	return data && typeof data.modifier === 'number' ? data.modifier : 1.0;
}

// Slightly lower per-message XP to slow overall progression
const XP_MIN = 8;
const XP_MAX = 16;
const MODIFIER_CAP = 2.0;
const MODIFIER_STEP = 0.1;

function getRandomXP() {
	return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

async function handleLeveling(message, LEVEL_ROLES = {}) {
	try {
		if (!message.guild) return; // guild-only leveling
		// Channel gating for leveling
		const chId = message.channel?.id;
		if (!chId) return;
		const mode = config.levelingMode || 'blacklist';
		const list = Array.isArray(config.levelingChannelList) ? config.levelingChannelList : [];
		const inList = list.includes(chId);
		if (mode === 'blacklist' ? inList : !inList) {
			return; // do not award XP here
		}

		const userId = message.author.id;
		const now = Date.now();
		const lastXP = userCooldowns.get(userId) || 0;

		if (now - lastXP < 60 * 1000) return; // cooldown gate

		let modData = userModifiers.get(userId) || { streak: 0, modifier: 1.0, lastMinute: 0 };
		if (modData.lastMinute && now - modData.lastMinute <= 65 * 1000) {
			modData.streak += 1;
			modData.modifier = Math.min(MODIFIER_CAP, 1.0 + modData.streak * MODIFIER_STEP);
		} else {
			modData.streak = 0;
			modData.modifier = 1.0;
		}
		modData.lastMinute = now;
		userModifiers.set(userId, modData);

		// Skip XP if member has a blacklisted role
		const member = await message.guild.members.fetch(userId).catch(() => null);
		if (!member) return;
		const roleBlacklist = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist : [];
		if (roleBlacklist.length && member.roles.cache.some((r) => roleBlacklist.includes(r.id))) {
			return;
		}

		const baseXP = getRandomXP();
		const globalMult =
			typeof config.globalXPMultiplier === 'number' && Number.isFinite(config.globalXPMultiplier)
				? Math.max(0, config.globalXPMultiplier)
				: 1.0;
		const totalXP = Math.floor(baseXP * modData.modifier * globalMult);
		const leveledUp = addXP(userId, totalXP);
		saveLevels();

		userCooldowns.set(userId, now);

		if (leveledUp) {
			const key = String(leveledUp);
			const configured = config.levelRewards ? config.levelRewards[key] : null;
			const rewards = Array.isArray(configured)
				? configured
				: configured
					? [configured]
					: LEVEL_ROLES[leveledUp]
						? [LEVEL_ROLES[leveledUp]]
						: [];
			if (rewards.length && member) {
				for (const roleId of rewards) {
					if (!member.roles.cache.has(roleId)) {
						await member.roles.add(roleId).catch(() => {});
					}
				}
			}
			// Cash reward: base grows per level (expandable rule)
			const cashReward = Math.max(0, Math.floor(50 + leveledUp * 10));
			addCash(userId, cashReward);
			await message
				.reply(
					`🎉 Congrats <@${userId}>, you reached level ${leveledUp}! You earned ${cashReward} Cash.`,
				)
				.catch(() => {});
		}
	} catch (e) {
		// ignore leveling errors
	}
}

module.exports = { handleLeveling, getUserModifier };
