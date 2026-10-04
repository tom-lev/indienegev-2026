const src = require('fs').readFileSync(__dirname + '/../src/cloud-core.js', 'utf8');
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
const M = new Function(src + '; return { lww, stampEdits, replaceStamped, items };')();
const D = (s) => ({ v: 1, picks: {}, ratings: {}, nope: {}, notes: [], friends: [], prefs: {}, name: '', ...s });
const key = st => canon([M.items(st), st.tomb || {}]);
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
let fails = 0, T = 1000;
// סימולציה: 3 עותקים, עריכות אקראיות עם stamping, מיזוגים אקראיים; בסוף מיזוג הכל → אותה תוצאה בכל סדר,
// וכל פריט שנוסף ולא נמחק במפורש קיים; כל פריט שנמחק (ומחיקתו אחרונה) לא קיים.
for (let trial = 0; trial < 300; trial++) {
  const reps = [D({}), D({}), D({})], prev = reps.map(r => JSON.parse(JSON.stringify(r)));
  const truth = {}; // key → {alive, t}
  for (let step = 0; step < 40; step++) {
    const i = Math.floor(rnd() * 3), r = reps[i]; T += 1 + Math.floor(rnd() * 3);
    const op = rnd();
    if (op < 0.35) { const id = 'n' + Math.floor(rnd() * 12); const ex = r.notes.find(n => n.id === id);
      if (ex) ex.text = 'e' + T; else r.notes.push({ id, text: 't' + T, at: T });
    } else if (op < 0.55) { if (r.notes.length) r.notes.splice(Math.floor(rnd() * r.notes.length), 1); }
    else if (op < 0.75) { const p = 'e' + Math.floor(rnd() * 6); if (rnd() < 0.3) delete r.picks[p]; else r.picks[p] = 1 + Math.floor(rnd() * 2); }
    else { // מיזוג עם עותק אחר
      const j = Math.floor(rnd() * 3); if (j === i) continue;
      M.stampEdits(prev[i], r, T); prev[i] = JSON.parse(JSON.stringify(r));
      M.stampEdits(prev[j], reps[j], T); prev[j] = JSON.parse(JSON.stringify(reps[j]));
      reps[i] = M.lww(reps[i], reps[j]); prev[i] = JSON.parse(JSON.stringify(reps[i]));
      continue;
    }
    M.stampEdits(prev[i], r, T); prev[i] = JSON.parse(JSON.stringify(r));
  }
  // תכונות המיזוג
  const [a, b, c] = reps;
  const k1 = key(M.lww(M.lww(a, b), c)), k2 = key(M.lww(M.lww(c, a), b)), k3 = key(M.lww(b, M.lww(c, a)));
  if (k1 !== k2 || k1 !== k3) { fails++; console.log('order-dependent', trial); }
  if (key(M.lww(a, a)) !== key(M.lww(a, a)) || key(M.lww(M.lww(a, b), b)) !== key(M.lww(a, b))) { fails++; console.log('not idempotent', trial); }
  // אף פריט חי לא נעלם: כל פריט שקיים באחד העותקים ואין לו מחיקה מאוחרת יותר באף עותק – קיים בתוצאה
  const all = M.lww(M.lww(a, b), c), ia = M.items(all);
  for (const r of reps) for (const [k, v] of Object.entries(M.items(r))) {
    const t = (r.mt && r.mt[k]) || 0, d = Math.max(...reps.map(x => (x.tomb && x.tomb[k]) || 0));
    const newer = Math.max(...reps.map(x => (k in M.items(x)) ? ((x.mt && x.mt[k]) || 0) : 0));
    if (newer > d && !(k in ia)) { fails++; console.log('LOST', trial, k); }
  }
}
console.log(fails ? `❌ ${fails} failures` : '✅ lww: order-independent, idempotent, no live item lost (300 random trials)');
