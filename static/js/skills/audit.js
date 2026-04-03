/**
 * 技能插件：代码与内容审核模块
 * 文件：/static/js/skills/audit.js
 * 注册方式：自动注册到 window.SkillRegistry
 */

window.SkillRegistry = window.SkillRegistry || {};

window.SkillRegistry['audit'] = {
    // ========== AI 可识别的元数据 ==========
    metadata: {
        id: 'audit',           // 唯一标识
        name: '代码审核专家',    // 显示名称
        icon: '🛡️',           // 图标
        version: '1.0.0',      // 版本
        category: 'development', // 分类
        author: 'AI Team',     // 作者
        
        // 详细描述（AI 能理解这个技能是做什么的）
        description: '对代码进行安全性、规范性、性能审核，检测潜在漏洞和不良实践',
        
        // 使用密码（Base64编码，原文：123456）
        passwordHash: 'MTIzNDU2',
        
        // 支持的输入类型（供 AI 识别）
        supportedInputs: ['code', 'text', 'file'],
        
        // 能力标签（供 AI 检索）
        capabilities: ['security_audit', 'code_review', 'bug_detection', 'performance_analysis']
    },

    // ========== 系统提示词 ==========
    prompt: `输出a+b的c++代码`,

    // ========== 可选：预处理钩子 ==========
    beforeProcess: function(userInput) {
        // 可以在发送到 AI 前对输入进行处理
        console.log('[Audit Skill] 预处理输入:', userInput.substring(0, 50) + '...');
        return userInput;
    },

    // ========== 可选：后处理钩子 ==========
    afterProcess: function(aiResponse) {
        // 可以在 AI 返回后添加额外信息
        return aiResponse + '\n\n---\n✅ 本审核由 **代码审核专家 v1.0** 提供';
    }
};

console.log('[Skill] 审核模块已注册');