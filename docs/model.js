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

  const REVIEW_STATUSES = ['pending', 'valid', 'clarification', 'rejected', 'expired', 'reconfirmation'];
  const timestamp = value => new Date(value).getTime();
  const clone = value => JSON.parse(JSON.stringify(value));
  const minTime = (a, b) => new Date(Math.min(timestamp(a), timestamp(b))).toISOString();
  const isTerminal = request => ['closed', 'cancelled'].includes(request.status);
  function requireOpen(request) {
    if (isTerminal(request)) throw new Error('這項需求已經停止接收新的報價。');
    if (timestamp(request.deadline) <= Date.now()) throw new Error('報價截止時間已過，無法繼續操作。');
  }
  function requireNotCancelled(request) {
    if (request.status === 'cancelled') throw new Error('這項需求已取消，不能繼續操作。');
  }
  function save(state) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* Browser-local demo. */ }
    return state;
  }
  function versionSnapshot(request, reason) {
    return { revision: request.revision, title: request.title, description: request.description,
      category: request.category, district: request.district, budget: request.budget,
      deadline: request.deadline, files: clone(request.files || []), at: now(), reason: text(reason) };
  }
  function currentStage(request) {
    let stage = request.stages.find(item => item.number === request.stage && item.revision === request.revision);
    if (!stage) {
      stage = { number: request.stage, revision: request.revision, openedAt: now(), deadline: request.deadline,
        status: 'collecting', quoteIds: [], deliveredAt: null, reason: '', deliveries: [] };
      request.stages.push(stage);
    }
    return stage;
  }
  function ensureWorkflow(state) {
    state.requests.forEach(request => {
      const legacy = request.workflowVersion !== 2, wasSelected = request.status === 'selected';
      request.revision = Number.isInteger(request.revision) && request.revision > 0 ? request.revision : 1;
      request.stage = Number.isInteger(request.stage) && request.stage > 0 ? request.stage : 1;
      request.targetQuotes = 5;
      request.versions = Array.isArray(request.versions) ? request.versions : [versionSnapshot(request, '初始需求')];
      request.stages = Array.isArray(request.stages) ? request.stages : [];
      request.deliveredQuoteIds = Array.isArray(request.deliveredQuoteIds) ? request.deliveredQuoteIds :
        (legacy && ['ready', 'closed', 'selected'].includes(request.status) ? request.quotes.map(q => q.id) : []);
      request.shortlistedQuoteIds = Array.isArray(request.shortlistedQuoteIds) ? request.shortlistedQuoteIds :
        (wasSelected && request.selectedQuoteId ? [request.selectedQuoteId] : []);
      request.invitations.forEach(invitation => {
        invitation.stage = invitation.stage || request.stage;
        invitation.replyDeadline = invitation.replyDeadline || minTime(future(12), request.deadline);
        invitation.quoteDueAt = invitation.quoteDueAt || request.deadline;
        if (invitation.acceptedAt === undefined) invitation.acceptedAt = null;
      });
      request.quotes.forEach(quote => {
        quote.reviewStatus = REVIEW_STATUSES.includes(quote.reviewStatus) ? quote.reviewStatus : (legacy ? 'valid' : 'pending');
        quote.reviewReason = quote.reviewReason || (legacy ? '由舊版演示資料遷移' : '');
        quote.requestRevision = quote.requestRevision || request.revision;
        quote.quoteRevision = quote.quoteRevision || 1;
        quote.revisions = Array.isArray(quote.revisions) ? quote.revisions : [];
        quote.reviewHistory = Array.isArray(quote.reviewHistory) ? quote.reviewHistory : [];
      });
      if (wasSelected) request.status = 'closed';
      const stage = currentStage(request);
      stage.deliveries = Array.isArray(stage.deliveries) ? stage.deliveries : [];
      if (legacy && request.deliveredQuoteIds.length) {
        stage.quoteIds = [...new Set(request.deliveredQuoteIds)];
        stage.deliveredAt = stage.deliveredAt || request.createdAt || now();
        stage.status = request.status === 'closed' ? 'closed' : 'delivered';
        stage.deliveries.push({ id: 'legacy-' + request.id, at: stage.deliveredAt, revision: request.revision,
          quoteIds: [...stage.quoteIds], quotes: clone(request.quotes.filter(q => stage.quoteIds.includes(q.id))), reason: '舊版已交付報價' });
      }
      request.workflowVersion = 2;
    });
    return state;
  }
  function validQuotes(state, request) {
    if (!request || request.status === 'cancelled') return [];
    const companies = new Set();
    return request.quotes.filter(quote => {
      const supplier = state.suppliers.find(item => item.id === quote.supplierId);
      const invitation = request.invitations.find(item => item.supplierId === quote.supplierId);
      const key = supplier && companyKey(supplier.br);
      const eligible = quote.reviewStatus === 'valid' && quote.requestRevision === request.revision &&
        Number(quote.amount) > 0 && text(quote.description) && Number(quote.validDays) > 0 &&
        timestamp(quote.submittedAt) + Number(quote.validDays) * 86400000 > Date.now() &&
        supplier && isEligible(supplier, request) && key && !companies.has(key) && invitation?.status !== 'withdrawn';
      if (eligible) companies.add(key);
      return !!eligible;
    });
  }
  function deliveredQuotes(state, request) {
    return validQuotes(state, request).filter(quote => request.deliveredQuoteIds.includes(quote.id));
  }
  function outcome(state, request) {
    const count = deliveredQuotes(state, request).length;
    return count === 0 ? 'zero' : count >= request.targetQuotes ? 'target' : 'partial';
  }
  function removeVisibility(request, quoteId) {
    request.deliveredQuoteIds = request.deliveredQuoteIds.filter(id => id !== quoteId);
    request.shortlistedQuoteIds = request.shortlistedQuoteIds.filter(id => id !== quoteId);
    if (request.selectedQuoteId === quoteId) request.selectedQuoteId = null;
  }
  function reservedCompanies(state, request) {
    const valid = validQuotes(state, request);
    const keys = new Set(valid.map(quote => companyKey(supplierFor(state, quote.supplierId).br)));
    request.invitations.filter(i => i.status === 'accepted').forEach(invitation => {
      const supplier = state.suppliers.find(s => s.id === invitation.supplierId);
      if (!supplier || !isEligible(supplier, request)) return;
      const quote = request.quotes.find(q => q.supplierId === invitation.supplierId);
      const submitted = quote && quote.requestRevision === request.revision && ['pending', 'valid'].includes(quote.reviewStatus) &&
        (quote.reviewStatus !== 'valid' || valid.some(q => q.id === quote.id));
      const awaitingCorrection = quote && quote.requestRevision === request.revision && quote.reviewStatus === 'clarification' && timestamp(invitation.quoteDueAt) > Date.now();
      if (submitted || awaitingCorrection || ((!quote || quote.reviewStatus === 'reconfirmation') && timestamp(invitation.quoteDueAt) > Date.now())) {
        const key = companyKey(supplier.br);
        if (key) keys.add(key);
      }
    });
    return keys;
  }
  function refreshStatus(state, request) {
    if (isTerminal(request)) return;
    request.status = validQuotes(state, request).length >= request.targetQuotes ? 'ready' :
      request.invitations.some(i => i.status === 'accepted') ? 'collecting' : 'matching';
  }
  function quoteFor(request, quoteId) {
    const quote = request.quotes.find(item => item.id === quoteId);
    if (!quote) throw new Error('找不到這份報價。');
    return quote;
  }
  function futureDeadline(value, previous) {
    const deadline = timestamp(value);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('請選擇未來的報價截止時間。');
    if (previous && deadline <= timestamp(previous)) throw new Error('新截止時間必須延後，讓供應商有時間重新準備報價。');
    return new Date(deadline).toISOString();
  }
  function requiredReason(value) {
    const reason = text(value);
    if (!reason) throw new Error('請填寫原因，以便保留跟進紀錄。');
    return reason;
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
    return ensureWorkflow({ version: 1, requests: [first, second, third, fourth], suppliers, nextId: 5,
      events: [
        { id: 'evt-seed-1', requestId: first.id, type: 'quote_submitted', title: '收到一份新的匿名報價', text: '收到一份新的匿名報價', at: future(-1) },
        { id: 'evt-seed-2', requestId: second.id, type: 'request_ready', title: '五份報價已備齊，可以開始比較', text: '五份報價已備齊，可以開始比較', at: future(-3) },
        { id: 'evt-seed-3', requestId: third.id, type: 'request_created', title: '校園開放日需求已提交', text: '校園開放日需求已提交', at: future(-4) },
        { id: 'evt-seed-4', requestId: fourth.id, type: 'supplier_selected', title: '老師已選定課程供應商', text: '老師已選定課程供應商', at: future(-45) }
      ]
    });
  }


  function load() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.version === 1 && Array.isArray(parsed.requests) && Array.isArray(parsed.suppliers) && Array.isArray(parsed.events) && Number.isInteger(parsed.nextId) && parsed.requests.every(r => r && r.id && Array.isArray(r.invitations) && Array.isArray(r.quotes) && Array.isArray(r.messages) && Array.isArray(r.files)) && parsed.suppliers.every(s => s && s.id && Array.isArray(s.category) && Array.isArray(s.districts))) {
        ensureWorkflow(parsed); processDeadlines(parsed); return save(parsed);
      }
    } catch (_) { /* Malformed browser data. */ }
    return save(seed());
  }
  function reset() { return save(seed()); }
  function dispatch(state, requestId) {
    const request = requestFor(state, requestId);
    requireOpen(request);
    if (reservedCompanies(state, request).size >= request.targetQuotes) return 0;
    const invitedIds = new Set(request.invitations.map(i => i.supplierId));
    const companies = new Set(request.invitations.map(i => state.suppliers.find(s => s.id === i.supplierId)).filter(Boolean).map(s => companyKey(s.br)));
    const counts = supplier => state.requests.reduce((count, r) => count + r.invitations.filter(i => i.supplierId === supplier.id).length, 0);
    const candidates = state.suppliers.filter(s => isEligible(s, request) && !invitedIds.has(s.id)).sort((a, b) => counts(a) - counts(b) || b.score - a.score);
    const supplierIds = [];
    for (const supplier of candidates) {
      const key = companyKey(supplier.br);
      if (!key || companies.has(key)) continue;
      companies.add(key);
      request.invitations.push({ supplierId: supplier.id, status: 'invited', invitedAt: now(), acceptedAt: null,
        stage: request.stage, replyDeadline: minTime(future(12), request.deadline), quoteDueAt: request.deadline });
      supplierIds.push(supplier.id);
      if (supplierIds.length >= 8) break;
    }
    if (supplierIds.length) event(state, request.id, '已向 ' + supplierIds.length + ' 間符合條件的供應商發出報價邀請', 'invitations_sent', { supplierIds, stage: request.stage, revision: request.revision });
    save(state); return supplierIds.length;
  }
  function createRequest(state, form) {
    const required = { title: '需求標題', category: '報價類別', district: '服務地區', school: '學校名稱', teacher: '老師姓名', phone: '聯繫電話', email: '電子郵箱', description: '需求內容' };
    Object.keys(required).forEach(key => { if (!text(form[key])) throw new Error('請填寫' + required[key] + '。'); });
    if (!CATEGORIES.includes(form.category)) throw new Error('請選擇有效的報價類別。');
    if (!DISTRICTS.includes(form.district)) throw new Error('請選擇有效的服務地區。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(form.email))) throw new Error('請填寫有效的電子郵箱。');
    if (text(form.phone).replace(/\D/g, '').length < 8) throw new Error('請填寫有效的聯繫電話。');
    const deadline = futureDeadline(form.deadline || future(Number(form.deadlineHours) || 72));
    const budget = form.budget === '' || form.budget == null ? 0 : Number(form.budget);
    if (!Number.isFinite(budget) || budget < 0) throw new Error('預算金額必須為零或正數。');
    let id;
    do { id = 'IQ-' + new Date().getFullYear() + '-' + String(state.nextId++).padStart(4, '0'); } while (state.requests.some(r => r.id === id));
    const request = { id, title: text(form.title), category: text(form.category), district: text(form.district), school: text(form.school),
      teacher: text(form.teacher), phone: text(form.phone), email: text(form.email), description: text(form.description),
      budget, deadline, createdAt: now(), status: 'matching', workflowVersion: 2, revision: 1, stage: 1,
      invitations: [], quotes: [], messages: [], files: Array.isArray(form.files) ? form.files.map(f => ({ name: text(f.name), size: Number(f.size) || 0, type: text(f.type) })) : [],
      selectedQuoteId: null, deliveredQuoteIds: [], shortlistedQuoteIds: [], versions: [], stages: [], targetQuotes: 5 };
    request.versions.push(versionSnapshot(request, '初始需求')); currentStage(request);
    state.requests.unshift(request);
    event(state, id, '老師已提交需求，系統開始匹配供應商', 'request_created', { stage: 1, revision: 1 });
    dispatch(state, id); return request;
  }
  function acceptInvitation(state, requestId, supplierId, promised) {
    const request = requestFor(state, requestId), supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (!isEligible(supplier, request)) throw new Error('供應商尚未通過審核或不符合本次需求條件。');
    const invitation = request.invitations.find(i => i.supplierId === supplierId);
    if (!invitation || invitation.status !== 'invited') throw new Error('此邀請不存在，或你已經處理過這項邀請。');
    if (timestamp(invitation.replyDeadline) <= Date.now()) throw new Error('邀請回覆期限已過，請留意下一階段邀請。');
    if (reservedCompanies(state, request).size >= request.targetQuotes) throw new Error('五個接單名額已滿，請留意其他邀請。');
    const key = companyKey(supplier.br);
    if (!key || reservedCompanies(state, request).has(key)) throw new Error('同一間公司不能重複佔用接單名額。');
    if (supplier.plan === 'trial' && supplier.trialRemaining <= 0) throw new Error('免費試用機會已用完，請聯繫管理員。');
    const quoteDueAt = promised && typeof promised === 'object' ? promised.quoteDueAt : promised;
    const due = quoteDueAt ? futureDeadline(quoteDueAt) : minTime(future(24), request.deadline);
    if (timestamp(due) > timestamp(request.deadline)) throw new Error('承諾交報時間不能晚於老師的收集截止時間。');
    invitation.status = 'accepted'; invitation.acceptedAt = now(); invitation.quoteDueAt = due;
    if (supplier.plan === 'trial') supplier.trialRemaining -= 1;
    request.status = 'collecting';
    event(state, request.id, '一間供應商已確認接單及承諾交報時間', 'invitation_accepted', { supplierId, quoteDueAt: due, stage: request.stage, revision: request.revision });
    save(state); return invitation;
  }
  function submitQuote(state, requestId, supplierId, data) {
    const request = requestFor(state, requestId), supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (!isEligible(supplier, request)) throw new Error('供應商尚未通過審核、已被停權或不符合更新後需求。');
    const invitation = request.invitations.find(i => i.supplierId === supplierId);
    const previous = request.quotes.find(q => q.supplierId === supplierId);
    const rejoining = invitation?.status === 'released' && previous && ['rejected', 'expired', 'reconfirmation'].includes(previous.reviewStatus);
    if (!invitation || (invitation.status !== 'accepted' && !rejoining)) throw new Error('請先確認接單，再提交報價。');
    if (timestamp(invitation.quoteDueAt) <= Date.now()) throw new Error('承諾交報時間已過，請由平台延期後再提交。');
    const ownKey = companyKey(supplier.br), reserved = reservedCompanies(state, request);
    if (!reserved.has(ownKey) && reserved.size >= request.targetQuotes) throw new Error('五個接單名額已滿，暫時不能重新提交。');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('請填寫大於零的有效報價金額。');
    if (!text(data.description)) throw new Error('請填寫服務內容及報價說明。');
    const validDays = data.validDays == null || data.validDays === '' ? 30 : Number(data.validDays);
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) throw new Error('報價有效期須為 1 至 365 天。');
    const quote = previous || { id: uid('quote'), supplierId, code: '供應商 ' + String.fromCharCode(65 + request.quotes.length), quoteRevision: 0, revisions: [], reviewHistory: [] };
    if (previous) { quote.revisions.push(clone({ ...quote, revisions: undefined })); removeVisibility(request, quote.id); }
    Object.assign(quote, { amount, description: text(data.description), validDays, submittedAt: now(), attachmentName: text(data.attachmentName),
      reviewStatus: 'pending', reviewReason: '', requestRevision: request.revision, quoteRevision: quote.quoteRevision + 1 });
    if (!previous) request.quotes.push(quote);
    invitation.status = 'accepted'; refreshStatus(state, request);
    event(state, request.id, previous ? '供應商已修訂報價，待平台重新核對' : '收到一份新報價，待平台核對是否符合需求', previous ? 'quote_revised' : 'quote_submitted',
      { supplierId, quoteId: quote.id, stage: request.stage, revision: request.revision, quoteRevision: quote.quoteRevision });
    save(state); return quote;
  }
  function reviewQuote(state, requestId, quoteId, status, reason) {
    const request = requestFor(state, requestId), quote = quoteFor(request, quoteId);
    requireNotCancelled(request);
    if (!REVIEW_STATUSES.includes(status)) throw new Error('請選擇有效的報價審核狀態。');
    const reviewReason = status === 'valid' ? text(reason) : requiredReason(reason);
    const supplier = supplierFor(state, quote.supplierId);
    if (status === 'valid') {
      if (!Number.isFinite(Number(quote.amount)) || Number(quote.amount) <= 0 || !text(quote.description) || !Number.isInteger(Number(quote.validDays)) || Number(quote.validDays) < 1 || Number(quote.validDays) > 365) throw new Error('報價內容不完整，不能核為有效報價。');
      if (quote.requestRevision !== request.revision) throw new Error('需求已更新，必須先由供應商重新確認或修訂報價。');
      if (!isEligible(supplier, request)) throw new Error('供應商資格不符合目前需求，不能核為有效報價。');
      if (timestamp(quote.submittedAt) + Number(quote.validDays) * 86400000 <= Date.now()) throw new Error('報價已失效，請供應商重新提交。');
      const invitation = request.invitations.find(i => i.supplierId === quote.supplierId);
      if (['withdrawn', 'cancelled', 'expired'].includes(invitation?.status)) throw new Error('供應商已退出或失約，不能把舊報價核為有效。');
      const keys = reservedCompanies(state, request), ownKey = companyKey(supplier.br);
      if (!keys.has(ownKey) && keys.size >= request.targetQuotes) throw new Error('接單名額已補滿，不能再增加有效公司。');
    }
    quote.reviewHistory.push({ status: quote.reviewStatus, reason: quote.reviewReason, at: now(), requestRevision: quote.requestRevision, quoteRevision: quote.quoteRevision });
    quote.reviewStatus = status; quote.reviewReason = reviewReason; quote.reviewedAt = now();
    const invitation = request.invitations.find(i => i.supplierId === quote.supplierId);
    if (status !== 'valid') removeVisibility(request, quote.id);
    if (invitation && ['rejected', 'expired'].includes(status)) { invitation.status = 'released'; invitation.releaseReason = reviewReason; }
    else if (invitation && !['withdrawn', 'cancelled', 'expired'].includes(invitation.status)) invitation.status = 'accepted';
    refreshStatus(state, request);
    event(state, request.id, '報價核對狀態已更新：' + ({ pending: '待核對', valid: '符合需求', clarification: '待澄清', rejected: '不符合需求', expired: '已失效', reconfirmation: '待重新確認' })[status], 'quote_reviewed',
      { supplierId: quote.supplierId, quoteId, reviewStatus: status, reason: reviewReason, stage: request.stage, revision: request.revision });
    if (validQuotes(state, request).length >= request.targetQuotes) deliverStage(state, request.id, '已收齊目標有效報價');
    save(state); return quote;
  }
  function deliverStage(state, requestId, reason) {
    const request = requestFor(state, requestId);
    requireNotCancelled(request);
    const stage = currentStage(request), valid = validQuotes(state, request);
    const quotes = valid.filter(q => !request.deliveredQuoteIds.includes(q.id));
    if (!quotes.length && stage.deliveredAt) return stage;
    const at = now(), deliveryId = uid('delivery');
    quotes.forEach(q => { request.deliveredQuoteIds.push(q.id); if (!stage.quoteIds.includes(q.id)) stage.quoteIds.push(q.id); });
    stage.deliveredAt = at; stage.status = request.status === 'closed' ? 'closed' : 'delivered'; stage.reason = text(reason) || '分階段交付現有有效報價';
    stage.deliveries.push({ id: deliveryId, at, revision: request.revision, quoteIds: quotes.map(q => q.id), quotes: clone(quotes), reason: stage.reason });
    event(state, request.id, '第 ' + request.stage + ' 階段已交付 ' + quotes.length + ' 份有效報價，老師可查看聯絡資料', 'stage_delivered',
      { stage: request.stage, revision: request.revision, deliveryId, quoteIds: quotes.map(q => q.id), validCount: deliveredQuotes(state, request).length, outcome: outcome(state, request) });
    save(state); return stage;
  }

  function releaseUnfulfilled(state, request, reason) {
    request.invitations.filter(i => i.status === 'accepted').forEach(invitation => {
      const quote = request.quotes.find(q => q.supplierId === invitation.supplierId);
      if (quote && quote.requestRevision === request.revision && ['valid', 'pending'].includes(quote.reviewStatus)) return;
      if (timestamp(invitation.quoteDueAt) > Date.now() && (!quote || quote.reviewStatus === 'reconfirmation')) return;
      invitation.status = 'expired'; invitation.releaseReason = reason;
      if (quote) removeVisibility(request, quote.id);
      event(state, request.id, '未按承諾交報的名額已釋放', 'invitation_expired', { supplierId: invitation.supplierId, stage: request.stage, revision: request.revision, reason });
    });
  }
  function startNextStage(state, requestId, data) {
    const request = requestFor(state, requestId);
    requireNotCancelled(request);
    const deadline = futureDeadline(data?.deadline, request.deadline), reason = requiredReason(data?.reason);
    deliverStage(state, requestId, reason); releaseUnfulfilled(state, request, '上一階段未完成交報');
    currentStage(request).status = 'closed';
    request.stage += 1; request.deadline = deadline; request.status = 'collecting';
    const stage = currentStage(request); stage.reason = reason;
    const revived = [];
    request.invitations.forEach(invitation => {
      const supplier = state.suppliers.find(s => s.id === invitation.supplierId);
      if (!invitation.acceptedAt && !request.quotes.some(q => q.supplierId === invitation.supplierId) &&
        ['invited', 'reply_expired'].includes(invitation.status) && supplier && isEligible(supplier, request) && reservedCompanies(state, request).size < request.targetQuotes) {
        invitation.status = 'invited'; invitation.stage = request.stage; invitation.invitedAt = now();
        invitation.replyDeadline = minTime(future(12), deadline); invitation.quoteDueAt = deadline; revived.push(invitation.supplierId);
      }
      if (invitation.status === 'accepted') invitation.quoteDueAt = deadline;
    });
    event(state, request.id, '已開始第 ' + request.stage + ' 階段，繼續尋找合適供應商', 'stage_started', { stage: request.stage, revision: request.revision, deadline, reason });
    if (revived.length) event(state, request.id, '已向 ' + revived.length + ' 間候補供應商重開邀請', 'invitations_sent', { supplierIds: revived, stage: request.stage, revision: request.revision });
    dispatch(state, request.id); save(state); return stage;
  }
  function withdrawInvitation(state, requestId, supplierId, reason) {
    const request = requestFor(state, requestId), invitation = request.invitations.find(i => i.supplierId === supplierId);
    requireOpen(request);
    const explanation = requiredReason(reason);
    if (!invitation || !['invited', 'accepted'].includes(invitation.status)) throw new Error('這項邀請已結束，不能再次退出。');
    invitation.status = 'withdrawn'; invitation.withdrawnAt = now(); invitation.releaseReason = explanation;
    const quote = request.quotes.find(q => q.supplierId === supplierId);
    if (quote) { quote.reviewStatus = 'expired'; quote.reviewReason = '供應商退出：' + explanation; removeVisibility(request, quote.id); }
    refreshStatus(state, request);
    event(state, request.id, '供應商已退出，接單名額已釋放', 'invitation_withdrawn', { supplierId, stage: request.stage, revision: request.revision, reason: explanation });
    save(state); return invitation;
  }
  function processDeadlines(state) {
    let changed = false;
    state.requests.forEach(request => {
      if (request.status === 'cancelled') return;
      request.quotes.forEach(quote => {
        if (quote.reviewStatus === 'valid' && timestamp(quote.submittedAt) + Number(quote.validDays) * 86400000 <= Date.now()) {
          quote.reviewStatus = 'expired'; quote.reviewReason = '報價有效期已過'; removeVisibility(request, quote.id); changed = true;
          const invitation = request.invitations.find(i => i.supplierId === quote.supplierId);
          if (invitation?.status === 'accepted') invitation.status = 'released';
          event(state, request.id, '一份報價已過有效期，不再計入有效報價', 'quote_expired', { quoteId: quote.id, supplierId: quote.supplierId, stage: request.stage, revision: request.revision });
        }
      });
      const currentValidIds = new Set(validQuotes(state, request).map(q => q.id));
      const visibleIds = request.deliveredQuoteIds.filter(id => currentValidIds.has(id));
      const shortlist = request.shortlistedQuoteIds.filter(id => visibleIds.includes(id)).slice(0, 3);
      if (visibleIds.length !== request.deliveredQuoteIds.length || shortlist.length !== request.shortlistedQuoteIds.length) {
        request.deliveredQuoteIds = visibleIds; request.shortlistedQuoteIds = shortlist; changed = true;
      }
      if (isTerminal(request)) return;
      request.invitations.forEach(invitation => {
        const quote = request.quotes.find(q => q.supplierId === invitation.supplierId);
        const submitted = quote && quote.requestRevision === request.revision && ['pending', 'valid'].includes(quote.reviewStatus);
        if (invitation.status === 'invited' && timestamp(invitation.replyDeadline) <= Date.now()) {
          invitation.status = 'reply_expired'; changed = true;
          event(state, request.id, '供應商邀請回覆期限已過', 'invitation_expired', { supplierId: invitation.supplierId, stage: request.stage, revision: request.revision, reason: '邀請未回覆' });
        } else if (invitation.status === 'accepted' && !submitted && timestamp(invitation.quoteDueAt) <= Date.now()) {
          invitation.status = 'expired'; invitation.releaseReason = quote?.reviewStatus === 'clarification' ? '待澄清報價未按時補交' : '未按承諾交報'; changed = true;
          event(state, request.id, '未按承諾交報的名額已釋放', 'invitation_expired', { supplierId: invitation.supplierId, stage: request.stage, revision: request.revision, reason: invitation.releaseReason });
        }
      });
      if (timestamp(request.deadline) <= Date.now()) {
        deliverStage(state, request.id, '本階段收集截止');
        request.status = 'closed'; request.closedAt = now(); currentStage(request).status = 'closed'; changed = true;
        event(state, request.id, '本階段已截止，結果為' + ({ zero: '零份有效報價', partial: '不足五份有效報價', target: '已達目標有效報價' })[outcome(state, request)], 'request_closed',
          { stage: request.stage, revision: request.revision, outcome: outcome(state, request), reason: '收集截止' });
      } else refreshStatus(state, request);
    });
    if (changed) save(state);
    return changed;
  }
  function updateRequest(state, requestId, data) {
    const request = requestFor(state, requestId); requireNotCancelled(request);
    const reason = requiredReason(data?.reason), deadline = futureDeadline(data?.deadline, request.deadline);
    const values = { title: data.title === undefined ? request.title : text(data.title), description: data.description === undefined ? request.description : text(data.description),
      category: data.category === undefined ? request.category : data.category, district: data.district === undefined ? request.district : data.district,
      budget: data.budget === undefined ? request.budget : Number(data.budget) };
    if (!values.title || !values.description) throw new Error('需求名稱及內容不能留空。');
    if (!CATEGORIES.includes(values.category) || !DISTRICTS.includes(values.district)) throw new Error('請選擇有效的類別及地區。');
    if (!Number.isFinite(values.budget) || values.budget < 0) throw new Error('預算金額必須為零或正數。');
    const oldRevision = request.revision;
    currentStage(request).status = 'closed';
    Object.assign(request, values, { deadline, revision: oldRevision + 1, stage: request.stage + 1, status: 'collecting', deliveredQuoteIds: [], shortlistedQuoteIds: [], selectedQuoteId: null });
    request.versions.push(versionSnapshot(request, reason)); currentStage(request).reason = '需求更新：' + reason;
    request.quotes.forEach(quote => {
      quote.reviewHistory.push({ status: quote.reviewStatus, reason: quote.reviewReason, at: now(), requestRevision: quote.requestRevision, quoteRevision: quote.quoteRevision });
      quote.reviewStatus = 'reconfirmation'; quote.reviewReason = '需求已更新，請重新確認或修訂報價';
    });
    request.invitations.forEach(invitation => {
      const supplier = state.suppliers.find(s => s.id === invitation.supplierId);
      const mayReconfirm = invitation.status === 'released' && request.quotes.some(q => q.supplierId === invitation.supplierId) && supplier && isEligible(supplier, request);
      if (['accepted', 'invited'].includes(invitation.status) || mayReconfirm) {
        invitation.quoteDueAt = deadline;
        if (invitation.status === 'invited') invitation.replyDeadline = minTime(future(12), deadline);
        if (!supplier || !isEligible(supplier, request)) { invitation.status = 'released'; invitation.releaseReason = '不符合更新後需求'; }
      }
    });
    event(state, request.id, '需求已更新至第 ' + request.revision + ' 版，交報截止時間已延後', 'request_updated',
      { oldRevision, revision: request.revision, stage: request.stage, deadline, reason, supplierIds: request.invitations.map(i => i.supplierId) });
    dispatch(state, request.id); save(state); return request;
  }
  function teacherDecision(state, requestId, action, data) {
    const request = requestFor(state, requestId); requireNotCancelled(request);
    if (!['accept', 'extend', 'cancel'].includes(action)) throw new Error('無效的跟進選項。');
    const reason = requiredReason(data?.reason);
    if (action === 'extend') {
      const stage = startNextStage(state, requestId, { deadline: data.deadline, reason });
      request.teacherDecision = { action, reason, at: now(), stage: request.stage }; save(state); return stage;
    }
    if (action === 'accept' && !deliveredQuotes(state, request).length) throw new Error('尚未有有效報價可接受，請延期、調整需求或取消。');
    request.teacherDecision = { action, reason, at: now(), stage: request.stage };
    request.status = action === 'cancel' ? 'cancelled' : 'closed';
    currentStage(request).status = 'closed'; request.closedAt = now();
    if (action === 'cancel') {
      request.cancelReason = reason; request.shortlistedQuoteIds = []; request.selectedQuoteId = null;
      request.invitations.forEach(i => { if (['invited', 'accepted'].includes(i.status)) i.status = 'cancelled'; });
    }
    event(state, request.id, action === 'cancel' ? '老師已取消需求，停止派單與提醒' : '老師接受現有結果，後續可選擇洽談名單', action === 'cancel' ? 'request_cancelled' : 'teacher_decision',
      { action, reason, stage: request.stage, revision: request.revision, supplierIds: request.invitations.map(i => i.supplierId) });
    save(state); return request;
  }
  function toggleShortlist(state, requestId, quoteId) {
    const request = requestFor(state, requestId), quote = quoteFor(request, quoteId); requireNotCancelled(request);
    const existing = request.shortlistedQuoteIds.includes(quoteId), eligible = deliveredQuotes(state, request);
    const cleaned = request.shortlistedQuoteIds.filter(id => eligible.some(q => q.id === id));
    if (!existing && !eligible.some(q => q.id === quoteId)) throw new Error('只可把已交付且仍然有效的報價加入洽談名單。');
    if (!existing && cleaned.length >= 3) throw new Error('最多選擇 3 間供應商洽談，請先移除一間。');
    request.shortlistedQuoteIds = existing ? cleaned.filter(id => id !== quoteId) : [...cleaned, quoteId];
    request.selectedQuoteId = request.shortlistedQuoteIds[0] || null;
    event(state, request.id, existing ? '已從洽談名單移除供應商' : '已加入洽談名單，並不代表確認成交', 'shortlist_changed',
      { stage: request.stage, revision: request.revision, quoteIds: [...request.shortlistedQuoteIds], supplierIds: request.shortlistedQuoteIds.map(id => quoteFor(request, id).supplierId), changedQuoteId: quoteId, added: !existing });
    save(state); return quote;
  }
  function selectQuote(state, requestId, quoteId) { return toggleShortlist(state, requestId, quoteId); }
  function approveSupplier(state, supplierId, approved) {
    const supplier = supplierFor(state, supplierId); supplier.status = approved === false ? 'suspended' : 'approved';
    if (approved === false) state.requests.forEach(request => {
      request.quotes.filter(q => q.supplierId === supplierId).forEach(q => removeVisibility(request, q.id));
      const invitation = request.invitations.find(i => i.supplierId === supplierId);
      if (invitation && ['accepted', 'invited'].includes(invitation.status)) { invitation.status = 'released'; invitation.releaseReason = '公司資格暫停'; }
      refreshStatus(state, request);
    });
    event(state, null, approved === false ? '管理員已暫停一間供應商的接單資格' : '一間供應商已通過審核', 'supplier_reviewed', { supplierId });
    save(state); return supplier;
  }
  function closeRequest(state, requestId, reason) {
    const request = requestFor(state, requestId); requireNotCancelled(request);
    if (request.status === 'closed') return request;
    deliverStage(state, requestId, text(reason) || '平台結束本階段收集');
    request.status = 'closed'; request.closedAt = now(); currentStage(request).status = 'closed';
    event(state, request.id, '已結束本階段收集，共交付 ' + deliveredQuotes(state, request).length + ' 份有效報價', 'request_closed',
      { stage: request.stage, revision: request.revision, outcome: outcome(state, request), reason: text(reason) || '平台結束本階段收集' });
    save(state); return request;
  }
  function addMessage(state, requestId, author, value) {
    const request = requestFor(state, requestId); requireNotCancelled(request);
    if (!['teacher', 'supplier', 'admin'].includes(author)) throw new Error('無效的留言身份。');
    const content = text(value);
    if (!content) throw new Error('請先填寫問題或回覆內容。');
    if (content.length > 2000) throw new Error('留言請控制在 2000 字以內。');
    const message = { id: uid('msg'), author, text: content, at: now() };
    request.messages.push(message); event(state, request.id, '需求討論有一條新留言', 'message_added'); save(state); return message;
  }
  function getCounts(state) {
    const counts = { total: state.requests.length, active: state.requests.filter(r => ['matching', 'collecting'].includes(r.status)).length,
      ready: state.requests.filter(r => r.status === 'ready').length, selected: state.requests.filter(r => r.shortlistedQuoteIds.length > 0).length,
      closed: state.requests.filter(r => r.status === 'closed').length, quotes: state.requests.reduce((sum, r) => sum + validQuotes(state, r).length, 0),
      approvedSuppliers: state.suppliers.filter(s => s.status === 'approved').length, pendingSuppliers: state.suppliers.filter(s => s.status === 'pending').length };
    return { ...counts, requests: counts.total, suppliers: state.suppliers.length, totalRequests: counts.total, activeRequests: counts.active,
      readyRequests: counts.ready, totalQuotes: counts.quotes, pending: counts.pendingSuppliers };
  }
  global.IQ = { load, save, reset, seed, ensureWorkflow, validQuotes, deliveredQuotes, outcome, reviewQuote, deliverStage, startNextStage,
    withdrawInvitation, processDeadlines, updateRequest, teacherDecision, toggleShortlist, createRequest, acceptInvitation, submitQuote,
    selectQuote, approveSupplier, dispatch, closeRequest, addMessage, getCounts, categories: CATEGORIES, districts: DISTRICTS, storageKey: STORAGE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
