"""鼠标雾消失快慢：同一条横线来回划 8 趟把雾攒满，然后停住，每 0.5 秒量一次路径上那一条带的亮度（扣掉背景）。

用法：python tools/fogfade.py 4 7 "7,fogSpread=0.2"   （每个参数一组：开头的数字是「消散时间」秒数，后面可跟其它参数；不给就用当前默认值）
"""
import sys
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import URL, FAKE_CLOCK

Y, XA, XB, STEPS = 720, 800, 1760, 15


def band(pg):
    img = cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)
    # 整屏统计（雾会被风往右下吹，只看一条带会把「飘走」误当成「散掉」）；单位：相当于路径那一条带的平均亮度
    return img.max(-1).astype(float).sum() / (80 * (XB - XA - 160))


fades = sys.argv[1:] or [None]
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    for fade in fades:
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        pg.evaluate('CONFIG.smokeAmount = 0.01; __step(240)')
        for kv in filter(None, (fade or '').split(',')):
            k, v = kv.split('=') if '=' in kv else ('fogFade', kv)
            pg.evaluate(f'CONFIG.{k} = {v}')
        base = band(pg)
        pg.mouse.move(XA, Y); pg.evaluate('__step(1)')
        for n in range(8):
            a, z = (XA, XB) if n % 2 == 0 else (XB, XA)
            for s in range(1, STEPS + 1):
                pg.mouse.move(a + (z - a) * s / STEPS, Y); pg.evaluate('__step(1)')
        vals = []
        for k in range(17):
            vals.append(band(pg) - base)
            pg.evaluate('__step(30)')
        peak = vals[0]
        gone = next((k * 0.5 for k, v in enumerate(vals) if v < peak * 0.1), None)
        print(f'消散时间 {fade or "默认"} 秒  停住后每 0.5 秒亮度: ' + ' '.join(f'{v:4.1f}' for v in vals),
              f'  → 约 {gone} 秒后基本看不见' if gone is not None else '  → 8 秒后还看得见')
        pg.close()
    b.close()
