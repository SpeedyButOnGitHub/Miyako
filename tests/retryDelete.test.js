const { retry } = require('../src/utils/retry');
const logger = require('../src/utils/logger');

// Simple in-process mock that fails first two times then succeeds
test('retry helper retries failing delete and eventually succeeds', async () => {
	let calls = 0;
	const mock = async () => {
		calls++;
		if (calls < 3) throw new Error('temporary');
		return 'ok';
	};
	const res = await retry(mock, { attempts: 4, baseMs: 1, maxMs: 10 });
	expect(res).toBe('ok');
	expect(calls).toBe(3);
});
