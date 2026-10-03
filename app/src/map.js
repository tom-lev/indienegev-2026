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
let picking = false;  // false | 'from' (בחירת "איפה אני") | 'dest' (בחירת יעד)
const placeXY = p => ({ x: p.mapX / 100 * MAP_W, y: p.mapY / 100 * MAP_H });

/* ───────── מסלול הליכה על רשת מתוך המפה ─────────
   ASSETS.walk היא מפת ביטים (walkW×walkH תאים) שנבנתה מתמונת המפה ב-walkgrid.py:
   צהוב/ירוק = הליכה, איורים/גדרות/נהר = חסום, והגדר נחצית רק בכניסות האמיתיות.
   המסלול = A* עם "קנס" על קרבה למכשולים, כך שהוא עובר באמצע מעברים ופתחים ולא צמוד לגדר. */
const WALK = (() => {
  const GW = ASSETS.walkW, GH = ASSETS.walkH, N = GW * GH;
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
  return { GW, GH, main, dist, cell: ASSETS.walkCell * MAP_W / ASSETS.walkBase };
})();

const PREFERRED_CLEARANCE = 5; // תאים: מתחת למרחק הזה מהמכשול יש קנס, כדי ללכת באמצע

function cellOf(p) {
  return [Math.min(WALK.GW - 1, Math.max(0, Math.floor(p.x / WALK.cell))),
    Math.min(WALK.GH - 1, Math.max(0, Math.floor(p.y / WALK.cell)))];
}
/* התא הקרוב ביותר בשטח ההליכה (נקודות שיושבות על איור/שלט) */
function snapCell(p) {
  const [cx, cy] = cellOf(p);
  let bestI = -1, bestD = 1e9;
  for (let r = 0; r < 40 && bestI < 0; r++) {
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

function astar(s, g) {
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
      const pen = Math.max(0, PREFERRED_CLEARANCE - dist[n]);
      const nc = cost[c] + (dx && dy ? 1.414 : 1) * (1 + 0.3 * pen * pen / PREFERRED_CLEARANCE);
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
const GATE_POINTS = { 'gate-w': [27.5, 45.2], 'gate-s': [44.0, 62.0], 'gate-e': [65.5, 55.6], 'gate-se': [59.7, 78.4] };
const PASS_POINT = [49.3, 52.0];

function findRoute(fromId, toId) {
  const a = placeXY(PLACE[fromId]), b = placeXY(PLACE[toId]);
  const s = snapCell(a), g = snapCell(b);
  if (s < 0 || g < 0) return null;
  const path = astar(s, g);
  if (!path) return null;
  const pts = [a, ...simplify(path), b];
  // אילו כניסות/מעבר המסלול עובר (לפי קרבה לתאים במסלול)
  const near = ([px, py], r) => path.some(c => {
    const x = (c % WALK.GW + 0.5) * WALK.cell, y = (((c / WALK.GW) | 0) + 0.5) * WALK.cell;
    return Math.hypot(x - px / 100 * MAP_W, y - py / 100 * MAP_H) < r;
  });
  const gates = [];
  const seen = path.map(c => c); // לשמירת הסדר: לפי המיקום הראשון במסלול
  for (const [gid, gp] of Object.entries(GATE_POINTS)) {
    const gx = gp[0] / 100 * MAP_W, gy = gp[1] / 100 * MAP_H;
    const idx = seen.findIndex(c => Math.hypot((c % WALK.GW + 0.5) * WALK.cell - gx, (((c / WALK.GW) | 0) + 0.5) * WALK.cell - gy) < 40);
    if (idx >= 0 && gid !== fromId && gid !== toId) gates.push([idx, gid]);
  }
  gates.sort((x, y) => x[0] - y[0]);
  return { pts, gates: gates.map(x => x[1]), viaPass: near(PASS_POINT, 45) };
}

/* קו שבור עם פינות מעוגלות */
function roundedPath(pts, r = 45) {
  const f = n => n.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const ra = Math.min(r, la * 0.35) / la, rb = Math.min(r, lb * 0.35) / lb;
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
    mapFocus = target.stage ? { ev: target } : { dest: target.dest };
    routeFrom = keepFrom;
    picking = opts.pick || false;
    setTab('map');
    mapFocusLayer = pushLayer(() => {
      mapFocusLayer = null;
      mapFocus = null;
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

const destPlace = () => !mapFocus ? null : mapFocus.ev ? PLACE[mapFocus.ev.stage] : PLACE[mapFocus.dest];

function renderMap(view) {
  const f = !!mapFocus;
  const ev = mapFocus && mapFocus.ev;
  const fs = destPlace();
  const marks = STAGES.map(st => `<div class="m-mark" style="left:${st.mapX}%;top:${st.mapY}%">
      <div class="inv"><button class="m-hit" data-stage="${st.id}" aria-label="${esc(st.name)}"></button></div>
    </div>`).join('');
  // סימון היעד: טבעת פועמת + תווית (הופעה, או שם הנקודה)
  const destMark = fs ? `<div class="m-mark" style="left:${fs.mapX}%;top:${fs.mapY}%;--c:${fs.color || 'var(--coral)'}">
      <div class="inv"><div class="pulse"><i></i><i></i><i></i><b></b></div>
        <div class="m-label">${ev ? `${esc(ev.name)}<small>${esc(fs.name)} · ${DAY[ev.day].label} ${timeRange(ev)}</small>`
          : `${esc(fs.name)}<small>היעד</small>`}</div></div></div>` : '';

  view.innerHTML = `<div class="mapwrap" id="mapwrap">
    <div class="mapstage" id="mapstage" style="width:${MAP_W}px;height:${MAP_H}px">
      <img src="${ASSETS.map}" width="${MAP_W}" height="${MAP_H}" alt="מפת הפסטיבל אינדינגב 2026">
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
        if (!f) animate(stage, () => { fitHeight(); });
        else if (routeFrom) fitRoute(stage, fs);
        else focusStage(stage, fs, true);
      }
      return;
    }
    if (e.target.closest('[data-mapback]')) { popLayer(); return; }
    const r = e.target.closest('[data-route]');
    if (r) {
      const a = r.dataset.route;
      if (a === 'pick' || a === 'dest') {
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
    const pl = e.target.closest('[data-place]');
    if (pl && !mapGesture.moved) {
      const id = pl.dataset.place;
      if (picking === 'dest') {
        // יעד חדש: אם כבר ידוע מאיפה יוצאים – שומרים, אחרת עוברים ישר ל"איפה אני"
        if (routeFrom === id) routeFrom = null;
        navigateTo({ dest: id }, { keepFrom: true, pick: routeFrom ? false : 'from' });
      } else {
        chooseOrigin(stage, fs, id);
      }
      return;
    }
    const hit = e.target.closest('[data-stage]');
    if (hit && !mapGesture.moved) openStage(hit.dataset.stage);
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
  updateRoute(dest);
  fitRoute(stage, dest);
  if (navigator.vibrate) navigator.vibrate(15);
}

/* שכבות הניווט: נקודות לבחירה, קו מקווקו, סיכת "אני כאן", ופס הפעולות */
function updateRoute(dest) {
  const wrap = $('#mapwrap');
  if (!wrap) return;
  wrap.classList.toggle('picking', !!picking);
  wrap.classList.toggle('has-route', !!routeFrom && !picking && !!dest);
  const bar = $('#routebar');

  if (!dest) {
    // טאב המפה בלי ניווט פעיל: כפתור "ניווט", או בחירת יעד
    $('#route').innerHTML = '';
    $('#places').innerHTML = picking === 'dest' ? placeButtons(null) : '';
    bar.innerHTML = picking === 'dest'
      ? `<div class="rb"><div class="rb-t"><b>לאן הולכים?</b><small>הקישו על היעד במפה – במה או כל נקודה אחרת</small></div>
          <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`
      : `<div class="rb"><button class="rb-btn" data-route="dest">${ICON.pin} ניווט במפה</button></div>`;
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
  const viaParts = route ? route.gates.map(g => PLACE[g].name) : [];
  if (route && route.viaPass) viaParts.push('המעבר בין הבמות');
  const via = viaParts.length ? 'דרך ' + viaParts.join(' ואז ') : 'הולכים לאורך הקו המקווקו';

  const last = S.prefs.here && PLACE[S.prefs.here.id] && S.prefs.here.id !== dest.id ? PLACE[S.prefs.here.id] : null;
  const canChangeDest = mapFocus && mapFocus.dest; // ניווט שהתחיל מטאב המפה
  if (picking === 'dest') {
    bar.innerHTML = `<div class="rb"><div class="rb-t"><b>לאן הולכים?</b><small>הקישו על היעד החדש במפה</small></div>
      <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
  } else if (picking) {
    bar.innerHTML = `<div class="rb"><div class="rb-t"><b>איפה אתם עכשיו?</b><small>הקישו על הנקודה הקרובה אליכם במפה</small></div>
      ${last ? `<button class="rb-btn alt" data-route="last">מ${esc(last.name)}</button>` : ''}
      <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
  } else if (routeFrom) {
    // כל חלק בכותרת לחיץ: "מ..." משנה מיקום, "אל..." משנה יעד (בניווט מטאב המפה)
    bar.innerHTML = `<div class="rb"><div class="rb-t">
        <b><button class="rb-link" data-route="pick">מ${esc(PLACE[routeFrom].name)}</button>
        <span aria-hidden="true">←</span>
        ${canChangeDest ? `<button class="rb-link" data-route="dest">${esc(dest.name)}</button>` : esc(dest.name)}</b>
        <small>${esc(via)}</small></div>
      <button class="rb-x" data-route="clear" aria-label="הסרת המסלול">${ICON.close}</button></div>`;
  } else {
    bar.innerHTML = `<div class="rb"><button class="rb-btn" data-route="pick">${ICON.pin} איפה אני עכשיו?</button>
      ${last ? `<button class="rb-btn alt" data-route="last">מ${esc(last.name)}</button>` : ''}
      ${canChangeDest ? `<button class="rb-btn alt" data-route="dest">יעד אחר</button>` : ''}</div>`;
  }
}

/* כפתורי נקודות לבחירה על המפה (בלי נקודה אחת – היעד הנוכחי) */
function placeButtons(exceptId) {
  return PLACES.filter(p => p.id !== exceptId).map(p => `<div class="m-mark" style="left:${p.mapX}%;top:${p.mapY}%">
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
