const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
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

let width;
let height;
let roadLeft;
let roadRight;
let laneWidth;
let roadOffset = 0;
let running = false;
let score = 0;
let nitro = 100;
let baseSpeed = 5;
let boosting = false;
let frame = 0;
let traffic = [];
let coins = [];
let particles = [];
let stars = [];
const keys = {};

let best = Number(localStorage.getItem("neonRushBest") || 0);
let playerName = localStorage.getItem("neonRacerName") || "";
playerNameInput.value = playerName;
bestEl.textContent = best;

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

const car = { x: 0, y: 0, width: 54, height: 92, velocityX: 0 };

function resize() {
  const density = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * density;
  canvas.height = height * density;
  ctx.setTransform(density, 0, 0, density, 0, 0);
  roadLeft = Math.max(25, width * .18);
  roadRight = width - roadLeft;
  laneWidth = (roadRight - roadLeft) / 4;
  car.y = height - 145;
  if (!running) car.x = width / 2 - car.width / 2;
  stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.7 + .3,
    alpha: Math.random() * .7 + .2
  }));
}

function reset() {
  traffic = [];
  coins = [];
  particles = [];
  score = 0;
  nitro = 100;
  baseSpeed = 5;
  frame = 0;
  car.x = width / 2 - car.width / 2;
  car.velocityX = 0;
  scoreEl.textContent = "0";
  nitroBar.style.width = "100%";
}

function start() {
  playerName = playerNameInput.value.trim() || "无名车手";
  localStorage.setItem("neonRacerName", playerName);
  reset();
  running = true;
  overlay.classList.add("hidden");
}

function burst(x, y, color, count = 12) {
  for (let index = 0; index < count; index++) {
    particles.push({
      x, y,
      velocityX: (Math.random() - .5) * 7,
      velocityY: (Math.random() - .5) * 7,
      life: 1,
      radius: Math.random() * 4 + 2,
      color
    });
  }
}

function laneX(lane, objectWidth) {
  return roadLeft + laneWidth * lane + laneWidth / 2 - objectWidth / 2;
}

function spawn() {
  const lane = Math.floor(Math.random() * 4);
  const enemyWidth = 50 + Math.random() * 10;
  const enemyHeight = 82 + Math.random() * 16;
  traffic.push({
    x: laneX(lane, enemyWidth),
    y: -130,
    width: enemyWidth,
    height: enemyHeight,
    color: `hsl(${Math.random() * 360} 85% 62%)`,
    speed: Math.random() * 2
  });
  if (Math.random() > .42) {
    const coinLane = Math.floor(Math.random() * 4);
    coins.push({ x: laneX(coinLane, 22) + 11, y: -190, radius: 11, spin: 0 });
  }
}

function hit(first, second, padding = 8) {
  return first.x + padding < second.x + second.width &&
    first.x + first.width - padding > second.x &&
    first.y + padding < second.y + second.height &&
    first.y + first.height - padding > second.y;
}

async function end() {
  running = false;
  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  localStorage.setItem("neonRushBest", best);
  bestEl.textContent = best;
  title.textContent = "CRASHED";
  message.innerHTML = `本局得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩正在提交到服务器排行榜。`;
  document.querySelector("#start").textContent = "再来一局";
  overlay.classList.remove("hidden");
  try {
    await api.post("/api/scores", { name: playerName, score: finalScore });
    message.innerHTML = `本局得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>成绩已提交，排行榜已刷新。`;
    await loadLeaderboard();
  } catch (error) {
    message.innerHTML = `本局得分：<b style="color:#61efff;font-size:24px">${finalScore}</b><br>服务器暂时不可用，本机成绩已保存。`;
    setServerState(false);
  }
}

function update() {
  if (!running) return;
  frame++;
  const accelerating = keys.KeyW || keys.ArrowUp;
  boosting = (keys.Space || keys.boost) && nitro > 0;
  nitro = boosting ? Math.max(0, nitro - .8) : Math.min(100, nitro + .13);
  const targetSpeed = accelerating ? 9 : 5;
  baseSpeed += (targetSpeed - baseSpeed) * .035;
  const speed = baseSpeed + (boosting ? 5 : 0);
  score += speed * .025;
  roadOffset = (roadOffset + speed) % 80;

  if (keys.ArrowLeft || keys.KeyA || keys.left) car.velocityX -= 1.15;
  if (keys.ArrowRight || keys.KeyD || keys.right) car.velocityX += 1.15;
  car.velocityX *= .84;
  car.x += car.velocityX;
  car.x = Math.max(roadLeft + 8, Math.min(roadRight - car.width - 8, car.x));

  if (frame % Math.max(48, Math.floor(94 - baseSpeed * 2.1)) === 0) spawn();
  traffic.forEach(enemy => enemy.y += speed - enemy.speed);
  coins.forEach(coin => { coin.y += speed; coin.spin += .12; });
  particles.forEach(particle => {
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;
    particle.life -= .03;
  });

  for (const enemy of traffic) {
    if (hit(car, enemy)) {
      burst(car.x + car.width / 2, car.y + car.height / 2, "#ff4c72", 35);
      return end();
    }
  }

  coins = coins.filter(coin => {
    const collected = Math.hypot(car.x + car.width / 2 - coin.x, car.y + car.height / 2 - coin.y) < 42;
    if (collected) {
      score += 35;
      nitro = Math.min(100, nitro + 18);
      burst(coin.x, coin.y, "#ffe76b", 16);
    }
    return !collected && coin.y < height + 40;
  });

  traffic = traffic.filter(enemy => enemy.y < height + 150);
  particles = particles.filter(particle => particle.life > 0);
  scoreEl.textContent = Math.floor(score);
  speedEl.textContent = Math.floor(speed * 18);
  nitroBar.style.width = `${nitro}%`;
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#070719");
  gradient.addColorStop(1, "#1b0c38");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  stars.forEach(star => {
    star.y += running ? baseSpeed * .08 : .08;
    if (star.y > height) star.y = 0;
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#bbedff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 28;
  ctx.shadowColor = "#d742ff";
  ctx.fillStyle = "#151526";
  ctx.fillRect(roadLeft, 0, roadRight - roadLeft, height);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ff4bd8";
  ctx.fillRect(roadLeft - 4, 0, 4, height);
  ctx.fillStyle = "#48efff";
  ctx.fillRect(roadRight, 0, 4, height);

  ctx.strokeStyle = "#ffffff36";
  ctx.lineWidth = 5;
  ctx.setLineDash([38, 42]);
  ctx.lineDashOffset = roadOffset;
  for (let lane = 1; lane < 4; lane++) {
    ctx.beginPath();
    ctx.moveTo(roadLeft + laneWidth * lane, 0);
    ctx.lineTo(roadLeft + laneWidth * lane, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let y = -80 + roadOffset; y < height; y += 80) {
    ctx.fillStyle = "#d349ff";
    ctx.fillRect(roadLeft - 24, y, 11, 36);
    ctx.fillStyle = "#43efff";
    ctx.fillRect(roadRight + 13, y, 11, 36);
  }
}

function drawCar(vehicle, player = false) {
  ctx.save();
  ctx.translate(vehicle.x + vehicle.width / 2, vehicle.y + vehicle.height / 2);
  if (player && boosting) {
    ctx.fillStyle = "#5ceeff";
    ctx.shadowBlur = 25;
    ctx.shadowColor = "#5ceeff";
    ctx.beginPath();
    ctx.moveTo(-15, vehicle.height / 2);
    ctx.lineTo(0, vehicle.height / 2 + 38 + Math.random() * 18);
    ctx.lineTo(15, vehicle.height / 2);
    ctx.fill();
  }
  ctx.shadowBlur = 20;
  ctx.shadowColor = player ? "#56efff" : vehicle.color;
  ctx.fillStyle = player ? "#61efff" : vehicle.color;
  ctx.beginPath();
  ctx.roundRect(-vehicle.width / 2, -vehicle.height / 2, vehicle.width, vehicle.height, 15);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#090919";
  ctx.beginPath();
  ctx.roundRect(-vehicle.width * .31, -vehicle.height * .2, vehicle.width * .62, vehicle.height * .38, 8);
  ctx.fill();
  ctx.fillStyle = player ? "#fff16b" : "#ffc2d5";
  ctx.fillRect(-vehicle.width * .3, -vehicle.height * .4, 10, 7);
  ctx.fillRect(vehicle.width * .3 - 10, -vehicle.height * .4, 10, 7);
  ctx.fillStyle = "#ff3f68";
  ctx.fillRect(-vehicle.width * .3, vehicle.height * .37, 10, 7);
  ctx.fillRect(vehicle.width * .3 - 10, vehicle.height * .37, 10, 7);
  ctx.restore();
}

function draw() {
  drawBackground();
  coins.forEach(coin => {
    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.scale(Math.abs(Math.cos(coin.spin)) + .15, 1);
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ffe66a";
    ctx.fillStyle = "#ffe66a";
    ctx.beginPath();
    ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  traffic.forEach(enemy => drawCar(enemy));
  particles.forEach(particle => {
    ctx.globalAlpha = particle.life;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  drawCar(car, true);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

function setServerState(online) {
  serverDot.classList.toggle("online", online);
  serverDot.classList.toggle("offline", !online);
  serverText.textContent = online ? "服务器在线" : "服务器离线";
}

function renderLeaderboard(scores) {
  if (!scores.length) {
    leaderboardList.innerHTML = "<li>暂无成绩，快来跑第一局。</li>";
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
    leaderboardList.innerHTML = "<li>服务器未连接，当前只能保存本机最佳成绩。</li>";
  }
}

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

addEventListener("keydown", event => {
  keys[event.code] = true;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
});
addEventListener("keyup", event => { keys[event.code] = false; });
addEventListener("resize", resize);
bindButton("#left", "left");
bindButton("#right", "right");
bindButton("#boost", "boost");
document.querySelector("#start").addEventListener("click", start);
refreshRanks.addEventListener("click", loadLeaderboard);
resize();
loadLeaderboard();
loop();
