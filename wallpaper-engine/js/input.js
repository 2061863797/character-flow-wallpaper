// ===== 鼠标（和手指触摸）：滑过留下变亮的拖尾，点击产生扩散圈 =====
// 用 pointer 事件：鼠标和触摸屏都能用（网页版在手机上也能划、能点）
const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, inside: false };
const ripples = [];
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; });
// 离开窗口或手指抬起：忘掉旧位置，回来时不会从旧位置连一条线
const forget = () => { mouse.inside = false; mouse.px = mouse.py = -9999; };
addEventListener('pointerout', e => { if (!e.relatedTarget) forget(); });
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') forget(); });
let clickCount = 0;
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.px = mouse.py = -9999; mouse.inside = true; }
  if (!CONFIG.rippleEnabled) return;
  // 形状固定按「圆、圆、爱心」循环
  const heart = clickCount++ % 3 === 2;
  ripples.push({ x: e.clientX, y: e.clientY, born: performance.now(), seed: Math.random() * 100, heart });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
});
