/* ניווט: חיפוש קבוע בכותרת בכל המסכים + לשונית "פרופיל". מריצים מול השרת המדומה (כמו suite.js). */
const puppeteer = require('puppeteer-core');
const APP = 'http://localhost:8765/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? '✅' : '❌'} ${name}${d !== '' ? ' — ' + d : ''}`); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'C:/Users/tomer/AppData/Local/Temp/claude/nav' + (Date.now() % 100000) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'load' }); await sleep(1200);
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  await ev(() => { closeWelcome(); S.name = 'תומר'; S.picks = { [BY_START[0].id]: 2 }; save(); render(); });

  const tabs = await ev(() => [...document.querySelectorAll('#tabs [data-tab]')].map(b => b.dataset.tab));
  check('לשוניות: עכשיו, לוז מלא, הלוז שלי, מפה, פרופיל (בלי חיפוש)', JSON.stringify(tabs) === '["now","grid","mine","map","profile"]', tabs.join(','));
  const last = await ev(() => { const r = [...document.querySelectorAll('#tabs [data-tab]')].map(b => b.getBoundingClientRect().left); return r.indexOf(Math.min(...r)); });
  check('פרופיל בקצה השמאלי', last === 4, last);
  check('נפתח ב"הלוז שלי"', await ev(() => tab === 'mine'));

  for (const t of ['now', 'grid', 'mine', 'map', 'profile']) {
    const ok = await ev(async t => { setTab(t); await new Promise(r => setTimeout(r, 200)); const q = document.querySelector('#top #gq'); return !!q && q.offsetParent !== null; }, t);
    check(`שדה חיפוש בכותרת – ${t}`, ok);
  }

  // חיפוש מתוך "לוז מלא"
  await ev(() => setTab('grid')); await sleep(300);
  await page.click('#gq'); await page.type('#gq', 'ש', { delay: 30 }); await sleep(400);
  let s = await ev(() => ({ on: searchOn, cls: document.querySelector('#top').classList.contains('searching'), rows: document.querySelectorAll('#results .row').length, days: getComputedStyle(document.querySelector('#top .days')).display, x: getComputedStyle(document.querySelector('.gs-x')).display, focus: document.activeElement.id }));
  check('הקלדה פותחת תוצאות', s.on && s.cls && s.rows > 0, JSON.stringify(s));
  check('בזמן חיפוש: הימים מוסתרים, "ביטול" מוצג, הפוקוס בשדה', s.days === 'none' && s.x !== 'none' && s.focus === 'gq');
  // רענון כותרת באמצע הקלדה לא מאבד את מה שהוקלד
  await ev(() => { renderHeader(); rerender(); }); await page.type('#gq', 'ל', { delay: 30 }); await sleep(300);
  s = await ev(() => ({ v: document.querySelector('#gq').value, q: searchState.q, focus: document.activeElement.id }));
  check('רענון הכותרת באמצע הקלדה – הטקסט והפוקוס נשמרים', s.v === 'של' && s.q === 'של' && s.focus === 'gq', JSON.stringify(s));
  // פתיחת הופעה מהתוצאות
  await page.click('#results .row'); await sleep(500);
  check('לחיצה על תוצאה פותחת את פרטי ההופעה', await ev(() => !!sheetEl));
  await ev(() => popLayer()); await sleep(500);
  check('סגירת הפרטים – חוזרים לתוצאות', await ev(() => searchOn && !!document.querySelector('#results .row')));
  // ביטול
  await page.click('.gs-x'); await sleep(600);
  s = await ev(() => ({ on: searchOn, tab, v: document.querySelector('#gq').value, grid: !!document.querySelector('#gscroll, #lscroll') }));
  check('"ביטול" – חוזרים ללוז המלא, השדה מתנקה', !s.on && s.tab === 'grid' && s.v === '' && s.grid, JSON.stringify(s));
  // כפתור "חזרה" של הטלפון סוגר את החיפוש
  await page.click('#gq'); await page.type('#gq', 'a'); await sleep(300);
  await page.goBack().catch(() => {}); await sleep(600);
  check('"חזרה" סוגר את החיפוש', await ev(() => !searchOn && tab === 'grid'));
  // לחיצה על לשונית בזמן חיפוש
  await page.click('#gq'); await page.type('#gq', 'a'); await sleep(300);
  await page.click('#tabs [data-tab="map"]'); await sleep(900);
  check('לשונית בזמן חיפוש – סוגרת ועוברת', await ev(() => !searchOn && tab === 'map' && !!document.querySelector('#view .map-wrap, #view canvas, #view svg, #view img')));

  // פרופיל
  await page.click('#tabs [data-tab="profile"]'); await sleep(500);
  s = await ev(() => ({ name: document.querySelector('#pName').value, av: document.querySelectorAll('#pscroll .av-opt').length, friends: !!document.querySelector('#friends'), add: !!document.querySelector('#pscroll [data-fa="import"]'), share: !!document.querySelector('#pscroll [data-a="share"]'), bk: !!document.querySelector('#pscroll [data-a="bkpanel"]'), reset: !!document.querySelector('#pscroll [data-a="reset"]') }));
  check('פרופיל: שם, דמות, חברים, שיתוף, גיבוי, איפוס', s.name === 'תומר' && s.av === 11 && s.friends && s.add && s.share && s.bk && s.reset, JSON.stringify(s));
  await page.click('#pName', { clickCount: 3 }); await page.type('#pName', 'תומר ל'); await ev(() => document.querySelector('#pName').dispatchEvent(new Event('change')));
  check('שינוי שם מהפרופיל', await ev(() => S.name === 'תומר ל'));
  await page.click('#pscroll .av-opt[data-av="6"]'); await sleep(300);
  check('בחירת דמות מהפרופיל (🦊) – מתעדכן בכרטיס', await ev(() => myAvatar() === 6 && document.querySelector('.prof-card .av').textContent.includes('🦊')));
  await page.click('#pscroll [data-a="share"]'); await sleep(500);
  check('"שיתוף הלוז שלי" פותח את מסך השיתוף', await ev(() => /שיתוף הלוז שלי/.test((document.querySelector('.panel h2') || {}).textContent || '')));
  await ev(() => popLayer()); await sleep(500);
  await ev(() => setTab('mine')); await sleep(200);
  check('בכותרת של "הלוז שלי" אין כפתור חברים', await ev(() => !document.querySelector('#top [data-act="friends"]')));
  await page.click('.logo-btn'); await sleep(300);
  check('לחיצה על הלוגו – פרופיל', await ev(() => tab === 'profile'));
  await ev(() => { setTab('mine'); openFriends(); }); await sleep(800);
  check('openFriends (אחרי הוספת חבר) – פרופיל', await ev(() => tab === 'profile'));
  // האוהל מהפרופיל
  await ev(() => { delete S.prefs.tent; save(); syncTent(); setTab('profile'); }); await sleep(300);
  check('פרופיל בלי אוהל – כפתור "סימון האוהל במפה"', await ev(() => !!document.querySelector('#pscroll [data-a="tent-move"]') && !document.querySelector('#pscroll [data-a="tent-go"]')));
  await page.click('#pscroll [data-a="tent-move"]'); await sleep(600);
  check('סימון – עובר למפה במצב סימון אוהל', await ev(() => tab === 'map' && picking === 'tent'));
  await ev(() => { picking = false; S.prefs.tent = { x: 40, y: 70 }; save(); syncTent(); setTab('profile'); }); await sleep(300);
  const tp = await ev(() => document.querySelector('#pscroll').textContent);
  check('פרופיל עם אוהל – כתוב ליד מה', /ליד /.test(tp));
  check('כפתורי האוהל קיימים', await ev(() => ['tent-go', 'tent-share', 'tent-move'].every(a => !!document.querySelector(`#pscroll [data-a="${a}"]`))));
  await page.click('#pscroll [data-a="tent-go"]'); await sleep(900);
  check('"ניווט לאוהל שלי" – מפה עם יעד האוהל', await ev(() => tab === 'map' && mapFocus && mapFocus.dest === 'tent'));
  await ev(() => popLayer()); await sleep(600);
  check('יציאה מהניווט – חוזרים לפרופיל', await ev(() => tab === 'profile'));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/nav-tent.png' });
  if (process.env.SHOTS) {
    await page.screenshot({ path: process.env.SHOTS + '/nav-profile.png' });
    await ev(() => setTab('mine')); await sleep(200);
    await page.click('#gq'); await page.type('#gq', 'אביב'); await sleep(400);
    await page.screenshot({ path: process.env.SHOTS + '/nav-search.png' });
  }
  check('אין שגיאות JS', !errors.length, errors.join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(0);
})();
