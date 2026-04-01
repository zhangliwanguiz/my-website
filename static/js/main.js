
        // 【新增】全局变量，用于记录当前的会话ID
    let currentSessionId = null;
        // 【新增逻辑】读取/保存 API 配置


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
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    element.classList.add('active');
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
    
    let userDisplay = txt;
    if(window.pendingUploads.length > 0) {
        const attachNames = window.pendingUploads.map(f => `[${f.name}]`).join(' ');
        userDisplay = txt ? `${txt}<br><span style="color:#0369a1; font-size:12px;">${attachNames}</span>` : `<span style="color:#0369a1; font-size:12px;">发了附件 ${attachNames} 对其进行运算...</span>`;
    }

    const encodedUserText = encodeURIComponent(txt || window.pendingUploads.map(f => f.name).join(' '));
    const finalUserHtml = `<button class="copy-all-btn" data-raw="${encodedUserText}" onclick="copyFullMsg(this)">复制全部</button>` + userDisplay;
    appendMsg('user', finalUserHtml);
    if(!customText) input.value = '';
    
    const filesDataPayload = [...window.pendingUploads];
    window.pendingUploads = [];
    renderAttachments();

    const loadingMsg = appendMsg('bot', '<span style="color:#9ca3af;">云端运算中...</span>');
    const targetBubble = loadingMsg.querySelector('.msg-bubble');

    // 【修改点：核心请求逻辑】
    fetch('/chat', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            text: txt, 
            model: document.getElementById('modelSelect').value, 
            files: filesDataPayload,
            api_url: document.getElementById('cfgApiUrl').value.trim(),  
            api_key: document.getElementById('cfgApiKey').value.trim(),
            session_id: currentSessionId // 【关键新增】：告诉后端当前是在哪个会话聊天
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
            finalHtml = `<button class="copy-all-btn" data-raw="${encodedRawStr}" onclick="copyAiFullMsg(this)">复制全部</button>` 
                        + finalHtml 
                        + `<br><div class="token-block">⚡ 本次消耗 Token: <b>${tokensUsed}</b></div>`;
        }

        targetBubble.innerHTML = finalHtml;
        requestAnimationFrame(() => { const box = document.getElementById('chatBox'); box.scrollTop = box.scrollHeight; });
    }).catch(err => { targetBubble.innerHTML = "⚠️ 网络或接口异常。"; });
}
       
        function copyAiFullMsg(btn) {
            const str = decodeURIComponent(btn.getAttribute('data-raw'));
            navigator.clipboard.writeText(str).then(() => { btn.innerText="成功✓"; setTimeout(()=>btn.innerText="复制全部", 2000); });
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
                 appendMsg(roleClass, copyBtn + htmlContent);
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
