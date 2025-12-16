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
        // 在生产环境中通常使用 migration，但在本项目中为了简化部署，使用 sync
        await sequelize.sync({ alter: true });
        console.log('[Database] ✅ Models synchronized.');
    } catch (error) {
        console.error(`[Database] ❌ Unable to connect to ${dbType.toUpperCase()}:`, error.message);
        // Don't throw error here to allow server to start (maybe in memory mode if needed, but for now we want it to fail hard if DB fails)
        throw error;
    }
}

module.exports = { sequelize, testConnection };