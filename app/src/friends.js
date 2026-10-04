/* לוז קבוצתי: רשימת חברים, הופעות משותפות */

function upsertFriend(d) {
  const mine = d.src && typeof cloudAuth !== 'undefined' && cloudAuth && cloudAuth.uid === d.src;
  const src = mine ? null : d.src || null;
  const existing = (src && S.friends.find(f => f.src === src)) || S.friends.find(f => f.name === d.name);
  if (existing) {
    existing.picks = d.picks;
    existing.importedAt = Date.now();
    if (src) existing.src = src;
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
    });
  }
  save();
  if (src) { friendsPulledAt = 0; refreshFriends(); }
  return existing || S.friends[S.friends.length - 1];
}

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
      const same = JSON.stringify(Object.entries(r.picks).sort()) === JSON.stringify(Object.entries(cur.picks).sort());
      if (!same) { cur.picks = r.picks; cur.importedAt = r.at || Date.now(); changed = true; }
    }
  } finally { friendsPulling = false; }
  if (changed || ui) { save(); rerender(); }
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

function openFriends() {
  const api = openPanel('חברים והלוז הקבוצתי', (body, api) => {
    const fr = S.friends;
    const me = { name: 'אני', emoji: '✦', color: '#f46f6a' };

    // הופעות משותפות: לפחות 2 אנשים (כולל אותי) מבין הפעילים
    const act = activeFriends();
    const shared = BY_START.map(ev => {
      const people = act.filter(f => f.picks[ev.id]);
      if (level(ev.id)) people.unshift(me);
      return { ev, people };
    }).filter(x => x.people.length >= 2);

    const friendRows = fr.map(f => `
      <div class="friend-row ${f.active === false ? 'off' : ''}">
        <button class="av" style="--fc:${f.color}" data-emoji="${f.id}" aria-label="החלפת אימוג'י">${f.emoji}</button>
        <div class="info">
          <div class="n">${esc(f.name)}</div>
          <div class="m">${Object.keys(f.picks).length} הופעות · ${f.src ? (f.liveErr === 'gone' ? 'הפסיק/ה לשתף' : '🔄 מתעדכן לבד') : 'צילום מצב'} · ${ago(f.importedAt)}</div>
        </div>
        <button class="icon-btn" data-toggle="${f.id}" aria-label="${f.active === false ? 'הצג' : 'הסתר'}">${f.active === false ? ICON.eyeOff : ICON.eye}</button>
        <button class="icon-btn" data-rename="${f.id}" aria-label="שינוי שם">${ICON.edit}</button>
        <button class="icon-btn" data-del="${f.id}" aria-label="מחיקה">${ICON.trash}</button>
      </div>`).join('');

    let lastDay = null;
    const sharedRows = shared.map(({ ev, people }) => {
      const sep = ev.day !== lastDay ? `<div class="hour-sep">${dayLabel(ev.day)}</div>` : '';
      lastDay = ev.day;
      const st = STAGE[ev.stage];
      return sep + `<div class="row lv${level(ev.id)}" style="${stageVars(ev.stage)}" data-ev="${ev.id}" role="button" tabindex="0">
        <div class="t">${ev.s}<small>${ev.e}</small></div>
        <div><div class="n">${esc(ev.name)}</div>
          <div class="sub"><span class="stag">${esc(st.short)}</span>${friendAvatars(people)}<span>${people.length} הולכים</span></div></div>
        <button class="nav-btn" data-nav="${ev.id}" aria-label="ניווט">${ICON.pin}</button>
      </div>`;
    }).join('');

    body.innerHTML = `
      <button class="btn block" data-a="import" style="margin-bottom:14px">${ICON.import} הוספת חבר/ה (קוד או QR)</button>
      ${fr.length ? friendRows : `<div class="empty" style="padding:16px"><p>עוד אין חברים ברשימה. בקשו מהם לשתף את הלוז שלהם (בכפתור "שתף" ב"הלוז שלי") וייבאו אותו כאן.</p></div>`}
      ${fr.length ? `<label class="switch" style="margin:6px 0 4px"><input type="checkbox" id="onGrid" ${S.prefs.friendsOnGrid ? 'checked' : ''}> הצג חברים על הלוז המלא</label>
        <p style="font-size:12.5px;color:var(--ink-2);margin:6px 0 0">🔄 = הלוז מתעדכן לבד כשיש אינטרנט. "צילום מצב" = קוד ישן – לעדכון מבקשים מהם קוד חדש. הלוז של כל חבר מופיע כלשונית נפרדת ב"הלוז שלי".</p>` : ''}
      ${fr.length ? `<h3 class="section-t">הופעות משותפות <span class="chip soft">${shared.length}</span></h3>
        ${sharedRows || '<p style="color:var(--ink-2)">עוד אין הופעה שלפחות שניים מכם בחרו.</p>'}` : ''}`;

    body.onclick = e => {
      const b = e.target.closest('button, [data-ev]');
      if (!b) return;
      const f = id => S.friends.find(x => x.id === id);
      if (b.dataset.a === 'import') return openImport();
      if (b.dataset.toggle) { const x = f(b.dataset.toggle); x.active = x.active === false; save(); return api.render(); }
      if (b.dataset.emoji) {
        const x = f(b.dataset.emoji);
        const i = FRIEND_EMOJI.indexOf(x.emoji);
        x.emoji = FRIEND_EMOJI[(i + 1) % FRIEND_EMOJI.length];
        x.color = FRIEND_COLOR[(FRIEND_COLOR.indexOf(x.color) + 1) % FRIEND_COLOR.length];
        save(); return api.render();
      }
      if (b.dataset.rename) {
        const x = f(b.dataset.rename);
        const n = prompt('שם חדש:', x.name);
        if (n && n.trim()) { x.name = n.trim().slice(0, 24); save(); api.render(); }
        return;
      }
      if (b.dataset.del) {
        const x = f(b.dataset.del);
        if (confirm(`למחוק את ${x.name} מרשימת החברים?`)) { S.friends = S.friends.filter(y => y !== x); if (S.prefs.mineView === x.id) S.prefs.mineView = 'me'; save(); api.render(); }
        return;
      }
      rowClick(e);
    };
    const og = $('#onGrid', body);
    if (og) og.onchange = () => { S.prefs.friendsOnGrid = og.checked; save(); };
  });
  api.live = true; // מתעדכן כשמשנים בחירות מתוך גיליון שנפתח מעליו
}
