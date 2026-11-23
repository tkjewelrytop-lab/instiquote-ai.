const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const saved = new Map();
const sandbox = {window: {localStorage: {getItem: k => saved.get(k) || null, setItem: (k,v) => saved.set(k,String(v))}}, Date, console};
for (const file of ['model.js','whatsapp.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs',file),'utf8'),sandbox);
const IQ = sandbox.window.IQ, W = sandbox.window.IQWhatsApp;
const future = hours => new Date(Date.now()+hours*3600000).toISOString();
let count = 0;
function check(name, action) {action();count++;console.log('PASS '+name);}
function fresh() {
 const state = IQ.seed(); IQ.ensureWorkflow(state);
 state.events=[]; state.whatsapp={messages:[],nextId:1};
 const request=IQ.createRequest(state,{title:'跨模組階段交付測試',category:'到校課程',district:'九龍城區',school:'測試學校',teacher:'測試老師',phone:'+852 5550 8899',email:'workflow@example.com',description:'60位學生的到校科學課，包含導師及材料。',budget:18000,deadline:future(72)});
 return {state,request};
}
function acceptedQuote(state,request) {
 const supplierId=request.invitations[0].supplierId;
 IQ.acceptInvitation(state,request.id,supplierId);
 const quote=IQ.submitQuote(state,request.id,supplierId,{amount:14800,description:'包含兩位導師、交通及全套材料。',validDays:30,attachmentName:'公司原格式報價.pdf'});
 return {supplierId,quote};
}

check('a reviewed partial batch is delivered once and repeats do not duplicate notifications',()=>{
 const {state,request}=fresh(),{quote}=acceptedQuote(state,request);
 assert.equal(IQ.deliveredQuotes(state,request).length,0);
 IQ.reviewQuote(state,request.id,quote.id,'valid','需求及包含項目完整');
 IQ.deliverStage(state,request.id,'先交付第一份有效報價'); W.syncWorkflow(state);
 const notices=state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='stage_delivered');
 assert.equal(notices.length,1); assert.equal(IQ.deliveredQuotes(state,request).length,1);
 const company=state.suppliers.find(s=>s.id===quote.supplierId);
 assert(notices[0].body.includes(company.name)); assert(notices[0].body.includes(company.phone));
 IQ.deliverStage(state,request.id,'重試同一批交付'); W.syncWorkflow(state); W.syncWorkflow(state);
 assert.equal(state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='stage_delivered').length,1);
});

check('revising the same quote id removes prior delivery and shortlist and revokes its unsent contact notification',()=>{
 const {state,request}=fresh(),{quote,supplierId}=acceptedQuote(state,request);
 IQ.reviewQuote(state,request.id,quote.id,'valid','核對完成'); IQ.deliverStage(state,request.id,'先交有效方案');
 IQ.toggleShortlist(state,request.id,quote.id); W.syncWorkflow(state);
 const oldNotice=state.whatsapp.messages.find(m=>m.templateId==='stage_delivered'&&m.requestId===request.id);
 const revised=IQ.submitQuote(state,request.id,supplierId,{amount:15200,description:'修訂材料及交通費用，總額已調整。',validDays:30});
 assert.equal(revised.id,quote.id); assert.equal(IQ.deliveredQuotes(state,request).length,0);
 assert.equal(request.shortlistedQuoteIds.length,0); W.syncWorkflow(state);
 assert.throws(()=>W.send(state,oldNotice.id));
 IQ.reviewQuote(state,request.id,revised.id,'valid','修訂已重新核對'); IQ.deliverStage(state,request.id,'交付已核對修訂'); W.syncWorkflow(state);
 const notices=state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='stage_delivered');
 assert.equal(notices.length,2); assert.equal(notices.filter(m=>m.status==='queued').length,1);
 assert.equal(IQ.deliveredQuotes(state,request).length,1);
});

check('requirement revisions notify submitted suppliers, extend their commitment, and cannot retry an old reminder',()=>{
 const {state,request}=fresh(),{quote,supplierId}=acceptedQuote(state,request);
 IQ.reviewQuote(state,request.id,quote.id,'valid','核對完成'); IQ.deliverStage(state,request.id,'交付首批'); W.syncWorkflow(state);
 const before=request.invitations.find(i=>i.supplierId===supplierId).quoteDueAt;
 IQ.updateRequest(state,request.id,{description:'改為80位學生、增加一組實驗材料。',deadline:future(144),reason:'參與學生人數增加'});
 W.syncWorkflow(state);
 assert.equal(IQ.deliveredQuotes(state,request).length,0);
 const invitation=request.invitations.find(i=>i.supplierId===supplierId);
 assert(new Date(invitation.quoteDueAt)>new Date(before));
 const updates=state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='request_updated'&&m.supplierId===supplierId);
 assert.equal(updates.length,1); assert(updates[0].body.includes('參與學生人數增加'));
 const reminder=W.queue(state,{templateId:'deadline_reminder',requestId:request.id,recipientType:'supplier',supplierId});
 W.simulateFailure(state,reminder.id);
 IQ.updateRequest(state,request.id,{description:'改為90位學生並增設材料。',deadline:future(192),reason:'最終參與名單更新'}); W.syncWorkflow(state);
 assert.throws(()=>W.retry(state,reminder.id));
 assert.equal(state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='request_updated'&&m.supplierId===supplierId&&m.status==='queued').length,1);
});

check('notification snapshots stay stale when the same quote is reapproved before synchronization',()=>{
 const {state,request}=fresh(),{quote,supplierId}=acceptedQuote(state,request);
 IQ.reviewQuote(state,request.id,quote.id,'valid','核對完成'); IQ.deliverStage(state,request.id,'第一批');
 IQ.toggleShortlist(state,request.id,quote.id); W.syncWorkflow(state);
 const batch=state.whatsapp.messages.find(m=>m.templateId==='stage_delivered'&&m.requestId===request.id);
 const shortlist=state.whatsapp.messages.find(m=>m.templateId==='shortlist_updated'&&m.requestId===request.id);
 IQ.submitQuote(state,request.id,supplierId,{amount:15300,description:'修訂後的完整方案',validDays:30});
 IQ.reviewQuote(state,request.id,quote.id,'valid','修訂核對完成'); IQ.deliverStage(state,request.id,'第二批');
 assert.throws(()=>W.send(state,batch.id)); assert.throws(()=>W.send(state,shortlist.id));
 W.syncWorkflow(state);
 assert.equal(state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.templateId==='stage_delivered'&&m.status==='queued').length,1);
});

check('cancellation revokes outstanding operational messages and only cancellation notices remain sendable',()=>{
 const {state,request}=fresh(),{supplierId}=acceptedQuote(state,request);
 W.syncWorkflow(state);
 const invitation=W.queue(state,{templateId:'supplier_invited',requestId:request.id,recipientType:'supplier',supplierId:request.invitations.find(i=>i.status==='invited').supplierId});
 IQ.teacherDecision(state,request.id,'cancel',{reason:'學校取消本次活動'}); W.syncWorkflow(state);
 assert.throws(()=>W.send(state,invitation.id));
 assert.throws(()=>IQ.submitQuote(state,request.id,supplierId,{amount:14000,description:'取消後提交'}));
 const queued=state.whatsapp.messages.filter(m=>m.requestId===request.id&&m.status==='queued');
 assert(queued.length>0); assert(queued.every(m=>m.templateId.startsWith('request_cancelled_')));
 const size=state.whatsapp.messages.length; W.syncWorkflow(state); assert.equal(state.whatsapp.messages.length,size);
});
console.log(`${count} workflow and notification integration scenarios passed.`);
