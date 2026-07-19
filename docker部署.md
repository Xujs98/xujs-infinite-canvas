# 矩龙画布服务端 Docker 部署手册

本文档适用于当前自维护服务端：

- GitHub：`https://github.com/Xujs98/xujs-infinite-canvas.git`
- Docker Hub：`qq1371446705/julong-canvas`
- 生产域名：`https://canvas.julongkj.top`
- 服务器目录：`/opt/julong-canvas`
- 容器名称：`julong-canvas`
- Web 回环端口：`127.0.0.1:3001`
- Go API 回环端口：`127.0.0.1:8080`
- 持久化数据：宿主机 `./data` 挂载到容器 `/app/data`

> 本地电脑负责构建并推送镜像；服务器只负责拉取 GitHub 代码、拉取 Docker 镜像和启动容器。不要在服务器上构建镜像。

## 一、部署前必须知道

1. `git pull` 更新的是 Compose、环境变量模板和源代码记录。
2. `docker compose pull` 更新的才是服务器实际运行的镜像。
3. 服务器 `.env` 不提交到 GitHub，其中包含管理员密码和 JWT 密钥。
4. `data` 已被 `.dockerignore` 排除，不会打进镜像；升级镜像不会覆盖服务器数据库、上传文件、Logo、App 安装包和日志。
5. 后台保存的渠道、模型分类、请求字段映射都在服务器 SQLite 数据库中。它们不会因为本地代码推送而自动覆盖线上配置。
6. 桌面 App 不包含在服务端 Docker 镜像中。App 修改需要单独构建和发布安装包。

## 二、已有服务器的标准升级流程

### 1. 本地检查并推送 GitHub

在 Mac 上执行：

```bash
cd /Users/xujs/Agent.localized/xujs-infinite-canvas-main

git switch main
git pull --ff-only origin main
git status --short
git log -1 --oneline
```

`git status --short` 只用于检查工作区。不要为了部署提交 `.env`、`data`、`web/.next`、`web/node_modules` 或 `web/tsconfig.tsbuildinfo`。

运行服务端测试：

```bash
go test ./...
```

确定本次镜像标签：

```bash
TAG=$(git rev-parse --short HEAD)
echo "$TAG"
```

后续本地和服务器命令必须使用同一个 `$TAG`。

### 2. 本地登录 Docker Hub

```bash
docker login
```

确认登录账号为 `qq1371446705`。

### 3. 本地构建并推送多架构镜像

```bash
cd /Users/xujs/Agent.localized/xujs-infinite-canvas-main

TAG=$(git rev-parse --short HEAD)
./scripts/docker-publish.sh "$TAG"
```

脚本默认同时发布：

```text
qq1371446705/julong-canvas:<当前 Git 提交短哈希>
qq1371446705/julong-canvas:latest
```

并构建：

```text
linux/amd64
linux/arm64
```

构建结束后再次确认镜像：

```bash
docker buildx imagetools inspect "qq1371446705/julong-canvas:$TAG"
```

输出中存在 `linux/amd64` 和 `linux/arm64` 即表示多架构镜像已推送。`unknown/unknown` 是 Buildx 证明清单，不是构建失败。

### 4. 登录服务器并记录旧版本

```bash
ssh root@你的服务器IP
cd /opt/julong-canvas

docker compose ps
grep '^IMAGE_TAG=' .env
```

记录旧镜像标签，便于回滚：

```bash
OLD_TAG=$(grep '^IMAGE_TAG=' .env | cut -d= -f2-)
echo "旧镜像标签：$OLD_TAG"
```

### 5. 停止容器并备份完整数据

SQLite 备份前先停止容器，避免数据库和 WAL 文件在归档过程中继续变化：

```bash
cd /opt/julong-canvas
docker compose stop
```

创建备份：

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/julong-backups

install -d -m 700 "$BACKUP_DIR"

tar -C /opt/julong-canvas \
  -czf "$BACKUP_DIR/julong-data-$STAMP.tar.gz" \
  data

cp .env "$BACKUP_DIR/julong-env-$STAMP.backup"
chmod 600 "$BACKUP_DIR/julong-env-$STAMP.backup"
```

验证数据归档：

```bash
tar -tzf "$BACKUP_DIR/julong-data-$STAMP.tar.gz" >/dev/null \
  && echo "数据备份完整"

sha256sum "$BACKUP_DIR/julong-data-$STAMP.tar.gz"
ls -lh "$BACKUP_DIR/julong-data-$STAMP.tar.gz"
```

必须看到“数据备份完整”后再继续。

### 6. 服务器拉取最新 main

```bash
cd /opt/julong-canvas

git switch main
git pull --ff-only origin main
git log -1 --oneline
```

如果 `git pull --ff-only` 提示本地文件冲突，不要执行 `git reset --hard`。先用下面命令确认冲突文件：

```bash
git status --short
```

`.env` 和 `data` 正常情况下不会参与 Git 更新。

### 7. 固定本次镜像标签

在服务器重新获取最新提交短哈希：

```bash
cd /opt/julong-canvas
TAG=$(git rev-parse --short HEAD)
echo "准备部署：$TAG"
```

更新 `.env`：

```bash
if grep -q '^IMAGE_TAG=' .env; then
  sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env
else
  printf '\nIMAGE_TAG=%s\n' "$TAG" >> .env
fi

grep '^IMAGE_TAG=' .env
```

输出必须和本地已经推送到 Docker Hub 的标签一致。

### 8. 拉取镜像并启动

```bash
cd /opt/julong-canvas

docker compose pull app
docker compose up -d --remove-orphans
docker compose ps
```

查看启动日志：

```bash
docker compose logs --tail=200 app
```

持续查看日志：

```bash
docker compose logs -f app
```

按 `Ctrl+C` 只会退出日志查看，不会停止容器。

### 9. 检查容器健康状态

```bash
for i in $(seq 1 24); do
  STATUS=$(docker inspect \
    --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    julong-canvas 2>/dev/null || true)
  echo "容器状态：$STATUS"
  [ "$STATUS" = "healthy" ] && break
  sleep 5
done
```

检查 Go API：

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

应返回：

```text
ok
```

检查 Next Web：

```bash
curl -I http://127.0.0.1:3001
curl -fsS http://127.0.0.1:3001/api/system-settings >/dev/null \
  && echo "Web API 正常"
```

检查公网域名：

```bash
curl -fsS https://canvas.julongkj.top/api/health
curl -I https://canvas.julongkj.top
```

### 10. 检查 Nginx

如果域名访问异常，但 `127.0.0.1:3001` 和 `127.0.0.1:8080` 正常：

```bash
nginx -t
```

只有 `nginx -t` 成功后才重新加载：

```bash
nginx -s reload
```

如果使用 1Panel，也可以在 1Panel 的 OpenResty/Nginx 管理界面执行“重载”。不需要每次升级镜像都重启 Nginx；只有代理配置修改或 Nginx 自身异常时才重载。

## 三、部署失败时回滚镜像

假设升级前记录的标签是 `$OLD_TAG`：

```bash
cd /opt/julong-canvas

sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$OLD_TAG/" .env
grep '^IMAGE_TAG=' .env

docker compose pull app
docker compose up -d --remove-orphans
docker compose ps
docker compose logs --tail=200 app
```

再次检查：

```bash
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS https://canvas.julongkj.top/api/health
```

本次结构化请求字段映射没有新增数据库表，通常只需要回滚镜像，不需要恢复数据库。

## 四、需要恢复数据时

只有数据库或持久化文件确实损坏时才执行。先停止容器：

```bash
cd /opt/julong-canvas
docker compose stop
```

保留当前故障数据：

```bash
BROKEN_STAMP=$(date +%Y%m%d-%H%M%S)
mv data "data-broken-$BROKEN_STAMP"
```

从指定备份恢复：

```bash
tar -C /opt/julong-canvas \
  -xzf /opt/julong-backups/julong-data-YYYYMMDD-HHMMSS.tar.gz

docker compose up -d --remove-orphans
docker compose ps
```

恢复后检查：

```bash
curl -fsS http://127.0.0.1:8080/api/health
docker compose logs --tail=200 app
```

## 五、首次部署到新服务器

### 1. 安装基础工具

Ubuntu/Debian 示例：

```bash
apt update
apt install -y git curl ca-certificates tar
```

安装 Docker Engine 和 Compose Plugin 后确认：

```bash
docker version
docker compose version
```

### 2. 克隆代码

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/Xujs98/xujs-infinite-canvas.git julong-canvas
cd /opt/julong-canvas
git switch main
```

### 3. 创建服务器专用 `.env`

```bash
cp .env.example .env
nano .env
```

至少确认以下配置：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=替换为强密码
JWT_SECRET=替换为足够长的随机密钥
JWT_EXPIRE_HOURS=168
APP_PORT=3001
API_PORT=8080
IMAGE_TAG=已经推送到DockerHub的标签
GIN_MODE=release
PUBLIC_BASE_URL=https://canvas.julongkj.top
STORAGE_DRIVER=sqlite
DATABASE_DSN=/app/data/infinite-canvas.db
```

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

不要把 `.env` 提交到 GitHub，也不要直接复制本地开发 `.env` 覆盖服务器配置。

### 4. 恢复迁移数据

如果要携带已有数据库和上传文件，必须在第一次启动容器前把完整 `data` 目录恢复到：

```text
/opt/julong-canvas/data
```

恢复并校验归档后再启动：

```bash
cd /opt/julong-canvas
tar -xzf /root/julong-canvas-data.tar.gz
ls -lah data
```

### 5. 第一次启动

```bash
cd /opt/julong-canvas
docker compose pull app
docker compose up -d --remove-orphans
docker compose ps
docker compose logs --tail=200 app
```

## 六、模型映射和 App 发布注意事项

### 1. 线上模型映射是服务器数据

在本地后台保存的模型分类映射只写入本地 `data/infinite-canvas.db`，不会包含在 Docker 镜像中。服务器升级完成后，需要登录线上后台检查：

```text
后台管理 → 模型分类 → 编辑模型参数 → 请求字段映射
```

通用映射由以下字段控制：

- 源字段
- 目标字段
- 数据类型
- 源数据路径
- object 简易字段
- 自定义 JSON 值模板
- `"@data"` 数据占位符

App 和服务端会执行同一套结构化转换，不应在代码中按渠道名称、域名或模型名称写特判。

### 2. App 不随服务端 Docker 发布

当前 App 通用结构化映射修复位于 App 仓库：

```text
/Users/xujs/Agent.localized/open-storyboard-canvas
```

服务端 Docker 更新后：

- 本地 Dev App 可以直接读取线上服务端配置进行测试。
- 已经安装的旧 App 不会因为服务器换镜像而自动获得客户端代码更新。
- 正式用户需要安装包含最新 App 提交的新安装包。
- 新安装包通过后台“版本管理”上传并发布，与服务端 Docker 镜像分开维护。

## 七、常用运维命令

查看状态：

```bash
cd /opt/julong-canvas
docker compose ps
```

查看日志：

```bash
docker compose logs --tail=200 app
```

重启容器：

```bash
docker compose restart app
```

停止服务：

```bash
docker compose stop
```

启动服务：

```bash
docker compose up -d --remove-orphans
```

查看当前镜像：

```bash
docker inspect julong-canvas \
  --format='{{.Config.Image}}'
```

查看磁盘占用：

```bash
du -sh /opt/julong-canvas/data
docker system df
```

只清理未使用的构建缓存时，先确认没有正在构建镜像：

```bash
docker builder prune
```

不要执行会批量删除镜像、卷或数据的高风险清理命令。
对，服务器正常更新本质上就是三步。刚才给的是包含停机备份、校验和回滚的完整生产流程，所以命令较多。
如果数据已经有备份，并且新镜像已经推送到 Docker Hub，服务器直接执行：
cd /opt/julong-canvas

git pull --ff-only origin main
docker compose pull
docker compose up -d
然后简单确认：
docker compose ps
curl https://canvas.julongkj.top/api/health
但在执行前，本地必须先构建并推送镜像：
cd /Users/xujs/Agent.localized/xujs-infinite-canvas-main

./scripts/docker-publish.sh 877004b
如果服务器 .env 使用固定标签，还要修改一次：
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=877004b/' .env
然后才是：
docker compose pull
docker compose up -d
所以最简服务器流程确实是：
git pull
docker compose pull
docker compose up -d
其中正确命令是 docker compose up -d，不是 docker -d。备份、日志和健康检查只是降低部署失败风险，并非每次强制执行。