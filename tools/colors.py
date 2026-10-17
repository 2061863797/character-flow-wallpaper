"""颜色对照：同一次点击（视频第 1148 帧，(1272,706)）前后，视频和壁纸各取同样的帧，统计
背景色、灰字颜色、蓝圈字颜色的分布（按字符格取笔画最亮处，避免字边缘抗锯齿的影响）。

用法：python tools/colors.py [--set 参数=值 ...]
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
a = ap.parse_args()

CLICK_F, CX, CY = 1148, 1272, 706
# 灰字：点击前 1 秒（没有圈）；蓝字：点击后 0.25～1.0 秒（圈最蓝的时候）
GRAY_F = list(range(CLICK_F - 60, CLICK_F, 6))
BLUE_F = list(range(CLICK_F + 15, CLICK_F + 60, 3))
ui_c = V.ui_cell_mask()


def collect(frames):
    bgpix, grays, blues = [], [], []
    for f, img in frames:
        c = V.cells(img)
        flat = img[::4, ::4].reshape(-1, 3)
        bgpix.append(flat[flat.max(1) < 30])
        c = c[~ui_c]
        b = c[..., 2] - c[..., 0]
        lit = c.max(-1) > 30
        if f < CLICK_F:
            grays.append(c[lit & (np.abs(b) < 6)])
        else:
            blues.append(c[lit & (b > 25)])
    bg = np.concatenate(bgpix)
    vals, cnt = np.unique(bg, axis=0, return_counts=True)
    return vals[cnt.argmax()], np.concatenate(grays), np.concatenate(blues)


want = set(GRAY_F + BLUE_F)
vid = collect((f, img) for f, img in V.frames(start=min(want), stop=max(want) + 1) if f in want)


def ours_frames():
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        pg.evaluate('CONFIG.fps = 0')
        for kv in a.set:
            k, v = kv.split('=')
            pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}; buildAtlas()')
        start = 120                      # 先跑 2 秒，烟铺开
        pg.mouse.move(CX, CY)
        for i in range(start + 60 + max(BLUE_F) - CLICK_F + 1):
            f = CLICK_F - 60 + (i - start)
            if f == CLICK_F:
                pg.mouse.down(); pg.mouse.up()
            pg.evaluate('__step(1)')
            if f in want:
                img = cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1]
                yield f, img
        b.close()


ours = collect(ours_frames())


def row(name, v, o):
    pv = np.percentile(v, (50, 90, 99), axis=0).astype(int)
    po = np.percentile(o, (50, 90, 99), axis=0).astype(int)
    print(f'{name}  格数 视频 {len(v):6d} / 壁纸 {len(o):6d}')
    for q, x, y in zip(('p50', 'p90', 'p99'), pv, po):
        print(f'    {q}  视频 {x.tolist()}   壁纸 {y.tolist()}')


print('背景色  视频', vid[0].tolist(), '  壁纸', ours[0].tolist())
row('灰字', vid[1], ours[1])
row('蓝字', vid[2], ours[2])
