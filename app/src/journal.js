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

/* הופעות שהיומן שלהן פתוח כרגע (נשמר רק בסשן, כדי שרענון הגיליון לא יסגור אותו) */
const journalOpen = new Set();

function journalSection(ev) {
  const r = ratingFor(ev.id);
  const notes = notesFor(ev.id);
  // סיכום בשורת הכותרת, כדי לראות מה כבר מולא גם כשהיומן סגור
  const meta = [
    notes.length ? `${notes.length} ${notes.length === 1 ? 'פתק' : 'פתקים'}` : '',
    r.crowd ? `👥 ${r.crowd}` : '',
    r.vibe ? `🔥 ${r.vibe}` : '',
  ].filter(Boolean).join(' · ');
  return `<details class="sec journal" ${journalOpen.has(ev.id) ? 'open' : ''}>
    <summary><span class="jt">📝 יומן ההופעה</span><span class="jm">${meta || 'פתקים ודירוג קהל/אווירה'}</span></summary>
    <div class="jbody">
    ${meterRow('crowd', '👥 קהל', CROWD_WORDS, r.crowd || 0)}
    ${meterRow('vibe', '🔥 אווירה', VIBE_WORDS, r.vibe || 0)}
    <div class="notes">${notes.map(n => `<div class="note">
        <div class="nm">🕒 ${fmtStamp(n.at)} · 📍 ${esc(placeName(n.place))}</div>
        <div class="nt">${esc(n.text)}</div>
        <div class="na"><button data-note-edit="${n.id}">עריכה</button><button data-note-del="${n.id}">מחיקה</button></div>
      </div>`).join('')}</div>
    <textarea class="note-in" id="noteIn" rows="2" placeholder="פתק על ההופעה: ציטוט, קהל, רגע מיוחד…"></textarea>
    <button class="btn sm block" data-note-add>${ICON.plus} שמירת פתק</button>
  </div></details>`;
}
function bindJournal(body, ev) {
  const d = $('.journal', body);
  if (d) d.addEventListener('toggle', () => { if (d.open) journalOpen.add(ev.id); else journalOpen.delete(ev.id); });
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
    const gone = S.notes.find(x => x.id === b.dataset.noteDel);
    S.notes = S.notes.filter(x => x !== gone);
    save(); refreshSheet(); rerender();
    toast('הפתק נמחק', { label: 'ביטול', fn: () => { S.notes.push(gone); save(); refreshSheet(); rerender(); } });
    return true;
  }
  return false;
}

/* ───────── ציר זמן: כרטיס אחד לכל הופעה (דירוג + כל הפתקים) ───────── */
/* הופעות שיש להן פתק או דירוג, לפי סדר ההופעות בלוז */
const journalShows = () => {
  const ids = new Set([...S.notes.map(n => n.ev), ...Object.keys(S.ratings)]);
  return BY_START.filter(e => ids.has(e.id));
};
const ratingText = r => [r.crowd ? `👥 ${CROWD_WORDS[r.crowd]} (${r.crowd}/5)` : '', r.vibe ? `🔥 ${VIBE_WORDS[r.vibe]} (${r.vibe}/5)` : '']
  .filter(Boolean).join(' · ');

function openTimeline() {
  openPanel('יומן סיקור', (body, api) => {
    const shows = journalShows();
    if (!shows.length) {
      body.innerHTML = `<div class="empty"><img src="${ASSETS.butterfly}" alt="">
        <h2>היומן ריק</h2><p>לחיצה על הופעה ← "יומן ההופעה": פתקים עם חותמת זמן ומיקום, ודירוג קהל ואווירה. הכל יופיע כאן.</p></div>`;
      return;
    }
    let lastDay = null;
    const cards = shows.map(ev => {
      const sep = ev.day !== lastDay ? `<div class="hour-sep">${dayLabel(ev.day)}</div>` : '';
      lastDay = ev.day;
      const st = STAGE[ev.stage], r = ratingFor(ev.id), notes = notesFor(ev.id);
      return sep + `<div class="tl-card" style="--c:${st.color}">
        <button class="tl-ev" data-ev="${ev.id}"><b>${esc(ev.name)}</b><small>${esc(st.name)} · ${timeRange(ev)}</small></button>
        ${r.crowd || r.vibe ? `<div class="tl-rate">${ratingText(r)}</div>` : ''}
        ${notes.map(n => `<div class="tl-note"><div class="nm">🕒 ${fmtT(n.at)} · 📍 ${esc(placeName(n.place))}</div>
          <div class="tl-text">${esc(n.text)}</div></div>`).join('')}
      </div>`;
    }).join('');
    body.innerHTML = `
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn" data-x="share">${ICON.share} שיתוף</button>
        <button class="btn alt" data-x="file">${ICON.download} קובץ</button>
        <button class="btn alt" data-x="copy">${ICON.copy} העתקה</button>
      </div>
      <p style="margin:-4px 0 6px;font-size:13px;color:var(--ink-2)">${shows.length} הופעות · ${S.notes.length} פתקים</p>
      ${cards}`;
    body.onclick = e => {
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
  L.push(`יוצא ב-${fmtStamp(Date.now())} · ${journalShows().length} הופעות · ${S.notes.length} פתקים`, '');
  let day = null;
  for (const ev of journalShows()) {
    if (ev.day !== day) { day = ev.day; L.push(`## ${dayLabel(day)}`, ''); }
    L.push(`### ${ev.name}`, `${STAGE[ev.stage].name} · ${ev.s}–${ev.e}`);
    const r = ratingFor(ev.id);
    if (r.crowd || r.vibe) {
      L.push(`- **קהל:** ${r.crowd ? `${CROWD_WORDS[r.crowd]} (${r.crowd}/5)` : '–'} · **אווירה:** ${r.vibe ? `${VIBE_WORDS[r.vibe]} (${r.vibe}/5)` : '–'}`);
    }
    for (const n of notesFor(ev.id)) L.push(`- [${fmtStamp(n.at)} · ${placeName(n.place)}] ${n.text.replace(/\n+/g, ' / ')}`);
    L.push('');
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
