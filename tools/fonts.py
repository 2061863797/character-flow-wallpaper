"""字体对照：视频第 1210 帧里一行清楚的蓝字，和本机各款等宽字体按同样的格子（8×16）渲染的同一行字比较。
  - 逐个字算形状相似度（归一化相关，1 = 完全一样），取平均
  - 每款字体试几个字号，打印排名；最好的几组放大 4 倍和视频上下排在一起，存成 out/fonts.png

用法：python tools/fonts.py
"""
import base64
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V

TEXT = 'acs3pa0iewyoe9svbajkcooAo2K3cwErvlka'
FONTS = ['Consolas', 'Cascadia Mono', 'Cascadia Code', 'DejaVu Sans Mono', 'Liberation Mono',
         'Ubuntu Mono', 'Miriam Mono CLM', 'Courier New', 'Lucida Console']
SIZES = [10, 11, 12]
X0, Y0 = 1120, 278          # 视频里这行字左上角（格子对齐）

img = next(img for f, img in V.frames(start=1210, stop=1211))
video = img[Y0:Y0 + 16, X0:X0 + 8 * len(TEXT)].max(-1).astype(float)

JS = """([fonts, sizes, text]) => {
  const out = [];
  for (const f of fonts) for (const s of sizes) {
    const c = document.createElement('canvas'); c.width = 8 * text.length; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(20,20,20)'; g.fillRect(0, 0, c.width, c.height);
    g.font = `${s}px "${f}"`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = 'rgb(74,124,164)';
    for (let k = 0; k < text.length; k++) g.fillText(text[k], k * 8 + 4, 8);
    out.push([f, s, c.toDataURL()]);
  }
  return out;
}"""


def glyph_score(a, b):
    """逐个 8×16 格子算归一化相关，再平均。"""
    sc = []
    for k in range(len(TEXT)):
        x = a[:, k * 8:(k + 1) * 8].ravel() - a[:, k * 8:(k + 1) * 8].mean()
        y = b[:, k * 8:(k + 1) * 8].ravel() - b[:, k * 8:(k + 1) * 8].mean()
        sc.append(float(x @ y / (np.linalg.norm(x) * np.linalg.norm(y) + 1e-6)))
    return float(np.mean(sc))


res = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page()
    pg.set_content('<html><body></body></html>')
    for name, size, url in pg.evaluate(JS, [FONTS, SIZES, TEXT]):
        t = cv2.imdecode(np.frombuffer(base64.b64decode(url.split(',')[1]), np.uint8), cv2.IMREAD_COLOR)[..., ::-1]
        # 视频和我们的基线可能差一两个像素：上下左右各挪几格，取最好的对齐
        g = t.max(-1).astype(float)
        best = max((glyph_score(video, np.roll(np.roll(g, dy, 0), dx, 1)), dy, dx)
                   for dy in range(-3, 4) for dx in (-1, 0, 1))
        t = np.roll(np.roll(t, best[1], 0), best[2], 1)
        res.append((best[0], f'{name} (dy{best[1]:+d})', size, t))
    b.close()
res.sort(key=lambda r: -r[0])
for s, name, size, _ in res:
    print(f'{s:.3f}  {name} {size}px')


def label(t, text):
    t = t.astype(float); t = np.clip((t - 20) / max(1, t.max() - 20) * 255, 0, 255).astype(np.uint8)
    if t.ndim == 2: t = np.repeat(t[..., None], 3, -1)
    t = cv2.resize(t, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)
    pad = np.zeros((t.shape[0], 230, 3), np.uint8)
    cv2.putText(pad, text, (6, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    return np.hstack([pad, t])


rows = [label(img[Y0:Y0 + 16, X0:X0 + 8 * len(TEXT)], 'VIDEO')]
cur = next(r for r in res if r[1].startswith('Consolas') and r[2] == 10)
for s, name, size, t in res[:4] + [cur]:
    rows.append(label(t, f'{name} {size}px {s:.2f}'))
sep = np.full((3, rows[0].shape[1], 3), 90, np.uint8)
cv2.imwrite(str(V.ROOT / 'out' / 'fonts.png'), cv2.cvtColor(np.vstack([r for row in rows for r in (row, sep)]), cv2.COLOR_RGB2BGR))
