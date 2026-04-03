/**
 * 技能插件：智能出卷系统
 * 文件：/static/js/skills/exam.js
 */

window.SkillRegistry = window.SkillRegistry || {};

window.SkillRegistry['exam'] = {
    metadata: {
        id: 'exam',
        name: '智能出卷系统',
        icon: '📝',
        version: '2.0.0',
        category: 'education',
        author: 'Teaching Team',
        description: '根据知识点、难度等级自动生成标准化试卷，包含题目、答案和详细解析',
        passwordHash: 'ODg4ODg4', // 原密码：888888
        supportedInputs: ['text', 'requirements'],
        capabilities: ['exam_generation', 'question_design', 'answer_analysis', 'difficulty_control'],
        
        // 扩展：该技能支持的参数（供高级使用）
        parameters: {
            difficulty: { type: 'enum', options: ['入门', '普及', '提高', '省选', 'NOI'], default: '普及' },
            questionTypes: { type: 'array', options: ['单选', '填空', '阅读程序', '完善程序', '编程大题'] },
            totalScore: { type: 'number', default: 100 }
        }
    },

    prompt: `你是一名拥有10年经验的算法竞赛教研主管。请根据用户提供的知识点要求，设计符合 CSP-J/S / NOIP 标准的竞赛试卷。

【出题规范】
- 难度分级明确，题目梯度合理
- 代码题要求提供：题目描述、输入输出格式、样例、数据范围、提示
- 客观题要求提供：选项、正确答案、详细解析

【输出结构】
1. 试卷概述（总分、难度、考察知识点）
2. 题目列表（按题型分类）
3. 标准答案与评分标准
4. 详细解析（解题思路、易错点、时间复杂度分析）

请确保题目原创性，避免直接复制现有竞赛题。`,

    // 技能特定的工具函数（AI 可调用）
    tools: {
        generateTemplate: function(difficulty) {
            return `【${difficulty}难度试卷模板】\n一、单选题（每题4分）...\n`;
        }
    }
};

console.log('[Skill] 出卷模块已注册');