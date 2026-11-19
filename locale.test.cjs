const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const records = new Map();
const localStorage = {getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,String(value))};
const context={window:{localStorage},Date,console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs/model.js'),'utf8'),context);
const before=context.window.IQ.seed();
// These Simplified Chinese fixtures are intentional: they represent pre-update records.
before.requests[0].category='到校课程';
before.requests[0].district='九龙城区';
before.requests[0].title='小四 STEM 创意科学工作坊';
before.requests[0].files=[{name:'旧版报价文件.pdf',size:1234,type:'application/pdf'}];
before.requests[0].quotes[0].attachmentName='供应商报价.docx';
before.requests[0].customUrl='https://example.com/学校';
before.requests[0].email='teacher@example.com';
before.nextId=42;
before.requests[0].customMetadata={status:'matching',id:'record-11',amount:1234,enabled:true};
localStorage.setItem(context.window.IQ.storageKey,JSON.stringify(before));
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs/locale.js'),'utf8'),context);
const IQ=context.window.IQ,locale=context.window.IQLocale;
let count=0;
function check(label,fn){fn();count++;console.log('PASS '+label);}

check('legacy records migrate without resetting IDs, counts or next reference',()=>{
  const state=IQ.load();
  assert.equal(state.requests.length,before.requests.length);
  assert.equal(state.suppliers.length,before.suppliers.length);
  assert.equal(state.nextId,42);
  assert.equal(state.requests[0].id,before.requests[0].id);
  assert.equal(state.requests[0].category,'到校課程');
  assert.equal(state.requests[0].district,'九龍城區');
  assert.equal(state.requests[0].title,'小四 STEM 創意科學工作坊');
  assert.equal(state.locale,'zh-Hant-HK');
});
check('attachment names, URLs, contact fields and structural values are preserved',()=>{
  const r=IQ.load().requests[0];
  assert.equal(r.files[0].name,'旧版报价文件.pdf');
  assert.equal(r.quotes[0].attachmentName,'供应商报价.docx');
  assert.equal(r.customUrl,'https://example.com/学校');
  assert.equal(r.email,'teacher@example.com');
  assert.equal(r.customMetadata.status,'matching');
  assert.equal(r.customMetadata.id,'record-11');
  assert.equal(r.customMetadata.amount,1234);
  assert.equal(r.customMetadata.enabled,true);
});
check('migration is persisted and idempotent',()=>{
  const state=IQ.load(),snapshot=JSON.stringify(state);
  assert.equal(JSON.parse(localStorage.getItem(IQ.storageKey)).locale,'zh-Hant-HK');
  assert.equal(JSON.stringify(locale.migrateState(state)),snapshot);
  assert.equal(JSON.stringify(IQ.load()),snapshot);
});
check('supplier and request matching categories and districts use the same script',()=>{
  const state=IQ.load(),r=state.requests[0],supplier=state.suppliers[0];
  assert(supplier.category.includes(r.category));
  assert(supplier.districts.includes(r.district));
});
check('draft migration preserves user fields and file names',()=>{
  const draft={title:'测试需求',category:'到校课程',district:'九龙城区',budget:1234,verified:true,files:[{name:'报价参考.pdf'}]};
  const result=locale.migrateDraft(draft);
  assert.equal(result,draft);
  assert.equal(result.category,'到校課程');
  assert.equal(result.district,'九龍城區');
  assert.equal(result.budget,1234);
  assert.equal(result.verified,true);
  assert.equal(result.files[0].name,'报价参考.pdf');
});
check('text conversion handles generated descriptions and leaves Traditional/ASCII unchanged',()=>{
  assert.equal(locale.text('供应商已有 3 个报价，30 分钟内请确认。'),'供應商已有 3 個報價，30 分鐘內請確認。');
  assert.equal(locale.text('200 人参加'),'200 人參加');
  assert.equal(locale.text('供應商已有 3 個報價，30 分鐘內請確認。'),'供應商已有 3 個報價，30 分鐘內請確認。');
  assert.equal(locale.text('IQ-2026-0011'),'IQ-2026-0011');
  assert.equal(locale.text('https://example.com/学校'),'https://example.com/学校');
});
check('new seed and explicit reset both produce Traditional demo records',()=>{
  const seed=IQ.seed();
  assert.equal(seed.locale,'zh-Hant-HK');
  assert.equal(seed.requests[0].category,'到校課程');
  const reset=IQ.reset();
  assert.equal(reset.locale,'zh-Hant-HK');
  assert.equal(reset.requests.length,4);
  assert.equal(JSON.parse(localStorage.getItem(IQ.storageKey)).locale,'zh-Hant-HK');
});
console.log(count+' locale migration scenarios passed.');
