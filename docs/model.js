(function (global) {
  'use strict';

  const STORAGE_KEY = 'instiquote-prototype-v1';
  const CATEGORIES = ['到校课程', '到校活动', '印刷制作', '小型维修'];
  const DISTRICTS = ['九龙城区', '沙田区', '观塘区', '中西区', '屯门区'];
  let sequence = 0;
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${++sequence}`;
  const companyKey = br => String(br || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const text = value => String(value == null ? '' : value).trim();
  const future = hours => new Date(Date.now() + hours * 3600000).toISOString();

  function requestFor(state, id) {
    const request = state.requests.find(item => item.id === id);
    if (!request) throw new Error('找不到这项需求，请返回列表重新选择。');
    return request;
  }

  function supplierFor(state, id) {
    const supplier = state.suppliers.find(item => item.id === id);
    if (!supplier) throw new Error('找不到这间供应商。');
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
    if (['closed', 'selected', 'ready'].includes(request.status)) throw new Error('这项需求已经停止接收新的报价。');
    if (new Date(request.deadline).getTime() <= Date.now()) throw new Error('报价截止时间已过，无法继续操作。');
  }

  // Persist only browser-local demo records; storage failures leave the current session usable.
  function save(state) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* Private mode or storage quota. */ }
    return state;
  }

  // Create fresh, relative-time sample data so the prototype never opens with stale deadlines.
  function seed() {
    const year = new Date().getFullYear();
    const companyNames = ['启思教育工作室', '创学教育有限公司', '星河校园服务', '悦动教育活动', '智趣教学资源', '青苗创意制作', '同行校园工程', '新程教育科技'];
    const suppliers = companyNames.map((name, index) => ({
      id: `sup-${index + 1}`, name, br: `${73001000 + index}-000-11-26-0`,
      category: index === 0 ? [...CATEGORIES] : [...new Set(['到校课程', CATEGORIES[index % 4], ...(index < 4 ? ['到校活动'] : [])])],
      districts: index === 0 ? [...DISTRICTS] : [...new Set(['九龙城区', DISTRICTS[index % 5], ...(index < 5 ? ['沙田区'] : [])])],
      status: index === 7 ? 'pending' : 'approved', score: [98, 96, 95, 92, 90, 88, 84, 100][index],
      plan: index < 3 ? 'paid' : index === 7 ? 'trial' : 'free',
      contact: ['陈先生', '李小姐', '张先生', '周小姐', '黄先生', '吴小姐', '林先生', '何小姐'][index],
      phone: `+852 5550 ${String(index + 1001)}`, email: `supplier${index + 1}@example.com`, trialRemaining: 2
    }));
    function makeRequest(number, extra) {
      return {
        id: `IQ-${year}-${String(number).padStart(4, '0')}`, title: '', category: '到校课程', district: '九龙城区',
        school: '明德学校（演示）', teacher: '陈老师', phone: '+852 5550 8801', email: 'teacher@example.com',
        description: '', budget: 18000, deadline: future(48), createdAt: future(-24), status: 'matching',
        invitations: [], quotes: [], messages: [], files: [], selectedQuoteId: null, ...extra
      };
    }
    function invitation(supplierId, status) {
      return { supplierId, status, invitedAt: future(-20), acceptedAt: status === 'accepted' ? future(-18) : null };
    }
    function quotation(index, amount) {
      return {
        id: `quote-seed-${index + 1}-${amount}`, supplierId: `sup-${index + 1}`, code: `供应商 ${String.fromCharCode(65 + index)}`,
        amount, description: [
          '包含 2 位专业导师、全套教学材料及学生作品，课程结束后提供活动总结。',
          '提供分组教学、器材租用及课后学习单，报价已包含交通及材料费用。',
          '包含课程设计、导师、学生材料及成果展示，可按学校需要调整教学内容。',
          '提供完整活动流程、导师服务及互动教学工具，包含基本保险及交通费用。',
          '包含课前协调、到校教学及学生学习材料，提供活动照片及成果记录。'
        ][index % 5], validDays: 30, submittedAt: future(-8 + index), attachmentName: '课程服务报价.pdf'
      };
    }
    const first = makeRequest(1, {
      title: '小四 STEM 创意科学工作坊', category: '到校课程', district: '九龙城区', budget: 18000,
      description: '为小四学生安排半天 STEM 创意科学工作坊，共 60 人，分两组进行。希望包含动手实验、材料及导师，活动时间为下月星期五下午。',
      status: 'collecting', invitations: suppliers.slice(0, 7).map((s, i) => invitation(s.id, i === 1 || i === 2 ? 'accepted' : 'invited')),
      quotes: [quotation(1, 14800), quotation(2, 16200)], files: [{ name: 'STEM工作坊需求说明.pdf', size: 245760, type: 'application/pdf' }],
      messages: [{ id: 'msg-seed-1', author: 'admin', text: '已完成需求整理，供应商将根据相同规格提供报价。', at: future(-19) }]
    });
    const second = makeRequest(2, {
      title: '小五科学探索体验课程', description: '为 80 名小五学生安排两节科学探索课程，每节 90 分钟，需包含材料、导师及课堂活动。',
      status: 'ready', deadline: future(12), createdAt: future(-60), budget: 24000,
      invitations: suppliers.slice(0, 5).map(s => invitation(s.id, 'accepted')),
      quotes: [quotation(0, 18800), quotation(1, 21200), quotation(2, 19600), quotation(3, 22800), quotation(4, 20500)]
    });
    const third = makeRequest(3, {
      title: '校园开放日互动摊位', category: '到校活动', district: '沙田区', school: '育才小学（演示）',
      description: '开放日需要三个互动游戏摊位，预计 200 人参加，活动为期四小时，报价需包括工作人员、布置、器材及撤场。',
      budget: 30000, deadline: future(68), createdAt: future(-4),
      invitations: suppliers.filter(s => s.status === 'approved' && s.category.includes('到校活动') && s.districts.includes('沙田区')).map(s => invitation(s.id, 'invited'))
    });
    const fourth = makeRequest(4, {
      title: '小三创意编程入门课程', description: '为小三学生提供四节图形化编程入门课程，包含导师、教学设计及课后练习。',
      status: 'selected', createdAt: future(-120), deadline: future(-48), budget: 16000,
      invitations: suppliers.slice(0, 5).map(s => invitation(s.id, 'accepted')),
      quotes: [quotation(0, 12800), quotation(1, 14600), quotation(2, 13200), quotation(3, 15800), quotation(4, 13900)]
    });
    fourth.selectedQuoteId = fourth.quotes[0].id;
    return { version: 1, requests: [first, second, third, fourth], suppliers, nextId: 5,
      events: [
        { id: 'evt-seed-1', requestId: first.id, type: 'quote_submitted', title: '收到一份新的匿名报价', text: '收到一份新的匿名报价', at: future(-1) },
        { id: 'evt-seed-2', requestId: second.id, type: 'request_ready', title: '五份报价已备齐，可以开始比较', text: '五份报价已备齐，可以开始比较', at: future(-3) },
        { id: 'evt-seed-3', requestId: third.id, type: 'request_created', title: '校园开放日需求已提交', text: '校园开放日需求已提交', at: future(-4) },
        { id: 'evt-seed-4', requestId: fourth.id, type: 'supplier_selected', title: '老师已选定课程供应商', text: '老师已选定课程供应商', at: future(-45) }
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
            event(parsed, request.id, `报价已截止，现有 ${request.quotes.length} 份报价可供查看`, 'request_closed');
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
    if (added) event(state, request.id, `已向 ${added} 间符合条件的供应商发出报价邀请`, 'invitations_sent');
    save(state);
    return added;
  }

  // Create a validated request, issue a unique reference and prepare its first invitation batch.
  function createRequest(state, form) {
    const required = { title: '需求标题', category: '报价类别', district: '服务地区', school: '学校名称', teacher: '老师姓名', phone: '联系电话', email: '电子邮箱', description: '需求内容' };
    Object.keys(required).forEach(key => { if (!text(form[key])) throw new Error(`请填写${required[key]}。`); });
    if (!CATEGORIES.includes(form.category)) throw new Error('请选择有效的报价类别。');
    if (!DISTRICTS.includes(form.district)) throw new Error('请选择有效的服务地区。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(form.email))) throw new Error('请填写有效的电子邮箱。');
    if (text(form.phone).replace(/\D/g, '').length < 8) throw new Error('请填写有效的联系电话。');
    const deadline = form.deadline || future(Number(form.deadlineHours) || 72);
    if (!Number.isFinite(new Date(deadline).getTime()) || new Date(deadline).getTime() <= Date.now()) throw new Error('请选择未来的报价截止时间。');
    const budget = form.budget === '' || form.budget == null ? 0 : Number(form.budget);
    if (!Number.isFinite(budget) || budget < 0) throw new Error('预算金额必须为零或正数。');
    let id;
    do { id = `IQ-${new Date().getFullYear()}-${String(state.nextId++).padStart(4, '0')}`; } while (state.requests.some(r => r.id === id));
    const request = {
      id, title: text(form.title), category: text(form.category), district: text(form.district), school: text(form.school),
      teacher: text(form.teacher), phone: text(form.phone), email: text(form.email), description: text(form.description),
      budget, deadline: new Date(deadline).toISOString(), createdAt: now(), status: 'matching',
      invitations: [], quotes: [], messages: [], files: Array.isArray(form.files) ? form.files.map(f => ({ name: text(f.name), size: Number(f.size) || 0, type: text(f.type) })) : [], selectedQuoteId: null
    };
    state.requests.unshift(request);
    event(state, id, '老师已提交需求，系统开始匹配供应商', 'request_created');
    dispatch(state, id);
    return request;
  }

  // Reserve one of five supplier slots atomically within the current browser session.
  function acceptInvitation(state, requestId, supplierId) {
    const request = requestFor(state, requestId);
    const supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (!isEligible(supplier, request)) throw new Error('供应商尚未通过审核或不符合本次需求条件。');
    const invitation = request.invitations.find(i => i.supplierId === supplierId);
    if (!invitation || invitation.status !== 'invited') throw new Error('此邀请不存在，或你已经处理过这项邀请。');
    const reserved = new Set([...request.invitations.filter(i => i.status === 'accepted').map(i => i.supplierId), ...request.quotes.map(q => q.supplierId)]);
    if (reserved.size >= 5) throw new Error('五个接单名额已满，请留意其他邀请。');
    if (supplier.plan === 'trial' && supplier.trialRemaining <= 0) throw new Error('免费试用机会已用完，请联系管理员。');
    invitation.status = 'accepted';
    invitation.acceptedAt = now();
    if (supplier.plan === 'trial') supplier.trialRemaining -= 1;
    request.status = 'collecting';
    event(state, request.id, '一间供应商已确认接单', 'invitation_accepted', { supplierId });
    save(state);
    return invitation;
  }

  // Submit one anonymous quote per accepted supplier and mark the request ready at five quotes.
  function submitQuote(state, requestId, supplierId, data) {
    const request = requestFor(state, requestId);
    const supplier = supplierFor(state, supplierId);
    requireOpen(request);
    if (supplier.status !== 'approved') throw new Error('供应商尚未通过审核或已被停权。');
    if (!request.invitations.some(i => i.supplierId === supplierId && i.status === 'accepted')) throw new Error('请先确认接单，再提交报价。');
    if (request.quotes.some(q => q.supplierId === supplierId)) throw new Error('你已经提交过这项需求的报价。');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('请填写大于零的有效报价金额。');
    if (!text(data.description)) throw new Error('请填写服务内容及报价说明。');
    const validDays = data.validDays == null || data.validDays === '' ? 30 : Number(data.validDays);
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) throw new Error('报价有效期须为 1 至 365 天。');
    const quote = { id: uid('quote'), supplierId, code: `供应商 ${String.fromCharCode(65 + request.quotes.length)}`, amount,
      description: text(data.description), validDays, submittedAt: now(), attachmentName: text(data.attachmentName) };
    request.quotes.push(quote);
    request.status = request.quotes.length >= 5 ? 'ready' : 'collecting';
    event(state, request.id, `收到第 ${request.quotes.length} 份匿名报价`, 'quote_submitted', { supplierId });
    if (request.status === 'ready') event(state, request.id, '五份报价已备齐，可以开始比较', 'request_ready');
    save(state);
    return quote;
  }

  // Selection is possible after five quotes or after the request closes with partial results.
  function selectQuote(state, requestId, quoteId) {
    const request = requestFor(state, requestId);
    if (!['ready', 'closed'].includes(request.status)) throw new Error('请等待报价收集完成，或由管理员结束收集后再选择。');
    const quote = request.quotes.find(q => q.id === quoteId);
    if (!quote) throw new Error('找不到这份报价。');
    request.selectedQuoteId = quoteId;
    request.status = 'selected';
    event(state, request.id, '老师已选定供应商，联络资料现已开放', 'supplier_selected', { supplierId: quote.supplierId });
    save(state);
    return quote;
  }

  // Administrators can approve a pending company or suspend an existing company.
  function approveSupplier(state, supplierId, approved) {
    const supplier = supplierFor(state, supplierId);
    supplier.status = approved === false ? 'suspended' : 'approved';
    event(state, null, approved === false ? '管理员已暂停一间供应商的接单资格' : '一间供应商已通过审核', 'supplier_reviewed', { supplierId });
    save(state);
    return supplier;
  }

  // Close collection explicitly and retain all quotes, including an insufficient-quote outcome.
  function closeRequest(state, requestId) {
    const request = requestFor(state, requestId);
    if (request.status === 'selected' || request.status === 'closed') return request;
    request.status = 'closed';
    event(state, request.id, `已结束报价收集，共 ${request.quotes.length} 份报价`, 'request_closed');
    save(state);
    return request;
  }

  // Keep clarifications within this local prototype rather than sending outside messages.
  function addMessage(state, requestId, author, value) {
    const request = requestFor(state, requestId);
    if (!['teacher', 'supplier', 'admin'].includes(author)) throw new Error('无效的留言身份。');
    const content = text(value);
    if (!content) throw new Error('请先填写问题或回复内容。');
    if (content.length > 2000) throw new Error('留言请控制在 2000 字以内。');
    const message = { id: uid('msg'), author, text: content, at: now() };
    request.messages.push(message);
    event(state, request.id, '需求讨论有一条新留言', 'message_added');
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
