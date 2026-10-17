// ===== Wallpaper Engine 设置接口（必须放在全局，载入时就要存在）=====
const weColor = v => v.split(' ').map(c => Math.round(parseFloat(c) * 255));
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    let rebuild = false;
    if (p.glowcolor)   { CONFIG.glow = weColor(p.glowcolor.value); rebuild = true; }
    if (p.textcolor)   { CONFIG.dim  = weColor(p.textcolor.value); rebuild = true; }
    if (p.bgcolor)     { CONFIG.bg   = weColor(p.bgcolor.value); rebuild = true;
                         document.body.style.background = `rgb(${CONFIG.bg})`; }
    if (p.bandwidth)   CONFIG.bandWidth = p.bandwidth.value / 100;
    if (p.flicker)     CONFIG.flicker = p.flicker.value / 1000;
    if (p.density)     { CONFIG.baseDensity = p.density.value / 100; if (chars) resetChars(); }
    if (p.hoverradius) CONFIG.hoverRadius = p.hoverradius.value;
    if (p.hoverstrength) CONFIG.hoverStrength = p.hoverstrength.value / 100;
    if (p.flowspeed)   CONFIG.airSpeed = 58 * p.flowspeed.value / 100;
    if (p.smokeamount) CONFIG.smokeAmount = p.smokeamount.value / 100;
    if (p.swirlmode)   CONFIG.swirlMode = p.swirlmode.value;
    if (p.clickripples) CONFIG.rippleEnabled = p.clickripples.value;
    if (p.backgroundcontrast) CONFIG.bgContrast = p.backgroundcontrast.value / 100;
    if (p.rippleradius) CONFIG.rippleRadius = p.rippleradius.value / 100;
    if (p.ripplespeed) CONFIG.rippleSpeed = p.ripplespeed.value / 100;
    if (p.ripplestrength) CONFIG.rippleStrength = p.ripplestrength.value / 100;
    if (p.mousefill) CONFIG.mouseFill = p.mousefill.value / 100;
    if (p.ripplewind)  CONFIG.rippleWind = p.ripplewind.value / 100;
    if (p.ripplescatter) CONFIG.rippleScatter = p.ripplescatter.value / 100;
    if (p.fogfade)     CONFIG.fogFade = p.fogfade.value / 10;               // 滑块单位 0.1 秒
    if (p.charsize)    { CONFIG.charScale = p.charsize.value / 100; if (atlas) { layoutChars(); rebuild = false; } }
    if (rebuild && atlas) buildAtlas();
  },
  applyGeneralProperties(p) {
    if (p.fps !== undefined) CONFIG.fps = p.fps;
  },
};
