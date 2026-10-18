"""把 track.json 按 0.25 秒一行打印出来：鼠标速度、蓝格数量、亮格数量，用来人工核对分段。"""
import json, math
import videolib as V

d = json.loads((V.ROOT / 'reference' / 'track.json').read_text(encoding='utf-8'))
F = d['frames']
fps = d['fps']
step = 15
for k in range(0, len(F) - step, step):
    a, b = F[k], F[k + step]
    sp = '   -'
    if a['cursor'] and b['cursor']:
        sp = '%4.0f' % (math.dist(a['cursor'], b['cursor']) * fps / step)
    print('%5.2fs f=%4d 速度=%s px/s 蓝格=%5d 亮格=%5d 鼠标=%s' % (k / fps, k, sp, a['blue_cells'], a['lit_cells'], a['cursor']))
