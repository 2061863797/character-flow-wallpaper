"""生成 Wallpaper Engine 首页预览图 wallpaper-engine/preview.jpg（正方形 512×512）。

画面：先让背景烟铺开、在中间来回划几趟留一点雾，再按「圆、圆、爱心」的顺序点三下，
在爱心圈最清楚的时候截一张，裁成正方形。会同时存几个候选到 out/preview_*.jpg 方便挑。
用法：python tools/preview.py
"""
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import URL, FAKE_CLOCK

CX, CY = 1280, 720
CLICKS = [(760, 520), (1820, 980), (CX, CY)]     # 第 3 下是爱心
SIDE = 900                                        # 截取的正方形边长（像素），再缩到 512
# 预览图在软件里只按 128×128 显示，原样太暗看不清：只把比背景（20）亮的部分放大 2.2 倍，背景保持原来的深色
LUT = np.clip(20 + (np.arange(256) - 20.0) * 2.2, 0, 255).astype(np.uint8)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
    pg.add_init_script(FAKE_CLOCK)
    pg.goto(URL)
    pg.wait_for_function('typeof frame === "function"')
    pg.evaluate('CONFIG.fps = 0; __step(240)')
    # 在中间附近来回划 6 趟，留一层雾
    for n in range(6):
        a, z = (CX - 450, CX + 450) if n % 2 == 0 else (CX + 450, CX - 450)
        for s in range(1, 16):
            pg.mouse.move(a + (z - a) * s / 15, CY + 120 * np.sin(n + s / 5)); pg.evaluate('__step(1)')
    for (x, y) in CLICKS:
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up()
        pg.evaluate('__step(10)')
    pg.mouse.move(20, 20)                          # 把鼠标挪开
    for k in range(4):                             # 爱心点下后约 0.35、0.5、0.65、0.8 秒
        pg.evaluate('__step(9)')
        img = cv2.imdecode(np.frombuffer(pg.screenshot(), np.uint8), cv2.IMREAD_COLOR)
        crop = img[CY - SIDE // 2:CY + SIDE // 2, CX - SIDE // 2:CX + SIDE // 2]
        small = cv2.LUT(cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA), LUT)
        cv2.imwrite(str(V.ROOT / 'out' / f'preview_{k}.jpg'), small, [cv2.IMWRITE_JPEG_QUALITY, 92])
    b.close()
print('候选已存到 out/preview_0..3.jpg')
