/* מסך מפה: זום ו-pan במגע, טבעת פועמת סביב הבמה בניווט */

const MAP_W = ASSETS.mapW, MAP_H = ASSETS.mapH;
const map = { s: 0, x: 0, y: 0, vw: 0, vh: 0, min: 0.1, max: 2.2 };
let mapFocus = null;      // { ev } מניווט להופעה, או { dest } מניווט שהתחיל בטאב המפה
let mapFocusLayer = null;
let mapPrevTab = 'mine';
let leavingMap = false;

/* "איפה אני": נקודות מוצא אפשריות = במות + נקודות ציון */
const PLACES = [
  ...STAGES.map(st => ({ id: st.id, name: st.name, icon: st.icon, mapX: st.mapX, mapY: st.mapY, color: st.color })),
  ...LANDMARKS,
];
const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p]));
let routeFrom = null; // מזהה נקודת המוצא בניווט הנוכחי
let picking = false;  // false | 'from' ("איפה אני") | 'dest' (יעד) | 'tent' (סימון האוהל)
const placeXY = p => ({ x: p.mapX / 100 * MAP_W, y: p.mapY / 100 * MAP_H });
/* קטגוריות למקרא הלחיץ (וסינון הנקודות בזמן בחירה) */
const CATS = [
  { id: 'wc', label: 'שירותים', icon: '🚻', near: 'השירותים הקרובים' },
  { id: 'water', label: 'ברזיות', icon: '💧', near: 'הברזייה הקרובה' },
  { id: 'shower', label: 'מקלחות', icon: '🚿', near: 'המקלחות הקרובות' },
  { id: 'cook', label: 'בישול', icon: '🍳', near: 'מתחם הבישול הקרוב' },
  { id: 'food', label: 'אוכל ושתייה', icon: '🍺', near: 'האוכל והשתייה הקרובים' },
  { id: 'stage', label: 'במות', icon: '✦', near: 'הבמה הקרובה' },
  { id: 'gate', label: 'כניסות', icon: '🚪', near: 'הכניסה הקרובה' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const FOOD_IDS = ['food', 'bar-w', 'bar-s', 'bar-e', 'cafe', 'campbar'];
const catOf = p => p.type || (STAGE[p.id] ? 'stage' : p.id.startsWith('gate') ? 'gate' : FOOD_IDS.includes(p.id) ? 'food' : 'other');
const TAPPABLE_TYPES = ['wc', 'water', 'shower', 'cook']; // אייקונים במפה שלחיצה עליהם מנווטת אליהם
const TAPPABLE_IDS = ['info', 'cafe', 'bar-w', 'bar-s', 'bar-e', 'food', 'campbar']; // מודיעין/תקליטים, ברים, קפה אינדי, אוכל
let legendType = null; // קטגוריה שנבחרה במקרא (null = הכל)

/* "האוהל שלי" – נקודה אישית שנשמרת במכשיר ומתנהגת כמו כל נקודה אחרת במפה */
function syncTent() {
  const i = PLACES.findIndex(p => p.id === 'tent');
  if (i >= 0) PLACES.splice(i, 1);
  delete PLACE.tent;
  const t = S.prefs.tent;
  if (t) {
    PLACE.tent = { id: 'tent', name: 'האוהל שלי', icon: '🏠', mapX: t.x, mapY: t.y, color: '#f46f6a' };
    PLACES.push(PLACE.tent);
  }
}
syncTent();

/* ───────── מסלול הליכה על רשת מתוך המפה ─────────
   ASSETS.walk היא מפת ביטים (walkW×walkH תאים) שנבנתה מתמונת המפה ב-walkgrid.py:
   צהוב/ירוק = הליכה, איורים/גדרות/נהר = חסום, והגדר נחצית רק בכניסות האמיתיות.
   המסלול = A* עם "קנס" על קרבה למכשולים, כך שהוא עובר באמצע מעברים ופתחים ולא צמוד לגדר. */
const WALK = (() => {
  const GW = ASSETS.walkW, GH = ASSETS.walkH, N = GW * GH;
  const fb = Uint8Array.from(atob(ASSETS.fest), c => c.charCodeAt(0));
  const fest = new Uint8Array(N);
  for (let i = 0; i < N; i++) fest[i] = (fb[i >> 3] >> (7 - (i & 7))) & 1;
  const bytes = Uint8Array.from(atob(ASSETS.walk), c => c.charCodeAt(0));
  const ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) ok[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;

  // משאירים רק את השטח הרציף הגדול (איים קטנים בין אותיות של שלטים לא שימושיים)
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  const q = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!ok[s] || comp[s] >= 0) continue;
    let h = 0, t = 0;
    q[t++] = s; comp[s] = id;
    while (h < t) {
      const c = q[h++], x = c % GW, y = (c / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (ok[n] && comp[n] < 0) { comp[n] = id; q[t++] = n; }
      }
    }
    if (t > bestSize) { bestSize = t; best = id; }
    id++;
  }
  const main = new Uint8Array(N);
  for (let i = 0; i < N; i++) main[i] = comp[i] === best ? 1 : 0;

  // מרחק (בתאים) מהמכשול הקרוב – BFS מכל התאים החסומים
  const dist = new Float32Array(N).fill(1e9);
  let h = 0, t = 0;
  for (let i = 0; i < N; i++) if (!main[i]) { dist[i] = 0; q[t++] = i; }
  while (h < t) {
    const c = q[h++], x = c % GW, y = (c / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx, nd = dist[c] + (dx && dy ? 1.414 : 1);
      if (nd < dist[n]) { dist[n] = nd; q[t++] = n; }
    }
  }
  /* "מרכזיות": כמה התא רחוק מקו האמצע של השביל המקומי, יחסית לרוחב השביל (0 = באמצע, 1 = בשוליים).
     כך שביל צר ושביל רחב עולים אותו דבר באמצע שלהם – לא עושים סיבוב כדי ללכת בשביל רחב. */
  const R = 10, tmp = new Float32Array(N), ridge = new Float32Array(N), off = new Float32Array(N);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let m = 0;
    for (let k = Math.max(0, x - R); k <= Math.min(GW - 1, x + R); k++) { const v = dist[y * GW + k]; if (v > m && v < 1e8) m = v; }
    tmp[y * GW + x] = m;
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let m = 0;
    for (let k = Math.max(0, y - R); k <= Math.min(GH - 1, y + R); k++) { const v = tmp[k * GW + x]; if (v > m) m = v; }
    ridge[y * GW + x] = m;
  }
  for (let i = 0; i < N; i++) if (main[i]) off[i] = ridge[i] > 0 ? Math.max(0, 1 - dist[i] / ridge[i]) : 0;
  return { GW, GH, main, dist, fest, off, cell: ASSETS.walkCell * MAP_W / ASSETS.walkBase };
})();

const PREFERRED_CLEARANCE = 10; // תאים: בקיצור המסלול לקווים ישרים – לא מתקרבים לשוליים יותר מהמסלול המקורי
const CENTER_WEIGHT = 1.2;      // קנס על התרחקות מאמצע השביל (יחסית לרוחבו)

function cellOf(p) {
  return [Math.min(WALK.GW - 1, Math.max(0, Math.floor(p.x / WALK.cell))),
    Math.min(WALK.GH - 1, Math.max(0, Math.floor(p.y / WALK.cell)))];
}
/* התא הקרוב ביותר בשטח ההליכה (נקודות שיושבות על איור/שלט) */
function snapCell(p) {
  const [cx, cy] = cellOf(p);
  let bestI = -1, bestD = 1e9;
  for (let r = 0; r < 80 && bestI < 0; r++) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= WALK.GW || y >= WALK.GH) continue;
      const i = y * WALK.GW + x;
      if (!WALK.main[i]) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) { bestD = d; bestI = i; }
    }
  }
  return bestI;
}

const FEST_COST = 6; // פי כמה יקר לעבור במתחם ההופעות כשההתחלה והיעד שניהם מחוצה לו
/* plain = אורך טהור (לבדיקות): בלי העדפת מרכז השביל; מתחם ההופעות חסום כשההתחלה והיעד מחוצה לו */
function astar(s, g, plain = false) {
  const avoidFest = !WALK.fest[s] && !WALK.fest[g];
  const { GW, GH, main, dist } = WALK, N = GW * GH;
  const cost = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const gx = g % GW, gy = (g / GW) | 0;
  const heur = i => Math.hypot(i % GW - gx, ((i / GW) | 0) - gy);
  // ערימה בינארית פשוטה
  const heap = [], pri = [];
  const push = (i, p) => {
    heap.push(i); pri.push(p);
    let k = heap.length - 1;
    while (k > 0) {
      const u = (k - 1) >> 1;
      if (pri[u] <= pri[k]) break;
      [heap[u], heap[k]] = [heap[k], heap[u]]; [pri[u], pri[k]] = [pri[k], pri[u]]; k = u;
    }
  };
  const pop = () => {
    const top = heap[0], lastI = heap.pop(), lastP = pri.pop();
    if (heap.length) {
      heap[0] = lastI; pri[0] = lastP;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && pri[l] < pri[m]) m = l;
        if (r < heap.length && pri[r] < pri[m]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; [pri[m], pri[k]] = [pri[k], pri[m]]; k = m;
      }
    }
    return top;
  };
  cost[s] = 0;
  push(s, heur(s));
  while (heap.length) {
    const c = pop();
    if (c === g) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const x = c % GW, y = (c / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (!main[n] || closed[n]) continue;
      const o = WALK.off[n];
      const fm = avoidFest && WALK.fest[n] ? (plain ? 1e6 : FEST_COST) : 1;
      const nc = cost[c] + (dx && dy ? 1.414 : 1) * (plain ? 1 : 1 + CENTER_WEIGHT * o * o) * fm;
      if (nc < cost[n]) { cost[n] = nc; prev[n] = c; push(n, nc + heur(n)); }
    }
  }
  if (prev[g] < 0 && s !== g) return null;
  const path = [];
  for (let c = g; c >= 0; c = prev[c]) { path.push(c); if (c === s) break; }
  return path.reverse();
}

/* קיצור המסלול לקווים ישרים, בלי להתקרב למכשולים יותר ממה שהמסלול המקורי התקרב */
function simplify(path) {
  const { GW, main, dist } = WALK;
  const xy = i => [i % GW + 0.5, ((i / GW) | 0) + 0.5];
  const lineOk = (a, b, minD) => {
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = 0; k <= n; k++) {
      const x = Math.floor(ax + (bx - ax) * k / n), y = Math.floor(ay + (by - ay) * k / n);
      const i = y * GW + x;
      if (!main[i] || dist[i] < minD) return false;
    }
    return true;
  };
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    for (; j > i + 1; j--) {
      let minOrig = Infinity;
      for (let k = i; k <= j; k++) minOrig = Math.min(minOrig, dist[path[k]]);
      if (lineOk(path[i], path[j], Math.min(minOrig, PREFERRED_CLEARANCE) - 0.01)) break;
    }
    out.push(path[j]);
    i = j;
  }
  return out.map(c => ({ x: (c % GW + 0.5) * WALK.cell, y: (((c / GW) | 0) + 0.5) * WALK.cell }));
}

// צד פנימי של כל כניסה: מסלול שעובר כאן באמת נכנס דרכה (ולא רק עובר לידה)
const GATE_POINTS = { 'gate-w': [26.5, 44.8], 'gate-s': [44.0, 62.0], 'gate-e': [65.5, 55.6], 'gate-se': [59.7, 78.4] };
const PASS_POINT = [49.3, 52.0];

function findRoute(fromId, toId) {
  const a = placeXY(PLACE[fromId]), b = placeXY(PLACE[toId]);
  const s = snapCell(a), g = snapCell(b);
  if (s < 0 || g < 0) return null;
  const path = astar(s, g);
  if (!path) return null;
  const pts = [a, ...simplify(path), b];
  // אילו כניסות/מעבר המסלול עובר, לפי סדר המעבר בהם (המקום הראשון במסלול שקרוב אליהם)
  const firstNear = ([px, py], r) => path.findIndex(c => Math.hypot(
    (c % WALK.GW + 0.5) * WALK.cell - px / 100 * MAP_W, (((c / WALK.GW) | 0) + 0.5) * WALK.cell - py / 100 * MAP_H) < r);
  const via = [];
  for (const [gid, gp] of Object.entries(GATE_POINTS)) {
    const idx = firstNear(gp, 40);
    if (idx >= 0 && gid !== fromId && gid !== toId) via.push([idx, gid]);
  }
  const passIdx = firstNear(PASS_POINT, 45);
  if (passIdx >= 0) via.push([passIdx, 'pass']);
  via.sort((x, y) => x[0] - y[0]);
  return { pts, via: via.map(x => x[1]) }; // 'pass' = המעבר בין הבמות
}

/* קו שבור עם פינות מעוגלות */
function roundedPath(pts, r = 22) {
  const f = n => n.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const ra = Math.min(r, la * 0.25) / la, rb = Math.min(r, lb * 0.25) / lb;
    const p1 = { x: p.x + (a.x - p.x) * ra, y: p.y + (a.y - p.y) * ra };
    const p2 = { x: p.x + (b.x - p.x) * rb, y: p.y + (b.y - p.y) * rb };
    d += ` L${f(p1.x)},${f(p1.y)} Q${f(p.x)},${f(p.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${f(z.x)},${f(z.y)}`;
}

/* target: הופעה (מתוך הלוז), או { dest: מזהה נקודה } (ניווט מטאב המפה) */
function navigateTo(target, opts = {}) {
  const fromTab = tab === 'map' && mapFocusLayer ? mapPrevTab : tab;
  const keepFrom = opts.keepFrom ? routeFrom : null;
  leavingMap = true; // סגירת שכבת ניווט קודמת לא צריכה להחזיר לטאב הקודם
  closeAllLayers().then(() => {
    leavingMap = false;
    mapPrevTab = fromTab;
    mapFocus = target.stage ? { ev: target } : target.nearest ? { nearest: target.nearest } : { dest: target.dest };
    routeFrom = keepFrom;
    picking = opts.pick || false;
    legendType = null;
    setTab('map');
    mapFocusLayer = pushLayer(() => {
      mapFocusLayer = null;
      mapFocus = null;
      picking = false; // לא משאירים מצב "בחירת מיקום" תקוע אחרי יציאה מהניווט
      routeFrom = null;
      if (leavingMap) leavingMap = false;
      else setTab(mapPrevTab);
    });
  });
}
/* יציאה מהמפה דרך הטאבים – מנקים את שכבת הניווט בלי לקפוץ אחורה */
function dropMapFocus() {
  if (!mapFocusLayer) return;
  leavingMap = true;
  mapFocus = null;
  popLayer();
}

const destPlace = () => !mapFocus ? null : mapFocus.ev ? PLACE[mapFocus.ev.stage] : PLACE[mapFocus.dest] || null;

/* ניווט לנקודה. בניווט פעיל שומרים את נקודת המוצא; אחרת שואלים "איפה אני" */
function goTo(id) {
  const keep = !!mapFocus && !!routeFrom && routeFrom !== id;
  if (!keep) routeFrom = null;
  navigateTo({ dest: id }, { keepFrom: keep, pick: keep ? false : 'from' });
}

/* הנקודה הקרובה ביותר מסוג מסוים, לפי אורך מסלול ההליכה (לא בקו אווירי) */
function nearestOf(type, fromId) {
  let best = null, bestLen = Infinity;
  for (const w of PLACES.filter(pl => catOf(pl) === type)) {
    if (w.id === fromId) return w.id;
    const r = findRoute(fromId, w.id);
    if (!r) continue;
    let len = 0;
    for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y);
    if (len < bestLen) { bestLen = len; best = w.id; }
  }
  return best;
}

function openTentSheet() {
  openSheet(body => {
    body.innerHTML = `<div class="ev-tags"><span class="stage" style="--c:var(--coral)">🏠 האוהל שלי</span></div>
      <h2 class="ev-name">האוהל שלי</h2>
      <p class="ev-meta">המיקום נשמר רק בטלפון הזה</p>
      <button class="btn block" data-t="go" style="margin-top:14px">${ICON.pin} ניווט לאוהל</button>
      <button class="btn coral block" data-t="share" style="margin-top:10px">${ICON.image} שליחת מפה עם האוהל לחברים</button>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn alt" data-t="move">${ICON.edit} הזזה</button>
        <button class="btn alt" data-t="del">${ICON.trash} הסרה</button>
      </div>`;
    body.onclick = e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      const a = b.dataset.t;
      if (a === 'go') goTo('tent');
      if (a === 'share') shareTentImage();
      if (a === 'move') closeAllLayers().then(() => { picking = 'tent'; updateRoute(null); });
      if (a === 'del' && confirm('להסיר את האוהל מהמפה?')) {
        delete S.prefs.tent;
        if (S.prefs.here && S.prefs.here.id === 'tent') delete S.prefs.here;
        save();
        syncTent();
        closeAllLayers().then(() => { render(); toast('האוהל הוסר'); });
      }
    };
  });
}

/* ───────── חיים על המפה ─────────
   הציפורים שבציור (נחתכו מהמפה בבנייה) – עפות על פני המפה ומנפנפות. */
function birdsHtml() {
  return (ASSETS.birds || []).map((b, i) =>
    `<div class="m-bird" style="left:${b.x}px;top:${b.y}px;width:${b.w}px"><img src="${b.src}" width="${b.w}" height="${b.h}" alt="" style="animation-delay:${-i * 0.5}s"></div>`).join('');
}
/* כל ציפור חוצה את כל המפה במסלול מתפתל משלה, בלולאה (המיקום ממשיך גם אחרי רינדור מחדש).
   כדי שזה ייראה כמו מעוף אמיתי:
   - נפנוף בפרצים: כמה משקי כנפיים ואז דאייה עם כנפיים פרושות
   - הטיה לתוך הפנייה – הציפור "נשענת" לכיוון שהמסלול פונה
   - מהירות משתנה: איטית בעלייה, מהירה בירידה
   שתי הציפורים הדומות (1, 2) עפות לאט יותר, כמו עופות דורסים שדואים. */
const BIRD_PATHS = [[-260, 230, 1, 520], [1, 110, -260, 700], [1, 330, -260, 160]]; // [x0, y0, x1, y1]; 1 = קצה ימין של המפה
const BIRD_SPEED = [40, 23.5, 20.7];  // פיקסלים במפה בשנייה (בערך)
function flyBirds(stage) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stage.querySelectorAll('.m-bird').forEach((el, i) => {
    const b = ASSETS.birds[i], p = BIRD_PATHS[i % BIRD_PATHS.length];
    const X = v => (v === 1 ? MAP_W + 260 : v);
    const [x0, y0, x1, y1] = [X(p[0]), p[1], X(p[2]), p[3]];
    const left = x1 < x0, ph = i * 1.7, N = 90;
    // נקודות המסלול
    const pt = t => [x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 5 + ph) * 140 + Math.sin(t * Math.PI * 11 + ph) * 35,
                     y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 3 + ph) * 120 + Math.cos(t * Math.PI * 8 + ph) * 45];
    const P = Array.from({ length: N + 1 }, (_, k) => pt(k / N));
    // זמן לכל קטע: אורך הקטע, ארוך יותר בעלייה וקצר יותר בירידה
    const seg = [0];
    for (let k = 1; k <= N; k++) {
      const dx = P[k][0] - P[k - 1][0], dy = P[k][1] - P[k - 1][1];
      seg.push(seg[k - 1] + Math.hypot(dx, dy) * (1 + Math.max(-0.35, Math.min(0.5, -dy / 60 * 0.6))));
    }
    const total = seg[N];
    const frames = P.map(([x, y], k) => {
      const a = P[Math.max(0, k - 1)], c = P[Math.min(N, k + 1)];
      let ang = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI;
      if (left) ang = ang > 0 ? ang - 180 : ang + 180; // הציור "מסתכל" לכיוון התנועה
      ang = Math.max(-14, Math.min(14, ang * 0.7));
      return { offset: seg[k] / total, transform: `translate(${(x - b.x).toFixed(0)}px, ${(y - b.y).toFixed(0)}px) rotate(${ang.toFixed(1)}deg)` };
    });
    const duration = total / BIRD_SPEED[i % BIRD_SPEED.length] * 1000;
    el.animate(frames, { duration, iterations: Infinity, delay: -((Date.now() + i * 37000) % duration) });
    // נפנוף בפרצים: 3–4 משקים ואז דאייה (הדומות – משקים איטיים ודאייה ארוכה)
    const img = el.querySelector('img');
    const slow = i % 3 !== 0, beats = slow ? 3 : 4, beat = slow ? 0.62 : 0.42, glide = slow ? 3.4 : 1.6;
    const cycle = beats * beat + glide, kf = [];
    for (let k = 0; k < beats; k++) {
      const t0 = k * beat / cycle;
      kf.push({ offset: t0, transform: 'scaleY(1) translateY(0)', easing: 'ease-in' });
      kf.push({ offset: t0 + beat * 0.45 / cycle, transform: 'scaleY(.32) translateY(7px)', easing: 'ease-out' });
    }
    kf.push({ offset: beats * beat / cycle, transform: 'scaleY(1) translateY(0)' });
    kf.push({ offset: (beats * beat + glide * 0.5) / cycle, transform: 'scaleY(.92) translateY(1px)' }); // דאייה – תזוזה קלה בלבד
    kf.push({ offset: 1, transform: 'scaleY(1) translateY(0)' });
    img.style.animation = 'none';
    img.animate(kf, { duration: cycle * 1000, iterations: Infinity, delay: -((Date.now() + i * 900) % (cycle * 1000)) });
  });
}
/* ───────── מטיילים בקמפינג ─────────
   4 דמויות (בסגנון הדמויות שבציור) הולכות רק על השבילים (הירוק הבהיר – רשת ההליכה), אל שירותים / בישול /
   ברזייה / מקלחות / אוהל (שוליים של גוש ירוק כהה). בהגעה "נכנסות" ונעלמות, אחרי זמן מה יוצאות וממשיכות.
   מנוע אחד לכל פריים: המיקום על המסלול, המבט (צד/מלפנים/מאחור), תמונת הצעד והשקיפות מחושבים יחד.
   תמונת הצעד נקבעת לפי המרחק שעברו (לא לפי זמן) – כך כף הרגל שעל הקרקע נשארת נעוצה במקום, בלי "מסוע". */
const WALK_SPOTS = ['wc-campw', 'wc-camps', 'wc-fam', 'wc-plus', 'wc-adama', 'wc-west', 'cook-shabbat', 'cook-campw', 'cook-camps', 'cook-acc', 'cook-fam',
  'water-campw', 'water-camp', 'water-camps', 'water-plus', 'water-adama', 'water-nw', 'water-gw', 'shower-w', 'shower-s'];
const WALK_SPEED = 17;                 // פיקסלים במפה בשנייה – טיול נינוח
const WALK_PACE = [1, 1, 0.82, 1.18, 0.95, 1.08, 0.9, 1.12, 1.05];  // 0 ו-1 זוג (אותו קצב); השאר – כל אחד בקצב שלו
const WALK_PAIR = { 1: 0 };            // מטייל 1 הולך לצד מטייל 0
const walkerAt = [];                   // תא ברשת ההליכה שבו כל מטייל נמצא (נשמר בין רינדורים)
let walkRAF = 0, tentCellsCache = null;
const wrap1 = x => x - Math.floor(x);
function walkersHtml() {
  const p = ASSETS.person;
  if (!p) return '';
  // שתי שכבות מאותה תמונה: עליונה (ראש וגוף) ותחתונה (רגליים) שמוטה לפי זווית השביל
  return Array.from({ length: p.variants || 1 }, (_, i) => {
    const hip = (p.foot - p.hipr * p.heights[i] / p.h) * 100, bg = `background-image:url(${p.src});background-size:${(p.frames + (p.idle || 0)) * 100}% ${p.rows * 100}%`;
    const balloon = (p.roam || []).includes(i)
      ? `<b class="m-balloon"><svg width="16" height="26" viewBox="-8 -24 16 26" aria-hidden="true"><path d="M0 0 Q 1.5 -6 0 -12" fill="none" stroke="#3a1c18" stroke-width=".7"/><ellipse cx="0" cy="-17.5" rx="4.3" ry="5.2" fill="#f46f6a"/><path d="M-0.9 -12.2 L0.9 -12.2 L0 -13.3 Z" fill="#f46f6a"/><ellipse cx="-1.4" cy="-19.3" rx="1" ry="1.5" fill="#fff" opacity=".45"/></svg></b>` : '';
    return `<div class="m-walker" style="width:${p.w}px;height:${p.h}px;opacity:0;--foot:${p.foot};--hip:${hip.toFixed(2)}%"><i class="up" style="${bg}"></i><i class="lo" style="${bg}"></i>${balloon}</div>`;
  }).join('');
}
/* "אוהלים": תאי שביל בקמפינג שצמודים לגוש ירוק כהה (נכנסים אליו = נכנסים לאוהל) */
function tentCells() {
  if (tentCellsCache) return tentCellsCache;
  const { GW, GH, main, dist, fest } = WALK, out = [];
  for (let y = Math.floor(GH * 0.28); y < GH * 0.96; y += 2) for (let x = Math.floor(GW * 0.04); x < GW * 0.74; x += 2) { // כל שטח הקמפינג
    const c = y * GW + x;
    if (main[c] && !fest[c] && dist[c] <= 1.5) out.push(c);
  }
  return (tentCellsCache = out);
}
/* כניסות למתחם ההופעות (מהקמפינג): נקודה מעט מחוץ לכניסה – שם נכנסים ונעלמים, ומשם יוצאים */
const WALK_GATES = ['gate-w', 'gate-s', 'gate-se'];
function gateCell(id) {
  const g = PLACE[id], inner = GATE_POINTS[id];
  if (!g || !inner) return -1;
  const out = { x: (g.mapX + (g.mapX - inner[0]) * 0.3) / 100 * MAP_W, y: (g.mapY + (g.mapY - inner[1]) * 0.3) / 100 * MAP_H }; // ממש בפתח, מהצד החיצוני
  return snapCell(out);
}
function walkSpot(not) {
  const spots = WALK_SPOTS.filter(id => PLACE[id]), tents = tentCells(), gates = WALK_GATES.filter(id => PLACE[id]);
  for (let k = 0; k < 20; k++) {
    const r = Math.random();
    const c = r < 0.15 && gates.length ? gateCell(gates[Math.floor(Math.random() * gates.length)])
      : r < 0.6 && spots.length ? snapCell(placeXY(PLACE[spots[Math.floor(Math.random() * spots.length)]]))
      : tents[Math.floor(Math.random() * tents.length)];
    if (c >= 0 && c !== not) return c;
  }
  return not;
}
/* מסיר נקודות שיוצרות קטע קצר מאוד (פחות מ-14 פיקסלים) – כל עוד הקו הישר שנוצר נשאר כולו על השביל */
function cleanRoute(pts) {
  const onPath = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let t = 0; t <= n; t++) { const c = cellOf({ x: a.x + (b.x - a.x) * t / n, y: a.y + (b.y - a.y) * t / n }); if (!WALK.main[c[1] * WALK.GW + c[0]]) return false; }
    return true;
  };
  const out = pts.slice();
  for (let changed = true; changed && out.length > 2;) {
    changed = false;
    for (let k = 1; k < out.length - 1; k++) {
      const a = out[k - 1], b = out[k], c = out[k + 1];
      if ((Math.hypot(b.x - a.x, b.y - a.y) < 14 || Math.hypot(c.x - b.x, c.y - b.y) < 14) && onPath(a, c)) { out.splice(k, 1); changed = true; break; }
    }
  }
  // גם בקצוות: קטע ראשון/אחרון קצר מאוד – מוותרים עליו (שם הדמות ממילא נכנסת/יוצאת בשקיפות)
  if (out.length > 2 && Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y) < 10) out.shift();
  if (out.length > 2 && Math.hypot(out[out.length - 1].x - out[out.length - 2].x, out[out.length - 1].y - out[out.length - 2].y) < 10) out.pop();
  return out;
}

/* ───────── המעשן ─────────
   יושב על כיסא ליד האוהל שלו ומעשן בלי הפסקה: מנוחה → היד עולה לפה → שאיפה (הגחלת מתלהטת) → היד יורדת → נשיפה.
   עשן דק עולה כל הזמן מקצה הסיגריה, ומשב גדול יותר יוצא מהפה אחרי כל שאיפה. */
function smokerHtml() {
  const m = ASSETS.smoker;
  if (!m) return '';
  const x = m.at[0] / 100 * MAP_W, y = m.at[1] / 100 * MAP_H;
  return `<div class="m-smoker" style="left:${(x - m.cx * m.w).toFixed(0)}px;top:${(y - m.foot * m.h).toFixed(0)}px;width:${m.w}px;height:${m.h}px">
    <i style="background-image:url(${m.src});background-size:${m.frames * 100}% ${(m.rows || 1) * 100}%"></i><b class="ember"></b></div><div class="m-smoke-layer"></div>`;
}
let smokeRAF = 0;
function smokePeople(stage) {
  cancelAnimationFrame(smokeRAF);
  const m = ASSETS.smoker, el = stage.querySelector('.m-smoker'), layer = stage.querySelector('.m-smoke-layer');
  if (!m || !el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inner = el.querySelector('i'), ember = el.querySelector('.ember'), ox = parseFloat(el.style.left), oy = parseFloat(el.style.top);
  const puff = (x, y, big) => {
    if (reduce || layer.childElementCount > 40) return;
    const p = document.createElement('i');
    p.className = 'm-smoke';
    const sz = big ? 7 + Math.random() * 3 : 3 + Math.random() * 2;
    p.style.cssText = `left:${(x - sz / 2).toFixed(1)}px;top:${(y - sz / 2).toFixed(1)}px;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px`;
    layer.append(p);
    // עשן מסתלסל: עולה לאט, מתפתל בגלים שהולכים וגדלים, מסתובב, מתרחב ונעלם
    const drift = (Math.random() - 0.35) * (big ? 18 : 10), up = 34 + Math.random() * 20, dur = (big ? 5200 : 4400) + Math.random() * 1400;
    const ph = Math.random() * Math.PI * 2, turns = 1.6 + Math.random() * 0.8, op0 = big ? 0.55 : 0.45, N = 8, kf = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N, curl = Math.sin(ph + u * turns * Math.PI * 2) * (2 + 9 * u);
      kf.push({ offset: u, transform: `translate(${(drift * u + curl).toFixed(1)}px, ${(-up * (1 - (1 - u) * (1 - u) * 0.35) * u).toFixed(1)}px) rotate(${(u * 160).toFixed(0)}deg) scale(${(0.5 + u * (big ? 2.2 : 1.7)).toFixed(2)})`,
        opacity: (op0 * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85)).toFixed(3) });
    }
    p.animate(kf, { duration: dur, easing: 'linear' }).onfinish = () => p.remove();
  };
  // מחזור עישון אחד (שניות): מנוחה, הרמה, שאיפה, הורדה. מדי כמה מחזורים – קם, מעשן בעמידה, ומתיישב
  const rowY = r => `${((m.rows || 1) > 1 ? r / (m.rows - 1) * 100 : 0).toFixed(1)}%`;
  let pose = 'sit', cyc = null, t0 = performance.now(), nextPuff = 0, exhaled = false, left = 3 + Math.floor(Math.random() * 4), tr0 = 0;
  const newCycle = (t, standing) => { cyc = { rest: standing ? 1.2 + Math.random() * 1.5 : 3 + Math.random() * 3, up: 0.9, hold: 1.1 + Math.random() * 0.6, down: 0.9 }; t0 = t; exhaled = false; };
  const RISE = 1.4; // שניות לקום / לשבת
  const tick = t => {
    if (!document.contains(stage)) return;
    if (!cyc) newCycle(t, false);
    let row = pose === 'stand' ? 1 : 0, f = 0, a = 0;
    if (pose === 'rise' || pose === 'lower') {
      // קם (או מתיישב – אותן תמונות בסדר הפוך)
      const u = Math.min(1, (t - tr0) / 1000 / RISE);
      row = 2; f = Math.round((pose === 'rise' ? u : 1 - u) * (m.frames - 1));
      if (u >= 1) { pose = pose === 'rise' ? 'stand' : 'sit'; left = pose === 'stand' ? 1 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 4); newCycle(t, pose === 'stand'); }
    } else {
      const s = (t - t0) / 1000, c = cyc;
      if (s < c.rest) a = 0;
      else if (s < c.rest + c.up) a = (s - c.rest) / c.up;
      else if (s < c.rest + c.up + c.hold) a = 1;
      else if (s < c.rest + c.up + c.hold + c.down) a = 1 - (s - c.rest - c.up - c.hold) / c.down;
      else if (--left <= 0) { pose = pose === 'sit' ? 'rise' : 'lower'; tr0 = t; a = 0; }  // מספיק – קם / מתיישב
      else { newCycle(t, pose === 'stand'); a = 0; }
      f = Math.round(a * (m.frames - 1));
      // נשיפה: כשהיד יורדת – כמה משבים גדולים מהפה
      if (!exhaled && s > c.rest + c.up + c.hold + c.down * 0.4 && s < c.rest + c.up + c.hold + c.down) {
        exhaled = true;
        const mo = m.mouths ? m.mouths[row] : m.mouth;
        for (let k = 0; k < 4; k++) setTimeout(() => document.contains(stage) && puff(ox + mo[0] + 2, oy + mo[1], true), k * 170);
      }
    }
    inner.style.backgroundPosition = `${-f * m.w}px ${rowY(row)}`;
    const tip = (m.rows ? m.tips[row] : m.tips)[f], inhale = a === 1;
    // רק הגחלת זוהרת (ומתלהטת בשאיפה) – לא כל הדמות
    ember.style.transform = `translate(${tip[0].toFixed(1)}px, ${tip[1].toFixed(1)}px)`;
    ember.classList.toggle('hot', inhale);
    if (t >= nextPuff) { puff(ox + tip[0], oy + tip[1], false); nextPuff = t + (inhale ? 700 : 420 + Math.random() * 200); }
    smokeRAF = requestAnimationFrame(tick);
  };
  smokeRAF = requestAnimationFrame(tick);
}

function walkPeople(stage) {
  cancelAnimationFrame(walkRAF);
  const P = ASSETS.person;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !P) return;
  const W = [...stage.querySelectorAll('.m-walker')].map((el, i) => ({
    el, i, up: el.querySelector('.up'), lo: el.querySelector('.lo'), balloon: el.querySelector('.m-balloon'), a: P.a * P.heights[i], hipPx: P.hipr * P.heights[i], kx: 0, ky: 0,
    speed: WALK_SPEED * (WALK_PACE[i] || 1), roam: (P.roam || []).includes(i), born: 0,
    state: 'idle', wait: performance.now() + 600 + i * 2500, at: walkerAt[i] >= 0 ? walkerAt[i] : walkSpot(-1),
    phase: Math.random(), s: 0, view: 0, dir: 1, pose: -1,
  }));
  W.forEach(w => { if (WALK_PAIR[w.i] !== undefined) w.lead = W[WALK_PAIR[w.i]]; });
  walkPeople.W = W; // לבדיקות
  const rowY = (i, v) => `${((3 * i + v) / (P.rows - 1) * 100).toFixed(3)}%`;
  const fade = w => w.speed * 1.3; // "נבלע" / "יוצא" לאורך כשנייה של הליכה
  const farSpot = from => {
    const { GW } = WALK, fx = from % GW, fy = (from / GW) | 0;
    let best = -1, bd = -1;
    for (let k = 0; k < 8; k++) { const c = walkSpot(from), d = Math.hypot(c % GW - fx, ((c / GW) | 0) - fy); if (d > bd) { bd = d; best = c; } }
    return best;
  };
  const nearestWc = from => {
    const { GW } = WALK, fx = from % GW, fy = (from / GW) | 0;
    let best = -1, bd = 1e9;
    for (const id of WALK_SPOTS.filter(id => id.startsWith('wc-') && PLACE[id])) {
      const c = snapCell(placeXY(PLACE[id])), d = Math.hypot(c % GW - fx, ((c / GW) | 0) - fy);
      if (d < bd && c !== from) { bd = d; best = c; }
    }
    return best;
  };
  const start = (w, t) => {
    w.rush = !w.roam && Math.random() < 0.07;  // מדי פעם: רץ לשירותים
    const to = w.rush ? nearestWc(w.at) : w.roam ? farSpot(w.at) : walkSpot(w.at), path = to >= 0 && astar(w.at, to);
    if (w.roam && !w.born) w.born = t;
    if (!path || path.length < 4) { w.wait = t + 1000; w.at = to; return; }
    const pts = cleanRoute(simplify(path)), acc = [0];
    for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const len = acc[acc.length - 1];
    const stops = []; // בלי עצירות בדרך – הולכים ברצף מנקודה לנקודה
    Object.assign(w, { pts, acc, len, s: 0, to, stops, state: 'walk', pend: 0 });
    const u0 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
    step(w, 0, u0.x / (Math.hypot(u0.x, u0.y) || 1), u0.y / (Math.hypot(u0.x, u0.y) || 1));
  };
  const posAt = (w, s) => {
    let k = 1;
    while (k < w.acc.length - 1 && w.acc[k] < s) k++;
    const a = w.pts[k - 1], b = w.pts[k], L = (w.acc[k] - w.acc[k - 1]) || 1, u = Math.min(1, Math.max(0, (s - w.acc[k - 1]) / L));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L };
  };
  /* צעד לפי מרחק: במבט מהצד כף הרגל זזה אופקית (4A לכל מחזור), במבט מלפנים/מאחור אנכית ומקוצרת (×KF) */
  const step = (w, ds, ux, uy) => {
    const side = Math.abs(uy) <= Math.abs(ux) * 1.15; // עד ~49° מהאופק – מהצד; תלול יותר – מלפנים/מאחור
    // הטיית הרגליים: מהצד – צעד קדימה יורד/עולה לאורך השביל; מלפנים/מאחור – זז הצידה לאורך השביל
    // ההטיה מוגבלת (עד ~27°) – יותר מזה הרגליים נראות שטוחות
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    // מהצד – הטיה קלה של הרגליים לאורך השביל (עד ~19°); מלפנים/מאחור – בלי הטיה בכלל (רגליים ישרות מתחת לגוף)
    const tY = side ? clamp(uy / Math.max(0.2, Math.abs(ux)), 0.35) : 0, tX = 0;
    const sm = Math.min(1, ds / 6); // מעבר הדרגתי בפניות – בלי קפיצות
    w.ky += (tY - w.ky) * sm; w.kx += (tX - w.kx) * sm;
    const nv = side ? 0 : uy > 0 ? 1 : 2;
    const nd = side && Math.abs(ux) > 0.15 ? (ux > 0 ? 1 : -1) : w.dir;
    if (nv === w.view && nd === w.dir) w.pend = 0;
    else if ((w.pend = (w.pend || 0) + ds) >= 9 || ds === 0) { w.view = nv; w.dir = nd; w.pend = 0; } // כיוון חדש שנמשך ≥9 פיקסלים
    w.phase += side ? ds * Math.abs(ux) / (4 * w.a) : ds * Math.abs(uy) / (4 * w.a * P.kf);
  };
  const draw = (w, x, y, op) => {
    const f = w.pose >= 0 ? P.frames + w.pose : Math.floor(wrap1(w.phase) * P.frames) % P.frames; // pose = תמונת עמידה
    const bp = `${-f * P.w}px ${rowY(w.i, w.view)}`;
    w.up.style.backgroundPosition = bp; w.lo.style.backgroundPosition = bp;
    const flip = `scaleX(${w.view === 0 ? w.dir : 1})`;
    const standing = w.pose >= 0;
    const ky = w.ky, kx = w.kx; // מוחלקים – דועכים בהדרגה בכל מעבר מבט/עצירה, בלי קפיצה
    const breath = standing ? 1 + 0.014 * Math.sin((performance.now() - (w.holdStart || 0)) / 3600 * 2 * Math.PI) : 1;
    const L0 = w.lead || w, rushLean = L0.rush && w.view === 0 && !standing ? ' rotate(9deg)' : '';
    w.up.style.transform = `${flip} scaleY(${breath.toFixed(4)})${rushLean}`;
    w.lo.style.transform = `${flip} skewY(${Math.atan(ky).toFixed(3)}rad) skewX(${Math.atan(kx).toFixed(3)}rad)`;
    w.el.style.transform = `translate(${(x - P.w / 2).toFixed(1)}px, ${(y - P.foot * P.h).toFixed(1)}px)`; // הגוף תמיד על השביל
    w.el.style.opacity = op.toFixed(2);
    if (w.balloon) {
      // הבלון קשור ליד: מתנופף ברוח (שני גלים איטיים) ונגרר מעט אחורה ביחס לכיוון ההליכה
      const hh = P.balloonHands[w.view] && P.balloonHands[w.view][f];
      if (hh) {
        const hx = w.view === 0 && w.dir < 0 ? P.w - hh[0] : hh[0], tt = performance.now() / 1000;
        const ang = 9 * Math.sin(tt * 0.9 + w.i) + 4 * Math.sin(tt * 2.1) + (w.view === 0 ? -w.dir * 11 : 0);
        w.balloon.style.transform = `translate(${hx.toFixed(1)}px, ${hh[1].toFixed(1)}px) rotate(${ang.toFixed(1)}deg)`;
      }
    }
  };
  let last = performance.now();
  const tick = t => {
    if (!document.contains(stage)) return;
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    for (const w of W) {
      if (w.lead) continue;
      if (w.state === 'idle' && t >= w.wait) start(w, t);
      if (w.state === 'hold' && t >= w.holdEnd) { w.state = 'walk'; w.pose = -1; w.view = w.walkView; w.phase = Math.floor(w.phase) + 0.25; w.spf = 0.15; } // יוצא בהרמת רגל, מאיץ בהדרגה
      if (w.state === 'walk' || w.state === 'settle') {
        // מהירות משתנה בהדרגה: האטה רכה לפני עצירה, האצה רכה אחרי (הצעדים תמיד לפי המרחק – בלי החלקה)
        w.spf = (w.spf === undefined ? 1 : w.spf) + ((w.state === 'settle' ? 0.22 : 1) - (w.spf === undefined ? 1 : w.spf)) * Math.min(1, dt * 2.4);
        const sp = w.speed * w.spf * (w.rush ? 2.3 : 1); // בריצה – פי 2.3 (הצעדים מהירים בהתאם, בלי החלקה)
        let ns = Math.min(w.len, w.s + sp * dt);
        const st = w.state === 'walk' && w.stops.find(o => o.d > w.s && o.d <= ns);
        if (st) { w.state = 'settle'; w.holdDur = st.dur; w.stops = w.stops.filter(o => o !== st); }
        const ds = ns - w.s, pa = posAt(w, ns), before = w.phase;
        w.s = ns;
        step(w, ds, pa.ux, pa.uy);
        // הרגל שבאוויר מגיעה מתחת לגוף (שלב 0.25 / 0.75 במחזור) → מניחים אותה: עומדים
        if (w.state === 'settle' && Math.floor(before * 2 - 0.5) !== Math.floor(w.phase * 2 - 0.5)) {
          w.state = 'hold'; w.holdStart = t; w.holdEnd = t + w.holdDur; w.pose = 0; w.walkView = w.view;
        }
        if (w.s >= w.len) {
          w.at = w.to; walkerAt[w.i] = w.to;
          if (w.roam) { w.state = 'idle'; w.wait = t; }  // הנודד ממשיך מיד הלאה
          else { w.state = 'inside'; w.wait = t + 8000 + Math.random() * 22000; }
        }
        w.pos = pa;
      }
      if (w.state === 'inside' && t >= w.wait) w.state = 'idle';
    }
    for (const w of W) {
      const L = w.lead || w;
      if (!L.pos || (!L.roam && (L.state === 'idle' || L.state === 'inside'))) { if (w.el.style.opacity !== '0') w.el.style.opacity = '0'; continue; }
      const op = L.roam ? Math.min(1, (t - L.born) / 1200) : Math.max(0, Math.min(1, Math.min(L.s, L.len - L.s) / fade(L))); // הנודד תמיד נראה
      if (w.lead) {
        // בן הזוג: אותו מסלול, צעד לצד (ניצב לכיוון ההליכה) ומעט מאחור; צעדיו לפי המרחק שלו
        const pa = posAt(L, Math.max(0, L.s - 5));
        const ds = w.lastS === undefined ? 0 : Math.max(0, L.s - w.lastS);
        w.lastS = L.s;
        step(w, ds, pa.ux, pa.uy);
        // בן הזוג עוצר ויוצא יחד עם המוביל (משען על הצד ההפוך)
        w.pose = L.state === 'hold' ? 0 : -1;
        if (L.state === 'hold' && !w.holdStart) w.holdStart = L.holdStart + 900; else if (L.state !== 'hold') w.holdStart = 0; // נושמים לא באותו קצב
        // צעד לצד – ובשביל צר מתקרבים, כדי לא לדרוך על הירוק הכהה
        const sm = Math.min(1, dt * 2.2);
        w.sux = w.sux === undefined ? pa.ux : w.sux + (pa.ux - w.sux) * sm;   // כיוון מוחלק
        w.suy = w.suy === undefined ? pa.uy : w.suy + (pa.uy - w.suy) * sm;
        const nl = Math.hypot(w.sux, w.suy) || 1, px = -w.suy / nl, py = w.sux / nl;
        let want = 0;
        for (const d of [9, 7, 5, 3]) {
          const c = cellOf({ x: pa.x + px * d, y: pa.y + py * d });
          if (WALK.main[c[1] * WALK.GW + c[0]]) { want = d; break; }
        }
        w.sd = w.sd === undefined ? want : w.sd + (want - w.sd) * Math.min(1, dt * 1.5); // מתקרב/מתרחק לאט
        draw(w, pa.x + px * w.sd, pa.y + py * w.sd, op);
      } else draw(w, L.pos.x, L.pos.y, op);
    }
    walkRAF = requestAnimationFrame(tick);
  };
  walkRAF = requestAnimationFrame(tick);
}

function renderMap(view) {
  const f = !!mapFocus;
  const ev = mapFocus && mapFocus.ev;
  const fs = destPlace();
  const marks = STAGES.map(st => `<div class="m-mark" style="left:${st.mapX}%;top:${st.mapY}%">
      <div class="inv"><button class="m-hit" data-stage="${st.id}" aria-label="${esc(st.name)}"></button></div>
    </div>`).join('')
    // אייקוני שירותים, ברזיות, מקלחות ובישול שבמפה לחיצים: הקשה = ניווט אליהם
    + LANDMARKS.filter(l => TAPPABLE_TYPES.includes(l.type) || TAPPABLE_IDS.includes(l.id)).map(w => `<div class="m-mark" style="left:${w.mapX}%;top:${w.mapY}%">
      <div class="inv"><button class="m-hit poi" data-goto="${w.id}" aria-label="ניווט ל${esc(w.name)}"></button></div>
    </div>`).join('')
    + (PLACE.tent ? `<div class="m-mark" style="left:${PLACE.tent.mapX}%;top:${PLACE.tent.mapY}%">
      <div class="inv"><button class="tent-pin" data-tent aria-label="האוהל שלי"><span>🏠</span></button></div>
    </div>` : '');
  // סימון היעד: טבעת פועמת + תווית (הופעה, או שם הנקודה)
  const destMark = fs ? `<div class="m-mark" style="left:${fs.mapX}%;top:${fs.mapY}%;--c:${fs.color || 'var(--coral)'}">
      <div class="inv"><div class="pulse"><i></i><i></i><i></i><b></b></div>
        <div class="m-label">${ev ? `${esc(ev.name)}<small>${esc(fs.name)} · ${DAY[ev.day].label} ${timeRange(ev)}</small>`
          : `${esc(fs.name)}<small>היעד</small>`}</div></div></div>` : '';

  view.innerHTML = `<div class="mapwrap" id="mapwrap">
    <div class="mapstage" id="mapstage" style="width:${MAP_W}px;height:${MAP_H}px">
      <img src="${ASSETS.map}" width="${MAP_W}" height="${MAP_H}" alt="מפת הפסטיבל אינדינגב 2026">
      ${smokerHtml()}
      ${walkersHtml()}
      ${birdsHtml()}
      <svg class="route" id="route" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}" aria-hidden="true"></svg>
      ${marks}
      ${destMark}
      <div id="places"></div>
    </div>
    <div class="map-ui zoom">
      <button data-z="in" aria-label="הגדלה">${ICON.plus}</button>
      <button data-z="out" aria-label="הקטנה">${ICON.minus}</button>
      <button data-z="fit" aria-label="${f ? 'חזרה לבמה' : 'כל המפה'}">${ICON.target}</button>
    </div>
    ${f ? `<div class="map-ui back"><button data-mapback>${ICON.back} חזרה</button></div>` : ''}
    <div class="map-ui legend" id="legend"></div>
    <div class="map-ui routebar" id="routebar"></div>
  </div>`;

  const wrap = $('#mapwrap');
  const stage = $('#mapstage');
  measure(wrap);
  if (f) {
    // מתחילים ממבט רחב ומתקרבים לבמה באנימציה
    if (!map.s) fitHeight();
    applyMap(stage);
    updateRoute(fs);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (picking) pickView(stage, fs);
      else if (routeFrom) fitRoute(stage, fs);
      else focusStage(stage, fs, true);
    }));
  } else {
    if (!map.s) fitHeight();
    clampMap();
    applyMap(stage);
    updateRoute(null);
  }
  flyBirds(stage);
  walkPeople(stage);
  smokePeople(stage);
  bindMapGestures(wrap, stage);
  // מסגרת המפה לא נגללת לעולם (פוקוס על כפתור מחוץ למסך יכול לגלול אותה)
  wrap.addEventListener('scroll', () => { wrap.scrollLeft = 0; wrap.scrollTop = 0; });

  wrap.addEventListener('click', e => {
    const z = e.target.closest('[data-z]');
    if (z) {
      const cx = map.vw / 2, cy = map.vh / 2;
      if (z.dataset.z === 'in') animate(stage, () => zoomAt(cx, cy, 1.6));
      if (z.dataset.z === 'out') animate(stage, () => zoomAt(cx, cy, 1 / 1.6));
      if (z.dataset.z === 'fit') {
        if (!fs) animate(stage, () => { fitHeight(); });
        else if (routeFrom) fitRoute(stage, fs);
        else focusStage(stage, fs, true);
      }
      return;
    }
    if (e.target.closest('[data-mapback]')) { popLayer(); return; }
    const lg = e.target.closest('[data-legend]');
    if (lg) {
      legendType = legendType === lg.dataset.legend ? null : lg.dataset.legend;
      updateRoute(fs);
      // מתאימים את המבט כך שכל הנקודות מהקטגוריה ייראו
      if (legendType) fitPoints(stage, PLACES.filter(pl => catOf(pl) === legendType).map(placeXY));
      return;
    }
    const r = e.target.closest('[data-route]');
    if (r) {
      const a = r.dataset.route;
      if (a === 'wc' || a === 'near') {
        const type = a === 'wc' ? 'wc' : legendType;
        routeFrom = null;
        navigateTo({ nearest: type }, { pick: 'from' });
      } else if (a === 'legend-off') {
        legendType = null;
        updateRoute(fs);
      } else if (a === 'tent') {
        if (PLACE.tent) goTo('tent');
        else { picking = 'tent'; updateRoute(fs); }
      } else if (a === 'cancel' && mapFocus && mapFocus.nearest) {
        popLayer();
      } else if (a === 'pick' || a === 'dest') {
        picking = a === 'pick' ? 'from' : 'dest';
        updateRoute(fs);
        pickView(stage, fs);
      } else if (a === 'cancel') {
        picking = false;
        updateRoute(fs);
        if (!fs) animate(stage, () => { fitHeight(); });
        else if (routeFrom) fitRoute(stage, fs);
        else focusStage(stage, fs, true);
      } else if (a === 'clear') {
        routeFrom = null;
        updateRoute(fs);
        focusStage(stage, fs, true);
      } else if (a === 'last') {
        chooseOrigin(stage, fs, S.prefs.here.id);
      }
      return;
    }
    if (e.target.closest('.map-ui')) return;
    // סימון האוהל: הקשה בכל מקום במפה
    if (picking === 'tent') {
      if (mapGesture.moved) return;
      const rc = wrap.getBoundingClientRect();
      const mx = (e.clientX - rc.left - map.x) / map.s, my = (e.clientY - rc.top - map.y) / map.s;
      if (mx < 0 || my < 0 || mx > MAP_W || my > MAP_H) return;
      S.prefs.tent = { x: +(mx / MAP_W * 100).toFixed(2), y: +(my / MAP_H * 100).toFixed(2) };
      save();
      syncTent();
      picking = false;
      renderMap(view);
      toast('האוהל נשמר 🏠');
      if (navigator.vibrate) navigator.vibrate(15);
      return;
    }
    const pl = e.target.closest('[data-place]');
    if (pl && !mapGesture.moved) {
      const id = pl.dataset.place;
      if (picking === 'dest' || !picking) {
        goTo(id); // יעד חדש (או נקודה מהמקרא): בניווט פעיל שומרים את נקודת המוצא, אחרת עוברים ל"איפה אני"
      } else {
        chooseOrigin(stage, fs, id);
      }
      return;
    }
    if (mapGesture.moved) return;
    const poi = e.target.closest('[data-goto]');
    if (poi) { goTo(poi.dataset.goto); return; }
    if (e.target.closest('[data-tent]')) { if (mapFocus) goTo('tent'); else openTentSheet(); return; }
    const hit = e.target.closest('[data-stage]');
    if (hit) openStage(hit.dataset.stage);
  });
}

/* מבט לבחירת נקודה: בגובה מסך (כמעט) מלא, סביב היעד או מרכז המתחם; גוללים הצידה */
function pickView(stage, around) {
  animate(stage, () => {
    const c = around ? placeXY(around) : { x: 0.45 * MAP_W, y: 0.52 * MAP_H };
    map.s = Math.max(map.vh / MAP_H, map.vw / MAP_W) * 0.8;
    map.x = map.vw / 2 - c.x * map.s;
    map.y = map.vh / 2 - c.y * map.s;
    clampMap();
  });
}

function chooseOrigin(stage, dest, id) {
  routeFrom = id;
  picking = false;
  S.prefs.here = { id, at: Date.now() };
  save();
  if (mapFocus && mapFocus.nearest) { // "הכי קרוב": עכשיו כשידוע המיקום – בוחרים את הנקודה הקרובה
    const best = nearestOf(mapFocus.nearest, id);
    if (best) navigateTo({ dest: best }, { keepFrom: true });
    return;
  }
  updateRoute(dest);
  fitRoute(stage, dest);
  if (navigator.vibrate) navigator.vibrate(15);
}

/* שכבות הניווט: נקודות לבחירה, קו מקווקו, סיכת "אני כאן", ופס הפעולות */
function updateRoute(dest) {
  const wrap = $('#mapwrap');
  if (!wrap) return;
  wrap.classList.toggle('picking', !!picking);
  wrap.classList.toggle('picking-tent', picking === 'tent');
  wrap.classList.toggle('has-route', !!routeFrom && !picking && !!dest);
  const bar = $('#routebar');
  // המקרא מוצג בטאב המפה הרגיל ובזמן בחירת נקודה (שם הוא משמש כמסנן)
  const nearestType = mapFocus && mapFocus.nearest;
  const showLegend = picking === 'from' || picking === 'dest' || (!dest && !picking);
  $('#legend').innerHTML = showLegend ? `<div class="lg" role="group" aria-label="מקרא">${CATS
    .filter(c => !(nearestType && c.id === nearestType))
    .map(c => `<button data-legend="${c.id}" aria-pressed="${legendType === c.id}">${c.icon} ${c.label}</button>`).join('')}</div>` : '';

  if (!dest) {
    // בלי יעד: טאב המפה הרגיל, בחירת יעד, סימון האוהל, או "שירותים קרובים" שמחכה למיקום
    $('#route').innerHTML = '';
    const nearest = mapFocus && mapFocus.nearest;
    const lastAny = S.prefs.here && PLACE[S.prefs.here.id] ? PLACE[S.prefs.here.id] : null;
    $('#places').innerHTML = nearest || picking === 'dest' || (!picking && legendType) ? placeButtons(null) : '';
    if (nearest) {
      bar.innerHTML = `<div class="rb rb-col">
        <div class="rb-t"><b>${CAT[nearest].icon} איפה אתם עכשיו?</b><small>נמצא את ${CAT[nearest].near} אליכם בהליכה</small></div>
        <div class="rb-row">${lastAny ? `<button class="rb-btn" data-route="last">מ${esc(lastAny.name)}</button>` : ''}
        <button class="rb-btn alt" data-route="cancel">ביטול</button></div></div>`;
    } else if (picking === 'dest') {
      bar.innerHTML = `<div class="rb"><div class="rb-t"><b>לאן הולכים?</b><small>הקישו על היעד במפה – במה או כל נקודה אחרת</small></div>
          <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
    } else if (picking === 'tent') {
      bar.innerHTML = `<div class="rb"><div class="rb-t"><b>🏠 איפה האוהל שלכם?</b><small>הקישו על המקום המדויק במפה (אפשר להגדיל קודם)</small></div>
          <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
    } else if (legendType) {
      const c = CAT[legendType], n = PLACES.filter(pl => catOf(pl) === legendType).length;
      bar.innerHTML = `<div class="rb rb-col">
        <div class="rb-t"><b>${c.icon} ${c.label} (${n})</b><small>הקישו על נקודה במפה כדי לנווט אליה</small></div>
        <div class="rb-row"><button class="rb-btn" data-route="near">${ICON.pin} הכי קרוב אליי</button>
        <button class="rb-btn alt" data-route="legend-off">סגירה</button></div></div>`;
    } else {
      bar.innerHTML = `<div class="rb rb-row rb-row3">
        <button class="rb-btn" data-route="dest">${ICON.pin} ניווט</button>
        <button class="rb-btn alt" data-route="wc">🚻 שירותים</button>
        <button class="rb-btn alt" data-route="tent">🏠 ${PLACE.tent ? 'לאוהל' : 'האוהל שלי'}</button></div>`;
    }
    return;
  }

  let placesHtml = '';
  if (picking) {
    placesHtml = placeButtons(picking === 'dest' ? null : dest.id);
  } else if (routeFrom) {
    const p = PLACE[routeFrom];
    placesHtml = `<div class="m-mark" style="left:${p.mapX}%;top:${p.mapY}%"><div class="inv"><div class="here-pin">
        <svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 31s10-11.2 10-18.5A10 10 0 0 0 2 12.5C2 19.8 12 31 12 31z"/><circle cx="12" cy="12.5" r="4"/></svg>
        <span>אני כאן</span></div></div></div>`;
  }
  $('#places').innerHTML = placesHtml;

  const svgEl = $('#route');
  const route = routeFrom && !picking ? findRoute(routeFrom, dest.id) : null;
  if (route) {
    const d = roundedPath(route.pts);
    const a = route.pts[0];
    svgEl.innerHTML = `<path class="casing" d="${d}"/><path class="dash" d="${d}"/><circle class="start" cx="${a.x}" cy="${a.y}"/>`;
  } else {
    svgEl.innerHTML = '';
  }
  const viaParts = route ? route.via.map(g => g === 'pass' ? 'המעבר בין הבמות' : PLACE[g].name) : [];
  const via = viaParts.length ? 'דרך ' + viaParts.join(' ואז ') : 'הולכים לאורך הקו המקווקו';

  const last = S.prefs.here && PLACE[S.prefs.here.id] && S.prefs.here.id !== dest.id ? PLACE[S.prefs.here.id] : null;
  const canChangeDest = mapFocus && mapFocus.dest; // ניווט שהתחיל מטאב המפה
  if (picking === 'dest') {
    bar.innerHTML = `<div class="rb"><div class="rb-t"><b>לאן הולכים?</b><small>הקישו על היעד החדש במפה</small></div>
      <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
  } else if (picking) {
    bar.innerHTML = `<div class="rb rb-col">
      <div class="rb-t"><b>איפה אתם עכשיו?</b><small>הקישו על הנקודה הקרובה אליכם · היעד: ${canChangeDest
        ? `<button class="rb-link sm" data-route="dest">${esc(dest.name)}</button>` : esc(dest.name)}</small></div>
      <div class="rb-row">${last ? `<button class="rb-btn" data-route="last">מ${esc(last.name)}</button>` : ''}
      <button class="rb-btn alt" data-route="cancel">ביטול</button></div></div>`;
  } else if (routeFrom) {
    // כל חלק בכותרת לחיץ: "מ..." משנה מיקום, "אל..." משנה יעד (בניווט מטאב המפה)
    bar.innerHTML = `<div class="rb"><div class="rb-t">
        <b><button class="rb-link" data-route="pick">מ${esc(PLACE[routeFrom].name)}</button>
        <span aria-hidden="true">←</span>
        ${canChangeDest ? `<button class="rb-link" data-route="dest">${esc(dest.name)}</button>` : esc(dest.name)}</b>
        <small>${esc(via)}</small></div>
      <button class="rb-x" data-route="clear" aria-label="הסרת המסלול">${ICON.close}</button></div>`;
  } else {
    // שורה עליונה: היעד (לחיץ להחלפה בניווט מטאב המפה); שורה תחתונה: בחירת מיקום
    bar.innerHTML = `<div class="rb rb-col">
      <div class="rb-t"><b>אל ${canChangeDest ? `<button class="rb-link" data-route="dest">${esc(dest.name)}</button>
        <small class="rb-hint">(הקישו להחלפה)</small>` : esc(dest.name)}</b></div>
      <div class="rb-row"><button class="rb-btn" data-route="pick">${ICON.pin} איפה אני עכשיו?</button>
      ${last ? `<button class="rb-btn alt" data-route="last">מ${esc(last.name)}</button>` : ''}</div></div>`;
  }
}

/* כפתורי נקודות לבחירה על המפה (בלי נקודה אחת – היעד הנוכחי) */
function placeButtons(exceptId) {
  return PLACES.filter(p => p.id !== exceptId && (!legendType || catOf(p) === legendType)).map(p => `<div class="m-mark" style="left:${p.mapX}%;top:${p.mapY}%">
      <div class="inv"><button class="m-place" data-place="${p.id}" ${p.color ? `style="--c:${p.color}"` : ''}>
        <span class="ic">${p.icon}</span><small>${esc(p.name)}</small></button></div></div>`).join('');
}

function fitRoute(stage, dest) {
  const r = findRoute(routeFrom, dest.id);
  fitPoints(stage, r ? r.pts : [placeXY(PLACE[routeFrom]), placeXY(dest)]);
}

/* זום ומרכז כך שכל הנקודות ייראו (משאירים מקום לכותרת ולפס הפעולות) */
function fitPoints(stage, pts, minFactor = 0) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = 60, padTop = 120, padBottom = 110;
  animate(stage, () => {
    map.s = Math.min(
      (map.vw - padX * 2) / Math.max(1, x1 - x0),
      (map.vh - padTop - padBottom) / Math.max(1, y1 - y0),
      Math.max(map.vh / MAP_H, map.vw / MAP_W) * 1.4,
    );
    // מקטינים כמה שצריך כדי ששתי הנקודות ייראו (אפשר להגדיל אחר כך באצבעות)
    const fillH = Math.max(map.vh / MAP_H, map.vw / MAP_W);
    map.s = Math.min(map.max, Math.max(map.min, fillH * minFactor, map.s));
    map.x = map.vw / 2 - (x0 + x1) / 2 * map.s;
    map.y = padTop + (map.vh - padTop - padBottom) / 2 - (y0 + y1) / 2 * map.s;
    clampMap();
  });
}

function measure(wrap) {
  map.vw = wrap.clientWidth;
  map.vh = wrap.clientHeight;
  map.min = Math.min(map.vw / MAP_W, map.vh / MAP_H);
  map.max = Math.max(2.2, map.min * 4);
}
function fitHeight() {
  map.s = Math.max(map.vh / MAP_H, map.vw / MAP_W);
  map.x = (map.vw - MAP_W * map.s) / 2;
  map.y = (map.vh - MAP_H * map.s) / 2;
  clampMap();
}
function clampMap() {
  map.s = Math.min(map.max, Math.max(map.min, map.s));
  const w = MAP_W * map.s, h = MAP_H * map.s;
  map.x = w <= map.vw ? (map.vw - w) / 2 : Math.min(0, Math.max(map.vw - w, map.x));
  map.y = h <= map.vh ? (map.vh - h) / 2 : Math.min(0, Math.max(map.vh - h, map.y));
}
function applyMap(stage) {
  stage.style.transform = `translate(${map.x}px,${map.y}px) scale(${map.s})`;
  stage.style.setProperty('--inv', 1 / map.s);
  // במבט רחוק מסתירים את שמות הנקודות (רק אייקונים), כדי שלא יכסו זה את זה
  stage.parentElement.classList.toggle('far', map.s < Math.max(map.vh / MAP_H, map.vw / MAP_W) * 1.35);
}
function zoomAt(px, py, factor) {
  const ns = Math.min(map.max, Math.max(map.min, map.s * factor));
  const k = ns / map.s;
  map.x = px - (px - map.x) * k;
  map.y = py - (py - map.y) * k;
  map.s = ns;
  clampMap();
}
function animate(stage, fn) {
  stage.classList.add('anim');
  fn();
  applyMap(stage);
  clearTimeout(animate.t);
  animate.t = setTimeout(() => stage.classList.remove('anim'), 720);
}
function focusStage(stage, st, anim) {
  const go = () => {
    map.s = Math.min(map.max, Math.max(map.vh / MAP_H, map.vw / MAP_W) * 1.4);
    map.x = map.vw / 2 - (st.mapX / 100) * MAP_W * map.s;
    map.y = map.vh * 0.56 - (st.mapY / 100) * MAP_H * map.s;
    clampMap();
  };
  anim ? animate(stage, go) : (go(), applyMap(stage));
}

const mapGesture = { moved: false };
function bindMapGestures(wrap, stage) {
  const pts = new Map();
  let last = null, lastTap = 0, downAt = null;

  const mid = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const local = e => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('.map-ui')) return;
    pts.set(e.pointerId, local(e));
    stage.classList.remove('anim');
    if (pts.size === 1) { mapGesture.moved = false; downAt = local(e); }
    last = pts.size === 2 ? mid() : local(e);
  });
  wrap.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) {
      const p = local(e);
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6) mapGesture.moved = true;
      map.x += p.x - last.x; map.y += p.y - last.y;
      last = p;
      clampMap();
    } else if (pts.size === 2) {
      const m = mid();
      mapGesture.moved = true;
      map.x += m.x - last.x; map.y += m.y - last.y;
      if (last.d) zoomAt(m.x, m.y, m.d / last.d);
      last = m;
      clampMap();
    }
    applyMap(stage);
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1) last = [...pts.values()][0];
    if (pts.size === 0 && !mapGesture.moved && e.type === 'pointerup' && !e.target.closest('.m-hit')) {
      const t = Date.now();
      if (t - lastTap < 300) { const p = local(e); animate(stage, () => zoomAt(p.x, p.y, 2)); lastTap = 0; }
      else lastTap = t;
    }
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    applyMap(stage);
  }, { passive: false });
}

window.addEventListener('resize', () => {
  const wrap = $('#mapwrap');
  if (!wrap) return;
  measure(wrap);
  clampMap();
  applyMap($('#mapstage'));
});
