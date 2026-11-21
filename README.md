# 离线单机版 · PlayCarGame（3D赛车 公路竞速）

在线演示（GitHub Pages 纯静态）：<https://wudibuzaijimo123.github.io/playcargame/>  
GitHub（纯单机版）：<https://github.com/wudibuzaijimo123/playcargame>  
双人在线版演示
离线单机版 · PlayCarGame（3D 公路竞速）
在线演示（GitHub Pages 纯静态）：https://wudibuzaijimo123.github.io/playcargame/
GitHub（纯单机版）：https://github.com/wudibuzaijimo123/playcargame
双人联机版
在线演示(https://api.game.yhj123.dpdns.org)
仓库:https://github.com/wudibuzaijimo123/zaixianyouxi

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

- **得分 + 用时双计分体系**：HUD 实时同步展示 **当前车速、当前得分、比赛用时** 与 **历史最高分 / 最快用时**；吃金币和高速行驶均可加分，本机排行榜同时保存并展示 **得分 + 用时**（按高分优先、同分按最快用时排序）。
- **4 大实景主题与逼真天空景深**：🌾 乡间小路 / 🏝️ 逃离荒岛 / 🌴 丛林狂飙 / 🌊 沿河峡谷；渐变天空穹顶搭配高空柔软白云、远山景深视差与高速气流破风线。
- **QQ 飞车式连续弯曲赛道与追焦镜头**：采用每 `2.5m` 细分横断面连续 3D 弯曲路面、红白竞速路肩与弯道自然内倾，支持 **3 km / 5 km（默认）/ 8 km / 12 km** 复合长弯道与发卡弯；漂移过弯时第三人称镜头会弹性咬住车尾方向，左上角配有 CS:GO 风格圆形战术雷达。
- **驾驶与操控**：最高时速 `200 km/h`，具备真实渐进刹车减速度、加速抬头/刹车点头纵倾感；电脑支持自定义快捷键（默认 `W / S / 左 Shift / ← →`），手机支持左右拇指操控与倾斜转向及震动反馈。
- **音乐与声效**：内置 7 首邓紫棋歌单顺序循环，进入入口页即可在右上角 `🔊 / 🔇` 一键静音或开启，也支持在菜单里临时加选本地音乐；音频按需加载，不拖慢首屏启动。

## 📁 四、文件说明与本地成绩存储

| 文件 / 目录 | 作用 |
| --- | --- |
| [`index.html`](index.html) | 页面结构：3D 画布、CS:GO 雷达、双计分 HUD（得分+用时）、本机排行榜、音乐按钮与操控面板 |
| [`game.js`](game.js) | 核心逻辑：连续弯曲 3D 丝带赛道、过弯追焦相机、车辆动力学、AI 车流、小地图与双引擎音频 |
| [`style.css`](style.css) | 界面样式与桌面/移动端响应式布局 |
| [`assets/`](assets) | 本地 `three.min.js`、音效及 7 首 MP3 歌单（完全免外部 CDN / 字体阻塞） |

浏览器 `localStorage` 存储键值：
- `racerLocalScores`：本机挑战榜单（姓名 + 得分 + 用时）
- `neonRushBest`：个人历史最高得分
- `racerBestTime`：个人最快完赛用时
- `neonRacerName`：上次使用的车手昵称
- `racerAudioEnabled`：静音 / 声音开关记忆
