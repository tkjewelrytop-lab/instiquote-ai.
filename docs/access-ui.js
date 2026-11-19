/* Account and role-management screens for the browser-local access prototype. */
(function (global) {
  'use strict';
  function create(ctx) {
    const { esc, icon, btn, heading, stats, date, toast, modal, closeModal } = ctx;
    const local = { view: 'system', type: 'all', status: 'all', search: '', roleId: 'operations' };
    const API = () => global.IQAccess;
    const state = () => ctx.getState();
    const actor = () => ctx.getActorId();
    const box = () => API().ensure(state());
    const can = permission => API().can(state(), actor(), permission);
    const requirePermission = permission => API().requirePermission(state(), actor(), permission);
    const typeNames = { teacher: '老師', supplier: '供應商', admin: '管理員', superadmin: '總後台' };
    const statusNames = { active: '已啟用', disabled: '已停用' };
    const permissionHelp = {'requests.read':'查看需求內容、期限及報價進度。','requests.manage':'補派供應商、提前結案及處理需求問答。','suppliers.read':'查看公司資料及審核狀態。','suppliers.review':'批准、停權或恢復接單資格。','whatsapp.read':'查看訊息內容、範本和發送記錄。','whatsapp.send':'建立通知、模擬發送及重試失敗訊息。','reports.export':'下載平台需求及報價統計。','accounts.read':'查看老師及供應商帳號與資料綁定。','accounts.manage':'新增、編輯、啟停用帳號及重設演示登入。','admins.manage':'建立管理員、分配角色及管理帳號狀態。','roles.manage':'調整管理角色可使用的功能。','audit.read':'查看帳號、權限及營運操作紀錄。'};
    const actionNames = { account_created:'新增帳號', account_updated:'更新帳號資料', account_enabled:'啟用帳號', account_disabled:'停用帳號', role_updated:'更新角色權限', login_reset:'重設登入狀態', demo_login:'切換演示帳號', demo_logout:'登出演示帳號', session_switched:'切換演示帳號' };
    const isStaff = account => ['admin', 'superadmin'].includes(account.type);
    const roleFor = id => API().roles(state()).find(role => role.id === id);
    const supplierFor = id => state().suppliers.find(supplier => supplier.id === id);
    const accountFor = id => API().account(state(), id);
    const writePermission = account => isStaff(account) ? 'admins.manage' : 'accounts.manage';
    const input = (label, name, value, type = 'text', required = true, help = '') => `<label class="field"><span class="field-label">${label}${required ? ' <span class="required">*</span>' : ''}</span><input class="input" name="${name}" type="${type}" value="${esc(value || '')}" ${required ? 'required' : ''} ${name === 'name' ? 'maxlength="80"' : ''}>${help ? `<span class="field-help">${help}</span>` : ''}</label>`;
    const demoNote = () => `<div class="notice access-session-note">${icon('shield')}這是帳號與權限流程原型；所有設定僅儲存在當前瀏覽器，尚未接入正式登入或伺服器驗證。</div>`;
    const statusBadge = account => `<span class="badge ${account.status === 'active' ? 'green' : 'gray'}">${statusNames[account.status] || esc(account.status)}</span>`;
    function linkedText(account) {
      if (account.type === 'teacher') return account.school || '未綁定學校';
      if (account.type === 'supplier') return supplierFor(account.supplierId)?.name || '未綁定公司';
      return roleFor(account.roleId)?.name || '未分配角色';
    }
    function overview() {
      requirePermission('accounts.read');
      const accounts = box().accounts;
      const links = [
        ['accounts', 'people', '老師與供應商帳號', '管理基本資料、學校與公司綁定，以及帳號狀態。', 'accounts.read'],
        ['admins', 'shield', '管理員管理', '分配管理員職責，管理營運人員的帳號。', 'admins.manage'],
        ['permissions', 'settings', '角色與權限', '按職責分配檢視、審核、通知與管理權限。', 'roles.manage'],
        ['access-audit', 'activity', '帳號操作紀錄', '查閱帳號異動、角色分配及登入重設紀錄。', 'audit.read']
      ].filter(item => can(item[4]));
      return heading('SYSTEM ADMINISTRATION', '總後台總覽', '統一管理平台帳號、管理員和操作權限。') + demoNote() + stats([
        ['老師帳號', accounts.filter(a => a.type === 'teacher').length, '按學校綁定並管理使用狀態', 'book'],
        ['供應商帳號', accounts.filter(a => a.type === 'supplier').length, '對應公司與供應商資料', 'building'],
        ['管理人員', accounts.filter(isStaff).length, '分開總後台與管理員職責', 'shield'],
        ['啟用帳號', accounts.filter(a => a.status === 'active').length, `另有 ${accounts.filter(a => a.status === 'disabled').length} 個停用帳號`, 'check']
      ]) + `<div class="access-quicklinks">${links.map(([view, ico, title, description]) => `<section class="panel help-card">${icon(ico)}<h2>${title}</h2><p>${description}</p>${btn('進入管理', 'access-nav', 'secondary', '', `data-view="${view}"`)}</section>`).join('')}</div><section class="panel" style="margin-top:24px"><div class="panel-header"><h2 class="panel-title">職責分工</h2><span class="badge green">按角色授權</span></div><div class="panel-body summary-grid"><div class="summary-item"><span class="summary-label">總後台端</span><strong>帳號、管理員、角色權限及帳號紀錄</strong><p class="field-help">保留至少一個已啟用的總後台帳號，避免平台失去管理入口。</p></div><div class="summary-item"><span class="summary-label">管理員端</span><strong>需求、供應商審核、WhatsApp 及營運報表</strong><p class="field-help">實際可見頁面和操作，會按目前帳號的角色權限顯示。</p></div></div></section>`;
    }
    function filteredAccounts() {
      const staff = local.view === 'admins';
      return box().accounts.filter(account => {
        if (isStaff(account) !== staff) return false;
        if (!staff && local.type !== 'all' && account.type !== local.type) return false;
        if (local.status !== 'all' && account.status !== local.status) return false;
        if (local.search && ![account.name, account.email, account.phone, linkedText(account)].join(' ').toLowerCase().includes(local.search.toLowerCase())) return false;
        return true;
      });
    }
    function isLastOwner(account) { return account.type === 'superadmin' && account.status === 'active' && box().accounts.filter(a => a.type === 'superadmin' && a.status === 'active').length <= 1; }
    function accountRows() {
      const accounts = filteredAccounts();
      if (!accounts.length) return `<tr><td colspan="5"><div class="empty-state">${icon('people')}<h3>沒有符合條件的帳號</h3><p>請調整搜尋內容或篩選條件。</p></div></td></tr>`;
      return accounts.map(account => {
        const editable = can(writePermission(account));
        return `<tr><td><div class="account-cell"><span class="account-avatar">${esc(account.name?.slice(0, 1) || '帳')}</span><div><strong>${esc(account.name)}</strong><span class="account-meta">${esc(account.email)}</span><span class="account-meta">${esc(account.phone || '未提供電話')}</span></div></div></td><td><span class="badge gray">${typeNames[account.type]}</span><span class="field-help">${esc(linkedText(account))}</span></td><td>${statusBadge(account)}</td><td>${account.lastLoginAt ? date(account.lastLoginAt, true) : '<span class="muted">尚未登入</span>'}<span class="field-help">${esc(account.id)}</span></td><td><div class="heading-actions">${btn(editable ? '編輯' : '查看', editable ? 'access-edit' : 'access-view', 'secondary small', '', `data-id="${esc(account.id)}"`)}${editable ? btn(account.status === 'active' ? '停用' : '啟用', 'access-status', account.status === 'active' ? 'ghost small' : 'primary small', '', `data-id="${esc(account.id)}" ${isLastOwner(account) ? 'disabled title="須保留至少一個已啟用的總後台帳號"' : ''}`) : ''}</div></td></tr>`;
      }).join('');
    }
    function accountsView(staff = false) {
      requirePermission(staff ? 'admins.manage' : 'accounts.read');
      local.view = staff ? 'admins' : 'accounts';
      const all = box().accounts.filter(account => isStaff(account) === staff);
      return heading(staff ? 'ADMINISTRATOR ACCOUNTS' : 'USER ACCOUNTS', staff ? '管理員管理' : '老師與供應商帳號', staff ? '設定營運人員的角色與使用狀態，分清管理職責。' : '集中管理老師與供應商的帳號、資料綁定及啟用狀態。', can(staff ? 'admins.manage' : 'accounts.manage') ? btn(staff ? '新增管理員' : '新增帳號', 'access-create', 'primary', 'plus', `data-type="${staff ? 'admin' : local.type === 'supplier' ? 'supplier' : 'teacher'}"`) : '') + demoNote() + stats([
        ['帳號總數', all.length, staff ? '包含總後台及營運管理員' : '老師及供應商合計', 'people'],
        ['已啟用', all.filter(a => a.status === 'active').length, '可以使用所屬工作台', 'check'],
        ['已停用', all.filter(a => a.status === 'disabled').length, '禁止繼續處理新的操作', 'shield'],
        [staff ? '管理角色' : '帳號類型', staff ? API().roles(state()).length : 2, staff ? '按角色設定操作範圍' : '老師 / 供應商', 'settings']
      ]) + `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">${staff ? '管理人員列表' : '平台使用者'} <span class="muted" id="access-result-count">${filteredAccounts().length}</span></h2><p class="panel-subtitle">${staff ? '停用與權限修改會立即反映於演示工作台。' : '停用帳號與供應商公司審核為兩個獨立狀態。'}</p></div></div><div class="access-toolbar">${!staff ? `<div class="tabs access-filters">${[['all', '全部'], ['teacher', '老師'], ['supplier', '供應商']].map(([type, title]) => `<button class="tab ${local.type === type ? 'active' : ''}" data-action="access-filter-type" data-type="${type}">${title}</button>`).join('')}</div>` : '<span class="muted">總後台與營運帳號</span>'}<div class="heading-actions"><select class="select" id="access-status-filter" aria-label="篩選帳號狀態"><option value="all" ${local.status === 'all' ? 'selected' : ''}>全部狀態</option><option value="active" ${local.status === 'active' ? 'selected' : ''}>已啟用</option><option value="disabled" ${local.status === 'disabled' ? 'selected' : ''}>已停用</option></select><label class="search-box">${icon('search')}<input id="access-search" aria-label="搜尋帳號" placeholder="搜尋姓名、電郵、學校或公司" value="${esc(local.search)}"></label></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>帳號資料</th><th>${staff ? '角色' : '類型與綁定'}</th><th>狀態</th><th>最近登入（演示）</th><th>操作</th></tr></thead><tbody id="access-rows">${accountRows()}</tbody></table></div></section>`;
    }
    function roleGroups(role) {
      const groups = new Map();
      API().permissions().forEach(permission => { const group = permission.group || '其他'; if (!groups.has(group)) groups.set(group, []); groups.get(group).push(permission); });
      return `<div class="permission-groups">${Array.from(groups, ([group, permissions]) => `<fieldset class="permission-group"><legend>${esc(group)}</legend>${permissions.map(permission => `<label class="permission-option"><input type="checkbox" name="permission" value="${esc(permission.id)}" ${role.permissions.includes(permission.id) ? 'checked' : ''} ${role.id === 'owner' ? 'disabled' : ''}><span><strong>${esc(permission.label)}</strong><span class="field-help">${esc(permissionHelp[permission.id] || permission.label)}</span></span></label>`).join('')}</fieldset>`).join('')}</div>`;
    }
    function permissionsView() {
      requirePermission('roles.manage');
      const roles = API().roles(state());
      const role = roles.find(item => item.id === local.roleId) || roles.find(item => item.id !== 'owner') || roles[0];
      local.roleId = role.id;
      return heading('ROLES & PERMISSIONS', '角色與權限', '按工作職責授權，修改後會即時套用至所屬演示帳號。') + demoNote() + `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">編輯角色權限</h2><p class="panel-subtitle">總後台角色為固定完整權限，不能移除。</p></div><span class="badge green">${roles.length} 個角色</span></div><form id="access-permissions-form"><div class="panel-body"><label class="field"><span class="field-label">選擇角色</span><select class="select" id="access-role-select" name="roleId">${roles.map(item => `<option value="${esc(item.id)}" ${item.id === role.id ? 'selected' : ''}>${esc(item.name)}${item.id === 'owner' ? '（固定）' : ''}</option>`).join('')}</select></label><div id="access-permission-fields">${permissionFormBody(role)}</div></div></form></section><section class="panel" style="margin-top:24px"><div class="panel-header"><h2 class="panel-title">角色權限對照</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>操作權限</th>${roles.map(item => `<th>${esc(item.name)}</th>`).join('')}</tr></thead><tbody>${API().permissions().map(permission => `<tr><td>${esc(permission.label)}<span class="field-help">${esc(permission.group)}</span></td>${roles.map(item => `<td><span class="${item.permissions.includes(permission.id) ? 'text-green' : 'muted'}" aria-label="${item.permissions.includes(permission.id) ? '已授權' : '未授權'}">${item.permissions.includes(permission.id) ? icon('check') : '—'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    }
    function permissionFormBody(role) {
      const assigned = box().accounts.filter(account => account.roleId === role.id).length;
      return `<p class="page-subtitle">${esc(role.description || '')} · ${assigned} 個帳號使用此角色</p>${roleGroups(role)}<div class="form-actions"><span class="muted">${role.id === 'owner' ? '總後台完整權限為固定設定。' : '只勾選這個角色工作所需的權限。'}</span><button class="button primary" type="submit" ${role.id === 'owner' ? 'disabled' : ''}>儲存權限</button></div>`;
    }
    function auditView() {
      requirePermission('audit.read');
      const audit = box().audit;
      return heading('ACCOUNT AUDIT TRAIL', '帳號操作紀錄', '追蹤帳號建立、狀態異動、角色設定及登入重設。') + `<section class="panel"><div class="panel-header"><h2 class="panel-title">異動時間線</h2><span class="badge gray">${audit.length} 筆紀錄</span></div><div class="panel-body activity-list">${audit.length ? audit.map(entry => `<article class="activity-item access-audit-item"><span class="activity-dot"></span><div class="activity-copy"><strong>${esc(actionNames[entry.action] || entry.action || '帳號資料更新')}</strong><p>${esc(typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail || ''))}</p><div class="activity-time">${date(entry.at, true)} · ${esc(entry.actorName || accountFor(entry.actorId)?.name || '平台')} ${entry.targetId ? '· ' + esc(entry.targetId) : ''}</div></div></article>`).join('') : `<div class="empty-state">${icon('activity')}<h3>暫無帳號異動</h3><p>新增帳號或調整權限後，紀錄會顯示在這裡。</p></div>`}</div></section>`;
    }
    function dashboard(view = 'system') {
      local.view = view;
      if (view === 'accounts') return accountsView(false);
      if (view === 'admins') return accountsView(true);
      if (view === 'permissions') return permissionsView();
      if (view === 'access-audit') return auditView();
      return overview();
    }
    function refreshRows() {
      const rows = document.querySelector('#access-rows');
      if (rows) rows.innerHTML = accountRows();
      const count = document.querySelector('#access-result-count');
      if (count) count.textContent = String(filteredAccounts().length);
    }
    function linkedFields(type, current = {}) {
      if (type === 'teacher') return input('學校名稱', 'school', current.school, 'text', true, '老師帳號會與這間學校綁定。');
      if (type === 'supplier') {
        const suppliers = state().suppliers;
        return `<label class="field"><span class="field-label">綁定供應商公司 <span class="required">*</span></span><select class="select" name="supplierId" required><option value="">請選擇公司</option>${suppliers.map(supplier => `<option value="${esc(supplier.id)}" ${current.supplierId === supplier.id ? 'selected' : ''}>${esc(supplier.name)}${supplier.status !== 'approved' ? '（公司尚未通過審核）' : ''}</option>`).join('')}</select><span class="field-help">同一公司可綁定多個聯絡帳號；公司審核狀態另行管理。</span></label>`;
      }
      if (type === 'superadmin') return `<div class="field"><span class="field-label">管理角色</span><div class="input">總後台完整權限（固定）</div></div>`;
      return `<label class="field"><span class="field-label">管理角色 <span class="required">*</span></span><select class="select" name="roleId" required>${API().roles(state()).filter(role => role.id !== 'owner').map(role => `<option value="${esc(role.id)}" ${current.roleId === role.id ? 'selected' : ''}>${esc(role.name)}</option>`).join('')}</select><span class="field-help">可以在「角色與權限」調整這個角色的操作範圍。</span></label>`;
    }
    function showAccountForm(id, requestedType) {
      const current = id ? accountFor(id) : null;
      if (id && !current) throw Error('找不到這個帳號。');
      const type = current?.type || (requestedType === 'admin' ? 'admin' : requestedType === 'supplier' ? 'supplier' : 'teacher');
      requirePermission(isStaff({ type }) ? 'admins.manage' : 'accounts.manage');
      const title = current ? '編輯帳號' : type === 'admin' ? '新增管理員' : '新增帳號';
      modal(title, `<form id="access-account-form" data-account="${esc(current?.id || '')}"><div class="notice">${icon('shield')}只建立演示帳號，不收集密碼，也不會發送邀請電郵。</div><div class="form-grid"><div class="field"><span class="field-label">帳號類型</span>${current || type === 'admin' ? `<input type="hidden" name="type" value="${type}"><div class="input">${typeNames[type]}</div>` : `<select class="select" name="type" id="access-account-type"><option value="teacher" ${type === 'teacher' ? 'selected' : ''}>老師</option><option value="supplier" ${type === 'supplier' ? 'selected' : ''}>供應商</option></select>`}</div>${input('姓名／聯絡人', 'name', current?.name)}${input('登入電郵', 'email', current?.email, 'email')}${input('聯絡電話', 'phone', current?.phone, 'tel', false)}<div class="field full" id="access-linked-fields">${linkedFields(type, current || {})}</div></div><div class="form-actions">${btn('取消', 'close-modal', 'secondary')}<button type="submit" class="button primary">${current ? '儲存變更' : '建立帳號'}</button></div>${current ? `<div class="panel-body"><span class="field-help">登入狀態重設 ${current.loginRevision || 0} 次；只影響演示狀態。</span>${btn('重設登入（演示）', 'access-reset-login', 'ghost small', 'rotate', `data-id="${esc(current.id)}"`)}</div>` : ''}</form>`);
    }
    function showAccount(id) {
      const account = accountFor(id);
      if (!account) throw Error('找不到這個帳號。');
      requirePermission(isStaff(account) ? 'admins.manage' : 'accounts.read');
      modal('帳號資料', `<div class="summary-grid">${[['姓名', account.name], ['登入電郵', account.email], ['類型', typeNames[account.type]], ['狀態', statusNames[account.status]], ['資料綁定', linkedText(account)], ['聯絡電話', account.phone || '未提供'], ['建立時間', date(account.createdAt, true)], ['最近登入', account.lastLoginAt ? date(account.lastLoginAt, true) : '尚未登入']].map(([label, value]) => `<div class="summary-item"><span class="summary-label">${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`, btn('關閉', 'close-modal', 'secondary'));
    }
    function handleClick(el) {
      const action = el.dataset.action;
      if (!action?.startsWith('access-')) return false;
      if (action === 'access-nav') {
        local.search = ''; local.status = 'all'; local.type = 'all';
        ctx.navigate(el.dataset.view);
      }
      if (action === 'access-filter-type') { requirePermission('accounts.read'); local.type = el.dataset.type; ctx.render(); }
      if (action === 'access-create') showAccountForm(null, el.dataset.type);
      if (action === 'access-edit') showAccountForm(el.dataset.id);
      if (action === 'access-view') showAccount(el.dataset.id);
      if (action === 'access-status') {
        const account = accountFor(el.dataset.id);
        if (!account) throw Error('找不到這個帳號。');
        requirePermission(writePermission(account));
        const disabling = account.status === 'active';
        modal(disabling ? '停用這個帳號？' : '啟用這個帳號？', `<p><strong>${esc(account.name)}</strong>（${esc(account.email)}）</p><p>${disabling ? '停用後，該帳號不能繼續在演示工作台執行操作。既有需求及報價會保留。' : '啟用後，該帳號可按原有角色權限使用演示工作台。'}</p>`, btn('取消', 'close-modal', 'secondary') + btn(disabling ? '確認停用' : '確認啟用', 'access-confirm-status', disabling ? 'danger' : 'primary', '', `data-id="${esc(account.id)}" data-status="${disabling ? 'disabled' : 'active'}"`));
      }
      if (action === 'access-confirm-status') { API().setStatus(state(), actor(), el.dataset.id, el.dataset.status); closeModal(); ctx.render(); toast(el.dataset.status === 'disabled' ? '帳號已停用，既有資料已保留。' : '帳號已啟用。'); }
      if (action === 'access-reset-login') {
        const account = accountFor(el.dataset.id);
        if (!account) throw Error('找不到這個帳號。');
        requirePermission(writePermission(account));
        modal('重設登入狀態（演示）？', `<p>將為 <strong>${esc(account.name)}</strong> 重設演示登入狀態，並寫入帳號操作紀錄。</p><p class="muted">不會變更真實密碼，也不會發送任何電郵或短訊。</p>`, btn('取消', 'close-modal', 'secondary') + btn('確認重設', 'access-confirm-reset', 'primary', 'rotate', `data-id="${esc(account.id)}"`));
      }
      if (action === 'access-confirm-reset') { API().resetLogin(state(), actor(), el.dataset.id); closeModal(); ctx.render(); toast('演示登入狀態已重設，沒有發送任何電郵。'); }
      return true;
    }
    function handleInput(event) {
      if (event.target.id !== 'access-search') return false;
      requirePermission(local.view === 'admins' ? 'admins.manage' : 'accounts.read');
      local.search = event.target.value;
      refreshRows();
      return true;
    }
    function handleChange(event) {
      if (event.target.id === 'access-status-filter') { requirePermission(local.view === 'admins' ? 'admins.manage' : 'accounts.read'); local.status = event.target.value; refreshRows(); return true; }
      if (event.target.id === 'access-account-type') { const container = document.querySelector('#access-linked-fields'); if (container) container.innerHTML = linkedFields(event.target.value); return true; }
      if (event.target.id === 'access-role-select') {
        requirePermission('roles.manage');
        local.roleId = event.target.value;
        const role = roleFor(local.roleId);
        if (!role) throw Error('找不到這個角色。');
        document.querySelector('#access-permission-fields').innerHTML = permissionFormBody(role);
        return true;
      }
      return false;
    }
    function handleSubmit(form) {
      if (form.id === 'access-account-form') {
        const values = new FormData(form), data = Object.fromEntries(values.entries());
        const id = form.dataset.account;
        if (id) {
          const current = accountFor(id);
          if (!current) throw Error('找不到這個帳號。');
          const patch = { name: data.name, email: data.email, phone: data.phone || '' };
          if (current.type === 'teacher') patch.school = data.school;
          if (current.type === 'supplier') patch.supplierId = data.supplierId;
          if (current.type === 'admin') patch.roleId = data.roleId;
          API().updateAccount(state(), actor(), id, patch);
        } else API().createAccount(state(), actor(), data);
        closeModal(); ctx.render(); toast(id ? '帳號資料已更新。' : '演示帳號已建立。');
        return true;
      }
      if (form.id === 'access-permissions-form') {
        const values = new FormData(form);
        API().updateRole(state(), actor(), values.get('roleId'), values.getAll('permission'));
        ctx.render(); toast('角色權限已更新，所屬帳號即時套用。');
        return true;
      }
      return false;
    }
    return { dashboard, handleClick, handleInput, handleChange, handleSubmit };
  }
  global.IQAccessView = { create };
})(typeof window !== 'undefined' ? window : globalThis);
