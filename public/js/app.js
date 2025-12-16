/**
 * AI EASE Studio - 前端应用逻辑
 */

// ==================== 状态管理 ====================

const state = {
    currentView: 'create', // 'create', 'gallery'
    mode: 't2i', // 't2i', 'i2i', 't2v', 'i2v'
    model: 'kie_nano_banana_pro',
    resolution: '2K',
    aspectRatio: '1:1',
    concurrent: 1,
    referenceImages: [], // 多图支持 - 存储 base64 数组
    maxImages: 5,
    activeTasks: new Map(), // 存储正在运行的任务
    results: [],
    history: [],
    // 视频参数
    videoDuration: 5,
    videoResolution: '720p',
    videoMode: 'pro',
    videoRatio: '16:9',
    // 认证状态
    token: localStorage.getItem('auth_token'),
    user: JSON.parse(localStorage.getItem('auth_user') || 'null')
};

// ==================== DOM 元素 ====================

const elements = {
    // 导航与视图
    navBtns: document.querySelectorAll('.nav-btn'),
    viewCreate: document.getElementById('view-create'),
    viewGallery: document.getElementById('view-gallery'),
    paramsPanelContainer: document.getElementById('params-panel-container'),
    modeSwitchContainer: document.getElementById('mode-switch-container'),
    refreshGalleryBtn: document.getElementById('refresh-gallery-btn'),

    // 认证相关
    authModal: document.getElementById('auth-modal'),
    authForm: document.getElementById('auth-form'),
    authTabs: document.querySelectorAll('.auth-tab'),
    authTitle: document.getElementById('auth-title'),
    authSubtitle: document.getElementById('auth-subtitle'),
    authSubmitBtn: document.querySelector('.auth-submit-btn'),
    usernameInput: document.getElementById('username-input'),
    passwordInput: document.getElementById('password-input'),
    confirmPasswordInput: document.getElementById('confirm-password-input'),
    confirmPasswordGroup: document.getElementById('confirm-password-group'),
    togglePasswordBtn: document.querySelector('.toggle-password-btn'),
    userProfile: document.getElementById('user-profile'),
    loginTriggerBtn: document.getElementById('login-trigger-btn'),
    userNameDisplay: document.getElementById('user-name-display'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // 免责声明
    disclaimerModal: document.getElementById('disclaimer-modal'),
    acceptDisclaimerBtn: document.getElementById('accept-disclaimer-btn'),

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
    // progressCount: document.getElementById('progress-count'), // 已移除
    progressList: document.getElementById('progress-list'),
    clearProgressBtn: document.getElementById('clear-progress-btn'),

    // 结果
    resultsSection: document.getElementById('results-section'),
    resultsGrid: document.getElementById('results-grid'),
    emptyState: document.getElementById('empty-state'),

    // 历史 (图库视图)
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
    toastContainer: document.getElementById('toast-container'),

    // 视频参数
    videoParams: document.getElementById('video-params'),
    videoRatioGroup: document.getElementById('video-ratio-group'),
    durationBtns: document.querySelectorAll('.param-btn[data-duration]'),
    videoResolutionBtns: document.querySelectorAll('.param-btn[data-video-resolution]'),
    videoModeBtns: document.querySelectorAll('.param-btn[data-video-mode]'),
    videoRatioBtns: document.querySelectorAll('.param-btn[data-video-ratio]')
};

// ==================== 初始化 ====================

function init() {
    // 检查免责声明
    checkDisclaimer();

    // 检查登录状态
    checkAuthStatus();

    // 绑定事件
    bindEvents();

    // 初始化视图
    switchView('create');

    // 加载历史记录 (如果已登录)
    if (state.token) {
        loadHistory();
    }

    console.log('AI EASE Studio 已初始化');
}

function syncToggleGroupAria(buttons) {
    buttons.forEach(btn => {
        // 这些按钮不是表单提交按钮，避免未来结构调整时触发表单提交
        if (btn instanceof HTMLButtonElement) {
            btn.type = 'button';
        }
        btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    });
}

function setActiveToggle(buttons, activeBtn) {
    buttons.forEach(btn => {
        const isActive = btn === activeBtn;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function bindEvents() {
    // 导航事件
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // 刷新图库
    if (elements.refreshGalleryBtn) {
        elements.refreshGalleryBtn.addEventListener('click', loadHistory);
    }

    // 清除进度
    if (elements.clearProgressBtn) {
        elements.clearProgressBtn.addEventListener('click', clearCompletedProgress);
    }

    // 认证事件
    bindAuthEvents();

    // 密码显示切换
    if (elements.togglePasswordBtn) {
        elements.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }

    // 移动端：侧边栏抽屉
    setupMobileSidebar();

    // 模式切换
    syncToggleGroupAria(elements.modeBtns);
    elements.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // 模型选择
    elements.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
    });

    // 分辨率选择
    syncToggleGroupAria(elements.resolutionBtns);
    elements.resolutionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.resolutionBtns, btn);
            state.resolution = btn.dataset.resolution;
        });
    });

    // 宽高比选择
    syncToggleGroupAria(elements.aspectBtns);
    elements.aspectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.aspectBtns, btn);
            state.aspectRatio = btn.dataset.ratio;
        });
    });

    // 并发数
    if (elements.concurrentSlider) {
        elements.concurrentSlider.addEventListener('input', (e) => {
            state.concurrent = parseInt(e.target.value);
            elements.concurrentValue.textContent = state.concurrent;
        });
    }

    // 视频参数事件绑定
    syncToggleGroupAria(elements.durationBtns);
    elements.durationBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.durationBtns, btn);
            state.videoDuration = parseInt(btn.dataset.duration);
        });
    });

    syncToggleGroupAria(elements.videoResolutionBtns);
    elements.videoResolutionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.videoResolutionBtns, btn);
            state.videoResolution = btn.dataset.videoResolution;
        });
    });

    syncToggleGroupAria(elements.videoModeBtns);
    elements.videoModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.videoModeBtns, btn);
            state.videoMode = btn.dataset.videoMode;
        });
    });

    syncToggleGroupAria(elements.videoRatioBtns);
    elements.videoRatioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveToggle(elements.videoRatioBtns, btn);
            state.videoRatio = btn.dataset.videoRatio;
        });
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

// ==================== 认证与免责声明 ====================

function checkDisclaimer() {
    if (!localStorage.getItem('disclaimer_accepted')) {
        elements.disclaimerModal.classList.remove('hidden');
    }
}

function bindAuthEvents() {
    // 免责声明同意
    if (elements.acceptDisclaimerBtn instanceof HTMLButtonElement) {
        elements.acceptDisclaimerBtn.type = 'button';
    }
    elements.acceptDisclaimerBtn.addEventListener('click', () => {
        localStorage.setItem('disclaimer_accepted', 'true');
        elements.disclaimerModal.classList.add('hidden');
        // 如果未登录，显示登录弹窗
        if (!state.token) {
            openAuthModal();
        }
    });

    // 打开登录弹窗
    if (elements.loginTriggerBtn instanceof HTMLButtonElement) {
        elements.loginTriggerBtn.type = 'button';
    }
    elements.loginTriggerBtn.addEventListener('click', openAuthModal);

    // 切换登录/注册 Tab
    elements.authTabs.forEach(tab => {
        if (tab instanceof HTMLButtonElement) {
            tab.type = 'button';
        }
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // 防止表单提交
            switchAuthTab(tab.dataset.tab);
        });
    });

    // 提交表单
    elements.authForm.addEventListener('submit', handleAuthSubmit);

    // 退出登录
    elements.logoutBtn.addEventListener('click', logout);
}

function checkAuthStatus() {
    if (state.token && state.user) {
        // 已登录
        elements.userProfile.classList.remove('hidden');
        elements.loginTriggerBtn.classList.add('hidden');
        elements.userNameDisplay.textContent = state.user.username;
        elements.authModal.classList.add('hidden');
    } else {
        // 未登录
        elements.userProfile.classList.add('hidden');
        elements.loginTriggerBtn.classList.remove('hidden');
        // 如果已经同意了免责声明，则强制登录
        if (localStorage.getItem('disclaimer_accepted')) {
            openAuthModal();
        }
    }
}

function openAuthModal() {
    elements.authModal.classList.remove('hidden');
    switchAuthTab('login');
}

function switchAuthTab(type) {
    elements.authTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === type);
    });

    const isLogin = type === 'login';
    elements.authTitle.textContent = isLogin ? '欢迎回来' : '创建账号';
    elements.authSubtitle.textContent = isLogin ? '请登录以继续使用 AI EASE Studio' : '注册新账号开始创作';
    elements.authSubmitBtn.querySelector('.btn-text').textContent = isLogin ? '登录' : '注册';
    
    // 清空输入框
    elements.usernameInput.value = '';
    elements.passwordInput.value = '';
    if (elements.confirmPasswordInput) elements.confirmPasswordInput.value = '';
    
    // 切换确认密码框显示
    if (elements.confirmPasswordGroup) {
        if (isLogin) {
            elements.confirmPasswordGroup.classList.add('hidden');
            elements.confirmPasswordInput.required = false;
        } else {
            elements.confirmPasswordGroup.classList.remove('hidden');
            elements.confirmPasswordInput.required = true;
        }
    }
    
    // 标记当前模式
    elements.authForm.dataset.mode = type;

    // 切换 Tab 后重置密码显示状态，避免“眼睛状态”和输入框 type 不一致
    setPasswordVisibility(false);
}

function setPasswordVisibility(visible) {
    const input = elements.passwordInput;
    const btn = elements.togglePasswordBtn;
    if (!input || !btn) return;

    const eyeIcon = btn.querySelector('.eye-icon');
    const eyeOffIcon = btn.querySelector('.eye-off-icon');

    input.type = visible ? 'text' : 'password';

    // 注册模式下有“确认密码”，统一跟随显示/隐藏，避免两框表现不一致
    if (elements.confirmPasswordInput) {
        elements.confirmPasswordInput.type = visible ? 'text' : 'password';
    }

    if (eyeIcon) eyeIcon.classList.toggle('hidden', visible);
    if (eyeOffIcon) eyeOffIcon.classList.toggle('hidden', !visible);

    btn.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
}

function togglePasswordVisibility() {
    if (!elements.passwordInput) return;
    setPasswordVisibility(elements.passwordInput.type === 'password');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const mode = elements.authForm.dataset.mode || 'login';
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();
    const btn = elements.authSubmitBtn;
    const loader = btn.querySelector('.btn-loader');
    const btnText = btn.querySelector('.btn-text');

    if (!username || !password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }

    if (mode === 'register') {
        const confirmPassword = elements.confirmPasswordInput.value.trim();
        if (password !== confirmPassword) {
            showToast('两次输入的密码不一致', 'error');
            return;
        }
    }

    // Loading 状态
    btn.disabled = true;
    loader.classList.remove('hidden');
    btnText.classList.add('hidden');

    try {
        const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`请求失败 (HTTP ${response.status})：${text.slice(0, 200)}`);
        }

        const data = await response.json();
        if (!response.ok) {
            showToast(data?.error || `请求失败 (HTTP ${response.status})`, 'error');
            return;
        }

        if (data.success) {
            if (!data.token || !data.user) {
                showToast('服务端响应异常：缺少 token 或 user', 'error');
                return;
            }
            // 登录成功
            state.token = data.token;
            state.user = data.user;
            
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            
            checkAuthStatus();
            showToast(mode === 'login' ? '登录成功' : '注册成功', 'success');
            loadHistory(); // 加载用户历史
        } else {
            showToast(data.error || '操作失败', 'error');
        }
    } catch (error) {
        showToast('网络请求失败', 'error');
        console.error(error);
    } finally {
        // 恢复按钮状态
        btn.disabled = false;
        loader.classList.add('hidden');
        btnText.classList.remove('hidden');
    }
}

function logout() {
    if (confirm('确定要退出登录吗？')) {
        state.token = null;
        state.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        
        // 清空界面数据
        state.history = [];
        renderHistory();
        
        checkAuthStatus();
        showToast('已退出登录', 'success');
    }
}

function forceLogoutAndReauth(message) {
    state.token = null;
    state.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');

    // 清空界面数据
    state.history = [];
    renderHistory();

    checkAuthStatus();
    showToast(message || '登录已失效，请重新登录', 'error');
    openAuthModal();
}

// ==================== 视图切换 ====================

function switchView(viewName) {
    state.currentView = viewName;

    // 更新导航按钮状态
    elements.navBtns.forEach(btn => {
        const isActive = btn.dataset.view === viewName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // 切换主内容区显示
    if (viewName === 'create') {
        elements.viewCreate.classList.add('active');
        elements.viewGallery.classList.remove('active');
        
        // 显示参数面板和模式切换
        if (elements.paramsPanelContainer) elements.paramsPanelContainer.classList.remove('hidden');
        if (elements.modeSwitchContainer) elements.modeSwitchContainer.classList.remove('hidden');
        
        // 移动端侧边栏处理：创作模式下显示参数面板
        if (isMobileLayout()) {
            // 保持侧边栏状态逻辑不变
        }
    } else if (viewName === 'gallery') {
        elements.viewCreate.classList.remove('active');
        elements.viewGallery.classList.add('active');
        
        // 隐藏参数面板和模式切换，给图库更大空间
        if (elements.paramsPanelContainer) elements.paramsPanelContainer.classList.add('hidden');
        if (elements.modeSwitchContainer) elements.modeSwitchContainer.classList.add('hidden');
        
        // 加载最新历史
        if (state.token) loadHistory();
    }
}

// ==================== 模式切换 ====================

function switchMode(mode) {
    state.mode = mode;

    // 更新按钮状态
    elements.modeBtns.forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const isVideoMode = mode === 't2v' || mode === 'i2v';
    const needsUpload = mode === 'i2i' || mode === 'i2v';

    // 显示/隐藏上传区域 (i2i 和 i2v 需要)
    elements.uploadArea.classList.toggle('hidden', !needsUpload);

    // 显示/隐藏视频参数 (t2v 和 i2v 需要)
    if (elements.videoParams) {
        elements.videoParams.classList.toggle('hidden', !isVideoMode);
    }

    // 显示/隐藏视频比例 (仅 t2v)
    if (elements.videoRatioGroup) {
        elements.videoRatioGroup.classList.toggle('hidden', mode !== 't2v');
    }

    // 切换模型列表：图像模式显示图像模型，视频模式显示视频模型
    const imageModelGroup = document.getElementById('image-model-group');
    const videoModelGroup = document.getElementById('video-model-group');
    if (imageModelGroup) {
        imageModelGroup.classList.toggle('hidden', isVideoMode);
    }
    if (videoModelGroup) {
        videoModelGroup.classList.toggle('hidden', !isVideoMode);
    }

    // 隐藏图像专用参数 (分辨率、宽高比)
    const imageResolutionGroup = document.getElementById('image-resolution-group');
    const imageAspectGroup = document.getElementById('image-aspect-group');
    if (imageResolutionGroup) {
        imageResolutionGroup.classList.toggle('hidden', isVideoMode);
    }
    if (imageAspectGroup) {
        imageAspectGroup.classList.toggle('hidden', isVideoMode);
    }

    // 更新提示词占位符
    if (mode === 'i2i') {
        elements.promptInput.placeholder = '描述你想要的修改效果...';
    } else if (mode === 't2v') {
        elements.promptInput.placeholder = '描述你想要生成的视频内容...';
    } else if (mode === 'i2v') {
        elements.promptInput.placeholder = '描述你希望图片如何动起来...';
    } else {
        elements.promptInput.placeholder = '描述你想要生成的图像...';
    }

    // 更新生成按钮文字
    const btnText = elements.generateBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.textContent = isVideoMode ? '生成视频' : '立即生成';
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
    elements.uploadCount.textContent = `${state.referenceImages.length}/${state.maxImages}`;

    // 隐藏/显示添加按钮
    elements.uploadAddBtn.classList.toggle('hidden', state.referenceImages.length >= state.maxImages);
}

// ==================== 生成图片/视频 ====================

async function handleGenerate() {
    const prompt = elements.promptInput.value.trim();
    const isVideoMode = state.mode === 't2v' || state.mode === 'i2v';
    const needsUpload = state.mode === 'i2i' || state.mode === 'i2v';

    if (!prompt) {
        showToast('请输入提示词', 'error');
        elements.promptInput.focus();
        return;
    }

    if (needsUpload && state.referenceImages.length === 0) {
        showToast('请上传至少一张参考图片', 'error');
        return;
    }

    // 不再禁用按钮，允许并发提交
    // elements.generateBtn.disabled = true;

    // 显示进度区域（如果之前隐藏了）
    elements.progressSection.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');

    // 并发数量
    const taskCount = state.concurrent;

    // 创建批次ID（用于日志或分组，可选）
    const batchId = generateId();
    console.log(`[Batch ${batchId}] 开始提交 ${taskCount} 个任务`);

    // 启动任务循环
    for (let i = 0; i < taskCount; i++) {
        const taskId = generateId();
        const taskName = isVideoMode ? '视频生成' : `图片生成 #${taskId.slice(-4)}`;
        
        // 1. 添加进度条 UI
        addProgressItem(taskId, taskName);
        
        // 2. 异步执行任务（不阻塞主线程，不等待 Promise.all）
        // 这里的 delay 是为了避免瞬间发起过多请求导致浏览器卡顿或被限流
        const delayMs = i * 1500;
        
        executeTaskAsync(taskId, prompt, delayMs, isVideoMode).catch(err => {
            console.error(`任务 ${taskId} 异常:`, err);
            updateProgressItem(taskId, 'error');
        });
    }

    showToast(`已提交 ${taskCount} 个任务`, 'success');
}

// 独立的异步任务执行器
async function executeTaskAsync(taskId, prompt, delayMs, isVideoMode) {
    if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const startTime = Date.now();
    
    try {
        let result;
        // 捕获当前参数快照，避免任务执行时 state 发生变化
        const currentParams = {
            model: state.model,
            resolution: state.resolution,
            aspectRatio: state.aspectRatio,
            videoRatio: state.videoRatio,
            videoResolution: state.videoResolution,
            videoDuration: state.videoDuration,
            videoMode: state.videoMode,
            // 深拷贝引用图片数组
            referenceImages: [...state.referenceImages]
        };

        if (isVideoMode) {
            // 视频生成
            result = await generateVideoRequest({
                prompt: prompt,
                ratio: currentParams.videoRatio,
                resolution: currentParams.videoResolution,
                duration: currentParams.videoDuration,
                mode: currentParams.videoMode,
                referenceImage: state.mode === 'i2v' ? currentParams.referenceImages[0] : null
            });
        } else {
            // 图片生成
            result = await generateImage({
                prompt: prompt,
                model: currentParams.model,
                resolution: currentParams.resolution,
                aspectRatio: currentParams.aspectRatio,
                referenceImages: state.mode === 'i2i' ? currentParams.referenceImages : []
            });
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const isSuccess = isVideoMode
            ? Boolean(result && result.success && result.video && result.video.videoUrl)
            : Boolean(result && result.success && Array.isArray(result.images) && result.images.length > 0);

        // 更新进度条状态
        updateProgressItem(taskId, isSuccess ? 'completed' : 'error', duration);

        if (isSuccess) {
            // 实时上屏
            if (isVideoMode) {
                addResultVideo(result.video.videoUrl, result.video.thumbnailUrl, prompt, duration);
            } else {
                result.images.forEach(img => {
                    addResultImage(img.url, prompt, duration);
                });
            }
            
            // 任务成功后，延迟移除进度条，保持界面整洁
            setTimeout(() => {
                removeProgressItem(taskId);
            }, 5000);
        }

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        updateProgressItem(taskId, 'error', duration);
        console.error(`任务 ${taskId} 失败:`, error);
    }
}

function addProgressItem(taskId, name) {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.id = `progress-${taskId}`;
    item.innerHTML = `
        <div class="progress-spinner"></div>
        <span>${name} - 生成中...</span>
    `;
    // 插入到最前面
    if (elements.progressList.firstChild) {
        elements.progressList.insertBefore(item, elements.progressList.firstChild);
    } else {
        elements.progressList.appendChild(item);
    }
}

function removeProgressItem(taskId) {
    const item = document.getElementById(`progress-${taskId}`);
    if (item) {
        item.style.opacity = '0';
        item.style.transform = 'translateX(20px)';
        setTimeout(() => item.remove(), 300);
    }
}

function clearCompletedProgress() {
    const items = elements.progressList.querySelectorAll('.progress-item.completed, .progress-item.error');
    items.forEach(item => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 300);
    });
}

async function generateImage(params) {
    if (!state.token) {
        openAuthModal();
        throw new Error('请先登录');
    }

    // Web UI 采用“提交任务 + 轮询结果”，避免长连接被浏览器/反代超时
    const submitResponse = await fetch('/api/generate/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(params)
    });

    if (submitResponse.status === 401) {
        let message = '登录已失效，请重新登录';
        try {
            const data = await submitResponse.json();
            if (data && typeof data.error === 'string' && data.error.trim()) message = data.error.trim();
        } catch {
            // ignore
        }
        forceLogoutAndReauth(message);
        throw new Error(message);
    }

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
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${state.token}`
            }
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

/**
 * 视频生成请求 (使用异步任务 + 轮询)
 */
async function generateVideoRequest(params) {
    if (!state.token) {
        openAuthModal();
        throw new Error('请先登录');
    }

    // 提交视频生成任务
    const submitResponse = await fetch('/api/generate/video/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(params)
    });

    if (submitResponse.status === 401) {
        let message = '登录已失效，请重新登录';
        try {
            const data = await submitResponse.json();
            if (data && typeof data.error === 'string' && data.error.trim()) message = data.error.trim();
        } catch {
            // ignore
        }
        forceLogoutAndReauth(message);
        throw new Error(message);
    }

    const submitContentType = submitResponse.headers.get('content-type') || '';
    if (!submitContentType.includes('application/json')) {
        const text = await submitResponse.text();
        throw new Error(`请求失败 (HTTP ${submitResponse.status})：${text.slice(0, 200)}`);
    }

    const submitData = await submitResponse.json();
    if (!submitResponse.ok || submitData.success === false) {
        throw new Error(submitData?.error || `请求失败 (HTTP ${submitResponse.status})`);
    }

    const jobId = submitData.jobId;
    if (!jobId) throw new Error('提交任务失败：缺少 jobId');

    // 轮询任务状态 (视频生成时间更长，最多等待 15 分钟)
    const pollDelayMs = 5000;
    const maxWaitMs = 15 * 60 * 1000;
    const startPollAt = Date.now();

    while (Date.now() - startPollAt < maxWaitMs) {
        const statusResponse = await fetch(`/api/generate/status/${encodeURIComponent(jobId)}?t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${state.token}`
            }
        });

        const contentType = statusResponse.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await statusResponse.text();
            throw new Error(`请求失败 (HTTP ${statusResponse.status})：${text.slice(0, 200)}`);
        }

        const data = await statusResponse.json();
        if (!statusResponse.ok || !data.success) {
            throw new Error(data?.error || `请求失败 (HTTP ${statusResponse.status})`);
        }

        const job = data.job;
        if (!job) {
            throw new Error('任务状态异常');
        }

        if (job.status === 'completed') {
            return { success: true, video: job.result };
        }
        if (job.status === 'error') {
            throw new Error(job.error || '视频生成失败');
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
    }

    throw new Error('视频生成超时（前端轮询超时）');
}

// updateProgressCount 已废弃

function updateProgressItem(taskId, status, duration = null) {
    const item = document.getElementById(`progress-${taskId}`);
    if (item) {
        // 移除原有 spinner
        item.classList.add(status);
        
        const name = item.querySelector('span').textContent.split('(')[0].trim();
        const durationText = duration ? ` (${duration}s)` : '';
        
        let iconSvg = '';
        if (status === 'completed') {
            iconSvg = `<svg class="text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (status === 'error') {
            iconSvg = `<svg class="text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        }

        item.innerHTML = `
            ${iconSvg}
            <span>${name}${durationText}</span>
        `;
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

function addResultVideo(videoUrl, thumbnailUrl, prompt, duration = null) {
    // 隐藏空状态
    elements.emptyState.classList.add('hidden');

    // 创建视频卡片
    const card = createVideoCard(videoUrl, thumbnailUrl, prompt, { duration });

    // 添加到结果网格
    elements.resultsGrid.insertBefore(card, elements.resultsGrid.firstChild);

    // 保存到结果数组
    state.results.unshift({ videoUrl, thumbnailUrl, prompt, duration, isVideo: true });
}

function createVideoCard(videoUrl, thumbnailUrl, prompt, meta = {}) {
    const card = document.createElement('div');
    card.className = 'image-card video-card';

    const durationBadge = meta.duration ? `<span class="duration-badge">${meta.duration}s</span>` : '';

    card.innerHTML = `
        ${durationBadge}
        <span class="video-badge">🎬 视频</span>
        <video src="${videoUrl}" poster="${thumbnailUrl || ''}" preload="metadata" muted loop></video>
        <div class="image-card-overlay">
            <div class="image-card-prompt">${escapeHtml(prompt)}</div>
        </div>
    `;

    // 悬停时播放
    const video = card.querySelector('video');
    card.addEventListener('mouseenter', () => {
        video.play().catch(() => { });
    });
    card.addEventListener('mouseleave', () => {
        video.pause();
        video.currentTime = 0;
    });

    // 点击打开新窗口播放
    card.addEventListener('click', () => {
        window.open(videoUrl, '_blank');
    });

    return card;
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
    if (!state.token) return;

    try {
        const response = await fetch('/api/history?limit=50', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
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

    state.history.forEach(item => {
        // 视频记录
        if (item.videoUrl) {
            const card = createVideoCard(item.videoUrl, item.thumbnailUrl, item.prompt, {
                duration: item.duration
            });
            elements.historyGrid.appendChild(card);
        }
        // 图片记录
        else if (item.imageUrl) {
            const card = createImageCard(item.imageUrl, item.prompt, {
                model: item.model,
                resolution: item.resolution
            });
            elements.historyGrid.appendChild(card);
        }
    });
}

async function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) {
        return;
    }

    try {
        await fetch('/api/history', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });
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
