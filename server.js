const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const scoreFile = path.join(dataDir, "scores.json");
const port = Number(process.env.PORT || 3000);
const raceRooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav"
};

ensureDataFile();

const server = http.createServer(async (request, response) => {
  try {
    // 允许 GitHub Pages 与自建站点跨域调用：回显 Origin，没有 Origin 时用 *
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin || "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      return response.end();
    }
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, service: "neon-racer", time: new Date().toISOString() });
    }

    if (request.method === "GET" && url.pathname === "/api/scores") {
      return sendJson(response, 200, { scores: readScores() });
    }

    if (request.method === "POST" && url.pathname === "/api/scores") {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const entry = normalizeScore(payload);
      if (!entry) {
        return sendJson(response, 400, { error: "请输入 1-16 位玩家名，并提交有效用时。" });
      }
      // 同一名字只留最快的一次
      const best = new Map();
      readScores().forEach(item => best.set(String(item.name || "").trim().toLowerCase(), item));
      const key = String(entry.name).trim().toLowerCase();
      const kept = best.get(key);
      if (!kept || Number(entry.time) < Number(kept.time)) best.set(key, entry);
      const scores = [...best.values()]
        .filter(item => String(item.name || "").trim())
        .sort((left, right) => Number(left.time) - Number(right.time))
        .slice(0, 20);
      writeScores(scores);
      return sendJson(response, 201, { saved: entry, scores });
    }

    if (request.method === "POST" && url.pathname === "/api/race/rooms") {
      const body = JSON.parse(await readBody(request) || "{}");
      const name = String(body.name || "车手").slice(0, 16);
      let roomCode = String(body.roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      const action = String(body.action || "join");

      // 手动房号：两人输同一个号就能进，先到的人负责建房间
      if (action === "create" && !roomCode) {
        roomCode = Math.random().toString(36).slice(2, 6).toUpperCase();
      }
      if (action === "join" && roomCode.length < 3) {
        return sendJson(response, 400, { error: "房间号至少 3 位，两人输一样的号就能进同一个房间。" });
      }
      if (action === "create") {
        const finishDistance = Math.max(300, Math.min(20000, Number(body.finishDistance) || 1500));
        const existing = raceRooms.get(roomCode);
        if (existing && existing.players.size >= 2) {
          return sendJson(response, 409, { error: "这个房间号已经满了，换一个吧。" });
        }
        if (!existing) {
          raceRooms.set(roomCode, { players: new Map(), updatedAt: Date.now(), startAt: 0, finishDistance });
        }
      }

      let room = raceRooms.get(roomCode);
      if (!room && action === "join") {
        // 输入的房间号还不存在 → 直接把输入的人当成房主建出来
        const finishDistance = Math.max(300, Math.min(20000, Number(body.finishDistance) || 1500));
        room = { players: new Map(), updatedAt: Date.now(), startAt: 0, finishDistance };
        raceRooms.set(roomCode, room);
      }
      if (!room) return sendJson(response, 404, { error: "房间不存在，请检查房间码。" });
      for (const [id, player] of room.players) {
        if (Date.now() - player.updatedAt > 15000) room.players.delete(id);
      }
      if (room.players.size >= 2) return sendJson(response, 409, { error: "房间已满，先让对方退出房间或等 4 秒掉线后再进。" });
      const playerId = Math.random().toString(36).slice(2, 12);
      // 起跑车道和车身颜色都由服务器分配，两边看到的是同一套
      const lane = room.players.size === 0 ? -1 : 1;
      const color = room.players.size === 0 ? "#ffffff" : "#ff9a3c";
      room.players.set(playerId, {
        id: playerId, name, lane, color, x: 0, heading: 0, speed: 0, distance: 0,
        finished: false, updatedAt: Date.now()
      });
      room.updatedAt = Date.now();

      // 两人到齐 → 安排统一起跑时刻（4 秒倒计时），双方同时归零起步
      if (room.players.size >= 2 && !room.startAt) {
        room.startAt = Date.now() + 4000;
      }
      if (room.players.size < 2) {
        room.startAt = 0;
      }

      return sendJson(response, 200, {
        roomCode, playerId,
        startAt: room.startAt || 0,
        serverNow: Date.now(),
        finishDistance: room.finishDistance,
        playerCount: room.players.size,
        lane,
        color
      });
    }

    if (url.pathname === "/api/race/state" && request.method === "POST") {
      const body = JSON.parse(await readBody(request) || "{}");
      const room = raceRooms.get(String(body.roomCode || "").toUpperCase());
      if (!room || !room.players.has(body.playerId)) return sendJson(response, 404, { error: "联机房间已失效。" });
      const player = room.players.get(body.playerId);
      for (const key of ["x", "heading", "speed", "distance"]) player[key] = Number.isFinite(Number(body[key])) ? Number(body[key]) : player[key];
      if (typeof body.finished === "boolean") {
        player.finished = body.finished;
        if (body.finished && !player.finishTime) {
          const t = Number(body.time);
          if (Number.isFinite(t) && t > 0) player.finishTime = Math.round(t * 10) / 10;
          const sp = Number(body.speed);
          if (Number.isFinite(sp) && sp > 0) player.finishSpeed = Math.round(sp * 90);
        }
      }
      for (const [id, other] of room.players) {
        if (id !== body.playerId && Date.now() - other.updatedAt > 15000) room.players.delete(id);
      }
      if (room.players.size < 2) room.startAt = 0;
      if (room.players.size >= 2 && !room.startAt) room.startAt = Date.now() + 4000;
      player.updatedAt = room.updatedAt = Date.now();
      // 临时诊断：每 5 秒打印一次房间内每位车手的里程，用于定位"原地不动"
      if (!room._logAt || Date.now() - room._logAt > 5000) {
        room._logAt = Date.now();
        const roster = [...room.players.values()]
          .map(p => `${p.name}:dist=${Number(p.distance).toFixed(1)},spd=${Number(p.speed).toFixed(2)}`)
          .join(" | ");
        console.log(`[room ${String(body.roomCode || "").toUpperCase()}] players=${room.players.size} startAt=${room.startAt} ${roster}`);
      }
      return sendJson(response, 200, {
        ok: true,
        startAt: room.startAt || 0,
        serverNow: Date.now(),
        finishDistance: room.finishDistance,
        playerCount: room.players.size,
        // 顺手把对手状态带回去，省掉客户端每帧一次的 GET
        players: [...room.players.values()].filter(p => p.id !== body.playerId && Date.now() - p.updatedAt < 15000)
      });
    }

    if (url.pathname === "/api/race/state" && request.method === "GET") {
      const room = raceRooms.get(String(url.searchParams.get("roomCode") || "").toUpperCase());
      if (!room) return sendJson(response, 404, { error: "联机房间已失效。" });
      const playerId = url.searchParams.get("playerId");
      return sendJson(response, 200, {
        players: [...room.players.values()].filter(player => player.id !== playerId && Date.now() - player.updatedAt < 15000),
        startAt: room.startAt || 0,
        serverNow: Date.now(),
        finishDistance: room.finishDistance
      });
    }

    // 退出房间：立刻释放座位，方便同一个号重新进入
    if (request.method === "POST" && url.pathname === "/api/race/leave") {
      const body = JSON.parse(await readBody(request) || "{}");
      const code = String(body.roomCode || "").toUpperCase();
      const room = raceRooms.get(code);
      if (room) {
        room.players.delete(String(body.playerId || ""));
        room.startAt = 0;
        room.updatedAt = Date.now();
      }
      return sendJson(response, 200, { ok: true });
    }

    // 实时推送：SSE，服务端每 40ms 推一次房间内两人的状态，免去客户端轮询延迟
    if (url.pathname === "/api/race/stream" && request.method === "GET") {
      const code = String(url.searchParams.get("roomCode") || "").toUpperCase();
      const viewerId = url.searchParams.get("playerId") || "";
      const room = raceRooms.get(code);
      if (!room) return sendJson(response, 404, { error: "房间不存在" });

      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": request.headers.origin || "*"
      });

      const push = () => {
        const players = [...room.players.values()].filter(p => p.id !== viewerId);
        const data = {
          players,
          startAt: room.startAt || 0,
          serverNow: Date.now(),
          finishDistance: room.finishDistance,
          playerCount: room.players.size
        };
        try {
          response.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          /* 连接已断开 */
        }
      };
      push();
      const timer = setInterval(push, 40);
      const stop = () => {
        clearInterval(timer);
        try { response.end(); } catch (error) { /* ignore */ }
      };
      request.on("close", stop);
      request.on("error", stop);
      return;
    }

    if (request.method !== "GET") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Neon Racer server running at http://localhost:${port}`);
});

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(scoreFile)) {
    fs.writeFileSync(scoreFile, "[]\n", "utf8");
  }
}

function readScores() {
  try {
    const scores = JSON.parse(fs.readFileSync(scoreFile, "utf8"));
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
}

function writeScores(scores) {
  fs.writeFileSync(scoreFile, `${JSON.stringify(scores, null, 2)}\n`, "utf8");
}

function normalizeScore(payload) {
  const name = String(payload.name || "").trim().slice(0, 16);
  // 现在比赛比的是用时（秒），越小越好
  const time = Number(payload.time);
  if (!name || !Number.isFinite(time) || time <= 0 || time > 36000) {
    return null;
  }
  return {
    name,
    time: Math.round(time * 10) / 10,
    createdAt: new Date().toISOString()
  };
}

function serveStatic(urlPath, response) {
  const safePath = decodeURIComponent(urlPath.split("?")[0]);
  const target = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.normalize(path.join(rootDir, target));

  if (!filePath.startsWith(rootDir)) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(rootDir, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          return sendJson(response, 404, { error: "Not found" });
        }
        response.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        response.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    response.end(content);
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
