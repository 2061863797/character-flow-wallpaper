"""把视频（或录制帧文件夹）里一段连续帧的同一块区域拼成一张图，方便逐帧看变化。

用法：python tools/contact.py 起始帧 结束帧 步长 x y w h 输出名 [--src 录制帧文件夹] [--scale 0.5]
"""
import argparse
import pathlib
import cv2
import numpy as np
import videolib as V

ap = argparse.ArgumentParser()
ap.add_argument('start', type=int); ap.add_argument('stop', type=int); ap.add_argument('step', type=int)
ap.add_argument('x', type=int); ap.add_argument('y', type=int); ap.add_argument('w', type=int); ap.add_argument('h', type=int)
ap.add_argument('name')
ap.add_argument('--src', default=None, help='录制帧文件夹（默认读参考视频）')
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--cols', type=int, default=4)
a = ap.parse_args()


def read(i):
    if a.src:
        return cv2.cvtColor(cv2.imread(str(pathlib.Path(a.src) / f'{i:05d}.png')), cv2.COLOR_BGR2RGB)
    return None


tiles = []
it = V.frames(start=a.start, stop=a.stop, step=a.step) if not a.src else ((i, read(i)) for i in range(a.start, a.stop, a.step))
for i, img in it:
    t = img[a.y:a.y + a.h, a.x:a.x + a.w].copy()
    if a.scale != 1:
        t = cv2.resize(t, None, fx=a.scale, fy=a.scale, interpolation=cv2.INTER_AREA)
    t = cv2.copyMakeBorder(t, 22, 2, 2, 2, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    cv2.putText(t, f'f={i} t={i / 60:.2f}s', (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    tiles.append(t)
while len(tiles) % a.cols:
    tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[k:k + a.cols]) for k in range(0, len(tiles), a.cols)]
out = V.ROOT / 'out' / f'{a.name}.png'
out.parent.mkdir(exist_ok=True)
cv2.imwrite(str(out), cv2.cvtColor(np.vstack(rows), cv2.COLOR_RGB2BGR))
print(out)
