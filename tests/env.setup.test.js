const fs = require('fs');
const path = require('path');

test('MIYAKO_RUNTIME_DIR is set and points to an existing directory', () => {
  const dir = process.env.MIYAKO_RUNTIME_DIR || global.__MIYAKO_TEST_RUNTIME_DIR;
  expect(dir).toBeDefined();
  // it should be an absolute path
  expect(path.isAbsolute(dir)).toBe(true);
  // directory should exist
  expect(fs.existsSync(dir)).toBe(true);
});
