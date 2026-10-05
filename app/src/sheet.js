/* גיליון הופעה: פרטים, רמת עניין, חברים, התנגשויות ומה קורה במקביל */

function openEvent(ev) {
  openSheet(body => renderEventSheet(body, ev));
}

/* כמה משתמשים בחרו את ההופעה (מכל המשתמשים, בלי שמות). נשמר מקומית – מוצג גם בלי קליטה */
const POP_KEY = 'indienegev-pop';
let popData = (() => { try { return JSON.parse(localStorage.getItem(POP_KEY)); } catch (e) { return null; } })();
let popBusy = false, popErr = '';
async function refreshPopular(force = false) {
  if (typeof CC === 'undefined' || !CC.on || !cloudAuth || !navigator.onLine || popBusy) return;
  if (!force && popData && popData.n && Date.now() - popData.at < 5 * MIN) return;
  popBusy = true;
  try {
    popData = await CC.fetchPopular();
    popErr = '';
    try { localStorage.setItem(POP_KEY, JSON.stringify(popData)); } catch (e) { /* */ }
    refreshSheet(false);
  } catch (e) { popErr = e.message || 'שגיאה'; /* אין קליטה וכו' – ננסה בפעם הבאה */ }
  finally { popBusy = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPopular(); });
function popLine(ev) {
  refreshPopular();
  if (!popData || popData.n < 1) return '';
  const [all, must] = popData.c[ev.id] || [0, 0];
  if (!all) return `<div class="pop-line">עוד אף אחד לא בחר · מתוך ${popData.n} משתמשים</div>`;
  const day = EVENTS.filter(e => e.day === ev.day && popData.c[e.id]).map(e => popData.c[e.id][0]);
  const rank = day.filter(x => x > all).length + 1;
  return `<div class="pop-line">🔥 ${all} ${all === 1 ? 'בחר/ה' : 'בחרו'}${must ? ` (${must} חייב)` : ''} מתוך ${popData.n} משתמשים${rank <= 10 ? ` · ${rank === 1 ? 'הכי פופולרית' : `מקום ${rank}`} ב${dayLabel(ev.day)}` : ''}</div>`;
}

function renderEventSheet(body, ev) {
  const st = STAGE[ev.stage];
  const lv = level(ev.id);
  const going = friendsGoing(ev);
  const conc = concurrent(ev);
  const mineClash = conc.filter(o => level(o.id));
  const others = conc.filter(o => !level(o.id));

  const tags = [
    `<span class="stage" style="--c:${st.color}">${st.icon} ${esc(st.name)}</span>`,
    ev.series ? `<span class="chip soft">${esc(ev.series)}</span>` : '',
    ev.type !== 'show' ? `<span class="chip soft">${TYPES[ev.type]}</span>` : '',
    ev.cancelled ? '<span class="chip warn">בוטל</span>' : '',
  ].join('');

  const sub = ev.sub.length
    ? `<ul class="ev-sub">${ev.sub.map(([t, by]) => `<li><b>${esc(t)}</b> <span>– ${esc(by)}</span></li>`).join('')}</ul>` : '';

  const ovRow = (o, mode) => {
    const olv = level(o.id);
    let act;
    if (mode === 'mine') act = `<button class="act" data-rm="${o.id}">הסר</button>`;
    else if (lv) act = `<button class="act solid" data-swap="${o.id}" title="מחליף את ההופעה הנוכחית בזו">החלף</button>`;
    else act = `<button class="act" data-add="${o.id}">+ חייב</button>`;
    return `<div class="ov lv${olv} ${isNope(o.id) ? 'nope' : ''}" style="--c:${STAGE[o.stage].color}">
      <button class="info" data-open="${o.id}">
        <div class="n">${olv ? LV_ICON[olv] + ' ' : ''}${isNope(o.id) ? '👎 ' : ''}${esc(o.name)}</div>
        <div class="m">${timeRange(o)} · חופף ${fmtDur(overlapMin(o, ev))}</div>
      </button>${act}</div>`;
  };

  const byStage = STAGES.map(s => ({ s, list: others.filter(o => o.stage === s.id).sort((a, b) => isNope(a.id) - isNope(b.id)) })).filter(g => g.list.length);

  body.innerHTML = `
    <div class="ev-tags">${tags}</div>
    <h2 class="ev-name">${esc(ev.name)}</h2>
    <div class="ev-meta">יום ${dayLabel(ev.day)} · ${timeRange(ev)} · ${fmtDur(dur(ev))}</div>
    ${popLine(ev)}
    ${ev.desc ? `<p class="ev-desc">${esc(ev.desc)}</p>` : ''}
    ${sub}
    <div class="levels" role="group" aria-label="רמת עניין">
      <button class="${lv === 2 ? 'on2' : ''}" data-lv="2" aria-pressed="${lv === 2}">★ חייב</button>
      <button class="${lv === 1 ? 'on1' : ''}" data-lv="1" aria-pressed="${lv === 1}">◐ אולי</button>
      <button class="rm" data-lv="0" aria-label="הסר מהלוז" ${lv ? '' : 'disabled style="opacity:.35"'}>${ICON.trash}</button>
      <button class="nope-btn ${isNope(ev.id) ? 'on' : ''}" data-nope aria-pressed="${isNope(ev.id)}" aria-label="לא בשבילי" title="לא בשבילי">👎</button>
    </div>
    ${going.length ? `<div class="going-line">גם הולכים: ${going.map(f => `<span class="av sm" style="--fc:${f.color}">${f.emoji}</span>${esc(f.name)} <span style="opacity:.6">(${LV_LABEL[f.picks[ev.id]]})</span>`).join(' ')}</div>` : ''}
    <button class="btn block" data-navgo>${ICON.pin} ניווט ל${esc(st.name)}</button>
    ${journalSection(ev)}

    ${mineClash.length ? `<div class="sec"><h3>מתנגש בלוז שלך <span class="chip warn">${mineClash.length}</span></h3>
      ${mineClash.map(o => ovRow(o, 'mine')).join('')}</div>` : ''}

    <div class="sec"><h3>באותו זמן בפסטיבל ${others.length ? `<span class="chip soft">${others.length}</span>` : ''}</h3>
      ${byStage.length ? byStage.map(g => `<div class="ov-group"><div class="gh" style="color:var(--ink)">${g.s.icon} ${esc(g.s.name)}</div>${g.list.map(o => ovRow(o, 'other')).join('')}</div>`).join('')
        : '<p style="color:var(--ink-2);margin:0">אין עוד משהו בזמן הזה.</p>'}
    </div>`;

  bindJournal(body, ev);
  body.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (journalClick(b, ev)) return;
    if ('nope' in b.dataset) { setNope(ev.id, !isNope(ev.id)); return; }
    if (b.dataset.lv != null) {
      const nl = +b.dataset.lv;
      setLevel(ev.id, nl === lv && nl ? 0 : nl);
    } else if (b.dataset.open) {
      sheetRender = bd => renderEventSheet(bd, EV[b.dataset.open]);
      refreshSheet(true);
    } else if (b.dataset.rm) {
      setLevel(b.dataset.rm, 0);
    } else if (b.dataset.add) {
      setLevel(b.dataset.add, 2);
    } else if (b.dataset.swap) {
      const other = b.dataset.swap;
      const prev = { [ev.id]: lv, [other]: level(other) };
      S.picks[other] = lv;
      delete S.picks[ev.id];
      save(); rerender();
      sheetRender = bd => renderEventSheet(bd, EV[other]);
      refreshSheet(true);
      toast(`הוחלף ל-${EV[other].name}`, {
        label: 'ביטול', fn: () => {
          for (const [id, v] of Object.entries(prev)) { if (v) S.picks[id] = v; else delete S.picks[id]; }
          save(); rerender(); refreshSheet();
        },
      });
    } else if ('navgo' in b.dataset) {
      navigateTo(ev);
    }
  };
}

/* גיליון במה (לחיצה על במה במפה) */
function openStage(stageId) {
  openSheet(body => {
    const st = STAGE[stageId];
    const t = now();
    const list = BY_START.filter(e => e.stage === stageId);
    const cur = list.find(e => e.start <= t && t < e.end);
    const day = logicalDay(t) || currentViewDay();
    const dayList = list.filter(e => e.day === day);
    body.innerHTML = `
      <div class="ev-tags"><span class="stage" style="--c:${st.color}">${st.icon} ${esc(st.name)}</span></div>
      <h2 class="ev-name">${cur ? 'עכשיו: ' + esc(cur.name) : esc(st.name)}</h2>
      <div class="ev-meta">${cur ? `עד ${cur.e} · נשארו ${fmtIn(cur.end - t)}` : `הלוז ב${DAY[day].label}`}</div>
      <div class="sec">${dayList.map(e => eventRow(e)).join('') || '<p>אין הופעות ביום הזה.</p>'}</div>`;
    body.onclick = rowClick;
  });
}
