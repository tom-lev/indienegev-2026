/* מסך "הלוז שלי": רשימה כרונולוגית, קיבוץ התנגשויות לפי עדיפות, הפסקות */

/* הלשונית הנבחרת ב"הלוז שלי": 'me' או מזהה חבר */
function mineWho() {
  const id = S.prefs.mineView;
  return id && id !== 'me' ? S.friends.find(f => f.id === id) || null : null;
}
function mineTabs() {
  if (!S.friends.length) return '';
  const who = mineWho();
  return `<div class="who-tabs" role="tablist" aria-label="של מי הלוז">
    <button role="tab" data-who="me" aria-selected="${!who}">✦ שלי</button>
    ${S.friends.map(f => `<button role="tab" data-who="${f.id}" aria-selected="${who === f}" style="--fc:${f.color}"><span class="av sm">${f.emoji}</span>${esc(f.name)}</button>`).join('')}
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
function bindMineCommon(sc) {
  sc.addEventListener('click', e => {
    const w = e.target.closest('[data-who]');
    if (!w) return;
    S.prefs.mineView = w.dataset.who; save(); render();
    const sel = $('.who-tabs [aria-selected="true"]');
    if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
}

/* הלוז של חבר – לשונית נפרדת, בלי לערבב עם הלוז שלי */
function renderFriendMine(view, f) {
  const dayId = currentViewDay();
  const lvOf = id => f.picks[id] || 0;
  const all = BY_START.filter(e => lvOf(e.id));
  const dayPicks = all.filter(e => e.day === dayId && (S.prefs.showMaybe || lvOf(e.id) === 2));
  const must = all.filter(e => lvOf(e.id) === 2).length;
  const common = all.filter(e => level(e.id)).length;
  const live = f.src
    ? `<span class="live-dot ${f.liveErr ? 'off' : ''}"></span>${f.liveErr === 'gone' ? 'הפסיק/ה לשתף' : 'מתעדכן לבד'} · שינוי אחרון ${ago(f.importedAt)}`
    : `צילום מצב מ${ago(f.importedAt)} · לעדכון צריך קוד חדש`;
  const body = !all.length
    ? `<div class="empty"><h2>ל${esc(f.name)} אין הופעות בלוז</h2></div>`
    : !dayPicks.length
      ? `<div class="empty"><img src="${ASSETS.flower}" alt="" style="width:120px"><h2>יום פנוי</h2><p>ל${esc(f.name)} אין בחירות ב${DAY[dayId].label}${S.prefs.showMaybe ? '' : ' (מוצגים רק "חייב")'}.</p></div>`
      : dayList(dayPicks, lvOf, e => ({ nav: true, levelChip: true, lv: lvOf(e.id), noFriends: true }));
  view.innerHTML = `<div class="scroll" id="mscroll"><div class="pad">
    ${mineTabs()}
    <div class="friend-head" style="--fc:${f.color}">
      <span class="av" style="--fc:${f.color}">${f.emoji}</span>
      <div><b>הלוז של ${esc(f.name)}</b><small>${live}</small></div>
    </div>
    <div class="mine-head">
      <div class="stats">${must} חייב · ${all.length - must} אולי${common ? ` · ${common} משותפות איתך` : ''}</div>
      <label class="switch"><input type="checkbox" id="showMaybe" ${S.prefs.showMaybe ? 'checked' : ''}> הצג אולי</label>
    </div>
    ${body}
  </div></div>`;
  const sc = $('#mscroll');
  bindRows(sc);
  bindMineCommon(sc);
  const sm = $('#showMaybe');
  if (sm) sm.onchange = () => { S.prefs.showMaybe = sm.checked; save(); rerender(); };
  if (f.src) refreshFriends();
}

function renderMine(view) {
  const who = mineWho();
  if (who) return renderFriendMine(view, who);
  const dayId = currentViewDay();
  const all = myPicks();
  const dayPicks = all.filter(e => e.day === dayId && (S.prefs.showMaybe || level(e.id) === 2));
  const must = all.filter(e => level(e.id) === 2).length;
  const maybe = all.length - must;

  let body;
  if (!all.length) {
    body = `<div class="empty">
      <img src="${ASSETS.butterfly}" alt="">
      <h2>עוד לא בחרת הופעות</h2>
      <p>בלוז המלא: לחיצה על הופעה פותחת פרטים, ולחיצה ארוכה מוסיפה אותה ישר כ"חייב".</p>
      <div class="btn-row" style="justify-content:center"><button class="btn" data-go="grid">${ICON.grid} ללוז המלא</button>
      <button class="btn alt" data-act="import">${ICON.import} ייבוא לוז</button></div>
    </div>`;
  } else if (!dayPicks.length) {
    body = `<div class="empty"><img src="${ASSETS.flower}" alt="" style="width:120px"><h2>יום פנוי</h2><p>אין לך בחירות ב${DAY[dayId].label}${S.prefs.showMaybe ? '' : ' (מוצגים רק "חייב")'}.</p>
      <button class="btn" data-go="grid">${ICON.grid} ללוז של ${DAY[dayId].label}</button></div>`;
  } else {
    body = dayList(dayPicks, level, () => ({ nav: true, levelChip: true, noFriends: true }));
  }

  const warn = storageOK ? '' : `<div class="banner warn"><b>שימו לב:</b> הדפדפן הזה לא מאפשר שמירה, אז הבחירות יימחקו כשהדף ייסגר. כדאי לשמור קובץ גיבוי (הגדרות ← גיבוי ושחזור).</div>`;

  view.innerHTML = `<div class="scroll" id="mscroll"><div class="pad">
    ${warn}
    ${migrateBanner()}
    ${mineTabs()}
    ${all.length ? `<div class="mine-head">
      <div class="stats">${must} חייב · ${maybe} אולי</div>
      <label class="switch"><input type="checkbox" id="showMaybe" ${S.prefs.showMaybe ? 'checked' : ''}> הצג אולי</label>
    </div>` : ''}
    ${body}
  </div></div>`;

  const sc = $('#mscroll');
  bindRows(sc);
  bindMigrate(sc);
  bindMineCommon(sc);
  sc.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) setTab(go.dataset.go);
    const act = e.target.closest('[data-act="import"]');
    if (act) openImport();
  });
  const sm = $('#showMaybe');
  if (sm) sm.onchange = () => { S.prefs.showMaybe = sm.checked; save(); rerender(); };
}
