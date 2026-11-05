/* Brewlist – client-side interactivity (DOM event handling).
   PHP does the real work (sessions, validation, rendering); this file only
   improves the experience in the browser. */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r = document) => r.querySelector(s);
  let discardOpen = false;   // true while the "Discard unsaved changes?" popup is showing

  /* ---------- Theme switcher (Catppuccin flavors) ---------- */
  const THEMES = { latte: 'Latte', frappe: 'Frappé', macchiato: 'Macchiato', mocha: 'Mocha' };
  const themeBtn = $('#themeBtn'), themeMenu = $('#themeMenu'), sortBtn = $('#sortBtn'), sortMenu = $('#sortMenu');

  function applyTheme(name) {
    if (!THEMES[name]) name = 'mocha';
    document.body.dataset.theme = name;
    $('#themeLabel').textContent = THEMES[name];
    themeMenu.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.theme === name));
    try { localStorage.setItem('brewlist.theme', name); } catch (e) { /* storage unavailable */ }
  }
  let saved = 'mocha';
  try { saved = localStorage.getItem('brewlist.theme') || 'mocha'; } catch (e) { /* ignore */ }
  applyTheme(saved);

  /* ---------- Dropdown menus (theme + sort) ---------- */
  function closeMenus() {
    [[themeBtn, themeMenu], [sortBtn, sortMenu]].forEach(([b, m]) => { if (m) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
  }
  function toggleMenu(btn, menu) {
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  themeBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(themeBtn, themeMenu); });
  if (sortBtn) sortBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(sortBtn, sortMenu); });
  themeMenu.addEventListener('click', e => {
    const b = e.target.closest('button[data-theme]');
    if (b) { applyTheme(b.dataset.theme); closeMenus(); }
  });
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (discardOpen) return;   // Esc only closes the discard popup, not the dialog behind it
      closeMenus();
      // Close the delete overlay by following the Cancel link
      const cancel = $('#delCancel');
      if (cancel) cancel.click();
      // ...and the "Mark as completed?" popup
      const confirmCancel = $('#confirmCancel');
      if (confirmCancel) confirmCancel.click();
      // ...and the Manage categories dialog
      const manageClose = $('#manageClose');
      if (manageClose) manageClose.click();
    }
  });

  /* ---------- Mobile drawer (sidebar) ---------- */
  const menuBtn = $('#menuBtn'), sidebar = $('#sidebar'), scrim = $('#scrim');
  function setDrawer(open) {
    if (!menuBtn || !sidebar || !scrim) return;
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open);
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', e => { e.stopPropagation(); setDrawer(!sidebar.classList.contains('open')); });
    scrim.addEventListener('click', () => setDrawer(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
    // Picking a view/category navigates; widening the window back to desktop resets the drawer
    window.matchMedia('(min-width: 761px)').addEventListener('change', () => setDrawer(false));
  }

  const drawerClose = $('#drawerClose');
  if (drawerClose) drawerClose.addEventListener('click', () => setDrawer(false));

  /* ---------- Manage categories dialog ---------- */
  document.querySelectorAll('.swatches input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      radio.closest('.swatches').querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.contains(radio) && radio.checked));
    });
  });

  const manageOverlay = $('#manageOverlay');

  // Unsaved = the "New category" box or the rename box differs from what the server rendered
  function isDirty() {
    const add = $('#cat_name'), ren = $('.rename-input');
    return (!!add && !add.disabled && add.value.trim() !== add.defaultValue.trim())
        || (!!ren && ren.value.trim() !== ren.defaultValue.trim());
  }

  // One edit at a time: while a row is being renamed, lock the "New category" form
  function syncManageLock() {
    const add = $('#cat_name');
    if (!manageOverlay || !add) return;
    const addForm = add.closest('form');
    const renaming = !!$('.rename-input');
    addForm.querySelectorAll('input, button').forEach(el => { el.disabled = renaming; });
    addForm.classList.toggle('locked', renaming);
  }

  // Focus the field that needs attention (rename box, or the new-category box after an error)
  function focusManageField() {
    const renameInput = $('.rename-input');
    const badCatInput = $('.cat-add .input.bad');
    if (renameInput) { renameInput.focus(); renameInput.select(); }
    else if (badCatInput) badCatInput.focus();
  }

  syncManageLock();
  focusManageField();

  // Rename / delete / cancel links inside the list: swap only the list, no page reload
  async function swapCatList(url) {
    try {
      const res  = await fetch(url, { credentials: 'same-origin' });
      const doc  = new DOMParser().parseFromString(await res.text(), 'text/html');
      const next = doc.querySelector('#manageOverlay .cat-list');
      const cur  = $('#manageOverlay .cat-list');
      if (!next || !cur) { location.href = url; return; }
      cur.replaceWith(next);
      history.replaceState(null, '', url);
      syncManageLock();
      focusManageField();
    } catch (_) {
      location.href = url;
    }
  }

  // Styled "Discard unsaved changes?" popup (replaces the browser's confirm box).
  // Resolves true = discard, false = keep editing.
  function confirmDiscard() {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.zIndex = '110';                          // above the Manage categories dialog
      ov.setAttribute('role', 'alertdialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-labelledby', 'discardTitle');
      ov.innerHTML =
        '<div class="dialog">' +
          '<div class="dialog-icon dialog-icon-warn"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.01"/></svg></div>' +
          '<h2 id="discardTitle">Discard unsaved changes?</h2>' +
          '<p>You have text that hasn’t been saved yet. If you continue, it will be lost.</p>' +
          '<div class="dialog-actions">' +
            '<button type="button" class="btn btn-outline" data-keep>Keep editing</button>' +
            '<button type="button" class="btn btn-danger" data-discard>Discard</button>' +
          '</div>' +
        '</div>';

      const finish = result => {
        discardOpen = false;
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        resolve(result);
      };
      const onKey = e => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopImmediatePropagation();                   // don't let the global Esc handler close the dialog behind
        finish(false);
      };

      discardOpen = true;
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('click', e => { if (e.target === ov) finish(false); });   // click outside = keep editing
      ov.querySelector('[data-keep]').addEventListener('click', () => finish(false));
      ov.querySelector('[data-discard]').addEventListener('click', () => finish(true));
      document.body.appendChild(ov);
      ov.querySelector('[data-keep]').focus();          // safest default
    });
  }

  document.addEventListener('click', async e => {
    const a = e.target.closest('#manageOverlay .cat-list a[href]');
    if (!a) return;
    e.preventDefault();
    if (isDirty()) {
      if (!(await confirmDiscard())) return;
      const add = $('#cat_name');
      if (add && !add.disabled) add.value = add.defaultValue;   // clear typed text so it isn't left half-entered
    }
    swapCatList(a.href);
  });

  // X button (and Esc, which calls .click() on it): warn before losing typed text
  const manageClose = $('#manageClose');
  if (manageClose) {
    manageClose.addEventListener('click', async e => {
      if (!isDirty()) return;                           // nothing typed: just follow the link
      e.preventDefault();
      if (await confirmDiscard()) location.href = manageClose.href;
    });
  }

  /* ---------- "Mark as completed?" popup: focus the confirm button, prevent double submit ---------- */
  const confirmOk = $('#confirmOk');
  if (confirmOk) {
    confirmOk.focus();
    confirmOk.form.addEventListener('submit', () => { confirmOk.disabled = true; });
  }

  /* ---------- Success modal (task created / updated / deleted) ---------- */
  const flash = $('#flashOverlay'), flashDone = $('#flashDone');
  if (flash && flashDone) {
    let timer;
    const onKey = e => { if (e.key === 'Escape') closeFlash(); };
    function closeFlash() {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      flash.remove();
    }
    flashDone.addEventListener('click', e => { e.preventDefault(); closeFlash(); });   // no reload needed
    flash.addEventListener('click', e => { if (e.target === flash) closeFlash(); });   // click outside
    document.addEventListener('keydown', onKey);
    timer = setTimeout(closeFlash, 3200);                                              // matches the progress bar
    flashDone.focus();
  }

  /* ---------- Task form helpers (create + edit) ---------- */
  const form = $('#taskForm');
  if (!form) return;

  const nameInput = $('#task_name'), descInput = $('#task_description'), counter = $('#counter');
  const dueInput = $('#due_date'), submitBtn = form.querySelector('button[type="submit"]');

  // Live character counter for the description (x/255)
  const updateCounter = () => { counter.textContent = descInput.value.length + '/255'; };
  descInput.addEventListener('input', updateCounter);
  updateCounter();

  // Clear a field's red error state as soon as the user fixes it
  function clearWhenValid(input, isValid) {
    input.addEventListener('input', () => {
      const field = input.closest('.field');
      if (field.classList.contains('bad') && isValid(input.value.trim())) {
        field.classList.remove('bad');
        const err = field.querySelector('.err');
        if (err) err.remove();
        if (!form.querySelector('.field.bad')) {
          const banner = form.querySelector('.banner');
          if (banner) banner.remove();
        }
      }
    });
  }
  clearWhenValid(nameInput, v => v.length >= 3);
  clearWhenValid(descInput, v => v.length > 0);

  // Calendar icon opens the native date picker
  const dateIcon = form.querySelector('.date-input img');
  if (dateIcon) dateIcon.addEventListener('click', () => (dueInput.showPicker ? dueInput.showPicker() : dueInput.focus()));

  // Focus the first invalid field after the server sends back errors
  const firstBad = form.querySelector('.field.bad input, .field.bad textarea, .field.bad select');
  if (firstBad) firstBad.focus();

  // Re-enable the button if the page is restored from the back/forward cache
  window.addEventListener('pageshow', () => { submitBtn.disabled = false; });

  // Trim spaces before sending and prevent double submissions
  form.addEventListener('submit', () => {
    nameInput.value = nameInput.value.trim();
    descInput.value = descInput.value.trim();
    submitBtn.disabled = true;
  });
});