const FIREBASE_CFG = {"apiKey": "AIzaSyDMNlvqnDlASfIKdL5EYonDHtDuFQPN_N4", "projectId": "indnegev-14c1b", "googleClientId": "177429003497-movbi1a9k0e9j595djfuhg282e8av1l0.apps.googleusercontent.com"};
/* מנוע הגיבוי לענן (Firebase דרך REST) – רץ גם בדף וגם ב-Service Worker.
   בלי DOM ובלי SDK, כדי שה-Service Worker יוכל לגבות ברקע (Background Sync) גם כשהאפליקציה סגורה.
   FIREBASE_CFG מוגדר לפני הקובץ הזה (בבנייה): { apiKey, projectId, googleClientId, endpoints? } */

const CC = (() => {
  const cfg = (typeof FIREBASE_CFG !== 'undefined' && FIREBASE_CFG) || {};
  const on = !!(cfg.apiKey && cfg.projectId && cfg.googleClientId);
  const ep = Object.assign({
    token: 'https://securetoken.googleapis.com/v1/token',
    idp: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp',
    fs: `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`,
  }, cfg.endpoints || {});

  /* IndexedDB (אותו מסד של backup.js: 'indn26' / 'kv') */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('indn26', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction('kv', mode);
    const q = fn(t.objectStore('kv'));
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  }));
  const get = k => run('readonly', s => s.get(k));
  const set = (k, v) => run('readwrite', s => s.put(v, k));
  const del = k => run('readwrite', s => s.delete(k));

  /* טביעת אצבע של הנתונים החשובים (בלי העדפות תצוגה) – כדי לא להעלות סתם */
  /* JSON קנוני (מפתחות ממוינים) – כדי שאותו תוכן ייתן אותה טביעת אצבע בכל מכשיר, בלי תלות בסדר */
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v);
  function fp(st) {
    const s = canon([items(st), st.tomb || {}]);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
  function backupFrom(st) {
    const clean = JSON.parse(JSON.stringify(st));
    delete clean.backup;
    return JSON.stringify({ app: 'indienegev-2026', kind: 'backup', v: 1, createdAt: Date.now(), dataVersion: clean.dataVersion, state: clean });
  }

  async function req(url, opts = {}, ms = 20000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms); // קליטה חלשה – לא נתקעים
    try { return await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store' }); }
    finally { clearTimeout(t); }
  }

  /* טוקן תקף של Firebase (מתחדש לבד מה-refresh token, גם ב-Service Worker) */
  async function auth() {
    const a = await get('auth');
    if (!a) throw new Error('לא מחובר');
    if (a.idToken && a.exp > Date.now() + 60000) return a;
    const r = await req(`${ep.token}?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
    });
    if (!r.ok) throw new Error(r.status === 400 ? 'צריך להתחבר מחדש' : `שגיאה ${r.status}`);
    const j = await r.json();
    Object.assign(a, { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in) * 1000 });
    await set('auth', a);
    return a;
  }

  /* כניסה: טוקן גוגל (מ-Google Identity Services) ← משתמש Firebase */
  async function signInWithGoogleToken(googleIdToken) {
    const r = await req(`${ep.idp}?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postBody: `id_token=${googleIdToken}&providerId=google.com`, requestUri: (typeof location !== 'undefined' ? location.origin : 'http://localhost'), returnSecureToken: true }),
    });
    if (!r.ok) throw new Error(`הכניסה נכשלה (${r.status})`);
    const j = await r.json();
    const a = { uid: j.localId, email: j.email, name: j.displayName || j.firstName || '', idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn) * 1000 };
    await set('auth', a);
    return a;
  }

  const docUrl = uid => `${ep.fs}/backups/${uid}`;
  const errText = e => e.name === 'AbortError' ? 'הקליטה חלשה מדי' : e.message || 'אין חיבור';

  /* ───────── מיזוג בין עותקים: "האחרון גובר" לכל פריט + רישום מחיקות מפורש ─────────
     לכל פריט (הופעה, דירוג, 👎, פתק, חבר, אוהל, שם) נשמר זמן עדכון (mt), ולכל מחיקה – זמן מחיקה (tomb).
     מיזוג של שני מצבים: לכל פריט – הגרסה עם זמן העדכון המאוחר; אם יש מחיקה מאוחרת יותר – הפריט נמחק.
     • פריט חסר אף פעם לא נחשב "נמחק" – רק מחיקה רשומה מוחקת. לכן מכשיר ריק/ישן/חלקי לא מוחק כלום.
     • המיזוג נותן אותה תוצאה בכל סדר ובכל מספר עותקים (חילופי, קיבוצי, אידמפוטנטי) – כל המכשירים מתכנסים. */
  const KINDS = [['p', 'picks'], ['r', 'ratings'], ['x', 'nope']];
  function items(st) { // מפתח → ערך
    const m = {};
    for (const [pre, k] of KINDS) for (const [id, v] of Object.entries(st[k] || {})) m[pre + ':' + id] = v;
    for (const n of st.notes || []) m['n:' + n.id] = n;
    for (const f of st.friends || []) m['f:' + f.name] = f;
    if (st.prefs && st.prefs.tent) m.tent = st.prefs.tent;
    if (st.name) m.name = st.name;
    return m;
  }
  function implicitMt(key, v) { // מצבים ישנים בלי mt
    if (!v || typeof v !== 'object') return 0;
    return v.edited || v.at || v.importedAt || 0;
  }
  const mtOf = (st, key, v) => ((st.mt && st.mt[key]) || implicitMt(key, v));
  function fromItems(base, m, mt, tomb) { // בונה מצב מהפריטים (שאר השדות – מ-base)
    const out = { ...base, picks: {}, ratings: {}, nope: {}, notes: [], friends: [], mt, tomb };
    const prefs = { ...(base.prefs || {}) }; delete prefs.tent;
    out.name = '';
    for (const [key, v] of Object.entries(m)) {
      const i = key.indexOf(':'), pre = i > 0 ? key.slice(0, i) : key, id = i > 0 ? key.slice(i + 1) : '';
      if (pre === 'p') out.picks[id] = v; else if (pre === 'r') out.ratings[id] = v; else if (pre === 'x') out.nope[id] = v;
      else if (pre === 'n') out.notes.push(v); else if (pre === 'f') out.friends.push(v);
      else if (key === 'tent') prefs.tent = v; else if (key === 'name') out.name = v;
    }
    out.notes.sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id > b.id ? 1 : -1));
    out.prefs = prefs;
    return out;
  }
  /* מיזוג a + b. שדות שאינם נתונים (העדפות תצוגה וכו') – מ-a */
  function lww(a, b) {
    if (!b) return a;
    const ia = items(a), ib = items(b), mt = {}, tomb = {}, m = {};
    const ta = a.tomb || {}, tb = b.tomb || {};
    for (const key of new Set([...Object.keys(ia), ...Object.keys(ib), ...Object.keys(ta), ...Object.keys(tb)])) {
      const d = Math.max(ta[key] || 0, tb[key] || 0);
      let v, t = -1;
      for (const [st, it] of [[a, ia], [b, ib]]) {
        if (!(key in it)) continue;
        const tt = mtOf(st, key, it[key]);
        if (tt > t || (tt === t && JSON.stringify(it[key]) > JSON.stringify(v))) { t = tt; v = it[key]; }
      }
      // אין מחיקה רשומה (d=0) → הפריט נשמר תמיד, גם בלי זמן עדכון (נתונים מגרסה קודמת)
      if (v !== undefined && (t > d || d === 0)) { m[key] = v; if (t > 0) mt[key] = t; }
      else if (d > 0) tomb[key] = d;
    }
    const out = fromItems(a, m, mt, tomb);
    out.prefs = { ...(b.prefs || {}), ...(a.prefs || {}), ...(m.tent ? { tent: m.tent } : {}) };
    if (!m.tent) delete out.prefs.tent;
    out.editedAt = Math.max(a.editedAt || 0, b.editedAt || 0);
    return out;
  }
  /* רישום זמני עדכון/מחיקה לשינויים שהמשתמש עשה מאז prev (נקרא בכל שמירה). מחזיר true אם היה שינוי בנתונים */
  function stampEdits(prev, next, now) {
    const ip = items(prev || {}), inx = items(next);
    next.mt = { ...(next.mt || {}) }; next.tomb = { ...(next.tomb || {}) };
    const pmt = (prev && prev.mt) || {}, ptomb = (prev && prev.tomb) || {};
    let changed = false;
    for (const key of Object.keys(inx)) {
      const same = key in ip && JSON.stringify(ip[key]) === JSON.stringify(inx[key]);
      if (!same && (next.mt[key] || 0) === (pmt[key] || 0)) { next.mt[key] = now; changed = true; } // עריכה/הוספה של המשתמש
      if ((next.tomb[key] || 0) >= (next.mt[key] || implicitMt(key, inx[key]))) {               // נוסף מחדש אחרי מחיקה
        if (!same) next.mt[key] = Math.max(now, (next.tomb[key] || 0) + 1);
        delete next.tomb[key];
      }
    }
    for (const key of Object.keys(ip)) {
      if (!(key in inx) && (next.tomb[key] || 0) <= (ptomb[key] || 0)) { next.tomb[key] = Math.max(now, (next.mt[key] || 0) + 1); delete next.mt[key]; changed = true; }
    }
    return changed;
  }
  /* החלפת כל הנתונים במצב אחר (שחזור גרסה): הכל "חדש עכשיו", ומה שלא קיים בו – נמחק */
  function replaceStamped(cur, st, now) {
    const icur = items(cur), inew = items(st), mt = {}, tomb = { ...(cur.tomb || {}) };
    for (const key of Object.keys(inew)) { mt[key] = now; delete tomb[key]; }
    for (const key of Object.keys(icur)) if (!(key in inew)) tomb[key] = now;
    return fromItems({ ...cur, ...st, prefs: { ...(cur.prefs || {}) } }, inew, mt, tomb);
  }

  const clean = st => { const c = JSON.parse(JSON.stringify(st)); delete c.backup; return c; };

  /* מצב הענן: { state, fp, updateTime } או null */
  async function getRemote(a) {
    const r = await req(docUrl(a.uid), { headers: { Authorization: `Bearer ${a.idToken}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 403 ? 'אין הרשאה' : `שגיאה ${r.status}`);
    const j = await r.json();
    const prev = ((j.fields.prev && j.fields.prev.arrayValue && j.fields.prev.arrayValue.values) || [])
      .map(v => ({ data: v.mapValue.fields.data.stringValue, at: +v.mapValue.fields.at.integerValue }));
    return { raw: j.fields.data.stringValue, state: JSON.parse(j.fields.data.stringValue).state, fp: +j.fields.fp.integerValue,
      updateTime: j.updateTime, prev, updatedAt: Date.parse(j.fields.updatedAt && j.fields.updatedAt.timestampValue) || 0 };
  }

  /* ───────── הגנות מאובדן נתונים ───────── */
  const size = st => Object.keys(st.picks || {}).length + (st.notes || []).length + Object.keys(st.ratings || {}).length
    + Object.keys(st.nope || {}).length + (st.friends || []).length + ((st.prefs && st.prefs.tent) ? 1 : 0);
  const PREV_KEEP = 8; // כמה גרסאות קודמות נשמרות בענן

  /* בקשת כתיבה.
     - precondition: כותבים רק אם הענן לא השתנה מאז שקראנו אותו (אחרת מכשיר אחר כתב בינתיים).
     - updateMask: מעדכנים רק את השדות שלנו, כך שהיסטוריית הגרסאות (prev) לא נמחקת בכתיבה מהירה. */
  function buildUpload(st, a, updateTime, prev) {
    const f = fp(st);
    const fields = {
      data: { stringValue: backupFrom(st) },
      fp: { integerValue: String(f) },
      updatedAt: { timestampValue: new Date().toISOString() },
    };
    const mask = ['data', 'fp', 'updatedAt'];
    if (prev) {
      fields.prev = { arrayValue: { values: prev.map(p => ({ mapValue: { fields: { data: { stringValue: p.data }, at: { integerValue: String(p.at) } } } })) } };
      mask.push('prev');
    }
    const body = JSON.stringify({ fields });
    const pre = updateTime ? `currentDocument.updateTime=${encodeURIComponent(updateTime)}` : 'currentDocument.exists=false';
    const qs = mask.map(m => `updateMask.fieldPaths=${m}`).join('&') + '&' + pre;
    return { url: docUrl(a.uid) + '?' + qs, fp: f, size: body.length * 2,
      init: { method: 'PATCH', headers: { Authorization: `Bearer ${a.idToken}`, 'Content-Type': 'application/json' }, body } };
  }

  /* יומן סנכרון (לאבחון): 30 האירועים האחרונים */
  async function logSync(e) {
    const l = (await get('synclog')) || [];
    l.unshift({ at: Date.now(), ...e });
    await set('synclog', l.slice(0, 30));
  }

  /* סנכרון מלא: קריאה מהענן ← מיזוג ← כתיבה (אם צריך) ← עדכון המכשיר (אם צריך).
     מחזיר { result: 'same'|'pushed'|'pulled'|'merged', state? } – state = המצב המעודכן למכשיר אם השתנה */
  async function sync(attempt = 0) {
    const status = (await get('cloud')) || {};
    try {
      const raw = await get('state');
      if (!raw) return { result: 'same' };
      const local = JSON.parse(raw);
      const a = await auth();
      const remote = await getRemote(a);
      // מיזוג "האחרון גובר" + מחיקות רשומות: שום פריט לא נמחק בגלל שהוא חסר במקומי או בענן
      const merged = remote ? lww(local, remote.state) : local, guard = '';
      const mfp = fp(merged);
      let result = 'same', updateTime = remote && remote.updateTime;
      if (!remote || remote.fp !== mfp) {
        // הגרסה שבענן נשמרת בהיסטוריה לפני שדורסים אותה
        const prev = remote ? (size(remote.state) ? [{ data: remote.raw, at: remote.updatedAt || Date.now() }, ...remote.prev] : remote.prev) : [];
        let keep = prev.slice(0, PREV_KEEP);
        while (keep.length && keep.reduce((s, p) => s + p.data.length, 0) > 700000) keep = keep.slice(0, -1); // מגבלת גודל מסמך
        const u = buildUpload(merged, a, remote && remote.updateTime, keep);
        const r = await req(u.url, u.init);
        if ((r.status === 400 || r.status === 409 || r.status === 412) && attempt < 2) return sync(attempt + 1); // מכשיר אחר כתב בדיוק עכשיו
        if (!r.ok) throw new Error(r.status === 403 ? 'אין הרשאה' : `שגיאה ${r.status}`);
        updateTime = (await r.json()).updateTime;
        result = 'pushed';
      }
      await set('cloud', { fp: mfp, at: Date.now(), error: null, updateTime });
      await set('owner', a.uid);
      // אם בזמן הסנכרון נשמר במכשיר משהו חדש (עריכה תוך כדי בקשה) – ממזגים אותו, לא דורסים
      let out = merged, again = false;
      const latestRaw = await get('state');
      const latest = latestRaw && JSON.parse(latestRaw);
      if (latest && (latest.savedAt || 0) !== (local.savedAt || 0)) { out = lww(latest, merged); again = fp(out) !== mfp; }
      const changed = fp(out) !== fp(latest || local);
      await logSync({ result: changed ? (result === 'pushed' ? 'merged' : 'pulled') : result, local: size(local), remote: remote ? size(remote.state) : -1, merged: size(merged), guard: guard + (again ? ' +edits during sync' : '') });
      if (changed) {
        out.savedAt = Math.max(Date.now(), ((latest && latest.savedAt) || 0) + 1);
        await set('state', JSON.stringify(out)); // כדי שגם פתיחה הבאה (או ה-SW) יראו את המצב הממוזג
        return { result: result === 'pushed' ? 'merged' : 'pulled', state: out, again };
      }
      return { result, again };
    } catch (e) {
      await set('cloud', { ...status, error: errText(e), tried: Date.now() });
      await logSync({ result: 'error', error: errText(e) }).catch(() => {});
      throw e;
    }
  }
  const upload = () => sync();

  /* גרסאות קודמות שבענן: [{ at, state }] */
  async function history() {
    const a = await auth();
    const remote = await getRemote(a);
    if (!remote) return [];
    return [{ at: remote.updatedAt, state: remote.state, current: true },
      ...remote.prev.map(p => ({ at: p.at, state: JSON.parse(p.data).state }))];
  }

  /* הורדת הגיבוי מהענן: { text, updatedAt } או null אם אין */
  async function download() {
    const a = await auth();
    const remote = await getRemote(a);
    if (!remote) return null;
    return { text: JSON.stringify({ app: 'indienegev-2026', kind: 'backup', v: 1, createdAt: remote.updatedAt, state: remote.state }), updatedAt: remote.updatedAt };
  }

  return { on, cfg, get, set, del, fp, sync, upload, download, history, size, signInWithGoogleToken, auth, buildUpload, lww, stampEdits, replaceStamped, items, clean };
})();

/* Service Worker – האפליקציה נפתחת מהעותק השמור בטלפון, גם בלי קליטה.
   אסטרטגיה: מטמון קודם (פתיחה מיידית גם בקליטה חלשה). עדכון גרסה מגיע כ-SW חדש
   (הקובץ הזה משתנה בכל בנייה בגלל VERSION), שמחכה עד שהמשתמש מאשר רענון. */
const VERSION = 'db6ee32f851d';
const CACHE = 'indn26-' + VERSION;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('indn26-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // שרתי גוגל/Firebase וכו' – ישירות לרשת
  if (req.mode === 'navigate') {
    // כל ניווט באתר (כולל #קודים) מקבל את האפליקציה מהמטמון
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).catch(() => caches.match('./index.html'))));
});

/* Background Sync: גיבוי לענן שנרשם בלי קליטה רץ כאן כשהקליטה חוזרת – גם אם האפליקציה סגורה.
   שגיאה גורמת לדפדפן לנסות שוב מאוחר יותר. */
self.addEventListener('sync', e => {
  if (e.tag !== 'cloud-backup' || !CC.on) return;
  e.waitUntil(CC.upload().then(async res => {
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'cloud-synced', res }));
  }));
});
