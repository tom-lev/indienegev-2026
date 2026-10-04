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
  function fp(st) {
    const s = JSON.stringify([st.picks, st.notes, st.ratings, (st.friends || []).map(f => [f.name, f.picks]),
      (st.prefs && st.prefs.tent) || null, st.name]);
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
    await del('cloud'); // משתמש חדש – מצב הגיבוי מתאפס
    return a;
  }

  const docUrl = uid => `${ep.fs}/backups/${uid}`;

  /* בקשת ההעלאה עצמה (משותפת להעלאה רגילה ולשליחה ברגע היציאה מהאפליקציה) */
  function buildUpload(st, a) {
    const f = fp(st);
    const body = JSON.stringify({ fields: {
      data: { stringValue: backupFrom(st) },
      fp: { integerValue: String(f) },
      updatedAt: { timestampValue: new Date().toISOString() },
    } });
    return { url: docUrl(a.uid), fp: f, size: body.length * 2,
      init: { method: 'PATCH', headers: { Authorization: `Bearer ${a.idToken}`, 'Content-Type': 'application/json' }, body } };
  }

  /* העלאת המצב האחרון (מהעותק ב-IndexedDB). מחזיר 'ok' / 'same' / 'empty' */
  async function upload() {
    const raw = await get('state');
    if (!raw) return 'empty';
    const st = JSON.parse(raw);
    const f = fp(st);
    const status = (await get('cloud')) || {};
    if (status.fp === f) return 'same';
    const a = await auth();
    const u = buildUpload(st, a);
    try {
      const r = await req(u.url, u.init);
      if (!r.ok) throw new Error(r.status === 403 ? 'אין הרשאה (חוקי האבטחה ב-Firebase)' : `שגיאה ${r.status}`);
      await set('cloud', { fp: f, at: Date.now(), error: null });
      return 'ok';
    } catch (e) {
      await set('cloud', { ...status, error: e.name === 'AbortError' ? 'הקליטה חלשה מדי' : e.message, tried: Date.now() });
      throw e;
    }
  }

  /* הורדת הגיבוי מהענן: { text, updatedAt } או null אם אין */
  async function download() {
    const a = await auth();
    const r = await req(docUrl(a.uid), { headers: { Authorization: `Bearer ${a.idToken}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`שגיאה ${r.status}`);
    const j = await r.json();
    return { text: j.fields.data.stringValue, updatedAt: Date.parse(j.fields.updatedAt && j.fields.updatedAt.timestampValue) || 0 };
  }

  return { on, cfg, get, set, del, fp, upload, download, signInWithGoogleToken, auth, buildUpload };
})();

/* Service Worker – האפליקציה נפתחת מהעותק השמור בטלפון, גם בלי קליטה.
   אסטרטגיה: מטמון קודם (פתיחה מיידית גם בקליטה חלשה). עדכון גרסה מגיע כ-SW חדש
   (הקובץ הזה משתנה בכל בנייה בגלל VERSION), שמחכה עד שהמשתמש מאשר רענון. */
const VERSION = '1c995d579e70';
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
