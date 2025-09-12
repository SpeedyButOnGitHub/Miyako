/* Additional tests: question editor operations & rate limiting semantics.
 * These tests focus on the underlying persistence helpers (updateApplication, listSubmissions)
 * since interactive flows (modals/buttons) are UI-layer and harder to simulate here.
 */
const fs = require('fs');
const path = require('path');
const { dataDir } = require('../src/utils/paths');
const { addApplication, getApplication, updateApplication, addSubmission, listSubmissions } = require('../src/utils/applications');

describe('Applications Advanced', () => {
  const appsFile = path.join(dataDir(), 'applications.json');
  const panelsFile = path.join(dataDir(), 'applicationPanels.json');

  beforeEach(() => {
    fs.writeFileSync(appsFile, JSON.stringify({ nextAppId:1, applications:[], submissions:[] }, null, 2));
    fs.writeFileSync(panelsFile, JSON.stringify({ nextPanelId:1, panels:[] }, null, 2));
  });

  test('question add/edit/delete/reorder persistence', () => {
    const app = addApplication({ name:'EditFlow' });
    // add questions
    updateApplication(app.id, { questions: [
      { id:'q1', type:'short', label:'First', required:true },
      { id:'q2', type:'long', label:'Second', required:false },
      { id:'q3', type:'short', label:'Third', required:true },
    ] });
    let cur = getApplication(app.id);
    expect(cur.questions).toHaveLength(3);
    // edit last question
    const edited = cur.questions.map(q => q.id==='q3'? { ...q, label:'Third (edited)', required:false }: q);
    updateApplication(app.id, { questions: edited });
    cur = getApplication(app.id);
    expect(cur.questions.find(q=>q.id==='q3').label).toMatch(/edited/);
    expect(cur.questions.find(q=>q.id==='q3').required).toBe(false);
    // reorder (simulate rotate: move last to first)
    const rotated = [...cur.questions];
    rotated.unshift(rotated.pop());
    updateApplication(app.id, { questions: rotated });
    cur = getApplication(app.id);
    expect(cur.questions[0].id).toBe('q3');
    // delete (remove last)
    updateApplication(app.id, { questions: cur.questions.slice(0, -1) });
    cur = getApplication(app.id);
    expect(cur.questions).toHaveLength(2);
  });

  test('rate limit: second pending submission within 24h would appear alongside first (UI blocks separately)', () => {
    // Underlying storage currently allows multiple pending; UI layer enforces guard.
    const app = addApplication({ name:'Rate', questions:[{ id:'q1', type:'short', label:'Why', required:true }] });
    const userId = 'user123';
    const first = addSubmission(app.id, userId, [{ qid:'q1', answer:'Because' }]);
    expect(first.status).toBe('pending');
    const second = addSubmission(app.id, userId, [{ qid:'q1', answer:'Another' }]);
    expect(second).toBeTruthy();
    const list = listSubmissions({ appId: app.id }).filter(s=>s.userId===userId);
    expect(list).toHaveLength(2);
    // Simulate UI decision of first to ensure space for future
    // (not asserting decision here; focus is on presence of duplicates pre-guard)
  });
});
