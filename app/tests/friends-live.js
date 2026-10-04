/* לוז חי של חברים + לשונית נפרדת לכל חבר ב"הלוז שלי". מריצים מול השרת המדומה (כמו suite.js). */
const puppeteer = require('puppeteer-core');
const APP = 'http://localhost:8765/';
const FB = 'http://localhost:8766';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? '✅' : '❌'} ${name}${d !== '' ? ' — ' + d : ''}`); };
const ctl = c => fetch(FB + '/ctl', { method: 'POST', body: JSON.stringify(c) }).then(r => r.json());
const srv = () => fetch(FB + '/state', { method: 'POST' }).then(r => r.json());

async function device(label) {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'C:/Users/tomer/AppData/Local/Temp/claude/fl' + label + (Date.now() % 100000) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'load' });
  await sleep(1200);
  return { browser, page, errors, ev: (fn, ...a) => page.evaluate(fn, ...a) };
}

(async () => {
  await ctl({ reset: true });
  const A = await device('A'), B = await device('B');
  await A.ev(() => onGoogleCredential({ credential: 'user:alice' })); await sleep(2000);
  await B.ev(() => onGoogleCredential({ credential: 'user:bob' })); await sleep(2000);

  // אליס בוחרת הופעות ומגבה → הלוז החי מתפרסם
  await A.ev(() => { S.name = 'אליס'; S.picks = { [BY_START[0].id]: 2, [BY_START[5].id]: 1 }; save(); cloudNow(); });
  await sleep(2500);
  let s = await srv();
  check('הלוז החי פורסם בענן', s.log.includes('share write uid-alice'));

  // הקוד כולל את מזהה הלוז החי, וגרסה ישנה עדיין מפענחת אותו
  const code = await A.ev(() => encodeShare(S.name, S.picks, cloudAuth.uid));
  check('הקוד כולל מזהה', /\.uid-alice$/.test(code), code.slice(-20));
  const dec = await B.ev(c => decodeShare(c), code);
  check('פענוח: שם, הופעות ומקור', dec.name === 'אליס' && Object.keys(dec.picks).length === 2 && dec.src === 'uid-alice');
  const oldDec = await B.ev(c => { const m = c.match(/INDN1\.([A-Za-z0-9_-]{4,})/); return m[0]; }, code);
  check('קוד ישן (בלי מזהה) עדיין עובד', await B.ev(c => { const d = decodeShare(c); return d && !d.src && Object.keys(d.picks).length === 2; }, oldDec));

  // בוב מוסיף את אליס כחבר
  await B.ev(() => { S.picks = { [BY_START[1].id]: 2, [BY_START[5].id]: 2 }; save(); });
  await B.ev(c => upsertFriend(decodeShare(c)), code); await sleep(800);
  const fr = await B.ev(() => S.friends.map(f => ({ name: f.name, src: f.src, n: Object.keys(f.picks).length })));
  check('החבר נשמר עם מקור חי', fr.length === 1 && fr[0].src === 'uid-alice' && fr[0].n === 2, JSON.stringify(fr));

  // לשוניות ב"הלוז שלי"
  await B.ev(() => { setTab('mine'); viewDay = BY_START[0].day; S.prefs.showMaybe = true; render(); });
  await sleep(300);
  const tabs = await B.ev(() => [...document.querySelectorAll('.who-tabs [data-who]')].map(b => b.textContent.trim()));
  check('יש לשוניות: שלי + אליס', tabs.length === 2 && /שלי/.test(tabs[0]) && /אליס/.test(tabs[1]), tabs.join(' | '));
  const meRows = await B.ev(() => ({ ids: [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev), avs: document.querySelectorAll('#mscroll .avs').length }));
  check('בלשונית שלי – רק ההופעות שלי, בלי אווטארים של חברים', meRows.avs === 0 && !meRows.ids.includes(await B.ev(() => BY_START[0].id)), JSON.stringify(meRows));

  await B.page.click('.who-tabs [data-who]:not([data-who="me"])'); await sleep(400);
  const fv = await B.ev(() => ({
    head: (document.querySelector('.friend-head') || {}).textContent || '',
    ids: [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev),
    both: [...document.querySelectorAll('#mscroll .row')].filter(r => /גם אצלי/.test(r.textContent)).map(r => r.dataset.ev),
    pref: S.prefs.mineView,
    count: [...document.querySelectorAll('.day-pill .count')].map(c => c.textContent).join(','),
  }));
  const dayIds = await B.ev(() => [BY_START[0], BY_START[5]].filter(e => e.day === viewDay).map(e => e.id));
  check('לשונית אליס – רק ההופעות שלה', JSON.stringify(fv.ids.slice().sort()) === JSON.stringify(dayIds.slice().sort()), JSON.stringify(fv.ids));
  check('הופעה משותפת מסומנת "גם אצלי"', await B.ev(() => BY_START[5].day === viewDay) ? fv.both.length === 1 : true);
  check('כותרת: "הלוז של אליס · מתעדכן לבד"', /הלוז של אליס/.test(fv.head) && /מתעדכן לבד/.test(fv.head), fv.head.replace(/\s+/g, ' '));
  check('ספירת הימים לפי הלוז שלה', fv.count === '2' || fv.count.split(',').reduce((a, b) => a + +b, 0) === 2, fv.count);

  // אליס משנה את הלוז → אצל בוב מתעדכן לבד
  await A.ev(() => { delete S.picks[BY_START[0].id]; S.picks[BY_START[2].id] = 2; save(); cloudNow(); }); await sleep(2500);
  await B.ev(() => refreshFriends(true)); await sleep(1500);
  const after = await B.ev(() => ({ picks: S.friends[0].picks, ids: [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev) }));
  const want = await A.ev(() => S.picks);
  check('אחרי שינוי אצל אליס – הלוז אצל בוב התעדכן', JSON.stringify(Object.entries(after.picks).sort()) === JSON.stringify(Object.entries(want).sort()), JSON.stringify(after.picks));
  check('הלשונית רועננה בלי לגעת', !after.ids.includes(await B.ev(() => BY_START[0].id)));
  check('הלוז של בוב עצמו לא השתנה', await B.ev(() => Object.keys(S.picks).length === 2 && !S.picks[BY_START[2].id]));

  // רק אליס יכולה לכתוב ללוז החי שלה
  const forged = await B.ev(async () => { const a = await CC.auth(); const r = await fetch(CC.cfg.endpoints.fs + '/shares/uid-alice', { method: 'PATCH', headers: { Authorization: 'Bearer ' + a.idToken, 'Content-Type': 'application/json' }, body: '{"fields":{}}' }); return r.status; });
  check('בוב לא יכול לכתוב ללוז של אליס', forged === 403, forged);

  // הלוז של חבר נשמר גם בגיבוי של בוב (וחוזר במכשיר חדש)
  await B.ev(() => cloudNow()); await sleep(2500);
  s = await srv();
  check('החבר (עם המקור) בגיבוי של בוב', (s.docs['uid-bob'].state.friends || []).some(f => f.src === 'uid-alice'));

  // בלי קליטה – נשאר הלוז האחרון
  await ctl({ down: true });
  await B.ev(() => refreshFriends(true)); await sleep(1500);
  check('בלי קליטה – הלוז האחרון נשאר', await B.ev(() => Object.keys(S.friends[0].picks).length === 2));
  await ctl({ down: false });

  // אליס הפסיקה לשתף (המסמך נמחק) → מסומן, הלוז האחרון נשאר
  await ctl({ delShare: 'uid-alice' });
  await B.ev(() => refreshFriends(true)); await sleep(1200);
  const gone = await B.ev(() => ({ err: S.friends[0].liveErr, n: Object.keys(S.friends[0].picks).length, head: document.querySelector('.friend-head').textContent }));
  check('הפסיק/ה לשתף – מסומן והלוז האחרון נשאר', gone.err === 'gone' && gone.n === 2 && /הפסיק/.test(gone.head), JSON.stringify(gone));

  // מחיקת החבר מחזירה ללשונית שלי
  await B.ev(() => { const x = S.friends[0]; S.friends = []; if (S.prefs.mineView === x.id) S.prefs.mineView = 'me'; save(); render(); });
  check('בלי חברים – אין לשוניות', await B.ev(() => !document.querySelector('.who-tabs')));

  // ייבוא הקוד של עצמי לא יוצר "לוז חי" של עצמי
  await A.ev(c => upsertFriend(decodeShare(c)), code); await sleep(300);
  check('קוד של עצמי – בלי מקור חי', await A.ev(() => !S.friends[0].src));

  // ───── לינק שיתוף: חבר חדש לוחץ על לינק ─────
  await A.ev(() => { S.picks[BY_START[3].id] = 2; save(); cloudNow(); }); await sleep(2500);
  const link = await A.ev(() => shareLink(encodeShare(S.name, S.picks, cloudAuth.uid)));
  check('הלינק בנוי נכון', /^https:\/\/tom-lev\.github\.io\/indienegev-2026\/#INDN1\..+\.uid-alice$/.test(link), link.slice(0, 60));
  const C = await device('C');
  await C.page.goto('about:blank');
  await C.page.goto(link.replace('https://tom-lev.github.io/indienegev-2026/', 'http://localhost:8765/'), { waitUntil: 'load' }); await sleep(1800);
  const c1 = await C.ev(() => ({ inv: (document.querySelector('.invite h2') || {}).textContent || '', wel: (document.querySelector('.w-invite') || {}).textContent || '', hash: location.hash }));
  check('נפתח מסך "אליס רוצה לשתף איתך את הלוז"', /אליס רוצה לשתף איתך את הלוז/.test(c1.inv), c1.inv);
  check('מסך ההתחברות מזכיר את ההזמנה', /אליס/.test(c1.wel), c1.wel);
  check('הכתובת נוקתה', c1.hash === '');
  // מעבר להתחברות בהפניה (אייפון) – הדף נטען מחדש בלי הקוד – ההזמנה חוזרת
  await C.page.goto('about:blank'); await C.page.goto('http://localhost:8765/', { waitUntil: 'load' }); await sleep(1800);
  check('אחרי חזרה מההתחברות – ההזמנה עדיין פתוחה', await C.ev(() => /אליס רוצה/.test((document.querySelector('.invite h2') || {}).textContent || '')));
  await C.ev(() => onGoogleCredential({ credential: 'user:charlie' })); await sleep(2200);
  check('אחרי ההתחברות – ההזמנה גלויה (מסך הפתיחה נסגר)', await C.ev(() => !document.querySelector('.welcome') && !!document.querySelector('.invite')));
  await C.page.click('.invite [data-a="accept"]'); await sleep(900);
  const c2 = await C.ev(() => ({ fr: S.friends.map(f => [f.name, f.src, Object.keys(f.picks).length]), tab, who: S.prefs.mineView === (S.friends[0] || {}).id, head: (document.querySelector('.friend-head') || {}).textContent || '', key: localStorage.getItem('indienegev-invite'), mine: Object.keys(S.picks).length }));
  check('לחיצה אחת → אליס נוספה עם לוז חי', c2.fr.length === 1 && c2.fr[0][1] === 'uid-alice' && c2.fr[0][2] === 3, JSON.stringify(c2.fr));
  check('עובר ישר ללשונית של אליס ב"הלוז שלי"', c2.tab === 'mine' && c2.who && /הלוז של אליס/.test(c2.head));
  check('ההזמנה נמחקה ולא תיפתח שוב', c2.key === null);
  check('הלוז של צ׳רלי לא השתנה', c2.mine === 0);
  await C.page.goto('about:blank'); await C.page.goto('http://localhost:8765/', { waitUntil: 'load' }); await sleep(1500);
  check('פתיחה נוספת – בלי מסך הזמנה', await C.ev(() => !document.querySelector('.invite')));
  // "אפשרויות נוספות" – מיזוג עובד גם ממסך ההזמנה
  await C.ev(l => { location.hash = l.split('#')[1]; }, link); await sleep(300);
  await C.page.goto('about:blank'); await C.page.goto(link.replace('https://tom-lev.github.io/indienegev-2026/', 'http://localhost:8765/'), { waitUntil: 'load' }); await sleep(1500);
  check('לינק שכבר נוסף – הכפתור "עדכון הלוז של אליס"', await C.ev(() => /עדכון הלוז של אליס/.test(document.querySelector('.invite [data-a="accept"]').textContent)));
  await C.ev(() => { document.querySelector('.invite-more').open = true; document.querySelector('.invite [data-a="merge"]').click(); }); await sleep(500);
  check('מיזוג ממסך ההזמנה', await C.ev(() => Object.keys(S.picks).length === 3));
  if (process.env.SHOTS) await C.page.screenshot({ path: process.env.SHOTS + '/inv-after.png' }).catch(() => {});
  if (C.errors.length) A.errors.push(...C.errors);

  check('אין שגיאות JS', !A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(0);
})();
