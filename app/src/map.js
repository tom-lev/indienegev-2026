/* מסך מפה: זום ו-pan במגע, טבעת פועמת סביב הבמה בניווט */

const MAP_W = ASSETS.mapW, MAP_H = ASSETS.mapH;
const map = { s: 0, x: 0, y: 0, vw: 0, vh: 0, min: 0.1, max: 2.2 };
let mapFocus = null;      // { ev } כשנכנסים דרך "ניווט"
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
let picking = false;  // מצב בחירת "איפה אני"
const placeXY = p => ({ x: p.mapX / 100 * MAP_W, y: p.mapY / 100 * MAP_H });

function navigateTo(ev) {
  const fromTab = tab === 'map' && mapFocusLayer ? mapPrevTab : tab;
  leavingMap = true; // סגירת שכבת ניווט קודמת לא צריכה להחזיר לטאב הקודם
  closeAllLayers().then(() => {
    leavingMap = false;
    mapPrevTab = fromTab;
    mapFocus = { ev };
    routeFrom = null;
    picking = false;
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

function renderMap(view) {
  const f = mapFocus && mapFocus.ev;
  const fs = f ? STAGE[f.stage] : null;
  const marks = STAGES.map(st => `<div class="m-mark" style="left:${st.mapX}%;top:${st.mapY}%;--c:${st.color}">
      <div class="inv">
        ${fs === st ? `<div class="pulse"><i></i><i></i><i></i><b></b></div>
          <div class="m-label">${esc(f.name)}<small>${esc(st.name)} · ${DAY[f.day].label} ${timeRange(f)}</small></div>` : ''}
        <button class="m-hit" data-stage="${st.id}" aria-label="${esc(st.name)}"></button>
      </div>
    </div>`).join('');

  view.innerHTML = `<div class="mapwrap" id="mapwrap">
    <div class="mapstage" id="mapstage" style="width:${MAP_W}px;height:${MAP_H}px">
      <img src="${ASSETS.map}" width="${MAP_W}" height="${MAP_H}" alt="מפת הפסטיבל אינדינגב 2026">
      ${f ? `<svg class="route" id="route" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}" aria-hidden="true"></svg>` : ''}
      ${marks}
      <div id="places"></div>
    </div>
    <div class="map-ui zoom">
      <button data-z="in" aria-label="הגדלה">${ICON.plus}</button>
      <button data-z="out" aria-label="הקטנה">${ICON.minus}</button>
      <button data-z="fit" aria-label="${f ? 'חזרה לבמה' : 'כל המפה'}">${ICON.target}</button>
    </div>
    ${f ? `<div class="map-ui back"><button data-mapback>${ICON.back} חזרה</button></div>
      <div class="map-ui routebar" id="routebar"></div>` : ''}
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
      if (routeFrom) fitPoints(stage, [placeXY(PLACE[routeFrom]), placeXY(fs)]);
      else focusStage(stage, fs, true);
    }));
  } else {
    if (!map.s) fitHeight();
    clampMap();
    applyMap(stage);
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
        else if (routeFrom) fitPoints(stage, [placeXY(PLACE[routeFrom]), placeXY(fs)]);
        else focusStage(stage, fs, true);
      }
      return;
    }
    if (e.target.closest('[data-mapback]')) { popLayer(); return; }
    const r = e.target.closest('[data-route]');
    if (r) {
      const a = r.dataset.route;
      if (a === 'pick') {
        picking = true;
        updateRoute(fs);
        // מתחילים מהאזור של היעד, בגובה מסך מלא; גוללים הצידה כדי למצוא את המיקום
        animate(stage, () => {
          const c = placeXY(fs);
          map.s = Math.max(map.vh / MAP_H, map.vw / MAP_W) * 0.8;
          map.x = map.vw / 2 - c.x * map.s;
          map.y = map.vh / 2 - c.y * map.s;
          clampMap();
        });
      } else if (a === 'cancel') {
        picking = false;
        updateRoute(fs);
        if (routeFrom) fitPoints(stage, [placeXY(PLACE[routeFrom]), placeXY(fs)]);
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
    if (pl && !mapGesture.moved) { chooseOrigin(stage, fs, pl.dataset.place); return; }
    const hit = e.target.closest('[data-stage]');
    if (hit && !mapGesture.moved) openStage(hit.dataset.stage);
  });
}

function chooseOrigin(stage, dest, id) {
  routeFrom = id;
  picking = false;
  S.prefs.here = { id, at: Date.now() };
  save();
  updateRoute(dest);
  fitPoints(stage, [placeXY(PLACE[id]), placeXY(dest)]);
  if (navigator.vibrate) navigator.vibrate(15);
}

/* שכבות הניווט: נקודות לבחירה, קו מקווקו, סיכת "אני כאן", ופס הפעולות */
function updateRoute(dest) {
  const wrap = $('#mapwrap');
  if (!wrap || !dest) return;
  wrap.classList.toggle('picking', picking);
  wrap.classList.toggle('has-route', !!routeFrom && !picking);

  let placesHtml = '';
  if (picking) {
    placesHtml = PLACES.filter(p => p.id !== dest.id).map(p => `<div class="m-mark" style="left:${p.mapX}%;top:${p.mapY}%">
        <div class="inv"><button class="m-place" data-place="${p.id}" ${p.color ? `style="--c:${p.color}"` : ''}>
          <span class="ic">${p.icon}</span><small>${esc(p.name)}</small></button></div></div>`).join('');
  } else if (routeFrom) {
    const p = PLACE[routeFrom];
    placesHtml = `<div class="m-mark" style="left:${p.mapX}%;top:${p.mapY}%"><div class="inv"><div class="here-pin">
        <svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 31s10-11.2 10-18.5A10 10 0 0 0 2 12.5C2 19.8 12 31 12 31z"/><circle cx="12" cy="12.5" r="4"/></svg>
        <span>אני כאן</span></div></div></div>`;
  }
  $('#places').innerHTML = placesHtml;

  const svgEl = $('#route');
  if (routeFrom && !picking) {
    const a = placeXY(PLACE[routeFrom]), b = placeXY(dest);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = 0.18; // עיקול קל, כדי שהקו ייראה כמו מסלול ולא כמו סרגל
    const d = `M${a.x},${a.y} Q${mx - dy * k},${my + dx * k} ${b.x},${b.y}`;
    svgEl.innerHTML = `<path class="casing" d="${d}"/><path class="dash" d="${d}"/><circle class="start" cx="${a.x}" cy="${a.y}"/>`;
  } else {
    svgEl.innerHTML = '';
  }

  const bar = $('#routebar');
  const last = S.prefs.here && PLACE[S.prefs.here.id] && S.prefs.here.id !== dest.id ? PLACE[S.prefs.here.id] : null;
  if (picking) {
    bar.innerHTML = `<div class="rb"><div class="rb-t"><b>איפה אתם עכשיו?</b><small>הקישו על הנקודה הקרובה אליכם במפה</small></div>
      <button class="rb-btn alt" data-route="cancel">ביטול</button></div>`;
  } else if (routeFrom) {
    bar.innerHTML = `<div class="rb"><div class="rb-t"><b>${esc(PLACE[routeFrom].name)} ← ${esc(dest.name)}</b><small>הולכים לאורך הקו המקווקו</small></div>
      <button class="rb-btn alt" data-route="pick">שינוי</button>
      <button class="rb-x" data-route="clear" aria-label="הסרת המסלול">${ICON.close}</button></div>`;
  } else {
    bar.innerHTML = `<div class="rb"><button class="rb-btn" data-route="pick">${ICON.pin} איפה אני עכשיו?</button>
      ${last ? `<button class="rb-btn alt" data-route="last">מ${esc(last.name)}</button>` : ''}</div>`;
  }
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
