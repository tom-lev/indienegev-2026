/* גיבוי ושחזור:
   1. קובץ גיבוי מלא (הכל: לוז, פתקים, דירוגים, אוהל, חברים) – נשמר מחוץ לדפדפן
   2. תזכורת כשיש שינויים שלא גובו
   3. שליחת הקובץ לעצמך (וואטסאפ/מייל/Drive) + גיבוי אוטומטי לריפו פרטי בגיטהאב כשיש קליטה
   4. בקשת אחסון קבוע מהדפדפן
   5. עותק כפול בתוך הדפדפן (IndexedDB) לצד localStorage
   6. גרסאות קודמות במכשיר לפני כל פעולה הרסנית */

const BACKUP_APP = 'indienegev-2026';
const GH_KEY = 'indn26-gh'; // הטוקן נשמר בנפרד ולעולם לא נכנס לקובץ הגיבוי או לשיתוף
let persistGranted = null;

/* ───────── IndexedDB פשוט (מפתח → ערך) ───────── */
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open('indn26', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  }));
  return { get: k => run('readonly', s => s.get(k)), set: (k, v) => run('readwrite', s => s.put(v, k)) };
})();

/* ───────── מצב ───────── */
function backupInfo() {
  if (!S.backup) S.backup = {};
  return S.backup;
}
/* טביעת אצבע של הנתונים החשובים – כדי לדעת אם יש שינויים שלא גובו */
function dataFingerprint() {
  const s = JSON.stringify([S.picks, S.notes, S.ratings, S.friends.map(f => [f.name, f.picks]), S.prefs.tent || null, S.name]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
const hasData = () => Object.keys(S.picks).length || S.notes.length || Object.keys(S.ratings).length || S.prefs.tent || S.friends.length;
const lastBackupAt = () => Math.max(backupInfo().file || 0, backupInfo().gh || 0);
const isBackedUp = () => backupInfo().fp === dataFingerprint();
const unbackedNotes = () => S.notes.filter(n => (n.edited || n.at) > lastBackupAt()).length;

function markBackedUp(kind) {
  const b = backupInfo();
  b[kind] = Date.now();
  b.fp = dataFingerprint();
  save();
}

/* העתק נקי של המצב לגיבוי */
function stateForBackup() {
  const st = JSON.parse(JSON.stringify(S));
  delete st.backup;
  return st;
}
function backupJSON() {
  return JSON.stringify({ app: BACKUP_APP, kind: 'backup', v: 1, createdAt: Date.now(), dataVersion: DATA_VERSION, state: stateForBackup() });
}
function parseBackup(text) {
  try {
    const o = JSON.parse(text);
    if (o && o.app === BACKUP_APP && o.state && o.state.v === 1) return o;
  } catch (e) { /* לא תקין */ }
  return null;
}
function backupSummary(o) {
  const st = o.state;
  return `${Object.keys(st.picks || {}).length} הופעות · ${(st.notes || []).length} פתקים · ${Object.keys(st.ratings || {}).length} דירוגים · ${(st.friends || []).length} חברים${st.prefs && st.prefs.tent ? ' · אוהל' : ''}`;
}

/* החלפת כל המצב (אחרי שמירת גרסה קודמת) */
async function applyState(st, reason) {
  await takeSnapshot(reason || 'לפני שחזור');
  const keepBackup = S.backup;
  const d = defaults();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d, st, { prefs: { ...d.prefs, ...(st.prefs || {}) }, backup: keepBackup });
  save();
  syncTent();
  viewDay = null;
  render();
}

/* ───────── עותק כפול ב-IndexedDB ───────── */
let mirrorTimer = null;
function mirrorSave() {
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    IDB.set('state', JSON.stringify(S)).catch(() => {});
    scheduleGhAuto();
  }, 400);
}
/* בפתיחה: אם ה-localStorage ריק/פגום או ישן מהעותק הפנימי – משחזרים מהעותק */
async function recoverFromMirror() {
  try {
    const raw = await IDB.get('state');
    if (!raw) { mirrorSave(); return; }
    const m = JSON.parse(raw);
    if (m && m.v === 1 && (m.savedAt || 0) > (S.savedAt || 0) + 1000) {
      const d = defaults();
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, d, m, { prefs: { ...d.prefs, ...(m.prefs || {}) } });
      save(); syncTent(); render();
      toast('הנתונים שוחזרו מהעותק הפנימי');
    }
  } catch (e) { /* אין IndexedDB – ממשיכים עם localStorage */ }
}

/* ───────── גרסאות קודמות במכשיר ───────── */
async function takeSnapshot(reason) {
  if (!hasData()) return;
  try {
    const list = (await IDB.get('snapshots')) || [];
    list.unshift({ at: Date.now(), reason, state: JSON.stringify(stateForBackup()) });
    await IDB.set('snapshots', list.slice(0, 10));
  } catch (e) { /* */ }
}
async function getSnapshots() {
  try { return (await IDB.get('snapshots')) || []; } catch (e) { return []; }
}
/* גרסה אוטומטית פעם ב-12 שעות */
async function dailySnapshot() {
  const list = await getSnapshots();
  if (!list.length || Date.now() - list[0].at > 12 * HOUR) await takeSnapshot('גרסה אוטומטית');
}

/* ───────── אחסון קבוע ───────── */
async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    persistGranted = await navigator.storage.persisted() || await navigator.storage.persist();
  } catch (e) { /* */ }
}

/* ───────── קובץ ───────── */
const backupFileName = () => {
  const d = new Date();
  return `indienegev-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
};
function downloadBackup() {
  const blob = new Blob([backupJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupFileName();
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  markBackedUp('file');
  toast('הגיבוי נשמר בהורדות ✓');
}
async function shareBackup() {
  const file = new File([backupJSON()], backupFileName(), { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'גיבוי – הלוז שלי באינדינגב' });
      markBackedUp('file');
    } catch (e) { /* בוטל */ }
  } else downloadBackup();
}
function restoreFromFile(file) {
  const r = new FileReader();
  r.onload = async () => {
    const o = parseBackup(r.result);
    if (!o) return toast('זה לא קובץ גיבוי של האפליקציה');
    if (!confirm(`לשחזר את הגיבוי מ-${fmtStamp(o.createdAt)}?\n${backupSummary(o)}\n\nהמצב הנוכחי יישמר כגרסה קודמת.`)) return;
    await applyState(o.state, 'לפני שחזור מקובץ');
    toast('הגיבוי שוחזר ✓');
  };
  r.readAsText(file);
}

/* ───────── גיטהאב (ריפו פרטי, Contents API) ───────── */
function ghCfg() {
  try { const c = JSON.parse(localStorage.getItem(GH_KEY)); return c && c.repo && c.token ? c : null; } catch (e) { return null; }
}
function ghSetCfg(c) {
  try { if (c) localStorage.setItem(GH_KEY, JSON.stringify(c)); else localStorage.removeItem(GH_KEY); } catch (e) { /* */ }
}
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const unb64utf8 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

async function ghFetch(cfg, path, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000); // קליטה חלשה – לא נתקעים לנצח
  try {
    return await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
      ...opts, signal: ctl.signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } finally { clearTimeout(timer); }
}
async function ghPut(cfg, path, text, message) {
  let sha;
  const g = await ghFetch(cfg, path);
  if (g.ok) sha = (await g.json()).sha;
  else if (g.status !== 404) throw new Error(g.status === 401 ? 'הטוקן לא תקין' : g.status === 403 ? 'אין לטוקן הרשאת כתיבה' : `שגיאה ${g.status}`);
  const r = await ghFetch(cfg, path, { method: 'PUT', body: JSON.stringify({ message, content: b64utf8(text), sha }) });
  if (!r.ok) throw new Error(r.status === 404 ? 'הריפו לא נמצא (או שאין גישה)' : r.status === 403 ? 'אין לטוקן הרשאת כתיבה' : `שגיאה ${r.status}`);
}
let ghBusy = false;
async function ghBackup({ manual = false } = {}) {
  const cfg = ghCfg();
  if (!cfg || ghBusy) return false;
  if (!manual && (!navigator.onLine || cfg.auto === false)) return false;
  ghBusy = true;
  try {
    const json = backupJSON();
    const d = new Date();
    await ghPut(cfg, 'latest.json', json, `גיבוי ${fmtStamp(Date.now())}`);
    await ghPut(cfg, `history/${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`, json, `גיבוי יומי ${fmtStamp(Date.now())}`);
    markBackedUp('gh');
    backupInfo().ghError = null;
    if (manual) toast('גובה לגיטהאב ✓');
    return true;
  } catch (e) {
    backupInfo().ghError = e.name === 'AbortError' ? 'הקליטה חלשה מדי' : e.message || 'אין חיבור';
    save();
    if (manual) toast(`הגיבוי לגיטהאב נכשל: ${backupInfo().ghError}`);
    return false;
  } finally { ghBusy = false; }
}
async function ghRestore() {
  const cfg = ghCfg();
  if (!cfg) return;
  try {
    const r = await ghFetch(cfg, 'latest.json');
    if (!r.ok) throw new Error(r.status === 404 ? 'עוד אין גיבוי בריפו' : `שגיאה ${r.status}`);
    const o = parseBackup(unb64utf8((await r.json()).content));
    if (!o) throw new Error('הקובץ בריפו לא תקין');
    if (!confirm(`לשחזר את הגיבוי מגיטהאב (${fmtStamp(o.createdAt)})?\n${backupSummary(o)}\n\nהמצב הנוכחי יישמר כגרסה קודמת.`)) return;
    await applyState(o.state, 'לפני שחזור מגיטהאב');
    toast('שוחזר מגיטהאב ✓');
  } catch (e) {
    toast(`השחזור נכשל: ${e.name === 'AbortError' ? 'הקליטה חלשה מדי' : e.message}`);
  }
}
/* גיבוי אוטומטי: דקה אחרי שינוי, וכשהקליטה חוזרת */
let ghAutoTimer = null;
function scheduleGhAuto(delay = 60000) {
  const cfg = ghCfg();
  if (!cfg || cfg.auto === false || isBackedUp()) return;
  clearTimeout(ghAutoTimer);
  ghAutoTimer = setTimeout(() => { if (!isBackedUp()) ghBackup(); }, delay);
}
window.addEventListener('online', () => scheduleGhAuto(3000));

/* ───────── תזכורת גיבוי ───────── */
function backupNudge() {
  if (!hasData() || isBackedUp()) return '';
  const last = lastBackupAt();
  const notes = unbackedNotes();
  const picks = Object.keys(S.picks).length;
  const due = !last ? (picks >= 5 || S.notes.length >= 1) : (notes >= 3 || Date.now() - last > 12 * HOUR);
  if (!due) return '';
  const what = notes ? `${notes} פתקים` : 'שינויים';
  return `<div class="banner backup-nudge"><b>💾 יש ${what} שלא גובו</b>${last ? ` · גיבוי אחרון ${agoText(last)}` : ''}
    <div class="btn-row" style="margin-top:8px"><button class="btn sm" data-bk="save">${ICON.download} שמירת גיבוי</button>
    <button class="btn alt sm" data-bk="panel">אפשרויות</button></div></div>`;
}
function bindNudge(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-bk]');
    if (!b) return;
    if (b.dataset.bk === 'save') { downloadBackup(); rerender(); }
    else openBackupPanel();
  });
}
function agoText(ms) {
  const m = Math.round((Date.now() - ms) / MIN);
  if (m < 2) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}

/* שורת מצב: מתי נעשה הגיבוי האחרון לאינטרנט (גיטהאב). לחיצה פותחת את מסך הגיבוי */
function cloudStatus() {
  const cfg = ghCfg(), b = backupInfo();
  let icon, text, cls = '';
  if (!cfg) { icon = '☁️'; text = 'אין גיבוי לאינטרנט · להגדרה'; cls = 'off'; }
  else if (b.ghError && (!b.gh || isBackedUp() === false)) {
    icon = '⚠️'; text = `גיבוי לאינטרנט ${b.gh ? `אחרון ${agoText(b.gh)}` : 'עוד לא הצליח'} · ${b.ghError}`; cls = 'warn';
  } else if (b.gh) {
    icon = isBackedUp() ? '✅' : '☁️';
    text = `גיבוי אחרון לאינטרנט: ${agoText(b.gh)}${isBackedUp() ? '' : ' · יש שינויים חדשים, יגובו כשתהיה קליטה'}`;
  } else { icon = '☁️'; text = 'גיבוי לאינטרנט: עוד לא בוצע · יגובה כשתהיה קליטה'; }
  return `<button class="cloud-status ${cls}" data-bk="panel">${icon} ${esc(text)}</button>`;
}

/* ───────── מסך "גיבוי ושחזור" ───────── */
function openBackupPanel() {
  openPanel('גיבוי ושחזור', async (body, api) => {
    const b = backupInfo(), cfg = ghCfg();
    const snaps = await getSnapshots();
    const ok = v => v ? '✓' : '✗';
    body.innerHTML = `
      <div class="card-box">
        <h3>מצב</h3>
        <ul class="bk-status">
          <li>${isBackedUp() ? '✅ כל השינויים מגובים' : hasData() ? `⚠️ יש שינויים שלא גובו${unbackedNotes() ? ` (${unbackedNotes()} פתקים)` : ''}` : 'אין עדיין נתונים לגבות'}</li>
          <li>💾 גיבוי לקובץ: ${b.file ? agoText(b.file) : 'עוד לא'}</li>
          <li>🐙 גיבוי לגיטהאב: ${cfg ? (b.gh ? agoText(b.gh) : 'עוד לא') + (b.ghError ? ` · <span class="warn-t">נכשל: ${esc(b.ghError)}</span>` : '') : 'לא מוגדר'}</li>
          <li>🔒 אחסון קבוע בדפדפן: ${persistGranted == null ? 'לא נתמך' : ok(persistGranted)}</li>
          <li>📦 עותק כפול בתוך הדפדפן: ${'indexedDB' in window ? '✓' : '✗'}</li>
        </ul>
      </div>

      <div class="card-box">
        <h3>קובץ גיבוי מלא</h3>
        <p>הכל: לוז, פתקים, דירוגים, אוהל וחברים. הקובץ נשמר בהורדות, מחוץ לדפדפן, ולכן נשאר גם אם נתוני הגלישה נמחקים. עובד בלי קליטה.</p>
        <div class="btn-row">
          <button class="btn" data-b="save">${ICON.download} שמירה לקובץ</button>
          <button class="btn alt" data-b="share">${ICON.share} שליחה לעצמי</button>
        </div>
        <p style="margin:8px 0 0;font-size:12.5px">"שליחה לעצמי" (וואטסאפ / מייל / Drive) שומרת עותק גם מחוץ לטלפון, למקרה שהטלפון אובד. אם אין קליטה, ההודעה תצא כשתחזור.</p>
        <label class="btn alt block" style="margin-top:10px">${ICON.import} שחזור מקובץ<input type="file" accept=".json,application/json" id="bkFile" hidden></label>
      </div>

      <div class="card-box">
        <h3>🐙 גיבוי אוטומטי לגיטהאב</h3>
        ${cfg ? `
          <p>ריפו: <b dir="ltr">${esc(cfg.repo)}</b>. כשיש קליטה, הגיבוי עולה אוטומטית דקה אחרי כל שינוי, וגם ברגע שהקליטה חוזרת.</p>
          <label class="switch" style="margin-bottom:10px"><input type="checkbox" id="ghAuto" ${cfg.auto !== false ? 'checked' : ''}> גיבוי אוטומטי</label>
          <div class="btn-row">
            <button class="btn" data-b="gh-now">גיבוי עכשיו</button>
            <button class="btn alt" data-b="gh-restore">שחזור מגיטהאב</button>
          </div>
          <button class="btn alt sm" data-b="gh-off" style="margin-top:10px">ניתוק</button>`
        : `
          <p>עותק מחוץ לטלפון, בריפו פרטי שלך. צריך פעם אחת: ריפו פרטי וטוקן (Fine-grained) עם הרשאת <b>Contents: Read and write</b> לריפו הזה בלבד.</p>
          <label class="field-l" for="ghRepo">ריפו (משתמש/שם)</label>
          <input id="ghRepo" class="text-in" dir="ltr" placeholder="tom-lev/indienegev-backup" style="margin-bottom:10px">
          <label class="field-l" for="ghToken">טוקן</label>
          <input id="ghToken" class="text-in" dir="ltr" type="password" placeholder="github_pat_…" autocomplete="off" style="margin-bottom:10px">
          <button class="btn block" data-b="gh-save">שמירה ובדיקה</button>
          <p style="margin:8px 0 0;font-size:12.5px">הטוקן נשמר רק בטלפון הזה, ולא נכלל בקובץ הגיבוי או בשיתוף עם חברים.</p>`}
      </div>

      <div class="card-box">
        <h3>גרסאות קודמות במכשיר</h3>
        <p>נשמרות אוטומטית לפני כל שחזור, החלפת לוז או איפוס, ופעם ב-12 שעות.</p>
        ${snaps.length ? snaps.map((s, i) => `<div class="snap"><span><b>${fmtStamp(s.at)}</b> · ${esc(s.reason)}</span>
          <button class="btn alt sm" data-snap="${i}">שחזור</button></div>`).join('') : '<p style="margin:0">עוד אין גרסאות.</p>'}
      </div>

      <div class="card-box">
        <h3>קוד לוז מקוצר</h3>
        <p>קוד קצר שמכיל רק את הלוז (בלי פתקים ואוהל). נוח להעברה מהירה.</p>
        <button class="btn alt sm" data-b="code">${ICON.copy} העתקת קוד לוז</button>
      </div>`;

    body.onclick = async e => {
      const x = e.target.closest('[data-b], [data-snap]');
      if (!x) return;
      const a = x.dataset.b;
      if (a === 'save') { downloadBackup(); api.render(); }
      if (a === 'share') { await shareBackup(); api.render(); }
      if (a === 'code') toast(await copyText(encodeShare(S.name, S.picks)) ? 'קוד הלוז הועתק' : 'לא הצלחתי להעתיק');
      if (a === 'gh-save') {
        const repo = $('#ghRepo', body).value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        const token = $('#ghToken', body).value.trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return toast('צריך ריפו בפורמט משתמש/שם וטוקן');
        ghSetCfg({ repo, token, auto: true });
        toast('בודק…');
        const ok = await ghBackup({ manual: true });
        if (!ok) ghSetCfg(null);
        api.render();
      }
      if (a === 'gh-now') { toast('מגבה…'); await ghBackup({ manual: true }); api.render(); }
      if (a === 'gh-restore') { toast('מוריד…'); await ghRestore(); api.render(); }
      if (a === 'gh-off' && confirm('לנתק את הגיבוי לגיטהאב? (הגיבויים בריפו נשארים)')) { ghSetCfg(null); api.render(); }
      if (x.dataset.snap != null) {
        const s = snaps[+x.dataset.snap];
        if (!confirm(`לחזור לגרסה מ-${fmtStamp(s.at)}?\nהמצב הנוכחי יישמר כגרסה קודמת.`)) return;
        await applyState(JSON.parse(s.state), 'לפני חזרה לגרסה קודמת');
        toast('שוחזר ✓');
        api.render();
      }
    };
    const f = $('#bkFile', body);
    if (f) f.onchange = e => { if (e.target.files[0]) restoreFromFile(e.target.files[0]); setTimeout(() => api.render(), 500); };
    const ga = $('#ghAuto', body);
    if (ga) ga.onchange = () => { const c = ghCfg(); c.auto = ga.checked; ghSetCfg(c); if (ga.checked) scheduleGhAuto(1000); };
  });
}

/* אתחול (נקרא מ-main.js אחרי הרינדור הראשון) */
function initBackup() {
  requestPersist();
  recoverFromMirror().then(dailySnapshot);
  if (navigator.onLine) scheduleGhAuto(5000);
}
