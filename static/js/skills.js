/**
 * 技能模块独立配置文件 - 层级版本
 * 增加技能中心概念：先验证总密码查看技能列表，再验证各自密码使用技能
 */

// ========== 技能中心配置（查看技能列表的密码） ==========
const SKILL_CENTER = {
    // 总密码Base64，默认"123456" -> MTIzNDU2
    // 如需修改：在浏览器控制台运行 btoa("你的密码") 替换此处
    passwordHash: "MTIzNDU2",
    title: "技能中心",
    isUnlocked: false  // 状态：是否已解锁查看列表
};

// ========== 各技能详细配置 ==========
const SKILL_CONFIG = {
    chat: {
        isSkill: false,
        title: "普通对话",
        welcomeMsg: "已进入普通对话终端。"
    },
    // 审核模块
    audit: {
        isSkill: true,
        title: "审核模块",
        passwordHash: "MTIzNDU2", // 使用密码：123456
        prompt: "请你输出a+b的c++代码。",
        welcomeMsg: "🛠️ 已开启【审核模块】。请发送需要审核的代码或文档。"
    },
    // 出卷模块
    exam: {
        isSkill: true,
        title: "出卷模块",
        passwordHash: "ODg4ODg4", // 使用密码：888888
        prompt: "你现在是一名顶级的算法与编程教研主管。你需要根据用户提供的知识点或学情要求，设计高质量的标准化试卷（包括单选、填空、阅读程序、编程大题等），必须附带详细的标准答案和解析。",
        welcomeMsg: "📝 已开启【出卷模块】。请输入考点、难度或受众信息。"
    }
};

let currentMode = 'chat'; // 当前激活的模式

// ========== 第一层：解锁技能中心（查看技能列表） ==========
function unlockSkills(element) {
    // 如果已经解锁，则切换显示/隐藏子菜单
    if (SKILL_CENTER.isUnlocked) {
        toggleSkillsMenu();
        return;
    }
    
    // 要求输入技能中心密码
    const pwdInput = prompt(`🔐 ${SKILL_CENTER.title}\n\n请输入访问密码以查看可用技能列表：`);
    if (pwdInput === null) return; // 用户取消
    
    // 验证密码
    if (btoa(pwdInput) !== SKILL_CENTER.passwordHash) {
        alert("❌ 密码错误，无法查看技能列表！");
        return;
    }
    
    // 验证通过，解锁并展开
    SKILL_CENTER.isUnlocked = true;
    
    // 修改UI显示为已解锁状态
    element.querySelector('span:first-child').textContent = "🔓";
    element.querySelector('.lock-icon-emoji').textContent = "✓";
    element.style.color = "#0369a1";
    element.style.background = "#f0f9ff";
    
    // 展开子菜单
    const subMenu = document.getElementById('skillsSubMenu');
    if (subMenu) {
        subMenu.style.display = 'block';
        // 添加展开动画效果
        subMenu.style.opacity = '0';
        setTimeout(() => {
            subMenu.style.transition = 'opacity 0.3s';
            subMenu.style.opacity = '1';
        }, 10);
    }
}

// 切换子菜单显示/隐藏（已解锁状态下点击）
function toggleSkillsMenu() {
    const subMenu = document.getElementById('skillsSubMenu');
    if (subMenu) {
        if (subMenu.style.display === 'none') {
            subMenu.style.display = 'block';
        } else {
            subMenu.style.display = 'none';
        }
    }
}

// ========== 第二层：切换具体技能（使用各自密码） ==========
function switchSkillMode(mode, element) {
    const config = SKILL_CONFIG[mode];
    if (!config) return;

    // 二次验证：使用具体技能的独立密码
    // if (config.isSkill) {
    //     const pwdInput = prompt(`🔐 技能解锁：${config.title}\n\n请输入该技能的专属密码以激活使用：`);
    //     if (pwdInput === null) return;
        
    //     if (btoa(pwdInput) !== config.passwordHash) {
    //         alert("❌ 密码错误，无法激活该技能！");
    //         return;
    //     }
    // }

    currentMode = mode;
    
    // 更新UI激活状态
    document.querySelectorAll('.mobile-nav-scroll .nav-item').forEach(n => {
        // 仅清除同级和子级的active，保留技能中心本身的状态
        if (!n.classList.contains('skill-master')) {
            n.classList.remove('active');
        }
    });
    element.classList.add('active');
    
    // 调用主逻辑
    if (typeof switchTab === 'function') switchTab('chatPage', element);
    if (typeof createNewSession === 'function') createNewSession();
    
    // 更新欢迎语
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">${config.welcomeMsg}</div></div>`;
    }
}

// 保留原函数名供兼容性调用（直接点击对话终端时使用）
function switchMode(mode, element) {
    if (mode === 'chat') {
        const config = SKILL_CONFIG[mode];
        currentMode = mode;
        
        document.querySelectorAll('.mobile-nav-scroll .nav-item').forEach(n => {
            if (!n.classList.contains('skill-master')) n.classList.remove('active');
        });
        element.classList.add('active');
        
        if (typeof switchTab === 'function') switchTab('chatPage', element);
        if (typeof createNewSession === 'function') createNewSession();
        
        const chatBox = document.getElementById('chatBox');
        if (chatBox) {
            chatBox.innerHTML = `<div class="msg-wrapper bot"><div class="avatar bot">AI</div><div class="msg-bubble">${config.welcomeMsg}</div></div>`;
        }
    }
}

// 暴露给 main.js 获取当前 system prompt
function getCurrentSkillPrompt() {
    return SKILL_CONFIG[currentMode]?.prompt || "";
}