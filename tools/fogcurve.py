"""鼠标雾消散曲线：按视频 0.75～2.2 秒那次滑动的轨迹操作壁纸，逐帧数「比背景亮的格子」，和视频并排打印。

用法：python tools/fogcurve.py [fogFade 值 ...]
"""
import json
import sys
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import FAKE_CLOCK, URL

ui_c = V.ui_cell_mask()
cur = json.loads((V.ROOT / 'reference' / 'segments.json').read_text(encoding='utf-8'))['cursor']
SHOTS = list(range(30, 260, 15))


def lit(img_rgb):
    g = V.gray(V.cells(img_rgb))
    return int((g[~ui_c] > 26).sum())


vid = {f: lit(img) for f, img in V.frames(stop=max(SHOTS) + 1) if f in SHOTS}
runs = {}
fades = [float(v) for v in sys.argv[1:]] or [1.2]
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    for fade in fades:
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        pg.evaluate(f'CONFIG.fps = 0; CONFIG.fogFade = {fade}')
        res = {}
        for i in range(max(SHOTS) + 1):
            # 视频 196 帧之后开始点击，这里只回放到点击前，之后鼠标不动
            if i < 196 and cur[i]:
                pg.mouse.move(*cur[i])
            pg.evaluate('__step(1)')
            if i in SHOTS:
                img = cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1]
                res[i] = lit(img)
        runs[fade] = res
        pg.close()
    b.close()

print('时间    视频  ' + '  '.join(f'fade={f:<4}' for f in fades))
for f in SHOTS:
    print(f'{f / 60:5.2f}s {vid[f]:6d}  ' + '  '.join(f'{runs[k][f]:9d}' for k in fades))
