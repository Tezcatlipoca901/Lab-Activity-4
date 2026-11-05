/* Brewlist – client-side interactivity (DOM event handling).
   PHP does the real work (sessions, validation, rendering); this file only
   improves the experience in the browser. */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, r = document) => r.querySelector(s);

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
  // Focus the field that needs attention (rename box, or the new-category box after an error)
  const renameInput = $('.rename-input');
  const badCatInput = $('.cat-add .input.bad');
  if (renameInput) { renameInput.focus(); renameInput.select(); }
  else if (badCatInput) badCatInput.focus();

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