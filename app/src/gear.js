/* רשימת ציוד: נטענת מראש עם הרשימה שלנו, וכל אחד עורך, מוסיף, מוחק ומסמן מה ארז.
   כל פריט הוא חלק מהנתונים (מסתנכרן בין המכשירים, נמחק רק במחיקה מפורשת). */

const GEAR_CATS = ['אוהל ושינה', 'ישיבה', 'בגדים והנעלה', 'אוכל ושתייה', 'היגיינה וטיפוח', 'תאורה וחשמל', 'בריאות ובטיחות', 'בילוי והופעות', 'רכב ולוגיסטיקה'];
const GEAR_DEFAULT = {
  'אוהל ושינה': ['אוהל', 'שק שינה', 'מזרן שטח', 'כרית וציפית', 'שמיכה', 'אטמי אוזניים', 'מסיכת עיניים'],
  'ישיבה': ['כיסאות מתקפלים', 'שולחן מתקפל', 'מחצלת'],
  'בגדים והנעלה': ['חולצות קצרות וקלות לשעות החמות', 'מכנסיים קצרים', 'מכנסיים ארוכים', 'חולצות ארוכות לערב', 'גרביים', 'תחתונים', 'נעליים', 'כפכפים', 'כובע שמש', 'משקפי שמש', 'בגדי שינה', 'שקית לבגדים מלוכלכים', 'בגד ים למקלחות'],
  'אוכל ושתייה': ['מים לשתייה (לפחות 4 ליטר לאדם ליום)', 'בקבוק שתייה אישי', 'פיתות', 'לחם פרוס', 'פריכיות אורז', 'קרקרים מקמח מלא', 'טחינה גולמית', 'חמאת בוטנים טבעית', 'תמרים', 'תפוחים, בננות, גזר ומלפפונים', 'חטיפי אנרגיה', 'אגוזים ושקדים', 'שימורי טונה', 'שימורי תירס', 'שימורי חומוס', "ביף ג'רקי", 'ביצים קשות (ליום הראשון בלבד)', 'מלח ופלפל בשקיות קטנות', 'סכו"ם חד פעמי'],
  'היגיינה וטיפוח': ['מברשת שיניים', 'משחת שיניים', 'סבון', 'שמפו', 'מגבת', 'נייר טואלט', 'מגבונים לחים', 'דאודורנט', 'קרם הגנה', 'שפתון ליובש', 'מוצרי טיפוח אישיים ומוצרי מחזור', 'חומר נגד יתושים', 'חומר חיטוי לידיים', 'שקיות אשפה'],
  'תאורה וחשמל': ['שרשרת תאורה לאוהל', 'פנס ראש', 'סוללת גיבוי לטלפון (פאוור בנק)', 'מטען לטלפון', 'מאוורר נטען'],
  'בריאות ובטיחות': ['תרופות אישיות', 'משכך כאבים'],
  'בילוי והופעות': ['בקבוק מים לשטח ההופעות', "פאוץ'", 'קלפים, שש בש או משחקי קופסה', 'אוזניות', 'ספר'],
  'רכב ולוגיסטיקה': ['אולר', 'מפתחות לבית', 'עגלת ציוד'],
};
/* פריטי ברירת המחדל – עם מזהים קבועים, כך ששני מכשירים שטוענים אותם לא יוצרים כפילויות */
function gearDefaults() {
  const out = [];
  GEAR_CATS.forEach((cat, ci) => (GEAR_DEFAULT[cat] || []).forEach((text, i) => out.push({ id: `d${ci}-${i}`, cat, text, o: ci * 100 + i })));
  return out;
}
/* טעינה ראשונה של הרשימה (פעם אחת לחשבון). במכשיר חדש שעוד לא קיבל נתונים מהענן – מחכים, כדי לא להחזיר פריטים שנמחקו */
function ensureGear() {
  if (S.gearInit) return false;
  if (typeof cloudAuth !== 'undefined' && cloudAuth && !(cloudState && cloudState.at)) return false;
  const have = new Set((S.gear || []).map(g => g.id));
  S.gear = [...(S.gear || []), ...gearDefaults().filter(g => !have.has(g.id))];
  S.gearInit = true;
  save();
  return true;
}
const gearList = () => (Array.isArray(S.gear) ? S.gear : []);
/* קטגוריות: הקבועות + שהמשתמש הוסיף (S.gearCats, מסתנכרן) + כל קטגוריה שיש בה פריט */
const customCats = () => (Array.isArray(S.gearCats) ? S.gearCats : []).slice().sort((a, b) => a.o - b.o).map(c => c.name);
const gearCats = () => { const l = [...GEAR_CATS, ...customCats()]; for (const g of gearList()) if (!l.includes(g.cat)) l.push(g.cat); return l; };
function gearStats() { const l = gearList(); return { n: l.length, packed: l.filter(g => g.packed).length }; }

function gearCard() {
  const { n, packed } = gearStats();
  return `<div class="card-box gear-card">
    <div class="gear-top"><h3>🎒 רשימת ציוד</h3><span>${n ? `ארזת ${packed} מתוך ${n}` : ''}</span></div>
    ${n ? `<div class="gear-bar"><i style="width:${Math.round(packed / n * 100)}%"></i></div>` : ''}
    <div class="btn-row"><button class="btn sm" data-a="gear">${n && packed === n ? '✓ הכל ארוז · פתיחה' : 'לרשימה'}</button>
      <button class="btn alt sm" data-a="gear-share">${ICON.share} שיתוף</button></div>
  </div>`;
}

function gearText() {
  const L = ['🎒 רשימת הציוד שלי לאינדינגב 2026', ''];
  for (const cat of gearCats()) {
    const items = gearList().filter(g => g.cat === cat).sort((a, b) => a.o - b.o);
    if (!items.length) continue;
    L.push(`*${cat}*`);
    for (const g of items) L.push(`${g.packed ? '✅' : '⬜'} ${g.text}`);
    L.push('');
  }
  return L.join('\n').trim();
}
async function shareGear() {
  const text = gearText();
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}

function openGear() {
  ensureGear();
  let focusCat = null;
  const api = openPanel('🎒 רשימת ציוד', (body, api) => {
    const { n, packed } = gearStats();
    body.innerHTML = `
      <div class="gear-head">
        <div><b>ארזת ${packed} מתוך ${n}</b>${n ? `<div class="gear-bar"><i style="width:${n ? Math.round(packed / n * 100) : 0}%"></i></div>` : ''}</div>
        <button class="btn alt sm" data-g="share">${ICON.share} שיתוף</button>
      </div>
      <p class="gear-hint">מסמנים ✓ כשארזת. ✕ מוחק, ✏️ עורך, ובסוף כל קטגוריה מוסיפים פריט.</p>
      ${gearCats().map(cat => {
        const items = gearList().filter(g => g.cat === cat).sort((a, b) => (!!a.packed - !!b.packed) || a.o - b.o);
        const p = items.filter(g => g.packed).length;
        return `<section class="gear-cat">
          <h3>${esc(cat)} <span>${items.length ? `${p}/${items.length}` : ''}${GEAR_CATS.includes(cat) ? '' : ` <button class="gear-x" data-gcd="${esc(cat)}" aria-label="מחיקת הקטגוריה">✕</button>`}</span></h3>
          ${items.map(g => `<div class="gear-row ${g.packed ? 'on' : ''}">
            <button class="gear-chk" data-gt="${g.id}" role="checkbox" aria-checked="${!!g.packed}" aria-label="${esc(g.text)}">${g.packed ? '✓' : ''}</button>
            <span class="gear-t" data-gt="${g.id}">${esc(g.text)}</span>
            <button class="gear-x" data-ge="${g.id}" aria-label="עריכה">${ICON.edit}</button>
            <button class="gear-x" data-gd="${g.id}" aria-label="מחיקה">✕</button>
          </div>`).join('')}
          <form class="gear-add" data-gadd="${esc(cat)}"><input type="text" placeholder="+ הוספת פריט" maxlength="80" enterkeyhint="done"><button type="submit">הוספה</button></form>
        </section>`;
      }).join('')}
      <button class="btn block alt" data-g="addcat" style="margin-top:4px">+ קטגוריה חדשה</button>
      <div class="btn-row" style="margin-top:18px">
        <button class="btn alt sm" data-g="unpack">איפוס הסימונים</button>
        <button class="btn alt sm" data-g="defaults">החזרת פריטים מהרשימה המקורית</button>
      </div>`;
    if (focusCat) {
      const f = [...body.querySelectorAll('.gear-add')].find(x => x.dataset.gadd === focusCat);
      if (f) f.querySelector('input').focus({ preventScroll: true });
      focusCat = null;
    }
  });
  const find = id => gearList().find(g => g.id === id);
  const changed = () => { save(); api.render(); };
  api.body.addEventListener('click', async e => {
    const t = e.target.closest('[data-gt]');
    if (t) { const g = find(t.dataset.gt); if (g) { g.packed = !g.packed; if (!g.packed) delete g.packed; changed(); } return; }
    const ed = e.target.closest('[data-ge]');
    if (ed) {
      const g = find(ed.dataset.ge);
      const v = g && prompt('עריכת פריט:', g.text);
      if (v && v.trim()) { g.text = v.trim().slice(0, 80); changed(); }
      return;
    }
    const d = e.target.closest('[data-gd]');
    if (d) {
      const g = find(d.dataset.gd);
      if (!g) return;
      S.gear = gearList().filter(x => x !== g);
      changed();
      toast(`"${g.text}" נמחק`);
      return;
    }
    const cd = e.target.closest('[data-gcd]');
    if (cd) {
      const cat = cd.dataset.gcd, n = gearList().filter(g => g.cat === cat).length;
      if (n && !confirm(`למחוק את הקטגוריה "${cat}" ואת ${n} הפריטים שבה?`)) return;
      S.gear = gearList().filter(g => g.cat !== cat);
      S.gearCats = (S.gearCats || []).filter(c => c.name !== cat);
      changed();
      return;
    }
    const b = e.target.closest('[data-g]');
    if (!b) return;
    if (b.dataset.g === 'addcat') {
      const name = (prompt('שם הקטגוריה החדשה:', '') || '').trim().slice(0, 40);
      if (!name) return;
      if (gearCats().includes(name)) { focusCat = name; return changed(); }
      S.gearCats = [...(S.gearCats || []), { name, o: Date.now() }];
      focusCat = name; // מיד אפשר להוסיף לה פריטים
      changed();
      return;
    }
    if (b.dataset.g === 'share') shareGear();
    if (b.dataset.g === 'unpack' && confirm('לאפס את כל הסימונים? (הפריטים נשארים)')) { for (const g of gearList()) delete g.packed; changed(); }
    if (b.dataset.g === 'defaults') {
      const have = new Set(gearList().map(g => g.id));
      const add = gearDefaults().filter(g => !have.has(g.id));
      if (!add.length) return toast('כל הפריטים מהרשימה המקורית כבר ברשימה');
      if (confirm(`להחזיר ${add.length} פריטים מהרשימה המקורית?`)) { S.gear = [...gearList(), ...add]; changed(); }
    }
  });
  api.body.addEventListener('submit', e => {
    const f = e.target.closest('[data-gadd]');
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector('input');
    const text = inp.value.trim().slice(0, 80);
    if (!text) return;
    const cat = f.dataset.gadd;
    const o = Math.max(0, ...gearList().filter(g => g.cat === cat).map(g => g.o)) + 1;
    S.gear = [...gearList(), { id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cat, text, o }];
    focusCat = cat; // ממשיכים להוסיף באותה קטגוריה
    changed();
  });
  api.live = true;
}
