# PlayCarGame 框架说明（给后续改游戏逻辑用）

## 1. 现在的架构

```
浏览器
  └─ https://game.yhj123.dpdns.org/          → 阿里云 47.86.40.17 (nginx 443)
        └─ proxy_pass 127.0.0.1:3210         → playcargame.service (Node)
              ├─ 静态文件: /opt/playcargame/{index.html,game.js,style.css,assets/}
              └─ 接口:     /api/*            （同源，前端不再跨域）
  └─ https://api.game.yhj123.dpdns.org/      → 同一个 3210（保留给外部调用/兼容）
```

- 前端**不再走 GitHub Pages**，`CNAME` 文件仅为历史遗留，可删。
- 前端所有请求都写成相对路径 `/api/...`，因此换域名不用改代码。
- 服务器端口：3210 = Node 应用；80/443 = nginx；其它端口属于既有面板（宝塔、x-ui、subconverter 等），**不要动**。

## 2. 目录

```
/opt/playcargame
├── index.html          页面骨架（HUD、排行榜容器、按钮）
├── game.js             游戏主体：场景、物理、AI 车流、联机同步、排行榜渲染
├── style.css           全部样式
├── assets/             素材（three.min.js、音频）
├── server.js           Node 服务：静态托管 + /api/scores + /api/race/*
├── data/scores.json    排行榜数据（不进 git，发布时保留）
├── deploy/             nginx 配置、systemd 单元、bootstrap.sh、deploy.sh
└── scripts/            Windows 端发布脚本
```

## 3. 日常发布

```powershell
# Windows 本地：提交 + 推送 + 远端重启
pwsh -File D:\playcargame\scripts\deploy-remote.ps1 -Message "改了什么"

# 服务器上（或 SSH 执行）
bash /opt/playcargame/deploy/deploy.sh
```

发布脚本会 `git pull` → 重启 `playcargame.service` → `nginx -t` 校验 → 健康检查。

## 4. 首次部署 / 换机

```bash
bash /opt/playcargame/deploy/bootstrap.sh
```
会自动备份旧目录、克隆仓库、恢复 `data/`、装 systemd + nginx、签证书。
前置条件：`game.yhj123.dpdns.org` 的 A 记录已指向 `47.86.40.17`，且 Cloudflare 关闭代理（灰云），否则 HTTP-01 签发失败。

## 5. 接口清单（改逻辑时对照）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET  | `/api/health` | 存活检查 |
| GET  | `/api/scores` | 取排行榜 |
| POST | `/api/scores` | 提交成绩 `{name, score}` |
| POST | `/api/race/rooms` | `{action:"create"}` 建房 / `{action:"join", roomCode}` 加入 |
| POST | `/api/race/state` | 上报自己状态 `{roomCode, playerId, x, heading, speed, distance}` |
| GET  | `/api/race/state?roomCode=&playerId=` | 拉对手状态（返回 players 数组） |

房间存在内存里（`Map`），服务重启即清空；每个玩家 5 秒不上报就被剔除。

## 6. 交给 ChatGPT 修的三件事（当前已知问题）

1. **排行榜渲染错乱**：列表项出现了 `1. 1.1`、`3. 3.无名车手`，说明排名序号被拼进了名字。
   看 `game.js` 里渲染 `#leaderboardList` 的那段：只输出 `序号. 名字`，名字单独取自 `entry.name`，不要和 `entry.rank/index` 拼接。
2. **看不到对手**：`syncRaceRoom()` 每 160ms 轮询，对手车 `remoteCar` 只在 `result.players[0]` 存在时创建/更新。
   需要在建房成功后立即创建对手占位、并按对手 `x/heading` 做插值；同时确认 `roomStatus` 有反馈，避免玩家以为没连上。
3. **路上突然冒出很多车、撞上就死**：AI 车流生成位置与玩家起点/车道未对齐，且联机模式下 AI 车仍在本地生成，两人看到的不一致。
   建议：单机与联机分开配置车流；联机时减少或关闭 AI 车，或由服务端下发固定种子生成，避免"幽灵车"。

## 7. 别动的东西

- `/etc/nginx/conf.d/` 下除 `game.yhj123.dpdns.org.conf` 之外的配置（baota / convert / test / acme-* / subconverter-*）。
- 宝塔面板（10254）、x-ui、docker 8443、subconverter 等既有服务与端口。
- `playcargame.service` 的 `PORT=3210`，改端口要同步改 nginx 反代。
