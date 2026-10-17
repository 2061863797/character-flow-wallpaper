// ===== 默认参数（在 Wallpaper Engine 里可被用户设置覆盖）=====
const CONFIG = {
  bgContrast: 1,
  rippleEnabled: true,
  rippleRadius: 1,
  rippleLife: 1,
  rippleStrength: 1,
  mouseFill: 1,
  rippleScatter: 1,     // 点击圆环的分散度：越大圈越歪、越容易断开碎散（0 = 规整的圆）
  heartChance: 0.33,   // 点击时出现爱心形圆环的概率（视频里大约三次有一次是爱心）
  // 字符尺寸按「屏幕实际像素」定，视频实测：格子 8×16，字高约 10
  devCellW: 8,
  devCellH: 16,
  devFont: 10,
  charScale: 1,          // 字符大小倍数（设置里的「字符大小」）
  cellW: 0, cellH: 0, fontSize: 0, // 由 resize() 换算成页面像素
  bg: [20, 20, 20],      // 背景色（视频实测）
  dim: [43, 43, 43],     // 平时最亮的字符颜色（视频实测）
  bgScale: 0.45,          // 背景烟团大小（越小烟团越大、越成块）
  bgThick: 1,             // 背景烟条粗细（越小越粗；只改宽度不改长度）
  bgLen: 0.8,            // 背景烟条顺风方向的长短（越小越长）——对照视频：顺着风的细长斜条，像柳叶，两头尖
  bgWarp: 0.45,          // 烟条弯曲程度（视频里烟条比较直，不是弯来弯去的虫状）
  bgRough: 0.32,         // 烟条边缘的细碎程度（视频里边缘有毛边）
  bgGain: 1.25,         // 背景烟浓度（越大越浓、越亮）
  bgFill: 3.5,          // 背景烟团里出字的满度（越大，烟团里空格越少）
  bgEdge: 1,            // 背景烟团边缘过渡宽度（越小边缘越利落、烟团越实）
  charJitter: 0.06,     // 每个字亮度的随机起伏（越小，相邻字越平滑）
  bgRowShift: 25,       // 每一行字左右错开的幅度（像素）→ 边缘参差不齐
  bgRagged: 0.3,        // 边缘细碎扰动强度 → 边缘破碎、带小碎块和零星字
  hazeAmount: 0.1,        // 烟带外围极淡薄雾的范围（越大薄雾铺得越开）
  hazeLevel: 0.08,      // 薄雾的亮度（很淡，只比背景亮一两级）
  hazeFill: 0.5,        // 薄雾里出字的比例（稀疏的点和短横）
  bgMin: 0.17,            // 烟团边缘淡字的最低亮度（视频里边缘有很多很淡但看得见的字）
  bgPow: 1.1,           // 背景烟亮度曲线（越小，中等浓度的地方越亮）
  bgBright: 1.03,         // 背景烟最亮处的亮度倍数（>1 时最浓处可以略亮于平时的灰，对齐视频）
  smokeAmount: 0.4,      // 背景烟量：烟源占画面的比例（自动保持稳定）
  airSpeed: 58,          // 风速：烟整体往右下飘的速度（屏幕像素/秒，视频实测约 58）
  glow: [40, 116, 164],  // 点击扩散的光带颜色（蓝，视频实测最亮处）
  speed: 0.06,           // 点击扩散的快慢
  scale: 0.0035,         // 点击扩散的范围（越小圈越大）
  bandWidth: 0.4,        // 光带粗细（0~1）
  flicker: 0.02,         // 每帧字符随机变化比例
  baseDensity: 1,        // 字符密度
  hoverRadius: 90,       // 鼠标影响半径（像素）
  hoverStrength: 0.6,    // 鼠标滑过加深程度（0~1）
  // 鼠标雾的亮度与斑块（对照视频测量调出来的）
  fogBase: 0.8, fogGain: 2.0, fogCap: 0.53, fogDepthLo: 0.4, fogDepthHi: 0.6, fogDepthScale: 0.6,
  fogFill: 24,           // 雾里出字的多少（越大越满）
  fogWidth: 1.0,         // 鼠标每划一下影响的宽度（相对「鼠标影响范围」的倍数）
  fogRate: 14,           // 鼠标来回划时雾变浓的速度
  fogFade: 1,         // 鼠标停下后雾大约多少秒散完（设置里的「鼠标雾消散时间」）
  fogSpread: 0.5,       // 雾随时间往四周化开的程度（视频里一开始窄，之后慢慢铺开）
  fogHoles: 0.4,        // 雾里暗区占多少（越大暗区越多）
  fogDarkDim: 0.3,       // 暗区最暗处的亮度（相对正常的比例，字还在，只是更暗）
  fogDarkScale: 0.45,    // 暗区大小（越小，暗区越大）
  fogDarkSoft: 0.12,     // 暗区边缘过渡的宽度（越大越平滑）
  fogMinVis: 0.14,         // 雾里字的最低亮度，避免暗斑块整片看不见变成大黑洞
  fogCurve: 0.75,        // 薄雾里的字有多容易看见（越小，薄雾处的字越亮、看得见的字越多）
  swirlMode: false,      // 鼠标卷入模式：开启后鼠标划过会留下左右交替的旋涡，把烟卷进来
  fps: 30,               // 0 表示不限帧
};
// 画面里用到的全部字符
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const NL = LETTERS.length;
const GRAY_LEVELS = 25;  // 灰色深浅分级：0 接近背景，中间是平时最亮，顶端是鼠标加深
const GLOW_LEVELS = 32;  // 蓝色分级（扩散用）：分得细，蓝色淡出时不会一档档跳、整片字一起消失
const MAX_RIPPLES = 10;  // 同时存在的扩散圈上限
