(() => {
  'use strict';

  /* ---------- Constants ---------- */
  const IC = '../assets/icons/';
  const PALETTE = ['#cba6f7', '#a6e3a1', '#b794f6', '#6c7086', '#f9e2af', '#89dceb', '#f5c2e7', '#b4befe'];
  const VIEW_NAMES = { all: 'All tasks', today: 'Today', week: 'This week', month: 'This month', year: 'This year' };
  const VIEW_ICONS = { all: 'all-tasks', today: 'today', week: 'week', month: 'month', year: 'year' };
  const THEMES = { latte: 'Latte', frappe: 'Frappé', macchiato: 'Macchiato', mocha: 'Mocha' };
  const STORE = 'brewlist.v1';
  const DEFAULT_CAT = 'Others';

  const SEED = {
    categories: [
      { id: 'c1', name: 'School', color: '#cba6f7' },
      { id: 'c2', name: 'Personal', color: '#a6e3a1' },
      { id: 'c3', name: 'Work', color: '#b794f6' },
      { id: 'c4', name: 'Others', color: '#6c7086', locked: true }
    ],
    tasks: [
      { id: 't1', title: 'Buy groceries', desc: 'Pick up fruit, coffee, and ingredients for dinner.', cat: 'Personal', due: '2026-11-03', done: false },
      { id: 't2', title: 'Finish WebDev Lab', desc: 'Complete the React prototype and prepare the PHP implementation notes', cat: 'School', due: '2026-11-04', done: false },
      { id: 't3', title: 'Evening workout', desc: 'Thirty-minute strength session and a short cooldown.', cat: 'Personal', due: '2026-11-05', done: false },
      { id: 't4', title: 'Prepare presentation', desc: 'Refine the project story and rehearse the final walkthrough.', cat: 'School', due: '2026-11-06', done: false },
      { id: 't5', title: 'Review for quiz', desc: 'Study discrete mathematics notes and practice problems.', cat: 'School', due: '2026-11-08', done: false },
      { id: 't6', title: 'Update project docs', desc: 'Clarify setup steps and add the latest UI decisions.', cat: 'Work', due: '2026-11-13', done: false },
      { id: 't7', title: 'Tidy the project inbox', desc: 'Archive resolved notes and group remaining action items.', cat: 'Others', due: '', done: true }
    ]
  };

  /* ---------- State ---------- */
  let data = load();
  const ui = {
    view: 'all', cat: null, status: 'all', sort: 'earliest', search: '',
    selected: null, mode: 'create',            // create | detail | edit
    theme: localStorage.getItem('brewlist.theme') || 'mocha',
    catColor: PALETTE[4], renaming: null, confirmDel: null, deleteTarget: null
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE));
      if (raw && raw.tasks && raw.categories) return raw;
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(SEED));
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const catColor = name => (data.categories.find(c => c.name === name) || {}).color || '#6c7086';
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => s ? parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function inView(task, view) {
    if (view === 'all') return true;
    if (!task.due) return false;
    const d = parse(task.due), t = new Date(); t.setHours(0, 0, 0, 0);
    if (view === 'today') return +d === +t;
    if (view === 'week') {
      const start = new Date(t); start.setDate(t.getDate() - ((t.getDay() + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return d >= start && d <= end;
    }
    if (view === 'month') return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
    if (view === 'year') return d.getFullYear() === t.getFullYear();
    return true;
  }

  const svg = {
    plus: '<svg viewBox="0 0 24 24" class="i"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>'
  };

  /* ---------- Derived data ---------- */
  function visibleTasks() {
    const q = ui.search.trim().toLowerCase();
    let list = data.tasks.filter(t =>
      inView(t, ui.view) &&
      (!ui.cat || t.cat === ui.cat) &&
      (ui.status === 'all' || (ui.status === 'completed' ? t.done : !t.done)) &&
      (!q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)));
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
    const sorters = {
      earliest: byDue,
      latest: (a, b) => (!a.due) - (!b.due) || (b.due || '').localeCompare(a.due || ''),
      az: (a, b) => a.title.localeCompare(b.title),
      za: (a, b) => b.title.localeCompare(a.title)
    };
    return list.sort(sorters[ui.sort]);
  }

  /* ---------- Render: sidebar ---------- */
  function renderSidebar() {
    $$('.nav-item[data-view]').forEach(b => {
      const v = b.dataset.view, active = ui.view === v;
      b.classList.toggle('active', active);
      b.querySelector('img').src = IC + VIEW_ICONS[v] + (active ? '-active' : '') + '.png';
      b.querySelector('.count').textContent = data.tasks.filter(t => inView(t, v) && (!ui.cat || t.cat === ui.cat)).length;
    });
    const note = $('#catNote');
    note.hidden = ui.view === 'all';
    note.textContent = `Filtering within ${VIEW_NAMES[ui.view]}.`;
    $('#cats').innerHTML = data.categories.map(c => {
      const n = data.tasks.filter(t => t.cat === c.name && inView(t, ui.view)).length;
      return `<button class="nav-item cat-item${ui.cat === c.name ? ' active' : ''}" data-cat="${esc(c.name)}">
        <i class="dot" style="--c:${c.color}"></i><span>${esc(c.name)}</span><b class="count">${n}</b></button>`;
    }).join('');
  }

  /* ---------- Render: list ---------- */
  function renderList() {
    const list = visibleTasks();
    $('#title').textContent = VIEW_NAMES[ui.view] + (ui.cat ? ' · ' + ui.cat : '');
    $('#subtitle').textContent = `${plural(list.length, 'task')} in this view`;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.status === ui.status));
    $('#sortLabel').textContent = { earliest: 'Earliest first', latest: 'Latest first', az: 'Name A–Z', za: 'Name Z–A' }[ui.sort];
    $$('#sortMenu button').forEach(b => b.classList.toggle('on', b.dataset.sort === ui.sort));
    $('#empty').hidden = list.length > 0;
    $('#taskList').hidden = list.length === 0;
    $('#taskList').innerHTML = list.map(t => {
      const c = catColor(t.cat), plain = t.cat === DEFAULT_CAT;
      return `<li class="task${t.done ? ' done' : ''}${ui.selected === t.id && ui.mode !== 'create' ? ' selected' : ''}" data-id="${t.id}" tabindex="0">
        <button class="check" data-toggle="${t.id}" aria-label="${t.done ? 'Mark active' : 'Mark complete'}: ${esc(t.title)}">
          <img src="${IC}${t.done ? 'check-on' : 'check-off'}.png" alt=""></button>
        <div class="task-body">
          <div class="task-top">
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-meta"><span class="chip${plain ? ' plain' : ''}" style="--c:${c}">${esc(t.cat)}</span>
              <span class="date"><img src="${IC}calendar.png" alt="">${fmtDate(t.due)}</span></div>
          </div>
          <div class="task-desc">${esc(t.desc)}</div>
        </div></li>`;
    }).join('');
  }

  /* ---------- Render: panel ---------- */
  const task = () => data.tasks.find(t => t.id === ui.selected);

  function renderPanel() {
    const p = $('#panel');
    if (ui.mode === 'detail' && !task()) ui.mode = 'create';
    if (ui.mode === 'detail') {
      const t = task(), c = catColor(t.cat);
      p.innerHTML = `
        <div class="detail-head"><div><div class="p-eyebrow">Task details</div><h2>${esc(t.title)}</h2></div>
          <button class="status-ring${t.done ? ' on' : ''}" id="ring" aria-label="Toggle completed">${svg.check}</button></div>
        <div class="detail-meta"><span class="chip" style="--c:${c}">${esc(t.cat)}</span>
          <span class="date"><img src="${IC}calendar.png" alt="">${fmtDate(t.due)}</span></div>
        <div class="sec-title">Description</div>
        <p class="detail-desc">${esc(t.desc)}</p>
        <div class="sec-title">Status</div>
        <div class="select-wrap"><select class="select" id="statusSel">
          <option value="0"${t.done ? '' : ' selected'}>Not completed</option>
          <option value="1"${t.done ? ' selected' : ''}>Completed</option></select>${svg.chev}</div>
        <div class="panel-actions">
          <button class="btn btn-primary btn-edit" id="editBtn"><img class="ed" src="${IC}edit-dark.png" alt="">Edit task</button>
          <button class="btn btn-del" id="delBtn"><img src="${IC}delete-red.png" alt="">Delete task</button></div>`;
      return;
    }
    const edit = ui.mode === 'edit', t = edit ? task() : null;
    const opts = data.categories.map(c => `<option${(edit ? t.cat : DEFAULT_CAT) === c.name ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    p.innerHTML = `
      <div class="panel-ic">${edit ? svg.pencil : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'}</div>
      <h2>${edit ? 'Edit task' : 'Create task'}</h2>
      <p class="panel-sub">${edit ? 'Make changes without losing the original task.' : 'Capture what needs your attention next.'}</p>
      <form class="form" id="form" novalidate>
        <div class="banner" id="banner" hidden><img src="${IC}warning.png" alt="">
          <div><strong>Check the highlighted fields</strong><span>Fix the errors below before saving this task.</span></div></div>
        <div class="field" id="fName"><label for="fTitle"><span>Task name <i class="req">*</i></span></label>
          <input class="input" id="fTitle" maxlength="80" placeholder="What needs to be done?" value="${edit ? esc(t.title) : ''}" autocomplete="off">
          <p class="err" hidden></p></div>
        <div class="field" id="fDesc"><label for="fText"><span>Description <i class="req">*</i></span><span class="counter" id="counter">0/255</span></label>
          <textarea class="textarea" id="fText" maxlength="255" placeholder="Add a little context...">${edit ? esc(t.desc) : ''}</textarea>
          <p class="err" hidden></p></div>
        <div class="row2">
          <div class="field"><label for="fDue"><span>Due date <i class="opt">(optional)</i></span></label>
            <div class="date-input"><input type="date" id="fDue" lang="en-GB" value="${edit ? t.due : ''}"><img src="${IC}calendar.png" alt=""></div></div>
          <div class="field"><label for="fCat"><span>Category <i class="req">*</i></span></label>
            <div class="select-wrap" style="margin-top:0"><select class="select" id="fCat" style="font-size:15px">${opts}</select>${svg.chev}</div></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-cancel" id="cancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary">${edit ? svg.check.replace('<svg', '<svg class="i"') + 'Save changes' : svg.plus + 'Add task'}</button></div>
      </form>`;
    updateCounter();
  }

  function updateCounter() {
    const ta = $('#fText'); if (ta) $('#counter').textContent = `${ta.value.length}/255`;
  }

  function render() { renderSidebar(); renderList(); renderPanel(); }

  /* ---------- Form handling ---------- */
  function setErr(fieldId, msg) {
    const f = $(fieldId), e = $('.err', f);
    f.classList.toggle('bad', !!msg);
    e.hidden = !msg;
    e.innerHTML = msg ? `<img src="${IC}warning.png" alt="">${msg}` : '';
    return !msg;
  }
  function validate() {
    const t = $('#fTitle').value.trim(), d = $('#fText').value.trim();
    const a = setErr('#fName', t.length < 3 ? 'Task name must be at least 3 characters long.' : '');
    const b = setErr('#fDesc', !d ? 'Description is required.' : '');
    $('#banner').hidden = a && b;
    return a && b;
  }
  function submitForm(e) {
    e.preventDefault();
    if (!validate()) { (!$('#fName').classList.contains('bad') ? $('#fText') : $('#fTitle')).focus(); return; }
    const vals = { title: $('#fTitle').value.trim(), desc: $('#fText').value.trim(), due: $('#fDue').value, cat: $('#fCat').value };
    if (ui.mode === 'edit') Object.assign(task(), vals);
    else { const t = { id: uid(), done: false, ...vals }; data.tasks.push(t); ui.selected = t.id; }
    ui.mode = 'detail'; save(); render();
  }

  /* ---------- Delete dialog ---------- */
  function openDelete() {
    const t = task(); if (!t) return;
    ui.deleteTarget = t.id; $('#delName').textContent = t.title;
    $('#deleteOverlay').hidden = false; $('#delCancel').focus();
  }
  function closeDelete() { $('#deleteOverlay').hidden = true; ui.deleteTarget = null; }

  /* ---------- Categories modal ---------- */
  function openCats() { ui.renaming = ui.confirmDel = null; $('#catOverlay').hidden = false; renderCats(); }
  function closeCats() { $('#catOverlay').hidden = true; setCatErr(''); $('#catName').value = ''; }
  function setCatErr(msg) {
    $('#catErr').hidden = !msg; $('#catErr span').textContent = msg; $('#catName').classList.toggle('bad', !!msg);
  }
  function validCatName(name, ignoreId) {
    if (name.length < 2) return 'Category name must be at least 2 characters.';
    if (data.categories.some(c => c.id !== ignoreId && c.name.toLowerCase() === name.toLowerCase())) return 'That category already exists.';
    return '';
  }
  function renderCats() {
    $('#swatches').innerHTML = PALETTE.map(c =>
      `<button class="swatch${ui.catColor === c ? ' on' : ''}" style="--c:${c}" data-color="${c}" aria-label="Color ${c}">${svg.check}</button>`).join('');
    $('#catList').innerHTML = data.categories.map(c => {
      const n = data.tasks.filter(t => t.cat === c.name).length;
      if (ui.confirmDel === c.id) return `<li><div class="confirm-row"><span>Delete <b>${esc(c.name)}</b>? ${plural(n, 'task')} will move to ${DEFAULT_CAT}.</span>
        <span class="btns"><button class="btn btn-danger" data-cdel-ok="${c.id}">Delete</button><button class="btn btn-outline" data-cdel-no>Cancel</button></span></div></li>`;
      const name = ui.renaming === c.id
        ? `<input class="rename-input" id="renameInput" value="${esc(c.name)}" maxlength="24">`
        : `<div class="nm">${esc(c.name)}</div>`;
      return `<li class="cat-row"><i class="dot" style="--c:${c.color}"></i>
        <div class="info">${name}<div class="ct">${plural(n, 'task')}${c.locked ? ' · Default' : ''}</div></div>
        ${c.locked ? '' : `<div class="acts"><button data-cedit="${c.id}" aria-label="Rename ${esc(c.name)}"><img src="${IC}edit.png" alt=""></button>
        <button data-cdel="${c.id}" aria-label="Delete ${esc(c.name)}"><img src="${IC}delete.png" alt=""></button></div>`}</li>`;
    }).join('');
    const r = $('#renameInput'); if (r) { r.focus(); r.select(); }
  }
  function addCategory() {
    const name = $('#catName').value.trim(), msg = validCatName(name);
    if (msg) { setCatErr(msg); $('#catName').focus(); return; }
    data.categories.splice(data.categories.length - 1, 0, { id: uid(), name, color: ui.catColor });
    $('#catName').value = ''; setCatErr(''); save(); renderCats(); render();
  }
  function commitRename(id) {
    const inp = $('#renameInput'); if (!inp) return;
    const c = data.categories.find(x => x.id === id), name = inp.value.trim();
    if (name === c.name) { ui.renaming = null; return renderCats(); }
    if (validCatName(name, id)) { inp.classList.add('bad'); inp.focus(); return; }
    data.tasks.forEach(t => { if (t.cat === c.name) t.cat = name; });
    if (ui.cat === c.name) ui.cat = name;
    c.name = name; ui.renaming = null; save(); renderCats(); render();
  }
  function deleteCategory(id) {
    const c = data.categories.find(x => x.id === id);
    data.tasks.forEach(t => { if (t.cat === c.name) t.cat = DEFAULT_CAT; });
    data.categories = data.categories.filter(x => x.id !== id);
    if (ui.cat === c.name) ui.cat = null;
    ui.confirmDel = null; save(); renderCats(); render();
  }

  /* ---------- Theme ---------- */
  function applyTheme(t) {
    ui.theme = t; document.body.dataset.theme = t; $('#themeLabel').textContent = THEMES[t];
    $$('#themeMenu button').forEach(b => b.classList.toggle('on', b.dataset.theme === t));
    try { localStorage.setItem('brewlist.theme', t); } catch (e) { /* ignore */ }
  }
  function toggleMenu(menu, btn, force) {
    const open = force !== undefined ? force : menu.hidden;
    $$('.menu').forEach(m => m.hidden = true); menu.hidden = !open; btn.setAttribute('aria-expanded', open);
  }

  /* ---------- Events ---------- */
  function setView(v) { ui.view = v; }
  function resetFilters() { ui.status = 'all'; ui.search = ''; ui.cat = null; $('#search').value = ''; }

  document.addEventListener('click', e => {
    const t = e.target;
    if (!t.closest('.theme-wrap, .sort-wrap')) $$('.menu').forEach(m => m.hidden = true);

    const nav = t.closest('[data-view]'); if (nav) { setView(nav.dataset.view); return render(); }
    const cat = t.closest('[data-cat]'); if (cat) { ui.cat = ui.cat === cat.dataset.cat ? null : cat.dataset.cat; return render(); }
    const tab = t.closest('.tab'); if (tab) { ui.status = tab.dataset.status; return renderList(); }

    const tog = t.closest('[data-toggle]');
    if (tog) { const x = data.tasks.find(k => k.id === tog.dataset.toggle); x.done = !x.done; save(); e.stopPropagation(); return render(); }
    const row = t.closest('.task');
    if (row) { ui.selected = row.dataset.id; ui.mode = 'detail'; return render(); }

    if (t.closest('#addTaskBtn')) { ui.mode = 'create'; ui.selected = null; render(); return $('#fTitle').focus(); }
    if (t.closest('#clearFilters')) { resetFilters(); return render(); }
    if (t.closest('#brand')) { e.preventDefault(); resetFilters(); ui.view = 'all'; return render(); }

    if (t.closest('#themeBtn')) return toggleMenu($('#themeMenu'), $('#themeBtn'));
    const th = t.closest('#themeMenu button'); if (th) { applyTheme(th.dataset.theme); return toggleMenu($('#themeMenu'), $('#themeBtn'), false); }
    if (t.closest('#sortBtn')) return toggleMenu($('#sortMenu'), $('#sortBtn'));
    const so = t.closest('#sortMenu button'); if (so) { ui.sort = so.dataset.sort; toggleMenu($('#sortMenu'), $('#sortBtn'), false); return renderList(); }

    if (t.closest('#ring')) { const x = task(); x.done = !x.done; save(); return render(); }
    if (t.closest('#editBtn')) { ui.mode = 'edit'; return renderPanel(); }
    if (t.closest('#delBtn')) return openDelete();
    if (t.closest('#cancelBtn')) { ui.mode = ui.mode === 'edit' && task() ? 'detail' : 'create'; if (ui.mode === 'create') ui.selected = null; return render(); }
    if (t.closest('.date-input img')) { const d = $('#fDue'); d.showPicker ? d.showPicker() : d.focus(); return; }

    if (t.closest('#delCancel') || t.id === 'deleteOverlay') return closeDelete();
    if (t.closest('#delConfirm')) {
      data.tasks = data.tasks.filter(x => x.id !== ui.deleteTarget);
      ui.selected = null; ui.mode = 'create'; closeDelete(); save(); return render();
    }

    if (t.closest('#manageBtn')) return openCats();
    if (t.closest('#catClose') || t.id === 'catOverlay') return closeCats();
    if (t.closest('#catAddBtn')) return addCategory();
    const sw = t.closest('.swatch'); if (sw) { ui.catColor = sw.dataset.color; return renderCats(); }
    const ce = t.closest('[data-cedit]'); if (ce) { ui.renaming = ce.dataset.cedit; ui.confirmDel = null; return renderCats(); }
    const cd = t.closest('[data-cdel]'); if (cd) { ui.confirmDel = cd.dataset.cdel; ui.renaming = null; return renderCats(); }
    const ok = t.closest('[data-cdel-ok]'); if (ok) return deleteCategory(ok.dataset.cdelOk);
    if (t.closest('[data-cdel-no]')) { ui.confirmDel = null; return renderCats(); }
  });

  document.addEventListener('submit', e => { if (e.target.id === 'form') submitForm(e); });
  document.addEventListener('change', e => {
    if (e.target.id === 'statusSel') { task().done = e.target.value === '1'; save(); render(); }
  });
  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'search') { ui.search = e.target.value; renderList(); }
    else if (id === 'fText') { updateCounter(); if ($('#fDesc').classList.contains('bad') && e.target.value.trim()) setErr('#fDesc', ''); }
    else if (id === 'fTitle') { if ($('#fName').classList.contains('bad') && e.target.value.trim().length >= 3) setErr('#fName', ''); }
    else if (id === 'catName') { if (!$('#catErr').hidden) setCatErr(''); }
    if (id === 'fTitle' || id === 'fText') { const b = $('#banner'); if (b && !$('.field.bad')) b.hidden = true; }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#deleteOverlay').hidden) return closeDelete();
      if (!$('#catOverlay').hidden) { if (ui.renaming || ui.confirmDel) { ui.renaming = ui.confirmDel = null; return renderCats(); } return closeCats(); }
      $$('.menu').forEach(m => m.hidden = true);
    }
    if (e.key === 'Enter') {
      if (e.target.id === 'catName') { e.preventDefault(); addCategory(); }
      else if (e.target.id === 'renameInput') { e.preventDefault(); commitRename(ui.renaming); }
      else if (e.target.classList && e.target.classList.contains('task') && !e.target.closest('button')) e.target.click();
    }
  });
  document.addEventListener('focusout', e => {
    if (e.target.id === 'renameInput' && ui.renaming) setTimeout(() => ui.renaming && commitRename(ui.renaming), 120);
  });

  /* ---------- Init ---------- */
  $$('img[data-ic]').forEach(i => i.src = IC + i.dataset.ic + '.png');
  applyTheme(ui.theme);
  renderCats();
  render();
})();
