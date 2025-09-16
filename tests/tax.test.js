const { computeTaxForDeposit, getBaseLimit } = require('../src/utils/bank');

// Basic tax progression validation

describe('Progressive tax bands', () => {
	test('no tax below base limit', () => {
		const L = getBaseLimit();
		const tax = computeTaxForDeposit(0, L - 1, L);
		expect(tax).toBe(0);
	});

	test('increasing tax in second band', () => {
		const L = getBaseLimit();
		const mid = Math.floor(L / 2);
		const taxLow = computeTaxForDeposit(L, 1, L);
		const taxHigher = computeTaxForDeposit(L, mid, L);
		expect(taxHigher).toBeGreaterThanOrEqual(taxLow);
	});

	test('heavy tax far above 4L', () => {
		const L = getBaseLimit();
		const start = 5 * L; // already above hard band
		const dep = L; // additional deposit
		const tax = computeTaxForDeposit(start, dep, L);
		// At 400% marginal, approximate floor
		expect(tax).toBeGreaterThanOrEqual(dep * 3); // allow some lower due to averaging across bands
	});
});
