/*
 * Replaces the macOS native select popup (which opens on top of the field)
 * with a list that opens below it, or above when there is no room.
 * The real <select> stays in the DOM, so values, change/input events and
 * required validation work as before.
 *   select.field  -> form / filter field
 *   select.kx-loc -> dashboard location pill
 */
(() => {
  const PIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const CARET = '<svg class="kx-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const MAX_H = 280;
  const GAP = 6;
  const PAD = 8;

  const menu = document.createElement('ul');
  menu.id = 'kxMenu';
  menu.className = 'kx-menu';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  document.body.appendChild(menu);

  let cur = null;

  const items = () => [...menu.children].filter((li) => li.getAttribute('aria-disabled') !== 'true');

  function enhance(sel) {
    const loc = sel.classList.contains('kx-loc');
    const wrap = document.createElement('span');
    wrap.className = 'kx-sel' + (loc ? ' is-loc' : /\b(w-auto|phone-cc)\b/.test(sel.className) ? ' is-inline' : '');
    wrap.style.flexShrink = getComputedStyle(sel).flexShrink;
    [...sel.classList].filter((c) => /^-?m[trblxy]?-/.test(c)).forEach((c) => {
      sel.classList.remove(c);
      wrap.classList.add(c);
    });
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = loc ? 'kx-sel-btn' : 'kx-sel-btn field';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = (loc ? PIN : '') + '<span class="kx-sel-val"></span>' + (loc ? CARET : '');
    wrap.appendChild(btn);

    const labels = sel.id ? [...document.querySelectorAll('label[for="' + sel.id + '"]')] : [];
    const name = sel.getAttribute('aria-label') || (labels[0] ? labels[0].textContent.replace('*', '').trim() : '');
    const ctx = { sel, btn, wrap, loc };

    const sync = () => {
      const text = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : '';
      btn.querySelector('.kx-sel-val').textContent = text;
      btn.classList.toggle('is-empty', sel.value === '');
      if (name) btn.setAttribute('aria-label', name + ': ' + text);
      btn.classList.remove('kx-invalid');
    };
    sync();
    sel.addEventListener('change', sync);
    sel.addEventListener('invalid', () => btn.classList.add('kx-invalid'));

    btn.addEventListener('click', () => (cur === ctx ? close(true) : open(ctx)));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(ctx); }
    });
    labels.forEach((l) => l.addEventListener('click', (e) => { e.preventDefault(); btn.focus(); }));
    sel.tabIndex = -1;
  }

  function open(ctx) {
    close(false);
    cur = ctx;
    const { sel, btn, wrap } = ctx;
    menu.innerHTML = '';
    [...sel.options].forEach((o, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.textContent = o.text;
      li.dataset.i = i;
      li.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
      if (o.value === '') li.classList.add('is-placeholder');
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      menu.appendChild(li);
    });
    menu.classList.add('show');
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', menu.id);
    place();
    const active = menu.querySelector('[aria-selected="true"]') || items()[0];
    if (active) {
      active.focus({ preventScroll: true });
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function place() {
    const r = cur.btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const nav = document.getElementById('mNav');
    const navTop = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : Infinity;
    const vh = Math.min(window.innerHeight, navTop);
    const width = Math.min(Math.max(r.width, 180), vw - PAD * 2);
    menu.style.width = width + 'px';
    menu.style.maxHeight = '';
    const h = Math.min(menu.offsetHeight, MAX_H);
    const below = vh - r.bottom - GAP - PAD;
    const above = r.top - GAP - PAD;
    const down = below >= h || below >= above;
    const maxH = Math.min(MAX_H, down ? below : above);
    menu.style.maxHeight = maxH + 'px';
    menu.style.top = (down ? r.bottom + GAP : r.top - GAP - Math.min(h, maxH)) + 'px';
    const left = cur.loc && r.right - width >= PAD ? r.right - width : r.left;
    menu.style.left = Math.max(PAD, Math.min(left, vw - width - PAD)) + 'px';
  }

  function close(refocus) {
    if (!cur) return;
    const { btn, wrap } = cur;
    cur = null;
    menu.classList.remove('show');
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }

  function choose(li) {
    const { sel } = cur;
    sel.selectedIndex = +li.dataset.i;
    close(true);
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  menu.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.getAttribute('aria-disabled') !== 'true') choose(li);
  });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    const go = (n) => { const li = list[(n + list.length) % list.length]; if (li) { li.focus({ preventScroll: true }); li.scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(list.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) choose(list[i]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const from = list.slice(i + 1).concat(list.slice(0, i + 1));
      const hit = from.find((li) => li.textContent.trim().toLowerCase().startsWith(k));
      if (hit) go(list.indexOf(hit));
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (cur && !menu.contains(e.target) && !cur.btn.contains(e.target)) close(false);
  }, true);
  document.addEventListener('scroll', (e) => { if (cur && e.target !== menu) close(false); }, true);
  window.addEventListener('resize', () => close(false));

  document.querySelectorAll('select.field, select.kx-loc').forEach(enhance);
})();
