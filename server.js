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
        return sendJson(response, 400, { error: "请输�?1-16 位玩家名，并提交有效分数�? });
      }
      const scores = [entry, ...readScores()]
        .sort((left, right) => right.score - left.score)
        .slice(0, 20);
      writeScores(scores);
      return sendJson(response, 201, { saved: entry, scores });
    }

    if (request.method === "POST" && url.pathname === "/api/race/rooms") {
      const body = JSON.parse(await readBody(request) || "{}");
      const name = String(body.name || "车手").slice(0, 16);
      let roomCode = String(body.roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (body.action === "create") {
        roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        raceRooms.set(roomCode, { players: new Map(), updatedAt: Date.now() });
      }
      const room = raceRooms.get(roomCode);
      if (!room) return sendJson(response, 404, { error: "房间不存在，请检查房间码�? });
      for (const [id, player] of room.players) {
        if (Date.now() - player.updatedAt > 5000) room.players.delete(id);
      }
      if (room.players.size >= 2) return sendJson(response, 409, { error: "房间已满（最多两名车手）�? });
      const playerId = Math.random().toString(36).slice(2, 12);
      room.players.set(playerId, { id: playerId, name, x: 0, heading: 0, speed: 0, distance: 0, updatedAt: Date.now() });
      room.updatedAt = Date.now();
      return sendJson(response, 200, { roomCode, playerId });
    }

    if (url.pathname === "/api/race/state" && request.method === "POST") {
      const body = JSON.parse(await readBody(request) || "{}");
      const room = raceRooms.get(String(body.roomCode || "").toUpperCase());
      if (!room || !room.players.has(body.playerId)) return sendJson(response, 404, { error: "联机房间已失效�? });
      const player = room.players.get(body.playerId);
      for (const key of ["x", "heading", "speed", "distance"]) player[key] = Number.isFinite(Number(body[key])) ? Number(body[key]) : player[key];
      player.updatedAt = room.updatedAt = Date.now();
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/api/race/state" && request.method === "GET") {
      const room = raceRooms.get(String(url.searchParams.get("roomCode") || "").toUpperCase());
      if (!room) return sendJson(response, 404, { error: "联机房间已失效�? });
      const playerId = url.searchParams.get("playerId");
      return sendJson(response, 200, { players: [...room.players.values()].filter(player => player.id !== playerId && Date.now() - player.updatedAt < 5000) });
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
  const score = Math.floor(Number(payload.score));
  if (!name || !Number.isFinite(score) || score < 0) {
    return null;
  }
  return {
    name,
    score,
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
