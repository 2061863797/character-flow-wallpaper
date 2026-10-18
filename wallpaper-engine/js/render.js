// ===== 画布与字形图集 =====
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let dpr, cols, rows, chars, jitter, jitter2, dither, atlas;

// 鼠标滑过时的灰色：在平时颜色基础上提亮
const hoverGray = () => CONFIG.dim.map(c => Math.min(255, Math.round(c * 1.5 + 40)));
// 灰度刻度 0~1：0 几乎融进背景，0.5 是平时最亮，1 是鼠标加深
function grayAt(s) {
  const hg = hoverGray();
  return s <= 0.5
    ? CONFIG.bg.map((b, i) => lerp(b, CONFIG.dim[i], s / 0.5))   // 最暗一级就是背景色，渐变从 0 开始
    : CONFIG.dim.map((d, i) => lerp(d, hg[i], (s - 0.5) / 0.5));
}

// 画字的方式（为了在 2560×1440 这类大屏上也流畅）：
// 不再每个字调用一次 drawImage，而是先把每个字形渲染成一张「墨量模板」（每个像素有多少墨），
// 每帧在内存里的一整张像素图上按模板直接写颜色，最后一次性贴到屏幕上。看起来和原来一样，但快很多。
let glyphPix, glyphDX, glyphDY, glyphA, glyphOff, colorLUT, frameImg, frameBuf, bgPacked, GW, GH;
const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;   // 像素格式：小端 RGBA
function buildAtlas() {
  GW = Math.round(CONFIG.cellW * dpr); GH = Math.round(CONFIG.cellH * dpr);
  // 1) 字形模板：白字黑底渲染每个字，只记下有墨的像素（位置 + 墨量 0~255）
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const a = cv.getContext('2d', { willReadFrequently: true });
  a.font = `${CONFIG.fontSize * dpr}px ${CONFIG.fontFamily}`;
  a.textBaseline = 'middle'; a.textAlign = 'center'; a.fillStyle = '#fff';
  const pix = [], al = [];
  glyphOff = new Int32Array(LETTERS.length + 1);
  for (let k = 0; k < LETTERS.length; k++) {
    glyphOff[k] = pix.length;
    a.fillStyle = '#000'; a.fillRect(0, 0, GW, GH); a.fillStyle = '#fff';
    a.fillText(LETTERS[k], GW / 2, GH / 2);
    const d = a.getImageData(0, 0, GW, GH).data;
    for (let p = 0; p < GW * GH; p++) if (d[p * 4] > 0) { pix.push(p); al.push(d[p * 4]); }
  }
  glyphOff[LETTERS.length] = pix.length;
  glyphPix = Int32Array.from(pix);   // 模板里的像素位置（在一个字格内的编号）
  glyphDX = Int32Array.from(pix, p => p % GW); glyphDY = Int32Array.from(pix, p => (p / GW) | 0);
  glyphA = Uint8Array.from(al);      // 对应的墨量
  // 2) 颜色表：每种「灰度级 × 蓝色级 × 墨量」直接查出最终像素颜色（字和背景按墨量混合）
  colorLUT = new Uint32Array(GRAY_LEVELS * GLOW_LEVELS * 256);
  const bg = CONFIG.bg, glow = CONFIG.glow;
  const glowSpan = Math.max(1, ...glow.map((v, i) => v - bg[i]));
  for (let g = 0; g < GRAY_LEVELS; g++) {
    const gray = grayAt(g / (GRAY_LEVELS - 1));
    const gr = Math.max(0, ...gray.map((v, i) => v - bg[i])) / glowSpan;   // 这一级灰有多亮（换算成蓝光强度）
    for (let b = 0; b < GLOW_LEVELS; b++) {
      const t = b / (GLOW_LEVELS - 1);
      // 被蓝圈照到的字整个变成蓝色调，不是在灰上叠一层蓝（否则烟里的字还是灰的，对照视频：圈上的字都是蓝的）。
      // m = 换色程度：蓝光一弱就开始换，稍强一点就完全换成蓝；原来的灰亮度折算成蓝光保留下来，烟里的蓝字更亮
      const m = Math.min(1, t * 6);
      const c = gray.map((v, i) => Math.min(255, bg[i] + (glow[i] - bg[i]) * (t + gr * 0.85 * m) + (v - bg[i]) * (1 - m)));
      const base = (g * GLOW_LEVELS + b) * 256;
      for (let k = 0; k < 256; k++) {
        const f = k / 255;
        colorLUT[base + k] = pack(Math.round(bg[0] + (c[0] - bg[0]) * f), Math.round(bg[1] + (c[1] - bg[1]) * f), Math.round(bg[2] + (c[2] - bg[2]) * f));
      }
    }
  }
  bgPacked = pack(bg[0], bg[1], bg[2]);
  // 3) 整帧像素图
  frameImg = ctx.createImageData(canvas.width, canvas.height);
  frameBuf = new Uint32Array(frameImg.data.buffer);
  atlas = true;
}

// 把一个字写进整帧像素图：(px,py) 是屏幕像素左上角
function blitGlyph(glyph, colorIndex, px, py) {
  const cw = canvas.width, ch = canvas.height, base = colorIndex * 256;
  const end = glyphOff[glyph + 1];
  if (px + GW <= cw && py + GH <= ch) {               // 常见情况：整个字都在屏幕内，不用逐像素判断边界
    const o = py * cw + px;
    for (let k = glyphOff[glyph]; k < end; k++) frameBuf[o + glyphDY[k] * cw + glyphDX[k]] = colorLUT[base + glyphA[k]];
    return;
  }
  for (let k = glyphOff[glyph]; k < end; k++) {
    const gx = px + glyphDX[k], gy = py + glyphDY[k];
    if (gx < cw && gy < ch) frameBuf[gy * cw + gx] = colorLUT[base + glyphA[k]];
  }
}

function resetChars() {
  // -1 表示这一格空着
  chars = new Int8Array(cols * rows).map(() =>
    Math.random() < CONFIG.baseDensity ? Math.random() * NL | 0 : -1);
}

// 按「字符大小」重新排字：只重建字符网格和字形，不动烟雾模拟（改字号时烟不会重置、画面不会卡一下）
function layoutChars() {
  // 格子和字号都取整数个屏幕像素，字才清晰；再换算回页面像素给其他计算用
  CONFIG.cellW = Math.max(4, Math.round(CONFIG.devCellW * CONFIG.charScale)) / dpr;
  CONFIG.cellH = Math.max(6, Math.round(CONFIG.devCellH * CONFIG.charScale)) / dpr;
  CONFIG.fontSize = Math.max(4, Math.round(CONFIG.devFont * CONFIG.charScale)) / dpr;
  cols = Math.ceil(innerWidth / CONFIG.cellW);
  rows = Math.ceil(innerHeight / CONFIG.cellH);
  jitter = new Float32Array(cols * rows).map(() => 1 - CONFIG.charJitter * Math.random());
  jitter2 = new Float32Array(cols * rows).map(() => Math.random());   // 蓝圈里每个字的明暗
  dither = new Float32Array(cols * rows).map(() => Math.random());
  resetChars();
  buildAtlas();
}

function resize() {
  // 网页版把壁纸嵌在首页里，刚加载时这一层可能还没有尺寸：先不建画布，等真正有了尺寸（会再触发 resize）再建
  if (!innerWidth || !innerHeight) return;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  layoutChars();
  initSmoke();
}
