/**
 * AI EASE to OpenAI-Compatible API Proxy
 * 
 * 将 AI EASE 图像生成服务封装为 OpenAI 兼容的 API
 * 支持 /v1/images/generations 端点
 * 包含 Web 前端界面
 */

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ==================== 配置 ====================

const PORT = process.env.PORT || 3000;
const AIEASE_API_BASE = 'https://www.aiease.ai/api/api';
const POLL_INTERVAL = 3000; // 轮询间隔 3 秒
const MAX_POLL_TIME = 180000; // 最大等待时间 3 分钟

// 历史记录存储 (内存)
const generationHistory = [];
const MAX_HISTORY = 100;

// ==================== 工具函数 ====================

/**
 * 生成随机 IPv6 地址
 */
function generateRandomIPv6() {
    const segments = [];
    for (let i = 0; i < 8; i++) {
        segments.push(Math.floor(Math.random() * 65536).toString(16).padStart(4, '0'));
    }
    return segments.join(':');
}

/**
 * 生成唯一 ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 获取带伪造 IP 的请求头
 */
function getHeaders(token = null) {
    const fakeIP = generateRandomIPv6();
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Forwarded-For': fakeIP,
        'X-Real-IP': fakeIP,
        'CF-Connecting-IP': fakeIP,
        'True-Client-IP': fakeIP,
        'Origin': 'https://www.aiease.ai',
        'Referer': 'https://www.aiease.ai/model/nano-banana-2/'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return { headers, fakeIP };
}

/**
 * 获取匿名 Token
 */
async function getAnonymousToken() {
    const { headers, fakeIP } = getHeaders();

    console.log(`[Token] 使用伪造 IP: ${fakeIP}`);

    const response = await fetch(`${AIEASE_API_BASE}/user/v2/visit`, {
        method: 'POST',
        headers,
        body: '{}'
    });

    const data = await response.json();

    if (data.code === 200 && data.result && data.result.token) {
        console.log(`[Token] 获取成功: 用户ID ${data.result.id}`);
        return {
            token: data.result.token,
            userId: data.result.id,
            fakeIP
        };
    }

    throw new Error('获取匿名 Token 失败: ' + JSON.stringify(data));
}

/**
 * 上传图片到临时图床
 */
async function uploadImageToCDN(token, base64Image) {
    // 从 base64 提取数据
    let base64Data = base64Image;
    let mimeType = 'image/jpeg';

    if (base64Image.startsWith('data:')) {
        const mimeMatch = base64Image.match(/data:([^;]+);/);
        if (mimeMatch) mimeType = mimeMatch[1];
        const base64Match = base64Image.match(/base64,(.+)/);
        if (base64Match) base64Data = base64Match[1];
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.split('/')[1] || 'jpg';

    console.log(`[Upload] 尝试上传图片... (${imageBuffer.length} bytes)`);

    try {
        // 使用 litterbox.catbox.moe (临时文件存储，1小时过期)
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('time', '1h');
        formData.append('fileToUpload', imageBuffer, {
            filename: `upload.${ext}`,
            contentType: mimeType
        });

        const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const url = await response.text();
            if (url && url.startsWith('http')) {
                console.log(`[Upload] catbox 上传成功: ${url.trim()}`);
                return url.trim();
            }
        }

        console.log(`[Upload] catbox 上传失败: ${response.status}`);
    } catch (error) {
        console.log(`[Upload] catbox 上传异常: ${error.message}`);
    }

    console.log(`[Upload] 上传失败`);
    return null;
}

/**
 * 提交图片生成任务
 */
async function submitImageGeneration(token, prompt, options = {}) {
    const { headers } = getHeaders(token);

    const model = options.model || 'kie_nano_banana_pro';
    const aspectRatio = options.aspectRatio || '1:1';
    const resolution = options.resolution || '2K';

    // 支持多图: referenceImages 数组 或 referenceImage 单图
    const referenceImages = options.referenceImages || (options.referenceImage ? [options.referenceImage] : []);
    const genType = referenceImages.length > 0 ? 'i2i' : 't2i';

    // 确保 prompt 是字符串
    const promptText = typeof prompt === 'string' ? prompt : String(prompt);

    // 构建 content 数组
    // 重要：根据抓包分析，顺序是先 text 后 image，字段名是 imgUrl
    const content = [];

    // 先添加文本提示
    content.push({ type: 'text', text: promptText });

    // 处理所有参考图片
    for (let i = 0; i < referenceImages.length; i++) {
        const refImage = referenceImages[i];
        console.log(`[Generate] 处理图片 ${i + 1}/${referenceImages.length}...`);

        // 尝试上传图片获取 URL
        const imageUrl = await uploadImageToCDN(token, refImage);

        if (imageUrl) {
            // 使用 imgUrl 字段（不是 image）
            content.push({ type: 'image', imgUrl: imageUrl });
            console.log(`[Generate] 图片 ${i + 1} CDN URL: ${imageUrl}`);
        } else {
            // 如果 CDN 上传失败，尝试直接使用 base64 data URL
            console.log(`[Generate] 图片 ${i + 1} CDN 上传失败，尝试 base64 备用方案`);
            content.push({ type: 'image', imgUrl: refImage });
        }
    }

    const body = {
        genType: model,
        model: model,
        params: {
            content: content,
            command: {
                type: genType,
                aspectRatio,
                resolution
            }
        }
    };

    console.log(`[Generate] 提交任务: "${promptText.substring(0, 50)}..." (${genType})`);
    console.log(`[Generate] 请求体: ${JSON.stringify({ ...body, params: { ...body.params, content: body.params.content.map(c => c.type === 'image' ? { ...c, imgUrl: (c.imgUrl || '').substring(0, 80) + '...' } : c) } })}`);

    const response = await fetch(`${AIEASE_API_BASE}/gen/v2/genImg`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code === 200 && data.result && data.result.taskId) {
        console.log(`[Generate] 任务ID: ${data.result.taskId}`);
        return data.result.taskId;
    }

    throw new Error('提交生成任务失败: ' + JSON.stringify(data));
}

/**
 * 轮询获取生成结果
 */
async function pollForResult(token, taskId) {
    const { headers } = getHeaders(token);
    const startTime = Date.now();
    let lastResponse = null;
    let pollCount = 0;

    console.log(`[Poll] 开始轮询任务 ${taskId}...`);

    while (Date.now() - startTime < MAX_POLL_TIME) {
        pollCount++;
        const response = await fetch(`${AIEASE_API_BASE}/gen/v2/imgResult/${taskId}`, {
            method: 'GET',
            headers
        });

        const data = await response.json();
        lastResponse = data;

        // 每10次轮询输出一次完整响应
        if (pollCount % 10 === 1) {
            console.log(`\n[Poll #${pollCount}] 上游响应: ${JSON.stringify(data)}`);
        }

        // 检查是否有错误状态
        if (data.code !== 200) {
            console.log(`\n[Poll] 上游返回错误: ${JSON.stringify(data)}`);
            throw new Error(`上游错误: ${data.message || JSON.stringify(data)}`);
        }

        if (data.result) {
            // 检查是否有失败状态
            if (data.result.status === 'failed' || data.result.status === 'error') {
                console.log(`\n[Poll] 任务失败: ${JSON.stringify(data.result)}`);
                throw new Error(`生成失败: ${data.result.message || data.result.status}`);
            }

            if (data.result.images && data.result.images.length > 0) {
                console.log(`\n[Poll] 生成完成! 图片数量: ${data.result.images.length}`);
                return data.result.images;
            }
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        process.stdout.write('.');
    }

    // 超时时输出最后一次响应
    console.log(`\n[Poll] 超时! 最后一次上游响应: ${JSON.stringify(lastResponse)}`);
    throw new Error(`生成超时 (轮询${pollCount}次). 最后响应: ${JSON.stringify(lastResponse)}`);
}


/**
 * 完整的图片生成流程
 */
async function generateImage(prompt, options = {}) {
    // 1. 获取匿名 Token
    const { token } = await getAnonymousToken();

    // 2. 提交生成任务
    const taskId = await submitImageGeneration(token, prompt, options);

    // 3. 轮询获取结果
    const images = await pollForResult(token, taskId);

    return images;
}

/**
 * 添加到历史记录
 */
function addToHistory(entry) {
    generationHistory.unshift({
        id: generateId(),
        timestamp: Date.now(),
        ...entry
    });

    // 限制历史记录数量
    if (generationHistory.length > MAX_HISTORY) {
        generationHistory.pop();
    }
}

// ==================== API 路由 ====================

/**
 * 前端生成图片接口
 * POST /api/generate
 */
app.post('/api/generate', async (req, res) => {
    try {
        const {
            prompt,
            model = 'kie_nano_banana_pro',
            resolution = '2K',
            aspectRatio = '1:1',
            referenceImage = null,  // 兼容单图
            referenceImages = []    // 多图支持
        } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'prompt is required'
            });
        }

        // 合并单图和多图参数
        const allImages = referenceImage
            ? [referenceImage, ...referenceImages]
            : referenceImages;

        const genType = allImages.length > 0 ? 'i2i' : 't2i';
        console.log(`\n========== 前端生成请求 ==========`);
        console.log(`类型: ${genType}`);
        console.log(`Prompt: ${prompt}`);
        console.log(`Model: ${model}`);
        console.log(`Resolution: ${resolution}`);
        console.log(`Aspect Ratio: ${aspectRatio}`);
        if (allImages.length > 0) {
            console.log(`参考图数量: ${allImages.length}`);
        }

        // 生成图片
        const images = await generateImage(prompt, {
            model: mapModel(model),
            resolution,
            aspectRatio,
            referenceImages: allImages
        });

        // 添加到历史记录
        images.forEach(img => {
            addToHistory({
                prompt,
                model,
                resolution,
                aspectRatio,
                type: genType,
                imageUrl: img.url
            });
        });

        res.json({
            success: true,
            images: images.map(img => ({
                url: img.url
            }))
        });

    } catch (error) {
        console.error(`[Error] ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取历史记录
 * GET /api/history
 */
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        success: true,
        history: generationHistory.slice(0, limit)
    });
});

/**
 * 清空历史记录
 * DELETE /api/history
 */
app.delete('/api/history', (req, res) => {
    generationHistory.length = 0;
    res.json({ success: true });
});

/**
 * OpenAI 兼容的聊天补全接口 (用于 Cherry Studio 等客户端)
 * POST /v1/chat/completions
 * 
 * 这个端点会检测用户意图，如果是图片生成请求，则调用图片生成功能
 */
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { model, messages, stream = false } = req.body;

        // 获取最后一条用户消息
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();

        // 解析 prompt 和图片
        // OpenAI 格式: content 可能是字符串或数组
        // 数组格式: [{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: '...' } }]
        let prompt = '';
        let referenceImage = null;

        if (lastUserMessage) {
            const content = lastUserMessage.content;

            if (typeof content === 'string') {
                // 简单字符串格式
                prompt = content;
            } else if (Array.isArray(content)) {
                // 多模态数组格式
                for (const item of content) {
                    if (item.type === 'text') {
                        prompt = item.text || '';
                    } else if (item.type === 'image_url' && item.image_url) {
                        // 可能是 URL 或 base64 data URL
                        referenceImage = item.image_url.url || item.image_url;
                    } else if (item.type === 'image' && item.image) {
                        // 备用格式
                        referenceImage = item.image;
                    }
                }
            }
        }

        console.log(`\n========== Chat Completions 请求 ==========`);
        console.log(`Model: ${model}`);
        console.log(`Prompt: ${prompt}`);
        console.log(`Reference Image: ${referenceImage ? referenceImage.substring(0, 50) + '...' : 'null'}`);
        console.log(`Stream: ${stream}`);

        // 生成图片
        const images = await generateImage(prompt, {
            model: mapModel(model),
            referenceImage: referenceImage
        });

        const imageUrl = images[0]?.url || '';
        const responseText = imageUrl
            ? `图片已生成！\n\n![Generated Image](${imageUrl})\n\n[点击查看原图](${imageUrl})`
            : '图片生成失败，请重试。';

        if (stream) {
            // 流式响应
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const streamResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                    index: 0,
                    delta: { role: 'assistant', content: responseText },
                    finish_reason: null
                }]
            };

            res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);

            // 发送结束标记
            const endResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                }]
            };

            res.write(`data: ${JSON.stringify(endResponse)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();

        } else {
            // 非流式响应
            const response = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseText
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: prompt.length,
                    completion_tokens: responseText.length,
                    total_tokens: prompt.length + responseText.length
                }
            };

            res.json(response);
        }

        console.log(`[Response] 图片生成成功: ${imageUrl}`);

    } catch (error) {
        console.error(`[Error] ${error.message}`);

        if (req.body.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            const errorResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [{
                    index: 0,
                    delta: { role: 'assistant', content: `错误: ${error.message}` },
                    finish_reason: 'stop'
                }]
            };
            res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.status(500).json({
                error: {
                    message: error.message,
                    type: 'server_error'
                }
            });
        }
    }
});


/**
 * OpenAI 兼容的图像生成接口
 * POST /v1/images/generations
 * 
 * 支持的参数:
 * - prompt: 提示词 (必需)
 * - model: 模型名称 (dall-e-3, dall-e-2)
 * - size: 尺寸 (1024x1024, 1792x1024, 1024x1792)
 * - quality: 质量 (hd, standard)
 * - n: 生成数量 (目前仅支持1)
 * 
 * 扩展参数 (非OpenAI标准):
 * - resolution: 分辨率 (1K, 2K, 4K)
 * - aspect_ratio: 宽高比 (1:1, 16:9, 9:16, 4:3, 3:4)
 */
app.post('/v1/images/generations', async (req, res) => {
    try {
        const {
            prompt,
            model,
            size,
            quality,
            n = 1,
            // 扩展参数
            resolution,
            aspect_ratio
        } = req.body;

        if (!prompt) {
            return res.status(400).json({
                error: {
                    message: 'prompt is required',
                    type: 'invalid_request_error'
                }
            });
        }

        console.log(`\n========== 新请求 ==========`);
        console.log(`Prompt: ${prompt}`);
        console.log(`Model: ${model || 'dall-e-3'}`);
        console.log(`Size: ${size || 'default'}`);
        console.log(`Quality: ${quality || 'standard'}`);
        console.log(`Resolution: ${resolution || 'auto'}`);
        console.log(`Aspect Ratio: ${aspect_ratio || 'auto'}`);

        // 解析宽高比
        let aspectRatio = aspect_ratio || '1:1';
        if (!aspect_ratio && size) {
            const [w, h] = size.split('x').map(Number);
            if (w && h) {
                const ratio = w / h;
                if (ratio > 1.5) aspectRatio = '16:9';
                else if (ratio > 1.2) aspectRatio = '4:3';
                else if (ratio < 0.67) aspectRatio = '9:16';
                else if (ratio < 0.83) aspectRatio = '3:4';
                else aspectRatio = '1:1';
            }
        }

        // 解析分辨率
        let finalResolution = resolution || '2K';
        if (!resolution && quality) {
            // 根据 OpenAI 的 quality 参数映射分辨率
            if (quality === 'hd') {
                finalResolution = '4K';
            } else {
                finalResolution = '2K';
            }
        }
        // 根据 size 推断分辨率
        if (!resolution && size) {
            const [w] = size.split('x').map(Number);
            if (w >= 2048) finalResolution = '4K';
            else if (w >= 1024) finalResolution = '2K';
            else finalResolution = '1K';
        }

        console.log(`[Config] 最终配置: ${aspectRatio}, ${finalResolution}`);

        // 生成图片
        const images = await generateImage(prompt, {
            aspectRatio,
            resolution: finalResolution,
            model: mapModel(model)
        });

        // 返回 OpenAI 兼容格式
        const response = {
            created: Math.floor(Date.now() / 1000),
            data: images.map(img => ({
                url: img.url,
                revised_prompt: prompt
            }))
        };

        console.log(`[Response] 成功返回 ${images.length} 张图片`);
        res.json(response);

    } catch (error) {
        console.error(`[Error] ${error.message}`);
        res.status(500).json({
            error: {
                message: error.message,
                type: 'server_error'
            }
        });
    }
});


/**
 * 模型名称映射
 */
function mapModel(model) {
    const modelMap = {
        // 原始名称
        'kie_nano_banana_pro': 'kie_nano_banana_pro',
        'kie_nano_banana': 'kie_nano_banana',
        // 兼容 OpenAI 名称
        'dall-e-3': 'kie_nano_banana_pro',
        'dall-e-2': 'kie_nano_banana',
        // 简写
        'nano-banana-pro': 'kie_nano_banana_pro',
        'nano-banana': 'kie_nano_banana'
    };
    return modelMap[model] || 'kie_nano_banana_pro';
}

/**
 * 列出可用模型
 * GET /v1/models
 */
app.get('/v1/models', (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: 'kie_nano_banana_pro',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'Nano Banana Pro - 高质量图像生成 (4K支持)',
                aliases: ['dall-e-3', 'nano-banana-pro']
            },
            {
                id: 'kie_nano_banana',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'Nano Banana - 标准图像生成',
                aliases: ['dall-e-2', 'nano-banana']
            }
        ]
    });
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 启动服务器 ====================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           AI EASE Proxy - Image Generation UI             ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                  ║
║                                                           ║
║  Web UI:                                                  ║
║    http://localhost:${PORT}                  - 图像生成界面    ║
║                                                           ║
║  API Endpoints:                                           ║
║    POST /api/generate           - 前端生成接口            ║
║    GET  /api/history            - 历史记录                ║
║    POST /v1/images/generations  - OpenAI 兼容接口         ║
║    GET  /v1/models              - 模型列表                ║
║    GET  /health                 - 健康检查                ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
