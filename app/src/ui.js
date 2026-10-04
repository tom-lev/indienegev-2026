/* רכיבי ממשק משותפים: אייקונים, שכבות (גיליון/פאנל), טוסט, שורת הופעה */

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  now: svg('<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/>'),
  grid: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 4v17M15 4v17"/>'),
  mine: svg('<path d="m12 3 2.6 5.6 6 .7-4.4 4.1 1.2 6L12 16.4 6.6 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  map: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>'),
  import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M9 5l7 7-7 7"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  cols: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  note: svg('<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  swap: svg('<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
};

const stageVars = id => `--c:${STAGE[id].color};--tint:${STAGE[id].tint}`;
const LV_LABEL = { 2: 'חייב', 1: 'אולי' };
const LV_ICON = { 2: '★', 1: '◐' };

/* ───────── טוסט ───────── */
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.fn(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4000 : 2400);
}

/* ───────── שכבות + כפתור "חזור" של הטלפון ─────────
   כל שכבה פתוחה = רשומה בהיסטוריה. כפתור חזור סוגר את העליונה. */
const layers = [];
window.addEventListener('popstate', () => {
  const l = layers.pop();
  if (l) l.close();
});
function pushLayer(close) {
  const l = { close };
  layers.push(l);
  history.pushState({ layer: layers.length }, '');
  return l;
}
function popLayer() {
  if (layers.length) history.back();
}
/* סוגר את כל השכבות ומחכה שההיסטוריה תתעדכן */
function closeAllLayers() {
  return new Promise(resolve => {
    if (!layers.length) return resolve();
    const n = layers.length;
    for (let i = layers.length - 1; i >= 0; i--) layers[i].close();
    layers.length = 0;
    let done = false;
    const fin = () => { if (!done) { done = true; window.removeEventListener('popstate', fin); resolve(); } };
    window.addEventListener('popstate', fin);
    history.go(-n);
    setTimeout(fin, 350);
  });
}

/* ───────── גיליון תחתון ───────── */
let sheetEl = null, sheetLayer = null, sheetRender = null;
function openSheet(renderFn) {
  sheetRender = renderFn;
  if (!sheetEl) {
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    const sh = document.createElement('section');
    sh.className = 'sheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = '<div class="grab"></div><div class="body"></div>';
    document.body.append(bd, sh);
    bd.onclick = () => popLayer();
    enableSheetDrag(sh);
    sheetEl = { bd, sh, body: sh.querySelector('.body') };
    requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });
    sheetLayer = pushLayer(() => destroySheet());
  }
  refreshSheet(true);
}
function refreshSheet(resetScroll) {
  if (!sheetEl || !sheetRender) return;
  const st = sheetEl.body.scrollTop;
  sheetEl.body.innerHTML = '';
  sheetRender(sheetEl.body);
  sheetEl.body.scrollTop = resetScroll ? 0 : st;
}
function destroySheet() {
  if (!sheetEl) return;
  if (typeof finishDraft === 'function') finishDraft(false);
  const { bd, sh } = sheetEl;
  bd.classList.remove('show');
  sh.classList.remove('show');
  sh.style.transform = '';
  setTimeout(() => { bd.remove(); sh.remove(); }, 260);
  sheetEl = null; sheetLayer = null; sheetRender = null;
}
function closeSheet() {
  if (sheetLayer) {
    const i = layers.indexOf(sheetLayer);
    if (i === layers.length - 1) popLayer();
  }
}
function enableSheetDrag(sh) {
  const grab = sh.querySelector('.grab');
  let y0 = null, dy = 0;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); sh.style.transition = 'none'; });
  grab.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sh.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    sh.style.transition = '';
    if (dy > 90) popLayer(); else sh.style.transform = '';
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
}

/* ───────── פאנל במסך מלא ───────── */
function openPanel(title, renderFn, onClose) {
  const p = document.createElement('section');
  p.className = 'panel';
  p.setAttribute('role', 'dialog');
  p.innerHTML = `<div class="panel-h"><button class="icon-btn" data-back aria-label="חזרה">${ICON.back}</button><h2>${esc(title)}</h2></div><div class="body"></div>`;
  document.body.append(p);
  const body = p.querySelector('.body');
  const api = {
    el: p, body,
    render: () => { const st = body.scrollTop; body.innerHTML = ''; renderFn(body, api); body.scrollTop = st; },
    close: () => popLayer(),
  };
  p.querySelector('[data-back]').onclick = () => popLayer();
  api.layer = pushLayer(() => {
    api.closed = true;
    p.classList.remove('show');
    onClose && onClose();
    setTimeout(() => p.remove(), 280);
    rerender();
  });
  api.layer.panel = api;
  renderFn(body, api);
  requestAnimationFrame(() => p.classList.add('show'));
  return api;
}

/* ───────── שורת הופעה (רשימות) ───────── */
function friendAvatars(list, sm = true) {
  if (!list.length) return '';
  return `<span class="avs">${list.map(f => `<span class="av ${sm ? 'sm' : ''}" style="--fc:${f.color}" title="${esc(f.name)}">${f.emoji}</span>`).join('')}</span>`;
}
function eventRow(ev, opts = {}) {
  const lv = opts.lv !== undefined ? opts.lv : level(ev.id); // opts.lv – רמה בלוז של חבר
  const mine = opts.lv !== undefined && level(ev.id);
  const st = STAGE[ev.stage];
  const name = opts.hl ? highlight(ev.name, opts.hl) : esc(ev.name);
  const going = opts.people || (opts.noFriends ? [] : friendsGoing(ev)); // opts.people – לוז משותף (כולל אני)
  const right = opts.nav
    ? `<button class="nav-btn" data-nav="${ev.id}" aria-label="ניווט ל${esc(st.name)}">${ICON.pin}</button>`
    : `<button class="star-btn ${lv ? 'on' + lv : ''}" data-star="${ev.id}" aria-label="${lv ? 'הסר מהלוז' : 'הוסף כחייב'}">${lv ? LV_ICON[lv] : '☆'}</button>`;
  return `<div class="row lv${lv} ${isNope(ev.id) ? 'nope' : ''} ${ev.cancelled ? 'cancelled' : ''} ${opts.cls || ''}" style="${stageVars(ev.stage)}" data-ev="${ev.id}" role="button" tabindex="0">
    <div class="t">${ev.s}<small>${opts.showDay ? DAY[ev.day].label : ev.e}</small></div>
    <div>
      <div class="n">${isNope(ev.id) ? '<span class="nope-i" title="לא בשבילי">👎</span> ' : ''}${name}</div>
      <div class="sub"><span class="stag">${esc(st.short)}</span>${opts.showDay ? `<span>${timeRange(ev)}</span>` : ''}${ev.type !== 'show' ? `<span class="chip soft">${TYPES[ev.type]}</span>` : ''}${ev.cancelled ? '<span class="chip warn">בוטל</span>' : ''}${opts.levelChip && lv ? `<span class="chip ${lv === 2 ? '' : 'soft'}">${LV_ICON[lv]} ${LV_LABEL[lv]}</span>` : ''}${mine ? `<span class="chip soft">${LV_ICON[mine]} גם אצלי</span>` : ''}${opts.chip || ''}${going.length ? friendAvatars(going) : ''}${notesFor(ev.id).length ? `<span class="chip soft">📝 ${notesFor(ev.id).length}</span>` : ''}</div>
      ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}
    </div>
    ${right}
  </div>`;
}

/* האזנה מרוכזת לשורות: פתיחת גיליון / כוכב / ניווט */
function rowClick(e) {
  const star = e.target.closest('[data-star]');
  if (star) { e.stopPropagation(); quickToggle(star.dataset.star); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.stopPropagation(); navigateTo(EV[nav.dataset.nav]); return; }
  const row = e.target.closest('[data-ev]');
  if (row) openEvent(EV[row.dataset.ev]);
}
function bindRows(root) {
  root.addEventListener('click', rowClick);
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-ev]')) openEvent(EV[e.target.dataset.ev]);
  });
}

/* ───────── שינוי רמת עניין ───────── */
function setLevel(id, lv, { silent = false } = {}) {
  const prev = level(id);
  if (lv) { S.picks[id] = lv; if (S.nope) delete S.nope[id]; } else delete S.picks[id];
  save();
  rerender();
  refreshSheet();
  if (!silent && prev !== lv) {
    const msg = lv === 2 ? 'נוסף כ"חייב" ★' : lv === 1 ? 'נוסף כ"אולי"' : 'הוסר מהלוז';
    toast(msg, { label: 'ביטול', fn: () => setLevel(id, prev, { silent: true }) });
  }
  if (lv && navigator.vibrate) navigator.vibrate(12);
}
/* 👎 "לא בשבילי": מעומעם בכל מקום. מסמן → יוצא מהלוז; בחירה בחייב/אולי מבטלת אותו */
function setNope(id, on, { silent = false } = {}) {
  const prevNope = isNope(id), prevLv = level(id);
  if (!S.nope) S.nope = {};
  if (on) { S.nope[id] = true; delete S.picks[id]; } else delete S.nope[id];
  save(); rerender(); refreshSheet();
  if (!silent) toast(on ? '👎 סומן "לא בשבילי"' : 'הסימון בוטל', {
    label: 'ביטול', fn: () => { setNope(id, prevNope, { silent: true }); if (prevLv) setLevel(id, prevLv, { silent: true }); },
  });
}
function quickToggle(id) {
  setLevel(id, level(id) ? 0 : 2);
}
