const { sequelize } = require('../config/database');
const User = require('../models/User');
const History = require('../models/History');

async function sync() {
    try {
        console.log('🔄 Starting database synchronization...');
        await sequelize.authenticate();
        console.log('✅ Database connected.');
        
        // Force: true will drop tables! Use with caution.
        // Alter: true attempts to update tables without data loss.
        await sequelize.sync({ alter: true });
        
        console.log('✅ Database synchronized successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Database synchronization failed:', error);
        process.exit(1);
    }
}

sync();