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
let brakeHeld = false;
let roomCode = "";
let roomPlayerId = "";
let remoteCar = null;
let roomPollTimer = null;
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
    if (btn && capturingKey !== action) btn.textContent = keyLabel(keymap[action]);
  });
}

function startKeyCapture(action) {
  capturingKey = action;
  const btn = document.querySelector(`#key-${action}`);
  if (btn) btn.textContent = "按新键…";
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

// ── API 接口 ──
// 前端既可能在阿里云服务器上（与 /api 同源），也可能托管在 GitHub Pages 上（需跨域打 API 域名）。
// 先试同源，失败自动回退到独立 API 域名，两边部署都不用改代码。
const API_FALLBACK = "https://api.game.yhj123.dpdns.org";
let apiBase = null;

async function resolveApiBase() {
  if (apiBase !== null) return apiBase;
  for (const base of ["", API_FALLBACK]) {
    try {
      const res = await fetch(`${base}/api/health`, { cache: "no-store" });
      if (res.ok) { apiBase = base; return base; }
    } catch (error) {
      // 试下一个
    }
  }
  apiBase = API_FALLBACK;
  return apiBase;
}

// 离线版：所有网络请求直接禁用
const OFFLINE_MODE = true;

const api = {
  async request(path, options) {
    if (OFFLINE_MODE) throw new Error("离线版不联网");
    const base = await resolveApiBase();
    let res;
    try {
      res = await fetch(`${base}${path}`, options);
    } catch (error) {
      throw new Error("网络不通，请检查手机网络后重试");
    }
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        if (data && (data.error || data.message)) detail = String(data.error || data.message);
      } catch (error) { /* 响应不是 JSON */ }
      const fallback =
        res.status === 404 ? "房间不存在，请核对房间码" :
        res.status === 409 ? "房间已满（最多两名车手）" :
        res.status >= 500 ? "服务器正在重启，请 3 秒后再试" :
        `请求失败（${res.status}）`;
      throw new Error(detail || fallback);
    }
    return res.json();
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
};

// 手动房号：两个人输一样的号就进同一个房间，先到的人自动建房
async function enterRaceRoom(rawCode, mode = "join") {
  const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (code.length < 3) {
    document.querySelector("#roomStatus").textContent = "先输入房间号（至少 3 位），两人输一样的号就能进同一个房间";
    return;
  }
  // 手里还握着旧座位就先释放，保证"退出后再进来"永远能成功
  if (roomCode && roomPlayerId) {
    await leaveRaceRoom(true);
  }
  let result = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await api.post("/api/race/rooms", {
        action: mode === "create" ? "create" : "join",
        roomCode: code,
        name: playerNameInput.value.trim() || "车手",
        // 距离只有房主（创建者）决定，加入方传了也会被服务端忽略
        finishDistance: mode === "create" ? Number(document.querySelector("#raceLength")?.value || 1500) : undefined
      });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  roomCode = result.roomCode;
  roomPlayerId = result.playerId;
  raceSync.myLane = Number(result.lane) || 0;
  raceSync.myColor = result.color || "#ffffff";
  const total = Number(result.playerCount) || 1;
  document.querySelector("#roomStatus").textContent = total >= 2
    ? `房间 ${roomCode} · 两人已就位，马上发车`
    : `房间 ${roomCode} · 等待对手（让他也输 ${roomCode} 点「进入房间」）`;
  const input = document.querySelector("#roomCodeInput");
  if (input) input.value = roomCode;
  setRoomBadge(roomCode);
  const lengthSelect = document.querySelector("#raceLength");
  if (lengthSelect) {
    lengthSelect.disabled = mode !== "create";
    lengthSelect.title = mode === "create" ? "房主可修改比赛距离" : "比赛距离由房主决定";
  }
  if (roomPollTimer) clearInterval(roomPollTimer);
  roomPollTimer = setInterval(syncRaceRoom, 60);
  startRaceStream();
  applyRaceStart(result);
}

// 兼容旧调用点
async function connectRaceRoom(action, code = "") {
  await enterRaceRoom(code);
}

// 退出房间：释放服务器座位、断开推送、清掉本地房间状态
async function leaveRaceRoom(silent = false) {
  const code = roomCode;
  const id = roomPlayerId;
  if (code && id) {
    try { await api.post("/api/race/leave", { roomCode: code, playerId: id }); } catch (error) { /* 忽略 */ }
  }
  if (raceStream) {
    try { raceStream.close(); } catch (error) { /* ignore */ }
    raceStream = null;
  }
  if (roomPollTimer) {
    clearInterval(roomPollTimer);
    roomPollTimer = null;
  }
  roomCode = "";
  roomPlayerId = "";
  raceSync.armed = false;
  raceSync.locked = false;
  raceSync.startAt = 0;
  raceSync.other = null;
  lastGapLabel = "";
  if (remoteCar) {
    scene.remove(remoteCar.group);
    remoteCar = null;
  }
  const countdown = document.querySelector("#raceCountdown");
  if (countdown) countdown.style.display = "none";
  setRoomBadge("");
  if (!silent) {
    document.querySelector("#roomStatus").textContent = "已退出房间，输入房间号可以重新进入";
    running = false;
  }
}

// ── 联机同步开局：两人同时回到同一起跑线 ──
const raceSync = { startAt: 0, armed: false, locked: false, remoteId: "" };

function ensureCountdownEl() {
  let el = document.querySelector("#raceCountdown");
  if (!el) {
    el = document.createElement("div");
    el.id = "raceCountdown";
    el.style.cssText =
      "position:fixed;left:0;right:0;top:0;bottom:0;display:none;align-items:center;" +
      "justify-content:center;font:900 min(20vw,150px)/1 'Orbitron','Rajdhani',sans-serif;" +
      "color:#61efff;text-shadow:0 0 30px rgba(97,239,255,.85);pointer-events:none;z-index:9999;";
    document.body.appendChild(el);
  }
  return el;
}

function applyRaceStart(payload) {
  if (!payload || !payload.startAt) return;
  const serverNow = Number(payload.serverNow) || Date.now();
  const clockOffset = serverNow - Date.now();          // 服务器时钟领先本地的毫秒数
  const localStart = Number(payload.startAt) - clockOffset;
  // 已经发车了就忽略服务端后续的时刻变化，避免比赛被打断
  if (raceSync.armed && Date.now() > raceSync.startAt) return;
  if (raceSync.armed && Math.abs(localStart - raceSync.startAt) < 400) return;
  raceSync.startAt = localStart;
  raceSync.armed = true;
  if (Number(payload.finishDistance) > 0) {
    finishDistance = Number(payload.finishDistance);
    const sel = document.querySelector("#raceLength");
    if (sel) sel.value = String(finishDistance);
  }
  startMultiRaceCountdown();
}

function startMultiRaceCountdown() {
  raceSync.locked = true;
  const el = ensureCountdownEl();
  const status = document.querySelector("#roomStatus");
  const tick = () => {
    const left = Math.ceil((raceSync.startAt - Date.now()) / 1000);
    if (left > 0) {
      el.style.display = "flex";
      el.textContent = String(left);
      if (status) status.textContent = `房间 ${roomCode} · ${left} 秒后一起发车`;
      setTimeout(tick, 120);
      return;
    }
    el.style.display = "flex";
    el.textContent = "GO";
    launchMultiRace();
    setTimeout(() => { el.style.display = "none"; }, 700);
  };
  tick();
}

function launchMultiRace() {
  raceSync.locked = false;
  sound.ensureContext();
  resetGame();                       // 两人同一时刻归零 → 同一起跑线
  // 真实车道：服务器给每人分配了左/右车道，画面上不再给对手加假的偏移
  carPhysics.x = (raceSync.myLane || 0) * LANE_WIDTH * 0.5;
  player.group.position.x = carPhysics.x;
  // 车身颜色也用服务器分配的那套，两边看到的是同一世界
  if (raceSync.myColor && player.group.userData.paintMaterial) {
    player.group.userData.paintMaterial.color.set(raceSync.myColor);
  }
  raceSync.renderOffsetX = 0;
  running = true;
  overlay.classList.add("hidden");
  document.querySelector("#roomStatus").textContent = "发车！";
  sound.startBGM();
  triggerHaptic([40, 60, 120]);
}

async function syncRaceRoom() {
  if (!roomCode || !roomPlayerId) return;
  try {
    const posted = await api.post("/api/race/state", {
      roomCode, playerId: roomPlayerId, x: carPhysics.x,
      heading: carPhysics.heading, speed: currentSpeed, distance: raceDistance,
      finished: !running && raceDistance >= finishDistance,
      time: raceTime
    });
    applyRaceStart(posted);
    if (posted.raceOver) forceEndRace();
    // 兜底：两人都在房间里但服务端暂时没给出统一时刻（例如刚被重置），本地 3 秒后发车
    if (!raceSync.armed && Number(posted.playerCount) >= 2) {
      raceSync.startAt = Date.now() + 3000;
      raceSync.armed = true;
      startMultiRaceCountdown();
    }
    // 服务端在一次 POST 里就带回对手，省掉每帧一次的 GET（手机端明显更流畅）
    let other = (posted.players || [])[0];
    if (!posted.players) {
      const result = await api.get(`/api/race/state?roomCode=${roomCode}&playerId=${roomPlayerId}`);
      other = result.players[0];
    }
    if (!other) {
      document.querySelector("#roomStatus").textContent = `房间码 ${roomCode} · 等待朋友加入`;
      if (raceSync.locked) {                 // 对手跑了就别把玩家冻在倒计时里
        raceSync.locked = false;
        raceSync.armed = false;
        const el = document.querySelector("#raceCountdown");
        if (el) el.style.display = "none";
      }
      return;
    }
    raceSync.remoteId = other.id;
    updateRemoteCar(other);
  } catch (error) {
    // 断线不让人干等：自动重连同一个房间号
    document.querySelector("#roomStatus").textContent = "连接中断，正在自动重连…";
    setRoomBadge(roomCode, true, "重连中…");
    scheduleReconnect();
  }
}

// 断线自动重连（保留原房间号）
let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer || !roomCode) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    const code = roomCode;
    if (!code) return;
    try {
      await leaveRaceRoom(true);
      await enterRaceRoom(code);
      const status = document.querySelector("#roomStatus");
      if (status) status.textContent = `已重新连上房间 ${code}`;
    } catch (error) {
      /* 下一轮失败还会再排一次 */
    }
  }, 1200);
}

// 对手状态只做采样记录，真正的绘制放到每一帧里按外推计算，保证相对运动连续
function updateRemoteCar(other) {
  raceSync.remoteId = other.id;
  raceSync.other = {
    id: other.id,
    name: other.name,
    x: Number(other.x) || 0,
    heading: Number(other.heading) || 0,
    speed: Number(other.speed) || 0,
    distance: Number(other.distance) || 0,
    finishTime: Number(other.finishTime) || 0,
    finishSpeed: Number(other.finishSpeed) || 0,
    at: Date.now()
  };
  raceSync.remoteName = other.name;

  if (!remoteCar) {
    // 对手车的颜色同样来自服务器，双方看到同一台车同一个颜色
    remoteCar = createTeslaCar(false, other.color || "#ff9a3c");
    scene.add(remoteCar.group);
  } else if (other.color && remoteCar.group.userData.paintMaterial) {
    remoteCar.group.userData.paintMaterial.color.set(other.color);
  }
  if (!raceSync.tag || raceSync.tagName !== other.name) {
    if (raceSync.tag) remoteCar.group.remove(raceSync.tag);
    raceSync.tag = makeNameTag(other.name);
    raceSync.tagName = other.name;
    remoteCar.group.add(raceSync.tag);
  }
  refreshGapHud();
}

// 每分钟只需更新文字，避免状态栏每 40ms 抖一次
let lastGapLabel = "";
let lastGapAt = 0;
function refreshGapHud() {
  const other = raceSync.other;
  if (!other) return;
  const rel = other.distance - raceDistance;
  const gap = Math.abs(Math.round(rel));
  const gapLabel = gap < 3 ? "并驾齐驱" : (rel >= 0 ? `落后 ${gap} m` : `领先 ${gap} m`);
  const mine = Math.round(raceDistance);
  const theirs = Math.round(other.distance);
  const now = Date.now();
  const badgeText = `我 ${mine}m · 对手 ${theirs}m · ${gapLabel}`;
  if (badgeText === lastGapLabel || now - lastGapAt < 250) return;
  lastGapLabel = badgeText;
  lastGapAt = now;
  const status = document.querySelector("#roomStatus");
  if (status) status.textContent = `房间 ${roomCode} · 对手：${other.name} · ${badgeText}`;
  setRoomBadge(roomCode, false, badgeText);
}

// 对手在视野外时，用屏幕提示标出他在前还是在后、差多少米
let lastRivalText = "";
function updateRivalMarker(rel) {
  const el = document.querySelector("#rivalMarker");
  if (!el) return;
  if (!raceSync.other) {
    if (lastRivalText !== "") { el.style.display = "none"; lastRivalText = ""; }
    return;
  }
  if (Math.abs(rel) < 55) {
    if (lastRivalText !== "") { el.style.display = "none"; lastRivalText = ""; }
    return;
  }
  const ahead = rel > 0;
  const text = ahead ? `▲ 对手领先 ${Math.round(rel)} m` : `▼ 对手落后 ${Math.round(-rel)} m`;
  if (text !== lastRivalText) {
    lastRivalText = text;
    el.textContent = text;
    el.style.color = ahead ? "#ff9a3c" : "#61efff";
    el.style.borderColor = ahead ? "rgba(255,154,60,.55)" : "rgba(97,239,255,.5)";
  }
  el.style.display = "block";
  el.style.top = ahead ? "13%" : "auto";
  el.style.bottom = ahead ? "auto" : "18%";
}

// 每一帧：用对手上报的里程 + 速度外推，画出真实的相对运动
function syncRemoteCarVisual() {
  const o = raceSync.other;
  if (!o || !remoteCar) return;
  const elapsed = Math.max(0, Math.min(0.25, (Date.now() - o.at) / 1000));
  // 上报速度单位换算成实际前进：speed * 90 / 3.6 米每秒
  const projected = o.distance + (o.speed * 90 / 3.6) * elapsed;
  const rel = projected - raceDistance;             // 真实差距：正整数=他领先，负数=我领先
  // 1 米就是 1 米，不做任何夹取/压缩，否则对手会被"钉"在你身边看起来一起走
  const targetZ = -rel;
  const targetX = o.x + trackCurve(projected);
  remoteCar.group.position.z += (targetZ - remoteCar.group.position.z) * 0.6;
  remoteCar.group.position.x += (targetX - remoteCar.group.position.x) * 0.6;
  const otherSlope = (trackCurve(projected + 4) - trackCurve(projected - 4)) / 8;
  remoteCar.group.rotation.y = -o.heading - Math.atan(otherSlope);
  // 拉开太远就干脆不画（交给屏幕提示条和小地图显示）
  remoteCar.group.visible = Math.abs(rel) < 420;
  updateRivalMarker(rel);
  refreshGapHud();
}

// 实时推送通道：服务端每 40ms 推一次对手状态，比轮询快得多
let raceStream = null;

function startRaceStream() {
  if (raceStream) {
    try { raceStream.close(); } catch (error) { /* ignore */ }
    raceStream = null;
  }
  if (!roomCode || !roomPlayerId) return;
  if (typeof EventSource === "undefined") return;
  const base = apiBase || "";
  try {
    const url = `${base}/api/race/stream?roomCode=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(roomPlayerId)}`;
    raceStream = new EventSource(url);
    raceStream.onmessage = (event) => {
      let data = null;
      try { data = JSON.parse(event.data); } catch (error) { return; }
      if (!data) return;
      applyRaceStart(data);
      if (data.raceOver) forceEndRace();
      const other = (data.players || [])[0];
      if (other) updateRemoteCar(other);
    };
    raceStream.onerror = () => {
      // SSE 断了就关掉，交给轮询 + 自动重连兜底
      try { raceStream.close(); } catch (error) { /* ignore */ }
      raceStream = null;
      scheduleReconnect();
    };
  } catch (error) {
    raceStream = null;
  }
}

// 右上角常驻房间号徽章
function setRoomBadge(code, offline = false, gapText = "") {
  const el = document.querySelector("#roomBadge");
  if (!el) return;
  if (!code) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  const suffix = gapText ? ` · ${gapText}` : "";
  el.textContent = offline ? `房间 ${code} · 已断开` : `房间 ${code}${suffix}`;
  el.style.color = offline ? "#ff8a8a" : "#61efff";
  el.style.borderColor = offline ? "rgba(255,138,138,.5)" : "rgba(97,239,255,.45)";
}

// ═══════════════════════════════════════
// 100% 稳定运行的真实公路自驾车载音乐与声效系统 (HTML5 Audio + WebAudio 深度双引擎)
// ═══════════════════════════════════════
class MusicEngine {
  constructor() {
    // 默认静音：只有玩家自己点开才出声，手机和电脑一致
    this.enabled = localStorage.getItem("racerAudioEnabled") === "1";
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
            if (soundStatus) soundStatus.textContent = "🔊 音乐播放中";
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
    localStorage.setItem("racerAudioEnabled", this.enabled ? "1" : "0");
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

// 静音/开启状态同步到界面（默认静音，点右上角喇叭才出声）
function syncAudioUI() {
  const on = sound.enabled;
  if (audioToggle) {
    audioToggle.textContent = on ? "🔊" : "🔇";
    audioToggle.style.opacity = on ? "1" : "0.55";
    audioToggle.title = on ? "关闭音乐音效" : "开启音乐音效（默认静音）";
  }
  if (soundStatus) {
    soundStatus.textContent = on ? "🔊 音效已开启" : "🔇 默认静音，点右上角喇叭开启";
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
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobileDevice, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = !isMobileDevice;   // 手机端关阴影，帧率优先
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// 菜单阶段也把镜头放在车后视角，避免开局前对着地面
camera.position.set(0, 3.5, 6);
camera.lookAt(0, 1.1, -16);

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

// 赛道走向：按完赛里程归一化，组成"直道 → 右弯 → 回正 → U 型大弯 → 直道"
function trackCurve(distance) {
  const total = Math.max(300, finishDistance || 1500);
  const t = Math.max(0, Math.min(1, distance / total));
  // 关键节点：位置(0..1) → 横向偏移(米)
  const keys = [
    [0.00, 0],
    [0.16, 0],
    [0.32, 12],     // 右弯
    [0.44, 12],
    [0.50, 6],
    [0.62, -12],    // U 型大弯（从左绕到右）
    [0.72, -12],
    [0.86, 0],      // 回正
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
  // 叠加细碎摆动，让直道也不是死板的一条线
  return value + 2.4 * Math.sin(distance / 57) + 1.2 * Math.sin(distance / 23);
}

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

function createTeslaCar(isPlayer = true, colorHex = 0xffffff) {
  const carGroup = new THREE.Group();
  carGroup.userData.paintMaterial = null;   // 后面按服务器分配的颜色改车漆

  // 高级纯电烤漆车漆
  const paintMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.25,
    metalness: 0.7
  });
  carGroup.userData.paintMaterial = paintMat;

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
const traffic = [];
const trafficColors = [0x111111, 0x0055ff, 0xcc2222, 0x888888, 0x1e3a5f];

function spawnTraffic() {
  if (traffic.length > 46) return;   // 上限，别把手机拖垮

  // 有一定概率一次刷出并排的 2~3 辆，只留一条缝，逼玩家变道
  const blockCount = Math.random() < 0.42 ? 2 : (Math.random() < 0.18 ? 3 : 1);
  const freeLanes = Math.max(1, LANE_COUNT - blockCount);
  const startLane = Math.floor(Math.random() * freeLanes);

  for (let i = 0; i < blockCount; i++) {
    const laneIndex = Math.min(LANE_COUNT - 1, startLane + i);
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
    item.userData.trackX = item.position.x;
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
    for (let s = 0; s < 2; s++) {
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
  for (let marker = 0; marker < Math.floor(ROAD_SEGMENT_LENGTH / 24); marker++) {
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
  scoreEl.textContent = formatRaceTime(0);
  nitroBar.style.width = "100%";

  // 开局立即在前方车道生成 6 辆巡航车流，绝不让道路空旷！
  const initialZ = [-70, -105, -140, -180, -220, -260, -300, -340, -380, -420, -460, -500, -540, -580];
  initialZ.forEach((z, idx) => {
    const laneIndex = idx % LANE_COUNT;
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
  // 联机中：两人没到齐就不许先跑，必须一起发车
  if (roomCode && !raceSync.armed) {
    document.querySelector("#roomStatus").textContent = "等对手进入同一个房间号后，两人一起发车";
    return;
  }
  // 联机倒计时未结束前，手动开始无效，等统一发车
  if (roomCode && raceSync.armed && Date.now() < raceSync.startAt) return;
  sound.ensureContext();
  running = true;
  overlay.classList.add("hidden");

  playerName = playerNameInput.value.trim() || "自驾游车友";
  localStorage.setItem("neonRacerName", playerName);
  resetGame();

  sound.startBGM();
  if (soundStatus) soundStatus.textContent = sound.enabled ? "🔊 引擎、音乐、碰撞音效已开启" : "🔇 默认静音，点右上角喇叭开启";
  triggerHaptic(40);
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

  // 用时少的赢：拿对手的冲线用时对比
  const other = raceSync.other;
  let verdict = roomCode ? "等待对手冲线…" : "";
  if (other && other.finishTime) {
    verdict = raceTime <= other.finishTime
      ? `🏆 你赢了！比对手快 ${(other.finishTime - raceTime).toFixed(1)} 秒`
      : `对手更快，你慢了 ${(raceTime - other.finishTime).toFixed(1)} 秒`;
  }
  finishSpeed = Math.round(currentSpeed * 90);
  const lines = [
    `完成 ${Math.floor(finishDistance / 100) / 10} km 赛道！`,
    `用时：<b style="color:#61efff;font-size:24px">${formatRaceTime(raceTime)}</b>`,
    `冲线速度：<b>${finishSpeed} km/h</b>　最高速度：<b>${Math.round(maxSpeed)} km/h</b>`
  ];
  if (verdict) lines.splice(1, 0, verdict);
  if (other && other.finishTime) {
    lines.push(`对手用时 ${formatRaceTime(other.finishTime)}　冲线 ${other.finishSpeed || 0} km/h`);
  }
  lines.push(`最佳用时：${formatRaceTime(bestTime)}`);
  message.innerHTML = lines.join("<br>");

  // 把用时同步上去（成绩榜 + 房间状态）
  saveLocalScore(playerName, raceTime);
  loadLeaderboard();
  if (roomCode && roomPlayerId) {
    api.post("/api/race/state", {
      roomCode, playerId: roomPlayerId, x: carPhysics.x,
      heading: carPhysics.heading, speed: currentSpeed, distance: raceDistance,
      finished: true, time: raceTime
    }).catch(() => {});
  }
  document.querySelector("#start").textContent = "再跑一圈";
  overlay.classList.remove("hidden");
}

// 对手冲线 5 秒后你还没到终点 -> 强制结束（判负但保留成绩）
function forceEndRace() {
  if (!running) return;
  running = false;
  sound.stopBGM();
  const other = raceSync.other;
  title.textContent = "比赛结束";
  const lines = [
    "对手已经冲线，你没能在他冲线后 5 秒内到达终点。",
    `你的进度：${Math.round(raceDistance)} / ${finishDistance} m　用时：${formatRaceTime(raceTime)}`,
    `当前速度：${Math.round(currentSpeed * 90)} km/h　最高速度：${Math.round(maxSpeed)} km/h`
  ];
  if (other && other.finishTime) {
    lines.splice(1, 0, `对手用时 ${formatRaceTime(other.finishTime)}　冲线 ${other.finishSpeed || 0} km/h`);
  }
  message.innerHTML = lines.join("<br>");
  document.querySelector("#start").textContent = "再来一局";
  overlay.classList.remove("hidden");
  setRoomBadge(roomCode, false, "比赛结束");
}

async function endGame() {
  running = false;
  sound.stopBGM();

  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  bestEl.textContent = formatRaceTime(bestTime);
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
    await api.post("/api/scores", { name: playerName, time: raceTime });
    await loadLeaderboard();
  } catch (error) {
    setServerState(false);
  }
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
  const mobile = window.matchMedia("(max-width: 820px)").matches;
  el.style.width = mobile ? "88px" : "116px";
  el.style.height = mobile ? "152px" : "196px";
  el.style.left = mobile ? "10px" : "20px";
  el.style.top = mobile ? "148px" : "432px";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = el.clientWidth || 100;
  const h = el.clientHeight || 170;
  el.width = Math.round(w * dpr);
  el.height = Math.round(h * dpr);
  minimapCtx = el.getContext("2d");
  if (minimapCtx) minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMinimap();
}

function drawMinimap() {
  const el = minimapCanvas;
  if (!el || !minimapCtx) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;
  const ctx = minimapCtx;
  ctx.clearRect(0, 0, w, h);

  const pad = 9;
  const usableH = h - pad * 2;
  const usableW = w - pad * 2;
  const total = Math.max(300, finishDistance);

  // 采样整条赛道的弯曲，用于横向缩放
  const samples = 70;
  let maxAbs = 1;
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const d = (total * i) / samples;
    const cx = trackCurve(d);
    if (Math.abs(cx) > maxAbs) maxAbs = Math.abs(cx);
    pts.push({ d, cx });
  }
  const xScale = ((usableW / 2) / maxAbs) * 0.86;
  const toX = (cx) => w / 2 + cx * xScale;
  const toY = (d) => h - pad - (Math.max(0, Math.min(d, total)) / total) * usableH;

  // 赛道主体
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(97,239,255,.22)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = toX(p.cx), y = toY(p.d);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = "rgba(151,255,255,.65)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 起点 / 终点
  const startPt = pts[0];
  const endPt = pts[pts.length - 1];
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.arc(toX(startPt.cx), toY(0), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(toX(endPt.cx) - 7, toY(total) - 2, 14, 3);

  // 对手（银色，带位置外推）
  const other = raceSync.other;
  if (other) {
    const elapsed = Math.max(0, Math.min(0.25, (Date.now() - other.at) / 1000));
    const od = other.distance + (other.speed * 90 / 3.6) * elapsed;
    ctx.fillStyle = "#c8ccd2";
    ctx.beginPath();
    ctx.arc(toX(trackCurve(od)), toY(od), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 自己（白色）
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(toX(trackCurve(raceDistance)), toY(raceDistance), 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.stroke();
}

// ═══════════════════════════════════════
// 核心动力学更新循环 (纯正后轴阿克曼前轮转向)
// ═══════════════════════════════════════
function update() {
  if (!running) return;
  if (raceSync.locked) {
    // 兜底：倒计时卡住超过 6 秒就强制解锁，绝不把玩家冻在原地
    if (!raceSync.lockGuardAt) raceSync.lockGuardAt = Date.now();
    if (Date.now() - raceSync.lockGuardAt < 6000) return;
    raceSync.locked = false;
  }
  raceSync.lockGuardAt = 0;
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

  // 5. 敌车刷新与真实碰撞检测 (高频刷新车流，丰富自驾驾驶感)
  if (frame % Math.max(38, Math.floor(72 - currentSpeed * 14)) === 0) {
    spawnTraffic();
  }
  if (Math.random() < 0.03) {
    spawnCoin();
  }

  for (let i = traffic.length - 1; i >= 0; i--) {
    const enemy = traffic[i];
    enemy.group.position.z += moveZ - enemy.speed * 1.0;
    enemy.group.position.x = enemy.laneX + trackCurve(raceDistance - enemy.group.position.z);
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
      // 实体碰撞：双方弹开 + 掉速，比赛继续，不判出局
      if (Date.now() > (enemy.hitUntil || 0)) {
        enemy.hitUntil = Date.now() + 600;
        const push = Math.sign(pPos.x - ePos.x) || (Math.random() < 0.5 ? -1 : 1);
        const bound = ROAD_WIDTH / 2 - 1.8;

        // 自己的车被顶开，速度掉到三成，车头甩一下
        carPhysics.x = Math.max(-bound, Math.min(bound, carPhysics.x + push * 1.6));
        carPhysics.heading += push * 0.16;
        baseSpeed = Math.max(0, baseSpeed * 0.32);

        // 对方车也被撞歪，往反方向挪一条缝并减速
        enemy.laneX = Math.max(-ROAD_WIDTH / 2 + 1.2, Math.min(ROAD_WIDTH / 2 - 1.2, enemy.laneX - push * 2.4));
        enemy.group.position.z += 2.5;
        enemy.speed = Math.max(0.06, enemy.speed * 0.55);
        enemy.group.rotation.y += push * 0.25;

        showImpact("剐蹭 · 撞开减速", ePos.x, ePos.z, true);
        sound.playCrash();
        triggerHaptic([50, 30, 70]);
        cameraTrauma = Math.min(1, cameraTrauma + 0.5);
      }
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

  // 8. 第三人称跟随相机：镜头始终锁在车辆正后方，不再被弯道/横向漂移带偏
  syncRemoteCarVisual();
  if (frame % 4 === 0) drawMinimap();
  const carWorldX = carPhysics.x + trackCurve(raceDistance);
  const targetCamX = carWorldX;
  // 速度感：跑得越快镜头微微拉远、抬高，车在画面里会有一个"往前顶"的过程
  const speedRatio = Math.min(1, currentSpeed / (200 / 90));
  const targetCamY = (boosting ? 3.3 : 3.5) + speedRatio * 0.35;
  const targetCamZ = (boosting ? 6.5 : 6.0) + speedRatio * 1.6;

  camera.position.x += (targetCamX - camera.position.x) * 0.16;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;

  if (cameraTrauma > 0) {
    const p = Math.pow(cameraTrauma, 2);
    camera.position.x += (Math.random() - 0.5) * 1.5 * p;
    camera.position.y += (Math.random() - 0.5) * 1.2 * p;
    cameraTrauma = Math.max(0, cameraTrauma - 0.04);
  }

  const targetFov = boosting ? 62 : 58;
  camera.fov += (targetFov - camera.fov) * 0.02;
  camera.updateProjectionMatrix();

  // 视线永远沿赛道正前方，镜头和车一起平移，不会越开越歪
  const lookSlope = (trackCurve(raceDistance + 25) - trackCurve(raceDistance)) / 25;
  camera.lookAt(camera.position.x + lookSlope * 26, 1.1, -16);
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
  // 自己的名字在榜上用黄色标出来，方便一眼找到
  const myName = (playerNameInput?.value.trim() || playerName || localStorage.getItem("neonRacerName") || "").toLowerCase();
  leaderboardList.innerHTML = scores.map((item, index) => {
    const mine = myName && String(item.name || "").trim().toLowerCase() === myName;
    const mark = mine ? ' style="color:#ffd166;text-shadow:0 0 10px rgba(255,209,102,.6)"' : "";
    return `<li><strong${mark}>${index + 1}. ${escapeHtml(item.name)}</strong><span${mark}>${formatRaceTime(Number(item.time))}</span></li>`;
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

function saveLocalScore(name, time) {
  const list = readLocalScores();
  const key = String(name || "车手").trim().toLowerCase();
  const kept = list.filter(item => String(item.name || "").trim().toLowerCase() !== key);
  kept.push({ name: name || "车手", time: Math.round(time * 10) / 10, createdAt: new Date().toISOString() });
  kept.sort((a, b) => Number(a.time) - Number(b.time));
  localStorage.setItem("racerLocalScores", JSON.stringify(kept.slice(0, 20)));
}

function loadLeaderboard() {
  renderLeaderboard(readLocalScores());
  setServerState(false);
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

document.querySelector("#createRoom")?.addEventListener("click", async () => {
  try { await enterRaceRoom(document.querySelector("#roomCodeInput")?.value, "create"); }
  catch (error) { document.querySelector("#roomStatus").textContent = error.message; }
});
document.querySelector("#joinRoom")?.addEventListener("click", async () => {
  try { await enterRaceRoom(document.querySelector("#roomCodeInput")?.value); }
  catch (error) { document.querySelector("#roomStatus").textContent = error.message; }
});
document.querySelector("#leaveRoom")?.addEventListener("click", () => {
  leaveRaceRoom(false).catch(() => {});
});

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
    // 试听按钮等价于"我要开声音"
    if (!sound.enabled) {
      sound.enabled = true;
      localStorage.setItem("racerAudioEnabled", "1");
    }
    sound.ensureContext();
    sound.startBGM();
    syncAudioUI();
    testAudioBtn.textContent = "🎵 音乐正在播放中！(若无声请关闭iPhone左侧实体静音键)";
    testAudioBtn.style.background = "rgba(40,230,120,0.25)";
    testAudioBtn.style.borderColor = "#28e678";
    testAudioBtn.style.color = "#28e678";
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
applyTheme(currentTheme);
syncAudioUI();
layoutMinimap();
window.addEventListener("resize", () => layoutMinimap());
loadLeaderboard();
render();
