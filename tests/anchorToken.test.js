const { generateToken, encodeInvisible, findTokenInText } = require('../src/utils/anchorToken');

test('generateToken returns a short string and encode/decode roundtrip works', () => {
	const tid = generateToken('ev-test-123');
	expect(typeof tid).toBe('string');
	expect(tid.length).toBeGreaterThan(0);
	const enc = encodeInvisible(tid);
	expect(typeof enc).toBe('string');
	// encoded should not contain visible ascii letters except maybe, but findTokenInText should return the original
	const found = findTokenInText('some content ' + enc + ' tail');
	expect(found).toBe(tid);
});
