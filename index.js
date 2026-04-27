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

    const mainEl = document.createElement('div');
    mainEl.id = 'card-tester-main';
    document.body.appendChild(mainEl);

    let isOpen = false;

    function togglePanel(open) {
        isOpen = open;
        overlay.classList.toggle('open', open);
        mainEl.classList.toggle('open', open);
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
    let stPresetNames = [];

    async function refreshSTData() {
        try {
            const ctx = SillyTavern.getContext();
            if (ctx.characters) {
                stCharacters = ctx.characters.map((c, i) => ({
                    index: i,
                    name: c.name || 'Unknown',
                    avatar: c.avatar || '',
                    description: c.description || '',
                    personality: c.personality || '',
                    scenario: c.scenario || '',
                    first_mes: c.first_mes || '',
                    mes_example: c.mes_example || '',
                    system_prompt: c.data?.system_prompt || '',
                    post_history_instructions: c.data?.post_history_instructions || '',
                }));
            }
            if (ctx.characterId !== undefined) {
                stCurrentCharId = ctx.characterId;
            }
        } catch (e) {
            console.warn('读取角色失败:', e);
        }

        await loadPresetNames();
        renderCharSelect();
        renderCombos();
    }

    // ========== 读取预设列表 ==========
    async function loadPresetNames() {
        stPresetNames = [];

        try {
            // 直接从酒馆页面的预设下拉框读取
            const presetSelect = document.getElementById('settings_preset_openai');

            if (presetSelect) {
                for (const opt of presetSelect.options) {
                    if (opt.value && opt.value.trim() !== '') {
                        stPresetNames.push({
                            value: opt.value,
                            name: opt.textContent.trim()
                        });
                    }
                }
            }

            // 如果上面没找到，试其他选择器
            if (stPresetNames.length === 0) {
                const otherSelects = [
                    '#settings_preset',
                    '#context_preset'
                ];
                for (const selId of otherSelects) {
                    const sel = document.querySelector(selId);
                    if (sel) {
                        for (const opt of sel.options) {
                            if (opt.value && opt.value.trim() !== '') {
                                stPresetNames.push({
                                    value: opt.value,
                                    name: opt.textContent.trim()
                                });
                            }
                        }
                        if (stPresetNames.length > 0) break;
                    }
                }
            }

        } catch (e) {
            console.warn('读取预设列表失败:', e);
        }

        console.log('预设列表:', stPresetNames);
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
                headers: { 'Authorization': 'Bearer ' + apiKey }
            });
            if (!resp.ok) throw new Error(resp.status);

            const data = await resp.json();
            if (data.data && Array.isArray(data.data)) {
                stModels = data.data.map(m => m.id).sort();
            } else if (Array.isArray(data)) {
                stModels = data.map(m => m.id || m).sort();
            }
            renderCombos();
            return true;
        } catch (e) {
            console.warn('获取模型失败:', e);
            return false;
        }
    }

    // ========== 状态 ==========
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

    // ========== 主界面 ==========
    mainEl.innerHTML = `
        <div class="ct-topbar">
            <h1>🧪 角色卡测试台</h1>
            <div class="ct-topbar-right">
                <span class="ct-status" id="ct-status">就绪</span>
                <button class="ct-close-btn" id="ct-close">✕</button>
            </div>
        </div>
        <div class="ct-body">
            <div class="ct-left">

                <div class="ct-section">
                    <div class="ct-section-title">🔌 API 设置</div>
                    <div class="ct-api-box">
                        <label>API 地址</label>
                        <input type="text" id="ct-api-url" placeholder="https://api.openai.com/v1">
                        <label>API Key</label>
                        <input type="password" id="ct-api-key" placeholder="sk-...">
                        <div style="margin-top:8px;display:flex;gap:6px;align-items:center;">
                            <button class="ct-btn ct-btn-primary" id="ct-fetch-models">🔄 拉取模型</button>
                            <span id="ct-model-status" style="font-size:11px;color:#888;"></span>
                        </div>
                    </div>
                </div>

                <div class="ct-section">
                    <div class="ct-section-title">🎭 角色卡</div>
                    <div class="ct-api-box">
                        <label>选择角色</label>
                        <select id="ct-char-select"><option value="-1">-- 未选择 --</option></select>
                        <div id="ct-char-info" style="font-size:11px;color:#888;margin-top:5px;max-height:50px;overflow:hidden;"></div>
                    </div>
                </div>

                <hr class="ct-divider">

                <div class="ct-section">
                    <div class="ct-section-title">
                        🎬 测试场景
                        <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-add-scenario">➕ 添加</button>
                    </div>
                    <div id="ct-scenario-list"></div>
                </div>

                <hr class="ct-divider">

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
                <div class="ct-section-title" style="display:flex;justify-content:space-between;">
                    📊 测试结果
                    <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-export" style="display:none;">📄 导出</button>
                </div>
                <div id="ct-results">
                    <div class="ct-empty">
                        <p style="font-size:36px;margin-bottom:8px;">🧪</p>
                        <p>配置好场景和组合后，点击「开始测试」</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ========== 自动填充API ==========
    try {
        if (typeof oai_settings !== 'undefined') {
            const urlEl = document.getElementById('ct-api-url');
            if (oai_settings.reverse_proxy) urlEl.value = oai_settings.reverse_proxy;
            else if (oai_settings.custom_url) urlEl.value = oai_settings.custom_url;
        }
    } catch (e) {}

    // ========== 关闭 ==========
    document.getElementById('ct-close').addEventListener('click', () => togglePanel(false));

    // ========== 拉取模型 ==========
    document.getElementById('ct-fetch-models').addEventListener('click', async () => {
        const url = document.getElementById('ct-api-url').value.trim();
        const key = document.getElementById('ct-api-key').value.trim();
        const st = document.getElementById('ct-model-status');
        if (!url || !key) { st.textContent = '❌ 填写地址和Key'; st.style.color = '#f44336'; return; }
        st.textContent = '⏳ 拉取中...'; st.style.color = '#ffa726';
        const ok = await fetchModels(url, key);
        if (ok && stModels.length) { st.textContent = `✅ ${stModels.length} 个模型`; st.style.color = '#4CAF50'; }
        else { st.textContent = '❌ 失败'; st.style.color = '#f44336'; }
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
        const idx = parseInt(document.getElementById('ct-char-select').value);
        const info = document.getElementById('ct-char-info');
        const ch = stCharacters.find(c => c.index === idx);
        info.textContent = ch ? ch.description.substring(0, 80) + (ch.description.length > 80 ? '...' : '') : '';
    }
    document.getElementById('ct-char-select').addEventListener('change', updateCharInfo);

    // ========== 渲染场景 ==========
    function renderScenarios() {
        const box = document.getElementById('ct-scenario-list');
        box.innerHTML = '';
        state.scenarios.forEach(s => {
            const d = document.createElement('div');
            d.className = 'ct-scenario';
            d.innerHTML = `
                <div class="ct-scenario-actions">
                    <button class="ct-btn ct-btn-primary ct-btn-small ct-edit-sc" data-id="${s.id}">✏️</button>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-del-sc" data-id="${s.id}">🗑️</button>
                </div>
                <div class="ct-scenario-name">📌 ${s.name}</div>
                <div class="ct-scenario-msg">${s.messages.join(' → ')}</div>
            `;
            box.appendChild(d);
        });
        box.querySelectorAll('.ct-edit-sc').forEach(b => b.addEventListener('click', () => showScenarioModal(state.scenarios.find(s => s.id === +b.dataset.id))));
        box.querySelectorAll('.ct-del-sc').forEach(b => b.addEventListener('click', () => {
            state.scenarios = state.scenarios.filter(s => s.id !== +b.dataset.id);
            renderScenarios(); renderCombos();
        }));
    }

    // ========== 渲染组合 ==========
    function renderCombos() {
        const box = document.getElementById('ct-combo-list');
        box.innerHTML = '';

        state.combos.forEach(combo => {
            const d = document.createElement('div');
            d.className = 'ct-combo';

            // 模型选项
            let modelOpts = '<option value="">-- 选择模型 --</option>';
            stModels.forEach(m => {
                modelOpts += `<option value="${m}" ${m === combo.model ? 'selected' : ''}>${m}</option>`;
            });
            if (combo.model && !stModels.includes(combo.model)) {
                modelOpts += `<option value="${combo.model}" selected>${combo.model}</option>`;
            }

            // 预设选项 - 直接从酒馆读取的预设名
            let presetOpts = '<option value="">(不使用预设 - 仅角色卡信息)</option>';
            stPresetNames.forEach(p => {
                presetOpts += `<option value="${p.value}" ${p.value === combo.preset ? 'selected' : ''}>${p.name}</option>`;
            });
            presetOpts += '<option value="__custom__">✏️ 自定义输入...</option>';

            // 场景勾选
            let scChecks = state.scenarios.map(s => {
                const ck = combo.scenarioIds.includes(s.id) ? 'checked' : '';
                return `<label class="ct-scenario-check"><input type="checkbox" class="ct-csc" data-combo="${combo.id}" data-sc="${s.id}" ${ck}> ${s.name}</label>`;
            }).join('');

            const showCustom = combo.preset === '__custom__';

            d.innerHTML = `
                <div class="ct-combo-header">
                    <span class="ct-combo-title">🧩 组合 ${combo.id}</span>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-del-combo" data-id="${combo.id}">🗑️</button>
                </div>

                <div class="ct-combo-row">
                    <label>🤖 模型</label>
                    <select class="ct-c-model" data-id="${combo.id}">${modelOpts}</select>
                    <input type="text" class="ct-c-model-input" data-id="${combo.id}" placeholder="或手动输入模型名"
                        style="margin-top:3px;font-size:11px;" value="">
                </div>

                <div class="ct-combo-row">
                    <label>📋 预设</label>
                    <select class="ct-c-preset" data-id="${combo.id}">${presetOpts}</select>
                </div>

                <div class="ct-combo-row ct-c-custom-box" data-id="${combo.id}" style="${showCustom ? '' : 'display:none;'}">
                    <label>✏️ 自定义 System Prompt</label>
                    <textarea class="ct-c-custom-sp" data-id="${combo.id}" rows="3"
                        style="width:100%;padding:6px;background:#0f3460;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:11px;resize:vertical;font-family:inherit;"
                        placeholder="输入自定义 System Prompt...">${combo.customSP || ''}</textarea>
                    <label style="margin-top:3px;">✏️ 自定义 Jailbreak（可选）</label>
                    <textarea class="ct-c-custom-jb" data-id="${combo.id}" rows="2"
                        style="width:100%;padding:6px;background:#0f3460;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:11px;resize:vertical;font-family:inherit;"
                        placeholder="可选...">${combo.customJB || ''}</textarea>
                </div>

                <div class="ct-combo-row">
                    <label>🎬 场景</label>
                    <div class="ct-scenario-checks">${scChecks}</div>
                </div>

                <div class="ct-combo-row">
                    <details style="font-size:11px;color:#888;">
                        <summary style="cursor:pointer;">⚙ 参数调整</summary>
                        <div style="margin-top:5px;display:flex;gap:10px;flex-wrap:wrap;">
                            <div>
                                <label>温度</label>
                                <input type="number" class="ct-c-temp" data-id="${combo.id}" value="${combo.temperature ?? 0.8}" min="0" max="2" step="0.05"
                                    style="width:70px;padding:3px 5px;background:#0f3460;color:#e0e0e0;border:1px solid #444;border-radius:4px;font-size:11px;">
                            </div>
                            <div>
                                <label>最大回复</label>
                                <input type="number" class="ct-c-maxtk" data-id="${combo.id}" value="${combo.maxTokens ?? 1024}" min="100" max="8192" step="100"
                                    style="width:80px;padding:3px 5px;background:#0f3460;color:#e0e0e0;border:1px solid #444;border-radius:4px;font-size:11px;">
                            </div>
                        </div>
                    </details>
                </div>
            `;
            box.appendChild(d);
        });

        bindComboEvents(box);
    }

    function bindComboEvents(box) {
        box.querySelectorAll('.ct-del-combo').forEach(b => b.addEventListener('click', () => {
            state.combos = state.combos.filter(c => c.id !== +b.dataset.id);
            renderCombos();
        }));

        box.querySelectorAll('.ct-c-model').forEach(sel => sel.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +sel.dataset.id);
            if (c && sel.value) c.model = sel.value;
        }));

        box.querySelectorAll('.ct-c-model-input').forEach(inp => inp.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +inp.dataset.id);
            if (c && inp.value.trim()) c.model = inp.value.trim();
        }));

        box.querySelectorAll('.ct-c-preset').forEach(sel => sel.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +sel.dataset.id);
            if (c) {
                c.preset = sel.value;
                const customBox = box.querySelector(`.ct-c-custom-box[data-id="${c.id}"]`);
                if (customBox) customBox.style.display = sel.value === '__custom__' ? '' : 'none';
            }
        }));

        box.querySelectorAll('.ct-c-custom-sp').forEach(ta => ta.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +ta.dataset.id);
            if (c) c.customSP = ta.value;
        }));

        box.querySelectorAll('.ct-c-custom-jb').forEach(ta => ta.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +ta.dataset.id);
            if (c) c.customJB = ta.value;
        }));

        box.querySelectorAll('.ct-c-temp').forEach(inp => inp.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +inp.dataset.id);
            if (c) c.temperature = parseFloat(inp.value) || 0.8;
        }));

        box.querySelectorAll('.ct-c-maxtk').forEach(inp => inp.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +inp.dataset.id);
            if (c) c.maxTokens = parseInt(inp.value) || 1024;
        }));

        box.querySelectorAll('.ct-csc').forEach(cb => cb.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +cb.dataset.combo);
            const sid = +cb.dataset.sc;
            if (c) {
                if (cb.checked) { if (!c.scenarioIds.includes(sid)) c.scenarioIds.push(sid); }
                else { c.scenarioIds = c.scenarioIds.filter(id => id !== sid); }
            }
        }));
    }

    // ========== 添加组合 ==========
    document.getElementById('ct-add-combo').addEventListener('click', () => {
        state.combos.push({
            id: state.nextComboId++,
            model: stModels[0] || 'gpt-4o',
            preset: '',
            customSP: '',
            customJB: '',
            temperature: 0.8,
            maxTokens: 1024,
            scenarioIds: state.scenarios.map(s => s.id)
        });
        renderCombos();
    });

    // ========== 场景弹窗 ==========
    function showScenarioModal(existing) {
        const m = document.createElement('div');
        m.className = 'ct-modal-overlay';
        m.innerHTML = `
            <div class="ct-modal">
                <h3>${existing ? '✏️ 编辑场景' : '➕ 添加场景'}</h3>
                <label>场景名称</label>
                <input type="text" id="ct-m-name" value="${existing ? existing.name : ''}" placeholder="例如：自我介绍">
                <label>测试消息（每行一条 = 多轮对话）</label>
                <textarea id="ct-m-msgs" placeholder="你好，介绍一下你自己">${existing ? existing.messages.join('\n') : ''}</textarea>
                <div class="ct-modal-actions">
                    <button class="ct-btn ct-btn-danger" id="ct-m-cancel">取消</button>
                    <button class="ct-btn ct-btn-success" id="ct-m-ok">确认</button>
                </div>
            </div>
        `;
        document.body.appendChild(m);
        document.getElementById('ct-m-cancel').addEventListener('click', () => m.remove());
        document.getElementById('ct-m-ok').addEventListener('click', () => {
            const name = document.getElementById('ct-m-name').value.trim();
            const msgs = document.getElementById('ct-m-msgs').value.trim().split('\n').filter(x => x.trim());
            if (!name || !msgs.length) { alert('请填写名称和消息'); return; }
            if (existing) { existing.name = name; existing.messages = msgs; }
            else { state.scenarios.push({ id: state.nextScenarioId++, name, messages: msgs }); }
            m.remove();
            renderScenarios();
            renderCombos();
        });
    }
    document.getElementById('ct-add-scenario').addEventListener('click', () => showScenarioModal(null));

    // ========== 构建 System Prompt ==========
    async function buildSystemPrompt(combo) {
        let parts = [];

        // 如果选了酒馆预设，加载预设内容
        if (combo.preset && combo.preset !== '__custom__' && combo.preset !== '') {
            try {
                // 尝试多个API路径
                const endpoints = [
                    '/api/presets/openai/' + encodeURIComponent(combo.preset),
                    '/api/presets/textgenerationwebui/' + encodeURIComponent(combo.preset)
                ];
                for (const ep of endpoints) {
                    try {
                        const resp = await fetch(ep);
                        if (resp.ok) {
                            const pData = await resp.json();
                            const mainPrompt = pData.gaslight || pData.system_prompt || pData.main_prompt || '';
                            const jb = pData.jailbreak_prompt || pData.nsfw_prompt || '';
                            if (mainPrompt) parts.push(mainPrompt);
                            if (jb) parts.push(jb);
                            break;
                        }
                    } catch (e2) {}
                }
            } catch (e) {
                console.warn('加载预设内容失败:', e);
            }
        }

        // 自定义预设
        if (combo.preset === '__custom__') {
            if (combo.customSP) parts.push(combo.customSP);
            if (combo.customJB) parts.push(combo.customJB);
        }

        // 角色卡信息
        const charIdx = parseInt(document.getElementById('ct-char-select').value);
        const char = stCharacters.find(c => c.index === charIdx);
        if (char) {
            if (char.system_prompt) parts.push(char.system_prompt);
            if (char.description) parts.push('角色描述：\n' + char.description);
            if (char.personality) parts.push('角色性格：' + char.personality);
            if (char.scenario) parts.push('场景设定：' + char.scenario);
            if (char.mes_example) parts.push('对话示例：\n' + char.mes_example);
            if (char.post_history_instructions) parts.push(char.post_history_instructions);
        }

        return parts.join('\n\n');
    }

    function getFirstMessage() {
        const charIdx = parseInt(document.getElementById('ct-char-select').value);
        const char = stCharacters.find(c => c.index === charIdx);
        return char?.first_mes || '';
    }

    // ========== API请求 ==========
    async function sendRequest(model, systemPrompt, messages, temperature, maxTokens) {
        const apiUrl = document.getElementById('ct-api-url').value.trim();
        const apiKey = document.getElementById('ct-api-key').value.trim();
        if (!apiUrl || !apiKey) throw new Error('请填写API地址和Key');

        const apiMessages = [];
        if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });
        messages.forEach(m => apiMessages.push(m));

        const isClaude = apiUrl.includes('anthropic') && !apiUrl.includes('openai');

        let url, headers, body;

        if (isClaude) {
            url = apiUrl.replace(/\/+$/, '');
            if (!url.includes('/v1/messages')) url += '/v1/messages';
            headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
            body = JSON.stringify({
                model, max_tokens: maxTokens || 1024,
                system: systemPrompt || '',
                messages: messages.filter(m => m.role !== 'system')
            });
        } else {
            url = apiUrl.replace(/\/+$/, '');
            if (!url.includes('/chat/completions')) {
                url += url.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
            }
            headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
            body = JSON.stringify({
                model, messages: apiMessages,
                max_tokens: maxTokens || 1024,
                temperature: temperature ?? 0.8
            });
        }

        const resp = await fetch(url, { method: 'POST', headers, body });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`(${resp.status}) ${err.substring(0, 150)}`);
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
        if (parseInt(document.getElementById('ct-char-select').value) === -1) { alert('⚠️ 请选择角色卡'); return; }

        state.testing = true;
        const btn = document.getElementById('ct-start');
        btn.disabled = true; btn.textContent = '⏳ 测试中...';

        const results = document.getElementById('ct-results');
        results.innerHTML = '';
        document.getElementById('ct-export').style.display = 'none';

        let total = 0, done = 0;
        state.combos.forEach(c => { total += c.scenarioIds.filter(sid => state.scenarios.find(s => s.id === sid)).length; });

        function updateProg() {
            document.getElementById('ct-progress').style.width = (total > 0 ? done / total * 100 : 0) + '%';
            document.getElementById('ct-status').textContent = `${done}/${total}`;
        }

        const allResults = [];

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
                const presetLabel = combo.preset === '__custom__' ? '自定义' :
                    (combo.preset ? stPresetNames.find(p => p.value === combo.preset)?.name || combo.preset : '无预设');
                const card = document.createElement('div');
                card.className = 'ct-result-card';
                card.id = `ct-r-${scenario.id}-${combo.id}`;
                card.innerHTML = `
                    <div class="ct-result-card-header">🧩 组合${combo.id} | 🤖 ${combo.model} | 📋 ${presetLabel}</div>
                    <div class="ct-result-card-body"><span class="ct-loading">⏳ 请求中...</span></div>
                    <div class="ct-result-card-footer">
                        ${[1,2,3,4,5].map(i => `<button class="ct-star" data-s="${i}">⭐</button>`).join('')}
                        <span style="margin-left:auto;font-size:11px;color:#666;" class="ct-r-time"></span>
                    </div>
                `;
                grid.appendChild(card);
            });

            const tasks = combos.map(async (combo) => {
                const card = document.getElementById(`ct-r-${scenario.id}-${combo.id}`);
                const body = card.querySelector('.ct-result-card-body');
                const timeEl = card.querySelector('.ct-r-time');
                const startTime = Date.now();

                try {
                    const sysPrompt = await buildSystemPrompt(combo);
                    let convMsgs = [];
                    const firstMes = getFirstMessage();
                    if (firstMes) convMsgs.push({ role: 'assistant', content: firstMes });

                    let allReplies = [];
                    for (const msg of scenario.messages) {
                        convMsgs.push({ role: 'user', content: msg });
                        const reply = await sendRequest(combo.model, sysPrompt, convMsgs, combo.temperature, combo.maxTokens);
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

                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    timeEl.textContent = elapsed + 's';

                    allResults.push({
                        scenario: scenario.name,
                        combo: `组合${combo.id}`,
                        model: combo.model,
                        preset: combo.preset || '无',
                        replies: allReplies
                    });

                } catch (err) {
                    body.innerHTML = `<div style="color:#f44336;">❌ ${err.message}</div>`;
                    timeEl.textContent = '失败';
                }

                done++;
                updateProg();

                card.querySelectorAll('.ct-star').forEach(star => {
                    star.addEventListener('click', () => {
                        const score = +star.dataset.s;
                        card.querySelectorAll('.ct-star').forEach((s, i) => s.classList.toggle('active', i < score));
                    });
                });
            });

            await Promise.all(tasks);
        }

        state.testing = false;
        btn.disabled = false;
        btn.textContent = '▶ 重新测试';
        document.getElementById('ct-status').textContent = '✅ 完成';
        document.getElementById('ct-progress').style.width = '100%';

        const exportBtn = document.getElementById('ct-export');
        exportBtn.style.display = '';
        exportBtn.onclick = () => {
            let text = '=== 角色卡测试报告 ===\n日期: ' + new Date().toLocaleString() + '\n\n';
            allResults.forEach(r => {
                text += `【场景】${r.scenario}\n【组合】${r.combo} | 模型: ${r.model} | 预设: ${r.preset}\n`;
                r.replies.forEach(rp => {
                    text += `\n👤 ${rp.user}\n🤖 ${rp.reply}\n`;
                });
                text += '\n' + '='.repeat(50) + '\n\n';
            });
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = '角色卡测试报告_' + new Date().toISOString().slice(0, 10) + '.txt';
            a.click();
        };
    });

    // ========== 初始渲染 ==========
    renderScenarios();

    console.log('✅ 角色卡测试台已加载');
});
