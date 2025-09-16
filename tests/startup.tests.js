const fs = require('fs');
const path = require('path');

describe('startupTests', () => {
	const projectRoot = path.resolve(process.cwd());
	const SUMMARY = path.join(projectRoot, 'config', 'startup-summary.json');
	beforeAll(() => {
		try {
			if (fs.existsSync(SUMMARY)) fs.unlinkSync(SUMMARY);
		} catch {}
	});
	test('runStartupTests returns object and writes summary', async () => {
		const { runStartupTests } = require('../src/utils/startupTests');
		const fakeClient = { isReady: () => true };
		const res = await runStartupTests(fakeClient);
		expect(res).toBeTruthy();
		expect(typeof res.ok === 'boolean').toBe(true);
		expect(Array.isArray(res.checks)).toBe(true);
		// summary file written
		const written = fs.existsSync(SUMMARY);
		expect(written).toBe(true);
		const parsed = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
		expect(parsed).toHaveProperty('ts');
	});
});
