/* מסך "עכשיו ובקרוב": מה מתנגן בכל במה, ההופעה הבאה שלך, ומה החברים עושים */

function renderNow(view) {
  const live = isLive();
  const t = now();
  let html = '';

  if (simTime != null) {
    const d = logicalDay(t);
    html += `<div class="sim">⏱ הדמיה: ${d ? DAY[d].label : ''} ${fmtT(t)} <button class="btn sm" data-sim-off>יציאה מהדמיה</button></div>`;
  }

  if (!live && simTime == null) {
    html += preFestival();
  } else if (t > FEST_END) {
    html += `<div class="pre"><img src="${ASSETS.butterfly}" alt=""><h2>הפסטיבל נגמר 💛</h2><p>נתראה באינדינגב הבא.</p></div>`;
  } else {
    html += nextForMe(t) + stageCards(t) + friendsNow(t);
  }

  view.innerHTML = `<div class="scroll" id="nscroll"><div class="pad">${html}</div></div>`;
  const sc = $('#nscroll');
  bindRows(sc);
  sc.addEventListener('click', e => {
    if (e.target.closest('[data-sim-off]')) { simTime = null; rerender(); return; }
    const go = e.target.closest('[data-sim-go]');
    if (go) {
      const d = $('#simDay').value, tm = $('#simTime').value || '20:30';
      setSim(mkDate(d, tm));
      rerender();
    }
  });
}

function preFestival() {
  const ms = FEST_START - Date.now();
  const days = Math.floor(ms / (24 * HOUR));
  const hours = Math.floor((ms % (24 * HOUR)) / HOUR);
  const big = ms > 0 ? (days ? `${days} ימים` : `${hours} שעות`) : '';
  const picks = myPicks().length;
  return `<div class="pre">
    <img src="${ASSETS.butterfly}" alt="">
    <h2>הפסטיבל מתחיל בעוד</h2>
    <div class="big">${big}</div>
    <p style="margin:6px 0 0;color:var(--ink-2);font-weight:600">${days ? `ו-${hours} שעות · ` : ''}חמישי 15.10, 18:00 · מצפה גבולות</p>
    <p style="margin:14px 0 0">${picks ? `יש לך כבר ${picks} הופעות בלוז ✦` : 'זה הזמן לבנות את הלוז שלך ✦'}</p>
    <div class="sim-form">
      <h3>רוצים לראות איך המסך ייראה בפסטיבל?</h3>
      <div class="r">
        <select id="simDay">${DAYS.map(d => `<option value="${d.id}">${d.label} ${d.date}</option>`).join('')}</select>
        <input id="simTime" type="time" value="20:30">
        <button class="btn sm" data-sim-go>הדמיה</button>
      </div>
    </div>
  </div>`;
}

function nextForMe(t) {
  const mine = myPicks().filter(e => !e.cancelled);
  const cur = mine.filter(e => e.start <= t && t < e.end);
  const next = mine.find(e => e.start > t);
  let html = '';
  for (const e of cur) {
    html += `<div class="now-hero" style="${stageVars(e.stage)}">
      <div class="lbl">עכשיו אצלך ${LV_ICON[level(e.id)]}</div>
      <h2>${esc(e.name)}</h2>
      <div class="meta">${esc(STAGE[e.stage].name)} · עד ${e.e} · נשארו <span class="cd">${fmtIn(e.end - t)}</span></div>
      <div class="progress" style="background:rgba(246,234,210,.2)"><i style="width:${(t - e.start) / (e.end - e.start) * 100}%;background:var(--lime)"></i></div>
      <div class="acts"><button class="btn sm" data-nav="${e.id}">${ICON.pin} ניווט</button><button class="btn sm alt" data-ev="${e.id}">פרטים</button></div>
    </div>`;
  }
  if (next) {
    const soon = next.start - t;
    html += `<div class="now-hero" style="${stageVars(next.stage)}">
      <div class="lbl">ההופעה הבאה שלך ${LV_ICON[level(next.id)]}</div>
      <h2>${esc(next.name)}</h2>
      <div class="meta">${esc(STAGE[next.stage].name)} · ${soon > 12 * HOUR ? `${DAY[next.day].label} ` : ''}${next.s} · <span class="cd">בעוד ${fmtIn(soon)}</span></div>
      <div class="acts"><button class="btn sm" data-nav="${next.id}">${ICON.pin} ניווט</button><button class="btn sm alt" data-ev="${next.id}">פרטים</button></div>
    </div>`;
  } else if (!cur.length) {
    html += `<div class="banner">אין לך הופעות נוספות בלוז. אפשר להציץ מה מתנגן עכשיו ↓</div>`;
  }
  return html;
}

function stageCards(t) {
  const cards = STAGES.map(st => {
    const list = BY_START.filter(e => e.stage === st.id && !e.cancelled);
    const cur = list.find(e => e.start <= t && t < e.end);
    const next = list.find(e => e.start > t);
    const soon = next && next.start - t <= 30 * MIN;
    return { st, cur, next, rank: cur ? 1 : soon ? 0 : 2 };
  });
  // במות שמשהו מתחיל בהן בחצי השעה הקרובה – למעלה, אחריהן במות פעילות
  cards.sort((a, b) => a.rank - b.rank || (a.next ? a.next.start : Infinity) - (b.next ? b.next.start : Infinity));

  const item = (e, kind, t) => {
    const lv = level(e.id);
    const going = friendsGoing(e);
    const m = kind === 'now'
      ? `${timeRange(e)} · נגמר בעוד ${fmtIn(e.end - t)}`
      : `${e.start - t > 12 * HOUR ? DAY[e.day].label + ' ' : ''}${e.s} · מתחיל בעוד ${fmtIn(e.start - t)}`;
    return `<button class="sc-item" data-ev="${e.id}">
      <div class="k">${kind === 'now' ? '● עכשיו' : 'הבא'}</div>
      <div class="n">${lv ? `<span>${LV_ICON[lv]}</span>` : ''}${esc(e.name)} ${friendAvatars(going)}</div>
      <div class="m">${m}</div>
      ${kind === 'now' ? `<div class="progress"><i style="width:${(t - e.start) / (e.end - e.start) * 100}%"></i></div>` : ''}
    </button>`;
  };

  return `<h3 class="section-t">מה קורה בבמות</h3>` + cards.map(({ st, cur, next, rank }) => `
    <div class="stage-card" style="--c:${st.color}">
      <div class="sc-h"><span>${st.icon}</span>${esc(st.name)}${rank === 0 ? '<span class="chip soon">מתחיל בקרוב</span>' : ''}</div>
      ${cur ? item(cur, 'now', t) : `<div class="sc-item quiet"><div class="n">שקט כרגע${next ? ` · הבא ב-${next.s}` : ''}</div></div>`}
      ${next ? item(next, 'next', t) : (cur ? '' : '<div class="sc-item quiet"><div class="m">אין עוד הופעות בבמה הזו</div></div>')}
    </div>`).join('');
}

function friendsNow(t) {
  const fr = activeFriends();
  if (!fr.length) return '';
  return `<h3 class="section-t">מה החברים עושים</h3>` + fr.map(f => {
    const list = BY_START.filter(e => f.picks[e.id]);
    const cur = list.find(e => e.start <= t && t < e.end);
    const next = list.find(e => e.start > t);
    const e = cur || next;
    const txt = cur ? `עכשיו ב${STAGE[cur.stage].short}: <b>${esc(cur.name)}</b>`
      : next ? `הבא: <b>${esc(next.name)}</b> · ${next.s} ב${STAGE[next.stage].short}` : 'אין עוד הופעות בלוז';
    return `<button class="friend-now" ${e ? `data-ev="${e.id}"` : ''}>
      <span class="av" style="--fc:${f.color}">${f.emoji}</span>
      <span><div class="n">${esc(f.name)}</div><div class="m">${txt}</div></span>
    </button>`;
  }).join('');
}
