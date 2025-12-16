# AI EASE Studio (Proxy)

这是一个基于 [AI EASE](https://www.aiease.ai/) 的非官方代理服务，提供了现代化的 Web 界面和 OpenAI 兼容的 API 接口。本项目仅供学习交流使用。

## ✨ 主要特性

*   **现代化 UI**: 赛博朋克风格界面，支持移动端适配。
*   **多用户系统**: 完整的注册/登录流程，支持多用户隔离。
*   **持久化存储**: 支持 MySQL (生产环境) 和 SQLite (本地开发) 存储聊天记录。
*   **OpenAI 兼容**: 提供 `/v1/chat/completions` 和 `/v1/images/generations` 接口，可接入 Cherry Studio、NextChat 等客户端。
*   **多模态生成**: 支持文生图、图生图、文生视频、图生视频。
*   **Docker 部署**: 提供一键部署方案，适配 1Panel 等面板。

## 🚀 快速开始 (Docker)

### 1. 部署 (推荐)

使用 Docker Compose 一键启动：

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/aiease-proxy.git
cd aiease-proxy

# 2. 修改配置 (可选)
# 编辑 docker-compose.yml 修改 DB_PASSWORD 和 JWT_SECRET

# 3. 启动服务
docker-compose up -d
```

访问 `http://your-ip:3001` 即可使用。

### 2. 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 默认使用 SQLite，无需额外配置数据库

# 3. 启动开发服务器
npm run dev
```

## 🛠️ 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3001` |
| `JWT_SECRET` | JWT 签名密钥 (务必修改) | - |
| `DB_TYPE` | 数据库类型 (`sqlite` / `mysql`) | `sqlite` |
| `DB_HOST` | MySQL 主机 | `mysql` |
| `DB_USER` | MySQL 用户 | `aiease` |
| `DB_PASSWORD` | MySQL 密码 | - |
| `DB_NAME` | MySQL 数据库名 | `aiease_proxy` |

> 💡 开发环境小提示：如果未配置 `JWT_SECRET`，服务会自动生成并写入项目根目录的 `.jwt_secret.dev`，用于在重启后保持登录 token 不失效；生产环境仍强制要求显式配置 `JWT_SECRET`。

## ⚠️ 免责声明

本项目基于 [https://github.com/Kazuki-0147/aiease-proxy](https://github.com/Kazuki-0147/aiease-proxy) 二次开发。

1.  本项目仅供技术研究和学习交流使用，不得用于商业用途。
2.  使用者应自行承担使用本项目可能带来的风险（如账号封禁、法律风险等）。
3.  本项目不存储任何用户生成的敏感数据，所有生成内容均由上游服务提供。

## 📄 License

MIT
