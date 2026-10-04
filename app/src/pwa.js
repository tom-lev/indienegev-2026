/* עבודה עם ובלי קליטה: רישום Service Worker, התקנה למסך הבית, מחוון מצב,
   הודעת עדכון, ומעבר חד-פעמי מהקובץ המקומי לאתר (עם כל הנתונים) */

const SITE_URL = 'https://tom-lev.github.io/indienegev-2026/';
const IS_SITE = location.protocol === 'https:' || location.hostname === 'localhost';
const IS_FILE = location.protocol === 'file:';
let offlineReady = false;
let swWaiting = null;
let updateRequested = false; // רענון רק אחרי שהמשתמש אישר (לא בהתקנה הראשונה)

function initPwa() {
  window.addEventListener('online', () => { renderHeader(); });
  window.addEventListener('offline', () => { renderHeader(); });
  if (!IS_SITE || !('serviceWorker' in navigator)) return;

  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = 'manifest.webmanifest';
  document.head.append(link);

  navigator.serviceWorker.register('sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // בדיקת עדכון כשחוזרים לאפליקציה (אם יש קליטה)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) reg.update().catch(() => {}); });
  }).catch(e => console.warn('SW registration failed:', e && e.message));

  navigator.serviceWorker.ready.then(() => checkOfflineReady());
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    checkOfflineReady();
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });
}

async function checkOfflineReady() {
  try { offlineReady = !!(await caches.match('./index.html')); } catch (e) { offlineReady = false; }
  return offlineReady;
}

function showUpdate(worker) {
  swWaiting = worker;
  toast('יש גרסה חדשה של האפליקציה', { label: 'רענון', fn: () => { updateRequested = true; swWaiting.postMessage('SKIP_WAITING'); } });
}

/* תגית בכותרת כשאין רשת – כדי שיהיה ברור שהכל ממשיך לעבוד */
function netPill() {
  return navigator.onLine ? '' : '<span class="net-pill" role="status">📴 בלי קליטה · הכל עובד</span>';
}

/* ───────── מעבר מהקובץ המקומי לאתר ───────── */
function migrateBanner() {
  if (!IS_FILE) return '';
  return `<div class="banner migrate"><b>📲 עברנו לאפליקציה באתר</b><br>
    האתר עובד גם בלי קליטה ונשמר כאפליקציה במסך הבית. בלחיצה אחת כל הנתונים (לוז, פתקים, אוהל, חברים) עוברים אליו.
    <button class="btn sm block" data-migrate style="margin-top:8px">מעבר לאתר עם כל הנתונים</button></div>`;
}
function bindMigrate(root) {
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-migrate]')) return;
    const code = b64utf8(backupJSON()).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    markBackedUp('file');
    location.href = SITE_URL + '#BK=' + code;
  });
}
/* באתר: קליטת נתונים שהגיעו מהקובץ המקומי (#BK=...) */
async function importFromHash() {
  const h = location.hash;
  if (!h.startsWith('#BK=')) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    let b64 = h.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const o = parseBackup(unb64utf8(b64));
    if (!o) throw new Error();
    const msg = hasData()
      ? `להעביר לכאן את הנתונים מהקובץ המקומי?\n${backupSummary(o)}\n\nהנתונים שכבר באתר יישמרו כגרסה קודמת.`
      : `להעביר לכאן את הנתונים מהקובץ המקומי?\n${backupSummary(o)}`;
    if (!confirm(msg)) return true;
    // מיזוג (לא החלפה): מה שכבר באתר/בענן לא נמחק, ומה שהגיע מהקובץ מתווסף
    await takeSnapshot('לפני מעבר מהקובץ המקומי');
    const merged = CC.lww(S, o.state);
    Object.assign(S, merged, { prefs: { ...S.prefs, ...(o.state.prefs || {}), ...(merged.prefs && merged.prefs.tent ? { tent: merged.prefs.tent } : {}) } });
    save(); syncTent(); render();
    toast('כל הנתונים הועברו ✓');
  } catch (e) {
    toast('לא הצלחתי לקרוא את הנתונים שהועברו');
  }
  return true;
}
