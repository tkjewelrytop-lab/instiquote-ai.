(function (global) {
  'use strict';

  // All notifications are browser-local simulations, never external sends.
  const note = '\n\n（原型演示：並未發送真實 WhatsApp 訊息）';
  const TEMPLATE_DEFINITIONS = [
    { id:'request_received', title:'需求提交確認', recipientType:'teacher', status:'approved', description:'確認需求及老師收集截止時間。', variables:['order_number','category','deadline'], body:'【InstiQuote AI｜需求已收妥】\n訂單：{{order_number}}\n類別：{{category}}\n老師收集截止：{{deadline}}\n我們正為您匹配合適供應商。'+note },
    { id:'supplier_invited', title:'供應商報價邀請', recipientType:'supplier', status:'approved', description:'分開邀請回覆、接單承諾交報及老師收集期限。', variables:['order_number','stage_number','category','district','reply_deadline','quote_deadline','deadline'], body:'【InstiQuote AI｜第 {{stage_number}} 階段報價邀請】\n訂單：{{order_number}}\n類別：{{category}} · {{district}}\n邀請回覆期限：{{reply_deadline}}\n接單後承諾交報：{{quote_deadline}}\n老師收集截止：{{deadline}}\n請到平台查看匿名需求及確認接單。'+note },
    { id:'supplier_confirmed', title:'供應商接單進度', recipientType:'teacher', status:'approved', description:'接單與有效報價分開計數。', variables:['order_number','accepted_count','valid_count'], body:'【InstiQuote AI｜供應商接單進度】\n訂單：{{order_number}}\n目前 {{accepted_count}} 間供應商已接單，已核為有效報價 {{valid_count}} / 5 份。\n接單不代表已交報價；有效方案會分階段交付。'+note },
    { id:'quote_received', title:'收到待審報價', recipientType:'teacher', status:'approved', description:'只通知已交及有效數量，未審核報價不計入目標，也不提前公開內容或聯絡。', variables:['order_number','submitted_count','valid_count'], body:'【InstiQuote AI｜已收到供應商報價】\n訂單：{{order_number}}\n共已提交 {{submitted_count}} 份，已核為有效 {{valid_count}} / 5 份。\n新交或修訂報價須先審核；通過後分階段交付，老師即可查看該批所有有效供應商聯絡資料。'+note },
    { id:'quotes_ready', title:'有效報價已交付', recipientType:'teacher', status:'approved', description:'已交付的有效報價可直接查看所有供應商聯絡資料。', variables:['order_number','quote_count'], body:'【InstiQuote AI｜有效報價已交付】\n訂單：{{order_number}}\n目前可查看 {{quote_count}} 份有效報價及供應商聯絡資料。\n您可選 1 至 3 間供應商細談；洽談名單不代表成交。'+note },
    { id:'deadline_reminder', title:'供應商交報／修訂提醒', recipientType:'supplier', status:'approved', description:'只提醒仍須交報、澄清或重確認的有效參與者。', variables:['order_number','revision','quote_deadline','deadline'], body:'【InstiQuote AI｜交報及修訂提醒】\n訂單：{{order_number}} · 需求 v{{revision}}\n承諾交報期限：{{quote_deadline}}\n老師收集截止：{{deadline}}\n請按最新需求提交、修訂或重新確認報價。'+note },
    { id:'supplier_selected', title:'老師洽談名單', recipientType:'teacher', status:'approved', description:'顯示老師已挑選的 1 至 3 間洽談對象，不代表成交，其他已交付有效報價仍可查看聯絡。', variables:['order_number','shortlist_count','supplier_list'], body:'【InstiQuote AI｜洽談名單】\n訂單：{{order_number}}\n已挑選 {{shortlist_count}} 間供應商細談：\n{{supplier_list}}\n這是洽談名單，不代表成交；可返回平台調整。'+note },
    { id:'stage_delivered', title:'分階段報價交付', recipientType:'teacher', status:'approved', description:'交付本批通過審核的有效報價；不足目標可繼續下一階段。', variables:['order_number','stage_number','batch_count','quote_count','supplier_list'], body:'【InstiQuote AI｜第 {{stage_number}} 階段有效報價已交付】\n訂單：{{order_number}}\n本批 {{batch_count}} 份，累計可查看 {{quote_count}} 份有效報價。\n{{supplier_list}}\n您可先比較及選 1 至 3 間細談；不足目標時可再收集下一階段。'+note },
    { id:'request_updated', title:'需求更新及交期延後', recipientType:'supplier', status:'approved', description:'讓所有歷史參與者知情；仍可參與者按延後期限重確認或修訂，已退出或不符資格者只接收更新。', variables:['order_number','revision','change_reason','quote_deadline','deadline','participation_instruction'], body:'【InstiQuote AI｜需求已更新，交期已延後】\n訂單：{{order_number}} · 最新需求 v{{revision}}\n變更原因：{{change_reason}}\n交報安排：{{quote_deadline}}\n新老師收集截止：{{deadline}}\n{{participation_instruction}}'+note },
    { id:'stage_started', title:'下一階段收集已開始', recipientType:'teacher', status:'approved', description:'有效報價保留，繼續尋找新供應商填補缺額。', variables:['order_number','stage_number','deadline','valid_count'], body:'【InstiQuote AI｜第 {{stage_number}} 階段收集已開始】\n訂單：{{order_number}}\n目前有效報價 {{valid_count}} / 5 份。\n新收集截止：{{deadline}}\n平台會按缺額繼續尋找合適供應商；已交付的有效方案仍可比較。'+note },
    { id:'request_cancelled_teacher', title:'需求取消確認', recipientType:'teacher', status:'approved', description:'確認取消並停止催報、派單及交報。', variables:['order_number','change_reason'], body:'【InstiQuote AI｜需求已取消】\n訂單：{{order_number}}\n原因：{{change_reason}}\n已停止派單、催報及交報，保留操作紀錄。本次取消不會觸發失約扣分。'+note },
    { id:'request_cancelled_supplier', title:'通知供應商需求取消', recipientType:'supplier', status:'approved', description:'向所有參與供應商通知停止交報及提醒。', variables:['order_number','change_reason'], body:'【InstiQuote AI｜需求已取消】\n訂單：{{order_number}}\n原因：{{change_reason}}\n請停止本次報價準備，平台不再催報或接收新報價。本次取消不會觸發失約扣分。'+note },
    { id:'shortlist_updated', title:'洽談名單更新', recipientType:'teacher', status:'approved', description:'記錄老師自行篩選的 1 至 3 間供應商，可隨時移除及另選。', variables:['order_number','shortlist_count','supplier_list'], body:'【InstiQuote AI｜洽談名單已更新】\n訂單：{{order_number}}\n目前名單：{{shortlist_count}} 間\n{{supplier_list}}\n洽談名單不代表成交；已交付的其他有效供應商聯絡仍可查看。'+note }
  ];
  const now = () => new Date().toISOString();
  const text = value => String(value == null ? '' : value).trim();
  let eventSequence = 0;

  function templates() {
    return TEMPLATE_DEFINITIONS.map(template => ({ ...template, variables: [...template.variables] }));
  }

  function templateFor(id) {
    const template = TEMPLATE_DEFINITIONS.find(item => item.id === id);
    if (!template) throw new Error('找不到這個 WhatsApp 訊息範本。');
    return template;
  }

  // Return plain text; the caller must escape this text when rendering HTML.
  function preview(templateId, variables) {
    const template = templateFor(templateId);
    const values = variables && typeof variables === 'object' ? variables : {};
    return template.body.replace(/\{\{([a-z_]+)\}\}/g, (placeholder, key) => {
      const value = values[key];
      return value === undefined || value === null || value === '' ? placeholder : String(value);
    });
  }

  function validateState(state) {
    if (!state || !Array.isArray(state.requests) || !Array.isArray(state.suppliers) || !Array.isArray(state.events)) {
      throw new Error('通知中心資料不完整，請重新載入工作台。');
    }
  }

  function persist(state) {
    if (global.IQ && typeof global.IQ.save === 'function') global.IQ.save(state);
  }

  function log(state, message, action, content) {
    const at = now();
    state.events.unshift({
      id: `evt-wa-${Date.now().toString(36)}-${++eventSequence}`,
      requestId: message.requestId, type: `whatsapp_${action}`, title: content, text: content, at,
      messageId: message.id, recipientType: message.recipientType
    });
  }

  function formatDeadline(value) {
    if (!Number.isFinite(new Date(value).getTime())) throw new Error('這份需求沒有有效的截止時間。');
    return new Date(value).toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  const validQuotes = (state, request) => global.IQ?.validQuotes ? global.IQ.validQuotes(state, request) : request.quotes.filter(q => !q.reviewStatus || q.reviewStatus === 'valid');
  const deliveredQuotes = (state, request) => global.IQ?.deliveredQuotes ? global.IQ.deliveredQuotes(state, request) : validQuotes(state, request).filter(q => request.deliveredQuoteIds?.includes(q.id) || ['ready','closed','selected'].includes(request.status));
  const cancellationTemplates = new Set(['request_cancelled_teacher','request_cancelled_supplier']);
  const stageTemplates = new Set(['quotes_ready','stage_delivered']);
  const quoteVersion = q => `${q.id}:${q.requestRevision||1}:${q.quoteRevision||1}`;
  const shortlistTemplates = new Set(['supplier_selected','shortlist_updated']);
  function supplierSafe(value, request) {
    let result = text(value);
    [request.school,request.teacher,request.phone,request.email].filter(Boolean).forEach(v => { result=result.split(v).join('［已隱藏］'); });
    return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'［電郵已隱藏］').replace(/(?:\+?852[\s-]?)?\b[2-9]\d{3}[\s-]?\d{4}\b/g,'［電話已隱藏］');
  }
  function contactList(state, quotes) {
    return quotes.map(q => { const s=state.suppliers.find(s => s.id===q.supplierId);return s ? `${s.name}｜${s.contact}｜${s.phone}｜${s.email}` : ''; }).filter(Boolean).join('\n') || '名單目前為空，可返回平台繼續比較。';
  }

  // Resolve recipient and content from current records; callers cannot inject counts or contacts.
  function prepare(state, data) {
    validateState(state);
    if (!data || typeof data !== 'object') throw new Error('請先選擇訊息範本及對應需求。');
    const template=templateFor(data.templateId);
    if (data.recipientType!==template.recipientType) throw new Error('此範本不適用於所選收件人類型。');
    const request=state.requests.find(r=>r.id===data.requestId);
    if (!request) throw new Error('找不到對應需求，無法建立通知。');
    if (request.status==='cancelled' && !cancellationTemplates.has(template.id)) throw new Error('需求已取消，不能建立邀請、催報或報價通知。');
    if (cancellationTemplates.has(template.id) && request.status!=='cancelled') throw new Error('需求取消後才可以建立取消通知。');
    const valid=validQuotes(state,request),delivered=deliveredQuotes(state,request);
    const shortlisted=delivered.filter(q=>(request.shortlistedQuoteIds || (request.selectedQuoteId?[request.selectedQuoteId]:[])).includes(q.id));
    const batch=Array.isArray(data.quoteIds)?delivered.filter(q=>data.quoteIds.includes(q.id)):delivered;
    const emptyStageEvent=template.id==='stage_delivered' && data.eventId && state.events.some(e=>e.id===data.eventId && e.type==='stage_delivered' && e.requestId===request.id && Array.isArray(e.quoteIds) && !e.quoteIds.length && (e.revision||1)===(request.revision||1));
    if (stageTemplates.has(template.id) && !batch.length && !emptyStageEvent) throw new Error('先交付已核為有效的報價，再建立交付通知。');
    if (template.id==='supplier_selected'&&!shortlisted.length) throw new Error('老師建立洽談名單後，才可以建立名單通知。');
    const acceptedCount=request.invitations.filter(i=>i.status==='accepted').length;
    if (template.id==='supplier_confirmed'&&!acceptedCount) throw new Error('這份需求尚未有供應商確認接單。');
    if (template.id==='quote_received'&&!request.quotes.length) throw new Error('這份需求尚未收到報價。');
    let recipientName=text(request.teacher)||'老師',recipientPhone=text(request.phone),supplierId=null,invitation=null;
    if (template.recipientType==='supplier') {
      const supplier=state.suppliers.find(s=>s.id===data.supplierId);
      if (!supplier) throw new Error('請選擇有效的供應商收件人。');
      invitation=request.invitations.find(i=>i.supplierId===supplier.id);
      if (!invitation) throw new Error('這間供應商未獲邀參與本次需求。');
      if (!['request_updated','request_cancelled_supplier'].includes(template.id)) {
        if (supplier.status!=='approved') throw new Error('供應商尚未通過審核或已被停權。');
        if (template.id==='supplier_invited'&&(invitation.status!=='invited'||new Date(invitation.replyDeadline||request.deadline).getTime()<=Date.now())) throw new Error('邀請已回覆、失效或不再適用。');
      }
      if (template.id==='deadline_reminder') {
        const q=request.quotes.find(q=>q.supplierId===supplier.id);
        if (invitation.status!=='accepted') throw new Error('截止提醒只適用於已接單的供應商。');
        if (q&&!['clarification','reconfirmation'].includes(q.reviewStatus)) throw new Error('這間供應商已提交報價，無須發送截止提醒。');
        if (!['matching','collecting'].includes(request.status)||new Date(invitation.quoteDueAt||request.deadline).getTime()<=Date.now()||new Date(request.deadline).getTime()<=Date.now()) throw new Error('交報期限已結束，無法建立截止提醒。');
      }
      supplierId=supplier.id;recipientName=text(supplier.name)||'供應商';recipientPhone=text(supplier.phone);
    }
    if (recipientPhone.replace(/\D/g,'').length<8) throw new Error('收件人缺少有效電話，請先檢查聯絡資料。');
    let participationInstruction='',updatedQuoteDeadline=null;
    if(template.id==='request_updated'){
      const company=state.suppliers.find(s=>s.id===supplierId),q=request.quotes.find(q=>q.supplierId===supplierId);
      const qualified=company?.status==='approved'&&company.category.includes(request.category)&&company.districts.includes(request.district);
      const participating=qualified&&['accepted','invited','released'].includes(invitation?.status)&&
        (invitation.status!=='released'||q?.reviewStatus==='reconfirmation')&&
        ['matching','collecting','ready'].includes(request.status)&&new Date(invitation.quoteDueAt||request.deadline).getTime()>Date.now();
      if(participating){
        updatedQuoteDeadline=formatDeadline(invitation.quoteDueAt||request.deadline);
        participationInstruction=invitation.status==='invited'?'請查看完整新規格，在邀請回覆期限內確認接單，接單後按承諾期限提交報價。':invitation.status==='released'?'您可在尚有接單名額時，按新規格重新提交報價；須審核通過後才交付老師。':'您仍參與本次需求。請查看完整新規格；已提交報價須重新確認或修訂，審核通過後才再次交付老師。';
      }else{
        updatedQuoteDeadline='不適用（本次無交報安排）';
        const reason=invitation?.status==='withdrawn'?'您已退出本次需求':!qualified?'公司資格或服務範圍不符合本版需求':['expired','reply_expired'].includes(invitation?.status)?'先前參與資格已逾期或失效':'本次參與安排已停止';
        participationInstruction=`此通知僅供更新知情。${reason}，無須及不可繼續交報。`;
      }
    }
    const chosen=shortlistTemplates.has(template.id)?shortlisted:batch;
    const values={order_number:request.id,category:request.category,district:request.district,deadline:formatDeadline(request.deadline),
      reply_deadline:formatDeadline(invitation?.replyDeadline||request.deadline),quote_deadline:updatedQuoteDeadline||formatDeadline(invitation?.quoteDueAt||request.deadline),participation_instruction:participationInstruction,
      revision:request.revision||1,stage_number:data.stage||request.stage||1,quote_count:delivered.length,valid_count:valid.length,submitted_count:request.quotes.length,accepted_count:acceptedCount,
      batch_count:batch.length,shortlist_count:shortlisted.length,supplier_list:emptyStageEvent?'本批沒有新增有效報價。您可接受現況、延期、調整需求或取消。':contactList(state,chosen),change_reason:template.recipientType==='supplier'?supplierSafe(data.reason||request.cancelReason||request.versions?.at(-1)?.reason||'請到平台查看更新紀錄。',request):text(data.reason||request.cancelReason||'請到平台查看操作紀錄。')};
    return {notificationVersion:2,templateId:template.id,requestId:request.id,recipientType:template.recipientType,recipientName,recipientPhone,supplierId,
      requestRevision:request.revision||1,stage:data.stage||request.stage||1,quoteIds:stageTemplates.has(template.id)?batch.map(q=>q.id):shortlistTemplates.has(template.id)?shortlisted.map(q=>q.id):[],
      quoteVersions:Object.fromEntries((stageTemplates.has(template.id)?batch:shortlistTemplates.has(template.id)?shortlisted:[]).map(q=>[q.id,quoteVersion(q)])),
      eventId:data.eventId||null,reason:text(data.reason),body:preview(template.id,values)};
  }

  // Migrate old browser state once. Existing, intentionally empty queues stay empty.
  function ensure(state) {
    validateState(state);
    if (state.whatsapp && Array.isArray(state.whatsapp.messages)) {
      const maxId = state.whatsapp.messages.reduce((max, item) => Math.max(max, Number(String(item.id).replace(/^wa-/, '')) || 0), 0);
      if (!Number.isInteger(state.whatsapp.nextId) || state.whatsapp.nextId <= maxId) {
        state.whatsapp.nextId = maxId + 1;
        persist(state);
      }
      return state.whatsapp;
    }
    const messages = [];
    const requests = state.requests;
    const first = requests.find(request => request.quotes.length > 0) || requests[0];
    const ready = requests.find(request => ['ready', 'closed', 'selected'].includes(request.status) && request.quotes.length > 0);
    const supplierRequest = requests.find(request => request.invitations.some(invitation => invitation.status === 'invited' && state.suppliers.some(supplier => supplier.id === invitation.supplierId && supplier.status === 'approved')));
    const supplierInvitation = supplierRequest && supplierRequest.invitations.find(invitation => invitation.status === 'invited' && state.suppliers.some(supplier => supplier.id === invitation.supplierId && supplier.status === 'approved'));
    const examples = [
      first && { templateId: 'request_received', requestId: first.id, recipientType: 'teacher', status: 'read', hours: 3 },
      supplierRequest && supplierInvitation && { templateId: 'supplier_invited', requestId: supplierRequest.id, recipientType: 'supplier', supplierId: supplierInvitation.supplierId, status: 'delivered', hours: 2 },
      first && first.quotes.length > 0 && { templateId: 'quote_received', requestId: first.id, recipientType: 'teacher', status: 'failed', hours: 1 },
      ready && { templateId: 'quotes_ready', requestId: ready.id, recipientType: 'teacher', status: 'queued', hours: 0 }
    ].filter(Boolean);
    examples.forEach(example => {
      try {
        const prepared = prepare(state, example);
        const at = new Date(Date.now() - example.hours * 3600000).toISOString();
        messages.push({ ...prepared, id: `wa-${messages.length + 1}`, status: example.status,
          createdAt: at, updatedAt: at, attempts: example.status === 'queued' ? 0 : 1,
          error: example.status === 'failed' ? '模擬連線逾時，尚未發送任何真實訊息。' : null });
      } catch (_) { /* Partial old demo data may not support every example. */ }
    });
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.whatsapp = { messages, nextId: messages.length + 1 };
    persist(state);
    return state.whatsapp;
  }

  function queue(state, data) {
    const prepared = prepare(state, data); // Validate fully before creating or changing any state.
    const whatsapp = ensure(state);
    if (data.idempotencyKey) { const existing=whatsapp.messages.find(m=>m.idempotencyKey===data.idempotencyKey);if(existing)return existing; }
    const at = now();
    const message = { ...prepared, idempotencyKey:data.idempotencyKey||null, id: `wa-${whatsapp.nextId++}`, status: 'queued', createdAt: at, updatedAt: at, attempts: 0, error: null };
    whatsapp.messages.unshift(message);
    log(state, message, 'queued', `已建立 WhatsApp 演示通知：${templateFor(message.templateId).title}`);
    persist(state);
    return message;
  }

  function messageFor(state, messageId) {
    validateState(state);
    const message = state.whatsapp && Array.isArray(state.whatsapp.messages) && state.whatsapp.messages.find(item => item.id === messageId);
    if (!message) throw new Error('找不到這則 WhatsApp 演示訊息。');
    return message;
  }

  function staleReason(state,message) {
    const r=state.requests.find(r=>r.id===message.requestId);
    if (!r) return '對應需求已不存在。';
    if (message.notificationVersion!==2) return '通知流程已更新，此舊版待發通知已撤銷。';
    if (message.requestRevision && message.requestRevision!==(r.revision||1)) return '需求版本已更新，此通知已撤銷。';
    if (message.stage && message.stage!==(r.stage||1) && ['supplier_invited','deadline_reminder','request_updated','stage_started'].includes(message.templateId)) return '已進入新的收集階段，此通知已撤銷。';
    if (r.status==='cancelled'&&!cancellationTemplates.has(message.templateId)) return '需求已取消，此通知已撤銷。';
    if (message.quoteIds?.length) {
      const ids=new Set(deliveredQuotes(state,r).map(q=>q.id));
      if (message.quoteIds.some(id=>!ids.has(id))) return '通知所包含的報價已失效或須重新確認。';
      if (message.quoteIds.some(id=>message.quoteVersions?.[id] && message.quoteVersions[id]!==quoteVersion(r.quotes.find(q=>q.id===id)))) return '報價內容已修訂，此舊版交付通知已撤銷。';

    }
    if (shortlistTemplates.has(message.templateId) && JSON.stringify([...(message.quoteIds||[])].sort())!==JSON.stringify([...(r.shortlistedQuoteIds||[])].sort())) return '老師的洽談名單已更新，此通知已撤銷。';
    try { const current=prepare(state,{...message});if(message.templateId==='request_updated'&&current.body!==message.body)return '參與或交報安排已改變，此舊版更新通知已撤銷。'; } catch(error) { return error.message; }
    return null;
  }
  function requireFresh(state,message) {
    const reason=staleReason(state,message);
    if (reason) throw new Error(reason);
  }
  function syncWorkflow(state) {
    const box=ensure(state);
    if (!Array.isArray(box.processedWorkflowEvents)) box.processedWorkflowEvents=[];
    const processed=new Set(box.processedWorkflowEvents);
    let changed=false;
    for (const message of box.messages) {
      if (['queued','failed'].includes(message.status)) {
        const reason=staleReason(state,message);
        if(reason){message.status='cancelled';message.error=reason;message.updatedAt=now();log(state,message,'cancelled','WhatsApp 演示通知已撤銷：'+reason);changed=true;}
      }
    }
    const events=[...state.events].reverse();
    for (const e of events) {
      if (processed.has(e.id)||!['stage_delivered','request_updated','invitations_sent','request_cancelled','stage_started','shortlist_changed'].includes(e.type))continue;
      const r=state.requests.find(r=>r.id===e.requestId);
      if (!r) {processed.add(e.id);continue;}
      const revision=e.revision||r.revision||1;
      const jobs=[];
      if (revision===(r.revision||1)) {
        const supplierIds=e.supplierIds||[];
        if(e.type==='stage_delivered'&&Array.isArray(e.quoteIds))jobs.push({templateId:'stage_delivered',recipientType:'teacher',quoteIds:e.quoteIds});
        if(e.type==='request_updated')supplierIds.forEach(supplierId=>jobs.push({templateId:'request_updated',recipientType:'supplier',supplierId}));
        if(e.type==='invitations_sent')supplierIds.forEach(supplierId=>jobs.push({templateId:'supplier_invited',recipientType:'supplier',supplierId}));
        if(e.type==='stage_started')jobs.push({templateId:'stage_started',recipientType:'teacher'});
        if(e.type==='shortlist_changed' && JSON.stringify([...(e.quoteIds||[])].sort())===JSON.stringify([...(r.shortlistedQuoteIds||[])].sort()))jobs.push({templateId:'shortlist_updated',recipientType:'teacher'});
        if(e.type==='request_cancelled'){
          jobs.push({templateId:'request_cancelled_teacher',recipientType:'teacher'});
          supplierIds.forEach(supplierId=>jobs.push({templateId:'request_cancelled_supplier',recipientType:'supplier',supplierId}));
        }
      }
      jobs.forEach(job=>{
        try {queue(state,{...job,requestId:r.id,eventId:e.id,stage:e.stage||r.stage||1,reason:e.reason||'',idempotencyKey:`workflow:${e.id}:${job.templateId}:${job.supplierId||'teacher'}`});changed=true;}
        catch(_) { /* No stale or ineligible message is created; the business audit remains. */ }
      });
      processed.add(e.id);changed=true;
    }
    box.processedWorkflowEvents=Array.from(processed);
    if(changed)persist(state);
    return box;
  }

  function send(state, messageId) {
    const message = messageFor(state, messageId);
    if (message.status !== 'queued') throw new Error(message.status === 'failed' ? '請先將失敗訊息加入重試佇列。' : '這則訊息已處理，不能重複模擬發送。');
    requireFresh(state,message);
    message.status = 'delivered';
    message.attempts += 1;
    message.updatedAt = now();
    message.error = null;
    log(state, message, 'delivered', `WhatsApp 演示通知已模擬送達：${templateFor(message.templateId).title}`);
    persist(state);
    return message;
  }

  function simulateFailure(state, messageId) {
    const message = messageFor(state, messageId);
    if (message.status !== 'queued') throw new Error('只有待發送訊息可以模擬發送失敗。');
    requireFresh(state,message);
    message.status = 'failed';
    message.attempts += 1;
    message.updatedAt = now();
    message.error = '模擬連線逾時，尚未發送任何真實訊息。';
    log(state, message, 'failed', `WhatsApp 演示通知發送失敗，可重試：${templateFor(message.templateId).title}`);
    persist(state);
    return message;
  }

  function retry(state, messageId) {
    const message = messageFor(state, messageId);
    if (message.status !== 'failed') throw new Error('只有發送失敗的訊息可以重試。');
    requireFresh(state,message);
    message.status = 'queued';
    message.updatedAt = now();
    message.error = null;
    log(state, message, 'retry', `WhatsApp 演示通知已加入重試佇列：${templateFor(message.templateId).title}`);
    persist(state);
    return message;
  }

  function summary(state) {
    const whatsapp = ensure(state);
    const result = { total: whatsapp.messages.length, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, cancelled: 0 };
    whatsapp.messages.forEach(message => { if (Object.prototype.hasOwnProperty.call(result, message.status) && message.status !== 'total') result[message.status] += 1; });
    result.successful = result.delivered + result.read;
    result.successRate = result.total ? Math.round(result.successful / result.total * 100) : 0;
    return result;
  }

  global.IQWhatsApp = { ensure, templates, queue, send, retry, simulateFailure, summary, preview, syncWorkflow, previewData:prepare };
})(typeof window !== 'undefined' ? window : globalThis);
