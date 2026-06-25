# 无限画布项目结构与 API 文档

> 基于 `basketikun/infinite-canvas` 二开版本，当前版本 v0.3.0

---

## 一、项目总览

自托管的 AI 无限画布创作平台。用户在浏览器中通过拖拽节点、连线、提示词驱动 AI 生成图片/视频/音频。画布数据存在浏览器本地（IndexedDB），后端负责用户系统、AI 代理转发和素材管理。

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 (App Router)、React、TypeScript、Ant Design、Tailwind CSS、Zustand、TanStack Query |
| 后端 | Go 1.25、Gin、GORM |
| 数据库 | SQLite（默认）/ MySQL / PostgreSQL |
| 部署 | Docker（Next.js + Go 同容器）、GitHub Actions CI/CD |

### 数据流

```
浏览器 (Next.js :3000)
  ↓ API 代理 (/api/[...path]/route.ts)
Go 后端 (Gin :8080)
  ↓ GORM
SQLite / MySQL / PostgreSQL
```

---

## 二、目录结构

```
infinite-canvas/
├── main.go                          # 后端入口
├── go.mod / go.sum                  # Go 依赖
├── VERSION                          # 版本号
├── CHANGELOG.md                     # 变更日志
├── AGENTS.md                        # AI 开发规范
├── Dockerfile                       # Docker 构建（多阶段）
├── docker-compose.yml               # 生产部署
├── docker-compose.local.yml         # 本地源码构建
├── .env / .env.example              # 环境变量
│
├── config/                          # 配置加载
│   └── config.go                    # 环境变量解析、JWT 密钥生成
│
├── model/                           # 数据模型（12 个文件）
│   ├── user.go                      # User、CreditLog
│   ├── asset.go                     # Asset 素材
│   ├── setting.go                   # Setting、ModelChannel、ModelCost
│   ├── system_setting.go            # SystemSetting 键值对、SystemSettings 聚合
│   ├── prompt.go                    # Prompt 提示词、PromptCategory
│   ├── announcement.go              # Announcement 公告
│   ├── redeem_code.go               # RedeemCode 兑换码
│   ├── call_log.go                  # CallLog 调用日志
│   ├── checkin.go                   # CheckIn 签到
│   ├── model_classification.go      # ModelClassification 模型分类
│   ├── request_log.go               # RequestLog 请求日志
│   └── query.go                     # Query 分页查询
│
├── repository/                      # 数据库访问层（12 个文件）
│   ├── db.go                        # 数据库初始化、AutoMigrate
│   ├── user.go                      # 用户 CRUD
│   ├── setting.go                   # 渠道设置 CRUD
│   ├── asset.go                     # 素材 CRUD
│   ├── prompt.go                    # 提示词 CRUD
│   ├── announcement.go              # 公告 CRUD
│   ├── redeem_code.go               # 兑换码 CRUD
│   ├── system_setting.go            # 系统设置键值对 CRUD
│   ├── call_log.go                  # 调用日志
│   ├── checkin.go                   # 签到记录
│   ├── model_classification.go      # 模型分类 CRUD
│   └── request_log.go               # 请求日志
│
├── service/                         # 业务逻辑层（14 个文件）
│   ├── auth.go                      # 注册/登录/LinuxDo OAuth/JWT/邀请码
│   ├── context.go                   # Context 存取当前用户
│   ├── settings.go                  # AI 渠道设置、算力点扣费、代理转发
│   ├── system_setting.go            # 系统设置读写
│   ├── assets.go                    # 素材业务
│   ├── prompts.go                   # 提示词业务
│   ├── prompt_fetch.go              # GitHub 提示词抓取
│   ├── prompt_sync_scheduler.go     # 提示词定时同步
│   ├── announcement.go              # 公告业务
│   ├── redeem_code.go               # 兑换码业务
│   ├── checkin.go                   # 签到业务
│   ├── call_log.go                  # 调用日志业务
│   ├── model_classification.go      # 模型分类业务
│   └── request_log.go               # 请求日志、轮询去重
│
├── handler/                         # HTTP 处理层（18 个文件）
│   ├── response.go                  # OK/Fail 统一响应 { code, data, msg }
│   ├── auth.go                      # 注册/登录/OAuth
│   ├── admin.go                     # 管理后台接口
│   ├── ai.go                        # AI 代理转发（图片/视频/音频/聊天）
│   ├── settings.go                  # 渠道设置管理
│   ├── system_setting.go            # 系统设置管理
│   ├── assets.go                    # 素材管理
│   ├── prompts.go                   # 提示词管理
│   ├── announcement.go              # 公告管理
│   ├── redeem_code.go               # 兑换码管理
│   ├── checkin.go                   # 签到
│   ├── call_log.go                  # 调用日志
│   ├── model_classification.go      # 模型分类
│   ├── request_log.go               # 请求日志
│   ├── request_log_admin.go         # 请求日志管理
│   ├── agent.go                     # Canvas Agent 代理
│   ├── jimeng.go                    # 即梦 CLI 集成
│   ├── logo_upload.go               # Logo 上传
│   └── media_reference.go           # 参考图上传/读取
│
├── router/router.go                 # 路由注册
├── middleware/admin.go               # 鉴权中间件（AdminAuth/UserAuth/OptionalAuth）
│
├── canvas-agent/                    # 本地 Canvas Agent（MCP Server）
│   ├── src/
│   │   ├── index.ts                 # 入口（MCP 模式 / HTTP 模式）
│   │   ├── config.ts                # 配置管理、Agent Prompt
│   │   ├── mcp-server.ts            # MCP 服务端注册工具
│   │   ├── tools.ts                 # 画布操作工具实现
│   │   ├── schemas.ts               # MCP 工具 schema 定义
│   │   ├── agents.ts                # Codex/Claude Agent 集成
│   │   ├── http-server.ts           # HTTP 通信服务
│   │   ├── canvas-session.ts        # 画布会话管理
│   │   ├── types.ts                 # 类型定义
│   │   └── claude-agent-sdk-adapter.ts # Claude Agent SDK 适配
│   └── package.json
│
├── web/                             # 前端 Next.js 应用
│   ├── src/
│   │   ├── app/                     # App Router 页面
│   │   ├── components/              # 全局共享组件
│   │   ├── services/api/            # API 请求封装
│   │   ├── stores/                  # Zustand 全局状态
│   │   ├── hooks/                   # 全局 hooks
│   │   ├── lib/                     # 工具函数
│   │   ├── constant/                # 常量
│   │   └── types/                   # TypeScript 类型
│   └── next.config.ts
│
└── docs/                            # 文档站（Fumadocs）
```

---

## 三、后端 API 接口

### 响应格式

所有接口统一返回：

```json
{ "code": 0, "data": {}, "msg": "ok" }
```

失败时：

```json
{ "code": 1, "data": null, "msg": "错误信息" }
```

### 鉴权方式

- **无需鉴权**：公开接口（登录、注册、公开设置等）
- **OptionalAuth**：可选登录，未登录返回访客信息
- **UserAuth**：需要登录（JWT Bearer Token）
- **AdminAuth**：需要管理员权限

---

### 3.1 公开接口（无鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/linux-do/authorize` | Linux.do OAuth 授权跳转 |
| GET | `/api/auth/linux-do/callback` | Linux.do OAuth 回调 |
| GET | `/api/auth/me` | 当前用户信息（OptionalAuth） |
| GET | `/api/settings` | 获取公开渠道设置 |
| GET | `/api/system-settings` | 获取公开系统设置 |
| GET | `/api/prompts` | 公开提示词列表（OptionalAuth） |
| GET | `/api/assets` | 公开素材库（OptionalAuth） |
| GET | `/api/media/references/:id` | 读取参考图 |
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/model-classifications/map` | 模型名→能力映射 |
| GET | `/api/model-classifications/all` | 所有模型分类列表 |
| GET | `/api/announcements` | 公开公告列表 |
| * | `/api/agent/*path` | Canvas Agent 代理 |

---

### 3.2 用户接口（UserAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/images/generations` | AI 文生图 |
| POST | `/api/v1/images/edits` | AI 图生图 |
| POST | `/api/v1/chat/completions` | AI 聊天补全 |
| POST | `/api/v1/audio/speech` | AI 语音合成 |
| POST | `/api/v1/videos` | AI 视频生成 |
| GET | `/api/v1/videos/:id` | 获取视频任务状态 |
| GET | `/api/v1/videos/:id/content` | 获取视频内容 |
| POST | `/api/v1/media/references` | 上传参考图 |
| PUT | `/api/v1/profile` | 更新个人资料 |
| POST | `/api/v1/redeem-code` | 兑换卡密 |
| POST | `/api/v1/bind-aff-code` | 绑定邀请码 |
| GET | `/api/v1/credit-logs` | 用户算力点流水 |
| POST | `/api/v1/checkin` | 每日签到 |
| GET | `/api/v1/checkin/month` | 签到月历 |

---

### 3.3 即梦集成（部分需 UserAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/jimeng/status` | 即梦登录状态 |
| GET | `/api/jimeng/credit` | 即梦积分（UserAuth） |
| POST | `/api/jimeng/login/start` | 即梦登录开始 |
| GET | `/api/jimeng/login/status` | 即梦登录状态轮询 |
| POST | `/api/jimeng/logout` | 即梦登出 |
| POST | `/api/jimeng/generate/image` | 即梦生图（UserAuth） |
| POST | `/api/jimeng/generate/video` | 即梦生视频（UserAuth） |
| GET | `/api/jimeng/task/:id` | 即梦任务状态（UserAuth） |
| POST | `/api/jimeng/query-media` | 即梦媒体查询（UserAuth） |

---

### 3.4 管理后台接口（AdminAuth）

#### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表（分页） |
| POST | `/api/admin/users` | 创建/更新用户 |
| POST | `/api/admin/users/:id/credits` | 调整用户算力点 |
| POST | `/api/admin/users/batch-delete` | 批量删除用户 |
| POST | `/api/admin/users/batch-status` | 批量更新用户状态 |
| DELETE | `/api/admin/users/:id` | 删除用户 |

#### 算力点日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/credit-logs` | 算力点流水（分页） |
| POST | `/api/admin/credit-logs` | 新增算力点记录 |
| POST | `/api/admin/credit-logs/batch-delete` | 批量删除 |
| DELETE | `/api/admin/credit-logs/:id` | 删除单条 |

#### 模型渠道设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/settings` | 获取完整设置 |
| POST | `/api/admin/settings` | 保存设置 |
| GET | `/api/admin/settings/channel-models` | 获取所有渠道模型列表 |
| POST | `/api/admin/settings/channel-models` | 从渠道拉取模型列表 |
| POST | `/api/admin/settings/channel-test` | 测试渠道模型 |
| GET | `/api/admin/settings/channel-request-logs` | 渠道请求日志 |

#### 系统设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/system-settings` | 获取系统设置（完整） |
| POST | `/api/admin/system-settings` | 保存系统设置 |
| POST | `/api/admin/system-settings/logo` | 上传站点 Logo |
| DELETE | `/api/admin/system-settings/logo` | 移除站点 Logo |

#### 提示词管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/prompt-categories` | 提示词分类列表 |
| POST | `/api/admin/prompt-categories/sync` | 同步远程提示词源 |
| GET | `/api/admin/prompts` | 提示词列表（分页） |
| POST | `/api/admin/prompts` | 创建/更新提示词 |
| POST | `/api/admin/prompts/batch-delete` | 批量删除提示词 |
| DELETE | `/api/admin/prompts/:id` | 删除提示词 |

#### 素材管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/assets` | 素材列表（分页） |
| POST | `/api/admin/assets` | 创建/更新素材 |
| DELETE | `/api/admin/assets/:id` | 删除素材 |

#### 兑换码管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/redeem-codes` | 兑换码列表（分页） |
| POST | `/api/admin/redeem-codes/generate` | 批量生成兑换码 |
| POST | `/api/admin/redeem-codes/batch-delete` | 批量删除 |
| DELETE | `/api/admin/redeem-codes/:id` | 删除单个 |

#### 公告管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/announcements` | 公告列表 |
| POST | `/api/admin/announcements` | 创建/更新公告 |
| POST | `/api/admin/announcements/batch-delete` | 批量删除 |
| POST | `/api/admin/announcements/batch-pinned` | 批量置顶/取消置顶 |
| DELETE | `/api/admin/announcements/:id` | 删除公告 |

#### Agent 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/agent/status` | Agent 运行状态 |
| POST | `/api/admin/agent/start` | 启动 Agent |
| POST | `/api/admin/agent/stop` | 停止 Agent |
| GET | `/api/admin/agent/settings` | 获取 Agent 设置 |
| POST | `/api/admin/agent/settings` | 保存 Agent 设置 |

#### 日志管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/call-logs` | AI 调用日志（分页） |
| POST | `/api/admin/call-logs/batch-delete` | 批量删除调用日志 |
| GET | `/api/admin/request-logs` | 请求详情日志（分页） |
| POST | `/api/admin/request-logs/batch-delete` | 批量删除请求日志 |

#### 模型分类管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/model-classifications` | 模型分类列表（分页） |
| POST | `/api/admin/model-classifications` | 创建模型分类 |
| PUT | `/api/admin/model-classifications/:id` | 更新模型分类 |
| DELETE | `/api/admin/model-classifications/:id` | 删除模型分类 |
| POST | `/api/admin/model-classifications/batch-delete` | 批量删除 |

---

## 四、前端页面路由

### 用户端（`(user)` 路由组）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `page.tsx` | 首页（展示站点信息、提示词推荐） |
| `/login` | `login/page.tsx` | 登录/注册页 |
| `/canvas` | `canvas/page.tsx` | 画布列表（新建/导入/导出） |
| `/canvas/[id]` | `canvas/[id]/page.tsx` | 画布编辑器（核心页面） |
| `/assets` | `assets/page.tsx` | 我的素材 |
| `/asset-library` | `asset-library/page.tsx` | 素材库 |
| `/prompts` | `prompts/page.tsx` | 提示词库 |
| `/image` | `image/page.tsx` | AI 图片生成 |
| `/video` | `video/page.tsx` | AI 视频生成 |
| `/profile` | `profile/page.tsx` | 个人中心 |

### 管理后台（`(admin)` 路由组）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/admin` | `admin/page.tsx` | 管理后台首页（重定向到用户管理） |
| `/admin/users` | `admin/users/page.tsx` | 用户管理 |
| `/admin/credit-logs` | `admin/credit-logs/page.tsx` | 算力点日志 |
| `/admin/redeem-codes` | `admin/redeem-codes/page.tsx` | 兑换码管理 |
| `/admin/announcements` | `admin/announcements/page.tsx` | 公告管理 |
| `/admin/prompts` | `admin/prompts/page.tsx` | 提示词管理 |
| `/admin/assets` | `admin/assets/page.tsx` | 素材库管理 |
| `/admin/model-classifications` | `admin/model-classifications/page.tsx` | 模型分类管理 |
| `/admin/agent` | `admin/agent/page.tsx` | Agent 管理 |
| `/admin/call-logs` | `admin/call-logs/page.tsx` | 调用日志 |
| `/admin/request-logs` | `admin/request-logs/page.tsx` | 请求日志 |
| `/admin/settings` | `admin/settings/page.tsx` | 模型渠道设置 |
| `/admin/system-settings` | `admin/system-settings/page.tsx` | 系统设置 |

---

## 五、前端核心模块

### 5.1 全局 Store（Zustand）

| Store | 文件 | 职责 |
|-------|------|------|
| `useUserStore` | `stores/use-user-store.ts` | 用户登录态、Token、登录/注册/登出 |
| `useConfigStore` | `stores/use-config-store.ts` | AI 配置（模型/Key/渠道）、WebDAV 同步配置 |
| `useThemeStore` | `stores/use-theme-store.ts` | 主题切换（明暗+6 种配色） |
| `useAssetStore` | `stores/use-asset-store.ts` | 本地素材管理（localforage 持久化） |

### 5.2 画布 Store

| Store | 文件 | 职责 |
|-------|------|------|
| `useCanvasStore` | `canvas/stores/use-canvas-store.ts` | 画布项目 CRUD、节点/连线/视口 |
| `useCanvasUIStore` | `canvas/stores/use-canvas-ui-store.ts` | 画布 UI 状态（选中/拖拽/缩放） |
| `useCanvasAgentStore` | `canvas/stores/use-canvas-agent-store.ts` | 画布 Agent 会话状态 |

### 5.3 API 层

| 文件 | 职责 |
|------|------|
| `services/api/request.ts` | axios 封装（apiGet/apiPost/apiDelete/apiPut） |
| `services/api/auth.ts` | 登录/注册/用户信息/兑换码/积分日志 |
| `services/api/admin.ts` | 所有管理后台接口 |
| `services/api/assets.ts` | 公开素材库 |
| `services/api/prompts.ts` | 公开提示词 |
| `services/api/video.ts` | 视频生成/轮询 |
| `services/api/image.ts` | 图片生成 |
| `services/api/audio.ts` | 音频生成 |
| `services/api/announcements.ts` | 公告 |
| `services/api/jimeng.ts` | 即梦集成 |
| `services/api/admin-announcements.ts` | 管理后台公告 |

### 5.4 主题系统

- **6 种配色**：stone / blue / emerald / rose / amber / violet
- **明暗模式**：通过 `useThemeStore` 切换
- **Ant Design Token**：`app-theme.ts` 的 `getAntThemeConfig()` 统一生成
- **画布主题**：`canvas-theme.ts` 的 `canvasThemes` 定义画布背景/节点/工具栏颜色
- **配置弹窗**：`AppConfigModal` 让用户在前端配置 API Key

### 5.5 画布节点类型

| 类型 | 说明 |
|------|------|
| `image` | 图片节点（生成/编辑） |
| `text` | 文本节点 |
| `config` | 生成配置节点（可连接多个图片节点批量生成） |
| `video` | 视频节点 |
| `audio` | 音频节点 |

---

## 六、Canvas Agent

本地 MCP Server，让 Codex / Claude Code 通过 MCP 协议操作画布。

### 运行模式

```bash
# MCP 模式（stdio，供 Codex/Claude Code 使用）
canvas-agent mcp

# HTTP 模式（供画布前端使用，默认端口 17371）
canvas-agent
```

### MCP 工具

| 工具名 | 说明 |
|--------|------|
| `canvas_get_state` | 读取当前画布状态 |
| `canvas_get_selection` | 读取当前选区 |
| `canvas_create_text_node` | 创建文本节点 |
| `canvas_create_config_node` | 创建配置节点 |
| `canvas_create_generation_flow` | 创建生成流程 |
| `canvas_generate_image` | 生成图片 |
| `canvas_generate_video` | 生成视频 |
| `canvas_generate_audio` | 生成音频 |
| `canvas_generate_text` | 生成文本 |
| `canvas_run_generation` | 触发生成 |
| `canvas_update_node` | 更新节点 |
| `canvas_connect_nodes` | 连接节点 |
| `canvas_apply_ops` | 批量操作 |
| `delete_connections` | 删除连线 |
| `canvas_export_snapshot` | 导出快照 |

---

## 七、数据模型

### 7.1 用户相关

| 表 | 说明 |
|----|------|
| `users` | 用户表（ID、用户名、密码、角色、算力点、邀请码、状态） |
| `credit_logs` | 算力点流水（类型：管理员调整/AI消耗/退款/兑换/签到/邀请奖励/注册赠送） |
| `redeem_codes` | 兑换码 |
| `check_ins` | 签到记录 |

### 7.2 内容相关

| 表 | 说明 |
|----|------|
| `prompts` | 提示词（标题/封面/提示词内容/标签/分类） |
| `assets` | 素材（文本/图片，标签/分类） |
| `announcements` | 公告（标题/内容/置顶） |

### 7.3 系统配置

| 表 | 说明 |
|----|------|
| `settings` | AI 渠道设置（公开/私有两组，含多渠道配置、模型费用） |
| `system_settings` | 系统设置键值对（站点名称、Logo、注册策略、签到、邮件等） |
| `model_classifications` | 模型分类（模型名→能力、视频/图片/音频参数配置） |

### 7.4 日志

| 表 | 说明 |
|----|------|
| `call_logs` | AI 调用日志 |
| `request_logs` | 请求详情日志（含轮询去重） |

---

## 八、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8080 | 后端监听端口 |
| `ADMIN_USERNAME` | admin | 默认管理员用户名 |
| `ADMIN_PASSWORD` | infinite-canvas | 默认管理员密码 |
| `JWT_SECRET` | infinite-canvas | JWT 密钥（自动生成） |
| `JWT_EXPIRE_HOURS` | 168 | JWT 过期时间（小时） |
| `STORAGE_DRIVER` | sqlite | 数据库驱动（sqlite/mysql/postgres） |
| `DATABASE_DSN` | data/infinite-canvas.db | 数据库连接串 |
| `PUBLIC_BASE_URL` | - | 公开访问地址（用于参考图暴露） |

---

## 九、Docker 部署

```bash
# 拉取镜像
docker pull ghcr.io/Xujs98/infinite-canvas:latest

# 启动
docker-compose up -d
```

容器内部：Go 后端监听 `:8080`（仅容器内部），Next.js 监听 `:3000`（对外暴露）。数据目录挂载到 `./data`。
