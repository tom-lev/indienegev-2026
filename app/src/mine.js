/* מסך "הלוז שלי": רשימה כרונולוגית, קיבוץ התנגשויות לפי עדיפות, הפסקות */

function renderMine(view) {
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
    body = clusters(dayPicks).map((cl, i, arr) => {
      let html = '';
      if (i > 0) {
        const prevEnd = Math.max(...arr[i - 1].map(e => e.end));
        const gap = (cl[0].start - prevEnd) / MIN;
        if (gap >= 10) html += `<div class="gap-row">הפסקה של ${fmtDur(gap)}</div>`;
      }
      if (cl.length === 1) return html + eventRow(cl[0], { nav: true, levelChip: true });
      const musts = cl.filter(e => level(e.id) === 2);
      const hardClash = musts.some((a, j) => musts.slice(j + 1).some(b => overlaps(a, b)));
      const title = hardClash
        ? `⚠ התנגשות: ${musts.length} הופעות "חייב" חופפות`
        : musts.length ? '◐ חפיפה עם "אולי"' : '◐ חפיפה בין "אולי"';
      const rows = cl.map(e => {
        const muted = !hardClash && musts.length && level(e.id) === 1;
        return eventRow(e, { nav: true, levelChip: true, cls: muted ? 'muted' : '' });
      }).join('');
      return html + `<div class="clash ${hardClash ? '' : 'soft'}"><div class="clash-h">${title}</div>${rows}</div>`;
    }).join('');
  }

  const warn = storageOK ? '' : `<div class="banner warn"><b>שימו לב:</b> הדפדפן הזה לא מאפשר שמירה, אז הבחירות יימחקו כשהדף ייסגר. כדאי לשמור קובץ גיבוי (הגדרות ← גיבוי ושחזור).</div>`;

  view.innerHTML = `<div class="scroll" id="mscroll"><div class="pad">
    ${warn}
    ${migrateBanner()}
    ${backupNudge()}
    ${all.length ? `<div class="mine-head">
      <div class="stats">${must} חייב · ${maybe} אולי${S.friends.length ? ` · ${S.friends.length} חברים` : ''}</div>
      <label class="switch"><input type="checkbox" id="showMaybe" ${S.prefs.showMaybe ? 'checked' : ''}> הצג אולי</label>
    </div>` : ''}
    ${body}
  </div></div>`;

  const sc = $('#mscroll');
  bindRows(sc);
  bindNudge(sc);
  bindMigrate(sc);
  sc.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) setTab(go.dataset.go);
    const act = e.target.closest('[data-act="import"]');
    if (act) openImport();
  });
  const sm = $('#showMaybe');
  if (sm) sm.onchange = () => { S.prefs.showMaybe = sm.checked; save(); rerender(); };
}
