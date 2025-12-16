const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

const auth = (req, res, next) => {
    // 获取 token
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.'
        });
    }

    try {
        // 验证 token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id: 1, username: '...' }
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid token.'
        });
    }
};

module.exports = auth;
