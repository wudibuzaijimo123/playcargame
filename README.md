# Neon Racer

一个可以部署到服务器的前后端小游戏2。前端是 Canvas 霓虹赛车，后端是 Node.js HTTP 服务，负责静态资源托管、健康检查和服务器排行榜。

## 本地运行

```bash
npm start
```

打开：

```text
http://localhost:3000
```

## 接口

```text
GET /api/health
GET /api/scores
POST /api/scores
```

提交成绩示例：

```json
{
  "name": "玩家",
  "score": 1200
}
```

## 部署

上传整个项目到服务器后，安装 Node.js 18 或以上版本，然后运行：

```bash
npm start
```

生产环境可以用服务器平台提供的 `PORT` 环境变量，程序会自动读取：

```bash
PORT=8080 npm start
```

排行榜数据保存在：

```text
data/scores.json
```
