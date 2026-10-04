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
             'map.js', 'now.js', 'share.js', 'friends.js', 'journal.js', 'tentshare.js', 'cloud-core.js', 'backup.js', 'cloud.js', 'pwa.js', 'main.js']
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
    # רשת הליכה לחישוב מסלולים (נבנית מתמונת המפה)
    from walkgrid import build as build_walk, encode, CELL
    grid, (base_w, _) = build_walk(PROJECT / 'festival-map-2026-web-large.jpg')
    out['walk'] = encode(grid)
    out['walkH'], out['walkW'] = grid.shape
    out['walkCell'], out['walkBase'] = CELL, base_w
    return out


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
        '{{APP}}': 'const FIREBASE_CFG = ' + json.dumps(cloud_config()) + ';\n' + app_js,
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
