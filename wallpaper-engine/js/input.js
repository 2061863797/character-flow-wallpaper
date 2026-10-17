// ===== 鼠标：滑过留下变亮的拖尾，点击产生扩散圈 =====
const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, inside: false };
const ripples = [];
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; });
addEventListener('mouseout', () => { mouse.inside = false; mouse.px = mouse.py = -9999; });   // 忘掉旧位置，回来时不会从旧位置连一条线
let clickCount = 0;
addEventListener('mousedown', e => {
  if (!CONFIG.rippleEnabled) return;
  // 形状固定按「圆、圆、爱心」循环
  const heart = clickCount++ % 3 === 2;
  ripples.push({ x: e.clientX, y: e.clientY, born: performance.now(), seed: Math.random() * 100, heart });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
});
