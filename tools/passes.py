"""同一处来回划的累积效果：鼠标沿同一条横线来回划（每趟 0.25 秒），
每划完 1、2、4、8 趟时，量路径上那一条带的平均亮度和有字比例。理想是：划一趟很淡，越划越亮。

用法：python tools/passes.py "hoverStrength=0.3,mouseFill=1" "..."     不给参数就用当前默认值
"""
import json
import sys
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import URL, FAKE_CLOCK

Y, XA, XB = 720, 800, 1760          # 来回划的横线
STEPS = 15                          # 每趟帧数（0.25 秒）
CHECK = [1, 2, 4, 8]


def band(img):
    g = img[Y - 40:Y + 40, XA + 80:XB - 80].max(-1).astype(float)
    return g.mean(), (g > 30).mean() * 100


specs = sys.argv[1:] or ['']
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    for spec in specs:
        pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
        pg.add_init_script(FAKE_CLOCK)
        pg.goto(URL)
        pg.wait_for_function('typeof frame === "function"')
        pg.evaluate('CONFIG.smokeAmount = 0.01; __step(240)')   # 去掉背景烟，只看鼠标雾
        for kv in filter(None, spec.split(',')):
            k, v = kv.split('=')
            pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
        base = band(cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR))
        pg.mouse.move(XA, Y); pg.evaluate('__step(1)')
        out = []
        for n in range(1, max(CHECK) + 1):
            a, z = (XA, XB) if n % 2 else (XB, XA)
            for s in range(1, STEPS + 1):
                pg.mouse.move(a + (z - a) * s / STEPS, Y)
                pg.evaluate('__step(1)')
            if n in CHECK:
                m, cov = band(cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR))
                out.append(f'{n}趟: 亮度+{m - base[0]:4.1f} 有字{cov:3.0f}%')
        print(f'{spec or "默认":40s}', '  '.join(out))
        pg.close()
    b.close()
