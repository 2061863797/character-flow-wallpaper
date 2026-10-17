"""定位每一次点击：鼠标处冒出一小团新的蓝色，而且几帧之前同一位置还没有蓝色。

结果和 track.json 里的鼠标轨迹一起写入 reference/segments.json。
用法：python tools/find_clicks.py
"""
import json
import numpy as np
import videolib as V

track = json.loads((V.ROOT / 'reference' / 'track.json').read_text(encoding='utf-8'))
F = track['frames']
ui_c = V.ui_cell_mask()
yy, xx = np.mgrid[0:V.ROWS, 0:V.COLS]
CX, CY = xx * V.CW + 4, yy * V.CH + 8

LOOKBACK = 6      # 和几帧之前比
R_NEW = 48        # 鼠标周围多大范围内找新蓝色（像素）

maps = []
clicks = []
for i, img in V.frames():
    b = V.blue(V.cells(img)) > 25
    b[ui_c] = False
    maps.append(b)
    cur = F[i]['cursor']
    if cur is None or i < LOOKBACK:
        continue
    disk = np.hypot(CX - cur[0], CY - cur[1]) < R_NEW
    now, before = int(b[disk].sum()), int(maps[i - LOOKBACK][disk].sum())
    # 新冒出来：现在有，几帧前完全没有；而且离上一次点击至少 0.15 秒
    if now >= 2 and before == 0 and (not clicks or i - clicks[-1]['f'] > 9):
        clicks.append({'f': i, 'x': cur[0], 'y': cur[1]})

# 内圈约 0.3 秒后才从鼠标附近长出来，会被误认成又点了一次：同一位置 0.45 秒内的「第二次」去掉
clicks = [c for k, c in enumerate(clicks)
          if not (k and c['f'] - clicks[k - 1]['f'] < 27
                  and abs(c['x'] - clicks[k - 1]['x']) + abs(c['y'] - clicks[k - 1]['y']) < 30)]
# 蓝色要过约 2 帧才看得见，记录的点击帧往前推 2 帧
for c in clicks:
    c['f'] -= 2
# 和前后点击隔多久（秒）：隔得开的点击用来测单个圈，挤在一起的用来测叠加
for k, c in enumerate(clicks):
    c['gap_prev'] = round((c['f'] - clicks[k - 1]['f']) / track['fps'], 2) if k else None
    c['gap_next'] = round((clicks[k + 1]['f'] - c['f']) / track['fps'], 2) if k + 1 < len(clicks) else None
for c in clicks:
    print('click f=%4d t=%6.3fs at (%d, %d)' % (c['f'], c['f'] / track['fps'], c['x'], c['y']))

out = V.ROOT / 'reference' / 'segments.json'
seg = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
seg['fps'] = track['fps']
seg['clicks'] = clicks
# 按 inspect_track.py 打印的速度、蓝格、亮格人工划定的片段（帧号，含头不含尾）
seg['segments'] = {
    'static': [[0, 44]],                                   # 鼠标静止、没有圈、没有雾：纯背景（只有 0.7 秒）
    'static_with_rings': [[150, 1040], [1110, 1334], [1785, 2160]],   # 鼠标静止，但有圈或残雾：测背景时要挖掉圈和雾
    'stroke': [[45, 196]],                                 # 一次短滑动（0.75～2.2 秒）和之后的消散
    'scribble': [[450, 1040], [2160, 2710]],               # 长时间来回划，雾逐渐铺满
    'stack': [[1340, 1900]],                               # 边划边连续点击，圈叠在一起
}
seg['cursor'] = [f['cursor'] for f in F]
out.write_text(json.dumps(seg, ensure_ascii=False), encoding='utf-8')
print(len(clicks), 'clicks saved to', out)
