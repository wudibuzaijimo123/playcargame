/**
 * 3D 真实公路驾驶模拟 - 特斯拉轿跑与自然生机探索
 */

// ── DOM 节点 ──
const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const title = document.querySelector("#title");
const message = document.querySelector("#message");
const scoreEl = document.querySelector("#score");
const liveScoreEl = document.querySelector("#liveScore");
const speedEl = document.querySelector("#speed");
const bestEl = document.querySelector("#best");
const bestLabelEl = document.querySelector("#bestLabel");
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
let finishDistance = 5000;
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
function syncBestHud() {
  if (bestEl) bestEl.textContent = best > 0 ? String(Math.floor(best)) : "--";
  if (bestLabelEl) {
    bestLabelEl.textContent = bestTime > 0 ? `最高分 · 最快 ${formatRaceTime(bestTime)}` : "最高分 / 最快";
  }
}
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
syncBestHud();

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
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      }
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
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.2, 1400);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobileDevice, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.0 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.90);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfffaea, 1.55);
sunLight.position.set(28, 52, 22);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -64;
sunLight.shadow.camera.right = 64;
sunLight.shadow.camera.top = 72;
sunLight.shadow.camera.bottom = -36;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight);
scene.add(sunLight.target);

const skyLight = new THREE.HemisphereLight(0xbfe6ff, 0x31512d, 0.85);
scene.add(skyLight);

let cameraTrauma = 0;

// ═══════════════════════════════════════
// 赛道与自然场景配置
// ═══════════════════════════════════════
const ROAD_WIDTH = 20;
// 三车道让中间车道中心与玩家起始位置 x=0 对齐，直行不避让就会遇到车流。
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const Z_PER_METER = 1.25;
const TRACK_SLICE_COUNT = 140;
const TRACK_SLICE_STEP = 2.5;
const TRACK_BACK_METERS = 24;

// QQ飞车流线型多弯复合赛道：C2 连续五次 Hermite 过渡 + 无高频抖动 + 弯道自然内倾
function smootherStep(k) {
  const t = Math.max(0, Math.min(1, k));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function trackCurve(distance) {
  if (distance <= 0) return 0;
  const period = 2400;
  const u = (distance % period) / period;
  const keys = [
    [0.00, 0],
    [0.04, 0],
    [0.13, 42],
    [0.23, -38],
    [0.34, 68],
    [0.43, 8],
    [0.55, -72],
    [0.66, 46],
    [0.77, -64],
    [0.89, 44],
    [0.95, 0],
    [1.00, 0]
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (u >= t0 && u <= t1) {
      const k = (u - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * smootherStep(k);
    }
  }
  return 0;
}

function trackSlope(distance) {
  return (trackCurve(distance + 2.5) - trackCurve(distance - 2.5)) / 5.0;
}

function trackBankSlope(distance) {
  const curv = trackCurve(distance + 6) - 2 * trackCurve(distance) + trackCurve(distance - 6);
  return Math.max(-0.048, Math.min(0.048, -curv * 0.085));
}

function roadSurfaceY(distance, localX) {
  return localX * trackBankSlope(distance);
}

function trackWorldPoint(distance, localX, yOffset = 0) {
  const cx = trackCurve(distance);
  const slopeZ = trackSlope(distance) / Z_PER_METER;
  const inv = 1 / Math.hypot(1, slopeZ);
  const bank = trackBankSlope(distance);
  return {
    x: cx + localX * inv,
    y: localX * bank + yOffset,
    z: -(distance - raceDistance) * Z_PER_METER + localX * (slopeZ * inv),
    yaw: -Math.atan(slopeZ),
    bankAngle: Math.atan(bank),
    slopeZ
  };
}

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const trackRibbons = [];
const trackPosts = [];
const sceneryObjects = []; // 近景动物、木屋、树木、风车
const distantHills = [];   // 远景山脉（低视差慢速移动，不随路面急弯左右甩动）
const skyClouds = [];      // 高空柔和积云层
const windStreaks = [];    // 车身周围高速破风气流线
let groundPlaneMesh = null;
let horizonGroup = null;
let skyDome = null;

const THEMES = {
  country: {
    name: "乡间小路",
    cnName: "🌾 乡间小路",
    skyColor: 0x82b8f5,
    fogColor: 0xb5dca5,
    fogDensity: 0.0044,
    ambientColor: 0xffffff,
    sunColor: 0xfff6dd,
    sunIntensity: 1.55,
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
    fogDensity: 0.0044,
    ambientColor: 0xe0f7fa,
    sunColor: 0xfff0b3,
    sunIntensity: 1.70,
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
    fogDensity: 0.0064,
    ambientColor: 0xa7d7c5,
    sunColor: 0xd4ffd4,
    sunIntensity: 1.45,
    roadColor: 0x2f2922,
    roadRoughness: 0.86,
    terrainColor: 0x1e4d31,
    stripeColor: 0x88d49e,
    railColor: 0x4d3423
  },
  river: {
    name: "沿河峡谷",
    cnName: "🌊 沿河峡谷",
    skyColor: 0x628ec9,
    fogColor: 0x9ed4ee,
    fogDensity: 0.0048,
    ambientColor: 0xdde5ed,
    sunColor: 0xffffff,
    sunIntensity: 1.60,
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
    tex.repeat.set(1, 3);
    return tex;
  };
  const makeSoftCloudTex = () => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 256, 128);
    // 所有渐变圆严格留白边距，避免纹理边缘被矩形裁切出竖线/横线；上白亮底灰蓝形成立体绵软云朵
    const puffs = [
      [78, 72, 34, "rgba(205,220,242,0.45)"],
      [128, 74, 38, "rgba(198,214,238,0.48)"],
      [178, 72, 34, "rgba(205,220,242,0.42)"],
      [66, 58, 30, "rgba(255,255,255,0.78)"],
      [104, 48, 36, "rgba(255,255,255,0.92)"],
      [148, 48, 36, "rgba(255,255,255,0.88)"],
      [188, 58, 28, "rgba(255,255,255,0.72)"]
    ];
    puffs.forEach(([px, py, pr, col]) => {
      const grad = g.createRadialGradient(px, py, pr * 0.14, px, py, pr);
      grad.addColorStop(0, col);
      grad.addColorStop(0.52, col.replace(/[\d.]+\)$/, "0.24)"));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 128);
    });
    return new THREE.CanvasTexture(c);
  };
  const makeSunHaloTex = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    rg.addColorStop(0, "rgba(255,252,232,0.95)");
    rg.addColorStop(0.22, "rgba(255,240,190,0.55)");
    rg.addColorStop(0.55, "rgba(255,216,145,0.16)");
    rg.addColorStop(1, "rgba(255,216,145,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
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
    softCloudTex: makeSoftCloudTex(),
    sunHaloTex: makeSunHaloTex(),
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

// 地平线质感反射环境贴图与高空全景渐变穹顶（按主题缓存，兼具电影天际线质感与低开销）
let envPmremGen = null;
const ENV_CACHE = new Map();
const SKY_TEX_CACHE = new Map();
const ROAD_TEX_CACHE = new Map();
const CURB_TEX_CACHE = new Map();
const RAIL_TEX_CACHE = new Map();

function applyTexAnisotropy(tex) {
  if (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === "function") {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
  }
  return tex;
}

function getRoadSurfaceTexture(themeKey, theme) {
  if (ROAD_TEX_CACHE.has(themeKey)) return ROAD_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");

  const baseCol = new THREE.Color(theme.roadColor);
  g.fillStyle = "#" + baseCol.getHexString();
  g.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 512;
    const y = ((Math.sin(i * 78.233) * 19341.217) % 1 + 1) % 1 * 512;
    const delta = ((i * 37) % 28) - 14;
    g.fillStyle = delta >= 0 ? `rgba(255,255,255,${0.015 + (delta % 8) * 0.005})` : `rgba(0,0,0,${0.04 + ((-delta) % 9) * 0.006})`;
    g.fillRect(x, y, 2, 2);
  }

  [85, 256, 427].forEach(cx => {
    [-26, 26].forEach(dx => {
      const grad = g.createLinearGradient(cx + dx - 18, 0, cx + dx + 18, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(10,12,18,0.22)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(cx + dx - 18, 0, 36, 512);
    });
  });

  const edgeCol = themeKey === "country" ? "#ffd166" : "#eef6ff";
  g.fillStyle = edgeCol;
  g.fillRect(6, 0, 9, 512);
  g.fillRect(497, 0, 9, 512);

  const dashCol = "#" + new THREE.Color(theme.stripeColor).getHexString();
  g.fillStyle = dashCol;
  const laneDivX1 = Math.round(512 / 3) - 4;
  const laneDivX2 = Math.round((512 * 2) / 3) - 4;
  [32, 288].forEach(yStart => {
    g.fillRect(laneDivX1, yStart, 8, 128);
    g.fillRect(laneDivX2, yStart, 8, 128);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  applyTexAnisotropy(tex);
  ROAD_TEX_CACHE.set(themeKey, tex);
  return tex;
}

function getCurbTexture(themeKey) {
  if (CURB_TEX_CACHE.has(themeKey)) return CURB_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  const aCol = themeKey === "island" ? "#ff6b35" : themeKey === "river" ? "#00b4d8" : themeKey === "jungle" ? "#f59e0b" : "#e63946";
  g.fillStyle = "#f8fafc";
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = aCol;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "rgba(15,20,28,0.22)";
  g.fillRect(0, 0, 10, 256);
  g.fillRect(54, 0, 10, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  applyTexAnisotropy(tex);
  CURB_TEX_CACHE.set(themeKey, tex);
  return tex;
}

function getRailTexture(themeKey, theme) {
  if (RAIL_TEX_CACHE.has(themeKey)) return RAIL_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  const baseHex = "#" + new THREE.Color(theme.railColor).getHexString();
  g.fillStyle = baseHex;
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = "rgba(255,255,255,0.20)";
  g.fillRect(0, 0, 64, 18);
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(0, 190, 64, 66);
  g.fillStyle = themeKey === "island" || themeKey === "river" ? "rgba(0,229,255,0.75)" : "rgba(255,209,102,0.85)";
  g.fillRect(10, 24, 44, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  applyTexAnisotropy(tex);
  RAIL_TEX_CACHE.set(themeKey, tex);
  return tex;
}

function makeSkyDomeTexture(themeKey, theme) {
  if (SKY_TEX_CACHE.has(themeKey)) return SKY_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d");
  const topCol = new THREE.Color(theme.skyColor).multiplyScalar(0.76);
  const midCol = new THREE.Color(theme.skyColor);
  const fogCol = new THREE.Color(theme.fogColor).lerp(new THREE.Color(0xfff6e5), 0.25);

  const grad = g.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0.0, "#" + topCol.getHexString());
  grad.addColorStop(0.48, "#" + midCol.getHexString());
  grad.addColorStop(0.84, "#" + fogCol.getHexString());
  grad.addColorStop(1.0, "#" + new THREE.Color(theme.fogColor).getHexString());
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(c);
  SKY_TEX_CACHE.set(themeKey, tex);
  return tex;
}

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

  // 5. 立体熏黑贯穿式 LED 尾灯 + 牌照框 + 尾标（玩家车型独立刹车灯材质，刹车明显高亮）
  const tailMat = isPlayer ? new THREE.MeshBasicMaterial({ color: 0xb81628 }) : CAR_ASSETS.tailMat;
  carGroup.userData.tailMat = tailMat;

  const tailHousing = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  tailHousing.scale.set(1.74, 0.13, 0.07);
  tailHousing.position.set(0, 0.68, 0.95);
  carGroup.add(tailHousing);

  const tailBar = new THREE.Mesh(CAR_ASSETS.box, tailMat);
  tailBar.scale.set(1.66, 0.055, 0.085);
  tailBar.position.set(0, 0.69, 0.96);
  carGroup.add(tailBar);

  [-0.72, 0.72].forEach(tx => {
    const blade = new THREE.Mesh(CAR_ASSETS.box, tailMat);
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
  rollVel: 0,
  pitch: 0,        // 加速抬头/刹车点头纵倾角
  boostSpeed: 0    // 平滑氮气增益
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
  const coinsSpawnZ = -220 * Z_PER_METER;
  const coinDist = raceDistance - coinsSpawnZ / Z_PER_METER;
  const coinPt = trackWorldPoint(coinDist, laneX, 0.85);
  coinMesh.position.set(coinPt.x, coinPt.y, coinPt.z);
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

let impactFlashTimer = null;
let barrierImpactCooldownUntil = 0;

function showImpact(label, x, z, heavy = false) {
  if (impactHud && impactValue) {
    impactValue.textContent = label;
    impactHud.classList.add("visible");
    clearTimeout(impactTimer);
    impactTimer = setTimeout(() => impactHud.classList.remove("visible"), heavy ? 950 : 480);
  }
  document.body.classList.remove("impact-flash");
  clearTimeout(impactFlashTimer);
  requestAnimationFrame(() => {
    document.body.classList.add("impact-flash");
    impactFlashTimer = setTimeout(() => document.body.classList.remove("impact-flash"), 280);
  });
  cameraTrauma = Math.max(cameraTrauma, heavy ? 0.65 : 0.28);
  createSpark(x, 0.65, z, heavy ? 0xff3b30 : 0xffc857, heavy ? 22 : 10);
  triggerHaptic(heavy ? [80, 40, 120] : 40);
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

function createDistantHill(themeKey, fogColorHex) {
  const g = new THREE.Group();
  const baseCol = new THREE.Color(
    themeKey === "island" ? 0xcab68a :
    themeKey === "jungle" ? 0x1e4c30 :
    themeKey === "river" ? 0x87543f :
    0x467b42
  );
  // 远景山脊混入大气雾色，形成自然的空气透视深度
  baseCol.lerp(new THREE.Color(fogColorHex), 0.52);
  const mat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.96, flatShading: true });
  const main = new THREE.Mesh(SCENERY_ASSETS.geos.cone, mat);
  const w = 32 + Math.random() * 28;
  const h = 14 + Math.random() * 18;
  main.scale.set(w, h, w * 0.62);
  main.position.y = h * 0.36;
  g.add(main);
  // 附带侧肩矮山峦，消除孤立圆锥角感
  const sub = new THREE.Mesh(SCENERY_ASSETS.geos.cone, mat);
  sub.scale.set(w * 0.72, h * 0.66, w * 0.52);
  sub.position.set((Math.random() > 0.5 ? 1 : -1) * w * 0.42, h * 0.24, 3);
  g.add(sub);
  return g;
}

// ═══════════════════════════════════════
// 场景初始化与景观填充
// ═══════════════════════════════════════
const ribbonFrames = Array.from({ length: TRACK_SLICE_COUNT + 1 }, () => ({
  d: 0, cx: 0, rx: 1, rz: 0, bank: 0, cz: 0
}));

function createTrackRibbon(profile, material, vScale, uCoords, opts = {}) {
  const slices = TRACK_SLICE_COUNT;
  const rows = slices + 1;
  const cols = profile.length;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices = [];
  for (let s = 0; s < slices; s++) {
    for (let p = 0; p < cols - 1; p++) {
      const a = s * cols + p;
      const b = (s + 1) * cols + p;
      const c = (s + 1) * cols + (p + 1);
      const d = s * cols + (p + 1);
      indices.push(a, d, c, a, c, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  if (opts.receiveShadow && !isMobileDevice) mesh.receiveShadow = true;
  if (opts.renderOrder !== undefined) mesh.renderOrder = opts.renderOrder;
  worldGroup.add(mesh);
  trackRibbons.push({
    mesh,
    geo,
    profile,
    uCoords: uCoords || profile.map((_, i) => i / Math.max(1, cols - 1)),
    vScale,
    recomputeNormals: Boolean(opts.recomputeNormals)
  });
  return mesh;
}

function updateTrackRibbons() {
  if (!trackRibbons.length) return;
  for (let s = 0; s <= TRACK_SLICE_COUNT; s++) {
    const d = raceDistance - TRACK_BACK_METERS + s * TRACK_SLICE_STEP;
    const slopeZ = trackSlope(d) / Z_PER_METER;
    const inv = 1 / Math.hypot(1, slopeZ);
    const f = ribbonFrames[s];
    f.d = d;
    f.cx = trackCurve(d);
    f.rx = inv;
    f.rz = slopeZ * inv;
    f.bank = trackBankSlope(d);
    f.cz = -(d - raceDistance) * Z_PER_METER;
  }
  for (let r = 0; r < trackRibbons.length; r++) {
    const rib = trackRibbons[r];
    const posAttr = rib.geo.getAttribute("position");
    const uvAttr = rib.geo.getAttribute("uv");
    const pos = posAttr.array;
    const uv = uvAttr.array;
    const cols = rib.profile.length;
    for (let s = 0; s <= TRACK_SLICE_COUNT; s++) {
      const f = ribbonFrames[s];
      const vCoord = f.d * rib.vScale;
      for (let p = 0; p < cols; p++) {
        const vertIdx = s * cols + p;
        const idx3 = vertIdx * 3;
        const idx2 = vertIdx * 2;
        const lx = rib.profile[p][0];
        const ly = rib.profile[p][1];
        pos[idx3] = f.cx + lx * f.rx;
        pos[idx3 + 1] = ly + lx * f.bank;
        pos[idx3 + 2] = f.cz + lx * f.rz;
        uv[idx2] = rib.uCoords[p];
        uv[idx2 + 1] = vCoord;
      }
    }
    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    if (rib.recomputeNormals) {
      rib.geo.computeVertexNormals();
    }
  }
  if (trackPosts.length) {
    const firstPostD = Math.floor((raceDistance - 18) / 18) * 18;
    for (let k = 0; k < trackPosts.length; k++) {
      const pair = trackPosts[k];
      const d = firstPostD + k * 18;
      if (d < 0) {
        pair.left.visible = false;
        pair.right.visible = false;
        continue;
      }
      const bank = trackBankSlope(d);
      const isCorner = Math.abs(bank) > 0.012;
      const ptL = trackWorldPoint(d, -ROAD_WIDTH / 2 - 1.15, 0.05);
      const ptR = trackWorldPoint(d, ROAD_WIDTH / 2 + 1.15, 0.05);
      pair.left.visible = true;
      pair.right.visible = true;
      pair.left.position.set(ptL.x, ptL.y, ptL.z);
      pair.right.position.set(ptR.x, ptR.y, ptR.z);
      pair.left.rotation.set(0, ptL.yaw, ptL.bankAngle);
      pair.right.rotation.set(0, ptR.yaw, ptR.bankAngle);
      if (pair.capMatL) pair.capMatL.color.setHex(isCorner && bank > 0 ? 0xffb703 : 0xe2f3ff);
      if (pair.capMatR) pair.capMatR.color.setHex(isCorner && bank < 0 ? 0xffb703 : 0xe2f3ff);
    }
  }
  if (groundPlaneMesh && groundPlaneMesh.userData.tex) {
    const gx = Math.round(camera.position.x / 25) * 25;
    const gz = Math.round((camera.position.z - 120) / 25) * 25;
    groundPlaneMesh.position.set(gx, -0.82, gz);
  }
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
  applyHorizonEnvironment(themeKey, theme);

  ambientLight.color.setHex(theme.ambientColor);
  sunLight.color.setHex(theme.sunColor);
  sunLight.intensity = theme.sunIntensity;

  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  trackRibbons.length = 0;
  trackPosts.length = 0;
  sceneryObjects.length = 0;
  distantHills.length = 0;
  skyClouds.length = 0;
  windStreaks.length = 0;
  groundPlaneMesh = null;

  skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(460, 28, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyDomeTexture(themeKey, theme),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
  );
  worldGroup.add(skyDome);

  horizonGroup = new THREE.Group();
  worldGroup.add(horizonGroup);

  const sunCorona = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshBasicMaterial({
      map: WORLD_TEXTURES.sunHaloTex,
      color: 0xfff8de,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      fog: false
    })
  );
  sunCorona.position.set(120, 114, -360);
  horizonGroup.add(sunCorona);

  const cloudTint = new THREE.Color(0xffffff).lerp(new THREE.Color(theme.sunColor), 0.14);
  const cloudPlaneGeo = new THREE.PlaneGeometry(1, 1);
  const cloudCount = isMobileDevice ? 8 : 12;
  for (let c = 0; c < cloudCount; c++) {
    const cloudMat = new THREE.MeshBasicMaterial({
      map: WORLD_TEXTURES.softCloudTex,
      color: cloudTint,
      transparent: true,
      opacity: 0.72 + (c % 3) * 0.08,
      depthWrite: false,
      fog: false
    });
    const cl = new THREE.Mesh(cloudPlaneGeo, cloudMat);
    const cx = -240 + (c / cloudCount) * 480 + (Math.random() - 0.5) * 30;
    const cy = 54 + (c % 4) * 11;
    const cz = -240 - (c % 3) * 42;
    const w = 68 + (c % 3) * 24;
    const h = w * 0.44;
    cl.position.set(cx, cy, cz);
    cl.scale.set(w, h, 1);
    cl.userData.drift = 0.014 + (c % 3) * 0.005;
    horizonGroup.add(cl);
    skyClouds.push(cl);
  }

  const groundTexClone = WORLD_TEXTURES.groundTex.clone();
  groundTexClone.wrapS = groundTexClone.wrapT = THREE.RepeatWrapping;
  groundTexClone.repeat.set(36, 36);
  groundTexClone.needsUpdate = true;
  groundPlaneMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: theme.terrainColor, map: groundTexClone, roughness: 0.96 })
  );
  groundPlaneMesh.rotation.x = -Math.PI / 2;
  groundPlaneMesh.position.set(0, -0.82, -120);
  groundPlaneMesh.userData.tex = groundTexClone;
  if (!isMobileDevice) groundPlaneMesh.receiveShadow = true;
  worldGroup.add(groundPlaneMesh);

  if (themeKey === "river" || themeKey === "island") {
    const waterCol = themeKey === "island" ? 0x16a8d6 : 0x267cb5;
    const waterMat = new THREE.MeshStandardMaterial({ color: waterCol, roughness: 0.22, metalness: 0.35 });
    createTrackRibbon([[16, -0.68], [56, -0.68]], waterMat, 0.04, [0, 1]);
    if (themeKey === "island") {
      createTrackRibbon([[-56, -0.68], [-16, -0.68]], waterMat, 0.04, [0, 1]);
    }
  }

  const shoulderMat = new THREE.MeshStandardMaterial({ color: theme.terrainColor, map: WORLD_TEXTURES.groundTex, roughness: 0.94 });
  createTrackRibbon([[-22, -0.86], [-11.5, -0.02], [-10.9, 0.05]], shoulderMat, 0.05, [0, 0.45, 0.55], { receiveShadow: true });
  createTrackRibbon([[10.9, 0.05], [11.5, -0.02], [22, -0.86]], shoulderMat, 0.05, [0.45, 0.55, 1.0], { receiveShadow: true });

  const roadSurfMat = new THREE.MeshStandardMaterial({
    map: getRoadSurfaceTexture(themeKey, theme),
    roughness: theme.roadRoughness,
    metalness: 0.12
  });
  createTrackRibbon(
    [[-ROAD_WIDTH / 2, 0.02], [ROAD_WIDTH / 2, 0.02]],
    roadSurfMat,
    1 / 18,
    [0, 1],
    { receiveShadow: true, recomputeNormals: true }
  );

  const curbMat = new THREE.MeshStandardMaterial({
    map: getCurbTexture(themeKey),
    roughness: 0.72,
    metalness: 0.05
  });
  createTrackRibbon(
    [[-ROAD_WIDTH / 2 - 1.15, 0.01], [-ROAD_WIDTH / 2 - 0.1, 0.08], [-ROAD_WIDTH / 2 + 0.05, 0.025]],
    curbMat,
    0.16,
    [0, 0.5, 1],
    { receiveShadow: true }
  );
  createTrackRibbon(
    [[ROAD_WIDTH / 2 - 0.05, 0.025], [ROAD_WIDTH / 2 + 0.1, 0.08], [ROAD_WIDTH / 2 + 1.15, 0.01]],
    curbMat,
    0.16,
    [0, 0.5, 1],
    { receiveShadow: true }
  );

  const railMat = new THREE.MeshStandardMaterial({
    map: getRailTexture(themeKey, theme),
    roughness: themeKey === "island" || themeKey === "river" ? 0.36 : 0.68,
    metalness: themeKey === "island" || themeKey === "river" ? 0.45 : 0.10
  });
  createTrackRibbon(
    [[-ROAD_WIDTH / 2 - 1.55, 0.0], [-ROAD_WIDTH / 2 - 1.55, 0.72], [-ROAD_WIDTH / 2 - 1.18, 0.72], [-ROAD_WIDTH / 2 - 1.18, 0.04]],
    railMat,
    0.12,
    [0, 0.35, 0.65, 1],
    { recomputeNormals: true }
  );
  createTrackRibbon(
    [[ROAD_WIDTH / 2 + 1.18, 0.04], [ROAD_WIDTH / 2 + 1.18, 0.72], [ROAD_WIDTH / 2 + 1.55, 0.72], [ROAD_WIDTH / 2 + 1.55, 0.0]],
    railMat,
    0.12,
    [0, 0.35, 0.65, 1],
    { recomputeNormals: true }
  );

  const stemGeo = new THREE.CylinderGeometry(0.05, 0.075, 0.84, 7);
  const capGeo = new THREE.BoxGeometry(0.18, 0.18, 0.08);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.5 });
  for (let k = 0; k < 20; k++) {
    const capMatL = new THREE.MeshBasicMaterial({ color: 0xe2f3ff });
    const capMatR = new THREE.MeshBasicMaterial({ color: 0xe2f3ff });
    const makePost = (side, capMat) => {
      const p = new THREE.Group();
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.42;
      p.add(stem);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(-side * 0.06, 0.74, 0);
      p.add(cap);
      worldGroup.add(p);
      return p;
    };
    trackPosts.push({
      left: makePost(-1, capMatL),
      right: makePost(1, capMatR),
      capMatL,
      capMatR
    });
  }

  const SCENERY_COUNT = isMobileDevice ? 54 : 84;
  const scenerySpanZ = 420;
  const sceneryStepZ = scenerySpanZ / SCENERY_COUNT;
  for (let i = 0; i < SCENERY_COUNT; i++) {
    let item;
    const rand = Math.random();

    if (themeKey === "country") {
      if (rand < 0.16) item = createCow();
      else if (rand < 0.30) item = createDeer();
      else if (rand < 0.41) item = createWindmill();
      else if (rand < 0.52) item = createFarmCabin();
      else if (rand < 0.61) item = createHayBale();
      else if (rand < 0.72) item = createFlowerBush();
      else if (rand < 0.84) item = createGrassTuft(themeKey);
      else if (rand < 0.90) item = createRoadFence();
      else item = createTree();
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
    const offset = ROAD_WIDTH / 2 + 2.6 + Math.random() * 6.5;
    const zPos = 24 - i * sceneryStepZ;
    const dAt = raceDistance - zPos / Z_PER_METER;
    const groundOffsetY = offset > 21 ? -0.78 : -0.82 * Math.min(1, (offset - 11.4) / 10.6);
    item.position.set(trackCurve(dAt) + side * offset, groundOffsetY, zPos);
    item.userData = {
      ...item.userData,
      trackX: side * offset,
      baseY: groundOffsetY,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmount: item.name === "" ? 0.014 + Math.random() * 0.014 : 0.008
    };
    item.rotation.y = (side === 1 ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 0.4;
    worldGroup.add(item);
    sceneryObjects.push(item);
  }

  const HILL_COUNT = isMobileDevice ? 10 : 15;
  for (let h = 0; h < HILL_COUNT; h++) {
    const hill = createDistantHill(themeKey, theme.fogColor);
    const hx = -250 + (h / (HILL_COUNT - 1)) * 500 + (Math.random() - 0.5) * 24;
    const hz = -215 - (h % 3) * 55 - Math.random() * 20;
    hill.position.set(hx, -0.8, hz);
    hill.rotation.y = (Math.random() - 0.5) * 1.1;
    horizonGroup.add(hill);
    distantHills.push(hill);
  }

  const streakGeo = new THREE.BoxGeometry(0.025, 0.025, 3.2);
  const streakCount = isMobileDevice ? 8 : 14;
  for (let s = 0; s < streakCount; s++) {
    const smat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0 });
    const st = new THREE.Mesh(streakGeo, smat);
    const side = s % 2 === 0 ? -1 : 1;
    st.userData.sideOffset = side * (1.7 + Math.random() * 5.2);
    st.userData.baseY = 0.28 + Math.random() * 1.45;
    st.position.set(st.userData.sideOffset, st.userData.baseY, -Math.random() * 48);
    worldGroup.add(st);
    windStreaks.push(st);
  }

  updateTrackRibbons();
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
  finishDistance = Number(document.querySelector("#raceLength")?.value || 5000);
  document.querySelector("#raceProgressBar").style.width = "0%";
  document.querySelector("#raceProgressText").textContent = `0 / ${finishDistance} m`;
  cameraTrauma = 0;

  carPhysics.x = 0;
  carPhysics.heading = 0;
  carPhysics.steerAngle = 0;
  carPhysics.roll = 0;
  carPhysics.rollVel = 0;
  carPhysics.pitch = 0;
  carPhysics.boostSpeed = 0;

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
  if (liveScoreEl) liveScoreEl.textContent = "0";
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
    const enemyPt = trackWorldPoint(-z / Z_PER_METER, laneX, 0);
    enemy.group.position.set(enemyPt.x, enemyPt.y, enemyPt.z);
    enemy.laneX = laneX;
    enemy.speed = 0.22 + Math.random() * 0.16;
    scene.add(enemy.group);
    traffic.push(enemy);
  });
  updateTrackRibbons();
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
  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  syncBestHud();

  finishSpeed = Math.round(currentSpeed * 90);
  const lines = [
    `完成 ${Math.floor(finishDistance / 100) / 10} km 赛道！`,
    `得分：<b style="color:#ffd166;font-size:24px">${finalScore}</b>　用时：<b style="color:#61efff;font-size:22px">${formatRaceTime(raceTime)}</b>`,
    `冲线速度：<b>${finishSpeed} km/h</b>　最高速度：<b>${Math.round(maxSpeed)} km/h</b>`,
    `最高得分：<b>${best} 分</b>　最快用时：<b>${formatRaceTime(bestTime)}</b>`
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
  syncBestHud();
  title.textContent = "旅程结束";
  message.innerHTML = `本次得分：<b style="color:#ffd166;font-size:24px">${finalScore}</b>　用时：<b style="color:#61efff;font-size:22px">${formatRaceTime(raceTime)}</b><br>避开车流，再挑战一次吧。`;
  document.querySelector("#start").textContent = "重新启程";
  setMenuVisible(true);

  document.body.classList.remove("crash-flash");
  requestAnimationFrame(() => document.body.classList.add("crash-flash"));

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
  const toRadarX = (worldX) => cx + (worldX - baseTrackX - carPhysics.x) * m2px * 1.15;
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
    const px = cx + (trackCurve(d) - baseTrackX - carPhysics.x) * m2px * 1.15;
    const py = toRadarY(d - raceDistance);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "rgba(85, 195, 255, 0.25)";
  ctx.lineWidth = Math.max(7, ROAD_WIDTH * m2px * 1.15);
  ctx.stroke();
  ctx.strokeStyle = "rgba(185, 240, 255, 0.58)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 终点线若在雷达视野内则画出金黄格子标
  const finishRel = total - raceDistance;
  if (finishRel >= -30 && finishRel <= viewRangeAhead + 20) {
    const fx = cx + (trackCurve(total) - baseTrackX - carPhysics.x) * m2px * 1.15;
    const fy = toRadarY(finishRel);
    ctx.fillStyle = "#ffd65c";
    ctx.fillRect(fx - 8, fy - 2, 16, 4);
  }

  // 金币散点
  ctx.fillStyle = "rgba(255, 214, 92, 0.78)";
  coins.forEach(c => {
    const relA = -c.position.z / Z_PER_METER;
    if (relA < -40 || relA > viewRangeAhead) return;
    const rx = toRadarX(c.position.x);
    const ry = toRadarY(relA);
    ctx.beginPath();
    ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // 前后方 AI 车流红/橙点
  traffic.forEach(enemy => {
    const relA = -enemy.group.position.z / Z_PER_METER;
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
function update(dtScale = 1) {
  if (!running) return;
  frame++;
  const expEase = (rate) => 1 - Math.pow(1 - rate, dtScale);

  // 1. 速度与渐进加减速（帧率无关平滑步进，彻底告别高刷屏/波动帧跳帧）
  const accelerating = keys[keymap.throttle] || keys.ArrowUp || keys.throttle;
  const braking = brakeHeld || keys.brake || keys[keymap.brake] || keys.ArrowDown;
  const wantsBoost = !braking && (keys[keymap.boost] || keys.ShiftLeft || keys.ShiftRight || keys.boost) && nitro > 0;

  if (wantsBoost && !boosting) {
    sound.playBoost();
    triggerHaptic(40);
  }
  boosting = wantsBoost;
  nitro = boosting ? Math.max(0, nitro - 0.7 * dtScale) : Math.min(100, nitro + 0.12 * dtScale);
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
          spark.position.set(pPos.x + nx + (Math.random() - 0.5) * 0.15, pPos.y + 0.28 + (Math.random() - 0.5) * 0.1, pPos.z + 1.35);
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

  const MAX_SPEED = 200 / 90;
  if (braking) {
    baseSpeed = Math.max(0, baseSpeed - 0.016 * dtScale);
    boosting = false;
  } else if (accelerating || throttleHeld) {
    baseSpeed = Math.min(MAX_SPEED, baseSpeed + 0.012 * dtScale);
  } else {
    baseSpeed = Math.max(0, baseSpeed - 0.0055 * dtScale);
    if (baseSpeed < 0.008) baseSpeed = 0;
  }
  const targetBoostAdd = boosting ? 0.35 : 0;
  carPhysics.boostSpeed += (targetBoostAdd - carPhysics.boostSpeed) * expEase(boosting ? 0.14 : 0.06);
  currentSpeed = Math.min(MAX_SPEED, baseSpeed + carPhysics.boostSpeed);
  const stepMeters = ((currentSpeed * 90) / 3.6 / 60) * dtScale;
  raceDistance += stepMeters;
  const progress = Math.min(1, raceDistance / finishDistance);
  const gatePt = trackWorldPoint(finishDistance, 0, 0);
  finishGate.position.set(gatePt.x, gatePt.y, gatePt.z);
  finishGate.rotation.y = gatePt.yaw;
  const raceBar = document.querySelector("#raceProgressBar");
  const raceText = document.querySelector("#raceProgressText");
  if (raceBar) raceBar.style.width = `${progress * 100}%`;
  if (raceText) raceText.textContent = `${Math.floor(raceDistance)} / ${finishDistance} m`;
  if (raceDistance >= finishDistance) {
    finishRace();
    return;
  }

  score += currentSpeed * 0.45 * dtScale;
  raceTime += (1 / 60) * dtScale;
  maxSpeed = Math.max(maxSpeed, currentSpeed * 90);

  nitroBar.style.width = `${nitro}%`;
  scoreEl.textContent = formatRaceTime(raceTime);
  if (liveScoreEl) liveScoreEl.textContent = String(Math.floor(score));
  speedEl.textContent = Math.floor(currentSpeed * 90);

  sound.updateEngine(currentSpeed, boosting);

  const turnLeft = steeringMode === "buttons" && (keys[keymap.left] || keys.ArrowLeft || keys.KeyA || keys.left);
  const turnRight = steeringMode === "buttons" && (keys[keymap.right] || keys.ArrowRight || keys.KeyD || keys.right);
  const dt = (1 / 60) * dtScale;

  let targetSteer = 0;
  if (turnLeft) targetSteer = -PHYS.maxSteerAngle;
  else if (turnRight) targetSteer = PHYS.maxSteerAngle;
  else if (steeringMode === "tilt" && Math.abs(tiltSteer) > 0.08) {
    targetSteer = tiltSteer * PHYS.maxSteerAngle;
  }

  const steerSpeed = targetSteer === 0 ? PHYS.steerReturn : PHYS.steerSpeed;
  carPhysics.steerAngle += (targetSteer - carPhysics.steerAngle) * Math.min(1.0, steerSpeed * dt * 3.5);

  const angularVelocity = (currentSpeed / PHYS.wheelbase) * Math.tan(carPhysics.steerAngle) * 0.8;
  carPhysics.heading += angularVelocity * dt * 5.0;

  if (targetSteer === 0) {
    carPhysics.heading += (0 - carPhysics.heading) * Math.min(1.0, PHYS.headingAlignRate * dt * 3.2);
  }

  carPhysics.heading = Math.max(-PHYS.maxHeading, Math.min(PHYS.maxHeading, carPhysics.heading));

  const forwardVel = currentSpeed * 17.0;
  const lateralVel = forwardVel * Math.sin(carPhysics.heading);
  carPhysics.x += lateralVel * dt;
  carPhysics.x = applyLaneKeeping(carPhysics.x, targetSteer, currentSpeed, dt);

  const nowMs = Date.now();
  const maxBound = ROAD_WIDTH / 2 - 1.8;
  if (carPhysics.x < -maxBound) {
    carPhysics.x = -maxBound;
    carPhysics.heading = Math.abs(carPhysics.heading) * 0.35;
    carPhysics.steerAngle *= 0.25;
    if (nowMs >= barrierImpactCooldownUntil) {
      barrierImpactCooldownUntil = nowMs + 360;
      sound.playBarrierHit();
      showImpact("左侧护栏碰撞", player.group.position.x, player.group.position.z);
    }
  }
  if (carPhysics.x > maxBound) {
    carPhysics.x = maxBound;
    carPhysics.heading = -Math.abs(carPhysics.heading) * 0.35;
    carPhysics.steerAngle *= 0.25;
    if (nowMs >= barrierImpactCooldownUntil) {
      barrierImpactCooldownUntil = nowMs + 360;
      sound.playBarrierHit();
      showImpact("右侧护栏碰撞", player.group.position.x, player.group.position.z);
    }
  }

  const rollAcc = -lateralVel * 0.002 - Math.pow(PHYS.suspensionOmega, 2) * carPhysics.roll - 2 * PHYS.suspensionZeta * PHYS.suspensionOmega * carPhysics.rollVel;
  carPhysics.rollVel += rollAcc * dt * 2.0;
  carPhysics.roll += carPhysics.rollVel * dt * 2.0;
  carPhysics.roll = Math.max(-PHYS.maxRollAngle, Math.min(PHYS.maxRollAngle, carPhysics.roll));

  const speedRatio = Math.min(1, currentSpeed / (200 / 90));
  const targetPitch = (braking && currentSpeed > 0.04)
    ? -0.045
    : (boosting ? 0.036 : ((accelerating || throttleHeld) && currentSpeed > 0.04 ? 0.020 : 0));
  carPhysics.pitch += (targetPitch - carPhysics.pitch) * expEase(0.14);

  if (player.group.userData.tailMat) {
    player.group.userData.tailMat.color.setHex(braking ? 0xff4e5c : 0xb81628);
  }

  const playerPt = trackWorldPoint(raceDistance, carPhysics.x, 0);
  player.group.position.x = playerPt.x;
  player.group.position.y = playerPt.y + Math.sin(raceDistance * 1.45) * 0.009 * speedRatio + Math.abs(carPhysics.rollVel) * 0.018;
  player.group.position.z = playerPt.z;
  player.group.rotation.y = -carPhysics.heading + playerPt.yaw;
  player.group.rotation.x = carPhysics.pitch + Math.sin(raceDistance * 1.1) * 0.003 * speedRatio;
  player.group.rotation.z = -carPhysics.roll + playerPt.bankAngle;

  player.wheels[0].steer.rotation.y = -carPhysics.steerAngle;
  player.wheels[1].steer.rotation.y = -carPhysics.steerAngle;
  player.wheels[2].steer.rotation.y = 0;
  player.wheels[3].steer.rotation.y = 0;

  const wheelSpin = currentSpeed * 0.46 * dtScale;
  player.wheels.forEach(w => {
    w.spin.rotation.x += wheelSpin;
  });

  updateTrackRibbons();

  const moveZ = stepMeters * Z_PER_METER;
  distantHills.forEach(hill => {
    hill.position.z += moveZ * 0.045;
    if (hill.position.z > -185) {
      hill.position.z -= 185;
    }
  });
  skyClouds.forEach(cl => {
    cl.position.x += (cl.userData.drift || 0.016) * dtScale;
    if (cl.position.x > 265) cl.position.x = -265;
  });

  const streakAlpha = currentSpeed * 90 > 65 ? Math.min(0.60, (currentSpeed * 90 - 65) / 145 + (boosting ? 0.25 : 0)) : 0;
  const trackNowX = playerPt.x;
  windStreaks.forEach(st => {
    st.material.opacity = streakAlpha;
    if (streakAlpha <= 0.01) return;
    st.position.z += moveZ * 2.2 + 0.4 * dtScale;
    if (st.position.z > 8) {
      st.position.z = -40 - Math.random() * 20;
    }
    st.position.x = trackNowX + st.userData.sideOffset;
    st.position.y = playerPt.y + st.userData.baseY;
    st.scale.z = 0.75 + speedRatio * 1.45 + (boosting ? 0.8 : 0);
  });

  const scenerySpanZ = 420;
  sceneryObjects.forEach(item => {
    item.position.z += moveZ;
    if (item.position.z > 24) {
      item.position.z -= scenerySpanZ;
    }
    const vis = item.position.z > -395 && item.position.z < 24;
    item.visible = vis;
    if (!vis) return;
    const distAtItem = raceDistance - item.position.z / Z_PER_METER;
    item.position.x = item.userData.trackX + trackCurve(distAtItem);
    const sway = item.userData && item.userData.swayPhase;
    if (sway !== undefined) {
      item.rotation.z = Math.sin(frame * 0.035 + sway) * (item.userData.swayAmount || 0.01);
      item.position.y = (item.userData.baseY || 0) + Math.sin(frame * 0.025 + sway) * 0.012;
    }
    if (item.userData && item.userData.fan) {
      item.userData.fan.rotation.z += 0.02 * dtScale;
    }
  });

  const trafficCfg = getTrafficConfig();
  const trafficSpeedRatio = Math.max(0, Math.min(1, (currentSpeed * 90) / TRAFFIC_REFERENCE_SPEED_KMH));
  const trafficInterval = trafficCfg.idleIntervalMs -
    (trafficCfg.idleIntervalMs - trafficCfg.fastIntervalMs) * trafficSpeedRatio;
  if (nowMs - lastTrafficAt > trafficInterval) {
    lastTrafficAt = nowMs;
    spawnTraffic();
  }
  if (Math.random() < 0.03 * dtScale) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    const enemyAdvanceDist = ((enemy.speed * 90) / 3.6 / 60) * dtScale * 0.72;
    enemy.group.position.z += (stepMeters - enemyAdvanceDist) * Z_PER_METER;
    const enemyRoadDistance = raceDistance - enemy.group.position.z / Z_PER_METER;
    const enemyVisible = enemy.group.position.z > -420 && enemy.group.position.z < 24;
    enemy.group.visible = enemyVisible;
    if (enemyVisible) {
      const ePt = trackWorldPoint(enemyRoadDistance, enemy.laneX, 0);
      enemy.group.position.x = ePt.x;
      enemy.group.position.y = ePt.y + Math.sin(frame * 0.11 + i) * 0.01;
      enemy.group.rotation.y = ePt.yaw;
      enemy.group.rotation.z = ePt.bankAngle + Math.sin(frame * 0.08 + i) * 0.005;
      enemy.wheels.forEach(w => {
        w.spin.rotation.x += 0.35 * dtScale;
      });
    }

    const ePos = enemy.group.position;
    if (vehiclesOverlap(player, enemy) && registerPlayerImpact(enemy, nowMs)) {
      baseSpeed = reduceSpeedAfterImpact(baseSpeed);
      showImpact("碰撞 · 减速", ePos.x, ePos.z, true);
      sound.playCrash();
      cameraTrauma = Math.min(1, cameraTrauma + 0.45);
    }

    if (enemy.group.position.z > 25 || enemy.group.position.z < -650) {
      scene.remove(enemy.group);
      traffic.splice(i, 1);
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += moveZ;
    const cDist = raceDistance - coin.position.z / Z_PER_METER;
    const cPt = trackWorldPoint(cDist, coin.userData.laneX, 0.85);
    coin.position.x = cPt.x;
    coin.position.y = cPt.y;
    coin.rotation.z += 0.05 * dtScale;

    const dx = Math.abs(player.group.position.x - coin.position.x);
    const dz = Math.abs((player.group.position.z - 1.3) - coin.position.z);

    if (dx < 1.9 && dz < 2.5) {
      score += 50;
      nitro = Math.min(100, nitro + 25);
      createSpark(coin.position.x, coin.position.y + 0.15, coin.position.z, 0xffd700, 14);
      sound.playCoin();
      triggerHaptic(25);
      scene.remove(coin);
      coins.splice(i, 1);
    } else if (coin.position.z > 25) {
      scene.remove(coin);
      coins.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.x += p.vx * dtScale;
    p.mesh.position.y += p.vy * dtScale;
    p.mesh.position.z += p.vz * dtScale;
    p.life -= 0.04 * dtScale;
    p.mesh.scale.setScalar(Math.max(0.01, p.life));
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  if (frame % (isMobileDevice ? 6 : 4) === 0) drawMinimap();
  const camFraming = getCameraFraming();
  const carWorldX = playerPt.x;
  const lookAheadPt = trackWorldPoint(raceDistance + 20, carPhysics.x * 0.45, 0);
  const roadYaw = -playerPt.yaw;
  const followDist = camFraming.baseZ + (accelerating || throttleHeld ? 0.40 : 0) + (boosting ? 0.82 : 0) - (braking && currentSpeed > 0.04 ? 0.48 : 0) + speedRatio * 1.15;
  const targetCamX = carWorldX - Math.sin(roadYaw) * followDist - carPhysics.heading * 1.35;
  const targetCamY = playerPt.y + camFraming.baseY + (boosting ? -0.20 : 0) + speedRatio * 0.26;
  const targetCamZ = playerPt.z + Math.cos(roadYaw) * followDist;

  camera.position.x += (targetCamX - camera.position.x) * expEase(0.145);
  camera.position.y += (targetCamY - camera.position.y) * expEase(0.14);
  camera.position.z += (targetCamZ - camera.position.z) * expEase(0.14);

  sunLight.position.set(carWorldX + 26, 52, 22);
  sunLight.target.position.set(carWorldX, 0, -24);
  sunLight.target.updateMatrixWorld();

  if (skyDome) skyDome.position.set(camera.position.x, 0, camera.position.z);
  if (horizonGroup) {
    horizonGroup.position.x = camera.position.x * 0.88;
    horizonGroup.position.z = camera.position.z;
  }

  if (cameraTrauma > 0) {
    const p = Math.pow(cameraTrauma, 2);
    camera.position.x += (Math.random() - 0.5) * 1.2 * p;
    camera.position.y += (Math.random() - 0.5) * 0.9 * p;
    cameraTrauma = Math.max(0, cameraTrauma - 0.045 * dtScale);
  }

  const targetFov = camFraming.baseFov + (boosting ? 6.2 : 0) + speedRatio * 3.0;
  camera.fov += (targetFov - camera.fov) * expEase(0.08);
  camera.updateProjectionMatrix();

  const lookTargetX = lookAheadPt.x * 0.72 + carWorldX * 0.28 + carPhysics.heading * 5.2;
  const lookTargetZ = lookAheadPt.z;
  camera.lookAt(lookTargetX, playerPt.y + camFraming.lookY, lookTargetZ);
  const targetBank = -carPhysics.heading * 0.075 - carPhysics.roll * 0.30 + playerPt.bankAngle * 0.45;
  cameraBank += (targetBank - cameraBank) * expEase(0.15);
  camera.rotateZ(cameraBank);
}

// ═══════════════════════════════════════
// 渲染循环与音频状态自动保持
// ═══════════════════════════════════════
const FIXED_STEP_MS = 1000 / 60;
let previousFrameTime = 0;

function render(timestamp = performance.now()) {
  if (!previousFrameTime) previousFrameTime = timestamp;
  const elapsed = Math.min(Math.max(1, timestamp - previousFrameTime), 36);
  previousFrameTime = timestamp;
  const dtScale = elapsed / FIXED_STEP_MS;
  update(dtScale);
  if (!running) {
    skyClouds.forEach(cl => {
      cl.position.x += (cl.userData.drift || 0.016) * dtScale * 0.65;
      if (cl.position.x > 265) cl.position.x = -265;
    });
    if (skyDome) skyDome.position.set(camera.position.x, 0, camera.position.z);
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
  // 自己的名字在榜上用黄色标出来，方便一眼找到
  const myName = (playerNameInput?.value.trim() || playerName || localStorage.getItem("neonRacerName") || "").toLowerCase();
  leaderboardList.innerHTML = scores.map((item, index) => {
    const mine = myName && String(item.name || "").trim().toLowerCase() === myName;
    const scoreText = `${Number(item.score) || 0}分`;
    const timeText = item.time ? ` · ${formatRaceTime(Number(item.time))}` : "";
    return `<li${mine ? ' class="mine"' : ""}><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span>${scoreText}${timeText}</span></li>`;
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
  if (prev && Number(prev.time) > 0 && Number(prev.time) < entry.time) {
    entry.time = prev.time;
  }
  const kept = list.filter(item => String(item.name || "").trim().toLowerCase() !== key);
  kept.push(entry);
  kept.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(a.time) - Number(b.time)));
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.0 : 1.5));
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
syncAudioUI();
layoutMinimap();
window.addEventListener("resize", () => layoutMinimap());
loadLeaderboard();
render();

