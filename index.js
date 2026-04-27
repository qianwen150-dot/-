jQuery(async () => {

    // ========== 创建UI元素 ==========
    const launcher = document.createElement('div');
    launcher.id = 'card-tester-launcher';
    launcher.textContent = '🧪';
    launcher.title = '角色卡测试台';
    document.body.appendChild(launcher);

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
    let stPresetNames = [];
    let stModelList = [];

    // 保存原始设置（用于测试完恢复）
    let originalPreset = '';
    let originalModel = '';

    async function refreshSTData() {
        try {
            const ctx = SillyTavern.getContext();
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
                    alternate_greetings: c.data?.alternate_greetings || [],
                }));
            }
            if (ctx.characterId !== undefined) {
                stCurrentCharId = ctx.characterId;
            }
        } catch (e) {
            console.warn('读取角色失败:', e);
        }

        // 读取预设列表
        stPresetNames = [];
        try {
            const presetSelect = document.getElementById('settings_preset_openai');
            if (presetSelect) {
                originalPreset = presetSelect.value;
                for (const opt of presetSelect.options) {
                    if (opt.value && opt.value.trim() !== '') {
                        stPresetNames.push({ value: opt.value, name: opt.textContent.trim() });
                    }
                }
            }
            if (stPresetNames.length === 0) {
                const sel = document.getElementById('settings_preset');
                if (sel) {
                    originalPreset = sel.value;
                    for (const opt of sel.options) {
                        if (opt.value && opt.value.trim() !== '') {
                            stPresetNames.push({ value: opt.value, name: opt.textContent.trim() });
                        }
                    }
                }
            }
        } catch (e) {}

        // 读取模型列表
        stModelList = [];
        try {
            const modelSelect = document.getElementById('model_openai_select');
            if (modelSelect) {
                originalModel = modelSelect.value;
                for (const opt of modelSelect.options) {
                    if (opt.value && opt.value.trim() !== '') {
                        stModelList.push({ value: opt.value, name: opt.textContent.trim() });
                    }
                }
            }
            // 备选：从其他可能的模型下拉读取
            if (stModelList.length === 0) {
                const selectors = ['#model_select', '#openai_model', 'select[name="model"]'];
                for (const selId of selectors) {
                    const sel = document.querySelector(selId);
                    if (sel && sel.options.length > 1) {
                        originalModel = sel.value;
                        for (const opt of sel.options) {
                            if (opt.value && opt.value.trim() !== '') {
                                stModelList.push({ value: opt.value, name: opt.textContent.trim() });
                            }
                        }
                        break;
                    }
                }
            }
        } catch (e) {}

        console.log('预设:', stPresetNames.length, '模型:', stModelList.length, '角色:', stCharacters.length);

        renderCharSelect();
        renderCombos();
    }

    // ========== 切换酒馆预设 ==========
    async function switchPreset(presetValue) {
        const presetSelect = document.getElementById('settings_preset_openai') || document.getElementById('settings_preset');
        if (presetSelect && presetValue) {
            presetSelect.value = presetValue;
            presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            // 等待预设加载
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // ========== 切换酒馆模型 ==========
    async function switchModel(modelValue) {
        const modelSelect = document.getElementById('model_openai_select') || document.getElementById('model_select');
        if (modelSelect && modelValue) {
            modelSelect.value = modelValue;
            modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // ========== 恢复原始设置 ==========
    async function restoreSettings() {
        if (originalPreset) await switchPreset(originalPreset);
        if (originalModel) await switchModel(originalModel);
    }

    // ========== 通过酒馆发送消息并获取回复 ==========
    async function generateViaSTAPI(userMessage, greetingText) {
        try {
            const ctx = SillyTavern.getContext();

            // 方法1：使用 generateQuietPrompt（不会写入聊天记录）
            if (typeof generateQuietPrompt === 'function') {
                const result = await generateQuietPrompt(userMessage, false, false);
                return result;
            }

            // 方法2：使用 context 的 generate
            if (ctx.generate) {
                const result = await ctx.generate(userMessage, {});
                return result;
            }

            // 方法3：使用 generateRaw
            if (typeof generateRaw === 'function') {
                const result = await generateRaw(userMessage);
                return result;
            }

            throw new Error('找不到可用的生成函数');

        } catch (e) {
            console.error('生成失败:', e);
            throw e;
        }
    }

    // ========== 获取开场白列表 ==========
    function getGreetings() {
        const charIdx = parseInt(document.getElementById('ct-char-select')?.value ?? -1);
        const char = stCharacters.find(c => c.index === charIdx);
        if (!char) return [];
        const list = [];
        if (char.first_mes) {
            list.push({ index: 0, label: '主开场白', content: char.first_mes });
        }
        if (char.alternate_greetings) {
            char.alternate_greetings.forEach((g, i) => {
                if (g && g.trim()) {
                    list.push({ index: i + 1, label: '备选开场白 ' + (i + 1), content: g });
                }
            });
        }
        return list;
    }

    function updateGreetingSelect() {
        const greetingSel = document.getElementById('ct-greeting-select');
        const preview = document.getElementById('ct-greeting-preview');
        const greetings = getGreetings();

        greetingSel.innerHTML = '';
        if (greetings.length === 0) {
            greetingSel.innerHTML = '<option value="-1">该角色没有开场白</option>';
            preview.style.display = 'none';
            return;
        }

        greetings.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.index;
            opt.textContent = g.label + ' - ' + g.content.substring(0, 30) + '...';
            greetingSel.appendChild(opt);
        });

        updateGreetingPreview();
    }

    function updateGreetingPreview() {
        const greetingSel = document.getElementById('ct-greeting-select');
        const preview = document.getElementById('ct-greeting-preview');
        const greetings = getGreetings();
        const selected = greetings.find(g => g.index === parseInt(greetingSel.value));

        if (selected) {
            preview.textContent = selected.content.substring(0, 200) + (selected.content.length > 200 ? '...' : '');
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
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
            <h1>🧪 角色卡测试台 v2</h1>
            <div class="ct-topbar-right">
                <span class="ct-status" id="ct-status">就绪</span>
                <button class="ct-close-btn" id="ct-close">✕</button>
            </div>
        </div>
        <div class="ct-body">
            <div class="ct-left">

                <div class="ct-warning">
                    ⚠️ 测试时会临时切换酒馆的预设和模型设置，测试完成后会自动恢复。测试期间请不要操作酒馆主界面。
                </div>

                <div class="ct-section">
                    <div class="ct-section-title">🎭 角色卡 & 开场白</div>
                    <div class="ct-api-box">
                        <label>选择角色</label>
                        <select id="ct-char-select"><option value="-1">-- 未选择 --</option></select>
                        <div id="ct-char-info" style="font-size:11px;color:#888;margin-top:5px;max-height:40px;overflow:hidden;"></div>

                        <label style="margin-top:8px;">💬 开场白</label>
                        <select id="ct-greeting-select"><option value="-1">-- 请先选择角色 --</option></select>
                        <div id="ct-greeting-preview" class="ct-greeting-preview" style="display:none;"></div>
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
                        🧩 测试组合（每组可选不同的预设+模型）
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
                    <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-export" style="display:none;">📄 导出报告</button>
                </div>
                <div id="ct-results">
                    <div class="ct-empty">
                        <p style="font-size:36px;margin-bottom:8px;">🧪</p>
                        <p>配置好场景和组合后，点击「开始测试」</p>
                        <p style="margin-top:4px;font-size:11px;color:#444;">使用酒馆内部接口发送，预设效果100%还原</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ========== 关闭 ==========
    document.getElementById('ct-close').addEventListener('click', () => togglePanel(false));

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
        updateGreetingSelect();
    }

    function updateCharInfo() {
        const idx = parseInt(document.getElementById('ct-char-select').value);
        const info = document.getElementById('ct-char-info');
        const ch = stCharacters.find(c => c.index === idx);
        info.textContent = ch ? ch.description.substring(0, 80) + (ch.description.length > 80 ? '...' : '') : '';
    }

    document.getElementById('ct-char-select').addEventListener('change', () => {
        updateCharInfo();
        updateGreetingSelect();
        renderCombos();
    });

    document.getElementById('ct-greeting-select').addEventListener('change', updateGreetingPreview);

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
        box.querySelectorAll('.ct-edit-sc').forEach(b => b.addEventListener('click', () =>
            showScenarioModal(state.scenarios.find(s => s.id === +b.dataset.id))));
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

            // 模型选项 - 从酒馆下拉读取
            let modelOpts = '<option value="">(使用当前模型)</option>';
            stModelList.forEach(m => {
                modelOpts += `<option value="${m.value}" ${m.value === combo.model ? 'selected' : ''}>${m.name}</option>`;
            });

            // 预设选项 - 从酒馆下拉读取
            let presetOpts = '<option value="">(使用当前预设)</option>';
            stPresetNames.forEach(p => {
                presetOpts += `<option value="${p.value}" ${p.value === combo.preset ? 'selected' : ''}>${p.name}</option>`;
            });

            // 开场白选项
            const greetings = getGreetings();
            let greetingOpts = '<option value="-2">(使用左侧选择的开场白)</option>';
            greetings.forEach(g => {
                greetingOpts += `<option value="${g.index}" ${g.index === combo.greetingIndex ? 'selected' : ''}>${g.label}</option>`;
            });

            // 场景勾选
            let scChecks = state.scenarios.map(s => {
                const ck = combo.scenarioIds.includes(s.id) ? 'checked' : '';
                return `<label class="ct-scenario-check"><input type="checkbox" class="ct-csc" data-combo="${combo.id}" data-sc="${s.id}" ${ck}> ${s.name}</label>`;
            }).join('');

            d.innerHTML = `
                <div class="ct-combo-header">
                    <span class="ct-combo-title">🧩 组合 ${combo.id}</span>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-del-combo" data-id="${combo.id}">🗑️</button>
                </div>

                <div class="ct-combo-row">
                    <label>🤖 模型</label>
                    <select class="ct-c-model" data-id="${combo.id}">${modelOpts}</select>
                </div>

                <div class="ct-combo-row">
                    <label>📋 预设</label>
                    <select class="ct-c-preset" data-id="${combo.id}">${presetOpts}</select>
                </div>

                <div class="ct-combo-row">
                    <label>💬 开场白</label>
                    <select class="ct-c-greeting" data-id="${combo.id}">${greetingOpts}</select>
                </div>

                <div class="ct-combo-row">
                    <label>🎬 场景</label>
                    <div class="ct-scenario-checks">${scChecks}</div>
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
            if (c) c.model = sel.value;
        }));
        box.querySelectorAll('.ct-c-preset').forEach(sel => sel.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +sel.dataset.id);
            if (c) c.preset = sel.value;
        }));
        box.querySelectorAll('.ct-c-greeting').forEach(sel => sel.addEventListener('change', () => {
            const c = state.combos.find(x => x.id === +sel.dataset.id);
            if (c) c.greetingIndex = parseInt(sel.value);
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
            model: '',
            preset: '',
            greetingIndex: -2,
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
            renderScenarios(); renderCombos();
        });
    }
    document.getElementById('ct-add-scenario').addEventListener('click', () => showScenarioModal(null));

    // ========== 获取选中的开场白内容 ==========
    function getSelectedGreeting(combo) {
        const greetings = getGreetings();
        let gIdx = combo.greetingIndex;

        // 如果是 -2 则用左侧全局选择
        if (gIdx === -2 || gIdx === undefined) {
            gIdx = parseInt(document.getElementById('ct-greeting-select').value);
        }

        const g = greetings.find(x => x.index === gIdx);
        return g ? g.content : (greetings[0]?.content || '');
    }

    // ========== 开始测试（核心逻辑） ==========
    document.getElementById('ct-start').addEventListener('click', async () => {
        if (state.testing) return;

        if (!state.combos.length) { alert('⚠️ 请添加至少一个组合'); return; }
        if (parseInt(document.getElementById('ct-char-select').value) === -1) { alert('⚠️ 请选择角色卡'); return; }

        state.testing = true;
        const btn = document.getElementById('ct-start');
        btn.disabled = true; btn.textContent = '⏳ 测试中...请勿操作酒馆';

        const results = document.getElementById('ct-results');
        results.innerHTML = '';
        document.getElementById('ct-export').style.display = 'none';

        // 保存当前设置
        const presetSel = document.getElementById('settings_preset_openai') || document.getElementById('settings_preset');
        const modelSel = document.getElementById('model_openai_select') || document.getElementById('model_select');
        originalPreset = presetSel?.value || '';
        originalModel = modelSel?.value || '';

        let total = 0, done = 0;
        state.combos.forEach(c => { total += c.scenarioIds.filter(sid => state.scenarios.find(s => s.id === sid)).length; });

        function updateProg() {
            document.getElementById('ct-progress').style.width = (total > 0 ? done / total * 100 : 0) + '%';
            document.getElementById('ct-status').textContent = `测试中 ${done}/${total}`;
        }

        const allResults = [];

        // 逐个组合、逐个场景测试（因为需要切换设置，不能并行）
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

            // 先创建所有卡片
            combos.forEach(combo => {
                const presetLabel = combo.preset ? stPresetNames.find(p => p.value === combo.preset)?.name || combo.preset : '当前预设';
                const modelLabel = combo.model ? stModelList.find(m => m.value === combo.model)?.name || combo.model : '当前模型';
                const greeting = getSelectedGreeting(combo);
                const greetingShort = greeting.substring(0, 20) + '...';

                const card = document.createElement('div');
                card.className = 'ct-result-card';
                card.id = `ct-r-${scenario.id}-${combo.id}`;
                card.innerHTML = `
                    <div class="ct-result-card-header">🧩 组合${combo.id} | 🤖 ${modelLabel} | 📋 ${presetLabel} | 💬 ${greetingShort}</div>
                    <div class="ct-result-card-body"><span class="ct-loading">⏳ 等待中...</span></div>
                    <div class="ct-result-card-footer">
                        ${[1,2,3,4,5].map(i => `<button class="ct-star" data-s="${i}">⭐</button>`).join('')}
                        <span style="margin-left:auto;font-size:11px;color:#666;" class="ct-r-time"></span>
                    </div>
                `;
                grid.appendChild(card);
            });

            // 逐个组合执行
            for (const combo of combos) {
                const card = document.getElementById(`ct-r-${scenario.id}-${combo.id}`);
                const body = card.querySelector('.ct-result-card-body');
                const timeEl = card.querySelector('.ct-r-time');
                body.innerHTML = '<span class="ct-loading">⏳ 请求中...</span>';

                const startTime = Date.now();

                try {
                    // 切换预设
                    if (combo.preset) await switchPreset(combo.preset);
                    // 切换模型
                    if (combo.model) await switchModel(combo.model);

                    // 等一下让设置生效
                    await new Promise(r => setTimeout(r, 300));

                    // 逐轮发送
                    let allReplies = [];
                    for (const msg of scenario.messages) {
                        const reply = await generateViaSTAPI(msg, getSelectedGreeting(combo));
                        allReplies.push({ user: msg, reply: reply || '(空回复)' });
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
                        scenario: scenario.name, combo: `组合${combo.id}`,
                        model: combo.model || '当前', preset: combo.preset || '当前',
                        replies: allReplies
                    });

                } catch (err) {
                    body.innerHTML = `<div style="color:#f44336;">❌ ${err.message}</div>`;
                    timeEl.textContent = '失败';
                }

                done++;
                updateProg();

                // 星星评分
                card.querySelectorAll('.ct-star').forEach(star => {
                    star.addEventListener('click', () => {
                        const score = +star.dataset.s;
                        card.querySelectorAll('.ct-star').forEach((s, i) => s.classList.toggle('active', i < score));
                    });
                });
            }
        }

        // 恢复原始设置
        await restoreSettings();

        state.testing = false;
        btn.disabled = false;
        btn.textContent = '▶ 重新测试';
        document.getElementById('ct-status').textContent = '✅ 完成（设置已恢复）';
        document.getElementById('ct-progress').style.width = '100%';

        // 导出
        const exportBtn = document.getElementById('ct-export');
        exportBtn.style.display = '';
        exportBtn.onclick = () => {
            let text = '=== 角色卡测试报告 ===\n日期: ' + new Date().toLocaleString() + '\n\n';
            allResults.forEach(r => {
                text += `【场景】${r.scenario}\n【组合】${r.combo} | 模型: ${r.model} | 预设: ${r.preset}\n`;
                r.replies.forEach(rp => { text += `\n👤 ${rp.user}\n🤖 ${rp.reply}\n`; });
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
    console.log('✅ 角色卡测试台 v2 已加载');
});
