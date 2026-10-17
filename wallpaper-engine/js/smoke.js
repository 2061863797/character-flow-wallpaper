// ===== 烟雾模拟（Jos Stam「Stable Fluids」思路）=====
// 屏幕分成粗网格，每格记录「风往哪吹」(U,V，单位：格/秒) 和「这里有多少烟」(D)。
// 每一帧：风把烟带着走（平流）→ 烟向四周化开（扩散）→ 慢慢变淡（消散）。
// 背景的烟源和鼠标都只是往这张网格里「放烟、推风」，之后怎么飘、怎么散全交给模拟。
let SIM = 8;                        // 每个模拟格边长（页面像素）；大屏上自动变粗，格子总数控制在约 2 万，保证流畅
// 网格上的各张数据表（每格一个数）：
//   U, V   风速（U2、V2 是计算用的副本）      D  背景烟浓度（D2 是副本）
//   M      鼠标放出的烟（单独算，消散更慢）  SN 气流纹理原始值
//   FT     雾里的纹理                          FL 雾里的暗区
//   RG     边缘细碎扰动                        HZ 烟带外围薄雾
//   PSI    背景旋涡                            P、DIV 投影步骤的中间结果
let NX, NY, U, V, U2, V2, D, D2, M, FT, FL, RG, HZ, SN, P, DIV, PSI;
let bgLo = 0.48, bgHi = 0.9;   // 烟源门槛和最浓处：都按整屏分布自动调节，烟的多少和浓淡始终稳定
let cvLo = 0.48, cvHi = 0.9;   // coverThreshold() 算出的目标门槛，bgLo/bgHi 慢慢向它靠拢
const SN_HIST = new Uint32Array(256);
const IX = (x, y) => x + y * NX;
let simFrame = 0;

// 风向：往右下约 35°（视频实测）
const WIND_ANGLE = 35 * Math.PI / 180;
const SA = Math.cos(WIND_ANGLE), SB = Math.sin(WIND_ANGLE);

function initSmoke() {
  SIM = Math.max(8, Math.round(Math.sqrt(innerWidth * innerHeight / 20000)));
  NX = Math.ceil(innerWidth / SIM) + 2;
  NY = Math.ceil(innerHeight / SIM) + 2;
  const n = NX * NY;
  U = new Float32Array(n); V = new Float32Array(n); U2 = new Float32Array(n); V2 = new Float32Array(n);
  D = new Float32Array(n); D2 = new Float32Array(n); M = new Float32Array(n); FT = new Float32Array(n); FL = new Float32Array(n); RG = new Float32Array(n); HZ = new Float32Array(n); SN = new Float32Array(n); P = new Float32Array(n); DIV = new Float32Array(n);
  PSI = new Float32Array(n);
  // 先把整屏的气流纹理算一遍，直接定好门槛，再预热几秒，打开时烟已经铺开
  // 预热 2 秒，时间正好结束在当前时刻，接上之后的真实画面（不会出现重影）
  const now0 = performance.now() / 1000, warm = 60;
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) SN[IX(x, y)] = streakNoise((x - 0.5) * SIM, (y - 0.5) * SIM, now0 - warm / 30);
  coverThreshold(); bgLo = cvLo; bgHi = cvHi;
  for (let k = 1; k <= warm; k++) stepSmoke(1 / 30, now0 - (warm - k) / 30);
  last = performance.now();
}

// 双线性取值（坐标单位：格），越界时取边缘值
function sample(F, fx, fy) {
  fx = Math.max(0, Math.min(NX - 1.001, fx)); fy = Math.max(0, Math.min(NY - 1.001, fy));
  const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = IX(x0, y0);
  return (F[i] * (1 - ax) + F[i + 1] * ax) * (1 - ay) + (F[i + NX] * (1 - ax) + F[i + NX + 1] * ax) * ay;
}

// 平流：每格往「上游」回看 dt 秒，取那里的值 → 东西被风带着走
function advect(dst, src, dt) {
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    dst[i] = sample(src, x - U[i] * dt, y - V[i] * dt);
  }
}

// 投影：让风场「不可压缩」，这一步让烟自然地打旋、绕开、卷起来
function project() {
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    DIV[i] = -0.5 * (U[i + 1] - U[i - 1] + V[i + NX] - V[i - NX]);
    P[i] = 0;
  }
  for (let k = 0; k < 10; k++)
    for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
      const i = IX(x, y);
      P[i] = (DIV[i] + P[i - 1] + P[i + 1] + P[i - NX] + P[i + NX]) * 0.25;
    }
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    U[i] -= 0.5 * (P[i + 1] - P[i - 1]);
    V[i] -= 0.5 * (P[i + NX] - P[i - NX]);
  }
}

// 鼠标：沿这一帧走过的线段放烟，并顺着鼠标方向推一下风
function mouseSmoke(dt, sec) {
  if (!mouse.inside) return;
  const x0 = mouse.px < -999 ? mouse.x : mouse.px, y0 = mouse.py < -999 ? mouse.y : mouse.py;
  const mdx = mouse.x - x0, mdy = mouse.y - y0;
  mouse.px = mouse.x; mouse.py = mouse.y;
  if (Math.abs(mdx) < 0.5 && Math.abs(mdy) < 0.5) return;   // 鼠标不动就不再放烟
  const R = Math.max(1.5, CONFIG.hoverRadius / SIM);          // 半径（格）
  const ax = x0 / SIM + 0.5, ay = y0 / SIM + 0.5, bx = mouse.x / SIM + 0.5, by = mouse.y / SIM + 0.5;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  // 鼠标速度（格/秒），限制上限，免得猛甩时把烟吹爆
  let vx = dx / Math.max(dt, 1e-3), vy = dy / Math.max(dt, 1e-3);
  const sp = Math.hypot(vx, vy), cap = 35;
  if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
  const amount = CONFIG.hoverStrength * 4 * dt;
  if (!CONFIG.swirlMode) {
    // ===== 默认模式（对照视频）=====
    // 范围很宽、边缘柔和；不是一下铺满，而是鼠标持续移动时慢慢「搅浓」，
    // 里面的条纹纹理在显示时由气流纹理决定（见 fogTex），所以不是一整块实心的灰
    const Rw = R * CONFIG.fogWidth;
    const xa = Math.max(1, Math.floor(Math.min(ax, bx) - Rw)), xb = Math.min(NX - 2, Math.ceil(Math.max(ax, bx) + Rw));
    const ya = Math.max(1, Math.floor(Math.min(ay, by) - Rw)), yb = Math.min(NY - 2, Math.ceil(Math.max(ay, by) + Rw));
    const rate = Math.min(1, CONFIG.hoverStrength * CONFIG.fogRate * dt);   // 来回划几下才慢慢变浓（对照视频）
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const ex = x - (ax + dx * t), ey = y - (ay + dy * t);
      const d2 = (ex * ex + ey * ey) / (Rw * Rw);
      if (d2 >= 1) continue;
      const f = Math.exp(-d2 * 3.5) * (1 - d2), i = IX(x, y);   // 中间浓、往外很长一段慢慢变淡
      M[i] += (0.9 - M[i]) * f * rate;
      U[i] += (vx * 0.3 - U[i]) * f * 0.15;                      // 轻轻带一下气流
      V[i] += (vy * 0.3 - V[i]) * f * 0.15;
    }
    return;
  }
  // ===== 卷入模式 =====
  // 放烟点不完全贴着轨迹：沿路径左右飘一点、半径时大时小 → 路线大致对，形状不照搬轨迹
  const len = Math.sqrt(len2), nx = -dy / len, ny = dx / len;          // 垂直于路径的方向
  const sway = (noise(sec * 1.7, 3.3, 11) - 0.5) * R * 1.4;
  const ox = nx * sway, oy = ny * sway;
  const Rv = R * (0.9 + noise(sec * 2.3, 8.1, 5) * 0.7);   // 烟铺得比轨迹宽，边缘正好落在两侧的涡里
  const xa = Math.max(1, Math.floor(Math.min(ax, bx) - R * 2)), xb = Math.min(NX - 2, Math.ceil(Math.max(ax, bx) + R * 2));
  const ya = Math.max(1, Math.floor(Math.min(ay, by) - R * 2)), yb = Math.min(NY - 2, Math.ceil(Math.max(ay, by) + R * 2));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const ex = x - (ax + dx * t + ox), ey = y - (ay + dy * t + oy);
    const d2 = (ex * ex + ey * ey) / (Rv * Rv);
    if (d2 >= 1) continue;
    // 斑驳：用一层细碎噪声决定每处放多少烟，有的地方浓、有的地方几乎没有
    const patch = noise(x * 0.33 + 50, y * 0.45, sec * 1.2);
    const pk = Math.max(0, Math.min(1, (patch - 0.38) / 0.3));
    const f = (1 - d2) * (1 - d2) * pk * pk, i = IX(x, y);
    M[i] = Math.min(0.95, M[i] + f * amount * 9);
  }
  // 推风：范围比放烟更宽，顺着鼠标方向吹出一股气流。
  // 气流两侧的空气会被带着转起来，形成一对反向旋转的涡，把旁边的烟卷进来
  const Rf = R * 1.8;
  const fa = Math.max(1, Math.floor(Math.min(ax, bx) - Rf)), fb = Math.min(NX - 2, Math.ceil(Math.max(ax, bx) + Rf));
  const ga = Math.max(1, Math.floor(Math.min(ay, by) - Rf)), gb = Math.min(NY - 2, Math.ceil(Math.max(ay, by) + Rf));
  for (let y = ga; y <= gb; y++) for (let x = fa; x <= fb; x++) {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const ex = x - (ax + dx * t), ey = y - (ay + dy * t);
    const d2 = (ex * ex + ey * ey) / (Rf * Rf);
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * 0.3, i = IX(x, y);
    U[i] += (vx * 0.45 - U[i]) * f;
    V[i] += (vy * 0.45 - V[i]) * f;
  }
  // 卡门涡街：鼠标每走一小段，就在路径左右两侧交替放一个旋涡，
  // 旋转方向让靠近路径的一侧顺着鼠标走 → 两边的烟被一圈圈卷进来
  mouse.travel = (mouse.travel || 0) + Math.sqrt(len2);
  const spacing = R * 1.1;
  while (mouse.travel >= spacing) {
    mouse.travel -= spacing;
    mouse.side = -(mouse.side || 1);
    const back = mouse.travel / Math.sqrt(len2);              // 这个涡落在本段路径上的位置
    const cx = bx - dx * Math.min(1, back) + nx * mouse.side * R * 0.6;
    const cy = by - dy * Math.min(1, back) + ny * mouse.side * R * 0.6;
    addVortex(cx, cy, R * 0.9, mouse.side * Math.min(sp, cap) * 0.55);
  }
}

// 在 (cx,cy) 放一个旋涡：中心附近转得最快，往外平滑衰减；strength>0 为逆时针（网格坐标）
function addVortex(cx, cy, rc, strength) {
  const x0 = Math.max(1, Math.floor(cx - rc * 2)), x1 = Math.min(NX - 2, Math.ceil(cx + rc * 2));
  const y0 = Math.max(1, Math.floor(cy - rc * 2)), y1 = Math.min(NY - 2, Math.ceil(cy + rc * 2));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const rx = x - cx, ry = y - cy, r2 = (rx * rx + ry * ry) / (rc * rc);
    if (r2 > 4) continue;
    const k = strength * Math.exp(-r2) / rc, i = IX(x, y);
    U[i] += -ry * k;
    V[i] += rx * k;
  }
}

// 涡量保持（vorticity confinement）：找到正在打旋的地方，再往旋转方向推一点，
// 让小涡不被数值计算抹平，烟就会一圈圈卷起来。主要作用在鼠标的烟附近，背景只加一点点
const CURL = [];
function confineVorticity(dt) {
  if (CURL.length !== NX * NY) CURL.length = NX * NY;
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    CURL[i] = 0.5 * ((V[i + 1] - V[i - 1]) - (U[i + NX] - U[i - NX]));
  }
  for (let y = 2; y < NY - 2; y++) for (let x = 2; x < NX - 2; x++) {
    const i = IX(x, y);
    const gx = 0.5 * (Math.abs(CURL[i + 1]) - Math.abs(CURL[i - 1]));
    const gy = 0.5 * (Math.abs(CURL[i + NX]) - Math.abs(CURL[i - NX]));
    const len = Math.hypot(gx, gy) + 1e-5;
    const eps = 0.4 + (CONFIG.swirlMode ? Math.min(1, M[i] * 3) * 10 : 0);   // 卷入模式下鼠标烟里卷得更明显
    U[i] += eps * (gy / len) * CURL[i] * dt;
    V[i] -= eps * (gx / len) * CURL[i] * dt;
  }
}

function stepSmoke(dt, sec) {
  // 风：整体往右下吹（视频实测方向和速度），再叠加用噪声算出来的旋涡
  const wind = CONFIG.airSpeed / dpr / SIM;          // 格/秒
  const wu = wind * SA, wv = wind * SB;
  const tq = sec * 0.12 * (CONFIG.airSpeed / 58);
  // 背景旋涡变化很慢，每 3 帧重算一次就够（省时间）
  simFrame++;
  if (simFrame % 3 === 0 || simFrame < 3) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++)
    PSI[IX(x, y)] = noise((x - wu * sec) * 0.05, (y - wv * sec) * 0.05, tq)
                  + noise((x - wu * sec) * 0.16 + 9, (y - wv * sec) * 0.16, tq * 2.5) * 0.35; // 小旋涡 → 烟的边缘变成一缕缕
  const swirl = wind * 7;                            // 旋涡强度：轻轻卷动，不把条纹撕碎
  const relax = Math.min(1, dt * 1.2);               // 风场慢慢回到「顺风 + 旋涡」，被鼠标推开后会恢复
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    // 旋涡 = 噪声的「旋度」：沿等高线方向流动，不会凭空产生或吞掉空气
    const tu = (PSI[i + NX] - PSI[i - NX]) * 0.5 * swirl;
    const tv = -(PSI[i + 1] - PSI[i - 1]) * 0.5 * swirl;
    // 有鼠标烟的地方，背景风接管得慢一些，让鼠标搅出来的涡有时间把烟卷进去
    const r = CONFIG.swirlMode ? relax / (1 + M[i] * 12) : relax;
    U[i] += (wu + tu - U[i]) * r;
    V[i] += (wv + tv - V[i]) * r;
  }
  mouseSmoke(dt, sec);
  confineVorticity(dt);
  // 风自己也被风带着走，然后投影成不可压缩的流动
  advect(U2, U, dt); advect(V2, V, dt);
  [U, U2] = [U2, U]; [V, V2] = [V2, V];
  for (let x = 0; x < NX; x++) { U[IX(x, 0)] = U[IX(x, NY - 1)] = wu; V[IX(x, 0)] = V[IX(x, NY - 1)] = wv; }
  for (let y = 0; y < NY; y++) { U[IX(0, y)] = U[IX(NX - 1, y)] = wu; V[IX(0, y)] = V[IX(NX - 1, y)] = wv; }
  project();

  // 背景烟源：形状就是按视频调好的那种细碎斜向条纹，随风漂移，持续往里补烟
  const feed = Math.min(1, dt * 12);                 // 隔行更新，所以每次补两倍
  // 隔行交替更新：这一帧更新奇数行，下一帧更新偶数行（看不出区别，计算量减半）
  for (let y = 1 + (simFrame & 1); y < NY - 1; y += 2) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    const n = SN[i] = streakNoise((x - 0.5) * SIM, (y - 0.5) * SIM, sec);
    const k = Math.max(0, Math.min(1, (n - bgLo) / Math.max(0.03, (bgHi - bgLo) * CONFIG.bgEdge)));
    const s = k * k * (3 - 2 * k);
    if (s > D[i]) D[i] += (s - D[i]) * feed;
  }
  // 自动稳定烟量：找出「让烟源覆盖率等于设定值」的门槛，门槛慢慢靠过去（一两秒），画面里的烟不会忽多忽少
  coverThreshold();
  const ad = Math.min(1, dt * 0.8);
  bgLo += (cvLo - bgLo) * ad; bgHi += (cvHi - bgHi) * ad;

  // 烟：被风带走 → 向四周化开 → 慢慢消散
  advect(D2, D, dt);
  // 化开得慢一点，旋涡和烟缕才保得住；网格变粗时按比例减小，保证在屏幕上化开的快慢不变
  const spread = Math.min(0.5, dt * 0.35 * (8 / SIM) * (8 / SIM));
  const keep = Math.exp(-dt / 0.9);                  // 离开烟源的烟很快淡掉，只留短短的烟尾
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    const nb = (D2[i - 1] + D2[i + 1] + D2[i - NX] + D2[i + NX]) * 0.25;
    D[i] = lerp(D2[i], nb, spread) * keep;
  }
  // 鼠标的烟：同样被风带走、化开，但约 2 秒才淡掉，整条路径都看得到
  advect(D2, M, dt);
  // 鼠标雾大约 fogFade 秒散完（衰减到约 8%，看不见了）；卷入模式要留着让旋涡卷，固定 2.8 秒的时间常数
  const keepM = Math.exp(-dt / (CONFIG.swirlMode ? 2.8 : Math.max(0.05, CONFIG.fogFade / 2.5)));
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const i = IX(x, y);
    const nb = (D2[i - 1] + D2[i + 1] + D2[i - NX] + D2[i + NX]) * 0.25;
    M[i] = lerp(D2[i], nb, Math.min(0.5, spread * (CONFIG.swirlMode ? 0.5 : CONFIG.fogSpread))) * keepM;
  }
  // 雾里的纹理只在有雾的格子算，按模拟格算一次，画字时直接查表（比每个字单独算快很多）
  if (!CONFIG.swirlMode)
    for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
      const i = IX(x, y);
      if (M[i] > 0.015) { FT[i] = fogTex((x - 0.5) * SIM, (y - 0.5) * SIM, sec); FL[i] = fogDarkAt((x - 0.5) * SIM, (y - 0.5) * SIM, sec); }
      else { FT[i] = 0; FL[i] = 0; }
    }
  // 边缘细碎扰动：小尺度噪声（约 2~4 个字大小），随风漂移、慢慢变化；隔帧更新省时间
  if (simFrame % 2 === 0) {
    const dr = sec * CONFIG.airSpeed / dpr / SIM;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++)
      RG[IX(x, y)] = noise((x - dr * SA) * 0.33 + 900, (y - dr * SB) * 0.5, sec * 0.35);
    // 薄雾：用同一套气流纹理，但门槛低很多 → 覆盖烟带四周更大的范围，和烟带连成一片
    if (CONFIG.hazeAmount > 0) {
      const lo = bgLo - CONFIG.hazeAmount, hi = lo + CONFIG.hazeAmount + 0.05;
      for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
        const i = IX(x, y);
        const k = Math.max(0, Math.min(1, (SN[i] - lo) / (hi - lo)));
        HZ[i] = k * k * (3 - 2 * k);
      }
    }
  }
  // 边缘：烟可以从边上飘出去（取相邻格的值）
  for (let x = 0; x < NX; x++) { D[IX(x, 0)] = D[IX(x, 1)]; D[IX(x, NY - 1)] = D[IX(x, NY - 2)]; }
  for (let y = 0; y < NY; y++) { D[IX(0, y)] = D[IX(1, y)]; D[IX(NX - 1, y)] = D[IX(NX - 2, y)]; }
}

// 气流纹理：斜向、会弯折分叉的条纹噪声，整体随风往右下漂（返回约 0~1）
function streakNoise(x, y, sec) {
  const tf = sec * 0.04 * (CONFIG.airSpeed / 58);     // 形状变化（极慢）
  const drift = sec * CONFIG.airSpeed / dpr;
  const v = -x * SB + y * SA;
  const lag = (noise(v * 0.004, tf * 2, 7) - 0.5) * 120;
  const u = x * SA + y * SB - drift + lag;
  const wu = (noise(u * 0.0035, v * 0.006, tf + 50) - 0.5) * 7 * CONFIG.bgWarp;
  const wv = (noise(u * 0.005 + 20, v * 0.005, tf + 80) - 0.5) * 7 * CONFIG.bgWarp;
  // 和视频同比例对比后：烟带更粗、更长、更连贯（频率降低），边缘仍有细碎毛边
  const f = CONFIG.bgScale;
  const g = f * CONFIG.bgThick;
  // 扭曲幅度跟着烟团大小一起缩放：烟团变大时扭曲不会把它撕成碎块，而是整条弯曲的烟带
  const L = CONFIG.bgLen;
  const n = noise(u * 0.0075 * f * L + wu * f, v * 0.015 * g + wv * g, tf) * (1 - CONFIG.bgRough)
          + noise(u * 0.022 * f * L + 30 + wu * f, v * 0.04 * g + wv * g, tf) * CONFIG.bgRough;
  return n;
}

// 鼠标搅起的雾里的纹理：同一套气流纹理，门槛低很多 → 雾里能看到一道道斜向流动的条纹（视频里就是这样）
// 对照视频：雾里是一道道细长、互相大致平行的斜线（顺着风向），不是一团团弯曲的虫状
function fogTex(x, y, sec) {
  const drift = sec * CONFIG.airSpeed / dpr;
  const u = x * SA + y * SB - drift;                 // 沿风向
  const v = -x * SB + y * SA;                        // 垂直风向
  // 沿风向拉得很长、垂直方向很细；再轻轻弯一下，线条不会死板
  const bend = (noise(u * 0.002, v * 0.004, sec * 0.03 + 60) - 0.5) * 3;
  const n = noise(u * 0.0045, v * 0.055 + bend, sec * 0.05 + 90);
  const k = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
  const lines = k * k * (3 - 2 * k);
  // 层次（对照视频测量）：再叠一层几百像素大小的浓淡斑块，雾里有厚有薄，才有深度感
  const ds = CONFIG.fogDepthScale;
  const dn = noise(u * 0.006 * ds + 300, v * 0.009 * ds, sec * 0.08);
  const dk = Math.max(0, Math.min(1, (dn - CONFIG.fogDepthLo) / (CONFIG.fogDepthHi - CONFIG.fogDepthLo)));
  const depth = dk * dk * (3 - 2 * dk);
  return depth * (0.45 + 0.55 * lines);
}

// 雾里的「暗区」：一个平滑连续的暗度场（0 = 不变暗，1 = 最暗），随风飘动。
// 尺度比斜纹大好几倍 → 暗区横跨好几个到十几个字；边缘是渐变，不会有单个字突然变暗
function fogDarkAt(x, y, sec) {
  const drift = sec * CONFIG.airSpeed / dpr;
  const u = x * SA + y * SB - drift, v = -x * SB + y * SA;
  const s = CONFIG.fogDarkScale;
  const n = noise(u * 0.011 * s + 500, v * 0.024 * s, sec * 0.06)
          + (noise(u * 0.03 * s + 700, v * 0.05 * s, sec * 0.1) - 0.5) * 0.25;   // 边缘轻微不规则
  // 噪声越低越暗；在门槛附近用一段较宽的平滑过渡
  const k = Math.max(0, Math.min(1, (CONFIG.fogHoles + CONFIG.fogDarkSoft - n) / (2 * CONFIG.fogDarkSoft)));
  return k * k * (3 - 2 * k);
}

// 背景烟源（按视频调过：覆盖约 3%）：只取气流纹理里最浓的那一小部分
// 求门槛：让整屏里「纹理值高于门槛」的格子正好占 smokeAmount 这么多（用直方图找分位点）
function coverThreshold() {
  SN_HIST.fill(0); let total = 0;
  for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) {
    const b = Math.max(0, Math.min(255, (SN[IX(x, y)] * 256) | 0)); SN_HIST[b]++; total++;
  }
  const want = total * Math.max(0.01, Math.min(0.99, CONFIG.smokeAmount)), top = total * 0.01;
  let acc = 0; cvHi = -1; cvLo = 0;
  for (let b = 255; b >= 0; b--) {
    acc += SN_HIST[b];
    if (cvHi < 0 && acc >= top) cvHi = b / 256;          // 最浓的 1% 从这里开始
    if (acc >= want) { cvLo = b / 256; break; }          // 烟源从这里开始
  }
  if (cvHi < cvLo + 0.03) cvHi = cvLo + 0.03;
}
