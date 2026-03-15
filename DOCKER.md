# Docker 运行说明（Linux/Windows/macOS）

本项目已提供 Docker 编排，不需要本机安装 Java/Maven。

## 1. 前置条件

- 已安装 Docker Desktop 或 Docker Engine
- 已安装 Docker Compose（`docker compose`）

## 2. 一键启动

在项目根目录执行：

```bash
docker compose up -d --build
```

启动后访问：

- 前端: `http://localhost:8081`
- 后端 API (同端口代理): `http://localhost:8081/api`
- WebSocket (同端口代理): `ws://localhost:8081/ws/game?userId=1`

公网公测访问：

- 前端: `http://<服务器公网IP>:8081`
- 后端 API (同端口代理): `http://<服务器公网IP>:8081/api`
- WebSocket (同端口代理): `ws://<服务器公网IP>:8081/ws/game?userId=1`
- CLI: `MAHJONG_HOST=<服务器公网IP>:8081 python3 mahjong_cli.py ping`

说明：前端已按访问域名动态拼接后端地址，外部用户直接打开 `8081` 即可访问后端接口与 WebSocket。

## 2.1 公测前必做（阿里云）

在 ECS 安全组入方向放行以下 TCP 端口：

- `8081`（网页 + API + WebSocket）

如启用了云防火墙，请同步放行以上端口。

## 3. 查看状态与日志

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f mysql
```

## 4. 停止服务

```bash
docker compose down
```

如需同时清空数据库数据卷：

```bash
docker compose down -v
```

## 5. 常见问题

- 端口冲突（8080/8081/3306）：修改 `docker-compose.yml` 的端口映射。
- 首次启动较慢：后端镜像需要下载依赖并构建，请耐心等待。
- 数据库账号密码：compose 默认 `root/root123`，后端通过环境变量自动连接。
