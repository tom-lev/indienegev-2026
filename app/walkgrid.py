"""רשת הליכה מתוך תמונת המפה: אילו תאים אפשר ללכת בהם.

שטח צהוב (מתחם ההופעות) וירוק (קמפינג) = הליכה. איורים, הגדר הוורודה, הנהר/גדר הכחולה,
עננים ויער = חסום. את הגדר הכחולה אפשר לחצות רק בכניסות האמיתיות (פרוזדורים שנפתחים ידנית).
התוצאה: מפת ביטים קטנה (GW×GH) שמוטמעת בקובץ ומשמשת לחישוב מסלול בדפדפן.
"""
import base64
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

CELL = 8  # פיקסלים (במפה ברוחב 3200) לכל תא

# הגדר הוורודה סביב אזור במת הפיל ובין אזור במת הקוף לצפון (באחוזים)
INNER_FENCES = [
    [(42.0, 21.9), (45.3, 24.4), (46.0, 30.0), (46.0, 36.0), (45.6, 40.7), (47.3, 41.2), (47.3, 42.8)],
    [(47.7, 48.9), (48.1, 50.6), (49.6, 49.7), (48.9, 46.0), (48.8, 42.0), (49.3, 36.0), (49.5, 34.6),
     (52.2, 34.2), (54.5, 34.0), (57.2, 34.0), (59.0, 35.4), (61.0, 37.6), (61.4, 37.9), (62.4, 41.0),
     (63.4, 44.4), (63.6, 47.0), (64.0, 49.8), (63.3, 53.2), (62.4, 57.4), (61.6, 60.2), (60.0, 61.6)],
    [(49.1, 57.6), (48.6, 54.3), (50.4, 53.6), (52.1, 57.9), (53.6, 60.0), (56.5, 61.6), (60.0, 62.3)],
    # סגירת השוליים הדקים בין הגדר הוורודה לגדר החיצונית (זה קצה הציור, לא שביל)
    [(53.6, 60.0), (53.2, 63.0)], [(60.0, 61.6), (60.6, 63.6)],
]


def classify(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    yellow = (r > 215) & (g > 165) & (b < 125) & (r - b > 110)
    green = (g > 150) & (g > r + 15) & (g > b + 25)
    # האזור הוורוד של "צימוד וקליטה" (החץ הגדול) – הליכה; קווים ורודים דקים בתוך המתחם – חסום
    pink = (r > 200) & (g < 170) & (b > 120) & (r - g > 60)
    return yellow, green, pink


def build(map_path, out_w=3200, with_gates=True):
    im = Image.open(map_path).convert('RGB')
    im = im.resize((out_w, round(im.height * out_w / im.width)), Image.LANCZOS)
    W, H = im.size
    a = np.asarray(im)
    yellow, green, pink = classify(a)
    xs = np.arange(W)[None, :] / W * 100
    ys = np.arange(H)[:, None] / H * 100
    big_pink = pink & (xs > 66)           # החץ של צימוד וקליטה
    # אזור הקמפינג המחולק (מערב ודרום): ירוק בהיר = שבילים, ירוק כהה יותר = חלקות לאוהלים – הולכים רק בשבילים.
    # קמפינג משפחות (מזרח) וקמפינג+ (ירוק כהה מאוד) הם שטח פתוח – נשארים עבירים.
    r_, g_ = a[..., 0].astype(int), a[..., 1].astype(int)
    light_path = green & (g_ >= 212) & (r_ >= 125)
    # סגירה מורפולוגית: ממלאת פערים קטנים בשבילים (אייקונים של אוהלים/טיפות שמצוירים עליהם)
    from PIL import ImageFilter
    lp = Image.fromarray((light_path * 255).astype(np.uint8))
    lp = lp.filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.MinFilter(25))
    # ממלאים רק פיקסלים שאינם ירוקים (אייקונים על השביל) – אף פעם לא את החלקות הירוקות עצמן,
    # אחרת הסגירה "מעגלת" את פינות החלקות והמסלול חותך עליהן
    plot_green = green & ~((g_ >= 212) & (r_ >= 125))
    light_path = (np.asarray(lp) > 127) & ~plot_green
    # קמפינג+: מתחת לשביל האלכסוני שיורד מ-(64,70) ל-(50,95)
    plus_zone = (xs > 49) & (ys > 70 + (64 - xs) * 1.786)
    shabbat_zone = ((xs < 13.5) & (ys < 44)) | ((xs < 22) & (ys < 33))  # מתחם שבת, מקלחות, בישול ואדמה – שטח פתוח בלי חלקות
    open_field = green & ((xs > 63) | plus_zone | shabbat_zone)
    camp_ok = light_path | open_field
    walk = yellow | camp_ok | big_pink

    img = Image.fromarray((walk * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    P = lambda x, y: (x / 100 * W, y / 100 * H)

    cor = Image.new('L', img.size, 0)  # מסכת הפרוזדורים בלבד – רק שם מותר לחצות את הנהר
    dc = ImageDraw.Draw(cor)

    def corridor(pts, width_pct=1.4):
        w = width_pct / 100 * W
        for dd in (d, dc):
            dd.line([P(*p) for p in pts], fill=255, width=int(w))
            for p in pts:
                x, y = P(*p)
                dd.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)

    # הגדר הוורודה הפנימית (מקווים שסומנו ידנית, כי בחלקים היא דהויה מאוד בציור)
    for line in INNER_FENCES:
        d.line([P(*p) for p in line], fill=0, width=int(0.45 / 100 * W))
    if not with_gates:
        img_ng = np.asarray(img) > 127
        GH, GW = H // CELL, W // CELL
        return img_ng[:GH * CELL, :GW * CELL].reshape(GH, CELL, GW, CELL).mean(axis=(1, 3)) > 0.8, (W, H)
    # הכניסות האמיתיות: פרוזדור דרך הגדר הכחולה (ודרך שלט הכניסה)
    corridor([(24.5, 44.8), (28.3, 44.8), (30.2, 44.2)], 1.8)  # כניסה מערבית – דרך מרכז השלט (מהשביל שלפניו)
    corridor([(44.0, 66.0), (44.0, 61.0), (43.6, 58.8)])            # כניסה דרומית
    corridor([(70.0, 50.0), (67.0, 55.0), (63.9, 55.9)], 1.6)       # כניסה ראשית (מהחץ הוורוד)
    corridor([(67.0, 55.3), (66.7, 58.0), (64.8, 61.0), (62.8, 64.8)], 0.9)       # ירידה מהכניסה הראשית לקמפינג (מחוץ לגדר)
    corridor([(57.0, 76.0), (59.7, 78.4), (62.5, 80.5)])            # כניסה לקמפינג+
    corridor([(71.6, 43.0), (76.0, 41.5), (82.0, 40.5), (86.5, 38.5)], 1.6)  # צימוד וקליטה ↔ חניה
    walk = np.asarray(img) > 127

    # הקטנה לתאים: תא הליך רק אם רובו הליך (קווים דקים של גדר נשמרים כחסימה)
    GH, GW = H // CELL, W // CELL
    blocks = walk[:GH * CELL, :GW * CELL].reshape(GH, CELL, GW, CELL).mean(axis=(1, 3))
    # הנהר/הגדר הכחולה: תא שיש בו כחול נחסם (גם אם רובו עביר), חוץ מבפרוזדורי הכניסה
    r0, g0, b0 = (a[..., i].astype(int) for i in range(3))
    river = (b0 > 150) & (r0 < 120) & (b0 > g0)
    corm = np.asarray(cor) > 127
    river &= ~corm
    rfrac = river[:GH * CELL, :GW * CELL].reshape(GH, CELL, GW, CELL).mean(axis=(1, 3))
    cfrac = corm[:GH * CELL, :GW * CELL].reshape(GH, CELL, GW, CELL).mean(axis=(1, 3))
    grid = ((blocks > 0.6) & (rfrac < 0.1)) | (cfrac > 0.5)
    return grid, (W, H)


def encode(grid):
    bits = np.packbits(grid.astype(np.uint8).ravel())
    return base64.b64encode(bits.tobytes()).decode()


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    g, size = build(root / 'festival-map-2026-web-large.jpg')
    print(g.shape, g.mean())
    Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * 4, g.shape[0] * 4), Image.NEAREST).save(
        r'C:/Users/tomer/AppData/Local/Temp/claude/c--Users-tomer-Desktop-coding-projects-indienegev/ef2e2a7e-f5b1-4e33-9231-feaa1766c347/scratchpad/walk.png')
