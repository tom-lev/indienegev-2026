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
    const s = canon([st.picks || {}, [...(st.notes || [])].sort((a, b) => (a.id > b.id ? 1 : -1)), st.ratings || {},
      (st.friends || []).map(f => [f.name, f.picks]).sort(), (st.prefs && st.prefs.tent) || null, st.name || '']);
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

  /* ───────── מיזוג תלת-כיווני (בסיס = המצב שסונכרן לאחרונה) ─────────
     לכל פריט: מי ששינה אותו מאז הבסיס – גובר. שניהם שינו → הגרסה החדשה יותר (או המקומית).
     מחיקה מכובדת רק אם הצד השני לא שינה את הפריט בינתיים – כך לא מאבדים נתונים. */
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const stamp = v => (v && (v.edited || v.at || v.importedAt)) || 0;
  function m3map(b = {}, l = {}, r = {}) {
    const out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
      const bv = b[k], lv = l[k], rv = r[k];
      let v;
      if (eq(lv, bv)) v = rv;
      else if (eq(rv, bv)) v = lv;
      else if (lv === undefined) v = rv;              // נמחק כאן, שונה שם → שומרים
      else if (rv === undefined) v = lv;
      else v = stamp(rv) > stamp(lv) ? rv : lv;        // שניהם שינו
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  const m3val = (b, l, r) => eq(l, b) ? r : l;
  const byKey = (arr, key) => Object.fromEntries((arr || []).map(x => [x[key], x]));
  function merge3(base, local, remote) {
    base = base || {};
    const lp = local.prefs || {}, rp = remote.prefs || {}, bp = base.prefs || {};
    const notes = Object.values(m3map(byKey(base.notes, 'id'), byKey(local.notes, 'id'), byKey(remote.notes, 'id'))).sort((a, b) => a.at - b.at);
    const friends = Object.values(m3map(byKey(base.friends, 'name'), byKey(local.friends, 'name'), byKey(remote.friends, 'name')));
    const tent = m3val(bp.tent, lp.tent, rp.tent);
    const prefs = { ...lp };
    if (tent) prefs.tent = tent; else delete prefs.tent;
    return {
      ...local,
      name: m3val(base.name, local.name, remote.name) || local.name || remote.name || '',
      picks: m3map(base.picks, local.picks, remote.picks),
      ratings: m3map(base.ratings, local.ratings, remote.ratings),
      notes, friends, prefs,
    };
  }
  const clean = st => { const c = JSON.parse(JSON.stringify(st)); delete c.backup; return c; };

  /* מצב הענן: { state, fp, updateTime } או null */
  async function getRemote(a) {
    const r = await req(docUrl(a.uid), { headers: { Authorization: `Bearer ${a.idToken}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(r.status === 403 ? 'אין הרשאה' : `שגיאה ${r.status}`);
    const j = await r.json();
    return { state: JSON.parse(j.fields.data.stringValue).state, fp: +j.fields.fp.integerValue, updateTime: j.updateTime,
      updatedAt: Date.parse(j.fields.updatedAt && j.fields.updatedAt.timestampValue) || 0 };
  }

  /* בקשת כתיבה. precondition: כותבים רק אם הענן לא השתנה מאז שקראנו אותו (אחרת מכשיר אחר כתב בינתיים) */
  function buildUpload(st, a, updateTime) {
    const f = fp(st);
    const body = JSON.stringify({ fields: {
      data: { stringValue: backupFrom(st) },
      fp: { integerValue: String(f) },
      updatedAt: { timestampValue: new Date().toISOString() },
    } });
    const pre = updateTime ? `?currentDocument.updateTime=${encodeURIComponent(updateTime)}` : '?currentDocument.exists=false';
    return { url: docUrl(a.uid) + pre, fp: f, size: body.length * 2,
      init: { method: 'PATCH', headers: { Authorization: `Bearer ${a.idToken}`, 'Content-Type': 'application/json' }, body } };
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
      let base = await get('base');
      let merged = local;
      if (remote && remote.fp !== fp(local)) {
        // הענן לא השתנה מאז הסנכרון האחרון → המקומי פשוט חדש יותר. אחרת – ממזגים.
        merged = (base && remote.fp === status.fp) ? local : merge3(base, local, remote.state);
      }
      const mfp = fp(merged);
      let result = 'same', updateTime = remote && remote.updateTime;
      if (!remote || remote.fp !== mfp) {
        const u = buildUpload(merged, a, remote && remote.updateTime);
        const r = await req(u.url, u.init);
        if ((r.status === 400 || r.status === 409 || r.status === 412) && attempt < 2) return sync(attempt + 1); // מכשיר אחר כתב בדיוק עכשיו
        if (!r.ok) throw new Error(r.status === 403 ? 'אין הרשאה' : `שגיאה ${r.status}`);
        updateTime = (await r.json()).updateTime;
        result = 'pushed';
      }
      await set('base', clean(merged));
      await set('cloud', { fp: mfp, at: Date.now(), error: null, updateTime });
      await set('owner', a.uid);
      if (mfp !== fp(local)) {
        merged.savedAt = Date.now();
        await set('state', JSON.stringify(merged)); // כדי שגם פתיחה הבאה (או ה-SW) יראו את המצב הממוזג
        return { result: result === 'pushed' ? 'merged' : 'pulled', state: merged };
      }
      return { result };
    } catch (e) {
      await set('cloud', { ...status, error: errText(e), tried: Date.now() });
      throw e;
    }
  }
  const upload = () => sync();

  /* הורדת הגיבוי מהענן: { text, updatedAt } או null אם אין */
  async function download() {
    const a = await auth();
    const remote = await getRemote(a);
    if (!remote) return null;
    return { text: JSON.stringify({ app: 'indienegev-2026', kind: 'backup', v: 1, createdAt: remote.updatedAt, state: remote.state }), updatedAt: remote.updatedAt };
  }

  return { on, cfg, get, set, del, fp, sync, upload, download, signInWithGoogleToken, auth, buildUpload, merge3, clean };
})();

/* Service Worker – האפליקציה נפתחת מהעותק השמור בטלפון, גם בלי קליטה.
   אסטרטגיה: מטמון קודם (פתיחה מיידית גם בקליטה חלשה). עדכון גרסה מגיע כ-SW חדש
   (הקובץ הזה משתנה בכל בנייה בגלל VERSION), שמחכה עד שהמשתמש מאשר רענון. */
const VERSION = '46bce8f0da57';
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
