---
title: App 对接接口文档
description: 端侧 App 对接所需的完整后端接口清单
---

# App 对接接口文档

## 基础信息

- **Base URL**: `http://<host>:8080/api`
- **响应格式**: 统一 `{ "code": 0, "data": ..., "msg": "ok" }`，`code=0` 成功，非 `0` 失败
- **鉴权方式**: Header `Authorization: Bearer <token>`
- **鉴权级别**:
  - **无需鉴权** — 无 `Authorization` 要求
  - **可选鉴权** (`OptionalAuth`) — 传 token 可获取用户信息，不传也能访问
  - **用户鉴权** (`UserAuth`) — 必须登录，Guest 角色除外
  - **管理员鉴权** (`AdminAuth`) — 必须是 Admin 角色

---

## 1. 认证与用户

### 1.1 用户注册

```
POST /auth/register
```

| 参数 | 类型 | 说明 |
|------|------|------|
| username | string | 用户名 |
| password | string | 密码 |
| affCode | string | 邀请码（可选） |

**返回** `data`:

```json
{
  "token": "jwt_token",
  "user": { "id": "...", "username": "...", "role": "user", "credits": 100 }
}
```

### 1.2 用户登录

```
POST /auth/login
```

| 参数 | 类型 | 说明 |
|------|------|------|
| username | string | 用户名 |
| password | string | 密码 |

**返回**: 同注册。

### 1.3 获取当前用户

```
GET /auth/me
```

**鉴权**: 可选鉴权

**返回** `data`: 用户信息对象（未登录返回 Guest 用户）

### 1.4 更新个人资料

```
PUT /v1/profile
```

**鉴权**: 用户鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| displayName | string | 显示名称 |
| password | string | 新密码（留空不修改） |

**返回** `data`: 更新后的用户对象

### 1.5 绑定邀请码

```
POST /v1/bind-aff-code
```

**鉴权**: 用户鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| affCode | string | 邀请码 |

---

## 2. AI 代理接口

> 以下接口统一做 OpenAI 兼容格式代理，前端传 OpenAI 格式，后端自动转换为对应渠道格式。

### 2.1 文生图 / 图生图

```
POST /v1/images/generations
POST /v1/images/edits
```

**鉴权**: 用户鉴权

OpenAI Images API 兼容格式，支持 `model`、`prompt`、`image`（base64 或 URL）、`size`、`n` 等字段。

### 2.2 聊天补全

```
POST /v1/chat/completions
```

**鉴权**: 用户鉴权

OpenAI Chat Completions API 兼容格式，支持流式 (`stream: true`) 和非流式。

### 2.3 语音合成

```
POST /v1/audio/speech
```

**鉴权**: 用户鉴权

OpenAI Audio Speech API 兼容格式。

### 2.4 视频生成

```
POST /v1/videos
```

**鉴权**: 用户鉴权

**返回** `data`:

```json
{
  "id": "task_id",
  "status": "pending"
}
```

### 2.5 查询视频任务

```
GET /v1/videos/:id?model=<model>
```

**鉴权**: 用户鉴权

轮询任务状态，返回标准化状态 (`pending` / `completed` / `failed`) 和视频 URL。

### 2.6 获取视频内容

```
GET /v1/videos/:id/content?model=<model>
```

**鉴权**: 用户鉴权

直接获取视频二进制内容。

---

## 3. 参考素材

### 3.1 上传参考素材

```
POST /v1/media/references
```

**鉴权**: 用户鉴权

**Content-Type**: `multipart/form-data`，字段名 `file`

**支持格式**: jpeg/png/webp/bmp/gif/heic/heif（图片 ≤30MB）、mp4/mov（视频 ≤50MB）、mp3/wav（音频 ≤15MB）

**返回** `data`:

```json
{
  "id": "uuid.jpg",
  "url": "http://host/api/media/references/uuid.jpg",
  "mimeType": "image/jpeg",
  "bytes": 102400
}
```

### 3.2 获取参考素材

```
GET /media/references/:id
```

**鉴权**: 无需鉴权

直接返回文件流，带 24 小时缓存。

---

## 4. 卡密兑换

```
POST /v1/redeem-code
```

**鉴权**: 用户鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| code | string | 兑换码 |

**返回** `data`: 兑换结果（积分/会员天数等）

---

## 5. 签到

### 5.1 每日签到

```
POST /v1/checkin
```

**鉴权**: 用户鉴权

**返回** `data`:

```json
{
  "checkIn": { "date": "2026-06-27", "reward": 5 },
  "isNew": true
}
```

### 5.2 签到月历

```
GET /v1/checkin/month?month=2026-06
```

**鉴权**: 用户鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| month | string | 月份，格式 `YYYY-MM` |

**返回** `data`:

```json
{
  "items": [...],
  "totalCount": 20,
  "totalReward": 100
}
```

---

## 6. 积分流水

```
GET /v1/credit-logs
```

**鉴权**: 用户鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 搜索关键词 |
| page | int | 页码 |
| pageSize | int | 每页数量 |

---

## 7. 提示词库

```
GET /prompts
```

**鉴权**: 可选鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 搜索关键词 |
| category | string | 分类 |
| tag | string[] | 标签（可多个） |
| page | int | 页码 |
| pageSize | int | 每页数量 |

---

## 8. 我的素材

```
GET /assets
```

**鉴权**: 可选鉴权

与提示词接口相同的分页和筛选参数。

---

## 9. 公告

```
GET /announcements
```

**鉴权**: 无需鉴权

| 参数 | 类型 | 说明 |
|------|------|------|
| target | string | 目标用户组，默认 `all` |

---

## 10. 公开设置

### 10.1 站点公开设置

```
GET /settings
```

**鉴权**: 无需鉴权

### 10.2 系统公开设置

```
GET /system-settings
```

**鉴权**: 无需鉴权

**返回** `data`:

```json
{
  "siteName": "无限画布",
  "siteSubtitle": "...",
  "siteLogo": "data:image/png;base64,...",
  "serviceContact": "...",
  "inviteRewardCredits": 10,
  "checkInEnabled": true,
  "checkInRewardMin": 1,
  "checkInRewardMax": 10,
  "videoMaxTimeoutSeconds": 300,
  "agentEnabled": false,
  "agentVisible": false,
  "agentAccessLevel": "all",
  "assistantEnabled": true
}
```

---

## 11. 角色列表

```
GET /roles
```

**鉴权**: 无需鉴权

---

## 12. 模型分类

### 12.1 分类映射

```
GET /model-classifications/map
```

**鉴权**: 无需鉴权

### 12.2 全部分类

```
GET /model-classifications/all
```

**鉴权**: 无需鉴权

图片模型的 `imageConfig` 包含批量生成与异步轮询参数：

```json
{
  "qualities": ["auto", "2K"],
  "aspectRatios": ["1:1", "16:9"],
  "maxCount": 10,
  "supportCustomSize": true,
  "batchConcurrency": 3,
  "asyncTask": {
    "enabled": true
  }
}
```

`batchConcurrency` 允许 `1-20`，默认按 `3` 处理。App 使用该值限制同一渠道和模型等待上游接受的请求数；异步任务被接受并进入状态轮询后不再占用提交槽位。不同渠道或模型使用独立队列。

后台“模型分类 -> 图片模型 -> 编辑模型参数”会将该字段与 `supportCustomSize` 一并写入更新请求；保存后可通过本接口返回的 `imageConfig` 验证实际生效值。

---

## 13. 图片代理

```
GET /proxy-image?url=<image_url>
```

**鉴权**: 无需鉴权

代理下载远程图片并返回 base64 data URL，用于解决跨域。

**返回** `data`:

```json
{ "dataUrl": "data:image/jpeg;base64,..." }
```

---

## 14. 即梦集成

### 14.1 即梦状态

```
GET /jimeng/status
```

### 14.2 即梦积分

```
GET /jimeng/credit
```

**鉴权**: 用户鉴权

### 14.3 生成图片

```
POST /jimeng/generate/image
```

**鉴权**: 用户鉴权

### 14.4 生成视频

```
POST /jimeng/generate/video
```

**鉴权**: 用户鉴权

### 14.5 查询任务

```
GET /jimeng/task/:id
```

**鉴权**: 用户鉴权

### 14.6 查询媒体

```
POST /jimeng/query-media
```

**鉴权**: 用户鉴权

---

## 15. 视频脚本助手（Seedance）

### 15.1 WebSocket 连接

```
GET /seedance/ws
```

**鉴权**: 可选鉴权

WebSocket 连接用于实时交互。

### 15.2 健康检查

```
GET /seedance/health
```

### 15.3 输出流

```
GET /seedance/output
```

### 15.4 上传文件

```
POST /seedance/upload
```

**鉴权**: 用户鉴权

---

## 16. 健康检查

```
GET /health
```

**鉴权**: 无需鉴权

返回 `ok` 文本。

---

## 鉴权说明

1. 调用需鉴权接口时，Header 中传递 `Authorization: Bearer <token>`
2. `token` 在登录/注册成功后返回
3. Guest 角色只能访问不需要鉴权和可选鉴权的接口
4. 管理员接口 (`/admin/*`) 需要 Admin 角色

## 通用分页参数

列表接口支持以下查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 关键词搜索 |
| tag | string[] | 标签筛选，可传多个 |
| category | string | 分类筛选 |
| type | string | 类型筛选 |
| role | string | 角色筛选 |
| status | string | 状态筛选 |
| page | int | 页码，从 1 开始 |
| pageSize | int | 每页条数 |
