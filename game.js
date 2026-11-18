/**
 * 3D 极速赛车 - 多主题自然场景探索 (Three.js 引擎)
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

// ── 游戏运行变量 ──
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

// ── 当前场景主题 ──
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
// THREE.JS 3D 场景与渲染器
// ═══════════════════════════════════════
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// ── 灯光组 ──
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
sunLight.position.set(30, 50, 20);
scene.add(sunLight);

// 赛车尾灯/底盘环境光
const carFollowLight = new THREE.PointLight(0xffffff, 1.5, 12);
scene.add(carFollowLight);

// ═══════════════════════════════════════
// 赛道参数与容器
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
const sceneryObjects = []; // 树木/岩石/椰树等装饰物

// ═══════════════════════════════════════
// 场景主题配置数据 (THEMES)
// ═══════════════════════════════════════
const THEMES = {
  country: {
    name: "COUNTRY ROAD",
    cnName: "🌾 乡间小路",
    skyColor: 0x7db7f0,
    fogColor: 0xa8d5a2,
    fogDensity: 0.006,
    ambientColor: 0xffffff,
    sunColor: 0xfff6dd,
    sunIntensity: 1.8,
    roadColor: 0x3a3c42,
    roadRoughness: 0.8,
    terrainColor: 0x4f8f3c, // 翠绿草地
    stripeColor: 0xffffff,
    railColor: 0x8b5a2b,    // 木质栅栏
    particleColor: 0xd4a373 // 泥土尘埃
  },
  island: {
    name: "ISLAND ESCAPE",
    cnName: "🏝️ 逃离荒岛",
    skyColor: 0x38b6ff,
    fogColor: 0x64d8cb,
    fogDensity: 0.0055,
    ambientColor: 0xe0f7fa,
    sunColor: 0xfff0b3,
    sunIntensity: 2.1,
    roadColor: 0x424953,
    roadRoughness: 0.6,
    terrainColor: 0xe9d8a6, // 金黄细沙
    stripeColor: 0xffea00,
    railColor: 0xffffff,    // 沿海白护栏
    particleColor: 0xf4a261 // 飞溅细沙
  },
  jungle: {
    name: "JUNGLE ODYSSEY",
    cnName: "🌴 丛林狂飙",
    skyColor: 0x133c25,
    fogColor: 0x1f4e38,
    fogDensity: 0.0085,
    ambientColor: 0xa7d7c5,
    sunColor: 0xccffcc,
    sunIntensity: 1.6,
    roadColor: 0x2b221b,    // 泥泞深色古道
    roadRoughness: 0.9,
    terrainColor: 0x1a4329, // 茂密深林青苔
    stripeColor: 0x88d49e,
    railColor: 0x3d2b1f,    // 粗藤木桩
    particleColor: 0x588157 // 丛林落叶水雾
  },
  river: {
    name: "CANYON RIVER",
    cnName: "🌊 沿河峡谷",
    skyColor: 0x5c80bc,
    fogColor: 0x8ecae6,
    fogDensity: 0.0065,
    ambientColor: 0xdde5ed,
    sunColor: 0xffffff,
    sunIntensity: 1.9,
    roadColor: 0x33353a,
    roadRoughness: 0.7,
    terrainColor: 0x8a5a44, // 峡谷红褐岩石
    stripeColor: 0xffffff,
    railColor: 0x219ebc,    // 峡谷防撞导轨
    particleColor: 0xade8f4 // 峡谷飞溅水珠
  }
};

// ═══════════════════════════════════════
// 自然景观程序化几何体生成工厂
// ═══════════════════════════════════════

// 1. 乡村大树
function createCountryTree() {
  const tree = new THREE.Group();
  // 树干
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.5, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.75;
  tree.add(trunk);

  // 树冠 (上下两层丰满球冠)
  const foliageGeo1 = new THREE.DodecahedronGeometry(2.2, 1);
  const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x38761d, roughness: 0.8 });
  const foliage1 = new THREE.Mesh(foliageGeo1, foliageMat1);
  foliage1.position.y = 4.2;
  tree.add(foliage1);

  const foliageGeo2 = new THREE.DodecahedronGeometry(1.6, 1);
  const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x4f9a2b, roughness: 0.8 });
  const foliage2 = new THREE.Mesh(foliageGeo2, foliageMat2);
  foliage2.position.y = 5.6;
  tree.add(foliage2);

  return tree;
}

// 2. 海岛椰子树
function createPalmTree() {
  const palm = new THREE.Group();
  // 弯曲高挺的椰树树干
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.55, 6.5, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 3.25;
  trunk.rotation.z = (Math.random() - 0.5) * 0.25;
  palm.add(trunk);

  // 放射状椰树叶
  const leafCount = 6;
  for (let i = 0; i < leafCount; i++) {
    const leafGeo = new THREE.ConeGeometry(0.9, 3.8, 4);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0, 6.3, 0);
    leaf.rotation.z = Math.PI / 2.8;
    leaf.rotation.y = (i / leafCount) * Math.PI * 2;
    palm.add(leaf);
  }

  // 椰子果实
  const coconutGeo = new THREE.SphereGeometry(0.35, 6, 6);
  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
  const c1 = new THREE.Mesh(coconutGeo, coconutMat);
  c1.position.set(0.3, 6.0, 0);
  palm.add(c1);

  return palm;
}

// 3. 丛林参天阔叶植物
function createJunglePlant() {
  const plant = new THREE.Group();
  // 苔藓古木桩
  const trunkGeo = new THREE.CylinderGeometry(0.6, 0.9, 4.0, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x241e17, roughness: 1.0 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.0;
  plant.add(trunk);

  // 巨大热带阔叶
  for (let i = 0; i < 5; i++) {
    const leafGeo = new THREE.BoxGeometry(2.6, 0.12, 1.6);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.6 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0, 3.8 + i * 0.4, 0);
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    leaf.rotation.x = 0.3;
    plant.add(leaf);
  }
  return plant;
}

// 4. 峡谷岩石峭壁与水流
function createCanyonRock() {
  const rock = new THREE.Group();
  const rockGeo = new THREE.DodecahedronGeometry(3.0 + Math.random() * 2.5, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7f4f24,
    roughness: 0.95,
    metalness: 0.1
  });
  const rMesh = new THREE.Mesh(rockGeo, rockMat);
  rMesh.scale.set(1.0 + Math.random() * 0.5, 1.8 + Math.random() * 1.5, 1.0 + Math.random() * 0.5);
  rMesh.position.y = 3.5;
  rock.add(rMesh);
  return rock;
}

// ═══════════════════════════════════════
// 场景初始化与重构体系
// ═══════════════════════════════════════
function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.country;
  currentTheme = themeKey;
  localStorage.setItem("racerSceneTheme", themeKey);

  // 更新顶栏与选择器状态
  if (brandTitle) brandTitle.textContent = theme.name;
  if (quickSceneSelect) quickSceneSelect.value = themeKey;

  document.querySelectorAll(".theme-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.theme === themeKey);
  });

  // 更新天空背景与雾气
  scene.background = new THREE.Color(theme.skyColor);
  scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

  ambientLight.color.setHex(theme.ambientColor);
  sunLight.color.setHex(theme.sunColor);
  sunLight.intensity = theme.sunIntensity;

  // 清空旧赛道模型
  while (worldGroup.children.length > 0) {
    const obj = worldGroup.children[0];
    worldGroup.remove(obj);
  }
  roadSegments.length = 0;
  sceneryObjects.length = 0;

  // 重建赛道与环境
  for (let i = 0; i < ROAD_SEGMENTS; i++) {
    buildRoadSegment(-i * ROAD_SEGMENT_LENGTH, theme);
  }

  // 建造两侧自然景观
  populateScenery(themeKey);
}

function buildRoadSegment(zOffset, theme) {
  const seg = new THREE.Group();
  seg.position.z = zOffset;

  // 1. 广袤地表植被 (草地/沙滩/苔藓/河岸)
  const terrainGeo = new THREE.PlaneGeometry(280, ROAD_SEGMENT_LENGTH);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: theme.terrainColor,
    roughness: 0.9
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05;
  seg.add(terrain);

  // 如果是荒岛或峡谷场景，右侧加一条蔚蓝流动大河/海面
  if (currentTheme === "island" || currentTheme === "river") {
    const waterGeo = new THREE.PlaneGeometry(120, ROAD_SEGMENT_LENGTH);
    const waterMat = new THREE.MeshStandardMaterial({
      color: currentTheme === "island" ? 0x0077b6 : 0x0096c7,
      roughness: 0.1,
      metalness: 0.8
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(ROAD_WIDTH / 2 + 65, 0.1, 0);
    seg.add(water);
  }

  // 2. 主道路面
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH);
  const roadMat = new THREE.MeshStandardMaterial({
    color: theme.roadColor,
    roughness: theme.roadRoughness,
    metalness: 0.2
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  seg.add(road);

  // 3. 车道白线/黄线
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = -ROAD_WIDTH / 2 + i * LANE_WIDTH;
    const stripeCount = 10;
    for (let s = 0; s < stripeCount; s++) {
      const stripeGeo = new THREE.PlaneGeometry(0.24, 6);
      const stripeMat = new THREE.MeshBasicMaterial({ color: theme.stripeColor });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(laneX, 0.04, -ROAD_SEGMENT_LENGTH / 2 + s * (ROAD_SEGMENT_LENGTH / stripeCount) + 3);
      seg.add(stripe);
    }
  }

  // 4. 道路护栏 (不同主题自适应)
  const railGeo = new THREE.BoxGeometry(0.35, 0.65, ROAD_SEGMENT_LENGTH);
  const railMat = new THREE.MeshStandardMaterial({ color: theme.railColor, roughness: 0.7 });

  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-ROAD_WIDTH / 2 - 0.2, 0.35, 0);
  seg.add(railL);

  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(ROAD_WIDTH / 2 + 0.2, 0.35, 0);
  seg.add(railR);

  // 护栏柱子
  for (let p = -ROAD_SEGMENT_LENGTH / 2; p <= ROAD_SEGMENT_LENGTH / 2; p += 14) {
    const postGeo = new THREE.BoxGeometry(0.5, 0.9, 0.5);
    const postMat = new THREE.MeshStandardMaterial({ color: theme.railColor });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-ROAD_WIDTH / 2 - 0.2, 0.45, p);
    seg.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(ROAD_WIDTH / 2 + 0.2, 0.45, p);
    seg.add(postR);
  }

  worldGroup.add(seg);
  roadSegments.push(seg);
}

// 填充两侧景观植被与岩石
function populateScenery(themeKey) {
  const count = 40;
  for (let i = 0; i < count; i++) {
    let item;
    if (themeKey === "country") {
      item = createCountryTree();
    } else if (themeKey === "island") {
      item = createPalmTree();
    } else if (themeKey === "jungle") {
      item = createJunglePlant();
    } else {
      item = createCanyonRock();
    }

    const side = i % 2 === 0 ? -1 : 1;
    // 分布在路旁安全距离
    const offset = ROAD_WIDTH / 2 + 5 + Math.random() * 32;
    item.position.set(side * offset, 0, -Math.random() * TOTAL_ROAD_LEN);
    worldGroup.add(item);
    sceneryObjects.push(item);
  }
}

// ═══════════════════════════════════════
// 3D 玩家赛车与敌车 (QQ 飞车超跑造型)
// ═══════════════════════════════════════
function createSuperCar(isPlayer = true, primaryColor = 0x00f3ff) {
  const carGroup = new THREE.Group();

  // 车身底盘
  const bodyGeo = new THREE.BoxGeometry(2.1, 0.45, 4.4);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.25,
    metalness: 0.75
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.45;
  carGroup.add(body);

  // 驾驶舱弧形风挡
  const cabinGeo = new THREE.BoxGeometry(1.4, 0.42, 2.0);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x0a1020,
    roughness: 0.1,
    metalness: 0.95
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.78, -0.2);
  carGroup.add(cabin);

  // 前下压力唇
  const noseGeo = new THREE.BoxGeometry(1.9, 0.15, 0.8);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.8 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.28, -2.2);
  carGroup.add(nose);

  // 尾翼
  const wingGroup = new THREE.Group();
  wingGroup.position.set(0, 0.9, 1.8);
  const wingBladeGeo = new THREE.BoxGeometry(2.3, 0.08, 0.45);
  const wingBladeMat = new THREE.MeshBasicMaterial({ color: primaryColor });
  const wingBlade = new THREE.Mesh(wingBladeGeo, wingBladeMat);
  wingBlade.position.y = 0.4;
  wingGroup.add(wingBlade);

  const postGeo = new THREE.BoxGeometry(0.08, 0.45, 0.2);
  const p1 = new THREE.Mesh(postGeo, noseMat);
  p1.position.set(-0.7, 0.2, 0);
  wingGroup.add(p1);
  const p2 = new THREE.Mesh(postGeo, noseMat);
  p2.position.set(0.7, 0.2, 0);
  wingGroup.add(p2);
  carGroup.add(wingGroup);

  // 四只车轮
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15151e, roughness: 0.8 });

  const wheelPositions = [
    [-1.1, 0.42, -1.3],
    [ 1.1, 0.42, -1.3],
    [-1.15, 0.44, 1.3],
    [ 1.15, 0.44, 1.3]
  ];

  wheelPositions.forEach(pos => {
    const wGroup = new THREE.Group();
    wGroup.position.set(pos[0], pos[1], pos[2]);
    const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
    wGroup.add(wMesh);
    carGroup.add(wGroup);
    wheels.push(wGroup);
  });

  // 前大灯与后尾灯
  const headLightGeo = new THREE.BoxGeometry(0.35, 0.1, 0.1);
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hlL = new THREE.Mesh(headLightGeo, headLightMat);
  hlL.position.set(-0.7, 0.45, -2.15);
  carGroup.add(hlL);
  const hlR = new THREE.Mesh(headLightGeo, headLightMat);
  hlR.position.set(0.7, 0.45, -2.15);
  carGroup.add(hlR);

  const tailGeo = new THREE.BoxGeometry(1.8, 0.12, 0.1);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.52, 2.18);
  carGroup.add(tail);

  // 氮气喷管
  const thrusters = [];
  if (isPlayer) {
    const flameGeo = new THREE.ConeGeometry(0.24, 2.2, 12);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0 });
    const fL = new THREE.Mesh(flameGeo, flameMat);
    fL.position.set(-0.5, 0.4, 3.2);
    carGroup.add(fL);
    thrusters.push(fL);

    const fR = new THREE.Mesh(flameGeo, flameMat.clone());
    fR.material.color.setHex(0xff3399);
    fR.position.set(0.5, 0.4, 3.2);
    carGroup.add(fR);
    thrusters.push(fR);
  }

  return { group: carGroup, wheels, thrusters };
}

// 玩家赛车
const player = createSuperCar(true, 0x00e5ff);
scene.add(player.group);
player.group.position.set(0, 0, 0);

// ── 遵循真实汽车物理动力学的赛车状态 ──
const carPhysics = {
  x: 0,                   // 横向位置 (m)
  vx: 0,                  // 横向速度 (m/s)
  ax: 0,                  // 横向加速度 (m/s^2)
  steerAngle: 0,          // 前轮物理转向角 (rad)
  roll: 0,                // 车身悬挂侧倾角 (rad)
  rollVel: 0,             // 侧倾角速度 (rad/s)
  yaw: 0                  // 车头朝向航向角 (rad)
};

// 物理参数配置 (依据超跑真实悬挂与转向标定，避免剧烈摇晃)
const PHYS = {
  maxSteer: 0.12,          // 最大前轮转向角 (~6.8度，高速行驶微打角)
  steerRate: 2.8,          // 打角角速度
  steerReturn: 4.5,        // 自回正角速度
  lateralFriction: 4.8,    // 轮胎侧向附着摩擦阻尼
  lateralGripFactor: 1.25, // 侧向抓地向心力系数
  suspensionOmega: 7.2,    // 悬挂弹簧角频率
  suspensionZeta: 0.98,    // 悬挂阻尼比 (接近临界阻尼，消除摇摆晃动)
  rollMomentFactor: 0.04,  // 离心力对车身侧倾力矩影响系数
  maxRollAngle: 0.05       // 物理侧倾角限位 (~2.8度，稳定沉着)
};

// ═══════════════════════════════════════
// 敌车与金币管理
// ═══════════════════════════════════════
const traffic = [];
const trafficColors = [0xff3366, 0xffbb00, 0x8338ec, 0x2ec4b6, 0xf77f00];

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
  emissive: 0xff9900,
  emissiveIntensity: 0.4
});

function spawnCoin() {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
  const coinMesh = new THREE.Mesh(coinGeo, coinMat);
  coinMesh.position.set(laneX, 0.9, -220);
  scene.add(coinMesh);
  coins.push(coinMesh);
}

// 粒子系统
const particles = [];
const pGeo = new THREE.SphereGeometry(0.12, 6, 6);

function createSpark(x, y, z, colorHex, count = 12) {
  for (let i = 0; i < count; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const pMesh = new THREE.Mesh(pGeo, pMat);
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

// ═══════════════════════════════════════
// 游戏生命周期控制
// ═══════════════════════════════════════
function resetGame() {
  traffic.forEach(t => scene.remove(t.group));
  traffic.length = 0;

  coins.forEach(c => scene.remove(c));
  coins.length = 0;

  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;

  score = 0;
  nitro = 100;
  baseSpeed = 1.0;
  frame = 0;
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
  playerName = playerNameInput.value.trim() || "自然漫游者";
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

  createSpark(player.group.position.x, 1.0, player.group.position.z, 0xff0044, 35);

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
// 核心更新循环 (解决灵敏度过高问题)
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  frame++;

  // 1. 速度与氮气
  const accelerating = keys.KeyW || keys.ArrowUp;
  boosting = (keys.Space || keys.boost) && nitro > 0;
  nitro = boosting ? Math.max(0, nitro - 0.7) : Math.min(100, nitro + 0.12);

  const targetSpeed = accelerating ? 1.4 : 1.0;
  baseSpeed += (targetSpeed - baseSpeed) * 0.05;
  currentSpeed = baseSpeed + (boosting ? 0.9 : 0);

  score += currentSpeed * 0.45;
  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(currentSpeed * 125);

  // 2. 遵循真实汽车动力学与悬挂物理定律的转向控制
  const turnLeft = keys.ArrowLeft || keys.KeyA || keys.left;
  const turnRight = keys.ArrowRight || keys.KeyD || keys.right;

  const dt = 1 / 60; // 物理步长

  // 转向轮输入物理积分 (阿克曼转向角平滑过渡与主销后倾自回正)
  let targetSteer = 0;
  if (turnLeft) targetSteer = -PHYS.maxSteer;
  else if (turnRight) targetSteer = PHYS.maxSteer;

  const steerSpeed = targetSteer === 0 ? PHYS.steerReturn : PHYS.steerRate;
  carPhysics.steerAngle += (targetSteer - carPhysics.steerAngle) * Math.min(1.0, steerSpeed * dt * 4.0);

  // 轮胎侧向抓地力与向心加速度计算
  const targetAx = carPhysics.steerAngle * currentSpeed * PHYS.lateralGripFactor * 26.0;
  carPhysics.ax += (targetAx - carPhysics.ax) * 0.18; // 轮胎变形弹性迟滞

  // 牛顿运动定律：横向受力 dv_x / dt = a_x - 摩擦阻尼
  carPhysics.vx += (carPhysics.ax - carPhysics.vx * PHYS.lateralFriction) * dt * 8.0;

  // 横向物理位移
  carPhysics.x += carPhysics.vx * dt * 5.0;

  // 赛道边缘阻挡与微弹性反弹
  const maxBound = ROAD_WIDTH / 2 - 1.8;
  if (carPhysics.x < -maxBound) {
    carPhysics.x = -maxBound;
    carPhysics.vx = -carPhysics.vx * 0.2;
    carPhysics.ax = 0;
  }
  if (carPhysics.x > maxBound) {
    carPhysics.x = maxBound;
    carPhysics.vx = -carPhysics.vx * 0.2;
    carPhysics.ax = 0;
  }

  // 悬挂系统二阶弹簧-阻尼动力学 (消除左右剧烈摇摆打摆子，模拟真实底盘质量弹簧系统)
  // 方程： I*d2phi/dt2 + c*dphi/dt + k*phi = M_centrifugal
  const centrifugalForce = -carPhysics.ax * PHYS.rollMomentFactor;
  const rollSpringForce = -Math.pow(PHYS.suspensionOmega, 2) * carPhysics.roll;
  const rollDamperForce = -2 * PHYS.suspensionZeta * PHYS.suspensionOmega * carPhysics.rollVel;
  const rollAcc = centrifugalForce + rollSpringForce + rollDamperForce;

  carPhysics.rollVel += rollAcc * dt * 2.0;
  carPhysics.roll += carPhysics.rollVel * dt * 2.0;
  carPhysics.roll = Math.max(-PHYS.maxRollAngle, Math.min(PHYS.maxRollAngle, carPhysics.roll));

  // 车身航向角 (Yaw)：严格根据速度矢量方向自然偏转
  const targetYaw = Math.atan2(carPhysics.vx * 0.35, currentSpeed * 1.5);
  carPhysics.yaw += (targetYaw - carPhysics.yaw) * 0.15;

  // 应用位移与姿态到 3D 模型
  player.group.position.x = carPhysics.x;
  player.group.rotation.z = carPhysics.roll;
  player.group.rotation.y = carPhysics.yaw;

  // 前轮打角转向
  player.wheels[0].rotation.y = carPhysics.steerAngle * 1.5;
  player.wheels[1].rotation.y = carPhysics.steerAngle * 1.5;

  // 四轮旋转
  const wheelSpin = currentSpeed * 0.6;
  player.wheels.forEach(w => {
    w.children[0].rotation.x += wheelSpin;
  });

  // 3. 氮气推进火焰
  if (boosting) {
    const pulse = 1.0 + Math.random() * 0.4;
    player.thrusters[0].material.opacity = 0.85;
    player.thrusters[1].material.opacity = 0.85;
    player.thrusters[0].scale.set(pulse, pulse * 1.2, pulse);
    player.thrusters[1].scale.set(pulse, pulse * 1.2, pulse);

    if (frame % 3 === 0) {
      const themeData = THEMES[currentTheme] || THEMES.country;
      createSpark(carPhysics.x, 0.4, 2.8, themeData.particleColor, 2);
    }
  } else {
    player.thrusters[0].material.opacity = 0;
    player.thrusters[1].material.opacity = 0;
  }

  // 4. 赛道与自然景物无限循环
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

  // 5. 敌车生成与碰撞
  if (frame % Math.max(50, Math.floor(95 - currentSpeed * 12)) === 0) {
    spawnTraffic();
  }
  if (Math.random() < 0.032) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.4;
    enemy.wheels.forEach(w => { w.children[0].rotation.x += 0.3; });

    // 3D 碰撞检测
    const dx = Math.abs(player.group.position.x - enemy.group.position.x);
    const dz = Math.abs(player.group.position.z - enemy.group.position.z);

    if (dx < 1.9 && dz < 3.8) {
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
      createSpark(coin.position.x, 1.0, coin.position.z, 0xffd700, 15);
      scene.remove(coin);
      coins.splice(i, 1);
    } else if (coin.position.z > 25) {
      scene.remove(coin);
      coins.splice(i, 1);
    }
  }

  // 7. 粒子衰减
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.life -= 0.04;
    p.mesh.scale.setScalar(p.life);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  // 8. 第三人称跟随相机 (Chase Camera)
  const targetCamX = carPhysics.x * 0.72;
  const targetCamY = boosting ? 3.4 : 3.6;
  const targetCamZ = boosting ? 8.6 : 8.0;

  camera.position.x += (targetCamX - camera.position.x) * 0.12;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  const targetFov = boosting ? 74 : 60;
  camera.fov += (targetFov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();

  camera.lookAt(carPhysics.x * 0.45, 1.2, -18);
  carFollowLight.position.set(carPhysics.x, 2, 2);
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
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(name => {
    element.addEventListener(name, () => { keys[key] = false; });
  });
}

window.addEventListener("keydown", event => {
  keys[event.code] = true;
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

// 场景切换按钮事件
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

bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");
document.querySelector("#start").addEventListener("click", startGame);
refreshRanks.addEventListener("click", loadLeaderboard);

// 初始化场景与启动渲染
applyTheme(currentTheme);
loadLeaderboard();
render();
