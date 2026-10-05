/* ארסנל בדיקות: גיבוי, סנכרון בין מכשירים, התנתקות/התחברות, רשת, אימות ושלמות נתונים */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const APP = 'http://localhost:8765/';
const FB = 'http://localhost:8766';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let group = '';

const ctl = c => fetch(FB + '/ctl', { method: 'POST', body: JSON.stringify(c) }).then(r => r.json());
const srv = () => fetch(FB + '/state', { method: 'POST' }).then(r => r.json());

function check(id, name, ok, detail = '') {
  results.push({ group, id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
async function test(id, name, fn) {
  try { await fn(); }
  catch (e) { check(id, name, false, 'EXCEPTION: ' + (e.message || e).toString().slice(0, 200)); }
}

/* מכשיר = דפדפן נפרד עם פרופיל ואחסון משלו */
async function device(label, { ios = false } = {}) {
  const dir = 'C:/Users/tomer/AppData/Local/Temp/claude/d' + label + (Date.now() % 100000);
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: dir, protocolTimeout: 90000 });
  const dev = { label, browser, answer: true, dialogs: [], errors: [] };
  dev.open = async () => {
    const page = await browser.newPage();
    if (ios) await page.evaluateOnNewDocument(() => { Object.defineProperty(ServiceWorkerRegistration.prototype, 'sync', { get() { return undefined; } }); });
    page.on('dialog', d => { dev.dialogs.push(d.message()); dev.answer ? d.accept() : d.dismiss(); });
    page.on('pageerror', e => dev.errors.push(e.message));
    await page.goto(APP, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await sleep(900);
    dev.page = page;
    return page;
  };
  dev.ev = (fn, ...a) => dev.page.evaluate(fn, ...a);
  dev.signIn = async user => { await dev.ev(u => onGoogleCredential({ credential: 'user:' + u }), user); await sleep(1800); };
  dev.fp = () => dev.ev(() => String(dataFingerprint()));
  dev.status = async () => dev.ev(() => { renderHeader(); const e = document.querySelector('.top .cloud-status'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
  dev.pull = async () => { await dev.ev(() => { lastPull = 0; pullCloud(); }); await sleep(1500); };
  dev.data = () => dev.ev(() => ({ picks: S.picks, notes: S.notes.map(n => n.text), ratings: S.ratings, tent: S.prefs.tent || null, friends: S.friends.map(f => f.name), name: S.name }));
  await dev.open();
  return dev;
}
/* מחכה שהענן יכיל בדיוק את המצב המקומי */
async function waitSynced(dev, uid, ms = 9000) {
  const t0 = Date.now(), fp = await dev.fp();
  while (Date.now() - t0 < ms) {
    const s = await srv();
    if (s.docs[uid] && s.docs[uid].fp === fp) return true;
    await sleep(300);
  }
  return false;
}
const writes = async () => (await srv()).log.filter(l => l.startsWith('write uid')).length;
const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v);
const sameData = (a, b) => canon(a) === canon(b);

const RICH = () => {
  S.name = 'תומר';
  S.picks = { 'thu-kof-2200': 2, 'fri-pil-2200': 1, 'sat-kof-1545': 2 };
  S.notes = [
    { id: 'r1', ev: 'thu-kof-2200', text: 'הקהל שר "עם הזמן" 🔥\nשורה שנייה', at: Date.now(), place: 'kof' },
    { id: 'r2', ev: 'fri-pil-2200', text: '<img src=x onerror="window.__xss=1"> & <b>bold</b>', at: Date.now() + 1, place: 'pil' },
  ];
  S.ratings = { 'thu-kof-2200': { crowd: 4, vibe: 5, at: Date.now() } };
  S.prefs.tent = { x: 40, y: 70 }; syncTent();
  S.friends = [{ id: 'f1', name: 'נועה', emoji: '🦋', color: '#ef8d83', picks: { 'thu-kof-2200': 2 }, importedAt: Date.now(), active: true }];
  save();
};

(async () => {
  await ctl({ reset: true });
  const devs = [];

  // ═════════ A. גיבוי בסיסי ═════════
  group = 'A. גיבוי בסיסי';
  const A = await device('A'); devs.push(A);
  await test('W1', 'כניסה ראשונה: מסך התחברות חובה, בלי "להמשיך בינתיים" כשיש קליטה', async () => {
    await sleep(1500);
    const w = await A.ev(() => ({ shown: !!document.querySelector('.welcome'), later: !!document.querySelector('[data-wlater]') && !document.querySelector('[data-wlater]').classList.contains('hidden') }));
    check('W1', 'כניסה ראשונה: מסך התחברות חובה, בלי "להמשיך בינתיים" כשיש קליטה', w.shown && !w.later, JSON.stringify(w));
  });
  await test('A1', 'התחברות ראשונה במכשיר ריק יוצרת גיבוי', async () => {
    await A.signIn('alice');
    const s = await srv();
    check('A1', 'התחברות ראשונה במכשיר ריק יוצרת גיבוי', s.docs['uid-alice'] && (await A.ev(() => !!cloudAuth)), `log: ${s.log.join(', ')}`);
    check('W2', 'אחרי ההתחברות מסך הפתיחה נעלם', !(await A.ev(() => !!document.querySelector('.welcome'))));
  });
  await test('A2', 'שינוי נתונים מגובה אוטומטית תוך שניות', async () => {
    await A.ev(RICH);
    const ok = await waitSynced(A, 'uid-alice');
    const doc = (await srv()).docs['uid-alice'];
    check('A2', 'שינוי נתונים מגובה אוטומטית תוך שניות', ok && Object.keys(doc.state.picks).length === 3 && doc.state.notes.length === 2 && doc.state.prefs.tent && doc.state.friends.length === 1);
  });
  await test('A3', 'עברית, אימוג׳י, שורות חדשות ו-HTML נשמרים בענן בדיוק', async () => {
    const doc = (await srv()).docs['uid-alice'];
    const local = await A.ev(() => S.notes.map(n => n.text));
    check('A3', 'עברית, אימוג׳י, שורות חדשות ו-HTML נשמרים בענן בדיוק', sameData(doc.state.notes.map(n => n.text), local));
  });
  await test('A4', 'שינוי העדפות תצוגה בלבד לא מעלה גיבוי מיותר', async () => {
    const w0 = await writes();
    await A.ev(() => { S.prefs.view = S.prefs.view === 'grid' ? 'list' : 'grid'; S.prefs.showMaybe = !S.prefs.showMaybe; save(); });
    await sleep(4500);
    check('A4', 'שינוי העדפות תצוגה בלבד לא מעלה גיבוי מיותר', (await writes()) === w0, `writes ${w0} → ${await writes()}`);
  });
  await test('A5', 'שמירה חוזרת בלי שינוי לא מעלה שוב', async () => {
    const w0 = await writes();
    await A.ev(() => { save(); save(); save(); });
    await sleep(4500);
    check('A5', 'שמירה חוזרת בלי שינוי לא מעלה שוב', (await writes()) === w0);
  });
  await test('A6', 'רצף שינויים מהיר → העלאה אחת (debounce)', async () => {
    const w0 = await writes();
    await A.ev(() => { for (let i = 0; i < 5; i++) { S.ratings['sat-kof-1545'] = { crowd: i % 5 + 1, at: Date.now() }; save(); } });
    await waitSynced(A, 'uid-alice');
    const d = (await writes()) - w0;
    check('A6', 'רצף שינויים מהיר → העלאה אחת (debounce)', d === 1, `${d} uploads`);
  });
  await test('A7', 'שורת "גיבוי אחרון לענן" מופיעה בכל חמשת המסכים', async () => {
    const r = await A.ev(async () => { const out = []; for (const t of ['now', 'grid', 'mine', 'map', 'profile']) { setTab(t); await new Promise(r => setTimeout(r, 150)); const e = document.querySelector('.top .cloud-status'); out.push(t + ':' + (e && !document.querySelector('#top').classList.contains('hidden') && /גיבוי אחרון לענן/.test(e.textContent) ? 'ok' : 'missing')); } setTab('mine'); return out; });
    check('A7', 'שורת "גיבוי אחרון לענן" מופיעה בכל חמשת המסכים', r.every(x => x.endsWith('ok')), r.join(' '));
  });
  await test('A8', 'פתק עם HTML לא מריץ קוד (XSS)', async () => {
    await A.ev(() => { openEvent(EV['fri-pil-2200']); document.querySelector('.journal').open = true; });
    await sleep(400);
    const x = await A.ev(() => ({ xss: !!window.__xss, img: !!document.querySelector('.sheet img[src="x"]'), shown: document.querySelector('.sheet .nt') && document.querySelector('.sheet .nt').textContent }));
    await A.ev(() => closeAllLayers());
    check('A8', 'פתק עם HTML לא מריץ קוד (XSS)', !x.xss && !x.img && x.shown && x.shown.includes('<img'), JSON.stringify(x));
  });

  // ═════════ B. כמה מכשירים ═════════
  group = 'B. סנכרון בין מכשירים';
  const B = await device('B'); devs.push(B);
  await test('B1', 'מכשיר חדש וריק: התחברות משחזרת הכל אוטומטית', async () => {
    await B.signIn('alice');
    const [a, b] = [await A.data(), await B.data()];
    check('B1', 'מכשיר חדש וריק: התחברות משחזרת הכל אוטומטית', sameData(a, b), sameData(a, b) ? '' : JSON.stringify(b).slice(0, 200));
  });
  await test('B2', 'אחרי שחזור, המכשיר החדש לא מעלה שוב (כבר זהה)', async () => {
    const log = (await srv()).log.slice(-4);
    check('B2', 'אחרי שחזור, המכשיר החדש לא מעלה שוב (כבר זהה)', await B.ev(() => cloudBackedUp()), log.join(', '));
  });
  const C = await device('C'); devs.push(C);
  await test('B3', 'מכשיר עם נתונים מקומיים מתחבר: הנתונים שלו והענן מתאחדים בלי לאבד כלום', async () => {
    await C.ev(() => { S.picks = { 'sat-pil-1030': 2 }; S.notes = [{ id: 'c1', ev: 'sat-pil-1030', text: 'מקומי של C', at: Date.now(), place: 'pil' }]; save(); });
    C.dialogs = [];
    await C.signIn('alice');
    await waitSynced(C, 'uid-alice');
    const d = await C.data(), doc = (await srv()).docs['uid-alice'];
    const snaps = await C.ev(async () => (await getSnapshots()).map(s => s.reason));
    const ok = d.notes.includes('מקומי של C') && d.notes.length === 3 && d.picks['sat-pil-1030'] === 2 && doc.state.notes.some(n => n.text === 'מקומי של C') && C.dialogs.length === 0;
    check('B3', 'מכשיר עם נתונים מקומיים מתחבר: הנתונים שלו והענן מתאחדים בלי לאבד כלום', ok, `notes: ${d.notes.length}, dialogs: ${C.dialogs.length}, snaps: ${snaps}`);
    check('B4', 'לפני הסנכרון הראשון נשמרת גרסה קודמת במכשיר', snaps.includes('לפני סנכרון ראשון'));
    await A.pull();
    check('B4b', 'מכשיר A מקבל את הנתונים של C אחרי חזרה לאפליקציה', (await A.data()).notes.includes('מקומי של C'));
  });
  await test('B5', 'עריכה ב-A ואז ב-B (ברצף): הענן מכיל את העריכה האחרונה', async () => {
    await A.ev(() => { S.notes.push({ id: 'a9', ev: 'sat-kof-1545', text: 'מ-A', at: Date.now(), place: 'kof' }); save(); });
    await waitSynced(A, 'uid-alice');
    await B.ev(() => { S.notes.push({ id: 'b9', ev: 'sat-kof-1545', text: 'מ-B', at: Date.now(), place: 'kof' }); save(); });
    await waitSynced(B, 'uid-alice');
    const doc = (await srv()).docs['uid-alice'];
    const texts = doc.state.notes.map(n => n.text);
    check('B5', 'עריכה ב-A ואז ב-B (ברצף): הענן מכיל את שתי העריכות', texts.includes('מ-A') && texts.includes('מ-B'), `בענן: ${texts.join(' | ')}`);
  });
  await test('B6', 'מכשיר A מקבל עדכונים שנעשו ב-B (סנכרון אמיתי)', async () => {
    await A.pull();
    const a = await A.data();
    check('B6', 'מכשיר A מקבל עדכונים שנעשו ב-B (סנכרון אמיתי)', a.notes.includes('מ-B'), `A רואה: ${a.notes.join(' | ')}`);
  });
  await test('B7', 'משתמשים שונים מבודדים: bob לא יכול לקרוא את הגיבוי של alice', async () => {
    const D = await device('D'); devs.push(D);
    await D.signIn('bob');
    await D.ev(() => { S.picks = { 'fri-kof-2100': 2 }; save(); });
    await waitSynced(D, 'uid-bob');
    const r = await D.ev(async () => { const a = await CC.auth(); const res = await fetch(CC.cfg.endpoints.fs + '/backups/uid-alice', { headers: { Authorization: 'Bearer ' + a.idToken } }); return res.status; });
    const w = await D.ev(async () => { const a = await CC.auth(); const res = await fetch(CC.cfg.endpoints.fs + '/backups/uid-alice', { method: 'PATCH', headers: { Authorization: 'Bearer ' + a.idToken, 'Content-Type': 'application/json' }, body: '{"fields":{}}' }); return res.status; });
    const s = await srv();
    check('B7', 'משתמשים שונים מבודדים: bob לא יכול לקרוא/לדרוס את הגיבוי של alice', r === 403 && w === 403 && Object.keys(s.docs['uid-alice'].state.picks).length >= 3 && Object.keys(s.docs['uid-bob'].state.picks).length === 1, `read ${r}, write ${w}`);
    await D.browser.close();
  });

  // ═════════ S. סנכרון מתקדם ═════════
  group = 'S. סנכרון מתקדם';
  const offBoth = async () => { await ctl({ down: true }); await A.page.setOfflineMode(true); await B.page.setOfflineMode(true); };
  const onBoth = async () => { await ctl({ down: false }); await A.page.setOfflineMode(false); await sleep(2500); await B.page.setOfflineMode(false); await sleep(2500); await A.pull(); };
  await test('S1', 'עריכות במקביל בשני מכשירים בלי קליטה → אחרי החזרה הכל קיים בשניהם', async () => {
    await offBoth();
    await A.ev(() => { S.notes.push({ id: 'pa', ev: 'thu-kof-2200', text: 'במקביל A', at: Date.now(), place: 'kof' }); S.picks['thu-pil-2030'] = 2; save(); });
    await B.ev(() => { S.notes.push({ id: 'pb', ev: 'thu-kof-2200', text: 'במקביל B', at: Date.now(), place: 'kof' }); S.picks['thu-racket-2200'] = 1; save(); });
    await sleep(1000);
    await onBoth();
    const [a, b, doc] = [await A.data(), await B.data(), (await srv()).docs['uid-alice'].state];
    const all = x => x.notes.includes('במקביל A') && x.notes.includes('במקביל B') && x.picks['thu-pil-2030'] === 2 && x.picks['thu-racket-2200'] === 1;
    const c = { notes: doc.notes.map(n => n.text), picks: doc.picks };
    check('S1', 'עריכות במקביל בשני מכשירים בלי קליטה → אחרי החזרה הכל קיים בשניהם', all(a) && all(b) && all(c) && sameData(a, b), `A:${all(a)} B:${all(b)} cloud:${all(c)} same:${sameData(a, b)}`);
  });
  await test('S2', 'מחיקה במכשיר אחד עוברת למכשיר השני', async () => {
    await A.ev(() => { S.notes = S.notes.filter(n => n.id !== 'pa'); delete S.picks['thu-pil-2030']; save(); });
    await waitSynced(A, 'uid-alice');
    await B.pull();
    const b = await B.data();
    check('S2', 'מחיקה במכשיר אחד עוברת למכשיר השני', !b.notes.includes('במקביל A') && !b.picks['thu-pil-2030'] && b.notes.includes('במקביל B'));
  });
  await test('S3', 'אותו פתק נערך בשני המכשירים → העריכה החדשה גוברת, בלי כפילות', async () => {
    await offBoth();
    await A.ev(() => { const n = S.notes.find(n => n.id === 'pb'); n.text = 'נערך ב-A'; n.edited = Date.now(); save(); });
    await sleep(300);
    await B.ev(() => { const n = S.notes.find(n => n.id === 'pb'); n.text = 'נערך ב-B (אחרון)'; n.edited = Date.now(); save(); });
    await onBoth();
    const a = await A.data(), b = await B.data();
    const cnt = a.notes.filter(t => t.startsWith('נערך')).length;
    check('S3', 'אותו פתק נערך בשני המכשירים → העריכה החדשה גוברת, בלי כפילות', a.notes.includes('נערך ב-B (אחרון)') && cnt === 1 && sameData(a, b), `A: ${a.notes.filter(t => t.startsWith('נערך'))}`);
  });
  await test('S4', 'מחיקה במכשיר אחד + עריכה של אותו פתק במכשיר אחר → הפתק נשמר', async () => {
    await offBoth();
    await A.ev(() => { S.notes = S.notes.filter(n => n.id !== 'pb'); save(); });
    await B.ev(() => { const n = S.notes.find(n => n.id === 'pb'); n.text = 'נערך אחרי שנמחק'; n.edited = Date.now(); save(); });
    await onBoth();
    check('S4', 'מחיקה במכשיר אחד + עריכה של אותו פתק במכשיר אחר → הפתק נשמר', (await A.data()).notes.includes('נערך אחרי שנמחק'));
  });
  await test('S5', 'הזזת האוהל ושינוי דירוג במכשיר אחד מגיעים לשני', async () => {
    await A.ev(() => { S.prefs.tent = { x: 63, y: 70 }; syncTent(); S.ratings['thu-kof-2200'] = { crowd: 2, vibe: 2, at: Date.now() }; save(); });
    await waitSynced(A, 'uid-alice');
    await B.pull();
    const b = await B.ev(() => ({ tent: S.prefs.tent, r: S.ratings['thu-kof-2200'], placed: !!PLACE.tent && PLACE.tent.mapX }));
    check('S5', 'הזזת האוהל ושינוי דירוג במכשיר אחד מגיעים לשני', b.tent && b.tent.x === 63 && b.r.crowd === 2 && b.placed === 63, JSON.stringify(b));
  });
  await test('S6', 'גיבוי בנעילת מסך לא דורס שינוי שמכשיר אחר כתב בינתיים', async () => {
    await B.ev(() => { S.notes.push({ id: 'race', ev: 'thu-kof-2200', text: 'B כתב בינתיים', at: Date.now(), place: 'kof' }); save(); });
    await waitSynced(B, 'uid-alice');
    await A.ev(() => { S.notes.push({ id: 'race2', ev: 'thu-kof-2200', text: 'A לפני נעילה', at: Date.now(), place: 'kof' }); save(); clearTimeout(cloudTimer);
      Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(1500);
    const mid = (await srv()).docs['uid-alice'].state.notes.map(n => n.text);
    await A.ev(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); lastPull = 0; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(3000);
    const end = (await srv()).docs['uid-alice'].state.notes.map(n => n.text);
    check('S6', 'גיבוי בנעילת מסך לא דורס שינוי שמכשיר אחר כתב בינתיים', mid.includes('B כתב בינתיים') && end.includes('B כתב בינתיים') && end.includes('A לפני נעילה'), `אחרי נעילה: ${mid.includes('B כתב בינתיים')}, בסוף: ${end.includes('A לפני נעילה')}`);
  });

  // ═════════ C. התנתקות והתחברות ═════════
  group = 'C. התנתקות והתחברות מחדש';
  await test('C1', 'התנתקות: הנתונים נשארים בטלפון, הגיבוי בענן נשאר', async () => {
    const before = await A.data();
    A.answer = true;
    await A.ev(() => cloudSignOut()); await sleep(400);
    const after = await A.data(), s = await srv();
    check('C1', 'התנתקות: הנתונים נשארים בטלפון, הגיבוי בענן נשאר', sameData(before, after) && !(await A.ev(() => !!cloudAuth)) && s.docs['uid-alice'], await A.status());
  });
  await test('C2', 'עריכה כשמנותקים לא עולה לענן', async () => {
    const w0 = await writes();
    await A.ev(() => { S.notes.push({ id: 'off', ev: 'thu-kof-2200', text: 'כשמנותק', at: Date.now(), place: 'kof' }); save(); });
    await sleep(4500);
    check('C2', 'עריכה כשמנותקים לא עולה לענן', (await writes()) === w0);
  });
  await test('C3', 'התחברות מחדש: עריכה שנעשתה כשמנותקים נשמרת ועולה, בלי שאלות', async () => {
    A.dialogs = [];
    await A.signIn('alice');
    await waitSynced(A, 'uid-alice');
    const doc = (await srv()).docs['uid-alice'];
    check('C3', 'התחברות מחדש: עריכה שנעשתה כשמנותקים נשמרת ועולה, בלי שאלות', doc.state.notes.some(n => n.text === 'כשמנותק') && A.dialogs.length === 0, `dialogs: ${A.dialogs.length}`);
  });
  await test('C4', 'בזמן שמנותקים מכשיר אחר מוחק ומוסיף → אחרי התחברות הכל מתמזג נכון', async () => {
    A.answer = true;
    await A.ev(() => cloudSignOut()); await sleep(300);
    await B.pull();
    await B.ev(() => { S.notes = S.notes.filter(n => n.text !== 'כשמנותק'); S.notes.push({ id: 'b2', ev: 'thu-kof-2200', text: 'B הוסיף', at: Date.now(), place: 'kof' }); save(); });
    await waitSynced(B, 'uid-alice');
    await A.ev(() => { S.notes.push({ id: 'off2', ev: 'thu-kof-2200', text: 'מנותק 2', at: Date.now(), place: 'kof' }); save(); });
    await A.signIn('alice');
    await waitSynced(A, 'uid-alice');
    const a = await A.data();
    check('C4', 'בזמן שמנותקים מכשיר אחר מוחק ומוסיף → אחרי התחברות הכל מתמזג נכון', a.notes.includes('מנותק 2') && a.notes.includes('B הוסיף') && !a.notes.includes('כשמנותק'), a.notes.slice(-4).join(' | '));
  });
  await test('C5', 'מכשיר משותף: משתמש אחר מתחבר → הנתונים של הקודם לא עוברים לחשבון שלו', async () => {
    const aliceNotes = (await A.data()).notes.length;
    await A.ev(() => cloudSignOut()); await sleep(800);
    const welcome = await A.ev(() => !!document.querySelector('.welcome'));
    await A.signIn('carol');
    await sleep(3000);
    const carol = (await srv()).docs['uid-carol'];
    const local = await A.data();
    const snaps = await A.ev(async () => (await getSnapshots()).map(s => s.reason));
    check('C5', 'מכשיר משותף: משתמש אחר מתחבר → הנתונים של הקודם לא עוברים לחשבון שלו', (!carol || carol.state.notes.length === 0) && local.notes.length === 0, `carol בענן: ${carol ? carol.state.notes.length : 0} פתקים, במכשיר: ${local.notes.length}`);
    check('C5b', 'אחרי התנתקות מסך ההתחברות חוזר, והנתונים של הקודם נשמרים כגרסה קודמת', welcome && snaps.includes('נתוני החשבון הקודם'), `welcome: ${welcome}, snaps: ${snaps.slice(0, 3)}`);
    await A.ev(() => cloudSignOut()); await sleep(300);
    await A.signIn('alice'); await waitSynced(A, 'uid-alice');
    check('C5c', 'חזרה לחשבון המקורי במכשיר המשותף מחזירה את כל הנתונים שלו', (await A.data()).notes.length === aliceNotes, `${(await A.data()).notes.length}/${aliceNotes}`);
  });

  // ═════════ D. רשת ═════════
  group = 'D. קליטה ורשת';
  await test('D1', 'עריכה בלי קליטה + אפליקציה סגורה → עולה ברקע כשהקליטה חוזרת (אנדרואיד)', async () => {
    await waitSynced(A, 'uid-alice');
    await ctl({ down: true });
    await A.page.setOfflineMode(true);
    await A.ev(() => { S.notes.push({ id: 'bg', ev: 'thu-kof-2200', text: 'רקע', at: Date.now(), place: 'kof' }); save(); });
    await sleep(1500);
    const tags = await A.ev(() => navigator.serviceWorker.ready.then(r => r.sync.getTags()));
    await A.page.close(); await sleep(500);
    await ctl({ down: false });
    const blank = await A.browser.newPage();
    const cdp = await blank.target().createCDPSession();
    const reg = new Promise(res => cdp.on('ServiceWorker.workerRegistrationUpdated', e => { const r = e.registrations.find(x => x.scopeURL === APP); if (r) res(r); }));
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.dispatchSyncEvent', { origin: 'http://localhost:8765', registrationId: (await reg).registrationId, tag: 'cloud-backup', lastChance: false });
    await sleep(2500);
    const doc = (await srv()).docs['uid-alice'];
    check('D1', 'עריכה בלי קליטה + אפליקציה סגורה → עולה ברקע כשהקליטה חוזרת (אנדרואיד)', tags.includes('cloud-backup') && doc.state.notes.some(n => n.text === 'רקע'), `sync tags: ${tags}`);
    await blank.close(); await A.open();
  });
  await test('D2', 'אחרי הגיבוי ברקע, פתיחת האפליקציה מראה "מגובה" ולא מעלה שוב', async () => {
    const w0 = await writes(); await sleep(3500);
    const st = await A.status();
    check('D2', 'אחרי הגיבוי ברקע, פתיחת האפליקציה מראה "מגובה" ולא מעלה שוב', (await writes()) === w0 && st.includes('גיבוי אחרון לענן'), st);
  });
  const I = await device('I', { ios: true }); devs.push(I);
  await test('D3', 'אייפון (בלי Background Sync): פתק ונעילת מסך → הגיבוי נשלח לפני הסגירה', async () => {
    await I.signIn('alice'); await sleep(500);
    const w0 = await writes();
    await I.ev(() => {
      S.notes.push({ id: 'ios', ev: 'thu-kof-2200', text: 'אייפון לפני נעילה', at: Date.now(), place: 'kof' }); save();
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await I.page.close({ runBeforeUnload: false }); await sleep(2000);
    const doc = (await srv()).docs['uid-alice'];
    check('D3', 'אייפון (בלי Background Sync): פתק ונעילת מסך → הגיבוי נשלח לפני הסגירה', doc.state.notes.some(n => n.text === 'אייפון לפני נעילה'), `new writes: ${(await writes()) - w0}`);
    await I.open();
  });
  await test('D4', 'קליטה חלשה (תשובה אחרי 25 שניות): מוצגת שגיאה ברורה, בלי להיתקע', async () => {
    await ctl({ slow: 25 });
    await I.ev(() => { S.ratings['fri-pil-2200'] = { crowd: 2, at: Date.now() }; save(); });
    await sleep(26000);
    const st = await I.status();
    await ctl({ slow: 0 });
    check('D4', 'קליטה חלשה (תשובה אחרי 25 שניות): מוצגת שגיאה ברורה, בלי להיתקע', /חלשה/.test(st), st);
  });
  await test('D5', 'אחרי קליטה חלשה, חזרת הקליטה (online) משלימה את הגיבוי', async () => {
    await I.page.setOfflineMode(true); await sleep(300); await I.page.setOfflineMode(false);
    const ok = await waitSynced(I, 'uid-alice', 12000);
    check('D5', 'אחרי קליטה חלשה, חזרת הקליטה (online) משלימה את הגיבוי', ok, await I.status());
  });
  await test('D6', 'שגיאת שרת (500): מוצגת, ושינוי הבא עובר', async () => {
    await ctl({ err: 500 });
    await I.ev(() => { S.ratings['fri-pil-2200'] = { crowd: 3, at: Date.now() }; save(); });
    await sleep(4500);
    const st = await I.status();
    await ctl({ err: 0 });
    await I.ev(() => { S.ratings['fri-pil-2200'] = { crowd: 4, at: Date.now() }; save(); });
    const ok = await waitSynced(I, 'uid-alice');
    check('D6', 'שגיאת שרת (500): מוצגת, ושינוי הבא עובר', /שגיאה 500/.test(st) && ok, st);
  });
  await test('D7', 'מצב טיסה: האפליקציה נפתחת מחדש עם כל הנתונים', async () => {
    await I.page.setOfflineMode(true);
    await I.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
    const d = await I.ev(() => ({ notes: S.notes.length, auth: !!cloudAuth }));
    await I.page.setOfflineMode(false);
    check('D7', 'מצב טיסה: האפליקציה נפתחת מחדש עם כל הנתונים', d.notes > 3 && d.auth, JSON.stringify(d));
  });

  // ═════════ E. אימות ═════════
  group = 'E. אימות וטוקנים';
  await test('E1', 'טוקן שפג תוקף מתחדש לבד וההעלאה עוברת', async () => {
    await ctl({ expireAll: true });
    await I.ev(async () => { const a = await CC.get('auth'); a.exp = 0; await CC.set('auth', a); });
    await I.ev(() => { S.ratings['sat-kof-1545'] = { crowd: 5, at: Date.now() }; save(); });
    const ok = await waitSynced(I, 'uid-alice');
    const log = (await srv()).log.slice(-3);
    check('E1', 'טוקן שפג תוקף מתחדש לבד וההעלאה עוברת', ok && log.some(l => l.startsWith('refresh')), log.join(', '));
  });
  await test('E2', 'הרשאה בוטלה (refresh נדחה): מוצג "צריך להתחבר מחדש", הנתונים נשארים', async () => {
    await ctl({ revoke: 'uid-alice', expireAll: true });
    await I.ev(async () => { const a = await CC.get('auth'); a.exp = 0; await CC.set('auth', a); });
    await I.ev(() => { S.ratings['sat-kof-1545'] = { crowd: 1, at: Date.now() }; save(); });
    await sleep(4500);
    const st = await I.status(), n = await I.ev(() => S.notes.length);
    check('E2', 'הרשאה בוטלה (refresh נדחה): מוצג "צריך להתחבר מחדש", הנתונים נשארים', /להתחבר מחדש/.test(st) && n > 2, st);
  });
  await test('E3', 'התחברות מחדש אחרי ביטול הרשאה משלימה את הגיבוי', async () => {
    await I.signIn('alice');
    const ok = await waitSynced(I, 'uid-alice');
    check('E3', 'התחברות מחדש אחרי ביטול הרשאה משלימה את הגיבוי', ok, await I.status());
  });
  await test('E4', 'כניסה עם אישור גוגל לא תקין נכשלת בלי לשבור כלום', async () => {
    const before = await I.data();
    await I.ev(() => onGoogleCredential({ credential: 'garbage' })); await sleep(800);
    check('E4', 'כניסה עם אישור גוגל לא תקין נכשלת בלי לשבור כלום', sameData(before, await I.data()) && (await I.ev(() => cloudAuth && cloudAuth.uid)) === 'uid-alice');
  });

  // ═════════ F. שלמות נתונים מקומית ═════════
  group = 'F. שלמות נתונים';
  await test('F1', 'קובץ גיבוי: הכל נשמר ומשוחזר (כולל אוהל, חברים, דירוגים)', async () => {
    const r = await I.ev(async () => {
      const before = JSON.stringify([S.picks, S.notes, S.ratings, S.friends, S.prefs.tent, S.name]);
      const json = backupJSON();
      S.picks = {}; S.notes = []; S.ratings = {}; S.friends = []; delete S.prefs.tent; save();
      await applyState(parseBackup(json).state, 'בדיקה');
      return before === JSON.stringify([S.picks, S.notes, S.ratings, S.friends, S.prefs.tent, S.name]);
    });
    check('F1', 'קובץ גיבוי: הכל נשמר ומשוחזר (כולל אוהל, חברים, דירוגים)', r);
  });
  await test('F2', 'קובץ פגום/זר נדחה ולא נוגע בנתונים', async () => {
    const r = await I.ev(() => [parseBackup('{bad'), parseBackup('{"app":"other","state":{"v":1}}'), parseBackup('{"app":"indienegev-2026"}')].every(x => x === null));
    check('F2', 'קובץ פגום/זר נדחה ולא נוגע בנתונים', r);
  });
  await test('F3', 'localStorage נמחק → שחזור אוטומטי מהעותק הכפול', async () => {
    const before = await I.data();
    await sleep(800);
    await I.ev(() => localStorage.removeItem('indn26'));
    await I.page.reload({ waitUntil: 'load' }); await sleep(1800);
    check('F3', 'localStorage נמחק → שחזור אוטומטי מהעותק הכפול', sameData(before, await I.data()));
  });
  await test('F4', 'נפח גדול (600 פתקים): גיבוי ושחזור במכשיר אחר', async () => {
    await I.ev(() => { for (let i = 0; i < 600; i++) S.notes.push({ id: 'big' + i, ev: 'thu-kof-2200', text: 'פתק ארוך מספר ' + i + ' – ' + 'א'.repeat(80), at: Date.now() + i, place: 'kof' }); save(); });
    const ok = await waitSynced(I, 'uid-alice', 15000);
    const E = await device('E'); devs.push(E);
    await E.signIn('alice');
    const n = await E.ev(() => S.notes.length), m = await I.ev(() => S.notes.length);
    const size = await I.ev(() => backupJSON().length);
    check('F4', 'נפח גדול (600 פתקים): גיבוי ושחזור במכשיר אחר', ok && n === m, `${m} פתקים, ${Math.round(size / 1024)}KB`);
    await E.browser.close();
  });
  await test('F5', 'נפח גדול + נעילת מסך: בלי שגיאות (נופל לגיבוי הרגיל)', async () => {
    await I.ev(() => { S.notes.push({ id: 'bigx', ev: 'thu-kof-2200', text: 'אחרון', at: Date.now(), place: 'kof' }); save(); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(500);
    check('F5', 'נפח גדול + נעילת מסך: בלי שגיאות (נופל לגיבוי הרגיל)', I.errors.length === 0, I.errors.join('; '));
    await I.ev(() => { S.notes = S.notes.filter(n => !n.id.startsWith('big')); save(); });
    await waitSynced(I, 'uid-alice');
  });
  await test('F6', 'מעבר מהקובץ המקומי (#BK=) ממשיך לעבוד עם גיבוי לענן פעיל', async () => {
    const code = await I.ev(() => { const keep = JSON.stringify(S); S.notes = [{ id: 'mig', ev: 'thu-kof-2200', text: 'מהקובץ המקומי', at: Date.now(), place: 'kof' }]; const c = b64utf8(backupJSON()).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); Object.assign(S, JSON.parse(keep)); save(); return c; });
    I.answer = true;
    await I.ev(c => { location.hash = 'BK=' + c; }, code); await sleep(1500);
    await sleep(4500); await waitSynced(I, 'uid-alice');
    const doc = (await srv()).docs['uid-alice'];
    // המעבר מתמזג עם מה שבענן (בלי למחוק – הגנת מחיקה המונית), והפתק שהועבר נמצא בענן
    check('F6', 'מעבר מהקובץ המקומי (#BK=) ממשיך לעבוד עם גיבוי לענן פעיל', doc.state.notes.some(n => n.text === 'מהקובץ המקומי') && doc.state.notes.length > 1);
  });
  await test('F8', 'מכשיר שאיבד את הנתונים המקומיים לא מוחק את הענן ולא את המכשירים האחרים', async () => {
    const before = (await srv()).docs['uid-alice'].state.notes.length;
    // מחיקה אמיתית של האחסון (בלי עריכה של המשתמש), ופתיחה מחדש של האפליקציה
    await I.ev(async () => { localStorage.removeItem('indn26'); await IDB.set('state', JSON.stringify(defaults())); });
    await I.page.reload({ waitUntil: 'load' }); await sleep(1200);
    await I.ev(() => { lastPull = 0; pullCloud(); });
    await sleep(3500);
    const after = (await srv()).docs['uid-alice'].state.notes.length, local = await I.ev(() => S.notes.length);
    check('F8', 'מכשיר שאיבד את הנתונים המקומיים לא מוחק את הענן ולא את המכשירים האחרים', after === before && local === before, `ענן ${before}→${after}, מכשיר ${local}`);
  });
  await test('F9', 'גרסאות קודמות נשמרות בענן ואפשר לשחזר מהן', async () => {
    const h = await I.ev(async () => (await CC.history()).map(v => CC.size(v.state)));
    check('F9', 'גרסאות קודמות נשמרות בענן ואפשר לשחזר מהן', h.length >= 3, `גרסאות: ${h.join(', ')}`);
  });
  await test('F7', 'אין שגיאות JavaScript באף מכשיר', async () => {
    const errs = devs.flatMap(d => d.errors.map(e => d.label + ': ' + e));
    check('F7', 'אין שגיאות JavaScript באף מכשיר', errs.length === 0, errs.slice(0, 3).join(' | '));
  });

  for (const d of devs) { try { await d.browser.close(); } catch (e) { /* */ } }

  // ═════════ G. Firebase האמיתי ═════════
  group = 'G. Firebase האמיתי (indnegev-14c1b)';
  const K = 'AIzaSyDMNlvqnDlASfIKdL5EYonDHtDuFQPN_N4';
  const FS = 'https://firestore.googleapis.com/v1/projects/indnegev-14c1b/databases/(default)/documents/backups/';
  await test('G1', 'קריאה בלי התחברות נחסמת', async () => {
    const r = await fetch(FS + 'someone?key=' + K); check('G1', 'קריאה בלי התחברות נחסמת', r.status === 403, r.status);
  });
  await test('G2', 'כתיבה בלי התחברות נחסמת', async () => {
    const r = await fetch(FS + 'someone?key=' + K, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"fields":{"x":{"stringValue":"y"}}}' });
    check('G2', 'כתיבה בלי התחברות נחסמת', r.status === 403, r.status);
  });
  await test('G3', 'טוקן מזויף נדחה', async () => {
    const r = await fetch(FS + 'someone', { headers: { Authorization: 'Bearer fake.token.value' } });
    check('G3', 'טוקן מזויף נדחה', r.status === 401 || r.status === 403, r.status);
  });
  await test('G4', 'רשימת כל הגיבויים (מכל המשתמשים) נחסמת', async () => {
    const r = await fetch(FS.replace(/\/$/, '') + '?key=' + K); check('G4', 'רשימת כל הגיבויים (מכל המשתמשים) נחסמת', r.status === 403, r.status);
  });
  await test('G5', 'ההתחברות עם Google מוגדרת עם ה-Client ID הנכון', async () => {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=' + K, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'google.com', continueUri: 'https://tom-lev.github.io/indienegev-2026/' }) });
    const j = await r.json();
    check('G5', 'ההתחברות עם Google מוגדרת עם ה-Client ID הנכון', (j.authUri || '').includes('177429003497-movbi1a9k0e9j595djfuhg282e8av1l0'));
  });

  fs.writeFileSync(__dirname + '/suite-results.json', JSON.stringify(results, null, 1));
  const fail = results.filter(r => !r.ok);
  console.log(`\n=== ${results.length - fail.length}/${results.length} passed ===`);
  fail.forEach(f => console.log('FAIL', f.id, f.name, '—', f.detail));
  process.exit(0);
})();
