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
let raceTime = 0;
let maxSpeed = 0;      // 本局最高时速
let finishSpeed = 0;   // 冲线瞬间时速            // 比赛用时（秒），按固定步长累计，保证两人可比
let nitro = 100;
let baseSpeed = 1.0;
let currentSpeed = 1.0;
let boosting = false;
let frame = 0;
let raceDistance = 0;
let finishDistance = 1500;
let throttleHeld = false;
let lastTrafficAt = 0;      // 上次刷车时间（毫秒），按真实时间刷车，不受帧率影响
let brakeHeld = false;
let impactTimer = null;
let tiltEnabled = false;
let tiltSteer = 0;
let tiltCenter = null;
let steeringMode = "buttons";
const keys = {};

// ── 可自定义快捷键（默认：W 油门 / S 刹车 / Shift 加速 / ←→ 转向）──
const KEYMAP_STORAGE = "racerKeymap";
const DEFAULT_KEYMAP = {
  throttle: "KeyW",
  brake: "KeyS",
  boost: "ShiftLeft",
  left: "ArrowLeft",
  right: "ArrowRight"
};
const KEY_LABELS = {
  KeyW: "W", KeyA: "A", KeyS: "S", KeyD: "D", KeyQ: "Q", KeyE: "E",
  Space: "空格", ShiftLeft: "左 Shift", ShiftRight: "右 Shift",
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  KeyJ: "J", KeyK: "K", KeyL: "L", KeyU: "U", KeyI: "I", KeyO: "O",
  Digit1: "1", Digit2: "2", Digit3: "3", Enter: "回车", Tab: "Tab"
};
let keymap = Object.assign({}, DEFAULT_KEYMAP);
try {
  Object.assign(keymap, JSON.parse(localStorage.getItem(KEYMAP_STORAGE) || "{}"));
} catch (error) { /* 忽略损坏的配置 */ }
let capturingKey = null;

function keyLabel(code) {
  return KEY_LABELS[code] || String(code || "").replace("Key", "");
}

function saveKeymap() {
  localStorage.setItem(KEYMAP_STORAGE, JSON.stringify(keymap));
}

function renderKeymapButtons() {
  ["throttle", "brake", "boost", "left", "right"].forEach(action => {
    const btn = document.querySelector(`#key-${action}`);
    if (!btn) return;
    btn.classList.toggle("capturing", capturingKey === action);
    if (capturingKey !== action) btn.textContent = keyLabel(keymap[action]);
  });
  updateControlTips();
}

function updateControlTips() {
  const tipsEl = document.querySelector("#controlTips");
  if (!tipsEl) return;
  tipsEl.textContent = `${keyLabel(keymap.throttle)} 油门　${keyLabel(keymap.brake)} 刹车　${keyLabel(keymap.boost)} 氮气　${keyLabel(keymap.left)} / ${keyLabel(keymap.right)} 转向`;
}

function startKeyCapture(action) {
  capturingKey = action;
  renderKeymapButtons();
  const btn = document.querySelector(`#key-${action}`);
  if (btn) btn.textContent = "按新键…";
}

function setMenuVisible(visible) {
  overlay.classList.toggle("hidden", !visible);
  document.body.classList.toggle("menu-open", visible);
  if (visible) {
    document.body.classList.remove("boosting-fx");
    if (player.group.userData.nitroFlames) player.group.userData.nitroFlames.visible = false;
    releaseAllInputs();
  }
}

let best = Number(localStorage.getItem("neonRushBest") || 0);
let bestTime = Number(localStorage.getItem("racerBestTime") || 0);   // 秒，0 表示还没跑过

function formatRaceTime(sec) {
  if (!sec || !isFinite(sec)) return "--";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
bestEl.textContent = formatRaceTime(bestTime);

let currentTheme = localStorage.getItem("racerSceneTheme") || "country";

// 单机离线版：不联网，成绩与最佳纪录保存在本机 localStorage
const OFFLINE_MODE = true;

// ═══════════════════════════════════════
// 100% 稳定运行的真实公路自驾车载音乐与声效系统 (HTML5 Audio + WebAudio 深度双引擎)
// ═══════════════════════════════════════
const GEM_PLAYLIST = [
  { title: "邓紫棋 - 泡沫", src: "assets/G.E.M.邓紫棋 - 泡沫.mp3" },
  { title: "邓紫棋 - 光年之外", src: "assets/G.E.M.邓紫棋 - 光年之外.mp3" },
  { title: "邓紫棋 - 来自天堂的魔鬼", src: "assets/G.E.M.邓紫棋 - 来自天堂的魔鬼.mp3" },
  { title: "邓紫棋 - 唯一", src: "assets/G.E.M.邓紫棋 - 唯一.mp3" },
  { title: "邓紫棋 - 后会无期", src: "assets/G.E.M.邓紫棋 - 后会无期.mp3" },
  { title: "邓紫棋 - 透明", src: "assets/G.E.M.邓紫棋 - 透明.mp3" },
  { title: "邓紫棋 - 龙卷风 (Live)", src: "assets/G.E.M.邓紫棋 - 龙卷风 (Live).mp3" }
];

class MusicEngine {
  constructor() {
    // 默认开启播放，可随时点击右上角喇叭手动关闭
    this.enabled = true;
    this.trackIndex = 0;
    this.bgmAudio = null;
    this.bgmBound = false;
    this.crashAudio = null;
    this.coinAudio = null;
    this.customTrackUrl = "";
    this.customTrackTitle = "";
    this.errorSkips = 0;
    this.ctx = null;
    this.engineGain = null;
    this.engineOsc = null;
  }

  currentTrack() {
    return GEM_PLAYLIST[this.trackIndex] || GEM_PLAYLIST[0];
  }

  loadTrack(index, autoPlay = false) {
    this.trackIndex = ((index % GEM_PLAYLIST.length) + GEM_PLAYLIST.length) % GEM_PLAYLIST.length;
    const track = this.currentTrack();
    if (!this.bgmAudio) return;
    this.bgmAudio.loop = false;
    const encoded = encodeURI(track.src);
    if (!this.bgmAudio.getAttribute("src") || !this.bgmAudio.src.endsWith(encoded)) {
      this.bgmAudio.src = encoded;
    }
    syncAudioUI();
    if (autoPlay && this.enabled) {
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.play().then(() => syncAudioUI()).catch(e => {
        console.log("HTML5 Audio wait for gesture:", e);
      });
    }
  }

  nextTrack(autoPlay = true) {
    if (this.customTrackUrl) {
      try { URL.revokeObjectURL(this.customTrackUrl); } catch (e) {}
      this.customTrackUrl = "";
      this.customTrackTitle = "";
    }
    this.loadTrack(this.trackIndex + 1, autoPlay);
  }

  ensureContext() {
    if (!this.bgmAudio) {
      this.bgmAudio = document.querySelector("#bgmAudio") || new Audio(encodeURI(this.currentTrack().src));
      this.bgmAudio.loop = Boolean(this.customTrackUrl);
      this.bgmAudio.volume = 1.0;
    }
    if (this.bgmAudio && !this.bgmBound) {
      this.bgmBound = true;
      this.bgmAudio.addEventListener("ended", () => {
        if (!this.enabled || this.customTrackUrl) return;
        this.nextTrack(true);
      });
      this.bgmAudio.addEventListener("error", () => {
        if (!this.enabled || this.customTrackUrl || this.errorSkips >= GEM_PLAYLIST.length) return;
        this.errorSkips += 1;
        this.nextTrack(true);
      });
      this.bgmAudio.addEventListener("playing", () => {
        this.errorSkips = 0;
        syncAudioUI();
      });
      this.bgmAudio.addEventListener("play", () => syncAudioUI());
      this.bgmAudio.addEventListener("pause", () => syncAudioUI());
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
      this.engineGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) {}
  }

  updateEngine(speed, isBoosting) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    try {
      const paused = false;
      const active = Boolean(running && this.enabled && !paused);
      this.engineGain.gain.setTargetAtTime(active ? 0.055 : 0.0001, this.ctx.currentTime, 0.08);
      if (active) {
        const targetFreq = 95 + speed * 95 + (isBoosting ? 85 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      }
    } catch (e) {}
  }

  startBGM() {
    if (!this.enabled) return;
    this.ensureContext();

    // 播放用户提供的歌单列表（单曲播完自动切换下一首循环）
    if (this.bgmAudio) {
      try {
        this.bgmAudio.loop = Boolean(this.customTrackUrl);
        this.bgmAudio.volume = 1.0;
        if (!this.bgmAudio.getAttribute("src") && !this.customTrackUrl) {
          this.loadTrack(this.trackIndex, false);
        }
        if (this.bgmAudio.paused) {
          const playPromise = this.bgmAudio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => syncAudioUI()).catch(() => {});
          }
        }
      } catch (e) {}
    }
  }

  stopBGM() {
    if (this.bgmAudio) {
      try { this.bgmAudio.pause(); } catch (e) {}
    }
    if (this.ctx && this.engineGain) {
      try { this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05); } catch (e) {}
    }
  }

  playCrash() {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.crashAudio) {
      try {
        if (this.crashAudio.readyState > 0) this.crashAudio.currentTime = 0;
        this.crashAudio.volume = 0.24;
        this.crashAudio.play().catch(() => {});
      } catch (e) {}
    }
    // 柔和低频碰撞反馈音（大幅调低音量不刺耳）
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.38);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
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
        osc.type = "triangle";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.005, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
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
    localStorage.setItem("racerAudioEnabled", this.enabled ? "1" : "0");
    if (this.enabled) {
      this.startBGM();
    } else {
      if (this.bgmAudio) this.bgmAudio.pause();
    }
    return this.enabled;
  }
}

const sound = new MusicEngine();

// 静音/开启状态同步到界面（默认静音，点右上角喇叭才出声）
function syncAudioUI() {
  const on = sound.enabled;
  const track = sound.currentTrack();
  const trackLabel = sound.customTrackUrl
    ? (sound.customTrackTitle || "自选本地歌曲")
    : `${track.title}（${sound.trackIndex + 1}/${GEM_PLAYLIST.length}）`;
  const isPlaying = Boolean(on && sound.bgmAudio && !sound.bgmAudio.paused);
  if (audioToggle) {
    audioToggle.textContent = on ? "🔊" : "🔇";
    audioToggle.style.opacity = on ? "1" : "0.55";
    audioToggle.title = on ? "关闭音乐音效" : "开启音乐音效（默认静音）";
  }
  if (soundStatus) {
    soundStatus.textContent = on
      ? (isPlaying ? `🔊 正在播放：${trackLabel}` : `🔊 音乐已启用 · 轻触屏幕播：${track.title}`)
      : "🔇 已手动静音（点右上角喇叭可恢复）";
  }
  const musicNameEl = document.querySelector("#customMusicName");
  if (musicNameEl) {
    musicNameEl.textContent = sound.customTrackUrl
      ? `当前曲目：${trackLabel}`
      : `当前曲目：${trackLabel} 歌单循环`;
  }
  const testBtn = document.querySelector("#testAudioBtn");
  if (testBtn) {
    testBtn.classList.toggle("playing", isPlaying);
    testBtn.textContent = isPlaying
      ? `🎵 正在播放：${track.title}`
      : `🎵 播放 / 试听：${track.title}`;
  }
}
if (audioToggle) {
  audioToggle.textContent = sound.enabled ? "🔊" : "🔇";
  audioToggle.style.opacity = sound.enabled ? "1" : "0.55";
}

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
const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, isMobileDevice ? 460 : 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobileDevice, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.0 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !isMobileDevice;   // 手机端关阴影，帧率优先
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let cameraBank = 0;
function getCameraFraming() {
  const aspect = Math.max(0.35, window.innerWidth / Math.max(1, window.innerHeight));
  // 竖屏手机适度放宽视野并后撤拉高镜头，保证三车道、护栏与风景清晰可见，且车位于操作区上方
  const portraitFactor = aspect < 1 ? Math.min(1, (1 - aspect) / 0.56) : 0;
  return {
    aspect,
    portraitFactor,
    baseFov: 58 + portraitFactor * 18,
    baseY: 3.5 + portraitFactor * 0.72,
    baseZ: 6.0 + portraitFactor * 2.9,
    lookY: 1.1 + portraitFactor * 0.42
  };
}

// 菜单阶段也把镜头放在车后视角，避免开局前对着地面
const initCamFraming = getCameraFraming();
camera.fov = initCamFraming.baseFov;
camera.updateProjectionMatrix();
camera.position.set(0, initCamFraming.baseY, initCamFraming.baseZ);
camera.lookAt(0, initCamFraming.lookY, -16);

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
// 三车道让中间车道中心与玩家起始位置 x=0 对齐，直行不避让就会遇到车流。
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEGMENT_LENGTH = 24;
const ROAD_SEGMENTS = 24;
const TOTAL_ROAD_LEN = ROAD_SEGMENT_LENGTH * ROAD_SEGMENTS;

// 赛道走向：《巅峰极速》风多弯道复合路线（发车直道 → 长右弧 → 连续S弯 → 环形发卡弯 → 反向回旋 → 末段压弯冲刺）
function trackCurve(distance) {
  const total = Math.max(300, finishDistance || 1500);
  const t = Math.max(0, Math.min(1, distance / total));
  // 关键节点：位置(0..1) → 横向偏移(米)
  const keys = [
    [0.00, 0],
    [0.06, 0],      // 发车加速直道
    [0.16, 24],     // 高速长右弧弯
    [0.26, -20],    // 连续左切 S 弯
    [0.36, 30],     // 连续右转大弯
    [0.44, 34],     // 环形盘旋大发卡弯顶
    [0.54, -28],    // 反向横切回旋弯
    [0.64, -34],    // 二号环形发卡弯
    [0.74, 22],     // 后段连续 S 弯摆尾
    [0.84, -18],    // 进直道前压弯切线
    [0.92, 0],      // 回正准备全速冲线
    [1.00, 0]
  ];
  let value = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      const smooth = k * k * (3 - 2 * k);   // 平滑插值，进出弯都不突兀
      value = v0 + (v1 - v0) * smooth;
      break;
    }
    if (t > t1) value = v1;
  }
  // 叠加自然蜿蜒，直线也富有路面节奏感
  return value + 3.2 * Math.sin(distance / 48) + 1.6 * Math.sin(distance / 21);
}

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const roadSegments = [];
const sceneryObjects = []; // 动物、木屋、树木、风车

const THEMES = {
  country: {
    name: "乡间小路",
    cnName: "🌾 乡间小路",
    skyColor: 0x82b8f5,
    fogColor: 0xb5dca5,
    fogDensity: 0.0046,
    ambientColor: 0xffffff,
    sunColor: 0xfff6dd,
    sunIntensity: 1.85,
    roadColor: 0x3b3f47,
    roadRoughness: 0.78,
    terrainColor: 0x5c9b46,
    stripeColor: 0xffffff,
    railColor: 0x8b5a2b
  },
  island: {
    name: "逃离荒岛",
    cnName: "🏝️ 逃离荒岛",
    skyColor: 0x38b6ff,
    fogColor: 0x6be0d5,
    fogDensity: 0.0046,
    ambientColor: 0xe0f7fa,
    sunColor: 0xfff0b3,
    sunIntensity: 2.1,
    roadColor: 0x454c57,
    roadRoughness: 0.62,
    terrainColor: 0xe6d49f,
    stripeColor: 0xffea00,
    railColor: 0xdbe6f0
  },
  jungle: {
    name: "丛林狂飙",
    cnName: "🌴 丛林狂飙",
    skyColor: 0x1e4c34,
    fogColor: 0x2d664b,
    fogDensity: 0.0068,
    ambientColor: 0xa7d7c5,
    sunColor: 0xd4ffd4,
    sunIntensity: 1.7,
    roadColor: 0x2f2922,
    roadRoughness: 0.88,
    terrainColor: 0x1e4d31,
    stripeColor: 0x88d49e,
    railColor: 0x4d3423
  },
  river: {
    name: "沿河峡谷",
    cnName: "🌊 沿河峡谷",
    skyColor: 0x628ec9,
    fogColor: 0x9ed4ee,
    fogDensity: 0.0052,
    ambientColor: 0xdde5ed,
    sunColor: 0xffffff,
    sunIntensity: 1.95,
    roadColor: 0x363a42,
    roadRoughness: 0.68,
    terrainColor: 0x9c674e,
    stripeColor: 0xffffff,
    railColor: 0x6eb6d4
  }
};

// 程序化地表、沥青与车身接触阴影贴图（一次性在内存生成，大幅提升道路与车模真实质感）
const WORLD_TEXTURES = (() => {
  const makeAsphalt = () => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#b8bcc4";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 256;
      const y = (Math.sin(i * 78.233) * 19341.217 % 1 + 1) % 1 * 256;
      const v = 152 + Math.floor(((i * 37) % 58));
      g.fillStyle = `rgb(${v},${v},${v + 4})`;
      g.fillRect(x, y, 2, 2);
    }
    // 三车道轮胎碾压暗迹，让沥青更有公路真实感
    [42, 128, 214].forEach(cx => {
      [-14, 14].forEach(dx => {
        const grad = g.createLinearGradient(cx + dx - 12, 0, cx + dx + 12, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(25,28,34,0.22)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(cx + dx - 12, 0, 24, 256);
      });
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };
  const makeGround = () => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#dadada";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2400; i++) {
      const x = ((Math.sin(i * 21.13) * 9132.1) % 1 + 1) % 1 * 256;
      const y = ((Math.sin(i * 53.71) * 4812.7) % 1 + 1) % 1 * 256;
      const shade = i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
      g.fillStyle = shade;
      g.fillRect(x, y, 3, 5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 4);
    return tex;
  };
  const makeCarShadow = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 256;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 128, 256);
    const rg = g.createRadialGradient(64, 128, 12, 64, 128, 62);
    rg.addColorStop(0, "rgba(0,0,0,0.68)");
    rg.addColorStop(0.55, "rgba(0,0,0,0.42)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 256);
    return new THREE.CanvasTexture(c);
  };
  return {
    asphaltTex: makeAsphalt(),
    groundTex: makeGround(),
    carShadowTex: makeCarShadow(),
    woodTex: (() => {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#e6cfa8";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) {
        g.fillStyle = "rgba(85,50,20,0.22)";
        g.fillRect(0, y, 128, 2);
        for (let k = 0; k < 20; k++) {
          g.fillStyle = "rgba(110,70,30,0.10)";
          g.fillRect((k * 19 + y) % 120, y + 4 + (k % 9), 18, 2);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
    roofTex: (() => {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#b83a2d";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 14) {
        g.fillStyle = "rgba(55,10,8,0.32)";
        g.fillRect(0, y, 128, 3);
        for (let x = (y % 28 === 0 ? 0 : 8); x < 128; x += 16) {
          g.fillStyle = "rgba(255,215,190,0.14)";
          g.fillRect(x, y + 4, 10, 7);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      return t;
    })(),
    barkTex: (() => {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#6c4d39";
      g.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 42; i++) {
        g.fillStyle = i % 2 === 0 ? "rgba(35,20,10,0.28)" : "rgba(160,120,85,0.16)";
        g.fillRect((i * 11) % 60, (i * 17) % 110, 3, 24);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })()
  };
})();

// 地平线质感反射环境贴图生成器（为车漆清漆、全景天窗、金属轮毂、水系提供实时环境高光）
let envPmremGen = null;
const ENV_CACHE = new Map();
function applyHorizonEnvironment(themeKey, theme) {
  if (ENV_CACHE.has(themeKey)) {
    scene.environment = ENV_CACHE.get(themeKey);
    return;
  }
  try {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d");
    const skyHex = "#" + new THREE.Color(theme.skyColor).getHexString();
    const fogHex = "#" + new THREE.Color(theme.fogColor).getHexString();
    const grdHex = "#" + new THREE.Color(theme.terrainColor).getHexString();
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, skyHex);
    grad.addColorStop(0.45, fogHex);
    grad.addColorStop(0.50, "#fff8e6");
    grad.addColorStop(0.54, grdHex);
    grad.addColorStop(1.0, "#242c24");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);

    // 高光太阳反射斑，使车身曲面与挡风玻璃随过弯呈现流光质感
    const sunGrad = g.createRadialGradient(340, 82, 4, 340, 82, 74);
    sunGrad.addColorStop(0, "rgba(255,255,245,1)");
    sunGrad.addColorStop(0.28, "rgba(255,240,190,0.75)");
    sunGrad.addColorStop(1, "rgba(255,240,190,0)");
    g.fillStyle = sunGrad;
    g.fillRect(260, 4, 160, 160);

    const equirect = new THREE.CanvasTexture(c);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    let finalEnv = equirect;
    if (THREE.PMREMGenerator) {
      try {
        if (!envPmremGen) envPmremGen = new THREE.PMREMGenerator(renderer);
        finalEnv = envPmremGen.fromEquirectangular(equirect).texture;
        equirect.dispose();
      } catch (e) {
        finalEnv = equirect;
      }
    }
    ENV_CACHE.set(themeKey, finalEnv);
    scene.environment = finalEnv;
  } catch (e) { /* ignore */ }
}

// ═══════════════════════════════════════
// 生动大自然元素模型生成 (共享几何体与材质 + 精细真实造型)
// ═══════════════════════════════════════
const SCENERY_ASSETS = (() => {
  const mat = (opts) => new THREE.MeshStandardMaterial(opts);
  return {
    mats: {
      cowWhite: mat({ color: 0xf4f1ea, roughness: 0.85 }),
      cowSpot: mat({ color: 0x23252a, roughness: 0.85 }),
      cowSnout: mat({ color: 0xf4a6b8, roughness: 0.65 }),
      horn: mat({ color: 0xd8c39e, roughness: 0.6 }),
      hoof: mat({ color: 0x1a1a1d, roughness: 0.9 }),
      deerBody: mat({ color: 0xb27340, roughness: 0.75 }),
      deerBelly: mat({ color: 0xe6d2b5, roughness: 0.8 }),
      antler: mat({ color: 0x563922, roughness: 0.85 }),
      stone: mat({ color: 0x868a91, map: WORLD_TEXTURES.groundTex, roughness: 0.94 }),
      woodWall: mat({ color: 0xe3b98a, map: WORLD_TEXTURES.woodTex, roughness: 0.84 }),
      woodDark: mat({ color: 0x5c3d28, map: WORLD_TEXTURES.barkTex, roughness: 0.88 }),
      cabinRoof: mat({ color: 0xc24535, map: WORLD_TEXTURES.roofTex, roughness: 0.68 }),
      windowGlow: mat({ color: 0xffe49e, emissive: 0xffb703, emissiveIntensity: 0.55, roughness: 0.25 }),
      windowFrame: mat({ color: 0xf5f5f5, roughness: 0.5 }),
      millTower: mat({ color: 0xebe3d5, map: WORLD_TEXTURES.groundTex, roughness: 0.82 }),
      millCap: mat({ color: 0x2f4f3a, roughness: 0.7 }),
      millSail: mat({ color: 0xfaf6eb, roughness: 0.75 }),
      bark: mat({ color: 0x6b4b38, map: WORLD_TEXTURES.barkTex, roughness: 0.92 }),
      leafDark: mat({ color: 0x2b6226, map: WORLD_TEXTURES.groundTex, roughness: 0.85 }),
      leafMid: mat({ color: 0x3b7d2b, map: WORLD_TEXTURES.groundTex, roughness: 0.82 }),
      leafLight: mat({ color: 0x539a38, map: WORLD_TEXTURES.groundTex, roughness: 0.80 }),
      palmBark: mat({ color: 0x856845, map: WORLD_TEXTURES.barkTex, roughness: 0.92 }),
      palmLeaf: mat({ color: 0x2f754c, roughness: 0.72 }),
      coconut: mat({ color: 0x4b2e19, roughness: 0.85 }),
      hay: mat({ color: 0xd8b454, map: WORLD_TEXTURES.woodTex, roughness: 0.92 }),
      canyonRock: mat({ color: 0x9c5a41, map: WORLD_TEXTURES.groundTex, roughness: 0.92 }),
      canyonRockDark: mat({ color: 0x76412f, map: WORLD_TEXTURES.groundTex, roughness: 0.95 }),
      bush: mat({ color: 0x3b7a2a, map: WORLD_TEXTURES.groundTex, roughness: 0.86 }),
      flowerPink: mat({ color: 0xff7597, roughness: 0.6 }),
      flowerYellow: mat({ color: 0xffd166, roughness: 0.6 }),
      lampPole: mat({ color: 0x374151, metalness: 0.75, roughness: 0.35 }),
      lampGlow: mat({ color: 0xfff3c4, emissive: 0xffd166, emissiveIntensity: 0.85, roughness: 0.2 })
    },
    geos: {
      sphere: new THREE.SphereGeometry(1, 14, 10),
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
      cone: new THREE.ConeGeometry(1, 1, 8),
      foliage: new THREE.DodecahedronGeometry(1, 1),
      hayRoll: (() => {
        const g = new THREE.CylinderGeometry(0.95, 0.95, 1.5, 14);
        g.rotateZ(Math.PI / 2);
        return g;
      })(),
      cabinRoof: (() => {
        const shape = new THREE.Shape();
        shape.moveTo(-3.4, 0);
        shape.lineTo(0, 2.2);
        shape.lineTo(3.4, 0);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: 5.6, bevelEnabled: false });
        g.translate(0, 0, -2.8);
        return g;
      })()
    }
  };
})();

// 1. 写实呆萌奶牛 (Cow)
function createCow() {
  const cow = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;

  const torso = new THREE.Mesh(geos.sphere, mats.cowWhite);
  torso.scale.set(0.76, 0.64, 1.25);
  torso.position.set(0, 1.28, 0);
  cow.add(torso);

  const spot1 = new THREE.Mesh(geos.sphere, mats.cowSpot);
  spot1.scale.set(0.78, 0.52, 0.55);
  spot1.position.set(0, 1.38, 0.28);
  cow.add(spot1);

  const spot2 = new THREE.Mesh(geos.sphere, mats.cowSpot);
  spot2.scale.set(0.62, 0.45, 0.42);
  spot2.position.set(0.18, 1.32, -0.48);
  cow.add(spot2);

  const head = new THREE.Mesh(geos.box, mats.cowWhite);
  head.scale.set(0.68, 0.68, 0.82);
  head.position.set(0, 1.62, -1.25);
  head.rotation.x = 0.15;
  cow.add(head);

  const snout = new THREE.Mesh(geos.box, mats.cowSnout);
  snout.scale.set(0.58, 0.36, 0.34);
  snout.position.set(0, 1.46, -1.68);
  cow.add(snout);

  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(geos.box, mats.cowSpot);
    ear.scale.set(0.28, 0.12, 0.18);
    ear.position.set(side * 0.44, 1.82, -1.16);
    ear.rotation.z = side * -0.3;
    cow.add(ear);

    const horn = new THREE.Mesh(geos.cone, mats.horn);
    horn.scale.set(0.08, 0.32, 0.08);
    horn.position.set(side * 0.28, 2.04, -1.18);
    horn.rotation.z = side * -0.45;
    cow.add(horn);

    const eye = new THREE.Mesh(geos.sphere, mats.hoof);
    eye.scale.setScalar(0.06);
    eye.position.set(side * 0.25, 1.72, -1.62);
    cow.add(eye);
  });

  [[-0.44, -0.72], [0.44, -0.72], [-0.44, 0.72], [0.44, 0.72]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(geos.cyl, mats.cowWhite);
    leg.scale.set(0.13, 0.85, 0.13);
    leg.position.set(lx, 0.46, lz);
    cow.add(leg);

    const hoof = new THREE.Mesh(geos.cyl, mats.hoof);
    hoof.scale.set(0.14, 0.14, 0.14);
    hoof.position.set(lx, 0.07, lz);
    cow.add(hoof);
  });

  const tail = new THREE.Mesh(geos.cyl, mats.cowSpot);
  tail.scale.set(0.04, 0.72, 0.04);
  tail.position.set(0, 1.12, 1.22);
  tail.rotation.x = 0.28;
  cow.add(tail);

  return cow;
}

// 2. 灵动梅花鹿 (Deer)
function createDeer() {
  const deer = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;

  const torso = new THREE.Mesh(geos.sphere, mats.deerBody);
  torso.scale.set(0.52, 0.48, 0.98);
  torso.position.set(0, 1.36, 0);
  deer.add(torso);

  const tailPatch = new THREE.Mesh(geos.sphere, mats.deerBelly);
  tailPatch.scale.set(0.24, 0.24, 0.18);
  tailPatch.position.set(0, 1.46, 0.92);
  deer.add(tailPatch);

  const neck = new THREE.Mesh(geos.cyl, mats.deerBody);
  neck.scale.set(0.18, 0.92, 0.2);
  neck.position.set(0, 1.96, -0.76);
  neck.rotation.x = 0.36;
  deer.add(neck);

  const head = new THREE.Mesh(geos.sphere, mats.deerBody);
  head.scale.set(0.26, 0.24, 0.44);
  head.position.set(0, 2.46, -1.08);
  deer.add(head);

  const nose = new THREE.Mesh(geos.sphere, mats.hoof);
  nose.scale.setScalar(0.06);
  nose.position.set(0, 2.44, -1.5);
  deer.add(nose);

  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(geos.cone, mats.deerBody);
    ear.scale.set(0.09, 0.26, 0.05);
    ear.position.set(side * 0.22, 2.66, -0.92);
    ear.rotation.z = side * -0.55;
    deer.add(ear);

    const antler = new THREE.Mesh(geos.cyl, mats.antler);
    antler.scale.set(0.035, 0.72, 0.035);
    antler.position.set(side * 0.18, 2.92, -0.98);
    antler.rotation.z = side * -0.32;
    deer.add(antler);

    const tine = new THREE.Mesh(geos.cyl, mats.antler);
    tine.scale.set(0.025, 0.34, 0.025);
    tine.position.set(side * 0.28, 3.0, -1.04);
    tine.rotation.z = side * -0.75;
    deer.add(tine);
  });

  [[-0.3, -0.62], [0.3, -0.62], [-0.3, 0.62], [0.3, 0.62]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(geos.cyl, mats.deerBody);
    leg.scale.set(0.08, 1.16, 0.08);
    leg.position.set(lx, 0.6, lz);
    deer.add(leg);

    const hoof = new THREE.Mesh(geos.cyl, mats.hoof);
    hoof.scale.set(0.085, 0.12, 0.085);
    hoof.position.set(lx, 0.06, lz);
    deer.add(hoof);
  });

  return deer;
}

// 3. 精致田园农庄木屋 (Farm Cabin)
function createFarmCabin() {
  const cabin = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  cabin.scale.setScalar(0.76);

  const base = new THREE.Mesh(geos.box, mats.stone);
  base.scale.set(6.3, 0.45, 5.3);
  base.position.y = 0.225;
  cabin.add(base);

  const walls = new THREE.Mesh(geos.box, mats.woodWall);
  walls.scale.set(5.9, 3.2, 4.9);
  walls.position.y = 2.05;
  cabin.add(walls);

  [[-2.95, -2.45], [2.95, -2.45], [-2.95, 2.45], [2.95, 2.45]].forEach(([px, pz]) => {
    const post = new THREE.Mesh(geos.box, mats.woodDark);
    post.scale.set(0.24, 3.3, 0.24);
    post.position.set(px, 2.05, pz);
    cabin.add(post);
  });

  const roof = new THREE.Mesh(geos.cabinRoof, mats.cabinRoof);
  roof.position.y = 3.62;
  cabin.add(roof);

  const ridge = new THREE.Mesh(geos.box, mats.woodDark);
  ridge.scale.set(0.22, 0.2, 5.7);
  ridge.position.set(0, 5.82, 0);
  cabin.add(ridge);

  const chimney = new THREE.Mesh(geos.box, mats.stone);
  chimney.scale.set(0.68, 1.6, 0.68);
  chimney.position.set(1.5, 5.2, 1.0);
  cabin.add(chimney);

  const door = new THREE.Mesh(geos.box, mats.woodDark);
  door.scale.set(1.15, 2.15, 0.14);
  door.position.set(0, 1.5, -2.46);
  cabin.add(door);

  const step = new THREE.Mesh(geos.box, mats.stone);
  step.scale.set(1.5, 0.22, 0.6);
  step.position.set(0, 0.11, -2.85);
  cabin.add(step);

  [-1.75, 1.75].forEach(wx => {
    const frame = new THREE.Mesh(geos.box, mats.windowFrame);
    frame.scale.set(1.12, 1.02, 0.12);
    frame.position.set(wx, 2.25, -2.46);
    cabin.add(frame);

    const glass = new THREE.Mesh(geos.box, mats.windowGlow);
    glass.scale.set(0.92, 0.82, 0.14);
    glass.position.set(wx, 2.25, -2.47);
    cabin.add(glass);
  });

  return cabin;
}

// 4. 荷兰风车 (带木格栅与帆布风叶)
function createWindmill() {
  const mill = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;

  const plinth = new THREE.Mesh(geos.cyl, mats.stone);
  plinth.scale.set(2.75, 1.2, 2.75);
  plinth.position.y = 0.6;
  mill.add(plinth);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 2.55, 8.2, 10), mats.millTower);
  tower.position.y = 5.2;
  mill.add(tower);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.95, 2.3, 10), mats.millCap);
  cap.position.y = 10.4;
  mill.add(cap);

  const door = new THREE.Mesh(geos.box, mats.woodDark);
  door.scale.set(1.1, 1.9, 0.35);
  door.position.set(0, 1.0, -2.5);
  mill.add(door);

  [4.4, 6.8].forEach(wy => {
    const win = new THREE.Mesh(geos.box, mats.windowGlow);
    win.scale.set(0.65, 0.78, 0.25);
    win.position.set(0, wy, -2.1 + (wy - 4.4) * 0.12);
    mill.add(win);
  });

  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 9.6, -1.85);

  const hub = new THREE.Mesh(geos.cyl, mats.woodDark);
  hub.scale.set(0.32, 0.75, 0.32);
  hub.rotation.x = Math.PI / 2;
  fanGroup.add(hub);

  for (let i = 0; i < 4; i++) {
    const bHolder = new THREE.Group();
    bHolder.rotation.z = (i * Math.PI) / 2;

    const spar = new THREE.Mesh(geos.box, mats.woodDark);
    spar.scale.set(0.18, 5.4, 0.12);
    spar.position.y = 2.7;
    bHolder.add(spar);

    const sail = new THREE.Mesh(geos.box, mats.millSail);
    sail.scale.set(0.95, 4.1, 0.05);
    sail.position.set(0.52, 3.25, 0.02);
    bHolder.add(sail);

    fanGroup.add(bHolder);
  }
  mill.add(fanGroup);
  mill.userData = { fan: fanGroup };
  return mill;
}

// 5. 多层树冠自然大树 (Tree)
function createTree() {
  const tree = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.56, 3.8, 8), mats.bark);
  trunk.position.y = 1.9;
  tree.add(trunk);

  [-1, 1].forEach((side, idx) => {
    const branch = new THREE.Mesh(geos.cyl, mats.bark);
    branch.scale.set(0.14, 1.5, 0.14);
    branch.position.set(side * 0.45, 3.4 + idx * 0.25, side * 0.15);
    branch.rotation.z = side * -0.55;
    tree.add(branch);
  });

  const crowns = [
    [0, 5.2, 0, 2.05, mats.leafDark],
    [-1.05, 4.4, 0.55, 1.48, mats.leafMid],
    [1.08, 4.55, -0.45, 1.52, mats.leafMid],
    [0.15, 6.2, 0.2, 1.35, mats.leafLight]
  ];
  crowns.forEach(([cx, cy, cz, r, material]) => {
    const foliage = new THREE.Mesh(geos.foliage, material);
    foliage.scale.set(r, r * 0.85, r);
    foliage.position.set(cx, cy, cz);
    foliage.rotation.set(cx, cy, cz);
    tree.add(foliage);
  });

  return tree;
}

// 6. 弯曲树干与弧形羽叶椰子树 (Palm)
function createPalm() {
  const palm = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;

  let curX = 0;
  let curY = 0;
  for (let s = 0; s < 6; s++) {
    const segH = 1.12;
    const lean = s * 0.055;
    const rBot = 0.46 - s * 0.045;
    const rTop = rBot - 0.04;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, segH, 7), mats.palmBark);
    curX += Math.sin(lean) * 0.45;
    curY += segH * 0.94;
    seg.position.set(curX, curY - segH * 0.45, 0);
    seg.rotation.z = -lean;
    palm.add(seg);
  }

  const crownCenter = new THREE.Group();
  crownCenter.position.set(curX + 0.12, curY + 0.1, 0);
  for (let c = 0; c < 3; c++) {
    const nut = new THREE.Mesh(geos.sphere, mats.coconut);
    nut.scale.set(0.24, 0.28, 0.24);
    const a = (c / 3) * Math.PI * 2;
    nut.position.set(Math.cos(a) * 0.34, -0.22, Math.sin(a) * 0.34);
    crownCenter.add(nut);
  }

  for (let i = 0; i < 8; i++) {
    const frondGroup = new THREE.Group();
    frondGroup.rotation.y = (i / 8) * Math.PI * 2 + (i % 2) * 0.15;

    const inner = new THREE.Mesh(geos.box, mats.palmLeaf);
    inner.scale.set(0.55, 0.08, 2.2);
    inner.position.set(0, 0.25, 1.05);
    inner.rotation.x = -0.22;
    frondGroup.add(inner);

    const outer = new THREE.Mesh(geos.cone, mats.palmLeaf);
    outer.scale.set(0.38, 2.0, 0.12);
    outer.position.set(0, -0.1, 2.85);
    outer.rotation.x = Math.PI / 2 + 0.48;
    frondGroup.add(outer);

    crownCenter.add(frondGroup);
  }
  palm.add(crownCenter);
  return palm;
}

// 7. 辅助自然元素（麦草垛 / 峡谷岩石）
function createHayBale() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  const bale = new THREE.Mesh(geos.hayRoll, mats.hay);
  bale.position.y = 0.95;
  g.add(bale);
  return g;
}

function createCanyonRock() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  const main = new THREE.Mesh(geos.foliage, mats.canyonRock);
  main.scale.set(1.8, 1.35, 1.5);
  main.position.y = 0.85;
  g.add(main);
  const sub = new THREE.Mesh(geos.foliage, mats.canyonRockDark);
  sub.scale.set(1.1, 0.85, 1.1);
  sub.position.set(1.2, 0.55, 0.5);
  g.add(sub);
  return g;
}

// 8. 路边灌木花丛 / 木栅栏 / 公路路灯
function createFlowerBush() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  const main = new THREE.Mesh(geos.foliage, mats.bush);
  main.scale.set(1.05, 0.72, 0.95);
  main.position.y = 0.45;
  g.add(main);
  const side = new THREE.Mesh(geos.foliage, mats.leafLight);
  side.scale.set(0.7, 0.55, 0.7);
  side.position.set(0.65, 0.35, 0.25);
  g.add(side);
  [[-0.3, 0.72, 0.3, mats.flowerPink], [0.25, 0.68, -0.25, mats.flowerYellow], [0.65, 0.55, 0.25, mats.flowerPink]].forEach(([fx, fy, fz, fm]) => {
    const fl = new THREE.Mesh(geos.sphere, fm);
    fl.scale.setScalar(0.14);
    fl.position.set(fx, fy, fz);
    g.add(fl);
  });
  return g;
}

function createRoadFence() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  [-1.3, 0, 1.3].forEach(pz => {
    const post = new THREE.Mesh(geos.box, mats.woodDark);
    post.scale.set(0.16, 1.05, 0.16);
    post.position.set(0, 0.52, pz);
    g.add(post);
  });
  [0.42, 0.82].forEach(ry => {
    const rail = new THREE.Mesh(geos.box, mats.woodWall);
    rail.scale.set(0.1, 0.12, 3.0);
    rail.position.set(0, ry, 0);
    g.add(rail);
  });
  return g;
}

function createStreetLamp() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  const pole = new THREE.Mesh(geos.cyl, mats.lampPole);
  pole.scale.set(0.1, 5.2, 0.1);
  pole.position.y = 2.6;
  g.add(pole);
  const arm = new THREE.Mesh(geos.box, mats.lampPole);
  arm.scale.set(1.2, 0.1, 0.1);
  arm.position.set(0.55, 5.15, 0);
  g.add(arm);
  const bulb = new THREE.Mesh(geos.box, mats.lampGlow);
  bulb.scale.set(0.45, 0.12, 0.24);
  bulb.position.set(1.05, 5.05, 0);
  g.add(bulb);
  return g;
}

// ═══════════════════════════════════════
// 真正的普通纯电轿车（特斯拉 Model 3 风格）
// 绝无 F1 大尾翼风刀，圆润流线全景天幕
// 并且严格以后轴中心为旋转枢轴 (零后轴漂移)
// ═══════════════════════════════════════
// 对手车顶名字牌（联机时用来确认对方在线）
function makeNameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 72);
  ctx.font = "bold 36px 'Rajdhani','Orbitron',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(6,18,31,.9)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#61efff";
  ctx.fillText(String(text || "对手").slice(0, 10), 128, 38);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(4.4, 1.24, 1);
  sprite.position.set(0, 2.6, -1.2);
  return sprite;
}

const CAR_ASSETS = (() => {
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.35, 0.22);
  bodyShape.lineTo(2.22, 0.22);
  bodyShape.quadraticCurveTo(2.38, 0.34, 2.26, 0.66);
  bodyShape.quadraticCurveTo(1.88, 0.82, 1.32, 0.88);
  bodyShape.quadraticCurveTo(0.88, 1.24, 0.45, 1.33);
  bodyShape.quadraticCurveTo(-0.18, 1.39, -0.74, 1.33);
  bodyShape.quadraticCurveTo(-1.12, 1.12, -1.46, 0.88);
  bodyShape.quadraticCurveTo(-1.98, 0.78, -2.28, 0.64);
  bodyShape.quadraticCurveTo(-2.46, 0.45, -2.35, 0.22);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.72,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.09,
    bevelSegments: 4
  });
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.translate(-0.86, 0, -1.35);

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.34, 0.85);
  cabinShape.lineTo(1.18, 0.85);
  cabinShape.quadraticCurveTo(0.84, 1.22, 0.42, 1.31);
  cabinShape.quadraticCurveTo(-0.18, 1.37, -0.68, 1.32);
  cabinShape.quadraticCurveTo(-1.05, 1.12, -1.34, 0.85);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.44,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 3
  });
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.translate(-0.72, 0, -1.35);

  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.33, 14);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.34, 0.48, 0.06);
  const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.35, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.18, 1.45, 10);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.72);

  const archGeo = new THREE.TorusGeometry(0.51, 0.075, 8, 14, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12);
  discGeo.rotateZ(Math.PI / 2);

  return {
    bodyGeo,
    cabinGeo,
    tireGeo,
    rimGeo,
    spokeGeo,
    hubGeo,
    flameGeo,
    archGeo,
    discGeo,
    box: new THREE.BoxGeometry(1, 1, 1),
    glassMat: new THREE.MeshStandardMaterial({ color: 0x0b1528, roughness: 0.06, metalness: 0.92 }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.62, metalness: 0.42 }),
    chromeMat: new THREE.MeshStandardMaterial({ color: 0xd6dee8, roughness: 0.16, metalness: 0.94 }),
    wellMat: new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.95 }),
    wellGeo: (() => { const g = new THREE.CylinderGeometry(0.49, 0.49, 0.36, 12); g.rotateZ(Math.PI / 2); return g; })(),
    shadowPlaneGeo: new THREE.PlaneGeometry(2.45, 5.0),
    shadowMat: new THREE.MeshBasicMaterial({ map: WORLD_TEXTURES.carShadowTex, transparent: true, depthWrite: false, opacity: 0.72 }),
    tireMat: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 }),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xaab4c4, metalness: 0.88, roughness: 0.24 }),
    hubMat: new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.8, roughness: 0.35 }),
    caliperMat: new THREE.MeshStandardMaterial({ color: 0xd92638, roughness: 0.35, metalness: 0.5 }),
    hlMat: new THREE.MeshBasicMaterial({ color: 0xf4fbff }),
    drlMat: new THREE.MeshBasicMaterial({ color: 0xbef6ff }),
    tailMat: new THREE.MeshBasicMaterial({ color: 0xff2238 }),
    brakeCenterMat: new THREE.MeshBasicMaterial({ color: 0xff8c66 }),
    plateMat: new THREE.MeshBasicMaterial({ color: 0xd9ecff }),
    flameOuterMat: new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0.8 }),
    flameInnerMat: new THREE.MeshBasicMaterial({ color: 0xe6ffff, transparent: true, opacity: 0.96 }),
    nitroSparkMat: new THREE.MeshBasicMaterial({ color: 0x5ceeff })
  };
})();

const TRAFFIC_PAINT_MATS = new Map();
function getTrafficPaintMat(colorHex) {
  let m = TRAFFIC_PAINT_MATS.get(colorHex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.24,
      metalness: 0.68
    });
    TRAFFIC_PAINT_MATS.set(colorHex, m);
  }
  return m;
}

function createTeslaCar(isPlayer = true, colorHex = 0xffffff) {
  const carGroup = new THREE.Group();
  const compactAI = !isPlayer && isMobileDevice;

  const paintMat = isPlayer
    ? (THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.18, metalness: 0.66, clearcoat: 0.88, clearcoatRoughness: 0.12 })
      : new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.18, metalness: 0.72 }))
    : getTrafficPaintMat(colorHex);
  carGroup.userData.paintMaterial = paintMat;

  // 0. 车辆底部真实地面投影贴花（在手机端也能牢牢贴地，消除悬空感）
  const contactShadow = new THREE.Mesh(CAR_ASSETS.shadowPlaneGeo, CAR_ASSETS.shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.032, -1.35);
  carGroup.add(contactShadow);

  // 1. 雕刻感流线三厢车身 + 金属漆清漆质感
  carGroup.add(new THREE.Mesh(CAR_ASSETS.bodyGeo, paintMat));

  // 2. 全景熏黑玻璃座舱（前挡风 + 天幕 + 侧窗 + 后溜背）
  carGroup.add(new THREE.Mesh(CAR_ASSETS.cabinGeo, CAR_ASSETS.glassMat));

  // 3. 运动前铲 / 侧裙 / 进气格栅 / 尾部扩散器与小鸭尾 + 车身镀铬标
  const frontSplitter = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  frontSplitter.scale.set(1.86, 0.06, 0.34);
  frontSplitter.position.set(0, 0.22, -3.72);
  carGroup.add(frontSplitter);

  const skirt = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  skirt.scale.set(1.96, 0.1, 4.46);
  skirt.position.set(0, 0.21, -1.35);
  carGroup.add(skirt);

  const grille = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  grille.scale.set(1.38, 0.14, 0.12);
  grille.position.set(0, 0.34, -3.77);
  carGroup.add(grille);

  const lipSpoiler = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  lipSpoiler.scale.set(1.66, 0.05, 0.14);
  lipSpoiler.position.set(0, 0.89, 0.94);
  carGroup.add(lipSpoiler);

  const diffuser = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  diffuser.scale.set(1.58, 0.18, 0.14);
  diffuser.position.set(0, 0.3, 0.96);
  carGroup.add(diffuser);

  const chromeTrimRear = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
  chromeTrimRear.scale.set(1.12, 0.032, 0.04);
  chromeTrimRear.position.set(0, 0.38, 1.0);
  carGroup.add(chromeTrimRear);

  // 车窗 B 柱分隔 + 座椅头枕 + 轮眉/内衬包边（手机 AI 车简化微件降低绘制调用）
  if (!compactAI) {
    [-0.36, 0.36].forEach(hx => {
      const headrest = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
      headrest.scale.set(0.24, 0.22, 0.14);
      headrest.position.set(hx, 1.04, -1.25);
      carGroup.add(headrest);
    });
    [-1, 1].forEach(side => {
      const bPillar = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
      bPillar.scale.set(0.04, 0.44, 0.14);
      bPillar.position.set(side * 0.77, 1.07, -1.25);
      carGroup.add(bPillar);

      [0.0, -2.7].forEach(wz => {
        const arch = new THREE.Mesh(CAR_ASSETS.archGeo, CAR_ASSETS.trimMat);
        arch.position.set(side * 0.96, 0.42, wz);
        carGroup.add(arch);

        const well = new THREE.Mesh(CAR_ASSETS.wellGeo, CAR_ASSETS.wellMat);
        well.position.set(side * 0.72, 0.42, wz);
        carGroup.add(well);
      });
    });
  }

  // 4. 外后视镜 + 隐藏式门把手 + 前矩阵 LED 大灯与日行灯眉
  [-1, 1].forEach(side => {
    const mirror = new THREE.Mesh(CAR_ASSETS.box, paintMat);
    mirror.scale.set(0.22, 0.11, 0.16);
    mirror.position.set(side * 1.02, 0.86, -2.02);
    carGroup.add(mirror);

    if (!compactAI) {
      const handleF = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
      handleF.scale.set(0.03, 0.036, 0.22);
      handleF.position.set(side * 0.96, 0.72, -1.55);
      carGroup.add(handleF);

      const handleR = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
      handleR.scale.set(0.03, 0.036, 0.22);
      handleR.position.set(side * 0.96, 0.72, -0.58);
      carGroup.add(handleR);

      const drl = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.drlMat);
      drl.scale.set(0.38, 0.03, 0.08);
      drl.position.set(side * 0.66, 0.62, -3.76);
      drl.rotation.y = side * -0.14;
      carGroup.add(drl);
    }

    const hl = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.hlMat);
    hl.scale.set(0.36, 0.075, 0.1);
    hl.position.set(side * 0.66, 0.56, -3.76);
    hl.rotation.y = side * -0.14;
    carGroup.add(hl);
  });

  // 5. 立体熏黑贯穿式 LED 尾灯 + 牌照框 + 尾标
  const tailHousing = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  tailHousing.scale.set(1.74, 0.13, 0.07);
  tailHousing.position.set(0, 0.68, 0.95);
  carGroup.add(tailHousing);

  const tailBar = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.tailMat);
  tailBar.scale.set(1.66, 0.055, 0.085);
  tailBar.position.set(0, 0.69, 0.96);
  carGroup.add(tailBar);

  [-0.72, 0.72].forEach(tx => {
    const blade = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.tailMat);
    blade.scale.set(0.24, 0.10, 0.09);
    blade.position.set(tx, 0.68, 0.96);
    carGroup.add(blade);
  });

  const rearEmblem = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
  rearEmblem.scale.set(0.14, 0.04, 0.04);
  rearEmblem.position.set(0, 0.79, 0.97);
  carGroup.add(rearEmblem);

  const plate = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.plateMat);
  plate.scale.set(0.52, 0.14, 0.04);
  plate.position.set(0, 0.47, 0.98);
  carGroup.add(plate);

  // 6. 4 个五辐风刃轮毂轮组 (后轮 Z = 0，前轮 Z = -2.7)
  const wheels = [];
  const wheelPositions = [
    [-0.98, 0.42, -2.7],
    [ 0.98, 0.42, -2.7],
    [-0.98, 0.42,  0.0],
    [ 0.98, 0.42,  0.0]
  ];

  wheelPositions.forEach((pos, idx) => {
    const steerGroup = new THREE.Group();
    steerGroup.position.set(pos[0], pos[1], pos[2]);

    const spinGroup = new THREE.Group();
    spinGroup.add(new THREE.Mesh(CAR_ASSETS.tireGeo, CAR_ASSETS.tireMat));
    spinGroup.add(new THREE.Mesh(CAR_ASSETS.rimGeo, CAR_ASSETS.hubMat));

    if (!compactAI) {
      // 刹车盘 + 红色运动卡钳
      const disc = new THREE.Mesh(CAR_ASSETS.discGeo, CAR_ASSETS.rimMat);
      spinGroup.add(disc);
      const caliper = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.caliperMat);
      caliper.scale.set(0.12, 0.16, 0.12);
      caliper.position.set(pos[0] > 0 ? -0.06 : 0.06, 0.12, 0.14);
      steerGroup.add(caliper);
    }

    const spokeCount = compactAI ? 2 : 5;
    for (let s = 0; s < spokeCount; s++) {
      const spoke = new THREE.Mesh(CAR_ASSETS.spokeGeo, CAR_ASSETS.rimMat);
      spoke.rotation.x = (s / spokeCount) * Math.PI;
      spinGroup.add(spoke);
    }
    spinGroup.add(new THREE.Mesh(CAR_ASSETS.hubGeo, CAR_ASSETS.rimMat));

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

  if (isPlayer) {
    const nitroFlames = new THREE.Group();
    [-0.52, 0.52].forEach(nx => {
      const nozzle = new THREE.Group();
      nozzle.position.set(nx, 0.29, 1.0);

      const outer = new THREE.Mesh(CAR_ASSETS.flameGeo, CAR_ASSETS.flameOuterMat);
      const inner = new THREE.Mesh(CAR_ASSETS.flameGeo, CAR_ASSETS.flameInnerMat);
      inner.scale.set(0.55, 0.55, 0.68);

      nozzle.add(outer);
      nozzle.add(inner);
      nitroFlames.add(nozzle);
    });
    nitroFlames.visible = false;
    carGroup.add(nitroFlames);
    carGroup.userData.nitroFlames = nitroFlames;
  }

  return { group: carGroup, wheels };
}

// 实例化玩家特斯拉 (纯白 Model 3 风格)
const player = createTeslaCar(true, 0xf0f3f6);
scene.add(player.group);
player.group.position.set(0, 0, 0);

const finishGate = new THREE.Group();
const gateMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x442200 });
const gatePostGeometry = new THREE.BoxGeometry(0.5, 6, 0.5);
[-1, 1].forEach(side => {
  const post = new THREE.Mesh(gatePostGeometry, gateMaterial);
  post.position.set(side * (ROAD_WIDTH / 2 - 0.5), 3, 0);
  finishGate.add(post);
});
const gateTop = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.65, 0.55), gateMaterial);
gateTop.position.y = 6;
finishGate.add(gateTop);
scene.add(finishGate);

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
  maxSteerAngle: 0.33,     // 加大转向范围，手机倾斜时能更快完成变道
  steerSpeed: 8.0,         // 提高方向盘响应速度
  steerReturn: 6.8,        // 方向盘自动回正速率
  maxHeading: 0.35,        // 增大变道幅度，避免来不及避开车流
  headingAlignRate: 3.8,   // 减缓自动回正，让车辆保留变道趋势
  suspensionOmega: 7.5,
  suspensionZeta: 0.98,
  maxRollAngle: 0.02       // 真实轿车极小微弱侧倾 (~1.1度)
};

// ═══════════════════════════════════════
// 敌车与金币管理
// ═══════════════════════════════════════
const VEHICLE_COLLISION_HALF_WIDTH = 1.2;
const VEHICLE_COLLISION_HALF_LENGTH = 2.45;
const VEHICLE_COLLISION_CENTER_Z = -1.5;
const PLAYER_IMPACT_COOLDOWN_MS = 700;
const PLAYER_IMPACT_SPEED_FLOOR = 0.55;
const PLAYER_IMPACT_SPEED_FACTOR = 0.72;
let playerImpactCooldownUntil = 0;

function registerPlayerImpact(enemy, impactNow) {
  if (impactNow <= (enemy.hitUntil || 0)) return false;
  enemy.hitUntil = impactNow + 900;
  if (impactNow < playerImpactCooldownUntil) return false;
  playerImpactCooldownUntil = impactNow + PLAYER_IMPACT_COOLDOWN_MS;
  return true;
}

function reduceSpeedAfterImpact(speed) {
  return speed > PLAYER_IMPACT_SPEED_FLOOR
    ? Math.max(PLAYER_IMPACT_SPEED_FLOOR, speed * PLAYER_IMPACT_SPEED_FACTOR)
    : speed;
}

const LANE_KEEPING_STRENGTH = 2.8;
const LANE_KEEPING_MIN_SPEED = 0.15;

function nearestLaneCenter(x) {
  const laneIndex = Math.max(0, Math.min(
    LANE_COUNT - 1,
    Math.round((x + ROAD_WIDTH / 2) / LANE_WIDTH - 0.5)
  ));
  return -ROAD_WIDTH / 2 + (laneIndex + 0.5) * LANE_WIDTH;
}

function applyLaneKeeping(x, steering, speed, dt) {
  if (Math.abs(steering) > 0.01 || speed < LANE_KEEPING_MIN_SPEED) return x;
  const target = nearestLaneCenter(x);
  const blend = 1 - Math.exp(-LANE_KEEPING_STRENGTH * dt);
  return x + (target - x) * blend;
}

function vehiclesOverlap(first, second) {
  const makeFrame = vehicle => {
    const yaw = vehicle.group.rotation.y;
    return {
      center: {
        x: vehicle.group.position.x + Math.sin(yaw) * VEHICLE_COLLISION_CENTER_Z,
        z: vehicle.group.position.z + Math.cos(yaw) * VEHICLE_COLLISION_CENTER_Z
      },
      widthAxis: { x: Math.cos(yaw), z: -Math.sin(yaw) },
      lengthAxis: { x: Math.sin(yaw), z: Math.cos(yaw) }
    };
  };
  const a = makeFrame(first);
  const b = makeFrame(second);
  const dx = b.center.x - a.center.x;
  const dz = b.center.z - a.center.z;
  const axes = [a.widthAxis, a.lengthAxis, b.widthAxis, b.lengthAxis];
  const dot = (left, right) => left.x * right.x + left.z * right.z;

  return axes.every(axis => {
    const distance = Math.abs(dx * axis.x + dz * axis.z);
    const radiusA = VEHICLE_COLLISION_HALF_WIDTH * Math.abs(dot(a.widthAxis, axis)) +
      VEHICLE_COLLISION_HALF_LENGTH * Math.abs(dot(a.lengthAxis, axis));
    const radiusB = VEHICLE_COLLISION_HALF_WIDTH * Math.abs(dot(b.widthAxis, axis)) +
      VEHICLE_COLLISION_HALF_LENGTH * Math.abs(dot(b.lengthAxis, axis));
    return distance < radiusA + radiusB;
  });
}

const traffic = [];
const trafficColors = [0x111111, 0x0055ff, 0xcc2222, 0x888888, 0x1e3a5f];
const TRAFFIC_REFERENCE_SPEED_KMH = 200;
const TRAFFIC_IDLE_INTERVAL_MS = 1450;
const TRAFFIC_FAST_INTERVAL_MS = 950;
const TRAFFIC_MAX_ACTIVE = 32;
const TRAFFIC_DOUBLE_WAVE_RATIO = 0.3;
const TRAFFIC_DIFFICULTIES = {
  easy: {
    label: "休闲",
    idleIntervalMs: 1850,
    fastIntervalMs: 1250,
    maxActive: 22,
    doubleWaveRatio: 0.12
  },
  normal: {
    label: "标准",
    idleIntervalMs: TRAFFIC_IDLE_INTERVAL_MS,
    fastIntervalMs: TRAFFIC_FAST_INTERVAL_MS,
    maxActive: TRAFFIC_MAX_ACTIVE,
    doubleWaveRatio: TRAFFIC_DOUBLE_WAVE_RATIO
  },
  hard: {
    label: "地狱",
    idleIntervalMs: 1100,
    fastIntervalMs: 680,
    maxActive: 42,
    doubleWaveRatio: 0.55
  }
};
let currentDifficulty = localStorage.getItem("racerDifficulty") || "normal";
if (!TRAFFIC_DIFFICULTIES[currentDifficulty]) currentDifficulty = "normal";
let trafficDensityAccumulator = 0;

function getTrafficConfig() {
  return TRAFFIC_DIFFICULTIES[currentDifficulty] || TRAFFIC_DIFFICULTIES.normal;
}

function applyDifficulty(diffKey) {
  currentDifficulty = TRAFFIC_DIFFICULTIES[diffKey] ? diffKey : "normal";
  localStorage.setItem("racerDifficulty", currentDifficulty);
  const sel = document.querySelector("#difficultySelect");
  if (sel) sel.value = currentDifficulty;
}

function spawnTraffic() {
  const cfg = getTrafficConfig();
  // 各设备统一使用同一上限，避免手机与电脑的赛道车流量不同。
  const availableSlots = cfg.maxActive - traffic.length;
  if (availableSlots <= 0) return;

  // 按车速累积决定额外车辆：同速、同波次时各设备刷出相同数量。
  const speedRatio = Math.max(0, Math.min(1, (currentSpeed * 90) / TRAFFIC_REFERENCE_SPEED_KMH));
  trafficDensityAccumulator += speedRatio * cfg.doubleWaveRatio;
  let blockCount = 1;
  if (trafficDensityAccumulator >= 1) {
    blockCount = 2;
    trafficDensityAccumulator -= 1;
  }
  const carsToSpawn = Math.min(blockCount, availableSlots);
  // Choose distinct lanes randomly; some rows leave the middle lane open.
  const availableLanes = Array.from({ length: LANE_COUNT }, (_, laneIndex) => laneIndex);

  for (let i = 0; i < carsToSpawn; i++) {
    const lanePick = Math.floor(Math.random() * availableLanes.length);
    const laneIndex = availableLanes.splice(lanePick, 1)[0];
    const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
    const color = trafficColors[Math.floor(Math.random() * trafficColors.length)];
    const enemy = createTeslaCar(false, color);

    enemy.group.position.set(laneX, 0, -380 - Math.random() * 60);
    enemy.laneX = laneX;
    // 快慢车混跑：慢车 60~80 km/h，快车 120~160 km/h
    enemy.speed = Math.random() < 0.55
      ? 0.14 + Math.random() * 0.10
      : 0.40 + Math.random() * 0.20;
    scene.add(enemy.group);
    traffic.push(enemy);
  }
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
  coinMesh.userData.laneX = laneX;
  scene.add(coinMesh);
  coins.push(coinMesh);
}

// 粒子系统
const particles = [];
const pGeo = new THREE.SphereGeometry(0.12, 6, 6);
const SPARK_MATS = new Map();

function createSpark(x, y, z, colorHex, count = 12) {
  let mat = SPARK_MATS.get(colorHex);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: colorHex });
    SPARK_MATS.set(colorHex, mat);
  }
  const actualCount = isMobileDevice ? Math.max(5, Math.ceil(count * 0.55)) : count;
  for (let i = 0; i < actualCount; i++) {
    const pMesh = new THREE.Mesh(pGeo, mat);
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
  cameraTrauma = Math.max(cameraTrauma, heavy ? 0.75 : 0.35);
  createSpark(x, 0.65, z, heavy ? 0xff3b30 : 0xffc857, heavy ? 30 : 14);
  triggerHaptic(heavy ? [80, 40, 120] : 45);
}

function createGrassTuft(themeKey) {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  const mat = themeKey === "island" ? mats.hay : mats.leafLight;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(geos.cone, mat);
    blade.scale.set(0.14, 0.55 + (i % 2) * 0.2, 0.14);
    const a = (i / 4) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.16, 0.26, Math.sin(a) * 0.16);
    blade.rotation.z = Math.cos(a) * 0.28;
    blade.rotation.x = Math.sin(a) * 0.28;
    g.add(blade);
  }
  return g;
}

function createDistantHill(themeKey) {
  const g = new THREE.Group();
  const color =
    themeKey === "island" ? 0xd9c28a :
    themeKey === "jungle" ? 0x1b4b2e :
    themeKey === "river" ? 0x8f563e :
    0x498840;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const main = new THREE.Mesh(SCENERY_ASSETS.geos.cone, mat);
  const w = 14 + Math.random() * 14;
  const h = 8 + Math.random() * 12;
  main.scale.set(w, h, w * 0.85);
  main.position.y = h * 0.45;
  g.add(main);
  return g;
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
  applyHorizonEnvironment(themeKey, theme);

  ambientLight.color.setHex(theme.ambientColor);
  sunLight.color.setHex(theme.sunColor);
  sunLight.intensity = theme.sunIntensity;

  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  roadSegments.length = 0;
  sceneryObjects.length = 0;

  // 天空太阳光晕与立体白云背景（纯背景装饰，不改玩法逻辑）
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff8d6, fog: false })
  );
  sunDisc.position.set(55, 52, -310);
  worldGroup.add(sunDisc);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, fog: false });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let c = 0; c < 7; c++) {
    const cl = new THREE.Group();
    const cx = -95 + c * 32 + (Math.random() - 0.5) * 14;
    const cy = 34 + (c % 3) * 6;
    const cz = -160 - (c % 4) * 35;
    [[-4.5, 0, 0, 5.2, 2.2, 3.2], [0, 1.1, 0, 7.0, 3.0, 3.8], [4.8, 0.2, 0.4, 5.0, 2.1, 3.0]].forEach(([px, py, pz, sx, sy, sz]) => {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.position.set(px, py, pz);
      puff.scale.set(sx, sy, sz);
      cl.add(puff);
    });
    cl.position.set(cx, cy, cz);
    worldGroup.add(cl);
  }

  // 所有路段共用同一批纹理、几何体与材质，兼具真实感与手机端高性能（加长搭接防止急弯接缝露底）
  const segSpan = ROAD_SEGMENT_LENGTH + 3.2;
  const waterColor = themeKey === "island" ? 0x16a8d6 : 0x267cb5;
  const segmentAssets = {
    themeKey,
    terrainGeo: new THREE.PlaneGeometry(280, segSpan),
    terrainMat: new THREE.MeshStandardMaterial({ color: theme.terrainColor, map: WORLD_TEXTURES.groundTex, roughness: 0.92 }),
    roadGeo: new THREE.PlaneGeometry(ROAD_WIDTH, segSpan),
    roadMat: new THREE.MeshStandardMaterial({ color: theme.roadColor, map: WORLD_TEXTURES.asphaltTex, roughness: theme.roadRoughness, metalness: 0.18 }),
    stripeGeo: new THREE.PlaneGeometry(0.24, 6),
    stripeMat: new THREE.MeshBasicMaterial({ color: theme.stripeColor }),
    edgeLineGeo: new THREE.PlaneGeometry(0.28, segSpan),
    edgeLineMat: new THREE.MeshBasicMaterial({ color: themeKey === "country" ? 0xffd166 : 0xeef6ff }),
    shoulderGeo: new THREE.PlaneGeometry(1.4, segSpan),
    shoulderMat: new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.95 }),
    railGeo: new THREE.BoxGeometry(0.35, 0.65, segSpan),
    railMat: new THREE.MeshStandardMaterial({ color: theme.railColor, roughness: themeKey === "island" || themeKey === "river" ? 0.35 : 0.72, metalness: themeKey === "island" || themeKey === "river" ? 0.55 : 0.08 }),
    stemGeo: new THREE.CylinderGeometry(0.055, 0.08, 0.8, 8),
    stemMat: new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.55 }),
    reflectorGeo: new THREE.BoxGeometry(0.18, 0.16, 0.05),
    waterGeo: new THREE.PlaneGeometry(105, segSpan),
    waterMat: new THREE.MeshStandardMaterial({ color: waterColor, roughness: 0.16, metalness: 0.55 })
  };

  for (let i = 0; i < ROAD_SEGMENTS; i++) {
    buildRoadSegment(-i * ROAD_SEGMENT_LENGTH, theme, segmentAssets, i);
  }

  // 两侧丰富大自然元素 (风草、野花、小牛、小鹿、风车、木屋、树木) - 紧邻公路
  const SCENERY_COUNT = isMobileDevice ? 84 : 150;
  const sceneryStepZ = 540 / SCENERY_COUNT;
  for (let i = 0; i < SCENERY_COUNT; i++) {
    let item;
    const rand = Math.random();

    if (themeKey === "country") {
      if (rand < 0.16) item = createCow();             // 写实奶牛
      else if (rand < 0.30) item = createDeer();        // 灵动梅花鹿
      else if (rand < 0.41) item = createWindmill();    // 荷兰风车
      else if (rand < 0.52) item = createFarmCabin();   // 农庄木屋
      else if (rand < 0.61) item = createHayBale();     // 田园麦草垛
      else if (rand < 0.72) item = createFlowerBush();  // 花丛灌木
      else if (rand < 0.84) item = createGrassTuft(themeKey); // 随风摇曳路边青草
      else if (rand < 0.90) item = createRoadFence();   // 木栅栏
      else item = createTree();                         // 多层自然大树
    } else if (themeKey === "island") {
      if (rand < 0.20) item = createDeer();
      else if (rand < 0.33) item = createWindmill();
      else if (rand < 0.46) item = createCanyonRock();
      else if (rand < 0.62) item = createFlowerBush();
      else if (rand < 0.72) item = createGrassTuft(themeKey);
      else item = createPalm();
    } else if (themeKey === "jungle") {
      if (rand < 0.26) item = createDeer();
      else if (rand < 0.40) item = createCanyonRock();
      else if (rand < 0.56) item = createFlowerBush();
      else if (rand < 0.70) item = createGrassTuft(themeKey);
      else item = createTree();
    } else {
      if (rand < 0.16) item = createCow();
      else if (rand < 0.32) item = createFarmCabin();
      else if (rand < 0.52) item = createCanyonRock();
      else if (rand < 0.66) item = createStreetLamp();
      else if (rand < 0.78) item = createGrassTuft(themeKey);
      else item = createTree();
    }

    const side = i % 2 === 0 ? -1 : 1;
    // 紧贴公路护栏外侧，水边地图将部分景物收在路边绿带以免漂在水面
    const offset = ROAD_WIDTH / 2 + 1.2 + Math.random() * 4.2;
    const zPos = -(i * sceneryStepZ);
    item.position.set(side * offset, 0, zPos);
    item.userData.trackX = item.position.x;
    item.userData = {
      ...item.userData,
      baseY: item.position.y,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmount: item.name === "" ? 0.016 + Math.random() * 0.016 : 0.010
    };

    item.rotation.y = (side === 1 ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 0.4;

    worldGroup.add(item);
    if (!isMobileDevice) {
      item.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
    }
    sceneryObjects.push(item);
  }

  // 外围远景起伏山峦轮廓，让道路延伸向真实地平线
  const HILL_COUNT = isMobileDevice ? 8 : 14;
  for (let h = 0; h < HILL_COUNT; h++) {
    const hill = createDistantHill(themeKey);
    const side = (themeKey === "river" || themeKey === "island") ? -1 : (h % 2 === 0 ? -1 : 1);
    const hx = side * (38 + Math.random() * 26);
    const hz = -(h * (540 / HILL_COUNT));
    hill.position.set(hx, 0, hz);
    hill.userData = { trackX: hx, baseY: 0 };
    worldGroup.add(hill);
    sceneryObjects.push(hill);
  }
}

function buildRoadSegment(zOffset, theme, assets, idx = 0) {
  const seg = new THREE.Group();
  seg.position.z = zOffset;
  const layerEps = (idx % 2) * 0.002;

  // 大地（带随机草地/沙地/土石纹理）
  const terrain = new THREE.Mesh(assets.terrainGeo, assets.terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05 + layerEps;
  if (!isMobileDevice) terrain.receiveShadow = true;
  seg.add(terrain);

  // 沿河峡谷与荒岛主题：路侧蜿蜒水流/海面
  if (assets.themeKey === "river" || assets.themeKey === "island") {
    const waterR = new THREE.Mesh(assets.waterGeo, assets.waterMat);
    waterR.rotation.x = -Math.PI / 2;
    waterR.position.set(ROAD_WIDTH / 2 + 58, -0.02 + layerEps, 0);
    seg.add(waterR);
    if (assets.themeKey === "island") {
      const waterL = new THREE.Mesh(assets.waterGeo, assets.waterMat);
      waterL.rotation.x = -Math.PI / 2;
      waterL.position.set(-ROAD_WIDTH / 2 - 58, -0.02 + layerEps, 0);
      seg.add(waterL);
    }
  }

  // 硬质路肩与沥青公路（带车道轮胎印与颗粒感）
  [-1, 1].forEach(side => {
    const shoulder = new THREE.Mesh(assets.shoulderGeo, assets.shoulderMat);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(side * (ROAD_WIDTH / 2 + 0.55), 0.01 + layerEps, 0);
    seg.add(shoulder);

    const edge = new THREE.Mesh(assets.edgeLineGeo, assets.edgeLineMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(side * (ROAD_WIDTH / 2 - 0.32), 0.036 + layerEps, 0);
    seg.add(edge);
  });

  const road = new THREE.Mesh(assets.roadGeo, assets.roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02 + layerEps;
  if (!isMobileDevice) road.receiveShadow = true;
  seg.add(road);

  // 道路白线
  for (let i = 1; i < LANE_COUNT; i++) {
    const laneX = -ROAD_WIDTH / 2 + i * LANE_WIDTH;
    for (let s = 0; s < 2; s++) {
      const stripe = new THREE.Mesh(assets.stripeGeo, assets.stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(laneX, 0.04, -ROAD_SEGMENT_LENGTH / 2 + s * 14 + 3);
      seg.add(stripe);
    }
  }

  // 真实原木护栏
  const railL = new THREE.Mesh(assets.railGeo, assets.railMat);
  railL.position.set(-ROAD_WIDTH / 2 - 0.2, 0.35, 0);
  seg.add(railL);
  if (!isMobileDevice) railL.castShadow = true;

  const railR = new THREE.Mesh(assets.railGeo, assets.railMat);
  railR.position.set(ROAD_WIDTH / 2 + 0.2, 0.35, 0);
  seg.add(railR);
  if (!isMobileDevice) railR.castShadow = true;

  // 连续的道路反光柱：强化道路边界、速度参照和两侧装饰层次。
  for (let marker = 0; marker < Math.floor(ROAD_SEGMENT_LENGTH / 24); marker++) {
    const z = -ROAD_SEGMENT_LENGTH / 2 + marker * 24 + 10;
    [-1, 1].forEach(side => {
      const post = new THREE.Group();
      const stem = new THREE.Mesh(assets.stemGeo, assets.stemMat);
      stem.position.y = 0.48;
      if (!isMobileDevice) stem.castShadow = true;
      post.add(stem);
      const reflector = new THREE.Mesh(assets.reflectorGeo, assets.stripeMat);
      reflector.position.set(-side * 0.08, 0.7, -0.05);
      post.add(reflector);
      post.position.set(side * (ROAD_WIDTH / 2 + 0.72), 0, z);
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
  baseSpeed = 0;
  frame = 0;
  raceDistance = 0;
  finishDistance = Number(document.querySelector("#raceLength")?.value || 1500);
  document.querySelector("#raceProgressBar").style.width = "0%";
  document.querySelector("#raceProgressText").textContent = `0 / ${finishDistance} m`;
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

  raceTime = 0;
  maxSpeed = 0;
  finishSpeed = 0;
  lastTrafficAt = 0;
  trafficDensityAccumulator = 0;
  playerImpactCooldownUntil = 0;
  scoreEl.textContent = formatRaceTime(0);
  nitroBar.style.width = "100%";

  // 开局生成 6 辆车：左右并排时给中间留通道，部分波次有中间车。
  const initialTraffic = [
    [-90, 0], [-90, 2],
    [-185, 1],
    [-300, 0], [-300, 2],
    [-440, 1]
  ];
  initialTraffic.forEach(([z, laneIndex], idx) => {
    const laneX = -ROAD_WIDTH / 2 + laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
    const color = trafficColors[idx % trafficColors.length];
    const enemy = createTeslaCar(false, color);
    enemy.group.position.set(laneX, 0, z);
    enemy.laneX = laneX;
    enemy.speed = 0.22 + Math.random() * 0.16;
    scene.add(enemy.group);
    traffic.push(enemy);
  });
}

function startGame() {
  sound.ensureContext();
  running = true;
  setMenuVisible(false);

  playerName = playerNameInput.value.trim() || "自驾游车友";
  localStorage.setItem("neonRacerName", playerName);
  resetGame();

  sound.startBGM();
  if (soundStatus) soundStatus.textContent = sound.enabled ? "🔊 音乐、引擎与音效已开启" : "🔇 已手动静音（点右上角喇叭恢复）";
  triggerHaptic(30);
}

function finishRace() {
  if (!running) return;
  running = false;
  sound.stopBGM();
  title.textContent = "冲过终点！";
  if (!bestTime || raceTime < bestTime) {
    bestTime = raceTime;
    localStorage.setItem("racerBestTime", String(bestTime));
  }
  bestEl.textContent = formatRaceTime(bestTime);

  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);

  finishSpeed = Math.round(currentSpeed * 90);
  const lines = [
    `完成 ${Math.floor(finishDistance / 100) / 10} km 赛道！`,
    `用时：<b style="color:#61efff;font-size:24px">${formatRaceTime(raceTime)}</b>　得分：<b style="color:#ffd166;font-size:22px">${finalScore}</b>`,
    `冲线速度：<b>${finishSpeed} km/h</b>　最高速度：<b>${Math.round(maxSpeed)} km/h</b>`,
    `最佳用时：${formatRaceTime(bestTime)}`
  ];
  message.innerHTML = lines.join("<br>");

  saveLocalScore(playerName, raceTime, finalScore);
  loadLeaderboard();
  document.querySelector("#start").textContent = "再跑一圈";
  setMenuVisible(true);
}

function exitCurrentGame() {
  running = false;
  sound.stopBGM();
  releaseAllInputs();
  baseSpeed = 0;
  currentSpeed = 0;
  boosting = false;
  title.textContent = "公路漫游 3D";
  message.textContent = "已退出当前对局，你可以重新选择赛道、难度或距离后再次出发。";
  const startBtnEl = document.querySelector("#start");
  if (startBtnEl) {
    startBtnEl.disabled = false;
    startBtnEl.textContent = "启动出发";
  }
  setMenuVisible(true);
}

function endGame() {
  running = false;
  sound.stopBGM();

  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  bestEl.textContent = formatRaceTime(bestTime);
  title.textContent = "旅程结束";
  message.innerHTML = `本次安全行驶得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>避开车流，再挑战一次吧。`;
  document.querySelector("#start").textContent = "重新启程";
  setMenuVisible(true);

  document.body.classList.remove("crash-flash");
  void document.body.offsetWidth;
  document.body.classList.add("crash-flash");

  cameraTrauma = 1.0;
  sound.playCrash();
  triggerHaptic([100, 50, 150]);

  createSpark(player.group.position.x, 0.6, player.group.position.z - 2.5, 0xffaa00, 35);
  loadLeaderboard();
}

// ═══════════════════════════════════════
// 比赛小地图：整条赛道 + 双方实时位置
// ═══════════════════════════════════════
const minimapCanvas = document.querySelector("#minimap");
let minimapCtx = null;
let minimapFrame = 0;

function layoutMinimap() {
  const el = document.querySelector("#minimap");
  if (!el) return;
  const mobile = window.matchMedia("(max-width: 850px)").matches;
  const size = mobile ? 88 : 128;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = mobile ? "12px" : "20px";
  el.style.top = mobile ? "136px" : "80px";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.width = Math.round(size * dpr);
  el.height = Math.round(size * dpr);
  minimapCtx = el.getContext("2d");
  if (minimapCtx) minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMinimap();
}

function drawMinimap() {
  const el = minimapCanvas;
  if (!el || !minimapCtx) return;
  const size = el.clientWidth;
  if (!size) return;
  const ctx = minimapCtx;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // CS:GO 风格圆形战术雷达底纹与距离环
  ctx.strokeStyle = "rgba(110, 220, 255, 0.14)";
  ctx.lineWidth = 1;
  [0.36, 0.70].forEach(k => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, size);
  ctx.moveTo(0, cy);
  ctx.lineTo(size, cy);
  ctx.stroke();

  // 以玩家所在位置为中心，画出周围 [-55m .. +215m] 的弯曲赛道与车流
  const playerScreenY = size * 0.68;
  const viewRangeAhead = 215;
  const m2px = (playerScreenY - 6) / viewRangeAhead;
  const baseTrackX = trackCurve(raceDistance);
  const toRadarX = (worldX) => cx + (worldX - baseTrackX - carPhysics.x) * m2px * 1.45;
  const toRadarY = (relAheadMeters) => playerScreenY - relAheadMeters * m2px;

  // 赛道公路带
  const total = Math.max(300, finishDistance);
  const minD = Math.max(0, raceDistance - 60);
  const maxD = Math.min(total, raceDistance + viewRangeAhead + 25);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const d = minD + ((maxD - minD) * i) / 32;
    const px = cx + (trackCurve(d) - baseTrackX - carPhysics.x) * m2px * 1.45;
    const py = toRadarY(d - raceDistance);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "rgba(85, 195, 255, 0.25)";
  ctx.lineWidth = Math.max(7, ROAD_WIDTH * m2px * 1.35);
  ctx.stroke();
  ctx.strokeStyle = "rgba(185, 240, 255, 0.58)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 终点线若在雷达视野内则画出金黄格子标
  const finishRel = total - raceDistance;
  if (finishRel >= -30 && finishRel <= viewRangeAhead + 20) {
    const fx = cx + (trackCurve(total) - baseTrackX - carPhysics.x) * m2px * 1.45;
    const fy = toRadarY(finishRel);
    ctx.fillStyle = "#ffd65c";
    ctx.fillRect(fx - 8, fy - 2, 16, 4);
  }

  // 金币散点
  ctx.fillStyle = "rgba(255, 214, 92, 0.78)";
  coins.forEach(c => {
    const relA = -c.position.z;
    if (relA < -40 || relA > viewRangeAhead) return;
    const rx = toRadarX(c.position.x);
    const ry = toRadarY(relA);
    ctx.beginPath();
    ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // 前后方 AI 车流红/橙点
  traffic.forEach(enemy => {
    const relA = -enemy.group.position.z;
    if (relA < -45 || relA > viewRangeAhead) return;
    const rx = toRadarX(enemy.group.position.x);
    const ry = toRadarY(relA);
    ctx.fillStyle = "#ff7847";
    ctx.beginPath();
    ctx.arc(rx, ry, 2.7, 0, Math.PI * 2);
    ctx.fill();
  });

  // 己方视野锥形扫描（CS:GO FOV 扇形）与自己箭头
  const pX = cx;
  const pY = playerScreenY;
  const yaw = carPhysics.heading || 0;
  const coneGrad = ctx.createRadialGradient(pX, pY, 2, pX, pY, size * 0.42);
  coneGrad.addColorStop(0, "rgba(180, 245, 255, 0.36)");
  coneGrad.addColorStop(1, "rgba(180, 245, 255, 0)");
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(pX, pY);
  ctx.arc(pX, pY, size * 0.42, -Math.PI / 2 + yaw - 0.46, -Math.PI / 2 + yaw + 0.46);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(pX, pY);
  ctx.rotate(yaw);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#081422";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 4.5);
  ctx.lineTo(0, 2.2);
  ctx.lineTo(-4.5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// ═══════════════════════════════════════
// 核心动力学更新循环 (纯正后轴阿克曼前轮转向)
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  frame++;

  // 1. 速度与加速
  const accelerating = keys[keymap.throttle] || keys.ArrowUp || keys.throttle;
  const wantsBoost = (keys[keymap.boost] || keys.ShiftLeft || keys.ShiftRight || keys.boost) && nitro > 0;

  if (wantsBoost && !boosting) {
    sound.playBoost();
    triggerHaptic(40);
  }
  boosting = wantsBoost;
  nitro = boosting ? Math.max(0, nitro - 0.7) : Math.min(100, nitro + 0.12);
  document.body.classList.toggle("boosting-fx", boosting);
  const flames = player.group.userData.nitroFlames;
  if (flames) {
    flames.visible = boosting;
    if (boosting) {
      flames.children.forEach(nozzle => {
        const stretch = 0.85 + Math.random() * 0.85;
        const width = 0.85 + Math.random() * 0.35;
        nozzle.scale.set(width, width, stretch);
      });
      if (frame % 2 === 0) {
        const pPos = player.group.position;
        [-0.52, 0.52].forEach(nx => {
          const spark = new THREE.Mesh(pGeo, CAR_ASSETS.nitroSparkMat);
          spark.position.set(pPos.x + nx + (Math.random() - 0.5) * 0.15, 0.28 + (Math.random() - 0.5) * 0.1, pPos.z + 1.35);
          scene.add(spark);
          particles.push({
            mesh: spark,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.3) * 0.06,
            vz: 0.45 + Math.random() * 0.35,
            life: 0.55
          });
        });
      }
    }
  }

  // 手机与电脑默认同速；键盘油门只略微提速，避免平台间速度差异过大。
  // 时速上限固定 200 km/h（currentSpeed 单位换算：×90 即 km/h）
  const braking = brakeHeld || keys.brake || keys[keymap.brake] || keys.ArrowDown;
  const MAX_SPEED = 200 / 90;
  if (braking) {
    baseSpeed = Math.max(0, baseSpeed - 0.05);
  } else if (accelerating || throttleHeld) {
    baseSpeed = Math.min(MAX_SPEED, baseSpeed + 0.012);
  } else {
    // 松开油门约 1 秒内停住，绝不会自己往前溜
    baseSpeed = Math.max(0, baseSpeed - 0.02);
    if (baseSpeed < 0.02) baseSpeed = 0;
  }
  currentSpeed = Math.min(MAX_SPEED, baseSpeed + (boosting ? 0.35 : 0));
  raceDistance += (currentSpeed * 90) / 3.6 / 60;
  const progress = Math.min(1, raceDistance / finishDistance);
  finishGate.position.set(trackCurve(finishDistance), 0, -(finishDistance - raceDistance));
  const raceBar = document.querySelector("#raceProgressBar");
  const raceText = document.querySelector("#raceProgressText");
  if (raceBar) raceBar.style.width = `${progress * 100}%`;
  if (raceText) raceText.textContent = `${Math.floor(raceDistance)} / ${finishDistance} m`;
  if (raceDistance >= finishDistance) {
    finishRace();
    return;
  }

  score += currentSpeed * 0.45;
  raceTime += 1 / 60;
  maxSpeed = Math.max(maxSpeed, currentSpeed * 90);

  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = formatRaceTime(raceTime);
  speedEl.textContent = Math.floor(currentSpeed * 90);

  sound.updateEngine(currentSpeed, boosting);

  // 2. 真实汽车物理转向 (后轴旋转中心，零漂移！)
  const turnLeft = steeringMode === "buttons" && (keys[keymap.left] || keys.ArrowLeft || keys.KeyA || keys.left);
  const turnRight = steeringMode === "buttons" && (keys[keymap.right] || keys.ArrowRight || keys.KeyD || keys.right);

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
  carPhysics.heading += angularVelocity * dt * 5.0;

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
  // 松开方向后回到最近车道中心；转向过程中不干预，保留连续变道手感。
  carPhysics.x = applyLaneKeeping(carPhysics.x, targetSteer, currentSpeed, dt);

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
  player.group.position.x = carPhysics.x + trackCurve(raceDistance);
  player.group.position.y = Math.sin(frame * 0.16) * 0.012 + Math.abs(carPhysics.rollVel) * 0.018;
  // 车身朝向 = 转向角 + 赛道切线方向，弯道上车头始终顺着路
  const roadSlope = (trackCurve(raceDistance + 4) - trackCurve(raceDistance - 4)) / 8;
  const roadYaw = Math.atan(roadSlope);
  player.group.rotation.y = -carPhysics.heading - roadYaw;
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
    const roadDistance = raceDistance - seg.position.z;
    seg.position.x = trackCurve(roadDistance);
    const curveSlope = (trackCurve(roadDistance + 2) - trackCurve(roadDistance - 2)) / 4;
    seg.rotation.y = -Math.atan(curveSlope);
  });

  sceneryObjects.forEach(item => {
    item.position.z += moveZ;
    if (item.position.z > 25) {
      item.position.z -= 540;
    }
    const vis = item.position.z > -410 && item.position.z < 24;
    item.visible = vis;
    if (!vis) return;
    item.position.x = item.userData.trackX + trackCurve(raceDistance - item.position.z);
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

  // 5. 敌车刷新与真实碰撞检测 (按所选难度与实时车速动态刷车)
  const nowMs = Date.now();
  const trafficCfg = getTrafficConfig();
  const trafficSpeedRatio = Math.max(0, Math.min(1, (currentSpeed * 90) / TRAFFIC_REFERENCE_SPEED_KMH));
  const trafficInterval = trafficCfg.idleIntervalMs -
    (trafficCfg.idleIntervalMs - trafficCfg.fastIntervalMs) * trafficSpeedRatio;
  if (nowMs - lastTrafficAt > trafficInterval) {
    lastTrafficAt = nowMs;
    spawnTraffic();
  }
  if (Math.random() < 0.03) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.0;
    const enemyRoadDistance = raceDistance - enemy.group.position.z;
    enemy.group.position.x = enemy.laneX + trackCurve(enemyRoadDistance);
    const enemyVisible = enemy.group.position.z > -420 && enemy.group.position.z < 24;
    enemy.group.visible = enemyVisible;
    if (enemyVisible) {
      const enemyRoadSlope = (trackCurve(enemyRoadDistance + 4) - trackCurve(enemyRoadDistance - 4)) / 8;
      enemy.group.rotation.y = -Math.atan(enemyRoadSlope);
      enemy.group.position.y = Math.sin(frame * 0.11 + i) * 0.01;
      enemy.group.rotation.z = Math.sin(frame * 0.08 + i) * 0.006;
      enemy.wheels.forEach(w => {
        w.spin.rotation.x += 0.35;
      });
    }

    // 按 2.4m 车宽、4.9m 车长做旋转矩形碰撞；留有真实车身间隙即可通过。
    const ePos = enemy.group.position;
    // 同一瞬间撞到多辆车只结算一次；最低滚行速度避免连续碰撞把车压停。
    if (vehiclesOverlap(player, enemy) && registerPlayerImpact(enemy, Date.now())) {
      baseSpeed = reduceSpeedAfterImpact(baseSpeed);
      showImpact("碰撞 · 减速", ePos.x, ePos.z, true);
      sound.playCrash();
      cameraTrauma = Math.min(1, cameraTrauma + 0.5);
    }

    if (enemy.group.position.z > 25 || enemy.group.position.z < -650) {
      scene.remove(enemy.group);
      traffic.splice(i, 1);
    }
  }

  // 6. 金币收集
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += moveZ;
    coin.position.x = coin.userData.laneX + trackCurve(raceDistance - coin.position.z);
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

  // 8. 动态第三人称追焦相机：弹性滞后跟随 + 弯道/转向预瞄 + 微侧倾，竖屏手机自动拓宽视野并将车置于合理低位
  if (frame % (isMobileDevice ? 6 : 4) === 0) drawMinimap();
  const camFraming = getCameraFraming();
  const carWorldX = carPhysics.x + trackCurve(raceDistance);
  const lookSlope = (trackCurve(raceDistance + 25) - trackCurve(raceDistance)) / 25;
  const targetCamX = carWorldX - carPhysics.heading * 1.15;
  const speedRatio = Math.min(1, currentSpeed / (200 / 90));
  const targetCamY = camFraming.baseY + (boosting ? -0.22 : 0) + speedRatio * 0.32;
  const targetCamZ = camFraming.baseZ + (boosting ? 0.75 : 0) + speedRatio * 1.55;

  camera.position.x += (targetCamX - camera.position.x) * 0.105;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  if (cameraTrauma > 0) {
    const p = Math.pow(cameraTrauma, 2);
    camera.position.x += (Math.random() - 0.5) * 1.5 * p;
    camera.position.y += (Math.random() - 0.5) * 1.2 * p;
    cameraTrauma = Math.max(0, cameraTrauma - 0.04);
  }

  const targetFov = camFraming.baseFov + (boosting ? 5.5 : 0) + speedRatio * 2.5;
  camera.fov += (targetFov - camera.fov) * 0.06;
  camera.updateProjectionMatrix();

  const lookTargetX = carWorldX * 0.62 + camera.position.x * 0.38 + lookSlope * 22 + carPhysics.heading * 8.0;
  camera.lookAt(lookTargetX, camFraming.lookY, -16);
  const targetBank = -carPhysics.heading * 0.085 - carPhysics.roll * 0.35;
  cameraBank += (targetBank - cameraBank) * 0.14;
  camera.rotateZ(cameraBank);
}

// ═══════════════════════════════════════
// 渲染循环与音频状态自动保持
// ═══════════════════════════════════════
const FIXED_STEP_MS = 1000 / 60;
let previousFrameTime = 0;
let updateAccumulator = 0;

function render(timestamp = performance.now()) {
  if (!previousFrameTime) previousFrameTime = timestamp;
  // Cap catch-up after tab suspension and keep mobile 60Hz jitter smooth.
  const elapsed = Math.min(timestamp - previousFrameTime, 50);
  previousFrameTime = timestamp;
  updateAccumulator += elapsed;
  if (updateAccumulator >= FIXED_STEP_MS - 1.2 && updateAccumulator < FIXED_STEP_MS) {
    updateAccumulator = FIXED_STEP_MS;
  }
  let steps = 0;
  while (updateAccumulator >= FIXED_STEP_MS && steps < 2) {
    update();
    updateAccumulator -= FIXED_STEP_MS;
    steps += 1;
  }
  if (updateAccumulator > FIXED_STEP_MS * 2) updateAccumulator = FIXED_STEP_MS;
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
  // 自己的名字在榜上用黄色标出来，方便一眼找到
  const myName = (playerNameInput?.value.trim() || playerName || localStorage.getItem("neonRacerName") || "").toLowerCase();
  leaderboardList.innerHTML = scores.map((item, index) => {
    const mine = myName && String(item.name || "").trim().toLowerCase() === myName;
    const scoreText = item.score ? ` · ${item.score}分` : "";
    return `<li${mine ? ' class="mine"' : ""}><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span>${formatRaceTime(Number(item.time))}${scoreText}</span></li>`;
  }).join("");
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

function readLocalScores() {
  try {
    const data = JSON.parse(localStorage.getItem("racerLocalScores") || "[]");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveLocalScore(name, time, pts = 0) {
  const list = readLocalScores();
  const key = String(name || "车手").trim().toLowerCase();
  const prev = list.find(item => String(item.name || "").trim().toLowerCase() === key);
  const entry = {
    name: name || "车手",
    time: Math.round(time * 10) / 10,
    score: Math.max(Number(pts) || 0, Number(prev?.score) || 0),
    createdAt: new Date().toISOString()
  };
  if (prev && Number(prev.time) < entry.time) {
    entry.time = prev.time;
  }
  const kept = list.filter(item => String(item.name || "").trim().toLowerCase() !== key);
  kept.push(entry);
  kept.sort((a, b) => Number(a.time) - Number(b.time));
  localStorage.setItem("racerLocalScores", JSON.stringify(kept.slice(0, 20)));
}

function loadLeaderboard() {
  setServerState(false);
  renderLeaderboard(readLocalScores());
}

// ═══════════════════════════════════════
// 全局交互与事件绑定 (确保苹果 iOS Safari 及全平台 100% 唤醒音频)
// ═══════════════════════════════════════
function unlockAudioAndHaptics(event) {
  if (event && event.target && event.target.closest && event.target.closest("#audioToggle")) return;
  sound.ensureContext();
  if (sound.enabled && sound.bgmAudio && sound.bgmAudio.paused) {
    sound.startBGM();
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
  const normalized = Math.max(-1, Math.min(1, lean / 2.2));
  const deadZone = 0.04;
  const target = Math.abs(normalized) < deadZone
    ? 0
    : Math.sign(normalized) * (Math.abs(normalized) - deadZone) / (1 - deadZone);
  tiltSteer += (target - tiltSteer) * 0.42;
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
  if (capturingKey) {
    event.preventDefault();
    keymap[capturingKey] = event.code;
    saveKeymap();
    capturingKey = null;
    renderKeymapButtons();
    return;
  }
  keys[event.code] = true;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", event => {
  keys[event.code] = false;
});

// 切后台/窗口失焦时清空所有输入，避免油门或加速键"卡住"导致没人踩也在跑
function releaseAllInputs() {
  Object.keys(keys).forEach(code => { keys[code] = false; });
  throttleHeld = false;
  brakeHeld = false;
  if (typeof keys !== "undefined") {
    keys.throttle = false;
    keys.brake = false;
    keys.boost = false;
    keys.left = false;
    keys.right = false;
  }
}
window.addEventListener("blur", releaseAllInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAllInputs();
});

window.addEventListener("resize", () => {
  const f = getCameraFraming();
  camera.aspect = window.innerWidth / window.innerHeight;
  if (!running) {
    camera.fov = f.baseFov;
    camera.position.set(0, f.baseY, f.baseZ);
    camera.lookAt(0, f.lookY, -16);
  }
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.0 : 2));
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

const difficultySelect = document.querySelector("#difficultySelect");
if (difficultySelect) {
  difficultySelect.addEventListener("change", (e) => {
    applyDifficulty(e.target.value);
  });
}

// 音量开关
if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    sound.toggle();
    syncAudioUI();
  });
}

bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");

function bindPedal(selector, key) {
  const button = document.querySelector(selector);
  if (!button) return;
  const release = () => { keys[key] = false; };
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    keys[key] = true;
    button.setPointerCapture?.(event.pointerId);
  });
  ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"].forEach(type => button.addEventListener(type, release));
}
bindPedal("#throttle", "throttle");
bindPedal("#brake", "brake");

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

const exitGameBtn = document.querySelector("#exitGameBtn");
if (exitGameBtn) {
  exitGameBtn.addEventListener("click", () => {
    exitCurrentGame();
  });
}

const customMusicInput = document.querySelector("#customMusicInput");
const customMusicName = document.querySelector("#customMusicName");
if (customMusicInput) {
  customMusicInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    sound.ensureContext();
    if (sound.customTrackUrl) {
      try { URL.revokeObjectURL(sound.customTrackUrl); } catch (e) {}
    }
    sound.customTrackUrl = URL.createObjectURL(file);
    sound.customTrackTitle = file.name;
    if (sound.bgmAudio) {
      sound.bgmAudio.src = sound.customTrackUrl;
      sound.bgmAudio.loop = true;
    }
    sound.enabled = true;
    sound.startBGM();
    syncAudioUI();
  });
}

const testAudioBtn = document.querySelector("#testAudioBtn");
if (testAudioBtn) {
  testAudioBtn.addEventListener("click", () => {
    if (!sound.enabled) {
      sound.enabled = true;
      localStorage.setItem("racerAudioEnabled", "1");
    }
    sound.ensureContext();
    sound.startBGM();
    syncAudioUI();
  });
}

const nextTrackBtn = document.querySelector("#nextTrackBtn");
if (nextTrackBtn) {
  nextTrackBtn.addEventListener("click", () => {
    if (!sound.enabled) {
      sound.enabled = true;
      localStorage.setItem("racerAudioEnabled", "1");
    }
    sound.ensureContext();
    sound.nextTrack(true);
  });
}

refreshRanks.addEventListener("click", loadLeaderboard);

// 快捷键：点按钮录制新键，或者一键恢复默认
["throttle", "brake", "boost", "left", "right"].forEach(action => {
  const btn = document.querySelector(`#key-${action}`);
  if (btn) btn.addEventListener("click", () => startKeyCapture(action));
});
document.querySelector("#key-reset")?.addEventListener("click", () => {
  keymap = Object.assign({}, DEFAULT_KEYMAP);
  saveKeymap();
  renderKeymapButtons();
});
renderKeymapButtons();

// 初始化
setMenuVisible(true);
applyTheme(currentTheme);
applyDifficulty(currentDifficulty);
sound.startBGM();
syncAudioUI();
layoutMinimap();
window.addEventListener("resize", () => layoutMinimap());
loadLeaderboard();
render();

