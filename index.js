jQuery(async () => {

    // ========== 创建启动按钮 ==========
    const launcher = document.createElement('div');
    launcher.id = 'card-tester-launcher';
    launcher.textContent = '🧪';
    launcher.title = '角色卡测试台';
    document.body.appendChild(launcher);

    // ========== 创建遮罩和主面板 ==========
    const overlay = document.createElement('div');
    overlay.id = 'card-tester-overlay';
    document.body.appendChild(overlay);

    const main = document.createElement('div');
    main.id = 'card-tester-main';
    document.body.appendChild(main);

    let isOpen = false;

    function togglePanel(open) {
        isOpen = open;
        overlay.classList.toggle('open', open);
        main.classList.toggle('open', open);
    }

    launcher.addEventListener('click', () => {
        togglePanel(!isOpen);
        if (isOpen) refreshSTData();
    });
    overlay.addEventListener('click', () => togglePanel(false));

    // ========== 酒馆数据 ==========
    let stCharacters = [];
    let stCurrentCharId = -1;
    let stModels = [];

    function refreshSTData() {
        try {
            const ctx = SillyTavern.getContext();

            // 角色列表
            if (ctx.characters) {
                stCharacters = ctx.characters.map((c, i) => ({
                    index: i,
                    name: c.name || 'Unknown',
                    description: c.description || '',
                    personality: c.personality || '',
                    scenario: c.scenario || '',
                    first_mes: c.first_mes || '',
                    mes_example: c.mes_example || '',
                    system_prompt: c.data?.system_prompt || '',
                    post_history_instructions: c.data?.post_history_instructions || '',
                    tags: c.tags || []
                }));
            }
            if (ctx.characterId !== undefined) {
                stCurrentCharId = ctx.characterId;
            }
        } catch(e) {
            console.warn('读取ST数据失败:', e);
        }

        renderCharSelect();
        renderCombos();
    }

    // ========== 从API获取模型列表 ==========
    async function fetchModels(apiUrl, apiKey) {
        try {
            let url = apiUrl.replace(/\/+$/, '');
            if (!url.endsWith('/models')) {
                if (url.endsWith('/v1')) {
                    url += '/models';
                } else {
                    url += '/v1/models';
                }
            }

            const resp = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + apiKey
                }
            });

            if (!resp.ok) throw new Error('获取失败: ' + resp.status);

            const data = await resp.json();
            if (data.data && Array.isArray(data.data)) {
                stModels = data.data.map(m => m.id).sort();
            } else if (Array.isArray(data)) {
                stModels = data.map(m => m.id || m).sort();
            }

            renderModelSelects();
            return true;
        } catch(e) {
            console.warn('获取模型列表失败:', e);
            return false;
        }
    }

    // ========== 状态数据 ==========
    const state = {
        scenarios: [
            { id: 1, name: '自我介绍', messages: ['你好，请介绍一下你自己，你叫什么名字？你有什么样的性格？'] },
            { id: 2, name: '日常互动', messages: ['今天天气真好，你想和我一起出去走走吗？'] },
            { id: 3, name: '角色一致性', messages: ['你是AI吗？你是不是在假装？'] }
        ],
        combos: [],
        nextScenarioId: 4,
        nextComboId: 1,
        testing: false
    };

    // ========== 构建主界面 ==========
    main.innerHTML = `
        <div class="ct-topbar">
            <h1>🧪 角色卡测试台</h1>
            <div class="ct-topbar-right">
                <span class="ct-status" id="ct-status">就绪</span>
                <button class="ct-close-btn" id="ct-close">✕</button>
            </div>
        </div>
        <div class="ct-body">
            <div class="ct-left">

                <!-- API配置 -->
                <div class="ct-section">
                    <div class="ct-section-title">🔌 API 设置</div>
                    <div class="ct-api-box">
                        <label>API 地址</label>
                        <input type="text" id="ct-api-url" placeholder="https://api.openai.com/v1">
                        <label>API Key</label>
                        <input type="password" id="ct-api-key" placeholder="sk-...">
                        <div style="margin-top:8px;">
                            <button class="ct-btn ct-btn-primary" id="ct-fetch-models">🔄 拉取模型列表</button>
                            <span id="ct-model-status" style="font-size:11px;color:#888;margin-left:8px;"></span>
                        </div>
                    </div>
                </div>

                <!-- 角色选择 -->
                <div class="ct-section">
                    <div class="ct-section-title">🎭 角色卡</div>
                    <div class="ct-api-box">
                        <label>选择角色</label>
                        <select id="ct-char-select">
                            <option value="-1">-- 请先打开面板刷新 --</option>
                        </select>
                        <div id="ct-char-info" style="font-size:11px;color:#888;margin-top:5px;max-height:60px;overflow:hidden;"></div>
                    </div>
                </div>

                <hr class="ct-divider">

                <!-- 场景管理 -->
                <div class="ct-section">
                    <div class="ct-section-title">
                        🎬 测试场景
                        <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-add-scenario">➕ 添加</button>
                    </div>
                    <div id="ct-scenario-list"></div>
                </div>

                <hr class="ct-divider">

                <!-- 组合管理 -->
                <div class="ct-section">
                    <div class="ct-section-title">
                        🧩 测试组合
                        <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-add-combo">➕ 添加</button>
                    </div>
                    <div id="ct-combo-list"></div>
                </div>

                <button class="ct-btn-start" id="ct-start">▶ 开始测试</button>
                <div class="ct-progress"><div class="ct-progress-fill" id="ct-progress"></div></div>

            </div>

            <div class="ct-right">
                <div class="ct-section-title">📊 测试结果</div>
                <div id="ct-results">
                    <div class="ct-empty">
                        <p style="font-size:36px;margin-bottom:8px;">🧪</p>
                        <p>配置好场景和组合后，点击「开始测试」</p>
                        <p style="margin-top:4px;font-size:11px;">结果将在这里并排对比显示</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ========== 尝试自动填充API ==========
    try {
        if (typeof oai_settings !== 'undefined') {
            if (oai_settings.reverse_proxy) {
                document.getElementById('ct-api-url').value = oai_settings.reverse_proxy;
            } else if (oai_settings.custom_url) {
                document.getElementById('ct-api-url').value = oai_settings.custom_url;
            }
        }
    } catch(e) {}

    // ========== 关闭按钮 ==========
    document.getElementById('ct-close').addEventListener('click', () => togglePanel(false));

    // ========== 拉取模型按钮 ==========
    document.getElementById('ct-fetch-models').addEventListener('click', async () => {
        const url = document.getElementById('ct-api-url').value.trim();
        const key = document.getElementById('ct-api-key').value.trim();
        const statusEl = document.getElementById('ct-model-status');

        if (!url || !key) {
            statusEl.textContent = '❌ 请先填写地址和Key';
            statusEl.style.color = '#f44336';
            return;
        }

        statusEl.textContent = '⏳ 拉取中...';
        statusEl.style.color = '#ffa726';

        const ok = await fetchModels(url, key);
        if (ok && stModels.length > 0) {
            statusEl.textContent = `✅ 获取到 ${stModels.length} 个模型`;
            statusEl.style.color = '#4CAF50';
        } else {
            statusEl.textContent = '❌ 获取失败，请检查地址和Key';
            statusEl.style.color = '#f44336';
        }
    });

    // ========== 角色选择 ==========
    function renderCharSelect() {
        const sel = document.getElementById('ct-char-select');
        sel.innerHTML = '<option value="-1">-- 未选择 --</option>';
        stCharacters.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.index;
            opt.textContent = c.name;
            if (c.index === stCurrentCharId) opt.selected = true;
            sel.appendChild(opt);
        });
        updateCharInfo();
    }

    function updateCharInfo() {
        const sel = document.getElementById('ct-char-select');
        const info = document.getElementById('ct-char-info');
        const idx = parseInt(sel.value);
        const char = stCharacters.find(c => c.index === idx);
        if (char) {
            const desc = char.description.substring(0, 100);
            info.textContent = desc + (char.description.length > 100 ? '...' : '');
        } else {
            info.textContent = '';
        }
    }

    document.getElementById('ct-char-select').addEventListener('change', updateCharInfo);

    // ========== 模型下拉更新 ==========
    function renderModelSelects() {
        document.querySelectorAll('.ct-model-select').forEach(sel => {
            const currentVal = sel.value;
            sel.innerHTML = '<option value="">-- 选择模型 --</option>';
            stModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                if (m === currentVal) opt.selected = true;
                sel.appendChild(opt);
            });
            // 如果之前的值还在，保持选中
            if (currentVal && !stModels.includes(currentVal)) {
                const opt = document.createElement('option');
                opt.value = currentVal;
                opt.textContent = currentVal + ' (手动)';
                opt.selected = true;
                sel.appendChild(opt);
            }
        });
    }

    // ========== 渲染场景列表 ==========
    function renderScenarios() {
        const container = document.getElementById('ct-scenario-list');
        container.innerHTML = '';
        state.scenarios.forEach(s => {
            const div = document.createElement('div');
            div.className = 'ct-scenario';
            div.innerHTML = `
                <div class="ct-scenario-actions">
                    <button class="ct-btn ct-btn-primary ct-btn-small ct-edit-scenario" data-id="${s.id}">✏️</button>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-del-scenario" data-id="${s.id}">🗑️</button>
                </div>
                <div class="ct-scenario-name">📌 ${s.name}</div>
                <div class="ct-scenario-msg">${s.messages.join(' → ')}</div>
            `;
            container.appendChild(div);
        });

        container.querySelectorAll('.ct-edit-scenario').forEach(btn => {
            btn.addEventListener('click', () => showScenarioModal(state.scenarios.find(s => s.id === parseInt(btn.dataset.id))));
        });
        container.querySelectorAll('.ct-del-scenario').forEach(btn => {
            btn.addEventListener('click', () => {
                state.scenarios = state.scenarios.filter(s => s.id !== parseInt(btn.dataset.id));
                renderScenarios();
                renderCombos();
            });
        });
    }

    // ========== 渲染组合列表 ==========
    function renderCombos() {
        const container = document.getElementById('ct-combo-list');
        container.innerHTML = '';
        state.combos.forEach(combo => {
            const div = document.createElement('div');
            div.className = 'ct-combo';

            let modelOptions = '<option value="">-- 选择模型 --</option>';
            stModels.forEach(m => {
                modelOptions += `<option value="${m}" ${m === combo.model ? 'selected' : ''}>${m}</option>`;
            });
            // 如果手动输入的模型不在列表中
            if (combo.model && !stModels.includes(combo.model)) {
                modelOptions += `<option value="${combo.model}" selected>${combo.model} (手动)</option>`;
            }

            let scenarioChecks = state.scenarios.map(s => {
                const checked = combo.scenarioIds.includes(s.id) ? 'checked' : '';
                return `<label class="ct-scenario-check">
                    <input type="checkbox" class="ct-combo-sc" data-combo="${combo.id}" data-scenario="${s.id}" ${checked}>
                    ${s.name}
                </label>`;
            }).join('');

            div.innerHTML = `
                <div class="ct-combo-header">
                    <span class="ct-combo-title">🧩 组合 ${combo.id}</span>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-del-combo" data-id="${combo.id}">🗑️</button>
                </div>
                <div class="ct-combo-row">
                    <label>🤖 模型</label>
                    <select class="ct-model-select ct-combo-model" data-id="${combo.id}">
                        ${modelOptions}
                    </select>
                    <input type="text" class="ct-combo-model-manual" data-id="${combo.id}"
                        placeholder="或手动输入模型名" value="${!stModels.includes(combo.model) ? combo.model : ''}"
                        style="margin-top:4px;font-size:11px;">
                </div>
                <div class="ct-combo-row">
                    <label>📋 预设补充（可选）</label>
                    <input type="text" class="ct-combo-preset" data-id="${combo.id}" value="${combo.preset}" placeholder="例如：用中文回复，语气可爱">
                </div>
                <div class="ct-combo-row">
                    <label>🎬 测试场景</label>
                    <div class="ct-scenario-checks">${scenarioChecks}</div>
                </div>
            `;
            container.appendChild(div);
        });

        // 事件绑定
        container.querySelectorAll('.ct-del-combo').forEach(btn => {
            btn.addEventListener('click', () => {
                state.combos = state.combos.filter(c => c.id !== parseInt(btn.dataset.id));
                renderCombos();
            });
        });
        container.querySelectorAll('.ct-combo-model').forEach(sel => {
            sel.addEventListener('change', () => {
                const combo = state.combos.find(c => c.id === parseInt(sel.dataset.id));
                if (combo && sel.value) combo.model = sel.value;
            });
        });
        container.querySelectorAll('.ct-combo-model-manual').forEach(input => {
            input.addEventListener('change', () => {
                const combo = state.combos.find(c => c.id === parseInt(input.dataset.id));
                if (combo && input.value.trim()) combo.model = input.value.trim();
            });
        });
        container.querySelectorAll('.ct-combo-preset').forEach(input => {
            input.addEventListener('change', () => {
                const combo = state.combos.find(c => c.id === parseInt(input.dataset.id));
                if (combo) combo.preset = input.value;
            });
        });
        container.querySelectorAll('.ct-combo-sc').forEach(cb => {
            cb.addEventListener('change', () => {
                const combo = state.combos.find(c => c.id === parseInt(cb.dataset.combo));
                const sid = parseInt(cb.dataset.scenario);
                if (combo) {
                    if (cb.checked) {
                        if (!combo.scenarioIds.includes(sid)) combo.scenarioIds.push(sid);
                    } else {
                        combo.scenarioIds = combo.scenarioIds.filter(id => id !== sid);
                    }
                }
            });
        });
    }

    // ========== 场景编辑弹窗 ==========
    function showScenarioModal(existing) {
        const modal = document.createElement('div');
        modal.className = 'ct-modal-overlay';
        modal.innerHTML = `
            <div class="ct-modal">
                <h3>${existing ? '✏️ 编辑场景' : '➕ 添加场景'}</h3>
                <label>场景名称</label>
                <input type="text" id="ct-modal-name" value="${existing ? existing.name : ''}" placeholder="例如：自我介绍">
                <label>测试消息（每行一条 = 多轮对话）</label>
                <textarea id="ct-modal-msgs" placeholder="你好，介绍一下你自己&#10;你的性格是什么样的？">${existing ? existing.messages.join('\n') : ''}</textarea>
                <div class="ct-modal-actions">
                    <button class="ct-btn ct-btn-danger" id="ct-modal-cancel">取消</button>
                    <button class="ct-btn ct-btn-success" id="ct-modal-ok">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('ct-modal-cancel').addEventListener('click', () => modal.remove());
        document.getElementById('ct-modal-ok').addEventListener('click', () => {
            const name = document.getElementById('ct-modal-name').value.trim();
            const msgs = document.getElementById('ct-modal-msgs').value.trim().split('\n').filter(m => m.trim());
            if (!name || !msgs.length) { alert('请填写名称和至少一条消息'); return; }
            if (existing) {
                existing.name = name;
                existing.messages = msgs;
            } else {
                state.scenarios.push({ id: state.nextScenarioId++, name, messages: msgs });
            }
            modal.remove();
            renderScenarios();
            renderCombos();
        });
    }

    document.getElementById('ct-add-scenario').addEventListener('click', () => showScenarioModal(null));

    document.getElementById('ct-add-combo').addEventListener('click', () => {
        state.combos.push({
            id: state.nextComboId++,
            model: stModels[0] || 'gpt-4o',
            preset: '',
            scenarioIds: state.scenarios.map(s => s.id)
        });
        renderCombos();
    });

    // ========== 构建System Prompt ==========
    function buildSystemPrompt(combo) {
        const charIdx = parseInt(document.getElementById('ct-char-select').value);
        const char = stCharacters.find(c => c.index === charIdx);
        let parts = [];

        if (char) {
            if (char.system_prompt) parts.push(char.system_prompt);
            if (char.description) parts.push('角色描述：' + char.description);
            if (char.personality) parts.push('角色性格：' + char.personality);
            if (char.scenario) parts.push('场景设定：' + char.scenario);
            if (char.mes_example) parts.push('对话示例：\n' + char.mes_example);
        }

        if (combo.preset) parts.push(combo.preset);

        return parts.join('\n\n');
    }

    function getFirstMessage() {
        const charIdx = parseInt(document.getElementById('ct-char-select').value);
        const char = stCharacters.find(c => c.index === charIdx);
        return char?.first_mes || '';
    }

    // ========== 发送API请求 ==========
    async function sendRequest(model, systemPrompt, messages) {
        const apiUrl = document.getElementById('ct-api-url').value.trim();
        const apiKey = document.getElementById('ct-api-key').value.trim();

        if (!apiUrl || !apiKey) throw new Error('请填写API地址和Key');

        const apiMessages = [];
        if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
        messages.forEach(m => apiMessages.push(m));

        const isClaude = apiUrl.includes('anthropic') && !apiUrl.includes('openai');

        let url, headers, body;

        if (isClaude) {
            url = apiUrl.replace(/\/+$/, '') + '/v1/messages';
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };
            body = JSON.stringify({
                model, max_tokens: 1024,
                system: systemPrompt || '',
                messages: messages.filter(m => m.role !== 'system')
            });
        } else {
            url = apiUrl.replace(/\/+$/, '');
            if (!url.includes('/chat/completions')) {
                if (url.endsWith('/v1')) {
                    url += '/chat/completions';
                } else {
                    url += '/v1/chat/completions';
                }
            }
            headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            };
            body = JSON.stringify({
                model, messages: apiMessages,
                max_tokens: 1024, temperature: 0.8
            });
        }

        const resp = await fetch(url, { method: 'POST', headers, body });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`API错误(${resp.status}): ${err.substring(0, 150)}`);
        }

        const data = await resp.json();
        if (data.choices?.[0]) return data.choices[0].message.content;
        if (data.content?.[0]) return data.content[0].text;
        throw new Error('无法解析回复');
    }

    // ========== 开始测试 ==========
    document.getElementById('ct-start').addEventListener('click', async () => {
        if (state.testing) return;

        const apiUrl = document.getElementById('ct-api-url').value.trim();
        const apiKey = document.getElementById('ct-api-key').value.trim();
        if (!apiUrl || !apiKey) { alert('⚠️ 请填写API地址和Key'); return; }
        if (!state.combos.length) { alert('⚠️ 请添加至少一个组合'); return; }

        const charIdx = parseInt(document.getElementById('ct-char-select').value);
        if (charIdx === -1) { alert('⚠️ 请选择一个角色卡'); return; }

        state.testing = true;
        const startBtn = document.getElementById('ct-start');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 测试中...';

        const results = document.getElementById('ct-results');
        results.innerHTML = '';

        let total = 0, done = 0;
        state.combos.forEach(c => { total += c.scenarioIds.filter(sid => state.scenarios.find(s => s.id === sid)).length; });

        function updateProg() {
            document.getElementById('ct-progress').style.width = (total > 0 ? done / total * 100 : 0) + '%';
            document.getElementById('ct-status').textContent = `测试中 ${done}/${total}`;
        }

        for (const scenario of state.scenarios) {
            const combos = state.combos.filter(c => c.scenarioIds.includes(scenario.id));
            if (!combos.length) continue;

            const secDiv = document.createElement('div');
            secDiv.className = 'ct-result-scenario';
            secDiv.innerHTML = `
                <div class="ct-result-scenario-title">🎬 ${scenario.name}</div>
                <div class="ct-result-prompt">💬 ${scenario.messages.join(' → ')}</div>
                <div class="ct-result-grid" id="ct-rg-${scenario.id}"></div>
            `;
            results.appendChild(secDiv);

            const grid = secDiv.querySelector('.ct-result-grid');

            combos.forEach(combo => {
                const card = document.createElement('div');
                card.className = 'ct-result-card';
                card.id = `ct-r-${scenario.id}-${combo.id}`;
                card.innerHTML = `
                    <div class="ct-result-card-header">🧩 组合${combo.id} | 🤖 ${combo.model}${combo.preset ? ' | 📋 ' + combo.preset.substring(0, 20) : ''}</div>
                    <div class="ct-result-card-body"><span class="ct-loading">⏳ 请求中...</span></div>
                    <div class="ct-result-card-footer">
                        ${[1,2,3,4,5].map(i => `<button class="ct-star" data-s="${i}">⭐</button>`).join('')}
                    </div>
                `;
                grid.appendChild(card);
            });

            // 并行请求
            const tasks = combos.map(async (combo) => {
                const card = document.getElementById(`ct-r-${scenario.id}-${combo.id}`);
                const body = card.querySelector('.ct-result-card-body');

                try {
                    const sysPrompt = buildSystemPrompt(combo);
                    let convMsgs = [];
                    const firstMes = getFirstMessage();
                    if (firstMes) convMsgs.push({ role: 'assistant', content: firstMes });

                    let allReplies = [];
                    for (const msg of scenario.messages) {
                        convMsgs.push({ role: 'user', content: msg });
                        const reply = await sendRequest(combo.model, sysPrompt, convMsgs);
                        convMsgs.push({ role: 'assistant', content: reply });
                        allReplies.push({ user: msg, reply });
                    }

                    let html = '';
                    allReplies.forEach(r => {
                        if (scenario.messages.length > 1) {
                            html += `<div style="color:#667eea;font-size:11px;margin-bottom:2px;">👤 ${r.user}</div>`;
                        }
                        html += `<div style="margin-bottom:8px;">${r.reply}</div>`;
                    });
                    body.innerHTML = html;

                } catch(err) {
                    body.innerHTML = `<div style="color:#f44336;">❌ ${err.message}</div>`;
                }

                done++;
                updateProg();

                // 星星评分
                card.querySelectorAll('.ct-star').forEach(star => {
                    star.addEventListener('click', () => {
                        const score = parseInt(star.dataset.s);
                        card.querySelectorAll('.ct-star').forEach((s, i) => {
                            s.classList.toggle('active', i < score);
                        });
                    });
                });
            });

            await Promise.all(tasks);
        }

        state.testing = false;
        startBtn.disabled = false;
        startBtn.textContent = '▶ 重新测试';
        document.getElementById('ct-status').textContent = '✅ 测试完成';
        document.getElementById('ct-progress').style.width = '100%';
    });

    // ========== 初始渲染 ==========
    renderScenarios();
    renderCombos();

    console.log('✅ 角色卡测试台插件已加载');
});
