(function (global) {
  'use strict';

  // This module never calls an external API. All delivery states are simulations.
  const TEMPLATE_DEFINITIONS = [
    {
      id: 'request_received', title: '需求提交確認', recipientType: 'teacher', status: 'approved',
      description: '老師提交需求後，確認訂單編號、類別及報價截止時間。',
      variables: ['order_number', 'category', 'deadline'],
      body: '【InstiQuote AI｜需求已收妥】\n訂單：{{order_number}}\n類別：{{category}}\n報價截止：{{deadline}}\n我們正為您匹配合適的供應商，請到平台查看進度。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'supplier_invited', title: '供應商報價邀請', recipientType: 'supplier', status: 'approved',
      description: '邀請已匹配供應商接單，不包含學校名稱或老師聯絡資料。',
      variables: ['order_number', 'category', 'district', 'deadline'],
      body: '【InstiQuote AI｜您有新的報價邀請】\n訂單：{{order_number}}\n類別：{{category}}\n服務地區：{{district}}\n報價截止：{{deadline}}\n請到平台查看匿名需求及確認接單。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'supplier_confirmed', title: '供應商接單進度', recipientType: 'teacher', status: 'approved',
      description: '供應商確認接單後，通知老師最新接單數量，並區分接單與已交報價。',
      variables: ['order_number', 'accepted_count'],
      body: '【InstiQuote AI｜供應商接單進度】\n訂單：{{order_number}}\n目前已有 {{accepted_count}} / 5 間供應商確認接單。\n接單不代表已交報價；供應商提交後，我們會另行通知您。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'quote_received', title: '收到新報價', recipientType: 'teacher', status: 'approved',
      description: '通知老師最新報價數量，供應商身份維持匿名。',
      variables: ['order_number', 'quote_count', 'supplier_code'],
      body: '【InstiQuote AI｜收到新的獨立報價】\n訂單：{{order_number}}\n{{supplier_code}} 已提交報價，目前共收到 {{quote_count}} / 5 份。\n您可以到平台查看內容，選定前不會公開供應商聯絡資料。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'quotes_ready', title: '報價已備妥', recipientType: 'teacher', status: 'approved',
      description: '收集完成或管理員結案後，通知老師比較現有報價。',
      variables: ['order_number', 'quote_count'],
      body: '【InstiQuote AI｜報價已備妥】\n訂單：{{order_number}}\n本次已備妥 {{quote_count}} 份獨立報價，請到平台比較及選擇合適的方案。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'deadline_reminder', title: '供應商截止提醒', recipientType: 'supplier', status: 'approved',
      description: '提醒已接單且尚未交報價的供應商按時提交。',
      variables: ['order_number', 'deadline'],
      body: '【InstiQuote AI｜報價截止提醒】\n訂單：{{order_number}}\n報價截止：{{deadline}}\n您已確認接單，請在截止前到平台提交完整報價。\n\n（原型演示：並未發送真實 WhatsApp 訊息）'
    },
    {
      id: 'supplier_selected', title: '老師選定供應商', recipientType: 'teacher', status: 'approved',
      description: '僅在老師完成選擇後，提供獲選供應商的聯絡資料。',
      variables: ['order_number', 'supplier_code', 'supplier_name', 'supplier_contact', 'supplier_phone'],
      body: '【InstiQuote AI｜已選定供應商】\n訂單：{{order_number}}\n您已選擇 {{supplier_code}} 的方案。\n供應商：{{supplier_name}}\n聯絡人：{{supplier_contact}}\n電話：{{supplier_phone}}\n請直接與獲選供應商跟進服務細節。\n\n（原型演示：以上為模擬聯絡資料，並未發送真實 WhatsApp 訊息）'
    }
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

  // Build values from real demo records, never from an arbitrary recipient or contact override.
  function prepare(state, data) {
    validateState(state);
    if (!data || typeof data !== 'object') throw new Error('請先選擇訊息範本及對應需求。');
    const template = templateFor(data.templateId);
    if (data.recipientType !== template.recipientType) throw new Error('此範本不適用於所選收件人類型。');
    const request = state.requests.find(item => item.id === data.requestId);
    if (!request) throw new Error('找不到對應需求，無法建立通知。');
    let selectedQuote = null;
    let selectedSupplier = null;
    if (template.id === 'supplier_selected') {
      if (request.status !== 'selected' || !request.selectedQuoteId) throw new Error('老師完成選擇後，才可以建立供應商聯絡通知。');
      selectedQuote = request.quotes.find(item => item.id === request.selectedQuoteId);
      selectedSupplier = selectedQuote && state.suppliers.find(item => item.id === selectedQuote.supplierId);
      if (!selectedSupplier) throw new Error('找不到獲選供應商的資料。');
    }
    const acceptedCount = request.invitations.filter(item => item.status === 'accepted').length;
    if (template.id === 'supplier_confirmed' && acceptedCount === 0) throw new Error('這份需求尚未有供應商確認接單。');
    if (template.id === 'quote_received' && request.quotes.length === 0) throw new Error('這份需求尚未收到報價。');
    if (template.id === 'quotes_ready' && (!['ready', 'closed', 'selected'].includes(request.status) || request.quotes.length === 0)) {
      throw new Error('請先完成報價收集或由管理員結案，再建立報價備妥通知。');
    }
    let recipientName;
    let recipientPhone;
    let supplierId = null;
    if (template.recipientType === 'teacher') {
      recipientName = text(request.teacher) || '老師';
      recipientPhone = text(request.phone);
    } else {
      const supplier = state.suppliers.find(item => item.id === data.supplierId);
      if (!supplier) throw new Error('請選擇有效的供應商收件人。');
      if (supplier.status !== 'approved') throw new Error('供應商尚未通過審核或已被停權。');
      const invitation = request.invitations.find(item => item.supplierId === supplier.id);
      if (!invitation || invitation.status === 'declined') throw new Error('這間供應商未獲邀參與本次需求。');
      if (template.id === 'deadline_reminder') {
        if (invitation.status !== 'accepted') throw new Error('截止提醒只適用於已接單的供應商。');
        if (request.quotes.some(item => item.supplierId === supplier.id)) throw new Error('這間供應商已提交報價，無須發送截止提醒。');
        if (['ready', 'closed', 'selected'].includes(request.status) || new Date(request.deadline).getTime() <= Date.now()) {
          throw new Error('報價收集已結束，無法建立截止提醒。');
        }
      }
      supplierId = supplier.id;
      recipientName = text(supplier.name) || '供應商';
      recipientPhone = text(supplier.phone);
    }
    if (recipientPhone.replace(/\D/g, '').length < 8) throw new Error('收件人缺少有效電話，請先檢查聯絡資料。');
    const lastQuote = request.quotes[request.quotes.length - 1];
    const values = {
      order_number: request.id, category: request.category, district: request.district,
      deadline: formatDeadline(request.deadline), quote_count: request.quotes.length, accepted_count: acceptedCount,
      supplier_code: selectedQuote ? selectedQuote.code : lastQuote ? lastQuote.code : '匿名供應商',
      supplier_name: selectedSupplier ? selectedSupplier.name : '',
      supplier_contact: selectedSupplier ? selectedSupplier.contact : '',
      supplier_phone: selectedSupplier ? selectedSupplier.phone : ''
    };
    return {
      templateId: template.id, requestId: request.id, recipientType: template.recipientType,
      recipientName, recipientPhone, supplierId,
      body: preview(template.id, { ...(data.variables || {}), ...values })
    };
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
    const supplierRequest = requests.find(request => request.invitations.some(invitation => state.suppliers.some(supplier => supplier.id === invitation.supplierId && supplier.status === 'approved')));
    const supplierInvitation = supplierRequest && supplierRequest.invitations.find(invitation => state.suppliers.some(supplier => supplier.id === invitation.supplierId && supplier.status === 'approved'));
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
    const at = now();
    const message = { ...prepared, id: `wa-${whatsapp.nextId++}`, status: 'queued', createdAt: at, updatedAt: at, attempts: 0, error: null };
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

  function send(state, messageId) {
    const message = messageFor(state, messageId);
    if (message.status !== 'queued') throw new Error(message.status === 'failed' ? '請先將失敗訊息加入重試佇列。' : '這則訊息已處理，不能重複模擬發送。');
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
    message.status = 'queued';
    message.updatedAt = now();
    message.error = null;
    log(state, message, 'retry', `WhatsApp 演示通知已加入重試佇列：${templateFor(message.templateId).title}`);
    persist(state);
    return message;
  }

  function summary(state) {
    const whatsapp = ensure(state);
    const result = { total: whatsapp.messages.length, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    whatsapp.messages.forEach(message => { if (Object.prototype.hasOwnProperty.call(result, message.status) && message.status !== 'total') result[message.status] += 1; });
    result.successful = result.delivered + result.read;
    result.successRate = result.total ? Math.round(result.successful / result.total * 100) : 0;
    return result;
  }

  global.IQWhatsApp = { ensure, templates, queue, send, retry, simulateFailure, summary, preview };
})(typeof window !== 'undefined' ? window : globalThis);
