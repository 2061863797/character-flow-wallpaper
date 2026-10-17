// ===== 点击扩散（逐帧对照视频测出来的）=====
// 每次点击从点击处同时放出两道圈：外圈快、先亮后淡；内圈慢、暗一些，跟在后面。约 2 秒后全部消失。
// 大约三次有一次是爱心形（上面两个圆鼓包、下面一个尖），其余是圆形。
// 下面的半径、亮度都是视频里 2560 宽屏幕上的实际像素，用的时候换算成页面像素。
const RIPPLE_END = 2.6;                  // 秒（蓝色约 2 秒褪完，剩下的灰字再慢慢消失）
// 亮度随时间变化（秒, 相对亮度），视频实测；后半段的亮度一部分是蓝、一部分已经变成灰（见 RING_GRAY）
const RING_OUT_AMP = [[0, .4], [.2, .67], [.35, .8], [.6, .86], [.75, .88], [1, .85], [1.2, .78], [1.32, .6], [1.45, .49], [1.6, .43], [1.72, .25], [1.8, .22], [2, .2], [2.2, .15], [2.4, .08], [2.6, 0]];
const RING_IN_AMP = [[0, 0], [.2, .05], [.45, .19], [.6, .35], [.72, .43], [.85, .47], [1, .46], [1.19, .58], [1.32, .46], [1.45, .49], [1.6, .49], [1.72, .44], [1.85, .36], [1.92, .35], [2.1, .26], [2.3, .15], [2.6, 0]];
// 变灰的比例：0.9 秒以后蓝色慢慢褪成灰，约 2.3 秒全是灰（视频实测颜色从蓝灰 19,39,51 渐变到 29,40,45）
const RING_GRAY = [[0, 0], [.9, 0], [1.2, .08], [1.5, .2], [1.8, .4], [2, .6], [2.2, .85], [2.5, 1]];
// 形状随时间变乱：一开始几乎是规则的圆，0.6 秒后被「气流」推得越来越歪、越来越碎
const RING_WARP = [[0, .02], [.3, .035], [.6, .05], [1, .07], [1.4, .1], [1.8, .13], [2.6, .14]];
// 圈边缘的毛糙程度：视频里圈边是一个个字参差不齐的毛边，不是光滑的线
const RING_ROUGH = [[0, 0], [2, 0]];   // 视频实测圈的外沿是干净的台阶状，不加毛边
// 圈扫过的整片区域（视频实测）：0.1~0.6 秒整个圆盘泛一层很暗的蓝，之后整片慢慢变暗，约 1 秒褪完
// 字一直都在，只是颜色和亮度慢慢变，不会有字突然消失
const RING_FILL = [[0, .04], [.4, .035], [.7, .02], [1, .008], [1.3, 0]];
// 圈里原来的灰烟被染成蓝的程度，之后慢慢变回灰
const RING_CONV = [[0, 1], [1, 1], [1.4, .6], [1.7, 0]];
// 沿着圈一段亮一段暗的反差：越到后面越大，圈断成一段段（视频实测：0.8 秒约 9% 断开，1.2 秒 17%，1.6 秒 33%）
const RING_SEG = [[0, 1], [.4, 1.3], [.8, 1.8], [1.2, 2.5], [1.6, 3.4], [2.6, 4.5]];
let rippleGray = 0, rippleConv = 0;   // rippleAt 顺带算出的：变灰部分、灰烟染蓝
// 爱心轮廓：每隔 15° 一个半径倍数（从正左方 -180° 开始，0° 是正右，90° 是正下），视频里三次爱心取平均
const HEART = [0.97, 1.11, 1.26, 1.35, 1.35, 1.23, 1.07, 1.24, 1.33, 1.32, 1.24, 1.1, 0.95, 0.82, 0.76, 0.73, 0.73, 0.78, 0.86, 0.79, 0.73, 0.74, 0.76, 0.85];
function table(tb, t) {
  if (t <= tb[0][0]) return tb[0][1];
  for (let k = 1; k < tb.length; k++) if (t < tb[k][0]) { const [t0, v0] = tb[k - 1], [t1, v1] = tb[k]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
  return tb[tb.length - 1][1];
}
function heartShape(ang) {
  const f = ((ang * 180 / Math.PI + 180) / 15) % 24, k = f | 0, u = f - k;
  // 1.1：圈有厚度，量出来的轮廓会被抹平一点，这里放大一点补回来
  return 1 + (HEART[k] + (HEART[(k + 1) % 24] - HEART[k]) * u - 1) * 1.1;
}
// 点击后经过的「视频秒数」：扩散速度、持续时间两个设置会让它变快变慢
const rippleAge = (rp, now) => (now - rp.born) / 1000 * (CONFIG.speed / 0.06) / CONFIG.rippleLife;
const ANG_BINS = 180;
// 每帧给每个圈算一次：各个方向上的半径倍数（形状）和亮度（一段亮一段暗）
// 扭曲场：顺着风向拉长、跟着风飘的噪声（和背景烟同一个方向），让圈像被气流吹散的烟
let RW = null, RT = null, RS = null, rwFrame = -1;   // RW 推歪  RT 粗细  RS 顺风的丝状条纹
// 三张场轮流更新（每帧只算一张），省时间；变化很慢，看不出来
function rippleWarpField(sec, which) {
  if (!RW || RW.length !== NX * NY) { RW = new Float32Array(NX * NY); RT = new Float32Array(NX * NY); RS = new Float32Array(NX * NY); }
  const drift = sec * CONFIG.airSpeed / dpr;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const px = (x - 0.5) * SIM, py = (y - 0.5) * SIM;
    const u = px * SA + py * SB - drift, v = -px * SB + py * SA;   // 沿风向 / 垂直风向
    const i = IX(x, y);
    if (which === 0) RW[i] = noise(u * 0.003 + 300, v * 0.0055, sec * 0.3) * 0.8 + noise(u * 0.008 + 50, v * 0.014, sec * 0.45) * 0.2;   // 大块地鼓出、凹进
    else if (which === 1) RT[i] = noise(u * 0.005 + 700, v * 0.01, sec * 0.35);    // 一团团的：有的地方圈厚、有的地方薄
    else RS[i] = noise(u * 0.005 + 1500, v * 0.045, sec * 0.3);                   // 沿风向拉长的细条：后期圈碎成一缕缕
  }
}
function rippleTables(now) {
  if (!RW || RW.length !== NX * NY) { for (let k = 0; k < 3; k++) rippleWarpField(now / 1000, k); rwFrame = simFrame; }
  else if (simFrame !== rwFrame) { rippleWarpField(now / 1000, simFrame % 3); rwFrame = simFrame; }
  const sizeK = 0.0035 / CONFIG.scale * CONFIG.rippleRadius;  // 扩散范围
  const bandK = CONFIG.bandWidth / 0.4;                      // 光带粗细
  const S = CONFIG.rippleScatter;                            // 分散度：圈变形、断开、碎散的程度（0 = 规整的圆）
  for (const rp of ripples) {
    const t = rippleAge(rp, now);
    rp.alive = t < RIPPLE_END;
    if (!rp.alive) continue;
    // 这些每帧只算一次，不用每个字都算一遍
    rp.r1 = 680 * (1 - Math.exp(-t / 0.98)) * sizeK;        // 外圈：一开始约 600 像素/秒，越来越慢
    rp.r2 = 990 * (1 - Math.exp(-t / 3.2)) * sizeK;         // 内圈：慢，速度几乎不变
    rp.a1 = table(RING_OUT_AMP, t); rp.a2 = table(RING_IN_AMP, t);
    rp.fill = table(RING_FILL, t); rp.conv = table(RING_CONV, t); rp.rough = table(RING_ROUGH, t);
    // 爱心少歪一点：视频里 1.2 秒时还认得出是心形
    rp.gray = table(RING_GRAY, t); rp.warp = table(RING_WARP, t) * (rp.heart ? 0.6 : 1) * (1 + 2 * S);
    rp.late = Math.max(0, Math.min(1, (t - 0.35) / 0.8)) * Math.min(1.5, S);
    rp.bandK = bandK;
    const lobe = rp.heart ? 0 : 0.04 + 0.1 * S;               // 圆形轮廓起伏的幅度
    const maxK = rp.heart ? 1.4 : 1 + lobe, minK = rp.heart ? 0.68 : 1 - lobe;
    const wp = rp.r1 * rp.warp * 0.6;                       // 被吹歪的最大距离（扭曲场实际很少超过 ±0.3）
    const hi = rp.r1 * maxK + 90 * bandK + wp, lo = Math.max(0, rp.r2 * minK - 90 * bandK - wp);
    rp.hi2 = hi * hi; rp.lo2 = lo * lo;                      // 离圈太远的字直接跳过
    // 圈前沿的扩散速度（屏幕像素/秒），给 ringPush 推烟用：r1 对时间求导，再乘上设置带来的快慢
    const rate = (CONFIG.speed / 0.06) / CONFIG.rippleLife;
    rp.v1 = 680 / 0.98 * Math.exp(-t / 0.98) * sizeK * rate;
    if (!rp.shape) {
      rp.shape = new Float32Array(ANG_BINS); rp.seg = new Float32Array(ANG_BINS); rp.tang = new Float32Array(ANG_BINS);
      // 推烟时顺着圈方向的分量：沿圈一段正一段反，推出去的烟会卷成小涡（每个圈固定一套，不随时间变）
      for (let k = 0; k < ANG_BINS; k++) {
        const ang = (k / ANG_BINS - 0.5) * 2 * Math.PI;
        rp.tang[k] = (noise(Math.cos(ang) * 2 + rp.seed, Math.sin(ang) * 2, rp.seed) - 0.5) * 1.6;
      }
    }
    for (let k = 0; k < ANG_BINS; k++) {
      const ang = (k / ANG_BINS - 0.5) * 2 * Math.PI, c = Math.cos(ang), s = Math.sin(ang);
      // 形状：圆形带不规则的鼓包（视频里 0.5 秒后轮廓明显歪扭，有好几个鼓包）；爱心按轮廓表
      rp.shape[k] = rp.heart ? heartShape(ang)
        : 1 + ((noise(c * 1.5 + rp.seed, s * 1.5, t * 0.6) - 0.5) * 0.7 + (noise(c * 3.5 + rp.seed, s * 3.5 + 20, t * 0.9) - 0.5) * 0.3) * lobe * 2;
      // 沿着圈一段亮一段暗（视频里圈不是均匀的）
      rp.seg[k] = noise(c * 1.3 + rp.seed * 1.7, s * 1.3 - rp.seed, t * 0.5) * 0.7 + noise(c * 3 + rp.seed, s * 3 + 40, t * 0.7) * 0.3;
    }
    // 拉大反差：暗的段落直接断开；再整体归一，平均亮度不变
    const K = 1 + (table(RING_SEG, t) - 1) * (0.5 + 1.2 * S); let sum = 0;
    for (let k = 0; k < ANG_BINS; k++) { rp.seg[k] = Math.max(0, 0.5 + (rp.seg[k] - 0.5) * K); sum += rp.seg[k]; }
    const nrm = ANG_BINS / Math.max(1e-3, sum);
    for (let k = 0; k < ANG_BINS; k++) rp.seg[k] *= nrm;
  }
}
function rippleAt(x, y) {
  let v = 0; rippleGray = 0; rippleConv = 0;
  let warpN = -1, rag = 0, thick = 0, streak = 0;
  for (const rp of ripples) {
    if (!rp.alive) continue;
    const dx = (x - rp.x) * dpr, dy = (y - rp.y) * dpr;     // 换算成屏幕像素
    const dd = dx * dx + dy * dy;
    if (dd > rp.hi2) continue;
    if (dd < rp.lo2) {                                       // 圈里面很深的地方：只有整片的效果
      v += rp.fill * (1 - rp.gray);
      if (rp.conv > rippleConv) rippleConv = rp.conv;
      continue;
    }
    const dist = Math.sqrt(dd), bandK = rp.bandK;
    // 形状和明暗按角度查表
    const f = (Math.atan2(dy, dx) / (2 * Math.PI) + 0.5) * ANG_BINS, k = f | 0, u = f - k, k1 = k % ANG_BINS, k2 = (k + 1) % ANG_BINS;
    const shape = rp.shape[k1] + (rp.shape[k2] - rp.shape[k1]) * u;
    const seg = rp.seg[k1] + (rp.seg[k2] - rp.seg[k1]) * u;
    // 气流把圈推歪：按这个位置的扭曲场往里或往外挪（越到后面挪得越多）
    if (warpN < 0) { const gx = x / SIM + 0.5, gy = y / SIM + 0.5; warpN = sample(RW, gx, gy) - 0.5; rag = sample(RG, gx, gy); thick = sample(RT, gx, gy); streak = sample(RS, gx, gy); }
    // 毛边：按细碎噪声把圈边一格格往里往外推，边缘参差不齐
    const rough = (rag - 0.5) * 2 * rp.rough * bandK;
    const R1 = rp.r1 * (shape + warpN * 2 * rp.warp) + rough * (14 + 0.04 * rp.r1), R2 = rp.r2 * (shape + warpN * 2 * rp.warp * 0.8) + rough * (10 + 0.03 * rp.r2);
    // 外圈：外沿利落、往里拖得长一些
    const d1 = dist - R1;
    const tk = 0.75 + 0.5 * thick;                          // 圈的粗细略有起伏（视频里光带厚度比较均匀）
    const w1 = (d1 > 0 ? 6 + 0.01 * R1 : 16 + 0.045 * R1) * bandK * tk;
    const d2 = dist - R2, w2 = (8 + 0.025 * R2) * bandK * tk;
    const q1 = d1 / w1, q2 = d2 / w2;
    let g = (q1 * q1 < 9 ? Math.exp(-q1 * q1) * rp.a1 : 0) + (q2 * q2 < 9 ? Math.exp(-q2 * q2) * rp.a2 : 0);
    // 两圈之间铺一层极淡的蓝（视频里两道圈中间也几乎每格都有暗蓝的字）
    if (dist > R2 * 0.85 && dist < R1) g = Math.max(g, 0.03 * rp.a1);
    // 圈扫过的整片区域：泛一层很暗的蓝，原来的灰烟被染成蓝
    const inside = Math.max(0, Math.min(1, (R1 + 20 - dist) / 60));
    if (inside > 0) {
      g = Math.max(g, rp.fill * inside);
      if (rp.conv * inside > rippleConv) rippleConv = rp.conv * inside;
    }
    // 越到后面越碎：按细碎噪声把圈打出缺口，一段段散开
    const brk = Math.max(0, Math.min(1.6, streak * 3 - 0.9)) * 0.7 + Math.max(0, Math.min(1.5, rag * 2.4 - 0.55)) * 0.3;
    // 分散度越大，缺口越彻底（视频里 1 秒后圈断成互不相连的一段段弧）；×1.6：碎开后整体亮度不变，只是集中到一缕缕上
    const lk = Math.min(1, rp.late);
    g *= 1 - lk * 0.85 + lk * 0.85 * brk * 1.6;
    g *= seg;
    v += g * (1 - rp.gray);
    rippleGray += g * rp.gray;
  }
  return Math.min(1, v * 0.68 * CONFIG.rippleStrength);   // 0.68：对照视频校准的整体亮度
}
