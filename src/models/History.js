const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User');

const History = sequelize.define('History', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    prompt: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    model: {
        type: DataTypes.STRING,
        allowNull: true
    },
    type: {
        type: DataTypes.STRING, // 't2i', 'i2i', 't2v', 'i2v'
        allowNull: false,
        defaultValue: 't2i'
    },
    params: {
        type: DataTypes.JSON, // 存储分辨率、比例等参数
        allowNull: true
    },
    result: {
        type: DataTypes.JSON, // 存储生成的图片URL数组或视频信息
        allowNull: true
    },
    status: {
        type: DataTypes.STRING, // 'completed', 'failed'
        defaultValue: 'completed'
    }
}, {
    indexes: [
        {
            // Sequelize 会自动将 userId 转换为 user_id (因为 underscored: true)
            fields: ['userId']
        },
        {
            // Sequelize 会自动将 createdAt 转换为 created_at (因为 underscored: true)
            fields: ['createdAt']
        }
    ]
});

// 建立关联
User.hasMany(History, { foreignKey: 'userId' });
History.belongsTo(User, { foreignKey: 'userId' });

module.exports = History;