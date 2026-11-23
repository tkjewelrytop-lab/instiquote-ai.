const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let clock = Date.UTC(2026, 10, 23, 9);
class DemoDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
const data = new Map();
const sandbox = { window: { localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)) } }, Date: DemoDate };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'docs', 'model.js'), 'utf8'), sandbox);
const IQ = sandbox.window.IQ;
const future = hours => new Date(clock + hours * 3600000).toISOString();
const form = { title: '分階段校園課程', description: '60名學生，需兩位導師及教學材料。', category: '到校課程', district: '九龍城區', budget: 20000, school: '模擬學校', teacher: '陳老師', phone: '+852 5550 8801', email: 'teacher@example.com', deadlineHours: 72 };
const quoteData = { amount: 14000, description: '兩位導師、材料及交通費，另有原公司格式附件。', validDays: 30, attachmentName: '原公司格式.pdf' };
const json = value => JSON.stringify(value);
let checks = 0;
function check(name, fn) { clock = Date.UTC(2026, 10, 23, 9); data.clear(); fn(); checks++; console.log('PASS ' + name); }
function fixture() { const state = IQ.seed(); return { state, r: IQ.createRequest(state, form) }; }
function submitted(state, r, index = 0) { const id = r.invitations[index].supplierId; IQ.acceptInvitation(state, r.id, id); return IQ.submitQuote(state, r.id, id, quoteData); }
function valid(state, r, index = 0) { const q = submitted(state, r, index); IQ.reviewQuote(state, r.id, q.id, 'valid', '核對服務範圍符合要求'); return q; }

check('legacy records migrate idempotently with identities, files, and a discussion shortlist preserved', () => {
  const state = IQ.seed(), r = state.requests[3];
  delete r.workflowVersion; delete r.revision; delete r.stage; delete r.stages; delete r.versions; delete r.deliveredQuoteIds; delete r.shortlistedQuoteIds;
  r.status = 'selected'; r.ownerAccountId = 'teacher-fixed'; r.selectedQuoteId = r.quotes[0].id;
  const originalId = r.id, quoteId = r.quotes[0].id;
  IQ.ensureWorkflow(state); const first = json(state); IQ.ensureWorkflow(state);
  assert.equal(json(state), first); assert.equal(r.id, originalId); assert.equal(r.ownerAccountId, 'teacher-fixed');
  assert.equal(r.status, 'closed'); assert.equal(r.shortlistedQuoteIds[0], quoteId); assert.equal(IQ.deliveredQuotes(state, r).length, 5);
});

check('only reviewed current valid quotes count and partial delivery exposes no pending or rejected quotes', () => {
  const { state, r } = fixture(), q = submitted(state, r);
  assert.equal(q.reviewStatus, 'pending'); assert.equal(IQ.validQuotes(state, r).length, 0);
  IQ.deliverStage(state, r.id, '第一階段先查看結果'); assert.equal(IQ.deliveredQuotes(state, r).length, 0);
  const before = json(state); assert.throws(() => IQ.reviewQuote(state, r.id, q.id, 'clarification', ''), /原因/); assert.equal(json(state), before);
  IQ.reviewQuote(state, r.id, q.id, 'clarification', '請補充材料數量'); assert.equal(IQ.validQuotes(state, r).length, 0);
  IQ.reviewQuote(state, r.id, q.id, 'valid', '補充已齊'); IQ.deliverStage(state, r.id, '交付已核對方案');
  assert.equal(IQ.outcome(state, r), 'partial'); assert.equal(IQ.deliveredQuotes(state, r)[0].id, q.id);
  IQ.reviewQuote(state, r.id, q.id, 'rejected', '未能提供所需材料'); assert.equal(IQ.deliveredQuotes(state, r).length, 0);
});

check('three deadlines validate independently and pending review is not mistaken for a missed submission', () => {
  const { state, r } = fixture(), ids = r.invitations.map(i => i.supplierId);
  const before = json(state);
  assert.throws(() => IQ.acceptInvitation(state, r.id, ids[0], { quoteDueAt: future(90) }), /不能晚於/); assert.equal(json(state), before);
  assert.throws(() => IQ.acceptInvitation(state, r.id, ids[0], future(-1)), /未來/); assert.equal(json(state), before);
  IQ.acceptInvitation(state, r.id, ids[0], { quoteDueAt: future(4) });
  IQ.acceptInvitation(state, r.id, ids[1], future(4));
  const q = IQ.submitQuote(state, r.id, ids[0], quoteData);
  clock += 13 * 3600000; assert.equal(IQ.processDeadlines(state), true);
  assert.equal(r.invitations[0].status, 'accepted'); assert.equal(q.reviewStatus, 'pending');
  assert.equal(r.invitations[1].status, 'expired'); assert.equal(r.invitations[2].status, 'reply_expired');
  assert.throws(() => IQ.acceptInvitation(state, r.id, ids[2]), /處理過|期限/);
});

check('failed commitment releases a slot and a new stage reopens only untouched standby companies', () => {
  const { state, r } = fixture(), ids = r.invitations.map(i => i.supplierId), q = valid(state, r, 0);
  ids.slice(1, 5).forEach(id => IQ.acceptInvitation(state, r.id, id, future(1)));
  clock += 2 * 3600000; IQ.processDeadlines(state);
  IQ.startNextStage(state, r.id, { deadline: future(96), reason: '首階段先交付一份，再補足方案' });
  assert.equal(r.stage, 2); assert.equal(IQ.deliveredQuotes(state, r)[0].id, q.id);
  assert.equal(r.invitations[1].status, 'expired'); assert.equal(r.invitations[5].status, 'invited'); assert.equal(r.invitations[5].stage, 2);
  assert.equal(r.invitations.length, ids.length); IQ.acceptInvitation(state, r.id, ids[5]);
  assert.equal(r.invitations[5].status, 'accepted'); assert.equal(state.suppliers[1].score, 96);
});

check('invalid quotes free capacity and cannot reclaim an already refilled fifth slot', () => {
  const { state, r } = fixture(), ids = r.invitations.map(i => i.supplierId);
  ids.slice(0, 5).forEach(id => IQ.acceptInvitation(state, r.id, id));
  const q = IQ.submitQuote(state, r.id, ids[0], quoteData);
  IQ.reviewQuote(state, r.id, q.id, 'rejected', '不包含所需教學材料');
  IQ.acceptInvitation(state, r.id, ids[5]); const before = json(state);
  assert.throws(() => IQ.submitQuote(state, r.id, ids[0], quoteData), /名額已滿/); assert.equal(json(state), before);
});

check('delivery is incremental and retry safe while quote revisions require a fresh review and delivery', () => {
  const { state, r } = fixture(), first = valid(state, r, 0);
  IQ.deliverStage(state, r.id, '先交付第一份'); IQ.toggleShortlist(state, r.id, first.id);
  const stage = r.stages[0], firstDelivery = stage.deliveries[0];
  IQ.deliverStage(state, r.id, '重試'); assert.equal(stage.deliveries.length, 1);
  const second = valid(state, r, 1); IQ.deliverStage(state, r.id, '交付第二份'); assert.equal(stage.deliveries.length, 2);
  assert.equal(stage.deliveries[1].quoteIds[0], second.id);
  IQ.submitQuote(state, r.id, first.supplierId, { ...quoteData, amount: 14500 });
  assert.equal(r.shortlistedQuoteIds.length, 0); assert.equal(r.deliveredQuoteIds.includes(first.id), false);
  assert.equal(first.revisions.length, 1); assert.equal(first.quoteRevision, 2); assert.equal(firstDelivery.quotes[0].amount, 14000);
  IQ.reviewQuote(state, r.id, first.id, 'valid', '修訂符合要求'); assert.equal(IQ.deliveredQuotes(state, r).some(q => q.id === first.id), false);
  IQ.deliverStage(state, r.id, '交付修訂'); assert.equal(stage.deliveries.length, 3); assert.equal(IQ.deliveredQuotes(state, r).length, 2);
});

check('requirement changes validate before writes, preserve versions, and extend all live commitments', () => {
  const { state, r } = fixture(), q = valid(state, r); r.ownerAccountId = 'teacher-permanent';
  IQ.deliverStage(state, r.id, '首批'); IQ.toggleShortlist(state, r.id, q.id);
  for (const data of [{ reason: '', deadline: future(96) }, { reason: '日期更新', deadline: future(48) }, { reason: '日期更新', deadline: future(96), budget: -1 }]) {
    const before = json(state); assert.throws(() => IQ.updateRequest(state, r.id, data)); assert.equal(json(state), before);
  }
  const oldDeadline = r.deadline, newDeadline = future(96);
  IQ.updateRequest(state, r.id, { deadline: newDeadline, description: '改為80人，需要增加材料。', reason: '學生人數更新' });
  assert.equal(r.revision, 2); assert.equal(r.stage, 2); assert.equal(r.versions[0].deadline, oldDeadline);
  assert.equal(r.versions[1].description, '改為80人，需要增加材料。'); assert.equal(r.ownerAccountId, 'teacher-permanent');
  assert.equal(q.reviewStatus, 'reconfirmation'); assert.equal(q.requestRevision, 1); assert.equal(r.shortlistedQuoteIds.length, 0);
  assert.equal(r.invitations[0].quoteDueAt, newDeadline); assert.equal(IQ.deliveredQuotes(state, r).length, 0);
  assert.throws(() => IQ.reviewQuote(state, r.id, q.id, 'valid', '直接沿用'), /重新確認/);
  IQ.submitQuote(state, r.id, q.supplierId, { ...quoteData, amount: 16000 });
  assert.equal(q.requestRevision, 2); assert.equal(q.reviewStatus, 'pending');
});

check('zero, partial, and target results stay distinct and teachers record follow-up choices', () => {
  const { state, r } = fixture(); IQ.closeRequest(state, r.id, '第一階段無供應商回應');
  assert.equal(IQ.outcome(state, r), 'zero'); assert.equal(r.stages[0].deliveries[0].quoteIds.length, 0);
  assert.throws(() => IQ.teacherDecision(state, r.id, 'accept', { reason: '接受' }), /尚未有有效/);
  IQ.teacherDecision(state, r.id, 'extend', { reason: '再尋找新供應商', deadline: future(96) }); assert.equal(r.stage, 2);
  const q = valid(state, r, 0); IQ.deliverStage(state, r.id, '補派後先交付'); assert.equal(IQ.outcome(state, r), 'partial');
  IQ.teacherDecision(state, r.id, 'accept', { reason: '此方案足以開始細談' });
  assert.equal(r.status, 'closed'); assert.equal(r.teacherDecision.reason, '此方案足以開始細談');
  IQ.toggleShortlist(state, r.id, q.id); assert.equal(r.status, 'closed');
});

check('a discussion shortlist allows at most three valid companies and can be changed without claiming a deal', () => {
  const state = IQ.seed(), r = state.requests[1];
  r.quotes.slice(0, 3).forEach(q => IQ.toggleShortlist(state, r.id, q.id));
  const before = json(state); assert.throws(() => IQ.toggleShortlist(state, r.id, r.quotes[3].id), /最多/); assert.equal(json(state), before);
  IQ.toggleShortlist(state, r.id, r.quotes[0].id); IQ.toggleShortlist(state, r.id, r.quotes[3].id);
  assert.equal(r.shortlistedQuoteIds.length, 3); assert.equal(r.status, 'ready');
  IQ.approveSupplier(state, r.quotes[3].supplierId, false); assert.equal(r.shortlistedQuoteIds.length, 2);
  assert.equal(IQ.deliveredQuotes(state, r).some(q => q.id === r.quotes[3].id), false);
});

check('withdrawal frees a place but never automatically re-invites the company or deducts a score', () => {
  const { state, r } = fixture(), q = valid(state, r), supplier = state.suppliers.find(s => s.id === q.supplierId), score = supplier.score;
  IQ.deliverStage(state, r.id, '有效首批'); IQ.withdrawInvitation(state, r.id, q.supplierId, '當天導師無法出席');
  IQ.startNextStage(state, r.id, { deadline: future(96), reason: '補派另一間公司' });
  assert.equal(r.invitations[0].status, 'withdrawn'); assert.equal(IQ.deliveredQuotes(state, r).length, 0); assert.equal(supplier.score, score);
});

check('cancellation blocks all collection mutations and stops deadline actions without penalties', () => {
  const { state, r } = fixture(), q = submitted(state, r), scores = state.suppliers.map(s => s.score);
  IQ.teacherDecision(state, r.id, 'cancel', { reason: '學校活動取消' }); const before = json(state);
  for (const action of [() => IQ.dispatch(state, r.id), () => IQ.submitQuote(state, r.id, q.supplierId, quoteData), () => IQ.reviewQuote(state, r.id, q.id, 'valid', '核對'), () => IQ.deliverStage(state, r.id, '再交付'), () => IQ.addMessage(state, r.id, 'supplier', '留言'), () => IQ.updateRequest(state, r.id, { deadline: future(96), reason: '變更' })]) assert.throws(action, /取消|停止/);
  assert.equal(json(state), before); clock += 100 * 3600000; IQ.processDeadlines(state);
  assert.equal(r.status, 'cancelled'); assert.deepEqual(state.suppliers.map(s => s.score), scores);
  assert.equal(state.events.filter(e => e.requestId === r.id && e.type === 'request_closed').length, 0);
});

check('deadline processing expires stale quotes once and closes a stage once', () => {
  const { state, r } = fixture(), q = valid(state, r); IQ.deliverStage(state, r.id, '首批'); IQ.toggleShortlist(state, r.id, q.id);
  q.submittedAt = future(-24 * 31); r.deadline = future(-1);
  IQ.processDeadlines(state); const events = state.events.length; IQ.processDeadlines(state);
  assert.equal(q.reviewStatus, 'expired'); assert.equal(r.shortlistedQuoteIds.length, 0); assert.equal(IQ.outcome(state, r), 'zero');
  assert.equal(state.events.length, events); assert.equal(r.status, 'closed');
});

check('five unresolved clarification quotes release their slots at commitment expiry or stage rollover', () => {
  for (const expireFirst of [true, false]) {
    clock = Date.UTC(2026, 10, 23, 9);
    const { state, r } = fixture(), ids = r.invitations.map(i => i.supplierId), scores = state.suppliers.map(s => s.score);
    const quotes = ids.slice(0, 5).map(id => {
      IQ.acceptInvitation(state, r.id, id, future(expireFirst ? 1 : 24));
      const quote = IQ.submitQuote(state, r.id, id, quoteData);
      IQ.reviewQuote(state, r.id, quote.id, 'clarification', '請補充材料數量');
      return quote;
    });
    assert.throws(() => IQ.acceptInvitation(state, r.id, ids[5]), /名額已滿/);
    if (expireFirst) {
      clock += 2 * 3600000;
      IQ.processDeadlines(state);
      assert.equal(r.invitations.slice(0, 5).every(i => i.status === 'expired'), true);
    }
    IQ.startNextStage(state, r.id, { deadline: future(96), reason: '待澄清供應商未補交，通知候補' });
    assert.equal(r.invitations.slice(0, 5).every(i => i.status === 'expired'), true);
    assert.equal(r.quotes.length, 5); assert.equal(IQ.validQuotes(state, r).length, 0);
    assert.equal(r.invitations[5].stage, 2); IQ.acceptInvitation(state, r.id, ids[5]);
    assert.equal(r.invitations[5].status, 'accepted');
    const before = json(state);
    assert.throws(() => IQ.submitQuote(state, r.id, ids[0], quoteData), /先確認接單/);
    assert.throws(() => IQ.reviewQuote(state, r.id, quotes[0].id, 'valid', '不能沿用過期參與資格'), /退出或失約/);
    assert.equal(json(state), before); assert.deepEqual(state.suppliers.map(s => s.score), scores);
  }
});

check('eligible released suppliers receive the revised deadline but must reacquire an available slot', () => {
  for (const refill of [false, true]) {
    clock = Date.UTC(2026, 10, 23, 9);
    const { state, r } = fixture(), ids = r.invitations.map(i => i.supplierId);
    ids.slice(0, 5).forEach(id => IQ.acceptInvitation(state, r.id, id));
    const quote = IQ.submitQuote(state, r.id, ids[0], quoteData);
    IQ.reviewQuote(state, r.id, quote.id, 'rejected', '舊規格的服務範圍不符');
    if (refill) IQ.acceptInvitation(state, r.id, ids[5]);
    clock += 26 * 3600000;
    const deadline = future(96);
    IQ.updateRequest(state, r.id, { deadline, reason: '調整服務範圍，請已報價公司重新準備', description: '更新教學內容及材料規格。' });
    const invitation = r.invitations[0];
    assert.equal(invitation.status, 'released'); assert.equal(invitation.quoteDueAt, deadline);
    assert.equal(quote.reviewStatus, 'reconfirmation');
    assert.equal(state.events.find(e => e.requestId === r.id && e.type === 'request_updated').supplierIds.includes(ids[0]), true);
    if (refill) {
      const before = json(state);
      assert.throws(() => IQ.submitQuote(state, r.id, ids[0], quoteData), /名額已滿/);
      assert.equal(json(state), before); assert.equal(invitation.status, 'released');
    } else {
      const revised = IQ.submitQuote(state, r.id, ids[0], { ...quoteData, amount: 15500 });
      assert.equal(revised.id, quote.id); assert.equal(revised.requestRevision, 2); assert.equal(revised.reviewStatus, 'pending');
      assert.equal(invitation.status, 'accepted');
    }
  }
});

console.log(checks + ' staged workflow scenarios passed.');
