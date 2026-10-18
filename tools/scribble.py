"""鼠标滑动对照：按视频 7.5～17.4 秒（第 450～1045 帧）的鼠标轨迹回放，
每 0.25 秒比较一次整屏覆盖率（比背景明显亮的格子占多少），看雾铺开、变浓、散掉的过程。

用法：python tools/scribble.py [--set 参数=值 ...] [--no-video]
"""
import argparse
import json
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import URL, FAKE_CLOCK

ap = argparse.ArgumentParser()
ap.add_argument('--set', nargs='*', default=[])
ap.add_argument('--no-video', action='store_true')
a = ap.parse_args()

F0, F1 = 450, 1045
SHOTS = list(range(F0, F1, 15))
ui_c = V.ui_cell_mask()
cur = json.loads((V.ROOT / 'reference' / 'segments.json').read_text(encoding='utf-8'))['cursor']


def cover(img):
    g = V.gray(V.cells(img))
    return 100 * float(((g > 26) & ~ui_c).sum()) / (~ui_c).sum()


cache = V.ROOT / 'out' / 'scribble_video.json'
if cache.exists():
    vid = {int(k): v for k, v in json.loads(cache.read_text()).items()}
else:
    vid = {f: cover(img) for f, img in V.frames(start=F0, stop=F1) if f in SHOTS}
    cache.write_text(json.dumps(vid))

ours = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
    pg.add_init_script(FAKE_CLOCK)
    pg.goto(URL)
    pg.wait_for_function('typeof frame === "function"')
    for kv in a.set:
        k, v = kv.split('=')
        pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
    pg.evaluate('__step(240)')
    for f in range(F0, F1):
        if cur[f]:
            pg.mouse.move(*cur[f])
        pg.evaluate('__step(1)')
        if f in SHOTS:
            ours[f] = cover(cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1])
    b.close()

err = []
line_v, line_o = [], []
for f in SHOTS:
    line_v.append(f'{vid[f]:4.0f}'); line_o.append(f'{ours[f]:4.0f}')
    err.append(ours[f] - vid[f])
print('秒   ' + ' '.join(f'{f / 60:4.1f}' for f in SHOTS[::2]))
print('视频 ' + ' '.join(line_v[::2]))
print('壁纸 ' + ' '.join(line_o[::2]))
print(f'平均差 {np.mean(err):+.1f}  平均绝对差 {np.mean(np.abs(err)):.1f}   ', ' '.join(a.set))
