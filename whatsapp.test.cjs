const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = new Map();
const sandbox = { window: { localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,String(value)) } }, Date, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs','model.js'),'utf8'),sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs','whatsapp.js'),'utf8'),sandbox);
const IQ=sandbox.window.IQ, WA=sandbox.window.IQWhatsApp;
let scenarios=0;
function check(name, action){action();scenarios++;console.log(`PASS ${name}`);}
function fresh(){const state=IQ.seed();WA.ensure(state);return state;}
function findRequest(state,index=0){return state.requests[index];}
function data(state,templateId='request_received',recipientType='teacher',index=0){return {templateId,recipientType,requestId:findRequest(state,index).id};}

check('existing state migrates once and empty queues are not reseeded',()=>{
  const state=IQ.seed(),before=JSON.stringify(state.requests);
  WA.ensure(state);assert.equal(state.whatsapp.messages.length,4);
  assert.deepEqual(new Set(state.whatsapp.messages.map(message=>message.status)),new Set(['read','delivered','failed','queued']));
  assert.equal(JSON.stringify(state.requests),before);
  WA.ensure(state);assert.equal(state.whatsapp.messages.length,4);
  state.whatsapp.messages=[];WA.ensure(state);assert.equal(state.whatsapp.messages.length,0);
  assert.equal(IQ.load().whatsapp.messages.length,4);
});

check('teacher and invited supplier recipients are resolved from demo records',()=>{
  const state=fresh(),r=findRequest(state);
  const teacher=WA.queue(state,{...data(state),recipientPhone:'99999999',recipientName:'wrong'});
  assert.equal(teacher.recipientPhone,r.phone);assert.equal(teacher.recipientName,r.teacher);
  const supplier=WA.queue(state,{...data(state,'supplier_invited','supplier'),supplierId:'sup-1',recipientPhone:'99999999'});
  assert.equal(supplier.recipientPhone,state.suppliers[0].phone);
  assert.equal(supplier.supplierId,'sup-1');
  for(const privateValue of [r.school,r.teacher,r.email,r.phone])assert(!supplier.body.includes(privateValue));
  const quote=WA.queue(state,{...data(state,'quote_received'),variables:{supplier_code:'FORGED',quote_count:999,category:r.school}});
  assert(!quote.body.includes('FORGED'));assert(!quote.body.includes('999'));
  for(const privateValue of [state.suppliers[1].name,state.suppliers[1].phone,state.suppliers[1].email])assert(!quote.body.includes(privateValue));
});

check('invalid recipient/template/order inputs never mutate state',()=>{
  const state=fresh(),before=JSON.stringify(state);
  assert.throws(()=>WA.queue(state,{...data(state,'supplier_invited','supplier'),supplierId:'missing'}));
  assert.throws(()=>WA.queue(state,{...data(state),recipientType:'supplier'}));
  assert.throws(()=>WA.queue(state,{...data(state),requestId:'missing'}));
  assert.throws(()=>WA.queue(state,{...data(state),templateId:'missing'}));
  assert.throws(()=>WA.queue(state,{...data(state,'supplier_invited','supplier'),supplierId:'sup-8'}));
  assert.equal(JSON.stringify(state),before);
  const old=IQ.seed(),oldBefore=JSON.stringify(old);
  assert.throws(()=>WA.queue(old,{...data(old),requestId:'missing'}));assert.equal(JSON.stringify(old),oldBefore);
});

check('supplier acceptance progress is teacher-only and uses actual accepted counts',()=>{
  const state=fresh(),r=findRequest(state);
  const m=WA.queue(state,{...data(state,'supplier_confirmed'),variables:{accepted_count:999}});
  assert(m.body.includes(r.id));assert(m.body.includes('2 / 5'));assert(!m.body.includes('999'));
  assert(m.body.includes('接單不代表已交報價'));
  const before=JSON.stringify(state);
  assert.throws(()=>WA.queue(state,{...data(state,'supplier_confirmed','supplier'),supplierId:'sup-1'}));
  const matching=state.requests.find(item=>item.status==='matching');
  assert.throws(()=>WA.queue(state,{templateId:'supplier_confirmed',recipientType:'teacher',requestId:matching.id}));
  assert.equal(JSON.stringify(state),before);
});

check('sending is simulated, persisted and protected against duplicate delivery',()=>{
  const state=fresh(),m=WA.queue(state,data(state));
  const beforeEvents=state.events.length;
  WA.send(state,m.id);assert.equal(m.status,'delivered');assert.equal(m.attempts,1);
  assert.equal(state.events.length,beforeEvents+1);assert.equal(IQ.load().whatsapp.messages[0].status,'delivered');
  const before=JSON.stringify(state);
  assert.throws(()=>WA.send(state,m.id));assert.throws(()=>WA.retry(state,m.id));
  assert.equal(JSON.stringify(state),before);
});

check('failed sends require retry and preserve cumulative attempt/audit history',()=>{
  const state=fresh(),m=WA.queue(state,data(state));
  WA.simulateFailure(state,m.id);assert.equal(m.status,'failed');assert.equal(m.attempts,1);assert(m.error);
  const failed=JSON.stringify(state);assert.throws(()=>WA.send(state,m.id));assert.equal(JSON.stringify(state),failed);
  WA.retry(state,m.id);assert.equal(m.status,'queued');assert.equal(m.attempts,1);
  WA.send(state,m.id);assert.equal(m.status,'delivered');assert.equal(m.attempts,2);assert.equal(m.error,null);
  assert.equal(state.events.filter(e=>e.messageId===m.id).length,4);
});

check('selected supplier contacts are available only after a real selection',()=>{
  const state=fresh();const before=JSON.stringify(state);
  assert.throws(()=>WA.queue(state,data(state,'supplier_selected')));assert.equal(JSON.stringify(state),before);
  const ready=state.requests.find(r=>r.status==='ready');IQ.selectQuote(state,ready.id,ready.quotes[0].id);
  const m=WA.queue(state,{templateId:'supplier_selected',requestId:ready.id,recipientType:'teacher'});
  const selected=state.suppliers.find(s=>s.id===ready.quotes[0].supplierId);
  assert(m.body.includes(selected.name));assert(m.body.includes(selected.phone));
});

check('reminders are limited to accepted, outstanding, unexpired supplier quotes',()=>{
  const state=fresh(),r=findRequest(state);const base={...data(state,'deadline_reminder','supplier'),supplierId:'sup-1'};
  assert.throws(()=>WA.queue(state,base));IQ.acceptInvitation(state,r.id,'sup-1');
  const reminder=WA.queue(state,base);assert(reminder.body.includes(r.id));
  IQ.submitQuote(state,r.id,'sup-1',{amount:10000,description:'Test service',validDays:30});
  assert.throws(()=>WA.queue(state,base));
  const unready=state.requests.find(r=>r.status==='matching');
  assert.throws(()=>WA.queue(state,{templateId:'quotes_ready',recipientType:'teacher',requestId:unready.id}));
});

check('template clones, missing placeholders and summary remain predictable',()=>{
  const state=fresh(),templates=WA.templates();assert.equal(templates.length,7);
  templates[0].variables.push('mutated');templates[0].body='bad';
  assert(!WA.templates()[0].variables.includes('mutated'));assert.notEqual(WA.templates()[0].body,'bad');
  assert(WA.preview('request_received',{order_number:'EXAMPLE'}).includes('{{category}}'));
  assert(WA.preview('request_received',{order_number:'<script>'}).includes('<script>'));
  const s=WA.summary(state);assert.equal(s.total,4);assert.equal(s.successful,2);assert.equal(s.failed,1);assert.equal(s.queued,1);
  const before=JSON.stringify(state);assert.throws(()=>WA.send(state,'missing'));assert.equal(JSON.stringify(state),before);
});
console.log(`${scenarios} WhatsApp prototype scenarios passed.`);
