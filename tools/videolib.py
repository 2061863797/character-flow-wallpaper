"""视频和录制帧共用的读取、分格工具。

画面统一按「字符格」处理：视频里每个字占 8×16 屏幕像素，2560×1440 一共 320 列 × 90 行。
"""
import pathlib
import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
VIDEO = ROOT / 'Desktop 2026.10.15 - 11.45.04.01.mp4'
W, H = 2560, 1440
CW, CH = 8, 16
COLS, ROWS = W // CW, H // CH

# 视频里 Claude 应用界面占的区域（x0, y0, x1, y1），不属于壁纸效果，统计时排除
UI_RECTS = [
    (0, 0, W, 56),            # 顶栏
    (2160, 56, W, 320),       # 右上角「录制已开始」提示（前几秒出现）
    (780, 1225, 1790, H),     # 底部输入框和下面一行按钮
    (2500, 1380, W, H),       # 右下角小图标
]


def ui_mask():
    """像素级掩码：True = 应用界面，要排除。"""
    m = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in UI_RECTS:
        m[y0:y1, x0:x1] = True
    return m


def ui_cell_mask():
    """字符格级掩码：格子里只要有一点界面就排除。"""
    return ui_mask().reshape(ROWS, CH, COLS, CW).any(axis=(1, 3))


def frames(path=VIDEO, start=0, stop=None, step=1):
    """逐帧读取（RGB, uint8），产出 (帧号, 图像)。"""
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    i = start
    while stop is None or i < stop:
        ok, bgr = cap.read()
        if not ok:
            break
        if (i - start) % step == 0:
            yield i, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        i += 1
    cap.release()


def fps(path=VIDEO):
    cap = cv2.VideoCapture(str(path))
    v = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return v


def cells(img):
    """把一帧压成字符格：每格取最亮像素的颜色（字的笔画），返回 (ROWS, COLS, 3) int。"""
    return img[:ROWS * CH, :COLS * CW].reshape(ROWS, CH, COLS, CW, 3).max(axis=(1, 3)).astype(np.int16)


def blue(c):
    """每格的「蓝色程度」：蓝通道比红通道高多少（灰字约 0，蓝圈最亮约 120）。"""
    return np.clip(c[..., 2] - c[..., 0], 0, None)


def gray(c):
    """每格的灰度（取三通道最大值）。"""
    return c.max(axis=-1)


# ===== 无头浏览器渲染壁纸用（shoot.py、fogcurve.py）=====
URL = (ROOT / 'wallpaper-engine' / 'index.html').as_uri()

FAKE_CLOCK = """
(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__t = 1000;
  performance.now = () => window.__t;
  let cbs = [];
  window.requestAnimationFrame = cb => { cbs.push(cb); return cbs.length; };
  window.__step = (n) => { for (let k = 0; k < n; k++) { window.__t += 1000 / 60; const a = cbs; cbs = []; a.forEach(f => f(window.__t)); } };
})();
"""

