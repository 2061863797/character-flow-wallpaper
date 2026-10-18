"""背景对照：鼠标静止、没有圈的时候，比较视频和壁纸的
  - 覆盖率：比背景明显亮的格子占多少
  - 换字频率：每秒有多少比例的字换成了别的字（看字形变没变，不看亮度）

视频取 2.75～3.25 秒（第 165～195 帧：鼠标静止，前面那次滑动的雾已经散完，还没点击）。
用法：python tools/bgstats.py [--set 参数=值 ...]
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

F0, F1 = 165, 196
ui = V.ui_mask()
ui_c = V.ui_cell_mask()


def glyph_masks(img):
    """每格的字形：格子里亮于该格最亮值一半的像素（与亮度无关，只看形状）。"""
    g = img.max(-1).astype(np.int16)[:V.ROWS * V.CH, :V.COLS * V.CW]
    cells = g.reshape(V.ROWS, V.CH, V.COLS, V.CW).transpose(0, 2, 1, 3)
    mx = cells.max(axis=(2, 3), keepdims=True)
    return cells > (20 + (mx - 20) * 0.5), mx[..., 0, 0]


def stats(frames):
    frames = list(frames)
    cov, chg = [], []
    for k, (f, img) in enumerate(frames):
        m, mx = glyph_masks(img)
        lit = (mx > 26) & ~ui_c
        cov.append(lit.sum() / (~ui_c).sum())
        if k >= 2:                        # 和 2 帧前（1/30 秒）比
            m0, mx0 = glyph_masks(frames[k - 2][1])
            both = lit & (mx0 > 26)
            inter = (m & m0).sum(axis=(2, 3)); union = (m | m0).sum(axis=(2, 3))
            iou = inter / np.maximum(1, union)
            chg.append(((iou < 0.5) & both).sum() / max(1, both.sum()))
    return {
        '覆盖率%': round(100 * float(np.mean(cov)), 1),
        '每秒换字%': round(100 * float(np.mean(chg)) * 30, 1),
    }


if not a.no_video:
    print('视频', stats(V.frames(start=F0, stop=F1)))


def ours():
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        for kv in a.set:
            k, v = kv.split('=')
            pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
        pg.evaluate('__step(240)')        # 先跑 4 秒，烟量稳定下来（限帧 30，和壁纸默认一样）
        for i in range(F1 - F0):
            pg.evaluate('__step(1)')
            yield F0 + i, cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)[..., ::-1]
        b.close()


print('壁纸', stats(ours()), ' '.join(a.set))
