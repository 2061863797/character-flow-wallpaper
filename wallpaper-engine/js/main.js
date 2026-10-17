// ===== 主循环 =====
let last = 0, rowOff, ripG = 0, ripGr = 0, ripCv = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // 限帧：留 2 毫秒余量。60Hz 屏幕两帧间隔加起来≈33.33ms，严格比较会因为小数误差被跳过，30 帧实际只剩 20 帧
  if (CONFIG.fps > 0 && now - last < 1000 / CONFIG.fps - 2) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sec = now / 1000;
  const { cellW: W, cellH: H } = CONFIG;
  while (ripples.length && rippleAge(ripples[0], now) > RIPPLE_END) ripples.shift();
  const hasRipple = CONFIG.rippleEnabled && ripples.length > 0;
  if (hasRipple) rippleTables(now);

  stepSmoke(dt, sec);
  // 每一行字的左右错位：相邻行错开不同的距离，烟的边缘就成了参差的台阶状（视频里就是这样）
  if (!rowOff || rowOff.length !== rows) rowOff = new Float32Array(rows);
  for (let r = 0; r < rows; r++)
    rowOff[r] = ((noise(r * 0.45 + 3, sec * 0.15, 13) - 0.5) * 0.7 + (noise(r * 1.7 + 50, sec * 0.25, 17) - 0.5) * 0.3) * CONFIG.bgRowShift * 2;
  frameBuf.fill(bgPacked);   // 整帧先铺背景色

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * W, y = r * H;
      // 每个字的蓝色亮度略有不同（视频里圈上是连成一段段的蓝字，起伏不大）
      let glow = 0, ripGray = 0;
      if (hasRipple) {
        // 蓝圈每两格算一次、相邻两格共用（一格才 8 像素宽，看不出区别，计算量减半）
        if ((c & 1) === 0) { ripG = rippleAt(x + W / 2, y); ripGr = rippleGray; ripCv = rippleConv; }
        const jj = 0.8 + 0.4 * jitter2[i];
        glow = ripG * jj; ripGray = Math.min(0.3, ripGr * 0.85 * CONFIG.rippleStrength * 3.5 * jj);
      }
      // 这个字所在位置的烟雾浓度 → 字的亮度（烟越浓越亮，最亮就是平时的灰）
      const gx = (x + W / 2) / SIM + 0.5, gy = (y + H / 2) / SIM + 0.5;
      const ms = sample(M, gx, gy) * CONFIG.mouseFill;
      // 默认模式下鼠标搅起的雾（对照视频）：雾里几乎每格都出字，亮度由流动纹理决定，是满满一片带斜纹的淡字；
      // 亮度范围拉开（暗处几乎贴着背景，亮处到平时的灰），薄的地方字也更稀
      let fogVis = 0;
      if (ms > 0.02 && !CONFIG.swirlMode) {
        const ft = sample(FT, gx, gy);
        // 暗区：从暗度场平滑取值，越靠暗区中心越暗；字仍然在，只是更暗
        const dark = sample(FL, gx, gy);
        if (dither[i] < ms * CONFIG.fogFill * (0.45 + 0.55 * ft)) {
          const strength = Math.min(1, Math.pow(ms * 2.2, CONFIG.fogCurve));
          fogVis = Math.min(CONFIG.fogCap, Math.max(CONFIG.fogMinVis * strength,
            0.5 * strength * (CONFIG.fogBase + CONFIG.fogGain * ft) * jitter[i]));
          fogVis *= 1 - (1 - CONFIG.fogDarkDim) * dark;
        }
      }
      const gxs = gx + rowOff[r] / SIM;
      const smoke = Math.max(sample(D, gxs, gy), CONFIG.swirlMode ? ms : 0);
      // 点击扩散的格子闪得更快、更密
      if (Math.random() < CONFIG.flicker * (1 + glow * 4)) {
        const density = lerp(CONFIG.baseDensity, 1, glow);
        // 换字时直接换成另一个字母，不会出现空格（密度设为 100% 时每格永远有字）
        chars[i] = Math.random() < density
          ? (Math.max(0, chars[i]) + 1 + Math.random() * (NL - 1)) % NL | 0 : -1;
        // 圈里只换字母，不重抽亮度和出不出字（否则字会突然消失或冒出来）
        if (glow < 0.02) {
          jitter[i] = 1 - CONFIG.charJitter * Math.random();
          jitter2[i] = Math.random();
          dither[i] = Math.random();
        }
      }
      const ch = chars[i];
      // 浓度 → 灰度（对照视频）：很淡的烟直接算黑，空白处干净；大部分字很暗，只有烟最浓的中心接近平时的灰（刻度 0.5）。
      // 边缘越往外越暗，字也越来越稀，最后零星几个淡点融进黑色
      let sk0 = Math.max(0, Math.min(1, (smoke * CONFIG.bgGain - 0.04) / 0.96));
      // 只在边缘（不浓不淡的地方）加细碎扰动：中心不受影响，边缘被打碎成小块和零星字
      const rgv = sample(RG, gxs, gy);
      if (sk0 > 0 && sk0 < 1) sk0 = Math.max(0, Math.min(1, sk0 + (rgv - 0.5) * CONFIG.bgRagged * 4 * sk0 * (1 - sk0)));
      // 出不出字的门槛：大部分由平滑的细噪声决定（相邻几个字一起出现、一起消失，连成一小段），
      // 只留一点随机——视频里烟的边缘是一段段连着的字慢慢变暗，几乎没有「一排字中间空一格」或单独冒出一个字
      const coh = Math.max(0, Math.min(1, (rgv - 0.25) * 2));
      const thr = 0.8 * coh + 0.2 * dither[i];
      const sk = sk0 * sk0 * (3 - 2 * sk0);
      const sparse = thr < sk * CONFIG.bgFill;           // 浓度低的边缘只有一部分格子出字，烟团里面几乎满格
      const bgVis = sparse ? Math.max(CONFIG.bgMin * CONFIG.bgContrast * Math.min(1, sk * 4), 0.5 * CONFIG.bgBright * CONFIG.bgContrast * Math.pow(sk, CONFIG.bgPow) * jitter[i]) : 0;
      // 薄雾：烟带外围很淡、很稀的点和短横
      let hazeVis = 0, hz = 0;
      if (CONFIG.hazeAmount > 0) {
        hz = sample(HZ, gxs, gy);
        if (hz > 0.01 && 0.8 * (1 - coh) + 0.2 * ((dither[i] * 3.17) % 1) < hz * CONFIG.hazeFill) hazeVis = CONFIG.hazeLevel * (0.5 + 0.5 * hz) * jitter[i];
      }
      // 蓝圈处不额外加灰：颜色从「原来这格的灰」往蓝色过渡，空白处就是从背景色变蓝（越弱越暗）
      // 圈褪色后留下的灰字（视频里蓝圈最后变成一圈淡灰的字再消失）
      let smokeVis = Math.max(bgVis, hazeVis, fogVis);
      // 圈里所有的灰字（背景烟、鼠标雾、外围薄雾）整片染成蓝（视频里烟和雾所在的地方都变成一大块均匀的蓝），之后慢慢变回灰；字一直都在。
      // 按平滑的浓度来染，不按每个字自己的亮度——否则原本稀疏、忽明忽暗的字会被一个个点亮，显得突兀
      const dens = Math.max(sk, CONFIG.swirlMode ? 0 : Math.min(1, ms * 2.2), hz * 0.4);
      if (hasRipple && ripCv > 0 && dens > 0) {
        glow = Math.min(1, glow + dens * 0.4 * ripCv * CONFIG.rippleStrength);
        smokeVis *= 1 - ripCv;
      }
      const vis = Math.max(smokeVis, ripGray);
      const g = Math.round(Math.min(1, vis) * (GRAY_LEVELS - 1));
      // 取整的位置按平滑的细噪声错开：同一片蓝慢慢变淡时，是一小段一小段先后淡掉，
      // 既不会整片同一帧一起消失，也不会相邻的字一个亮一个灭
      const b = Math.floor(Math.min(1, glow) * (GLOW_LEVELS - 1) + (hasRipple ? 0.1 + 0.8 * coh : 0.5));
      if (ch < 0 || (g === 0 && b === 0)) continue;
      blitGlyph(ch, g * GLOW_LEVELS + b, c * GW, r * GH);
    }
  }
  ctx.putImageData(frameImg, 0, 0);   // 一次性贴到屏幕上
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
