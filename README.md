# 离线单机版 · PlayCarGame（3D 公路竞速）

在线演示（GitHub Pages 纯静态）：<https://game.yhj123.dpdns.org/>  
GitHub（纯单机版）：<https://github.com/wudibuzaijimo123/playcargame>  
双人联机版仓库（含 Node 后端）：<https://github.com/wudibuzaijimo123/zaixianyouxi>

纯前端纯单机版本：不连后端、无需任何数据库或联机配置，所有成绩保存在本地浏览器 `localStorage`，适合单人刷纪录或离线托管到任意静态服务器（Nginx / GitHub Pages / 本地 localhost）。

---

## 🚀 一、本地运行（Localhost）

无需 `npm install`、不依赖 CDN，只要启动任意一个静态文件服务器即可访问：

### 方式 1：使用 Python（系统自带最省事）

```bash
git clone https://github.com/wudibuzaijimo123/playcargame.git
cd playcargame

python -m http.server 8080
# 如果系统命令是 python3，则运行：python3 -m http.server 8080
```

浏览器打开：<http://localhost:8080/>

### 方式 2：使用 Node.js

```bash
npx --yes serve . -l 8080
```

浏览器打开：<http://localhost:8080/>

> 为什么建议起 `localhost` 而不是直接双击 `index.html`？因为浏览器对 `file://` 协议下的音频流式播放、部分传感器与 `localStorage` 限制较多，通过 `http://localhost:8080/` 打开体验最完整。

---

## ☁️ 二、部署到自己的静态服务器（Nginx 示例）

将本仓库所有文件上传到服务器目录（例如 `/var/www/playcargame`），配置 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/playcargame;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

重载 Nginx 即可生效：`nginx -t && systemctl reload nginx`；也可以直接推送到任意仓库打开 **GitHub Pages** 托管。

---

## 🎮 三、特性与玩法

- **4 大实景主题与逼真天空景深**：🌾 乡间小路 / 🏝️ 逃离荒岛 / 🌴 丛林狂飙 / 🌊 沿河峡谷；渐变天空穹顶搭配高空柔软白云，远山景深视差与高速气流破风线。
- **复合长弯道与赛程**：支持 **3 km / 5 km（默认）/ 8 km / 12 km** 赛程；每 2400 m 一圈复合 S 弯与发卡弯，左上角配有 CS:GO 风格圆形战术雷达。
- **驾驶与操控**：最高时速 `200 km/h`，具备真实渐进刹车减速度、加速抬头/刹车点头纵倾感；电脑支持自定义快捷键（默认 `W / S / 左 Shift / ← →`），手机支持左右拇指操控与倾斜转向及震动反馈。
- **音乐与声效**：内置 7 首邓紫棋歌单顺序循环，默认开启播放，也可随时在入口页及局内点击右上角 `🔊 / 🔇` 一键静音或本地加选音乐。

## 📁 四、文件说明与本地成绩存储

| 文件 / 目录 | 作用 |
| --- | --- |
| [`index.html`](index.html) | 页面结构：3D 画布、CS:GO 雷达、HUD、本机排行榜、音乐按钮与操控面板 |
| [`game.js`](game.js) | 核心逻辑：Three.js 3D 场景与车模、2400m 环山赛道、车辆动力学、AI 车流、小地图与音乐引擎 |
| [`style.css`](style.css) | 界面样式与手机端响应式布局 |
| [`assets/`](assets) | 本地 `three.min.js`、音效及 7 首 MP3 歌单 |

浏览器 `localStorage` 存储键值：
- `racerLocalScores`：本机最快用时榜单（姓名 + 用时）
- `racerBestTime`：个人最佳用时
- `neonRacerName`：上次使用的车手昵称
- `racerAudioEnabled`：静音 / 声音开关记忆
