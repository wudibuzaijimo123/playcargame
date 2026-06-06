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
let speedLines = [];
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
  speedLines = Array.from({ length: 8 }, () => resetSpeedLine({}));
}

function resetSpeedLine(line) {
  line.x = Math.random() * width;
  line.y = -Math.random() * height;
  line.length = Math.random() * 100 + 60;
  line.speed = Math.random() * 18 + 18;
  line.alpha = Math.random() * 0.22 + 0.05;
  return line;
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
    speed: Math.random() * 2,
    type: Math.floor(Math.random() * 3) // 0: Sports, 1: Truck, 2: Sedan
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

  // Exhaust flame particles and tire sparks for the player car
  if (running) {
    if (boosting) {
      for (let i = 0; i < 2; i++) {
        // Left exhaust
        particles.push({
          x: car.x + car.width / 2 - 14 + (Math.random() - 0.5) * 4,
          y: car.y + car.height - 4 + Math.random() * 4,
          velocityX: (Math.random() - 0.5) * 2 - car.velocityX * 0.1,
          velocityY: Math.random() * 3 + 6 + speed * 0.15,
          life: 1,
          radius: Math.random() * 4 + 3,
          color: `hsl(${190 + Math.random() * 30} 100% 70%)` // Cyan/Blue
        });
        // Right exhaust
        particles.push({
          x: car.x + car.width / 2 + 14 + (Math.random() - 0.5) * 4,
          y: car.y + car.height - 4 + Math.random() * 4,
          velocityX: (Math.random() - 0.5) * 2 - car.velocityX * 0.1,
          velocityY: Math.random() * 3 + 6 + speed * 0.15,
          life: 1,
          radius: Math.random() * 4 + 3,
          color: `hsl(${270 + Math.random() * 30} 100% 65%)` // Purple/Magenta
        });
      }
      // Faint fire sparks
      if (Math.random() < 0.3) {
        particles.push({
          x: car.x + car.width / 2 + (Math.random() - 0.5) * 20,
          y: car.y + car.height + 4,
          velocityX: (Math.random() - 0.5) * 4,
          velocityY: Math.random() * 2 + 2,
          life: 0.8,
          radius: Math.random() * 2 + 1,
          color: "#ffffff"
        });
      }
    } else if (frame % 3 === 0) {
      // Normal engine smoke
      particles.push({
        x: car.x + car.width / 2 - 14 + (Math.random() - 0.5) * 2,
        y: car.y + car.height + 2,
        velocityX: (Math.random() - 0.5) * 0.8,
        velocityY: Math.random() * 1.5 + 1.5,
        life: 0.6,
        radius: Math.random() * 2 + 1,
        color: "rgba(255, 255, 255, 0.18)"
      });
      particles.push({
        x: car.x + car.width / 2 + 14 + (Math.random() - 0.5) * 2,
        y: car.y + car.height + 2,
        velocityX: (Math.random() - 0.5) * 0.8,
        velocityY: Math.random() * 1.5 + 1.5,
        life: 0.6,
        radius: Math.random() * 2 + 1,
        color: "rgba(255, 255, 255, 0.18)"
      });
    }

    // Tire drift tracks and sparks on sharp turns
    if (Math.abs(car.velocityX) > 2.2 && Math.random() < 0.4) {
      // Left tire drift spark
      particles.push({
        x: car.x + 4,
        y: car.y + car.height - 10,
        velocityX: -car.velocityX * 0.3 + (Math.random() - 0.5) * 1.5,
        velocityY: Math.random() * 1.5 + 1,
        life: 0.7,
        radius: Math.random() * 2.5 + 1,
        color: "rgba(98, 239, 255, 0.45)"
      });
      // Right tire drift spark
      particles.push({
        x: car.x + car.width - 4,
        y: car.y + car.height - 10,
        velocityX: -car.velocityX * 0.3 + (Math.random() - 0.5) * 1.5,
        velocityY: Math.random() * 1.5 + 1,
        life: 0.7,
        radius: Math.random() * 2.5 + 1,
        color: "rgba(98, 239, 255, 0.45)"
      });
    }
  }

  // Update speed lines during boost
  if (boosting) {
    speedLines.forEach(line => {
      line.y += line.speed + speed * 1.2;
      if (line.y > height) {
        resetSpeedLine(line);
      }
    });
  }

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
    
    // Stretch stars into speed lines when boosting
    if (boosting) {
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x, star.y + star.radius * 7);
      ctx.lineWidth = star.radius * 0.8;
      ctx.strokeStyle = "#bbedff";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  // Draw full-screen speed lines when boosting
  if (boosting) {
    ctx.save();
    ctx.lineWidth = 1.2;
    speedLines.forEach(line => {
      ctx.strokeStyle = `rgba(98, 239, 255, ${line.alpha})`;
      ctx.beginPath();
      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x, line.y + line.length);
      ctx.stroke();
    });
    ctx.restore();
  }

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
  
  // Calculate tilt angle based on horizontal velocity (only for player)
  let tiltAngle = player ? vehicle.velocityX * 0.012 : 0;
  
  // Translate to vehicle center and rotate for body tilt
  ctx.translate(vehicle.x + vehicle.width / 2, vehicle.y + vehicle.height / 2);
  ctx.rotate(tiltAngle);

  // 1. NEON UNDERGLOW
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = player ? "#5ceeff" : vehicle.color;
  ctx.shadowBlur = 25;
  ctx.shadowColor = player ? "#5ceeff" : vehicle.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, vehicle.width * 0.7, vehicle.height * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. WHEELS (Draw 4 tires)
  const wheelW = 10;
  const wheelH = 20;
  const wheelColor = "#0f111a";
  const rimColor = player ? "#5ceeff" : vehicle.color;
  
  // Rear Wheels (facing straight)
  ctx.fillStyle = wheelColor;
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 2;
  
  // Rear-Left Wheel
  ctx.beginPath();
  ctx.roundRect(-vehicle.width / 2 - 4, vehicle.height * 0.18 - wheelH / 2, wheelW, wheelH, 4);
  ctx.fill();
  ctx.stroke();
  
  // Rear-Right Wheel
  ctx.beginPath();
  ctx.roundRect(vehicle.width / 2 - wheelW + 4, vehicle.height * 0.18 - wheelH / 2, wheelW, wheelH, 4);
  ctx.fill();
  ctx.stroke();

  // Front Wheels (Steerable for player)
  ctx.save();
  let steerAngle = player ? Math.max(-0.25, Math.min(0.25, vehicle.velocityX * 0.05)) : 0;
  
  // Front-Left Wheel
  ctx.save();
  ctx.translate(-vehicle.width / 2 + wheelW / 2 - 4, -vehicle.height * 0.25);
  ctx.rotate(steerAngle);
  ctx.beginPath();
  ctx.roundRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  
  // Front-Right Wheel
  ctx.save();
  ctx.translate(vehicle.width / 2 - wheelW / 2 + 4, -vehicle.height * 0.25);
  ctx.rotate(steerAngle);
  ctx.beginPath();
  ctx.roundRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  
  ctx.restore(); // end wheels

  // 3. BODY DRAWING
  if (player) {
    // ---- PLAYER SUPER CAR ----
    // Gradient for player body
    let bodyGrad = ctx.createLinearGradient(0, -vehicle.height / 2, 0, vehicle.height / 2);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.2, "#3ce9ff");
    bodyGrad.addColorStop(0.8, "#1a1235");
    bodyGrad.addColorStop(1, "#0d0620");
    ctx.fillStyle = bodyGrad;
    
    // Cyberpunk sports car shape path
    ctx.beginPath();
    ctx.moveTo(0, -vehicle.height * 0.52); // Front center nose
    ctx.lineTo(vehicle.width * 0.32, -vehicle.height * 0.42); // Front-Right headlight corner
    ctx.lineTo(vehicle.width * 0.44, -vehicle.height * 0.22); // Front-Right fender
    ctx.lineTo(vehicle.width * 0.42, 0); // Cabin side right
    ctx.lineTo(vehicle.width * 0.5, vehicle.height * 0.32); // Rear-Right wheel arch
    ctx.lineTo(vehicle.width * 0.48, vehicle.height * 0.46); // Rear wing right tip
    ctx.lineTo(vehicle.width * 0.25, vehicle.height * 0.44); // Rear spoiler inside right
    ctx.lineTo(0, vehicle.height * 0.40); // Rear center exhaust area
    ctx.lineTo(-vehicle.width * 0.25, vehicle.height * 0.44); // Rear spoiler inside left
    ctx.lineTo(-vehicle.width * 0.48, vehicle.height * 0.46); // Rear wing left tip
    ctx.lineTo(-vehicle.width * 0.5, vehicle.height * 0.32); // Rear-Left wheel arch
    ctx.lineTo(-vehicle.width * 0.42, 0); // Cabin side left
    ctx.lineTo(-vehicle.width * 0.44, -vehicle.height * 0.22); // Front-Left fender
    ctx.lineTo(-vehicle.width * 0.32, -vehicle.height * 0.42); // Front-Left headlight corner
    ctx.closePath();
    
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#3ce9ff";
    ctx.fill();
    ctx.restore();

    // Body Neon Accents/Stripe
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-vehicle.width * 0.15, -vehicle.height * 0.35);
    ctx.lineTo(0, -vehicle.height * 0.45);
    ctx.lineTo(vehicle.width * 0.15, -vehicle.height * 0.35);
    ctx.stroke();

    // Windshield & Cabin Glass
    let glassGrad = ctx.createLinearGradient(0, -vehicle.height * 0.15, 0, vehicle.height * 0.15);
    glassGrad.addColorStop(0, "#081026");
    glassGrad.addColorStop(0.5, "#15335e");
    glassGrad.addColorStop(1, "#3690b5");
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(-vehicle.width * 0.24, -vehicle.height * 0.16, vehicle.width * 0.48, vehicle.height * 0.32, [8, 8, 4, 4]);
    ctx.fill();
    // Glass highlight shine
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-vehicle.width * 0.15, -vehicle.height * 0.12);
    ctx.lineTo(vehicle.width * 0.1, vehicle.height * 0.12);
    ctx.stroke();

    // Headlights (LED Yellow/Cyan dots)
    ctx.fillStyle = "#fff16b";
    ctx.fillRect(-vehicle.width * 0.28, -vehicle.height * 0.44, 7, 4);
    ctx.fillRect(vehicle.width * 0.28 - 7, -vehicle.height * 0.44, 7, 4);

    // Taillights (Red neon stripe at the spoiler base)
    ctx.strokeStyle = "#ff2255";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#ff2255";
    ctx.beginPath();
    ctx.moveTo(-vehicle.width * 0.32, vehicle.height * 0.41);
    ctx.lineTo(vehicle.width * 0.32, vehicle.height * 0.41);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Headlight Beams (Draw 2 cones of light projecting forward)
    ctx.save();
    let beamGrad = ctx.createLinearGradient(0, -vehicle.height / 2, 0, -vehicle.height / 2 - 140);
    beamGrad.addColorStop(0, "rgba(98, 239, 255, 0.35)");
    beamGrad.addColorStop(1, "rgba(98, 239, 255, 0)");
    ctx.fillStyle = beamGrad;
    
    // Left beam
    ctx.beginPath();
    ctx.moveTo(-vehicle.width * 0.25, -vehicle.height * 0.45);
    ctx.lineTo(-vehicle.width * 0.25 - 30, -vehicle.height * 0.45 - 140);
    ctx.lineTo(-vehicle.width * 0.25 + 30, -vehicle.height * 0.45 - 140);
    ctx.closePath();
    ctx.fill();

    // Right beam
    ctx.beginPath();
    ctx.moveTo(vehicle.width * 0.25, -vehicle.height * 0.45);
    ctx.lineTo(vehicle.width * 0.25 - 30, -vehicle.height * 0.45 - 140);
    ctx.lineTo(vehicle.width * 0.25 + 30, -vehicle.height * 0.45 - 140);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

  } else {
    // ---- TRAFFIC VEHICLES ----
    // Select styling based on type: 0 = Sports, 1 = Cyber-truck, 2 = Sedan
    let type = vehicle.type !== undefined ? vehicle.type : 0;
    
    ctx.fillStyle = vehicle.color;
    
    if (type === 1) {
      // Cyber Truck (Boxy, armored look)
      ctx.beginPath();
      ctx.roundRect(-vehicle.width / 2, -vehicle.height / 2, vehicle.width, vehicle.height, 4);
      ctx.fill();
      
      // Cyber Truck cabin line
      ctx.fillStyle = "#111422";
      ctx.beginPath();
      ctx.roundRect(-vehicle.width * 0.38, -vehicle.height * 0.2, vehicle.width * 0.76, vehicle.height * 0.36, 2);
      ctx.fill();

      // Horizontal bright light strip (front and back)
      ctx.strokeStyle = "#fff16b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-vehicle.width * 0.42, -vehicle.height * 0.46);
      ctx.lineTo(vehicle.width * 0.42, -vehicle.height * 0.46);
      ctx.stroke();

      ctx.strokeStyle = "#ff2255";
      ctx.beginPath();
      ctx.moveTo(-vehicle.width * 0.42, vehicle.height * 0.46);
      ctx.lineTo(vehicle.width * 0.42, vehicle.height * 0.46);
      ctx.stroke();

    } else if (type === 2) {
      // Futuristic Sedan (Sleek, rounded curves)
      ctx.beginPath();
      ctx.roundRect(-vehicle.width / 2, -vehicle.height / 2, vehicle.width, vehicle.height, 14);
      ctx.fill();

      // Rounded windshield and back window
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath();
      ctx.roundRect(-vehicle.width * 0.32, -vehicle.height * 0.25, vehicle.width * 0.64, vehicle.height * 0.45, 6);
      ctx.fill();
      
      // Headlights (Cyan dots)
      ctx.fillStyle = "#fff16b";
      ctx.fillRect(-vehicle.width * 0.28, -vehicle.height * 0.46, 6, 4);
      ctx.fillRect(vehicle.width * 0.28 - 6, -vehicle.height * 0.46, 6, 4);

      // Taillights
      ctx.fillStyle = "#ff2255";
      ctx.fillRect(-vehicle.width * 0.32, vehicle.height * 0.42, 8, 4);
      ctx.fillRect(vehicle.width * 0.32 - 8, vehicle.height * 0.42, 8, 4);
    } else {
      // Sports Car (Sleek aerodynamic corners)
      ctx.beginPath();
      ctx.moveTo(0, -vehicle.height * 0.5);
      ctx.lineTo(vehicle.width * 0.45, -vehicle.height * 0.38);
      ctx.lineTo(vehicle.width * 0.45, vehicle.height * 0.38);
      ctx.lineTo(vehicle.width * 0.35, vehicle.height * 0.46);
      ctx.lineTo(-vehicle.width * 0.35, vehicle.height * 0.46);
      ctx.lineTo(-vehicle.width * 0.45, vehicle.height * 0.38);
      ctx.lineTo(-vehicle.width * 0.45, -vehicle.height * 0.38);
      ctx.closePath();
      ctx.fill();

      // Spoiler at rear
      ctx.fillStyle = "#0c0d14";
      ctx.fillRect(-vehicle.width * 0.4, vehicle.height * 0.4, vehicle.width * 0.8, 5);

      // Cabin glass
      ctx.fillStyle = "#0a0c16";
      ctx.beginPath();
      ctx.roundRect(-vehicle.width * 0.26, -vehicle.height * 0.18, vehicle.width * 0.52, vehicle.height * 0.35, 4);
      ctx.fill();

      // Lights
      ctx.fillStyle = "#fff16b";
      ctx.fillRect(-vehicle.width * 0.3, -vehicle.height * 0.42, 6, 4);
      ctx.fillRect(vehicle.width * 0.3 - 6, -vehicle.height * 0.42, 6, 4);

      ctx.fillStyle = "#ff2255";
      ctx.fillRect(-vehicle.width * 0.35, vehicle.height * 0.38, 7, 4);
      ctx.fillRect(vehicle.width * 0.35 - 7, vehicle.height * 0.38, 7, 4);
    }
  }

  ctx.restore();
}

function draw() {
  drawBackground();
  coins.forEach(coin => {
    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.scale(Math.abs(Math.cos(coin.spin)) + .15, 1);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#ffe66a";
    ctx.fillStyle = "#ffe66a";
    ctx.beginPath();
    ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw inner neon border and details
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#080b18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, coin.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw "C" in center
    ctx.fillStyle = "#080b18";
    ctx.font = "bold 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("C", 0, 0);
    
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
