/**
 * NEON DRIFT 3D - Three.js QQ飞车视角极速赛车引擎
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

// ── 游戏基础变量 ──
let running = false;
let score = 0;
let nitro = 100;
let baseSpeed = 1.0;     // 正常行进速度倍率
let currentSpeed = 1.0;
let boosting = false;
let frame = 0;
const keys = {};

let best = Number(localStorage.getItem("neonRushBest") || 0);
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
bestEl.textContent = best;

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
// THREE.JS 3D 场景初始化
// ═══════════════════════════════════════
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050614, 0.008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

// ── 灯光配置 ──
const ambientLight = new THREE.AmbientLight(0x4466aa, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 40, 20);
scene.add(dirLight);

// 玩家车尾霓虹光
const playerLight = new THREE.PointLight(0x00ffff, 2.0, 15);
scene.add(playerLight);

// ═══════════════════════════════════════
// 赛道与城市环境生成
// ═══════════════════════════════════════
const ROAD_WIDTH = 22;
const LANE_COUNT = 4;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 120;
const ROAD_SEGMENTS = 4;
const TOTAL_ROAD_LEN = ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS;

const roadGroup = new THREE.Group();
scene.add(roadGroup);

// 创建赛道路面与护栏
const roadSegments = [];
function createRoadSegment(zOffset) {
  const seg = new THREE.Group();
  seg.position.z = zOffset;

  // 1. 主路面 (沥青科技黑)
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c18,
    roughness: 0.6,
    metalness: 0.4
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.y = 0;
  seg.add(roadMesh);

  // 2. 车道分隔白线 (虚线)
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = -ROAD_WIDTH / 2 + i * LANE_WIDTH;
    const stripeCount = 10;
    for (let s = 0; s < stripeCount; s++) {
      const stripeGeo = new THREE.PlaneGeometry(0.25, 6);
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0x99ccff });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(laneX, 0.02, -ROAD_SEGMENT_LENGTH / 2 + s * (ROAD_SEGMENT_LENGTH / stripeCount) + 3);
      seg.add(stripe);
    }
  }

  // 3. 左右两侧霓虹护栏
  const guardGeo = new THREE.BoxGeometry(0.4, 0.7, ROAD_SEGMENT_LENGTH);
  
  // 左侧粉紫光轨
  const leftMat = new THREE.MeshBasicMaterial({ color: 0xff2ad4 });
  const leftRail = new THREE.Mesh(guardGeo, leftMat);
  leftRail.position.set(-ROAD_WIDTH / 2 - 0.2, 0.35, 0);
  seg.add(leftRail);

  // 右侧青蓝光轨
  const rightMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
  const rightRail = new THREE.Mesh(guardGeo, rightMat);
  rightRail.position.set(ROAD_WIDTH / 2 + 0.2, 0.35, 0);
  seg.add(rightRail);

  // 4. 护栏立柱
  for (let p = -ROAD_SEGMENT_LENGTH / 2; p <= ROAD_SEGMENT_LENGTH / 2; p += 15) {
    const postGeo = new THREE.BoxGeometry(0.6, 1.2, 0.6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x111628, metalness: 0.8 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-ROAD_WIDTH / 2 - 0.3, 0.6, p);
    seg.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(ROAD_WIDTH / 2 + 0.3, 0.6, p);
    seg.add(postR);
  }

  roadGroup.add(seg);
  roadSegments.push(seg);
}

for (let i = 0; i < ROAD_SEGMENTS; i++) {
  createRoadSegment(-i * ROAD_SEGMENT_LENGTH);
}

// ── 两侧赛博朋克摩天楼群 ──
const buildings = [];
const cityGroup = new THREE.Group();
scene.add(cityGroup);

const buildingColors = [0x090f26, 0x111633, 0x180b2c, 0x061528];
const windowColors = [0x00ffff, 0xff00cc, 0xffea00, 0x3388ff];

for (let i = 0; i < 48; i++) {
  const bW = 10 + Math.random() * 14;
  const bH = 30 + Math.random() * 70;
  const bD = 12 + Math.random() * 16;
  const bGeo = new THREE.BoxGeometry(bW, bH, bD);
  const bMat = new THREE.MeshStandardMaterial({
    color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
    roughness: 0.5,
    metalness: 0.7
  });
  const bMesh = new THREE.Mesh(bGeo, bMat);

  // 随机分布在左右两侧远景
  const side = i % 2 === 0 ? -1 : 1;
  const dist = ROAD_WIDTH / 2 + 16 + Math.random() * 45;
  bMesh.position.set(side * dist, bH / 2 - 2, -Math.random() * TOTAL_ROAD_LEN);

  // 顶楼霓虹发光招牌天际线
  if (Math.random() > 0.4) {
    const signGeo = new THREE.BoxGeometry(bW * 0.7, 1.5, 0.4);
    const signMat = new THREE.MeshBasicMaterial({
      color: windowColors[Math.floor(Math.random() * windowColors.length)]
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, bH / 2 + 1, 0);
    bMesh.add(sign);
  }

  cityGroup.add(bMesh);
  buildings.push(bMesh);
}

// ── 动态星空粒子 ──
const starCount = 300;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  starPos[i] = (Math.random() - 0.5) * 400;
  starPos[i + 1] = 20 + Math.random() * 120;
  starPos[i + 2] = -Math.random() * 400;
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 1.5, transparent: true, opacity: 0.8 });
const starPoints = new THREE.Points(starGeo, starMat);
scene.add(starPoints);

// ── 氮气极速流线粒子 ──
const streakCount = 80;
const streakGeo = new THREE.BufferGeometry();
const streakPos = new Float32Array(streakCount * 6); // 每条线2个顶点
for (let i = 0; i < streakCount; i++) {
  const idx = i * 6;
  const x = (Math.random() - 0.5) * ROAD_WIDTH * 1.5;
  const y = 0.5 + Math.random() * 6;
  const z = -Math.random() * 100;
  streakPos[idx] = x;
  streakPos[idx + 1] = y;
  streakPos[idx + 2] = z;
  streakPos[idx + 3] = x;
  streakPos[idx + 4] = y;
  streakPos[idx + 5] = z - 6;
}
streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
const streakMat = new THREE.LineBasicMaterial({ color: 0x55ffff, transparent: true, opacity: 0 });
const speedLines = new THREE.LineSegments(streakGeo, streakMat);
scene.add(speedLines);

// ═══════════════════════════════════════
// 3D 玩家赛车模型构建 (QQ飞车超跑造型)
// ═══════════════════════════════════════
function createSuperCar(isPlayer = true, primaryColor = 0x00f0ff) {
  const carGroup = new THREE.Group();

  // 1. 车身底盘主壳体 (低趴流线型)
  const bodyGeo = new THREE.BoxGeometry(2.1, 0.45, 4.4);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.2,
    metalness: 0.8
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.45;
  carGroup.add(body);

  // 2. 驾驶舱风挡玻璃 (流体黑色带青光)
  const cabinGeo = new THREE.BoxGeometry(1.4, 0.42, 2.0);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x081020,
    roughness: 0.1,
    metalness: 0.95
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.78, -0.2);
  carGroup.add(cabin);

  // 3. 车头下压力铲 (Front Splitter)
  const noseGeo = new THREE.BoxGeometry(1.9, 0.15, 0.8);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x111624, metalness: 0.9 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.28, -2.2);
  carGroup.add(nose);

  // 4. 竞技大尾翼 (GT Wing)
  const wingGroup = new THREE.Group();
  wingGroup.position.set(0, 0.9, 1.8);
  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111624, metalness: 0.8 });
  
  // 尾翼板
  const wingBladeGeo = new THREE.BoxGeometry(2.3, 0.08, 0.45);
  const wingBladeMat = new THREE.MeshBasicMaterial({ color: primaryColor });
  const wingBlade = new THREE.Mesh(wingBladeGeo, wingBladeMat);
  wingBlade.position.y = 0.4;
  wingGroup.add(wingBlade);

  // 左右立柱
  const postGeo = new THREE.BoxGeometry(0.08, 0.45, 0.2);
  const p1 = new THREE.Mesh(postGeo, spoilerMat);
  p1.position.set(-0.7, 0.2, 0);
  wingGroup.add(p1);
  const p2 = new THREE.Mesh(postGeo, spoilerMat);
  p2.position.set(0.7, 0.2, 0);
  wingGroup.add(p2);
  carGroup.add(wingGroup);

  // 5. 四只车轮 (带青色发光轮毂)
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15151e, roughness: 0.8 });
  const rimMat = new THREE.MeshBasicMaterial({ color: primaryColor });

  const wheelPositions = [
    [-1.1, 0.42, -1.3], // 前左
    [ 1.1, 0.42, -1.3], // 前右
    [-1.15, 0.44, 1.3], // 后左
    [ 1.15, 0.44, 1.3]  // 后右
  ];

  wheelPositions.forEach((pos, idx) => {
    const wGroup = new THREE.Group();
    wGroup.position.set(pos[0], pos[1], pos[2]);
    const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
    wGroup.add(wMesh);

    // 轮毂外圈霓虹灯
    const rimGeo = new THREE.RingGeometry(0.2, 0.28, 12);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.x = pos[0] > 0 ? 0.18 : -0.18;
    rim.rotation.y = pos[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
    wGroup.add(rim);

    carGroup.add(wGroup);
    wheels.push(wGroup);
  });

  // 6. 前大灯发光片
  const headLightGeo = new THREE.BoxGeometry(0.35, 0.1, 0.1);
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hlL = new THREE.Mesh(headLightGeo, headLightMat);
  hlL.position.set(-0.7, 0.45, -2.15);
  carGroup.add(hlL);
  const hlR = new THREE.Mesh(headLightGeo, headLightMat);
  hlR.position.set(0.7, 0.45, -2.15);
  carGroup.add(hlR);

  // 7. 尾部发光贯穿尾灯
  const tailGeo = new THREE.BoxGeometry(1.8, 0.12, 0.1);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.52, 2.18);
  carGroup.add(tail);

  // 8. 双氮气推进器尾喷口 (Thrusters)
  const thrusters = [];
  if (isPlayer) {
    const flameGeo = new THREE.ConeGeometry(0.25, 2.2, 12);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.0
    });
    
    // 左喷管
    const fL = new THREE.Mesh(flameGeo, flameMat);
    fL.position.set(-0.5, 0.4, 3.2);
    carGroup.add(fL);
    thrusters.push(fL);

    // 右喷管
    const fR = new THREE.Mesh(flameGeo, flameMat.clone());
    fR.material.color.setHex(0xd000ff);
    fR.position.set(0.5, 0.4, 3.2);
    carGroup.add(fR);
    thrusters.push(fR);
  }

  return { group: carGroup, wheels, thrusters };
}

// 实例化玩家赛车
const player = createSuperCar(true, 0x00f3ff);
scene.add(player.group);
player.group.position.set(0, 0, 0);

// 玩家赛车物理状态
const carState = {
  x: 0,
  z: 0,
  velocityX: 0,
  steering: 0,
  roll: 0,
  yaw: 0
};

// ═══════════════════════════════════════
// 敌车系统 (Traffic)
// ═══════════════════════════════════════
const traffic = [];
const trafficColors = [0xff2255, 0xffea00, 0xa020f0, 0x00ff88, 0xff7700];

function spawnTraffic() {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
  const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
  const enemy = createSuperCar(false, color);
  
  enemy.group.position.set(laneX, 0, -180);
  enemy.speed = 0.35 + Math.random() * 0.4;
  enemy.width = 2.2;
  enemy.length = 4.4;

  scene.add(enemy.group);
  traffic.push(enemy);
}

// ═══════════════════════════════════════
// 3D 浮空能量金币 (Energy Coins)
// ═══════════════════════════════════════
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
  coinMesh.position.set(laneX, 0.9, -210);
  scene.add(coinMesh);
  coins.push(coinMesh);
}

// ═══════════════════════════════════════
// 尾部火焰粒子与撞击火花
// ═══════════════════════════════════════
const particles = [];
const pGeo = new THREE.SphereGeometry(0.12, 6, 6);

function createSpark(x, y, z, colorHex, count = 15) {
  for (let i = 0; i < count; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.set(x, y, z);
    scene.add(pMesh);
    particles.push({
      mesh: pMesh,
      vx: (Math.random() - 0.5) * 0.8,
      vy: Math.random() * 0.6 + 0.1,
      vz: (Math.random() - 0.5) * 0.8,
      life: 1.0
    });
  }
}

// ═══════════════════════════════════════
// 游戏开始与重置
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
  carState.x = 0;
  carState.velocityX = 0;
  player.group.position.set(0, 0, 0);
  player.group.rotation.set(0, 0, 0);

  scoreEl.textContent = "0";
  nitroBar.style.width = "100%";
}

function startGame() {
  playerName = playerNameInput.value.trim() || "极速车神";
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
  message.innerHTML = `本次竞速得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩正在提交服务器...`;
  document.querySelector("#start").textContent = "再来一局";
  overlay.classList.remove("hidden");

  // 车辆撞毁飞起特效
  player.group.rotation.x = 0.5;
  player.group.position.y = 1.5;
  createSpark(player.group.position.x, 1.0, player.group.position.z, 0xff0044, 40);

  try {
    await api.post("/api/scores", { name: playerName, score: finalScore });
    message.innerHTML = `本次竞速得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩已收录至排行榜！`;
    await loadLeaderboard();
  } catch (error) {
    message.innerHTML = `本次竞速得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>服务器离线，已保存至本机最佳。`;
    setServerState(false);
  }
}

// ═══════════════════════════════════════
// 游戏主逻辑每帧更新
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  frame++;

  // 1. 速度与氮气 (NITRO)
  const accelerating = keys.KeyW || keys.ArrowUp;
  boosting = (keys.Space || keys.boost) && nitro > 0;
  nitro = boosting ? Math.max(0, nitro - 0.7) : Math.min(100, nitro + 0.12);

  const targetSpeed = accelerating ? 1.4 : 1.0;
  baseSpeed += (targetSpeed - baseSpeed) * 0.05;
  currentSpeed = baseSpeed + (boosting ? 0.9 : 0);

  score += currentSpeed * 0.45;
  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(currentSpeed * 125); // KM/H 仪表显示

  // 2. 玩家赛车横向控制与 QQ飞车侧倾 (Roll & Yaw)
  const turnLeft = keys.ArrowLeft || keys.KeyA || keys.left;
  const turnRight = keys.ArrowRight || keys.KeyD || keys.right;

  if (turnLeft) carState.velocityX -= 0.045;
  if (turnRight) carState.velocityX += 0.045;
  carState.velocityX *= 0.88; // 阻尼
  carState.x += carState.velocityX * 10;

  // 赛道边缘限制
  const maxBound = ROAD_WIDTH / 2 - 1.8;
  if (carState.x < -maxBound) {
    carState.x = -maxBound;
    carState.velocityX = 0;
  }
  if (carState.x > maxBound) {
    carState.x = maxBound;
    carState.velocityX = 0;
  }

  // 飞车车身侧倾角度 (漂移动态)
  carState.roll = -carState.velocityX * 1.8;
  carState.yaw = -carState.velocityX * 0.9;
  player.group.position.x = carState.x;
  player.group.rotation.z = carState.roll;
  player.group.rotation.y = carState.yaw;

  // 转向前轮打角
  const steerAngle = Math.max(-0.4, Math.min(0.4, carState.velocityX * 3.5));
  player.wheels[0].rotation.y = steerAngle;
  player.wheels[1].rotation.y = steerAngle;

  // 四轮高速滚转
  const wheelSpin = currentSpeed * 0.6;
  player.wheels.forEach(w => {
    w.children[0].rotation.x += wheelSpin;
  });

  // 3. 氮气推进火焰动画
  if (boosting) {
    const pulse = 1.0 + Math.random() * 0.4;
    player.thrusters[0].material.opacity = 0.85;
    player.thrusters[1].material.opacity = 0.85;
    player.thrusters[0].scale.set(pulse, pulse * 1.2, pulse);
    player.thrusters[1].scale.set(pulse, pulse * 1.2, pulse);

    // 喷射粒子
    if (frame % 2 === 0) {
      createSpark(carState.x - 0.5, 0.4, 2.8, 0x00f3ff, 2);
      createSpark(carState.x + 0.5, 0.4, 2.8, 0xd000ff, 2);
    }
    streakMat.opacity = Math.min(0.8, streakMat.opacity + 0.1);
  } else {
    player.thrusters[0].material.opacity = 0;
    player.thrusters[1].material.opacity = 0;
    streakMat.opacity = Math.max(0, streakMat.opacity - 0.08);
  }

  // 4. 赛道与建筑无限循环向后流转
  const moveZ = currentSpeed * 1.8;
  roadSegments.forEach(seg => {
    seg.position.z += moveZ;
    if (seg.position.z > ROAD_SEGMENT_LENGTH) {
      seg.position.z -= TOTAL_ROAD_LEN;
    }
  });

  buildings.forEach(b => {
    b.position.z += moveZ * 0.75;
    if (b.position.z > 20) {
      b.position.z -= TOTAL_ROAD_LEN;
    }
  });

  // 5. 敌车生成与运动
  if (frame % Math.max(45, Math.floor(90 - currentSpeed * 15)) === 0) {
    spawnTraffic();
  }
  if (Math.random() < 0.035) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.4;
    enemy.wheels.forEach(w => { w.children[0].rotation.x += 0.3; });

    // 碰撞检测 (3D AABB 盒)
    const pPos = player.group.position;
    const ePos = enemy.group.position;
    const dx = Math.abs(pPos.x - ePos.x);
    const dz = Math.abs(pPos.z - ePos.z);

    if (dx < 1.9 && dz < 3.8) {
      return endGame();
    }

    // 超出屏幕后移除
    if (enemy.group.position.z > 25) {
      scene.remove(enemy.group);
      traffic.splice(i, 1);
    }
  }

  // 6. 金币收集检测
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

  // 7. 粒子更新
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

  // 8. QQ飞车式 第三人称跟车视角 (Smooth Chase Camera)
  const targetCamX = carState.x * 0.72;
  const targetCamY = boosting ? 3.4 : 3.6;
  const targetCamZ = boosting ? 8.6 : 8.0;

  camera.position.x += (targetCamX - camera.position.x) * 0.12;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  // 开启氮气时 FOV 广角推背感 (大喷拉伸镜头)
  const targetFov = boosting ? 76 : 60;
  camera.fov += (targetFov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();

  camera.lookAt(carState.x * 0.45, 1.2, -18);
  playerLight.position.set(carState.x, 2, 2);
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
// 排行榜与服务器状态对接
// ═══════════════════════════════════════
function setServerState(online) {
  serverDot.classList.toggle("online", online);
  serverDot.classList.toggle("offline", !online);
  serverText.textContent = online ? "服务器在线" : "单机模式";
}

function renderLeaderboard(scores) {
  if (!scores.length) {
    leaderboardList.innerHTML = "<li>暂无战绩，等你来破纪录！</li>";
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
    leaderboardList.innerHTML = "<li>服务器未连上，本地纪录有效。</li>";
  }
}

// ═══════════════════════════════════════
// 事件绑定 (键盘 + 触屏)
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

bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");
document.querySelector("#start").addEventListener("click", startGame);
refreshRanks.addEventListener("click", loadLeaderboard);

// 启动
loadLeaderboard();
render();
