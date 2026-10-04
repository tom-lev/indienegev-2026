/* גיבוי אוטומטי לענן – צד הדף: כניסה עם Google, תזמון גיבוי, מצב ושחזור.
   כשיש קליטה – מעלים מיד. בנוסף נרשם Background Sync, כך שאם אין קליטה
   הדפדפן יריץ את הגיבוי ב-Service Worker ברגע שהקליטה חוזרת, גם אם האפליקציה סגורה. */

let cloudAuth = null;   // { uid, email, name } אם מחובר
let cloudState = {};    // { fp, at, error, tried } – מתעדכן גם מה-Service Worker

async function loadCloud() {
  if (!CC.on) return;
  try {
    const a = await CC.get('auth');
    cloudAuth = a ? { uid: a.uid, email: a.email, name: a.name } : null;
    cloudState = (await CC.get('cloud')) || {};
  } catch (e) { /* אין IndexedDB */ }
}
const cloudBackedUp = () => !!cloudAuth && cloudState.fp === dataFingerprint();

/* נקרא אחרי כל שמירה (מ-mirrorSave, אחרי שהעותק ב-IndexedDB עודכן) */
let cloudTimer = null;
function scheduleCloud(delay = 3000) {
  if (!CC.on || !cloudAuth || cloudBackedUp()) return;
  if (!navigator.onLine) return registerCloudSync(); // אין קליטה – הדפדפן יריץ ברקע כשתחזור
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudNow, delay);
}
/* Background Sync: הדפדפן יריץ את הגיבוי ב-Service Worker כשתהיה קליטה, גם אם האפליקציה סגורה */
function registerCloudSync() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.ready.then(r => r.sync && r.sync.register('cloud-backup')).catch(() => {});
}
async function cloudNow() {
  if (!CC.on || !cloudAuth) return false;
  if (!navigator.onLine) { registerCloudSync(); return false; }
  try {
    await CC.upload();
    cloudState = (await CC.get('cloud')) || {};
    refreshCloudUi();
    return true;
  } catch (e) {
    registerCloudSync(); // נכשל (קליטה חלשה) – ננסה שוב ברקע
    cloudState = (await CC.get('cloud')) || {};
    refreshCloudUi();
    return false;
  }
}
function refreshCloudUi() {
  if (tab === 'mine') rerender();
  for (const l of layers) if (l.panel && l.panel.isBackup && !l.panel.closed) l.panel.render();
}
window.addEventListener('online', () => scheduleCloud(1000));
/* הודעה מה-Service Worker שגיבוי ברקע הצליח */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async e => {
    if (e.data && e.data.type === 'cloud-synced') { cloudState = (await CC.get('cloud')) || {}; refreshCloudUi(); }
  });
}

/* ───────── כניסה עם Google (Google Identity Services) ───────── */
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
/* מציג את כפתור "המשך עם Google" בתוך el */
async function renderGoogleButton(el) {
  if (!navigator.onLine) { el.innerHTML = '<p style="margin:0">צריך קליטה בשביל ההתחברות (פעם אחת).</p>'; return; }
  try {
    await loadGis();
    google.accounts.id.initialize({ client_id: CC.cfg.googleClientId, callback: onGoogleCredential, auto_select: false, use_fedcm_for_prompt: true });
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', locale: 'he', width: Math.min(320, el.clientWidth || 300) });
  } catch (e) {
    el.innerHTML = `<p style="margin:0">לא הצלחתי לטעון את ההתחברות: ${esc(e.message)}</p>`;
  }
}
async function onGoogleCredential(resp) {
  try {
    toast('מתחבר…');
    const a = await CC.signInWithGoogleToken(resp.credential);
    cloudAuth = { uid: a.uid, email: a.email, name: a.name };
    cloudState = {};
    if (!S.name && a.name) { S.name = a.name.split(' ')[0]; save(); }
    await afterSignIn();
  } catch (e) {
    toast(e.message);
  }
}
/* אחרי כניסה: אם יש גיבוי בענן – מציעים לשחזר (בטלפון חדש זה כל השחזור) */
async function afterSignIn() {
  let remote = null;
  try { remote = await CC.download(); } catch (e) { /* */ }
  const o = remote && parseBackup(remote.text);
  if (o) {
    const same = CC.fp(o.state) === dataFingerprint();
    if (!same && (!hasData() || confirm(`נמצא גיבוי בענן מ-${fmtStamp(remote.updatedAt || o.createdAt)}:\n${backupSummary(o)}\n\nלשחזר אותו? (הנתונים שבטלפון יישמרו כגרסה קודמת)\nביטול = לשמור את מה שבטלפון ולגבות אותו לענן.`))) {
      await applyState(o.state, 'לפני שחזור מהענן');
      await CC.set('cloud', { fp: CC.fp(o.state), at: Date.now(), error: null });
      cloudState = await CC.get('cloud');
      toast('הנתונים שוחזרו מהענן ✓');
      refreshCloudUi();
      return;
    }
  }
  toast(`מחובר כ-${cloudAuth.name || cloudAuth.email} · הגיבוי האוטומטי פעיל ✓`);
  await IDB.set('state', JSON.stringify(S)).catch(() => {});
  await cloudNow();
  refreshCloudUi();
}
async function cloudSignOut() {
  if (!confirm('להתנתק? הגיבוי האוטומטי ייעצר. הגיבוי שכבר בענן נשאר.')) return;
  await CC.del('auth');
  await CC.del('cloud');
  cloudAuth = null; cloudState = {};
  try { google.accounts.id.disableAutoSelect(); } catch (e) { /* */ }
  refreshCloudUi();
}
async function cloudRestore() {
  try {
    toast('מוריד…');
    const remote = await CC.download();
    const o = remote && parseBackup(remote.text);
    if (!o) return toast('עוד אין גיבוי בענן');
    if (!confirm(`לשחזר את הגיבוי מהענן (${fmtStamp(remote.updatedAt || o.createdAt)})?\n${backupSummary(o)}\n\nהמצב הנוכחי יישמר כגרסה קודמת.`)) return;
    await applyState(o.state, 'לפני שחזור מהענן');
    toast('שוחזר מהענן ✓');
  } catch (e) {
    toast(`השחזור נכשל: ${e.name === 'AbortError' ? 'הקליטה חלשה מדי' : e.message}`);
  }
}

/* ───────── שורת מצב + הצעה להפעלה ───────── */
function cloudStatus() {
  if (!CC.on) return '';
  if (!cloudAuth) {
    if (S.prefs.cloudDismissed) return `<button class="cloud-status off" data-bk="panel">☁️ אין גיבוי אוטומטי לענן · להפעלה</button>`;
    return `<div class="banner cloud-offer"><b>☁️ להפעיל גיבוי אוטומטי?</b><br>
      התחברות אחת עם Google, ומאז כל השינויים מגובים לבד כשיש קליטה. בטלפון חדש – מתחברים והכל חוזר.
      <div class="btn-row" style="margin-top:8px"><button class="btn sm" data-bk="panel">הפעלה</button>
      <button class="btn alt sm" data-bk="dismiss">לא עכשיו</button></div></div>`;
  }
  let icon, text, cls = '';
  const s = cloudState;
  if (s.error && !cloudBackedUp()) {
    icon = '⚠️'; cls = 'warn';
    text = `גיבוי לענן ${s.at ? `אחרון ${agoText(s.at)}` : 'עוד לא הצליח'} · ${s.error}`;
  } else if (s.at) {
    icon = cloudBackedUp() ? '✅' : '☁️';
    text = `גיבוי אחרון לענן: ${agoText(s.at)}${cloudBackedUp() ? '' : ' · שינויים חדשים יגובו כשתהיה קליטה'}`;
  } else {
    icon = '☁️'; text = 'גיבוי לענן: יתבצע כשתהיה קליטה';
  }
  return `<button class="cloud-status ${cls}" data-bk="panel">${icon} ${esc(text)}</button>`;
}

/* קטע הענן במסך "גיבוי ושחזור" */
function cloudPanelSection() {
  if (!CC.on) {
    return `<div class="card-box"><h3>☁️ גיבוי אוטומטי לענן</h3>
      <p style="margin:0">עוד לא הוגדר באפליקציה הזו.</p></div>`;
  }
  if (!cloudAuth) {
    return `<div class="card-box"><h3>☁️ גיבוי אוטומטי לענן</h3>
      <p>התחברות אחת עם Google. מאז כל שינוי מגובה לבד כשיש קליטה – גם כשהאפליקציה סגורה (ב-Chrome). בטלפון חדש: מתחברים והכל חוזר.</p>
      <div id="gbtn" class="gbtn"></div>
      <p style="margin:8px 0 0;font-size:12.5px">נשמר רק השם והאימייל לזיהוי. כל משתמש רואה רק את הגיבוי שלו.</p></div>`;
  }
  const s = cloudState;
  return `<div class="card-box"><h3>☁️ גיבוי אוטומטי לענן</h3>
    <p>מחובר כ-<b>${esc(cloudAuth.name || '')}</b> <span dir="ltr">${esc(cloudAuth.email || '')}</span></p>
    <ul class="bk-status">
      <li>${cloudBackedUp() ? '✅ מגובה' : '⏳ יש שינויים שיגובו כשתהיה קליטה'}</li>
      <li>גיבוי אחרון: ${s.at ? agoText(s.at) : 'עוד לא'}</li>
      ${s.error ? `<li class="warn-t">ניסיון אחרון נכשל: ${esc(s.error)}</li>` : ''}
    </ul>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn alt" data-b="cloud-restore">שחזור מהענן</button>
      <button class="btn alt" data-b="cloud-out">התנתקות</button>
    </div></div>`;
}
