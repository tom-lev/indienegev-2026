/* Service Worker – האפליקציה נפתחת מהעותק השמור בטלפון, גם בלי קליטה.
   אסטרטגיה: מטמון קודם (פתיחה מיידית גם בקליטה חלשה). עדכון גרסה מגיע כ-SW חדש
   (הקובץ הזה משתנה בכל בנייה בגלל VERSION), שמחכה עד שהמשתמש מאשר רענון. */
const VERSION = '__VERSION__';
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
  if (url.origin !== location.origin) return; // גיטהאב API וכו' – ישירות לרשת
  if (req.mode === 'navigate') {
    // כל ניווט באתר (כולל #קודים) מקבל את האפליקציה מהמטמון
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).catch(() => caches.match('./index.html'))));
});
