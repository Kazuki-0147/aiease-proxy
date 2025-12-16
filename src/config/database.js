/**
 * Sequelize Database Configuration
 * 支持 SQLite (本地开发默认) 和 MySQL (生产环境/Docker)
 */
const { Sequelize } = require('sequelize');
const path = require('path');

// Load environment variables
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';
let sequelize;

console.log(`[Database] Initializing database connection using: ${dbType.toUpperCase()}`);

if (dbType === 'mysql') {
    // MySQL Configuration
    sequelize = new Sequelize(
        process.env.DB_NAME || 'aiease_proxy',
        process.env.DB_USER || 'aiease',
        process.env.DB_PASSWORD || 'password',
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            dialect: 'mysql',
            logging: process.env.NODE_ENV === 'development' ? console.log : false,
            pool: {
                max: 10,
                min: 0,
                acquire: 30000,
                idle: 10000
            },
            define: {
                timestamps: true,
                underscored: true
            }
        }
    );
} else {
    // SQLite Configuration (Default for local dev)
    const storagePath = process.env.DB_STORAGE || path.join(__dirname, '../../database.sqlite');
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: storagePath,
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        define: {
            timestamps: true,
            underscored: true
        }
    });
}

// Test connection
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log(`[Database] ✅ ${dbType.toUpperCase()} connection established successfully.`);

        // Sync models (create tables if not exists)
        // ⚠️ 生产环境警告：使用 sync({ alter: true }) 存在风险
        if (process.env.NODE_ENV === 'production') {
            console.warn('[Database] ⚠️  生产环境检测到！');
            console.warn('[Database] ⚠️  使用 sync({ alter: true }) 可能导致数据丢失或表结构损坏。');
            console.warn('[Database] ⚠️  强烈建议使用数据库迁移工具（如 sequelize-cli 或 umzug）管理 schema 变更。');
            console.warn('[Database] ⚠️  如需继续使用 sync，请设置环境变量 ALLOW_SYNC_IN_PRODUCTION=true');

            if (process.env.ALLOW_SYNC_IN_PRODUCTION !== 'true') {
                throw new Error(
                    '生产环境禁止使用 sequelize.sync()。\n' +
                    '请使用数据库迁移工具管理 schema 变更，或设置 ALLOW_SYNC_IN_PRODUCTION=true 强制启用（不推荐）。'
                );
            }

            console.warn('[Database] ⚠️  检测到 ALLOW_SYNC_IN_PRODUCTION=true，继续执行 sync（风险自负）...');
        }

        await sequelize.sync({ alter: true });
        console.log('[Database] ✅ Models synchronized.');
    } catch (error) {
        console.error(`[Database] ❌ Unable to connect to ${dbType.toUpperCase()}:`, error.message);
        throw error;
    }
}

module.exports = { sequelize, testConnection };