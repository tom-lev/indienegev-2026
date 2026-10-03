"""בונה קובץ HTML יחיד ועצמאי: app/dist/indienegev.html

הרצה:  python app/build.py
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
SRC = ROOT / 'src'
VENDOR = ROOT / 'vendor'
CACHE = ROOT / 'assets'
DIST = ROOT / 'dist'
SITE = PROJECT / 'אינדינגב 2026 · 15-17 באוקטובר, מצפה גבולות_files'

# סדר קבצי ה-JS חשוב: data → core → ui → מסכים → main
APP_FILES = ['data.js', 'core.js', 'ui.js', 'grid.js', 'mine.js', 'sheet.js', 'search.js',
             'map.js', 'now.js', 'share.js', 'friends.js', 'main.js']
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

    def make_icon():
        # אייקון: כוכב ✦ קורל על רקע כחול-כהה
        from PIL import ImageDraw
        s = 192
        im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=42, fill=INK + (255,))
        c = s / 2
        pts = []
        import math
        for i in range(8):
            r = 70 if i % 2 == 0 else 18
            a = math.pi / 4 * i - math.pi / 2
            pts.append((c + r * math.cos(a), c + r * math.sin(a)))
        d.polygon(pts, fill=(244, 111, 106, 255))
        return png(im)

    cached('map.webp', make_map, 'image/webp')
    cached('wordmark.png', make_wordmark, 'image/png')
    cached('butterfly.webp', make_butterfly, 'image/webp')
    cached('flower.webp', make_flower, 'image/webp')
    cached('icon.png', make_icon, 'image/png')
    with Image.open(CACHE / 'map.webp') as m:
        out['mapW'], out['mapH'] = m.size
    return out


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
        '{{APP}}': app_js,
    }
    for k, v in parts.items():
        html = html.replace(k, v)
    DIST.mkdir(exist_ok=True)
    out = DIST / 'indienegev.html'
    out.write_text(html, encoding='utf-8')
    print(f'{out}  ({out.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
