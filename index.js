jQuery(async () => {

    // ========== 启动按钮 ==========
    const launcher = document.createElement('div');
    launcher.id = 'card-tester-launcher';
    launcher.textContent = '🧪';
    launcher.title = '角色卡测试台';
    document.body.appendChild(launcher);

    // ========== 点击打开独立窗口 ==========
    let testerWindow = null;

    launcher.addEventListener('click', () => {
        if (testerWindow && !testerWindow.closed) {
            testerWindow.focus();
            return;
        }
        testerWindow = window.open('', 'CardTester', 'width=1200,height=800,resizable=yes,scrollbars=yes');
        buildTesterWindow(testerWindow);
    });

    // ========== 从酒馆读取配置 ==========
    function getSTConfig() {
        const config = {
            apiType: '',
            apiUrl: '',
            apiKey: '',
            models: [],
            presets: [],
            characters: [],
            currentChar: null
        };

        try {
            // 读取API类型和配置
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();

                // 当前角色
                if (ctx.characters) {
                    config.characters = ctx.characters.map(c => ({
                        name: c.name || 'Unknown',
                        avatar: c.avatar,
                        description: c.description || '',
                        personality: c.personality || '',
                        scenario: c.scenario || '',
                        first_mes: c.first_mes || '',
                        mes_example: c.mes_example || ''
                    }));
                }
                if (ctx.characterId !== undefined && ctx.characters) {
                    config.currentChar = ctx.characters[ctx.characterId];
                }
            }

            // 尝试读取main_api设置
            if (typeof main_api !== 'undefined') {
                config.apiType = main_api;
            }

            // 读取OpenAI兼容配置
            if (typeof oai_settings !== 'undefined') {
                config.apiUrl = oai_settings.reverse_proxy || oai_settings.custom_url || 'https://api.openai.com/v1';
                config.apiKey = oai_settings.reverse_proxy ?
                    (oai_settings.proxy_password || '') :
                    (secret_state?.OPENAI_SECRET ? 'configured' : '');

                if (oai_settings.openai_model) {
                    config.models.push(oai_settings.openai_model);
                }
            }

        } catch (e) {
            console.warn('读取ST配置时出错:', e);
        }

        return config;
    }

    // ========== 获取API密钥 ==========
    async function getApiKey() {
        try {
            // 尝试从secrets获取
            const response = await fetch('/api/secrets/view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (response.ok) {
                return await response.json();
            }
        } catch(e) {}
        return null;
    }

    // ========== 构建独立窗口 ==========
    function buildTesterWindow(win) {
        const doc = win.document;
        doc.title = '🧪 角色卡测试台';

        const config = getSTConfig();

        doc.head.innerHTML = `
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
                    background: #1a1a2e;
                    color: #e0e0e0;
                    overflow-x: hidden;
                }

                /* 顶部标题栏 */
                .top-bar {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 15px 25px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }
                .top-bar h1 {
                    font-size: 20px;
                    color: white;
                }
                .top-bar .status {
                    font-size: 12px;
                    color: rgba(255,255,255,0.7);
                }

                /* 主布局 */
                .main-layout {
                    display: flex;
                    height: calc(100vh - 60px);
                }

                /* 左侧面板 */
                .left-panel {
                    width: 380px;
                    min-width: 380px;
                    background: #16213e;
                    border-right: 1px solid #333;
                    overflow-y: auto;
                    padding: 20px;
                }

                /* 右侧结果区 */
                .right-panel {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: #1a1a2e;
                }

                /* 区块标题 */
                .section-title {
                    color: #bb86fc;
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                /* 场景卡片 */
                .scenario-item {
                    background: #1a1a2e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 10px;
                    margin-bottom: 8px;
                    position: relative;
                }
                .scenario-item .scenario-name {
                    font-weight: bold;
                    font-size: 13px;
                    margin-bottom: 5px;
                    color: #e0e0e0;
                }
                .scenario-item .scenario-messages {
                    font-size: 12px;
                    color: #999;
                    white-space: pre-wrap;
                    max-height: 60px;
                    overflow: hidden;
                }
                .scenario-item .scenario-actions {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    display: flex;
                    gap: 5px;
                }

                /* 组合卡片 */
                .combo-card {
                    background: #1a1a2e;
                    border: 1px solid #333;
                    border-radius: 10px;
                    padding: 15px;
                    margin-bottom: 10px;
                    position: relative;
                }
                .combo-card .combo-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .combo-card .combo-title {
                    font-weight: bold;
                    font-size: 14px;
                    color: #667eea;
                }
                .combo-card .combo-row {
                    margin-bottom: 8px;
                }
                .combo-card label {
                    display: block;
                    font-size: 12px;
                    color: #999;
                    margin-bottom: 3px;
                }
                .combo-card select, .combo-card input[type="text"] {
                    width: 100%;
                    padding: 6px 10px;
                    background: #0f3460;
                    color: #e0e0e0;
                    border: 1px solid #444;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                }
                .combo-card select:focus, .combo-card input:focus {
                    border-color: #667eea;
                }
                .combo-card .scenario-checks {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                }
                .combo-card .scenario-check {
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    background: #0f3460;
                    padding: 3px 8px;
                    border-radius: 4px;
                }

                /* 按钮 */
                .btn {
                    padding: 6px 14px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                    color: white;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                }
                .btn-primary:hover { opacity: 0.85; }
                .btn-success {
                    background: #4CAF50;
                }
                .btn-success:hover { background: #45a049; }
                .btn-danger {
                    background: #f44336;
                }
                .btn-danger:hover { background: #d32f2f; }
                .btn-small {
                    padding: 3px 8px;
                    font-size: 11px;
                }

                .btn-start {
                    width: 100%;
                    padding: 12px;
                    font-size: 16px;
                    margin-top: 15px;
                    background: linear-gradient(135deg, #4CAF50, #45a049);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s;
                }
                .btn-start:hover { transform: scale(1.02); box-shadow: 0 4px 15px rgba(76,175,80,0.4); }
                .btn-start:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

                /* 结果区域 */
                .result-scenario {
                    margin-bottom: 25px;
                }
                .result-scenario-title {
                    font-size: 15px;
                    font-weight: bold;
                    color: #bb86fc;
                    margin-bottom: 5px;
                }
                .result-scenario-prompt {
                    font-size: 12px;
                    color: #888;
                    margin-bottom: 10px;
                    padding: 8px;
                    background: #16213e;
                    border-radius: 6px;
                }
                .result-grid {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .result-card {
                    flex: 1;
                    min-width: 250px;
                    max-width: 400px;
                    background: #16213e;
                    border: 1px solid #333;
                    border-radius: 10px;
                    overflow: hidden;
                }
                .result-card-header {
                    background: #0f3460;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: bold;
                    color: #667eea;
                }
                .result-card-body {
                    padding: 12px;
                    font-size: 13px;
                    line-height: 1.7;
                    white-space: pre-wrap;
                    max-height: 300px;
                    overflow-y: auto;
                }
                .result-card-footer {
                    padding: 8px 12px;
                    border-top: 1px solid #333;
                    display: flex;
                    gap: 5px;
                    align-items: center;
                }
                .star-btn {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    opacity: 0.4;
                    transition: opacity 0.2s;
                }
                .star-btn:hover, .star-btn.active { opacity: 1; }

                .loading-dot {
                    display: inline-block;
                    animation: pulse 1s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                }

                .progress-bar {
                    width: 100%;
                    height: 4px;
                    background: #333;
                    border-radius: 2px;
                    margin-top: 10px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    transition: width 0.3s;
                    width: 0%;
                }

                /* 弹窗 */
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-box {
                    background: #16213e;
                    border: 1px solid #444;
                    border-radius: 12px;
                    padding: 20px;
                    width: 450px;
                    max-width: 90%;
                }
                .modal-box h3 { margin-bottom: 15px; color: #bb86fc; }
                .modal-box textarea, .modal-box input[type="text"] {
                    width: 100%;
                    padding: 8px;
                    background: #0f3460;
                    color: #e0e0e0;
                    border: 1px solid #444;
                    border-radius: 6px;
                    font-size: 13px;
                    margin-bottom: 10px;
                    font-family: inherit;
                }
                .modal-box textarea { height: 120px; resize: vertical; }
                .modal-box .modal-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 10px;
                }

                .empty-hint {
                    text-align: center;
                    color: #666;
                    padding: 40px 20px;
                    font-size: 14px;
                }

                /* API设置区 */
                .api-config {
                    background: #0f3460;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 15px;
                }
                .api-config label {
                    display: block;
                    font-size: 12px;
                    color: #999;
                    margin-bottom: 3px;
                }
                .api-config input, .api-config select {
                    width: 100%;
                    padding: 6px 10px;
                    background: #1a1a2e;
                    color: #e0e0e0;
                    border: 1px solid #444;
                    border-radius: 6px;
                    font-size: 13px;
                    margin-bottom: 8px;
                    outline: none;
                }

                .divider {
                    border: none;
                    border-top: 1px solid #333;
                    margin: 15px 0;
                }
            </style>
        `;

        // 获取当前角色信息
        let currentCharData = null;
        try {
            const ctx = SillyTavern.getContext();
            if (ctx.characterId !== undefined && ctx.characters) {
                const char = ctx.characters[ctx.characterId];
                currentCharData = {
                    name: char.name || 'Unknown',
                    description: char.description || '',
                    personality: char.personality || '',
                    scenario: char.scenario || '',
                    first_mes: char.first_mes || '',
                    mes_example: char.mes_example || '',
                    system_prompt: char.data?.system_prompt || ''
                };
            }
        } catch(e) {}

        doc.body.innerHTML = `
            <div class="top-bar">
                <h1>🧪 角色卡测试台</h1>
                <div class="status">
                    当前角色: ${currentCharData ? currentCharData.name : '未选择角色'}
                    &nbsp;|&nbsp;
                    <span id="test-status">就绪</span>
                </div>
            </div>

            <div class="main-layout">
                <div class="left-panel">

                    <!-- API配置 -->
                    <div class="section-title">🔌 API 设置</div>
                    <div class="api-config">
                        <label>API 地址</label>
                        <input type="text" id="api-url" placeholder="https://api.openai.com/v1" value="">
                        <label>API Key</label>
                        <input type="text" id="api-key" placeholder="sk-..." value="">
                        <label>默认模型</label>
                        <input type="text" id="default-model" placeholder="gpt-4o" value="gpt-4o">
                    </div>

                    <hr class="divider">

                    <!-- 场景管理 -->
                    <div class="section-title">
                        🎬 测试场景
                        <button class="btn btn-primary btn-small" id="add-scenario-btn">➕ 添加</button>
                    </div>
                    <div id="scenario-list"></div>

                    <hr class="divider">

                    <!-- 组合管理 -->
                    <div class="section-title">
                        🧩 测试组合
                        <button class="btn btn-primary btn-small" id="add-combo-btn">➕ 添加</button>
                    </div>
                    <div id="combo-list"></div>

                    <hr class="divider">

                    <!-- 开始按钮 -->
                    <button class="btn-start" id="start-test-btn">▶ 开始测试</button>
                    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>

                </div>

                <div class="right-panel">
                    <div class="section-title">📊 测试结果</div>
                    <div id="results-area">
                        <div class="empty-hint">
                            <p style="font-size:40px;margin-bottom:10px;">🧪</p>
                            <p>配置好场景和组合后，点击「开始测试」</p>
                            <p style="margin-top:5px;font-size:12px;color:#555;">结果将在这里并排对比显示</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ========== 数据 ==========
        const state = {
            scenarios: [
                { id: 1, name: '自我介绍', messages: ['你好，请介绍一下你自己，你叫什么名字？你有什么样的性格？'] },
                { id: 2, name: '日常互动', messages: ['今天天气真好，你想和我一起出去走走吗？'] },
                { id: 3, name: '角色一致性', messages: ['你是AI吗？你是不是在假装？'] }
            ],
            combos: [],
            nextScenarioId: 4,
            nextComboId: 1,
            results: {},
            testing: false
        };

        // ========== 尝试自动填充API配置 ==========
        try {
            if (typeof oai_settings !== 'undefined') {
                const urlInput = doc.getElementById('api-url');
                const modelInput = doc.getElementById('default-model');

                if (oai_settings.reverse_proxy) {
                    urlInput.value = oai_settings.reverse_proxy;
                } else if (oai_settings.custom_url) {
                    urlInput.value = oai_settings.custom_url;
                }

                if (oai_settings.openai_model) {
                    modelInput.value = oai_settings.openai_model;
                }
            }
        } catch(e) {}

        // ========== 渲染场景列表 ==========
        function renderScenarios() {
            const container = doc.getElementById('scenario-list');
            container.innerHTML = '';
            state.scenarios.forEach(s => {
                const div = doc.createElement('div');
                div.className = 'scenario-item';
                div.innerHTML = `
                    <div class="scenario-actions">
                        <button class="btn btn-primary btn-small edit-scenario" data-id="${s.id}">✏️</button>
                        <button class="btn btn-danger btn-small del-scenario" data-id="${s.id}">🗑️</button>
                    </div>
                    <div class="scenario-name">📌 ${s.name}</div>
                    <div class="scenario-messages">${s.messages.join('\n→ ')}</div>
                `;
                container.appendChild(div);
            });

            // 绑定事件
            container.querySelectorAll('.edit-scenario').forEach(btn => {
                btn.addEventListener('click', () => editScenario(parseInt(btn.dataset.id)));
            });
            container.querySelectorAll('.del-scenario').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.scenarios = state.scenarios.filter(s => s.id !== parseInt(btn.dataset.id));
                    renderScenarios();
                    renderCombos();
                });
            });

            renderCombos(); // 更新组合中的场景选项
        }

        // ========== 渲染组合列表 ==========
        function renderCombos() {
            const container = doc.getElementById('combo-list');
            container.innerHTML = '';
            state.combos.forEach(combo => {
                const div = doc.createElement('div');
                div.className = 'combo-card';

                let scenarioChecks = state.scenarios.map(s => {
                    const checked = combo.scenarioIds.includes(s.id) ? 'checked' : '';
                    return `<label class="scenario-check">
                        <input type="checkbox" class="combo-scenario-check" data-combo="${combo.id}" data-scenario="${s.id}" ${checked}>
                        ${s.name}
                    </label>`;
                }).join('');

                div.innerHTML = `
                    <div class="combo-header">
                        <span class="combo-title">🧩 组合 ${combo.id}</span>
                        <button class="btn btn-danger btn-small del-combo" data-id="${combo.id}">🗑️</button>
                    </div>
                    <div class="combo-row">
                        <label>🤖 模型</label>
                        <input type="text" class="combo-model" data-id="${combo.id}" value="${combo.model}" placeholder="gpt-4o / claude-3-5-sonnet...">
                    </div>
                    <div class="combo-row">
                        <label>📋 预设（System Prompt 补充，可留空）</label>
                        <input type="text" class="combo-preset" data-id="${combo.id}" value="${combo.preset}" placeholder="例如：请用中文回复，语气可爱一些">
                    </div>
                    <div class="combo-row">
                        <label>🎬 测试场景</label>
                        <div class="scenario-checks">${scenarioChecks}</div>
                    </div>
                `;
                container.appendChild(div);
            });

            // 绑定事件
            container.querySelectorAll('.del-combo').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.combos = state.combos.filter(c => c.id !== parseInt(btn.dataset.id));
                    renderCombos();
                });
            });
            container.querySelectorAll('.combo-model').forEach(input => {
                input.addEventListener('change', () => {
                    const combo = state.combos.find(c => c.id === parseInt(input.dataset.id));
                    if (combo) combo.model = input.value;
                });
            });
            container.querySelectorAll('.combo-preset').forEach(input => {
                input.addEventListener('change', () => {
                    const combo = state.combos.find(c => c.id === parseInt(input.dataset.id));
                    if (combo) combo.preset = input.value;
                });
            });
            container.querySelectorAll('.combo-scenario-check').forEach(cb => {
                cb.addEventListener('change', () => {
                    const combo = state.combos.find(c => c.id === parseInt(cb.dataset.combo));
                    const scenarioId = parseInt(cb.dataset.scenario);
                    if (combo) {
                        if (cb.checked) {
                            if (!combo.scenarioIds.includes(scenarioId)) combo.scenarioIds.push(scenarioId);
                        } else {
                            combo.scenarioIds = combo.scenarioIds.filter(id => id !== scenarioId);
                        }
                    }
                });
            });
        }

        // ========== 添加场景弹窗 ==========
        function showScenarioModal(existing) {
            const overlay = doc.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-box">
                    <h3>${existing ? '✏️ 编辑场景' : '➕ 添加场景'}</h3>
                    <label style="color:#999;font-size:12px;">场景名称</label>
                    <input type="text" id="modal-scenario-name" value="${existing ? existing.name : ''}" placeholder="例如：自我介绍测试">
                    <label style="color:#999;font-size:12px;">测试消息（每行一条，多行=多轮对话）</label>
                    <textarea id="modal-scenario-messages" placeholder="你好，请介绍一下你自己\n你的性格是什么样的？">${existing ? existing.messages.join('\n') : ''}</textarea>
                    <div class="modal-actions">
                        <button class="btn btn-danger" id="modal-cancel">取消</button>
                        <button class="btn btn-success" id="modal-confirm">确认</button>
                    </div>
                </div>
            `;
            doc.body.appendChild(overlay);

            doc.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
            doc.getElementById('modal-confirm').addEventListener('click', () => {
                const name = doc.getElementById('modal-scenario-name').value.trim();
                const msgs = doc.getElementById('modal-scenario-messages').value.trim().split('\n').filter(m => m.trim());
                if (!name || msgs.length === 0) {
                    win.alert('请填写场景名称和至少一条测试消息');
                    return;
                }
                if (existing) {
                    existing.name = name;
                    existing.messages = msgs;
                } else {
                    state.scenarios.push({ id: state.nextScenarioId++, name, messages: msgs });
                }
                overlay.remove();
                renderScenarios();
            });
        }

        function editScenario(id) {
            const scenario = state.scenarios.find(s => s.id === id);
            if (scenario) showScenarioModal(scenario);
        }

        // ========== 事件绑定 ==========
        doc.getElementById('add-scenario-btn').addEventListener('click', () => showScenarioModal(null));

        doc.getElementById('add-combo-btn').addEventListener('click', () => {
            const defaultModel = doc.getElementById('default-model').value || 'gpt-4o';
            state.combos.push({
                id: state.nextComboId++,
                model: defaultModel,
                preset: '',
                scenarioIds: state.scenarios.map(s => s.id) // 默认全选
            });
            renderCombos();
        });

        // ========== 核心：发送API请求 ==========
        async function sendApiRequest(model, systemPrompt, messages) {
            const apiUrl = doc.getElementById('api-url').value.trim();
            const apiKey = doc.getElementById('api-key').value.trim();

            if (!apiUrl || !apiKey) {
                throw new Error('请先填写API地址和API Key');
            }

            // 组装消息
            const apiMessages = [];

            // System prompt
            if (systemPrompt) {
                apiMessages.push({ role: 'system', content: systemPrompt });
            }

            // 对话消息
            messages.forEach(msg => {
                apiMessages.push(msg);
            });

            // 判断是否Claude API
            const isClaude = apiUrl.includes('anthropic') || model.includes('claude');

            let url, headers, body;

            if (isClaude && apiUrl.includes('anthropic')) {
                // Anthropic原生API
                url = apiUrl.replace(/\/+$/, '') + '/v1/messages';
                headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                body = JSON.stringify({
                    model: model,
                    max_tokens: 1024,
                    system: systemPrompt || '',
                    messages: messages.filter(m => m.role !== 'system')
                });
            } else {
                // OpenAI兼容格式
                url = apiUrl.replace(/\/+$/, '') + '/chat/completions';
                // 避免重复 /v1/v1
                if (apiUrl.endsWith('/v1') || apiUrl.endsWith('/v1/')) {
                    url = apiUrl.replace(/\/+$/, '') + '/chat/completions';
                }
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                };
                body = JSON.stringify({
                    model: model,
                    messages: apiMessages,
                    max_tokens: 1024,
                    temperature: 0.8
                });
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API错误 (${response.status}): ${errText.substring(0, 200)}`);
            }

            const data = await response.json();

            // 提取回复
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            } else if (data.content && data.content[0]) {
                return data.content[0].text;
            } else {
                throw new Error('无法解析API回复: ' + JSON.stringify(data).substring(0, 200));
            }
        }

        // ========== 构建System Prompt ==========
        function buildSystemPrompt(combo) {
            let parts = [];

            // 角色卡信息
            if (currentCharData) {
                if (currentCharData.system_prompt) {
                    parts.push(currentCharData.system_prompt);
                }
                if (currentCharData.description) {
                    parts.push(`角色描述：${currentCharData.description}`);
                }
                if (currentCharData.personality) {
                    parts.push(`角色性格：${currentCharData.personality}`);
                }
                if (currentCharData.scenario) {
                    parts.push(`场景设定：${currentCharData.scenario}`);
                }
                if (currentCharData.mes_example) {
                    parts.push(`对话示例：\n${currentCharData.mes_example}`);
                }
            }

            // 组合自定义预设
            if (combo.preset) {
                parts.push(combo.preset);
            }

            return parts.join('\n\n');
        }

        // ========== 开始测试 ==========
        doc.getElementById('start-test-btn').addEventListener('click', async () => {
            if (state.testing) return;

            const apiUrl = doc.getElementById('api-url').value.trim();
            const apiKey = doc.getElementById('api-key').value.trim();

            if (!apiUrl || !apiKey) {
                win.alert('⚠️ 请先填写API地址和API Key！');
                return;
            }
            if (state.combos.length === 0) {
                win.alert('⚠️ 请至少添加一个测试组合！');
                return;
            }
            if (state.scenarios.length === 0) {
                win.alert('⚠️ 请至少添加一个测试场景！');
                return;
            }

            state.testing = true;
            state.results = {};
            const startBtn = doc.getElementById('start-test-btn');
            startBtn.disabled = true;
            startBtn.textContent = '⏳ 测试中...';

            const resultsArea = doc.getElementById('results-area');
            resultsArea.innerHTML = '';

            // 计算总任务数
            let totalTasks = 0;
            let completedTasks = 0;
            state.combos.forEach(combo => {
                combo.scenarioIds.forEach(sid => {
                    if (state.scenarios.find(s => s.id === sid)) totalTasks++;
                });
            });

            function updateProgress() {
                const pct = totalTasks > 0 ? (completedTasks / totalTasks * 100) : 0;
                doc.getElementById('progress-fill').style.width = pct + '%';
                doc.getElementById('test-status').textContent = `测试中 ${completedTasks}/${totalTasks}`;
            }

            // 按场景分组展示
            for (const scenario of state.scenarios) {
                const relevantCombos = state.combos.filter(c => c.scenarioIds.includes(scenario.id));
                if (relevantCombos.length === 0) continue;

                const scenarioDiv = doc.createElement('div');
                scenarioDiv.className = 'result-scenario';
                scenarioDiv.innerHTML = `
                    <div class="result-scenario-title">🎬 ${scenario.name}</div>
                    <div class="result-scenario-prompt">💬 ${scenario.messages.join(' → ')}</div>
                    <div class="result-grid" id="result-grid-${scenario.id}"></div>
                `;
                resultsArea.appendChild(scenarioDiv);

                const grid = scenarioDiv.querySelector('.result-grid');

                // 为每个组合创建结果卡片
                relevantCombos.forEach(combo => {
                    const card = doc.createElement('div');
                    card.className = 'result-card';
                    card.id = `result-${scenario.id}-${combo.id}`;
                    card.innerHTML = `
                        <div class="result-card-header">🧩 组合${combo.id} | 🤖 ${combo.model}</div>
                        <div class="result-card-body">
                            <span class="loading-dot">⏳ 等待回复中...</span>
                        </div>
                        <div class="result-card-footer">
                            ${'⭐'.repeat(5).split('').map((s, i) =>
                                `<button class="star-btn" data-score="${i+1}">${s}</button>`
                            ).join('')}
                        </div>
                    `;
                    grid.appendChild(card);
                });

                // 并行发送请求
                const promises = relevantCombos.map(async (combo) => {
                    const systemPrompt = buildSystemPrompt(combo);
                    const card = doc.getElementById(`result-${scenario.id}-${combo.id}`);
                    const bodyDiv = card.querySelector('.result-card-body');

                    try {
                        // 构建多轮消息
                        let conversationMessages = [];
                        let lastReply = '';

                        // 如果有开场白，加入
                        if (currentCharData && currentCharData.first_mes) {
                            conversationMessages.push({
                                role: 'assistant',
                                content: currentCharData.first_mes
                            });
                        }

                        // 逐轮发送
                        let allReplies = [];
                        for (let i = 0; i < scenario.messages.length; i++) {
                            conversationMessages.push({
                                role: 'user',
                                content: scenario.messages[i]
                            });

                            const reply = await sendApiRequest(
                                combo.model,
                                systemPrompt,
                                conversationMessages
                            );

                            conversationMessages.push({
                                role: 'assistant',
                                content: reply
                            });

                            allReplies.push({
                                user: scenario.messages[i],
                                reply: reply
                            });
                        }

                        // 显示结果
                        let resultHTML = '';
                        allReplies.forEach((r, idx) => {
                            if (scenario.messages.length > 1) {
                                resultHTML += `<div style="color:#667eea;font-size:11px;margin-bottom:3px;">👤 ${r.user}</div>`;
                            }
                            resultHTML += `<div style="margin-bottom:10px;">${r.reply}</div>`;
                        });
                        bodyDiv.innerHTML = resultHTML;

                    } catch (err) {
                        bodyDiv.innerHTML = `<div style="color:#f44336;">❌ 错误: ${err.message}</div>`;
                    }

                    completedTasks++;
                    updateProgress();

                    // 星星评分
                    card.querySelectorAll('.star-btn').forEach(starBtn => {
                        starBtn.addEventListener('click', () => {
                            const score = parseInt(starBtn.dataset.score);
                            card.querySelectorAll('.star-btn').forEach((sb, idx) => {
                                sb.classList.toggle('active', idx < score);
                            });
                        });
                    });
                });

                await Promise.all(promises);
            }

            state.testing = false;
            startBtn.disabled = false;
            startBtn.textContent = '▶ 重新测试';
            doc.getElementById('test-status').textContent = '✅ 测试完成';
            doc.getElementById('progress-fill').style.width = '100%';
        });

        // ========== 初始渲染 ==========
        renderScenarios();

        console.log('✅ 角色卡测试台窗口已加载');
    }

    console.log('✅ 角色卡测试台插件已加载');
});
