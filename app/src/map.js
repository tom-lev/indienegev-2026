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
const BIRD_SPEED = [40, 17, 15];  // פיקסלים במפה בשנייה (בערך)
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
/* אנשים קטנים (הדמות מהציור) הולכים הלוך-חזור בשבילי הקמפינג – על המסלולים האמיתיים של רשת ההליכה */
const WALKERS = [['cook-campw', 'cook-camps', 0], ['wc-campw', 'cook-campw', 0.4]]; // [מאיפה, לאן, היסט בזמן]
function walkersHtml() {
  const p = ASSETS.person;
  if (!p) return '';
  return WALKERS.map((_, i) => `<div class="m-walker" style="width:${p.w}px;height:${p.h}px"><i style="background-image:url(${p.src});--w:${p.w}px;animation-delay:${-i * 0.37}s"></i></div>`).join('');
}
function walkPeople(stage) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !ASSETS.person) return;
  const p = ASSETS.person;
  stage.querySelectorAll('.m-walker').forEach((el, i) => {
    const [from, to, off] = WALKERS[i];
    const r = PLACE[from] && PLACE[to] && findRoute(from, to);
    if (!r) { el.remove(); return; }
    const pts = r.pts;
    let len = 0;
    const acc = [0];
    for (let k = 1; k < pts.length; k++) { len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); acc.push(len); }
    // כפות הרגליים על השביל: הנקודה במסלול = מרכז תחתית הדמות
    const frames = pts.map((q, k) => ({ offset: acc[k] / len, transform: `translate(${(q.x - p.w / 2).toFixed(0)}px, ${(q.y - p.h).toFixed(0)}px)` }));
    const duration = len / 10 * 1000; // כ-10 פיקסלים במפה בשנייה – טיול נינוח
    el.animate(frames, { duration, iterations: Infinity, direction: 'alternate', easing: 'linear', delay: -((Date.now() + off * duration) % (duration * 2)) });
  });
}

/* פתיחה קולנועית: פעם אחת בכל פתיחה של האפליקציה – מכל המפה אל ההופעה הקרובה בלוז שלך, או אל האוהל */
let mapIntroDone = false;
function mapIntroTarget() {
  const t = now();
  const next = myPicks().find(e => e.end > t);
  if (next && next.start - t < 3 * HOUR) return PLACE[next.stage];
  if (PLACE.tent) return PLACE.tent;
  return next ? PLACE[next.stage] : null;
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
    const intro = !mapIntroDone && !map.s && mapIntroTarget();
    if (!map.s) fitHeight();
    clampMap();
    applyMap(stage);
    updateRoute(null);
    if (intro) {
      mapIntroDone = true;
      // מתחילים מכל המפה, ואחרי רגע מתקרבים לאט ליעד
      setTimeout(() => { if (tab !== 'map' || mapFocus || !document.contains(stage)) return; stage.classList.add('slow'); focusStage(stage, intro, true); setTimeout(() => stage.classList.remove('slow'), 2000); }, 450);
    }
  }
  mapIntroDone = true;
  flyBirds(stage);
  walkPeople(stage);
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
