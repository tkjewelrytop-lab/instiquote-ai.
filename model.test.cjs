const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) };
const sandbox = { window: { localStorage }, Date, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'docs', 'model.js'), 'utf8'), sandbox);
const IQ = sandbox.window.IQ;
const form = { title: '測試科學課程', category: '到校課程', district: '九龍城區', school: '演示學校', teacher: '陳老師', phone: '+852 5550 8801', email: 'teacher@example.com', description: '60 人的科學課程，包含材料與導師。', budget: 20000, deadlineHours: 72 };
let assertions = 0;
function check(name, fn) { fn(); assertions++; console.log(`PASS ${name}`); }

check('malformed local storage is recovered', () => {
  storage.set(IQ.storageKey, '{broken');
  const recovered = IQ.load();
  assert.equal(recovered.requests.length, 4);
  assert.equal(recovered.suppliers.length, 8);
  assert.equal(recovered.requests.filter(r => new Date(r.deadline) > new Date()).length, 3);
});

check('invalid submissions do not create requests', () => {
  const state = IQ.seed();
  assert.throws(() => IQ.createRequest(state, { ...form, email: 'invalid' }), /電子郵箱/);
  assert.throws(() => IQ.createRequest(state, { ...form, budget: -1 }), /預算/);
  assert.throws(() => IQ.createRequest(state, { ...form, deadline: new Date(Date.now() - 1000).toISOString() }), /截止時間/);
  assert.equal(state.requests.length, 4);
  assert.equal(state.nextId, 5);
});

check('matching dispatch is eligible, company-deduplicated, and repeat-safe', () => {
  const state = IQ.seed();
  state.suppliers.push({ ...state.suppliers[0], id: 'sup-clone', name: '同一公司分部', br: state.suppliers[0].br.replaceAll('-', ' ') });
  const request = IQ.createRequest(state, form);
  assert.equal(request.invitations.length, 7);
  assert.equal(request.invitations.filter(i => i.supplierId === 'sup-clone' || i.supplierId === 'sup-1').length, 1);
  assert.equal(request.invitations.some(i => i.supplierId === 'sup-8'), false);
  assert.equal(IQ.dispatch(state, request.id), 0);
  assert.equal(IQ.load().requests[0].id, request.id);
});

check('five accepted slots are enforced even after a quote is submitted', () => {
  const state = IQ.seed();
  const request = IQ.createRequest(state, form);
  const ids = request.invitations.map(i => i.supplierId);
  ids.slice(0, 5).forEach(id => IQ.acceptInvitation(state, request.id, id));
  IQ.submitQuote(state, request.id, ids[0], { amount: 14000, description: '全部材料及導師。', validDays: 30 });
  assert.throws(() => IQ.acceptInvitation(state, request.id, ids[5]), /名額已滿/);
  assert.throws(() => IQ.acceptInvitation(state, request.id, ids[0]), /處理過/);
  assert.equal(request.invitations.filter(i => i.status === 'accepted').length, 5);
});

check('reviewed quotes reach the target and a shortlist persists without completing a deal', () => {
  const state = IQ.seed();
  const request = IQ.createRequest(state, form);
  const ids = request.invitations.slice(0, 5).map(i => i.supplierId);
  assert.throws(() => IQ.submitQuote(state, request.id, ids[0], { amount: 15000, description: '報價' }), /先確認接單/);
  assert.throws(() => IQ.selectQuote(state, request.id, 'missing'), /找不到/);
  ids.forEach((id, i) => {
    IQ.acceptInvitation(state, request.id, id);
    if (i === 0) {
      assert.throws(() => IQ.submitQuote(state, request.id, id, { amount: 0, description: '報價' }), /金額/);
      assert.throws(() => IQ.submitQuote(state, request.id, id, { amount: 100, description: '' }), /服務內容/);
    }
    const submitted = IQ.submitQuote(state, request.id, id, { amount: 15000 + i * 500, description: '導師、材料及交通。', validDays: 30 });
    assert.equal(submitted.reviewStatus, 'pending');
    IQ.reviewQuote(state, request.id, submitted.id, 'valid', '符合需求');
    if (i < 4) assert.equal(request.status, 'collecting');
  });
  assert.equal(request.status, 'ready');
  const quote = IQ.selectQuote(state, request.id, request.quotes[0].id);
  assert.equal(request.status, 'ready');
  assert.equal(quote.supplierId, ids[0]);
  assert.equal(IQ.load().requests[0].selectedQuoteId, quote.id);
  assert.equal(IQ.load().requests[0].shortlistedQuoteIds[0], quote.id);
  IQ.teacherDecision(state, request.id, 'accept', { reason: '接受現有結果並另行洽談' });
  assert.throws(() => IQ.submitQuote(state, request.id, ids[0], { amount: 100, description: '重複' }), /停止接收/);
});

check('deadline blocks late actions and delivers only reviewed partial results for discussion', () => {
  const state = IQ.seed();
  const request = IQ.createRequest(state, form);
  const first = request.invitations[0].supplierId;
  IQ.acceptInvitation(state, request.id, first);
  const quote = IQ.submitQuote(state, request.id, first, { amount: 12000, description: '導師與材料。' });
  IQ.reviewQuote(state, request.id, quote.id, 'valid', '符合需求');
  request.deadline = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => IQ.acceptInvitation(state, request.id, request.invitations[1].supplierId), /截止時間/);
  assert.throws(() => IQ.submitQuote(state, request.id, first, { amount: 10000, description: '遲交' }), /截止時間/);
  IQ.save(state);
  const reloaded = IQ.load();
  assert.equal(reloaded.requests[0].status, 'closed');
  IQ.selectQuote(reloaded, request.id, request.quotes[0].id);
  assert.equal(reloaded.requests[0].status, 'closed');
  assert.equal(reloaded.requests[0].shortlistedQuoteIds[0], quote.id);
});

check('approval and suspension control further supplier actions', () => {
  const state = IQ.seed();
  const pending = state.suppliers.find(s => s.status === 'pending');
  assert.equal(IQ.approveSupplier(state, pending.id).status, 'approved');
  const request = IQ.createRequest(state, form);
  assert.equal(request.invitations.some(i => i.supplierId === pending.id), true);
  IQ.approveSupplier(state, pending.id, false);
  assert.throws(() => IQ.acceptInvitation(state, request.id, pending.id), /審核|停權|符合/);
});

check('clarifications are saved and empty input is rejected', () => {
  const state = IQ.seed();
  const request = state.requests[0];
  assert.throws(() => IQ.addMessage(state, request.id, 'supplier', '  '), /填寫/);
  const message = IQ.addMessage(state, request.id, 'teacher', '是否包含交通費用？');
  assert.equal(message.author, 'teacher');
  assert.equal(IQ.load().requests[0].messages.at(-1).text, '是否包含交通費用？');
});

console.log(`${assertions} meaningful model scenarios passed.`);
