# 前端节点请求字段说明

本文档说明前端各节点发送的请求字段、类型和含义，供后台「模型管理 → 请求字段映射」配置参考。

---

## 文本节点

- **接口**: `POST /api/v1/chat/completions`
- **无素材字段**，纯 OpenAI 标准格式

| 字段 | 类型 | 含义 |
|------|------|------|
| `model` | string | 模型名称，如 `gpt-4o` |
| `messages` | array | 消息列表，包含 `role`（system/user/assistant）和 `content` |
| `stream` | boolean | 是否流式输出 |
| `max_tokens` | integer | 最大生成 token 数 |
| `stream_options` | object | 流式输出选项，如是否返回 usage 统计 |

---

## 图片生成节点

- **接口**: `POST /api/v1/images/generations`（JSON）
- 参考图通过 prompt 文本引用

| 字段 | 类型 | 含义 |
|------|------|------|
| `model` | string | 图片模型名称，如 `dall-e-3` |
| `prompt` | string | 图片描述提示词 |
| `n` | integer | 生成图片数量 |
| `response_format` | string | 返回格式，`url`（返回链接）或 `b64_json`（返回 base64） |
| `size` | string | 图片尺寸，如 `1024x1024`、`1792x1024` |
| `quality` | string | 图片质量，`standard` 或 `hd` |

---

## 图片编辑节点

- **接口**: `POST /api/v1/images/edits`（FormData）

| 字段 | 类型 | 含义 |
|------|------|------|
| `model` | string | 编辑模型名称 |
| `prompt` | string | 编辑指令，描述如何修改图片 |
| `n` | integer | 生成数量 |
| `response_format` | string | 返回格式 |
| `size` | string | 输出尺寸 |
| `quality` | string | 质量 |
| `output_format` | string | 输出格式，如 `png`、`jpeg` |
| `image` | file | 原始图片文件（FormData），作为编辑素材 |

---

## 视频节点

- **接口**: `POST /api/v1/videos`（两种模式）
  - **Grok 模式**：JSON 请求
  - **通用模式**：FormData，后端会将 `input_reference[]` 转换为 `reference_images`

| 字段 | 类型 | 含义 |
|------|------|------|
| `model` | string | 视频模型名称，如 `grok-imagine-video-1.5-preview` |
| `prompt` | string | 视频描述提示词 |
| `seconds` | string | 视频时长（秒），如 `"15"`、`"20"` |
| `aspect_ratio` | string | 宽高比，如 `16:9`、`9:16`、`1:1` |
| `resolution` | string | 分辨率，如 `720p`、`1080p` |
| `size` | string | 视频尺寸，如 `1280x720` |
| `resolution_name` | string | 分辨率名称，如 `720p` |
| `preset` | string | 预设模式，如 `normal`、`fast`、`quality` |
| `reference_images` | array | 参考图片数组，元素为 base64 data URL 字符串（`data:image/png;base64,...`） |
| `input_reference[]` | file | 参考图片文件（FormData 模式），后端会转换为 `reference_images` |

---

## 音频节点

- **接口**: `POST /api/v1/audio/speech`（FormData）
- **无素材字段**

| 字段 | 类型 | 含义 |
|------|------|------|
| `model` | string | 音频模型名称 |
| `input` | string | 要合成的文本内容 |
| `voice` | string | 语音类型，如 `alloy`、`echo`、`fable` 等 |
| `response_format` | string | 输出音频格式，如 `mp3`、`opus`、`aac`、`flac` |
| `speed` | number | 语速，`0.25`~`4.0`，默认 `1.0` |

---

## 后台字段映射配置常用字段

| 分类 | 字段 | 适用节点 |
|------|------|----------|
| **素材类** | `reference_images` | 视频 |
| **素材类** | `image` | 图片编辑 |
| **素材类** | `input` | 音频 |
| **提示词类** | `prompt` | 图片、视频 |
| **提示词类** | `messages` | 文本 |
| **参数类** | `size` | 图片、视频 |
| **参数类** | `quality` | 图片 |
| **参数类** | `seconds` | 视频 |
| **参数类** | `resolution` | 视频 |
| **参数类** | `aspect_ratio` | 视频 |
