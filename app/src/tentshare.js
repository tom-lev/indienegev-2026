/* שיתוף "איפה האוהל שלי": תמונה מעובדת של המפה עם האוהל מסומן */

/* הנקודה הבולטת הקרובה לאוהל (בקו אווירי), לתיאור "ליד ..." */
function tentLandmark(t) {
  const skip = new Set(['wc', 'water']);
  let best = null, bd = Infinity;
  for (const p of PLACES) {
    if (p.id === 'tent' || skip.has(p.type)) continue;
    const d = Math.hypot((p.mapX - t.mapX) * MAP_W / 100, (p.mapY - t.mapY) * MAP_H / 100);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

async function makeTentImage() {
  await document.fonts.ready;
  const t = PLACE.tent;
  const W = 1080, H = 1350, TOP = 170, BOTTOM = 170, MH = H - TOP - BOTTOM;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const F = (w, s) => `${w} ${s}px Rubik, sans-serif`;
  const INK = '#153f4c', PAPER = '#f6ead2', CORAL = '#f46f6a';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // חיתוך המפה סביב האוהל (כשליש מרוחב המפה), בלי לצאת מגבולות התמונה
  const img = await loadImg(ASSETS.map);
  const sx = img.width / MAP_W; // יחס בין תמונת המפה לקואורדינטות
  const cw = MAP_W * 0.34, ch = cw * MH / W;
  const tx = t.mapX / 100 * MAP_W, ty = t.mapY / 100 * MAP_H;
  const cx0 = Math.min(MAP_W - cw, Math.max(0, tx - cw / 2));
  const cy0 = Math.min(MAP_H - ch, Math.max(0, ty - ch / 2));
  const k = W / cw;
  ctx.drawImage(img, cx0 * sx, cy0 * sx, cw * sx, ch * sx, 0, TOP, W, MH);

  // סימון האוהל: טבעות + עיגול עם 🏠 + חץ
  const px = (tx - cx0) * k, py = TOP + (ty - cy0) * k;
  for (const [r, a] of [[150, 0.18], [105, 0.3]]) {
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(244,111,106,${a + 0.4})`; ctx.lineWidth = 10; ctx.stroke();
    ctx.fillStyle = `rgba(244,111,106,${a / 2})`; ctx.fill();
  }
  const pinY = py - 70;
  ctx.beginPath();
  ctx.moveTo(px - 22, pinY + 40); ctx.lineTo(px, py); ctx.lineTo(px + 22, pinY + 40); ctx.closePath();
  ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(px, pinY, 52, 0, Math.PI * 2);
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.lineWidth = 9; ctx.strokeStyle = CORAL; ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(px, pinY, 57, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🏠', px, pinY + 3);
  ctx.textBaseline = 'alphabetic';

  // תווית מעל הסיכה
  const label = `האוהל של ${S.name || 'החבר/ה שלכם'}`;
  ctx.font = F(900, 40); ctx.direction = 'rtl';
  const lw = ctx.measureText(label).width + 56;
  const lx = Math.min(W - lw / 2 - 20, Math.max(lw / 2 + 20, px));
  let ly = pinY - 150;
  if (ly < TOP + 20) ly = pinY + 110; // אין מקום למעלה – מתחת לסיכה
  ctx.fillStyle = PAPER; roundRect(ctx, lx - lw / 2, ly, lw, 72, 22); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.fillText(label, lx, ly + 50);

  // מפה מוקטנת בפינה עם מסגרת החיתוך
  const iw = 300, ih = iw * MAP_H / MAP_W, ix = 24, iy = TOP + MH - ih - 24;
  ctx.fillStyle = PAPER; roundRect(ctx, ix - 8, iy - 8, iw + 16, ih + 16, 16); ctx.fill();
  ctx.drawImage(img, ix, iy, iw, ih);
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(ix, iy, iw, ih);
  ctx.strokeStyle = CORAL; ctx.lineWidth = 4;
  ctx.strokeRect(ix + cx0 / MAP_W * iw, iy + cy0 / MAP_H * ih, cw / MAP_W * iw, ch / MAP_H * ih);
  ctx.beginPath(); ctx.arc(ix + t.mapX / 100 * iw, iy + t.mapY / 100 * ih, 7, 0, Math.PI * 2);
  ctx.fillStyle = CORAL; ctx.fill();

  // מסגרת המפה
  ctx.lineWidth = 6; ctx.strokeStyle = INK;
  ctx.strokeRect(0, TOP, W, MH);

  // כותרת עליונה
  const wm = await loadImg(ASSETS.wordmark);
  const wmW = 250, wmH = wmW * wm.height / wm.width;
  ctx.drawImage(wm, 40, (TOP - wmH) / 2, wmW, wmH);
  ctx.textAlign = 'right'; ctx.fillStyle = INK;
  ctx.font = F(900, 64);
  ctx.fillText(fitText(ctx, 'איפה האוהל שלי 🏠', W - 360), W - 40, 100);
  ctx.font = F(600, 28); ctx.fillStyle = '#3d6170';
  ctx.fillText('אינדינגב 2026 · מצפה גבולות', W - 40, 145);

  // שורה תחתונה: "ליד ..." + הסבר
  const near = tentLandmark(t);
  ctx.textAlign = 'right'; ctx.fillStyle = INK;
  ctx.font = F(800, 46);
  ctx.fillText(fitText(ctx, near ? `📍 ליד ${near.name}` : '📍 מסומן במפה', W - 80), W - 40, H - BOTTOM + 80);
  ctx.font = F(600, 30); ctx.fillStyle = '#3d6170';
  ctx.fillText('בואו לבקר! (מפת הפסטיבל הרשמית, הסימון מהאפליקציה "הלוז שלי")', W - 40, H - BOTTOM + 130);
  return cv;
}

async function shareTentImage() {
  if (!PLACE.tent) return;
  toast('מכין תמונה…');
  const cv = await makeTentImage();
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const file = new File([blob], 'my-tent-indienegev.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `האוהל שלי באינדינגב 🏠` }); } catch (e) { /* בוטל */ }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('התמונה נשמרה בהורדות');
}
