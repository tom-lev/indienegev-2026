/* ליבה: נתונים מעובדים, זמן, שמירה, קידוד שיתוף, חיפוש */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const MIN = 60000;
const HOUR = 60 * MIN;

const STAGE = Object.fromEntries(STAGES.map(s => [s.id, s]));
const DAY = Object.fromEntries(DAYS.map(d => [d.id, d]));

function mkDate(dayId, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = DAY[dayId];
  return new Date(d.y, d.m - 1, d.d + (h < 7 ? 1 : 0), h, m).getTime();
}

const EVENTS = RAW.map((r, idx) => {
  const [day, stage, name, s, e, x = {}] = r;
  const start = mkDate(day, s);
  let end = mkDate(day, e);
  if (end <= start) end += 24 * HOUR;
  return {
    idx, day, stage, name, s, e, start, end,
    id: `${day}-${stage}-${s.replace(':', '')}`,
    type: x.type || 'show',
    alt: x.alt || '',
    desc: x.desc || '',
    people: x.people || [],
    series: x.series || '',
    sub: x.sub || [],
    cancelled: !!x.cancelled,
  };
});
const EV = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const BY_START = [...EVENTS].sort((a, b) => a.start - b.start || STAGES.indexOf(STAGE[a.stage]) - STAGES.indexOf(STAGE[b.stage]));
const FEST_START = Math.min(...EVENTS.map(e => e.start));
const FEST_END = Math.max(...EVENTS.map(e => e.end));

const dur = ev => Math.round((ev.end - ev.start) / MIN);
const overlapMin = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / MIN;
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const fmtT = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const timeRange = ev => `⁦${ev.s}–${ev.e}⁩`; // בידוד LTR כדי שהטווח לא יתהפך בטקסט עברי
const fmtDur = m => {
  m = Math.round(m);
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60), r = m % 60;
  const hs = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return r ? `${hs} ו-${r} דק׳` : hs;
};
const fmtIn = ms => fmtDur(Math.max(1, ms / MIN));
const dayLabel = id => `${DAY[id].label} ${DAY[id].date}`;

/* ───────── זמן ───────── */
let simTime = null; // הדמיית שעה (רק בסשן הנוכחי)
let simBase = 0;    // שעון אמיתי ברגע תחילת ההדמיה, כדי שהזמן המדומה ימשיך לרוץ

function now() {
  return simTime == null ? Date.now() : simTime + (Date.now() - simBase);
}
function setSim(ms) {
  simTime = ms; simBase = Date.now();
}
function isLive(t = Date.now()) {
  return t >= FEST_START - 2 * HOUR && t <= FEST_END + HOUR;
}
/* היום הלוגי: מ-07:00 עד 07:00 למחרת */
function logicalDay(t = now()) {
  for (const d of DAYS) {
    const s = new Date(d.y, d.m - 1, d.d, 7).getTime();
    if (t >= s && t < s + 24 * HOUR) return d.id;
  }
  return null;
}

/* ───────── שמירה ───────── */
const KEY = 'indn26';
const FRIEND_EMOJI = ['🦋', '🐘', '🐒', '🌵', '🌙', '🔥', '🌼', '🎸', '🪐', '🦎', '🍉', '⚡'];
const FRIEND_COLOR = ['#ef8d83', '#c5cc69', '#9c9ab9', '#5f8eaa', '#96a96a', '#f4cc6e', '#3b7ca3', '#f46f6a'];

function defaults() {
  return {
    v: 1, dataVersion: DATA_VERSION, name: '', picks: {}, friends: [], notes: [], ratings: {}, nope: {},
    prefs: { day: null, view: 'grid', filter: 'all', showMaybe: true, friendsOnGrid: true },
  };
}
let storageOK = true;
function load() {
  try {
    const t = '__t';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
  } catch (e) { storageOK = false; }
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && o.v === 1) {
      const d = defaults();
      return { ...d, ...o, prefs: { ...d.prefs, ...(o.prefs || {}) } };
    }
  } catch (e) { /* מתחילים מחדש */ }
  return defaults();
}
const S = load();
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { storageOK = false; }
  if (typeof mirrorSave === 'function') mirrorSave(); // עותק כפול ב-IndexedDB (backup.js)
}

const level = id => S.picks[id] || 0;
const isNope = id => !!(S.nope && S.nope[id]);
const myPicks = (minLevel = 1) => BY_START.filter(e => level(e.id) >= minLevel);
const activeFriends = () => S.friends.filter(f => f.active !== false);
const friendsGoing = ev => activeFriends().filter(f => f.picks[ev.id]);

/* ───────── קוד שיתוף ─────────
   מבנה: [גרסת נתונים][אורך שם][שם UTF-8][2 ביטים לכל הופעה לפי idx] → base64url */
function b64uEnc(bytes) {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDec(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
function encodeShare(name, picks) {
  let nb = new TextEncoder().encode((name || '').trim());
  if (nb.length > 60) nb = nb.slice(0, 60);
  const pb = new Uint8Array(Math.ceil(EVENTS.length / 4));
  for (const ev of EVENTS) {
    const lv = picks[ev.id] || 0;
    if (lv) pb[ev.idx >> 2] |= lv << ((ev.idx & 3) * 2);
  }
  const out = new Uint8Array(2 + nb.length + pb.length);
  out[0] = DATA_VERSION;
  out[1] = nb.length;
  out.set(nb, 2);
  out.set(pb, 2 + nb.length);
  return 'INDN1.' + b64uEnc(out);
}
function decodeShare(text) {
  const m = String(text || '').match(/INDN1\.([A-Za-z0-9_-]{4,})/);
  if (!m) return null;
  try {
    const b = b64uDec(m[1]);
    const nl = b[1];
    const name = new TextDecoder().decode(b.slice(2, 2 + nl));
    const pb = b.slice(2 + nl);
    const picks = {};
    for (const ev of EVENTS) {
      const lv = ((pb[ev.idx >> 2] || 0) >> ((ev.idx & 3) * 2)) & 3;
      if (lv) picks[ev.id] = Math.min(lv, 2);
    }
    return { name: name || 'חבר/ה', picks };
  } catch (e) { return null; }
}
const shareMessage = code => `הלוז שלי לאינדינגב 2026 🦋\nלייבוא באפליקציה "הלוז שלי": ${code}`;

/* ───────── חיפוש ───────── */
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const EXTRA = { 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'ı': 'i' };
/* מחזיר מחרוזת מנורמלת + מפה מכל תו מנורמל לאינדקס במקור (בשביל הדגשה) */
function normMap(str) {
  let out = '';
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < str.length; i++) {
    let c = str[i].toLowerCase();
    if (/[֑-ׇ]/.test(c)) continue;               // ניקוד וטעמים
    if (/[\s\-–—_/&+.,:;!?()'"׳״`’]/.test(c)) {             // פיסוק → רווח יחיד
      if (!lastSpace) { out += ' '; map.push(i); lastSpace = true; }
      continue;
    }
    c = FINALS[c] || EXTRA[c] || c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const ch of c) { out += ch; map.push(i); }
    lastSpace = false;
  }
  return { s: out, map };
}
const norm = str => normMap(str).s.trim();

const SEARCH_INDEX = EVENTS.map(ev => ({
  ev,
  name: normMap(ev.name),
  alt: norm(ev.alt),
  people: ev.people.map(p => [p, norm(p)]),
  sub: ev.sub.map(([t, by]) => [`${t} – ${by}`, norm(`${t} ${by}`)]),
  desc: norm(ev.desc + ' ' + ev.series),
}));

function search(q, kind = 'all') {
  const nq = norm(q);
  const res = [];
  for (const it of SEARCH_INDEX) {
    const ev = it.ev;
    if (kind === 'music' && ev.stage === 'adama') continue;
    if (kind === 'adama' && ev.stage !== 'adama') continue;
    if (!nq) { res.push({ ev, score: 0 }); continue; }
    const at = it.name.s.indexOf(nq);
    if (at >= 0) {
      const wordStart = at === 0 || it.name.s[at - 1] === ' ';
      const from = it.name.map[at];
      const to = it.name.map[at + nq.length - 1] + 1;
      res.push({ ev, score: at === 0 ? 3 : wordStart ? 2 : 1, hl: [from, to] });
      continue;
    }
    if (it.alt.includes(nq)) { res.push({ ev, score: 1 }); continue; }
    const p = it.people.find(([, n]) => n.includes(nq));
    if (p) { res.push({ ev, score: 0.5, hint: `משתתף/ת: ${p[0]}` }); continue; }
    const sb = it.sub.find(([, n]) => n.includes(nq));
    if (sb) { res.push({ ev, score: 0.5, hint: `בתוכנית: ${sb[0]}` }); continue; }
    if (nq.length >= 3 && it.desc.includes(nq)) res.push({ ev, score: 0.2, hint: ev.desc || ev.series });
  }
  if (!nq) return res.sort((a, b) => a.ev.name.localeCompare(b.ev.name, 'he'));
  return res.sort((a, b) => b.score - a.score || a.ev.start - b.ev.start);
}
function highlight(text, hl) {
  if (!hl) return esc(text);
  return esc(text.slice(0, hl[0])) + '<mark>' + esc(text.slice(hl[0], hl[1])) + '</mark>' + esc(text.slice(hl[1]));
}

/* ───────── התנגשויות ───────── */
function concurrent(ev) {
  return BY_START.filter(o => o !== ev && overlaps(o, ev));
}
/* מקבץ את הבחירות לקבוצות חופפות (טרנזיטיבית) */
function clusters(list) {
  const out = [];
  let cur = null, curEnd = 0;
  for (const ev of list) {
    if (cur && ev.start < curEnd) { cur.push(ev); curEnd = Math.max(curEnd, ev.end); }
    else { cur = [ev]; out.push(cur); curEnd = ev.end; }
  }
  return out;
}
