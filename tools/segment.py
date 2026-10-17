"""第 1 步：扫一遍参考视频，逐帧记录鼠标位置和蓝色圆环，存到 reference/track.json。

用法：python tools/segment.py
"""
import json
import numpy as np
import videolib as V

ui = V.ui_mask()
ui_c = V.ui_cell_mask()
out = {'fps': V.fps(), 'frames': []}

for i, img in V.frames():
    # 鼠标指针：白色箭头（三个通道都很亮），字符最亮也只有 164，不会混进来
    white = (img.min(axis=-1) > 200) & ~ui
    ys, xs = np.nonzero(white)
    cur = None
    if len(xs) >= 8:
        # 箭头尖端 = 最上面那一行里最左边的点
        top = ys.min()
        cur = [int(xs[ys <= top + 1].min()), int(top)]
    c = V.cells(img)
    b = V.blue(c)
    b[ui_c] = 0
    g = V.gray(c)
    g[ui_c] = 0
    bc = b > 25
    rec = {
        'f': i,
        'cursor': cur,
        'blue_cells': int(bc.sum()),                       # 蓝格数量
        'lit_cells': int((g > 26).sum()),                  # 比背景明显亮的格子数量
        'mean_gray': round(float(g[~ui_c].mean()), 3),
    }
    if bc.any():
        yy, xx = np.nonzero(bc)
        rec['blue_center'] = [int(xx.mean() * V.CW + 4), int(yy.mean() * V.CH + 8)]
        # 鼠标附近 100 像素内的蓝格：刚点击时圈从鼠标处长出来，用来定位点击时刻
        if cur:
            d = np.hypot(xx * V.CW + 4 - cur[0], yy * V.CH + 8 - cur[1])
            rec['near_blue'] = int((d < 100).sum())
    out['frames'].append(rec)
    if i % 300 == 0:
        print(i, rec)

p = V.ROOT / 'reference' / 'track.json'
p.parent.mkdir(exist_ok=True)
p.write_text(json.dumps(out), encoding='utf-8')
print('saved', p, len(out['frames']), 'frames')
