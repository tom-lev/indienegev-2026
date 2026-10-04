"""בדיקה: בלי פרוזדורי הכניסה, מתחם ההופעות מנותק לגמרי מהקמפינג (אין חציית גדר)"""
import sys
from collections import deque
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from walkgrid import build, CELL
from PIL import Image

g, (W, H) = build(Path(__file__).resolve().parent.parent / 'festival-map-2026-web-large.jpg')
ng = build.nogate
GH, GW = ng.shape
cell = lambda x, y: (int(y / 100 * H / CELL), int(x / 100 * W / CELL))


def comp(start):
    seen = np.zeros_like(ng); q = deque([start]); seen[start] = True
    while q:
        y, x = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < GH and 0 <= nx < GW and ng[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
    return seen


inside = comp(cell(44.2, 46.0))       # ליד מודיעין
probes = {'camping': (24.0, 52.5), 'camp-south': (44.0, 66.5), 'family': (72, 63), 'checkin': (71.6, 45)}
bad = [k for k, (x, y) in probes.items() if ng[cell(x, y)] and inside[cell(x, y)]]
print('fence leaks:', bad or 'none')
if bad:
    img = np.zeros((GH, GW, 3), np.uint8); img[ng] = (60, 60, 60); img[inside] = (255, 80, 80)
    Image.fromarray(img).resize((GW * 2, GH * 2), Image.NEAREST).save(sys.argv[1] if len(sys.argv) > 1 else 'leak.png')
