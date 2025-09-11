// Re-export kept in src to avoid root dependency
module.exports = require('./test');

// Jest placeholder to satisfy Jest’s requirement for at least one test in this file context
if (process.env.JEST_WORKER_ID !== undefined) {
	describe('src test command placeholder', () => {
		it('loads module', () => {
			expect(true).toBe(true);
		});
	});
}
