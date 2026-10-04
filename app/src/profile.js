/* לשונית "פרופיל": השם, הדמות, שיתוף, חברים, חשבון וגיבוי, בלי קליטה, עזרה ואיפוס */

function renderProfile(view) {
  const me = meLook();
  const n = Object.keys(S.picks).length;
  const acct = typeof cloudAuth !== 'undefined' && cloudAuth
    ? `מחובר/ת כ-<b>${esc(cloudAuth.name || cloudAuth.email || '')}</b>${cloudAuth.email ? ` <span dir="ltr">(${esc(cloudAuth.email)})</span>` : ''}`
    : CC.on ? '<b>לא מחובר/ת</b> – בלי חשבון אין גיבוי לענן' : '';
  view.innerHTML = `<div class="scroll" id="pscroll"><div class="pad">
    <div class="prof-card" style="--fc:${me.color}">
      <span class="av big">${me.emoji}</span>
      <div class="prof-name">
        <label class="field-l" for="pName">השם שלך (כך החברים רואים אותך)</label>
        <input id="pName" class="text-in" value="${esc(S.name)}" maxlength="24" placeholder="השם שלך">
      </div>
    </div>

    <div class="card-box"><h3>הדמות שלך</h3><p>אפשר להחליף מתי שרוצים. דמות שחבר/ה כבר קיבל/ה – תפוסה.</p>${avatarPicker()}</div>

    <div class="card-box">
      <h3>שיתוף הלוז שלי</h3>
      <p>לינק, QR (בלי קליטה) או קוד. אצל החברים הלוז מתעדכן לבד.</p>
      <button class="btn block" data-a="share">${ICON.share} שיתוף הלוז שלי</button>
    </div>

    <h3 class="section-t" id="friends">חברים ${S.friends.length ? `<span class="chip soft">${S.friends.length}</span>` : ''}</h3>
    ${friendsBlock()}

    <h3 class="section-t">חשבון וגיבוי</h3>
    <div class="card-box">
      ${acct ? `<p style="margin:0 0 6px">${acct}</p>` : ''}
      ${CC.on && !(typeof cloudAuth !== 'undefined' && cloudAuth) ? '<div class="gbtn" id="pgbtn" style="margin:6px 0 10px"></div>' : ''}
      <p style="margin:0 0 10px;font-size:14px;color:var(--ink-2)">${storageOK ? '' : '<b>בדפדפן הזה השמירה לא עובדת!</b> '}${isBackedUp() ? '✅ כל השינויים מגובים' : hasData() ? '⚠️ יש שינויים שלא גובו' : 'אין עדיין נתונים'}${lastBackupAt() ? ` · גיבוי אחרון ${agoText(lastBackupAt())}` : ''}</p>
      <div class="btn-row">
        <button class="btn sm" data-a="bkpanel">💾 גיבוי ושחזור</button>
        <button class="btn alt sm" data-a="restore">${ICON.import} ייבוא לוז</button>
      </div>
    </div>

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
  const g = $('#pgbtn', sc);
  if (g) renderGoogleButton(g);
  $('#pName', sc).onchange = e => { S.name = e.target.value.trim().slice(0, 24); save(); };
  bindAvatarPicker(sc, () => rerender());
  bindFriends(sc, () => rerender());
  sc.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'share') openShare();
    if (a === 'restore') openImport();
    if (a === 'bkpanel') openBackupPanel();
    if (a === 'reset' && confirm('למחוק את כל הבחירות והחברים? (נשמרת גרסה קודמת בגיבוי ושחזור)')) {
      await takeSnapshot('לפני איפוס');
      S.picks = {}; S.friends = []; S.prefs.mineView = 'me'; save(); render(); toast('הכל נמחק');
    }
  });
}
