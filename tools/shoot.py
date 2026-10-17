"""用无头浏览器以 2560×1440 渲染壁纸，按精确时间截图，拼成和 contact.py 同样排版的图，方便和视频并排对照。

时间是"假的"：替换了 performance.now 和 requestAnimationFrame，每次手动推进 1/60 秒，
所以截图时刻和视频帧完全对得上，不受电脑快慢影响。随机数也固定了种子，每次结果一样。

用法：python tools/shoot.py 场景名 [--set 参数=值 ...]
场景定义在下面的 SCENES 里。
"""
import argparse
import json
import cv2
import numpy as np
from playwright.sync_api import sync_playwright
import videolib as V
from videolib import URL, FAKE_CLOCK

# 每个场景：鼠标动作（第几帧做什么）、截图帧、裁剪区域、对应的视频帧（用来拼并排图）
SCENES = {
    # 视频 19.13 秒（第 1148 帧）在 (1272,706) 点了一下
    'click': dict(
        actions={30: ('move', 1272, 706), 60: ('click', 1272, 706)},
        shots=[60 + (f - 1148) for f in range(1150, 1271, 10)],
        video=list(range(1150, 1271, 10)),
        crop=(672, 206, 1200, 1000), scale=0.4),
    # 同一次点击，原尺寸放大看圈上半部分的字和颜色
    'clickzoom': dict(
        actions={30: ('move', 1272, 706), 60: ('click', 1272, 706)},
        shots=[60 + (f - 1148) for f in (1172, 1190, 1210)],
        video=[1172, 1190, 1210],
        crop=(1000, 240, 560, 260), scale=1.0),
    # 内圈长出来的那段时间（视频 0.27～0.85 秒），只看圈的中间部分
    'inner': dict(
        actions={30: ('move', 1272, 706), 60: ('click', 1272, 706)},
        shots=[60 + (f - 1148) for f in (1164, 1172, 1180, 1190, 1200)],
        video=[1164, 1172, 1180, 1190, 1200],
        crop=(912, 386, 720, 640), scale=0.55),
    # 先在点击处周围来回划，铺一层灰雾，再点击：看圈往外扩散时有没有把灰字带着走
    'clickpush': dict(
        actions={**{i: ('move', 1272 + 380 * np.cos(i / 6), 706 + 260 * np.sin(i / 4)) for i in range(0, 50)},
                 52: ('move', 1272, 706), 60: ('click', 1272, 706)},
        shots=[60 + k for k in (12, 24, 36, 48)],
        video=[],
        crop=(812, 306, 920, 800), scale=0.6),
    # 在一块区域里反复来回划 3 秒，把雾铺满：检查「滑动填充比例」调满时还有没有填不上的空洞
    'fill': dict(
        actions={i: ('move', 900 + 760 * (0.5 + 0.5 * np.sin(i / 3.1)), 400 + 600 * (0.5 + 0.5 * np.sin(i / 17.3))) for i in range(0, 180)},
        shots=[180],
        video=[],
        crop=(980, 460, 600, 480), scale=1.0),
    # 视频 0.75～2.2 秒的一次滑动和之后的消散
    'stroke': dict(
        actions='stroke',
        shots=list(range(60, 200, 12)),
        video=list(range(60, 200, 12)),
        crop=(300, 250, 1400, 700), scale=0.45),
}


def stroke_actions():
    seg = json.loads((V.ROOT / 'reference' / 'segments.json').read_text(encoding='utf-8'))
    cur = seg['cursor']
    return {i: ('move', *cur[i]) for i in range(0, 200) if cur[i]}


ap = argparse.ArgumentParser()
ap.add_argument('scene')
ap.add_argument('--set', nargs='*', default=[], help='覆盖 CONFIG，如 fogFade=0.4')
ap.add_argument('--no-video', action='store_true')
ap.add_argument('--tag', default='', help='输出文件名后缀')
a = ap.parse_args()
sc = SCENES[a.scene]
actions = stroke_actions() if sc['actions'] == 'stroke' else sc['actions']
x, y, w, h = sc['crop']

tiles = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width': V.W, 'height': V.H}, device_scale_factor=1)
    pg.add_init_script(FAKE_CLOCK)
    pg.goto(URL)
    pg.wait_for_function('typeof frame === "function" && window.__t > 0')
    pg.evaluate('CONFIG.fps = 0')   # 截图时每帧都渲染
    for kv in a.set:
        k, v = kv.split('=')
        pg.evaluate(f'CONFIG[{json.dumps(k)}] = {v}')
    shots = set(sc['shots'])
    for i in range(max(shots) + 1):
        act = actions.get(i)
        if act:
            pg.mouse.move(act[1], act[2])
            if act[0] == 'click':
                pg.mouse.down(); pg.mouse.up()
        pg.evaluate('__step(1)')
        if i in shots:
            png = pg.screenshot(clip={'x': x, 'y': y, 'width': w, 'height': h})
            tiles.append((i, cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)))
    b.close()


def label(img, text):
    if sc['scale'] != 1:
        img = cv2.resize(img, None, fx=sc['scale'], fy=sc['scale'], interpolation=cv2.INTER_AREA)
    img = cv2.copyMakeBorder(img, 22, 2, 2, 2, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    cv2.putText(img, text, (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return img


ours = [label(t, f'ours f={i}') for i, t in tiles]
rows = []
vids = {}
if not a.no_video:
    want = set(sc['video'])
    for f, img in V.frames(start=min(want), stop=max(want) + 1):
        if f in want:
            vids[f] = label(cv2.cvtColor(img[y:y + h, x:x + w], cv2.COLOR_RGB2BGR), f'video f={f}')
# 每列一个时刻：上面视频，下面我们的；一行放 4 个时刻
cols = min(4, len(ours))
for k in range(0, len(ours), cols):
    o = ours[k:k + cols]
    while len(o) < cols:
        o.append(np.zeros_like(ours[0]))
    if vids:
        vv = [vids[f] for f in sc['video'][k:k + cols]]
        while len(vv) < cols:
            vv.append(np.zeros_like(ours[0]))
        rows.append(np.hstack(vv))
    rows.append(np.hstack(o))
out = V.ROOT / 'out' / f'{a.scene}{a.tag}.png'
out.parent.mkdir(exist_ok=True)
cv2.imwrite(str(out), np.vstack(rows))
print(out)
