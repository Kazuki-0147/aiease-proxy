/**
 * AI EASE Studio - 前端应用逻辑
 */

// ==================== 状态管理 ====================

const state = {
    mode: 't2i', // 't2i' 或 'i2i'
    model: 'kie_nano_banana_pro',
    resolution: '2K',
    aspectRatio: '1:1',
    concurrent: 1,
    referenceImages: [], // 多图支持 - 存储 base64 数组
    maxImages: 5,
    activeTasks: new Map(),
    results: [],
    history: []
};

// ==================== DOM 元素 ====================

const elements = {
    // 移动端侧边栏
    sidebar: document.querySelector('.sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileCloseBtn: document.getElementById('mobile-close-btn'),

    // 模式切换
    modeBtns: document.querySelectorAll('.mode-btn'),

    // 参数控制
    modelSelect: document.getElementById('model-select'),
    resolutionBtns: document.querySelectorAll('.param-btn[data-resolution]'),
    aspectBtns: document.querySelectorAll('.aspect-btn'),
    concurrentSlider: document.getElementById('concurrent-slider'),
    concurrentValue: document.getElementById('concurrent-value'),

    // 上传区域
    uploadArea: document.getElementById('upload-area'),
    uploadGrid: document.getElementById('upload-grid'),
    uploadAddBtn: document.getElementById('upload-add-btn'),
    uploadCount: document.getElementById('upload-count'),
    fileInput: document.getElementById('file-input'),

    // 提示词输入
    promptInput: document.getElementById('prompt-input'),
    generateBtn: document.getElementById('generate-btn'),

    // 进度
    progressSection: document.getElementById('progress-section'),
    progressCount: document.getElementById('progress-count'),
    progressList: document.getElementById('progress-list'),

    // 结果
    resultsSection: document.getElementById('results-section'),
    resultsGrid: document.getElementById('results-grid'),
    emptyState: document.getElementById('empty-state'),

    // 历史
    historySection: document.getElementById('history-section'),
    historyGrid: document.getElementById('history-grid'),
    historyCount: document.getElementById('history-count'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),

    // 模态框
    modal: document.getElementById('image-modal'),
    modalImage: document.getElementById('modal-image'),
    downloadBtn: document.getElementById('download-btn'),
    copyUrlBtn: document.getElementById('copy-url-btn'),
    modalClose: document.getElementById('modal-close'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// ==================== 初始化 ====================

function init() {
    // 绑定事件
    bindEvents();

    // 加载历史记录
    loadHistory();

    console.log('AI EASE Studio 已初始化');
}

function bindEvents() {
    // 移动端：侧边栏抽屉
    setupMobileSidebar();

    // 模式切换
    elements.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // 模型选择
    elements.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
    });

    // 分辨率选择
    elements.resolutionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.resolutionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.resolution = btn.dataset.resolution;
        });
    });

    // 宽高比选择
    elements.aspectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.aspectBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.aspectRatio = btn.dataset.ratio;
        });
    });

    // 并发数
    elements.concurrentSlider.addEventListener('input', (e) => {
        state.concurrent = parseInt(e.target.value);
        elements.concurrentValue.textContent = state.concurrent;
    });

    // 图片上传
    elements.uploadAddBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    elements.uploadGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadGrid.classList.add('dragover');
    });

    elements.uploadGrid.addEventListener('dragleave', () => {
        elements.uploadGrid.classList.remove('dragover');
    });

    elements.uploadGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadGrid.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        processImageFiles(files);
    });

    // 生成按钮
    elements.generateBtn.addEventListener('click', handleGenerate);

    // 快捷键
    elements.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleGenerate();
        }
    });

    // 清空历史
    elements.clearHistoryBtn.addEventListener('click', clearHistory);

    // 模态框
    elements.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    elements.downloadBtn.addEventListener('click', downloadCurrentImage);
    elements.copyUrlBtn.addEventListener('click', copyCurrentImageUrl);

    // ESC 关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (closeSidebar()) return;
        closeModal();
    });
}

function isMobileLayout() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

function openSidebar() {
    if (!isMobileLayout()) return;
    if (!elements.sidebar) return;

    elements.sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');

    if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.classList.remove('hidden');
    }
}

function closeSidebar() {
    if (!elements.sidebar) return false;
    const isOpen = elements.sidebar.classList.contains('open');
    if (!isOpen) return false;

    elements.sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');

    if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.classList.add('hidden');
    }

    return true;
}

function setupMobileSidebar() {
    if (!elements.sidebar || !elements.sidebarBackdrop || !elements.mobileMenuBtn || !elements.mobileCloseBtn) {
        return;
    }

    elements.mobileMenuBtn.addEventListener('click', openSidebar);
    elements.mobileCloseBtn.addEventListener('click', closeSidebar);
    elements.sidebarBackdrop.addEventListener('click', closeSidebar);

    // 从移动端切回桌面时，清理抽屉状态
    window.addEventListener('resize', () => {
        if (!isMobileLayout()) closeSidebar();
    });
}

// ==================== 模式切换 ====================

function switchMode(mode) {
    state.mode = mode;

    // 更新按钮状态
    elements.modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // 显示/隐藏上传区域
    elements.uploadArea.classList.toggle('hidden', mode !== 'i2i');

    // 更新提示词占位符
    if (mode === 'i2i') {
        elements.promptInput.placeholder = '描述你想要的修改效果...';
    } else {
        elements.promptInput.placeholder = '描述你想要生成的图像...';
    }
}

// ==================== 图片上传 ====================

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processImageFiles(files);
    // 清空 input 以便重复选择相同文件
    e.target.value = '';
}

function processImageFiles(files) {
    const remaining = state.maxImages - state.referenceImages.length;
    const toProcess = files.slice(0, remaining);

    if (files.length > remaining) {
        showToast(`最多只能添加 ${state.maxImages} 张图片`, 'warning');
    }

    toProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            state.referenceImages.push(e.target.result);
            renderUploadGrid();
        };
        reader.readAsDataURL(file);
    });
}

function removeReferenceImage(index) {
    state.referenceImages.splice(index, 1);
    renderUploadGrid();
}

function renderUploadGrid() {
    // 清空现有预览（保留添加按钮）
    const existingItems = elements.uploadGrid.querySelectorAll('.upload-item');
    existingItems.forEach(item => item.remove());

    // 添加图片预览
    state.referenceImages.forEach((imgData, index) => {
        const item = document.createElement('div');
        item.className = 'upload-item';
        item.innerHTML = `
            <img src="${imgData}" alt="图片 ${index + 1}">
            <span class="upload-item-index">${index + 1}</span>
            <button class="upload-item-remove" data-index="${index}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        // 插入到添加按钮之前
        elements.uploadGrid.insertBefore(item, elements.uploadAddBtn);

        // 绑定删除事件
        item.querySelector('.upload-item-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeReferenceImage(index);
        });
    });

    // 更新计数
    elements.uploadCount.textContent = `${state.referenceImages.length}/${state.maxImages} 张`;

    // 隐藏/显示添加按钮
    elements.uploadAddBtn.classList.toggle('hidden', state.referenceImages.length >= state.maxImages);
}

// ==================== 生成图片 ====================

async function handleGenerate() {
    const prompt = elements.promptInput.value.trim();

    if (!prompt) {
        showToast('请输入提示词', 'error');
        elements.promptInput.focus();
        return;
    }

    if (state.mode === 'i2i' && state.referenceImages.length === 0) {
        showToast('请上传至少一张参考图片', 'error');
        return;
    }

    // 禁用按钮
    elements.generateBtn.disabled = true;

    // 显示进度区域
    elements.progressSection.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');

    // 清空之前的进度
    elements.progressList.innerHTML = '';

    // 创建任务
    const tasks = [];
    for (let i = 0; i < state.concurrent; i++) {
        const taskId = generateId();
        tasks.push({
            id: taskId,
            prompt,
            index: i + 1
        });

        // 添加进度项
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = `progress-${taskId}`;
        progressItem.innerHTML = `
            <div class="progress-spinner"></div>
            <span>任务 ${i + 1}</span>
        `;
        elements.progressList.appendChild(progressItem);
    }

    // 更新进度计数
    updateProgressCount(0, tasks.length);

    // 限流执行任务 - 每 2 秒启动一个新任务，避免 API 过载
    let completed = 0;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const executeTask = async (task, index) => {
        // 错开请求时间，每个任务延迟 index * 2秒
        if (index > 0) {
            await delay(index * 2000);
        }

        const startTime = Date.now(); // 记录开始时间

        try {
            const result = await generateImage({
                prompt: task.prompt,
                model: state.model,
                resolution: state.resolution,
                aspectRatio: state.aspectRatio,
                referenceImages: state.mode === 'i2i' ? state.referenceImages : []
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(1); // 计算耗时(秒)

            const isSuccess = Boolean(result && result.success && Array.isArray(result.images) && result.images.length > 0);

            // 更新进度
            completed++;
            updateProgressCount(completed, tasks.length);
            updateProgressItem(task.id, isSuccess ? 'completed' : 'error', duration);

            // 添加结果
            if (isSuccess) {
                result.images.forEach(img => {
                    addResultImage(img.url, task.prompt, duration);
                });
            }

            return result;
        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            completed++;
            updateProgressCount(completed, tasks.length);
            updateProgressItem(task.id, 'error', duration);
            console.error('生成失败:', error);
            return { success: false, error: error.message };
        }
    };

    // 启动所有任务（它们会自动错开）
    const promises = tasks.map((task, index) => executeTask(task, index));

    // 等待所有任务完成
    const results = await Promise.all(promises);

    // 检查结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
        showToast(`成功生成 ${successCount} 张图片`, 'success');
    }
    if (failCount > 0) {
        showToast(`${failCount} 个任务失败`, 'error');
    }

    // 重新加载历史
    loadHistory();

    // 隐藏进度区域
    setTimeout(() => {
        elements.progressSection.classList.add('hidden');
    }, 2000);

    // 启用按钮
    elements.generateBtn.disabled = false;
}

async function generateImage(params) {
    // Web UI 采用“提交任务 + 轮询结果”，避免长连接被浏览器/反代超时
    const submitResponse = await fetch('/api/generate/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    });

    const submitContentType = submitResponse.headers.get('content-type') || '';
    if (!submitContentType.includes('application/json')) {
        const text = await submitResponse.text();
        throw new Error(`请求失败 (HTTP ${submitResponse.status})：${text.slice(0, 200)}`);
    }

    const submitData = await submitResponse.json();
    if (!submitResponse.ok) {
        throw new Error(submitData?.error || `请求失败 (HTTP ${submitResponse.status})`);
    }
    if (submitData && submitData.success === false) {
        throw new Error(submitData.error || '生成失败');
    }

    const jobId = submitData.jobId;
    if (!jobId) throw new Error('提交任务失败：缺少 jobId');

    // 轮询任务状态
    const pollDelayMs = 3000;
    // 10 并发在上游排队时可能超过 6 分钟，这里放宽等待时间，避免“前端超时但后端仍在生成”。
    const maxWaitMs = 30 * 60 * 1000; // 30 分钟
    const startPollAt = Date.now();

    while (Date.now() - startPollAt < maxWaitMs) {
        const statusResponse = await fetch(`/api/generate/status/${encodeURIComponent(jobId)}?t=${Date.now()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const contentType = statusResponse.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await statusResponse.text();
            throw new Error(`请求失败 (HTTP ${statusResponse.status})：${text.slice(0, 200)}`);
        }

        const data = await statusResponse.json();
        if (!statusResponse.ok) {
            throw new Error(data?.error || `请求失败 (HTTP ${statusResponse.status})`);
        }
        if (!data.success) {
            throw new Error(data.error || '生成失败');
        }

        const job = data.job;
        if (!job || !job.status) {
            throw new Error('任务状态异常');
        }

        if (job.status === 'completed') {
            return { success: true, images: job.result?.images || [] };
        }
        if (job.status === 'error') {
            throw new Error(job.error || '生成失败');
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
    }

    throw new Error('生成超时（前端轮询超时）');
}

function updateProgressCount(completed, total) {
    elements.progressCount.textContent = `${completed}/${total}`;
}

function updateProgressItem(taskId, status, duration = null) {
    const item = document.getElementById(`progress-${taskId}`);
    if (item) {
        item.classList.remove('progress-item');
        item.classList.add('progress-item', status);

        const durationText = duration ? ` (${duration}s)` : '';

        if (status === 'completed') {
            item.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>完成${durationText}</span>
            `;
        } else if (status === 'error') {
            item.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <span>失败${durationText}</span>
            `;
        }
    }
}

// ==================== 结果展示 ====================

function addResultImage(url, prompt, duration = null) {
    // 隐藏空状态
    elements.emptyState.classList.add('hidden');

    // 创建图片卡片
    const card = createImageCard(url, prompt, { duration });

    // 添加到结果网格
    elements.resultsGrid.insertBefore(card, elements.resultsGrid.firstChild);

    // 保存到结果数组
    state.results.unshift({ url, prompt, duration });
}

function createImageCard(url, prompt, meta = {}) {
    const card = document.createElement('div');
    card.className = 'image-card';

    const durationBadge = meta.duration ? `<span class="duration-badge">${meta.duration}s</span>` : '';

    card.innerHTML = `
        ${durationBadge}
        <img src="${url}" alt="${prompt}" loading="lazy">
        <div class="image-card-overlay">
            <div class="image-card-prompt">${escapeHtml(prompt)}</div>
            ${meta.model ? `<div class="image-card-meta">
                <span>${meta.model}</span>
                <span>${meta.resolution}</span>
            </div>` : ''}
        </div>
    `;

    card.addEventListener('click', () => openModal(url));

    return card;
}

// ==================== 历史记录 ====================

async function loadHistory() {
    try {
        const response = await fetch('/api/history?limit=50');
        const data = await response.json();

        if (data.success) {
            state.history = data.history;
            renderHistory();
        }
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

function renderHistory() {
    elements.historyGrid.innerHTML = '';
    elements.historyCount.textContent = `${state.history.length} 张`;

    if (state.history.length === 0) {
        elements.historySection.classList.add('hidden');
        return;
    }

    elements.historySection.classList.remove('hidden');

    state.history.forEach(item => {
        const card = createImageCard(item.imageUrl, item.prompt, {
            model: item.model,
            resolution: item.resolution
        });
        elements.historyGrid.appendChild(card);
    });
}

async function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) {
        return;
    }

    try {
        await fetch('/api/history', { method: 'DELETE' });
        state.history = [];
        renderHistory();
        showToast('历史记录已清空', 'success');
    } catch (error) {
        showToast('清空失败', 'error');
    }
}

// ==================== 模态框 ====================

let currentImageUrl = '';

function openModal(url) {
    currentImageUrl = url;
    elements.modalImage.src = url;
    elements.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    elements.modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function downloadCurrentImage() {
    const link = document.createElement('a');
    link.href = currentImageUrl;
    link.download = `ai-ease-${Date.now()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('已开始下载', 'success');
}

function copyCurrentImageUrl() {
    navigator.clipboard.writeText(currentImageUrl).then(() => {
        showToast('链接已复制', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

// ==================== Toast 通知 ====================

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
    }, 3000);
}

// ==================== 工具函数 ====================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);
