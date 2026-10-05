/* בקר ראשי: טאבים, כותרת, רינדור, הגדרות, אתחול */

const TABS = [
  { id: 'now', label: 'עכשיו', title: 'עכשיו', icon: ICON.now },
  { id: 'grid', label: 'לוז מלא', title: 'ליינאפ!', icon: ICON.grid },
  { id: 'mine', label: 'הלוז שלי', title: 'הלוז שלי', icon: ICON.mine },
  { id: 'map', label: 'מפה', title: 'מפה', icon: ICON.map },
  { id: 'profile', label: 'פרופיל', title: 'פרופיל', icon: ICON.user },
];
let tab = 'mine'; // פתיחת האפליקציה – תמיד "הלוז שלי", בלשונית "שלי"
let viewDay = null;

function currentViewDay() {
  if (viewDay) return viewDay;
  const live = logicalDay(now());
  viewDay = (isLive() || simTime != null) && live ? live : 'thu'; // לפני הפסטיבל – חמישי; בפסטיבל – היום של עכשיו
  return viewDay;
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    `<button class="tab" data-tab="${t.id}" ${t.id === tab ? 'aria-current="page"' : ''}>${t.icon}<span>${t.label}</span></button>`).join('');
}

function renderHeader() {
  const t = TABS.find(x => x.id === tab);
  const withDays = tab === 'grid' || tab === 'mine';
  const d = currentViewDay();
  const set = tab === 'mine' ? mineSet() : []; // הספירה לפי הלשונית (שלי / משותף / חבר)
  const counts = Object.fromEntries(DAYS.map(x => [x.id, set.filter(e => e.day === x.id).length]));
  let tools = '';
  if (tab === 'grid') {
    tools = `<div class="toolbar">
      <div class="seg" role="group" aria-label="סינון">
        ${[['all', 'הכל'], ['mine', 'שלי'], ['must', '★ חייב']].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${S.prefs.filter === k}">${l}</button>`).join('')}
      </div>
      <span class="spacer"></span>
      <div class="seg" role="group" aria-label="תצוגה">
        <button data-view="grid" aria-pressed="${S.prefs.view === 'grid'}" aria-label="גריד">במות</button>
        <button data-view="list" aria-pressed="${S.prefs.view === 'list'}" aria-label="רשימה">רשימה</button>
      </div>
    </div>`;
  }
  const mineBtns = tab === 'mine'
    ? `<button class="icon-btn" data-act="journal" aria-label="יומן סיקור">${ICON.note}</button>
       <button class="icon-btn solid" data-act="share" aria-label="שיתוף">${ICON.share}</button>` : '';
  // שדה החיפוש נשמר (ערך, פוקוס, מיקום הסמן) גם כשהכותרת מתרעננת
  const gq = $('#gq'), focused = gq && document.activeElement === gq, sel = focused ? [gq.selectionStart, gq.selectionEnd] : null;
  $('#top').innerHTML = `
    <div class="top-row">
      <h1>${t.title}</h1>${netPill()}
      ${mineBtns}
      ${cloudIcon()}
      <button class="logo-btn" data-act="home" aria-label="הלוז שלי"><img src="${ASSETS.wordmark}" alt="inDnegev"></button>
    </div>
    <div class="gsearch">
      <label class="field">${ICON.search}<span class="sr">חיפוש</span>
        <input id="gq" type="search" placeholder="חיפוש אמן, להקה או משתתף…" autocomplete="off" enterkeyhint="search" value="${esc(searchState.q)}">
      </label>
      <button class="gs-x" data-act="search-close">ביטול</button>
    </div>
    ${withDays ? `<div class="days" role="group" aria-label="בחירת יום">${DAYS.map(x => `
      <button class="day-pill" data-day="${x.id}" style="--day:${x.color}" aria-pressed="${x.id === d}">
        ${x.label}<small>${x.date}</small>${tab === 'mine' && counts[x.id] ? `<span class="count">${counts[x.id]}</span>` : ''}
      </button>`).join('')}</div>` : ''}
    ${tools}
    ${cloudStatus()}`;
  $('#top').classList.toggle('hidden', tab === 'map' && !!mapFocus && !searchOn);
  $('#top').classList.toggle('searching', searchOn);
  if (focused) { const i = $('#gq'); i.focus({ preventScroll: true }); try { i.setSelectionRange(sel[0], sel[1]); } catch (e) { /* */ } }
}

function render() {
  searchRefresh = null;
  renderTabs();
  renderHeader();
  const view = $('#view');
  if (searchOn) renderSearch(view);
  else if (tab === 'grid') renderSchedule(view);
  else if (tab === 'mine') { renderMine(view); scrollMineToNow(); }
  else if (tab === 'profile') renderProfile(view);
  else if (tab === 'map') renderMap(view);
  else renderNow(view);
}

/* רענון אחרי שינוי מצב – שומר על גלילה, לא נוגע במפה ובשדה החיפוש */
function rerender() {
  for (const l of layers) if (l.panel && l.panel.live && !l.panel.closed) l.panel.render();
  if (searchOn) { renderHeader(); if (searchRefresh) searchRefresh(); return; }
  if (tab === 'map') { renderHeader(); return; }
  const sc = $('#view .scroll');
  const st = sc ? sc.scrollTop : 0;
  renderHeader();
  const view = $('#view');
  if (tab === 'grid') renderSchedule(view);
  else if (tab === 'mine') renderMine(view);
  else if (tab === 'profile') renderProfile(view);
  else if (tab === 'now') renderNow(view);
  const sc2 = $('#view .scroll');
  if (sc2 && tab !== 'grid') sc2.scrollTop = st;
}

function setTab(id) {
  if (tab === 'map' && id !== 'map' && mapFocusLayer) dropMapFocus();
  tab = id;
  render();
}

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (searchOn) { closeAllLayers().then(() => setTab(b.dataset.tab)); return; } // לשונית סוגרת את החיפוש
  if (b.dataset.tab === tab && tab !== 'map') { const sc = $('#view .scroll, #view .gscroll'); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  setTab(b.dataset.tab);
});

$('#top').addEventListener('click', e => {
  const day = e.target.closest('[data-day]');
  if (day) { viewDay = day.dataset.day; S.prefs.day = viewDay; save(); render(); return; }
  const f = e.target.closest('[data-filter]');
  if (f) { S.prefs.filter = f.dataset.filter; save(); render(); return; }
  const v = e.target.closest('[data-view]');
  if (v) { S.prefs.view = v.dataset.view; save(); render(); return; }
  if (e.target.closest('[data-cloudpanel]')) { openBackupPanel(); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'share') openShare();
  if (a.dataset.act === 'journal') openTimeline();
  if (a.dataset.act === 'home') { const go = () => { S.prefs.mineView = 'me'; setTab('mine'); }; if (searchOn) closeAllLayers().then(go); else go(); }
  if (a.dataset.act === 'profile') { if (searchOn) closeAllLayers().then(() => setTab('profile')); else setTab('profile'); }
  if (a.dataset.act === 'search-close') exitSearch();
});
$('#top').addEventListener('input', e => {
  if (e.target.id !== 'gq') return;
  searchState.q = e.target.value;
  if (!searchOn) enterSearch(); else if (searchRefresh) searchRefresh();
  rememberSoon(searchState.q);
});
$('#top').addEventListener('focusin', e => { if (e.target.id === 'gq') enterSearch(); });
$('#top').addEventListener('keydown', e => { if (e.target.id === 'gq' && e.key === 'Enter') { rememberSearch(e.target.value); e.target.blur(); } }); // "חפש" במקלדת – סוגר את המקלדת

/* עדכון שוטף: מסך "עכשיו" וקו הזמן בגריד */
setInterval(() => {
  if (document.hidden) return;
  if (tab === 'now' && !sheetEl && !layers.length) rerender();
  if (tab === 'grid') updateNowLine();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && tab === 'now') rerender(); });

/* יציאה מהאפליקציה באמצע הקלדה: שומרים את הטיוטה מיד */
document.addEventListener('visibilitychange', () => { if (document.hidden && draft) finishDraft(false); });

/* אתחול */
S.prefs.mineView = 'me';
render();
initBackup();
initPwa();
importFromHash();
window.addEventListener('hashchange', importFromHash);
/* לינק של רשימת ציוד (#GEAR=...) – בפתיחה ואם נפתח כשהאפליקציה כבר פתוחה */
function gearFromHash() {
  if (!location.hash.startsWith('#GEAR=')) return false;
  const code = location.hash.slice(6);
  history.replaceState(null, '', location.pathname + location.search);
  openGearImport(code);
  return true;
}
window.addEventListener('hashchange', gearFromHash);
if (gearFromHash()) { /* */ } else if (/INDN1\./.test(decodeURIComponent(location.hash))) {
  const code = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  openImport(code, { invite: true });
} else {
  // הזמנה שנפתחה לפני מעבר להתחברות עם Google – ממשיכים ממנה
  try {
    const inv = JSON.parse(localStorage.getItem(INVITE_KEY));
    if (inv && Date.now() - inv.at < 3600000 && decodeShare(inv.code)) openImport(inv.code, { invite: true });
    else localStorage.removeItem(INVITE_KEY);
    const gi = JSON.parse(localStorage.getItem(GEAR_KEY)); // רשימת ציוד שנפתחה לפני מעבר להתחברות
    if (gi && Date.now() - gi.at < 3600000) openGearImport(gi.code); else localStorage.removeItem(GEAR_KEY);
  } catch (e) { /* */ }
}

/* מקלדת פתוחה (הגובה הנראה קטן משמעותית מגובה המסך) – מסתירים את הטאבים */
if (window.visualViewport) {
  const kb = () => {
    const typing = document.activeElement && document.activeElement.matches('#view input, #gq') &&
      visualViewport.height < screen.height * 0.62;
    $('#app').classList.toggle('typing', !!typing);
  };
  visualViewport.addEventListener('resize', kb);
  document.addEventListener('focusout', () => setTimeout(kb, 50));
}
