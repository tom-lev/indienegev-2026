/* מבחן עומס: מחשב + טלפון (+ לשונית שנייה במחשב) פתוחים בו-זמנית, פעולות אקראיות, ניתוקי קליטה,
   יציאה מהאפליקציה, רענונים, סגירה ופתיחה. בסוף – כל המכשירים והענן חייבים להכיל בדיוק את מה שהמשתמש השאיר:
   שום פריט שנוסף לא נעלם, ושום פריט שנמחק לא חוזר.
   כדי שיהיה "מצב צפוי" חד-משמעי, כל מכשיר עורך רק פריטים משלו (פתקים עם קידומת, הופעות מקבוצה משלו).
   הרצה: node stress.js [seed] [rounds]   (צריך את fakebase.py על 8766 ואת האפליקציה על 8765, בנויה עם cloud-test-config) */
const puppeteer = require('puppeteer-core');
const APP = 'http://localhost:8765/', FB = 'http://localhost:8766';
const SEED = +process.argv[2] || 1, ROUNDS = +process.argv[3] || 60;
const SEED_U = process.env.PARALLEL ? String(SEED) : '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ctl = c => fetch(FB + '/ctl', { method: 'POST', body: JSON.stringify(c) }).then(r => r.json());
const srv = () => fetch(FB + '/state', { method: 'POST' }).then(r => r.json());
let rs = SEED * 9301 + 49297;
const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
const pick = a => a[Math.floor(rnd() * a.length)];

const EVENTS = { A: ['thu-kof-1800', 'thu-kof-1900', 'thu-kof-2000', 'thu-kof-2100', 'fri-kof-1000', 'fri-kof-1100'],
                 B: ['sat-kof-0900', 'sat-kof-1000', 'sat-kof-1100', 'sat-kof-1200', 'fri-pil-0930', 'fri-pil-1030'] };

(async () => {
  if (!process.env.PARALLEL) await ctl({ reset: true });
  const launch = async label => puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: `C:/Users/tomer/AppData/Local/Temp/claude/stx/${label}${SEED}_${process.pid}_${Math.random().toString(36).slice(2)}`, protocolTimeout: 120000 });
  const bA = await launch('A'), bB = await launch('B');
  const errs = [];
  const openTab = async (browser, name) => {
    const p = await browser.newPage();
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    p.on('dialog', d => d.accept());
    await p.goto(APP, { waitUntil: 'load' }); await p.evaluate(() => navigator.serviceWorker.ready); await sleep(700);
    return p;
  };
  const tabs = { A1: await openTab(bA, 'A1'), A2: null, B: await openTab(bB, 'B') };
  await tabs.A1.evaluate(u => onGoogleCredential({ credential: 'user:tomer' + u }), SEED_U); await sleep(2000);
  await tabs.B.evaluate(u => onGoogleCredential({ credential: 'user:tomer' + u }), SEED_U); await sleep(2000);
  tabs.A2 = await openTab(bA, 'A2'); // לשונית שנייה במחשב (כמו אפליקציה מותקנת + לשונית)

  // המצב הצפוי לכל מכשיר (בעלות על פריטים)
  const exp = { A: { notes: {}, picks: {} }, B: { notes: {}, picks: {} } };
  const devOf = t => t[0];
  let nid = 0, ops = [], firstBad = null;
  const offline = { A: false, B: false };

  for (let i = 0; i < ROUNDS; i++) {
    const t = pick(['A1', 'A1', 'A2', 'B', 'B']);
    const d = devOf(t), page = tabs[t], e = exp[d];
    const r = rnd();
    try {
      if (r < 0.30) { // פתק חדש
        const id = `${d}${++nid}`, text = `${d} פתק ${nid}`;
        await page.evaluate((id, text) => { S.notes.push({ id, ev: 'thu-kof-2200', text, at: Date.now() }); save(); }, id, text);
        e.notes[id] = text; ops.push(`${t} add ${id}`);
      } else if (r < 0.42 && Object.keys(e.notes).length) { // עריכת פתק שלי
        const id = pick(Object.keys(e.notes)), text = e.notes[id] + ' ✎';
        const ok = await page.evaluate((id, text) => { const n = S.notes.find(n => n.id === id); if (!n) return false; n.text = text; n.edited = Date.now(); save(); return true; }, id, text);
        if (ok) { e.notes[id] = text; ops.push(`${t} edit ${id}`); } else ops.push(`${t} edit ${id} MISSING-LOCALLY`);
      } else if (r < 0.52 && Object.keys(e.notes).length) { // מחיקת פתק שלי
        const id = pick(Object.keys(e.notes));
        await page.evaluate(id => { S.notes = S.notes.filter(n => n.id !== id); save(); }, id);
        delete e.notes[id]; ops.push(`${t} del ${id}`);
      } else if (r < 0.66) { // הופעה: הוספה/שינוי/הסרה
        const ev = pick(EVENTS[d]), lv = pick([0, 1, 2]);
        await page.evaluate((ev, lv) => { if (lv) S.picks[ev] = lv; else delete S.picks[ev]; save(); }, ev, lv);
        if (lv) e.picks[ev] = lv; else delete e.picks[ev];
        ops.push(`${t} pick ${ev}=${lv}`);
      } else if (r < 0.74) { // קליטה נעלמת/חוזרת במכשיר
        offline[d] = !offline[d];
        for (const tt of Object.keys(tabs)) if (devOf(tt) === d) await tabs[tt].setOfflineMode(offline[d]);
        ops.push(`${d} ${offline[d] ? 'offline' : 'online'}`);
      } else if (r < 0.82) { // יציאה מהאפליקציה וחזרה (keepalive + pull)
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await sleep(300);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); lastPull = 0; document.dispatchEvent(new Event('visibilitychange')); });
        ops.push(`${t} hide/show`);
      } else if (r < 0.88) { // רענון (כמו "יש גרסה חדשה")
        await page.reload({ waitUntil: 'load' }); await sleep(600);
        if (offline[d]) await page.setOfflineMode(true);
        ops.push(`${t} reload`);
      } else if (r < 0.93) { // אין קליטה בכלל לכמה שניות (גם לרקע)
        if (!process.env.PARALLEL) { await ctl({ down: true }); await sleep(1500); await ctl({ down: false }); }
        else { for (const tt of Object.keys(tabs)) await tabs[tt].setOfflineMode(true); await sleep(1500); for (const tt of Object.keys(tabs)) await tabs[tt].setOfflineMode(offline[devOf(tt)]); }
        ops.push(`server down 1.5s`);
      } else { // סגירה ופתיחה של הלשונית
        await page.close(); await sleep(400);
        tabs[t] = await openTab(t[0] === 'A' ? bA : bB, t);
        if (offline[d]) await tabs[t].setOfflineMode(true);
        ops.push(`${t} close/reopen`);
      }
    } catch (err) { errs.push(`op ${i} ${t}: ${err.message}`); }
    await sleep(150 + rnd() * 900);
    if (process.env.TRACE && !firstBad) { // אינווריאנט: כל לשונית של מכשיר מחזיקה את כל הפריטים של המכשיר עצמו, בטקסט העדכני
      for (const tt of Object.keys(tabs)) {
        const dd = devOf(tt), mine = exp[dd].notes;
        const have = await tabs[tt].evaluate(() => Object.fromEntries(S.notes.map(n => [n.id, n.text])));
        const bad = Object.keys(mine).filter(id => have[id] !== mine[id]).map(id => `${id}:${have[id] === undefined ? 'MISSING' : 'STALE'}`);
        const extra = Object.keys(have).filter(id => id.startsWith(dd) && !(id in mine));
        if (bad.length || extra.length) { firstBad = `after op ${i} [${ops[ops.length - 1]}] tab ${tt}: ${bad.join(',')} ${extra.length ? 'resurrected ' + extra : ''}`; break; }
      }
    }
  }

  // התייצבות: הכל מחובר, כל לשונית מסנכרנת כמה פעמים
  await ctl({ down: false });
  for (const tt of Object.keys(tabs)) await tabs[tt].setOfflineMode(false);
  for (let k = 0; k < 3; k++) {
    for (const tt of Object.keys(tabs)) { await tabs[tt].evaluate(() => { lastPull = 0; return cloudNow(); }); await sleep(800); }
  }
  await sleep(1500);

  const norm = st => ({ notes: Object.fromEntries((st.notes || []).map(n => [n.id, n.text]).sort()), picks: Object.fromEntries(Object.entries(st.picks || {}).sort()) });
  const expected = { notes: Object.fromEntries(Object.entries({ ...exp.A.notes, ...exp.B.notes }).sort()), picks: Object.fromEntries(Object.entries({ ...exp.A.picks, ...exp.B.picks }).sort()) };
  const states = {};
  for (const tt of Object.keys(tabs)) states[tt] = norm(await tabs[tt].evaluate(() => JSON.parse(JSON.stringify(S))));
  states.cloud = norm((await srv()).docs['uid-tomer' + SEED_U].state);
  const E = JSON.stringify(expected);
  let ok = true;
  for (const [k, v] of Object.entries(states)) {
    if (JSON.stringify(v) !== E) {
      ok = false;
      const lostN = Object.keys(expected.notes).filter(id => !(id in v.notes));
      const extraN = Object.keys(v.notes).filter(id => !(id in expected.notes));
      const wrongT = Object.keys(expected.notes).filter(id => id in v.notes && v.notes[id] !== expected.notes[id]);
      const pk = JSON.stringify(v.picks) !== JSON.stringify(expected.picks) ? ` picks:${JSON.stringify(v.picks)} vs ${JSON.stringify(expected.picks)}` : '';
      console.log(`❌ ${k}: lost ${lostN.join(',') || '-'} | resurrected ${extraN.join(',') || '-'} | stale text ${wrongT.join(',') || '-'}${pk}`);
    }
  }
  const guards = await tabs.A1.evaluate(async () => ((await CC.get('synclog')) || []).filter(l => l.guard).length);
  console.log(`seed ${SEED}: ${ROUNDS} ops, notes ${Object.keys(expected.notes).length}, picks ${Object.keys(expected.picks).length} → ${ok ? '✅ ALL CONSISTENT, NOTHING LOST' : '❌ MISMATCH'} | guards fired on A: ${guards} | js errors: ${errs.length}`);
  if (firstBad) console.log('FIRST BREAK:', firstBad);
  if (!ok || errs.length) { console.log(errs.slice(0, 5).join('\n')); console.log(ops.slice(-25).join(' ; ')); }
  await bA.close(); await bB.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
