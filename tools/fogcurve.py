"""单次滑动对照：按视频 0.75～2.2 秒那次滑动的轨迹操作壁纸，逐 0.25 秒数「比背景亮的格子」，和视频并排打印。
每组参数打印的是「比滑动前多出来的格子数」，看一次滑动留下多少雾、多久散掉。

用法：python tools/fogcurve.py "hoverStrength=0.3" "hoverStrength=0.4,mouseFill=1.3" ...
      不给参数就用当前默认值跑一组。
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
BASE = 45          # 视频第 45 帧鼠标开始动，以这一刻为「滑动前」


def lit(img_rgb):
    g = V.gray(V.cells(img_rgb))
    return int((g[~ui_c] > 26).sum())


vid = {f: lit(img) for f, img in V.frames(stop=max(SHOTS) + 1) if f in SHOTS}
specs = sys.argv[1:] or ['']
runs = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    for spec in specs:
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        pg.evaluate('__step(240)')                     # 先让背景烟稳定
        for kv in filter(None, spec.split(',')):
            k, v = kv.split('=')
            pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
        res = {}
        for i in range(max(SHOTS) + 1):
            # 视频 196 帧之后开始点击，这里只回放到点击前，之后鼠标不动
            if i < 196 and cur[i]:
                pg.mouse.move(*cur[i])
            pg.evaluate('__step(1)')
            if i in SHOTS:
                res[i] = lit(cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1])
        runs[spec or '默认'] = res
        pg.close()
    b.close()

print('时间    视频 ' + ''.join(f'{k:>24}' for k in runs))
for f in SHOTS:
    print(f'{f / 60:5.2f}s {vid[f] - vid[BASE]:+6d} ' + ''.join(f'{r[f] - r[BASE]:+24d}' for r in runs.values()))
