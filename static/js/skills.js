/**
 * Skill Center Manager - Markdown 驱动版本
 * 架构：每个技能 = 一个 .md 文件 (YAML Front Matter + Prompt 正文)
 * 只需添加 .md 文件到 /static/skills/ 目录并注册到 skillFiles 数组即可
 */

// ==================== 配置区：添加新技能只需修改这里 ====================
const SKILL_CENTER = {
    // 查看技能库总密码（默认: 123456）
    passwordHash: "MTIzNDU2",
    title: "🔒 技能中心",
    isUnlocked: false,
    
    // 【关键】要加载的 MD 技能文件列表（相对于 /static/skills/）
    // 添加新技能：新建 .md 文件，然后在此数组中添加文件名
    skillFiles: ['audit.md', 'exam.md', 'translator.md','competition.md']
};

// ==================== 状态管理 ====================
let currentSkillId = 'chat';
let loadedSkills = []; // 解析后的技能数据缓存

// ==================== MD 解析器核心 ====================
const SkillParser = {
    
    /**
     * 解析 Markdown 内容为结构化数据
     * 格式：
     * ---
     * id: audit
     * name: 代码审核
     * password: 123456  (或 passwordHash: MTIzNDU2)
     * ---
     * [Prompt 正文]
     */
    parse(content, filename) {
        // 匹配 YAML Front Matter
        const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
        if (!match) {
            console.error(`[SkillParser] ${filename} 格式错误：缺少 Front Matter`);
            return null;
        }

        const yamlText = match[1].trim();
        const promptText = match[2].trim();

        // 简单 YAML 解析（Key: Value 格式）
        const metadata = {};
        yamlText.split('\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();
                // 去除可能的引号
                value = value.replace(/^["'](.*)["']$/, '$1');
                metadata[key] = value;
            }
        });

        // 处理密码：支持明文 password 或密文 passwordHash
        let finalPasswordHash = metadata.passwordHash || '';
        if (!finalPasswordHash && metadata.password) {
            // 如果有明文密码，自动转为 Base64
            finalPasswordHash = btoa(metadata.password);
        }

        return {
            id: metadata.id || filename.replace('.md', ''),
            name: metadata.name || metadata.id || '未命名技能',
            icon: metadata.icon || '🔧',
            description: metadata.description || '暂无描述',
            version: metadata.version || '1.0',
            category: metadata.category || 'general',
            author: metadata.author || 'Anonymous',
            passwordHash: finalPasswordHash,
            prompt: promptText,
            capabilities: metadata.capabilities ? metadata.capabilities.split(',').map(s => s.trim()) : [],
            rawMetadata: metadata
        };
    },

    /**
     * 加载单个 MD 文件
     */
    async loadFile(filename) {
        try {
            const response = await fetch(`/static/skills/${filename}?t=${Date.now()}`); // 加时间戳防缓存
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            return this.parse(text, filename);
        } catch (err) {
            console.error(`[SkillManager] 加载 ${filename} 失败:`, err);
            return null;
        }
    },

    /**
     * 批量加载所有配置的技能文件
     */
    async loadAll() {
        const promises = SKILL_CENTER.skillFiles.map(f => this.loadFile(f));
        const results = await Promise.all(promises);
        loadedSkills = results.filter(s => s !== null);
        
        // 按名称排序
        loadedSkills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        
        console.log(`[SkillManager] 成功加载 ${loadedSkills.length} 个技能`);
        return loadedSkills;
    }
};

// ==================== UI 管理器 ====================
const SkillManager = {

    /**
     * 解锁技能中心并加载所有 MD 技能
     */
    async unlock(element) {
        if (SKILL_CENTER.isUnlocked) {
            this.toggleMenu();
            return;
        }

        const pwd = prompt(`🔐 ${SKILL_CENTER.title}\n\n请输入管理密码解锁技能库：`);
        if (!pwd) return;

        if (btoa(pwd) === SKILL_CENTER.passwordHash) {
            SKILL_CENTER.isUnlocked = true;
            
            // 更新 UI 为解锁状态
            element.innerHTML = `<span style="margin-right:8px;">🔓</span><span>技能中心</span><span style="margin-left:auto; font-size:11px; color:#10b981;">已解锁</span>`;
            element.classList.add('skill-unlocked');
            element.style.background = '#f0f9ff';
            element.style.borderColor = '#3b82f6';

            // 加载并渲染技能
            await SkillParser.loadAll();
            this.renderSkillsList();
            this.expandMenu();
        } else {
            alert("❌ 密码错误，无法访问技能库");
        }
    },

    /**
     * 渲染技能列表到侧边栏
     */
    renderSkillsList() {
        const container = document.getElementById('skillsSubMenu');
        if (!container) return;

        if (loadedSkills.length === 0) {
            container.innerHTML = `<div style="font-size:12px; color:#ef4444; padding:10px;">⚠️ 暂无可用技能</div>`;
            return;
        }

        container.innerHTML = '';
        loadedSkills.forEach(skill => {
            const el = document.createElement('div');
            el.className = 'nav-item skill-sub-item';
            el.setAttribute('data-skill-id', skill.id);
            el.style.cssText = 'font-size:13px; padding:8px 12px; margin-bottom:4px; background:rgba(59,130,246,0.05); display:flex; align-items:center; cursor:pointer; border-radius:8px;';
            el.innerHTML = `
                <span style="margin-right:8px; font-size:16px;">${skill.icon}</span>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skill.name}</div>
                    <div style="font-size:11px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skill.description}</div>
                </div>
            `;
            el.onclick = () => this.activateSkill(skill.id);
            container.appendChild(el);
        });
    },

    /**
     * 激活指定技能
     */
    activateSkill(skillId) {
        const skill = loadedSkills.find(s => s.id === skillId);
        if (!skill) return;

        // 验证该技能独立密码（如果有）
        // if (skill.passwordHash) {
        //     const pwd = prompt(`🔐 激活【${skill.name}】\n\n${skill.description}\n\n请输入该技能密码：`);
        //     if (!pwd) return;
        //     if (btoa(pwd) !== skill.passwordHash) {
        //         alert("❌ 密码错误，无法激活此技能");
        //         return;
        //     }
        // }

        currentSkillId = skillId;
        
        // 同步全局变量（兼容 main.js）
        if (typeof currentMode !== 'undefined') window.currentMode = skillId;
        
        // UI 更新
        document.querySelectorAll('.skill-sub-item').forEach(el => {
            el.classList.remove('active');
            el.style.background = 'rgba(59,130,246,0.05)';
        });
        const activeEl = document.querySelector(`[data-skill-id="${skillId}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
            activeEl.style.background = '#dbeafe';
        }

        // 切换页面
        if (typeof switchTab === 'function') switchTab('chatPage', activeEl || document.querySelector('.nav-item'));
        if (typeof createNewSession === 'function') createNewSession();
        
        // 显示欢迎语
        const chatBox = document.getElementById('chatBox');
        if (chatBox) {
            const welcome = `🎯 已激活【${skill.name}】${skill.version ? 'v' + skill.version : ''}\n\n${skill.description}\n\n💡 **能力标签**：${skill.capabilities.join(', ') || '通用'}`;
            chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble" style="white-space:pre-line;">${welcome}</div></div>`;
        }
if (skillId === 'competition') {
    currentSkillId = skillId;
    
    // 先显示欢迎
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">🏆</div><div class="msg-bubble">🎯 已激活【竞赛大师】<br><br>输入 <code>/daily</code> 获取今日推荐<br>输入 <code>/daily new</code> 刷新题目</div></div>`;
    
    // 自动获取题目（如果还没有）
    if (!window.cfState.currentProblem) {
        setTimeout(() => {
            // 调用 main.js 中的函数
            if (typeof handleDailyCommand === 'function') {
                handleDailyCommand(false);
            }
        }, 500);
    } else {
        // 重新显示当前题目
        setTimeout(() => {
            if (typeof renderDailyProblemCard === 'function') {
                renderDailyProblemCard(window.cfState.currentProblem, true);
            }
        }, 300);
    }
}
    },
// 添加新方法到 SkillManager
// 修改 skills.js 中的 fetchDailyProblem
async fetchDailyProblem() {
    try {
        // 如果全局函数存在，使用全局版本避免重复定义
        if (typeof renderDailyProblemCard !== 'function') {
            console.error('renderDailyProblemCard 未定义');
            return;
        }
        
        const rating_min = window.cf_rating_min || 1400;
        const rating_max = window.cf_rating_max || 1600;
        
        const res = await fetch('/cf_daily', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rating_min, rating_max})
        });
        
        const data = await res.json();
        
        if (data.status === 'success') {
            renderDailyProblemCard(data.problem);
        } else {
            console.error('获取每日一题失败:', data.message);
        }
    } catch (e) {
        console.error('获取每日一题失败:', e);
    }
},
    toggleMenu() {
        const menu = document.getElementById('skillsSubMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    },

    expandMenu() {
        const menu = document.getElementById('skillsSubMenu');
        if (menu) {
            menu.style.display = 'block';
            menu.style.opacity = '0';
            setTimeout(() => {
                menu.style.transition = 'opacity 0.3s';
                menu.style.opacity = '1';
            }, 10);
        }
    },

    getCurrentPrompt() {
        if (currentSkillId === 'chat') return '';
        const skill = loadedSkills.find(s => s.id === currentSkillId);
        return skill ? skill.prompt : '';
    }
};


// ==================== 全局 API ====================
window.unlockSkills = (el) => SkillManager.unlock(el);
window.getCurrentSkillPrompt = () => SkillManager.getCurrentPrompt();
window.switchMode = (mode, el) => {
    if (mode === 'chat') {
        currentSkillId = 'chat';
        if (typeof currentMode !== 'undefined') window.currentMode = 'chat';
        document.querySelectorAll('.mobile-nav-scroll .nav-item').forEach(n => {
            if (!n.classList.contains('skill-master') && !n.classList.contains('skill-sub-item')) n.classList.remove('active');
        });
        if (el) el.classList.add('active');
        if (typeof switchTab === 'function') switchTab('chatPage', el);
        if (typeof createNewSession === 'function') createNewSession();
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">已进入普通对话终端。</div></div>`;
    }
};

console.log('[SkillManager] MD 驱动技能系统已就绪，等待解锁...');