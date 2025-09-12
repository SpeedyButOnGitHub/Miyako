/**
 * Clock-in embed template structure test
 */
const { buildClockInEmbed } = require('../src/utils/clockinTemplate');

describe('clock-in embed template', () => {
  test('has required fields and placeholders filled', () => {
    const ev = { name: 'Sample Event', __clockIn: { positions: { instance_manager:['u1'], manager:['u2'], bouncer:[], bartender:[], backup:['u3'], maybe:[] } } };
    const embed = buildClockInEmbed(ev);
    expect(embed.title).toMatch(/Sample Event/);
    const fieldNames = embed.fields.map(f=>f.name);
    ['Instance Manager','Manager','Bouncer','Bartender','Backup','Maybe'].forEach(label => {
      expect(fieldNames.some(n=>n.includes(label))).toBe(true);
    });
    const imField = embed.fields.find(f=>f.name.includes('Instance Manager'));
    expect(imField.value).toMatch(/1 \/ 1/);
  });
});
