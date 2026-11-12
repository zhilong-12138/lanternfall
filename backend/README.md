# Python 后端与 Docker MySQL

FastAPI + SQLAlchemy + MySQL 8.4。运行数据库使用 Docker 命名卷持久化；SQLite 仅用于隔离的快速测试。

## 启动本地数据库与后端

先在 `../wechat-client` 执行 `npm run build`，生成游戏数据契约。

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install --no-deps -e .
.venv/bin/python tools/setup_local.py
docker compose up -d --wait mysql
.venv/bin/alembic upgrade head
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`tools/setup_local.py` 生成随机 MySQL 业务密码和 root 密码，写入权限为 `0600` 的 `backend/.env`，保留已有配置。密码不提交到仓库。

连接参数：

| 项目 | 值 |
|---|---|
| 主机 | `127.0.0.1` |
| 端口 | `33306`，可通过 `.env` 的 `MYSQL_PORT` 修改 |
| 数据库 | `lanternfall` |
| 业务用户 | `lanternfall` |
| 密码 | 见本机 `backend/.env` 的 `MYSQL_PASSWORD` |
| 数据卷 | `lanternfall_mysql_data` |

默认只监听本机回环地址，不影响已有 Docker 项目。更改端口时同时更新 `.env` 的 `DATABASE_URL`。

```sh
docker compose ps
docker compose stop mysql       # 停止，保留数据
docker compose up -d mysql      # 再次启动
```

普通 `docker compose down` 保留数据卷。需要保留存档时，不执行删除数据卷的命令。

后端也可放进 Docker：

```sh
cd backend # 从项目根目录进入；已在 backend 中则跳过
python3 tools/setup_local.py
docker compose --profile app up -d --build --wait
```

该模式启动时执行 Alembic 迁移，API 健康检查同时验证数据库连接；`--wait` 等待服务就绪。先停止占用本机 8000 端口的开发服务。容器使用已有 `.env` 配置和 MySQL 数据卷。

服务地址：<http://127.0.0.1:8000>；接口文档：<http://127.0.0.1:8000/docs>。

在 `backend` 目录管理容器：

```sh
docker compose --profile app ps
docker compose logs -f api
docker compose restart api
docker compose --profile app stop     # 停止 API 与 MySQL，保留数据
docker compose --profile app up -d --wait # 再次启动
```

修改后端代码后，重新执行 `docker compose --profile app up -d --build --wait`。API 与 MySQL 均配置 `restart: unless-stopped`，Docker 启动后会自动恢复未被手动停止的容器。

## 微信与本地联调

在 `.env` 配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`。客户端只保存 `apiBase`，不接收 AppSecret、openid 或 session_key。后端通过 `code2Session` 确认身份，按 `(appid, openid)` 唯一绑定。

真实微信 code 不会降级成假用户。未配置微信凭证时返回 503。

浏览器联调可临时使用：

```sh
ALLOW_DEV_LOGIN=true .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

再打开前端预览的 `http://127.0.0.1:8080/?api&user=preview`。开发身份以 `dev:` 开头，只在显式启用开发模式时可用；`ENVIRONMENT=production` 禁止开发登录。线上设置 `DB_AUTO_CREATE=false`，使用 Alembic 管理结构，部署时配置 HTTPS 和微信服务器合法域名。

## 数据表

| 表 | 内容 |
|---|---|
| `users` | 微信应用与用户身份绑定 |
| `login_sessions` | 业务令牌哈希及到期时间，默认 7 天 |
| `saves` | 用户当前 JSON 存档、单调递增版本、服务端保存及结算时间 |
| `save_snapshots` | 最近十个历史存档快照 |
| `save_operations` | 上传、领取与恢复的幂等记录，保留七天 |
| `alembic_version` | 数据库结构版本 |

业务接口按令牌识别用户，不允许请求方指定存档所有者。更新用 `WHERE revision = expected_revision` 原子检查，写入、历史、幂等和收益结算在同一事务内完成。

七天后幂等记录可能清理，但旧请求仍会被旧 revision 拒绝，不会再次发放。普通写入只返回版本和时间，避免幂等表重复保存完整存档。

## 接口

| 方法与路径 | 用途 |
|---|---|
| `POST /api/v1/auth/wechat` | `{code}` 换取业务 token |
| `GET /api/v1/save` | 当前用户的存档与 revision |
| `PUT /api/v1/save` | `{request_id, revision, payload}` 更新 |
| `POST /api/v1/offline/claim` | `{request_id, revision}` 结算离线收益 |
| `GET /api/v1/save/history` | 当前用户最近十份历史的摘要 |
| `POST /api/v1/save/restore` | `{request_id, revision, source_revision}` 恢复并生成新版本 |
| `GET /health` | 检查数据库连接 |

除登录和健康检查外，使用 `Authorization: Bearer <token>`。401 重新登录；409 展示存档冲突，重新读取后由用户选择；422 表示数据不符合契约。请求最大 256 KiB。

接口交互文档：<http://127.0.0.1:8000/docs>。

离线收益使用服务器时间，90 秒起算、上限四小时。服务端直接更新银币、经验、等级及待选卡，并原子记录领取结果；离线经验不再加入在线收益速率，避免复利式重复增长。

当前仍是客户端战斗与成长计算、服务器身份/同步/数据范围校验。付费资产、交易或竞争排名需要进一步将相应经济操作改为服务端权威计算。

## 验证与模型变更

```sh
.venv/bin/python -m pytest -q                  # SQLite 快速测试
.venv/bin/python -m tools.test_mysql           # 独立 lanternfall_test 数据库上运行同一套接口测试
.venv/bin/python -m tools.export_schema        # 模型变化后更新前端 JSON Schema
```

MySQL 测试工具在本项目 Docker 容器中创建独立的 `lanternfall_test`，每次测试重建该测试库的业务表，不改动 `lanternfall`。只有数据库名以 `_test` 结尾时才允许清理测试表。

新增模型使用 Alembic 新迁移；不要修改已在真实用户数据库中执行过的迁移。`0001` 是本次新建项目的初始结构。

上线前需要配置真实微信凭证、HTTPS、数据库备份及真机验收。不要把 `.env`、数据库文件、虚拟环境或备份提交到版本库。
