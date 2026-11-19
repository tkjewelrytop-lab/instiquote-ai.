(function (global) {
  'use strict';

  const STORAGE_KEY = 'instiquote-prototype-v1';
  const CATEGORIES = ['到校課程', '到校活動', '印刷製作', '小型維修'];
  const DISTRICTS = ['九龍城區', '沙田區', '觀塘區', '中西區', '屯門區'];
  let sequence = 0;
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
  const companyKey = br => String(br || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const text = value => String(value == null ? '' : value).trim();
  const future = hours => new Date(Date.now() + hours * 3600000).toISOString();

  function requestFor(state, id) {
    const request = state.requests.find(item => item.id === id);
    if (!request) throw new Error('找不到這項需求，請返回列表重新選擇。');
    return request;
  }

  function supplierFor(state, id) {
    const supplier = state.suppliers.find(item => item.id === id);
    if (!supplier) throw new Error('找不到這間供應商。');
    return supplier;
  }

  function event(state, requestId, title, type, details) {
    const item = { id: uid('evt'), requestId: requestId || null, title, text: title, type, at: now(), ...details };
    state.events.unshift(item);
    return item;
  }

  function isEligible(supplier, request) {
    return supplier.status === 'approved' && supplier.category.includes(request.category) && supplier.districts.includes(request.district);
  }

  function requireOpen(request) {
    if (['closed', 'selected', 'ready'].includes(request.status)) throw new Error('這項需求已經停止接收新的報價。');
    if (new Date(request.deadline).getTime() <= Date.now()) throw new Error('報價截止時間已過，無法繼續操作。');
  }

  // Persist only browser-local demo records; storage failures leave the current session usable.
  function save(state) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* Private mode or storage quota. */ }
    return state;
  }

  // Create fresh, relative-time sample data so the prototype never opens with stale deadlines.
  function seed() {
    const year = new Date().getFullYear();
    const companyNames = ['啓思教育工作室', '創學教育有限公司', '星河校園服務', '悦動教育活動', '智趣教學資源', '青苗創意製作', '同行校園工程', '新程教育科技'];
    const suppliers = companyNames.map((name, index) => ({
      id: `sup-${index + 1}`, name, br: `${73001000 + index}-000-11-26-0`,
      category: index === 0 ? [...CATEGORIES] : [...new Set(['到校課程', CATEGORIES[index % 4], ...(index < 4 ? ['到校活動'] : [])])],
      districts: index === 0 ? [...DISTRICTS] : [...new Set(['九龍城區', DISTRICTS[index % 5], ...(index < 5 ? ['沙田區'] : [])])],
      status: index === 7 ? 'pending' : 'approved', score: [98, 96, 95, 92, 90, 88, 84, 100][index],
      plan: index < 3 ? 'paid' : index === 7 ? 'trial' : 'free',
      contact: ['陳先生', '李小姐', '張先生', '周小姐', '黃先生', '吳小姐', '林先生', '何小姐'][index],
      phone: `+852 5550 ${String(index + 1001)}`, email: `supplier${index + 1}@example.com`, trialRemaining: 2
    }));
    function makeRequest(number, extra) {
      return {
        id: `IQ-${year}-${String(number).padStart(4, '0')}`, title: '', category: '到校課程', district: '九龍城區',
        school: '明德學校（演示）', teacher: '陳老師', phone: '+852 5550 8801', email: 'teacher@example.com',
        description: '', budget: 18000, deadline: future(48), createdAt: future(-24), status: 'matching',
        invitations: [], quotes: [], messages: [], files: [], selectedQuoteId: null, ...extra
      };
    }
    function invitation(supplierId, status) {
      return { supplierId, status, invitedAt: future(-20), acceptedAt: status === 'accepted' ? future(-18) : null };
    }
    function quotation(index, amount) {
      return {
        id: `quote-seed-${index + 1}-${amount}`, supplierId: `sup-${index + 1}`, code: `供應商 ${String.fromCharCode(65 + index)}`,
        amount, description: [
          '包含 2 位專業導師、全套教學材料及學生作品，課程結束後提供活動總結。',
          '提供分組教學、器材租用及課後學習單，報價已包含交通及材料費用。',
          '包含課程設計、導師、學生材料及成果展示，可按學校需要調整教學內容。',
          '提供完整活動流程、導師服務及互動教學工具，包含基本保險及交通費用。',
          '包含課前協調、到校教學及學生學習材料，提供活動照片及成果記錄。'
        ][index % 5], validDays: 30, submittedAt: future(-8 + index), attachmentName: '課程服務報價.pdf'
      };
    }
    const first = makeRequest(1, {
      title: '小四 STEM 創意科學工作坊', category: '到校課程', district: '九龍城區', budget: 18000,
      description: '為小四學生安排半天 STEM 創意科學工作坊，共 60 人，分兩組進行。希望包含動手實驗、材料及導師，活動時間為下月星期五下午。',
      status: 'collecting', invitations: suppliers.slice(0, 7).map((s, i) => invitation(s.id, i === 1 || i === 2 ? 'accepted' : 'invited')),
      quotes: [quotation(1, 14800), quotation(2, 16200)], files: [{ name: 'STEM工作坊需求説明.pdf', size: 245760, type: 'application/pdf' }],
      messages: [{ id: 'msg-seed-1', author: 'admin', text: '已完成需求整理，供應商將根據相同規格提供報價。', at: future(-19) }]
    });
    const second = makeRequest(2, {
      title: '小五科學探索體驗課程', description: '為 80 名小五學生安排兩節科學探索課程，每節 90 分鐘，需包含材料、導師及課堂活動。',
      status: 'ready', deadline: future(12), createdAt: future(-60), budget: 24000,
      invitations: suppliers.slice(0, 5).map(s => invitation(s.id, 'accepted')),
      quotes: [quotation(0, 18800), quotation(1, 21200), quotation(2, 19600), quotation(3, 22800), quotation(4, 20500)]
    });
    const third = makeRequest(3, {
      title: '校園開放日互動攤位', category: '到校活動', district: '沙田區', school: '育才小學（演示）',
      description: '開放日需要三個互動遊戲攤位，預計 200 人參加，活動為期四小時，報價需包括工作人員、佈置、器材及撤場。',
      budget: 30000, deadline: future(68), createdAt: future(-4),
      invitations: suppliers.filter(s => s.status === 'approved' && s.category.includes('到校活動') && s.districts.includes('沙田區')).map(s => invitation(s.id, 'invited'))
    });
    const fourth = makeRequest(4, {
      title: '小三創意編程入門課程', description: '為小三學生提供四節圖形化編程入門課程，包含導師、教學設計及課後練習。',
      status: 'selected', createdAt: future(-120), deadline: future(-48), budget: 16000,
      invitations: suppliers.slice(0, 5).map(s => invitation(s.id, 'accepted')),
      quotes: [quotation(0, 12800), quotation(1, 14600), quotation(2, 13200), quotation(3, 15800), quotation(4, 13900)]
    });
    fourth.selectedQuoteId = fourth.quotes[0].id;
    return { version: 1, requests: [first, second, third, fourth], suppliers, nextId: 5,
      events: [
        { id: 'evt-seed-1', requestId: first.id, type: 'quote_submitted', title: '收到一份新的匿名報價', text: '收到一份新的匿名報價', at: future(-1) },
        { id: 'evt-seed-2', requestId: second.id, type: 'request_ready', title: '五份報價已備齊，可以開始比較', text: '五份報價已備齊，可以開始比較', at: future(-3) },
        { id: 'evt-seed-3', requestId: third.id, type: 'request_created', title: '校園開放日需求已提交', text: '校園開放日需求已提交', at: future(-4) },
        { id: 'evt-seed-4', requestId: fourth.id, type: 'supplier_selected', title: '老師已選定課程供應商', text: '老師已選定課程供應商', at: future(-45) }
      ]
    };
  }

  // Recover malformed or incompatible saved data without breaking the interface.
  function load() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.version === 1 && Array.isArray(parsed.requests) && Array.isArray(parsed.suppliers) && Array.isArray(parsed.events) && Number.isInteger(parsed.nextId) && parsed.requests.every(r => r && r.id && Array.isArray(r.invitations) && Array.isArray(r.quotes) && Array.isArray(r.messages) && Array.isArray(r.files)) && parsed.suppliers.every(s => s && s.id && Array.isArray(s.category) && Array.isArray(s.districts))) {
        let changed = false;
        parsed.requests.forEach(request => {
          if (['matching', 'collecting'].includes(request.status) && new Date(request.deadline).getTime() <= Date.now()) {
            request.status = 'closed';
            event(parsed, request.id, `報價已截止，現有 ${request.quotes.length} 份報價可供查看`, 'request_closed');
            changed = true;
          }
        });
        if (changed) save(parsed);
        return parsed;
      }
    } catch (_) { /* Corrupt or inaccessible browser storage. */ }
    return save(seed());
  }

  // Reset only this prototype's records, never unrelated browser storage.
  function reset() { return save(seed()); }

  // Match eligible legal companies once each; repeat dispatches only add unseen companies.
  function dispatch(state, requestId) {
    const request = requestFor(state, requestId);
    requireOpen(request);
    const reserved = new Set([...request.invitations.filter(i => i.status === 'accepted').map(i => i.supplierId), ...request.quotes.map(q => q.supplierId)]);
    if (reserved.size >= 5) return 0;
    const invitedIds = new Set(request.invitations.map(i => i.supplierId));
    const companies = new Set(request.invitations.map(i => state.suppliers.find(s => s.id === i.supplierId)).filter(Boolean).map(s => companyKey(s.br)));
    const counts = supplier => state.requests.reduce((count, r) => count + r.invitations.filter(i => i.supplierId === supplier.id).length, 0);
    const candidates = state.suppliers.filter(s => isEligible(s, request) && !invitedIds.has(s.id)).sort((a, b) => counts(a) - counts(b) || b.score - a.score);
    let added = 0;
    for (const supplier of candidates) {
      const key = companyKey(supplier.br);
      if (!key || companies.has(key)) continue;
      companies.add(key);
      request.invitations.push({ supplierId: supplier.id, status: 'invited', invitedAt: now(), acceptedAt: null });
      if (++added >= 8) break;
    }
    if (added) event(state, request.id, `已向 ${added} 間符合條件的供應商發出報價邀請`, 'invitations_sent');
    save(state);
    return added;
  }

  // Create a validated request, issue a unique reference and prepare its first invitation batch.
  function createRequest(state, form) {
    const required = { title: '需求標題', category: '報價類別', district: '服務地區', school: '學校名稱', teacher: '老師姓名', phone: '聯繫電話', email: '電子郵箱', description: '需求內容' };
    Object.keys(required).forEach(key => { if (!text(form[key])) throw new Error(`請填寫${required[key]}。`); });
    if (!CATEGORIES.includes(form.category)) throw new Error('請選擇有效的報價類別。');
    if (!DISTRICTS.includes(form.district)) throw new Error('請選擇有效的服務地區。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(form.email))) throw new Error('請填寫有效的電子郵箱。');
    if (text(form.phone).replace(/\D/g, '').length < 8) throw new Error('請填寫有效的聯繫電話。');
    const deadline = form.deadline || future(Number(form.deadlineHours) || 72);
    if (!Number.isFinite(new Date(deadline).getTime()) || new Date(deadline).getTime() <= Date.now()) throw new Error('請選擇未來的報價截止時間。');
    const budget = form.budget === '' || form.budget == null ? 0 : Number(form.budget);
    if (!Number.isFinite(budget) || budget < 0) throw new Error('預算金額必須為零或正數。');
    let id;
    do { id = `IQ-${new Date().getFullYear()}-${String(state.nextId++).padStart(4, '0')}`; } while (state.requests.some(r => r.id === id));
    const request = {
      id, title: text(form.title), category: text(form.category), district: text(form.district), school: text(form.school),
      teacher: text(form.teacher), phone: text(form.phone), email: text(form.email), description: text(form.description),
      budget, deadline: new Date(deadline).toISOString(), createdAt: now(), status: 'matching',
      invitations: [], quotes: [], messages: [], files: Array.isArray(form.files) ? form.files.map(f => ({ name: text(f.name), size: Number(f.size) || 0, type: text(f.type) })) : [], selectedQuoteId: null
    };
    state.requests.unshift(request);
    event(state, id, '老師已提交需求，系統開始匹配供應商', 'request_created');
    dispatch(state, id);
    return request;
  }

  // Reserve one of five supplier slots atomically within the current browser session.
  function acceptInvitation(state, requestId, supplierId) {
    const request = requestFor(state, requestId);
    const supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (!isEligible(supplier, request)) throw new Error('供應商尚未通過審核或不符合本次需求條件。');
    const invitation = request.invitations.find(i => i.supplierId === supplierId);
    if (!invitation || invitation.status !== 'invited') throw new Error('此邀請不存在，或你已經處理過這項邀請。');
    const reserved = new Set([...request.invitations.filter(i => i.status === 'accepted').map(i => i.supplierId), ...request.quotes.map(q => q.supplierId)]);
    if (reserved.size >= 5) throw new Error('五個接單名額已滿，請留意其他邀請。');
    if (supplier.plan === 'trial' && supplier.trialRemaining <= 0) throw new Error('免費試用機會已用完，請聯繫管理員。');
    invitation.status = 'accepted';
    invitation.acceptedAt = now();
    if (supplier.plan === 'trial') supplier.trialRemaining -= 1;
    request.status = 'collecting';
    event(state, request.id, '一間供應商已確認接單', 'invitation_accepted', { supplierId });
    save(state);
    return invitation;
  }

  // Submit one anonymous quote per accepted supplier and mark the request ready at five quotes.
  function submitQuote(state, requestId, supplierId, data) {
    const request = requestFor(state, requestId);
    const supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (supplier.status !== 'approved') throw new Error('供應商尚未通過審核或已被停權。');
    if (!request.invitations.some(i => i.supplierId === supplierId && i.status === 'accepted')) throw new Error('請先確認接單，再提交報價。');
    if (request.quotes.some(q => q.supplierId === supplierId)) throw new Error('你已經提交過這項需求的報價。');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('請填寫大於零的有效報價金額。');
    if (!text(data.description)) throw new Error('請填寫服務內容及報價説明。');
    const validDays = data.validDays == null || data.validDays === '' ? 30 : Number(data.validDays);
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) throw new Error('報價有效期須為 1 至 365 天。');
    const quote = { id: uid('quote'), supplierId, code: `供應商 ${String.fromCharCode(65 + request.quotes.length)}`, amount,
      description: text(data.description), validDays, submittedAt: now(), attachmentName: text(data.attachmentName) };
    request.quotes.push(quote);
    request.status = request.quotes.length >= 5 ? 'ready' : 'collecting';
    event(state, request.id, `收到第 ${request.quotes.length} 份匿名報價`, 'quote_submitted', { supplierId });
    if (request.status === 'ready') event(state, request.id, '五份報價已備齊，可以開始比較', 'request_ready');
    save(state);
    return quote;
  }

  // Selection is possible after five quotes or after the request closes with partial results.
  function selectQuote(state, requestId, quoteId) {
    const request = requestFor(state, requestId);
    if (!['ready', 'closed'].includes(request.status)) throw new Error('請等待報價收集完成，或由管理員結束收集後再選擇。');
    const quote = request.quotes.find(q => q.id === quoteId);
    if (!quote) throw new Error('找不到這份報價。');
    request.selectedQuoteId = quoteId;
    request.status = 'selected';
    event(state, request.id, '老師已選定供應商，聯絡資料現已開放', 'supplier_selected', { supplierId: quote.supplierId });
    save(state);
    return quote;
  }

  // Administrators can approve a pending company or suspend an existing company.
  function approveSupplier(state, supplierId, approved) {
    const supplier = supplierFor(state, supplierId);
    supplier.status = approved === false ? 'suspended' : 'approved';
    event(state, null, approved === false ? '管理員已暫停一間供應商的接單資格' : '一間供應商已通過審核', 'supplier_reviewed', { supplierId });
    save(state);
    return supplier;
  }

  // Close collection explicitly and retain all quotes, including an insufficient-quote outcome.
  function closeRequest(state, requestId) {
    const request = requestFor(state, requestId);
    if (request.status === 'selected' || request.status === 'closed') return request;
    request.status = 'closed';
    event(state, request.id, `已結束報價收集，共 ${request.quotes.length} 份報價`, 'request_closed');
    save(state);
    return request;
  }

  // Keep clarifications within this local prototype rather than sending outside messages.
  function addMessage(state, requestId, author, value) {
    const request = requestFor(state, requestId);
    if (!['teacher', 'supplier', 'admin'].includes(author)) throw new Error('無效的留言身份。');
    const content = text(value);
    if (!content) throw new Error('請先填寫問題或回覆內容。');
    if (content.length > 2000) throw new Error('留言請控制在 2000 字以內。');
    const message = { id: uid('msg'), author, text: content, at: now() };
    request.messages.push(message);
    event(state, request.id, '需求討論有一條新留言', 'message_added');
    save(state);
    return message;
  }

  // Useful summary aliases keep the dashboard and management views on the same source of truth.
  function getCounts(state) {
    const counts = { total: state.requests.length, active: state.requests.filter(r => ['matching', 'collecting'].includes(r.status)).length,
      ready: state.requests.filter(r => r.status === 'ready').length, selected: state.requests.filter(r => r.status === 'selected').length,
      closed: state.requests.filter(r => r.status === 'closed').length, quotes: state.requests.reduce((sum, r) => sum + r.quotes.length, 0),
      approvedSuppliers: state.suppliers.filter(s => s.status === 'approved').length,
      pendingSuppliers: state.suppliers.filter(s => s.status === 'pending').length };
    return { ...counts, requests: counts.total, suppliers: state.suppliers.length, totalRequests: counts.total,
      activeRequests: counts.active, readyRequests: counts.ready, totalQuotes: counts.quotes, pending: counts.pendingSuppliers };
  }

  global.IQ = { load, save, reset, seed, createRequest, acceptInvitation, submitQuote, selectQuote, approveSupplier,
    dispatch, closeRequest, addMessage, getCounts, categories: CATEGORIES, districts: DISTRICTS, storageKey: STORAGE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
