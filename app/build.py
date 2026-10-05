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
        out['person'] = {'frames': WALK_FRAMES, 'rows': len(WALK_VARIANTS) * 3, 'variants': len(WALK_VARIANTS), 'stride': WALK_STRIDE, 'heights': [v[0] for v in WALK_VARIANTS],
                         'w': pm.width // WALK_FRAMES, 'h': pm.height // (len(WALK_VARIANTS) * 3), 'src': 'data:image/webp;base64,' + base64.b64encode((CACHE / 'walk0.webp').read_bytes()).decode()}
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
def _walk_stride():
    """אורך צעד אמיתי ביחס לגובה: כמה הקרסול של רגל העמידה זז אחורה ביחס לירך בחצי מחזור – כך כף הרגל לא מחליקה"""
    import math
    g = lambda x, m, w: math.exp(-((x - m) / w) ** 2)
    def ank(p):
        hip = 6 + 16 * math.cos(2 * math.pi * p)
        knee = 4 + 12 * g(p, 0.12, 0.07) + 55 * g(p, 0.72, 0.12)
        return math.sin(math.radians(hip)) * 0.255 + math.sin(math.radians(hip - knee)) * 0.235
    return ank(0.0) - ank(0.5)


WALK_STRIDE = round(_walk_stride(), 3)
# 4 דמויות: (גובה בפיקסלים של המפה, עובי, תיק על הגב, מעיל ארוך כמו הדמויות שבציור)
WALK_VARIANTS = [(58, 1.00, False, False), (63, 0.88, False, False), (54, 1.05, True, False), (59, 1.0, False, True)]


def make_walk_sheet(sprite, ink):
    """מחזור הליכה מצויר מאפס, 24 תמונות, מבט מהצד (פונה ימינה; מתהפך כשהולכים שמאלה), שורה לכל אחת מ-4 דמויות.
    פרופורציות טבעיות: ראש קטן, גוף צר, ירכיים בחצי הגובה. זוויות המפרקים לפי מחזור הליכה אמיתי:
    ירך מתנדנדת, ברך מתכופפת חזק באמצע התנופה (וקצת בנחיתה), כף רגל מתגלגלת מעקב לבוהן,
    ידיים עם כיפוף מרפק שמתנדנדות הפוך לרגליים, והגוף יורד מעט ברגע ששתי הרגליים על הקרקע.
    בצבע הדיו של הדמויות שבציור, עם קצוות רכים כמו מכחול (מצויר בהגדלה ×8 ומוקטן)."""
    import math
    from PIL import ImageDraw, ImageFilter
    S = 8
    Hmax = max(v[0] for v in WALK_VARIANTS)
    TW, TH = round(Hmax * 0.72), Hmax + 4
    col = ink + (255,)
    g = lambda x, m, w: math.exp(-((x - m) / w) ** 2)
    wrap = lambda x: x - math.floor(x)

    def seg(d, a, b, wa, wb):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        d.polygon([(a[0] + nx * wa / 2, a[1] + ny * wa / 2), (b[0] + nx * wb / 2, b[1] + ny * wb / 2),
                   (b[0] - nx * wb / 2, b[1] - ny * wb / 2), (a[0] - nx * wa / 2, a[1] - ny * wa / 2)], fill=col)
        for c, r in ((a, wa / 2), (b, wb / 2)):
            d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=col)

    def at(o, ang, L):  # נקודה במרחק L מ-o בזווית ang (מעלות מהאנך כלפי מטה, חיובי = קדימה)
        a = math.radians(ang)
        return (o[0] + math.sin(a) * L, o[1] + math.cos(a) * L)

    def leg(p):
        """זוויות רגל בשלב p של המחזור (0 = נחיתת עקב)"""
        hip = 6 + 16 * math.cos(2 * math.pi * p)                                   # ירך: קדימה בנחיתה, אחורה לפני הניתוק
        knee = 4 + 12 * g(p, 0.12, 0.07) + 55 * g(p, 0.72, 0.12)                 # כיפוף ברך
        foot = 8 * g(p, 0.02, 0.05) - 22 * g(p, 0.6, 0.07)                       # עקב → בוהן
        return hip, knee, foot

    sheet = Image.new('RGBA', (TW * WALK_FRAMES, TH * len(WALK_VARIANTS) * 3), (0, 0, 0, 0))  # 3 מבטים לכל דמות
    for v, (H, wf, bag, coat) in enumerate(WALK_VARIANTS):
        Hs = H * S
        head, sh_y, hip_y = 0.135 * Hs, 0.205 * Hs, 0.50 * Hs          # קוטר ראש, גובה כתפיים וירכיים מלמעלה
        Lt, Ls, foot_l = 0.255 * Hs, 0.235 * Hs, 0.085 * Hs
        wt, wsn, wua, wfa = 0.075 * Hs * wf, 0.052 * Hs * wf, 0.05 * Hs * wf, 0.04 * Hs * wf
        sw, hw = 0.15 * Hs * wf, 0.125 * Hs * wf
        for f in range(WALK_FRAMES):
            p = f / WALK_FRAMES
            bob = 0.012 * Hs * (math.cos(4 * math.pi * p))                   # נמוך כששתי הרגליים על הקרקע
            big = Image.new('RGBA', (TW * S, TH * S), (0, 0, 0, 0))
            d = ImageDraw.Draw(big)
            top = (TH - H - 1.5) * S + bob - 0.01 * Hs
            cx = TW * S * 0.5
            lean = 3                                                         # נטייה קלה קדימה
            hipP = (cx, top + hip_y)
            shP = at(hipP, 180 + lean, hip_y - sh_y)
            limbs = {}
            for k in (0, 1):                                                 # 0 = הצד הקרוב, 1 = הרחוק
                ph = wrap(p + 0.5 * k)
                hip, knee, footA = leg(ph)
                kneeP = at(hipP, hip, Lt)
                ank = at(kneeP, hip - knee, Ls)
                toe = at(ank, hip - knee + 90 + footA, foot_l)
                arm = -26 * math.cos(2 * math.pi * ph)                        # יד מתנדנדת הפוך לרגל באותו צד
                elbow = 14 + 22 * max(0.0, math.sin(2 * math.pi * ph + 1.2))
                elP = at(shP, arm, 0.17 * Hs)
                hand = at(elP, arm + elbow, 0.15 * Hs)
                limbs[k] = (kneeP, ank, toe, elP, hand)

            def draw_leg(k):
                kneeP, ank, toe, _, _ = limbs[k]
                seg(d, hipP, kneeP, wt, wsn * 1.08)
                seg(d, kneeP, ank, wsn * 1.08, wsn * 0.8)
                seg(d, ank, toe, wsn * 0.95, wsn * 0.6)

            def draw_arm(k):
                _, _, _, elP, hand = limbs[k]
                seg(d, shP, elP, wua, wfa)
                seg(d, elP, hand, wfa, wfa * 0.85)

            draw_arm(1); draw_leg(1)                                          # הצד הרחוק – מאחור
            # גוף: צר בכתפיים ובמותניים (או מעיל ארוך עד אמצע הירך)
            if coat:
                bot = at(hipP, 0, 0.13 * Hs)
                d.polygon([(shP[0] - sw / 2, shP[1]), (shP[0] + sw / 2, shP[1]), (bot[0] + hw * 0.8, bot[1]), (bot[0] - hw * 0.8, bot[1])], fill=col)
            d.polygon([(shP[0] - sw / 2, shP[1] + 0.01 * Hs), (shP[0] + sw / 2, shP[1] + 0.01 * Hs),
                       (hipP[0] + hw / 2, hipP[1]), (hipP[0] - hw / 2, hipP[1])], fill=col)
            d.ellipse([shP[0] - sw / 2, shP[1] - 0.02 * Hs, shP[0] + sw / 2, shP[1] + 0.06 * Hs], fill=col)  # כתפיים מעוגלות
            if bag:
                b0 = at(shP, 0, 0.04 * Hs)
                d.rounded_rectangle([b0[0] - sw / 2 - 0.07 * Hs, b0[1], b0[0] - sw / 2 + 0.03 * Hs, b0[1] + 0.17 * Hs], radius=0.025 * Hs, fill=col)
            neck = at(shP, 180 + lean, 0.035 * Hs)
            seg(d, shP, neck, 0.055 * Hs, 0.05 * Hs)
            hc = at(neck, 180 + lean, head * 0.5)
            d.ellipse([hc[0] - head / 2, hc[1] - head * 0.55, hc[0] + head / 2, hc[1] + head * 0.5], fill=col)
            draw_leg(0); draw_arm(0)                                          # הצד הקרוב – מלפנים
            img = big.filter(ImageFilter.GaussianBlur(S * 0.28)).resize((TW, TH), Image.LANCZOS)
            sheet.alpha_composite(img, (f * TW, (3 * v) * TH))
            # מבט מלפנים (הולך לכיוון המסך – למטה) ומאחור (הולך למעלה): הרגליים עולות ויורדות במקום להתנדנד הצידה
            for view in (1, 2):
                big = Image.new('RGBA', (TW * S, TH * S), (0, 0, 0, 0))
                d = ImageDraw.Draw(big)
                sway = 0.012 * Hs * math.sin(2 * math.pi * p)                # העברת משקל מרגל לרגל
                hipC = (cx + sway, top + hip_y)
                shC = (cx + sway * 0.6, top + sh_y)
                for k in (0, 1):
                    ph = wrap(p + 0.5 * k)
                    hip, knee, _ = leg(ph)
                    side = -1 if k == 0 else 1
                    hx = hipC[0] + side * 0.045 * Hs
                    kneeY = hipC[1] + Lt * math.cos(math.radians(hip)) * 0.98
                    ankY = kneeY + Ls * math.cos(math.radians(hip - knee))
                    kneeP, ankP = (hx + side * 0.004 * Hs, kneeY), (hx, ankY)
                    seg(d, (hx, hipC[1]), kneeP, wt, wsn * 1.08)
                    seg(d, kneeP, ankP, wsn * 1.08, wsn * 0.8)
                    d.ellipse([ankP[0] - wsn * 0.6, ankP[1] - wsn * 0.35, ankP[0] + wsn * 0.6, ankP[1] + wsn * 0.45], fill=col)  # כף רגל
                    arm = -26 * math.cos(2 * math.pi * ph)
                    elY = shC[1] + 0.17 * Hs * math.cos(math.radians(arm)) * 0.97
                    elP = (shC[0] + side * (sw / 2 + wua * 0.1), elY)
                    seg(d, (shC[0] + side * sw * 0.42, shC[1] + 0.02 * Hs), elP, wua, wfa)
                    seg(d, elP, (elP[0] + side * 0.01 * Hs, elY + 0.15 * Hs * math.cos(math.radians(arm + 20))), wfa, wfa * 0.85)
                if coat:
                    d.polygon([(shC[0] - sw / 2, shC[1]), (shC[0] + sw / 2, shC[1]), (hipC[0] + hw * 0.85, hipC[1] + 0.13 * Hs), (hipC[0] - hw * 0.85, hipC[1] + 0.13 * Hs)], fill=col)
                d.polygon([(shC[0] - sw / 2, shC[1] + 0.01 * Hs), (shC[0] + sw / 2, shC[1] + 0.01 * Hs), (hipC[0] + hw * 0.6, hipC[1]), (hipC[0] - hw * 0.6, hipC[1])], fill=col)
                d.ellipse([shC[0] - sw / 2, shC[1] - 0.02 * Hs, shC[0] + sw / 2, shC[1] + 0.06 * Hs], fill=col)
                if bag and view == 2:  # מאחור רואים את התיק על הגב
                    d.rounded_rectangle([shC[0] - sw * 0.38, shC[1] + 0.03 * Hs, shC[0] + sw * 0.38, shC[1] + 0.21 * Hs], radius=0.03 * Hs, fill=col)
                seg(d, shC, (shC[0], shC[1] - 0.035 * Hs), 0.055 * Hs, 0.05 * Hs)
                hc = (shC[0], shC[1] - 0.035 * Hs - head * 0.5)
                d.ellipse([hc[0] - head / 2, hc[1] - head * 0.55, hc[0] + head / 2, hc[1] + head * 0.5], fill=col)
                img = big.filter(ImageFilter.GaussianBlur(S * 0.28)).resize((TW, TH), Image.LANCZOS)
                sheet.alpha_composite(img, (f * TW, (3 * v + view) * TH))
    sheet.save(CACHE / 'walk0.webp', 'WEBP', lossless=True)


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
