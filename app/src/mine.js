/* מסך "הלוז שלי": לשוניות – שלי / משותף (אני + החברים) / כל חבר בנפרד.
   בכל לשונית: רשימה כרונולוגית (עם קיבוץ התנגשויות והפסקות) או לפי במות. */

const ME = { name: 'אני', emoji: '✦', color: '#f46f6a' };

/* הלשונית הנבחרת: { kind: 'me' } | { kind: 'shared' } | { kind: 'friend', f } */
function mineSel() {
  const v = S.prefs.mineView;
  if (v === 'shared' && S.friends.length) return { kind: 'shared' };
  const f = v && v !== 'me' && v !== 'shared' ? S.friends.find(x => x.id === v) : null;
  return f ? { kind: 'friend', f } : { kind: 'me' };
}
/* הרמה שקובעת אם הופעה נכללת (במשותף – הגבוהה מבין כולם) */
function selLv(sel) {
  if (sel.kind === 'friend') return id => sel.f.picks[id] || 0;
  if (sel.kind === 'shared') return id => Math.max(level(id), ...activeFriends().map(f => f.picks[id] || 0));
  return level;
}
const sharedPeople = ev => [...(level(ev.id) ? [ME] : []), ...friendsGoing(ev)];
const mineSet = (sel = mineSel()) => { const lv = selLv(sel); return BY_START.filter(e => lv(e.id)); };

function mineTabs(sel) {
  if (!S.friends.length) return '';
  const on = k => sel.kind === k;
  return `<div class="who-tabs" role="tablist" aria-label="של מי הלוז">
    <button role="tab" data-who="me" aria-selected="${on('me')}">✦ שלי</button>
    <button role="tab" data-who="shared" aria-selected="${on('shared')}">${ICON.users}משותף</button>
    ${S.friends.map(f => `<button role="tab" data-who="${f.id}" aria-selected="${sel.f === f}" style="--fc:${f.color}"><span class="av sm">${f.emoji}</span>${esc(f.name)}</button>`).join('')}
  </div>`;
}

/* רשימת היום עם קיבוץ חפיפות. lvOf – הרמה של כל הופעה בלוז המוצג */
function dayList(dayPicks, lvOf, rowOpts) {
  return clusters(dayPicks).map((cl, i, arr) => {
    let html = '';
    if (i > 0) {
      const prevEnd = Math.max(...arr[i - 1].map(e => e.end));
      const gap = (cl[0].start - prevEnd) / MIN;
      if (gap >= 10) html += `<div class="gap-row">הפסקה של ${fmtDur(gap)}</div>`;
    }
    if (cl.length === 1) return html + eventRow(cl[0], rowOpts(cl[0]));
    const musts = cl.filter(e => lvOf(e.id) === 2);
    const hardClash = musts.some((a, j) => musts.slice(j + 1).some(b => overlaps(a, b)));
    const title = hardClash
      ? `⚠ התנגשות: ${musts.length} הופעות "חייב" חופפות`
      : musts.length ? '◐ חפיפה עם "אולי"' : '◐ חפיפה בין "אולי"';
    const rows = cl.map(e => {
      const muted = !hardClash && musts.length && lvOf(e.id) === 1;
      return eventRow(e, { ...rowOpts(e), cls: muted ? 'muted' : '' });
    }).join('');
    return html + `<div class="clash ${hardClash ? '' : 'soft'}"><div class="clash-h">${title}</div>${rows}</div>`;
  }).join('');
}
/* הלוז המשותף כרשימה: לפי שעה, ליד כל הופעה – מי הולך */
function sharedList(evs) {
  let lastH = null;
  return evs.map(ev => {
    const h = ev.s.slice(0, 2);
    const sep = h !== lastH ? `<div class="hour-sep">${h}:00</div>` : '';
    lastH = h;
    const people = sharedPeople(ev);
    return sep + eventRow(ev, { nav: true, levelChip: true, people, cls: people.length >= 2 ? 'together' : '' });
  }).join('');
}

function headCard(sel) {
  if (sel.kind === 'friend') {
    const f = sel.f;
    const live = f.src
      ? `<span class="live-dot ${f.liveErr ? 'off' : ''}"></span>${f.liveErr === 'gone' ? 'הפסיק/ה לשתף' : 'מתעדכן לבד'} · שינוי אחרון ${ago(f.importedAt)}`
      : `צילום מצב מ${ago(f.importedAt)} · לעדכון צריך קוד חדש`;
    return `<div class="friend-head" style="--fc:${f.color}">
      <span class="av" style="--fc:${f.color}">${f.emoji}</span>
      <div><b>הלוז של ${esc(f.name)}</b><small>${live}</small></div>
    </div>`;
  }
  if (sel.kind === 'shared') {
    const act = activeFriends(), hidden = S.friends.length - act.length;
    return `<div class="friend-head shared-head">
      ${friendAvatars([ME, ...act], false)}
      <div><b>הלוז המשותף</b><small>אני${act.map(f => ' + ' + esc(f.name)).join('')}${hidden ? ` · ${hidden} מוסתרים (במסך החברים)` : ''}</small></div>
    </div>`;
  }
  return '';
}

function renderMine(view) {
  const sel = mineSel();
  const dayId = currentViewDay();
  const incl = selLv(sel);
  const all = mineSet(sel);
  let dayEvs = all.filter(e => e.day === dayId && (S.prefs.showMaybe || incl(e.id) === 2));
  const togetherN = sel.kind === 'shared' ? dayEvs.filter(e => sharedPeople(e).length >= 2).length : 0;
  if (sel.kind === 'shared' && S.prefs.together) dayEvs = dayEvs.filter(e => sharedPeople(e).length >= 2);
  const byStage = S.prefs.mineLayout === 'stages';
  const fname = sel.kind === 'friend' ? esc(sel.f.name) : '';
  const maybeNote = S.prefs.showMaybe ? '' : ' (מוצגים רק "חייב")';

  let empty = '';
  if (!all.length) {
    empty = sel.kind === 'me'
      ? `<div class="empty">
          <img src="${ASSETS.butterfly}" alt="">
          <h2>עוד לא בחרת הופעות</h2>
          <p>בלוז המלא: לחיצה על הופעה פותחת פרטים, ולחיצה ארוכה מוסיפה אותה ישר כ"חייב".</p>
          <div class="btn-row" style="justify-content:center"><button class="btn" data-go="grid">${ICON.grid} ללוז המלא</button>
          <button class="btn alt" data-act="import">${ICON.import} ייבוא לוז</button></div>
        </div>`
      : `<div class="empty"><h2>${sel.kind === 'friend' ? `ל${fname} אין הופעות בלוז` : 'עוד אין הופעות בלוז של אף אחד'}</h2></div>`;
  } else if (!dayEvs.length) {
    const who = sel.kind === 'friend' ? `ל${fname} אין` : sel.kind === 'shared' ? (S.prefs.together ? 'אין הופעות משותפות' : 'אין לאף אחד') : 'אין לך';
    empty = `<div class="empty"><img src="${ASSETS.flower}" alt="" style="width:120px"><h2>יום פנוי</h2><p>${who}${S.prefs.together && sel.kind === 'shared' ? '' : ' בחירות'} ב${DAY[dayId].label}${maybeNote}.</p>
      ${sel.kind === 'me' ? `<button class="btn" data-go="grid">${ICON.grid} ללוז של ${DAY[dayId].label}</button>` : ''}</div>`;
  }

  let stats = '';
  if (sel.kind === 'shared') stats = `${all.length} הופעות · ${togetherN} ביחד ב${DAY[dayId].label}`;
  else {
    const must = all.filter(e => incl(e.id) === 2).length;
    const common = sel.kind === 'friend' ? all.filter(e => level(e.id)).length : 0;
    stats = `${must} חייב · ${all.length - must} אולי${common ? ` · ${common} משותפות איתך` : ''}`;
  }
  const tools = all.length ? `<div class="mine-head"><div class="stats">${stats}</div></div>
    <div class="mine-tools">
      <div class="seg" role="group" aria-label="תצוגה">
        <button data-layout="list" aria-pressed="${!byStage}">רשימה</button>
        <button data-layout="stages" aria-pressed="${byStage}">לפי במה</button>
      </div>
      ${sel.kind === 'shared' ? `<div class="seg" role="group" aria-label="סינון">
        <button data-together="0" aria-pressed="${!S.prefs.together}">כולם</button>
        <button data-together="1" aria-pressed="${!!S.prefs.together}">רק ביחד</button>
      </div>` : ''}
      <span class="spacer"></span>
      <label class="switch"><input type="checkbox" id="showMaybe" ${S.prefs.showMaybe ? 'checked' : ''}> אולי</label>
    </div>` : '';

  const warn = sel.kind === 'me' && !storageOK ? `<div class="banner warn"><b>שימו לב:</b> הדפדפן הזה לא מאפשר שמירה, אז הבחירות יימחקו כשהדף ייסגר. כדאי לשמור קובץ גיבוי (הגדרות ← גיבוי ושחזור).</div>` : '';
  const top = `${warn}${sel.kind === 'me' ? migrateBanner() : ''}${mineTabs(sel)}${headCard(sel)}${tools}`;

  let root;
  if (byStage && !empty) {
    // לפי במות: רק הבמות והשעות שיש בהן הופעות מהלוז המוצג
    const ids = new Set(dayEvs.map(e => e.id));
    const g = gridMarkup(dayId, {
      only: e => ids.has(e.id),
      lvOf: sel.kind === 'friend' ? incl : level,
      people: sel.kind === 'shared' ? sharedPeople : sel.kind === 'friend' ? (ev => (level(ev.id) ? [ME] : [])) : null,
    });
    view.innerHTML = `<div class="mine-split"><div class="mine-top">${top}</div><div class="gscroll scroll" id="gscroll">${g.html}</div></div>`;
    const sc = $('#gscroll');
    sc.dataset.t0 = g.t0; sc.dataset.t1 = g.t1;
    bindCardPress(sc);
    updateNowLine();
    root = $('.mine-top', view);
  } else {
    let body = empty;
    if (!body) {
      body = sel.kind === 'shared' ? sharedList(dayEvs)
        : dayList(dayEvs, incl, e => ({ nav: true, levelChip: true, noFriends: true, ...(sel.kind === 'friend' ? { lv: incl(e.id) } : {}) }));
    }
    view.innerHTML = `<div class="scroll" id="mscroll"><div class="pad">${top}${body}</div></div>`;
    root = $('#mscroll');
    bindRows(root);
  }

  bindMigrate(root);
  root.addEventListener('click', e => {
    const w = e.target.closest('[data-who]');
    if (w) {
      S.prefs.mineView = w.dataset.who; save(); render();
      const s = $('.who-tabs [aria-selected="true"]');
      if (s) s.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      return;
    }
    const l = e.target.closest('[data-layout]');
    if (l) { S.prefs.mineLayout = l.dataset.layout; save(); return render(); }
    const t = e.target.closest('[data-together]');
    if (t) { S.prefs.together = t.dataset.together === '1'; save(); return render(); }
    const go = e.target.closest('[data-go]');
    if (go) return setTab(go.dataset.go);
    if (e.target.closest('[data-act="import"]')) openImport();
  });
  const sm = $('#showMaybe');
  if (sm) sm.onchange = () => { S.prefs.showMaybe = sm.checked; save(); rerender(); };
  if (sel.kind !== 'me') refreshFriends();
}
