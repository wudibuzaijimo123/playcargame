# PlayCarGame（霓虹赛车 · 双人联机）

前端与后端同机部署：`https://game.yhj123.dpdns.org` 由阿里云 nginx 反向代理到本机 Node（127.0.0.1:3210），
页面与 `/api/*` 同源，不再依赖 GitHub Pages。

- 架构 / 改代码说明：[docs/FRAMEWORK.md](docs/FRAMEWORK.md)
- 服务器首次初始化：`bash /opt/playcargame/deploy/bootstrap.sh`
- 日常发布：`pwsh -File scripts/deploy-remote.ps1 -Message "改了什么"`
- 健康检查：`curl https://game.yhj123.dpdns.org/api/health`

## 本地目录

```
index.html  game.js  style.css  assets/    前端
server.js                                    Node 服务（静态 + API）
deploy/                                      nginx / systemd / 部署脚本
scripts/                                     Windows 端发布脚本
data/                                        运行时数据（不进 git）
```
