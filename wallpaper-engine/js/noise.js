// ===== 3D Perlin 噪声（返回约 0~1）=====
const perm = new Uint8Array(512);
{ const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(hash, x, y, z) {
  const h = hash & 15, u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
function noise(x, y, z) {
  // 先把坐标整体旋转一个固定角度：时间轴不再和网格线平行。
  // 否则时间每走到整数格点，整片噪声起伏都会变小，烟会在开屏时和之后周期性地整屏变淡。
  { const xy = x + y, s2 = xy * -0.211324865405187, zz = z * 0.577350269189626;
    const xr = x + s2 - zz, yr = y + s2 - zz; z = xy * 0.577350269189626 + zz; x = xr; y = yr; }
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  const n = lerp(
    lerp(lerp(grad(perm[AA], x, y, z),     grad(perm[BA], x - 1, y, z), u),
         lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1),     grad(perm[BA + 1], x - 1, y, z - 1), u),
         lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
    w);
  return n * 0.5 + 0.5;
}
