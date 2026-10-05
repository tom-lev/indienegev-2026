/* לוז קבוצתי: רשימת חברים, הופעות משותפות */

/* ───────── דמויות ─────────
   כל משתמש בוחר לעצמו דמות (S.avatar = { i, auto, at }; at = מתי קיבל אותה); היא עוברת לחברים בקוד/בלינק/בלוז החי.
   אצלי – לכל אחד דמות אחרת: מי שהדמות שבחר כבר תפוסה (אצלי) מקבל לתצוגה דמות פנויה. */
const myAvatar = () => (S.avatar && validAv(S.avatar.i) ? S.avatar.i : null);
function meLook() {
  const i = myAvatar();
  return i == null ? { name: 'אני', emoji: '✦', color: '#f46f6a' } : { name: 'אני', emoji: AVATARS[i][0], color: AVATARS[i][1] };
}
const lookIdx = f => AVATARS.findIndex(a => a[0] === f.emoji);
/* דמויות שתפוסות ע"י החברים שלי: אינדקס → שם */
function takenAvatars() {
  const t = new Map();
  for (const f of S.friends) { const i = lookIdx(f); if (i >= 0 && !t.has(i)) t.set(i, f.name); }
  return t;
}
const freeAvatar = used => { for (let i = 0; i < AVATARS.length; i++) if (!used.has(i)) return i; return null; };
/* לכל אחד דמות ייחודית אצלי. מחזיר true אם משהו השתנה */
function resolveAvatars() {
  const used = new Set();
  const mine = myAvatar();
  if (mine != null) used.add(mine);
  let changed = false;
  const put = (f, i) => {
    const [e, c] = i == null ? [f.emoji, f.color] : AVATARS[i];
    if (f.emoji !== e || f.color !== c) { f.emoji = e; f.color = c; changed = true; }
    if (i != null) used.add(i);
  };
  const later = [];
  for (const f of S.friends) { if (validAv(f.avatar) && !used.has(f.avatar)) put(f, f.avatar); else later.push(f); }
  for (const f of later) { const cur = lookIdx(f); put(f, cur >= 0 && !used.has(cur) ? cur : freeAvatar(used)); }
  return changed;
}
/* אם עוד לא בחרתי – מקבל דמות פנויה (אפשר להחליף בכל רגע) */
function ensureAvatar() {
  if (myAvatar() != null) return false;
  // מכשיר חדש שעוד לא קיבל את הנתונים מהענן – לא בוחרים, כדי לא לדרוס דמות שנבחרה במכשיר אחר
  if (typeof cloudAuth !== 'undefined' && cloudAuth && !(cloudState && cloudState.at)) return false;
  const i = freeAvatar(new Set(takenAvatars().keys()));
  S.avatar = { i: i == null ? 0 : i, auto: true, at: Date.now() };
  resolveAvatars();
  return true;
}
function setMyAvatar(i) {
  S.avatar = { i, auto: false, at: Date.now(), picked: true };
  resolveAvatars();
  save();
  rerender();
}
/* דמות תפוסה כל עוד מי שקיבל אותה (אוטומטית או בבחירה) לא ויתר עליה.
   אם בכל זאת לשנינו אותה דמות (קיבלנו לפני שידענו זה על זה) – מי שקיבל אותה מאוחר יותר עובר לדמות פנויה.
   theirAt = מתי החבר קיבל אותה (לא ידוע = לפניי). זמן זהה – לפי המזהה, כדי שרק אחד יוותר */
function yieldAvatar(av, src, theirAt, name) {
  if (!validAv(av) || myAvatar() !== av) return false;
  const myAt = S.avatar.at || 0, at = theirAt == null ? 0 : theirAt;
  const me = typeof cloudAuth !== 'undefined' && cloudAuth ? cloudAuth.uid : null;
  if (at > myAt || (at === myAt && src && me && me < src)) return false; // אני הייתי ראשון
  const used = new Set([av, ...takenAvatars().keys(), ...S.friends.map(f => f.avatar).filter(validAv)]);
  const i = freeAvatar(used);
  if (i == null) return false;
  S.avatar = { i, auto: true, at: Date.now(), ...(S.avatar.picked ? { picked: true } : {}) };
  toast(`${AVATARS[av][0]} כבר של ${name || 'חבר/ה'} · קיבלת ${AVATARS[i][0]} (אפשר להחליף במסך החברים)`);
  return true;
}
/* בוחר דמות: 10 אפשרויות, התפוסות (אצל החברים שלי) חסומות */
function avatarPicker() {
  const taken = takenAvatars(), mine = myAvatar();
  return `<div class="av-pick" role="radiogroup" aria-label="הדמות שלך">${AVATARS.map(([e, c], i) => {
    const by = taken.get(i);
    return `<button type="button" role="radio" class="av-opt ${i === mine ? 'on' : ''}" style="--fc:${c}" data-av="${i}" aria-checked="${i === mine}" ${by && i !== mine ? `disabled title="תפוס: ${esc(by)}"` : ''}>
      <span class="av">${e}</span>${by && i !== mine ? `<small>${esc(by)}</small>` : ''}</button>`;
  }).join('')}</div>`;
}
function bindAvatarPicker(root, after) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-av]');
    if (!b || b.disabled) return;
    setMyAvatar(+b.dataset.av);
    after && after();
  });
}

function upsertFriend(d) {
  const mine = d.src && typeof cloudAuth !== 'undefined' && cloudAuth && cloudAuth.uid === d.src;
  const src = mine ? null : d.src || null;
  const existing = (src && S.friends.find(f => f.src === src)) || S.friends.find(f => f.name === d.name);
  if (!mine && !src) yieldAvatar(d.avatar, null, null, d.name); // לוז חי – מחכים לזמן האמיתי מהענן
  if (existing) {
    existing.picks = d.picks;
    existing.importedAt = Date.now();
    if (src) existing.src = src;
    if (validAv(d.avatar)) existing.avatar = d.avatar;
  } else {
    const i = S.friends.length;
    S.friends.push({
      id: 'f' + Date.now().toString(36),
      name: d.name,
      emoji: FRIEND_EMOJI[i % FRIEND_EMOJI.length],
      color: FRIEND_COLOR[i % FRIEND_COLOR.length],
      picks: d.picks,
      importedAt: Date.now(),
      active: true,
      ...(src ? { src } : {}),
      ...(validAv(d.avatar) ? { avatar: d.avatar } : {}),
    });
  }
  ensureAvatar();
  resolveAvatars();
  save();
  if (src) { friendsPulledAt = 0; refreshFriends(); }
  return existing || S.friends[S.friends.length - 1];
}

/* "נראה לאחרונה" של כל חבר: נשמר מקומית בלבד (לא בגיבוי) כדי שבדיקה כל דקה לא תיצור כתיבות לענן */
const FSEEN_KEY = 'indienegev-fseen';
const friendSeen = (() => { try { return JSON.parse(localStorage.getItem(FSEEN_KEY)) || {}; } catch (e) { return {}; } })();
function seenText(f) {
  const t = f.src && friendSeen[f.src];
  if (!t) return '';
  const m = (Date.now() - t) / MIN;
  return m < 3 ? 'באפליקציה עכשיו' : `נראה/תה לאחרונה ${ago(t)}`;
}
/* אני: מעדכן "נראה לאחרונה" בפתיחה / חזרה לאפליקציה (לכל היותר פעם ב-3 דקות) */
let seenPingAt = 0;
function pingSeen() {
  if (typeof CC === 'undefined' || !CC.on || !cloudAuth || !navigator.onLine || document.hidden) return;
  if (Date.now() - seenPingAt < 3 * MIN) return;
  seenPingAt = Date.now();
  CC.touchShare().catch(() => { seenPingAt = 0; });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pingSeen(); });
setInterval(pingSeen, 5 * MIN);

/* "מה השתנה" בלוז של חבר מאז שבדקתי: f.seen = הלוז שראיתי בפעם האחרונה */
function friendDiff(f) {
  if (!f.seen) return null;
  const added = [], removed = [], up = [], down = [];
  for (const [id, lv] of Object.entries(f.picks)) {
    if (!EV[id]) continue;
    const was = f.seen[id] || 0;
    if (!was) added.push(id); else if (lv > was) up.push(id); else if (lv < was) down.push(id);
  }
  for (const id of Object.keys(f.seen)) if (!f.picks[id] && EV[id]) removed.push(id);
  return added.length + removed.length + up.length + down.length ? { added, removed, up, down } : null;
}
const sessionDiff = {}; // מה השתנה – נשאר גלוי עד "הבנתי" גם אחרי שסומן כנראה

/* לוז חי: משיכת הלוז העדכני של כל חבר ששיתף עם קוד חי (בפתיחה, בחזרה לאפליקציה, בחזרת קליטה, בכניסה ללשונית שלו).
   לכל היותר פעם בדקה. בלי קליטה – נשאר הלוז האחרון שנמשך. */
let friendsPulledAt = 0, friendsPulling = false;
async function refreshFriends(force = false) {
  if (typeof CC === 'undefined' || !CC.on || !navigator.onLine || friendsPulling) return;
  if (!force && Date.now() - friendsPulledAt < 60000) return;
  const list = S.friends.filter(f => f.src);
  if (!list.length) return;
  friendsPulling = true; friendsPulledAt = Date.now();
  let changed = false, ui = false;
  try {
    for (const f of list) {
      let r;
      try { r = await CC.fetchShare(f.src); } catch (e) { continue; } // קליטה חלשה – ננסה בפעם הבאה
      const cur = S.friends.find(x => x.src === f.src); // ייתכן שהרשימה השתנתה בזמן הבקשה
      if (!cur) continue;
      if (!r) { if (cur.liveErr !== 'gone') { cur.liveErr = 'gone'; ui = true; } continue; }
      if (cur.liveErr) { delete cur.liveErr; ui = true; }
      if (r.seenAt && friendSeen[cur.src] !== r.seenAt) { friendSeen[cur.src] = r.seenAt; ui = true; try { localStorage.setItem(FSEEN_KEY, JSON.stringify(friendSeen)); } catch (e) { /* */ } }
      if (!r.picks) continue;
      const same = JSON.stringify(Object.entries(r.picks).sort()) === JSON.stringify(Object.entries(cur.picks).sort());
      if (!same) { cur.picks = r.picks; cur.importedAt = r.at || Date.now(); changed = true; }
      if (validAv(r.avatar) && cur.avatar !== r.avatar) { cur.avatar = r.avatar; changed = true; }
      if (validAv(r.avatar) && yieldAvatar(r.avatar, cur.src, r.avAt, cur.name)) changed = true;
    }
    if (resolveAvatars()) changed = true;
  } finally { friendsPulling = false; }
  if (changed) save();
  if (changed || ui) rerender();
}
window.addEventListener('online', () => refreshFriends(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFriends(); });

function ago(ms) {
  const m = Math.round((Date.now() - ms) / MIN);
  if (m < 2) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}

/* מעבר לרשימת החברים (בלשונית "פרופיל") */
function openFriends() {
  closeAllLayers().then(() => {
    setTab('profile');
    const el = $('#friends');
    if (el) el.scrollIntoView({ block: 'start' });
  });
}

/* רשימת החברים – חלק מלשונית "פרופיל" */
function friendsBlock() {
  const fr = S.friends;
  const rows = fr.map(f => `
    <div class="friend-row ${f.active === false ? 'off' : ''}">
      <span class="av" style="--fc:${f.color}">${f.emoji}</span>
      <div class="info">
        <div class="n">${esc(f.name)}</div>
        <div class="m">${Object.keys(f.picks).length} הופעות · ${f.src ? (f.liveErr === 'gone' ? 'הפסיק/ה לשתף' : '🔄 מתעדכן לבד') : 'צילום מצב'} · ${ago(f.importedAt)}</div>
        ${seenText(f) ? `<div class="m seen">● ${seenText(f)}</div>` : ''}
      </div>
      <button class="icon-btn" data-toggle="${f.id}" aria-label="${f.active === false ? 'הצג' : 'הסתר'}">${f.active === false ? ICON.eyeOff : ICON.eye}</button>
      <button class="icon-btn" data-rename="${f.id}" aria-label="שינוי שם">${ICON.edit}</button>
      <button class="icon-btn" data-del="${f.id}" aria-label="מחיקה">${ICON.trash}</button>
    </div>`).join('');
  return `
    <button class="btn block" data-fa="import" style="margin-bottom:14px">${ICON.import} הוספת חבר/ה (לינק, קוד או QR)</button>
    ${fr.length ? rows : `<div class="empty" style="padding:16px"><p>עוד אין חברים ברשימה. בקשו מהם לשלוח לינק לשיתוף הלוז (בפרופיל ← "שיתוף הלוז שלי").</p></div>`}
    ${fr.length ? `<label class="switch" style="margin:6px 0 4px"><input type="checkbox" id="onGrid" ${S.prefs.friendsOnGrid ? 'checked' : ''}> הצג חברים על הלוז המלא</label>
      <p style="font-size:12.5px;color:var(--ink-2);margin:6px 0 14px">🔄 = הלוז מתעדכן לבד כשיש אינטרנט. "צילום מצב" = קוד ישן – לעדכון מבקשים מהם לינק חדש. 👁 = מוסתר/ת מ"משותף" ומהאייקונים. הלוז של כל חבר – לשונית נפרדת ב"הלוז שלי".</p>` : ''}`;
}
function bindFriends(root, refresh) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-fa], [data-toggle], [data-rename], [data-del]');
    if (!b) return;
    const f = id => S.friends.find(x => x.id === id);
    if (b.dataset.fa === 'import') return openImport();
    if (b.dataset.toggle) { const x = f(b.dataset.toggle); x.active = x.active === false; save(); return refresh(); }
    if (b.dataset.rename) {
      const x = f(b.dataset.rename);
      const n = prompt('שם חדש:', x.name);
      if (n && n.trim()) { x.name = n.trim().slice(0, 24); save(); refresh(); }
      return;
    }
    if (b.dataset.del) {
      const x = f(b.dataset.del);
      if (confirm(`למחוק את ${x.name} מרשימת החברים?`)) { S.friends = S.friends.filter(y => y !== x); if (S.prefs.mineView === x.id) S.prefs.mineView = 'me'; save(); refresh(); }
    }
  });
  const og = $('#onGrid', root);
  if (og) og.onchange = () => { S.prefs.friendsOnGrid = og.checked; save(); };
}
