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

    let characters = [];
    let currentCharId = -1;
    let presets = [];
    let models = [];
    let apiUrl = '';

    const state = {
        scenarios: [
            { id: 1, name: '自我介绍', messages: ['你好，请介绍一下你自己'] },
            { id: 2, name: '日常互动', messages: ['今天天气真好，想出去走走吗？'] },
            { id: 3, name: '崩坏测试', messages: ['你是AI吧？别装了'] }
        ],
        combos: [],
        nextSid: 4, nextCid: 1, testing: false
    };

    async function refreshAll() {
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

        presets = [];
        try {
            const sel = document.getElementById('settings_preset_openai') || document.getElementById('settings_preset');
            if (sel) {
                for (const o of sel.options) {
                    if (o.value && o.value.trim()) presets.push({ value: o.value, name: o.textContent.trim(), data: null });
                }
            }
        } catch (e) {}

        // 加载预设内容
        for (let p of presets) {
            try {
                const r = await fetch('/api/presets/openai/' + encodeURIComponent(p.value));
                if (r.ok) { p.data = await r.json(); continue; }
            } catch (e) {}
            try {
                const r = await fetch('/api/presets/textgenerationwebui/' + encodeURIComponent(p.value));
                if (r.ok) p.data = await r.json();
            } catch (e) {}
        }

        // 打印预设内容方便调试
        presets.forEach(p => {
            if (p.data) {
                console.log('预设[' + p.name + ']字段:', Object.keys(p.data));
                if (p.data.prompts) console.log('  prompts数量:', p.data.prompts.length);
            }
        });

        models = [];
        try {
            const sels = ['#model_openai_select', '#model_select'];
            for (const s of sels) {
                const sel = document.querySelector(s);
                if (sel && sel.options.length > 1) {
                    for (const o of sel.options) {
                        if (o.value && o.value.trim()) models.push({ value: o.value, name: o.textContent.trim() });
                    }
                    break;
                }
            }
        } catch (e) {}

        try {
            if (typeof oai_settings !== 'undefined') {
                apiUrl = oai_settings.reverse_proxy || oai_settings.custom_url || '';
            }
        } catch (e) {}

        renderAll();
    }

    // ===== 构建messages =====
    function buildMessages(combo, userMessages) {
        const msgs = [];
        const charIdx = parseInt(document.getElementById('ct-char').value);
        const char = characters.find(c => c.idx === charIdx);
        const preset = presets.find(p => p.value === combo.preset);
        const pData = preset?.data;

        let sysParts = [];
        let jailbreak = '';

        if (pData) {
            // 新版格式：prompts数组
            if (pData.prompts && Array.isArray(pData.prompts)) {
                // 按顺序处理每个prompt
                let promptOrder = [];
                if (pData.prompt_order) {
                    // prompt_order定义了顺序
                    const orderList = Array.isArray(pData.prompt_order) ? pData.prompt_order :
                        (pData.prompt_order[0]?.order || pData.prompt_order.order || []);
                    if (Array.isArray(orderList)) {
                        orderList.forEach(item => {
                            const id = item.identifier || item;
                            const enabled = item.enabled !== false;
                            if (enabled) promptOrder.push(id);
                        });
                    }
                }

                // 如果没有order就按原顺序
                if (promptOrder.length === 0) {
                    promptOrder = pData.prompts.map(p => p.identifier || p.name);
                }

                promptOrder.forEach(id => {
                    const prompt = pData.prompts.find(p => (p.identifier || p.name) === id);
                    if (!prompt || prompt.enabled === false || !prompt.content) return;

                    let content = prompt.content;

                    // 替换宏
                    if (char) {
                        content = replaceMacros(content, char);
                    }

                    // 根据标识判断放在哪里
                    if (prompt.identifier === 'jailbreak' || prompt.name === 'jailbreak') {
                        jailbreak = content;
                    } else if (prompt.identifier === 'charDescription' || prompt.identifier === 'char_description') {
                        if (char && char.desc) sysParts.push(char.desc);
                    } else if (prompt.identifier === 'charPersonality' || prompt.identifier === 'char_personality') {
                        if (char && char.personality) sysParts.push(char.personality);
                    } else if (prompt.identifier === 'scenario') {
                        if (char && char.scenario) sysParts.push(char.scenario);
                    } else if (prompt.identifier === 'dialogueExamples' || prompt.identifier === 'mes_example') {
                        if (char && char.mes_example) sysParts.push(char.mes_example);
                    } else if (prompt.identifier === 'worldInfoBefore' || prompt.identifier === 'worldInfoAfter') {
                        // 跳过世界书（独立API调用无法获取）
                    } else if (prompt.identifier === 'personaDescription') {
                        // 跳过用户persona
                    } else {
                        // 其他提示词直接加入
                        sysParts.push(content);
                    }
                });
            }

            // 旧版格式
            if (sysParts.length === 0) {
                const main = pData.gaslight || pData.system_prompt || pData.main_prompt || '';
                if (main) {
                    let content = main;
                    if (char) content = replaceMacros(content, char);
                    sysParts.push(content);
                }
                jailbreak = pData.jailbreak_prompt || pData.nsfw_prompt || '';
                if (jailbreak && char) jailbreak = replaceMacros(jailbreak, char);
            }
        }

        // 如果预设里没有插入角色信息，手动加
        if (char) {
            const joined = sysParts.join('\n');
            if (char.sys) sysParts.unshift(char.sys);
            if (char.desc && !joined.includes(char.desc.substring(0, 50))) {
                sysParts.push('[Character Description]\n' + char.desc);
            }
            if (char.personality && !joined.includes(char.personality.substring(0, 30))) {
                sysParts.push('[Character Personality]\n' + char.personality);
            }
            if (char.scenario && !joined.includes(char.scenario.substring(0, 30))) {
                sysParts.push('[Scenario]\n' + char.scenario);
            }
            if (char.mes_example && !joined.includes(char.mes_example.substring(0, 30))) {
                sysParts.push('[Example Messages]\n' + char.mes_example);
            }
        }

        // system消息
        if (sysParts.length > 0) {
            msgs.push({ role: 'system', content: sysParts.join('\n\n') });
        }

        // 开场白
        const greeting = getGreetingContent(combo);
        if (greeting) {
            let g = char ? replaceMacros(greeting, char) : greeting;
            msgs.push({ role: 'assistant', content: g });
        }

        // 用户消息（只放第一条，后续多轮在外部处理）
        userMessages.forEach(m => msgs.push({ role: 'user', content: m }));

        // post_history_instructions
        if (char && char.post) {
            msgs.push({ role: 'system', content: replaceMacros(char.post, char) });
        }

        // jailbreak放最后
        if (jailbreak) {
            msgs.push({ role: 'system', content: jailbreak });
        }

        return msgs;
    }

    function replaceMacros(text, char) {
        if (!text) return text;
        return text
            .replace(/\{\{char\}\}/gi, char.name || '')
            .replace(/\{\{user\}\}/gi, 'User')
            .replace(/\{\{description\}\}/gi, char.desc || '')
            .replace(/\{\{personality\}\}/gi, char.personality || '')
            .replace(/\{\{scenario\}\}/gi, char.scenario || '')
            .replace(/\{\{persona\}\}/gi, '')
            .replace(/\{\{mesExamples\}\}/gi, char.mes_example || '')
            .replace(/\{\{char_name\}\}/gi, char.name || '')
            .replace(/\{\{user_name\}\}/gi, 'User')
            .replace(/\{\{time\}\}/gi, new Date().toLocaleTimeString())
            .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString())
            .replace(/\{\{idle_duration\}\}/gi, '')
            .replace(/\{\{random::(.*?)\}\}/gi, (m, opts) => {
                const arr = opts.split('::');
                return arr[Math.floor(Math.random() * arr.length)];
            });
    }

    function getGreetings() {
        const idx = parseInt(document.getElementById('ct-char')?.value ?? -1);
        const ch = characters.find(c => c.idx === idx);
        if (!ch) return [];
        const list = [];
        if (ch.first_mes) list.push({ index: 0, label: '主开场白', content: ch.first_mes });
        if (ch.alt_greetings) ch.alt_greetings.forEach((g, i) => {
            if (g && g.trim()) list.push({ index: i + 1, label: '备选' + (i + 1), content: g });
        });
        return list;
    }

    function getGreetingContent(combo) {
        const gs = getGreetings();
        let gIdx = combo.greetingIdx;
        if (gIdx === undefined || gIdx === -2) gIdx = parseInt(document.getElementById('ct-greeting')?.value ?? 0);
        const g = gs.find(x => x.index === gIdx);
        return g ? g.content : (gs[0]?.content || '');
    }

    // ===== API =====
    async function callAPI(model, messages, pData) {
        const url = document.getElementById('ct-url').value.trim();
        const key = document.getElementById('ct-key').value.trim();
        if (!url || !key) throw new Error('填写API地址和Key');

        // 从预设读参数，给大默认值
        let temp = 0.8, maxTk = 4096, topP = 1, freqPen = 0, presPen = 0;
        if (pData) {
            temp = pData.temp_openai ?? pData.temperature ?? pData.temp ?? temp;
            // max_tokens: 尝试所有可能的字段名
            const possibleMax = pData.openai_max_tokens ?? pData.max_tokens ?? pData.max_length
                ?? pData.openai_max_context ?? pData.rep_pen_range ?? null;
            if (possibleMax && possibleMax > 0 && possibleMax <= 32000) {
                maxTk = possibleMax;
            }
            topP = pData.top_p_openai ?? pData.top_p ?? topP;
            freqPen = pData.freq_pen_openai ?? pData.frequency_penalty ?? freqPen;
            presPen = pData.pres_pen_openai ?? pData.presence_penalty ?? presPen;
        }

        // 保底：至少4096
        if (maxTk < 1000) maxTk = 4096;

        let endpoint = url.replace(/\/+$/, '');
        if (!endpoint.includes('/chat/completions')) {
            endpoint += endpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
        }

        console.log('API请求:', model, '温度:', temp, 'max_tokens:', maxTk, '消息数:', messages.length);

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
            throw new Error(`(${resp.status}) ${err.substring(0, 150)}`);
        }
        const data = await resp.json();
        if (data.choices?.[0]) return data.choices[0].message.content;
        if (data.content?.[0]) return data.content[0].text;
        throw new Error('无法解析');
    }

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
                const existing = new Set(models.map(m => m.value));
                arr.forEach(m => { const id = m.id || m; if (!existing.has(id)) models.push({ value: id, name: id }); });
                models.sort((a, b) => a.name.localeCompare(b.name));
            }
            return true;
        } catch (e) { return false; }
    }

    // ===== 渲染 =====
    function renderAll() {
        const cs = document.getElementById('ct-char');
        cs.innerHTML = '<option value="-1">-- 选择角色 --</option>';
        characters.forEach(c => {
            const o = document.createElement('option');
            o.value = c.idx; o.textContent = c.name;
            if (c.idx === currentCharId) o.selected = true;
            cs.appendChild(o);
        });
        renderGreetings(); renderScenarios(); renderCombos();
        if (apiUrl) document.getElementById('ct-url').value = apiUrl;
    }

    function renderGreetings() {
        const sel = document.getElementById('ct-greeting');
        const pre = document.getElementById('ct-gpreview');
        const gs = getGreetings();
        sel.innerHTML = '';
        if (!gs.length) { sel.innerHTML = '<option value="-1">无</option>'; pre.textContent = ''; return; }
        gs.forEach(g => { const o = document.createElement('option'); o.value = g.index; o.textContent = g.label; sel.appendChild(o); });
        updateGPreview();
    }

    function updateGPreview() {
        const gs = getGreetings();
        const g = gs.find(x => x.index === parseInt(document.getElementById('ct-greeting').value));
        document.getElementById('ct-gpreview').textContent = g ? g.content.substring(0, 150) + (g.content.length > 150 ? '...' : '') : '';
    }

    function renderScenarios() {
        const box = document.getElementById('ct-slist');
        box.innerHTML = '';
        state.scenarios.forEach(s => {
            const d = document.createElement('div');
            d.className = 'ct-scenario';
            d.innerHTML = `<div class="ct-scenario-actions"><button class="ct-btn ct-btn-primary ct-btn-small ct-esc" data-id="${s.id}">✏️</button><button class="ct-btn ct-btn-danger ct-btn-small ct-dsc" data-id="${s.id}">🗑️</button></div><div class="ct-scenario-name">📌 ${s.name}</div><div class="ct-scenario-msg">${s.messages.join(' → ')}</div>`;
            box.appendChild(d);
        });
        box.querySelectorAll('.ct-esc').forEach(b => b.onclick = () => scenarioModal(state.scenarios.find(s => s.id === +b.dataset.id)));
        box.querySelectorAll('.ct-dsc').forEach(b => b.onclick = () => { state.scenarios = state.scenarios.filter(s => s.id !== +b.dataset.id); renderScenarios(); renderCombos(); });
    }

    function renderCombos() {
        const box = document.getElementById('ct-clist');
        box.innerHTML = '';
        state.combos.forEach(c => {
            const d = document.createElement('div');
            d.className = 'ct-combo';
            let mO = '<option value="">(当前)</option>';
            models.forEach(m => { mO += `<option value="${m.value}" ${m.value === c.model ? 'selected' : ''}>${m.name}</option>`; });
            let pO = '<option value="">(当前)</option>';
            presets.forEach(p => { pO += `<option value="${p.value}" ${p.value === c.preset ? 'selected' : ''}>${p.name}</option>`; });
            const gs = getGreetings();
            let gO = '<option value="-2">(左侧选择)</option>';
            gs.forEach(g => { gO += `<option value="${g.index}" ${g.index === c.greetingIdx ? 'selected' : ''}>${g.label}</option>`; });
            let sk = state.scenarios.map(s => `<label class="ct-scenario-check"><input type="checkbox" class="ct-csc" data-c="${c.id}" data-s="${s.id}" ${c.sids.includes(s.id) ? 'checked' : ''}> ${s.name}</label>`).join('');

            d.innerHTML = `<div class="ct-combo-header"><span class="ct-combo-title">🧩 组合${c.id}</span><button class="ct-btn ct-btn-danger ct-btn-small ct-dc" data-id="${c.id}">🗑️</button></div>
                <div class="ct-combo-row"><label>🤖 模型</label><select class="ct-cm" data-id="${c.id}">${mO}</select></div>
                <div class="ct-combo-row"><label>📋 预设</label><select class="ct-cp" data-id="${c.id}">${pO}</select></div>
                <div class="ct-combo-row"><label>💬 开场白</label><select class="ct-cg" data-id="${c.id}">${gO}</select></div>
                <div class="ct-combo-row"><label>🎬 场景</label><div class="ct-scenario-checks">${sk}</div></div>`;
            box.appendChild(d);
        });
        box.querySelectorAll('.ct-dc').forEach(b => b.onclick = () => { state.combos = state.combos.filter(c => c.id !== +b.dataset.id); renderCombos(); });
        box.querySelectorAll('.ct-cm').forEach(s => s.onchange = () => { const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.model = s.value; });
        box.querySelectorAll('.ct-cp').forEach(s => s.onchange = () => { const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.preset = s.value; });
        box.querySelectorAll('.ct-cg').forEach(s => s.onchange = () => { const c = state.combos.find(x => x.id === +s.dataset.id); if (c) c.greetingIdx = +s.value; });
        box.querySelectorAll('.ct-csc').forEach(cb => cb.onchange = () => {
            const c = state.combos.find(x => x.id === +cb.dataset.c); const sid = +cb.dataset.s;
            if (c) { if (cb.checked) { if (!c.sids.includes(sid)) c.sids.push(sid); } else { c.sids = c.sids.filter(id => id !== sid); } }
        });
    }

    function scenarioModal(existing) {
        const m = document.createElement('div'); m.className = 'ct-modal-overlay';
        m.innerHTML = `<div class="ct-modal"><h3>${existing ? '编辑' : '添加'}场景</h3><label>名称</label><input type="text" id="ct-mn" value="${existing ? existing.name : ''}"><label>消息（每行一条=多轮）</label><textarea id="ct-mm">${existing ? existing.messages.join('\n') : ''}</textarea><div class="ct-modal-actions"><button class="ct-btn ct-btn-danger" id="ct-mc">取消</button><button class="ct-btn ct-btn-success" id="ct-mo">确认</button></div></div>`;
        document.body.appendChild(m);
        document.getElementById('ct-mc').onclick = () => m.remove();
        document.getElementById('ct-mo').onclick = () => {
            const n = document.getElementById('ct-mn').value.trim();
            const ms = document.getElementById('ct-mm').value.trim().split('\n').filter(x => x.trim());
            if (!n || !ms.length) { alert('填写名称和消息'); return; }
            if (existing) { existing.name = n; existing.messages = ms; } else { state.scenarios.push({ id: state.nextSid++, name: n, messages: ms }); }
            m.remove(); renderScenarios(); renderCombos();
        };
    }

    // ===== 主界面 =====
    mainEl.innerHTML = `
        <div class="ct-topbar"><h1>🧪 角色卡测试台</h1><div class="ct-topbar-right"><span class="ct-status" id="ct-st">就绪</span><button class="ct-close-btn" id="ct-x">✕</button></div></div>
        <div class="ct-body">
            <div class="ct-left">
                <div class="ct-section"><div class="ct-section-title">🔌 API</div><div class="ct-api-box">
                    <label>地址</label><input type="text" id="ct-url" placeholder="https://..." style="width:100%;padding:5px 8px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;">
                    <label>Key</label><input type="password" id="ct-key" placeholder="sk-..." style="width:100%;padding:5px 8px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;">
                    <div style="margin-top:6px;"><button class="ct-btn ct-btn-primary" id="ct-fm">🔄 拉取模型</button> <span id="ct-ms" style="font-size:11px;color:#888;"></span></div>
                </div></div>
                <div class="ct-section"><div class="ct-section-title">🎭 角色 & 开场白</div><div class="ct-api-box">
                    <label>角色</label><select id="ct-char" style="width:100%;padding:5px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;"></select>
                    <label style="margin-top:6px;">开场白</label><select id="ct-greeting" style="width:100%;padding:5px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;font-size:12px;"></select>
                    <div id="ct-gpreview" style="font-size:11px;color:#888;margin-top:4px;max-height:60px;overflow:auto;white-space:pre-wrap;"></div>
                </div></div>
                <hr class="ct-divider">
                <div class="ct-section"><div class="ct-section-title">🎬 场景 <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-as">➕</button></div><div id="ct-slist"></div></div>
                <hr class="ct-divider">
                <div class="ct-section"><div class="ct-section-title">🧩 组合 <button class="ct-btn ct-btn-primary ct-btn-small" id="ct-ac">➕</button></div><div id="ct-clist"></div></div>
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
        if (ok) { s.textContent = '✅' + models.length + '个'; s.style.color = '#4CAF50'; renderCombos(); }
        else { s.textContent = '❌失败'; s.style.color = '#f44336'; }
    };
    document.getElementById('ct-char').onchange = () => { renderGreetings(); renderCombos(); };
    document.getElementById('ct-greeting').onchange = updateGPreview;
    document.getElementById('ct-as').onclick = () => scenarioModal(null);
    document.getElementById('ct-ac').onclick = () => {
        state.combos.push({ id: state.nextCid++, model: '', preset: '', greetingIdx: -2, sids: state.scenarios.map(s => s.id) });
        renderCombos();
    };

    // ===== 开始测试 - 全部并行 =====
    document.getElementById('ct-go').onclick = async () => {
        if (state.testing) return;
        if (!document.getElementById('ct-url').value.trim() || !document.getElementById('ct-key').value.trim()) { alert('填写API'); return; }
        if (!state.combos.length) { alert('添加组合'); return; }
        if (parseInt(document.getElementById('ct-char').value) === -1) { alert('选角色'); return; }

        state.testing = true;
        const btn = document.getElementById('ct-go');
        btn.disabled = true; btn.textContent = '⏳ 测试中...';
        const res = document.getElementById('ct-res');
        res.innerHTML = '';
        document.getElementById('ct-exp').style.display = 'none';

        // 收集所有任务
        const allTasks = [];
        const allResults = [];

        // 先创建所有UI卡片
        for (const scenario of state.scenarios) {
            const combos = state.combos.filter(c => c.sids.includes(scenario.id));
            if (!combos.length) continue;

            const sec = document.createElement('div');
            sec.className = 'ct-result-scenario';
            sec.innerHTML = `<div class="ct-result-scenario-title">🎬 ${scenario.name}</div><div class="ct-result-prompt">💬 ${scenario.messages.join(' → ')}</div><div class="ct-result-grid" id="ct-rg${scenario.id}"></div>`;
            res.appendChild(sec);
            const grid = sec.querySelector('.ct-result-grid');

            combos.forEach(co => {
                const pN = co.preset ? presets.find(p => p.value === co.preset)?.name || co.preset : '当前';
                const mN = co.model || models[0]?.name || '当前';
                const card = document.createElement('div');
                card.className = 'ct-result-card';
                card.id = `ct-r${scenario.id}-${co.id}`;
                card.innerHTML = `<div class="ct-result-card-header">组合${co.id} | ${mN} | ${pN}</div><div class="ct-result-card-body"><span class="ct-loading">⏳ 请求中...</span></div><div class="ct-result-card-footer">${[1,2,3,4,5].map(i => `<button class="ct-star" data-s="${i}">⭐</button>`).join('')}<span style="margin-left:auto;font-size:11px;color:#666;" class="ct-rt"></span></div>`;
                grid.appendChild(card);

                // 创建任务
                allTasks.push({ scenario, combo: co, cardId: `ct-r${scenario.id}-${co.id}` });
            });
        }

        let total = allTasks.length, done = 0;

        // 全部同时发送！
        const promises = allTasks.map(async (task) => {
            const { scenario, combo, cardId } = task;
            const card = document.getElementById(cardId);
            const body = card.querySelector('.ct-result-card-body');
            const timeEl = card.querySelector('.ct-rt');
            const t0 = Date.now();

            try {
                const pData = presets.find(p => p.value === combo.preset)?.data || null;
                const model = combo.model || models[0]?.value || 'gpt-4o';

                // 第一轮
                const initMsgs = buildMessages(combo, [scenario.messages[0]]);
                let reply = await callAPI(model, initMsgs, pData);
                let replies = [{ user: scenario.messages[0], reply }];

                // 多轮
                if (scenario.messages.length > 1) {
                    let conv = [...initMsgs, { role: 'assistant', content: reply }];
                    for (let i = 1; i < scenario.messages.length; i++) {
                        conv.push({ role: 'user', content: scenario.messages[i] });
                        reply = await callAPI(model, conv, pData);
                        conv.push({ role: 'assistant', content: reply });
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

                allResults.push({ scenario: scenario.name, combo: combo.id, model, preset: combo.preset || '当前', replies });
            } catch (err) {
                body.innerHTML = `<div style="color:#f44336;">❌ ${err.message}</div>`;
                timeEl.textContent = '失败';
            }

            done++;
            document.getElementById('ct-pg').style.width = (done / total * 100) + '%';
            document.getElementById('ct-st').textContent = `${done}/${total}`;

            card.querySelectorAll('.ct-star').forEach(star => {
                star.onclick = () => { const sc = +star.dataset.s; card.querySelectorAll('.ct-star').forEach((s, i) => s.classList.toggle('active', i < sc)); };
            });
        });

        await Promise.all(promises);

        state.testing = false;
        btn.disabled = false; btn.textContent = '▶ 重新测试';
        document.getElementById('ct-st').textContent = '✅ 完成';
        document.getElementById('ct-pg').style.width = '100%';

        const expBtn = document.getElementById('ct-exp');
        expBtn.style.display = '';
        expBtn.onclick = () => {
            let t = '=== 测试报告 ===\n' + new Date().toLocaleString() + '\n\n';
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
