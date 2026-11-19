/* Browser-local account and permission simulation. This is not server authentication. */
(function(global){
  'use strict';
  const PERMISSIONS=[
    {id:'requests.read',label:'查看需求',group:'需求與供應商'},
    {id:'requests.manage',label:'管理需求及派單',group:'需求與供應商'},
    {id:'suppliers.read',label:'查看供應商',group:'需求與供應商'},
    {id:'suppliers.review',label:'審核及停權供應商',group:'需求與供應商'},
    {id:'whatsapp.read',label:'查看 WhatsApp 通知',group:'通訊與報表'},
    {id:'whatsapp.send',label:'管理及模擬發送通知',group:'通訊與報表'},
    {id:'reports.export',label:'匯出營運報表',group:'通訊與報表'},
    {id:'accounts.read',label:'查看老師及供應商帳號',group:'帳號與管理'},
    {id:'accounts.manage',label:'管理老師及供應商帳號',group:'帳號與管理'},
    {id:'admins.manage',label:'管理管理員帳號',group:'帳號與管理'},
    {id:'roles.manage',label:'設定角色權限',group:'帳號與管理'},
    {id:'audit.read',label:'查看帳號及權限審計',group:'審計紀錄'}
  ];
  const KNOWN=new Set(PERMISSIONS.map(p=>p.id));
  const STAFF=new Set(['admin','superadmin']);
  const TYPES=new Set(['teacher','supplier','admin','superadmin']);
  const HIGH_PRIVILEGE=new Set(['admins.manage','roles.manage']);
  let sequence=0;
  const now=()=>new Date().toISOString();
  const text=value=>String(value==null?'':value).trim();
  const email=value=>text(value).toLowerCase();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function validateState(state){
    if(!state||!Array.isArray(state.requests)||!Array.isArray(state.suppliers)||!Array.isArray(state.events))throw Error('帳號資料未能載入，請重新開啟工作台。');
  }
  function defaultRoles(){return [
    {id:'owner',name:'超級管理員',description:'總後台完整控制權；系統保留此角色的全部權限。',permissions:PERMISSIONS.map(p=>p.id),system:true},
    {id:'operations',name:'營運管理員',description:'處理需求、供應商審核、通知及報表；不可修改帳號權限。',permissions:['requests.read','requests.manage','suppliers.read','suppliers.review','whatsapp.read','whatsapp.send','reports.export','accounts.read','audit.read'],system:true},
    {id:'reviewer',name:'審核管理員',description:'查看需求及帳號，負責供應商資格審核。',permissions:['requests.read','suppliers.read','suppliers.review','accounts.read'],system:true},
    {id:'readonly',name:'唯讀管理員',description:'查看需求、供應商、通知及帳號，不可修改營運資料。',permissions:['requests.read','suppliers.read','whatsapp.read','accounts.read','audit.read'],system:true}
  ];}
  function seedAccess(state){
    const createdAt=now();
    const base={phone:'',status:'active',school:'',supplierId:null,createdAt,lastLoginAt:null,loginRevision:0};
    const accounts=[
      {...base,id:'acct-owner',name:'平台擁有人',email:'owner@example.com',phone:'+852 5550 0001',type:'superadmin',roleId:'owner'},
      {...base,id:'acct-admin-1',name:'林營運',email:'operations@example.com',phone:'+852 5550 0002',type:'admin',roleId:'operations'},
      {...base,id:'acct-admin-2',name:'李審核',email:'reviewer@example.com',phone:'+852 5550 0003',type:'admin',roleId:'reviewer'},
      {...base,id:'acct-admin-3',name:'周查閱',email:'readonly@example.com',phone:'+852 5550 0004',type:'admin',roleId:'readonly'}
    ];
    const seen=new Set(accounts.map(a=>a.email));
    state.requests.forEach(r=>{
      const address=email(r.email);if(!address||seen.has(address))return;
      seen.add(address);accounts.push({...base,id:`acct-teacher-${accounts.filter(a=>a.type==='teacher').length+1}`,name:text(r.teacher)||'演示老師',email:address,phone:text(r.phone),type:'teacher',roleId:null,school:text(r.school)||'演示學校'});
    });
    if(!accounts.some(a=>a.type==='teacher'))accounts.push({...base,id:'acct-teacher-1',name:'陳老師',email:'teacher@example.com',phone:'+852 5550 8801',type:'teacher',roleId:null,school:'明德學校（演示）'});
    if(accounts.filter(a=>a.type==='teacher').length===1&&!seen.has('teacher2@example.com'))accounts.push({...base,id:'acct-teacher-2',name:'李老師',email:'teacher2@example.com',phone:'+852 5550 8802',type:'teacher',roleId:null,school:'育才小學（演示）'});
    state.suppliers.forEach((s,i)=>{
      const address=email(s.email)||`supplier${i+1}@example.com`;
      if(accounts.some(a=>email(a.email)===address))return;
      accounts.push({...base,id:`acct-supplier-${i+1}`,name:text(s.contact)||text(s.name),email:address,phone:text(s.phone),type:'supplier',roleId:null,supplierId:s.id});
    });
    return {version:1,roles:defaultRoles(),accounts,audit:[],nextId:100};
  }
  // Read-only permission checks can derive the initial demo accounts without modifying state.
  function accessFor(state){
    validateState(state);
    if(!state.access)return seedAccess(state);
    if(!Array.isArray(state.access.accounts)||!Array.isArray(state.access.roles)||!Array.isArray(state.access.audit))throw Error('帳號與權限資料不完整，請檢查本地演示資料。');
    return state.access;
  }
  function persist(state){if(global.IQ&&typeof global.IQ.save==='function')global.IQ.save(state);}
  function ensure(state){
    const access=accessFor(state);
    if(!state.access){state.access=access;persist(state);}
    return state.access;
  }
  function roles(state){return clone(accessFor(state).roles);}
  function permissions(){return PERMISSIONS.map(p=>({...p}));}
  function account(state,id){return accessFor(state).accounts.find(a=>a.id===id)||null;}
  function actorFor(access,id){
    const actor=access.accounts.find(a=>a.id===id);
    if(!actor)throw Error('請先選擇有效的演示登入帳號。');
    if(actor.status!=='active')throw Error('此帳號已停用，無法繼續操作。');
    return actor;
  }
  function owner(actor){return actor.type==='superadmin'&&actor.roleId==='owner'&&actor.status==='active';}
  function permitted(access,actorId,permission){
    if(!KNOWN.has(permission))return false;
    const actor=access.accounts.find(a=>a.id===actorId);
    if(!actor||actor.status!=='active'||!STAFF.has(actor.type))return false;
    const role=access.roles.find(r=>r.id===actor.roleId);
    return !!role&&Array.isArray(role.permissions)&&role.permissions.includes(permission)&&(role.id!=='owner'||actor.type==='superadmin');
  }
  function can(state,actorId,permission){try{return permitted(accessFor(state),actorId,permission);}catch(_){return false;}}
  function requireFrom(access,actorId,permission){
    const actor=actorFor(access,actorId);
    if(!permitted(access,actorId,permission))throw Error('此帳號沒有執行這項操作的權限。');
    return actor;
  }
  function requirePermission(state,actorId,permission){return requireFrom(accessFor(state),actorId,permission);}
  function targetFor(access,id){const target=access.accounts.find(a=>a.id===id);if(!target)throw Error('找不到這個帳號。');return target;}
  function requireManage(access,actorId,target){
    const actor=requireFrom(access,actorId,STAFF.has(target.type)?'admins.manage':'accounts.manage');
    if((target.type==='superadmin'||target.roleId==='owner')&&!owner(actor))throw Error('只有總後台擁有人可以管理超級管理員。');
    return actor;
  }
  function validProfile(state,access,candidate,excludeId){
    if(!candidate.name||candidate.name.length>80)throw Error('請填寫有效姓名，最多 80 個字。');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email))throw Error('請填寫有效電郵地址。');
    if(access.accounts.some(a=>a.id!==excludeId&&email(a.email)===candidate.email))throw Error('這個電郵已被其他帳號使用。');
    if(candidate.phone&&(!/^[+\d\s()-]+$/.test(candidate.phone)||candidate.phone.replace(/\D/g,'').length<8))throw Error('請填寫有效聯絡電話。');
    if(candidate.type==='teacher'&&!candidate.school)throw Error('老師帳號必須綁定學校。');
    if(candidate.type==='supplier'&&!state.suppliers.some(s=>s.id===candidate.supplierId))throw Error('請將供應商帳號綁定至現有公司。');
    if(STAFF.has(candidate.type)){
      if(!access.roles.some(r=>r.id===candidate.roleId))throw Error('請選擇有效的管理角色。');
      if(candidate.roleId==='owner'&&candidate.type!=='superadmin')throw Error('擁有人角色只適用於超級管理員。');
    }else if(candidate.roleId!==null)throw Error('老師及供應商帳號不能分配管理權限。');
  }
  function guardLastOwner(access,current,next){
    if(current.type==='superadmin'&&current.roleId==='owner'&&current.status==='active'&&!(next.type==='superadmin'&&next.roleId==='owner'&&next.status==='active')){
      const remaining=access.accounts.filter(a=>a.id!==current.id&&owner(a));
      if(!remaining.length)throw Error('必須保留至少一個啟用中的總後台擁有人帳號。');
    }
  }
  function guardAssignableRole(access,actor,candidate){
    if(!STAFF.has(candidate.type)||owner(actor))return;
    const role=access.roles.find(r=>r.id===candidate.roleId);
    if(role&&role.permissions.some(p=>!permitted(access,actor.id,p)))throw Error('不能分配高於您目前權限的管理角色。');
  }
  function audit(state,access,actor,action,targetId,detail){
    const at=now();
    const item={id:`access-${Date.now().toString(36)}-${++sequence}`,actorId:actor.id,actorName:actor.name,action:text(action),targetId:text(targetId),detail:text(detail),at};
    access.audit.unshift(item);
    state.events.unshift({id:`evt-${item.id}`,requestId:null,type:'access_change',text:'帳號與權限操作已記錄',title:'帳號與權限操作已記錄',at});
    return item;
  }
  function commit(state,access,actor,action,targetId,detail){state.access=access;audit(state,access,actor,action,targetId,detail);persist(state);}
  function nextAccountId(access){
    let n=Number.isInteger(access.nextId)?access.nextId:100;
    while(access.accounts.some(a=>a.id===`acct-${n}`))n++;
    return {id:`acct-${n}`,nextId:n+1};
  }
  function createAccount(state,actorId,data){
    const access=accessFor(state);
    if(!data||!TYPES.has(data.type))throw Error('請選擇有效的帳號類型。');
    const actor=requireManage(access,actorId,data);
    if(data.status!=null&&!['active','disabled'].includes(data.status))throw Error('帳號狀態必須為啟用或停用。');
    const next=nextAccountId(access);
    const candidate={id:next.id,name:text(data.name),email:email(data.email),phone:text(data.phone),type:data.type,
      roleId:STAFF.has(data.type)?text(data.roleId)||(data.type==='superadmin'?'owner':'operations'):null,
      status:data.status||'active',school:data.type==='teacher'?text(data.school):'',supplierId:data.type==='supplier'?text(data.supplierId):null,
      createdAt:now(),lastLoginAt:null,loginRevision:0};
    if(!STAFF.has(data.type)&&data.roleId!=null)throw Error('老師及供應商帳號不能分配管理權限。');
    validProfile(state,access,candidate);guardAssignableRole(access,actor,candidate);
    access.accounts.push(candidate);access.nextId=next.nextId;
    commit(state,access,actor,'account_created',candidate.id,`已建立${{teacher:'老師',supplier:'供應商',admin:'管理員',superadmin:'總後台'}[candidate.type]}帳號：${candidate.name}`);
    return candidate;
  }
  function updateAccount(state,actorId,id,patch){
    const access=accessFor(state),current=targetFor(access,id),actor=requireManage(access,actorId,current);
    if(!patch||typeof patch!=='object')throw Error('請提供需要更新的帳號資料。');
    if(has(patch,'type')&&patch.type!==current.type)throw Error('建立後不能更改帳號類型。');
    if(has(patch,'status')&&patch.status!==current.status)throw Error('請使用啟用或停用操作修改帳號狀態。');
    const candidate={...current};
    ['name','phone'].forEach(k=>{if(has(patch,k))candidate[k]=text(patch[k]);});
    if(has(patch,'email'))candidate.email=email(patch.email);
    if(has(patch,'school'))candidate.school=current.type==='teacher'?text(patch.school):'';
    if(has(patch,'supplierId'))candidate.supplierId=current.type==='supplier'?text(patch.supplierId):null;
    if(has(patch,'roleId'))candidate.roleId=STAFF.has(current.type)?text(patch.roleId):patch.roleId;
    if(candidate.roleId==='owner'&&!owner(actor))throw Error('只有總後台擁有人可以分配擁有人角色。');
    validProfile(state,access,candidate,id);guardLastOwner(access,current,candidate);
    if(candidate.roleId!==current.roleId)guardAssignableRole(access,actor,candidate);
    Object.assign(current,candidate);
    commit(state,access,actor,'account_updated',id,`已更新帳號資料：${current.name}`);
    return current;
  }
  function setStatus(state,actorId,id,status){
    const access=accessFor(state),target=targetFor(access,id),actor=requireManage(access,actorId,target);
    if(!['active','disabled'].includes(status))throw Error('帳號狀態必須為啟用或停用。');
    guardLastOwner(access,target,{...target,status});
    if(target.status===status)return target;
    target.status=status;
    commit(state,access,actor,status==='active'?'account_enabled':'account_disabled',id,`${status==='active'?'已啟用':'已停用'}帳號：${target.name}`);
    return target;
  }
  function setRole(state,actorId,id,roleId){return updateAccount(state,actorId,id,{roleId});}
  function updateRole(state,actorId,roleId,permissionIds){
    const access=accessFor(state),actor=requireFrom(access,actorId,'roles.manage'),role=access.roles.find(r=>r.id===roleId);
    if(!role)throw Error('找不到這個管理角色。');
    if(role.id==='owner')throw Error('超級管理員角色的系統權限不能修改。');
    if(!Array.isArray(permissionIds)||permissionIds.some(p=>!KNOWN.has(p)))throw Error('角色包含無效的權限項目。');
    const next=[...new Set(permissionIds)];
    if(!owner(actor)){
      if(next.some(p=>HIGH_PRIVILEGE.has(p)&&!role.permissions.includes(p)))throw Error('只有總後台擁有人可以授予管理員或權限設定權限。');
      if(next.some(p=>!permitted(access,actor.id,p)))throw Error('只能分配您目前擁有的權限。');
    }
    role.permissions=next;
    commit(state,access,actor,'role_updated',role.id,`已更新角色權限：${role.name}`);
    return role;
  }
  function resetLogin(state,actorId,id){
    const access=accessFor(state),target=targetFor(access,id),actor=requireManage(access,actorId,target);
    target.loginRevision=(Number.isInteger(target.loginRevision)?target.loginRevision:0)+1;
    target.lastLoginResetAt=now();
    target.loginNote='已重設演示登入狀態；未發送電郵或修改真實密碼。';
    commit(state,access,actor,'login_reset',id,`已重設演示登入狀態：${target.name}`);
    return target;
  }
  function record(state,actorId,action,targetId,detail){
    const access=accessFor(state),actor=actorFor(access,actorId);
    if(!text(action))throw Error('請填寫有效的操作類型。');
    state.access=access;const entry=audit(state,access,actor,action,targetId,detail);persist(state);return entry;
  }
  global.IQAccess={ensure,roles,permissions,account,can,requirePermission,createAccount,updateAccount,setStatus,setRole,updateRole,resetLogin,record};
})(typeof window!=='undefined'?window:globalThis);
