
        // 【新增】全局变量，用于记录当前的会话ID
let currentSessionId = null;
// 竞赛技能状态管理
window.cfState = {
    currentProblem: null,  // 当前绑定的题目
    ratingMin: 1400,
    ratingMax: 1600
};

// 全局函数供调用
window.activateSkillById = function(skillId) {
    document.getElementById('chatInput').value = ''; // 清空输入
    document.getElementById('slashMenu').style.display = 'none';
    
    // 触发技能切换（复用现有逻辑）
    if (typeof SkillManager !== 'undefined') {
        SkillManager.activateSkill(skillId);
    } else if (typeof switchMode === 'function') {
        // 兼容旧版
        const map = { 'chat': 'chat', 'audit': 'audit', 'exam': 'exam' };
        if (map[skillId]) {
            // 找到对应的nav-item模拟点击，或直接调用
            console.log('Switching to skill:', skillId);
        }
    }
};

 function saveConfig() {
    localStorage.setItem('my_api_url', document.getElementById('cfgApiUrl').value);
    localStorage.setItem('my_api_key', document.getElementById('cfgApiKey').value);
    
    const tip = document.getElementById('saveTip');
    if(tip) {
        tip.style.display = 'block';
        clearTimeout(window.saveTimer);
        window.saveTimer = setTimeout(() => tip.style.display = 'none', 2000);
    }
    loadSessions(); // 【新增】只要改了配置就重新刷一次左侧会话
}

function loadConfig() {
    const url = localStorage.getItem('my_api_url');
    const key = localStorage.getItem('my_api_key');
    if(url) document.getElementById('cfgApiUrl').value = url;
    if(key) document.getElementById('cfgApiKey').value = key;
    
    // 【关键新增】：页面刷新时，如果已经有API Key，立刻去拉取历史会话
    if(key) {
        setTimeout(loadSessions, 500); // 延迟500ms确保DOM加载完毕
    }
}
       

        document.addEventListener('DOMContentLoaded', () => {
            loadConfig(); 
            const wrapper = document.getElementById('customModelSelect');
            const trigger = wrapper.querySelector('.custom-select-trigger');
            const options = wrapper.querySelectorAll('.custom-option');
            const realSelect = document.getElementById('modelSelect');
            
            trigger.addEventListener('click', (e) => { wrapper.classList.toggle('open'); e.stopPropagation(); });

            options.forEach(opt => {
                opt.addEventListener('click', () => {
                    document.getElementById('triggerText').textContent = opt.textContent.trim();
                    document.getElementById('triggerIcon').src = opt.querySelector('.model-icon').src;
                    options.forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    realSelect.value = opt.getAttribute('data-value');
                    wrapper.classList.remove('open');
                });
            });
            document.addEventListener('click', () => wrapper.classList.remove('open'));
        });

        marked.setOptions({
            breaks: true,
            highlight: function (code, lang) {
                if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
                return hljs.highlightAuto(code).value;
            }
        });

function switchTab(pageId, element) {
    // 隐藏所有页面
    document.querySelectorAll('.page-content').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none'; // 强制确保隐藏
    });
    
    // 移除所有导航激活状态
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // 显示目标页面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'flex'; // 强制显示
        
        // 如果是投资组合，初始化
        if (pageId === 'portfolioPage' && window.PortfolioApp) {
            setTimeout(() => PortfolioApp.init(), 100);
        }
    } else {
        console.error('页面不存在:', pageId);
    }
    
    // 激活导航
    if (element) element.classList.add('active');
}
        function quickPrompt(t) { document.getElementById('chatInput').value = t; switchTab('chatPage', document.querySelectorAll('.nav-item')[0]); sendMessage(); }
        function clearChat() { document.getElementById('chatBox').innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">记忆重置完毕。</div></div>`; window.pendingUploads = []; renderAttachments(); }
        
        function appendMsg(role, rawHtml) {
            const b = document.getElementById('chatBox');
            b.innerHTML += `<div class="msg-wrapper ${role}"><div class="avatar ${role}">${role=='user'?'我':'AI'}</div><div class="msg-bubble">${rawHtml}</div></div>`;
            b.scrollTop = b.scrollHeight; 
            return b.lastElementChild;
        }

        window.pendingUploads = []; 
        function renderAttachments() {
            const container = document.getElementById('attachmentsPreview');
            container.innerHTML = '';
            if (window.pendingUploads.length > 0) {
                container.style.display = 'flex';
                window.pendingUploads.forEach((file, index) => {
                    container.innerHTML += `<div class="attached-item">📄 ${file.name} <span class="del-file-btn" onclick="removeAttachment(${index})">×</span></div>`;
                });
            } else {
                container.style.display = 'none';
            }
        }
        function removeAttachment(index) { window.pendingUploads.splice(index, 1); renderAttachments(); }

     function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const isImg = file.type.startsWith('image/');
            const isDocx = file.name.toLowerCase().endsWith('.docx'); // 判断是否为 Word 文档

            const bar = document.getElementById('uploadBar');
            document.getElementById('uploadFileName').innerText = "本地引擎解析中: " + file.name;
            bar.style.display = 'flex';
            document.getElementById('uploadProgress').style.width = '30%';

            const reader = new FileReader();

            if (isImg) {
                // 1. 处理图片 (压缩后转 Base64)
                reader.onload = function(e) { compressImage(e.target.result, file.name, file.type); };
                reader.readAsDataURL(file);
            } else if (isDocx) {
                // 2. 处理 docx (读取为 ArrayBuffer，交由 mammoth 提取文本)
                reader.onload = function(e) {
                    mammoth.extractRawText({arrayBuffer: e.target.result})
                        .then(function(result) {
                            const text = result.value; // 提取出的纯中文/英文试卷文本
                            document.getElementById('uploadProgress').style.width = '100%';
                            setTimeout(() => bar.style.display = 'none', 300);
                            window.pendingUploads.push({ name: file.name, type: 'text', content: text });
                            renderAttachments();
                        })
                        .catch(function(err) {
                            alert("Word 解析失败: " + err.message);
                            bar.style.display = 'none';
                        });
                };
                reader.readAsArrayBuffer(file);
            } else {
                // 3. 处理普通 txt, py, csv, json 代码等 (直接当作文本读取)
                reader.onload = function(e) {
                    const content = e.target.result;
                    document.getElementById('uploadProgress').style.width = '100%';
                    setTimeout(() => bar.style.display = 'none', 300);
                    window.pendingUploads.push({ name: file.name, type: 'text', content: content });
                    renderAttachments();
                };
                reader.readAsText(file);
            }
            
            event.target.value = ''; // 清空选中状态，允许重复上传同名文件
        }

        function compressImage(base64Str, fileName, fileType) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width; let h = img.height;
                const MAX_DIM = 1200; 
                if (w > MAX_DIM || h > MAX_DIM) {
                    if (w > h) { h = (h / w) * MAX_DIM; w = MAX_DIM; }
                    else { w = (w / h) * MAX_DIM; h = MAX_DIM; }
                }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const compressedData = canvas.toDataURL(fileType.includes('png')?'image/jpeg':'image/webp', 0.7); 
                document.getElementById('uploadProgress').style.width = '100%';
                setTimeout(() => document.getElementById('uploadBar').style.display = 'none', 300);
                window.pendingUploads.push({ name: fileName, type: 'image', content: compressedData });
                renderAttachments();
            };
            img.src = base64Str;
        }

        let recognition = null;
        let isRecording = false;
        function toggleVoice() {
            const btn = document.getElementById('voiceBtn');
            const input = document.getElementById('chatInput');
            if (isRecording) { if (recognition) recognition.stop(); return; }
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) { alert("当前环境不支持原生语音API。"); return; }
            recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN'; recognition.interimResults = false; 
            recognition.onstart = () => { isRecording = true; btn.classList.add('recording'); input.placeholder = "🔴 正在聆听..."; };
            recognition.onresult = (e) => { input.value += e.results[0][0].transcript; };
            recognition.onerror = (e) => { alert("⚠️ 语音唤醒失败"); };
            recognition.onend = () => { isRecording = false; btn.classList.remove('recording'); input.placeholder = "输入需求或点击话筒录音..."; };
            recognition.start();
        }

    
// 核心信息投递逻辑
function sendMessage(customText = null) {
    const input = document.getElementById('chatInput');
    const txt = customText || input.value.trim(); 
    if(!txt && window.pendingUploads.length === 0) return;
    // ===== 处理 /daily 命令 =====
    if (txt === '/daily') {
        input.value = '';
        handleDailyCommand(false); // false = 不强制刷新
        return;
    }
    
    if (txt === '/daily new' || txt === '/daily refresh') {
        input.value = '';
        handleDailyCommand(true); // true = 强制刷新
        return;
    }
    
    // ===== 新增：检测 /daily 命令 =====
    if (txt === '/daily' && currentSkillId === 'competition') {
        input.value = ''; // 清空输入
        // 显示加载中
        const loadingMsg = appendMsg('bot', '<span style="color:#9ca3af;">🏆 正在从 Codeforces 获取今日推荐...</span>');
        
        // 调用后端接口
        const rating_min = window.cf_rating_min || 1400;
        const rating_max = window.cf_rating_max || 1600;
        
        fetch('/cf_daily', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rating_min, rating_max})
        })
        .then(r => r.json())
        .then(data => {
            loadingMsg.remove(); // 移除加载提示
            if (data.status === 'success') {
                renderDailyProblemCard(data.problem);
            } else {
                appendMsg('bot', `<div style="color:#ef4444;">❌ 获取失败：${data.message}</div>`);
            }
        })
        .catch(err => {
            loadingMsg.remove();
            appendMsg('bot', `<div style="color:#ef4444;">❌ 网络错误：${err.message}</div>`);
        });
        return; // 阻止继续发送到 AI
    }
    let userDisplay = txt;
    if(window.pendingUploads.length > 0) {
        const attachNames = window.pendingUploads.map(f => `[${f.name}]`).join(' ');
        userDisplay = txt ? `${txt}<br><span style="color:#0369a1; font-size:12px;">${attachNames}</span>` : `<span style="color:#0369a1; font-size:12px;">发了附件 ${attachNames} 对其进行运算...</span>`;
    }

    const encodedUserText = encodeURIComponent(txt || window.pendingUploads.map(f => f.name).join(' '));
    const finalUserHtml = `<button class="copy-all-btn" data-raw="${encodedUserText}" onclick="copyFullMsg(this)">复制</button>` + userDisplay;
    appendMsg('user', finalUserHtml);
    if(!customText) input.value = '';
    
    const filesDataPayload = [...window.pendingUploads];
    window.pendingUploads = [];
    renderAttachments();

    const loadingMsg = appendMsg('bot', '<span style="color:#9ca3af;">云端运算中...</span>');
    const targetBubble = loadingMsg.querySelector('.msg-bubble');

  // ===== 关键：构建增强的 system_skill =====
    let enhancedSystemSkill = getCurrentSkillPrompt();
    
    // 如果是竞赛技能且当前有绑定题目，附加上下文
    if (currentSkillId === 'competition' && window.cfState.currentProblem) {
        const p = window.cfState.currentProblem;
        enhancedSystemSkill += `

【重要：当前讨论的题目上下文】
题号：Codeforces ${p.contestId}${p.index} - ${p.name}
难度：${p.difficulty_emoji} Rating ${p.rating} (${p.difficulty_label})
算法标签：${p.tags.join(', ')}
题目链接：${p.url}

【指令】
用户说"这题"、"这道题"、"帮我解决"时，指的就是上面的 Codeforces 题目。请基于该题的难度和标签给出针对性建议。
`;
    }
    
    // ... 发送 fetch ...
    fetch('/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            text: txt, 
            model: document.getElementById('modelSelect').value,
            files: filesDataPayload,
            api_url: document.getElementById('cfgApiUrl').value.trim(),  
            api_key: document.getElementById('cfgApiKey').value.trim(),
            session_id: currentSessionId,
            system_skill: enhancedSystemSkill  // 使用增强后的 prompt
        })
    })
    .then(r => r.json())
    .then(d => {
        const rawResponse = d.reply || "请求失败";
        let finalHtml = "";

        if(d.status === "error") {
            finalHtml = rawResponse;
        } else {
            // 【关键新增】：获取后端分配的会话ID，并刷新左侧列表
            if(d.session_id) {
                const isNewSession = !currentSessionId;
                currentSessionId = d.session_id; 
                if(isNewSession) loadSessions(); // 如果是新会话，刷新左侧列表
            }

            finalHtml = marked.parse(rawResponse);
            const encodedRawStr = encodeURIComponent(rawResponse);
            const tokensUsed = d.tokens || 0;
            // 【将其完全替换为以下代码】：
            finalHtml = `<button class="copy-all-btn" data-raw="${encodedRawStr}" onclick="copyAiFullMsg(this)">复制</button>` 
                        + finalHtml 
                        + `<div class="msg-action-bar">
                             <div class="token-block" style="margin-top:0;">⚡ 消耗 Token: <b>${tokensUsed}</b></div>
                             <button class="mini-tool-btn" onclick="exportSingleMsg(this, 'pdf')" title="仅导出此条内容为PDF">📄 导出PDF</button>
                             <button class="mini-tool-btn" onclick="exportSingleMsg(this, 'doc')" title="仅导出此条内容为Word">📝 导出Doc</button>
                           </div>`;
        }

        targetBubble.innerHTML = finalHtml;
        requestAnimationFrame(() => { const box = document.getElementById('chatBox'); box.scrollTop = box.scrollHeight; });
    }).catch(err => { targetBubble.innerHTML = "⚠️ 网络或接口异常。"; });
}

       
        function copyAiFullMsg(btn) {
            const str = decodeURIComponent(btn.getAttribute('data-raw'));
            navigator.clipboard.writeText(str).then(() => { btn.innerText="成功✓"; setTimeout(()=>btn.innerText="复制", 2000); });
        }
        function copyFullMsg(btn) {
            const str = decodeURIComponent(btn.getAttribute('data-raw'));
            navigator.clipboard.writeText(str).then(() => { 
                const oldText = btn.innerText; btn.innerText = "成功 ✓"; btn.style.color = "#10b981";
                setTimeout(()=>{ btn.innerText = oldText; btn.style.color = ""; }, 2000); 
            }).catch(() => alert("剪贴板受限"));
        }
        // let currentSessionId = null;

// 点击开启新对话
function createNewSession() {
    currentSessionId = null;
    document.getElementById('chatBox').innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">已开启全新独立会话。</div></div>`;
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
}


// 请求并渲染左侧历史会话列表
function loadSessions() {
    const apiKey = document.getElementById('cfgApiKey').value.trim();
    const list = document.getElementById('sessionList');
    if (!list) return;
    
    if (!apiKey) {
        list.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:10px 0;text-align:center;">请先配置有效 API KEY</div>';
        return;
    }
    
    list.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:10px 0;text-align:center;">拉取数据库中...</div>';

    fetch('/get_sessions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ api_key: apiKey })
    })
    .then(res => res.json())
    .then(res => {
        if(res.status !== 'success') {
            // 如果后端报错，这一行就会在左侧直接打印具体原因！
            list.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:10px 0;text-align:center;">数据库异常: ${res.message}</div>`;
            return;
        }
        
        const data = res.data || [];
        if(data.length === 0) {
            list.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:10px 0;text-align:center;">目前暂无您的专属历史记录</div>';
            return;
        }
        
        list.innerHTML = '';
        data.forEach(sess => {
            const isActive = sess.id === currentSessionId ? 'active' : '';
            list.innerHTML += `
                <div class="session-item ${isActive}" onclick="switchSession(${sess.id}, this)">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:170px;">💬 ${sess.title}</span>
                    <button class="btn-del-session" onclick="deleteSession(event, ${sess.id})" title="删除记录">🗑️</button>
                </div>`;
        });
    })
    .catch(err => {
        list.innerHTML = `<div style="font-size:12px;color:#ef4444;padding:10px 0;text-align:center;">网络异常，请点击标题旁的 🔄 刷新</div>`;
    });
}

// 切换历史会话
function switchSession(sessId, element) {
    const apiKey = document.getElementById('cfgApiKey').value.trim();
    currentSessionId = sessId;
    loadSessions(); // 刷新高亮状态
    switchTab('chatPage', document.querySelectorAll('.nav-item')[0]);
    
    document.getElementById('chatBox').innerHTML = `<div style="text-align:center; color:#9ca3af; font-size:12px; margin-top:20px;">正在加载上下文记录...</div>`;
    
    fetch('/get_session_history', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ session_id: sessId, api_key: apiKey })
    }).then(r => r.json()).then(res => {
        if(res.status === 'success') {
            document.getElementById('chatBox').innerHTML = '';
              res.data.forEach(msg => {
                 const roleClass = msg.role === 'user' ? 'user' : 'bot';
                 const htmlContent = msg.role === 'user' ? msg.content : marked.parse(msg.content);
                 const encodedRawStr = encodeURIComponent(msg.content);
                 const copyBtn = `<button class="copy-all-btn" data-raw="${encodedRawStr}" onclick="copyAiFullMsg(this)">复制</button>`;
                 
                 // 如果是 AI 的回复，加上导出栏，否则普通渲染
                 if (msg.role === 'bot') {
                     const actionBars = `<div class="msg-action-bar">
                                          <button class="mini-tool-btn" onclick="exportSingleMsg(this, 'pdf')">📄 导出PDF</button>
                                          <button class="mini-tool-btn" onclick="exportSingleMsg(this, 'doc')">📝 导出Doc</button>
                                         </div>`;
                     appendMsg(roleClass, copyBtn + htmlContent + actionBars);
                 } else {
                     appendMsg(roleClass, copyBtn + htmlContent);
                 }
             });
        }
    });
}

// 删除某一条会话
function deleteSession(event, sessId) {
    event.stopPropagation(); // 阻止触发 switchSession
    if(!confirm("确认删除这条历史记录吗？")) return;
    const apiKey = document.getElementById('cfgApiKey').value.trim();
    fetch('/delete_session', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ session_id: sessId, api_key: apiKey })
    }).then(() => {
        if(currentSessionId === sessId) createNewSession();
        loadSessions();
    });
}
// ==================== 导出文档功能模块 ====================
function exportChat(type) {
    const wrappers = document.querySelectorAll('#chatBox .msg-wrapper');
    // 如果只有预设的一条欢迎语说明没有真正对话
    if(wrappers.length <= 1) { 
        alert("⚠️ 当前没有可导出的对话记录！");
        return;
    }

    // 1. 提取并清理对话内容，生成纯净版 HTML
    let htmlContent = '<div style="font-family: Arial, Microsoft YaHei, sans-serif; color: #111827;">';
    htmlContent += '<h2 style="text-align:center; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">AI 对话导出记录</h2>';
    
    wrappers.forEach(w => {
        const isUser = w.classList.contains('user');
        const roleName = isUser ? '我' : 'AI 助手';
        const roleColor = isUser ? '#3b82f6' : '#10b981'; // 用户蓝，AI绿
        
        // 深度拷贝 DOM 节点，防止破坏当前页面UI
        const bubbleNode = w.querySelector('.msg-bubble').cloneNode(true);
        // 清理掉影响阅读的控件（比如复制按钮、Token消耗提示）
        bubbleNode.querySelectorAll('.copy-all-btn, .token-block').forEach(el => el.remove());
        
        htmlContent += `
        <div style="margin-bottom: 20px; page-break-inside: avoid;">
            <div style="font-weight: bold; font-size: 16px; color: ${roleColor}; margin-bottom: 5px;">${roleName}：</div>
            <div style="background: ${isUser ? '#f3f4f6' : '#ffffff'}; padding: 12px; border-radius: 8px; line-height: 1.6; font-size: 14px; border: ${isUser ? 'none' : '1px solid #e5e7eb'};">
                ${bubbleNode.innerHTML}
            </div>
        </div>`;
    });
    htmlContent += '</div>';

    // 2. 格式化文件名的时间戳
    const timestamp = new Date().toLocaleDateString().replace(/\//g, '') + "_" + new Date().getHours() + new Date().getMinutes();
    const fileName = `对话记录_${timestamp}`;

    // 3. 执行导出
    if (type === 'pdf') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.padding = '20px';
        
        // 初始化 html2pdf 配置
        html2pdf().set({
            margin: 10,
            filename: `${fileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(tempDiv).save();
        
    } else if (type === 'doc') {
        // 构建兼容微软 Word 编码的 HTML 结构，并转为 Blob 数据流
        const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Chat Export</title></head>
        <body>${htmlContent}</body></html>`;
        
        const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
// ==================== 单条 AI 回复内容导出引擎 ====================
function exportSingleMsg(btn, type) {
    // 1. 抓取当前按钮所在的完整对话气泡
    const bubble = btn.closest('.msg-bubble');
    if (!bubble) return;
    
    // 2. 深度克隆节点，以免破坏当前网页展示
    const cloneNode = bubble.cloneNode(true);
    // 剔除不需要导出的按钮和不需要的UI元素
    cloneNode.querySelectorAll('.copy-all-btn, .msg-action-bar').forEach(el => el.remove());
    
    // 3. 构建供打印的干净 HTML 外壳（加入内联样式以兼容 Word/PDF）
    const htmlContent = `
    <div style="font-family: 'Microsoft YaHei', sans-serif; color: #111827; line-height: 1.6; font-size: 14pt;">
        ${cloneNode.innerHTML}
    </div>`;
    
    const timestamp = new Date().getTime().toString().slice(-6);
    const fileName = `AI专项回复_${timestamp}`;
    
    // 4. 执行单独生成
    if (type === 'pdf') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.padding = '15px';
        
        btn.innerText = "⏳ 处理中...";
        html2pdf().set({
            margin: 15,
            filename: `${fileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true }, 
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(tempDiv).save().then(() => {
            btn.innerText = "📄 导出PDF";
        });
        
    } else if (type === 'doc') {
        const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>AI Export</title></head>
        <body>${htmlContent}</body></html>`;
        
        const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
// 快捷发送函数（供技能系统调用）
window.sendQuickPrompt = function(text) {
    document.getElementById('chatInput').value = text;
    sendMessage();
};

// 设置 CF 难度范围并刷新每日一题
window.setCFRange = function(min, max) {
    window.cf_rating_min = min;
    window.cf_rating_max = max;
    showToast(`已设置难度范围：${min}-${max}`);
    
    // 如果当前在竞赛技能，自动获取新题
    if (currentSkillId === 'competition') {
        // 触发获取（通过发送命令或调用方法）
        fetch('/cf_daily', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rating_min: min, rating_max: max})
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success') {
                renderDailyProblemCard(data.problem);
            }
        });
    }
};

// 全局 Toast 提示（简单版）
window.showToast = function(msg, duration=2000) {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: #1f2937; color: white; 
        padding: 12px 20px; border-radius: 8px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        z-index: 1000; font-size: 13px;
        animation: slideIn 0.3s ease;
    `;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), duration);
};

// 渲染每日一题卡片到聊天框（全局可用）
// window.renderDailyProblemCard = function(p) {
//     const chatBox = document.getElementById('chatBox');
//     if (!chatBox) return;
    
//     const wrapper = document.createElement('div');
//     wrapper.className = 'msg-wrapper bot';
//     wrapper.style.animation = 'fadeIn 0.5s ease';
    
//     wrapper.innerHTML = `
//         <div class="avatar bot">🏆</div>
//         <div class="msg-bubble" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 12px; max-width: 100%;">
//             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:8px;">
//                 <div style="font-weight:700; font-size:15px;">📅 今日 Codeforces 推荐</div>
//                 <span style="background:rgba(255,255,255,0.2); padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600;">${p.difficulty_emoji} ${p.rating}</span>
//             </div>
            
//             <div style="font-weight:600; font-size:16px; margin-bottom:8px; line-height:1.4;">
//                 ${p.name}
//             </div>
            
//             <div style="opacity:0.95; margin-bottom:12px; font-size:13px; display:flex; flex-wrap:wrap; gap:6px;">
//                 ${p.tags.map(tag => `<span style="background:rgba(255,255,255,0.15); padding:2px 8px; border-radius:4px; font-size:11px;">${tag}</span>`).join('')}
//             </div>
            
//             <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
//                 <a href="${p.url}" target="_blank" style="background:rgba(255,255,255,0.95); color:#764ba2; padding:6px 14px; border-radius:6px; text-decoration:none; font-weight:600; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
//                     🔗 打开题目
//                 </a>
//                 <button onclick="sendQuickPrompt('请帮我分析 CF ${p.contestId}${p.index} 的解法，题目：${p.name}，难度${p.rating}')" 
//                         style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.3); color:white; padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">
//                     💡 获取题解
//                 </button>
//                 <button onclick="window.open('https://codeforces.com/contest/${p.contestId}/submission', '_blank')"
//                         style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">
//                     👥 查看题解区
//                 </button>
//             </div>
            
//             <div style="margin-top:10px; font-size:11px; opacity:0.7; text-align:right;">
//                 题目编号: ${p.contestId}${p.index} | 通过人数: ${p.solved_count}
//             </div>
//         </div>
//     `;
    
//     // 插入到聊天框末尾
//     chatBox.appendChild(wrapper);
//     chatBox.scrollTop = chatBox.scrollHeight;
// };
// 处理 /daily 命令
async function handleDailyCommand(forceRefresh = false) {
    const loadingMsg = appendMsg('bot', '<span style="color:#9ca3af;">🏆 正在从 Codeforces 获取' + (forceRefresh ? '新' : '今日') + '推荐...</span>');
    
    try {
        const res = await fetch('/cf_daily', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                rating_min: window.cfState.ratingMin,
                rating_max: window.cfState.ratingMax,
                refresh: forceRefresh,
                session_id: currentSessionId || 'default'
            })
        });
        
        const data = await res.json();
        loadingMsg.remove();
        
        if (data.status === 'success') {
            // 保存到全局状态
            window.cfState.currentProblem = data.problem;
            // 渲染卡片
            renderDailyProblemCard(data.problem, true); // true = 显示"当前讨论"
        } else {
            appendMsg('bot', `❌ 获取失败：${data.message}`);
        }
    } catch (err) {
        loadingMsg.remove();
        appendMsg('bot', `❌ 网络错误`);
    }
}

// 修改 renderDailyProblemCard，增加"当前题目"视觉提示
window.renderDailyProblemCard = function(p, isCurrent = false) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    
    // 如果是新题目，移除旧的"当前题目"标记
    if (isCurrent) {
        document.querySelectorAll('.cf-current-marker').forEach(el => el.remove());
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper bot';
    if (isCurrent) wrapper.classList.add('cf-current-marker');
    wrapper.style.animation = 'fadeIn 0.5s ease';
    
    const currentBadge = isCurrent ? 
        `<div style="position:absolute; top:-8px; left:-8px; background:#10b981; color:white; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">当前题目</div>` : '';
    
    wrapper.innerHTML = `
        <div class="avatar bot">🏆</div>
        <div class="msg-bubble" style="position:relative; ${isCurrent ? 'border:2px solid #10b981;' : ''} background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; border-radius: 12px; max-width: 100%;">
            ${currentBadge}
            <!-- 原有卡片内容 -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:8px;">
                <div style="font-weight:700; font-size:15px;">📅 ${isCurrent ? '当前推荐' : 'Codeforces 推荐'}</div>
                <span style="background:rgba(255,255,255,0.2); padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600;">${p.difficulty_emoji} ${p.rating}</span>
            </div>
            
            <div style="font-weight:600; font-size:16px; margin-bottom:8px; line-height:1.4;">
                ${p.name}
            </div>
            
            <div style="opacity:0.95; margin-bottom:12px; font-size:13px; display:flex; flex-wrap:wrap; gap:6px;">
                ${p.tags.map(tag => `<span style="background:rgba(255,255,255,0.15); padding:2px 8px; border-radius:4px; font-size:11px;">${tag}</span>`).join('')}
            </div>
            
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <a href="${p.url}" target="_blank" style="background:rgba(255,255,255,0.95); color:#764ba2; padding:6px 14px; border-radius:6px; text-decoration:none; font-weight:600; font-size:12px;">
                    🔗 打开题目
                </a>
                <button onclick="startSolvingThis()" style="background:#10b981; border:none; color:white; padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">
                    🚀 解决这题
                </button>
                <button onclick="sendQuickPrompt('/daily new')" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.3); color:white; padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">
                    🔄 换一题
                </button>
            </div>
        </div>
    `;
    
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
};

// 一键开始解决当前题目
window.startSolvingThis = function() {
    if (!window.cfState.currentProblem) {
        alert('先获取题目推荐');
        return;
    }
    const p = window.cfState.currentProblem;
    const prompt = `请帮我分析并解决这道题：Codeforces ${p.contestId}${p.index} ${p.name}。

题目信息：
- 难度：Rating ${p.rating}
- 标签：${p.tags.join(', ')}
- 链接：${p.url}

请提供：
1. 题意理解
2. 算法思路
3. 关键代码实现（C++17）
4. 复杂度分析`;
    
    sendQuickPrompt(prompt);
};
// ==================== 投资组合管理系统 ====================
const PortfolioApp = {
    data: {
        totalAsset: 100914.99,
        monthlyIncome: 5000,
        monthlyTarget: 500,
        totalDividend: 2213.06,
        priceYield: 4,
        costYield: 4,
        holdings: [
            {
                id: 1,
                name: "波场",
                code: "TRX",
                price: 1,
                shares: 239344,
                yield: 20.73,
                dividendMonths: [1,2,3,4,5,6,7,8,9,10,11, 12],
                annualDividend: 0
            },
             {
                id: 2,
                name: "红利低波100",
                code: "159307",
                price: 1,
                shares: 200000,
                yield: 4.77,
                dividendMonths: [3,6,9,12],
                annualDividend: 0
            },
      {
      id: 3,
      name: "长江电力",
      code: "600900",
      price: 1,
      shares: 100000,
      yield: 3.8,
      dividendMonths: [1,7],
      annualDividend: 3800
    },
    {
      id: 4,
      name: "招商银行",
      code: "600036",
      price: 1,
      shares: 100000,
      yield: 5.12,
      dividendMonths: [1,7],
      annualDividend: 5120
    }
        ],
        monthlyData: {
            received: [0, 0, 0,0, 0, 0, 0, 0, 0, 0, 0,0],
            announced: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            predicted: [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        }
    },
    
    chart: null,

    init() {
        this.loadData();
        this.render();
        this.initChart();
        
        // 监听页面切换，初始化图表
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.target.id === 'portfolioPage' && m.target.classList.contains('active')) {
                    setTimeout(() => this.initChart(), 100);
                }
            });
        });
        const page = document.getElementById('portfolioPage');
        if (page) observer.observe(page, { attributes: true });
    },
// ✅ 添加这行：把 showToast 挂到 PortfolioApp 上
    showToast(msg, duration = 2000) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, duration);
        } else {
            // 备用：如果全局 showToast 不存在，使用 alert
            alert(msg);
        }
    },
    loadData() {
        const saved = localStorage.getItem('portfolioData');
        if (saved) {
            this.data = JSON.parse(saved);
        }
        this.calculateMetrics();
    },

    saveData() {
        localStorage.setItem('portfolioData', JSON.stringify(this.data));
        this.calculateMetrics();
        this.render();
        if (this.chart) this.updateChart();
    },

    calculateMetrics() {
        // 重新计算总分红、收益率等
        let totalDividend = 0;
        this.data.holdings.forEach(h => {
            h.annualDividend = Math.round(h.price * h.shares * (h.yield / 100));
            totalDividend += h.annualDividend;
        });
        this.data.totalDividend = totalDividend;
        this.data.priceYield = (totalDividend / this.data.totalAsset * 100).toFixed(2);
        
        // 计算月度分布
        const monthly = new Array(12).fill(0);
        this.data.holdings.forEach(h => {
            const perTime = h.annualDividend / h.dividendMonths.length;
            h.dividendMonths.forEach(m => {
                monthly[m-1] += perTime;
            });
        });
        this.data.monthlyData.received = monthly;
    },
// 更新 PortfolioApp 的 render 方法（替换原 render 函数）
render() {
    // 顶部数据
    const editInput = document.getElementById('editTotalAsset');
    if (editInput) editInput.value = this.data.totalAsset;
    
    // 关键指标
    const monthlyIncome = this.data.holdings.reduce((sum, h) => {
        return sum + (h.annualDividend / 12);
    }, 0);
    
    document.getElementById('displayMonthlyIncome').textContent = '¥' + Math.round(monthlyIncome).toLocaleString();
    document.getElementById('displayTotalDividend').textContent = '¥' + this.data.totalDividend.toLocaleString();
    document.getElementById('displayPriceYield').textContent = this.data.priceYield + '%';
    document.getElementById('displayCostYield').textContent = this.data.costYield + '%';
    document.getElementById('displayYearTotal').textContent = '¥' + this.data.totalDividend.toLocaleString();
    
    // 进度条
    const progress = Math.min(100, (monthlyIncome / 8000 * 100)).toFixed(0);
    const progressEl = document.querySelector('.progress-fill');
    const progressText = document.getElementById('incomeProgress');
    if (progressEl) progressEl.style.width = progress + '%';
    if (progressText) progressText.textContent = `目标达成 ${progress}%`;

    // 持仓列表
// 渲染持仓列表
const list = document.getElementById('holdingsList');
if (!list) return;

// 先计算总市值（用于计算占比）
const totalMarketValue = this.data.holdings.reduce((sum, stock) => {
    return sum + (stock.price * stock.shares);
}, 0);

// 更新顶部总市值标签
const totalBadge = document.getElementById('totalHoldingValue');
if (totalBadge) {
    totalBadge.textContent = '¥' + Math.round(totalMarketValue).toLocaleString();
}

if (this.data.holdings.length === 0) {
    list.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📈</div>
            <div class="empty-title">暂无持仓记录</div>
            <div class="empty-desc">点击右上角"新增持仓"开始记录您的投资</div>
        </div>
    `;
    return;
}

// 渲染持仓项（带占比）
list.innerHTML = this.data.holdings.map(stock => {
    const totalValue = stock.price * stock.shares;
    // 计算占比（避免除以0）
    const percentage = totalMarketValue > 0 
        ? ((totalValue / totalMarketValue) * 100).toFixed(1) 
        : 0;
    
    return `
    <div class="holding-compact" onclick="PortfolioApp.editStock(${stock.id})">
        <button class="btn-del-compact" onclick="event.stopPropagation(); PortfolioApp.deleteStock(${stock.id})" title="删除">
            🗑️
        </button>
        
        <div class="holding-top">
            <div class="holding-name">
                ${stock.name}
                <span class="holding-code">${stock.code}</span>
                <span class="holding-yield-tag">${stock.yield}%</span>
            </div>
            <div class="holding-value-wrapper">
                <span class="holding-percentage">${percentage}%</span>
                <div class="holding-value-main">¥${totalValue.toLocaleString()}</div>
            </div>
        </div>
        
        <div class="holding-bottom">
            <div class="holding-shares-detail">
                <span>¥${stock.price} × ${stock.shares.toLocaleString()}股</span>
                <span class="holding-dividend">年化 ¥${stock.annualDividend.toLocaleString()}</span>
            </div>
        </div>
        
        <div class="holding-months-compact">
            ${stock.dividendMonths.map(m => `<div class="month-tag-compact">${m}月</div>`).join('')}
        </div>
    </div>
    `;
}).join('');
    // 更新图表
    if (this.chart) this.updateChart();
},
// ==================== JSON 导入/导出功能 ====================

// 导出持仓数据为 JSON 文件
exportJSON() {
    const exportData = {
        version: "1.0",
        exportTime: new Date().toISOString(),
        summary: {
            totalAsset: this.data.totalAsset,
            monthlyTarget: this.data.monthlyTarget || 8000,
            totalDividend: this.data.totalDividend,
            holdingCount: this.data.holdings.length
        },
        holdings: this.data.holdings.map(h => ({
            id: h.id,
            name: h.name,
            code: h.code,
            price: h.price,
            shares: h.shares,
            yield: h.yield,
            dividendMonths: h.dividendMonths,
            annualDividend: h.annualDividend
        }))
    };

    // 创建下载
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // 文件名包含日期
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    link.download = `投资组合_${dateStr}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // 提示
    this.showToast('✅ 持仓数据已导出');
},

// 触发导入文件选择
importJSON() {
    document.getElementById('jsonImportInput').click();
},

// 处理导入的文件
handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // 验证数据格式
            if (!data.holdings || !Array.isArray(data.holdings)) {
                throw new Error('无效的JSON格式：缺少holdings数组');
            }

            // 确认是否覆盖
            if (this.data.holdings.length > 0) {
                if (!confirm(`检测到 ${data.holdings.length} 条持仓记录。\n是否覆盖当前 ${this.data.holdings.length} 条记录？`)) {
                    event.target.value = ''; // 清空input
                    return;
                }
            }

            // 导入数据
            this.data.holdings = data.holdings.map(h => ({
                id: h.id || Date.now() + Math.random(),
                name: h.name,
                code: h.code,
                price: parseFloat(h.price),
                shares: parseInt(h.shares),
                yield: parseFloat(h.yield),
                dividendMonths: h.dividendMonths || [],
                annualDividend: h.annualDividend || Math.round(h.price * h.shares * (h.yield / 100))
            }));

            // 导入其他设置（如果存在）
            if (data.summary) {
                this.data.totalAsset = data.summary.totalAsset || this.data.totalAsset;
                this.data.monthlyTarget = data.summary.monthlyTarget || this.data.monthlyTarget;
            }

            // 保存并刷新
            this.saveData();
            this.render();
            this.showToast(`✅ 成功导入 ${data.holdings.length} 条持仓记录`);

        } catch (err) {
            alert('❌ 导入失败：' + err.message);
            console.error('Import error:', err);
        }
        
        // 清空input，允许重复导入同一文件
        event.target.value = '';
    };
    
    reader.readAsText(file);
},

// 改进的导出数据方法（包含完整信息）
exportData() {
    // 备用导出方法，复制exportJSON的功能
    this.exportJSON();
},

    initChart() {
        const ctx = document.getElementById('dividendChart');
        if (!ctx) return;
        
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
                datasets: [
                    {
                        data: this.data.monthlyData.received,
                        backgroundColor: '#14b8a6',
                        borderRadius: 4,
                        label: '已收到'
                    },
                    {
                        data: this.data.monthlyData.announced,
                        backgroundColor: '#f59e0b',
                        borderRadius: 4,
                        label: '已宣布'
                    },
                    {
                        data: this.data.monthlyData.predicted,
                        backgroundColor: '#86efac',
                        borderRadius: 4,
                        label: '预测'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => '¥' + ctx.raw.toFixed(0)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f3f4f6', drawBorder: false },
                        ticks: {
                            callback: (v) => '¥' + v,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    },

    updateChart() {
        if (!this.chart) return;
        this.chart.data.datasets[0].data = this.data.monthlyData.received;
        this.chart.update();
    },

    updateAsset(value) {
        this.data.totalAsset = parseFloat(value);
        this.saveData();
    },

    // 模态框操作
    openModal(editId = null) {
        const modal = document.getElementById('stockModal');
        const form = document.getElementById('stockForm');
        const title = document.getElementById('modalTitle');
        
        if (editId) {
            const stock = this.data.holdings.find(h => h.id === editId);
            title.textContent = '编辑股票';
            document.getElementById('stockId').value = stock.id;
            document.getElementById('stockName').value = stock.name;
            document.getElementById('stockCode').value = stock.code;
            document.getElementById('stockPrice').value = stock.price;
            document.getElementById('stockShares').value = stock.shares;
            document.getElementById('stockYield').value = stock.yield;
            
            // 勾选月份
            document.querySelectorAll('.month-chip input').forEach(cb => {
                cb.checked = stock.dividendMonths.includes(parseInt(cb.value));
            });
        } else {
            title.textContent = '添加股票';
            form.reset();
            document.getElementById('stockId').value = '';
            document.querySelectorAll('.month-chip input').forEach(cb => cb.checked = false);
        }
        
        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('stockModal').classList.remove('active');
    },

    saveStock(e) {
        e.preventDefault();
        const id = document.getElementById('stockId').value;
        const months = Array.from(document.querySelectorAll('.month-chip input:checked'))
            .map(cb => parseInt(cb.value));
        
        const stockData = {
            id: id ? parseInt(id) : Date.now(),
            name: document.getElementById('stockName').value,
            code: document.getElementById('stockCode').value,
            price: parseFloat(document.getElementById('stockPrice').value),
            shares: parseInt(document.getElementById('stockShares').value),
            yield: parseFloat(document.getElementById('stockYield').value),
            dividendMonths: months
        };
        
        if (id) {
            const idx = this.data.holdings.findIndex(h => h.id === parseInt(id));
            this.data.holdings[idx] = stockData;
        } else {
            this.data.holdings.push(stockData);
        }
        
        this.saveData();
        this.closeModal();
    },

    editStock(id) {
        this.openModal(id);
    },

    deleteStock(id) {
        if (!confirm('确定删除这只股票？')) return;
        this.data.holdings = this.data.holdings.filter(h => h.id !== id);
        this.saveData();
    },

    // AI分析功能
    analyzeWithAI() {
        const prompt = `请分析我的投资组合：
总资产：¥${this.data.totalAsset}
持仓：${this.data.holdings.map(h => `${h.name}(${h.code}) ${h.shares}股，股息率${h.yield}%`).join('，')}
年度总分红：¥${this.data.totalDividend}
价格股息率：${this.data.priceYield}%

请给出：
1. 风险评估
2. 分红稳定性分析
3. 优化建议`;
        
        // 切换到聊天页并发送
        document.getElementById('chatInput').value = prompt;
        switchTab('chatPage', document.querySelector('.nav-item'));
        sendMessage();
    }
};

// 全局函数
function openAddModal() { PortfolioApp.openModal(); }
function closeModal() { PortfolioApp.closeModal(); }
function saveStock(e) { PortfolioApp.saveStock(e); }
function updateAsset(v) { PortfolioApp.updateAsset(v); }

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 动态加载 Chart.js
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => PortfolioApp.init();
        document.head.appendChild(script);
    } else {
        PortfolioApp.init();
    }
});