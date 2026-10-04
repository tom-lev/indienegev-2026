/* מסך "לוז מלא": גריד במות × שעות (כמו ה-PDF) או רשימה כרונולוגית */

const PPM = 1.55; // פיקסלים לדקה

function dayRange(dayId) {
  const evs = EVENTS.filter(e => e.day === dayId);
  const t0 = Math.min(...evs.map(e => e.start));
  const t1 = Math.max(...evs.map(e => e.end));
  const h0 = new Date(t0); h0.setMinutes(0, 0, 0);
  const h1 = new Date(t1); if (h1.getMinutes()) h1.setHours(h1.getHours() + 1, 0, 0, 0);
  return { evs, t0: h0.getTime(), t1: h1.getTime() };
}

function cardClass(ev) {
  const lv = level(ev.id);
  const f = S.prefs.filter;
  const dim = (f === 'mine' && !lv) || (f === 'must' && lv < 2);
  return `card lv${lv} ${dim ? 'dim' : ''} ${isNope(ev.id) ? 'nope' : ''} ${ev.cancelled ? 'cancelled' : ''}`;
}

/* גריד במות × שעות. o.only – רק חלק מההופעות (לוז אישי/של חבר/משותף): רק הבמות והשעות הרלוונטיות.
   o.lvOf – רמה לכל הופעה (ברירת מחדל: שלי). o.people – מי הולך (נקודות בפינה) */
function gridMarkup(dayId, o = {}) {
  const lvOf = o.lvOf || level;
  let { evs, t0, t1 } = dayRange(dayId);
  let stages = STAGES;
  if (o.only) {
    evs = evs.filter(o.only);
    stages = STAGES.filter(st => evs.some(e => e.stage === st.id));
    const a = new Date(Math.min(...evs.map(e => e.start))); a.setMinutes(0, 0, 0); t0 = a.getTime();
    const b = new Date(Math.max(...evs.map(e => e.end))); if (b.getMinutes()) b.setHours(b.getHours() + 1, 0, 0, 0); t1 = b.getTime();
  }
  const H = (t1 - t0) / MIN * PPM;
  const W = window.innerWidth - 46;
  const colw = o.only ? Math.round(Math.max(118, Math.min(200, W / Math.min(stages.length, 2.5)))) : Math.max(118, Math.min(150, Math.round(W / 2.5)));
  const hours = [];
  for (let t = t0; t <= t1; t += HOUR) hours.push(t);
  const showFriends = !o.only && S.prefs.friendsOnGrid && activeFriends().length;

  const cols = stages.map(st => {
    const cards = evs.filter(e => e.stage === st.id).map(ev => {
      const top = (ev.start - t0) / MIN * PPM;
      const h = dur(ev) * PPM - 3;
      const lv = lvOf(ev.id);
      const going = o.people ? o.people(ev) : showFriends ? friendsGoing(ev) : [];
      const cls = o.only ? `card lv${lv} ${ev.cancelled ? 'cancelled' : ''}` : cardClass(ev);
      return `<div class="${cls} ${h < 66 ? 'short' : ''}" data-ev="${ev.id}" style="top:${top + 1.5}px;height:${h}px">
        ${lv ? `<span class="lv-badge">${LV_ICON[lv]}</span>` : !o.only && isNope(ev.id) ? '<span class="lv-badge">👎</span>' : ''}
        <b>${esc(ev.name)}</b><small>${timeRange(ev)}</small>
        ${going.length ? `<span class="fdots">${going.map(f => f.emoji).join('')}</span>` : ''}
      </div>`;
    }).join('');
    return `<div class="g-col" style="${stageVars(st.id)}">${cards}<div class="nowline hidden"></div></div>`;
  }).join('');

  const html = `<div class="grid" style="--h:${H}px;--hour:${60 * PPM}px;--colw:${colw}px;grid-template-columns:46px repeat(${stages.length}, var(--colw))">
    <div class="g-corner"></div>
    ${stages.map(st => `<div class="g-head" style="--c:${st.color}"><i>${st.icon}</i>${esc(st.name)}</div>`).join('')}
    <div class="g-times">${hours.map(t => `<span style="top:${(t - t0) / MIN * PPM}px">${fmtT(t)}</span>`).join('')}<div class="now-pill hidden"></div></div>
    ${cols}
  </div>`;
  return { html, t0, t1 };
}

function renderGrid(view, dayId) {
  const { html, t0, t1 } = gridMarkup(dayId);
  view.innerHTML = `<div class="gscroll" id="gscroll">${html}</div>`;
  const sc = $('#gscroll');
  sc.dataset.t0 = t0;
  sc.dataset.t1 = t1;
  bindCardPress(sc);
  updateNowLine();
  return sc;
}

/* קו "עכשיו" – מתעדכן בלי לרנדר מחדש */
function updateNowLine() {
  const sc = $('#gscroll');
  if (!sc) return;
  const t = now(), t0 = +sc.dataset.t0, t1 = +sc.dataset.t1;
  const on = t >= t0 && t <= t1;
  const y = (t - t0) / MIN * PPM;
  $$('.nowline', sc).forEach(l => { l.classList.toggle('hidden', !on); l.style.top = y + 'px'; });
  const pill = $('.now-pill', sc);
  pill.classList.toggle('hidden', !on);
  pill.style.top = y + 'px';
  pill.textContent = fmtT(t);
  return on ? y : null;
}

/* לחיצה = פתיחת גיליון, לחיצה ארוכה = הוספה/הסרה מהירה */
function bindCardPress(root) {
  let timer = null, startX = 0, startY = 0, target = null, fired = false;
  root.addEventListener('pointerdown', e => {
    const c = e.target.closest('.card');
    if (!c) return;
    target = c; fired = false; startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      fired = true;
      quickToggle(c.dataset.ev);
    }, 480);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  root.addEventListener('pointermove', e => {
    if (timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) cancel();
  });
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('scroll', cancel, { passive: true });
  root.addEventListener('contextmenu', e => { if (e.target.closest('.card')) e.preventDefault(); });
  root.addEventListener('click', e => {
    const c = e.target.closest('.card');
    if (!c) return;
    if (fired) { fired = false; return; }
    openEvent(EV[c.dataset.ev]);
  });
}

function renderList(view, dayId) {
  const f = S.prefs.filter;
  let evs = BY_START.filter(e => e.day === dayId);
  if (f === 'mine') evs = evs.filter(e => level(e.id));
  if (f === 'must') evs = evs.filter(e => level(e.id) === 2);
  let lastH = null;
  const html = evs.map(ev => {
    const h = ev.s.slice(0, 2);
    const sep = h !== lastH ? `<div class="hour-sep">${h}:00</div>` : '';
    lastH = h;
    return sep + eventRow(ev);
  }).join('');
  view.innerHTML = `<div class="scroll" id="lscroll"><div class="pad">${html || `<div class="empty"><p>אין הופעות שמתאימות לסינון ביום הזה.</p></div>`}</div></div>`;
  bindRows($('#lscroll'));
  return $('#lscroll');
}

let gridScrollMemo = {}; // שמירת מיקום גלילה לכל יום/תצוגה
let autoScrolledNow = false;

function renderSchedule(view) {
  const dayId = currentViewDay();
  const key = dayId + S.prefs.view;
  const sc = S.prefs.view === 'list' ? renderList(view, dayId) : renderGrid(view, dayId);
  const memo = gridScrollMemo[key];
  if (memo) { sc.scrollTop = memo.top; sc.scrollLeft = memo.left; }
  else if (S.prefs.view === 'grid' && !autoScrolledNow) {
    const y = updateNowLine();
    if (y != null) { sc.scrollTop = Math.max(0, y - 120); autoScrolledNow = true; }
  }
  sc.addEventListener('scroll', () => { gridScrollMemo[key] = { top: sc.scrollTop, left: sc.scrollLeft }; }, { passive: true });
}
