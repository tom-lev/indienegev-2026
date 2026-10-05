"""בונה קובץ HTML יחיד ועצמאי: app/dist/indienegev.html

הרצה:  python app/build.py
"""
import base64
import io
import json
from pathlib import Path

import sys
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
SRC = ROOT / 'src'
VENDOR = ROOT / 'vendor'
CACHE = ROOT / 'assets'
DIST = ROOT / 'dist'
SITE = PROJECT / 'אינדינגב 2026 · 15-17 באוקטובר, מצפה גבולות_files'

# סדר קבצי ה-JS חשוב: data → core → ui → מסכים → main
APP_FILES = ['data.js', 'core.js', 'ui.js', 'grid.js', 'mine.js', 'sheet.js', 'search.js',
             'map.js', 'now.js', 'share.js', 'friends.js', 'gear.js', 'profile.js', 'journal.js', 'tentshare.js', 'cloud-core.js', 'backup.js', 'cloud.js', 'pwa.js', 'main.js']
VENDOR_FILES = ['qrcode.min.js', 'jsQR.min.js']

INK = (21, 63, 76)


def webp(im, quality=78):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()


def png(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def recolor(im, rgb):
    """צובע את כל הפיקסלים הנראים בצבע אחד, תוך שמירה על השקיפות."""
    im = im.convert('RGBA')
    solid = Image.new('RGBA', im.size, rgb + (255,))
    solid.putalpha(im.getchannel('A'))
    return solid


def build_assets():
    CACHE.mkdir(exist_ok=True)
    out = {}

    def cached(name, make, mime):
        p = CACHE / name
        if not p.exists():
            p.write_bytes(make())
        out[name.split('.')[0]] = f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()

    def make_map():
        im = Image.open(PROJECT / 'festival-map-2026-web-large.jpg').convert('RGB')
        im = im.resize((3200, round(im.height * 3200 / im.width)), Image.LANCZOS)
        return webp(im, 70)

    def make_wordmark():
        im = recolor(Image.open(SITE / '21_wordmark.png'), INK)
        im.thumbnail((640, 640), Image.LANCZOS)
        return png(im)

    def make_butterfly():
        im = Image.open(SITE / '06_butterfly.png').convert('RGBA')
        im.thumbnail((520, 520), Image.LANCZOS)
        return webp(im, 80)

    def make_flower():
        im = Image.open(SITE / '04_flower-mid.png').convert('RGBA')
        im.thumbnail((360, 360), Image.LANCZOS)
        return webp(im, 80)

    cached('icon.png', lambda: png(icon_image(192)), 'image/png')

    cached('map.webp', make_map, 'image/webp')
    cached('wordmark.png', make_wordmark, 'image/png')
    cached('butterfly.webp', make_butterfly, 'image/webp')
    cached('flower.webp', make_flower, 'image/webp')
    with Image.open(CACHE / 'map.webp') as m:
        out['mapW'], out['mapH'] = m.size
    # הציפורים שבציור: נחתכות לשכבות נפרדות (שזזות על המפה), ובמקומן המקורי נצבע השמיים
    if not (CACHE / 'birds.json').exists():
        make_birds()
    out['map'] = 'data:image/webp;base64,' + base64.b64encode((CACHE / 'map-sky.webp').read_bytes()).decode()
    out['birds'] = [dict(b, src='data:image/webp;base64,' + base64.b64encode((CACHE / b['file']).read_bytes()).decode())
                    for b in json.loads((CACHE / 'birds.json').read_text())]
    for b in out['birds']: del b['file']
    # דמות אדם מהציור (מועתקת – המקור נשאר במקומו), להולכים בשבילי הקמפינג
    if not (CACHE / 'walk0.webp').exists():
        make_person()
    with Image.open(CACHE / 'walk0.webp') as pm:  # מחזור הליכה: WALK_FRAMES תמונות זו לצד זו
        out['person'] = {'frames': WALK_FRAMES, 'idle': WALK_IDLE, 'idle': WALK_IDLE, 'rows': len(WALK_VARIANTS) * 3, 'variants': len(WALK_VARIANTS), 'a': WALK_A, 'kf': WALK_KF, 'foot': WALK_FOOT,
                         'heights': [v[0] for v in WALK_VARIANTS], 'roam': [i for i, v in enumerate(WALK_VARIANTS) if v[4] == 'balloon'], 'hipr': 0.99 * (0.255 + 0.235), 'w': pm.width // (WALK_FRAMES + WALK_IDLE), 'h': pm.height // (len(WALK_VARIANTS) * 3), 'src': 'data:image/webp;base64,' + base64.b64encode((CACHE / 'walk0.webp').read_bytes()).decode()}
    # המעשן – יושב על כיסא ליד אוהל בדרום הקמפינג
    if not (CACHE / 'smoker.json').exists():
        with Image.open(CACHE / 'walk0.webp') as wk:  # אותו צבע דיו כמו המטיילים
            px = [c for c in wk.convert('RGBA').getdata() if c[3] > 250]
        ink = tuple(sorted(px)[len(px) // 2][:3])
        (CACHE / 'smoker.json').write_text(json.dumps(make_smoker(ink)))
    out['smoker'] = dict(json.loads((CACHE / 'smoker.json').read_text()), src='data:image/webp;base64,' + base64.b64encode((CACHE / 'smoker0.webp').read_bytes()).decode())
    # רשת הליכה לחישוב מסלולים (נבנית מתמונת המפה)
    from walkgrid import build as build_walk, encode, CELL
    grid, (base_w, _) = build_walk(PROJECT / 'festival-map-2026-web-large.jpg')
    out['walk'] = encode(grid)
    out['fest'] = encode(build_walk.fest)
    out['walkH'], out['walkW'] = grid.shape
    out['walkCell'], out['walkBase'] = CELL, base_w
    return out


BIRDS = [(518, 118, 624, 188), (2260, 70, 2392, 121), (2398, 110, 2538, 164)]  # x0, y0, x1, y1 במפה (3200px)


def make_birds():
    """חותך את הציפורים מהמפה: שכבה שקופה לכל ציפור + מפה שבה מקומן נצבע בצבע השמיים מסביב."""
    import numpy as np
    from PIL import ImageFilter
    im = Image.open(CACHE / 'map.webp').convert('RGB')
    a = np.asarray(im).astype(np.float32)
    birds = []
    for n, (x0, y0, x1, y1) in enumerate(BIRDS):
        box = a[y0:y1, x0:x1].copy()
        lum = box @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        sky_px = box[(box[..., 2] > 150) & (box[..., 2] > box[..., 0] + 60)]
        sky = np.median(sky_px, axis=0)
        sky_l = float(sky @ np.array([0.3, 0.59, 0.11]))
        # ציפור = כהה בהרבה מהשמיים, בגוון כחלחל-אפור (לא ירוק/ורוד/לבן של האותיות והעננים)
        alpha = np.clip((sky_l - lum - 25) / 45, 0, 1) * (box[..., 2] >= box[..., 1] - 12)
        al = Image.fromarray((alpha * 255).astype('uint8'))
        grow = np.asarray(al.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
        grow = np.clip(grow * 1.6, 0, 1)[..., None]
        a[y0:y1, x0:x1] = box * (1 - grow) + sky * grow  # מוחק את הציפור מהמפה
        ink = np.median(box[alpha > 0.85], axis=0) * 0.55  # צבע הציפור, מוכהה לכמעט שחור (כמו שאר הדמויות בציור)
        sprite = Image.fromarray(np.dstack([np.broadcast_to(ink, box.shape), alpha * 255]).astype('uint8'), 'RGBA')
        f = f'bird{n}.webp'
        sprite.save(CACHE / f, 'WEBP', lossless=True)
        birds.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'file': f})
    Image.fromarray(a.clip(0, 255).astype('uint8')).save(CACHE / 'map-sky.webp', 'WEBP', quality=70, method=6)
    (CACHE / 'birds.json').write_text(json.dumps(birds))


PERSON = (2506, 700, 2540, 768)  # דמות שהולכת לבד, ליד מתחם הצימוד (במפה ברוחב 3200)


def make_person():
    """מעתיק דמות אדם מהציור לשכבה שקופה: כהה מהרקע הוורוד = הדמות."""
    import numpy as np
    im = Image.open(CACHE / 'map.webp').convert('RGB')
    x0, y0, x1, y1 = PERSON
    box = np.asarray(im.crop(PERSON)).astype(np.float32)
    lum = box @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    bg_l = float(np.percentile(lum, 80))
    alpha = np.clip((bg_l - lum - 55) / 45, 0, 1)
    ys, xs = np.nonzero(alpha > 0.3)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    ink = np.median(box[alpha > 0.9], axis=0)  # צבע הדיו של הדמות (בלי הוורוד שמסביב)
    rgb = np.broadcast_to(ink, box.shape)
    sprite = Image.fromarray(np.dstack([rgb, alpha * 255]).astype('uint8')[t:b, l:r], 'RGBA')
    sprite.save(CACHE / 'person0.webp', 'WEBP', lossless=True)
    make_walk_sheet(sprite, tuple(int(v) for v in ink))


WALK_FRAMES = 24
WALK_A = 0.13        # חצי צעד ביחס לגובה: כף הרגל זזה מ-+A ל-−A (ביחס לירך) בזמן שהיא על הקרקע
WALK_KF = 0.6        # קיצור פרספקטיבה במבט מלפנים/מאחור (צעד "קדימה" נראה קצר יותר על המסך)
# 4 דמויות: (גובה בפיקסלים של המפה, עובי, תיק על הגב, מעיל ארוך כמו הדמויות שבציור)
WALK_VARIANTS = [(58, 1.00, False, False, None), (63, 0.88, False, False, None), (54, 1.05, True, False, None), (59, 1.0, False, True, None),
                 (60, 0.95, False, False, 'hat'), (56, 0.92, False, False, 'pony'), (62, 1.08, False, False, 'cap'), (52, 0.95, True, False, 'hat'),
                 (60, 0.98, False, False, 'balloon')]   # האחרונה – הנודד עם הבלון: לא נכנס לשום מקום
BALLOON = (244, 111, 106)
WALK_FOOT = 0.9      # מיקום הקרקע (כפות הרגליים) בגובה התמונה – שם "נוגעים" בשביל
WALK_IDLE = 4        # תמונות עמידה אחרי מחזור ההליכה: עומד, נושם, משען על שמאל, משען על ימין
WALK_IDLE = 4        # תמונות עמידה אחרי מחזור ההליכה: עומד, נושם, משען על שמאל, משען על ימין


def make_walk_sheet(sprite, ink):
    """מחזור הליכה מצויר מאפס: 24 תמונות לכל מחזור (2 צעדים), 3 מבטים (צד/מלפנים/מאחור) × 4 דמויות.
    בנוי לפי מיקום כפות הרגליים (ולא זוויות): כף הרגל שעל הקרקע זזה אחורה בקצב קבוע לגמרי ביחס לירך,
    וכף הרגל שבאוויר מתקדמת בקשת. הברך מחושבת (קינמטיקה הפוכה, שני מקטעים), וגובה הירך נובע מאורך הרגל –
    כך מתקבלת עלייה-וירידה טבעית. באפליקציה התמונה נבחרת לפי המרחק שהדמות עברה, כך שכף הרגל שעל הקרקע
    נשארת נעוצה במקום – בלי החלקה. בצבע הדיו של הדמויות שבציור, קצוות רכים (מצויר ×8 ומוקטן)."""
    import math
    from PIL import ImageDraw, ImageFilter
    S = 8
    Hmax = max(v[0] for v in WALK_VARIANTS)
    TW, TH = round(Hmax * 0.7), round(Hmax * 1.12)
    col = ink + (255,)
    wrap = lambda x: x - math.floor(x)

    def seg(d, a, b, wa, wb):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        d.polygon([(a[0] + nx * wa / 2, a[1] + ny * wa / 2), (b[0] + nx * wb / 2, b[1] + ny * wb / 2),
                   (b[0] - nx * wb / 2, b[1] - ny * wb / 2), (a[0] - nx * wa / 2, a[1] - ny * wa / 2)], fill=col)
        for c, r in ((a, wa / 2), (b, wb / 2)):
            d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=col)

    def foot(q, A, lift_h):
        """מיקום כף רגל בשלב q: (היסט קדימה ביחס לירך, הרמה). q<0.5 – על הקרקע, זזה אחורה בקצב קבוע"""
        if q < 0.5:
            return A - 2 * A * (q / 0.5), 0.0
        u = (q - 0.5) / 0.5
        return -A + 2 * A * (1 - math.cos(math.pi * u)) / 2, lift_h * math.sin(math.pi * u)

    def knee_ik(H, Ap, Lt, Ls, fwd):
        dx, dy = Ap[0] - H[0], Ap[1] - H[1]
        d = min(math.hypot(dx, dy), (Lt + Ls) * 0.999)
        th = math.atan2(dy, dx)
        al = math.acos(max(-1, min(1, (Lt * Lt + d * d - Ls * Ls) / (2 * Lt * d))))
        a = th - al * fwd  # הברך קדימה
        return (H[0] + Lt * math.cos(a), H[1] + Lt * math.sin(a))

    sheet = Image.new('RGBA', (TW * (WALK_FRAMES + WALK_IDLE), TH * len(WALK_VARIANTS) * 3), (0, 0, 0, 0))
    for v, (H, wf, bag, coat, extra) in enumerate(WALK_VARIANTS):
        Hs = H * S
        head, Lt, Ls, foot_l = 0.135 * Hs, 0.255 * Hs, 0.235 * Hs, 0.085 * Hs
        L = Lt + Ls
        A, lift_h = WALK_A * Hs, 0.055 * Hs
        torso_len = 0.295 * Hs                                   # מהירך לכתפיים
        wt, wsn, wua, wfa = 0.075 * Hs * wf, 0.052 * Hs * wf, 0.05 * Hs * wf, 0.04 * Hs * wf
        sw, hw = 0.15 * Hs * wf, 0.125 * Hs * wf
        gy = TH * WALK_FOOT * S                                  # הקרקע
        cx = TW * S / 2
        for view in (0, 1, 2):
            for f in range(WALK_FRAMES + WALK_IDLE):
                idle = f - WALK_FRAMES                                          # ≥0: תמונת עמידה
                if idle < 0:
                    ph = f / WALK_FRAMES
                    feet = [foot(wrap(ph + 0.5 * k), A, lift_h) for k in (0, 1)]
                    fx_st = feet[0][0] if wrap(ph) < 0.5 else feet[1][0]       # הרגל שעל הקרקע
                    tl, sx = torso_len, 0.0
                else:
                    # עמידה: שתי הרגליים על הקרקע, צמודות; נשימה = הכתפיים עולות מעט; העברת משקל = הירכיים זזות הצידה
                    ph = 0.25
                    feet = [(-0.04 * A, 0.0), (0.04 * A, 0.0)]
                    fx_st = 0.0
                    tl = torso_len * (1.03 if idle == 1 else 1.0)
                    sx = {2: -0.014, 3: 0.014}.get(idle, 0.0) * Hs
                ag = wsn * 0.4                                                  # הקרסול מעט מעל הקרקע
                hipH = math.sqrt((L * 0.992) ** 2 - fx_st ** 2) + ag           # גובה הירך: רגל העמידה כמעט ישרה
                big = Image.new('RGBA', (TW * S, TH * S), (0, 0, 0, 0))
                d = ImageDraw.Draw(big)
                if view == 0:
                    lean = 5                                                # נטייה קדימה (לכיוון ההליכה)
                    if idle >= 0:
                        lean = 1.5                                          # בעמידה – כמעט זקוף
                    hip = (cx + sx * 0.5, gy - hipH)
                    a_l = math.radians(180 - lean)                          # 180 = למעלה; פחות = מעט קדימה (ימינה, לכיוון ההליכה)
                    sh = (hip[0] + math.sin(a_l) * tl, hip[1] + math.cos(a_l) * tl)
                    parts = []
                    for k in (0, 1):
                        fx, lf = feet[k]
                        ank = (cx + fx, gy - lf - ag)
                        kn = knee_ik(hip, ank, Lt, Ls, 1)
                        ta = 0 if idle >= 0 else math.radians(22 * math.sin(math.pi * max(0.0, (wrap(ph + 0.5 * k) - 0.5) / 0.5)))  # בוהן מעט כלפי מטה באוויר
                        toe = (ank[0] + math.cos(ta) * foot_l, ank[1] + math.sin(ta) * foot_l)
                        armA = math.radians(-24 * fx / A)                          # יד הפוכה לרגל באותו צד
                        el = (sh[0] + math.sin(armA) * 0.17 * Hs, sh[1] + math.cos(armA) * 0.17 * Hs)
                        fa = armA + math.radians(18 + 14 * max(0.0, -fx / A))
                        hand = (el[0] + math.sin(fa) * 0.15 * Hs, el[1] + math.cos(fa) * 0.15 * Hs)
                        parts.append((kn, ank, toe, el, hand))

                    def draw_side(k):
                        kn, ank, toe, el, hand = parts[k]
                        seg(d, hip, kn, wt, wsn * 1.08); seg(d, kn, ank, wsn * 1.08, wsn * 0.8); seg(d, ank, toe, wsn * 0.95, wsn * 0.6)

                    def draw_arm(k):
                        kn, ank, toe, el, hand = parts[k]
                        seg(d, sh, el, wua, wfa); seg(d, el, hand, wfa, wfa * 0.85)

                    draw_arm(1); draw_side(1)
                    if coat:
                        bot = (hip[0], hip[1] + 0.13 * Hs)
                        d.polygon([(sh[0] - sw / 2, sh[1]), (sh[0] + sw / 2, sh[1]), (bot[0] + hw * 0.8, bot[1]), (bot[0] - hw * 0.8, bot[1])], fill=col)
                    d.polygon([(sh[0] - sw / 2, sh[1] + 0.01 * Hs), (sh[0] + sw / 2, sh[1] + 0.01 * Hs), (hip[0] + hw / 2, hip[1]), (hip[0] - hw / 2, hip[1])], fill=col)
                    d.ellipse([sh[0] - sw / 2, sh[1] - 0.02 * Hs, sh[0] + sw / 2, sh[1] + 0.06 * Hs], fill=col)
                    if bag:
                        d.rounded_rectangle([sh[0] - sw / 2 - 0.07 * Hs, sh[1] + 0.04 * Hs, sh[0] - sw / 2 + 0.03 * Hs, sh[1] + 0.21 * Hs], radius=0.025 * Hs, fill=col)
                    neck = (sh[0] + math.sin(a_l) * 0.035 * Hs, sh[1] + math.cos(a_l) * 0.035 * Hs)
                    seg(d, sh, neck, 0.055 * Hs, 0.05 * Hs)
                    hc = (neck[0] + math.sin(a_l) * head * 0.5, neck[1] + math.cos(a_l) * head * 0.5)
                    d.ellipse([hc[0] - head / 2, hc[1] - head * 0.55, hc[0] + head / 2, hc[1] + head * 0.5], fill=col)
                    if extra == 'hat':
                        d.ellipse([hc[0] - head * 0.95, hc[1] - head * 0.42, hc[0] + head * 1.05, hc[1] - head * 0.22], fill=col)
                        d.ellipse([hc[0] - head * 0.45, hc[1] - head * 0.78, hc[0] + head * 0.5, hc[1] - head * 0.25], fill=col)
                    if extra == 'cap':
                        d.ellipse([hc[0] - head * 0.55, hc[1] - head * 0.7, hc[0] + head * 0.55, hc[1] - head * 0.05], fill=col)
                        d.ellipse([hc[0] + head * 0.1, hc[1] - head * 0.32, hc[0] + head * 0.95, hc[1] - head * 0.12], fill=col)  # מצחייה קדימה
                    if extra == 'pony':
                        swing = 0.04 * Hs * math.sin(2 * math.pi * ph * 2)  # מתנדנד קצת בהליכה
                        d.ellipse([hc[0] - head * 1.0 - swing * 0.3, hc[1] - head * 0.15, hc[0] - head * 0.25, hc[1] + head * 0.55], fill=col)
                        d.ellipse([hc[0] - head * 0.75, hc[1] - head * 0.45, hc[0] - head * 0.15, hc[1] + head * 0.05], fill=col)
                    draw_side(0); draw_arm(0)
                    if extra == 'balloon':
                        hand0 = parts[0][4]
                        bc = (hc[0] + 0.21 * Hs + 0.25 * (hand0[0] - sh[0]) * 0.3, hc[1] - 0.02 * Hs)
                        d.line([hand0, (bc[0], bc[1] + 0.085 * Hs)], fill=col, width=max(1, round(0.012 * Hs)))
                        d.ellipse([bc[0] - 0.075 * Hs, bc[1] - 0.09 * Hs, bc[0] + 0.075 * Hs, bc[1] + 0.09 * Hs], fill=BALLOON + (255,))
                        d.polygon([(bc[0] - 0.015 * Hs, bc[1] + 0.098 * Hs), (bc[0] + 0.015 * Hs, bc[1] + 0.098 * Hs), (bc[0], bc[1] + 0.082 * Hs)], fill=BALLOON + (255,))
                else:
                    # מלפנים (1, הולך לכיוון המסך – למטה) / מאחור (2, הולך למעלה): "קדימה" = למטה/למעלה על המסך, מקוצר בפרספקטיבה
                    fsign = 1 if view == 1 else -1
                    sway = 0.012 * Hs * math.sin(2 * math.pi * ph) if idle < 0 else sx
                    hip = (cx + sway, gy - hipH)
                    sh = (cx + sway * 0.6, hip[1] - tl)
                    for k in (0, 1):
                        fx, lf = feet[k]
                        side = -1 if k == 0 else 1
                        hx = hip[0] + side * 0.045 * Hs
                        ank = (hx, gy + fsign * fx * WALK_KF - lf - ag)
                        mid = ((hx + ank[0]) / 2 + side * 0.01 * Hs, (hip[1] + ank[1]) / 2)
                        seg(d, (hx, hip[1]), mid, wt, wsn * 1.08)
                        seg(d, mid, ank, wsn * 1.08, wsn * 0.8)
                        d.ellipse([ank[0] - wsn * 0.6, ank[1] - wsn * 0.3, ank[0] + wsn * 0.6, ank[1] + wsn * 0.5], fill=col)
                        # ידיים בצדי הגוף, מעט החוצה (רווח קטן מהגוף), מתנדנדות קדימה-אחורה = מתקצרות/מתארכות מעט
                        armV = math.cos(math.radians(24 * fx / A))
                        s0 = (sh[0] + side * (sw / 2 + wua * 0.15), sh[1] + 0.03 * Hs)
                        el = (s0[0] + side * 0.028 * Hs, s0[1] + 0.165 * Hs * armV)
                        hand = (el[0] + side * 0.012 * Hs, el[1] + 0.145 * Hs * armV)
                        seg(d, s0, el, wua * 0.92, wfa)
                        seg(d, el, hand, wfa, wfa * 0.8)
                        d.ellipse([hand[0] - wfa * 0.62, hand[1] - wfa * 0.5, hand[0] + wfa * 0.62, hand[1] + wfa * 0.7], fill=col)  # כף יד
                        if extra == 'balloon' and side == 1:
                            bhand = hand
                    if coat:
                        d.polygon([(sh[0] - sw / 2, sh[1]), (sh[0] + sw / 2, sh[1]), (hip[0] + hw * 0.85, hip[1] + 0.13 * Hs), (hip[0] - hw * 0.85, hip[1] + 0.13 * Hs)], fill=col)
                    d.polygon([(sh[0] - sw / 2, sh[1] + 0.01 * Hs), (sh[0] + sw / 2, sh[1] + 0.01 * Hs), (hip[0] + hw * 0.6, hip[1]), (hip[0] - hw * 0.6, hip[1])], fill=col)
                    d.ellipse([sh[0] - sw / 2, sh[1] - 0.02 * Hs, sh[0] + sw / 2, sh[1] + 0.06 * Hs], fill=col)
                    seg(d, sh, (sh[0], sh[1] - 0.035 * Hs), 0.055 * Hs, 0.05 * Hs)
                    hc = (sh[0], sh[1] - 0.035 * Hs - head * 0.5)
                    d.ellipse([hc[0] - head / 2, hc[1] - head * 0.55, hc[0] + head / 2, hc[1] + head * 0.5], fill=col)
                    if extra == 'hat':
                        d.ellipse([hc[0] - head * 1.0, hc[1] - head * 0.42, hc[0] + head * 1.0, hc[1] - head * 0.2], fill=col)
                        d.ellipse([hc[0] - head * 0.48, hc[1] - head * 0.8, hc[0] + head * 0.48, hc[1] - head * 0.25], fill=col)
                    if extra == 'cap':
                        d.ellipse([hc[0] - head * 0.58, hc[1] - head * 0.72, hc[0] + head * 0.58, hc[1] - head * 0.02], fill=col)
                        if view == 1:
                            d.ellipse([hc[0] - head * 0.5, hc[1] - head * 0.2, hc[0] + head * 0.5, hc[1] + head * 0.05], fill=col)  # מצחייה מלפנים
                    if extra == 'balloon':
                        bc = (hc[0] + 0.24 * Hs, hc[1] - 0.02 * Hs)
                        d.line([bhand, (bc[0], bc[1] + 0.085 * Hs)], fill=col, width=max(1, round(0.012 * Hs)))
                        d.ellipse([bc[0] - 0.075 * Hs, bc[1] - 0.09 * Hs, bc[0] + 0.075 * Hs, bc[1] + 0.09 * Hs], fill=BALLOON + (255,))
                    if extra == 'pony' and view == 2:  # מאחור רואים את הקוקו יורד
                        d.ellipse([hc[0] - head * 0.22, hc[1] + head * 0.2, hc[0] + head * 0.22, hc[1] + head * 0.95], fill=col)
                    if extra == 'pony':
                        d.ellipse([hc[0] - head * 0.58, hc[1] - head * 0.5, hc[0] + head * 0.58, hc[1] + head * 0.35], fill=col)
                img = big.filter(ImageFilter.GaussianBlur(S * 0.28)).resize((TW, TH), Image.LANCZOS)
                sheet.alpha_composite(img, (f * TW, (3 * v + view) * TH))
    sheet.save(CACHE / 'walk0.webp', 'WEBP', lossless=True)


SMOKER_H = 58          # גובה הדמות (עומדת) – בפיקסלים של המפה
SMOKER_FRAMES = 9      # היד: 0 = על הברך, 8 = הסיגריה בפה
SMOKER_AT = (35.78, 83.3)  # בתוך גוש ירוק כהה בדרום הקמפינג, ליד אוהל (אחוזים במפה) – נקודת הקרקע מתחת לכיסא


def make_smoker(ink):
    """דמות יושבת על כיסא קמפינג ומעשנת (מבט מהצד, פונה ימינה). 9 תמונות של תנועת היד מהברך אל הפה.
    מחזיר את מיקומי קצה הסיגריה בכל תמונה ואת מיקום הפה – לעשן שעולה (ב-JS)."""
    import math
    from PIL import ImageDraw, ImageFilter
    S, H = 8, SMOKER_H
    Hs = H * S
    TW, TH = round(H * 0.62), round(H * 0.82)
    gy = TH * 0.95 * S
    cx = TW * 0.42 * S
    col = ink + (255,)
    chair = (40, 58, 64, 255)
    cig, ember = (238, 232, 214, 255), (255, 118, 40, 255)

    def seg(d, a, b, wa, wb, c=col):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        d.polygon([(a[0] + nx * wa / 2, a[1] + ny * wa / 2), (b[0] + nx * wb / 2, b[1] + ny * wb / 2),
                   (b[0] - nx * wb / 2, b[1] - ny * wb / 2), (a[0] - nx * wa / 2, a[1] - ny * wa / 2)], fill=c)
        for q, r in ((a, wa / 2), (b, wb / 2)):
            d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=c)

    lerp = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    sheet = Image.new('RGBA', (TW * SMOKER_FRAMES, TH), (0, 0, 0, 0))
    tips = []
    for f in range(SMOKER_FRAMES):
        a = f / (SMOKER_FRAMES - 1)
        e = (1 - math.cos(math.pi * a)) / 2                       # תנועה רכה
        big = Image.new('RGBA', (TW * S, TH * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        seat_y = gy - 0.25 * Hs
        # כיסא קמפינג: רגליים מוצלבות, מושב, משענת
        seg(d, (cx - 0.12 * Hs, gy), (cx + 0.1 * Hs, seat_y), 0.018 * Hs, 0.018 * Hs, chair)
        seg(d, (cx + 0.1 * Hs, gy), (cx - 0.12 * Hs, seat_y), 0.018 * Hs, 0.018 * Hs, chair)
        seg(d, (cx - 0.14 * Hs, seat_y), (cx + 0.12 * Hs, seat_y), 0.03 * Hs, 0.03 * Hs, chair)
        seg(d, (cx - 0.14 * Hs, seat_y), (cx - 0.19 * Hs, seat_y - 0.26 * Hs), 0.028 * Hs, 0.028 * Hs, chair)
        # הדמות
        hip = (cx - 0.07 * Hs, seat_y - 0.03 * Hs)
        knee = (cx + 0.16 * Hs, seat_y - 0.045 * Hs)
        ank = (cx + 0.19 * Hs, gy - 0.02 * Hs)
        lean = math.radians(180 + 8 - 3 * e)                      # נשען מעט אחורה; מתקרב קצת קדימה כשמעשן
        sh = (hip[0] + math.sin(lean) * 0.3 * Hs, hip[1] + math.cos(lean) * 0.3 * Hs)
        hc = (sh[0] + math.sin(lean) * 0.1 * Hs + 0.01 * Hs, sh[1] + math.cos(lean) * 0.1 * Hs)
        seg(d, sh, hip, 0.15 * Hs, 0.13 * Hs)                     # גוף
        d.ellipse([sh[0] - 0.075 * Hs, sh[1] - 0.025 * Hs, sh[0] + 0.075 * Hs, sh[1] + 0.06 * Hs], fill=col)
        seg(d, hip, knee, 0.08 * Hs, 0.06 * Hs)                   # ירך
        seg(d, knee, ank, 0.06 * Hs, 0.045 * Hs)                  # שוק
        seg(d, ank, (ank[0] + 0.08 * Hs, ank[1] + 0.005 * Hs), 0.045 * Hs, 0.03 * Hs)
        seg(d, sh, (sh[0] + 0.01 * Hs, sh[1] - 0.035 * Hs), 0.055 * Hs, 0.05 * Hs)  # צוואר
        d.ellipse([hc[0] - 0.068 * Hs, hc[1] - 0.075 * Hs, hc[0] + 0.068 * Hs, hc[1] + 0.068 * Hs], fill=col)
        mouth = (hc[0] + 0.07 * Hs, hc[1] + 0.03 * Hs)
        # יד המעשנת: מהברך אל הפה
        el = lerp((sh[0] + 0.07 * Hs, sh[1] + 0.17 * Hs), (sh[0] + 0.13 * Hs, sh[1] + 0.1 * Hs), e)
        hand = lerp((knee[0] - 0.03 * Hs, knee[1] - 0.04 * Hs), (mouth[0] + 0.005 * Hs, mouth[1] + 0.01 * Hs), e)
        seg(d, sh, el, 0.05 * Hs, 0.04 * Hs)
        seg(d, el, hand, 0.04 * Hs, 0.035 * Hs)
        # סיגריה (קדימה מהיד) וגחלת בקצה
        ang = math.radians(-8 - 25 * e)
        tip = (hand[0] + math.cos(ang) * 0.065 * Hs, hand[1] + math.sin(ang) * 0.065 * Hs)
        seg(d, hand, tip, 0.016 * Hs, 0.016 * Hs, cig)
        d.ellipse([tip[0] - 0.012 * Hs, tip[1] - 0.012 * Hs, tip[0] + 0.012 * Hs, tip[1] + 0.012 * Hs], fill=ember)
        img = big.filter(ImageFilter.GaussianBlur(S * 0.25)).resize((TW, TH), Image.LANCZOS)
        sheet.alpha_composite(img, (f * TW, 0))
        tips.append([round(tip[0] / S, 1), round(tip[1] / S, 1)])
    sheet.save(CACHE / 'smoker0.webp', 'WEBP', lossless=True)
    return {'w': TW, 'h': TH, 'frames': SMOKER_FRAMES, 'tips': tips, 'mouth': [round(mouth[0] / S, 1), round(mouth[1] / S, 1)],
            'foot': 0.95, 'cx': 0.42, 'at': SMOKER_AT}


def icon_image(s, full_bleed=False):
    """אייקון: כוכב ✦ קורל על רקע כחול-כהה. full_bleed = רקע מלא (לאייקון maskable)."""
    import math
    from PIL import ImageDraw
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if full_bleed:
        d.rectangle([0, 0, s, s], fill=INK + (255,))
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=INK + (255,))
    c = s / 2
    k = 0.30 if full_bleed else 0.365
    pts = []
    for i in range(8):
        r = s * (k if i % 2 == 0 else k * 0.26)
        a = math.pi / 4 * i - math.pi / 2
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, fill=(244, 111, 106, 255))
    return im


def cloud_config():
    """הגדרות Firebase (ציבוריות מטבען). אפשר להחליף קובץ בבדיקות: CLOUD_CONFIG=path"""
    import os
    path = Path(os.environ.get('CLOUD_CONFIG') or (ROOT / 'cloud-config.json'))
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def write_pwa(docs, html):
    """קבצי ההתקנה והעבודה בלי קליטה ל-GitHub Pages"""
    import hashlib
    version = hashlib.sha256(html.encode('utf-8')).hexdigest()[:12]
    sw = (SRC / 'sw.js').read_text(encoding='utf-8').replace('__VERSION__', version)
    # מנוע הגיבוי לענן נכנס גם ל-SW (בשביל Background Sync כשהאפליקציה סגורה)
    sw = ('const FIREBASE_CFG = ' + json.dumps(cloud_config()) + ';\n'
          + (SRC / 'cloud-core.js').read_text(encoding='utf-8') + '\n' + sw)
    (docs / 'sw.js').write_text(sw, encoding='utf-8')
    for s in (192, 512):
        icon_image(s, full_bleed=True).save(docs / f'icon-{s}.png', optimize=True)
    manifest = {
        'name': 'הלוז שלי · אינדינגב 2026',
        'short_name': 'הלוז שלי',
        'description': 'לוז אישי, מפה וניווט לאינדינגב 2026 – עובד גם בלי קליטה',
        'lang': 'he', 'dir': 'rtl',
        'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': '#f6ead2', 'theme_color': '#f6ead2',
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any maskable'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'},
        ],
    }
    (docs / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return version


def fonts_css():
    ranges = {
        'hebrew': 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F',
        'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
        'latin': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    }
    css = []
    for sub, rng in ranges.items():
        b64 = base64.b64encode((VENDOR / f'rubik-{sub}.woff2').read_bytes()).decode()
        css.append(
            "@font-face{font-family:'Rubik';font-style:normal;font-weight:400 900;font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{rng};}}"
        )
    return '\n'.join(css)


def main():
    assets = build_assets()
    icon = assets.pop('icon')
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    app_js = '\n\n'.join(f'/* ── {f} ── */\n' + (SRC / f).read_text(encoding='utf-8') for f in APP_FILES)
    vendor_js = '\n'.join((VENDOR / f).read_text(encoding='utf-8') for f in VENDOR_FILES)
    parts = {
        '{{ICON}}': icon,
        '{{FONTS}}': fonts_css(),
        '{{STYLES}}': (SRC / 'styles.css').read_text(encoding='utf-8'),
        '{{ASSETS}}': 'const ASSETS = ' + json.dumps(assets) + ';',
        '{{VENDOR}}': vendor_js,
        '{{APP}}': 'const FIREBASE_CFG = ' + json.dumps(cloud_config()) + ';\n'
                   + 'const BUILD_ID = ' + json.dumps(__import__('datetime').datetime.now().strftime('%d.%m %H:%M')) + ';\n' + app_js,
    }
    for k, v in parts.items():
        html = html.replace(k, v)
    DIST.mkdir(exist_ok=True)
    out = DIST / 'indienegev.html'
    out.write_text(html, encoding='utf-8')
    # עותק ל-GitHub Pages
    docs = PROJECT / 'docs'
    docs.mkdir(exist_ok=True)
    (docs / 'index.html').write_text(html, encoding='utf-8')
    (docs / '.nojekyll').write_text('', encoding='utf-8')
    version = write_pwa(docs, html)
    print(f'{out}  ({out.stat().st_size / 1024:.0f} KB)  sw {version}')


if __name__ == '__main__':
    main()
