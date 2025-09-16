const fs = require('fs');
const path = require('path');

describe('MIYAKO_RUNTIME_DIR guard', () => {
	test('writes go to MIYAKO_RUNTIME_DIR when set', () => {
		const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'miyako-test-'));
		process.env.MIYAKO_RUNTIME_DIR = tmp;
		const p = require('../src/utils/paths').dataPath('guard-test.json');
		try {
			fs.writeFileSync(p, 'ok');
			const inRepo = path.join(process.cwd(), 'data', 'guard-test.json');
			expect(fs.existsSync(p)).toBe(true);
			expect(fs.existsSync(inRepo)).toBe(false);
		} finally {
			try {
				fs.unlinkSync(p);
			} catch {}
			try {
				fs.rmdirSync(tmp);
			} catch {}
			delete process.env.MIYAKO_RUNTIME_DIR;
		}
	});
});
