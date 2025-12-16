const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function resolveDevSecretFilePath() {
    // 固定存放在项目根目录，避免因 cwd 变化导致读写不到同一文件
    return path.resolve(__dirname, '../../.jwt_secret.dev');
}

function readSecretFromFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        const raw = fs.readFileSync(filePath, 'utf8');
        return typeof raw === 'string' ? raw.trim() : '';
    } catch {
        return '';
    }
}

function writeSecretToFile(filePath, secret) {
    try {
        fs.writeFileSync(filePath, `${secret}\n`, { encoding: 'utf8' });
        return true;
    } catch {
        return false;
    }
}

function resolveJwtSecret() {
    const raw = process.env.JWT_SECRET;
    const secret = typeof raw === 'string' ? raw.trim() : '';

    if (secret) {
        return { secret, source: 'env' };
    }

    // 生产环境必须显式配置，避免误用默认值导致安全风险
    if (process.env.NODE_ENV === 'production') {
        return { secret: null, source: 'missing' };
    }

    // 开发环境：优先读取本地持久化密钥，避免“重启后 token 全部失效”导致前端秒失败
    const secretFile = resolveDevSecretFilePath();
    const fileSecret = readSecretFromFile(secretFile);
    if (fileSecret) {
        return { secret: fileSecret, source: 'file' };
    }

    const generated = crypto.randomBytes(48).toString('hex');
    const written = writeSecretToFile(secretFile, generated);
    return { secret: generated, source: written ? 'generated_saved' : 'generated' };
}

const { secret, source } = resolveJwtSecret();

if (!secret) {
    throw new Error('JWT_SECRET 未配置：请设置环境变量 JWT_SECRET（生产环境必须）');
}

if (source === 'generated') {
    console.warn('[Auth] ⚠️ JWT_SECRET 未配置，已为开发环境临时生成随机密钥；重启后现有 token 将失效。建议设置 .env 或允许写入 .jwt_secret.dev 以持久化。');
} else if (source === 'generated_saved') {
    console.warn('[Auth] ⚠️ JWT_SECRET 未配置，已为开发环境生成并持久化到 .jwt_secret.dev；重启后 token 仍有效。');
} else if (source === 'file') {
    console.warn('[Auth] ℹ️ 开发环境从 .jwt_secret.dev 读取 JWT_SECRET；重启后 token 仍有效。');
}

module.exports = { JWT_SECRET: secret };
