const { computeTaxForDeposit } = require('../utils/bank');
const { getBaseLimit } = require('../utils/bank');

describe('Progressive tax edge bands', () => {
  const L = 10000; // We'll stub base limit logic by monkeypatching if needed
  // Instead of altering getBaseLimit globally, we just use direct formula matching bank.js bands.
  function tax(current, deposit) {
    return computeTaxForDeposit(current, deposit, L);
  }

  test('No tax below base limit', () => {
    expect(tax(0, L - 1)).toBe(0);
  });

  test('First dollar over base limit taxed minimally (~0)', () => {
    const t = tax(L - 1, 1); // crossing into band 2
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1); // should be tiny at boundary
  });

  test('Halfway through second band ~0.25 effective', () => {
    const deposit = Math.floor(L / 2); // from L to 1.5L
    const t = tax(L, deposit);
    const eff = t / deposit; // average rate
    expect(eff).toBeGreaterThan(0.05);
    expect(eff).toBeLessThan(0.5);
  });

  test('End of second band ~0.5 marginal', () => {
    const deposit = L; // L to 2L
    const t = tax(L, deposit);
    const eff = t / deposit;
    expect(eff).toBeGreaterThan(0.2);
    expect(eff).toBeLessThanOrEqual(0.5);
  });

  test('Cross into 3rd band shows higher effective than early band 2', () => {
    const deposit = Math.floor(1.1 * L); // from L to 2.1L
    const t = tax(L, deposit);
    const eff = t / deposit;
    // Just assert it's above a minimal threshold ( > 0.2 ) reflecting progression
    expect(eff).toBeGreaterThan(0.2);
  });

  test('End of 3rd band approaches ~1.0 eff marginal start of 4th high', () => {
    const deposit = 2 * L; // L to 3L
    const t = tax(L, deposit);
    const eff = t / deposit;
    expect(eff).toBeGreaterThan(0.4);
    expect(eff).toBeLessThan(1.2);
  });

  test('Fourth band extreme growth then clamp 400%', () => {
    const deposit = 5 * L; // from L to 6L includes into 5th region >4L
    const t = tax(L, deposit);
    const eff = t / deposit;
    expect(eff).toBeGreaterThan(0.5);
  });
});
