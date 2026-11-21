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
const autoSteerOff = document.querySelector("#autoSteerOff");
const autoSteerOn = document.querySelector("#autoSteerOn");
const autoSteerHelp = document.querySelector("#autoSteerHelp");
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
const AUTO_STEER_STORAGE = "racerAutoSteer";
let autoSteeringEnabled = localStorage.getItem(AUTO_STEER_STORAGE) === "1";
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
    if (typeof player !== "undefined" && player.group?.userData) {
      if (player.group.userData.nitroFlames) player.group.userData.nitroFlames.visible = false;
      if (player.group.userData.burnoutMarks) player.group.userData.burnoutMarks.visible = false;
    }
    if (typeof carPhysics !== "undefined") {
      carPhysics.burningOut = false;
      carPhysics.burnoutCharge = 0;
      carPhysics.braking = false;
    }
    if (typeof setCarBrakeLights === "function" && typeof player !== "undefined") {
      setCarBrakeLights(player.group, false, false);
    }
    if (typeof sound !== "undefined" && sound) sound.updateBurnout(false, 0);
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
const DEFAULT_CAR_COLOR = "#4a525d";
const CAR_COLOR_NAMES = {
  "#4a525d": "岩石灰",
  "#68727e": "岩石灰",
  "#eef2f7": "珍珠白",
  "#d6222c": "烈焰红",
  "#1d6ef5": "赛道蓝",
  "#1e232b": "曜石黑",
  "#eb5e18": "熔岩橙",
  "#eab322": "鎏金黄",
  "#178f59": "苍翠绿"
};
let selectedCarColor = localStorage.getItem("racerCarColor") || DEFAULT_CAR_COLOR;
if (!/^#[0-9a-fA-F]{6}$/.test(selectedCarColor)) selectedCarColor = DEFAULT_CAR_COLOR;

function applyCarColor(colorHex) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(String(colorHex || "")) ? String(colorHex).toLowerCase() : DEFAULT_CAR_COLOR;
  selectedCarColor = hex;
  localStorage.setItem("racerCarColor", hex);
  if (typeof player !== "undefined" && player.group?.userData?.paintMaterial) {
    player.group.userData.paintMaterial.color.set(hex);
  }
  const nameEl = document.querySelector("#carColorName");
  if (nameEl) nameEl.textContent = CAR_COLOR_NAMES[hex] || "自定义";
  document.querySelectorAll("#carColorSwatches .color-swatch").forEach(btn => {
    const active = String(btn.dataset.color || "").toLowerCase() === hex;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
  });
}

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
    // 默认开启播放，可随时点击右上角喇叭手动关闭；支持音乐声与特效声独立调音量
    this.enabled = localStorage.getItem("racerAudioEnabled") !== "0";
    const savedMusic = Number(localStorage.getItem("racerMusicVolume"));
    const savedSfx = Number(localStorage.getItem("racerSfxVolume"));
    this.musicVolume = Number.isFinite(savedMusic) ? Math.max(0, Math.min(1, savedMusic)) : 0.75;
    this.sfxVolume = Number.isFinite(savedSfx) ? Math.max(0, Math.min(1, savedSfx)) : 0.85;
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
    this.burnoutGain = null;
    this.burnoutFilter = null;
  }

  setMusicVolume(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    this.musicVolume = clamped;
    localStorage.setItem("racerMusicVolume", String(clamped));
    if (this.bgmAudio) {
      try { this.bgmAudio.volume = this.enabled ? clamped : 0; } catch (e) {}
    }
    syncVolumeSlidersUI();
  }

  setSfxVolume(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    this.sfxVolume = clamped;
    localStorage.setItem("racerSfxVolume", String(clamped));
    if (this.crashAudio) {
      try { this.crashAudio.volume = 0.28 * clamped; } catch (e) {}
    }
    if (this.coinAudio) {
      try { this.coinAudio.volume = 0.8 * clamped; } catch (e) {}
    }
    if (this.ctx && this.engineGain && clamped <= 0.001) {
      try { this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04); } catch (e) {}
    }
    if (this.ctx && this.burnoutGain && clamped <= 0.001) {
      try { this.burnoutGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04); } catch (e) {}
    }
    syncVolumeSlidersUI();
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
      this.bgmAudio.volume = this.musicVolume;
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
      this.crashAudio.volume = 0.28 * this.sfxVolume;
    }
    if (!this.coinAudio) {
      this.coinAudio = document.querySelector("#coinAudio") || new Audio("assets/coin.wav");
      this.coinAudio.volume = 0.8 * this.sfxVolume;
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

      // 烧胎摩擦尖啸与橡胶烟气白噪声通道
      const bufLen = Math.floor(this.ctx.sampleRate * 1.2);
      const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) ch[i] = Math.random() * 2 - 1;
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1450, this.ctx.currentTime);
      bp.Q.setValueAtTime(3.2, this.ctx.currentTime);
      this.burnoutFilter = bp;
      this.burnoutGain = this.ctx.createGain();
      this.burnoutGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      noiseSrc.connect(bp);
      bp.connect(this.burnoutGain);
      this.burnoutGain.connect(this.ctx.destination);
      noiseSrc.start();
    } catch (e) {}
  }

  updateBurnout(active, intensity = 0) {
    if (!this.ctx || !this.burnoutGain || !this.burnoutFilter) return;
    try {
      const paused = typeof raceSync !== "undefined" && raceSync.paused;
      const on = Boolean(running && this.enabled && !paused && active && this.sfxVolume > 0.005);
      const targetGain = on ? Math.max(0.0001, (0.048 + intensity * 0.058) * this.sfxVolume) : 0.0001;
      this.burnoutGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.06);
      if (on) {
        this.burnoutFilter.frequency.setTargetAtTime(1250 + intensity * 720, this.ctx.currentTime, 0.08);
      }
    } catch (e) {}
  }

  updateEngine(speed, isBoosting) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    try {
      const paused = typeof raceSync !== "undefined" && raceSync.paused;
      const active = Boolean(running && this.enabled && !paused && this.sfxVolume > 0.005);
      const targetGain = active ? Math.max(0.0001, 0.058 * this.sfxVolume) : 0.0001;
      this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
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
        this.bgmAudio.volume = this.musicVolume;
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
    if (this.ctx && this.burnoutGain) {
      try { this.burnoutGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05); } catch (e) {}
    }
  }

  playCrash() {
    if (!this.enabled || this.sfxVolume <= 0.005) return;
    this.ensureContext();
    if (this.crashAudio) {
      try {
        if (this.crashAudio.readyState > 0) this.crashAudio.currentTime = 0;
        this.crashAudio.volume = Math.min(1, 0.28 * this.sfxVolume);
        this.crashAudio.play().catch(() => {});
      } catch (e) {}
    }
    // 柔和低频碰撞反馈音（随特效音量缩放）
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
        gain.gain.setValueAtTime(Math.max(0.001, 0.22 * this.sfxVolume), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } catch(e) {}
    }
  }

  playBarrierHit() {
    if (!this.enabled || this.sfxVolume <= 0.005) return;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
        gain.gain.setValueAtTime(Math.max(0.001, 0.16 * this.sfxVolume), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } catch (e) {}
    }
  }

  playCoin() {
    if (!this.enabled || this.sfxVolume <= 0.005) return;
    this.ensureContext();
    if (this.coinAudio) {
      try {
        if (this.coinAudio.readyState > 0) this.coinAudio.currentTime = 0;
        this.coinAudio.volume = Math.min(1, 0.8 * this.sfxVolume);
        this.coinAudio.play().catch(() => {});
      } catch (e) {}
    }
  }

  playBoost() {
    if (!this.enabled || this.sfxVolume <= 0.005) return;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "running") {
      try {
        const now = this.ctx.currentTime + 0.01;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.35);
        gain.gain.setValueAtTime(Math.max(0.001, 0.30 * this.sfxVolume), now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
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
      if (this.burnoutGain && this.ctx) {
        this.burnoutGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      }
    }
    return this.enabled;
  }
}

const sound = new MusicEngine();

function syncVolumeSlidersUI() {
  const mPct = Math.round(sound.musicVolume * 100);
  const sPct = Math.round(sound.sfxVolume * 100);
  [["#musicVolSlider", "#musicVolVal", mPct], ["#popMusicVol", "#popMusicVal", mPct],
   ["#sfxVolSlider", "#sfxVolVal", sPct], ["#popSfxVol", "#popSfxVal", sPct]].forEach(([sId, vId, pct]) => {
    const sl = document.querySelector(sId);
    const vl = document.querySelector(vId);
    if (sl && Number(sl.value) !== pct) sl.value = String(pct);
    if (vl) vl.textContent = `${pct}%`;
  });
}

(function bindAudioAndColorUI() {
  syncVolumeSlidersUI();
  ["#musicVolSlider", "#popMusicVol"].forEach(id => {
    const el = document.querySelector(id);
    if (!el) return;
    el.addEventListener("input", () => {
      sound.ensureContext();
      sound.setMusicVolume(Number(el.value) / 100);
      if (sound.enabled && sound.musicVolume > 0 && sound.bgmAudio && sound.bgmAudio.paused && running) {
        sound.startBGM();
      }
    });
  });
  ["#sfxVolSlider", "#popSfxVol"].forEach(id => {
    const el = document.querySelector(id);
    if (!el) return;
    el.addEventListener("input", () => {
      sound.ensureContext();
      sound.setSfxVolume(Number(el.value) / 100);
    });
  });
  const mixerToggle = document.querySelector("#mixerToggle");
  const volumePopover = document.querySelector("#volumePopover");
  if (mixerToggle && volumePopover) {
    mixerToggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      volumePopover.classList.toggle("hidden");
    });
    volumePopover.addEventListener("click", (ev) => ev.stopPropagation());
    document.addEventListener("click", () => volumePopover.classList.add("hidden"));
  }
  document.querySelectorAll("#carColorSwatches .color-swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      applyCarColor(btn.dataset.color);
          });
  });
})();

// 静音/开启状态同步到界面（音乐与特效音默认开启）
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
    audioToggle.title = on ? "关闭音乐音效" : "开启音乐音效";
  }
  if (soundStatus) {
    soundStatus.textContent = on
      ? (isPlaying ? `🔊 正在播放：${trackLabel}` : `🔊 音乐与特效音已启用 · 轻触屏幕播放：${track.title}`)
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
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = !isMobileDevice;   // 手机端关阴影，帧率优先
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let cameraBank = 0;
let cameraYaw = 0;
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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.28);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff1d2, 1.85);
sunLight.position.set(36, 44, 24);
sunLight.castShadow = !isMobileDevice;
sunLight.shadow.mapSize.set(isMobileDevice ? 512 : 2048, isMobileDevice ? 512 : 2048);
sunLight.shadow.camera.left = -68;
sunLight.shadow.camera.right = 68;
sunLight.shadow.camera.top = 78;
sunLight.shadow.camera.bottom = -38;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.025;
scene.add(sunLight);
scene.add(sunLight.target);

const skyLight = new THREE.HemisphereLight(0xbbe6ff, 0x3a642c, 0.62);
scene.add(skyLight);

// 参照写实光照三点补光：暖地面反光 + 逆向天光冷补光，彻底告别死板阴影与塑料感
const groundBounceLight = new THREE.DirectionalLight(0xb5956c, 0.28);
groundBounceLight.position.set(-22, -30, -18);
scene.add(groundBounceLight);

const skyFillLight = new THREE.DirectionalLight(0x94c2e8, 0.24);
skyFillLight.position.set(-34, 28, -28);
scene.add(skyFillLight);

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
const TRACK_SLICE_STEP = 2.5; // 每 2.5m 一个横断面，弯道圆润无折角
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
    [0.04, 0],       // 起跑直道（96m）
    [0.13, 42],      // 流畅高速右大弯
    [0.23, -38],     // 优雅左切长 S 弯
    [0.34, 68],      // 大半径马蹄右扫弯
    [0.43, 8],       // 顺畅出弯衔接
    [0.55, -72],     // 长弧 U 型左发卡弯
    [0.66, 46],      // 连续外抛反打弯
    [0.77, -64],     // 高速宽幅左掠弯
    [0.89, 44],      // 末段冲刺大右弧弯
    [0.95, 0],       // 平直进线冲刺区
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
  // 向右转弯 (curv > 0) 时路面左高右低，形成 QQ 飞车丝滑弯道倾斜感
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
    skyColor: 0x3b92ee,
    fogColor: 0xaad8f4,
    fogDensity: 0.00165,
    ambientColor: 0xf0f6ff,
    hemiGroundColor: 0x3a6b2c,
    sunColor: 0xfff1cc,
    sunIntensity: 1.62,
    roadColor: 0x262c35,
    roadRoughness: 0.58,
    terrainColor: 0x62a446,
    stripeColor: 0xffffff,
    railColor: 0x8b5a2b
  },
  island: {
    name: "逃离荒岛",
    cnName: "🏝️ 逃离荒岛",
    skyColor: 0x1ca2f5,
    fogColor: 0x8be2ef,
    fogDensity: 0.00165,
    ambientColor: 0xe2f8ff,
    hemiGroundColor: 0x9c8652,
    sunColor: 0xffefb2,
    sunIntensity: 1.68,
    roadColor: 0x2c3440,
    roadRoughness: 0.54,
    terrainColor: 0xebd398,
    stripeColor: 0xffea00,
    railColor: 0xdbe6f0
  },
  jungle: {
    name: "丛林狂飙",
    cnName: "🌴 丛林狂飙",
    skyColor: 0x1f6246,
    fogColor: 0x3c7e60,
    fogDensity: 0.00235,
    ambientColor: 0xaddfc8,
    hemiGroundColor: 0x193f24,
    sunColor: 0xe6ffd4,
    sunIntensity: 1.58,
    roadColor: 0x221f1a,
    roadRoughness: 0.66,
    terrainColor: 0x265e3b,
    stripeColor: 0x98e6ab,
    railColor: 0x543824
  },
  river: {
    name: "沿河峡谷",
    cnName: "🌊 沿河峡谷",
    skyColor: 0x367fd6,
    fogColor: 0x9fd2f0,
    fogDensity: 0.00175,
    ambientColor: 0xe2eef8,
    hemiGroundColor: 0x6b4532,
    sunColor: 0xfff4dc,
    sunIntensity: 1.64,
    roadColor: 0x242b35,
    roadRoughness: 0.56,
    terrainColor: 0xb06c4b,
    stripeColor: 0xffffff,
    railColor: 0x56a8cc
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
  const makeSmokePuffTex = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    const lobes = [
      [64, 64, 52, "rgba(235,240,248,0.82)"],
      [48, 56, 36, "rgba(255,255,255,0.68)"],
      [80, 58, 34, "rgba(220,228,238,0.62)"],
      [64, 78, 34, "rgba(195,204,216,0.52)"]
    ];
    lobes.forEach(([x, y, r, col]) => {
      const rg = g.createRadialGradient(x, y, r * 0.12, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(0.55, col.replace(/[\d.]+\)$/, "0.26)"));
      rg.addColorStop(1, "rgba(225,232,242,0)");
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
    });
    return new THREE.CanvasTexture(c);
  };
  const makeHeatGlowTex = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    const rg = g.createRadialGradient(64, 64, 8, 64, 64, 60);
    rg.addColorStop(0, "rgba(255,220,120,0.95)");
    rg.addColorStop(0.38, "rgba(255,95,24,0.68)");
    rg.addColorStop(0.75, "rgba(220,30,10,0.22)");
    rg.addColorStop(1, "rgba(180,10,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };
  return {
    asphaltTex: makeAsphalt(),
    groundTex: makeGround(),
    carShadowTex: makeCarShadow(),
    softCloudTex: makeSoftCloudTex(),
    sunHaloTex: makeSunHaloTex(),
    smokePuffTex: makeSmokePuffTex(),
    heatGlowTex: makeHeatGlowTex(),
    woodTex: (() => {
      const S = 256;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = "#b88d5c";
      g.fillRect(0, 0, S, S);
      // 仿 Operation Ironhold 写实木板拼接、木节、纤维纹与底部潮湿暗角
      const boards = 8, bh = S / boards;
      for (let b = 0; b < boards; b++) {
        const v = ((b * 17) % 24) - 12;
        g.fillStyle = `rgb(${182 + v},${142 + v},${94 + v})`;
        g.fillRect(0, b * bh, S, bh - 2);
        g.fillStyle = "rgba(42,24,10,0.58)";
        g.fillRect(0, b * bh + bh - 2, S, 2);
        g.fillStyle = "rgba(255,232,198,0.16)";
        g.fillRect(0, b * bh, S, 1.5);
        for (let k = 0; k < 18; k++) {
          g.strokeStyle = k % 2 === 0 ? "rgba(78,48,20,0.28)" : "rgba(232,196,148,0.14)";
          g.lineWidth = 1.1;
          const y = b * bh + 3 + ((k * 7) % Math.max(4, bh - 6));
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(S * 0.33, y + (k % 3) - 1, S * 0.66, y - (k % 3) + 1, S, y);
          g.stroke();
        }
        const kx = ((b * 73 + 29) % (S - 36)) + 18;
        const ky = b * bh + bh * 0.5;
        const rg = g.createRadialGradient(kx, ky, 0, kx, ky, 7);
        rg.addColorStop(0, "rgba(48,28,12,0.75)");
        rg.addColorStop(1, "rgba(80,52,24,0)");
        g.fillStyle = rg;
        g.beginPath(); g.ellipse(kx, ky, 7, 4.5, 0, 0, Math.PI * 2); g.fill();
      }
      const ao = g.createLinearGradient(0, S * 0.72, 0, S);
      ao.addColorStop(0, "rgba(28,18,10,0)");
      ao.addColorStop(1, "rgba(28,18,10,0.42)");
      g.fillStyle = ao;
      g.fillRect(0, S * 0.72, S, S * 0.28);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
    stoneTex: (() => {
      const S = 256;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = "#5c5954";
      g.fillRect(0, 0, S, S);
      const bh = 28;
      for (let r = 0, y = 0; y < S; y += bh, r++) {
        const bw = 48;
        for (let x = (r % 2 ? -bw / 2 : 0); x < S; x += bw) {
          const v = (((r * 31 + x * 7) % 36) - 18);
          g.fillStyle = `rgb(${132 + v},${128 + v},${122 + v})`;
          g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
          g.fillStyle = "rgba(255,255,255,0.14)";
          g.fillRect(x + 2, y + 2, bw - 4, 2);
          g.fillStyle = "rgba(25,22,18,0.28)";
          g.fillRect(x + 2, y + bh - 4, bw - 4, 2);
        }
      }
      for (let i = 0; i < 1600; i++) {
        const px = ((Math.sin(i * 19.7) * 9132.1) % 1 + 1) % 1 * S;
        const py = ((Math.sin(i * 41.3) * 4812.7) % 1 + 1) % 1 * S;
        g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.09)" : "rgba(20,18,16,0.14)";
        g.fillRect(px, py, 2, 2);
      }
      const moss = g.createLinearGradient(0, S * 0.72, 0, S);
      moss.addColorStop(0, "rgba(42,58,30,0)");
      moss.addColorStop(1, "rgba(38,52,26,0.48)");
      g.fillStyle = moss;
      g.fillRect(0, S * 0.72, S, S * 0.28);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
    roofTex: (() => {
      const S = 256;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = "#8c2b20";
      g.fillRect(0, 0, S, S);
      for (let r = 0, y = 0; y < S; y += 22, r++) {
        for (let x = (r % 2 ? -12 : 0); x < S; x += 24) {
          const v = ((r * 13 + x * 5) % 24) - 12;
          g.fillStyle = `rgb(${176 + v},${62 + Math.floor(v * 0.5)},${46 + Math.floor(v * 0.4)})`;
          g.fillRect(x + 1, y + 1, 22, 18);
          g.fillStyle = "rgba(42,8,6,0.48)";
          g.fillRect(x, y + 19, 24, 3);
          g.fillStyle = "rgba(255,215,180,0.18)";
          g.fillRect(x + 2, y + 2, 18, 3);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      return t;
    })(),
    barkTex: (() => {
      const W = 128, H = 256;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      g.fillStyle = "#563a28";
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 160; i++) {
        const x = ((Math.sin(i * 17.3) * 4321.1) % 1 + 1) % 1 * W;
        const y = ((Math.sin(i * 39.1) * 2813.7) % 1 + 1) % 1 * H;
        g.fillStyle = i % 3 === 0 ? "rgba(22,12,6,0.48)" : (i % 3 === 1 ? "rgba(128,96,68,0.28)" : "rgba(44,28,16,0.36)");
        g.fillRect(x, y, 3 + (i % 4), 22 + (i % 28));
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
    leafCanopyTex: (() => {
      const S = 256;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const g = c.getContext("2d");
      g.fillStyle = "#2b5e24";
      g.fillRect(0, 0, S, S);
      // 逐层绘制数百片写实叶片明暗层次，让树冠拥有茂密真实枝叶质感而非塑料绿球
      const leafCols = ["#193d18", "#235220", "#2f6b27", "#3d822e", "#569c38", "#74b846"];
      for (let i = 0; i < 620; i++) {
        const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * S;
        const y = ((Math.sin(i * 78.233) * 19341.217) % 1 + 1) % 1 * S;
        const ang = ((i * 2.39996) % (Math.PI * 2));
        const rx = 6 + (i % 7) * 1.4;
        const ry = 3.2 + (i % 4) * 0.9;
        g.save();
        g.translate(x, y);
        g.rotate(ang);
        g.fillStyle = leafCols[Math.min(leafCols.length - 1, Math.floor((i / 620) * leafCols.length))];
        g.beginPath();
        g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
      return t;
    })(),
    licensePlateTex: (() => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 72;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, "#103e96");
      grad.addColorStop(0.5, "#1958c8");
      grad.addColorStop(1, "#103e96");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 72);
      g.strokeStyle = "#e8f2ff";
      g.lineWidth = 4;
      g.strokeRect(4, 4, 248, 64);
      g.fillStyle = "#ffffff";
      g.font = "900 34px 'Microsoft YaHei','Orbitron',sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("京A·GT888", 128, 38);
      return new THREE.CanvasTexture(c);
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
const TERRAIN_TEX_CACHE = new Map();
const WATER_TEX_CACHE = new Map();

function getTerrainTexture(themeKey) {
  if (TERRAIN_TEX_CACHE.has(themeKey)) return TERRAIN_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");

  if (themeKey === "island") {
    g.fillStyle = "#e6cc8f";
    g.fillRect(0, 0, 512, 512);
    // 暖金沙丘波纹与贝壳细砂肌理
    for (let y = 0; y < 512; y += 16) {
      const grad = g.createLinearGradient(0, y, 0, y + 16);
      grad.addColorStop(0, "rgba(255,244,208,0.22)");
      grad.addColorStop(0.5, "rgba(182,146,82,0.16)");
      grad.addColorStop(1, "rgba(255,244,208,0.18)");
      g.fillStyle = grad;
      g.fillRect(0, y, 512, 16);
    }
    for (let i = 0; i < 4800; i++) {
      const x = ((Math.sin(i * 19.31) * 41231.7) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 47.17) * 28913.3) % 1 + 1) % 1 * 512;
      g.fillStyle = i % 3 === 0 ? "rgba(255,250,230,0.30)" : "rgba(155,118,62,0.20)";
      g.fillRect(x, y, 2, 2);
    }
  } else if (themeKey === "river") {
    g.fillStyle = "#a96846";
    g.fillRect(0, 0, 512, 512);
    // 峡谷赤砂岩层理与碎石质感
    for (let i = 0; i < 36; i++) {
      const x = ((Math.sin(i * 11.7) * 9123.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 23.3) * 5813.7) % 1 + 1) % 1 * 512;
      const r = 34 + (i % 5) * 18;
      const rg = g.createRadialGradient(x, y, 6, x, y, r);
      rg.addColorStop(0, i % 2 === 0 ? "rgba(198,132,88,0.34)" : "rgba(104,54,34,0.30)");
      rg.addColorStop(1, "rgba(169,104,70,0)");
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 4200; i++) {
      const x = ((Math.sin(i * 17.13) * 19132.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 51.71) * 14812.7) % 1 + 1) % 1 * 512;
      g.fillStyle = i % 3 === 0 ? "rgba(230,178,132,0.22)" : "rgba(72,36,22,0.24)";
      g.fillRect(x, y, 3, 2);
    }
  } else if (themeKey === "jungle") {
    g.fillStyle = "#265c38";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 48; i++) {
      const x = ((Math.sin(i * 13.7) * 9123.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 29.3) * 5813.7) % 1 + 1) % 1 * 512;
      const r = 32 + (i % 6) * 16;
      const rg = g.createRadialGradient(x, y, 5, x, y, r);
      rg.addColorStop(0, i % 2 === 0 ? "rgba(76,148,74,0.32)" : "rgba(18,46,24,0.36)");
      rg.addColorStop(1, "rgba(38,92,56,0)");
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5200; i++) {
      const x = ((Math.sin(i * 21.13) * 9132.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 53.71) * 4812.7) % 1 + 1) % 1 * 512;
      g.fillStyle = i % 2 === 0 ? "rgba(115,190,88,0.22)" : "rgba(14,38,18,0.26)";
      g.fillRect(x, y, 2, 5);
    }
  } else {
    // 乡间小路：丰润阳光草甸、浅金向阳草斑、田园耕带与星星点点野花
    g.fillStyle = "#5b9c41";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      g.fillStyle = (y / 64) % 2 === 0 ? "rgba(116,178,66,0.16)" : "rgba(44,98,34,0.14)";
      g.fillRect(0, y, 512, 64);
    }
    for (let i = 0; i < 54; i++) {
      const x = ((Math.sin(i * 15.1) * 9123.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 31.7) * 5813.7) % 1 + 1) % 1 * 512;
      const r = 34 + (i % 6) * 18;
      const rg = g.createRadialGradient(x, y, 4, x, y, r);
      rg.addColorStop(0, i % 3 === 0 ? "rgba(146,198,74,0.34)" : (i % 3 === 1 ? "rgba(52,114,42,0.32)" : "rgba(128,176,68,0.26)"));
      rg.addColorStop(1, "rgba(91,156,65,0)");
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 6500; i++) {
      const x = ((Math.sin(i * 21.13) * 19132.1) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 53.71) * 14812.7) % 1 + 1) % 1 * 512;
      g.fillStyle = i % 3 === 0 ? "rgba(182,226,104,0.26)" : "rgba(38,84,28,0.22)";
      g.fillRect(x, y, 2, 6);
    }
    // 星星点点草甸小雏菊与金黄野花
    for (let i = 0; i < 160; i++) {
      const x = ((Math.sin(i * 37.9) * 31415.9) % 1 + 1) % 1 * 512;
      const y = ((Math.sin(i * 61.3) * 27182.8) % 1 + 1) % 1 * 512;
      g.fillStyle = i % 3 === 0 ? "rgba(255,232,110,0.85)" : (i % 3 === 1 ? "rgba(255,252,240,0.80)" : "rgba(255,156,184,0.72)");
      g.fillRect(x, y, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  applyTexAnisotropy(tex);
  TERRAIN_TEX_CACHE.set(themeKey, tex);
  return tex;
}

function getWaterTexture(themeKey) {
  if (WATER_TEX_CACHE.has(themeKey)) return WATER_TEX_CACHE.get(themeKey);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 256, 0);
  if (themeKey === "island") {
    grad.addColorStop(0.0, "#5ad9eb");
    grad.addColorStop(0.18, "#22b2d8");
    grad.addColorStop(0.65, "#0e80b8");
    grad.addColorStop(1.0, "#095d94");
  } else {
    grad.addColorStop(0.0, "#4ca9d6");
    grad.addColorStop(0.22, "#247cb5");
    grad.addColorStop(0.75, "#195e94");
    grad.addColorStop(1.0, "#124978");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  // 近岸细白浪花边
  g.fillStyle = "rgba(240,252,255,0.55)";
  g.fillRect(0, 0, 8, 512);
  g.fillStyle = "rgba(240,252,255,0.22)";
  g.fillRect(8, 0, 12, 512);
  // 阳光水面碎光涟漪
  for (let i = 0; i < 420; i++) {
    const x = 14 + ((Math.sin(i * 19.7) * 9132.1) % 1 + 1) % 1 * 236;
    const y = ((Math.sin(i * 41.3) * 14812.7) % 1 + 1) % 1 * 512;
    const w = 10 + (i % 4) * 7;
    g.fillStyle = i % 3 === 0 ? "rgba(235,252,255,0.28)" : "rgba(10,48,84,0.18)";
    g.fillRect(x, y, w, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  applyTexAnisotropy(tex);
  WATER_TEX_CACHE.set(themeKey, tex);
  return tex;
}

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

  // 细腻沥青颗粒纹理
  for (let i = 0; i < 6500; i++) {
    const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 512;
    const y = ((Math.sin(i * 78.233) * 19341.217) % 1 + 1) % 1 * 512;
    const delta = ((i * 37) % 28) - 14;
    g.fillStyle = delta >= 0 ? `rgba(255,255,255,${0.015 + (delta % 8) * 0.005})` : `rgba(0,0,0,${0.04 + ((-delta) % 9) * 0.006})`;
    g.fillRect(x, y, 2, 2);
  }

  // 三车道隐约轮胎行驶轨迹，强化路面高速质感
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

  // 两侧实线边线
  const edgeCol = themeKey === "country" ? "#ffd166" : "#eef6ff";
  g.fillStyle = edgeCol;
  g.fillRect(6, 0, 9, 512);
  g.fillRect(497, 0, 9, 512);

  // 两条清晰流畅的车道虚线（每周期双段虚线，弯道随几何顶点无缝贴合变形）
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
  const bCol = "#f8fafc";
  g.fillStyle = bCol;
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = aCol;
  g.fillRect(0, 0, 64, 128);
  // 边缘轻微混凝土压暗，增强立体倒角感
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
  // 护栏亮面棱线 + 反光诱导警示条
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
  const topCol = new THREE.Color(theme.skyColor).multiplyScalar(0.62);
  const midCol = new THREE.Color(theme.skyColor);
  const warmHorizon = new THREE.Color(theme.fogColor).lerp(new THREE.Color(0xfff4d9), 0.32);

  const grad = g.createLinearGradient(0, 0, 0, 340);
  grad.addColorStop(0.0, "#" + topCol.getHexString());
  grad.addColorStop(0.45, "#" + midCol.getHexString());
  grad.addColorStop(0.80, "#" + warmHorizon.getHexString());
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
    grad.addColorStop(0.50, "#fff8ec");
    // 地面反射采用中性深柏油灰，杜绝车身金属漆被草地反射染成泛绿发灰！
    grad.addColorStop(0.54, "#363c46");
    grad.addColorStop(1.0, "#1c2028");
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
      stone: mat({ color: 0xb2b0a8, map: WORLD_TEXTURES.stoneTex, roughness: 0.90 }),
      brick: mat({ color: 0x9b4534, map: WORLD_TEXTURES.roofTex, roughness: 0.86 }),
      woodWall: mat({ color: 0xe8d0ae, map: WORLD_TEXTURES.woodTex, roughness: 0.80 }),
      woodDark: mat({ color: 0x523420, map: WORLD_TEXTURES.barkTex, roughness: 0.86 }),
      cabinRoof: mat({ color: 0xc84330, map: WORLD_TEXTURES.roofTex, roughness: 0.64 }),
      windowGlow: mat({ color: 0xffe7a8, emissive: 0xffb703, emissiveIntensity: 0.72, roughness: 0.22 }),
      windowFrame: mat({ color: 0xf8f6f0, roughness: 0.45 }),
      millTower: mat({ color: 0xf0e7d6, map: WORLD_TEXTURES.stoneTex, roughness: 0.80 }),
      millCap: mat({ color: 0x244a3c, map: WORLD_TEXTURES.roofTex, roughness: 0.65 }),
      millSail: mat({ color: 0xfcf6e6, map: WORLD_TEXTURES.woodTex, roughness: 0.72 }),
      bark: mat({ color: 0x70503a, map: WORLD_TEXTURES.barkTex, roughness: 0.92 }),
      leafDark: mat({ color: 0x7aa870, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.86 }),
      leafMid: mat({ color: 0x98c97e, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.82 }),
      leafLight: mat({ color: 0xbce28e, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.78 }),
      pineDark: mat({ color: 0x52805c, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.88 }),
      pineLight: mat({ color: 0x6ea66c, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.82 }),
      palmBark: mat({ color: 0x96754e, map: WORLD_TEXTURES.barkTex, roughness: 0.90 }),
      palmLeaf: mat({ color: 0x5ea668, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.70 }),
      coconut: mat({ color: 0x4b2e19, roughness: 0.85 }),
      hay: mat({ color: 0xe6be5c, map: WORLD_TEXTURES.woodTex, roughness: 0.90 }),
      canyonRock: mat({ color: 0xb56b4d, map: WORLD_TEXTURES.stoneTex, roughness: 0.90 }),
      canyonRockDark: mat({ color: 0x7d4530, map: WORLD_TEXTURES.stoneTex, roughness: 0.94 }),
      bush: mat({ color: 0x8cc272, map: WORLD_TEXTURES.leafCanopyTex, roughness: 0.84 }),
      flowerPink: mat({ color: 0xff6b93, roughness: 0.55 }),
      flowerYellow: mat({ color: 0xffd54f, roughness: 0.55 }),
      lampPole: mat({ color: 0x374151, metalness: 0.75, roughness: 0.35 }),
      lampGlow: mat({ color: 0xfff3c4, emissive: 0xffd166, emissiveIntensity: 0.85, roughness: 0.2 }),
      propShadow: new THREE.MeshBasicMaterial({
        map: WORLD_TEXTURES.carShadowTex,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      })
    },
    geos: {
      sphere: new THREE.SphereGeometry(1, 14, 10),
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
      cone: new THREE.ConeGeometry(1, 1, 8),
      foliage: new THREE.DodecahedronGeometry(1, 1),
      propShadow: (() => {
        const g = new THREE.PlaneGeometry(2, 2);
        g.rotateX(-Math.PI / 2);
        return g;
      })(),
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

function addPropShadow(group, rx, rz = rx) {
  const { mats, geos } = SCENERY_ASSETS;
  const s = new THREE.Mesh(geos.propShadow, mats.propShadow);
  s.scale.set(rx, 1, rz);
  s.position.y = 0.04;
  group.add(s);
}

// 1. 写实呆萌奶牛 (Cow)
function createCow() {
  const cow = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(cow, 1.35, 1.85);

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
  addPropShadow(deer, 1.0, 1.45);

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

// 3. 写实田园农庄木屋（半木结构 + 石砌地基 + 门廊 + 四面田字暖光窗 + 砖砌烟囱）
function createFarmCabin() {
  const cabin = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  cabin.scale.setScalar(0.82);
  addPropShadow(cabin, 4.4, 4.0);

  const base = new THREE.Mesh(geos.box, mats.stone);
  base.scale.set(6.5, 0.56, 5.5);
  base.position.y = 0.28;
  cabin.add(base);

  const walls = new THREE.Mesh(geos.box, mats.woodWall);
  walls.scale.set(6.0, 3.3, 5.0);
  walls.position.y = 2.18;
  cabin.add(walls);

  // 外露深色原木立柱与水平横梁（写实欧式农舍半木框架）
  [[-3.0, -2.5], [3.0, -2.5], [-3.0, 2.5], [3.0, 2.5]].forEach(([px, pz]) => {
    const post = new THREE.Mesh(geos.box, mats.woodDark);
    post.scale.set(0.28, 3.4, 0.28);
    post.position.set(px, 2.18, pz);
    cabin.add(post);
  });
  [-2.52, 2.52].forEach(bz => {
    const belt = new THREE.Mesh(geos.box, mats.woodDark);
    belt.scale.set(6.15, 0.18, 0.14);
    belt.position.set(0, 3.72, bz);
    cabin.add(belt);
  });

  const roof = new THREE.Mesh(geos.cabinRoof, mats.cabinRoof);
  roof.position.y = 3.75;
  roof.scale.set(1.06, 1.08, 1.06);
  cabin.add(roof);

  const ridge = new THREE.Mesh(geos.box, mats.woodDark);
  ridge.scale.set(0.24, 0.24, 6.05);
  ridge.position.set(0, 6.12, 0);
  cabin.add(ridge);

  const chimney = new THREE.Mesh(geos.box, mats.brick);
  chimney.scale.set(0.76, 1.85, 0.76);
  chimney.position.set(1.55, 5.45, 0.95);
  cabin.add(chimney);
  const chimneyCap = new THREE.Mesh(geos.box, mats.stone);
  chimneyCap.scale.set(0.92, 0.16, 0.92);
  chimneyCap.position.set(1.55, 6.42, 0.95);
  cabin.add(chimneyCap);

  // 正面木门 + 雨棚门廊 + 双木柱 + 石台阶
  const door = new THREE.Mesh(geos.box, mats.woodDark);
  door.scale.set(1.2, 2.2, 0.16);
  door.position.set(0, 1.62, -2.52);
  cabin.add(door);

  const porchRoof = new THREE.Mesh(geos.box, mats.cabinRoof);
  porchRoof.scale.set(2.4, 0.16, 1.35);
  porchRoof.position.set(0, 2.95, -3.05);
  porchRoof.rotation.x = 0.22;
  cabin.add(porchRoof);
  [-0.98, 0.98].forEach(px => {
    const pCol = new THREE.Mesh(geos.box, mats.woodDark);
    pCol.scale.set(0.14, 2.55, 0.14);
    pCol.position.set(px, 1.55, -3.55);
    cabin.add(pCol);
  });

  const step = new THREE.Mesh(geos.box, mats.stone);
  step.scale.set(2.3, 0.28, 1.2);
  step.position.set(0, 0.14, -3.1);
  cabin.add(step);

  // 正面双暖光田字窗 + 窗台花箱
  const addWindow = (wx, wy, wz, rotY = 0) => {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    wg.rotation.y = rotY;
    const frame = new THREE.Mesh(geos.box, mats.windowFrame);
    frame.scale.set(1.18, 1.08, 0.12);
    wg.add(frame);
    const glass = new THREE.Mesh(geos.box, mats.windowGlow);
    glass.scale.set(0.96, 0.86, 0.14);
    wg.add(glass);
    const barV = new THREE.Mesh(geos.box, mats.windowFrame);
    barV.scale.set(0.07, 0.92, 0.16);
    wg.add(barV);
    const barH = new THREE.Mesh(geos.box, mats.windowFrame);
    barH.scale.set(1.0, 0.07, 0.16);
    wg.add(barH);
    const sill = new THREE.Mesh(geos.box, mats.woodDark);
    sill.scale.set(1.26, 0.14, 0.26);
    sill.position.set(0, -0.58, -0.06);
    wg.add(sill);
    cabin.add(wg);
  };
  addWindow(-1.85, 2.32, -2.52, 0);
  addWindow(1.85, 2.32, -2.52, 0);
  // 左右侧墙也开暖光窗，行驶途经任何角度都精致逼真
  addWindow(-3.02, 2.32, -0.8, Math.PI / 2);
  addWindow(-3.02, 2.32, 0.95, Math.PI / 2);
  addWindow(3.02, 2.32, -0.8, -Math.PI / 2);
  addWindow(3.02, 2.32, 0.95, -Math.PI / 2);

  return cabin;
}

// 4. 写实荷兰风车（石砌八角基座 + 环塔木露台 + 瓦顶 + 木格栅帆布四叶）
function createWindmill() {
  const mill = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(mill, 3.6, 3.6);

  const plinth = new THREE.Mesh(geos.cyl, mats.stone);
  plinth.scale.set(2.85, 1.45, 2.85);
  plinth.position.y = 0.72;
  mill.add(plinth);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 2.6, 8.2, 10), mats.millTower);
  tower.position.y = 5.4;
  mill.add(tower);

  // 环绕式木质观景露台与护栏环
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.45, 0.22, 10), mats.woodDark);
  deck.position.y = 4.25;
  mill.add(deck);
  const railRing = new THREE.Mesh(new THREE.TorusGeometry(2.58, 0.06, 6, 16), mats.woodWall);
  railRing.rotation.x = Math.PI / 2;
  railRing.position.y = 4.95;
  mill.add(railRing);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.05, 2.45, 10), mats.millCap);
  cap.position.y = 10.65;
  mill.add(cap);
  const finial = new THREE.Mesh(geos.sphere, mats.hay);
  finial.scale.setScalar(0.22);
  finial.position.y = 11.95;
  mill.add(finial);

  const door = new THREE.Mesh(geos.box, mats.woodDark);
  door.scale.set(1.15, 2.0, 0.35);
  door.position.set(0, 1.05, -2.6);
  mill.add(door);

  [[0, 5.6, -2.02, 0], [0, 7.6, -1.78, 0], [-1.95, 6.4, 0, Math.PI / 2], [1.95, 6.4, 0, -Math.PI / 2]].forEach(([wx, wy, wz, ry]) => {
    const frame = new THREE.Mesh(geos.box, mats.windowFrame);
    frame.scale.set(0.76, 0.90, 0.20);
    frame.position.set(wx, wy, wz);
    frame.rotation.y = ry;
    mill.add(frame);
    const win = new THREE.Mesh(geos.box, mats.windowGlow);
    win.scale.set(0.58, 0.72, 0.24);
    win.position.set(wx, wy, wz);
    win.rotation.y = ry;
    mill.add(win);
  });

  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 9.75, -1.95);

  const hub = new THREE.Mesh(geos.cyl, mats.woodDark);
  hub.scale.set(0.36, 0.85, 0.36);
  hub.rotation.x = Math.PI / 2;
  fanGroup.add(hub);

  for (let i = 0; i < 4; i++) {
    const bHolder = new THREE.Group();
    bHolder.rotation.z = (i * Math.PI) / 2;

    const spar = new THREE.Mesh(geos.box, mats.woodDark);
    spar.scale.set(0.18, 5.6, 0.14);
    spar.position.y = 2.8;
    bHolder.add(spar);

    const sail = new THREE.Mesh(geos.box, mats.millSail);
    sail.scale.set(1.02, 4.25, 0.05);
    sail.position.set(0.56, 3.32, 0.03);
    bHolder.add(sail);

    // 风叶横向木格栅条
    [1.6, 2.5, 3.4, 4.3, 5.2].forEach(ry => {
      const rib = new THREE.Mesh(geos.box, mats.woodDark);
      rib.scale.set(1.12, 0.08, 0.08);
      rib.position.set(0.54, ry, 0.05);
      bHolder.add(rib);
    });

    fanGroup.add(bHolder);
  }
  mill.add(fanGroup);
  mill.userData = { fan: fanGroup };
  return mill;
}

// 5. 写实繁茂阔叶大树（粗壮树根 + 分叉主枝 + 8 簇叶片纹理错落树冠 + 树荫投影）
function createTree() {
  const tree = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(tree, 3.2, 3.2);

  // 粗壮根基与褶皱树干
  const rootFlare = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.82, 1.15, 8), mats.bark);
  rootFlare.position.y = 0.56;
  tree.add(rootFlare);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 3.6, 8), mats.bark);
  trunk.position.y = 2.4;
  tree.add(trunk);

  [[-0.55, 3.7, 0.25, 0.58, 0.2], [0.58, 3.9, -0.22, -0.52, -0.18], [0.1, 4.1, 0.52, -0.12, 0.52]].forEach(([bx, by, bz, rz, rx]) => {
    const branch = new THREE.Mesh(geos.cyl, mats.bark);
    branch.scale.set(0.14, 1.85, 0.14);
    branch.position.set(bx, by, bz);
    branch.rotation.set(rx, 0, rz);
    tree.add(branch);
  });

  // 8 簇多层次自然错落枝叶簇（内暗外亮，彻底消除光滑圆球卡通感）
  const crowns = [
    [0.0, 5.1, 0.0, 1.95, 1.45, mats.leafDark],
    [-1.45, 4.5, 0.55, 1.42, 1.12, mats.leafDark],
    [1.42, 4.65, -0.45, 1.48, 1.15, mats.leafMid],
    [-0.55, 4.7, -1.25, 1.38, 1.08, mats.leafDark],
    [0.65, 4.85, 1.15, 1.35, 1.05, mats.leafMid],
    [-0.82, 5.85, 0.35, 1.28, 1.02, mats.leafMid],
    [0.92, 5.95, -0.25, 1.22, 0.98, mats.leafLight],
    [0.08, 6.65, 0.12, 1.32, 0.95, mats.leafLight]
  ];
  crowns.forEach(([cx, cy, cz, rx, ry, material], idx) => {
    const foliage = new THREE.Mesh(geos.foliage, material);
    foliage.scale.set(rx, ry, rx * (0.9 + (idx % 3) * 0.08));
    foliage.position.set(cx, cy, cz);
    foliage.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
    tree.add(foliage);
  });

  return tree;
}

// 5B. 写实高山云杉 / 松柏（5 层不规则锯齿松枝堆叠，丰富乡村与峡谷林相层次）
function createPineTree() {
  const pine = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(pine, 2.3, 2.3);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 3.2, 7), mats.bark);
  trunk.position.y = 1.6;
  pine.add(trunk);

  const tiers = [
    [2.35, 2.55, 2.2, mats.pineDark],
    [3.65, 2.15, 2.0, mats.pineDark],
    [4.95, 1.72, 1.85, mats.pineLight],
    [6.15, 1.28, 1.65, mats.pineLight],
    [7.25, 0.82, 1.45, mats.leafLight]
  ];
  tiers.forEach(([ty, r, h, mat], idx) => {
    const cone = new THREE.Mesh(geos.cone, mat);
    cone.scale.set(r, h, r);
    cone.position.y = ty;
    cone.rotation.y = idx * 0.65;
    pine.add(cone);
  });
  return pine;
}

// 5C. 中景起伏草丘 / 沙丘 / 岩石土坡（填满公路两侧开阔视野，告别一马平川空地）
function createMeadowKnoll(themeKey) {
  const g = new THREE.Group();
  const col = themeKey === "island" ? 0xd9be80 : (themeKey === "river" ? 0x9b5a3e : (themeKey === "jungle" ? 0x225432 : 0x4b8a38));
  const knollMat = new THREE.MeshStandardMaterial({
    color: col,
    map: getTerrainTexture(themeKey),
    roughness: 0.94
  });
  const m = new THREE.Mesh(SCENERY_ASSETS.geos.sphere, knollMat);
  const w = 12 + Math.random() * 14;
  const h = 2.2 + Math.random() * 3.4;
  m.scale.set(w, h, w * (0.75 + Math.random() * 0.4));
  m.position.y = -0.5;
  g.add(m);
  return g;
}

// 6. 弯曲树干与弧形羽叶椰子树 (Palm)
function createPalm() {
  const palm = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(palm, 2.4, 2.4);

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
  addPropShadow(g, 1.45, 1.35);
  const bale = new THREE.Mesh(geos.hayRoll, mats.hay);
  bale.position.y = 0.95;
  g.add(bale);
  return g;
}

function createCanyonRock() {
  const g = new THREE.Group();
  const { mats, geos } = SCENERY_ASSETS;
  addPropShadow(g, 2.6, 2.2);
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
  addPropShadow(g, 1.45, 1.35);
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
// 对手车顶名字牌（联机真人标识，高对比胶囊底板+昵称，一眼与 AI 车辆区分）
function makeNameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 384, 96);
  const label = String(text || "对手").trim().slice(0, 10) || "对手";
  ctx.font = "700 32px 'Microsoft YaHei','PingFang SC','Rajdhani',sans-serif";
  const textWidth = ctx.measureText(label).width;
  const padX = 24;
  const boxW = Math.min(364, Math.max(84, textWidth + padX * 2));
  const boxH = 52;
  const boxX = (384 - boxW) / 2;
  const boxY = (96 - boxH) / 2;
  const radius = 26;

  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.lineTo(boxX + boxW - radius, boxY);
  ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
  ctx.lineTo(boxX + boxW, boxY + boxH - radius);
  ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
  ctx.lineTo(boxX + radius, boxY + boxH);
  ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
  ctx.lineTo(boxX, boxY + radius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
  ctx.closePath();

  ctx.fillStyle = "rgba(8, 18, 34, 0.72)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(97, 239, 255, 0.85)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#eafcff";
  ctx.fillText(label, 192, 49);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.92, depthTest: true, depthWrite: false })
  );
  sprite.scale.set(2.7, 0.68, 1);
  sprite.position.set(0, 2.08, -1.1);
  return sprite;
}

const CAR_ASSETS = (() => {
  const bodyShape = new THREE.Shape();
  // 车身主体仅构建低趴腰线与肌肉轮拱，让上方全景熏黑玻璃座舱完整显露、告别“实心白块”感
  bodyShape.moveTo(-2.35, 0.22);
  bodyShape.lineTo(2.22, 0.22);
  bodyShape.quadraticCurveTo(2.38, 0.34, 2.26, 0.68);
  bodyShape.quadraticCurveTo(1.94, 0.84, 1.32, 0.86);
  bodyShape.lineTo(-1.38, 0.86);
  bodyShape.quadraticCurveTo(-1.98, 0.78, -2.28, 0.64);
  bodyShape.quadraticCurveTo(-2.46, 0.45, -2.35, 0.22);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.84,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.08,
    bevelSegments: 4
  });
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.translate(-0.92, 0, -1.35);

  // 全景熏黑流线溜背玻璃座舱（高于车身腰线，前后挡风与天幕清晰反射天空与阳光）
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.42, 0.84);
  cabinShape.lineTo(1.32, 0.84);
  cabinShape.quadraticCurveTo(0.96, 1.24, 0.48, 1.36);
  cabinShape.quadraticCurveTo(-0.18, 1.44, -0.76, 1.37);
  cabinShape.quadraticCurveTo(-1.14, 1.15, -1.42, 0.84);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.46,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 3
  });
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.translate(-0.73, 0, -1.35);

  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.30, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.31, 14);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.32, 0.48, 0.055);
  const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.33, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const exhaustGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.16, 12);
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustInnerGeo = new THREE.CylinderGeometry(0.050, 0.050, 0.17, 10);
  exhaustInnerGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.22, 1.95, 10);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.96);

  const archGeo = new THREE.TorusGeometry(0.47, 0.055, 8, 14, Math.PI);
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
    exhaustGeo,
    exhaustInnerGeo,
    flameGeo,
    archGeo,
    discGeo,
    box: new THREE.BoxGeometry(1, 1, 1),
    glassMat: new THREE.MeshStandardMaterial({ color: 0x0b1526, roughness: 0.06, metalness: 0.90 }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x161a20, roughness: 0.55, metalness: 0.38 }),
    carbonMat: new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.38, metalness: 0.48 }),
    chromeMat: new THREE.MeshStandardMaterial({ color: 0xdce4ee, roughness: 0.14, metalness: 0.95 }),
    wellMat: new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.96 }),
    wellGeo: (() => { const g = new THREE.CylinderGeometry(0.48, 0.48, 0.36, 12); g.rotateZ(Math.PI / 2); return g; })(),
    shadowPlaneGeo: new THREE.PlaneGeometry(2.55, 5.15),
    shadowMat: new THREE.MeshBasicMaterial({ map: WORLD_TEXTURES.carShadowTex, transparent: true, depthWrite: false, opacity: 0.78 }),
    tireMat: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.88 }),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xbac4d4, metalness: 0.90, roughness: 0.20 }),
    hubMat: new THREE.MeshStandardMaterial({ color: 0x262b34, metalness: 0.8, roughness: 0.32 }),
    caliperMat: new THREE.MeshStandardMaterial({ color: 0xe62030, roughness: 0.30, metalness: 0.45 }),
    hlMat: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdaf4ff, emissiveIntensity: 1.6, roughness: 0.1 }),
    drlMat: new THREE.MeshBasicMaterial({ color: 0xd4f8ff }),
    tailMat: new THREE.MeshStandardMaterial({ color: 0xc21426, emissive: 0x8f0815, emissiveIntensity: 0.65, roughness: 0.2 }),
    reverseMat: new THREE.MeshBasicMaterial({ color: 0xeef5ff }),
    amberMat: new THREE.MeshBasicMaterial({ color: 0xffa62b }),
    brakeCenterMat: new THREE.MeshBasicMaterial({ color: 0xff2838 }),
    plateMat: new THREE.MeshBasicMaterial({ map: WORLD_TEXTURES.licensePlateTex }),
    flameOuterMat: new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameInnerMat: new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false }),
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
      metalness: 0.42
    });
    TRAFFIC_PAINT_MATS.set(colorHex, m);
  }
  return m;
}

// 统一驱动主尾灯 + 高位刹车灯 + 立体红光晕与地面红反光（巡航暗红立体，刹车瞬间刺眼爆亮！）
function setCarBrakeLights(carGroup, braking, burningOut = false) {
  if (!carGroup || !carGroup.userData) return;
  const ud = carGroup.userData;
  const active = Boolean(braking || burningOut);
  if (ud.tailMat) {
    if (ud.tailMat.emissive) {
      ud.tailMat.color.setHex(active ? 0xff2432 : 0x7c0c18);
      ud.tailMat.emissive.setHex(active ? 0xff0c1a : 0x52040b);
      ud.tailMat.emissiveIntensity = burningOut ? 3.8 : (active ? 3.2 : 0.45);
    } else {
      ud.tailMat.color.setHex(active ? 0xff2030 : 0x8a0d1a);
    }
  }
  if (ud.thirdBrakeMat) {
    if (ud.thirdBrakeMat.emissive) {
      ud.thirdBrakeMat.color.setHex(active ? 0xff2a36 : 0x2a080c);
      ud.thirdBrakeMat.emissive.setHex(active ? 0xff1020 : 0x120204);
      ud.thirdBrakeMat.emissiveIntensity = burningOut ? 3.8 : (active ? 3.3 : 0.05);
    } else {
      ud.thirdBrakeMat.color.setHex(active ? 0xff2634 : 0x2c090d);
    }
  }
  if (ud.brakeGlows) {
    ud.brakeGlows.visible = active;
    if (active && ud.brakeGlowMat) {
      ud.brakeGlowMat.opacity = burningOut ? 0.92 : 0.78;
    }
  }
  if (ud.brakeGroundGlow) {
    ud.brakeGroundGlow.visible = active;
  }
}

function createTeslaCar(isPlayer = true, colorHex = DEFAULT_CAR_COLOR, isRival = false) {
  const carGroup = new THREE.Group();
  const detailed = isPlayer || isRival;
  const compactAI = !detailed && isMobileDevice;

  // 真实汽车金属清漆材质（适度金属度 + 高清漆光泽，岩石灰/红/蓝/黑发色纯正深邃不发灰发绿）
  const paintMat = detailed
    ? (THREE.MeshPhysicalMaterial
      ? new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.26, metalness: 0.22, clearcoat: 0.92, clearcoatRoughness: 0.10 })
      : new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.26, metalness: 0.26 }))
    : getTrafficPaintMat(colorHex);
  carGroup.userData.paintMaterial = paintMat;

  // 0. 车辆底部真实地面投影贴花（在手机端也能牢牢贴地，消除悬空感）
  const contactShadow = new THREE.Mesh(CAR_ASSETS.shadowPlaneGeo, CAR_ASSETS.shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.032, -1.35);
  carGroup.add(contactShadow);

  // 1. 宽体雕塑流线三厢车身 + 前后宽体翼子板轮肩 + 机盖肌肉筋线
  carGroup.add(new THREE.Mesh(CAR_ASSETS.bodyGeo, paintMat));
  if (detailed) {
    // 前后宽体翼子板肌肉包肩（完整包裹车轮外缘，消除轮眉外凸脱节感）
    [-1, 1].forEach(side => {
      const rearHaunch = new THREE.Mesh(CAR_ASSETS.box, paintMat);
      rearHaunch.scale.set(0.16, 0.44, 1.48);
      rearHaunch.position.set(side * 0.98, 0.56, 0.02);
      carGroup.add(rearHaunch);

      const frontHaunch = new THREE.Mesh(CAR_ASSETS.box, paintMat);
      frontHaunch.scale.set(0.14, 0.38, 1.32);
      frontHaunch.position.set(side * 0.97, 0.53, -2.68);
      carGroup.add(frontHaunch);

      // 车头引擎盖运动导风筋线
      const hoodCrease = new THREE.Mesh(CAR_ASSETS.box, paintMat);
      hoodCrease.scale.set(0.08, 0.035, 1.25);
      hoodCrease.position.set(side * 0.46, 0.87, -2.85);
      hoodCrease.rotation.x = 0.14;
      carGroup.add(hoodCrease);
    });
    // 车顶鲨鱼鳍天线
    const sharkFin = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), CAR_ASSETS.trimMat);
    sharkFin.scale.set(0.6, 1.0, 2.2);
    sharkFin.position.set(0, 1.49, -0.35);
    sharkFin.rotation.x = -0.32;
    carGroup.add(sharkFin);
  }

  // 2. 全景熏黑玻璃座舱 + 车顶镀铬饰条（前挡风 + 天幕 + 侧窗 + 后溜背）
  carGroup.add(new THREE.Mesh(CAR_ASSETS.cabinGeo, CAR_ASSETS.glassMat));

  // 3. 运动碳纤维前铲 / 侧裙风刀 / 蜂窝进气格栅 / GT 鹅颈尾翼 + 4 鳍扩散器 + 四出金属排气管
  const frontSplitter = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.carbonMat);
  frontSplitter.scale.set(1.98, 0.065, 0.36);
  frontSplitter.position.set(0, 0.21, -3.73);
  carGroup.add(frontSplitter);

  const skirt = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  skirt.scale.set(2.04, 0.09, 4.46);
  skirt.position.set(0, 0.21, -1.35);
  carGroup.add(skirt);

  const grille = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  grille.scale.set(1.46, 0.16, 0.12);
  grille.position.set(0, 0.34, -3.77);
  carGroup.add(grille);

  // 雕塑碳纤维 GT 尾翼（空气动力翼面 + 双侧折角端板 + 倾斜鹅颈支架）
  const lipSpoiler = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.carbonMat);
  lipSpoiler.scale.set(1.86, 0.048, 0.24);
  lipSpoiler.position.set(0, 1.04, 0.87);
  lipSpoiler.rotation.x = -0.08;
  carGroup.add(lipSpoiler);

  [-0.93, 0.93].forEach(ex => {
    const endplate = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.carbonMat);
    endplate.scale.set(0.035, 0.16, 0.30);
    endplate.position.set(ex, 1.03, 0.87);
    carGroup.add(endplate);
  });

  [-0.54, 0.54].forEach(sx => {
    const strut = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
    strut.scale.set(0.055, 0.16, 0.14);
    strut.position.set(sx, 0.95, 0.85);
    strut.rotation.x = -0.18;
    carGroup.add(strut);
  });

  // 后碳纤维底部扰流扩散器 + 4 道垂直导流鳍片
  const diffuser = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  diffuser.scale.set(1.76, 0.20, 0.16);
  diffuser.position.set(0, 0.29, 0.96);
  carGroup.add(diffuser);

  if (detailed) {
    [-0.30, -0.10, 0.10, 0.30].forEach(fx => {
      const fin = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.carbonMat);
      fin.scale.set(0.032, 0.17, 0.16);
      fin.position.set(fx, 0.27, 1.03);
      carGroup.add(fin);
    });
    // 四出拉丝镀铬圆形排气管（外镀铬环 + 内黑管膛）
    [-0.68, -0.50, 0.50, 0.68].forEach(ex => {
      const outerPipe = new THREE.Mesh(CAR_ASSETS.exhaustGeo, CAR_ASSETS.chromeMat);
      outerPipe.position.set(ex, 0.28, 1.01);
      carGroup.add(outerPipe);
      const innerPipe = new THREE.Mesh(CAR_ASSETS.exhaustInnerGeo, CAR_ASSETS.wellMat);
      innerPipe.position.set(ex, 0.28, 1.02);
      carGroup.add(innerPipe);
    });
  } else {
    [-0.54, 0.54].forEach(ex => {
      const pipe = new THREE.Mesh(CAR_ASSETS.exhaustGeo, CAR_ASSETS.chromeMat);
      pipe.position.set(ex, 0.28, 1.0);
      carGroup.add(pipe);
    });
  }

  const chromeTrimRear = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
  chromeTrimRear.scale.set(1.22, 0.028, 0.04);
  chromeTrimRear.position.set(0, 0.39, 1.01);
  carGroup.add(chromeTrimRear);

  // 车窗 B/C 柱分隔 + 座椅头枕 + 内衬轮拱（贴合车身不外突）
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
        arch.position.set(side * 0.99, 0.42, wz);
        carGroup.add(arch);

        const well = new THREE.Mesh(CAR_ASSETS.wellGeo, CAR_ASSETS.wellMat);
        well.position.set(side * 0.76, 0.42, wz);
        carGroup.add(well);
      });
    });
  }

  // 4. 空气动力后视镜（含支架+漆盖+暗镜面）+ 隐藏式镀铬门把手 + 前矩阵双透镜 LED 大灯与日行灯眉
  [-1, 1].forEach(side => {
    const mirrorStalk = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
    mirrorStalk.scale.set(0.14, 0.045, 0.07);
    mirrorStalk.position.set(side * 0.96, 0.85, -2.02);
    carGroup.add(mirrorStalk);

    const mirror = new THREE.Mesh(CAR_ASSETS.box, paintMat);
    mirror.scale.set(0.22, 0.10, 0.15);
    mirror.position.set(side * 1.07, 0.88, -2.02);
    carGroup.add(mirror);

    if (!compactAI) {
      const handleF = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
      handleF.scale.set(0.03, 0.032, 0.22);
      handleF.position.set(side * 1.01, 0.73, -1.55);
      carGroup.add(handleF);

      const handleR = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
      handleR.scale.set(0.03, 0.032, 0.22);
      handleR.position.set(side * 1.01, 0.73, -0.58);
      carGroup.add(handleR);

      const hlHousing = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
      hlHousing.scale.set(0.46, 0.15, 0.12);
      hlHousing.position.set(side * 0.68, 0.58, -3.74);
      hlHousing.rotation.y = side * -0.15;
      carGroup.add(hlHousing);

      const drl = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.drlMat);
      drl.scale.set(0.42, 0.028, 0.09);
      drl.position.set(side * 0.68, 0.635, -3.77);
      drl.rotation.y = side * -0.15;
      carGroup.add(drl);
    }

    const hl = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.hlMat);
    hl.scale.set(0.36, 0.075, 0.10);
    hl.position.set(side * 0.68, 0.56, -3.77);
    hl.rotation.y = side * -0.15;
    carGroup.add(hl);
  });

  // 5. 精细 3D 立体贯穿式 LED 尾灯组 + 双侧羽翼灯刃 + 倒车白灯 + 转向琥珀灯 + 高位刹车灯 + 刹车红光晕！
  const tailMat = detailed
    ? new THREE.MeshStandardMaterial({ color: 0x7c0c18, emissive: 0x52040b, emissiveIntensity: 0.45, roughness: 0.18 })
    : CAR_ASSETS.tailMat;
  carGroup.userData.tailMat = tailMat;

  const thirdBrakeMat = detailed
    ? new THREE.MeshStandardMaterial({ color: 0x2a080c, emissive: 0x120204, emissiveIntensity: 0.05, roughness: 0.2 })
    : CAR_ASSETS.brakeCenterMat;
  carGroup.userData.thirdBrakeMat = thirdBrakeMat;

  // 内凹熏黑尾灯底座面板
  const tailHousing = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  tailHousing.scale.set(1.88, 0.18, 0.08);
  tailHousing.position.set(0, 0.68, 0.95);
  carGroup.add(tailHousing);

  // 贯穿式纤细 LED 光带
  const tailBar = new THREE.Mesh(CAR_ASSETS.box, tailMat);
  tailBar.scale.set(1.78, 0.042, 0.09);
  tailBar.position.set(0, 0.70, 0.965);
  carGroup.add(tailBar);

  // 左右 3D C 形羽翼刹车灯组 + 白色倒车灯 + 角落琥珀转向灯
  [-1, 1].forEach(side => {
    const outerC = new THREE.Mesh(CAR_ASSETS.box, tailMat);
    outerC.scale.set(0.38, 0.125, 0.095);
    outerC.position.set(side * 0.72, 0.68, 0.965);
    carGroup.add(outerC);

    if (detailed) {
      // 3 道立体发光垂直羽翼光刃
      [-0.10, 0.0, 0.10].forEach(dx => {
        const finLamp = new THREE.Mesh(CAR_ASSETS.box, tailMat);
        finLamp.scale.set(0.036, 0.135, 0.105);
        finLamp.position.set(side * 0.72 + dx, 0.68, 0.97);
        carGroup.add(finLamp);
      });
      // 下沿倒车白灯与边角转向灯微条
      const revLamp = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.reverseMat);
      revLamp.scale.set(0.18, 0.026, 0.092);
      revLamp.position.set(side * 0.46, 0.625, 0.965);
      carGroup.add(revLamp);

      const turnLamp = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.amberMat);
      turnLamp.scale.set(0.12, 0.032, 0.094);
      turnLamp.position.set(side * 0.86, 0.625, 0.965);
      carGroup.add(turnLamp);
    }
  });

  // 后风挡顶部中央高位刹车灯（刹车时同步耀眼爆亮！）
  const thirdBrake = new THREE.Mesh(CAR_ASSETS.box, thirdBrakeMat);
  thirdBrake.scale.set(0.56, 0.042, 0.06);
  thirdBrake.position.set(0, 1.32, -0.14);
  carGroup.add(thirdBrake);

  // 刹车叠加辉光光晕（左右主尾灯 + 高位刹车灯 + 车尾沥青红光反射）
  if (detailed) {
    const brakeGlowMat = new THREE.SpriteMaterial({
      map: WORLD_TEXTURES.sunHaloTex,
      color: 0xff1624,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const brakeGlows = new THREE.Group();
    [[-0.74, 0.68, 1.06, 1.15, 0.68], [0.74, 0.68, 1.06, 1.15, 0.68], [0, 0.70, 1.06, 1.45, 0.36], [0, 1.32, -0.06, 0.85, 0.32]].forEach(([gx, gy, gz, sx, sy]) => {
      const sp = new THREE.Sprite(brakeGlowMat);
      sp.position.set(gx, gy, gz);
      sp.scale.set(sx, sy, 1);
      brakeGlows.add(sp);
    });
    brakeGlows.visible = false;
    carGroup.add(brakeGlows);
    carGroup.userData.brakeGlows = brakeGlows;
    carGroup.userData.brakeGlowMat = brakeGlowMat;

    const brakeGroundGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.45),
      new THREE.MeshBasicMaterial({
        map: WORLD_TEXTURES.sunHaloTex,
        color: 0xff1624,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    brakeGroundGlow.rotation.x = -Math.PI / 2;
    brakeGroundGlow.position.set(0, 0.046, 1.45);
    brakeGroundGlow.visible = false;
    carGroup.add(brakeGroundGlow);
    carGroup.userData.brakeGroundGlow = brakeGroundGlow;
  }

  // 立体金属尾标 + 内凹真实车牌照框
  const rearEmblem = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.chromeMat);
  rearEmblem.scale.set(0.16, 0.042, 0.04);
  rearEmblem.position.set(0, 0.81, 0.98);
  carGroup.add(rearEmblem);

  const platePocket = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.trimMat);
  platePocket.scale.set(0.62, 0.19, 0.04);
  platePocket.position.set(0, 0.48, 0.965);
  carGroup.add(platePocket);

  const plate = new THREE.Mesh(CAR_ASSETS.box, CAR_ASSETS.plateMat);
  plate.scale.set(0.54, 0.15, 0.045);
  plate.position.set(0, 0.48, 0.985);
  carGroup.add(plate);

  // 6. 4 个五辐风刃轮毂轮组（严丝合缝贴合轮拱，带刹车盘与红色高性能卡钳）
  const wheels = [];
  const wheelPositions = [
    [-0.95, 0.42, -2.7],
    [ 0.95, 0.42, -2.7],
    [-0.95, 0.42,  0.0],
    [ 0.95, 0.42,  0.0]
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

    // 原地烧胎只保留后轮胎印，轮胎热度由柔和烟雾表现
    const burnoutMarks = new THREE.Group();
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x111216,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const skidGeo = new THREE.PlaneGeometry(0.46, 2.35);
    [-0.98, 0.98].forEach(bx => {
      const skid = new THREE.Mesh(skidGeo, skidMat);
      skid.rotation.x = -Math.PI / 2;
      skid.position.set(bx, 0.044, 0.85);
      burnoutMarks.add(skid);
    });
    burnoutMarks.visible = false;
    carGroup.add(burnoutMarks);
    carGroup.userData.burnoutMarks = burnoutMarks;
    carGroup.userData.burnoutSkidMat = skidMat;
  }

  return { group: carGroup, wheels };
}

// 实例化玩家轿跑（默认岩石灰清漆涂装，可在菜单任意切换 8 种车漆）
const player = createTeslaCar(true, selectedCarColor);
scene.add(player.group);
player.group.position.set(0, 0, 0);
applyCarColor(selectedCarColor);

// ═══════════════════════════════════════
// 国潮威严龙头冲线门（盘龙飞檐牌楼 + 3D 雕塑金龙头 + 双龙盘柱盘脊 + 戏珠龙珠 + 宫灯）
// ═══════════════════════════════════════
function createDragonFinishGate() {
  const gate = new THREE.Group();
  const halfSpan = ROAD_WIDTH / 2 + 0.45;

  const redLacquer = new THREE.MeshStandardMaterial({ color: 0xb81920, roughness: 0.34, metalness: 0.22 });
  const deepCrimson = new THREE.MeshStandardMaterial({ color: 0x6e0c12, roughness: 0.42, metalness: 0.18 });
  const darkBronze = new THREE.MeshStandardMaterial({ color: 0x2f1208, roughness: 0.55, metalness: 0.35 });
  const imperialGold = new THREE.MeshStandardMaterial({ color: 0xf4bd38, emissive: 0x452500, emissiveIntensity: 0.32, roughness: 0.26, metalness: 0.72 });
  const brightGold = new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0x6a3c00, emissiveIntensity: 0.42, roughness: 0.20, metalness: 0.82 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xddd6c7, roughness: 0.86, metalness: 0.05 });
  const ivoryMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.28, metalness: 0.1 });
  const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0x4dffdf });
  const mouthEmberMat = new THREE.MeshBasicMaterial({ color: 0xff8c24 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xff2b38, emissive: 0xff1e2a, emissiveIntensity: 0.78, roughness: 0.32 });

  // 1. 地面黑白方格冲线带 + 金边镶条
  const checkCanvas = document.createElement("canvas");
  checkCanvas.width = 512;
  checkCanvas.height = 64;
  const cg = checkCanvas.getContext("2d");
  const cols = 16;
  const rows = 2;
  const cw = 512 / cols;
  const ch = 64 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cg.fillStyle = (r + c) % 2 === 0 ? "#f8fafc" : "#12161f";
      cg.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  cg.fillStyle = "#f5bd38";
  cg.fillRect(0, 0, 512, 4);
  cg.fillRect(0, 60, 512, 4);
  const checkTex = new THREE.CanvasTexture(checkCanvas);
  const checkStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, 2.5),
    new THREE.MeshBasicMaterial({ map: checkTex, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  checkStrip.rotation.x = -Math.PI / 2;
  checkStrip.position.set(0, 0.055, 0);
  gate.add(checkStrip);

  // 2. 左右朱红盘龙柱 + 石雕柱础 + 斗拱 + 垂挂大红宫灯
  const lanterns = [];
  const pillarGeo = new THREE.CylinderGeometry(0.50, 0.60, 7.1, 12);
  const ringGeo = new THREE.TorusGeometry(0.59, 0.08, 8, 16);
  const lanternGeo = new THREE.SphereGeometry(0.44, 12, 10);
  [-1, 1].forEach(side => {
    const px = side * halfSpan;
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 1.9), stoneMat);
    base1.position.set(px, 0.31, 0);
    gate.add(base1);
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 1.45), imperialGold);
    base2.position.set(px, 0.82, 0);
    gate.add(base2);

    const pillar = new THREE.Mesh(pillarGeo, redLacquer);
    pillar.position.set(px, 4.45, 0);
    gate.add(pillar);

    // 缠柱鎏金盘龙纹螺旋浮雕
    const coilPts = [];
    for (let s = 0; s <= 18; s++) {
      const t = s / 18;
      const ang = side * (t * Math.PI * 3.6);
      const r = 0.62 - t * 0.05;
      coilPts.push(new THREE.Vector3(px + Math.cos(ang) * r, 1.35 + t * 5.9, Math.sin(ang) * r));
    }
    const coilMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 28, 0.11, 6, false),
      imperialGold
    );
    gate.add(coilMesh);

    [1.25, 7.35].forEach(ry => {
      const ring = new THREE.Mesh(ringGeo, brightGold);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, ry, 0);
      gate.add(ring);
    });

    // 柱顶斗拱托座
    const cap1 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.40, 1.75), deepCrimson);
    cap1.position.set(px, 7.72, 0);
    gate.add(cap1);
    const cap2 = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.32, 2.0), imperialGold);
    cap2.position.set(px, 8.05, 0);
    gate.add(cap2);

    // 内侧挑梁与发光红宫灯
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 0.16), imperialGold);
    arm.position.set(px - side * 1.15, 6.25, 0);
    gate.add(arm);
    const lanternPivot = new THREE.Group();
    lanternPivot.position.set(px - side * 1.85, 6.2, 0);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), imperialGold);
    cord.position.y = -0.25;
    lanternPivot.add(cord);
    const globe = new THREE.Mesh(lanternGeo, lanternMat);
    globe.scale.set(0.95, 1.18, 0.95);
    globe.position.y = -0.88;
    lanternPivot.add(globe);
    [-0.38, -1.38].forEach(ly => {
      const lCap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.11, 10), brightGold);
      lCap.position.y = ly;
      lanternPivot.add(lCap);
    });
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.52, 6), imperialGold);
    tassel.position.y = -1.70;
    lanternPivot.add(tassel);
    gate.add(lanternPivot);
    lanterns.push(lanternPivot);
  });

  // 3. 朱红鎏金双层牌楼大梁 + 飞檐翘角琉璃金顶 + 连续盘曲双金龙脊身
  const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 1.2, 0.78, 0.92), redLacquer);
  lowerBeam.position.set(0, 6.42, 0);
  gate.add(lowerBeam);
  const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 1.4, 0.15, 1.04), imperialGold);
  lowerTrim.position.set(0, 6.86, 0);
  gate.add(lowerTrim);

  const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 2.4, 0.64, 1.15), deepCrimson);
  upperBeam.position.set(0, 7.92, 0);
  gate.add(upperBeam);

  const mainRoof = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 2.2, 0.40, 2.35), imperialGold);
  mainRoof.position.set(0, 8.42, 0);
  gate.add(mainRoof);
  const ridgeBar = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2 + 2.6, 0.30, 0.50), brightGold);
  ridgeBar.position.set(0, 8.74, 0);
  gate.add(ridgeBar);

  const spineFinGeo = new THREE.ConeGeometry(0.18, 0.62, 5);
  [-1, 1].forEach(side => {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.32, 2.45), imperialGold);
    eave.position.set(side * (halfSpan + 1.65), 8.78, 0);
    eave.rotation.z = side * 0.34;
    gate.add(eave);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.05, 6), brightGold);
    tip.position.set(side * (halfSpan + 2.95), 9.44, 0);
    tip.rotation.z = -side * 0.58;
    gate.add(tip);

    // 两侧流畅盘曲的 3D 金色龙身（CatmullRomCurve3 + TubeGeometry）与背脊金鳍
    const bodyCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * (halfSpan + 1.1), 9.02, -0.05),
      new THREE.Vector3(side * 6.8, 9.85, 0.25),
      new THREE.Vector3(side * 4.5, 9.05, 0.35),
      new THREE.Vector3(side * 2.5, 9.65, 0.15),
      new THREE.Vector3(side * 1.05, 9.25, -0.25)
    ]);
    const bodyMesh = new THREE.Mesh(new THREE.TubeGeometry(bodyCurve, 26, 0.36, 8, false), imperialGold);
    gate.add(bodyMesh);
    for (let k = 1; k <= 7; k++) {
      const pt = bodyCurve.getPoint(k / 8);
      const fin = new THREE.Mesh(spineFinGeo, k % 2 === 0 ? redLacquer : brightGold);
      fin.position.set(pt.x, pt.y + 0.44, pt.z);
      fin.rotation.z = -side * 0.22;
      gate.add(fin);
    }
  });

  // 4. 中央御制匾额「龙 门 终 点」
  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 144;
  const pg = plaqueCanvas.getContext("2d");
  pg.fillStyle = "#4a060b";
  pg.fillRect(0, 0, 512, 144);
  pg.strokeStyle = "#ffd65c";
  pg.lineWidth = 10;
  pg.strokeRect(8, 8, 496, 128);
  pg.strokeStyle = "#d48f18";
  pg.lineWidth = 3;
  pg.strokeRect(20, 20, 472, 104);
  pg.textAlign = "center";
  pg.textBaseline = "middle";
  pg.shadowColor = "rgba(0,0,0,0.88)";
  pg.shadowBlur = 10;
  pg.fillStyle = "#ffe680";
  pg.font = "900 56px 'STKaiti','KaiTi','Microsoft YaHei',serif";
  pg.fillText("龙 门 终 点", 256, 66);
  pg.fillStyle = "#ffd066";
  pg.font = "800 20px 'Orbitron','Rajdhani',sans-serif";
  pg.fillText("DRAGON FINISH GATE", 256, 112);
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
  const plaqueBox = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.62, 0.24), [imperialGold, imperialGold, imperialGold, imperialGold, plaqueMat, plaqueMat]);
  plaqueBox.position.set(0, 6.52, 0.56);
  gate.add(plaqueBox);

  // 5. 冠顶 3D 雕塑威严金龙头（微俯视驶来的赛车，五官深邃立体，龙角/龙须全曲线塑造，毫无遮挡！）
  const dragonHead = new THREE.Group();
  dragonHead.position.set(0, 9.72, 0.55);
  dragonHead.rotation.x = 0.10;

  // 颅骨、颊甲与额顶王冠棱脊
  const cranium = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.72, 2.25), imperialGold);
  dragonHead.add(cranium);
  const foreheadPlate = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.56, 2.05), brightGold);
  foreheadPlate.position.set(0, 0.96, 0.08);
  dragonHead.add(foreheadPlate);
  const foreGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), redLacquer);
  foreGem.position.set(0, 0.92, 1.15);
  dragonHead.add(foreGem);

  // 龙吻上颚与如意鼻头（向 +Z 威严前探）
  const snoutBase = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.95, 1.55), imperialGold);
  snoutBase.position.set(0, -0.06, 1.38);
  dragonHead.add(snoutBase);
  const snoutBridge = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.62, 1.85), brightGold);
  snoutBridge.position.set(0, 0.16, 1.88);
  dragonHead.add(snoutBridge);
  const noseTip = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.54, 0.62), redLacquer);
  noseTip.position.set(0, 0.24, 2.72);
  dragonHead.add(noseTip);
  const noseCurl = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.10, 6, 10, Math.PI), brightGold);
  noseCurl.position.set(0, 0.52, 2.84);
  dragonHead.add(noseCurl);
  [-0.56, 0.56].forEach(nx => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), darkBronze);
    nostril.position.set(nx, 0.14, 2.98);
    dragonHead.add(nostril);
  });

  // 张口咆哮血盆龙口 + 炽焰龙息核 + 锋利上下白獠牙 + 龙须颌髯
  const mouthCavern = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.68, 1.65), darkBronze);
  mouthCavern.position.set(0, -0.70, 1.50);
  dragonHead.add(mouthCavern);
  const mouthEmber = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), mouthEmberMat);
  mouthEmber.position.set(0, -0.74, 1.88);
  dragonHead.add(mouthEmber);
  const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.38, 2.0), imperialGold);
  lowerJaw.position.set(0, -1.16, 1.62);
  lowerJaw.rotation.x = 0.28;
  dragonHead.add(lowerJaw);
  const chinBeard = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.95, 6), brightGold);
  chinBeard.rotation.x = Math.PI;
  chinBeard.position.set(0, -1.65, 2.08);
  dragonHead.add(chinBeard);

  const fangGeo = new THREE.ConeGeometry(0.12, 0.52, 6);
  [-0.64, 0.64, -0.30, 0.30].forEach((fx, idx) => {
    const upperFang = new THREE.Mesh(fangGeo, ivoryMat);
    upperFang.rotation.x = Math.PI;
    upperFang.position.set(fx, -0.66, idx < 2 ? 2.52 : 2.12);
    dragonHead.add(upperFang);
  });
  [-0.52, 0.52].forEach(fx => {
    const lowerFang = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 6), ivoryMat);
    lowerFang.position.set(fx, -1.02, 2.38);
    dragonHead.add(lowerFang);
  });

  // 深邃眼眶 + 发光龙目 + 威严剑眉 + 曲线鹿角龙角 + 飘逸 S 形长龙须
  [-1, 1].forEach(side => {
    // 眼眶深色底衬让发光龙目在白天清晰锐利
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.58, 0.42), darkBronze);
    socket.position.set(side * 0.96, 0.30, 1.06);
    dragonHead.add(socket);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.28, 0.78), brightGold);
    brow.position.set(side * 1.02, 0.66, 1.05);
    brow.rotation.z = -side * 0.28;
    dragonHead.add(brow);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), eyeGlowMat);
    eye.position.set(side * 0.98, 0.28, 1.24);
    dragonHead.add(eye);

    // 脸颊龙鳍
    const cheekFin = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.15, 5), redLacquer);
    cheekFin.position.set(side * 1.65, -0.25, 0.55);
    cheekFin.rotation.z = -side * 1.25;
    dragonHead.add(cheekFin);

    // 弯曲鹿角式鎏金双龙角（TubeGeometry 曲线）
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.85, 0.95, -0.15),
      new THREE.Vector3(side * 1.45, 2.05, -0.55),
      new THREE.Vector3(side * 2.15, 2.85, -0.45),
      new THREE.Vector3(side * 2.48, 3.45, -0.15)
    ]);
    dragonHead.add(new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 14, 0.16, 7, false), brightGold));
    const hornTine = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.05, 6), brightGold);
    hornTine.position.set(side * 1.55, 2.55, -0.15);
    hornTine.rotation.z = -side * 0.18;
    hornTine.rotation.x = 0.35;
    dragonHead.add(hornTine);

    // 飘逸流线 S 形鎏金龙须（TubeGeometry）
    const whiskerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.86, -0.08, 2.45),
      new THREE.Vector3(side * 2.15, -0.22, 2.65),
      new THREE.Vector3(side * 3.15, 0.28, 2.25),
      new THREE.Vector3(side * 3.95, -0.45, 1.85)
    ]);
    dragonHead.add(new THREE.Mesh(new THREE.TubeGeometry(whiskerCurve, 16, 0.08, 6, false), brightGold));
  });

  // 放射状朱红鎏金烈焰龙鬃（13 片皇冠光环）
  const maneGeo = new THREE.ConeGeometry(0.32, 1.85, 6);
  for (let m = 0; m < 13; m++) {
    const ang = -Math.PI * 0.66 + (m / 12) * Math.PI * 1.32;
    const spike = new THREE.Mesh(maneGeo, m % 2 === 0 ? redLacquer : brightGold);
    spike.position.set(Math.sin(ang) * 2.05, Math.cos(ang) * 1.62 + 0.15, -0.48);
    spike.rotation.z = -ang;
    dragonHead.add(spike);
  }

  gate.add(dragonHead);

  // 6. 龙头冠顶正上方悬空发光戏珠金龙珠（绝不遮挡龙头五官！）
  const pearlGroup = new THREE.Group();
  pearlGroup.position.set(0, 12.45, 0.72);
  const pearlCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xfff3a8 })
  );
  pearlGroup.add(pearlCore);
  const pearlOrbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.055, 6, 18),
    brightGold
  );
  pearlOrbit.rotation.x = Math.PI * 0.36;
  pearlGroup.add(pearlOrbit);
  const pearlHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: WORLD_TEXTURES.sunHaloTex,
      color: 0xffc840,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  pearlHalo.scale.set(2.3, 2.3, 1);
  pearlGroup.add(pearlHalo);
  gate.add(pearlGroup);

  gate.userData.pearl = pearlGroup;
  gate.userData.lanterns = lanterns;
  return gate;
}

const finishGate = createDragonFinishGate();
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
  boostSpeed: 0,   // 平滑氮气增益
  burningOut: false,
  burnoutCharge: 0 // 原地烧胎弹射蓄力 (0~1)
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

function applyLaneKeeping(x) {
  // 默认保持完全手动，不强制把车辆吸附到车道中心。
  return x;
}

function getAutoSteeringInput(x, heading) {
  if (!autoSteeringEnabled || currentSpeed < LANE_KEEPING_MIN_SPEED) return 0;
  const laneError = nearestLaneCenter(x) - x;
  const correction = laneError * (LANE_KEEPING_STRENGTH * 0.035) - heading * 0.72;
  const input = Math.max(-0.58, Math.min(0.58, correction));
  return Math.abs(input) < 0.025 ? 0 : input;
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

// 原地烧胎柔和扩散轮胎烟雾（双后轮向外与上方翻卷）
function spawnBurnoutSmokeForCar(carGroup, intensity = 0.8) {
  if (!carGroup || particles.length > (isMobileDevice ? 80 : 145)) return;
  const pos = carGroup.position;
  const yaw = carGroup.rotation.y || 0;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const rearSides = [-1.02, 1.02];
  rearSides.forEach(lx => {
    const lz = 0.10;
    const wx = pos.x + lx * cosY + lz * sinY + (Math.random() - 0.5) * 0.16;
    const wz = pos.z - lx * sinY + lz * cosY + (Math.random() - 0.5) * 0.16;
    const wy = pos.y + 0.20 + Math.random() * 0.10;
    const shade = 222 + Math.floor(Math.random() * 30);
    const mat = new THREE.SpriteMaterial({
      map: WORLD_TEXTURES.smokePuffTex,
      color: (shade << 16) | (shade << 8) | Math.min(255, shade + 6),
      transparent: true,
      opacity: 0.34 + intensity * 0.14,
      depthWrite: false
    });
    const puff = new THREE.Sprite(mat);
    const startScale = 0.52 + Math.random() * 0.24 + intensity * 0.18;
    puff.scale.set(startScale, startScale, 1);
    puff.position.set(wx, wy, wz);
    scene.add(puff);
    // 沿左右轮拱向外翻卷并升腾，不往镜头直冲糊屏
    const backSpeed = 0.032 + Math.random() * 0.045 + intensity * 0.028;
    const sideOut = (lx > 0 ? 1 : -1) * (0.068 + Math.random() * 0.055 + intensity * 0.028);
    particles.push({
      mesh: puff,
      isSmoke: true,
      vx: sinY * backSpeed + cosY * sideOut + (Math.random() - 0.5) * 0.025,
      vy: 0.048 + Math.random() * 0.038 + intensity * 0.024,
      vz: cosY * backSpeed - sinY * sideOut + (Math.random() - 0.5) * 0.025,
      scale: startScale,
      grow: 0.024 + intensity * 0.012,
      maxOpacity: mat.opacity,
      decay: 0.020 + Math.random() * 0.006,
      life: 1.0
    });
  });
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
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(geos.cone, mat);
    blade.scale.set(0.16, 0.65 + (i % 3) * 0.22, 0.16);
    const a = (i / 6) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.20, 0.30, Math.sin(a) * 0.20);
    blade.rotation.z = Math.cos(a) * 0.32;
    blade.rotation.x = Math.sin(a) * 0.32;
    g.add(blade);
  }
  return g;
}

// ═══════════════════════════════════════
// 高密写实 3D 草甸与野花实例化系统（r128 多色分桶 InstancedMesh，2600+ 簇仅 4 次绘制调用，0.04ms 贴合弯道！）
// ═══════════════════════════════════════
const GRASS_SLICES = 110;
const GRASS_SPAN_METERS = 220;
const GRASS_SLICE_STEP = GRASS_SPAN_METERS / GRASS_SLICES;
let grassFieldBuckets = [];

const GRASS_CLUMP_GEO = (() => {
  // 单簇包含 9 片错落弯曲的 3D 草叶面片，远近皆有真实茂密草丛体积感
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const bladeCount = 9;
  for (let b = 0; b < bladeCount; b++) {
    const ang = (b / bladeCount) * Math.PI * 2 + (b % 2) * 0.28;
    const rad = (b % 3) * 0.16 + 0.05;
    const bx = Math.cos(ang) * rad;
    const bz = Math.sin(ang) * rad;
    const lean = 0.22 + (b % 3) * 0.14;
    const dirX = Math.cos(ang + 0.35);
    const dirZ = Math.sin(ang + 0.35);
    const perpX = -dirZ;
    const perpZ = dirX;
    const w = 0.13 + (b % 2) * 0.04;
    const h = 0.68 + (b % 3) * 0.26;
    const baseIdx = positions.length / 3;

    // 底部左右顶点 + 中段左右顶点 + 草尖顶点（微弯弧度）
    positions.push(
      bx - perpX * w, 0.0, bz - perpZ * w,
      bx + perpX * w, 0.0, bz + perpZ * w,
      bx - perpX * (w * 0.6) + dirX * (lean * 0.45), h * 0.52, bz - perpZ * (w * 0.6) + dirZ * (lean * 0.45),
      bx + perpX * (w * 0.6) + dirX * (lean * 0.45), h * 0.52, bz + perpZ * (w * 0.6) + dirZ * (lean * 0.45),
      bx + dirX * lean, h, bz + dirZ * lean
    );
    for (let k = 0; k < 5; k++) {
      normals.push(dirX * 0.35, 0.92, dirZ * 0.35);
    }
    uvs.push(0, 0, 1, 0, 0.2, 0.5, 0.8, 0.5, 0.5, 1);
    indices.push(
      baseIdx, baseIdx + 1, baseIdx + 3,
      baseIdx, baseIdx + 3, baseIdx + 2,
      baseIdx + 2, baseIdx + 3, baseIdx + 4
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
})();

function buildLushGrassField(themeKey) {
  grassFieldBuckets = [];
  const palettes = themeKey === "island"
    ? [0x8ab858, 0xb8c86a, 0xe2c878, 0xffdf6b]
    : (themeKey === "river"
      ? [0x58823c, 0x7a9e48, 0xb88a4c, 0xffcf56]
      : (themeKey === "jungle"
        ? [0x1c5828, 0x2c7834, 0x4ca23e, 0xff7597]
        : [0x2e6e26, 0x469232, 0x6cb840, 0xffe066]));

  const counts = isMobileDevice ? [260, 260, 220, 90] : [780, 780, 680, 260];
  const dummy = new THREE.Object3D();

  palettes.forEach((colHex, bIdx) => {
    const count = counts[bIdx];
    const isFlower = bIdx === 3;
    const mat = new THREE.MeshStandardMaterial({
      color: colHex,
      roughness: isFlower ? 0.55 : 0.78,
      side: THREE.DoubleSide
    });
    const im = new THREE.InstancedMesh(GRASS_CLUMP_GEO, mat, count);
    im.frustumCulled = false;
    if (!isMobileDevice) im.receiveShadow = true;

    const items = [];
    for (let i = 0; i < count; i++) {
      const slice = i % GRASS_SLICES;
      const side = (i + bIdx) % 2 === 0 ? -1 : 1;
      // 紧贴护栏外侧斜坡(11.4m)一直绵延铺满至远方原野(58m)，近处更密集
      const t = Math.pow(Math.random(), 1.35);
      const absX = ROAD_WIDTH / 2 + 1.35 + t * 46.5;
      const localX = side * absX;
      const baseY = absX > 21.8 ? -0.82 : -0.82 * Math.max(0, (absX - 11.1) / 10.7);
      const jitterZ = (Math.random() - 0.5) * (GRASS_SLICE_STEP * Z_PER_METER);
      const sx = (isFlower ? 0.75 : 0.85) + Math.random() * 0.75;
      const sy = (isFlower ? 0.85 : 0.75) + Math.random() * 0.95;
      dummy.position.set(localX, baseY, 0);
      dummy.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.16);
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      items.push({ slice, localX, baseY, jitterZ, offset12: i * 16 + 12, offset13: i * 16 + 13, offset14: i * 16 + 14 });
    }
    im.instanceMatrix.needsUpdate = true;
    worldGroup.add(im);
    grassFieldBuckets.push({ im, items });
  });
}

const grassSliceX = new Float32Array(GRASS_SLICES);
const grassSliceZ = new Float32Array(GRASS_SLICES);
function updateLushGrassField() {
  if (!grassFieldBuckets.length) return;
  const baseSliceIdx = Math.floor((raceDistance - 16) / GRASS_SLICE_STEP);
  for (let s = 0; s < GRASS_SLICES; s++) {
    const worldSlice = baseSliceIdx + s;
    const d = worldSlice * GRASS_SLICE_STEP;
    const wrappedS = ((worldSlice % GRASS_SLICES) + GRASS_SLICES) % GRASS_SLICES;
    grassSliceX[wrappedS] = trackCurve(Math.max(0, d));
    grassSliceZ[wrappedS] = -(d - raceDistance) * Z_PER_METER;
  }
  for (let b = 0; b < grassFieldBuckets.length; b++) {
    const { im, items } = grassFieldBuckets[b];
    const arr = im.instanceMatrix.array;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const sl = it.slice;
      arr[it.offset12] = grassSliceX[sl] + it.localX;
      arr[it.offset13] = it.baseY;
      arr[it.offset14] = grassSliceZ[sl] + it.jitterZ;
    }
    im.instanceMatrix.needsUpdate = true;
  }
}

// 参照 Operation Ironhold 程序化体积云天空着色器（分辨率无关、无极点拉伸、带阳光散射与飘动立体云层）
function createProceduralSkyDome(themeKey, theme) {
  const cVec = (hex) => {
    const c = new THREE.Color(hex);
    return new THREE.Vector3(c.r, c.g, c.b);
  };
  const topCol = new THREE.Color(theme.skyColor).multiplyScalar(0.54);
  const highCol = new THREE.Color(theme.skyColor).multiplyScalar(0.84);
  const midCol = new THREE.Color(theme.skyColor).lerp(new THREE.Color(theme.fogColor), 0.38);
  const lowCol = new THREE.Color(theme.fogColor).lerp(new THREE.Color(0xfff5dc), 0.25);
  const cloudShadow = new THREE.Color(theme.skyColor).lerp(new THREE.Color(0x7c8ea6), 0.55);
  const cloudBright = new THREE.Color(0xffffff).lerp(new THREE.Color(theme.sunColor), 0.18);
  const sunDir = new THREE.Vector3(0.32, 0.36, -0.88).normalize();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: sunDir },
      uZen: { value: cVec(topCol) },
      uHigh: { value: cVec(highCol) },
      uMid: { value: cVec(midCol) },
      uLow: { value: cVec(lowCol) },
      uHaze: { value: cVec(theme.fogColor) },
      uCloudD: { value: cVec(cloudShadow) },
      uCloudL: { value: cVec(cloudBright) }
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uSun, uZen, uHigh, uMid, uLow, uHaze, uCloudD, uCloudL;
      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                   mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.52;
        for (int i = 0; i < 4; i++) {
          s += a * vnoise(p);
          p = p * 2.04 + vec2(13.7, 7.3);
          a *= 0.46;
        }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float sd = max(dot(d, uSun), 0.0);
        float t = clamp(d.y * 1.15, 0.0, 1.0);
        vec3 col = mix(uHaze, uLow, smoothstep(0.0, 0.12, t));
        col = mix(col, uMid, smoothstep(0.12, 0.36, t));
        col = mix(col, uHigh, smoothstep(0.36, 0.70, t));
        col = mix(col, uZen, smoothstep(0.70, 1.0, t));
        col += vec3(0.32, 0.23, 0.12) * pow(sd, 3.0) * 0.55;
        if (d.y > 0.015) {
          vec2 cp = d.xz / max(d.y, 0.09);
          vec2 wind = vec2(uTime * 0.008, uTime * 0.003);
          float n = fbm(cp * 0.95 + wind);
          float cov = smoothstep(0.46, 0.78, n);
          float nSun = fbm((cp + uSun.xz * 0.22) * 0.95 + wind);
          vec3 cc = mix(uCloudD, uCloudL, clamp((n - nSun) * 2.8 + 0.55, 0.0, 1.0));
          float fade = smoothstep(0.02, 0.14, d.y);
          col = mix(col, cc, cov * fade * 0.88);
          col += vec3(0.45, 0.36, 0.20) * pow(sd, 42.0) * (1.0 - cov * 0.5);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  return new THREE.Mesh(new THREE.SphereGeometry(460, 28, 16), mat);
}

// 写实多脊层叠远景高山（岩石/林线主体 + 向阳山脊折面 + 高峰积雪冠顶）
function createDistantHill(themeKey, fogColorHex) {
  const g = new THREE.Group();
  const baseCol = new THREE.Color(
    themeKey === "island" ? 0x6b8c6e :
    themeKey === "jungle" ? 0x1a4a2c :
    themeKey === "river" ? 0x8c4e36 :
    0x356839
  );
  baseCol.lerp(new THREE.Color(fogColorHex), 0.32);
  const mat = new THREE.MeshStandardMaterial({
    color: baseCol,
    map: WORLD_TEXTURES.stoneTex,
    roughness: 0.92,
    flatShading: true
  });
  const ridgeGeo = new THREE.ConeGeometry(1, 1, 6);
  const w = 38 + Math.random() * 32;
  const h = 18 + Math.random() * 24;
  const main = new THREE.Mesh(ridgeGeo, mat);
  main.scale.set(w, h, w * 0.68);
  main.position.y = h * 0.38;
  g.add(main);

  // 高山雪线冠顶（乡间与峡谷高耸主峰带积雪亮顶，极具地平线层次感）
  if ((themeKey === "country" || themeKey === "river") && h > 26) {
    const snowCol = new THREE.Color(0xf4f8ff).lerp(new THREE.Color(fogColorHex), 0.22);
    const snowMat = new THREE.MeshStandardMaterial({ color: snowCol, roughness: 0.7, flatShading: true });
    const snowCap = new THREE.Mesh(ridgeGeo, snowMat);
    snowCap.scale.set(w * 0.36, h * 0.36, w * 0.68 * 0.36);
    snowCap.position.y = h * 0.701;
    g.add(snowCap);
  }

  [-1, 1].forEach((side, idx) => {
    const sub = new THREE.Mesh(ridgeGeo, mat);
    const sw = w * (0.62 + idx * 0.14);
    const sh = h * (0.56 + idx * 0.12);
    sub.scale.set(sw, sh, sw * 0.62);
    sub.position.set(side * w * (0.38 + idx * 0.08), sh * 0.32, (idx === 0 ? 4 : -4));
    sub.rotation.y = side * 0.45;
    g.add(sub);
  });
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
  const normals = new Float32Array(rows * cols * 3);
  for (let i = 0; i < rows * cols; i++) normals[i * 3 + 1] = 1;
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
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
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
  // 距离锁定的公路反光诱导柱，入弯处自动高亮提示弯心方向
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
  // 广袤地面跟随镜头，并用独立地贴偏移锁定真实世界坐标，消除“草地在脚下漂移或静止不动”
  if (groundPlaneMesh && groundPlaneMesh.userData.tex) {
    const gx = Math.round(camera.position.x / 25) * 25;
    const gz = Math.round((camera.position.z - 120) / 25) * 25;
    groundPlaneMesh.position.set(gx, -0.82, gz);
    const tex = groundPlaneMesh.userData.tex;
    tex.offset.set(gx / 25, -(raceDistance * Z_PER_METER - gz) / 25);
  }
  updateLushGrassField();
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
  skyLight.color.setHex(theme.ambientColor);
  skyLight.groundColor.setHex(theme.hemiGroundColor || 0x3a642c);

  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  trackRibbons.length = 0;
  trackPosts.length = 0;
  sceneryObjects.length = 0;
  distantHills.length = 0;
  skyClouds.length = 0;
  windStreaks.length = 0;
  grassFieldBuckets = [];
  groundPlaneMesh = null;

  // 程序化体积云天空穹顶（分辨率无关 FBM 体积云与太阳散射）
  skyDome = createProceduralSkyDome(themeKey, theme);
  worldGroup.add(skyDome);

  // 远景天际层（高空柔光太阳光晕 + 远山山脉）
  horizonGroup = new THREE.Group();
  worldGroup.add(horizonGroup);

  const sunCorona = new THREE.Mesh(
    new THREE.PlaneGeometry(75, 75),
    new THREE.MeshBasicMaterial({
      map: WORLD_TEXTURES.sunHaloTex,
      color: 0xfff8de,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: false
    })
  );
  sunCorona.position.set(115, 118, -350);
  horizonGroup.add(sunCorona);

  // 1. 无限延展写实生态地表（草甸野花 / 海滩波纹沙 / 峡谷赤砂岩 / 雨林苔原，带世界坐标锁定滚动）
  const groundTexClone = getTerrainTexture(themeKey).clone();
  groundTexClone.wrapS = groundTexClone.wrapT = THREE.RepeatWrapping;
  groundTexClone.repeat.set(36, 36);
  groundTexClone.needsUpdate = true;
  applyTexAnisotropy(groundTexClone);
  groundPlaneMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTexClone, roughness: 0.92 })
  );
  groundPlaneMesh.rotation.x = -Math.PI / 2;
  groundPlaneMesh.position.set(0, -0.82, -120);
  groundPlaneMesh.userData.tex = groundTexClone;
  if (!isMobileDevice) groundPlaneMesh.receiveShadow = true;
  worldGroup.add(groundPlaneMesh);

  // 2. 沿河峡谷与荒岛：带阳光碎光涟漪与岸边白浪花的流动水面连续丝带
  if (themeKey === "river" || themeKey === "island") {
    const waterMat = new THREE.MeshStandardMaterial({
      map: getWaterTexture(themeKey),
      roughness: 0.18,
      metalness: 0.34
    });
    createTrackRibbon([[16, -0.68], [58, -0.68]], waterMat, 0.035, [0, 1]);
    if (themeKey === "island") {
      createTrackRibbon([[-58, -0.68], [-16, -0.68]], waterMat, 0.035, [1, 0]);
    }
  }

  // 3. 连续路基斜坡（自然托起高架赛道，内弯零折角零穿帮）
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: getTerrainTexture(themeKey), roughness: 0.90 });
  createTrackRibbon([[-22, -0.86], [-11.5, -0.02], [-10.9, 0.05]], shoulderMat, 0.05, [0, 0.45, 0.55], { receiveShadow: true });
  createTrackRibbon([[10.9, 0.05], [11.5, -0.02], [22, -0.86]], shoulderMat, 0.05, [0.45, 0.55, 1.0], { receiveShadow: true });

  // 3B. 铺设 2600+ 簇写实立体茂密 3D 草甸与野花丛（仅 4 次 InstancedMesh 绘制调用！）
  buildLushGrassField(themeKey);

  // 4. QQ飞车式流线型连续高精弯曲路面（每 2.5m 细分横断面，沥青粒子 + 边线 + 虚线一体贴合弯心！）
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

  // 5. 两侧红白 / 主题色竞速斜坡路肩（防滑带，过弯弧度丝滑如镜）
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

  // 6. 连续弯曲 3D 防撞护栏（彻底淘汰僵硬拼板，弯道全程平滑包络）
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

  // 7. 弯道导向反光柱（每 18m 一对，入急弯自动切亮橙金诱导光）
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

  // 8. 近景 + 中景双层立体写实生态景物（木屋与风车正面朝向公路，树林草丘层层递进至天际线）
  const NEAR_COUNT = isMobileDevice ? 54 : 88;
  const MID_COUNT = isMobileDevice ? 22 : 44;
  const TOTAL_SCENERY = NEAR_COUNT + MID_COUNT;
  const scenerySpanZ = 420;

  for (let i = 0; i < TOTAL_SCENERY; i++) {
    const isMidground = i >= NEAR_COUNT;
    const rand = Math.random();
    let item;
    let isRigid = false;

    if (isMidground) {
      // 中景原野层（24m~72m）：起伏草丘、成片阔叶林与云杉林、远方风车与农庄
      if (rand < 0.24) { item = createMeadowKnoll(themeKey); isRigid = true; }
      else if (rand < 0.52) item = themeKey === "island" ? createPalm() : createTree();
      else if (rand < 0.78) item = themeKey === "island" ? createPalm() : createPineTree();
      else if (rand < 0.90) { item = themeKey === "river" ? createCanyonRock() : createWindmill(); isRigid = true; }
      else { item = themeKey === "island" || themeKey === "jungle" ? createCanyonRock() : createFarmCabin(); isRigid = true; }
    } else if (themeKey === "country") {
      if (rand < 0.13) item = createCow();
      else if (rand < 0.24) item = createDeer();
      else if (rand < 0.35) { item = createWindmill(); isRigid = true; }
      else if (rand < 0.46) { item = createFarmCabin(); isRigid = true; }
      else if (rand < 0.54) { item = createHayBale(); isRigid = true; }
      else if (rand < 0.65) item = createFlowerBush();
      else if (rand < 0.72) { item = createRoadFence(); isRigid = true; }
      else if (rand < 0.85) item = createPineTree();
      else item = createTree();
    } else if (themeKey === "island") {
      if (rand < 0.18) item = createDeer();
      else if (rand < 0.30) { item = createWindmill(); isRigid = true; }
      else if (rand < 0.46) { item = createCanyonRock(); isRigid = true; }
      else if (rand < 0.62) item = createFlowerBush();
      else item = createPalm();
    } else if (themeKey === "jungle") {
      if (rand < 0.22) item = createDeer();
      else if (rand < 0.36) { item = createCanyonRock(); isRigid = true; }
      else if (rand < 0.52) item = createFlowerBush();
      else if (rand < 0.74) item = createPineTree();
      else item = createTree();
    } else {
      if (rand < 0.14) item = createCow();
      else if (rand < 0.28) { item = createFarmCabin(); isRigid = true; }
      else if (rand < 0.48) { item = createCanyonRock(); isRigid = true; }
      else if (rand < 0.60) { item = createStreetLamp(); isRigid = true; }
      else if (rand < 0.78) item = createPineTree();
      else item = createTree();
    }

    const side = i % 2 === 0 ? -1 : 1;
    const offset = isMidground
      ? (ROAD_WIDTH / 2 + 15.5 + Math.random() * 44.0)
      : (ROAD_WIDTH / 2 + 2.8 + Math.random() * 8.2);
    const seqIdx = isMidground ? (i - NEAR_COUNT) : i;
    const seqTotal = isMidground ? MID_COUNT : NEAR_COUNT;
    const zPos = 24 - (seqIdx / seqTotal) * scenerySpanZ - Math.random() * 3.5;
    const dAt = raceDistance - zPos / Z_PER_METER;
    const groundOffsetY = offset > 21 ? -0.80 : -0.82 * Math.min(1, Math.max(0, (offset - 11.2) / 10.6));
    item.position.set(trackCurve(dAt) + side * offset, groundOffsetY, zPos);

    if (isMidground && !isRigid) {
      const s = 1.05 + Math.random() * 0.45;
      item.scale.multiplyScalar(s);
    }

    item.userData = {
      ...item.userData,
      trackX: side * offset,
      baseY: groundOffsetY,
      swayPhase: isRigid ? undefined : Math.random() * Math.PI * 2,
      swayAmount: isRigid ? 0 : 0.010 + Math.random() * 0.010
    };
    // 门窗与风叶在本地 -Z：左岸(side=-1)旋转 -0.64π、右岸(side=+1)旋转 +0.64π 即可正面斜朝公路与驶来的玩家！
    item.rotation.y = side * Math.PI * 0.64 + (Math.random() - 0.5) * 0.26;
    worldGroup.add(item);
    sceneryObjects.push(item);
  }

  // 外围远景起伏山峦轮廓（放入 horizonGroup，深远稳重、低视差缓移）
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

  // 车身周围高速破风气流线
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

  particles.forEach(p => {
    scene.remove(p.mesh);
    if (p.isSmoke && p.mesh.material) p.mesh.material.dispose();
  });
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
  cameraBank = 0;
  cameraYaw = 0;

  carPhysics.x = 0;
  carPhysics.heading = 0;
  carPhysics.steerAngle = 0;
  carPhysics.roll = 0;
  carPhysics.rollVel = 0;
  carPhysics.pitch = 0;
  carPhysics.boostSpeed = 0;
  carPhysics.burningOut = false;
  carPhysics.burnoutCharge = 0;
  carPhysics.braking = false;
  if (player.group.userData.burnoutMarks) player.group.userData.burnoutMarks.visible = false;
  if (typeof setCarBrakeLights === "function") setCarBrakeLights(player.group, false, false);
  sound.updateBurnout(false, 0);

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

  // 1. 速度与渐进加减速 + 同时按住刹车与油门原地烧胎特效
  const accelerating = keys[keymap.throttle] || keys.ArrowUp || keys.throttle;
  const throttling = Boolean(accelerating || throttleHeld);
  const braking = brakeHeld || keys.brake || keys[keymap.brake] || keys.ArrowDown;
  const wasBurningOut = Boolean(carPhysics.burningOut);
  const burningOut = Boolean(braking && throttling && baseSpeed <= 0.34);
  carPhysics.burningOut = burningOut;
  const wantsBoost = !braking && !burningOut && (keys[keymap.boost] || keys.ShiftLeft || keys.ShiftRight || keys.boost) && nitro > 0;

  if (wantsBoost && !boosting) {
    sound.playBoost();
    triggerHaptic(40);
  }
  boosting = wantsBoost;
  nitro = boosting
    ? Math.max(0, nitro - 0.7 * dtScale)
    : Math.min(100, nitro + (burningOut ? 0.24 : 0.12) * dtScale);
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

  // 常规极速 200 km/h，开启氮气加速可暂时突破至 260 km/h（currentSpeed 单位换算：×90 即 km/h）
  const MAX_SPEED = 200 / 90;
  const MAX_BOOST_SPEED = 260 / 90;
  if (burningOut) {
    baseSpeed = Math.max(0, baseSpeed - 0.045 * dtScale);
    boosting = false;
    carPhysics.burnoutCharge = Math.min(1, carPhysics.burnoutCharge + 0.018 * dtScale);
    if (frame % (isMobileDevice ? 3 : 2) === 0) {
      spawnBurnoutSmokeForCar(player.group, 0.45 + carPhysics.burnoutCharge * 0.55);
    }
    if (impactHud && impactValue && frame % 4 === 0) {
      impactValue.textContent = `💨 原地烧胎 · 弹射蓄力 ${Math.round(carPhysics.burnoutCharge * 100)}%`;
      impactHud.classList.add("visible");
      clearTimeout(impactTimer);
      impactTimer = setTimeout(() => impactHud.classList.remove("visible"), 360);
    }
  } else {
    if (wasBurningOut && !braking && throttling && carPhysics.burnoutCharge > 0.22) {
      const kick = 0.52 + carPhysics.burnoutCharge * 0.72;
      baseSpeed = Math.min(MAX_SPEED, Math.max(baseSpeed, kick));
      spawnBurnoutSmokeForCar(player.group, 1.0);
      cameraTrauma = Math.min(1, cameraTrauma + 0.22);
      triggerHaptic([35, 30, 75]);
      if (impactHud && impactValue) {
        impactValue.textContent = "🚀 烧胎弹射起步！";
        impactHud.classList.add("visible");
        clearTimeout(impactTimer);
        impactTimer = setTimeout(() => impactHud.classList.remove("visible"), 900);
      }
      carPhysics.burnoutCharge = 0;
    } else if (!braking || !throttling) {
      carPhysics.burnoutCharge = Math.max(0, carPhysics.burnoutCharge - 0.04 * dtScale);
    }
    if (braking) {
      baseSpeed = Math.max(0, baseSpeed - 0.016 * dtScale);
      boosting = false;
    } else if (throttling) {
      baseSpeed = Math.min(MAX_SPEED, baseSpeed + 0.012 * dtScale);
    } else {
      baseSpeed = Math.max(0, baseSpeed - 0.0055 * dtScale);
      if (baseSpeed < 0.008) baseSpeed = 0;
    }
  }
  const targetBoostAdd = boosting ? (60 / 90) : 0;
  carPhysics.boostSpeed += (targetBoostAdd - carPhysics.boostSpeed) * expEase(boosting ? 0.14 : 0.055);
  currentSpeed = burningOut ? 0 : Math.min(MAX_BOOST_SPEED, baseSpeed + carPhysics.boostSpeed);
  if (player.group.userData.burnoutMarks && player.group.userData.burnoutSkidMat) {
    const marksActive = burningOut || carPhysics.burnoutCharge > 0.08;
    player.group.userData.burnoutMarks.visible = marksActive;
    if (marksActive) {
      player.group.userData.burnoutSkidMat.opacity = Math.min(0.46, carPhysics.burnoutCharge * 0.50);
    }
  }
  const stepMeters = ((currentSpeed * 90) / 3.6 / 60) * dtScale;
  raceDistance += stepMeters;
  const progress = Math.min(1, raceDistance / finishDistance);
  const gatePt = trackWorldPoint(finishDistance, 0, 0);
  finishGate.position.set(gatePt.x, gatePt.y, gatePt.z);
  finishGate.rotation.y = gatePt.yaw;
  if (finishGate.userData.pearl) {
    finishGate.userData.pearl.position.y = 12.45 + Math.sin(frame * 0.075) * 0.26;
    finishGate.userData.pearl.rotation.y += 0.03 * dtScale;
  }
  if (finishGate.userData.lanterns) {
    finishGate.userData.lanterns.forEach((lt, idx) => {
      lt.rotation.z = Math.sin(frame * 0.045 + idx * 1.6) * 0.08;
    });
  }
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

  const engineRpmSpeed = burningOut
    ? (1.55 + carPhysics.burnoutCharge * 0.85 + Math.sin(frame * 0.75) * 0.14)
    : currentSpeed;
  sound.updateEngine(engineRpmSpeed, boosting || burningOut);
  sound.updateBurnout(burningOut, carPhysics.burnoutCharge);

  const turnLeft = steeringMode === "buttons" && (keys[keymap.left] || keys.ArrowLeft || keys.KeyA || keys.left);
  const turnRight = steeringMode === "buttons" && (keys[keymap.right] || keys.ArrowRight || keys.KeyD || keys.right);
  const dt = (1 / 60) * dtScale;

  let targetSteer = 0;
  if (turnLeft) targetSteer = -PHYS.maxSteerAngle;
  else if (turnRight) targetSteer = PHYS.maxSteerAngle;
  else if (steeringMode === "tilt" && Math.abs(tiltSteer) > 0.08) {
    targetSteer = tiltSteer * PHYS.maxSteerAngle;
  } else if (autoSteeringEnabled) {
    // 自动回正只保持当前车道，手动按键/倾斜输入优先，不会自动避让车流。
    targetSteer = getAutoSteeringInput(carPhysics.x, carPhysics.heading) * PHYS.maxSteerAngle;
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
  const targetPitch = burningOut
    ? (0.032 + carPhysics.burnoutCharge * 0.016 + Math.sin(frame * 1.9) * 0.006)
    : ((braking && currentSpeed > 0.04)
      ? -0.045
      : (boosting ? 0.036 : (throttling && currentSpeed > 0.04 ? 0.020 : 0)));
  carPhysics.pitch += (targetPitch - carPhysics.pitch) * expEase(0.16);

  setCarBrakeLights(player.group, braking, burningOut);

  const burnoutShakeY = burningOut ? Math.sin(frame * 2.7) * (0.012 + carPhysics.burnoutCharge * 0.014) : 0;
  const burnoutShakeRoll = burningOut ? Math.sin(frame * 2.1) * (0.014 + carPhysics.burnoutCharge * 0.016) + targetSteer * 0.08 : 0;
  const burnoutWagYaw = burningOut ? targetSteer * 0.16 + Math.sin(frame * 1.4) * (0.018 * carPhysics.burnoutCharge) : 0;
  const playerPt = trackWorldPoint(raceDistance, carPhysics.x, 0);
  player.group.position.x = playerPt.x;
  player.group.position.y = playerPt.y + Math.sin(raceDistance * 1.45) * 0.009 * speedRatio + Math.abs(carPhysics.rollVel) * 0.018 + burnoutShakeY;
  player.group.position.z = playerPt.z;
  player.group.rotation.y = -carPhysics.heading + playerPt.yaw + burnoutWagYaw;
  player.group.rotation.x = carPhysics.pitch + Math.sin(raceDistance * 1.1) * 0.003 * speedRatio;
  player.group.rotation.z = -carPhysics.roll + playerPt.bankAngle + burnoutShakeRoll;

  player.wheels[0].steer.rotation.y = -carPhysics.steerAngle;
  player.wheels[1].steer.rotation.y = -carPhysics.steerAngle;
  player.wheels[2].steer.rotation.y = 0;
  player.wheels[3].steer.rotation.y = 0;

  const frontSpin = burningOut ? 0 : currentSpeed * 0.46 * dtScale;
  const rearSpin = burningOut ? (1.55 + carPhysics.burnoutCharge * 1.2) * dtScale : currentSpeed * 0.46 * dtScale;
  player.wheels.forEach((w, idx) => {
    w.spin.rotation.x += idx >= 2 ? rearSpin : frontSpin;
  });

  updateTrackRibbons();

  const moveZ = stepMeters * Z_PER_METER;
  distantHills.forEach(hill => {
    hill.position.z += moveZ * 0.045;
    if (hill.position.z > -185) {
      hill.position.z -= 185;
    }
  });
  if (skyDome && skyDome.material && skyDome.material.uniforms && skyDome.material.uniforms.uTime) {
    skyDome.material.uniforms.uTime.value = frame * 0.016;
  }
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
    if (p.gravity) p.vy -= p.gravity * dtScale;
    p.mesh.position.x += p.vx * dtScale;
    p.mesh.position.y += p.vy * dtScale;
    if (p.gravity && p.mesh.position.y < 0.05) {
      p.mesh.position.y = 0.05;
      p.vy = Math.abs(p.vy) * 0.35;
    }
    p.mesh.position.z += p.vz * dtScale;
    p.life -= (p.decay || 0.04) * dtScale;
    if (p.isSmoke) {
      p.vx *= Math.pow(0.955, dtScale);
      p.vz *= Math.pow(0.955, dtScale);
      p.scale += (p.grow || 0.035) * dtScale;
      p.mesh.scale.set(p.scale, p.scale, 1);
      if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.life * (p.maxOpacity || 0.45));
    } else {
      p.mesh.scale.setScalar(Math.max(0.01, p.life * (p.baseScale || 1)));
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.isSmoke && p.mesh.material) p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }

  if (frame % (isMobileDevice ? 6 : 4) === 0) drawMinimap();
  const camFraming = getCameraFraming();
  const carWorldX = playerPt.x;
  const roadYaw = -playerPt.yaw;
  const carFaceYaw = roadYaw + carPhysics.heading;
  const yawFollowTarget = roadYaw + carPhysics.heading * 0.86;
  cameraYaw += (yawFollowTarget - cameraYaw) * expEase(0.16);

  const camDist = camFraming.baseZ + (accelerating || throttleHeld ? 0.36 : 0) + (boosting ? 0.85 : 0) - (braking && currentSpeed > 0.04 ? 0.45 : 0) + speedRatio * 1.1;
  const driftPeek = Math.sin(carFaceYaw - cameraYaw) * 1.15;
  const targetCamX = playerPt.x - Math.sin(cameraYaw) * camDist - driftPeek * Math.cos(cameraYaw);
  const targetCamY = playerPt.y + camFraming.baseY + (boosting ? -0.18 : 0) + speedRatio * 0.24;
  const targetCamZ = playerPt.z + Math.cos(cameraYaw) * camDist - driftPeek * Math.sin(cameraYaw);

  camera.position.x += (targetCamX - camera.position.x) * expEase(0.42);
  camera.position.y += (targetCamY - camera.position.y) * expEase(0.24);
  camera.position.z += (targetCamZ - camera.position.z) * expEase(0.42);

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

  const targetFov = camFraming.baseFov + (boosting ? 8.5 : 0) + speedRatio * 4.2;
  camera.fov += (targetFov - camera.fov) * expEase(0.08);
  camera.updateProjectionMatrix();

  const noseLookX = playerPt.x + Math.sin(cameraYaw) * 16;
  const noseLookZ = playerPt.z - Math.cos(cameraYaw) * 16;
  const roadAheadPt = trackWorldPoint(raceDistance + 16, carPhysics.x * 0.65, 0);
  const lookTargetX = noseLookX * 0.80 + roadAheadPt.x * 0.20;
  const lookTargetZ = noseLookZ * 0.80 + roadAheadPt.z * 0.20;
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
  const medals = ["🥇", "🥈", "🥉"];
  leaderboardList.innerHTML = scores.map((item, index) => {
    const mine = myName && String(item.name || "").trim().toLowerCase() === myName;
    const scoreText = `${Number(item.score) || 0}分`;
    const timeText = item.time ? ` · ${formatRaceTime(Number(item.time))}` : "";
    const prefix = medals[index] || `${index + 1}.`;
    return `<li${mine ? ' class="mine"' : ""}><strong>${prefix} ${escapeHtml(item.name)}</strong><span>${scoreText}${timeText}</span></li>`;
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

function updateAutoSteeringUI() {
  autoSteerOff?.classList.toggle("active", !autoSteeringEnabled);
  autoSteerOn?.classList.toggle("active", autoSteeringEnabled);
  autoSteerOff?.setAttribute("aria-pressed", String(!autoSteeringEnabled));
  autoSteerOn?.setAttribute("aria-pressed", String(autoSteeringEnabled));
  if (autoSteerHelp) {
    autoSteerHelp.textContent = autoSteeringEnabled
      ? "自动回正：松开方向后回到当前车道中心；按键或倾斜可随时覆盖，不会自动躲车。"
      : "手动驾驶：车辆方向由按键或手机倾斜控制。";
  }
}

function setAutoSteering(enabled) {
  autoSteeringEnabled = Boolean(enabled);
  localStorage.setItem(AUTO_STEER_STORAGE, autoSteeringEnabled ? "1" : "0");
  updateAutoSteeringUI();
}

autoSteerOff?.addEventListener("click", () => setAutoSteering(false));
autoSteerOn?.addEventListener("click", () => setAutoSteering(true));
updateAutoSteeringUI();

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

