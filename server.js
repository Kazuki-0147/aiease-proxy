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
const crypto = require('crypto');

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

// Web UI 异步任务（内存）
const generationJobs = new Map(); // jobId -> { status, createdAt, updatedAt, result, error, ... }
const JOB_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// 模型配置
const MODEL_CONFIG = {
    // Nano Banana 系列
    'kie_nano_banana_pro': {
        genType: 'kie_nano_banana_pro',
        model: 'kie_nano_banana_pro',
        supportsI2i: true,
        aspectRatioFormat: 'colon', // 1:1
        supportsResolution: true,
        requiresAieaseOss: true  // 使用 AI EASE 官方上传
    },
    'kie_nano_banana': {
        genType: 'kie_nano_banana',
        model: 'kie_nano_banana',
        supportsI2i: true,
        aspectRatioFormat: 'colon',
        supportsResolution: true,
        requiresAieaseOss: true  // 使用 AI EASE 官方上传
    },
    // Al Ease Model (不支持图生图)
    'wf_art': {
        genType: 'wf_art',
        model: 'wf_art',
        supportsI2i: false,
        aspectRatioFormat: 'dash', // 1-1
        supportsResolution: false
    },
    // Seedream 4.0
    'see_dream_img': {
        genType: 'see_dream_img',
        model: 'see_dream_img',
        supportsI2i: true,
        aspectRatioFormat: 'colon',
        supportsResolution: true,
        requiresAieaseOss: true  // 使用 AI EASE 官方上传
    },
    // Seedream 4.5
    'doubao-seedream-4.5': {
        genType: 'volces_img',
        model: 'doubao-seedream-4.5',
        supportsI2i: true,
        aspectRatioFormat: 'colon',
        supportsResolution: true,
        requiresAieaseOss: true  // 使用 AI EASE 官方上传
    }
};

// 获取模型配置
function getModelConfig(modelId) {
    return MODEL_CONFIG[modelId] || MODEL_CONFIG['kie_nano_banana_pro'];
}

// 上游并发控制：避免大量并发导致风控/排队/断连
const MAX_CONCURRENT_UPSTREAM = parseInt(process.env.MAX_CONCURRENT_UPSTREAM || '10', 10);
let upstreamRunning = 0;
const upstreamQueue = [];

function enqueueUpstream(fn) {
    return new Promise((resolve, reject) => {
        const run = async () => {
            upstreamRunning++;
            try {
                resolve(await fn());
            } catch (err) {
                reject(err);
            } finally {
                upstreamRunning--;
                const next = upstreamQueue.shift();
                if (next) next();
            }
        };

        if (upstreamRunning < MAX_CONCURRENT_UPSTREAM) run();
        else upstreamQueue.push(run);
    });
}

setInterval(() => {
    const now = Date.now();
    for (const [jobId, job] of generationJobs.entries()) {
        const baseTime = job.updatedAt || job.createdAt || now;
        if (now - baseTime > JOB_TTL_MS) generationJobs.delete(jobId);
    }
}, 60_000).unref?.();

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
function getHeaders(token = null, fakeIPOverride = null) {
    const fakeIP = fakeIPOverride || generateRandomIPv6();
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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
    console.log(`[Token] 正在请求 Token...`);

    let response;
    try {
        response = await fetch(`${AIEASE_API_BASE}/user/v2/visit`, {
            method: 'POST',
            headers,
            body: '{}'
        });
    } catch (networkError) {
        // 网络层面的错误（DNS 解析失败、连接超时、TLS 错误等）
        console.error(`[Token] ❌ 网络请求失败: ${networkError.message}`);
        console.error(`[Token] 请检查服务器是否能访问 www.aiease.ai`);
        throw new Error(`Token 网络请求失败: ${networkError.message}`);
    }

    console.log(`[Token] 响应状态: ${response.status} ${response.statusText}`);

    // 非 200 状态码直接报错
    if (response.status !== 200) {
        console.error(`[Token] ❌ 获取失败! HTTP 状态码: ${response.status}`);
        const errorText = await response.text().catch(() => '无法读取响应内容');
        console.error(`[Token] 响应内容: ${errorText.substring(0, 500)}`);
        throw new Error(`Token 获取失败: HTTP ${response.status} - ${response.statusText}`);
    }

    // 先获取文本内容
    let responseText;
    try {
        responseText = await response.text();
    } catch (textError) {
        console.error(`[Token] 读取响应内容失败: ${textError.message}`);
        throw new Error(`Token 读取响应失败: ${textError.message}`);
    }

    // 检查是否是 HTML 错误页（Cloudflare 拦截、服务器错误等）
    if (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html')) {
        console.error(`[Token] 返回了 HTML 页面而非 JSON，可能被 Cloudflare 拦截或服务器错误`);
        console.error(`[Token] 响应内容前 500 字符: ${responseText.substring(0, 500)}`);
        throw new Error(`Token 请求返回 HTML 页面 (HTTP ${response.status})，可能是 IP 被风控或网络问题`);
    }

    // 解析 JSON
    let data;
    try {
        data = JSON.parse(responseText);
    } catch (jsonError) {
        console.error(`[Token] JSON 解析失败: ${jsonError.message}`);
        console.error(`[Token] 原始响应: ${responseText.substring(0, 500)}`);
        throw new Error(`Token 响应不是有效 JSON: ${responseText.substring(0, 200)}`);
    }

    if (data.code === 200 && data.result && data.result.token) {
        console.log(`[Token] 获取成功: 用户ID ${data.result.id}`);
        return {
            token: data.result.token,
            userId: data.result.id,
            fakeIP
        };
    }

    // API 返回了 JSON 但不是成功状态
    console.error(`[Token] API 返回错误: ${JSON.stringify(data)}`);
    throw new Error('获取匿名 Token 失败: ' + JSON.stringify(data));
}

// ==================== AI EASE 官方图床上传（抓包还原） ====================

const AIEASE_OSS_FEATURE_CODE = 'default_persistent';
const AIEASE_OSS_SECRET = 'Q@D24=oueV%]OBS8i,%eK=5I|7WU$PeE';
const AIEASE_OSS_KEY = crypto.createHash('sha256').update(AIEASE_OSS_SECRET).digest(); // 32 bytes

function aieaseOssEncrypt(plainText) {
    const iv = crypto.randomBytes(16);
    const encoded = encodeURIComponent(plainText);
    const cipher = crypto.createCipheriv('aes-256-cfb', AIEASE_OSS_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
}

function aieaseOssDecrypt(base64CipherText) {
    const buf = Buffer.from(base64CipherText, 'base64');
    if (buf.length <= 16) throw new Error('Invalid encrypted payload');
    const iv = buf.subarray(0, 16);
    const encrypted = buf.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cfb', AIEASE_OSS_KEY, iv);
    const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return decodeURIComponent(decoded);
}

/**
 * 上传图片到 AI EASE 官方 CDN
 */
async function uploadImageToAieaseOss(token, base64Image, fakeIP) {
    // 从 base64 提取数据
    let base64Data = base64Image;
    let mimeType = 'image/jpeg';

    if (typeof base64Image !== 'string' || !base64Image.startsWith('data:')) {
        throw new Error('AI EASE OSS 上传仅支持 data URL 输入');
    }

    const mimeMatch = base64Image.match(/data:([^;]+);/);
    if (mimeMatch) mimeType = mimeMatch[1];
    const base64Match = base64Image.match(/base64,(.+)/);
    if (base64Match) base64Data = base64Match[1];

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.split('/')[1] || 'jpg';
    const filename = `upload_${Date.now()}.${ext}`;

    console.log(`[AI EASE OSS] 准备上传图片... (${imageBuffer.length} bytes)`);

    // 1) 获取预签名上传 URL（返回值是加密字符串，需要同算法解密）
    const meta = {
        length: imageBuffer.length,
        filetype: mimeType,
        filename,
        time: Math.floor(Date.now() / 1000)
    };
    const encryptedData = aieaseOssEncrypt(JSON.stringify(meta));

    const { headers } = getHeaders(token, fakeIP);
    const presignedResp = await fetch(`${AIEASE_API_BASE}/oss/getMediaPreSignedUrl`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            featureCode: AIEASE_OSS_FEATURE_CODE,
            encryptedData
        })
    });

    const presignedJson = await presignedResp.json();
    if (presignedJson.code !== 200 || !presignedJson.result) {
        throw new Error(`AI EASE 获取预签名失败: ${JSON.stringify(presignedJson)}`);
    }

    const preUrl = aieaseOssDecrypt(presignedJson.result);
    if (!preUrl || !preUrl.startsWith('http')) {
        throw new Error('AI EASE 预签名 URL 无效');
    }

    console.log(`[AI EASE OSS] 获取预签名 URL 成功，开始上传...`);

    // 2) PUT 上传文件到预签名地址
    const putResp = await fetch(preUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: imageBuffer
    });

    if (!putResp.ok) {
        throw new Error(`AI EASE OSS PUT 上传失败: HTTP ${putResp.status}`);
    }

    // 3) 生成最终可用 URL（去掉签名参数）
    const realUrl = preUrl.split('?')[0];
    console.log(`[AI EASE OSS] 上传成功: ${realUrl}`);
    return realUrl;
}

/**
 * 上传图片到临时图床 (catbox)
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
    const { headers, fakeIP } = getHeaders(token, options.fakeIP);

    const modelId = options.model || 'kie_nano_banana_pro';
    const modelConfig = getModelConfig(modelId);
    const aspectRatio = options.aspectRatio || '1:1';
    const resolution = options.resolution || '2K';

    // 支持多图: referenceImages 数组 或 referenceImage 单图
    const referenceImages = options.referenceImages || (options.referenceImage ? [options.referenceImage] : []);

    // 检查模型是否支持图生图
    if (referenceImages.length > 0 && !modelConfig.supportsI2i) {
        console.log(`[Generate] ⚠️ 模型 ${modelId} 不支持图生图，忽略参考图片`);
    }

    // 如果模型不支持 i2i，强制使用 t2i
    const effectiveRefImages = modelConfig.supportsI2i ? referenceImages : [];
    const genType = effectiveRefImages.length > 0 ? 'i2i' : 't2i';

    // 确保 prompt 是字符串
    const promptText = typeof prompt === 'string' ? prompt : String(prompt);

    // 构建 content 数组
    // 重要：根据抓包分析，顺序是先 text 后 image，字段名是 imgUrl
    const content = [];

    // 先添加文本提示
    content.push({ type: 'text', text: promptText });

    // 处理所有参考图片（仅当模型支持 i2i 时）
    for (let i = 0; i < effectiveRefImages.length; i++) {
        const refImage = effectiveRefImages[i];
        console.log(`[Generate] 处理图片 ${i + 1}/${effectiveRefImages.length}...`);

        let imageUrl = null;

        // 根据模型配置选择上传方式
        if (modelConfig.requiresAieaseOss) {
            // Seedream 4.0/4.5 等需要使用 AI EASE 官方 CDN
            try {
                imageUrl = await uploadImageToAieaseOss(token, refImage, fakeIP);
            } catch (ossError) {
                console.log(`[Generate] AI EASE OSS 上传失败: ${ossError.message}`);
                // 如果 AI EASE OSS 失败，尝试 catbox 作为备用
                imageUrl = await uploadImageToCDN(token, refImage);
            }
        } else {
            // 其他模型使用 catbox
            imageUrl = await uploadImageToCDN(token, refImage);
        }

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

    // 处理宽高比格式: 有的模型用 1:1，有的用 1-1
    let formattedAspectRatio = aspectRatio;
    if (modelConfig.aspectRatioFormat === 'dash') {
        formattedAspectRatio = aspectRatio.replace(/:/g, '-');
    }

    // 构建请求体
    const command = {
        type: genType,
        aspectRatio: formattedAspectRatio
    };

    // 部分模型支持 resolution，部分不支持
    if (modelConfig.supportsResolution) {
        command.resolution = resolution;
    }

    const body = {
        genType: modelConfig.genType,
        model: modelConfig.model,
        params: {
            content: content,
            command: command
        }
    };

    console.log(`[Generate] 使用伪造 IP: ${fakeIP}`);
    console.log(`[Generate] 模型: ${modelId} (genType: ${modelConfig.genType}, model: ${modelConfig.model})`);
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
async function pollForResult(token, taskId, fakeIPOverride = null) {
    const { headers, fakeIP } = getHeaders(token, fakeIPOverride);
    const startTime = Date.now();
    let lastResponse = null;
    let pollCount = 0;

    console.log(`[Poll] 使用伪造 IP: ${fakeIP}`);
    console.log(`[Poll] 开始轮询任务 ${taskId}...`);

    while (Date.now() - startTime < MAX_POLL_TIME) {
        pollCount++;
        // 轮询接口可能被边缘缓存，增加时间戳参数强制回源
        const response = await fetch(`${AIEASE_API_BASE}/gen/v2/imgResult/${taskId}?t=${Date.now()}`, {
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
    const { token, fakeIP } = await getAnonymousToken();

    // 2. 提交生成任务
    const taskId = await submitImageGeneration(token, prompt, { ...options, fakeIP });

    // 3. 轮询获取结果
    const images = await pollForResult(token, taskId, fakeIP);

    return images;
}

// ==================== 视频生成 ====================

const VIDEO_POLL_INTERVAL = 5000; // 视频轮询间隔 5 秒
const VIDEO_MAX_POLL_TIME = 600000; // 视频最大等待时间 10 分钟

/**
 * 提交视频生成任务
 */
async function submitVideoGeneration(token, prompt, options = {}) {
    const { headers, fakeIP } = getHeaders(token, options.fakeIP);

    const type = options.referenceImage ? 'i2v' : 't2v';
    const ratio = options.ratio || '16:9';
    const resolution = options.resolution || '720p';
    const duration = options.duration || 5;
    const mode = options.mode || 'pro';

    // 构建 content 数组
    const content = [{ type: 'text', text: prompt }];

    // 如果有参考图片，添加图片
    if (options.referenceImage) {
        // 尝试上传图片获取 URL
        const imageUrl = await uploadImageToCDN(token, options.referenceImage);
        if (imageUrl) {
            content.push({ type: 'image', imgUrl: imageUrl });
            console.log(`[Video] 参考图片 CDN URL: ${imageUrl}`);
        } else {
            console.log(`[Video] CDN 上传失败，尝试 base64`);
            content.push({ type: 'image', imgUrl: options.referenceImage });
        }
    }

    // 构建 command
    const command = {
        type: type,
        resolution: resolution,
        duration: duration,
        mode: mode
    };

    // 文生视频支持比例，图生视频不支持
    if (type === 't2v') {
        command.ratio = ratio;
    }

    const body = {
        featureCode: 'k_seedance',
        model: 'k-seedance',
        params: {
            content: content,
            command: command,
            isFrames: false,
            mode: mode
        }
    };

    console.log(`[Video] 使用伪造 IP: ${fakeIP}`);
    console.log(`[Video] 提交任务: "${prompt.substring(0, 50)}..." (${type})`);
    console.log(`[Video] 参数: ratio=${ratio}, resolution=${resolution}, duration=${duration}s, mode=${mode}`);

    const response = await fetch(`${AIEASE_API_BASE}/gen/videos/model-video/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.code === 200 && data.result && data.result.taskId) {
        console.log(`[Video] 任务ID: ${data.result.taskId}, 状态: ${data.result.taskStatus}`);
        return data.result.taskId;
    }

    throw new Error('提交视频生成任务失败: ' + JSON.stringify(data));
}

/**
 * 轮询获取视频生成结果
 */
async function pollForVideoResult(token, taskId, fakeIPOverride = null) {
    const { headers, fakeIP } = getHeaders(token, fakeIPOverride);
    const startTime = Date.now();
    let lastResponse = null;
    let pollCount = 0;

    console.log(`[Video Poll] 使用伪造 IP: ${fakeIP}`);
    console.log(`[Video Poll] 开始轮询任务 ${taskId}...`);

    while (Date.now() - startTime < VIDEO_MAX_POLL_TIME) {
        pollCount++;

        const response = await fetch(`${AIEASE_API_BASE}/gen/videos/model-video/${taskId}?t=${Date.now()}`, {
            method: 'GET',
            headers
        });

        const data = await response.json();
        lastResponse = data;

        // 每 10 次轮询输出一次完整响应
        if (pollCount % 10 === 1) {
            console.log(`\n[Video Poll #${pollCount}] 上游响应: ${JSON.stringify(data)}`);
        }

        if (data.code !== 200) {
            console.log(`\n[Video Poll] 上游返回错误: ${JSON.stringify(data)}`);
            throw new Error(`视频生成错误: ${data.message || JSON.stringify(data)}`);
        }

        if (data.result) {
            const status = data.result.taskStatus;

            if (status === 'succeed' && data.result.videoUrl) {
                console.log(`\n[Video Poll] 生成完成!`);
                console.log(`[Video Poll] 视频 URL: ${data.result.videoUrl}`);
                return {
                    videoUrl: data.result.videoUrl,
                    thumbnailUrl: data.result.thumbnailUrl
                };
            }

            if (status === 'failed' || status === 'error') {
                console.log(`\n[Video Poll] 任务失败: ${JSON.stringify(data.result)}`);
                throw new Error(`视频生成失败: ${data.result.message || status}`);
            }
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL));
        process.stdout.write('.');
    }

    console.log(`\n[Video Poll] 超时! 最后响应: ${JSON.stringify(lastResponse)}`);
    throw new Error(`视频生成超时 (轮询${pollCount}次)`);
}

/**
 * 完整的视频生成流程
 */
async function generateVideo(prompt, options = {}) {
    // 1. 获取匿名 Token
    const { token, fakeIP } = await getAnonymousToken();

    // 2. 提交视频生成任务
    const taskId = await submitVideoGeneration(token, prompt, { ...options, fakeIP });

    // 3. 轮询获取结果
    const result = await pollForVideoResult(token, taskId, fakeIP);

    return result;
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
 * Web UI：提交异步生成任务（避免长连接被反代超时）
 * POST /api/generate/submit
 */
app.post('/api/generate/submit', async (req, res) => {
    const {
        prompt,
        model = 'kie_nano_banana_pro',
        resolution = '2K',
        aspectRatio = '1:1',
        referenceImage = null,  // 兼容单图
        referenceImages = []    // 多图支持
    } = req.body || {};

    if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    const allImages = referenceImage
        ? [referenceImage, ...referenceImages]
        : referenceImages;

    const genType = allImages.length > 0 ? 'i2i' : 't2i';
    const mappedModel = mapModel(model);

    const jobId = generateId();
    generationJobs.set(jobId, {
        id: jobId,
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        request: {
            prompt,
            model,
            mappedModel,
            resolution,
            aspectRatio,
            genType,
            referenceImagesCount: allImages.length
        }
    });

    // 后台执行（不阻塞请求）
    (async () => {
        const job = generationJobs.get(jobId);
        if (!job) return;

        try {
            const images = await enqueueUpstream(async () => {
                job.status = 'running';
                job.updatedAt = Date.now();

                return await generateImage(prompt, {
                    model: mappedModel,
                    resolution,
                    aspectRatio,
                    referenceImages: allImages
                });
            });

            // 写历史
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

            job.status = 'completed';
            job.updatedAt = Date.now();
            job.result = {
                images: images.map(img => ({ url: img.url }))
            };
        } catch (err) {
            job.status = 'error';
            job.updatedAt = Date.now();
            job.error = String(err && err.message ? err.message : err);
        }
    })();

    return res.json({ success: true, jobId });
});

/**
 * Web UI：查询异步任务状态
 * GET /api/generate/status/:jobId
 */
app.get('/api/generate/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = generationJobs.get(jobId);
    if (!job) return res.status(404).json({ success: false, error: 'job not found' });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
        success: true,
        job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            request: job.request,
            result: job.result || null,
            error: job.error || null
        }
    });
});

// ==================== 视频生成 API ====================

/**
 * 前端视频生成接口（同步，等待结果）
 * POST /api/generate/video
 */
app.post('/api/generate/video', async (req, res) => {
    try {
        const {
            prompt,
            ratio = '16:9',
            resolution = '720p',
            duration = 5,
            mode = 'pro',
            referenceImage = null
        } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'prompt is required'
            });
        }

        const type = referenceImage ? 'i2v' : 't2v';
        console.log(`\n========== 前端视频生成请求 ==========`);
        console.log(`类型: ${type}`);
        console.log(`Prompt: ${prompt}`);
        console.log(`Ratio: ${ratio}, Resolution: ${resolution}, Duration: ${duration}s, Mode: ${mode}`);

        const result = await generateVideo(prompt, {
            ratio,
            resolution,
            duration,
            mode,
            referenceImage
        });

        // 添加到历史记录
        addToHistory({
            prompt,
            type,
            ratio,
            resolution,
            duration,
            mode,
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl
        });

        res.json({
            success: true,
            video: result
        });

    } catch (error) {
        console.error(`[Video Error] ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 前端视频生成接口（异步，提交后轮询）
 * POST /api/generate/video/submit
 */
app.post('/api/generate/video/submit', async (req, res) => {
    const {
        prompt,
        ratio = '16:9',
        resolution = '720p',
        duration = 5,
        mode = 'pro',
        referenceImage = null
    } = req.body || {};

    if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    const type = referenceImage ? 'i2v' : 't2v';

    const jobId = generateId();
    generationJobs.set(jobId, {
        id: jobId,
        status: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        jobType: 'video',
        request: {
            prompt,
            type,
            ratio,
            resolution,
            duration,
            mode,
            hasReferenceImage: !!referenceImage
        }
    });

    // 后台执行
    (async () => {
        const job = generationJobs.get(jobId);
        if (!job) return;

        try {
            const result = await enqueueUpstream(async () => {
                job.status = 'running';
                job.updatedAt = Date.now();

                return await generateVideo(prompt, {
                    ratio,
                    resolution,
                    duration,
                    mode,
                    referenceImage
                });
            });

            // 添加到历史记录
            addToHistory({
                prompt,
                type,
                ratio,
                resolution,
                duration,
                mode,
                videoUrl: result.videoUrl,
                thumbnailUrl: result.thumbnailUrl
            });

            job.status = 'completed';
            job.updatedAt = Date.now();
            job.result = result;
        } catch (err) {
            job.status = 'error';
            job.updatedAt = Date.now();
            job.error = String(err && err.message ? err.message : err);
        }
    })();

    return res.json({ success: true, jobId });
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
        'wf_art': 'wf_art',
        'see_dream_img': 'see_dream_img',
        'doubao-seedream-4.5': 'doubao-seedream-4.5',
        // 兼容 OpenAI 名称
        'dall-e-3': 'kie_nano_banana_pro',
        'dall-e-2': 'kie_nano_banana',
        // 简写/别名
        'nano-banana-pro': 'kie_nano_banana_pro',
        'nano-banana': 'kie_nano_banana',
        'ai-ease': 'wf_art',
        'aiease': 'wf_art',
        'seedream-4.0': 'see_dream_img',
        'seedream-4': 'see_dream_img',
        'seedream-4.5': 'doubao-seedream-4.5',
        'seedream': 'doubao-seedream-4.5' // 默认使用最新的 4.5
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
                description: 'Nano Banana Pro - 高质量图像生成 (4K支持, 支持图生图)',
                aliases: ['dall-e-3', 'nano-banana-pro'],
                capabilities: { text_to_image: true, image_to_image: true }
            },
            {
                id: 'kie_nano_banana',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'Nano Banana - 标准图像生成 (支持图生图)',
                aliases: ['dall-e-2', 'nano-banana'],
                capabilities: { text_to_image: true, image_to_image: true }
            },
            {
                id: 'wf_art',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'AI Ease Model - 仅支持文生图',
                aliases: ['ai-ease', 'aiease'],
                capabilities: { text_to_image: true, image_to_image: false }
            },
            {
                id: 'see_dream_img',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'Seedream 4.0 - 字节跳动图像生成模型 (支持图生图)',
                aliases: ['seedream-4.0', 'seedream-4'],
                capabilities: { text_to_image: true, image_to_image: true }
            },
            {
                id: 'doubao-seedream-4.5',
                object: 'model',
                created: 1698785189,
                owned_by: 'aiease-proxy',
                description: 'Seedream 4.5 - 最新字节跳动图像生成模型 (支持图生图)',
                aliases: ['seedream-4.5', 'seedream'],
                capabilities: { text_to_image: true, image_to_image: true }
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

const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           AI EASE Proxy - Image Generation UI             ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://${HOST}:${PORT}                     ║
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
