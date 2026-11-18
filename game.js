/**
 * 3D 极速赛车 - QQ飞车风格高级动力学引擎 + 震撼视听特效
 */

// ── DOM 节点 ──
const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const title = document.querySelector("#title");
const message = document.querySelector("#message");
const scoreEl = document.querySelector("#score");
const speedEl = document.querySelector("#speed");
const bestEl = document.querySelector("#best");
const nitroBar = document.querySelector("#nitroBar");
const playerNameInput = document.querySelector("#playerName");
const leaderboardList = document.querySelector("#leaderboardList");
const refreshRanks = document.querySelector("#refreshRanks");
const serverDot = document.querySelector("#serverDot");
const serverText = document.querySelector("#serverText");
const brandTitle = document.querySelector("#brandTitle");
const quickSceneSelect = document.querySelector("#quickSceneSelect");
const audioToggle = document.querySelector("#audioToggle");

// ── 游戏基础变量 ──
let running = false;
let score = 0;
let nitro = 100;
let baseSpeed = 1.0;
let currentSpeed = 1.0;
let boosting = false;
let frame = 0;
const keys = {};

let best = Number(localStorage.getItem("neonRushBest") || 0);
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
bestEl.textContent = best;

let currentTheme = localStorage.getItem("racerSceneTheme") || "country";

// ── API 接口 ──
const api = {
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`GET ${path} failed`);
    return response.json();
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`POST ${path} failed`);
    return response.json();
  }
};

// ═══════════════════════════════════════
// Web Audio 声音合成系统 (无需下载任何外部音频文件)
// ═══════════════════════════════════════
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.setupEngineSound();
      this.startBGM();
    } catch (e) {
      console.warn("AudioContext not supported", e);
    }
  }

  setupEngineSound() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.setValueAtTime(65, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
  }

  updateEngine(speed, isBoosting) {
    if (!this.ctx || !this.engineOsc || !this.enabled) return;
    // 随车速平滑拉高转速频率
    const targetFreq = 70 + speed * 60 + (isBoosting ? 50 : 0);
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
  }

  playBoost() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    // 爆裂破风声
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playCoin() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playCrash() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    // 爆炸重击音 (低频冲激 + 爆裂噪声)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  startBGM() {
    if (!this.ctx || this.bgmTimer) return;
    const bassNotes = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    this.bgmTimer = setInterval(() => {
      if (!this.enabled || !running) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      const freq = bassNotes[this.bgmStep % bassNotes.length];
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      this.bgmStep++;
    }, 220);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.engineGain) {
      this.engineGain.gain.setValueAtTime(this.enabled ? 0.04 : 0, this.ctx.currentTime);
    }
    return this.enabled;
  }
}

const sound = new SoundEngine();

// 触觉震动马达
function triggerHaptic(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

// ═══════════════════════════════════════
// THREE.JS 3D 渲染器与场景
// ═══════════════════════════════════════
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

// 灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
sunLight.position.set(25, 45, 20);
scene.add(sunLight);

const carPointLight = new THREE.PointLight(0x00f0ff, 1.6, 12);
scene.add(carPointLight);

// 镜头创伤震动系统 (Trauma Shake)
let cameraTrauma = 0;

// ═══════════════════════════════════════
// 赛道与自然场景配置
// ═══════════════════════════════════════
const ROAD_WIDTH = 22;
const LANE_COUNT = 4;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 140;
const ROAD_SEGMENTS = 4;
const TOTAL_ROAD_LEN = ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS;

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const roadSegments = [];
const sceneryObjects = [];

const THEMES = {
  country: {
    name: "COUNTRY ROAD",
    skyColor: 0x7db7f0,
    fogColor: 0xa8d5a2,
    fogDensity: 0.006,
    ambientColor: 0xffffff,
    sunColor: 0xfff6dd,
    sunIntensity: 1.8,
    roadColor: 0x3a3c42,
    roadRoughness: 0.8,
    terrainColor: 0x4f8f3c,
    stripeColor: 0xffffff,
    railColor: 0x8b5a2b,
    particleColor: 0xd4a373
  },
  island: {
    name: "ISLAND ESCAPE",
    skyColor: 0x38b6ff,
    fogColor: 0x64d8cb,
    fogDensity: 0.0055,
    ambientColor: 0xe0f7fa,
    sunColor: 0xfff0b3,
    sunIntensity: 2.1,
    roadColor: 0x424953,
    roadRoughness: 0.6,
    terrainColor: 0xe9d8a6,
    stripeColor: 0xffea00,
    railColor: 0xffffff,
    particleColor: 0xf4a261
  },
  jungle: {
    name: "JUNGLE ODYSSEY",
    skyColor: 0x133c25,
    fogColor: 0x1f4e38,
    fogDensity: 0.0085,
    ambientColor: 0xa7d7c5,
    sunColor: 0xccffcc,
    sunIntensity: 1.6,
    roadColor: 0x2b221b,
    roadRoughness: 0.9,
    terrainColor: 0x1a4329,
    stripeColor: 0x88d49e,
    railColor: 0x3d2b1f,
    particleColor: 0x588157
  },
  river: {
    name: "CANYON RIVER",
    skyColor: 0x5c80bc,
    fogColor: 0x8ecae6,
    fogDensity: 0.0065,
    ambientColor: 0xdde5ed,
    sunColor: 0xffffff,
    sunIntensity: 1.9,
    roadColor: 0x33353a,
    roadRoughness: 0.7,
    terrainColor: 0x8a5a44,
    stripeColor: 0xffffff,
    railColor: 0x219ebc,
    particleColor: 0xade8f4
  }
};

// 景观树木/椰树/岩石模型
function createCountryTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 3.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
  );
  trunk.position.y = 1.75;
  tree.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.3, 1),
    new THREE.MeshStandardMaterial({ color: 0x38761d, roughness: 0.8 })
  );
  foliage.position.y = 4.3;
  tree.add(foliage);
  return tree;
}

function createPalmTree() {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, 6.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 })
  );
  trunk.position.y = 3.25;
  palm.add(trunk);

  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 })
    );
    leaf.position.set(0, 6.3, 0);
    leaf.rotation.z = Math.PI / 2.8;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    palm.add(leaf);
  }
  return palm;
}

function createJunglePlant() {
  const plant = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.9, 4.0, 6),
    new THREE.MeshStandardMaterial({ color: 0x241e17, roughness: 1.0 })
  );
  trunk.position.y = 2.0;
  plant.add(trunk);

  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.6 })
    );
    leaf.position.set(0, 3.8 + i * 0.4, 0);
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    plant.add(leaf);
  }
  return plant;
}

function createCanyonRock() {
  const rock = new THREE.Group();
  const rMesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(3.5, 1),
    new THREE.MeshStandardMaterial({ color: 0x7f4f24, roughness: 0.95 })
  );
  rMesh.scale.set(1.2, 2.0, 1.2);
  rMesh.position.y = 3.5;
  rock.add(rMesh);
  return rock;
}

function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.country;
  currentTheme = themeKey;
  localStorage.setItem("racerSceneTheme", themeKey);

  if (brandTitle) brandTitle.textContent = theme.name;
  if (quickSceneSelect) quickSceneSelect.value = themeKey;

  document.querySelectorAll(".theme-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.theme === themeKey);
  });

  scene.background = new THREE.Color(theme.skyColor);
  scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

  ambientLight.color.setHex(theme.ambientColor);
  sunLight.color.setHex(theme.sunColor);
  sunLight.intensity = theme.sunIntensity;

  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  roadSegments.length = 0;
  sceneryObjects.length = 0;

  for (let i = 0; i < ROAD_SEGMENTS; i++) {
    buildRoadSegment(-i * ROAD_SEGMENT_LENGTH, theme);
  }

  for (let i = 0; i < 40; i++) {
    let item;
    if (themeKey === "country") item = createCountryTree();
    else if (themeKey === "island") item = createPalmTree();
    else if (themeKey === "jungle") item = createJunglePlant();
    else item = createCanyonRock();

    const side = i % 2 === 0 ? -1 : 1;
    const offset = ROAD_WIDTH / 2 + 5 + Math.random() * 32;
    item.position.set(side * offset, 0, -Math.random() * TOTAL_ROAD_LEN);
    worldGroup.add(item);
    sceneryObjects.push(item);
  }
}

function buildRoadSegment(zOffset, theme) {
  const seg = new THREE.Group();
  seg.position.z = zOffset;

  // 大地地表
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(280, ROAD_SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({ color: theme.terrainColor, roughness: 0.9 })
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05;
  seg.add(terrain);

  // 荒岛或峡谷右侧流动大河
  if (currentTheme === "island" || currentTheme === "river") {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(120, ROAD_SEGMENT_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.1, metalness: 0.8 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(ROAD_WIDTH / 2 + 65, 0.1, 0);
    seg.add(water);
  }

  // 沥青主干道
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({ color: theme.roadColor, roughness: theme.roadRoughness, metalness: 0.25 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  seg.add(road);

  // 车道虚线
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = -ROAD_WIDTH / 2 + i * LANE_WIDTH;
    for (let s = 0; s < 10; s++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 6),
        new THREE.MeshBasicMaterial({ color: theme.stripeColor })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(laneX, 0.04, -ROAD_SEGMENT_LENGTH / 2 + s * 14 + 3);
      seg.add(stripe);
    }
  }

  // 护栏
  const railGeo = new THREE.BoxGeometry(0.35, 0.65, ROAD_SEGMENT_LENGTH);
  const railMat = new THREE.MeshStandardMaterial({ color: theme.railColor, roughness: 0.7 });

  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-ROAD_WIDTH / 2 - 0.2, 0.35, 0);
  seg.add(railL);

  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(ROAD_WIDTH / 2 + 0.2, 0.35, 0);
  seg.add(railR);

  worldGroup.add(seg);
  roadSegments.push(seg);
}

// ═══════════════════════════════════════
// 顶级 3D 超跑模型（流线楔形、宽体碳纤维、刹车卡钳、轮毂）
// ═══════════════════════════════════════
function createSuperCar(isPlayer = true, primaryColor = 0x00d4ff) {
  const carGroup = new THREE.Group();

  // 金属烤漆主材质
  const paintMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.2,
    metalness: 0.85
  });

  // 碳纤维与深色工程塑料
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.5,
    metalness: 0.8
  });

  // 1. 低趴主底盘 (流线中段)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 3.2), paintMat);
  chassis.position.set(0, 0.42, 0);
  carGroup.add(chassis);

  // 2. 楔形下探车头 (Aerodynamic Wedge Nose)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.24, 1.4), paintMat);
  nose.position.set(0, 0.32, -2.1);
  nose.rotation.x = 0.08;
  carGroup.add(nose);

  // 3. 碳纤维前唇与双侧风刀 (Front Splitter & Canards)
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), carbonMat);
  splitter.position.set(0, 0.2, -2.7);
  carGroup.add(splitter);

  // 4. 前机盖流线散热孔凹槽 (Hood Air Scoop)
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.9), carbonMat);
  scoop.position.set(0, 0.46, -1.8);
  carGroup.add(scoop);

  // 5. 战斗机座舱水滴天幕玻璃 (Fighter Jet Canopy)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x050c18,
    roughness: 0.05,
    metalness: 0.95
  });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 1.8), glassMat);
  canopy.position.set(0, 0.74, -0.3);
  canopy.rotation.x = -0.05;
  carGroup.add(canopy);

  // 6. 宽体侧裙与侧向进气导流道 (Widebody Side Skirts)
  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 2.8), carbonMat);
  skirtL.position.set(-1.12, 0.32, 0);
  carGroup.add(skirtL);

  const skirtR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 2.8), carbonMat);
  skirtR.position.set(1.12, 0.32, 0);
  carGroup.add(skirtR);

  // 7. 双层 GT 碳纤维竞技大尾翼 (GT Racing Spoiler)
  const wingGroup = new THREE.Group();
  wingGroup.position.set(0, 0.85, 1.85);

  const mainWing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.07, 0.5), paintMat);
  mainWing.position.y = 0.42;
  mainWing.rotation.x = -0.08;
  wingGroup.add(mainWing);

  // 尾翼双立柱
  const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.25), carbonMat);
  post1.position.set(-0.75, 0.22, 0);
  wingGroup.add(post1);
  const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.25), carbonMat);
  post2.position.set(0.75, 0.22, 0);
  wingGroup.add(post2);
  carGroup.add(wingGroup);

  // 8. 尾部空气动力扩散器 (Rear Diffuser)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.4), carbonMat);
  diffuser.position.set(0, 0.28, 2.2);
  diffuser.rotation.x = 0.2;
  carGroup.add(diffuser);

  // 9. 赛道级车轮 (宽胎 + 五星铝合金轮毂 + 红色刹车卡钳 + 刹车盘)
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.85 });

  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 });
  const caliperMat = new THREE.MeshBasicMaterial({ color: 0xff1e27 }); // 亮红运动卡钳

  const wheelPositions = [
    [-1.12, 0.44, -1.4], // 前左
    [ 1.12, 0.44, -1.4], // 前右
    [-1.16, 0.45,  1.3], // 后左
    [ 1.16, 0.45,  1.3]  // 后右
  ];

  wheelPositions.forEach(pos => {
    const wGroup = new THREE.Group();
    wGroup.position.set(pos[0], pos[1], pos[2]);

    // 轮胎主体
    const tire = new THREE.Mesh(tireGeo, tireMat);
    wGroup.add(tire);

    // 轮毂外圈星形
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 12), spokeMat);
    rim.rotation.z = Math.PI / 2;
    wGroup.add(rim);

    // 红色刹车卡钳
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.22), caliperMat);
    caliper.position.set(pos[0] > 0 ? -0.1 : 0.1, 0.18, 0);
    wGroup.add(caliper);

    carGroup.add(wGroup);
    wheels.push(wGroup);
  });

  // 10. 锋芒 LED 激光前大灯
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), hlMat);
  hlL.position.set(-0.72, 0.42, -2.75);
  carGroup.add(hlL);

  const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), hlMat);
  hlR.position.set(0.72, 0.42, -2.75);
  carGroup.add(hlR);

  // 11. 贯穿式赛博霓虹尾灯
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.09, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff0044 })
  );
  tail.position.set(0, 0.52, 2.18);
  carGroup.add(tail);

  // 12. 钛金双排气喉管 (Exhaust Pipes)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.95 });
  const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 12), pipeMat);
  pL.rotation.x = Math.PI / 2;
  pL.position.set(-0.5, 0.38, 2.2);
  carGroup.add(pL);

  const pR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 12), pipeMat);
  pR.rotation.x = Math.PI / 2;
  pR.position.set(0.5, 0.38, 2.2);
  carGroup.add(pR);

  // 13. 氮气火焰喷流 (Thrusters)
  const thrusters = [];
  if (isPlayer) {
    const flameGeo = new THREE.ConeGeometry(0.25, 2.5, 12);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0 });

    const fL = new THREE.Mesh(flameGeo, flameMat);
    fL.position.set(-0.5, 0.38, 3.4);
    carGroup.add(fL);
    thrusters.push(fL);

    const fR = new THREE.Mesh(flameGeo, flameMat.clone());
    fR.material.color.setHex(0xff00bb);
    fR.position.set(0.5, 0.38, 3.4);
    carGroup.add(fR);
    thrusters.push(fR);
  }

  return { group: carGroup, wheels, thrusters };
}

// 玩家赛车
const player = createSuperCar(true, 0x00f0ff);
scene.add(player.group);
player.group.position.set(0, 0, 0);

// ═══════════════════════════════════════
// 车辆物理动力学 (彻底根除后轮打滑甩尾)
// ═══════════════════════════════════════
const carPhysics = {
  x: 0,
  vx: 0,
  ax: 0,
  steerAngle: 0,
  roll: 0,
  rollVel: 0,
  yaw: 0
};

// 严谨标定的车辆参数 (前后轴循迹，后轮锁死防侧滑)
const PHYS = {
  maxSteer: 0.12,          // 前轮转向角 (~6.8度，高速微调)
  steerRate: 3.2,          // 打角速度
  steerReturn: 5.0,        // 回正阻尼
  rearGripTraction: 7.5,   // 后轮循迹防滑阻尼 (彻底消灭打滑)
  lateralAccRatio: 1.35,   // 侧向加速度增益
  suspensionOmega: 7.2,    // 悬挂固有频率
  suspensionZeta: 0.98,    // 悬挂阻尼比
  rollMomentFactor: 0.038, // 侧倾力矩
  maxRollAngle: 0.048      // 最大物理侧倾角 (~2.7度，稳定平实)
};

// ═══════════════════════════════════════
// 敌车与金币管理
// ═══════════════════════════════════════
const traffic = [];
const trafficColors = [0xff2255, 0xffbb00, 0x8338ec, 0x2ec4b6, 0xf77f00];

function spawnTraffic() {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
  const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
  const enemy = createSuperCar(false, color);

  enemy.group.position.set(laneX, 0, -200);
  enemy.speed = 0.35 + Math.random() * 0.35;
  scene.add(enemy.group);
  traffic.push(enemy);
}

const coins = [];
const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 16);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  roughness: 0.2,
  metalness: 0.9,
  emissive: 0xffaa00,
  emissiveIntensity: 0.5
});

function spawnCoin() {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
  const coinMesh = new THREE.Mesh(coinGeo, coinMat);
  coinMesh.position.set(laneX, 0.9, -220);
  scene.add(coinMesh);
  coins.push(coinMesh);
}

// ═══════════════════════════════════════
// 震撼粒子系统与撞车爆炸碎片 (Debris)
// ═══════════════════════════════════════
const particles = [];
const pGeo = new THREE.SphereGeometry(0.12, 6, 6);

function createSpark(x, y, z, colorHex, count = 12) {
  for (let i = 0; i < count; i++) {
    const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: colorHex }));
    pMesh.position.set(x, y, z);
    scene.add(pMesh);
    particles.push({
      mesh: pMesh,
      vx: (Math.random() - 0.5) * 0.7,
      vy: Math.random() * 0.5 + 0.1,
      vz: (Math.random() - 0.5) * 0.7,
      life: 1.0
    });
  }
}

// 撞车立体爆炸碎片群 (Shrapnel Debris)
const debrisPieces = [];
const debrisGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);

function spawnCrashExplosion(x, y, z) {
  // 1. 冲击波光环 (Shockwave)
  const ringGeo = new THREE.RingGeometry(0.5, 1.2, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3300, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.2, z);
  scene.add(ring);
  particles.push({
    mesh: ring,
    vx: 0, vy: 0, vz: 0,
    scaleGrowth: 0.45,
    life: 1.0
  });

  // 2. 飞溅车体零件碎片 (30片碎片)
  for (let i = 0; i < 30; i++) {
    const dMat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0x00f0ff : 0x111624,
      metalness: 0.8
    });
    const dMesh = new THREE.Mesh(debrisGeo, dMat);
    dMesh.position.set(x + (Math.random() - 0.5) * 1.5, y + 0.5, z + (Math.random() - 0.5) * 2);
    scene.add(dMesh);
    debrisPieces.push({
      mesh: dMesh,
      vx: (Math.random() - 0.5) * 1.2,
      vy: Math.random() * 0.9 + 0.3,
      vz: (Math.random() - 0.5) * 1.2,
      rotX: (Math.random() - 0.5) * 0.4,
      rotY: (Math.random() - 0.5) * 0.4,
      life: 1.5
    });
  }

  // 3. 爆炸火花
  createSpark(x, y + 0.5, z, 0xff2200, 45);
  createSpark(x, y + 0.8, z, 0xffcc00, 35);
}

// ═══════════════════════════════════════
// 游戏生命周期
// ═══════════════════════════════════════
function resetGame() {
  traffic.forEach(t => scene.remove(t.group));
  traffic.length = 0;

  coins.forEach(c => scene.remove(c));
  coins.length = 0;

  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;

  debrisPieces.forEach(d => scene.remove(d.mesh));
  debrisPieces.length = 0;

  score = 0;
  nitro = 100;
  baseSpeed = 1.0;
  frame = 0;
  cameraTrauma = 0;

  carPhysics.x = 0;
  carPhysics.vx = 0;
  carPhysics.ax = 0;
  carPhysics.steerAngle = 0;
  carPhysics.roll = 0;
  carPhysics.rollVel = 0;
  carPhysics.yaw = 0;

  player.group.position.set(0, 0, 0);
  player.group.rotation.set(0, 0, 0);

  scoreEl.textContent = "0";
  nitroBar.style.width = "100%";
}

function startGame() {
  sound.init();
  playerName = playerNameInput.value.trim() || "车王传奇";
  localStorage.setItem("neonRacerName", playerName);
  resetGame();
  running = true;
  overlay.classList.add("hidden");
}

async function endGame() {
  running = false;
  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  bestEl.textContent = best;
  title.textContent = "CRASHED";
  message.innerHTML = `本次探索得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩正在同步...`;
  document.querySelector("#start").textContent = "再次出发";
  overlay.classList.remove("hidden");

  // 撞车全屏闪红
  document.body.classList.remove("crash-flash");
  void document.body.offsetWidth; // 触发重绘
  document.body.classList.add("crash-flash");

  // 1. 产生爆炸立体碎片与冲击波
  spawnCrashExplosion(player.group.position.x, 0.5, player.group.position.z);

  // 2. 车身被撞飞翻转
  player.group.position.y = 1.8;
  player.group.rotation.x = 0.45;
  player.group.rotation.z = -0.5;

  // 3. 剧烈震动音效与触觉
  cameraTrauma = 1.0; // 满级震屏
  sound.playCrash();
  triggerHaptic([80, 40, 150, 40, 250]);

  try {
    await api.post("/api/scores", { name: playerName, score: finalScore });
    message.innerHTML = `本次探索得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩已记录至排行榜！`;
    await loadLeaderboard();
  } catch (error) {
    message.innerHTML = `本次探索得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>本地最高分已保存。`;
    setServerState(false);
  }
}

// ═══════════════════════════════════════
// 主物理循环 (更新动力学与特效)
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  frame++;

  // 1. 速度与氮气 (NITRO)
  const accelerating = keys.KeyW || keys.ArrowUp;
  const wantsBoost = (keys.Space || keys.boost) && nitro > 0;

  if (wantsBoost && !boosting) {
    sound.playBoost();
    triggerHaptic(45);
  }
  boosting = wantsBoost;
  nitro = boosting ? Math.max(0, nitro - 0.7) : Math.min(100, nitro + 0.12);

  const targetSpeed = accelerating ? 1.4 : 1.0;
  baseSpeed += (targetSpeed - baseSpeed) * 0.05;
  currentSpeed = baseSpeed + (boosting ? 0.9 : 0);

  score += currentSpeed * 0.45;
  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(currentSpeed * 128);

  sound.updateEngine(currentSpeed, boosting);

  // 2. 转向控制（彻底杜绝后轮打滑甩尾）
  const turnLeft = keys.ArrowLeft || keys.KeyA || keys.left;
  const turnRight = keys.ArrowRight || keys.KeyD || keys.right;

  const dt = 1 / 60;

  let targetSteer = 0;
  if (turnLeft) targetSteer = -PHYS.maxSteer;
  else if (turnRight) targetSteer = PHYS.maxSteer;

  // 前轮阿克曼转向打角自回正
  const steerRate = targetSteer === 0 ? PHYS.steerReturn : PHYS.steerRate;
  carPhysics.steerAngle += (targetSteer - carPhysics.steerAngle) * Math.min(1.0, steerRate * dt * 4.0);

  // 前轮侧向力牵引
  const targetAx = carPhysics.steerAngle * currentSpeed * PHYS.lateralAccRatio * 28.0;
  carPhysics.ax += (targetAx - carPhysics.ax) * 0.22;

  // 后轮稳定锁死防侧滑力矩 (Rear Traction & Stability Control)
  // dv_x / dt = ax - 摩擦阻尼
  carPhysics.vx += (carPhysics.ax - carPhysics.vx * PHYS.rearGripTraction) * dt * 8.0;

  carPhysics.x += carPhysics.vx * dt * 5.0;

  // 赛道护栏边缘阻挡
  const maxBound = ROAD_WIDTH / 2 - 1.8;
  if (carPhysics.x < -maxBound) {
    carPhysics.x = -maxBound;
    carPhysics.vx = 0;
    carPhysics.ax = 0;
  }
  if (carPhysics.x > maxBound) {
    carPhysics.x = maxBound;
    carPhysics.vx = 0;
    carPhysics.ax = 0;
  }

  // 悬挂系统二阶弹簧-阻尼系统 (消除左右摇摆晃动)
  const centrifugalForce = -carPhysics.ax * PHYS.rollMomentFactor;
  const rollSpringForce = -Math.pow(PHYS.suspensionOmega, 2) * carPhysics.roll;
  const rollDamperForce = -2 * PHYS.suspensionZeta * PHYS.suspensionOmega * carPhysics.rollVel;
  const rollAcc = centrifugalForce + rollSpringForce + rollDamperForce;

  carPhysics.rollVel += rollAcc * dt * 2.0;
  carPhysics.roll += carPhysics.rollVel * dt * 2.0;
  carPhysics.roll = Math.max(-PHYS.maxRollAngle, Math.min(PHYS.maxRollAngle, carPhysics.roll));

  // 循迹航向角 Yaw (顺滑跟车头方向，后轴不侧滑)
  const targetYaw = Math.atan2(carPhysics.vx * 0.25, currentSpeed * 1.8);
  carPhysics.yaw += (targetYaw - carPhysics.yaw) * 0.2;

  // 应用位移与姿态
  player.group.position.x = carPhysics.x;
  player.group.rotation.z = carPhysics.roll;
  player.group.rotation.y = carPhysics.yaw;

  // 前轮物理打角
  player.wheels[0].rotation.y = carPhysics.steerAngle * 1.5;
  player.wheels[1].rotation.y = carPhysics.steerAngle * 1.5;

  // 后轮始终平行于车身底盘 (0打角，紧锁轨迹)，四轮高速旋转
  const wheelSpin = currentSpeed * 0.65;
  player.wheels.forEach(w => {
    w.children[0].rotation.x += wheelSpin; // 轮胎旋转
    w.children[1].rotation.x += wheelSpin; // 轮毂旋转
  });

  // 3. 氮气推进火焰
  if (boosting) {
    const pulse = 1.0 + Math.random() * 0.35;
    player.thrusters[0].material.opacity = 0.9;
    player.thrusters[1].material.opacity = 0.9;
    player.thrusters[0].scale.set(pulse, pulse * 1.25, pulse);
    player.thrusters[1].scale.set(pulse, pulse * 1.25, pulse);

    if (frame % 3 === 0) {
      const themeData = THEMES[currentTheme] || THEMES.country;
      createSpark(carPhysics.x - 0.5, 0.4, 2.8, 0x00f0ff, 2);
      createSpark(carPhysics.x + 0.5, 0.4, 2.8, 0xff00bb, 2);
    }
  } else {
    player.thrusters[0].material.opacity = 0;
    player.thrusters[1].material.opacity = 0;
  }

  // 4. 赛道与景物流转
  const moveZ = currentSpeed * 1.8;
  roadSegments.forEach(seg => {
    seg.position.z += moveZ;
    if (seg.position.z > ROAD_SEGMENT_LENGTH) {
      seg.position.z -= TOTAL_ROAD_LEN;
    }
  });

  sceneryObjects.forEach(item => {
    item.position.z += moveZ;
    if (item.position.z > 25) {
      item.position.z -= TOTAL_ROAD_LEN;
    }
  });

  // 5. 敌车刷新与碰撞
  if (frame % Math.max(50, Math.floor(95 - currentSpeed * 12)) === 0) {
    spawnTraffic();
  }
  if (Math.random() < 0.032) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.4;
    enemy.wheels.forEach(w => {
      w.children[0].rotation.x += 0.3;
      w.children[1].rotation.x += 0.3;
    });

    const dx = Math.abs(player.group.position.x - enemy.group.position.x);
    const dz = Math.abs(player.group.position.z - enemy.group.position.z);

    if (dx < 1.95 && dz < 3.8) {
      return endGame();
    }

    if (enemy.group.position.z > 25) {
      scene.remove(enemy.group);
      traffic.splice(i, 1);
    }
  }

  // 6. 金币收集
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += moveZ;
    coin.rotation.z += 0.05;

    const dx = Math.abs(player.group.position.x - coin.position.x);
    const dz = Math.abs(player.group.position.z - coin.position.z);

    if (dx < 2.0 && dz < 2.5) {
      score += 50;
      nitro = Math.min(100, nitro + 25);
      createSpark(coin.position.x, 1.0, coin.position.z, 0xffd700, 16);
      sound.playCoin();
      triggerHaptic(20);
      scene.remove(coin);
      coins.splice(i, 1);
    } else if (coin.position.z > 25) {
      scene.remove(coin);
      coins.splice(i, 1);
    }
  }

  // 7. 粒子与冲击波更新
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    if (p.scaleGrowth) {
      p.mesh.scale.addScalar(p.scaleGrowth);
    }
    p.life -= 0.04;
    p.mesh.material.opacity = p.life;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  // 碎片物理更新 (带重力落地)
  for (let i = debrisPieces.length - 1; i >= 0; i--) {
    const d = debrisPieces[i];
    d.vy -= 0.03; // 重力
    d.mesh.position.x += d.vx;
    d.mesh.position.y = Math.max(0.1, d.mesh.position.y + d.vy);
    d.mesh.position.z += d.vz;
    d.mesh.rotation.x += d.rotX;
    d.mesh.rotation.y += d.rotY;
    d.life -= 0.02;
    if (d.life <= 0) {
      scene.remove(d.mesh);
      debrisPieces.splice(i, 1);
    }
  }

  // 8. 第三人称跟随相机 (带创伤抖动 Trauma Camera Shake)
  const targetCamX = carPhysics.x * 0.72;
  const targetCamY = boosting ? 3.4 : 3.6;
  const targetCamZ = boosting ? 8.6 : 8.0;

  camera.position.x += (targetCamX - camera.position.x) * 0.12;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  // 创伤震屏衰减算法
  if (cameraTrauma > 0) {
    const shakePower = Math.pow(cameraTrauma, 2);
    camera.position.x += (Math.random() - 0.5) * 1.5 * shakePower;
    camera.position.y += (Math.random() - 0.5) * 1.2 * shakePower;
    camera.position.z += (Math.random() - 0.5) * 0.8 * shakePower;
    cameraTrauma = Math.max(0, cameraTrauma - 0.04);
  } else if (boosting) {
    // 氮气大喷时的微弱高速引擎共鸣
    camera.position.y += (Math.random() - 0.5) * 0.04;
  }

  const targetFov = boosting ? 74 : 60;
  camera.fov += (targetFov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();

  camera.lookAt(carPhysics.x * 0.45, 1.2, -18);
  carPointLight.position.set(carPhysics.x, 2, 2);
}

// ═══════════════════════════════════════
// 渲染循环
// ═══════════════════════════════════════
function render() {
  update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

// ═══════════════════════════════════════
// 排行榜对接
// ═══════════════════════════════════════
function setServerState(online) {
  serverDot.classList.toggle("online", online);
  serverDot.classList.toggle("offline", !online);
  serverText.textContent = online ? "在线" : "单机";
}

function renderLeaderboard(scores) {
  if (!scores.length) {
    leaderboardList.innerHTML = "<li>暂无纪录，等你来创奇迹！</li>";
    return;
  }
  leaderboardList.innerHTML = scores.map((item, index) => (
    `<li><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span>${item.score}</span></li>`
  )).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function loadLeaderboard() {
  try {
    const data = await api.get("/api/scores");
    setServerState(true);
    renderLeaderboard(data.scores || []);
  } catch (error) {
    setServerState(false);
    leaderboardList.innerHTML = "<li>服务器未连接，当前记录本机分数。</li>";
  }
}

// ═══════════════════════════════════════
// 事件绑定
// ═══════════════════════════════════════
function bindButton(selector, key) {
  const element = document.querySelector(selector);
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    keys[key] = true;
    sound.init(); // 交互时确保音频上下文激活
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(name => {
    element.addEventListener(name, () => { keys[key] = false; });
  });
}

window.addEventListener("keydown", event => {
  keys[event.code] = true;
  sound.init();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", event => {
  keys[event.code] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 场景切换
document.querySelectorAll(".theme-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    applyTheme(chip.dataset.theme);
  });
});

if (quickSceneSelect) {
  quickSceneSelect.addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });
}

// 音效切换
if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    sound.init();
    const isEnabled = sound.toggle();
    audioToggle.textContent = isEnabled ? "🔊" : "🔇";
    audioToggle.style.opacity = isEnabled ? "1" : "0.5";
  });
}

bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");
document.querySelector("#start").addEventListener("click", startGame);
refreshRanks.addEventListener("click", loadLeaderboard);

// 初始化
applyTheme(currentTheme);
loadLeaderboard();
render();
