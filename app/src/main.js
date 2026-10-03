/* בקר ראשי: טאבים, כותרת, רינדור, הגדרות, אתחול */

const TABS = [
  { id: 'now', label: 'עכשיו', title: 'עכשיו', icon: ICON.now },
  { id: 'grid', label: 'לוז מלא', title: 'ליינאפ!', icon: ICON.grid },
  { id: 'mine', label: 'הלוז שלי', title: 'הלוז שלי', icon: ICON.mine },
  { id: 'search', label: 'חיפוש', title: 'חיפוש', icon: ICON.search },
  { id: 'map', label: 'מפה', title: 'מפה', icon: ICON.map },
];
let tab = isLive() ? 'now' : 'grid';
let viewDay = null;

function currentViewDay() {
  if (viewDay) return viewDay;
  const live = logicalDay(now());
  viewDay = (isLive() || simTime != null) && live ? live : (S.prefs.day || 'thu');
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
  const counts = Object.fromEntries(DAYS.map(x => [x.id, myPicks().filter(e => e.day === x.id).length]));
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
    ? `<button class="icon-btn" data-act="friends" aria-label="חברים">${ICON.users}</button>
       <button class="icon-btn solid" data-act="share" aria-label="שיתוף">${ICON.share}</button>` : '';
  $('#top').innerHTML = `
    <div class="top-row">
      <h1>${t.title}</h1>
      ${mineBtns}
      <button class="logo-btn" data-act="settings" aria-label="הגדרות ומידע"><img src="${ASSETS.wordmark}" alt="inDnegev"></button>
    </div>
    ${withDays ? `<div class="days" role="group" aria-label="בחירת יום">${DAYS.map(x => `
      <button class="day-pill" data-day="${x.id}" style="--day:${x.color}" aria-pressed="${x.id === d}">
        ${x.label}<small>${x.date}</small>${tab === 'mine' && counts[x.id] ? `<span class="count">${counts[x.id]}</span>` : ''}
      </button>`).join('')}</div>` : ''}
    ${tools}`;
  $('#top').classList.toggle('hidden', tab === 'map' && !!mapFocus);
}

function render() {
  searchRefresh = null;
  renderTabs();
  renderHeader();
  const view = $('#view');
  if (tab === 'grid') renderSchedule(view);
  else if (tab === 'mine') renderMine(view);
  else if (tab === 'search') renderSearch(view);
  else if (tab === 'map') renderMap(view);
  else renderNow(view);
}

/* רענון אחרי שינוי מצב – שומר על גלילה, לא נוגע במפה ובשדה החיפוש */
function rerender() {
  for (const l of layers) if (l.panel && l.panel.live && !l.panel.closed) l.panel.render();
  if (tab === 'map') { renderHeader(); return; }
  if (tab === 'search' && searchRefresh) { searchRefresh(); return; }
  const sc = $('#view .scroll');
  const st = sc ? sc.scrollTop : 0;
  renderHeader();
  const view = $('#view');
  if (tab === 'grid') renderSchedule(view);
  else if (tab === 'mine') renderMine(view);
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
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'share') openShare();
  if (a.dataset.act === 'friends') openFriends();
  if (a.dataset.act === 'settings') openSettings();
});

function openSettings() {
  openSheet(body => {
    const n = Object.keys(S.picks).length;
    body.innerHTML = `
      <img src="${ASSETS.wordmark}" alt="inDnegev" style="height:46px;width:auto;margin:4px 0 10px">
      <h2 class="ev-name" style="font-size:22px">הלוז שלי · אינדינגב 2026</h2>
      <p class="ev-meta">⁦15–17.10.2026⁩ · מצפה גבולות</p>
      <div class="sec">
        <h3>השם שלך</h3>
        <input id="setName" class="text-in" value="${esc(S.name)}" maxlength="24" placeholder="יופיע בשיתוף">
      </div>
      <div class="sec">
        <h3>גיבוי ושחזור</h3>
        <p style="margin:0 0 8px;font-size:14px;color:var(--ink-2)">הכל נשמר רק בטלפון הזה${storageOK ? '' : ' (<b>בדפדפן הזה השמירה לא עובדת!</b>)'}. כדאי לשמור קוד גיבוי בצד, למשל בהודעה לעצמכם.</p>
        <div class="btn-row">
          <button class="btn sm" data-a="backup">${ICON.copy} העתקת קוד גיבוי</button>
          <button class="btn alt sm" data-a="restore">${ICON.import} שחזור / ייבוא</button>
        </div>
      </div>
      <div class="sec">
        <h3>איך משתמשים</h3>
        <ul style="margin:0;padding-inline-start:20px;font-size:14px;line-height:1.6">
          <li>לחיצה על הופעה: פרטים, חייב/אולי, ומה מתנגש.</li>
          <li>לחיצה ארוכה בלוז המלא: הוספה מהירה כ"חייב".</li>
          <li>"ניווט": פותח את המפה עם סימון הבמה.</li>
          <li>"הלוז שלי" ← שיתוף: QR, קוד או תמונה, בלי אינטרנט.</li>
        </ul>
      </div>
      <div class="sec">
        <h3>איפוס</h3>
        <button class="btn alt sm" data-a="reset" style="border-color:var(--danger);color:var(--danger)">${ICON.trash} מחיקת כל הבחירות והחברים</button>
      </div>
      <p style="font-size:12px;color:var(--ink-3);margin-top:18px">${n} בחירות · נתונים v${DATA_VERSION} · לוז מתוך indnegev.co.il · אפליקציה אישית לא רשמית.</p>`;
    $('#setName', body).onchange = e => { S.name = e.target.value.trim().slice(0, 24); save(); };
    body.onclick = async e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'backup') toast(await copyText(encodeShare(S.name, S.picks)) ? 'קוד הגיבוי הועתק' : 'לא הצלחתי להעתיק');
      if (b.dataset.a === 'restore') { await closeAllLayers(); openImport(); }
      if (b.dataset.a === 'reset' && confirm('למחוק את כל הבחירות והחברים? אי אפשר לבטל.')) {
        S.picks = {}; S.friends = []; save(); closeSheet(); render(); toast('הכל נמחק');
      }
    };
  });
}

/* עדכון שוטף: מסך "עכשיו" וקו הזמן בגריד */
setInterval(() => {
  if (document.hidden) return;
  if (tab === 'now' && !sheetEl && !layers.length) rerender();
  if (tab === 'grid') updateNowLine();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && tab === 'now') rerender(); });

/* אתחול */
render();
if (/INDN1\./.test(decodeURIComponent(location.hash))) {
  const code = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  openImport(code);
}

/* מקלדת פתוחה (הגובה הנראה קטן משמעותית מגובה המסך) – מסתירים את הטאבים */
if (window.visualViewport) {
  const kb = () => {
    const typing = document.activeElement && document.activeElement.matches('#view input') &&
      visualViewport.height < screen.height * 0.62;
    $('#app').classList.toggle('typing', !!typing);
  };
  visualViewport.addEventListener('resize', kb);
  document.addEventListener('focusout', () => setTimeout(kb, 50));
}
