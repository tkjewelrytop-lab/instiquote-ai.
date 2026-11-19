/* WhatsApp management UI for the local simulation. No external messaging calls. */
(function(global){
  'use strict';
  function create(ctx){
    const {esc,icon,btn,heading,stats,date,toast,modal,closeModal}=ctx;
    const view={tab:'messages',filter:'all',search:'',selectedId:null};
    const API=()=>global.IQWhatsApp;
    const state=()=>ctx.getState();
    const box=()=>API().ensure(state());
    const canSend=()=>typeof ctx.canPermission==='function'?!!ctx.canPermission('whatsapp.send'):true;
    function requireSend(){if(!canSend())throw Error('目前帳號沒有發送 WhatsApp 通知的權限。');}
    const statuses={queued:'待發送',sent:'已發送',delivered:'已送達',read:'已讀',failed:'發送失敗'};
    const template=id=>API().templates().find(t=>t.id===id);
    const statusBadge=m=>`<span class="wa-status ${m.status}">${icon(m.status==='failed'?'close':m.status==='queued'?'clock':'check')}${statuses[m.status]||m.status}</span>`;
    const displayPhone=p=>esc(p||'未提供電話');
    function dataFor(templateId,requestId,supplierId){
      const t=template(templateId);
      return {templateId,requestId,recipientType:t.recipientType,...(t.recipientType==='supplier'?{supplierId}: {})};
    }
    function sampleVariables(r){
      if(!r)return {};
      const q=r.quotes.find(q=>q.id===r.selectedQuoteId),s=state().suppliers.find(s=>s.id===q?.supplierId);
      return {order_number:r.id,category:r.category,district:r.district,deadline:date(r.deadline,true),quote_count:String(r.quotes.length),accepted_count:String(r.invitations.filter(i=>i.status==='accepted').length),supplier_code:q?.code||'供應商 A',supplier_name:r.status==='selected'?s?.name||'':'［選定後顯示］',supplier_phone:r.status==='selected'?s?.phone||'':'［選定後顯示］',supplier_contact:r.status==='selected'?s?.contact||'':'［選定後顯示］',supplier_email:r.status==='selected'?s?.email||'':'［選定後顯示］',request_link:'在老師工作台查看需求',supplier_link:'在供應商工作台查看邀請'};
    }
    function previewCard(message){
      const t=message?template(message.templateId):null;
      return `<section class="panel wa-preview-panel"><div class="panel-header"><div><h2 class="panel-title">訊息預覽</h2><p class="panel-subtitle">${t?esc(t.title):'選擇一則訊息查看內容'}</p></div>${icon('message')}</div><div class="panel-body"><div class="wa-phone-frame"><div class="wa-phone-header"><span class="avatar">${icon('book')}</span><div><strong>InstiQuote AI</strong><span>WhatsApp 通知 · 演示</span></div>${icon('shield')}</div><div class="wa-chat-bg"><div class="wa-chat-bubble"><strong>${message?esc(message.recipientName):'您好'}</strong><p style="white-space:pre-wrap">${message?esc(message.body):'在左邊選擇訊息，或建立一則新的演示通知。'}</p><div class="wa-chat-time">${message?date(message.updatedAt||message.createdAt,true):''} ${icon('check')}</div></div></div></div><div class="wa-preview-note">${icon('shield')}所有訊息均為模擬，不會發送到真實電話。</div>${message?`<div class="wa-detail-meta"><span>收件人：${displayPhone(message.recipientPhone)}</span><span>關聯需求：${esc(message.requestId)}</span><span>發送嘗試：${message.attempts} 次</span></div>`:''}</div></section>`;
    }
    function connectionCard(){return `<section class="panel"><div class="panel-header"><h2 class="panel-title">通知渠道</h2><span class="badge gray">演示模式</span></div><div class="panel-body"><div class="wa-settings-row"><span>服務</span><strong>WhatsApp Business</strong></div><div class="wa-settings-row"><span>正式帳號</span><span class="muted">尚未連接</span></div><div class="wa-settings-row"><span>演示發送號碼</span><strong>+852 5550 0000</strong></div><p class="field-help">正式版需另行連接企業帳號及核准訊息範本。目前不會收集 API 金鑰或發送真實通知。</p></div></section>`;}
    function row(m){const t=template(m.templateId);return `<article class="wa-message-row"><span class="wa-message-icon">${icon('message')}</span><div><div class="wa-recipient"><strong>${esc(m.recipientName)}</strong><span class="badge gray">${m.recipientType==='teacher'?'老師':'供應商'}</span>${statusBadge(m)}</div><div class="wa-message-meta">${esc(t?.title||m.templateId)} · ${esc(m.requestId)} · ${displayPhone(m.recipientPhone)}</div><p class="wa-snippet">${esc(m.body)}</p><div class="wa-message-meta">${date(m.updatedAt||m.createdAt,true)} · 嘗試 ${m.attempts} 次${m.error?` · <span class="error-text">${esc(m.error)}</span>`:''}</div></div><div class="wa-message-actions">${btn('查看','wa-view','ghost small','',`data-id="${m.id}"`)}${canSend()&&m.status==='queued'?btn('模擬發送','wa-send','primary small','',`data-id="${m.id}"`):canSend()&&m.status==='failed'?btn('重試','wa-retry','secondary small','rotate',`data-id="${m.id}"`):''}</div></article>`;}
    function messageRows(){const list=box().messages.filter(m=>(view.filter==='all'||m.status===view.filter)&&(!view.search||[m.body,m.recipientName,m.recipientPhone,m.requestId].join(' ').toLowerCase().includes(view.search.toLowerCase())));return list.map(row).join('')||`<div class="empty-state">${icon('message')}<h3>沒有符合條件的通知</h3><p>${canSend()?'切換狀態篩選，或建立一則新的演示通知。':'請調整狀態篩選或搜尋條件。'}</p>${canSend()?btn('建立通知','wa-compose','primary','plus'):''}</div>`;}
    function dashboard(){
      const s=API().summary(state()),messages=box().messages;
      const selected=messages.find(m=>m.id===view.selectedId)||messages[0];
      return heading('COMMUNICATIONS','WhatsApp 通知中心','一個後台，掌握老師與供應商的每一則通知。',canSend()?btn('建立通知','wa-compose','primary','plus'):'')+`<section class="wa-intro"><span class="wa-message-icon">${icon('message')}</span><div><strong>讓每一步，都有清晰迴音</strong><p>需求確認、派單邀請、報價進度與截止提醒，集中管理。</p></div><span class="badge green">模擬發送 · 不會聯絡真實收件人</span></section>`+stats([['全部通知',s.total,'所有演示發送記錄','message'],['待發送',s.queued,canSend()?'可逐則模擬發送':'僅可檢視發送狀態','clock'],['已送達／已讀',s.delivered+s.read,'模擬收件狀態','check'],['發送失敗',s.failed,'查看原因並重試','activity']])+`<div class="wa-tabs"><button class="${view.tab==='messages'?'active':''}" data-action="wa-tab" data-tab="messages">發送記錄</button><button class="${view.tab==='templates'?'active':''}" data-action="wa-tab" data-tab="templates">訊息範本 <span class="muted">${API().templates().length}</span></button></div><div class="wa-layout"><div>${view.tab==='messages'?`<section class="panel"><div class="panel-header"><div><h2 class="panel-title">通知發送記錄</h2><p class="panel-subtitle">${canSend()?'可查看內容、模擬發送，以及重試失敗訊息。':'可查看通知內容、發送記錄與訊息範本。'}</p></div></div><div class="wa-toolbar"><div class="tabs">${[['all','全部'],['queued','待發送'],['delivered','已送達'],['read','已讀'],['failed','失敗']].map(([k,l])=>`<button class="tab ${view.filter===k?'active':''}" data-action="wa-filter" data-filter="${k}">${l}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="wa-search" aria-label="搜尋 WhatsApp 通知" placeholder="搜尋收件人或需求編號" value="${esc(view.search)}"></label></div><div class="wa-message-list" id="wa-message-list">${messageRows()}</div></section>`:templatesView()}</div><aside class="stack" id="wa-preview">${previewCard(selected)}${connectionCard()}</aside></div>`;
    }
    function templatesView(){return `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">業務通知範本</h2><p class="panel-subtitle">以下為原型文案，未提交至 Meta 審核。</p></div><span class="badge gray">繁體中文</span></div><div class="panel-body wa-template-grid">${API().templates().map(t=>`<article class="wa-template-card"><div class="request-top"><h3>${esc(t.title)}</h3><span class="badge green">演示範本</span></div><p class="wa-template-description">${esc(t.description)}</p><p class="wa-template-snippet">${esc(t.body)}</p><div class="request-bottom"><span class="muted">收件人：${t.recipientType==='teacher'?'老師':'供應商'}</span>${canSend()?btn('使用範本','wa-compose','secondary small','',`data-template="${t.id}"`):''}</div></article>`).join('')}</div></section>`;}
    function eligibleSuppliers(r){return state().suppliers.filter(s=>r?.invitations.some(i=>i.supplierId===s.id)&&s.status==='approved');}
    function composePreview(templateId,requestId,supplierId){
      const t=template(templateId),r=state().requests.find(r=>r.id===requestId),s=state().suppliers.find(s=>s.id===supplierId);
      return previewCard({templateId,body:API().preview(templateId,sampleVariables(r)),recipientName:t?.recipientType==='teacher'?r?.teacher||'老師':s?.name||'供應商',recipientPhone:t?.recipientType==='teacher'?r?.phone:s?.phone,requestId:r?.id||'',attempts:0,createdAt:new Date().toISOString()});
    }
    function showCompose(templateId='request_received'){
      requireSend();
      const t=template(templateId)||API().templates()[0];
      const r=(t.id==='supplier_selected'?state().requests.find(r=>r.status==='selected'):null)||state().requests[0];
      if(!r)throw Error('請先建立一份需求，再新增通知。');
      const suppliers=eligibleSuppliers(r);
      modal('建立 WhatsApp 演示通知',`<div class="wa-modal-layout"><form id="wa-compose-form"><div class="stack"><div class="notice">${icon('shield')}只建立演示通知，不會發送真實 WhatsApp。</div><label class="field"><span class="field-label">通知範本</span><select class="select" name="templateId" id="wa-template-select">${API().templates().map(x=>`<option value="${x.id}" ${x.id===t.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label><label class="field"><span class="field-label">關聯需求</span><select class="select" name="requestId" id="wa-request-select">${state().requests.map(x=>`<option value="${x.id}" ${x.id===r.id?'selected':''}>${esc(x.id)} · ${esc(x.title)}</option>`).join('')}</select></label><div id="wa-recipient-field">${recipientField(t,r,suppliers)}</div><p class="field-help">收件人及訊息數字由關聯需求自動帶入，無須填寫電話。邀請與提醒只適用符合條件的供應商。</p><div class="form-actions">${btn('取消','close-modal','secondary')}<button type="submit" class="button primary">加入待發送</button></div></div></form><div id="wa-compose-preview">${composePreview(t.id,r.id,suppliers[0]?.id)}</div></div>`);
    }
    function recipientField(t,r,suppliers){return t.recipientType==='supplier'?`<label class="field"><span class="field-label">收件供應商</span><select name="supplierId" id="wa-supplier-select" class="select" required>${suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`:`<div class="field"><span class="field-label">收件老師</span><div class="input">${esc(r.teacher)} · ${displayPhone(r.phone)}</div></div>`;}
    function showDetail(id){const m=box().messages.find(m=>m.id===id);if(!m)throw Error('找不到這則通知。');view.selectedId=m.id;modal('通知詳情',`${previewCard(m)}<div class="notice ${m.status==='failed'?'warning':''}">狀態：${statuses[m.status]} · 已嘗試 ${m.attempts} 次${m.error?' · '+esc(m.error):''}</div>`,btn('關閉','close-modal','secondary')+(canSend()&&m.status==='queued'?btn('模擬失敗','wa-fail','secondary','',`data-id="${m.id}"`)+btn('模擬發送','wa-send','primary','',`data-id="${m.id}"`):canSend()&&m.status==='failed'?btn('重新加入待發送','wa-retry','primary','rotate',`data-id="${m.id}"`):''));}
    function handleClick(el){const a=el.dataset.action;if(!a?.startsWith('wa-'))return false;
      if(ctx.getRole()!=='admin')throw Error('請切換至管理工作台操作。');
      if(['wa-compose','wa-send','wa-fail','wa-retry'].includes(a))requireSend();
      if(a==='wa-tab'){view.tab=el.dataset.tab;ctx.render();}
      if(a==='wa-filter'){view.filter=el.dataset.filter;ctx.render();}
      if(a==='wa-compose')showCompose(el.dataset.template||'request_received');
      if(a==='wa-view')showDetail(el.dataset.id);
      if(a==='wa-send'){API().send(state(),el.dataset.id);view.selectedId=el.dataset.id;closeModal();ctx.render();toast('已模擬送達，沒有發送真實訊息。');}
      if(a==='wa-fail'){API().simulateFailure(state(),el.dataset.id);view.selectedId=el.dataset.id;closeModal();ctx.render();toast('已模擬發送失敗，可查看原因並重試。');}
      if(a==='wa-retry'){API().retry(state(),el.dataset.id);view.selectedId=el.dataset.id;view.filter='all';closeModal();ctx.render();toast('已重新加入待發送，可再次模擬發送。');}
      return true;
    }
    function handleInput(e){if(e.target.id!=='wa-search')return false;view.search=e.target.value;document.querySelector('#wa-message-list').innerHTML=messageRows();return true;}
    function handleChange(e){if(!['wa-template-select','wa-request-select','wa-supplier-select'].includes(e.target.id))return false;const form=document.querySelector('#wa-compose-form'),t=template(form.elements.templateId.value),r=state().requests.find(r=>r.id===form.elements.requestId.value);if(e.target.id!=='wa-supplier-select')document.querySelector('#wa-recipient-field').innerHTML=recipientField(t,r,eligibleSuppliers(r));document.querySelector('#wa-compose-preview').innerHTML=composePreview(t.id,r.id,form.elements.supplierId?.value);return true;}
    function handleSubmit(form){if(form.id!=='wa-compose-form')return false;requireSend();const fd=new FormData(form);const m=API().queue(state(),dataFor(fd.get('templateId'),fd.get('requestId'),fd.get('supplierId')));view.selectedId=m.id;view.tab='messages';view.filter='all';view.search='';closeModal();ctx.render();toast('演示通知已加入待發送。');return true;}
    return {dashboard,handleClick,handleInput,handleChange,handleSubmit};
  }
  global.IQWhatsAppView={create};
})(typeof window!=='undefined'?window:globalThis);
