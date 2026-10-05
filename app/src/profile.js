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
const profFold = { friends: false, account: false }; // "חברים" ו"חשבון וגיבוי" – מקופלים כברירת מחדל
const avOpen = () => avPickerOpen || !(S.avatar && (S.avatar.picked || !S.avatar.auto));

function renderProfile(view) {
  const me = meLook();
  const n = Object.keys(S.picks).length;
  const acct = typeof cloudAuth !== 'undefined' && cloudAuth
    ? `מחובר/ת כ-<b>${esc(cloudAuth.name || cloudAuth.email || '')}</b>${cloudAuth.email ? ` <span dir="ltr">(${esc(cloudAuth.email)})</span>` : ''}`
    : CC.on ? '<b>לא מחובר/ת</b> – בלי חשבון אין גיבוי לענן' : '';
  ensureGear();
  view.innerHTML = `<div class="scroll" id="pscroll"><div class="pad">
    <div class="prof-top">
      <div class="prof-card" style="--fc:${me.color}">
        <button class="av big av-edit" data-a="avatar" aria-label="החלפת הדמות" aria-expanded="${avOpen()}">${me.emoji}<i>${ICON.edit}</i></button>
        <div class="prof-name">
          <label class="field-l" for="pName">השם שלך</label>
          <input id="pName" class="text-in" value="${esc(S.name)}" maxlength="24" placeholder="השם שלך">
        </div>
      </div>
      <div class="tile tent-tile">
        <div class="tile-i">🏠</div>
        <h3>האוהל שלי</h3>
        <small class="tile-sub">${PLACE.tent ? (tentLandmark(PLACE.tent) ? `מסומן במפה · ליד ${esc(tentLandmark(PLACE.tent).name)}` : 'מסומן במפה') : 'איפה האוהל שלך במפה?'}</small>
        ${PLACE.tent
          ? `<button class="btn block sm" data-a="tent-go">${ICON.pin} ניווט</button>
             <div class="tile-acts"><button data-a="tent-share" aria-label="שליחת מפה עם האוהל">${ICON.image}</button><button data-a="tent-move" aria-label="הזזת הסימון במפה">${ICON.edit}</button></div>`
          : `<button class="btn block sm" data-a="tent-move">${ICON.map} סימון במפה</button>`}
      </div>
    </div>
    ${avOpen() ? `<div class="card-box av-card"><h3>${myAvatar() == null || !(S.avatar.picked || !S.avatar.auto) ? 'בחר/י דמות' : 'החלפת הדמות'}</h3><p>כך החברים רואים אותך. דמות שחבר/ה כבר קיבל/ה – תפוסה.</p>${avatarPicker()}</div>` : ''}

    <div class="prof-tiles">
      <div class="tile">
        <div class="tile-i">${ICON.share}</div>
        <h3>שיתוף הלוז</h3>
        <button class="btn block sm" data-a="share">שיתוף</button>
      </div>
      <div class="tile">
        <div class="tile-i">💬</div>
        <h3>שליחת האפליקציה</h3>
        <button class="btn block sm wa" data-a="appshare">וואטסאפ</button>
      </div>
    </div>

    ${gearCard()}

    <div class="card-box">
      <h3>יומן סיקור</h3>
      <p>הפתקים והמדדים מכל ההופעות, לפי סדר הזמן. אפשר לייצא הכל.</p>
      <div class="btn-row">
        <button class="btn sm" data-a="journal">${ICON.note} פתיחת היומן</button>
        <button class="btn alt sm" data-a="jexport">${ICON.share} ייצוא</button>
      </div>
    </div>

    <details class="fold" id="friends" data-fold="friends" ${profFold.friends ? 'open' : ''}>
      <summary><h3>חברים</h3><span>${S.friends.length ? `${S.friends.length} ברשימה` : 'עוד אין'}</span></summary>
      <div class="fold-b">${friendsBlock()}</div>
    </details>

    <details class="fold" data-fold="account" ${profFold.account ? 'open' : ''}>
      <summary><h3>חשבון וגיבוי</h3><span>${typeof cloudAuth !== 'undefined' && cloudAuth ? (isBackedUp() ? '✅ מגובה' : '⏳ ממתין') : '⚠️ לא מחובר'}</span></summary>
    <div class="fold-b">
      ${acct ? `<p style="margin:0 0 6px">${acct}</p>` : ''}
      ${CC.on && !(typeof cloudAuth !== 'undefined' && cloudAuth) ? '<div class="gbtn" id="pgbtn" style="margin:6px 0 10px"></div>' : ''}
      <p style="margin:0 0 10px;font-size:14px;color:var(--ink-2)">${storageOK ? '' : '<b>בדפדפן הזה השמירה לא עובדת!</b> '}${isBackedUp() ? '✅ כל השינויים מגובים' : hasData() ? '⚠️ יש שינויים שלא גובו' : 'אין עדיין נתונים'}${lastBackupAt() ? ` · גיבוי אחרון ${agoText(lastBackupAt())}` : ''}</p>
      <div class="btn-row">
        <button class="btn sm" data-a="bkpanel">💾 גיבוי ושחזור</button>
        <button class="btn alt sm" data-a="restore">${ICON.import} ייבוא לוז</button>
      </div>
      ${typeof cloudAuth !== 'undefined' && cloudAuth ? '<button class="link-btn" data-a="signout">התנתקות / התחברות עם חשבון אחר</button>' : ''}
    </div>
    </details>

    <div class="card-box">
      <h3>בלי קליטה</h3>
      <p style="margin:0">${IS_FILE ? 'זה הקובץ המקומי. מומלץ לעבור לאתר (ב"הלוז שלי").' : !IS_SITE ? '' : offlineReady ? '✓ מוכן לשימוש בלי קליטה' : '⏳ עדיין לא נשמר לשימוש בלי קליטה – פתחו פעם אחת עם קליטה'}${navigator.onLine ? '' : ' · עכשיו אין קליטה'}</p>
    </div>

    <div class="card-box">
      <h3>איך משתמשים</h3>
      <ul style="margin:0;padding-inline-start:20px;font-size:14px;line-height:1.6">
        <li>חיפוש: השדה למעלה, בכל מסך.</li>
        <li>לחיצה על הופעה: פרטים, חייב/אולי, ומה מתנגש.</li>
        <li>לחיצה ארוכה בלוז המלא: הוספה מהירה כ"חייב".</li>
        <li>"ניווט": פותח את המפה עם סימון הבמה.</li>
        <li>הלוז של כל חבר – לשונית נפרדת ב"הלוז שלי", וגם "משותף".</li>
      </ul>
    </div>

    <div class="card-box">
      <h3>איפוס</h3>
      <button class="btn alt sm" data-a="reset" style="border-color:var(--danger);color:var(--danger)">${ICON.trash} מחיקת כל הבחירות והחברים</button>
    </div>
    <p style="font-size:12px;color:var(--ink-3);margin:10px 0 0">${n} בחירות · נתונים v${DATA_VERSION} · לוז מתוך indnegev.co.il · אפליקציה אישית לא רשמית · ⁦15–17.10.2026⁩ מצפה גבולות</p>
  </div></div>`;

  const sc = $('#pscroll');
  sc.querySelectorAll('details[data-fold]').forEach(d => d.addEventListener('toggle', () => { profFold[d.dataset.fold] = d.open; }));
  const g = $('#pgbtn', sc);
  if (g) renderGoogleButton(g);
  $('#pName', sc).onchange = e => { S.name = e.target.value.trim().slice(0, 24); save(); };
  bindAvatarPicker(sc, () => { avPickerOpen = false; rerender(); });
  bindFriends(sc, () => rerender());
  sc.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'share') openShare();
    if (a === 'avatar') { avPickerOpen = !avOpen(); return rerender(); }
    if (a === 'appshare') shareApp();
    if (a === 'signout') cloudSignOut();
    if (a === 'journal') openTimeline();
    if (a === 'gear') openGear();
    if (a === 'gear-share') { ensureGear(); shareGear(); }
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
