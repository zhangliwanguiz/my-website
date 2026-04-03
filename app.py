from flask import Flask, jsonify, render_template, request
import requests
import sqlite3
import time
import os
from datetime import datetime
import random
import re
import json # 新增依赖
# 新增：对话数据库路径
CHAT_DB_PATH = '/tmp/chat_data.db' if os.environ.get('VERCEL') else 'chat_data.db'
# 新增：初始化对话数据库表结构
def init_chat_db():
    conn = sqlite3.connect(CHAT_DB_PATH)
    c = conn.cursor()
    # 会话表：由 API Key 隔离
    c.execute('''CREATE TABLE IF NOT EXISTS sessions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, title TEXT, updated_at DATETIME)''')
    # 消息表：关联会话ID
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, role TEXT, content TEXT)''')
    conn.commit()
    conn.close()

init_chat_db()
app = Flask(__name__)

# 【修改点1】移除了全局写死的 API_KEY 和 API_URL

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  




@app.route('/get_sessions', methods=['POST'])
def get_sessions():
    try:
        api_key = request.json.get('api_key', '')
        if not api_key: 
            return jsonify({"status": "success", "data": []})
        
        conn = sqlite3.connect(CHAT_DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, title FROM sessions WHERE api_key=? ORDER BY updated_at DESC", (api_key,))
        rows = [{"id": r[0], "title": r[1]} for r in c.fetchall()]
        conn.close()
        
        return jsonify({"status": "success", "data": rows})
    except Exception as e:
        return jsonify({"status": "error", "message": f"{str(e)}"})

@app.route('/get_session_history', methods=['POST'])
def get_session_history():
    session_id = request.json.get('session_id')
    api_key = request.json.get('api_key')
    
    conn = sqlite3.connect(CHAT_DB_PATH)
    c = conn.cursor()
    # 安全校验：确保会话归属该密钥
    c.execute("SELECT id FROM sessions WHERE id=? AND api_key=?", (session_id, api_key))
    if not c.fetchone():
        conn.close()
        return jsonify({"status": "error", "message": "无权限或会话不存在"})
        
    c.execute("SELECT role, content FROM messages WHERE session_id=? ORDER BY id ASC", (session_id,))
    msgs = []
    for r in c.fetchall():
        role = r[0]
        content = json.loads(r[1])
        # 若是用户上传了文件的复杂结构，提取其中的纯文本供前端展示
        display_text = content if isinstance(content, str) else next((item['text'] for item in content if item.get('type') == 'text'), "🖼️ [包含图片/文件附件]")
        msgs.append({"role": role, "content": display_text})
    conn.close()
    return jsonify({"status": "success", "data": msgs})

@app.route('/delete_session', methods=['POST'])
def delete_session():
    session_id = request.json.get('session_id')
    api_key = request.json.get('api_key')
    conn = sqlite3.connect(CHAT_DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE id=? AND api_key=?", (session_id, api_key))
    c.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_text = data.get('text', '')
    selected_model = data.get('model', 'gpt-3.5-turbo')
    files_to_process = data.get('files', [])  
    
    api_url = data.get('api_url') or "https://api.bankofai.io/v1/chat/completions"
    api_key = data.get('api_key') or ""
    session_id = data.get('session_id') # 【新增】接收会话ID

    if not api_key:
        return jsonify({"status": "error", "reply": "⚠️ 请先在左上角设置中填写您的 API KEY。"})

    payload_content = []
    if user_text:
        payload_content.append({"type": "text", "text": user_text})
    
    for f_info in files_to_process:
        f_type = f_info.get('type')
        f_name = f_info.get('name')
        f_content = f_info.get('content')
        
        if f_type == 'image':
            payload_content.append({"type": "image_url", "image_url": {"url": f_content}})
        elif f_type == 'text':
            doc_text = f_content[:30000]
            payload_content.append({"type": "text", "text": f"\n\n[用户提供的重要附件 {f_name} 的内容如下，请参考上下文回答]:\n```\n{doc_text}\n```"})

    final_content = payload_content if len(payload_content) > 1 else user_text
    current_msg = {"role": "user", "content": final_content}
    
    # 【新增】数据库连接及上下文加载逻辑
    conn = sqlite3.connect(CHAT_DB_PATH)
    c = conn.cursor()
    
    if not session_id:
        # 新建会话：用前15个字符当标题
        title = user_text[:15] + "..." if user_text else "包含附件的新会话"
        c.execute("INSERT INTO sessions (api_key, title, updated_at) VALUES (?, ?, ?)", (api_key, title, datetime.now()))
        session_id = c.lastrowid
    
    # 提取过去的历史记录拼接上下文
    c.execute("SELECT role, content FROM messages WHERE session_id=? ORDER BY id ASC", (session_id,))
    history_messages = []
    for row in c.fetchall():
        history_messages.append({"role": row[0], "content": json.loads(row[1])})
        
    # 最终喂给大模型的完整上下文 = 历史记录 + 当前对话
    full_messages = history_messages + [current_msg]
    # --- 👇 添加以下新增逻辑skill 👇 ---
    system_skill = data.get('system_skill', '')
    if system_skill:
        # 在发送给大模型前，动态插入 System Prompt 层级的设定
        full_messages.insert(0, {"role": "system", "content": system_skill})

    try:
        response = requests.post(
            api_url, 
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": selected_model, "messages": full_messages, "stream": False, "temperature": 0.5, "enable_search": True},
        )
        if response.status_code == 200:
            res_json = response.json()
            reply_text = res_json['choices'][0]['message']['content']
            
            total_tokens = res_json.get('usage', {}).get('total_tokens')
            if not total_tokens:
                total_tokens = len(user_text) + len(reply_text)
            
            # 【新增】将本次对话（一问一答）写入数据库持久化
            c.execute("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", (session_id, "user", json.dumps(final_content)))
            c.execute("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", (session_id, "assistant", json.dumps(reply_text)))
            c.execute("UPDATE sessions SET updated_at=? WHERE id=?", (datetime.now(), session_id))
            conn.commit()
            conn.close()
            
            return jsonify({
                "status": "success", 
                "reply": reply_text,
                "tokens": total_tokens,
                "session_id": session_id # 把会话ID返回前端
            })
        else:
            conn.close()
            return jsonify({"status": "error", "reply": f"⚠️ 接口层返回错误: {response.text}"})
    except Exception as e:
        conn.close()
        return jsonify({"status": "error", "reply": f"⚠️ 服务器连接异常: {str(e)}"})
#CF
# Codeforces 数据缓存
CF_CACHE = {
    'problems': [],
    'last_update': None,
    'contests': []
}

# CF 难度色标映射
CF_RATING_COLORS = {
    (0, 1199): ('🟢', '入门', '0f9d58'),
    (1200, 1399): ('🟢', '普及−', '0f9d58'),
    (1400, 1599): ('🟡', '普及/提高−', 'ffc107'),
    (1600, 1899): ('🟠', '提高+/省选−', 'ff9800'),
    (1900, 2099): ('🔴', '省选/NOI−', 'f44336'),
    (2100, 2399): ('🔴', 'NOI/NOI+', 'f44336'),
    (2400, float('inf')): ('⚫', 'NOI++/CTSC', '000000')
}

def get_cf_color(rating):
    """根据分数返回颜色标识"""
    for (low, high), (emoji, label, hex_color) in CF_RATING_COLORS.items():
        if low <= rating <= high:
            return emoji, label, hex_color
    return '⚪', '未知', '9e9e9e'

# 全局：用户当前题目状态（简化版，实际可用 Redis/数据库）
user_current_problems = {}

@app.route('/cf_daily', methods=['POST'])
def get_cf_daily():
    try:
        data = request.json or {}
        rating_min = int(data.get('rating_min', 1400))
        rating_max = int(data.get('rating_max', 1600))
        force_refresh = data.get('refresh', False)  # 强制刷新
        session_id = data.get('session_id', 'default')
        
        # 更新缓存（如果过期）
        now = datetime.now()
        if not CF_CACHE['last_update'] or (now - CF_CACHE['last_update']).total_seconds() > 6 * 3600:
            refresh_cf_cache()
        
        problems = CF_CACHE['problems']
        filtered = [
            p for p in problems 
            if rating_min <= p.get('rating', 0) <= rating_max
        ]
        
        if not filtered:
            return jsonify({"status": "error", "message": "未找到符合条件的题目"})
        
        # 选择逻辑：强制刷新时用时间戳种子，否则检查缓存
        cache_key = f"{session_id}_{rating_min}_{rating_max}"
        
        if force_refresh or cache_key not in user_current_problems:
            # 真正随机（或基于时间戳）
            random.seed(time.time())  
            selected = random.choice(filtered[:100])
            # 保存到用户状态
            user_current_problems[cache_key] = selected
        else:
            selected = user_current_problems[cache_key]
        
        emoji, label, _ = get_cf_color(selected.get('rating', 0))
        
        return jsonify({
            "status": "success",
            "problem": {
                "contestId": selected['contestId'],
                "index": selected['index'],
                "name": selected['name'],
                "rating": selected.get('rating'),
                "tags": selected.get('tags', []),
                "difficulty_emoji": emoji,
                "difficulty_label": label,
                "url": f"https://codeforces.com/problemset/problem/{selected['contestId']}/{selected['index']}",
                "solved_count": selected.get('solvedCount', '未知')
            },
            # 关键：返回用于构建上下文的文本
            "context_prompt": f"""
当前讨论题目：Codeforces {selected['contestId']}{selected['index']} - {selected['name']}
难度：{emoji} Rating {selected.get('rating', '未知')} ({label})
算法标签：{', '.join(selected.get('tags', []))}
题目链接：{f"https://codeforces.com/problemset/problem/{selected['contestId']}/{selected['index']}"}

当用户询问"这题"、"这道题"、"如何解决"时，默认指向上面的题目。
"""
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

# 新增：获取当前题目上下文（供前端构建 system prompt）
@app.route('/cf_current_context', methods=['POST'])
def get_cf_current_context():
    data = request.json or {}
    session_id = data.get('session_id', 'default')
    rating_min = data.get('rating_min', 1400)
    rating_max = data.get('rating_max', 1600)
    
    cache_key = f"{session_id}_{rating_min}_{rating_max}"
    problem = user_current_problems.get(cache_key)
    
    if not problem:
        return jsonify({"status": "error", "message": "暂无当前题目，请先调用 /cf_daily"})
    
    emoji, label, _ = get_cf_color(problem.get('rating', 0))
    
    return jsonify({
        "status": "success",
        "context": f"""
【当前绑定题目】
题号：Codeforces {problem['contestId']}{problem['index']}
标题：{problem['name']}
难度：{emoji} Rating {problem.get('rating', '未知')} ({label})
标签：{', '.join(problem.get('tags', []))}
链接：{f"https://codeforces.com/problemset/problem/{problem['contestId']}/{problem['index']}"}

【对话场景】
用户正在针对上述题目寻求帮助。当用户说"这题"、"这道题"、"怎么写"、"给我代码"时，指的都是这道题。
"""
    })
@app.route('/cf_problem', methods=['GET'])
def get_cf_problem():
    """获取特定题目详情（备用接口）"""
    contest_id = request.args.get('contestId')
    index = request.args.get('index')
    # 这里可以实现题目内容抓取（注意 CF 反爬）
    pass

@app.route('/cf_tags', methods=['GET'])
def get_cf_tags():
    """获取所有可用算法标签及其分布"""
    if not CF_CACHE['problems']:
        refresh_cf_cache()
    
    # 统计标签频率
    tag_counts = {}
    for p in CF_CACHE['problems']:
        for tag in p.get('tags', []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    return jsonify({
        "status": "success", 
        "tags": [{"name": t, "count": c} for t, c in sorted_tags[:30]]
    })

def refresh_cf_cache():
    """从 Codeforces API 获取最新题目数据"""
    try:
        # CF 官方 API
        resp = requests.get('https://codeforces.com/api/problemset.problems', timeout=10)
        if resp.status_code == 200:
            result = resp.json()
            if result.get('status') == 'OK':
                problems = result['result']['problems']
                # 只保留有难度分的题目
                CF_CACHE['problems'] = [p for p in problems if 'rating' in p]
                CF_CACHE['last_update'] = datetime.now()
                print(f"[CF] 缓存已更新，共 {len(CF_CACHE['problems'])} 道题目")
                
        # 同时获取最近比赛列表
        contests_resp = requests.get('https://codeforces.com/api/contest.list', timeout=10)
        if contests_resp.status_code == 200:
            data = contests_resp.json()
            if data.get('status') == 'OK':
                CF_CACHE['contests'] = data['result'][:20]  # 最近20场比赛
                
    except Exception as e:
        print(f"[CF] 缓存更新失败: {e}")

#-----CF------
if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0')