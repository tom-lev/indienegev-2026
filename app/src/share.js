/* שיתוף בלי אינטרנט: קוד טקסט, QR, תמונה + ייבוא (הדבקה / מצלמה / תמונה) */

function drawQR(canvas, text, size = 440) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = Math.floor(size / (n + quiet * 2));
  const dim = cell * (n + quiet * 2);
  canvas.width = canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#153f4c';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  return canvas;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* */ }
    ta.remove();
    return ok;
  }
}

async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  toast(await copyText(text) ? 'הקוד הועתק, אפשר להדביק בוואטסאפ' : 'לא הצלחתי להעתיק, סמנו את הקוד והעתיקו ידנית');
}

async function shareLinkMsg(code) {
  const url = shareLink(code), text = `${S.name || 'חבר/ה'} משתף/ת איתך את הלוז לאינדינגב 2026 🦋`;
  if (navigator.share) {
    try { await navigator.share({ text, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  toast(await copyText(`${text}\n${url}`) ? 'הלינק הועתק, אפשר להדביק בוואטסאפ' : 'לא הצלחתי להעתיק');
}

function askName(then) {
  if (S.name) return then();
  const n = prompt('איך לקרוא לך בלוז המשותף?', '');
  if (n == null) return;
  S.name = n.trim().slice(0, 24) || 'אני';
  save();
  then();
}

function openShare() {
  askName(() => openPanel('שיתוף הלוז שלי', (body, api) => {
    const live = typeof cloudAuth !== 'undefined' && cloudAuth ? cloudAuth.uid : null;
    const code = encodeShare(S.name, S.picks, live);
    const count = Object.keys(S.picks).length;
    body.innerHTML = `
      <label class="field-l" for="myName">השם שלך (יופיע אצל מי שמייבא)</label>
      <input id="myName" class="text-in" value="${esc(S.name)}" maxlength="24" style="margin-bottom:16px">

      <div class="card-box">
        <h3>שליחת לינק</h3>
        <p>הכי פשוט: שולחים לינק בוואטסאפ, החבר לוחץ ורואה "${esc(S.name)} רוצה לשתף איתך את הלוז".${live ? ' הלוז יתעדכן אצלו לבד.' : ''}</p>
        <div class="btn-row">
          <button class="btn" data-a="link">${ICON.share} שליחת לינק</button>
          <button class="btn alt" data-a="copylink">${ICON.copy} העתקת לינק</button>
        </div>
      </div>

      <div class="card-box" style="text-align:center">
        <h3>סריקה פנים מול פנים</h3>
        <p>עובד גם בלי קליטה. החבר פותח "ייבוא" ← "סריקת QR".</p>
        <div class="qr-wrap"><canvas id="qr"></canvas></div>
        <p style="margin:0">${count} הופעות · כולל רמת עניין (חייב/אולי)</p>
        ${live ? '<p style="margin:6px 0 0;font-weight:700">🔄 לוז חי: כשתשנה משהו, זה יתעדכן אצלם לבד כשיש אינטרנט.</p>' : ''}
      </div>

      <div class="card-box">
        <h3>קוד טקסט</h3>
        <p>שולחים בוואטסאפ, והחבר מדביק ב"ייבוא". ההודעה תצא כשתחזור קליטה.</p>
        <div class="code-box" id="code">${esc(code)}</div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn" data-a="share">${ICON.share} שליחה</button>
          <button class="btn alt" data-a="copy">${ICON.copy} העתקה</button>
        </div>
      </div>

      <div class="card-box">
        <h3>שיתוף כתמונה</h3>
        <p>תמונה מעוצבת של הלוז שלך, עם QR לייבוא.</p>
        <div class="btn-row">
          <button class="btn" data-a="img-story">${ICON.image} סטורי</button>
          <button class="btn alt" data-a="img-post">${ICON.image} פוסט</button>
        </div>
        <div id="imgOut"></div>
      </div>

      <p style="font-size:13px;color:var(--ink-2)">💡 הקוד הוא גם גיבוי: שמרו אותו, ותוכלו לשחזר את הלוז בכל מכשיר דרך "ייבוא" ← "החלפת הלוז שלי".</p>`;
    drawQR($('#qr', body), code);
    $('#myName', body).onchange = e => { S.name = e.target.value.trim().slice(0, 24) || S.name; save(); api.render(); };
    body.onclick = async e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'share') shareText(shareMessage(code));
      if (a === 'link') shareLinkMsg(code);
      if (a === 'copylink') toast(await copyText(shareLink(code)) ? 'הלינק הועתק' : 'לא הצלחתי להעתיק');
      if (a === 'copy') toast(await copyText(code) ? 'הועתק' : 'סמנו את הקוד והעתיקו ידנית');
      if (a.startsWith('img-')) showImage(a.slice(4), $('#imgOut', body), code);
    };
  }));
}

/* ───────── תמונת לוז ───────── */
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

async function makeScheduleImage(format, code) {
  await document.fonts.ready;
  const W = 1080, H = format === 'story' ? 1920 : 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const F = (w, s) => `${w} ${s}px Rubik, sans-serif`;
  ctx.direction = 'rtl';

  ctx.fillStyle = '#f6ead2';
  ctx.fillRect(0, 0, W, H);
  const fl = await loadImg(ASSETS.flower);
  ctx.globalAlpha = 0.5;
  const fw = 300, fh = fw * fl.height / fl.width;
  ctx.drawImage(fl, -40, H - fh + 30, fw, fh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#153f4c';
  ctx.lineWidth = 7;
  roundRect(ctx, 30, 30, W - 60, H - 60, 34);
  ctx.stroke();

  const wm = await loadImg(ASSETS.wordmark);
  const wmW = 300, wmH = wmW * wm.height / wm.width;
  ctx.drawImage(wm, 76, 74, wmW, wmH);

  ctx.fillStyle = '#153f4c';
  ctx.textAlign = 'right';
  ctx.font = F(900, 76);
  ctx.fillText(fitText(ctx, `הלוז של ${S.name || 'אני'}`, W - 460), W - 76, 140);
  ctx.font = F(600, 32);
  ctx.fillStyle = '#3d6170';
  ctx.fillText('אינדינגב 2026 · ⁦15–17.10⁩ · מצפה גבולות', W - 76, 192);

  /* פריסה: ימים אחד מתחת לשני, ברוחב מלא. אם אין מספיק גובה – שתי עמודות של ימים */
  const days = DAYS.map(d => ({ d, list: myPicks().filter(e => e.day === d.id) })).filter(x => x.list.length);
  const top = 236, bottom = H - 290;
  const PILL = 58, PILL_GAP = 16, SEC_GAP = 26, COL_GAP = 28;
  const fitRowH = groups => {
    const hs = groups.map(g => {
      const rows = g.reduce((n, x) => n + x.list.length, 0);
      return (bottom - top - g.length * (PILL + PILL_GAP) - (g.length - 1) * SEC_GAP) / Math.max(1, rows);
    });
    return Math.min(...hs);
  };
  // מעדיפים כמה שפחות עמודות (שמות ארוכים נחתכים בעמודה צרה), כל עוד השורות קריאות
  let groups = [days];
  if (fitRowH(groups) < 34 && days.length > 1) {
    const two = [];
    for (let c = 1; c < days.length; c++) two.push([days.slice(0, c), days.slice(c)]);
    groups = two.reduce((best, o) => fitRowH(o) > fitRowH(best) ? o : best, two[0]);
    if (fitRowH(groups) < 30 && days.length === 3) groups = days.map(x => [x]);
  }
  const rowH = Math.min(84, fitRowH(groups));
  const colW = (W - 152 - COL_GAP * (groups.length - 1)) / groups.length;
  const fs = Math.min(36, rowH * 0.46);
  const showStage = colW > 600;

  groups.forEach((g, gi) => {
    const right = W - 76 - gi * (colW + COL_GAP); // העמודה הראשונה מימין
    const left = right - colW;
    let y = top;
    g.forEach(x => {
      ctx.fillStyle = x.d.color;
      roundRect(ctx, right - Math.min(colW, 330), y, Math.min(colW, 330), PILL, PILL / 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#153f4c';
      ctx.stroke();
      ctx.fillStyle = '#153f4c';
      ctx.textAlign = 'center';
      ctx.font = F(900, 32);
      ctx.fillText(`${x.d.label} ${x.d.date}`, right - Math.min(colW, 330) / 2, y + 40);
      y += PILL + PILL_GAP;

      for (const e of x.list) {
        const lv = level(e.id);
        const st = STAGE[e.stage];
        const h = rowH - 8;
        const mid = y + h / 2;
        ctx.globalAlpha = lv === 2 ? 1 : 0.6;
        if (lv === 2) {
          ctx.fillStyle = st.tint;
          roundRect(ctx, left, y, colW, h, Math.min(14, h / 3));
          ctx.fill();
        }
        ctx.fillStyle = st.color;
        roundRect(ctx, right - 12, y, 12, h, 6);
        ctx.fill();
        ctx.fillStyle = '#153f4c';
        ctx.font = F(800, fs * 0.84);
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillText(e.s, right - 26, mid + fs * 0.3);
        const tw = ctx.measureText('00:00').width;
        ctx.direction = 'rtl';
        let stageW = 0;
        if (showStage) {
          ctx.font = F(600, fs * 0.62);
          ctx.textAlign = 'left';
          ctx.fillStyle = '#3d6170';
          ctx.fillText(st.short, left + 18, mid + fs * 0.22);
          stageW = ctx.measureText(st.short).width + 30;
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = '#153f4c';
        ctx.font = F(lv === 2 ? 800 : 600, fs);
        const label = (lv === 2 ? '★ ' : '') + e.name;
        ctx.fillText(fitText(ctx, label, colW - tw - 64 - stageW), right - 44 - tw, mid + fs * 0.34);
        ctx.globalAlpha = 1;
        y += rowH;
      }
      y += SEC_GAP;
    });
  });

  if (!days.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#153f4c';
    ctx.font = F(700, 40);
    ctx.fillText('עוד לא נבחרו הופעות', W / 2, H / 2);
  }

  // QR לייבוא + מקרא
  const qs = 200;
  const qc = drawQR(document.createElement('canvas'), code, qs);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 76, H - 76 - qs, qs, qs, 16);
  ctx.fill();
  ctx.drawImage(qc, 76, H - 76 - qs, qs, qs);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#153f4c';
  ctx.font = F(800, 32);
  ctx.fillText('סרקו לייבוא באפליקציה', W - 76, H - 168);
  ctx.font = F(600, 27);
  ctx.fillStyle = '#3d6170';
  ctx.fillText('★ = חייב · שקוף = אולי', W - 76, H - 122);
  return cv;
}

async function showImage(format, out, code) {
  out.innerHTML = '<p style="margin-top:10px">יוצר תמונה…</p>';
  const cv = await makeScheduleImage(format, code);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `indienegev-${S.name || 'lineup'}.png`, { type: 'image/png' });
  const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
  out.innerHTML = `<img class="img-preview" src="${url}" alt="תמונת הלוז שלי">
    <div class="btn-row">
      ${canShareFile ? `<button class="btn" data-img="share">${ICON.share} שיתוף</button>` : ''}
      <a class="btn alt" href="${url}" download="${esc(file.name)}">${ICON.download} שמירה</a>
    </div>
    <p style="font-size:12.5px;margin-top:6px">אפשר גם ללחוץ לחיצה ארוכה על התמונה ולשמור.</p>`;
  const sb = out.querySelector('[data-img="share"]');
  if (sb) sb.onclick = async () => {
    try { await navigator.share({ files: [file], text: 'הלוז שלי לאינדינגב 2026 🦋' }); } catch (e) { /* בוטל */ }
  };
}

/* ───────── ייבוא ───────── */
const INVITE_KEY = 'indienegev-invite';
let inviteFrom = null; // שם מי שהזמין (לינק שיתוף) – מוצג גם במסך ההתחברות
function openImport(initial, opts = {}) {
  let decoded = initial ? decodeShare(initial) : null;
  if (decoded && opts.invite) {
    decoded.invite = true; inviteFrom = decoded.name;
    // נשמר עד שמאשרים/סוגרים – כדי שלא יאבד במעבר לדף ההתחברות של Google (אייפון) וחזרה
    try { localStorage.setItem(INVITE_KEY, JSON.stringify({ code: initial, at: Date.now() })); } catch (e) { /* */ }
  }
  let scanning = null;
  const stopScan = () => { if (scanning) { scanning(); scanning = null; } };

  openPanel(decoded && decoded.invite ? 'לוז ששותף איתך' : 'ייבוא לוז', (body, api) => {
    if (decoded) return renderImportPreview(body, api, decoded, () => { decoded = null; api.render(); });
    body.innerHTML = `
      <div class="card-box">
        <h3>הדבקת קוד</h3>
        <p>קוד שקיבלת מחבר/ה (מתחיל ב-INDN1), או גיבוי שלך.</p>
        <textarea id="codeIn" class="text-in" placeholder="INDN1.…"></textarea>
        <button class="btn block" data-a="paste" style="margin-top:10px">המשך</button>
      </div>
      <div class="card-box">
        <h3>סריקת QR</h3>
        <p>מהמסך של החבר (בלי קליטה), או מתמונת לוז ששמרת.</p>
        <div id="scanArea"></div>
        <div class="btn-row">
          <button class="btn" data-a="cam">${ICON.camera} מצלמה</button>
          <label class="btn alt">${ICON.image} מתמונה<input type="file" accept="image/*" id="imgIn" hidden></label>
        </div>
      </div>`;
    const done = text => {
      const d = decodeShare(text);
      if (!d) { toast('לא זיהיתי קוד לוז תקין'); return false; }
      stopScan();
      decoded = d;
      api.render();
      return true;
    };
    body.onclick = async e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'paste') done($('#codeIn', body).value);
      if (b.dataset.a === 'cam') {
        stopScan();
        scanning = await startCamera($('#scanArea', body), done);
      }
    };
    $('#imgIn', body).onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      const text = await decodeImageFile(f);
      if (!text) toast('לא נמצא QR בתמונה'); else done(text);
    };
  }, () => { stopScan(); inviteFrom = null; try { localStorage.removeItem(INVITE_KEY); } catch (e) { /* */ } });
}

function renderImportPreview(body, api, d, back) {
  if (d.invite) return renderInvite(body, api, d, back);
  const ids = Object.keys(d.picks);
  const must = ids.filter(id => d.picks[id] === 2).length;
  const perDay = DAYS.map(day => `${day.label}: ${ids.filter(id => EV[id] && EV[id].day === day.id).length}`).join(' · ');
  const existing = S.friends.find(f => f.name === d.name);
  const common = ids.filter(id => level(id)).length;
  body.innerHTML = `
    <div class="preview-card">
      <h3>הלוז של ${esc(d.name)}</h3>
      <p style="margin:6px 0;font-weight:600">${ids.length} הופעות · ${must} חייב · ${ids.length - must} אולי</p>
      <p style="margin:0;color:var(--ink-2);font-size:14px">${perDay}${common ? ` · ${common} משותפות איתך` : ''}</p>
    </div>
    <button class="btn block" data-a="friend" style="margin-bottom:10px">${ICON.users} ${existing ? `עדכון ${esc(d.name)} ברשימת החברים` : 'הוספה כחבר/ה'}</button>
    <button class="btn alt block" data-a="merge" style="margin-bottom:10px">${ICON.plus} מיזוג ללוז שלי</button>
    <button class="btn alt block" data-a="replace" style="margin-bottom:18px">${ICON.swap} החלפת הלוז שלי (שחזור גיבוי)</button>
    <button class="btn alt sm" data-a="back">ייבוא קוד אחר</button>`;
  body.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'back') return back();
    if (a === 'friend') {
      upsertFriend(d);
      toast(existing ? `הלוז של ${d.name} עודכן` : `${d.name} נוסף/ה לחברים`);
      api.close();
      setTimeout(openFriends, 320);
    }
    if (a === 'merge') {
      let n = 0;
      for (const [id, lv] of Object.entries(d.picks)) if (!S.picks[id]) { S.picks[id] = lv; n++; }
      save();
      toast(`נוספו ${n} הופעות ללוז שלך`);
      api.close();
    }
    if (a === 'replace') {
      if (!confirm('להחליף את כל הלוז שלך בלוז הזה? (הלוז הנוכחי נשמר כגרסה קודמת בגיבוי ושחזור)')) return;
      takeSnapshot('לפני החלפת לוז').then(() => {
        S.picks = { ...d.picks };
        save();
        toast('הלוז הוחלף');
        api.close();
      });
    }
  };
}

/* מסך הזמנה (נפתח מלינק): "X רוצה לשתף איתך את הלוז" + כפתור אחד */
function renderInvite(body, api, d, back) {
  const ids = Object.keys(d.picks);
  const must = ids.filter(id => d.picks[id] === 2).length;
  const common = ids.filter(id => level(id)).length;
  const existing = (d.src && S.friends.find(f => f.src === d.src)) || S.friends.find(f => f.name === d.name);
  const self = d.src && typeof cloudAuth !== 'undefined' && cloudAuth && cloudAuth.uid === d.src;
  body.innerHTML = `
    <div class="invite">
      <img src="${ASSETS.butterfly}" alt="" class="invite-art">
      <h2>${esc(d.name)} רוצה לשתף איתך את הלוז ${self ? '(זה הלוז שלך 🙂)' : ''}</h2>
      <p>${ids.length} הופעות · ${must} חייב · ${ids.length - must} אולי${common ? ` · ${common} משותפות איתך` : ''}</p>
      ${d.src ? '<p class="invite-live">🔄 הלוז יתעדכן אצלך לבד כש' + esc(d.name) + ' משנה משהו</p>' : ''}
      <button class="btn block big" data-a="accept">${existing ? `עדכון הלוז של ${esc(d.name)}` : 'הוספה'}</button>
      <p class="invite-note">הלוז של ${esc(d.name)} יופיע בלשונית נפרדת ב"הלוז שלי". הלוז שלך לא משתנה.</p>
      <details class="invite-more"><summary>אפשרויות נוספות</summary>
        <button class="btn alt block" data-a="merge" style="margin:10px 0">${ICON.plus} להוסיף את ההופעות ללוז שלי</button>
        <button class="btn alt block" data-a="replace">${ICON.swap} להחליף את הלוז שלי בלוז הזה</button>
      </details>
    </div>`;
  body.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'accept') {
      const f = upsertFriend(d);
      inviteFrom = null;
      api.close();
      S.prefs.mineView = f.id; save();
      setTab('mine');
      toast(existing ? `הלוז של ${d.name} עודכן` : `הלוז של ${d.name} נוסף ✓`);
      return;
    }
    // שאר האפשרויות – כמו בייבוא רגיל
    renderImportPreview(body, api, { ...d, invite: false }, back);
    const t = body.querySelector(`[data-a="${b.dataset.a}"]`);
    if (t) t.click();
  };
}

async function startCamera(area, onText) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('אין גישה למצלמה בדפדפן הזה. אפשר לצלם את המסך של החבר ולייבא "מתמונה"');
    return null;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    toast('לא התקבלה הרשאה למצלמה');
    return null;
  }
  area.innerHTML = '<video class="scan-video" playsinline muted></video><p style="text-align:center;margin:6px 0 10px">כוונו אל קוד ה-QR…</p>';
  const video = area.querySelector('video');
  video.srcObject = stream;
  await video.play().catch(() => {});
  const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let alive = true;
  const stop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); area.innerHTML = ''; };
  const tick = async () => {
    if (!alive) return;
    if (video.readyState >= 2) {
      try {
        let text = null;
        if (detector) {
          const codes = await detector.detect(video);
          text = codes[0] && codes[0].rawValue;
        } else {
          const w = video.videoWidth, h = video.videoHeight;
          const s = Math.min(1, 640 / Math.max(w, h));
          cv.width = w * s; cv.height = h * s;
          ctx.drawImage(video, 0, 0, cv.width, cv.height);
          const img = ctx.getImageData(0, 0, cv.width, cv.height);
          const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          text = r && r.data;
        }
        if (text && decodeShare(text)) { if (navigator.vibrate) navigator.vibrate(30); onText(text); return; }
      } catch (e) { /* ממשיכים לנסות */ }
    }
    setTimeout(tick, 180);
  };
  tick();
  return stop;
}

async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    if ('BarcodeDetector' in window) {
      try {
        const codes = await new BarcodeDetector({ formats: ['qr_code'] }).detect(img);
        if (codes[0]) return codes[0].rawValue;
      } catch (e) { /* נופלים ל-jsQR */ }
    }
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = img.width * s; cv.height = img.height * s;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const d = ctx.getImageData(0, 0, cv.width, cv.height);
    const r = jsQR(d.data, d.width, d.height);
    return r && r.data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
