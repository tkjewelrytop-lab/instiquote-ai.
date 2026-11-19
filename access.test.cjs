const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const storage=new Map();
const sandbox={window:{localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))}},Date,console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs','model.js'),'utf8'),sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'docs','access.js'),'utf8'),sandbox);
const IQ=sandbox.window.IQ,A=sandbox.window.IQAccess;
const OWNER='acct-owner';let scenarios=0;
function check(name,fn){fn();scenarios++;console.log(`PASS ${name}`);}
function fresh(){const s=IQ.seed();A.ensure(s);return s;}
function teacher(extra={}){return {type:'teacher',name:'王老師',email:'newteacher@example.com',phone:'+852 5550 8803',school:'新光小學（演示）',...extra};}

check('old requests and suppliers gain accounts once without losing records',()=>{
  const s=IQ.seed(),before=JSON.stringify({requests:s.requests,suppliers:s.suppliers});
  const access=A.ensure(s);
  assert.equal(JSON.stringify({requests:s.requests,suppliers:s.suppliers}),before);
  const first=A.account(s,'acct-teacher-1');assert.equal(first.email,s.requests[0].email);assert.equal(first.phone,s.requests[0].phone);assert.equal(first.school,s.requests[0].school);
  assert.equal(A.account(s,'acct-supplier-1').supplierId,'sup-1');
  assert.equal(access.accounts.filter(a=>a.type==='supplier').length,s.suppliers.length);
  A.setStatus(s,OWNER,'acct-teacher-1','disabled');
  const count=access.accounts.length;A.ensure(s);assert.equal(access.accounts.length,count);assert.equal(first.status,'disabled');
});

check('default roles distinguish operations, reviewer, readonly and customer permissions',()=>{
  const s=fresh();
  assert(A.can(s,OWNER,'admins.manage'));assert(A.can(s,OWNER,'roles.manage'));
  assert(A.can(s,'acct-admin-1','requests.manage'));assert(A.can(s,'acct-admin-1','whatsapp.send'));assert(!A.can(s,'acct-admin-1','accounts.manage'));
  assert(A.can(s,'acct-admin-2','suppliers.review'));assert(!A.can(s,'acct-admin-2','whatsapp.read'));
  assert(A.can(s,'acct-admin-3','requests.read'));assert(!A.can(s,'acct-admin-3','requests.manage'));
  assert(!A.can(s,'acct-teacher-1','requests.read'));assert(!A.can(s,'acct-supplier-1','accounts.manage'));assert(!A.can(s,OWNER,'unknown.permission'));
  const copy=A.roles(s);copy[0].permissions.length=0;assert(A.can(s,OWNER,'accounts.manage'));
});

check('unauthorised account, role and administrator changes have no side effects',()=>{
  const s=fresh(),before=JSON.stringify(s);
  assert.throws(()=>A.createAccount(s,'acct-admin-1',teacher()),/權限/);
  assert.throws(()=>A.updateAccount(s,'acct-admin-2','acct-admin-1',{roleId:'owner'}),/權限/);
  assert.throws(()=>A.updateRole(s,'acct-admin-3','readonly',['requests.manage']),/權限/);
  assert.throws(()=>A.resetLogin(s,'acct-teacher-1','acct-admin-1'),/權限/);
  assert.equal(JSON.stringify(s),before);
  const old=IQ.seed(),oldBefore=JSON.stringify(old);assert.throws(()=>A.createAccount(old,'missing',teacher()));assert.equal(JSON.stringify(old),oldBefore);
});

check('teacher and multi-contact supplier accounts can be created and edited with valid links',()=>{
  const s=fresh(),requestsBefore=JSON.stringify(s.requests),suppliersBefore=JSON.stringify(s.suppliers);
  const t=A.createAccount(s,OWNER,teacher());assert.equal(t.type,'teacher');assert.equal(t.roleId,null);
  const contact=A.createAccount(s,OWNER,{type:'supplier',name:'第二聯絡人',email:'supplier-extra@example.com',phone:'+852 5550 7799',supplierId:'sup-1'});
  assert.equal(contact.supplierId,'sup-1');assert.equal(A.account(s,'acct-supplier-1').supplierId,'sup-1');
  A.updateAccount(s,OWNER,t.id,{name:'王資深老師',school:'明德中學（演示）',email:'UpdatedTeacher@Example.com'});
  assert.equal(t.name,'王資深老師');assert.equal(t.email,'updatedteacher@example.com');
  assert.equal(JSON.stringify(s.requests),requestsBefore);assert.equal(JSON.stringify(s.suppliers),suppliersBefore);
  assert.equal(IQ.load().access.accounts.find(a=>a.id===contact.id).supplierId,'sup-1');
});

check('invalid email, school, supplier and type changes are rejected atomically',()=>{
  const s=fresh(),before=JSON.stringify(s);
  for(const input of [teacher({email:'not-an-email'}),teacher({email:'TEACHER@EXAMPLE.COM'}),teacher({school:''}),{type:'supplier',name:'錯誤綁定',email:'bad-link@example.com',supplierId:'missing'}])assert.throws(()=>A.createAccount(s,OWNER,input));
  assert.throws(()=>A.updateAccount(s,OWNER,'acct-admin-1',{name:'不應保存',email:'teacher@example.com',roleId:'readonly'}));
  assert.throws(()=>A.updateAccount(s,OWNER,'acct-teacher-1',{type:'admin'}));
  assert.throws(()=>A.updateAccount(s,OWNER,'acct-teacher-1',{roleId:'operations'}));
  assert.equal(JSON.stringify(s),before);
});

check('disabled administrators lose permissions and cannot perform writes',()=>{
  const s=fresh();A.setStatus(s,OWNER,'acct-admin-1','disabled');
  assert(!A.can(s,'acct-admin-1','requests.manage'));
  assert.throws(()=>A.requirePermission(s,'acct-admin-1','requests.read'),/停用/);
  const before=JSON.stringify(s);assert.throws(()=>A.record(s,'acct-admin-1','login','acct-admin-1','不能登入'),/停用/);assert.equal(JSON.stringify(s),before);
  A.setStatus(s,OWNER,'acct-admin-1','active');assert(A.can(s,'acct-admin-1','requests.manage'));
});

check('last active owner cannot be disabled or demoted and owner role is immutable',()=>{
  const s=fresh(),before=JSON.stringify(s);
  assert.throws(()=>A.setStatus(s,OWNER,OWNER,'disabled'),/至少一個/);
  assert.throws(()=>A.setRole(s,OWNER,OWNER,'operations'),/至少一個/);
  assert.throws(()=>A.updateRole(s,OWNER,'owner',[]),/不能修改/);
  assert.equal(JSON.stringify(s),before);
  const second=A.createAccount(s,OWNER,{type:'superadmin',name:'第二擁有人',email:'owner-two@example.com',roleId:'owner'});
  A.setRole(s,second.id,OWNER,'operations');assert(!A.can(s,OWNER,'admins.manage'));assert(A.can(s,second.id,'admins.manage'));
  assert.throws(()=>A.setStatus(s,second.id,second.id,'disabled'),/至少一個/);
});

check('role edits immediately control actions and delegated managers cannot grant higher privileges',()=>{
  const s=fresh();A.updateRole(s,OWNER,'readonly',['requests.read','whatsapp.read','accounts.read','accounts.manage']);
  assert(A.can(s,'acct-admin-3','accounts.manage'));
  const t=A.createAccount(s,'acct-admin-3',teacher({email:'delegated@example.com'}));assert.equal(t.type,'teacher');
  assert.throws(()=>A.createAccount(s,'acct-admin-3',{type:'admin',name:'越權',email:'unauthorised@example.com',roleId:'operations'}),/權限/);
  A.updateRole(s,OWNER,'reviewer',['requests.read','suppliers.read','roles.manage']);
  const before=JSON.stringify(s);
  assert.throws(()=>A.updateRole(s,'acct-admin-2','readonly',['admins.manage']),/擁有人/);
  assert.throws(()=>A.updateRole(s,'acct-admin-2','readonly',['requests.manage']),/目前擁有/);
  assert.equal(JSON.stringify(s),before);
});

check('profile and role changes are atomic and superadmin management cannot be delegated',()=>{
  const s=fresh();
  A.updateAccount(s,OWNER,'acct-admin-1',{name:'新營運管理員',roleId:'readonly'});
  assert.equal(A.account(s,'acct-admin-1').name,'新營運管理員');assert(!A.can(s,'acct-admin-1','requests.manage'));
  A.updateRole(s,OWNER,'operations',['requests.read','admins.manage']);
  A.setRole(s,OWNER,'acct-admin-1','operations');
  const before=JSON.stringify(s);
  assert.throws(()=>A.updateAccount(s,'acct-admin-1',OWNER,{name:'越權更名'}),/擁有人/);
  assert.throws(()=>A.createAccount(s,'acct-admin-1',{type:'superadmin',name:'越權',email:'fake-owner@example.com'}),/擁有人/);
  assert.throws(()=>A.setRole(s,'acct-admin-1','acct-admin-1','readonly'),/高於/);
  assert.throws(()=>A.createAccount(s,'acct-admin-1',{type:'admin',name:'越權角色',email:'fake-role@example.com',roleId:'readonly'}),/高於/);
  assert.equal(JSON.stringify(s),before);
});

check('login reset and account audit persist without exposing contact data in global events',()=>{
  const s=fresh(),t=A.account(s,'acct-teacher-1');A.resetLogin(s,OWNER,t.id);A.resetLogin(s,OWNER,t.id);
  assert.equal(t.loginRevision,2);assert(t.loginNote.includes('未發送電郵'));
  const row=A.record(s,OWNER,'account_checked',t.id,'已查閱演示帳號');assert.equal(row.actorName,'平台擁有人');
  assert.equal(IQ.load().access.accounts.find(a=>a.id===t.id).loginRevision,2);
  assert.equal(s.access.audit.length,3);assert(s.access.audit.every(a=>a.actorId===OWNER));
  assert(s.events.slice(0,3).every(e=>!e.text.includes('example.com')&&!e.text.includes(t.name)));
  assert(!JSON.stringify(s.access).includes('password'));
});
console.log(`${scenarios} account and permission scenarios passed.`);
