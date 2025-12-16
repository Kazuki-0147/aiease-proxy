/**
 * AI EASE Studio - 初始化配置页面逻辑
 */

// DOM 元素
const elements = {
    form: document.getElementById('setup-form'),
    submitBtn: document.getElementById('submit-btn'),
    multiUser: document.getElementById('multi-user'),
    dbSqlite: document.getElementById('db-sqlite'),
    dbMysql: document.getElementById('db-mysql'),
    mysqlConfig: document.getElementById('mysql-config'),
    dbHost: document.getElementById('db-host'),
    dbPort: document.getElementById('db-port'),
    dbName: document.getElementById('db-name'),
    dbUser: document.getElementById('db-user'),
    dbPassword: document.getElementById('db-password'),
    serverPort: document.getElementById('server-port'),
    toastContainer: document.getElementById('toast-container')
};

// 初始化
function init() {
    bindEvents();
    checkSetupStatus();
}

// 绑定事件
function bindEvents() {
    // 数据库类型切换
    elements.dbSqlite.addEventListener('change', toggleMysqlConfig);
    elements.dbMysql.addEventListener('change', toggleMysqlConfig);

    // 表单提交
    elements.form.addEventListener('submit', handleSubmit);
}

// 检查是否已配置
async function checkSetupStatus() {
    try {
        const response = await fetch('/api/setup/status');
        const data = await response.json();
        
        if (data.configured) {
            // 已配置，跳转到主页
            showToast('系统已配置，正在跳转...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    } catch (error) {
        // 忽略错误，可能是服务器还没启动完成
        console.log('检查配置状态失败:', error);
    }
}

// 切换 MySQL 配置区域显示
function toggleMysqlConfig() {
    if (elements.dbMysql.checked) {
        elements.mysqlConfig.classList.remove('hidden');
        // 设置必填
        elements.dbHost.required = true;
        elements.dbPort.required = true;
        elements.dbName.required = true;
        elements.dbUser.required = true;
    } else {
        elements.mysqlConfig.classList.add('hidden');
        // 取消必填
        elements.dbHost.required = false;
        elements.dbPort.required = false;
        elements.dbName.required = false;
        elements.dbUser.required = false;
    }
}

// 处理表单提交
async function handleSubmit(e) {
    e.preventDefault();

    const btn = elements.submitBtn;
    const btnText = btn.querySelector('.btn-text');
    const btnIcon = btn.querySelector('svg');

    // 收集配置
    const config = {
        multiUser: elements.multiUser.checked,
        dbType: elements.dbMysql.checked ? 'mysql' : 'sqlite',
        port: parseInt(elements.serverPort.value) || 3001
    };

    // 如果选择 MySQL，添加 MySQL 配置
    if (config.dbType === 'mysql') {
        config.mysql = {
            host: elements.dbHost.value.trim(),
            port: parseInt(elements.dbPort.value) || 3306,
            database: elements.dbName.value.trim(),
            user: elements.dbUser.value.trim(),
            password: elements.dbPassword.value
        };

        // 验证 MySQL 配置
        if (!config.mysql.host || !config.mysql.database || !config.mysql.user) {
            showToast('请填写完整的 MySQL 配置', 'error');
            return;
        }
    }

    // 禁用按钮，显示加载状态
    btn.disabled = true;
    btnText.textContent = '保存中...';
    
    // 替换图标为加载动画
    const loader = document.createElement('div');
    loader.className = 'btn-loader';
    btnIcon.replaceWith(loader);

    try {
        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const data = await response.json();

        if (data.success) {
            if (data.autoRestart === false) {
                // 本地开发环境，提示手动重启
                showToast('配置保存成功！请手动重启服务', 'success');
                btnText.textContent = '请手动重启';
                btn.disabled = true;
                
                // 显示详细提示
                showManualRestartModal();
            } else {
                // 生产环境，自动重启
                showToast('配置保存成功，正在重启服务...', 'success');
                btnText.textContent = '重启中...';
                
                // 轮询等待服务恢复
                await waitForServerRestart();
                
                // 跳转到主页
                window.location.href = '/';
            }
        } else {
            showToast(data.error || '配置保存失败', 'error');
            resetButton();
        }
    } catch (error) {
        console.error('提交配置失败:', error);
        showToast('网络请求失败: ' + error.message, 'error');
        resetButton();
    }

    function resetButton() {
        btn.disabled = false;
        btnText.textContent = '保存配置并启动';
        loader.replaceWith(createArrowIcon());
    }
}

// 等待服务器重启
async function waitForServerRestart(maxAttempts = 30, interval = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        
        try {
            const response = await fetch('/health', { 
                method: 'GET',
                cache: 'no-store'
            });
            
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // 服务还未恢复，继续等待
            console.log(`等待服务重启... (${i + 1}/${maxAttempts})`);
        }
    }
    
    throw new Error('服务重启超时');
}

// 创建箭头图标
function createArrowIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    svg.appendChild(polyline);
    
    return svg;
}

// Toast 通知
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSvg = type === 'success'
        ? '<polyline points="20 6 9 17 4 12"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

    toast.innerHTML = `
        <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${iconSvg}
        </svg>
        <span class="toast-message">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    // 自动移除
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 显示手动重启提示弹窗
function showManualRestartModal() {
    const modal = document.createElement('div');
    modal.className = 'manual-restart-modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <h2>配置保存成功！</h2>
            <p>由于当前为开发环境，请手动重启服务：</p>
            <ol>
                <li>按 <kbd>Ctrl+C</kbd> 停止当前进程</li>
                <li>运行 <code>npm start</code></li>
            </ol>
            <p class="modal-note">重启后，页面将自动跳转...</p>
            <div class="modal-loader"></div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .manual-restart-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
        }
        .modal-content {
            position: relative;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 32px;
            max-width: 400px;
            text-align: center;
            animation: modalIn 0.3s ease;
        }
        @keyframes modalIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        .modal-icon {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, var(--success), #16a34a);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
        }
        .modal-icon svg {
            width: 32px;
            height: 32px;
            color: white;
        }
        .modal-content h2 {
            font-size: 20px;
            margin-bottom: 12px;
        }
        .modal-content p {
            color: var(--text-secondary);
            font-size: 14px;
            margin-bottom: 16px;
        }
        .modal-content ol {
            text-align: left;
            padding-left: 20px;
            margin-bottom: 16px;
        }
        .modal-content li {
            color: var(--text-secondary);
            font-size: 14px;
            margin-bottom: 8px;
        }
        .modal-content kbd {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 2px 6px;
            font-family: monospace;
            font-size: 13px;
        }
        .modal-content code {
            background: var(--bg-secondary);
            border-radius: 4px;
            padding: 2px 8px;
            font-family: monospace;
            font-size: 13px;
            color: var(--accent-primary);
        }
        .modal-note {
            font-size: 12px !important;
            color: var(--text-muted) !important;
        }
        .modal-loader {
            width: 24px;
            height: 24px;
            border: 2px solid var(--border-color);
            border-top-color: var(--accent-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto;
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // 持续轮询等待服务恢复
    pollForRestart();
}

// 轮询等待服务恢复（手动重启场景）
async function pollForRestart() {
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const response = await fetch('/health', {
                method: 'GET',
                cache: 'no-store'
            });
            
            if (response.ok) {
                // 服务恢复，跳转
                window.location.href = '/';
                return;
            }
        } catch (error) {
            // 服务还未恢复，继续等待
        }
    }
}

// 启动
document.addEventListener('DOMContentLoaded', init);