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
  check('יש לשוניות: שלי + משותף + אליס', tabs.length === 3 && /שלי/.test(tabs[0]) && /משותף/.test(tabs[1]) && /אליס/.test(tabs[2]), tabs.join(' | '));
  const meRows = await B.ev(() => ({ ids: [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev), avs: document.querySelectorAll('#mscroll .avs').length }));
  check('בלשונית שלי – רק ההופעות שלי', !meRows.ids.includes(await B.ev(() => BY_START[0].id)), JSON.stringify(meRows));
  check('בלשונית שלי – אייקון של חבר שהולך גם הוא', meRows.avs === (await B.ev(() => BY_START[5].day === viewDay) ? 1 : 0), meRows.avs);

  await B.page.click('.who-tabs [data-who^="f"]'); await sleep(400);
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

  // לפי במה – בלשונית של אליס
  await B.page.click('[data-layout="stages"]'); await sleep(400);
  const gs = await B.ev(() => ({ cards: [...document.querySelectorAll('#gscroll .card')].map(c => c.dataset.ev), heads: document.querySelectorAll('#gscroll .g-head').length, top: !!document.querySelector('.mine-top .who-tabs'), me: [...document.querySelectorAll('#gscroll .card')].filter(c => c.textContent.includes(meLook().emoji)).length }));
  check('לפי במה (אליס): רק ההופעות שלה, רק הבמות שלה', JSON.stringify(gs.cards.slice().sort()) === JSON.stringify(dayIds.slice().sort()) && gs.heads === new Set(dayIds.map(i => i.split('-')[1])).size && gs.top, JSON.stringify(gs));
  check('לפי במה: הדמות שלי על הופעה שגם אצלי', gs.me === (await B.ev(() => BY_START[5].day === viewDay) ? 1 : 0), gs.me);
  if (process.env.SHOTS) await B.page.screenshot({ path: process.env.SHOTS + '/v-friend-stages.png' });

  // לוז משותף
  await B.page.click('.who-tabs [data-who="shared"]'); await sleep(400);
  const sh = await B.ev(() => ({ cards: [...document.querySelectorAll('#gscroll .card')].map(c => c.dataset.ev) }));
  const union = await B.ev(() => [...new Set([...Object.keys(S.picks), ...Object.keys(S.friends[0].picks)])].filter(id => EV[id].day === viewDay));
  check('משותף לפי במה: האיחוד של שנינו', JSON.stringify(sh.cards.slice().sort()) === JSON.stringify(union.slice().sort()), JSON.stringify(sh.cards));
  await B.page.click('[data-layout="list"]'); await sleep(300);
  const sl = await B.ev(() => [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => ({ id: r.dataset.ev, n: r.querySelectorAll('.avs .av').length, t: r.classList.contains('together') })));
  check('משותף ברשימה: האיחוד, עם מי הולך', sl.length === union.length && sl.every(r => r.n >= 1), JSON.stringify(sl));
  check('הופעה ששנינו בוחרים – מסומנת "ביחד" עם 2 אווטארים', sl.filter(r => r.t).every(r => r.n === 2) && sl.filter(r => r.t).length === (await B.ev(() => BY_START[5].day === viewDay) ? 1 : 0));
  if (process.env.SHOTS) await B.page.screenshot({ path: process.env.SHOTS + '/v-shared-list.png' });
  await B.page.click('[data-together="1"]'); await sleep(300);
  const tg = await B.ev(() => [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev));
  check('"רק ביחד" – רק הופעות ששנינו בוחרים', tg.length === sl.filter(r => r.t).length, JSON.stringify(tg));
  await B.ev(() => { S.prefs.together = false; S.prefs.mineLayout = 'list'; S.prefs.mineView = S.friends[0].id; save(); render(); }); await sleep(300);

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

  // ───── מה השתנה אצל חבר + נראה לאחרונה ─────
  await A.ev(() => { S.picks = { [BY_START[0].id]: 2, [BY_START[2].id]: 1, [BY_START[6].id]: 1 }; save(); cloudNow(); }); await sleep(2500);
  const codeD = await A.ev(() => encodeShare(S.name, S.picks, cloudAuth.uid, myAvatar()));
  await B.ev(() => { S.friends = []; save(); });
  await B.ev(c => upsertFriend(decodeShare(c)), codeD); await sleep(1200);
  await B.ev(() => { setTab('mine'); viewDay = BY_START[0].day; S.prefs.mineView = S.friends[0].id; S.prefs.showMaybe = true; S.prefs.mineLayout = 'list'; render(); }); await sleep(400);
  check('צפייה ראשונה – בלי "מה השתנה"', await B.ev(() => !document.querySelector('.diff-box') && !!S.friends[0].seen));
  await B.ev(() => { S.prefs.mineView = 'me'; render(); });
  await A.ev(() => { delete S.picks[BY_START[2].id]; S.picks[BY_START[3].id] = 2; S.picks[BY_START[4].id] = 1; S.picks[BY_START[6].id] = 2; save(); cloudNow(); }); await sleep(2500);
  await B.ev(() => refreshFriends(true)); await sleep(1500);
  check('נקודה על הלשונית של החבר כשיש שינויים', await B.ev(() => !!document.querySelector('.who-tabs [data-who^="f"] .new-dot')));
  await B.page.click('.who-tabs [data-who^="f"]'); await sleep(500);
  const df = await B.ev(() => ({ box: (document.querySelector('.diff-box') || {}).textContent || '', news: [...document.querySelectorAll('#mscroll .row')].filter(r => r.querySelector('.new-chip')).map(r => r.dataset.ev), dot: !!document.querySelector('.who-tabs .new-dot'),
    names: [BY_START[2], BY_START[3], BY_START[4], BY_START[6]].map(e => e.name), addedIds: [BY_START[3].id, BY_START[4].id] }));
  check('"מאז שבדקת": נוספו 2, ירדה 1, עכשיו חייב 1', /נוספו 2/.test(df.box) && df.box.includes(df.names[1]) && df.box.includes(df.names[2]) && /ירדה/.test(df.box) && df.box.includes(df.names[0]) && /עכשיו "חייב"/.test(df.box) && df.box.includes(df.names[3]), df.box.replace(/\s+/g, ' '));
  check('הנקודה נעלמה אחרי הצפייה', !df.dot);
  check('תגית "חדש" על ההופעות שנוספו', df.news.length >= 1 && df.news.every(id => df.addedIds.includes(id)), JSON.stringify(df.news));
  await B.ev(() => rerender()); await sleep(200);
  check('"מה השתנה" נשאר גלוי עד "הבנתי"', await B.ev(() => !!document.querySelector('.diff-box')));
  await B.page.click('.diff-ok'); await sleep(300);
  check('"הבנתי" – נעלם', await B.ev(() => !document.querySelector('.diff-box') && !document.querySelector('.new-chip')));
  await B.ev(() => { S.prefs.mineView = 'me'; render(); S.prefs.mineView = S.friends[0].id; render(); }); await sleep(300);
  check('בלי שינויים חדשים – לא מופיע שוב', await B.ev(() => !document.querySelector('.diff-box')));
  // נראה לאחרונה
  await A.ev(() => { seenPingAt = 0; pingSeen(); }); await sleep(1500);
  await B.ev(() => refreshFriends(true)); await sleep(1500);
  const sn = await B.ev(() => ({ head: (document.querySelector('.friend-head .seen') || {}).textContent || '', synced: JSON.stringify(S.friends[0]).includes('seenAt') }));
  check('"באפליקציה עכשיו" ליד החבר', /באפליקציה עכשיו/.test(sn.head), sn.head);
  check('"נראה לאחרונה" לא נשמר בגיבוי (לא יוצר כתיבות)', !sn.synced);
  const sd = await (async () => { const st = await srv(); return st.log.filter(l => l === 'share write uid-alice').length; })();
  check('הלוז החי של אליס לא נמחק מהפינג', await B.ev(() => Object.keys(S.friends[0].picks).length === 4));
  await B.ev(() => { setTab('profile'); }); await sleep(300);
  check('"נראה לאחרונה" גם ברשימת החברים בפרופיל', await B.ev(() => /באפליקציה עכשיו/.test((document.querySelector('#pscroll .friend-row .seen') || {}).textContent || '')));
  await B.ev(() => { setTab('mine'); S.prefs.mineView = 'me'; S.friends = []; save(); render(); });

  // ───── הופעות שהיו מתקפלות (ביום הנוכחי) ─────
  await B.ev(() => { const th = BY_START.filter(e => e.day === 'thu'); S.picks = { [th[0].id]: 2, [th[3].id]: 2, [th[th.length - 1].id]: 2 }; save();
    setSim(th[3].end + 60000); viewDay = 'thu'; S.prefs.mineView = 'me'; render(); }); await sleep(300);
  const pr = await B.ev(() => ({ row: (document.querySelector('.past-row') || {}).textContent || '', ids: [...document.querySelectorAll('#mscroll .row[data-ev]')].map(r => r.dataset.ev) }));
  check('הופעות שנגמרו מתקפלות לשורה "2 הופעות שהיו"', /2 הופעות שהיו/.test(pr.row) && pr.ids.length === 1, JSON.stringify(pr));
  await B.page.click('.past-row'); await sleep(300);
  check('לחיצה – מוצגות שוב', await B.ev(() => document.querySelectorAll('#mscroll .row[data-ev]').length === 3 && /הסתרת/.test(document.querySelector('.past-row').textContent)));
  await B.ev(() => { showPast = false; viewDay = 'fri'; render(); }); await sleep(200);
  check('ביום אחר – בלי קיפול', await B.ev(() => !document.querySelector('.past-row')));
  await B.ev(() => { simTime = null; S.picks = {}; save(); render(); });

  // ───── פופולריות: לוח ספירה אחד, בלי שמות ובלי מזהים ─────
  await A.ev(() => { S.picks = { [BY_START[10].id]: 2, [BY_START[11].id]: 1 }; save(); cloudNow(); }); await sleep(3000);
  await B.ev(() => { S.picks = { [BY_START[10].id]: 1 }; save(); cloudNow(); }); await sleep(3000);
  let st = await srv();
  const id10 = await A.ev(() => BY_START[10].id), id11 = await A.ev(() => BY_START[11].id);
  check('הספירה מתעדכנת אוטומטית: 2 משתמשים, 2 בחרו (1 חייב)', st.stats.u === 2 && st.stats.a[id10] === 2 && st.stats.m[id10] === 1 && st.stats.a[id11] === 1, JSON.stringify(st.stats));
  await B.ev(async () => { await refreshPopular(true); openEvent(BY_START[10]); }); await sleep(800);
  const pl = await B.ev(() => (document.querySelector('.pop-line') || {}).textContent || '');
  check('בפרטי ההופעה: "🔥 2 בחרו (1 חייב) מתוך 2 משתמשים"', /2 בחרו/.test(pl) && /1 חייב/.test(pl) && /מתוך 2/.test(pl), pl);
  await B.ev(() => closeSheet()); await sleep(700);
  await B.ev(() => openEvent(BY_START[11])); await sleep(600);
  const pl1 = await B.ev(() => { const l = [...document.querySelectorAll('.pop-line')]; return l.length ? l[l.length - 1].textContent : ''; });
  check('הופעה שרק אחד בחר: "1 בחר/ה"', /1 בחר\/ה/.test(pl1), pl1);
  await B.ev(() => closeSheet()); await sleep(700);
  check('בלוח הספירה אין שמות ואין מזהים – רק מספרים', !JSON.stringify(st.stats).includes('uid-') && !JSON.stringify(st.stats).includes('אליס'));
  // שינויים: הסרה, שינוי רמה, הוספה – רק ההבדל נספר
  await A.ev(() => { delete S.picks[BY_START[11].id]; S.picks[BY_START[10].id] = 1; S.picks[BY_START[12].id] = 2; save(); cloudNow(); }); await sleep(3000);
  st = await srv();
  const id12 = await A.ev(() => BY_START[12].id);
  check('שינויים נספרים נכון (הסרה −1, חייב→אולי, הוספה +1), בלי ספירה כפולה', st.stats.u === 2 && st.stats.a[id10] === 2 && st.stats.m[id10] === 0 && st.stats.a[id11] === 0 && st.stats.a[id12] === 1 && st.stats.m[id12] === 1, JSON.stringify(st.stats));
  await A.ev(() => cloudNow()); await sleep(2500);
  check('סנכרון נוסף בלי שינוי – לא סופר שוב', JSON.stringify((await srv()).stats) === JSON.stringify(st.stats));
  check('בלי התחברות – אי אפשר לקרוא את הספירה', (await fetch('http://localhost:8766/fs/stats/popular')).status === 403);
  const statsBefore = (await srv()).stats;
  await B.ev(() => { S.picks = {}; save(); cloudNow(); }); await sleep(3000);
  await A.ev(() => { S.picks = {}; save(); cloudNow(); }); await sleep(3000);
  const st0 = (await srv()).stats;
  check('לוז שהתרוקן – יורד מהספירה (u=0)', st0.u === 0 && Object.values(st0.a).every(v => v === 0), JSON.stringify(st0));

  // ───── דמויות ─────
  await A.ev(() => { S.friends = []; save(); setMyAvatar(0); cloudNow(); }); await sleep(2500);
  const codeAv = await A.ev(() => encodeShare(S.name, S.picks, cloudAuth.uid, myAvatar()));
  check('הדמות בקוד', await B.ev(c => decodeShare(c).avatar === 0, codeAv));
  check('קוד עם דמות – ההופעות לא השתנו (תואם לגרסאות ישנות)', await B.ev(c => { const d = decodeShare(c); return Object.keys(d.picks).length === Object.keys(decodeShare(c.replace(/\.uid-alice$/, '')).picks).length; }, codeAv));
  // בוב מוסיף את אליס: 🦋 שלה תפוס אצלו; לבוב (עוד בלי דמות) – דמות פנויה
  await B.ev(() => { delete S.avatar; save(); });
  await B.ev(c => upsertFriend(decodeShare(c)), codeAv); await sleep(1500);
  let bv = await B.ev(() => ({ me: myAvatar(), alice: S.friends[0].emoji, auto: S.avatar && S.avatar.auto }));
  check('בוב קיבל אוטומטית דמות פנויה (לא 🦋)', bv.alice === '🦋' && bv.me != null && bv.me !== 0 && bv.auto, JSON.stringify(bv));
  await B.ev(() => cloudNow()); await sleep(2500);
  // אליס מוסיפה את בוב: הדמות שבוב קיבל אוטומטית – תפוסה אצלה
  const codeB = await B.ev(() => encodeShare(S.name, S.picks, cloudAuth.uid, myAvatar()));
  await A.ev(c => upsertFriend(decodeShare(c)), codeB); await sleep(1500);
  await A.ev(() => { avPickerOpen = true; setTab('mine'); render(); openFriends(); }); await sleep(500);
  const pa = await A.ev(() => [...document.querySelectorAll('#pscroll .av-opt')].filter(b => b.disabled).map(b => +b.dataset.av));
  check('דמות שבוב קיבל אוטומטית – תפוסה אצל אליס', JSON.stringify(pa) === JSON.stringify([bv.me]), JSON.stringify(pa));
  await A.ev(() => popLayer()); await sleep(300);
  await B.ev(() => { avPickerOpen = true; setTab('mine'); S.prefs.mineView = 'me'; render(); openFriends(); }); await sleep(500);
  const AV_N = await B.ev(() => AVATARS.length); const pk = await B.ev(() => ({ dis: [...document.querySelectorAll('#pscroll .av-opt')].filter(b => b.disabled).map(b => +b.dataset.av), n: document.querySelectorAll('#pscroll .av-opt').length, by: (document.querySelector('#pscroll .av-opt[disabled] small') || {}).textContent }));
  check('בוחר עם כל הדמויות, 🦋 תפוס ע"י אליס', pk.n === AV_N && JSON.stringify(pk.dis) === '[0]' && pk.by === 'אליס', JSON.stringify(pk));
  await B.ev(() => document.querySelector('#pscroll .av-opt[data-av="0"]').click()); await sleep(200);
  check('אי אפשר לבחור דמות תפוסה', await B.ev(() => myAvatar() !== 0));
  await B.page.click('#pscroll .av-opt[data-av="4"]'); await sleep(300);
  check('בחירה חופשית של דמות פנויה (🍄)', await B.ev(() => S.avatar.i === 4 && !S.avatar.auto && document.querySelector('.prof-id .av-edit').textContent.includes('🍄')));
  if (process.env.SHOTS) await B.page.screenshot({ path: process.env.SHOTS + '/v-avatar.png' });
  await B.ev(() => { popLayer(); cloudNow(); }); await sleep(2500);
  // אליס מחליפה דמות → אצל בוב מתעדכן
  await A.ev(() => { setMyAvatar(5); cloudNow(); }); await sleep(2500);
  await B.ev(() => refreshFriends(true)); await sleep(1200);
  check('אליס החליפה ל-🌊 → אצל בוב מתעדכן', await B.ev(() => S.friends[0].emoji === '🌊'));
  // התנגשות (קיבלו אותה דמות לפני שידעו): מי שהיה ראשון שומר – גם אם קיבל אוטומטית
  await B.ev(() => { S.avatar = { i: 7, auto: true, at: Date.now() - 60000 }; save(); cloudNow(); }); await sleep(2500);
  await A.ev(() => { S.avatar = { i: 7, auto: false, at: Date.now() }; save(); cloudNow(); }); await sleep(2500);
  await A.ev(() => refreshFriends(true)); await sleep(1500);
  await B.ev(() => refreshFriends(true)); await sleep(1500);
  const cf1 = { a: await A.ev(() => myAvatar()), b: await B.ev(() => myAvatar()) };
  check('בוב קיבל 🐢 אוטומטית ראשון – שומר; אליס (בחרה אחריו) עוברת', cf1.b === 7 && cf1.a !== 7, JSON.stringify(cf1));
  // זמן זהה – רק אחד מוותר
  const T = Date.now() - 1000;
  await A.ev(t => { S.avatar = { i: 8, auto: true, at: t }; save(); cloudNow(); }, T);
  await B.ev(t => { S.avatar = { i: 8, auto: true, at: t }; save(); cloudNow(); }, T); await sleep(2500);
  await A.ev(() => refreshFriends(true)); await B.ev(() => refreshFriends(true)); await sleep(1500);
  const cf2 = { a: await A.ev(() => myAvatar()), b: await B.ev(() => myAvatar()) };
  check('אותו זמן בדיוק – רק בוב (מזהה גדול) מוותר', cf2.a === 8 && cf2.b !== 8, JSON.stringify(cf2));
  // אצלי – לכל אחד דמות ייחודית, גם אם שני חברים בחרו אותה דמות
  await B.ev(() => { setMyAvatar(4); upsertFriend({ name: 'דנה', picks: {}, avatar: 8 }); }); await sleep(300);
  const looks = await B.ev(() => [meLook().emoji, ...S.friends.map(f => f.emoji)]);
  check('לכל אחד דמות ייחודית אצלי', new Set(looks).size === looks.length, looks.join(' '));
  check('הדמות בגיבוי', await (async () => { await B.ev(() => cloudNow()); await sleep(2500); const st = await srv(); return st.docs['uid-bob'].state.avatar && st.docs['uid-bob'].state.avatar.i === 4; })());
  await B.ev(() => { S.friends = []; save(); });
  await A.ev(() => { S.friends = []; save(); });

  // ───── לינק שיתוף: חבר חדש לוחץ על לינק ─────
  await A.ev(() => { S.picks[BY_START[3].id] = 2; save(); cloudNow(); }); await sleep(2500);
  const link = await A.ev(() => shareLink(encodeShare(S.name, S.picks, cloudAuth.uid)));
  const AN = await A.ev(() => Object.keys(S.picks).length);
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
  check('לחיצה אחת → אליס נוספה עם לוז חי', c2.fr.length === 1 && c2.fr[0][1] === 'uid-alice' && c2.fr[0][2] === AN, JSON.stringify(c2.fr));
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
  check('מיזוג ממסך ההזמנה', await C.ev(n => Object.keys(S.picks).length === n, AN));
  if (process.env.SHOTS) await C.page.screenshot({ path: process.env.SHOTS + '/inv-after.png' }).catch(() => {});
  if (C.errors.length) A.errors.push(...C.errors);

  // התנתקות / החלפת חשבון מהפרופיל
  await C.ev(() => { profFold.account = true; setTab('profile'); }); await sleep(300);
  check('בפרופיל: "התנתקות / התחברות עם חשבון אחר"', await C.ev(() => !!document.querySelector('#pscroll [data-a="signout"]')));
  await C.page.click('#pscroll [data-a="signout"]'); await sleep(800);
  check('התנתקות – מסך ההתחברות חוזר, הנתונים נשארים', await C.ev(() => !cloudAuth && !!document.querySelector('.welcome') && S.friends.length === 1));
  // חיפושים אחרונים מסתנכרנים בין המכשירים של אותו משתמש
  await A.ev(() => { ensureGear(); S.gear = S.gear.filter(g => g.id !== 'd0-0'); S.gear.find(g => g.id === 'd0-1').packed = true; S.gear.push({ id: 'utest', cat: 'ישיבה', text: 'ערסל', o: 99 }); save(); rememberSearch('אביב'); rememberSearch('נונו'); cloudNow(); }); await sleep(2500);
  const A2 = await device('A2');
  await A2.ev(() => onGoogleCredential({ credential: 'user:alice' })); await sleep(3000);
  await A.ev(() => { S.picks = { [BY_START[20].id]: 2 }; save(); cloudNow(); }); await sleep(3000);
  const stA = (await srv()).stats;
  await A2.ev(() => { lastPull = 0; pullCloud(); }); await sleep(3000);
  check('מכשיר שני של אותו משתמש – לא סופר את אותו לוז שוב', JSON.stringify((await srv()).stats) === JSON.stringify(stA) && stA.u === 1, JSON.stringify(stA));
  const rec2 = await A2.ev(() => S.recent || []);
  check('חיפושים אחרונים עוברים למכשיר אחר של אותו משתמש', rec2[0] === 'נונו' && rec2[1] === 'אביב', JSON.stringify(rec2));
  const g2 = await A2.ev(() => { ensureGear(); return { hasTent: S.gear.some(g => g.id === 'd0-0'), packed: (S.gear.find(g => g.id === 'd0-1') || {}).packed, hammock: S.gear.some(g => g.text === 'ערסל'), n: S.gear.length }; });
  check('רשימת ציוד במכשיר אחר: מה שנמחק לא חוזר, הסימון והפריט החדש עברו', !g2.hasTent && g2.packed === true && g2.hammock && g2.n === 71, JSON.stringify(g2));
  await A2.browser.close();

  // ───── שיתוף רשימת ציוד כלינק: חבר טוען אותה בול ─────
  await A.ev(() => { S.gearCats = [...(S.gearCats || []), { name: 'צילום', o: 1 }]; S.gear.push({ id: 'ucam', cat: 'צילום', text: 'מצלמה', o: 1 }); S.gear.find(g => g.id === 'd1-0').packed = true; save(); });
  const gLink = await A.ev(() => SITE_URL + '#GEAR=' + gearCode());
  const aList = await A.ev(() => gearCats().map(c => [c, gearList().filter(g => g.cat === c).sort((x, y) => x.o - y.o).map(g => g.text)]).filter(([c, i]) => i.length));
  await B.ev(() => { ensureGear(); S.gear.push({ id: 'ubob', cat: 'ישיבה', text: 'פוף', o: 50 }); save(); });
  await B.page.goto('about:blank'); await B.page.goto(gLink.replace('https://tom-lev.github.io/indienegev-2026/', 'http://localhost:8765/'), { waitUntil: 'load' }); await sleep(2500);
  check('לינק רשימת ציוד – "אליס שיתף/ה איתך רשימת ציוד"', await B.ev(() => /אליס שיתף\/ה איתך רשימת ציוד/.test((document.querySelector('.panel .invite h2') || {}).textContent || '') && location.hash === ''));
  await B.page.click('.panel [data-gi="replace"]'); await sleep(1500);
  const bList = await B.ev(() => gearCats().map(c => [c, gearList().filter(g => g.cat === c).sort((x, y) => x.o - y.o).map(g => g.text)]).filter(([c, i]) => i.length));
  check('"לטעון בדיוק": הרשימה זהה לשל אליס (כולל קטגוריה שהוסיפה)', JSON.stringify(bList) === JSON.stringify(aList), `${bList.length} קטגוריות`);
  check('בלי סימוני "ארזתי" של אליס, והפריט "פוף" של בוב הוחלף', await B.ev(() => !gearList().some(g => g.packed) && !gearList().some(g => g.text === 'פוף')));
  check('אחרי הטעינה – נפתחת הרשימה', await B.ev(() => /רשימת ציוד/.test((document.querySelector('.panel h2') || {}).textContent || '')));
  await B.ev(() => closeAllLayers()); await sleep(500);
  await B.ev(() => { S.gear = S.gear.filter(g => g.text !== 'מצלמה'); S.gear.push({ id: 'ubob2', cat: 'ישיבה', text: 'פוף', o: 50 }); save(); });
  await B.page.goto('about:blank'); await B.page.goto(gLink.replace('https://tom-lev.github.io/indienegev-2026/', 'http://localhost:8765/'), { waitUntil: 'load' }); await sleep(2500);
  await B.page.click('.panel [data-gi="merge"]'); await sleep(1500);
  check('"להוסיף רק מה שחסר": "מצלמה" חזרה, "פוף" של בוב נשאר, בלי כפילויות', await B.ev(() => gearList().filter(g => g.text === 'מצלמה').length === 1 && gearList().some(g => g.text === 'פוף') && gearList().filter(g => g.text === 'שק שינה').length === 1));
  await B.ev(() => closeAllLayers()); await sleep(500);
  check('אין שגיאות JS', !A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(0);
})();
