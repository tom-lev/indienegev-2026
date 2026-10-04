/* גיבוי וסנכרון לענן – צד הדף.
   - חובה: בכניסה הראשונה מסך התחברות עם Google (בלי "לא עכשיו").
   - סנכרון אמיתי בין מכשירים: כל העלאה קוראת קודם את הענן וממזגת (CC.sync), ופתיחה/חזרה לאפליקציה מושכת עדכונים.
   - כשיש קליטה – מיד. בלי קליטה – Background Sync (אנדרואיד, גם כשהאפליקציה סגורה),
     ובעת יציאה מהאפליקציה – בקשת keepalive (כולל אייפון).
   - שורת מצב "גיבוי אחרון לענן" בכל המסכים. */

let cloudAuth = null;   // { uid, email, name } אם מחובר
let cloudState = {};    // { fp, at, error, tried, updateTime } – מתעדכן גם מה-Service Worker
let cloudReady = false; // נטען המצב מ-IndexedDB

async function loadCloud() {
  if (!CC.on) return;
  try {
    const a = await CC.get('auth');
    cloudAuth = a ? { uid: a.uid, email: a.email, name: a.name } : null;
    cloudState = (await CC.get('cloud')) || {};
  } catch (e) { /* אין IndexedDB */ }
  cloudReady = true;
  warmAuth();
}
const cloudBackedUp = () => !!cloudAuth && cloudState.fp === dataFingerprint();

/* החלת מצב שהגיע מהענן (מיזוג/משיכה) – בלי גרסה קודמת על כל סנכרון */
function applyCloudState(st) {
  // עדכון מהענן שמסיר נתונים (למשל מחיקה במכשיר אחר) – קודם שומרים גרסה קודמת במכשיר
  if (CC.size(st) < CC.size(S)) takeSnapshot('לפני עדכון מהענן');
  const keepBackup = S.backup;
  const d = defaults();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d, st, { prefs: { ...d.prefs, ...(st.prefs || {}) }, backup: keepBackup });
  setPersisted(S); // המצב מהענן כבר מכיל זמני עדכון – אינו עריכה חדשה
  save();
  syncTent();
  rerender();
}

/* ───────── תזמון ───────── */
let cloudTimer = null;
function scheduleCloud(delay = 3000) {
  if (!CC.on || !cloudAuth || cloudBackedUp()) return;
  if (!navigator.onLine) return registerCloudSync();
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudNow, delay);
}
function registerCloudSync() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.ready.then(r => r.sync && r.sync.register('cloud-backup')).catch(() => {});
}
let syncing = null;
async function cloudNow() {
  if (!CC.on || !cloudAuth) return false;
  if (!navigator.onLine) { registerCloudSync(); return false; }
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await freshen(); // עותק אחר של האפליקציה (לשונית/אפליקציה מותקנת) אולי שמר משהו חדש יותר
      const sent = CC.clean(S);
      await IDB.set('state', JSON.stringify(S)); // לסנכרן את המצב העדכני ביותר
      const res = await CC.sync();
      cloudState = (await CC.get('cloud')) || {};
      let again = res.again;
      if (res.state) {
        // עריכות שנעשו בזמן הבקשה (אחרי ששלחנו) נשמרות: מיזוג תלת-כיווני מול מה שנשלח
        // מיזוג עם מה שבמכשיר עכשיו (כולל עריכות שנעשו בזמן הבקשה)
        const st = CC.lww(S, res.state);
        if (CC.fp(st) !== CC.fp(res.state)) again = true;
        const before = CC.fp(S);
        applyCloudState(st);
        if ((res.result === 'pulled' || res.result === 'merged') && CC.fp(S) !== before) toast('עודכן מהענן ↻');
      } else if (CC.fp(S) !== CC.fp(sent)) again = true;
      if (again) setTimeout(() => scheduleCloud(800), 0);
      return true;
    } catch (e) {
      registerCloudSync();
      cloudState = (await CC.get('cloud')) || {};
      return false;
    } finally {
      syncing = null;
      refreshCloudUi();
    }
  })();
  return syncing;
}
/* משיכת עדכונים ממכשירים אחרים: בפתיחה ובחזרה לאפליקציה (לכל היותר פעם ב-20 שניות) */
let lastPull = 0;
function pullCloud() {
  if (!CC.on || !cloudAuth || !navigator.onLine || Date.now() - lastPull < 20000) return;
  lastPull = Date.now();
  cloudNow();
}
function refreshCloudUi() {
  renderHeader();
  if (tab === 'mine') rerender();
  for (const l of layers) if (l.panel && l.panel.isBackup && !l.panel.closed) l.panel.render();
  maybeShowWelcome();
}
window.addEventListener('online', () => { lastPull = 0; pullCloud(); });

/* ───────── גיבוי ברגע היציאה מהאפליקציה (keepalive) ─────────
   אין זמן לקרוא ולמזג – לכן כותבים רק אם הענן לא השתנה מאז הסנכרון האחרון (precondition);
   אם מכשיר אחר כתב בינתיים, הכתיבה נדחית והמיזוג יקרה בסנכרון הבא. */
let authCache = null;
async function warmAuth() {
  if (!CC.on || !cloudAuth || !navigator.onLine) return;
  try { authCache = await CC.auth(); } catch (e) { /* */ }
}
setInterval(() => { if (!document.hidden) warmAuth(); }, 20 * MIN);
let flushedFp = null;
function flushOnHide() {
  if (!CC.on || !cloudAuth || !navigator.onLine || cloudBackedUp() || !cloudState.updateTime) return registerCloudSync();
  if (!hasData()) return; // לעולם לא שולחים מצב ריק בלי מיזוג
  try { // עותק ישן של האפליקציה לא שולח מצב שלשונית אחרת כבר עדכנה
    const ls = JSON.parse(localStorage.getItem(KEY));
    if (ls && (ls.savedAt || 0) > (S.savedAt || 0)) return registerCloudSync();
  } catch (e) { /* */ }
  const a = authCache;
  if (!a || a.exp < Date.now() + 30000) return registerCloudSync();
  const st = CC.clean(S);
  const u = CC.buildUpload(st, a, cloudState.updateTime); // בלי prev: ה-updateMask שומר את ההיסטוריה שבענן
  if (u.fp === flushedFp) return;
  if (u.size > 60000) return registerCloudSync(); // מגבלת keepalive (64KB)
  flushedFp = u.fp;
  clearTimeout(cloudTimer);
  fetch(u.url, { ...u.init, keepalive: true }).then(async r => {
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    cloudState = { fp: u.fp, at: Date.now(), error: null, updateTime: j.updateTime, edit: S.editedAt || 0 };
    await CC.set('cloud', cloudState);
  }).catch(() => { flushedFp = null; });
  registerCloudSync();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushOnHide();
  else { flushedFp = null; warmAuth(); pullCloud(); }
});
window.addEventListener('pagehide', flushOnHide);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async e => {
    if (!e.data || e.data.type !== 'cloud-synced') return;
    cloudState = (await CC.get('cloud')) || {};
    const raw = await IDB.get('state').catch(() => null);
    if (raw) { const m = JSON.parse(raw); if (CC.fp(m) !== dataFingerprint()) applyCloudState(m); }
    refreshCloudUi();
  });
}

/* ───────── כניסה עם Google ───────── */
let gisLoaded = null;
function loadGis() {
  return gisLoaded || (gisLoaded = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = res;
    s.onerror = () => { gisLoaded = null; rej(new Error('אין חיבור לגוגל')); };
    document.head.append(s);
  }));
}
/* באייפון/אייפד (ספארי וכל דפדפן אחר שם) חלון ההתחברות הקופץ של Google חוזר בלי תשובה (חסימת עוגיות של ספארי).
   לכן שם עוברים לדף של Google וחוזרים לאתר עם האישור בכתובת (#id_token=...). בשאר המכשירים – הכפתור הרגיל + קישור גיבוי לאותה דרך. */
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const GKEY = 'indienegev-gsignin';
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
async function googleRedirect() {
  if (!navigator.onLine) { toast('צריך קליטה בשביל ההתחברות'); return; }
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16))), state = hex(crypto.getRandomValues(new Uint8Array(16)));
  try { localStorage.setItem(GKEY, JSON.stringify({ nonce, state, at: Date.now() })); } catch (e) { /* */ }
  const p = new URLSearchParams({
    client_id: CC.cfg.googleClientId, redirect_uri: location.origin + location.pathname,
    response_type: 'id_token', scope: 'openid email profile', prompt: 'select_account', state,
    nonce: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))),
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}
/* חזרה מדף ההתחברות של Google. מחזיר true אם הכתובת הייתה חזרה כזו */
async function finishGoogleRedirect() {
  const h = location.hash;
  if (!/^#(.*&)?(id_token|error)=/.test(h)) return false;
  history.replaceState(null, '', location.pathname + location.search);
  const q = new URLSearchParams(h.slice(1));
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(GKEY)); localStorage.removeItem(GKEY); } catch (e) { /* */ }
  if (q.get('error')) { if (q.get('error') !== 'access_denied') toast(`הכניסה לא הושלמה (${q.get('error')})`); return true; }
  if (!saved || saved.state !== q.get('state')) { toast('הכניסה לא הושלמה – נסו שוב'); return true; }
  await onGoogleCredential({ credential: q.get('id_token') }, saved.nonce);
  return true;
}
function redirectButton(el) {
  el.innerHTML = `<button type="button" class="g-redirect"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg><span>המשך עם Google</span></button>`;
  el.querySelector('button').onclick = googleRedirect;
}
async function renderGoogleButton(el) {
  if (!navigator.onLine) { el.innerHTML = '<p class="g-note">צריך קליטה בשביל ההתחברות (פעם אחת).</p>'; return; }
  if (isIOS()) { redirectButton(el); return; }
  try {
    await loadGis();
    google.accounts.id.initialize({ client_id: CC.cfg.googleClientId, callback: onGoogleCredential, auto_select: false, use_fedcm_for_prompt: true });
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', locale: 'he', width: Math.min(320, el.clientWidth || 300) });
    const alt = document.createElement('button');
    alt.type = 'button'; alt.className = 'g-alt'; alt.textContent = 'הכפתור לא עובד? כניסה דרך דף של Google';
    alt.onclick = googleRedirect;
    el.after(alt);
  } catch (e) {
    redirectButton(el); // הספרייה של Google לא נטענה – הדרך החלופית לא צריכה אותה
  }
}
let signingIn = false;
async function onGoogleCredential(resp, nonce) {
  if (signingIn) return;
  signingIn = true;
  try {
    toast('מתחבר…');
    const a = await CC.signInWithGoogleToken(resp.credential, nonce);
    cloudAuth = { uid: a.uid, email: a.email, name: a.name };
    authCache = a;
    await afterSignIn(a);
  } catch (e) {
    toast(e.message);
  } finally {
    signingIn = false;
  }
}
/* אחרי כניסה:
   - המכשיר שייך לחשבון אחר (מכשיר משותף) → הנתונים של הקודם נשמרים כגרסה קודמת במכשיר, ולא עולים לחשבון החדש.
   - אחרת → מיזוג בין מה שבמכשיר למה שבענן (בלי לאבד כלום משני הצדדים). */
async function afterSignIn(a) {
  const owner = await CC.get('owner');
  if (owner && owner !== a.uid) {
    if (hasData()) await takeSnapshot('נתוני החשבון הקודם');
    const keepPrefs = { view: S.prefs.view, filter: S.prefs.filter };
    const d = defaults();
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, d, { prefs: { ...d.prefs, ...keepPrefs }, backup: {} });
    save(); syncTent();
    await CC.del('cloud');
  } else if (!owner) {
    if (hasData()) await takeSnapshot('לפני סנכרון ראשון');
  }
  cloudState = (await CC.get('cloud')) || {};
  lastPull = Date.now();
  const ok = await cloudNow();
  // שם ברירת מחדל מגוגל – רק אם גם אחרי הסנכרון אין שם (לא דורסים שם שנבחר)
  if (!S.name && a.name) { S.name = a.name.split(' ')[0]; save(); }
  closeWelcome();
  render();
  toast(ok ? `מחובר כ-${a.name || a.email} · הגיבוי והסנכרון פעילים ✓` : `מחובר כ-${a.name || a.email} · הגיבוי יתבצע כשתהיה קליטה`);
}
async function cloudSignOut() {
  if (!confirm('להתנתק מהחשבון? הנתונים נשארים בטלפון ובענן. בלי חשבון אין גיבוי – תתבקש להתחבר שוב.')) return;
  await CC.del('auth'); // הבסיס והבעלות נשמרים: התחברות חוזרת לאותו חשבון ממזגת נכון
  cloudAuth = null; authCache = null;
  try { google.accounts.id.disableAutoSelect(); } catch (e) { /* */ }
  refreshCloudUi();
}
/* ───────── מסך פתיחה: התחברות חובה ───────── */
let welcomeEl = null;
function maybeShowWelcome() {
  if (!CC.on || !cloudReady || cloudAuth || welcomeEl) return;
  welcomeEl = document.createElement('section');
  welcomeEl.className = 'welcome';
  welcomeEl.setAttribute('role', 'dialog');
  welcomeEl.innerHTML = `<div class="w-card">
    <img src="${ASSETS.wordmark}" alt="inDnegev" class="w-logo">
    <h2>הלוז שלי · אינדינגב 2026</h2>
    <p>התחברות אחת עם Google. מאז הכל נשמר ומגובה לבד: הלוז, הפתקים, האוהל והחברים – ומסונכרן בין הטלפונים שלך. בטלפון חדש מתחברים והכל חוזר.</p>
    <div class="gbtn" id="wgbtn"></div>
    <p class="w-small">נשמרים רק השם והאימייל לזיהוי. כל משתמש רואה רק את הנתונים שלו.</p>
    <button class="w-later hidden" data-wlater>אין קליטה עכשיו – להמשיך בינתיים</button>
  </div>`;
  document.body.append(welcomeEl);
  const btn = $('#wgbtn', welcomeEl);
  renderGoogleButton(btn).then(() => {
    // בלי קליטה אי אפשר להתחבר – מאפשרים להמשיך, והמסך יחזור כשתהיה קליטה
    if (!navigator.onLine || !btn.querySelector('iframe, div[role=button], button')) $('[data-wlater]', welcomeEl).classList.remove('hidden');
  });
  welcomeEl.querySelector('[data-wlater]').onclick = () => {
    closeWelcome();
    const again = () => { window.removeEventListener('online', again); setTimeout(maybeShowWelcome, 1500); };
    window.addEventListener('online', again);
  };
}
function closeWelcome() {
  if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; }
}

/* ───────── שורת מצב (בכל המסכים) ───────── */
function cloudStatus() {
  if (!CC.on) return '';
  let icon, text, cls = '';
  if (!cloudAuth) {
    icon = '⚠️'; cls = 'warn'; text = 'אין גיבוי – צריך להתחבר';
  } else {
    const s = cloudState;
    if (s.error && /להתחבר/.test(s.error)) { icon = '⚠️'; cls = 'warn'; text = 'צריך להתחבר מחדש כדי להמשיך לגבות'; }
    else if (s.error && !cloudBackedUp()) { icon = '⚠️'; cls = 'warn'; text = `לא גובה${s.at ? ` מאז ${agoText(s.at)}` : ''} · ${s.error}`; }
    else if (s.at) {
      icon = cloudBackedUp() ? '✅' : '☁️';
      text = cloudBackedUp() ? `גיבוי אחרון לענן: ${agoText(s.at)}` : `גיבוי אחרון: ${agoText(s.at)} · יש שינויים שיגובו כשתהיה קליטה`;
    } else { icon = '☁️'; text = 'הגיבוי יתבצע כשתהיה קליטה'; }
  }
  return `<button class="cloud-status ${cls}" data-cloudpanel>${icon} ${esc(text)}</button>`;
}

/* קטע הענן במסך "גיבוי ושחזור" */
function cloudPanelSection() {
  if (!CC.on) return '';
  if (!cloudAuth) {
    return `<div class="card-box"><h3>☁️ גיבוי וסנכרון</h3>
      <p>צריך להתחבר עם Google כדי שהנתונים יגובו ויסונכרנו בין הטלפונים.</p>
      <div id="gbtn" class="gbtn"></div></div>`;
  }
  const s = cloudState;
  return `<div class="card-box"><h3>☁️ גיבוי וסנכרון</h3>
    <p>מחובר כ-<b>${esc(cloudAuth.name || '')}</b> <span dir="ltr">${esc(cloudAuth.email || '')}</span></p>
    <ul class="bk-status">
      <li>${cloudBackedUp() ? '✅ מגובה ומסונכרן' : '⏳ יש שינויים שיגובו כשתהיה קליטה'}</li>
      <li>גיבוי אחרון: ${s.at ? agoText(s.at) : 'עוד לא'}</li>
      ${s.error ? `<li class="warn-t">ניסיון אחרון נכשל: ${esc(s.error)}</li>` : ''}
    </ul>
    <button class="btn block" data-b="cloud-now" style="margin-top:8px">סנכרון עכשיו</button>
    <button class="btn alt block" data-b="cloud-hist" style="margin-top:8px">גרסאות קודמות בענן</button>
    <div id="cloudHist"></div>
    ${s.error && /להתחבר/.test(s.error) ? '<p style="margin:10px 0 6px">צריך להתחבר מחדש:</p><div id="gbtn" class="gbtn"></div>' : ''}
    <button class="btn alt sm" data-b="cloud-out" style="margin-top:10px">התנתקות / החלפת חשבון</button></div>`;
}
