# 微信小游戏前端

本目录是横屏微信小游戏，入口为 `game.js`，不是普通 WXML 小程序。

## 本地构建

需要 Node.js 18+ 和 ffmpeg。构建脚本将原 `../src/` 的模型、动画、地图、数据、战斗逻辑和视觉同步代码打包成 CommonJS 模块，并从原音乐槽提取音频。Ogg/Opus 转为 MP3，音频放在独立分包。构建无 npm 第三方依赖。

```sh
cd wechat-client
npm run build
npm test
npm run preview
```

浏览器预览：<http://127.0.0.1:8080>。预览用于界面与逻辑检查；微信客户端兼容、横屏、安全区和手机性能需要真机验收。

## 导入微信开发者工具

1. 先运行 `npm run build`，生成 `dist/` 和音频分包；`config.local.js` 只在缺失时创建空文件，不会覆盖已有配置。
2. 导入本目录，项目类型选择小游戏。
3. 将 `project.config.json` 的 `touristappid` 替换为自己的小游戏 AppID。
4. 本地预览无需后端：`config.local.js` 的 `apiBase` 留空即可使用本地存档。
5. 云存档需填写后端地址，并在微信管理后台配置 request 合法域名；音频已随分包打包，无外部下载域名。

```js
// config.local.js（已加入 .gitignore）
module.exports = {
  apiBase: 'https://your-api.example.com',
  requestTimeout: 10000,
  quality: 'low',            // low / medium / high
  adaptiveResolution: true,  // 帧率不足时自动降渲染分辨率
  antialias: true            // MSAA；个别机型报错时设 false
};
```

手机不能通过 `127.0.0.1` 连接电脑后端。联调时使用可达的接口地址；正式环境使用配置过的 HTTPS 域名。AppSecret 只配置在后端。

### 本地 Docker 后端联调

```sh
cd backend && docker compose --profile app up -d api   # 127.0.0.1:8000
```

- **开发者工具**：`config.local.js` 写 `apiBase: 'http://127.0.0.1:8000'`，并在项目设置里取消「校验合法域名」（`project.private.config.json` 已关闭 `urlCheck`）。`wx.login` 返回的真实 code 由后端用 AppID/AppSecret 换 openid，无需改动后端。
- **真机调试**：手机访问不到电脑的 127.0.0.1。用 `API_BIND=0.0.0.0 API_PORT=8000 docker compose --profile app up -d api` 让后端监听局域网，把 `apiBase` 改成电脑局域网地址（如 `http://192.168.1.20:8000`），真机调试同样需要关闭域名校验。
- **浏览器预览**：默认不连后端。`?api=8000`（或 `?api=http://host:port`）打开云存档链路，`?api` / `?api=0` 强制本地模式。假身份登录需要后端 `ALLOW_DEV_LOGIN=true`，只用于联调。
- 正式发布必须使用已在微信后台配置的 HTTPS 请求域名，`ALLOW_DEV_LOGIN` 必须为 false。

## 功能与操作

- 点击开始或继续远征；支持 1×、2×、4×。
- 点击敌人集火，点击地面集结；右下角发射照明弹。
- 菜单提供阵容、装备、营地、祝福、声音和存档，长列表分页。
- 自动模式保留自动选卡、选择前进/驻守、营地购买和再开一局；点击弹窗可取消当次倒计时。
- 画质分三档，除阴影外主要决定渲染分辨率：`low` 上限 2× CSS 像素 / 2.0M 像素预算，`medium` 2.6× / 3.4M，`high` 3× / 5.2M（中/高画质开启月光阴影）。默认开启 MSAA 抗锯齿，并在游戏中按帧耗时自动升降渲染倍率（0.7× 到该档上限）。当前仍是简化渲染，不包含原网页的完整多通道 HDR/景深/泛光链。
- 原项目的音效槽为空，因此迁移后保留现有音乐和篝火环境声；不新增素材。

## 存档约定

`schema_version=1`。保留长期养成、本局成长、待选卡数量和路灯结算状态；继续时重建当前关卡，不保存战斗瞬间的敌人、位置和技能状态。旧网页存档可在菜单“存档 → 导入备份”导入。

- 初次进入云模式先微信登录、读取云端，再产生写入。
- 每 15 秒落本地，约每 20 秒尝试云同步，关键操作立即落本地；后台先本地保存，恢复时重试。
- 缓存按后端用户 ID 隔离；重连会重新核对微信身份，账号变化后停止上传旧档。
- `revision` 防止旧设备覆盖新进度。冲突时暂停游戏，由玩家选择云端或本地，并先备份双方。
- 上传、离线领取和恢复的请求 ID 先落本地，响应丢失后复用原请求重试。
- 首次云登录失败不新建空云档；已有身份的离线使用保留上次账号本地进度，联网后再核对身份。
- 云端保存最近 10 个快照，支持在“存档 → 云端历史存档”恢复；导入和恢复前保留本地备份。
- 未同步的离线游玩数据优先保存，采用保守规则，不再叠加同一时段的离线收益。

仅有本地游客存档后启用云服务时，不会自动把游客档归属给微信账号。先导出游客备份，再在目标微信账号中明确导入。

## 代码维护

- 玩法修改原 `../src/`，再运行构建；不要手改 `dist/engine.js`。
- 小游戏界面与平台修改 `src/ui/`、`src/platform/` 和 `src/main.js`。
- 界面文案在 `src/ui/zh.js`：卡牌、营地、祝福、职阶与装备名按稳定 id 译成中文，只影响小游戏显示；共享数据 `../src/60-data.js` 保持英文，浏览器版不受影响。新增卡牌/装备时补一条对应 id，缺条目会自动回落到英文原文。
- 升级卡牌的选中与祝福特效在 `src/ui/canvas-ui.js`：点卡体或「选择」按钮都会先高亮 `COMMIT=0.42s`（金框、已选定、进度条），计时结束才 `takeCard`；随后 `bless(card)` 按职阶在对应英雄身上放 `LF.fx` 环、光晕、粒子与「卡名」飘字，`party` 卡作用于全队。按下态由 `platform.onTouchStart` → `ui.press/release` 驱动，触摸预览同样生效。
- 构建对被替换的源码片段进行检查；原代码结构变化时会报错，避免悄悄生成错误适配。
- `src/services/save-schema.json` 由后端 Pydantic 导出。后端模型变更后，在 `backend` 执行 `.venv/bin/python -m tools.export_schema`，再在前端执行 `npm run build`；后端测试会检查两端一致。
- 小游戏运行时仅引用 JS 数据模块。构建将存档 Schema、卡牌契约和音频清单生成到 `dist/save-schema.js`、`dist/contract.js`、`dist/audio.js`，避免小游戏把 `require('./xxx.json')` 解析为不存在的 `xxx.json.js`。浏览器预览也检查这一限制。
- 浏览器预览不进入小游戏包。`?api&user=preview` 仅用于本地假身份联调，需要后端明确开启 `ALLOW_DEV_LOGIN=true`，不可用于真实微信身份验收。

## 真机验收

- iOS、Android 横屏启动、胶囊区/刘海区、触摸集火与集结。
- 选卡、关卡结算、阵容切换、营地与祝福购买、倒地和再开一局。
- 音乐分包加载、静音、音量、后台暂停和前台恢复。
- 微信真实登录、换设备读档、切账号隔离、断网补传、多设备冲突、历史恢复。
- WebGL context 丢失后重新进入可读回本地档；当前不尝试自动重建所有 GPU 对象。
- 中端机连续运行与 4× 倍速性能。尚未完成真机验收前，不把浏览器表现视为手机帧率结论。

参考：[小游戏指南](https://developers.weixin.qq.com/minigame/dev/guide/)、[横屏配置](https://developers.weixin.qq.com/minigame/dev/reference/configuration/app.html)、[登录](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/login.html)、[适配层](https://developers.weixin.qq.com/minigame/dev/guide/runtime/adapter.html)。
