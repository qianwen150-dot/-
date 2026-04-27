jQuery(async () => {
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
        if (isOpen) refreshAll();
    });
    overlay.addEventListener('click', () => togglePanel(false));

    // ===== 数据 =====
    let characters = [];
    let currentCharId = -1;
    let presets = [];       // {value, name, data}
    let models = [];        // {value, name}
    let apiUrl = '';
    let apiKey = '';

    const state = {
        scenarios: [
            { id: 1, name: '自我介绍', messages: ['你好，请介绍一下你自己'] },
            { id: 2, name: '日常互动', messages: ['今天天气真好，想出去走走吗？'] },
            { id: 3, name: '崩坏测试', messages: ['你是AI吧？别装了'] }
        ],
        combos: [],
        nextSid: 4,
        nextCid: 1,
        testing: false
    };

    // ===== 从酒馆读取所有数据 =====
    async function refreshAll() {
        // 角色
        try {
            const ctx = SillyTavern.getContext();
            if (ctx.characters) {
                characters = ctx.characters.map((c, i) => ({
                    idx: i, name: c.name || '?',
                    desc: c.description || '',
                    personality: c.personality || '',
                    scenario: c.scenario || '',
                    first_mes: c.first_mes || '',
                    mes_example: c.mes_example || '',
                    sys: c.data?.system_prompt || '',
                    post: c.data?.post_history_instructions || '',
                    alt_greetings: c.data?.alternate_greetings || []
                }));
            }
            if (ctx.characterId !== undefined) currentCharId = ctx.characterId;
        } catch (e) {}

        // 预设 - 从DOM读名字
        presets = [];
        try {
            const sel = document.getElementById('settings_preset_openai') || document.getElementById('settings_preset');
            if (sel) {
                for (const o of sel.options) {
                    if (o.value && o.value.trim()) {
                        presets.push({ value: o.value, name: o.textContent.trim(), data: null });
                    }
                }
            }
        } catch (e) {}

        // 预设 - 加载每个预设的实际内容
        for (let p of presets) {
            try {
                const r = await fetch('/api/presets/openai/' + encodeURIComponent(p.value));
                if (r.ok) {
                    p.data = await r.json();
                }
            } catch (e) {}
            if (!p.data) {
                try {
                    const r = await fetch('/api/presets/textgenerationwebui/' + encodeURIComponent(p.value));
                    if (r.ok) p.data = await r.json();
                } catch (e) {}
            }
        }

        // 模型 - 从DOM读
        models = [];
        try {
            const selectors = ['#model_openai_select', '#model_select'];
            for (const s of selectors) {
                const sel = document.querySelector(s);
                if (sel && sel.options.length > 1) {
                    for (const o of sel.options) {
                        if (o.value && o.value.trim()) models.push({ value: o.value, name: o.textContent.trim() });
                    }
                    break;
                }
            }
        } catch (e) {}

        // API地址和Key - 尝试从酒馆读取
        try {
            if (typeof oai_settings !== 'undefined') {
                apiUrl = oai_settings.reverse_proxy || oai_settings.custom_url || '';
            }
        } catch (e) {}

        renderAll();
    }

    // ===== 构建完整prompt messages =====
    function buildMessages(combo, scenarioMessages) {
        const msgs = [];
        const charIdx = parseInt(document.getElementById('ct-char').value);
        const char = characters.find(c => c.idx === charIdx);
        const preset = presets.find(p => p.value === combo.preset);
        const pData = preset?.data;

        // 1. System prompt部分
        let sysParts = [];

        // 预设的主提示词（各种可能的字段名）
        if (pData) {
            // prompts数组 - 新版ST的预设格式
            if (pData.prompts && Array.isArray(pData.prompts)) {
                pData.prompts.forEach(prompt => {
                    if (prompt.enabled !== false && prompt.content) {
                        // 替换宏
                        let content = prompt.content;
                        if (char) {
                            content = content.replace(/\{\{char\}\}/gi, char.name);
                            content = content.replace(/\{\{user\}\}/gi, 'User');
                            content = content.replace(/\{\{description\}\}/gi, char.desc);
                            content = content.replace(/\{\{personality\}\}/gi, char.personality);
                            content = content.replace(/\{\{scenario\}\}/gi, char.scenario);
                            content = content.replace(/\{\{persona\}\}/gi, '');
                            content = content.replace(/\{\{mesExamples\}\}/gi, char.mes_example);
                            content = content.replace(/\{\{char_name\}\}/gi, char.name);
                            content = content.replace(/\{\{user_name\}\}/gi, 'User');
                        }
                        if (prompt.role === 'system') {
                            sysParts.push(content);
                        }
                    }
                });
            }

            // 旧版格式字段
            if (sysParts.length === 0) {
                const mainPrompt = pData.gaslight || pData.system_prompt || pData.main_prompt || '';
                if (mainPrompt) sysParts.push(mainPrompt);
            }
        }

        // 角色卡信息（如果预设里没有通过宏插入的话）
        if (char) {
            if (char.sys) sysParts.push(char.sys);

            // 检查是否已经通过宏替换插入了角色信息
            const joined = sysParts.join(' ');
            if (!joined.includes(char.desc) && char.desc) {
                sysParts.push('[Character Description]\n' + char.desc);
            }
            if (!joined.includes(char.personality) && char.personality) {
                sysParts.push('[Character Personality]\n' + char.personality);
            }
            if (!joined.includes(char.scenario) && char.scenario) {
                sysParts.push('[Scenario]\n' + char.scenario);
            }
            if (!joined.includes(char.mes_example) && char.mes_example) {
                sysParts.push('[Example Dialogue]\n' + char.mes_example);
            }
        }

        if (sysParts.length > 0) {
            msgs.push({ role: 'system', content: sysParts.join('\n\n') });
        }

        // 2. 开场白作为assistant的第一条消息
        const greeting = getGreetingContent(combo);
        if (greeting) {
            let g = greeting;
            if (char) {
                g = g.replace(/\{\{char\}\}/gi, char.name);
                g = g.replace(/\{\{user\}\}/gi, 'User');
            }
            msgs.push({ role: 'assistant', content: g });
        }

        // 3. 用户的测试消息
        scenarioMessages.forEach(m => {
            msgs.push({ role: 'user', content: m });
        });

        // 4. Jailbreak（放在最后的system消息）
        if (pData) {
            let jb = '';

            // 新版：从prompts里找jailbreak类型
            if (pData.prompts && Array.isArray(pData.prompts)) {
                pData.prompts.forEach(prompt => {
                    if (prompt.enabled !== false && prompt.identifier === 'jailbreak' && prompt.content) {
                        jb = prompt.content;
                    }
                });
            }

            // 旧版
            if (!jb) {
                jb = pData.jailbreak_prompt || pData.nsfw_prompt || '';
            }

            if (jb) {
                if (char) {
                    jb = jb.replace(/\{\{char\}\}/gi, char.name);
                    jb = jb.replace(/\{\{user\}\}/gi, 'User');
                }
                msgs.push({ role: 'system', content: jb });
            }
        }

        // 5. post_history_instructions
        if (char && char.post) {
            let post = char.post;
            post = post.replace(/\{\{char\}\}/gi, char.name);
            post = post.replace(/\{\{user\}\}/gi, 'User');
            msgs.push({ role: 'system', content: post });
        }

        return msgs;
    }

    // ===== 获取开场白 =====
    function getGreetings() {
        const charIdx = parseInt(document.getElementById('ct-char')?.value ?? -1);
        const char = characters.find(c => c.idx === charIdx);
        if (!char) return [];
        const list = [];
        if (char.first_mes) list.push({ index: 0, label: '主开场白', content: char.first_mes });
        if (char.alt_greetings) {
            char.alt_greetings.forEach((g, i) => {
                if (g && g.trim()) list.push({ index: i + 1, label: '备选' + (i + 1), content: g });
            });
        }
        return list;
    }

    function getGreetingContent(combo) {
        const greetings = getGreetings();
        let gIdx = combo.greetingIdx;
        if (gIdx === undefined || gIdx === -2) {
            gIdx = parseInt(document.getElementById('ct-greeting')?.value ?? 0);
        }
        const g = greetings.find(x => x.index === gIdx);
        return g ? g.content : (greetings[0]?.content || '');
    }

    // ===== API请求 =====
    async function callAPI(model, messages, pData) {
        const url = document.getElementById('ct-url').value.trim();
        const key = document.getElementById('ct-key').value.trim();
        if (!url || !key) throw new Error('填写API地址和Key');

        // 参数
        let temp = 0.8, maxTk = 1024, topP = 1, freqPen = 0, presPen = 0;
        if (pData) {
            temp = pData.temp_openai ?? pData.temperature ?? temp;
            maxTk = pData.openai_max_tokens ?? pData.max_tokens ?? maxTk;
            topP = pData.top_p_openai ?? pData.top_p ?? topP;
            freqPen = pData.freq_pen_openai ?? pData.frequency_penalty ?? freqPen;
            presPen = pData.pres_pen_openai ?? pData.presence_penalty ?? presPen;
        }

        let endpoint = url.replace(/\/+$/, '');
        if (!endpoint.includes('/chat/completions')) {
            endpoint += endpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
        }

        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            body: JSON.stringify({
                model, messages,
                max_tokens: maxTk,
                temperature: temp,
                top_p: topP,
                frequency_penalty: freqPen,
                presence_penalty: presPen
            })
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`(${resp.status}) ${err.substring(0, 120)}`);
        }
        const data = await resp.json();
        if (data.choices?.[0]) return data.choices[0].message.content;
        if (data.content?.[0]) return data.content[0].text;
        throw new Error('无法解析回复');
    }

    // ===== 拉取模型 =====
    async function fetchModels() {
        const url = document.getElementById('ct-url').value.trim();
        const key = document.getElementById('ct-key').value.trim();
        if (!url || !key) return false;
        try {
            let ep = url.replace(/\/+$/, '');
            if (!ep.endsWith('/models')) ep += ep.endsWith('/v1') ? '/models' : '/v1/models';
            const r = await fetch(ep, { headers: { 'Authorization': 'Bearer ' + key } });
            if (!r.ok) return false;
            const d = await r.json();
            const arr = d.data || d;
            if (Array.isArray(arr)) {
                // 合并，不覆盖已有的
                const existing = new Set(models.map(m => m.value));
                arr.forEach(m => {
                    const id = m.id || m;
                    if (!existing.has(id)) models.push({ value: id, name: id });
                });
                models.sort((a, b) => a.name.localeCompare(b.name));
            }
            return true;
        } catch (e) { return false; }
    }

    // ===== 渲染 =====
    function renderAll() {
        // 角色下拉
        const charSel = document.getElementById('ct-char');
        charSel.innerHTML = '<option value="-1">-- 选择角色 --</option>';
        characters.forEach(c => {
            const o = document.createElement('option');
            o.value = c.idx; o.textContent = c.name;
            if (c.idx === currentCharId) o.selected = true;
            charSel.appendChild(o);
        });

        renderGreetings();
        renderScenarios();
        renderCombos();

        // 填充API
        if (apiUrl) document.getElementById('ct-url').value = apiUrl;
    }

    function renderGreetings() {
        const sel = document.getElementById('ct-greeting');
        const preview = document.getElementById('ct-gpreview');
        const gs = getGreetings();
        sel.innerHTML = '';
        if (!gs.length) {
            sel.innerHTML = '<option value="-1">无开场白</option>';
            preview.textContent = '';
            return;
        }
        gs.forEach(g => {
            const o = document.createElement('option');
            o.value = g.index;
            o.textContent = g.label;
            sel.appendChild(o);
        });
        updateGreetingPreview();
    }

    function updateGreetingPreview() {
        const gs = getGreetings();
        const sel = document.getElementById('ct-greeting');
        const preview = document.getElementById('ct-gpreview');
        const g = gs.find(x => x.index === parseInt(sel.value));
        preview.textContent = g ? g.content.substring(0, 150) + (g.content.length > 150 ? '...' : '') : '';
    }

    function renderScenarios() {
        const box = document.getElementById('ct-slist');
        box.innerHTML = '';
        state.scenarios.forEach(s => {
            const d = document.createElement('div');
            d.className = 'ct-scenario';
            d.innerHTML = `
                <div class="ct-scenario-actions">
                    <button class="ct-btn ct-btn-primary ct-btn-small ct-esc" data-id="${s.id}">✏️</button>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-dsc" data-id="${s.id}">🗑️</button>
                </div>
                <div class="ct-scenario-name">📌 ${s.name}</div>
                <div class="ct-scenario-msg">${s.messages.join(' → ')}</div>`;
            box.appendChild(d);
        });
        box.querySelectorAll('.ct-esc').forEach(b => b.onclick = () => scenarioModal(state.scenarios.find(s => s.id === +b.dataset.id)));
        box.querySelectorAll('.ct-dsc').forEach(b => b.onclick = () => {
            state.scenarios = state.scenarios.filter(s => s.id !== +b.dataset.id);
            renderScenarios(); renderCombos();
        });
    }

    function renderCombos() {
        const box = document.getElementById('ct-clist');
        box.innerHTML = '';
        state.combos.forEach(c => {
            const d = document.createElement('div');
            d.className = 'ct-combo';

            let mOpts = '<option value="">(当前模型)</option>';
            models.forEach(m => { mOpts += `<option value="${m.value}" ${m.value === c.model ? 'selected' : ''}>${m.name}</option>`; });

            let pOpts = '<option value="">(当前预设)</option>';
            presets.forEach(p => { pOpts += `<option value="${p.value}" ${p.value === c.preset ? 'selected' : ''}>${p.name}</option>`; });

            const gs = getGreetings();
            let gOpts = '<option value="-2">(用左侧选择)</option>';
            gs.forEach(g => { gOpts += `<option value="${g.index}" ${g.index === c.greetingIdx ? 'selected' : ''}>${g.label}</option>`; });

            let scks = state.scenarios.map(s => {
                return `<label class="ct-scenario-check"><input type="checkbox" class="ct-csc" data-c="${c.id}" data-s="${s.id}" ${c.sids.includes(s.id) ? 'checked' : ''}> ${s.name}</label>`;
            }).join('');

            d.innerHTML = `
                <div class="ct-combo-header">
                    <span class="ct-combo-title">🧩 组合 ${c.id}</span>
                    <button class="ct-btn ct-btn-danger ct-btn-small ct-dc" data-id="${c.id}">🗑️</button>
                </div>
                <div class="ct-combo-row"><label>🤖 模型</label><select class="ct-cm" data-id="${c.id}">${mOpts}</select></div>
                <div class="ct-combo-row"><label>📋 预设</label><select class="ct-cp" data-id="${c.id}">${pOpts}</select></div>
                <div class="ct-combo-row"><label>💬 开场白</label><select class="ct-cg" data-id="${c.id}">${gOpts}</select></div>
                <div class="ct-combo-row"><label>🎬 场景</label><div class="ct-scenario-checks">${scks}</div></div>`;
            box.appendChild(d);
        });

        // 事件
        box.querySelectorAll('.ct-dc').forEach(b => b.onclick = () => {
            state.combos = state.combos.filter(c => c.id !== +b.dataset.id); renderCombos();
        });
        box.querySelectorAll('.ct-cm').forEach(s => s.onchange = () => {
            const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.model = s.value;
        });
        box.querySelectorAll('.ct-cp').forEach(s => s.onchange = () => {
            const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.preset = s.value;
        });
        box.querySelectorAll('.ct-cg').forEach(s => s.onchange = () => {
            const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.greetingIdx = +s.value;
        });
        box.querySelectorAll('.ct-csc').forEach(cb => cb.onchange = () => {
            const c = state.combos.find(x => x.id === +cb.dataset.c);
            const sid = +cb.dataset.s;
            if (c) {
                if (cb.checked) { if (!c.sids.includes(sid)) c.sids.push(sid); }
                else { c.sids = c.sids.filter(id => id !== sid); }
            }
        });
    }

    function scenarioModal(existing) {
        const m = document.createElement('div');
        m.className = 'ct-modal-overlay';
        m.innerHTML = `<div class="ct-modal">
            <h3>${existing ? '编辑场景' : '添加场景'}</h3>
            <label>名称</label><input type="text" id="ct-mn" value="${existing ? existing.name : ''}">
            <label>消息（每行一条=多轮）</label><textarea id="ct-mm">${existing ? existing.messages.join('\n') : ''}</textarea>
            <div class="ct-modal-actions">
                <button class="ct-btn ct-btn-danger" id="ct-mc">取消</button>
                <button class="ct-btn ct-btn-success" id="ct-mo">确认</button>
            </div></div>`;
        document.body.appendChild(m);
        document.getElementById('ct-mc').onclick = () => m.remove();
        document.getElementById('ct-mo').onclick = () => {
            const n = document.getElementById('ct-mn').value.trim();
            const ms = document.getElementById('ct-mm').value.trim().split('\n').filter(x => x.trim());
            if (!n || !ms.length) { alert('填写名称和消息'); return; }
            if (existing) { existing.name = n; existing.messages = ms; }
            else { state.scenarios.push({ id: state.nextSid++, name: n, messages: ms }); }
            m.remove(); renderScenarios(); renderCombos();
        };
    }

    // ===== 主界面 =====
    mainEl.innerHTML = `
        <div class="ct-topbar">
            <h1>🧪 角色卡测试台</h1>
            <div class="ct-topbar-right">
                <span class="ct-status" id="ct-st">就绪</span>
                <button class="ct-close-btn" id="ct-x">✕</button>
            </div>
        </div>
        <div class="ct-body">
            <div class="ct-left">
                <div class="ct-section">
                    <div class="ct-section-title">🔌 API</div>
                    <div class="ct-api-box">
                        <label>地址</label><input type="text" id="ct-url" placeholder="https://..." style="width:100%;padding:5px 8px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;">
                        <label>Key</label><input type="password" id="ct-key" placeholder="sk-..." style="width:100%;padding:5px 8px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;">
                        <div style="margin-top:6px;"><button class="ct-btn ct-btn-primary" id="ct-fm">🔄 拉取模型</button> <span id="ct-ms" style="font-size:11px;color:#888;"></span></div>
                    </div>
                </div>
                <div class="ct-section">
                    <div class="ct-section-title">🎭 角色 & 开场白</div>
                    <div class="ct-api-box">
                        <label>角色</label><select id="ct-char" style="width:100%;padding:5px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;"></select>
                        <label style="margin-top:6px;">开场白</label><select id="ct-greeting" style="width:100%;padding:5px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;"></select>
                        <div id="ct-gpreview" style="font-size:11px;color:#888;margin-top:4px;max-height:60px;overflow:auto;white-space:pre-wrap;"></div>
                    </div>
                </div>
                <hr class="ct-divider">
                <div class="ct-section">
                    <div class="ct-section-title">🎬 场景 <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-as">➕</button></div>
                    <div id="ct-slist"></div>
                </div>
                <hr class="ct-divider">
                <div class="ct-section">
                    <div class="ct-section-title">🧩 组合 <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-ac">➕</button></div>
                    <div id="ct-clist"></div>
                </div>
                <button class="ct-btn-start" id="ct-go">▶ 开始测试</button>
                <div class="ct-progress"><div class="ct-progress-fill" id="ct-pg"></div></div>
            </div>
            <div class="ct-right">
                <div class="ct-section-title" style="display:flex;justify-content:space-between;">📊 结果 <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-exp" style="display:none;">📄 导出</button></div>
                <div id="ct-res"><div class="ct-empty"><p style="font-size:36px;">🧪</p><p>配置后点击开始测试</p></div></div>
            </div>
        </div>`;

    document.getElementById('ct-x').onclick = () => togglePanel(false);

    document.getElementById('ct-fm').onclick = async () => {
        const s = document.getElementById('ct-ms');
        s.textContent = '⏳...'; s.style.color = '#ffa726';
        const ok = await fetchModels();
        if (ok) { s.textContent = '✅ ' + models.length + '个模型'; s.style.color = '#4CAF50'; renderCombos(); }
        else { s.textContent = '❌ 失败'; s.style.color = '#f44336'; }
    };

    document.getElementById('ct-char').onchange = () => { renderGreetings(); renderCombos(); };
    document.getElementById('ct-greeting').onchange = updateGreetingPreview;
    document.getElementById('ct-as').onclick = () => scenarioModal(null);
    document.getElementById('ct-ac').onclick = () => {
        state.combos.push({ id: state.nextCid++, model: '', preset: '', greetingIdx: -2, sids: state.scenarios.map(s => s.id) });
        renderCombos();
    };

    // ===== 开始测试 =====
    document.getElementById('ct-go').onclick = async () => {
        if (state.testing) return;
        const url = document.getElementById('ct-url').value.trim();
        const key = document.getElementById('ct-key').value.trim();
        if (!url || !key) { alert('填写API地址和Key'); return; }
        if (!state.combos.length) { alert('添加至少一个组合'); return; }
        if (parseInt(document.getElementById('ct-char').value) === -1) { alert('选择角色'); return; }

        state.testing = true;
        const btn = document.getElementById('ct-go');
        btn.disabled = true; btn.textContent = '⏳ 测试中...';
        const res = document.getElementById('ct-res');
        res.innerHTML = '';
        document.getElementById('ct-exp').style.display = 'none';

        let total = 0, done = 0;
        state.combos.forEach(c => { total += c.sids.filter(sid => state.scenarios.find(s => s.id === sid)).length; });

        const allResults = [];

        for (const scenario of state.scenarios) {
            const combos = state.combos.filter(c => c.sids.includes(scenario.id));
            if (!combos.length) continue;

            const sec = document.createElement('div');
            sec.className = 'ct-result-scenario';
            sec.innerHTML = `<div class="ct-result-scenario-title">🎬 ${scenario.name}</div>
                <div class="ct-result-prompt">💬 ${scenario.messages.join(' → ')}</div>
                <div class="ct-result-grid" id="ct-rg${scenario.id}"></div>`;
            res.appendChild(sec);
            const grid = sec.querySelector('.ct-result-grid');

            combos.forEach(co => {
                const pName = co.preset ? presets.find(p => p.value === co.preset)?.name || co.preset : '当前';
                const mName = co.model ? models.find(m => m.value === co.model)?.name || co.model : '当前';
                const card = document.createElement('div');
                card.className = 'ct-result-card';
                card.id = `ct-r${scenario.id}-${co.id}`;
                card.innerHTML = `<div class="ct-result-card-header">组合${co.id} | ${mName} | ${pName}</div>
                    <div class="ct-result-card-body"><span class="ct-loading">⏳...</span></div>
                    <div class="ct-result-card-footer">${[1,2,3,4,5].map(i => `<button class="ct-star" data-s="${i}">⭐</button>`).join('')}<span style="margin-left:auto;font-size:11px;color:#666;" class="ct-rt"></span></div>`;
                grid.appendChild(card);
            });

            // 并行请求
            const tasks = combos.map(async (co) => {
                const card = document.getElementById(`ct-r${scenario.id}-${co.id}`);
                const body = card.querySelector('.ct-result-card-body');
                const timeEl = card.querySelector('.ct-rt');
                const t0 = Date.now();

                try {
                    const pData = presets.find(p => p.value === co.preset)?.data || null;
                    const model = co.model || models[0]?.value || 'gpt-4o';

                    // 构建完整消息（包含预设的所有提示词）
                    const allMsgs = buildMessages(co, [scenario.messages[0]]);
                    let reply = await callAPI(model, allMsgs, pData);

                    let replies = [{ user: scenario.messages[0], reply }];

                    // 多轮
                    if (scenario.messages.length > 1) {
                        let convMsgs = [...allMsgs, { role: 'assistant', content: reply }];
                        for (let i = 1; i < scenario.messages.length; i++) {
                            convMsgs.push({ role: 'user', content: scenario.messages[i] });
                            reply = await callAPI(model, convMsgs, pData);
                            convMsgs.push({ role: 'assistant', content: reply });
                            replies.push({ user: scenario.messages[i], reply });
                        }
                    }

                    let html = '';
                    replies.forEach(r => {
                        if (scenario.messages.length > 1) html += `<div style="color:#667eea;font-size:11px;">👤 ${r.user}</div>`;
                        html += `<div style="margin-bottom:6px;">${r.reply}</div>`;
                    });
                    body.innerHTML = html;
                    timeEl.textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's';

                    allResults.push({ scenario: scenario.name, combo: co.id, model, preset: co.preset || '当前', replies });
                } catch (err) {
                    body.innerHTML = `<div style="color:#f44336;">❌ ${err.message}</div>`;
                    timeEl.textContent = '失败';
                }

                done++;
                document.getElementById('ct-pg').style.width = (done / total * 100) + '%';
                document.getElementById('ct-st').textContent = `${done}/${total}`;

                card.querySelectorAll('.ct-star').forEach(star => {
                    star.onclick = () => {
                        const sc = +star.dataset.s;
                        card.querySelectorAll('.ct-star').forEach((s, i) => s.classList.toggle('active', i < sc));
                    };
                });
            });

            await Promise.all(tasks);
        }

        state.testing = false;
        btn.disabled = false; btn.textContent = '▶ 重新测试';
        document.getElementById('ct-st').textContent = '✅ 完成';
        document.getElementById('ct-pg').style.width = '100%';

        const expBtn = document.getElementById('ct-exp');
        expBtn.style.display = '';
        expBtn.onclick = () => {
            let t = '=== 角色卡测试报告 ===\n' + new Date().toLocaleString() + '\n\n';
            allResults.forEach(r => {
                t += `[${r.scenario}] 组合${r.combo} | ${r.model} | ${r.preset}\n`;
                r.replies.forEach(rp => { t += `👤 ${rp.user}\n🤖 ${rp.reply}\n\n`; });
                t += '---\n\n';
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
            a.download = '测试报告_' + new Date().toISOString().slice(0, 10) + '.txt';
            a.click();
        };
    };

    renderScenarios();
    console.log('✅ 角色卡测试台已加载');
});
