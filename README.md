<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://github.com/Xujs98/xujs-infinite-canvas"><img src="https://img.shields.io/badge/GitHub-源仓库-2496ed?style=flat-square&logo=github" alt="GitHub"></a>
  <a href="VERSION"><img src="https://img.shields.io/badge/version-v0.3.0-2563eb?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker ready"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=nextdotjs" alt="Next.js"></a>
  <a href="https://go.dev/"><img src="https://img.shields.io/badge/Go-1.25-00add8?style=flat-square&logo=go&logoColor=white" alt="Go"></a>
</p>

## 关于本仓库

本仓库是基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 的二次开发版本，在原版基础上进行了功能扩展和定制修改。

> [!NOTE]
> 本仓库为私有仓库，仅用于个人/团队内部使用。如需使用无限画布项目，请访问原版仓库。

原版项目：https://github.com/basketikun/infinite-canvas

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：支持 OpenAI 兼容接口的文生图、图生图、参考图编辑、文本问答和视频生成；Seedance 2.0 可通过火山方舟 Agent Plan 接入。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布。
- 提示词库：抓取多个 GitHub 开源项目，按案例整理数百个图片提示词。

完整功能说明见 [docs/content/docs/overview/features.mdx](docs/content/docs/overview/features.mdx)。

## 技术栈

- 前端：Next.js、React、TypeScript、Tailwind CSS、Ant Design、Zustand、TanStack Query。
- 后端：Go、Gin、GORM。
- 部署：Docker。

## 快速开始

```bash
git clone git@github.com:Xujs98/xujs-infinite-canvas.git
cd xujs-infinite-canvas
cp .env.example .env
# 修改默认账号密码等信息
docker-compose up -d
```

本地源码构建运行：

```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

运行后默认端口3000，可访问 `http://localhost:3000`。

如需要拉取提示词，可前往：`http://localhost:3000/admin/prompts`

## Docker 镜像

本项目通过 GitHub Actions 自动构建 Docker 镜像，推送到 GitHub Container Registry。

拉取方式：

```bash
# 应用镜像
docker pull ghcr.io/Xujs98/infinite-canvas:latest

# 文档镜像
docker pull ghcr.io/Xujs98/infinite-canvas-docs:latest
```

发版后会自动构建，镜像版本与 Git tag 对应（如 `v0.3.0`）。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 文档

- [功能介绍](docs/content/docs/overview/features.mdx)
- [待办事项](docs/content/docs/progress/todo.mdx)
- [后端数据库说明](docs/content/docs/backend/backend-database.mdx)
- [接口响应约定](docs/content/docs/backend/api-response.mdx)
- [本地 Canvas Agent](canvas-agent/README.md)

## 致谢

本项目基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 二次开发，感谢原作者的开源贡献。

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。
