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
            // 注意：indexes.fields 使用的是"数据库列名"，不会因为 underscored: true 自动改名
            // userId 对应的真实列名是 user_id
            fields: ['user_id']
        },
        {
            // createdAt 对应的真实列名是 created_at
            fields: ['created_at']
        }
    ]
});

// 建立关联
User.hasMany(History, { foreignKey: 'userId' });
History.belongsTo(User, { foreignKey: 'userId' });

module.exports = History;