// ===== Wallpaper Engine 设置接口（必须放在全局，载入时就要存在）=====
const weColor = v => v.split(' ').map(c => Math.round(parseFloat(c) * 255));
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    let rebuild = false;
    if (p.glowcolor)   { CONFIG.glow = weColor(p.glowcolor.value); rebuild = true; }
    if (p.textcolor)   { CONFIG.dim  = weColor(p.textcolor.value); rebuild = true; }
    if (p.bgcolor)     { CONFIG.bg   = weColor(p.bgcolor.value); rebuild = true;
                         document.body.style.background = `rgb(${CONFIG.bg})`; }
    if (p.speed)       CONFIG.speed = p.speed.value / 1000;                 // 滑块 0~200
    if (p.patternsize) CONFIG.scale = 0.0035 * 50 / Math.max(5, p.patternsize.value);
    if (p.bandwidth)   CONFIG.bandWidth = p.bandwidth.value / 100;
    if (p.flicker)     CONFIG.flicker = p.flicker.value / 1000;
    if (p.density)     { CONFIG.baseDensity = p.density.value / 100; if (chars) resetChars(); }
    if (p.hoverradius) CONFIG.hoverRadius = p.hoverradius.value;
    if (p.hoverstrength) CONFIG.hoverStrength = p.hoverstrength.value / 100;
    if (p.ambient)     CONFIG.ambient = p.ambient.value;
    if (p.flowspeed)   CONFIG.airSpeed = 58 * p.flowspeed.value / 100;
    if (p.smokeamount) CONFIG.smokeAmount = p.smokeamount.value / 100;
    if (p.swirlmode)   CONFIG.swirlMode = p.swirlmode.value;
    if (p.trailenabled) CONFIG.cursorEnabled = p.trailenabled.value;
    if (p.trailradius) CONFIG.cursorRadius = p.trailradius.value;
    if (p.trailstrength) CONFIG.cursorStrength = p.trailstrength.value / 100;
    if (p.traillife) CONFIG.cursorPulse = p.traillife.value / 100;
    if (p.trailsoftness) CONFIG.cursorSoftness = p.trailsoftness.value / 100;
    if (p.clickripples) CONFIG.rippleEnabled = p.clickripples.value;
    if (p.backgroundcontrast) CONFIG.bgContrast = p.backgroundcontrast.value / 100;
    if (p.rippleradius) CONFIG.rippleRadius = p.rippleradius.value / 100;
    if (p.ripplelife) CONFIG.rippleLife = p.ripplelife.value / 60;
    if (p.ripplestrength) CONFIG.rippleStrength = p.ripplestrength.value / 100;
    if (p.mousefill) CONFIG.mouseFill = p.mousefill.value / 100;
    if (p.heartchance) CONFIG.heartChance = p.heartchance.value / 100;
    if (p.charsize)    { CONFIG.charScale = p.charsize.value / 100; if (atlas) { resize(); return; } }
    if (rebuild && atlas) buildAtlas();
  },
  applyGeneralProperties(p) {
    if (p.fps !== undefined) CONFIG.fps = p.fps;
  },
};
