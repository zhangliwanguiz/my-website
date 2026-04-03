/**
 * Skill Center Manager (插件化技能系统)
 * 架构说明：
 * 1. 每个技能是独立文件，放在 /skills/ 文件夹
 * 2. 技能文件通过 window.SkillRegistry 注册
 * 3. 系统运行时动态扫描并加载技能列表
 * 4. 支持双层密码：查看技能中心 + 使用具体技能
 */

// ==================== 技能中心配置 ====================
const SKILL_CENTER = {
    // 查看技能列表的总密码（默认: 123456）
    passwordHash: "MTIzNDU2",
    title: "🔒 技能中心",
    isUnlocked: false,
    // 需要加载的技能文件列表（相对 /static/js/skills/ 路径）
    skillModules: ['audit.js', 'exam.js']
};

// ==================== 技能注册表（由各个技能文件填充） ====================
window.SkillRegistry = window.SkillRegistry || {};

// ==================== 当前激活状态 ====================
let currentSkillId = 'chat'; // 默认普通对话
let loadedSkills = []; // 已加载的技能元数据缓存

// ==================== 核心管理器 ====================
const SkillManager = {
    
    /**
     * 初始化：解锁技能中心后调用，加载所有技能文件
     */
    async loadAllSkills() {
        const loadPromises = SKILL_CENTER.skillModules.map(filename => this.loadSkillFile(filename));
        await Promise.all(loadPromises);
        this.renderSkillList();
    },

    /**
     * 动态加载单个技能文件（创建 script 标签）
     */
    loadSkillFile(filename) {
        return new Promise((resolve, reject) => {
            // 检查是否已加载
            if (document.querySelector(`script[data-skill="${filename}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = `/static/js/skills/${filename}`;
            script.setAttribute('data-skill', filename);
            script.onload = () => {
                console.log(`[SkillManager] 技能模块加载成功: ${filename}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`[SkillManager] 技能模块加载失败: ${filename}`);
                resolve(); // 失败也继续，不阻断其他技能
            };
            document.head.appendChild(script);
        });
    },

    /**
     * 解析已注册的技能，提取元数据
     */
    parseSkills() {
        loadedSkills = [];
        for (const [id, skillData] of Object.entries(window.SkillRegistry)) {
            if (skillData && skillData.metadata) {
                loadedSkills.push({
                    id: id,
                    name: skillData.metadata.name || id,
                    icon: skillData.metadata.icon || '🔧',
                    description: skillData.metadata.description || '',
                    passwordHash: skillData.metadata.passwordHash || '',
                    prompt: skillData.prompt || '',
                    version: skillData.metadata.version || '1.0'
                });
            }
        }
        // 按名称排序
        loadedSkills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        return loadedSkills;
    },

    /**
     * 渲染技能列表到侧边栏
     */
    renderSkillList() {
        this.parseSkills();
        const container = document.getElementById('skillsSubMenu');
        if (!container) return;

        // 清空并重新渲染
        container.innerHTML = '';
        
        loadedSkills.forEach(skill => {
            const skillEl = document.createElement('div');
            skillEl.className = 'nav-item skill-sub-item';
            skillEl.setAttribute('data-skill-id', skill.id);
            skillEl.style.cssText = 'font-size:13px; padding:8px 12px; margin-bottom:4px; background:rgba(59,130,246,0.05); display:flex; align-items:center;';
            skillEl.innerHTML = `
                <span style="margin-right:8px; font-size:14px;">${skill.icon}</span>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skill.name}</div>
                    <div style="font-size:11px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skill.description}</div>
                </div>
            `;
            skillEl.onclick = () => this.activateSkill(skill.id, skillEl);
            container.appendChild(skillEl);
        });
    },

    /**
     * 激活指定技能（带密码验证）
     */
    activateSkill(skillId, element) {
        const skill = loadedSkills.find(s => s.id === skillId);
        if (!skill) return;

        // 验证该技能的独立密码
        if (skill.passwordHash) {
            const pwd = prompt(`🔐 激活【${skill.name}】\n\n${skill.description}\n\n请输入该技能密码：`);
            if (pwd === null) return;
            if (btoa(pwd) !== skill.passwordHash) {
                alert("❌ 密码错误，无法激活此技能");
                return;
            }
        }

        currentSkillId = skillId;
        
        // UI 状态更新
        document.querySelectorAll('.skill-sub-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        
        // 同步 main.js 的 currentMode 变量（兼容性）
        if (typeof currentMode !== 'undefined') currentMode = skillId;
        
        // 触发主系统切换
        if (typeof switchTab === 'function') switchTab('chatPage', element);
        if (typeof createNewSession === 'function') createNewSession();
        
        // 更新欢迎语
        const welcome = `🎯 已激活【${skill.name}】v${skill.version}\n\n${skill.description}`;
        const chatBox = document.getElementById('chatBox');
        if (chatBox) {
            chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble" style="white-space:pre-line;">${welcome}</div></div>`;
        }
    },

    /**
     * 获取当前技能的 Prompt（供 main.js 调用）
     */
    getCurrentPrompt() {
        if (currentSkillId === 'chat') return '';
        const skill = window.SkillRegistry[currentSkillId];
        return skill ? (skill.prompt || '') : '';
    },

    /**
     * 查看技能中心（第一层密码）
     */
    unlock(element) {
        if (SKILL_CENTER.isUnlocked) {
            this.toggleMenu();
            return;
        }

        const pwd = prompt(`🔐 ${SKILL_CENTER.title}\n\n请输入管理密码查看技能库：`);
        if (!pwd) return;

        if (btoa(pwd) === SKILL_CENTER.passwordHash) {
            SKILL_CENTER.isUnlocked = true;
            element.innerHTML = `<span style="margin-right:8px;">🔓</span><span>技能中心</span><span style="margin-left:auto; font-size:11px; color:#10b981;">已解锁</span>`;
            element.classList.add('skill-unlocked');
            this.loadAllSkills(); // 加载所有技能文件
            this.expandMenu();
        } else {
            alert("❌ 密码错误，无法访问技能库");
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
    }
};

// ==================== 全局 API 暴露 ====================

// 供 index.html 的 onclick 调用
function unlockSkills(element) {
    SkillManager.unlock(element);
}

// 供 main.js 获取 prompt
function getCurrentSkillPrompt() {
    return SkillManager.getCurrentPrompt();
}

// 兼容原 switchMode（普通对话）
function switchMode(mode, element) {
    if (mode === 'chat') {
        currentSkillId = 'chat';
        if (typeof currentMode !== 'undefined') currentMode = 'chat';
        
        document.querySelectorAll('.mobile-nav-scroll .nav-item').forEach(n => {
            if (!n.id?.includes('skill')) n.classList.remove('active');
        });
        element.classList.add('active');
        
        if (typeof switchTab === 'function') switchTab('chatPage', element);
        if (typeof createNewSession === 'function') createNewSession();
        
        const chatBox = document.getElementById('chatBox');
        if (chatBox) {
            chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">已进入普通对话终端。</div></div>`;
        }
    }
}

console.log('[SkillManager] 技能中心管理器已加载，等待解锁...');