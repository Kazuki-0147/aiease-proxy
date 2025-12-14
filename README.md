# AI EASE Proxy

将 AI EASE 图像生成服务封装为 OpenAI 兼容的 API，并提供现代化的 Web UI。

## ✨ 功能特性

- 🖼️ **Web UI** - 现代化深色主题界面
- 🔄 **文生图 (T2I)** - 文字描述生成图片
- 🎨 **图生图 (I2I)** - 支持最多 5 张参考图片
- ⚡ **并发生成** - 同时生成最多 10 张图片
- 📜 **历史记录** - 自动保存生成结果
- 🔌 **OpenAI 兼容** - 支持 OpenAI SDK 和 Chat Completions

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务器
npm start
```

服务器将在 http://localhost:3000 启动。

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Web UI 界面 |
| `/api/generate` | POST | 前端生成接口 |
| `/api/history` | GET | 获取历史记录 |
| `/v1/chat/completions` | POST | Chat Completions (支持多模态) |
| `/v1/images/generations` | POST | 生成图片 (OpenAI 兼容) |
| `/v1/models` | GET | 列出可用模型 |
| `/health` | GET | 健康检查 |

## 使用示例

### Web UI

直接访问 http://localhost:3000 使用图形界面：

- 选择 **文生图** 或 **图生图** 模式
- 输入提示词，调整参数
- 图生图支持最多 5 张参考图片
- 可同时生成 1-10 张图片

### cURL (Images API)

```bash
curl -X POST http://localhost:3000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cute cat playing with yarn", "model": "dall-e-3"}'
```

### cURL (Chat Completions - 多模态)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "把这张图片变成赛博朋克风格"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
      ]
    }]
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="not-needed"
)

# 文生图
response = client.images.generate(
    model="dall-e-3",
    prompt="a beautiful sunset over mountains",
    size="1024x1024"
)
print(response.data[0].url)

# 图生图 (Chat Completions)
import base64
with open("image.jpg", "rb") as f:
    img_base64 = base64.b64encode(f.read()).decode()

response = client.chat.completions.create(
    model="dall-e-3",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "把这张图片变成动漫风格"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}}
        ]
    }]
)
print(response.choices[0].message.content)
```

### Node.js

```javascript
const response = await fetch('http://localhost:3000/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        prompt: 'a futuristic city',
        model: 'dall-e-3'
    })
});

const data = await response.json();
console.log(data.data[0].url);
```

## 🎨 支持的参数

### 分辨率

| 值 | 说明 |
|----|------|
| `1K` | 1024px |
| `2K` | 2048px (默认) |
| `4K` | 4096px |

### 宽高比

| 值 | 说明 |
|----|------|
| `1:1` | 正方形 (默认) |
| `16:9` | 横屏宽 |
| `9:16` | 竖屏高 |
| `4:3` | 横屏 |
| `3:4` | 竖屏 |

### 模型映射

| 模型名称 | 映射到 | 说明 |
|----------|--------|------|
| `dall-e-3` | Nano Banana Pro | 高质量图像生成 |
| `dall-e-2` | Nano Banana | 标准图像生成 |

## ⚙️ 工作原理

1. 每次请求生成随机 IPv6 地址 (绕过 IP 限制)
2. 调用 AI EASE 的 `/api/api/user/v2/visit` 获取匿名 Token
3. 图生图时，先上传图片到临时图床获取公开 URL
4. 提交图片生成任务
5. 轮询等待结果（最长 3 分钟）
6. 返回 OpenAI 兼容格式的响应

## ⚠️ 注意事项

- 每次请求都会获取新的匿名用户身份，无配额限制
- 图片生成通常需要 30-120 秒
- 并发生成会自动限流 (每 2 秒一个请求)，避免 API 过载
- 仅供学习研究使用

## 📁 项目结构

```
aiease-proxy/
├── server.js           # 后端服务器
├── public/
│   ├── index.html      # Web UI 主页
│   ├── css/style.css   # 样式文件
│   └── js/app.js       # 前端逻辑
├── package.json
└── README.md
```
