/* חיפוש – שדה קבוע בכותרת בכל המסכים: לפי שם אמן, תעתיק, משתתפים ותוכן אירועי אדמה.
   הקלדה/לחיצה על השדה פותחת את התוצאות במקום המסך הנוכחי; "ביטול" או "חזרה" מחזירים אליו. */

const searchState = { q: '', kind: 'all' };
let searchRefresh = null; // רענון תוצאות בלבד, כדי לא לאבד פוקוס בשדה
let searchOn = false, searchLayer = null;

/* חיפושים אחרונים (5) – חלק מהנתונים, כך שמסתנכרנים בין המכשירים.
   נשמרים לבד: כשמפסיקים להקליד לרגע, כשפותחים תוצאה, ב"חפש"/Enter וביציאה מהחיפוש */
const recentSearches = () => (Array.isArray(S.recent) ? S.recent : []);
let recentTimer = null;
function rememberSearch(q) {
  clearTimeout(recentTimer);
  q = (q || '').trim();
  if (q.length < 2 || !search(q, 'all').length) return; // רק חיפוש שמצא משהו
  const cur = recentSearches();
  // המשך הקלדה של אותו חיפוש ("אב" → "אביב") מחליף את הקודם במקום להוסיף
  const rest = cur.filter((x, i) => x !== q && !(i === 0 && (q.startsWith(x) || x.startsWith(q))));
  const l = [q, ...rest].slice(0, 5);
  if (JSON.stringify(l) === JSON.stringify(cur)) return;
  S.recent = l;
  save();
}
function rememberSoon(q) { clearTimeout(recentTimer); recentTimer = setTimeout(() => rememberSearch(q), 1500); }

function enterSearch() {
  if (searchOn) return;
  searchOn = true;
  searchLayer = pushLayer(() => {
    rememberSearch(searchState.q);
    searchOn = false; searchLayer = null; searchState.q = '';
    const i = $('#gq');
    if (i) { i.value = ''; i.blur(); }
    render();
  });
  $('#top').classList.add('searching');
  renderSearch($('#view'));
}
function exitSearch() { if (searchOn) popLayer(); }

function renderSearch(view) {
  view.innerHTML = `<div class="scroll" id="sscroll">
    <div class="search-box">
      <div class="chips" role="group" aria-label="סינון">
        ${[['all', 'הכל'], ['music', 'הופעות'], ['adama', 'מתחם אדמה']].map(([k, l]) =>
          `<button data-kind="${k}" aria-pressed="${searchState.kind === k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="pad" id="results" style="padding-top:4px"></div>
  </div>`;
  const results = $('#results');
  const draw = () => {
    const res = search(searchState.q, searchState.kind);
    const rec = searchState.q.trim() ? [] : recentSearches();
    const recHtml = rec.length ? `<div class="recent"><div class="recent-h"><span>חיפושים אחרונים</span><button data-rclear>ניקוי</button></div>
      <div class="recent-l">${rec.map(q => `<button data-recent="${esc(q)}">${ICON.search}${esc(q)}</button>`).join('')}</div></div>` : '';
    const head = searchState.q.trim()
      ? (res.length ? `${res.length} תוצאות` : '')
      : `כל האמנים והאירועים (${res.length}) · א–ת`;
    results.innerHTML = recHtml + (res.length
      ? `<div class="result-meta">${head}</div>` + res.map(r => eventRow(r.ev, { hl: r.hl, hint: r.hint, showDay: true })).join('')
      : `<div class="empty"><h2>לא מצאנו</h2><p>אין אמן או אירוע בשם "${esc(searchState.q)}".<br>אפשר לנסות חלק מהשם, בעברית או באנגלית.</p></div>`);
  };
  results.addEventListener('click', e => {
    const r = e.target.closest('[data-recent]');
    if (r) { searchState.q = r.dataset.recent; const i = $('#gq'); if (i) i.value = searchState.q; draw(); return; }
    if (e.target.closest('[data-rclear]')) { S.recent = []; save(); draw(); return; }
  }, true);
  // פתיחת תוצאה (גם בטלפון, שבו הלחיצה מתחילה ב-pointerdown) = חיפוש ששווה לזכור
  results.addEventListener('pointerdown', e => { if (e.target.closest('[data-ev]')) rememberSearch(searchState.q); }, true);
  $('.chips', view).addEventListener('click', e => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    searchState.kind = b.dataset.kind;
    $$('.chips button', view).forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  });
  bindRows(results);
  draw();
  searchRefresh = () => { const sc = $('#sscroll'); if (!sc) return; const st = sc.scrollTop; draw(); sc.scrollTop = st; };
}
