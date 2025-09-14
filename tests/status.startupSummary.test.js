const fs = require('fs');
const path = require('path');
const { cfgPath } = require('../src/utils/paths');

describe('startup status embed includes Startup Summary', () => {
  const summaryFile = cfgPath('startup-summary.json');
  const originalExists = fs.existsSync(summaryFile);
  const backup = originalExists ? fs.readFileSync(summaryFile, 'utf8') : null;

  afterEach(() => {
    try {
      if (originalExists) fs.writeFileSync(summaryFile, backup, 'utf8');
      else if (fs.existsSync(summaryFile)) fs.unlinkSync(summaryFile);
    } catch (e) {}
    jest.resetModules();
  });

  test('adds Startup Summary field when actions present', async () => {
    // write a small startup-summary.json with a few actions
    const payload = {
      ts: Date.now(),
      actions: [
        { kind: 'created' },
        { kind: 'edited' },
        { kind: 'deleted' },
        { kind: 'created' }
      ]
    };
    fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
    fs.writeFileSync(summaryFile, JSON.stringify(payload, null, 2), 'utf8');

    // fake channel that captures the embed
    let captured = null;
    const fakeChannel = { send: jest.fn().mockImplementation(async ({ embeds }) => { captured = embeds && embeds[0]; return {}; }) };

    const client = {
      isReady: () => true,
      channels: { fetch: jest.fn().mockResolvedValue(fakeChannel) }
    };

    // call the status service
    const svc = require('../src/services/statusService');
    await svc.postStartup(client, { channelId: 'any' });

    expect(captured).toBeTruthy();
    const fields = captured.fields || [];
    const hasSummary = fields.some(f => f.name === 'Startup Summary');
    expect(hasSummary).toBe(true);
    // ensure some counts are present in the value
    const summaryField = fields.find(f => f.name === 'Startup Summary');
    expect(summaryField.value).toMatch(/created: 2/);
  });
});
