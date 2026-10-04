/* יומן סיקור: פתקים על הופעות (עם חותמת זמן ומיקום), מונה קהל ואווירה, ציר זמן וייצוא */

const CROWD_WORDS = ['', 'כמעט ריק', 'דליל', 'בינוני', 'מלא', 'מפוצץ'];
const VIBE_WORDS = ['', 'רדום', 'רגוע', 'טוב', 'חזק', 'מטורף'];

const notesFor = id => S.notes.filter(n => n.ev === id).sort((a, b) => a.at - b.at);
const ratingFor = id => S.ratings[id] || {};
const placeName = id => (typeof PLACE !== 'undefined' && PLACE[id] && PLACE[id].name) || (STAGE[id] && STAGE[id].name) || '';
const fmtStamp = ms => { const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${fmtT(ms)}`; };

/* מיקום לפתק: "איפה אני" האחרון אם עודכן בשעתיים האחרונות, אחרת הבמה של ההופעה */
function notePlace(ev) {
  const h = S.prefs.here;
  if (h && Date.now() - h.at < 2 * HOUR && placeName(h.id)) return h.id;
  return ev.stage;
}

/* ───────── בתוך גיליון ההופעה ───────── */
function meterRow(kind, label, words, value) {
  return `<div class="meter"><span class="ml">${label}</span>
    <div class="dots" role="group" aria-label="${label}">${[1, 2, 3, 4, 5].map(i =>
      `<button data-${kind}="${i}" class="${value >= i ? 'on' : ''}" aria-label="${label} ${i} – ${words[i]}" aria-pressed="${value === i}"></button>`).join('')}</div>
    <span class="mw">${value ? words[value] : ''}</span></div>`;
}

function journalSection(ev) {
  const r = ratingFor(ev.id);
  const notes = notesFor(ev.id);
  return `<div class="sec journal"><h3>📝 יומן ההופעה ${notes.length ? `<span class="chip soft">${notes.length}</span>` : ''}</h3>
    ${meterRow('crowd', '👥 קהל', CROWD_WORDS, r.crowd || 0)}
    ${meterRow('vibe', '🔥 אווירה', VIBE_WORDS, r.vibe || 0)}
    <div class="notes">${notes.map(n => `<div class="note">
        <div class="nm">🕒 ${fmtStamp(n.at)} · 📍 ${esc(placeName(n.place))}</div>
        <div class="nt">${esc(n.text)}</div>
        <div class="na"><button data-note-edit="${n.id}">עריכה</button><button data-note-del="${n.id}">מחיקה</button></div>
      </div>`).join('')}</div>
    <textarea class="note-in" id="noteIn" rows="2" placeholder="פתק על ההופעה: ציטוט, קהל, רגע מיוחד…"></textarea>
    <button class="btn sm block" data-note-add>${ICON.plus} שמירת פתק</button>
  </div>`;
}

/* מחזיר true אם הלחיצה טופלה */
function journalClick(b, ev) {
  if (b.dataset.crowd || b.dataset.vibe) {
    const kind = b.dataset.crowd ? 'crowd' : 'vibe';
    const v = +b.dataset[kind];
    const r = { ...ratingFor(ev.id) };
    r[kind] = r[kind] === v ? 0 : v; // הקשה חוזרת על אותו ערך מנקה
    r.at = Date.now();
    if (!r.crowd && !r.vibe) delete S.ratings[ev.id]; else S.ratings[ev.id] = r;
    save(); refreshSheet();
    return true;
  }
  if ('noteAdd' in b.dataset) {
    const ta = $('#noteIn');
    const text = ta.value.trim();
    if (!text) { ta.focus(); return true; }
    S.notes.push({ id: 'n' + Date.now().toString(36), ev: ev.id, text, at: Date.now(), place: notePlace(ev) });
    save(); refreshSheet(); rerender();
    toast('הפתק נשמר');
    return true;
  }
  if (b.dataset.noteEdit) {
    const n = S.notes.find(x => x.id === b.dataset.noteEdit);
    const t = prompt('עריכת הפתק:', n.text);
    if (t != null && t.trim()) { n.text = t.trim(); n.edited = Date.now(); save(); refreshSheet(); }
    return true;
  }
  if (b.dataset.noteDel) {
    if (confirm('למחוק את הפתק?')) { S.notes = S.notes.filter(x => x.id !== b.dataset.noteDel); save(); refreshSheet(); rerender(); }
    return true;
  }
  return false;
}

/* ───────── סיכום לפי במה ───────── */
function stageSummary() {
  return STAGES.map(st => {
    const rs = Object.entries(S.ratings).filter(([id]) => EV[id] && EV[id].stage === st.id).map(([, r]) => r);
    const avg = k => { const v = rs.map(r => r[k]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    return { st, n: rs.length, crowd: avg('crowd'), vibe: avg('vibe') };
  }).filter(x => x.n);
}

/* ───────── ציר זמן ───────── */
function journalEntries() {
  const items = S.notes.map(n => ({ kind: 'note', at: n.at, ev: EV[n.ev], n }));
  for (const [id, r] of Object.entries(S.ratings)) if (EV[id]) items.push({ kind: 'rating', at: r.at || EV[id].start, ev: EV[id], r });
  return items.filter(x => x.ev).sort((a, b) => a.at - b.at);
}

function openTimeline() {
  openPanel('יומן סיקור', (body, api) => {
    const items = journalEntries();
    const sum = stageSummary();
    if (!items.length) {
      body.innerHTML = `<div class="empty"><img src="${ASSETS.butterfly}" alt="">
        <h2>היומן ריק</h2><p>לחיצה על הופעה ← "יומן ההופעה": פתקים עם חותמת זמן ומיקום, ודירוג קהל ואווירה. הכל יופיע כאן לפי סדר הזמן.</p></div>`;
      return;
    }
    let lastDay = null;
    const rows = items.map(it => {
      const d = logicalDay(it.at);
      const dayKey = d || new Date(it.at).toDateString();
      const sep = dayKey !== lastDay ? `<div class="hour-sep">${d ? dayLabel(d) : fmtStamp(it.at).split(' ')[0]}</div>` : '';
      lastDay = dayKey;
      const ev = it.ev, st = STAGE[ev.stage];
      const head = `<button class="tl-ev" data-ev="${ev.id}" style="--c:${st.color}"><b>${esc(ev.name)}</b><small>${esc(st.short)} · ${timeRange(ev)}</small></button>`;
      if (it.kind === 'note') {
        return sep + `<div class="tl-item"><div class="tl-t">${fmtT(it.at)}</div><div class="tl-b">${head}
          <div class="tl-text">${esc(it.n.text)}</div><div class="nm">📍 ${esc(placeName(it.n.place))}</div></div></div>`;
      }
      return sep + `<div class="tl-item"><div class="tl-t">${fmtT(it.at)}</div><div class="tl-b">${head}
        <div class="tl-rate">${it.r.crowd ? `👥 ${CROWD_WORDS[it.r.crowd]} (${it.r.crowd}/5)` : ''}${it.r.crowd && it.r.vibe ? ' · ' : ''}${it.r.vibe ? `🔥 ${VIBE_WORDS[it.r.vibe]} (${it.r.vibe}/5)` : ''}</div></div></div>`;
    }).join('');

    const bar = v => `<span class="mbar"><i style="width:${v / 5 * 100}%"></i></span><b>${v ? v.toFixed(1) : '–'}</b>`;
    body.innerHTML = `
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn" data-x="share">${ICON.share} שיתוף</button>
        <button class="btn alt" data-x="file">${ICON.download} קובץ</button>
        <button class="btn alt" data-x="copy">${ICON.copy} העתקה</button>
      </div>
      <p style="margin:-4px 0 14px;font-size:13px;color:var(--ink-2)">${S.notes.length} פתקים · ${Object.keys(S.ratings).length} הופעות מדורגות</p>
      ${sum.length ? `<div class="card-box"><h3>קהל ואווירה לפי במה</h3>
        <div class="sumtbl">${sum.map(x => `<div class="srow"><span class="stag" style="--c:${x.st.color}" title="${x.n} הופעות">${esc(x.st.short)}</span>
          <span class="sk">👥</span>${bar(x.crowd)}<span class="sk">🔥</span>${bar(x.vibe)}</div>`).join('')}</div></div>` : ''}
      ${rows}`;
    body.onclick = async e => {
      const x = e.target.closest('[data-x]');
      if (x) return exportJournal(x.dataset.x);
      const evb = e.target.closest('[data-ev]');
      if (evb) openEvent(EV[evb.dataset.ev]);
    };
  }).live = true;
}

/* ───────── ייצוא ───────── */
function journalMarkdown() {
  const L = [];
  L.push(`# אינדינגב 2026 – יומן סיקור${S.name ? ` (${S.name})` : ''}`);
  L.push(`יוצא ב-${fmtStamp(Date.now())} · ${S.notes.length} פתקים · ${Object.keys(S.ratings).length} הופעות מדורגות`, '');
  const sum = stageSummary();
  if (sum.length) {
    L.push('## קהל ואווירה לפי במה', '', '| במה | הופעות שדורגו | קהל (ממוצע) | אווירה (ממוצע) |', '|---|---|---|---|');
    for (const x of sum) L.push(`| ${x.st.name} | ${x.n} | ${x.crowd ? x.crowd.toFixed(1) : '–'} | ${x.vibe ? x.vibe.toFixed(1) : '–'} |`);
    L.push('');
  }
  // לפי יום והופעה (לפי שעת ההופעה), עם כל הפתקים והדירוג
  const evIds = new Set([...S.notes.map(n => n.ev), ...Object.keys(S.ratings)]);
  const evs = BY_START.filter(e => evIds.has(e.id));
  let day = null;
  for (const ev of evs) {
    if (ev.day !== day) { day = ev.day; L.push(`## ${dayLabel(day)}`, ''); }
    L.push(`### ${ev.name}`, `${STAGE[ev.stage].name} · ${ev.s}–${ev.e}`);
    const r = ratingFor(ev.id);
    if (r.crowd || r.vibe) {
      L.push(`- **קהל:** ${r.crowd ? `${CROWD_WORDS[r.crowd]} (${r.crowd}/5)` : '–'} · **אווירה:** ${r.vibe ? `${VIBE_WORDS[r.vibe]} (${r.vibe}/5)` : '–'}`);
    }
    for (const n of notesFor(ev.id)) L.push(`- [${fmtStamp(n.at)} · ${placeName(n.place)}] ${n.text.replace(/\n+/g, ' / ')}`);
    L.push('');
  }
  // ציר זמן מלא
  L.push('## ציר זמן', '');
  for (const it of journalEntries()) {
    if (it.kind === 'note') L.push(`- ${fmtStamp(it.at)} · ${it.ev.name} (${STAGE[it.ev.stage].short}) · 📍${placeName(it.n.place)}: ${it.n.text.replace(/\n+/g, ' / ')}`);
    else L.push(`- ${fmtStamp(it.at)} · ${it.ev.name}: דירוג קהל ${it.r.crowd || '–'}/5, אווירה ${it.r.vibe || '–'}/5`);
  }
  return L.join('\n');
}

async function exportJournal(how) {
  const md = journalMarkdown();
  const name = `indienegev-journal-${new Date().toISOString().slice(0, 10)}.md`;
  if (how === 'copy') return toast(await copyText(md) ? 'היומן הועתק' : 'לא הצלחתי להעתיק');
  const file = new File([md], name, { type: 'text/markdown' });
  if (how === 'share') {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'יומן סיקור – אינדינגב 2026' });
      else if (navigator.share) await navigator.share({ text: md });
      else return exportJournal('file');
    } catch (e) { /* בוטל */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('הקובץ נשמר בהורדות');
}
