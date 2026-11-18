/**
 * 3D 真实公路驾驶模拟 - 特斯拉轿跑与自然生机探索
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
const tiltToggle = document.querySelector("#tiltToggle");
const buttonMode = document.querySelector("#buttonMode");
const tiltMode = document.querySelector("#tiltMode");
const menuButtonMode = document.querySelector("#menuButtonMode");
const menuTiltMode = document.querySelector("#menuTiltMode");
const steeringHelp = document.querySelector("#steeringHelp");
const impactHud = document.querySelector("#impactHud");
const impactValue = document.querySelector("#impactValue");
const soundStatus = document.querySelector("#soundStatus");

// ── 基础运行状态 ──
let running = false;
let score = 0;
let nitro = 100;
let baseSpeed = 1.0;
let currentSpeed = 1.0;
let boosting = false;
let frame = 0;
let impactTimer = null;
let tiltEnabled = false;
let tiltSteer = 0;
let tiltCenter = null;
let steeringMode = "buttons";
const keys = {};

let best = Number(localStorage.getItem("neonRushBest") || 0);
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
bestEl.textContent = best;

let currentTheme = localStorage.getItem("racerSceneTheme") || "country";

// ── API 接口 ──
const api = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`GET ${path} failed`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`POST ${path} failed`);
    return res.json();
  }
};

// ═══════════════════════════════════════
// 100% 稳定运行的真实公路自驾车载音乐与声效系统 (HTML5 Audio + WebAudio 深度双引擎)
// ═══════════════════════════════════════
class MusicEngine {
  constructor() {
    this.enabled = true;
    this.bgmAudio = null;
    this.crashAudio = null;
    this.coinAudio = null;
    this.ctx = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.synthTimer = null;
    this.synthStep = 0;
  }

  ensureContext() {
    if (!this.bgmAudio) {
      this.bgmAudio = document.querySelector("#bgmAudio") || new Audio("assets/bgm.wav");
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 1.0;
    }
    if (!this.crashAudio) {
      this.crashAudio = document.querySelector("#crashAudio") || new Audio("assets/crash.wav");
      this.crashAudio.volume = 1.0;
    }
    if (!this.coinAudio) {
      this.coinAudio = document.querySelector("#coinAudio") || new Audio("assets/coin.wav");
      this.coinAudio.volume = 0.8;
    }

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
          // iOS Safari 专用的 1-sample 静音解锁 buffer
          const buffer = this.ctx.createBuffer(1, 1, 22050);
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.ctx.destination);
          source.start(0);
          this.setupEngineSound();
        } catch (e) {}
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setupEngineSound() {
    if (!this.ctx) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sine";
      this.engineOsc.frequency.setValueAtTime(95, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) {}
  }

  updateEngine(speed, isBoosting) {
    if (!this.ctx || !this.engineOsc || !this.enabled) return;
    try {
      const targetFreq = 95 + speed * 95 + (isBoosting ? 85 : 0);
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    } catch (e) {}
  }

  startBGM() {
    if (!this.enabled) return;
    this.ensureContext();

    // 1. 原生 HTML5 音频播放
    if (this.bgmAudio) {
      try {
        if (this.bgmAudio.readyState > 0) {
          this.bgmAudio.currentTime = 0;
        }
        this.bgmAudio.volume = 1.0;
        const playPromise = this.bgmAudio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            if (audioToggle) audioToggle.textContent = "🔊 音乐播放中";
          }).catch(e => {
            console.log("HTML5 Audio wait for gesture:", e);
          });
        }
      } catch (e) {}
    }

    // 2. Web Audio 双保险合成音循环 (若 HTML5 音频加载延迟，合成音立即无缝开声)
    if (this.ctx && !this.synthTimer) {
      const melody = [523.25, 0, 587.33, 659.25, 783.99, 0, 659.25, 587.33, 523.25, 0, 440.0, 523.25, 587.33, 0, 523.25, 0, 659.25, 0, 783.99, 880.0, 1046.5, 0, 880.0, 783.99, 659.25, 0, 783.99, 659.25, 523.25, 0, 587.33, 0];
      const bass = [130.81, 130.81, 130.81, 130.81, 98.00, 98.00, 98.00, 98.00, 110.00, 110.00, 110.00, 110.00, 87.31, 87.31, 87.31, 87.31];

      this.synthTimer = setInterval(() => {
        if (!this.enabled || !running || !this.ctx || this.ctx.state !== "running") return;
        const now = this.ctx.currentTime + 0.01;
        const idx = this.synthStep % 32;

        // 底鼓
        if (idx % 4 === 0) {
          try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(145, now);
            osc.frequency.exponentialRampToValueAtTime(36, now + 0.12);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.13);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.14);
          } catch(e) {}
        }

        // 贝斯
        const bFreq = bass[Math.floor(idx / 2) % 16];
        if (bFreq && idx % 2 === 0) {
          try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(bFreq, now);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.19);
          } catch(e) {}
        }

        // 旋律
        const mFreq = melody[idx];
        if (mFreq > 0) {
          try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(mFreq, now);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.23);
          } catch(e) {}
        }

        this.synthStep++;
      }, 130);
    }
  }

  stopBGM() {
    if (this.bgmAudio) {
      try { this.bgmAudio.pause(); } catch (e) {}
    }
    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  playCrash() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.crashAudio) {
      try {
        if (this.crashAudio.readyState > 0) this.crashAudio.currentTime = 0;
        this.crashAudio.volume = 1.0;
        this.crashAudio.play().catch(() => {});
      } catch (e) {}
    }
    // Web Audio 重击双保险
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(175, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.7);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.75);
      } catch(e) {}
    }
  }

  playBarrierHit() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } catch (e) {}
    }
  }

  playCoin() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.coinAudio) {
      try {
        if (this.coinAudio.readyState > 0) this.coinAudio.currentTime = 0;
        this.coinAudio.volume = 0.8;
        this.coinAudio.play().catch(() => {});
      } catch (e) {}
    }
  }

  playBoost() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.35);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } catch (e) {}
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.bgmAudio) {
      if (this.enabled && running) {
        this.bgmAudio.play().catch(() => {});
      } else {
        this.bgmAudio.pause();
      }
    }
    if (!this.enabled && this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    } else if (this.enabled && running && !this.synthTimer) {
      this.startBGM();
    }
    return this.enabled;
  }
}

const sound = new MusicEngine();

// 手机强力马达震动 (兼容全平台手机)
function triggerHaptic(durationOrPattern = 200) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      if (Array.isArray(durationOrPattern)) {
        const success = navigator.vibrate(durationOrPattern);
        if (!success && durationOrPattern.length > 0) {
          navigator.vibrate(durationOrPattern[0]);
        }
      } else {
        navigator.vibrate(durationOrPattern);
      }
    } catch (e) {}
  }
}

// ═══════════════════════════════════════
// THREE.JS 3D 渲染与场景系统
// ═══════════════════════════════════════
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffaea, 1.8);
sunLight.position.set(30, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -55;
sunLight.shadow.camera.right = 55;
sunLight.shadow.camera.top = 65;
sunLight.shadow.camera.bottom = -35;
scene.add(sunLight);

const skyLight = new THREE.HemisphereLight(0xbfe6ff, 0x31512d, 1.05);
scene.add(skyLight);

let cameraTrauma = 0;

// ═══════════════════════════════════════
// 赛道与自然场景配置
// ═══════════════════════════════════════
const ROAD_WIDTH = 20;
const LANE_COUNT = 4;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 140;
const ROAD_SEGMENTS = 4;
const TOTAL_ROAD_LEN = ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS;

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const roadSegments = [];
const sceneryObjects = []; // 动物、木屋、树木、风车

const THEMES = {
  country: {
    name: "COUNTRY ROAD",
    cnName: "🌾 乡间小路",
    skyColor: 0x82b8f5,
    fogColor: 0xb5dca5,
    fogDensity: 0.0055,
    ambientColor: 0xffffff,
    sunColor: 0xfff6dd,
    sunIntensity: 1.8,
    roadColor: 0x3d4047,
    roadRoughness: 0.8,
    terrainColor: 0x5b9b47,
    stripeColor: 0xffffff,
    railColor: 0x8b5a2b
  },
  island: {
    name: "ISLAND ESCAPE",
    cnName: "🏝️ 逃离荒岛",
    skyColor: 0x38b6ff,
    fogColor: 0x6be0d5,
    fogDensity: 0.0055,
    ambientColor: 0xe0f7fa,
    sunColor: 0xfff0b3,
    sunIntensity: 2.1,
    roadColor: 0x484e58,
    roadRoughness: 0.6,
    terrainColor: 0xe6d49f,
    stripeColor: 0xffea00,
    railColor: 0xffffff
  },
  jungle: {
    name: "JUNGLE ODYSSEY",
    cnName: "🌴 丛林狂飙",
    skyColor: 0x163d27,
    fogColor: 0x24553e,
    fogDensity: 0.0085,
    ambientColor: 0xa7d7c5,
    sunColor: 0xccffcc,
    sunIntensity: 1.6,
    roadColor: 0x2e251e,
    roadRoughness: 0.9,
    terrainColor: 0x1c472d,
    stripeColor: 0x88d49e,
    railColor: 0x3d2b1f
  },
  river: {
    name: "CANYON RIVER",
    cnName: "🌊 沿河峡谷",
    skyColor: 0x6088c4,
    fogColor: 0x98d2ec,
    fogDensity: 0.0065,
    ambientColor: 0xdde5ed,
    sunColor: 0xffffff,
    sunIntensity: 1.9,
    roadColor: 0x35373d,
    roadRoughness: 0.7,
    terrainColor: 0x8f5e48,
    stripeColor: 0xffffff,
    railColor: 0x219ebc
  }
};

// ═══════════════════════════════════════
// 生动大自然元素模型生成 (动物、木屋、风车、树木)
// ═══════════════════════════════════════

// 1. 呆萌小牛 (Cow)
function createCow() {
  const cow = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xffafcc, roughness: 0.6 });

  // 身体
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.4), whiteMat);
  body.position.y = 1.3;
  cow.add(body);

  // 黑色花斑
  const spot = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.7, 1.0), blackMat);
  spot.position.set(0, 1.35, 0.3);
  cow.add(spot);

  // 头部
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), whiteMat);
  head.position.set(0, 1.8, -1.3);
  cow.add(head);

  // 粉色牛鼻子
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.4), pinkMat);
  snout.position.set(0, 1.65, -1.85);
  cow.add(snout);

  // 双角
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xd4a373 });
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), hornMat);
  hornL.position.set(-0.4, 2.3, -1.3);
  hornL.rotation.z = -0.3;
  cow.add(hornL);

  const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), hornMat);
  hornR.position.set(0.4, 2.3, -1.3);
  hornR.rotation.z = 0.3;
  cow.add(hornR);

  // 四条腿
  const legGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6);
  const legPositions = [
    [-0.55, 0.45, -0.8],
    [ 0.55, 0.45, -0.8],
    [-0.55, 0.45,  0.8],
    [ 0.55, 0.45,  0.8]
  ];
  legPositions.forEach(p => {
    const leg = new THREE.Mesh(legGeo, blackMat);
    leg.position.set(p[0], p[1], p[2]);
    cow.add(leg);
  });

  return cow;
}

// 2. 灵动小鹿 (Deer)
function createDeer() {
  const deer = new THREE.Group();
  const deerMat = new THREE.MeshStandardMaterial({ color: 0xa66a38, roughness: 0.7 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0x4a321e });

  // 身体
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 2.0), deerMat);
  body.position.y = 1.4;
  deer.add(body);

  // 细长颈部与小头
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 6), deerMat);
  neck.position.set(0, 2.1, -0.9);
  neck.rotation.x = 0.35;
  deer.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.8), deerMat);
  head.position.set(0, 2.6, -1.2);
  deer.add(head);

  // 鹿角
  const antlerL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 4), antlerMat);
  antlerL.position.set(-0.25, 3.1, -1.1);
  antlerL.rotation.z = -0.4;
  deer.add(antlerL);

  const antlerR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 4), antlerMat);
  antlerR.position.set(0.25, 3.1, -1.1);
  antlerR.rotation.z = 0.4;
  deer.add(antlerR);

  // 细长的腿
  const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 1.2, 6);
  [[-0.4, 0.6, -0.7], [0.4, 0.6, -0.7], [-0.4, 0.6, 0.7], [0.4, 0.6, 0.7]].forEach(p => {
    const leg = new THREE.Mesh(legGeo, deerMat);
    leg.position.set(p[0], p[1], p[2]);
    deer.add(leg);
  });

  return deer;
}

// 3. 田园农庄木屋 (Farm Cabin)
function createFarmCabin() {
  const cabin = new THREE.Group();
  // 墙体
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.8 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.5, 5.0), wallMat);
  walls.position.y = 1.75;
  cabin.add(walls);

  // 三角红色屋顶
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xba181b, roughness: 0.6 });
  const roofGeo = new THREE.ConeGeometry(5.0, 2.4, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 4.7;
  cabin.add(roof);

  // 烟囱
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.8, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  chimney.position.set(1.5, 5.2, 0.8);
  cabin.add(chimney);

  return cabin;
}

// 4. 转动的慢速风车 (Windmill)
function createWindmill() {
  const mill = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.6, 9.0, 8),
    new THREE.MeshStandardMaterial({ color: 0xede0d4, roughness: 0.8 })
  );
  tower.position.y = 4.5;
  mill.add(tower);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a5a40 })
  );
  cap.position.y = 10.1;
  mill.add(cap);

  // 4 叶风车轮
  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 9.5, -1.9);

  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfefae0 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.5, 0.08), bladeMat);
    blade.position.y = 2.4;
    const bHolder = new THREE.Group();
    bHolder.rotation.z = (i * Math.PI) / 2;
    bHolder.add(blade);
    fanGroup.add(bHolder);
  }
  mill.add(fanGroup);
  mill.userData = { fan: fanGroup };
  return mill;
}

// 5. 乡村大树
function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 3.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
  );
  trunk.position.y = 1.75;
  tree.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.4, 1),
    new THREE.MeshStandardMaterial({ color: 0x38761d, roughness: 0.8 })
  );
  leaves.position.y = 4.4;
  tree.add(leaves);
  return tree;
}

// 6. 热带海岛椰子树
function createPalm() {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, 6.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 })
  );
  trunk.position.y = 3.25;
  palm.add(trunk);

  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 4.0, 4),
      new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.7 })
    );
    leaf.position.set(0, 6.3, 0);
    leaf.rotation.z = Math.PI / 2.8;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    palm.add(leaf);
  }
  return palm;
}

// ═══════════════════════════════════════
// 真正的普通纯电轿车（特斯拉 Model 3 风格）
// 绝无 F1 大尾翼风刀，圆润流线全景天幕
// 并且严格以后轴中心为旋转枢轴 (零后轴漂移)
// ═══════════════════════════════════════
function createTeslaCar(isPlayer = true, colorHex = 0xffffff) {
  const carGroup = new THREE.Group();

  // 高级纯电烤漆车漆
  const paintMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.25,
    metalness: 0.7
  });

  // 特斯拉全景黑水晶天幕玻璃
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0a101d,
    roughness: 0.05,
    metalness: 0.92
  });

  // 深色底盘工程塑料
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x22242b,
    roughness: 0.6,
    metalness: 0.5
  });

  // ───── 核心物理布局：后轮在 Z = 0，前轮在 Z = -2.7 ─────
  // 1. 下底盘主结构 (平整低风阻滑板底盘)
  const chassis = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), paintMat);
  chassis.scale.set(1.08, 0.34, 2.3);
  chassis.position.set(0, 0.52, -1.35); // 圆润底盘中心位于前后轮中点
  chassis.castShadow = true;
  carGroup.add(chassis);

  // 2. 特斯拉一体式无格栅平滑流线车头 (Aerodynamic Closed Front)
  const frontNose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), paintMat);
  frontNose.scale.set(0.93, 0.18, 0.72);
  frontNose.position.set(0, 0.46, -3.25);
  frontNose.rotation.x = 0.12; // 下探低风阻斜面
  frontNose.castShadow = true;
  carGroup.add(frontNose);

  // 3. 优雅圆润溜背驾驶舱与全景天幕玻璃 (Fastback Glass Canopy)
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), glassMat);
  cabin.scale.set(0.76, 0.42, 1.38);
  cabin.position.set(0, 0.93, -1.35);
  cabin.castShadow = true;
  carGroup.add(cabin);

  // 4. 前后车顶立柱与流线线条
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 1.6), paintMat);
  roof.position.set(0, 1.15, -1.35);
  carGroup.add(roof);

  // 5. 特斯拉后视镜 (左右微型低风阻外后视镜)
  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.15), paintMat);
  mirrorL.position.set(-1.08, 0.82, -2.1);
  carGroup.add(mirrorL);

  const mirrorR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.15), paintMat);
  mirrorR.position.set(1.08, 0.82, -2.1);
  carGroup.add(mirrorR);

  // 6. 前矩阵 LED 狭长大灯 (极简科技感，非赛车大灯)
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.1), hlMat);
  hlL.position.set(-0.7, 0.45, -3.75);
  carGroup.add(hlL);

  const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.1), hlMat);
  hlR.position.set(0.7, 0.45, -3.75);
  carGroup.add(hlR);

  // 7. 特斯拉贯穿式简洁红色尾灯 (极简平直尾部，无大尾翼！)
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1e32 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.1), tailMat);
  tail.position.set(0, 0.62, 0.88);
  carGroup.add(tail);

  // 8. 4 个特斯拉标准风刃轮毂轮组 (前轮独立转向 + 后轮无打角紧锁)
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x88929e, metalness: 0.85, roughness: 0.3 }); // 枪灰金属

  // 精准坐标：后轮中心严格在 Z = 0！前轮中心严格在 Z = -2.7！
  const wheelPositions = [
    [-1.02, 0.42, -2.7], // 前左 (转向轮)
    [ 1.02, 0.42, -2.7], // 前右 (转向轮)
    [-1.02, 0.42,  0.0], // 后左 (后轴中心，零漂移！)
    [ 1.02, 0.42,  0.0]  // 后右 (后轴中心，零漂移！)
  ];

  wheelPositions.forEach((pos, idx) => {
    // 转向节支架 (前轮转向 Y 轴)
    const steerGroup = new THREE.Group();
    steerGroup.position.set(pos[0], pos[1], pos[2]);

    // 轮轴滚动
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    spinGroup.add(tire);

    // 特斯拉风刃轮毂盖
    const aeroRim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.34, 12), rimMat);
    aeroRim.rotation.z = Math.PI / 2;
    spinGroup.add(aeroRim);

    steerGroup.add(spinGroup);
    carGroup.add(steerGroup);

    wheels.push({
      steer: steerGroup,
      spin: spinGroup,
      isFront: idx < 2
    });
  });

  carGroup.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  return { group: carGroup, wheels };
}

// 实例化玩家特斯拉 (纯白 Model 3 风格)
const player = createTeslaCar(true, 0xf0f3f6);
scene.add(player.group);
player.group.position.set(0, 0, 0);

// ═══════════════════════════════════════
// 纯正物理车辆运动学 (后轴中心旋转，零侧滑漂移)
// ═══════════════════════════════════════
const carPhysics = {
  x: 0,
  heading: 0,      // 车身偏航角 (Heading)
  steerAngle: 0,   // 前轮转向打角
  roll: 0,         // 悬挂轻微侧倾
  rollVel: 0
};

// 严谨普通家用车物理参数 (特斯拉 Model 3 轴距 2.85m，高速变道平顺沉稳，零侧滑漂移)
const PHYS = {
  wheelbase: 2.85,         // 特斯拉中型轿车轴距 (m)
  maxSteerAngle: 0.16,     // 前轮适度真实转向打角 (~9.2度，清晰直观的前轮转向，非卡丁车急拐)
  steerSpeed: 4.8,         // 方向盘打舵速率
  steerReturn: 6.8,        // 方向盘自动回正速率
  maxHeading: 0.085,       // 高速公路平稳变道最大车身偏航角 (~4.9度，绝不甩尾漂移)
  headingAlignRate: 5.2,   // 循迹自动对齐车道回正力矩
  suspensionOmega: 7.5,
  suspensionZeta: 0.98,
  maxRollAngle: 0.02       // 真实轿车极小微弱侧倾 (~1.1度)
};

// ═══════════════════════════════════════
// 敌车与金币管理
// ═══════════════════════════════════════
const traffic = [];
const trafficColors = [0x111111, 0x0055ff, 0xcc2222, 0x888888, 0x1e3a5f];

function spawnTraffic() {
  const laneIndex = Math.floor(Math.random() * LANE_COUNT);
  const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
  const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
  const enemy = createTeslaCar(false, color);

  enemy.group.position.set(laneX, 0, -200);
  enemy.speed = 0.22 + Math.random() * 0.18;
  scene.add(enemy.group);
  traffic.push(enemy);
}

const coins = [];
const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
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
  coinMesh.position.set(laneX, 0.85, -220);
  scene.add(coinMesh);
  coins.push(coinMesh);
}

// 粒子系统
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

function showImpact(label, x, z, heavy = false) {
  if (impactHud && impactValue) {
    impactValue.textContent = label;
    impactHud.classList.add("visible");
    clearTimeout(impactTimer);
    impactTimer = setTimeout(() => impactHud.classList.remove("visible"), heavy ? 1100 : 520);
  }
  document.body.classList.remove("impact-flash");
  void document.body.offsetWidth;
  document.body.classList.add("impact-flash");
  cameraTrauma = Math.max(cameraTrauma, heavy ? 1 : 0.45);
  createSpark(x, 0.65, z, heavy ? 0xff3b30 : 0xffc857, heavy ? 36 : 16);
  triggerHaptic(heavy ? [350, 120, 500] : 220);
}

// ═══════════════════════════════════════
// 场景初始化与景观填充
// ═══════════════════════════════════════
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

  // 两侧丰富大自然元素 (小牛、小鹿、风车、木屋、树木) - 密集沿公路两侧排布
  const SCENERY_COUNT = 150;
  for (let i = 0; i < SCENERY_COUNT; i++) {
    let item;
    const rand = Math.random();

    if (themeKey === "country") {
      if (rand < 0.28) item = createCow();          // 呆萌小牛
      else if (rand < 0.50) item = createDeer();     // 路边小鹿
      else if (rand < 0.65) item = createWindmill(); // 旋转大风车
      else if (rand < 0.80) item = createFarmCabin(); // 农庄小木屋
      else item = createTree();                      // 树木
    } else if (themeKey === "island") {
      if (rand < 0.35) item = createDeer();
      else if (rand < 0.55) item = createWindmill();
      else item = createPalm();
    } else if (themeKey === "jungle") {
      if (rand < 0.4) item = createDeer();
      else item = createTree();
    } else {
      if (rand < 0.3) item = createCow();
      else if (rand < 0.6) item = createFarmCabin();
      else item = createTree();
    }

    const side = i % 2 === 0 ? -1 : 1;
    // 紧贴公路护栏外侧！路宽20，半宽10，护栏在10.2，景物在 11.2 到 15.5 之间，驾驶视角极为清晰
    const offset = ROAD_WIDTH / 2 + 1.2 + Math.random() * 4.0;
    const zPos = - (i * 3.6);
    item.position.set(side * offset, 0, zPos);
    item.userData = {
      ...item.userData,
      baseY: item.position.y,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmount: item.name === "" ? 0.012 + Math.random() * 0.012 : 0.008
    };

    // 动物随机面朝赛道看风景
    item.rotation.y = (side === 1 ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 0.4;

    worldGroup.add(item);
    item.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    sceneryObjects.push(item);
  }
}

function buildRoadSegment(zOffset, theme) {
  const seg = new THREE.Group();
  seg.position.z = zOffset;

  // 大地
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(280, ROAD_SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({ color: theme.terrainColor, roughness: 0.9 })
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05;
  terrain.receiveShadow = true;
  seg.add(terrain);

  // 沥青公路
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({ color: theme.roadColor, roughness: theme.roadRoughness, metalness: 0.25 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  seg.add(road);

  // 道路白线
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

  // 真实原木护栏
  const railGeo = new THREE.BoxGeometry(0.35, 0.65, ROAD_SEGMENT_LENGTH);
  const railMat = new THREE.MeshStandardMaterial({ color: theme.railColor, roughness: 0.7 });

  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-ROAD_WIDTH / 2 - 0.2, 0.35, 0);
  seg.add(railL);
  railL.castShadow = true;

  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(ROAD_WIDTH / 2 + 0.2, 0.35, 0);
  seg.add(railR);
  railR.castShadow = true;

  // 连续的道路反光柱：强化道路边界、速度参照和两侧装饰层次。
  for (let marker = 0; marker < 6; marker++) {
    const z = -ROAD_SEGMENT_LENGTH / 2 + marker * 24 + 10;
    [-1, 1].forEach(side => {
      const post = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.08, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.55 })
      );
      stem.position.y = 0.48;
      post.add(stem);
      const reflector = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.16, 0.05),
        new THREE.MeshBasicMaterial({ color: theme.stripeColor })
      );
      reflector.position.set(-side * 0.08, 0.7, -0.05);
      post.add(reflector);
      post.position.set(side * (ROAD_WIDTH / 2 + 0.72), 0, z);
      post.traverse(node => {
        if (node.isMesh) node.castShadow = true;
      });
      seg.add(post);
    });
  }

  worldGroup.add(seg);
  roadSegments.push(seg);
}

// ═══════════════════════════════════════
// 游戏开始与结束生命周期
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
  cameraTrauma = 0;

  carPhysics.x = 0;
  carPhysics.heading = 0;
  carPhysics.steerAngle = 0;
  carPhysics.roll = 0;
  carPhysics.rollVel = 0;

  player.group.position.set(0, 0, 0);
  player.group.rotation.set(0, 0, 0);
  player.wheels[0].steer.rotation.set(0, 0, 0);
  player.wheels[1].steer.rotation.set(0, 0, 0);

  scoreEl.textContent = "0";
  nitroBar.style.width = "100%";

  // 开局立即在前方车道生成 6 辆巡航车流，绝不让道路空旷！
  const initialZ = [-28, -55, -85, -120, -160, -205];
  initialZ.forEach((z, idx) => {
    const laneIndex = idx % LANE_COUNT;
    const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
    const color = trafficColors[idx % trafficColors.length];
    const enemy = createTeslaCar(false, color);
    enemy.group.position.set(laneX, 0, z);
    enemy.speed = 0.22 + Math.random() * 0.16;
    scene.add(enemy.group);
    traffic.push(enemy);
  });
}

function startGame() {
  sound.ensureContext();
  running = true;
  overlay.classList.add("hidden");

  playerName = playerNameInput.value.trim() || "自驾游车友";
  localStorage.setItem("neonRacerName", playerName);
  resetGame();

  sound.startBGM();
  if (soundStatus) soundStatus.textContent = "🔊 引擎、音乐、碰撞音效已开启";
  triggerHaptic(40);
}

async function endGame() {
  running = false;
  sound.stopBGM();

  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  bestEl.textContent = best;
  title.textContent = "旅程结束";
  message.innerHTML = `本次安全行驶得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>避开车流，再挑战一次吧。`;
  document.querySelector("#start").textContent = "重新启程";
  overlay.classList.remove("hidden");

  // 撞击反馈
  document.body.classList.remove("crash-flash");
  void document.body.offsetWidth;
  document.body.classList.add("crash-flash");

  cameraTrauma = 1.0;
  sound.playCrash();
  triggerHaptic([250, 100, 300, 100, 500]);

  createSpark(player.group.position.x, 0.6, player.group.position.z - 2.5, 0xffaa00, 35);

  try {
    await api.post("/api/scores", { name: playerName, score: finalScore });
    await loadLeaderboard();
  } catch (error) {
    setServerState(false);
  }
}

// ═══════════════════════════════════════
// 核心动力学更新循环 (纯正后轴阿克曼前轮转向)
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  frame++;

  // 1. 速度与加速
  const accelerating = keys.KeyW || keys.ArrowUp;
  const wantsBoost = (keys.Space || keys.boost) && nitro > 0;

  if (wantsBoost && !boosting) {
    sound.playBoost();
    triggerHaptic(40);
  }
  boosting = wantsBoost;
  nitro = boosting ? Math.max(0, nitro - 0.7) : Math.min(100, nitro + 0.12);

  const targetSpeed = accelerating ? 1.12 : 0.72;
  baseSpeed += (targetSpeed - baseSpeed) * 0.05;
  currentSpeed = baseSpeed + (boosting ? 0.38 : 0);

  score += currentSpeed * 0.45;
  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(currentSpeed * 90);

  sound.updateEngine(currentSpeed, boosting);

  // 2. 真实汽车物理转向 (后轴旋转中心，零漂移！)
  const turnLeft = steeringMode === "buttons" && (keys.ArrowLeft || keys.KeyA || keys.left);
  const turnRight = steeringMode === "buttons" && (keys.ArrowRight || keys.KeyD || keys.right);

  const dt = 1 / 60;

  // 驾驶员前轮机械转向打角 (向左为负，向右为正)
  let targetSteer = 0;
  if (turnLeft) targetSteer = -PHYS.maxSteerAngle;
  else if (turnRight) targetSteer = PHYS.maxSteerAngle;
  else if (steeringMode === "tilt" && Math.abs(tiltSteer) > 0.08) {
    targetSteer = tiltSteer * PHYS.maxSteerAngle;
  }

  const steerSpeed = targetSteer === 0 ? PHYS.steerReturn : PHYS.steerSpeed;
  carPhysics.steerAngle += (targetSteer - carPhysics.steerAngle) * Math.min(1.0, steerSpeed * dt * 3.5);

  // 阿克曼汽车动力学：前轮打角带动整车绕【后轴中心】偏转
  // d(heading)/dt = (v / L) * tan(steerAngle)
  const angularVelocity = (currentSpeed / PHYS.wheelbase) * Math.tan(carPhysics.steerAngle) * 0.8;
  carPhysics.heading += angularVelocity * dt * 2.2;

  // 松开按键时，车身平滑自动回正平行于车道
  if (targetSteer === 0) {
    carPhysics.heading += (0 - carPhysics.heading) * Math.min(1.0, PHYS.headingAlignRate * dt * 3.2);
  }

  // 限制变道最大角度 (真实平稳变道，绝无打滑甩尾)
  carPhysics.heading = Math.max(-PHYS.maxHeading, Math.min(PHYS.maxHeading, carPhysics.heading));

  // 核心定则：后轴中心严格顺着车身朝向切线前进，没有任何横向打滑！
  // 速度在 X 轴的物理切向投影 (heading > 0 为向右，heading < 0 为向左)
  const forwardVel = currentSpeed * 17.0;
  const lateralVel = forwardVel * Math.sin(carPhysics.heading);
  carPhysics.x += lateralVel * dt;

  // 护栏阻挡
  const maxBound = ROAD_WIDTH / 2 - 1.8;
  if (carPhysics.x < -maxBound) {
    carPhysics.x = -maxBound;
    carPhysics.heading = Math.abs(carPhysics.heading) * 0.35;
    carPhysics.steerAngle *= 0.25;
    sound.playBarrierHit();
    showImpact("左侧护栏碰撞", carPhysics.x, player.group.position.z);
  }
  if (carPhysics.x > maxBound) {
    carPhysics.x = maxBound;
    carPhysics.heading = -Math.abs(carPhysics.heading) * 0.35;
    carPhysics.steerAngle *= 0.25;
    sound.playBarrierHit();
    showImpact("右侧护栏碰撞", carPhysics.x, player.group.position.z);
  }

  // 底盘微弱平稳侧倾 (转向右时离心力向左，车身向左微倾；转向左时车身向右微倾)
  const rollAcc = -lateralVel * 0.002 - Math.pow(PHYS.suspensionOmega, 2) * carPhysics.roll - 2 * PHYS.suspensionZeta * PHYS.suspensionOmega * carPhysics.rollVel;
  carPhysics.rollVel += rollAcc * dt * 2.0;
  carPhysics.roll += carPhysics.rollVel * dt * 2.0;
  carPhysics.roll = Math.max(-PHYS.maxRollAngle, Math.min(PHYS.maxRollAngle, carPhysics.roll));

  // 3. 应用姿态：车体以【后轴中心】为枢轴偏转，前轮转向领航，后轮绝不打滑！
  // 在面向 -Z 的右手坐标系中：
  // 朝向右侧 (+X) 需要绕 Y 轴顺时针旋转，即 rotation.y 为负 (-heading)
  // 朝向左侧 (-X) 需要绕 Y 轴逆时针旋转，即 rotation.y 为正 (-heading)
  player.group.position.x = carPhysics.x;
  player.group.position.y = Math.sin(frame * 0.16) * 0.012 + Math.abs(carPhysics.rollVel) * 0.018;
  player.group.rotation.y = -carPhysics.heading; // 偏航角：向右偏为负，向左偏为正
  player.group.rotation.z = -carPhysics.roll;

  // 前轮机械打舵转向：向右打舵为负，向左打舵为正 (左右打舵清晰可见且方向与车头行进绝对一致！)
  player.wheels[0].steer.rotation.y = -carPhysics.steerAngle;
  player.wheels[1].steer.rotation.y = -carPhysics.steerAngle;

  // 后轮固定 0 度无相对打角，四轮平滑滚动
  player.wheels[2].steer.rotation.y = 0;
  player.wheels[3].steer.rotation.y = 0;

  const wheelSpin = currentSpeed * 0.75;
  player.wheels.forEach(w => {
    w.spin.rotation.x += wheelSpin;
  });

  // 4. 赛道与自然景物流转 + 风车旋转
  const moveZ = currentSpeed * 1.35;
  roadSegments.forEach(seg => {
    seg.position.z += moveZ;
    if (seg.position.z > ROAD_SEGMENT_LENGTH) {
      seg.position.z -= TOTAL_ROAD_LEN;
    }
  });

  sceneryObjects.forEach(item => {
    item.position.z += moveZ;
    if (item.position.z > 25) {
      item.position.z -= 540;
    }
    // 风吹植被和装饰物轻摆，避免所有景物像静态积木。
    const sway = item.userData && item.userData.swayPhase;
    if (sway !== undefined) {
      item.rotation.z = Math.sin(frame * 0.035 + sway) * (item.userData.swayAmount || 0.01);
      item.position.y = (item.userData.baseY || 0) + Math.sin(frame * 0.025 + sway) * 0.012;
    }
    // 风车慢速旋转
    if (item.userData && item.userData.fan) {
      item.userData.fan.rotation.z += 0.02;
    }
  });

  // 5. 敌车刷新与真实碰撞检测 (高频刷新车流，丰富自驾驾驶感)
  if (frame % Math.max(35, Math.floor(65 - currentSpeed * 10)) === 0) {
    spawnTraffic();
  }
  if (Math.random() < 0.03) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.0;
    enemy.group.position.y = Math.sin(frame * 0.11 + i) * 0.01;
    enemy.group.rotation.z = Math.sin(frame * 0.08 + i) * 0.006;
    enemy.wheels.forEach(w => {
      w.spin.rotation.x += 0.35;
    });

    // 碰撞盒 (特斯拉长 4.5m，后轴在原点，车体在 -3.4 到 0.9 之间)
    const pPos = player.group.position;
    const ePos = enemy.group.position;
    const dx = Math.abs(pPos.x - ePos.x);
    const dz = Math.abs((pPos.z - 1.3) - (ePos.z - 1.3));

    if (dx < 1.85 && dz < 4.2) {
      showImpact("车辆正面碰撞", ePos.x, ePos.z, true);
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
    const dz = Math.abs((player.group.position.z - 1.3) - coin.position.z);

    if (dx < 1.9 && dz < 2.5) {
      score += 50;
      nitro = Math.min(100, nitro + 25);
      createSpark(coin.position.x, 1.0, coin.position.z, 0xffd700, 16);
      sound.playCoin();
      triggerHaptic(25);
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

  // 8. 第三人称跟随相机 (贴近真实自驾后视角)
  const targetCamX = carPhysics.x * 0.72;
  const targetCamY = boosting ? 3.3 : 3.5;
  const targetCamZ = boosting ? 6.5 : 6.0; // 紧贴车尾

  camera.position.x += (targetCamX - camera.position.x) * 0.12;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  if (cameraTrauma > 0) {
    const p = Math.pow(cameraTrauma, 2);
    camera.position.x += (Math.random() - 0.5) * 1.5 * p;
    camera.position.y += (Math.random() - 0.5) * 1.2 * p;
    cameraTrauma = Math.max(0, cameraTrauma - 0.04);
  }

  const targetFov = boosting ? 68 : 58;
  camera.fov += (targetFov - camera.fov) * 0.08;
  camera.updateProjectionMatrix();

  camera.lookAt(carPhysics.x * 0.45, 1.1, -16);
}

// ═══════════════════════════════════════
// 渲染循环与音频状态自动保持
// ═══════════════════════════════════════
const FIXED_STEP_MS = 1000 / 60;
let previousFrameTime = 0;
let updateAccumulator = 0;

function render(timestamp = performance.now()) {
  if (!previousFrameTime) previousFrameTime = timestamp;
  // Cap catch-up after tab suspension and simulate at 60 Hz on every display.
  const elapsed = Math.min(timestamp - previousFrameTime, 100);
  previousFrameTime = timestamp;
  updateAccumulator += elapsed;
  while (updateAccumulator >= FIXED_STEP_MS) {
    update();
    updateAccumulator -= FIXED_STEP_MS;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

// 排行榜对接
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
// 全局交互与事件绑定 (确保苹果 iOS Safari 及全平台 100% 唤醒音频)
// ═══════════════════════════════════════
function unlockAudioAndHaptics() {
  sound.ensureContext();
  if (running && sound.enabled) {
    if (sound.bgmAudio && sound.bgmAudio.paused) {
      sound.startBGM();
    }
  }
}

window.addEventListener("pointerdown", unlockAudioAndHaptics, { passive: true });
window.addEventListener("touchstart", unlockAudioAndHaptics, { passive: true });
window.addEventListener("click", unlockAudioAndHaptics, { passive: true });

function handleDeviceTilt(event) {
  const gravityX = event.accelerationIncludingGravity?.x;
  if (!tiltEnabled || typeof gravityX !== "number") return;
  if (tiltCenter === null) tiltCenter = gravityX;
  const lean = gravityX - tiltCenter;
  // 重力在横向的分量约 3.5 m/s² 时达到满舵；过滤传感器轻微抖动。
  const normalized = Math.max(-1, Math.min(1, lean / 3.5));
  const deadZone = 0.08;
  const target = Math.abs(normalized) < deadZone
    ? 0
    : Math.sign(normalized) * (Math.abs(normalized) - deadZone) / (1 - deadZone);
  tiltSteer += (target - tiltSteer) * 0.22;
}

async function toggleTiltSteering() {
  if (tiltEnabled) {
    tiltEnabled = false;
    tiltSteer = 0;
    tiltCenter = null;
    window.removeEventListener("devicemotion", handleDeviceTilt);
    steeringMode = "buttons";
    updateSteeringModeUI();
    tiltToggle.textContent = "📱";
    tiltToggle.title = "开启手机倾斜转向";
    if (soundStatus) soundStatus.textContent = "📱 倾斜转向已关闭";
    return;
  }

  try {
    const motion = window.DeviceMotionEvent;
    if (!motion) throw new Error("设备不支持加速度传感器");
    if (typeof motion.requestPermission === "function") {
      const permission = await motion.requestPermission();
      if (permission !== "granted") throw new Error("未获得动作传感器权限");
    }
    tiltCenter = null;
    tiltSteer = 0;
    tiltEnabled = true;
    window.addEventListener("devicemotion", handleDeviceTilt, true);
    tiltToggle.textContent = "📱✓";
    tiltToggle.title = "倾斜转向已开启，点击关闭";
    steeringMode = "tilt";
    updateSteeringModeUI();
    if (soundStatus) soundStatus.textContent = "📱 倾斜手机控制方向";
  } catch (error) {
    if (soundStatus) soundStatus.textContent = "此设备或浏览器不支持倾斜控制";
    tiltToggle.title = error.message;
  }
}

if (tiltToggle) {
  tiltToggle.addEventListener("click", () => {
    unlockAudioAndHaptics();
    toggleTiltSteering();
  });
}

function updateSteeringModeUI() {
  buttonMode?.classList.toggle("active", steeringMode === "buttons");
  tiltMode?.classList.toggle("active", steeringMode === "tilt");
  menuButtonMode?.classList.toggle("active", steeringMode === "buttons");
  menuTiltMode?.classList.toggle("active", steeringMode === "tilt");
  if (steeringHelp) {
    steeringHelp.textContent = steeringMode === "tilt"
      ? "已选择手机倾斜：左右摇摆手机控制方向"
      : "已选择按键：使用方向键或电脑键盘控制";
  }
}

buttonMode?.addEventListener("click", () => {
  steeringMode = "buttons";
  tiltEnabled = false;
  tiltSteer = 0;
  tiltCenter = null;
  window.removeEventListener("devicemotion", handleDeviceTilt);
  updateSteeringModeUI();
  if (soundStatus) soundStatus.textContent = "🎮 按键控制方向";
});

menuButtonMode?.addEventListener("click", () => {
  steeringMode = "buttons";
  tiltEnabled = false;
  tiltSteer = 0;
  tiltCenter = null;
  window.removeEventListener("devicemotion", handleDeviceTilt);
  updateSteeringModeUI();
});

tiltMode?.addEventListener("click", () => {
  if (!tiltEnabled) toggleTiltSteering();
});

menuTiltMode?.addEventListener("click", () => {
  if (!tiltEnabled) toggleTiltSteering();
});

function bindButton(selector, key) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    unlockAudioAndHaptics();
    triggerHaptic(30);
    keys[key] = true;
  });
  element.addEventListener("touchstart", () => {
    unlockAudioAndHaptics();
    triggerHaptic(30);
  }, { passive: true });
  ["pointerup", "pointercancel", "pointerleave", "touchend"].forEach(name => {
    element.addEventListener(name, () => { keys[key] = false; });
  });
}

window.addEventListener("keydown", event => {
  unlockAudioAndHaptics();
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

// 音量开关
if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    unlockAudioAndHaptics();
    const isEnabled = sound.toggle();
    audioToggle.textContent = isEnabled ? "🔊" : "🔇";
    audioToggle.style.opacity = isEnabled ? "1" : "0.5";
    if (soundStatus) soundStatus.textContent = isEnabled ? "🔊 音效已开启" : "🔇 音效已关闭";
  });
}

bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");

// 开始按钮绑定：同时支持 touchend 与 click (针对苹果 Safari 零延迟手势)
const startBtn = document.querySelector("#start");
let startTapped = false;
function onStartTap(e) {
  if (startTapped) return;
  startTapped = true;
  setTimeout(() => { startTapped = false; }, 350);

  unlockAudioAndHaptics();
  startGame();
}
startBtn.addEventListener("touchend", onStartTap);
startBtn.addEventListener("click", onStartTap);

const testAudioBtn = document.querySelector("#testAudioBtn");
if (testAudioBtn) {
  testAudioBtn.addEventListener("click", () => {
    sound.ensureContext();
    sound.startBGM();
    testAudioBtn.textContent = "🎵 音乐正在播放中！(若无声请关闭iPhone左侧实体静音键)";
    testAudioBtn.style.background = "rgba(40,230,120,0.25)";
    testAudioBtn.style.borderColor = "#28e678";
    testAudioBtn.style.color = "#28e678";
  });
}

refreshRanks.addEventListener("click", loadLeaderboard);

// 初始化
applyTheme(currentTheme);
loadLeaderboard();
render();
