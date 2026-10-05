/* לשונית "פרופיל": השם, הדמות, שיתוף, חברים, חשבון וגיבוי, בלי קליטה, עזרה ואיפוס */

/* שליחת קישור לאפליקציה בוואטסאפ */
function shareApp() {
  const text = `הלוז שלי לאינדינגב 2026 🦋
אפליקציה לבניית הלוז, התנגשויות, לוז משותף עם חברים ומפה עם ניווט (עובדת גם בלי קליטה):
${SITE_URL}`;
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}

/* בוחר הדמות נפתח בלחיצה על הדמות ליד השם; עד הבחירה הראשונה – פתוח */
let avPickerOpen = false;
const profFold = { friends: false, account: false, more: false };
let nameEdit = false; // עריכת השם (לחיצה על השם) // "חברים" ו"חשבון וגיבוי" – מקופלים כברירת מחדל
const avOpen = () => avPickerOpen || !(S.avatar && (S.avatar.picked || !S.avatar.auto));

function renderProfile(view) {
  const me = meLook();
  const n = Object.keys(S.picks).length;
  const acct = typeof cloudAuth !== 'undefined' && cloudAuth
    ? `מחובר/ת כ-<b>${esc(cloudAuth.name || cloudAuth.email || '')}</b>${cloudAuth.email ? ` <span dir="ltr">(${esc(cloudAuth.email)})</span>` : ''}`
    : CC.on ? '<b>לא מחובר/ת</b> – בלי חשבון אין גיבוי לענן' : '';
  ensureGear();
  const signed = typeof cloudAuth !== 'undefined' && cloudAuth;
  const status = !CC.on ? '' : signed ? `${isBackedUp() ? '✅ מגובה' : '⏳ יגובה כשתהיה קליטה'} · מחובר/ת עם Google` : '⚠️ לא מחובר/ת – אין גיבוי';
  const { n: gn, packed: gp } = gearStats();
  const lm = PLACE.tent && tentLandmark(PLACE.tent);
  const nNotes = (S.notes || []).length;
  const row = (a, ic, bg, title, sub, extra = '') => `<button class="p-row" data-a="${a}">
      <span class="p-ic" style="background:${bg}">${ic}</span>
      <span class="p-tx"><b>${title}</b><span>${sub}</span>${extra}</span>
      <span class="p-ch">${ICON.chevL}</span></button>`;
  view.innerHTML = `<div class="scroll" id="pscroll"><div class="pad">
    <div class="prof-id">
      <button class="av big av-edit" style="--fc:${me.color}" data-a="avatar" aria-label="החלפת הדמות" aria-expanded="${avOpen()}">${me.emoji}<i>${ICON.edit}</i></button>
      <div class="p-who">
        ${nameEdit ? `<input id="pName" class="text-in" value="${esc(S.name)}" maxlength="24" placeholder="השם שלך" enterkeyhint="done">`
          : `<button class="p-name" data-a="name">${S.name ? esc(S.name) : '<span class="p-ph">איך לקרוא לך?</span>'} <i>${ICON.edit}</i></button>`}
        ${status ? `<div class="p-st">${status}</div>` : ''}
      </div>
    </div>
    ${avOpen() ? `<div class="card-box av-card"><h3>${myAvatar() == null || !(S.avatar.picked || !S.avatar.auto) ? 'בחר/י דמות' : 'החלפת הדמות'}</h3><p>כך החברים רואים אותך. דמות שחבר/ה כבר קיבל/ה – תפוסה.</p>${avatarPicker()}</div>` : ''}

    <div class="p-list">
      ${row('gear', '🎒', 'rgba(58,166,107,.18)', 'רשימת ציוד', gn ? `ארזת ${gp} מתוך ${gn}` : 'הרשימה ריקה', gn ? `<span class="p-bar"><i style="width:${Math.round(gp / gn * 100)}%"></i></span>` : '')}
      ${row('tent', '🏠', 'rgba(244,111,106,.18)', 'האוהל שלי', PLACE.tent ? `מסומן במפה${lm ? ` · ליד ${esc(lm.name)}` : ''}` : 'עוד לא סומן במפה · הקישו לסימון')}
      ${row('share', '📤', 'rgba(95,159,209,.2)', 'שיתוף הלוז שלי', 'לינק · QR · קוד')}
      ${row('journal', '📝', 'rgba(244,204,110,.3)', 'יומן סיקור', nNotes ? `${nNotes} פתקים · ייצוא` : 'עוד אין פתקים')}
      ${row('appshare', '💬', 'rgba(37,211,102,.18)', 'שליחת האפליקציה לחבר', 'בוואטסאפ')}
    </div>

    <details class="fold" id="friends" data-fold="friends" ${profFold.friends ? 'open' : ''}>
      <summary><h3>חברים</h3><span>${S.friends.length ? `${S.friends.length} ברשימה` : 'עוד אין'}</span></summary>
      <div class="fold-b">${friendsBlock()}</div>
    </details>

    <details class="fold" data-fold="account" ${profFold.account ? 'open' : ''}>
      <summary><h3>חשבון וגיבוי</h3><span>${signed ? (isBackedUp() ? '✅ מגובה' : '⏳ ממתין') : CC.on ? '⚠️ לא מחובר' : ''}</span></summary>
      <div class="fold-b">
        ${acct ? `<p style="margin:0 0 6px">${acct}</p>` : ''}
        ${CC.on && !signed ? '<div class="gbtn" id="pgbtn" style="margin:6px 0 10px"></div>' : ''}
        <p style="margin:0 0 10px;font-size:14px;color:var(--ink-2)">${storageOK ? '' : '<b>בדפדפן הזה השמירה לא עובדת!</b> '}${isBackedUp() ? '✅ כל השינויים מגובים' : hasData() ? '⚠️ יש שינויים שלא גובו' : 'אין עדיין נתונים'}${lastBackupAt() ? ` · גיבוי אחרון ${agoText(lastBackupAt())}` : ''}</p>
        <div class="btn-row">
          <button class="btn sm" data-a="bkpanel">💾 גיבוי ושחזור</button>
          <button class="btn alt sm" data-a="restore">${ICON.import} ייבוא לוז</button>
        </div>
        ${signed ? '<button class="link-btn" data-a="signout">התנתקות / התחברות עם חשבון אחר</button>' : ''}
      </div>
    </details>

    <details class="fold" data-fold="more" ${profFold.more ? 'open' : ''}>
      <summary><h3>עוד</h3><span>בלי קליטה · עזרה · איפוס</span></summary>
      <div class="fold-b">
        <h4 class="fold-h">בלי קליטה</h4>
        <p style="margin:0 0 12px;font-size:14px">${IS_FILE ? 'זה הקובץ המקומי. מומלץ לעבור לאתר (ב"הלוז שלי").' : !IS_SITE ? '' : offlineReady ? '✓ מוכן לשימוש בלי קליטה' : '⏳ עדיין לא נשמר לשימוש בלי קליטה – פתחו פעם אחת עם קליטה'}${navigator.onLine ? '' : ' · עכשיו אין קליטה'}</p>
        <h4 class="fold-h">איך משתמשים</h4>
        <ul style="margin:0 0 12px;padding-inline-start:20px;font-size:14px;line-height:1.6">
          <li>חיפוש: השדה למעלה, בכל מסך.</li>
          <li>לחיצה על הופעה: פרטים, חייב/אולי, ומה מתנגש.</li>
          <li>לחיצה ארוכה בלוז המלא: הוספה מהירה כ"חייב".</li>
          <li>"ניווט": פותח את המפה עם סימון הבמה.</li>
          <li>הלוז של כל חבר – לשונית נפרדת ב"הלוז שלי", וגם "משותף".</li>
        </ul>
        <h4 class="fold-h">איפוס</h4>
        <button class="btn alt sm" data-a="reset" style="border-color:var(--danger);color:var(--danger)">${ICON.trash} מחיקת כל הבחירות והחברים</button>
        <p style="font-size:12px;color:var(--ink-3);margin:12px 0 0">${n} בחירות · נתונים v${DATA_VERSION} · לוז מתוך indnegev.co.il · אפליקציה אישית לא רשמית · ⁦15–17.10.2026⁩ מצפה גבולות</p>
      </div>
    </details>
  </div></div>`;

  const sc = $('#pscroll');
  sc.querySelectorAll('details[data-fold]').forEach(d => d.addEventListener('toggle', () => { profFold[d.dataset.fold] = d.open; }));
  const g = $('#pgbtn', sc);
  if (g) renderGoogleButton(g);
  const pn = $('#pName', sc);
  if (pn) {
    pn.focus(); pn.select();
    const done = () => { if (!nameEdit) return; nameEdit = false; const v = pn.value.trim().slice(0, 24); if (v !== S.name) { S.name = v; save(); } rerender(); };
    pn.addEventListener('change', done);
    pn.addEventListener('blur', done);
    pn.addEventListener('keydown', e => { if (e.key === 'Enter') pn.blur(); });
  }
  bindAvatarPicker(sc, () => { avPickerOpen = false; rerender(); });
  bindFriends(sc, () => rerender());
  sc.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'share') openShare();
    if (a === 'avatar') { avPickerOpen = !avOpen(); return rerender(); }
    if (a === 'name') { nameEdit = true; return rerender(); }
    if (a === 'tent') { if (PLACE.tent) openTentSheet(); else { setTab('map'); picking = 'tent'; updateRoute(null); toast('הקישו על המקום של האוהל במפה'); } return; }
    if (a === 'appshare') shareApp();
    if (a === 'signout') cloudSignOut();
    if (a === 'journal') openTimeline();
    if (a === 'gear') openGear();
    if (a === 'gear-share') openGearShare();
    if (a === 'tent-go') goTo('tent');
    if (a === 'tent-share') shareTentImage();
    if (a === 'tent-move') { setTab('map'); picking = 'tent'; updateRoute(null); toast('הקישו על המקום של האוהל במפה'); }
    if (a === 'jexport') exportJournal('share');
    if (a === 'restore') openImport();
    if (a === 'bkpanel') openBackupPanel();
    if (a === 'reset' && confirm('למחוק את כל הבחירות והחברים? (נשמרת גרסה קודמת בגיבוי ושחזור)')) {
      await takeSnapshot('לפני איפוס');
      S.picks = {}; S.friends = []; S.prefs.mineView = 'me'; save(); render(); toast('הכל נמחק');
    }
  });
}
