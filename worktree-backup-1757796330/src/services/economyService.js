// Economy service: centralized access + future caching/batching
const bank = require('../utils/bank');
const cash = require('../utils/cash');

function getUserBalances(userId) {
	return {
		cash: cash.getCash(userId),
		bank: bank.getBank(userId)
	};
}

function deposit(userId, amount, opts) {
	return bank.depositToBank(userId, amount, opts);
}

function withdraw(userId, amount) {
	return bank.withdrawFromBank(userId, amount);
}

module.exports = {
	getUserBalances,
	deposit,
	withdraw,
	// expose underlying for advanced use
	bank,
	cash
};
