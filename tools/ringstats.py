"""点击圆环对照：视频第 1148 帧在 (1272,706) 的那次点击，逐时刻量
  - 外沿半径：蓝格到圆心距离的 95% 分位
  - 光带粗细：外圈附近（外沿半径 60% 以外）的蓝格面积 ÷ 周长
用法：python tools/ringstats.py [--set 参数=值 ...] [--no-video]
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

CLICK_F, CX, CY = 1148, 1272, 706
TS = [0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.25, 1.5]
FR = [CLICK_F + round(t * 60) for t in TS]
ui_c = V.ui_cell_mask()
yy, xx = np.mgrid[0:V.ROWS, 0:V.COLS]
DIST = np.hypot(xx * V.CW + 4 - CX, yy * V.CH + 8 - CY)


def measure(img):
    b = V.blue(V.cells(img)) > 25
    b &= ~ui_c
    d = DIST[b]
    if len(d) < 10:
        return 0, 0
    edge = np.percentile(d, 95)
    band = (d > edge * 0.6).sum() * V.CW * V.CH / (2 * np.pi * edge)
    return edge, band


cache = V.ROOT / 'out' / 'ring_video.json'
if cache.exists():
    vid = {int(k): v for k, v in json.loads(cache.read_text()).items()}
else:
    vid = {f: measure(img) for f, img in V.frames(start=min(FR), stop=max(FR) + 1) if f in FR}
    cache.write_text(json.dumps(vid))

ours = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
    pg.add_init_script(FAKE_CLOCK)
    pg.goto(URL)
    pg.wait_for_function('typeof frame === "function"')
    pg.evaluate('CONFIG.fps = 0')
    for kv in a.set:
        k, v = kv.split('=')
        pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
    pg.evaluate('__step(120)')
    pg.mouse.move(CX, CY)
    pg.mouse.down(); pg.mouse.up()
    for f in range(CLICK_F, max(FR) + 1):
        pg.evaluate('__step(1)')
        if f + 1 in FR:
            ours[f + 1] = measure(cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1])
    b.close()

print('秒          ' + ' '.join(f'{t:5.2f}' for t in TS))
print('视频 半径   ' + ' '.join(f'{vid[f][0]:5.0f}' for f in FR))
print('壁纸 半径   ' + ' '.join(f'{ours[f][0]:5.0f}' for f in FR))
print('视频 粗细   ' + ' '.join(f'{vid[f][1]:5.0f}' for f in FR))
print('壁纸 粗细   ' + ' '.join(f'{ours[f][1]:5.0f}' for f in FR), '  ', ' '.join(a.set))
