from flask import Flask, jsonify, render_template, request
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sqlite3
import time
import os
from datetime import datetime
import atexit
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
GLOBAL_DATA_CACHE = []
DB_PATH = '/tmp/finance_data.db' if os.environ.get('VERCEL') else 'finance_data.db'

# 【修改点1】移除了全局写死的 API_KEY 和 API_URL

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  

def fetch_and_update_data():
    global GLOBAL_DATA_CACHE
    current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    data_list = []
    start_time_sec = 1577836800
    start_time_ms = 1577836800000
    current_time_sec = int(time.time())

    crypto_symbols = {"BTC(比特币)": "BTCUSDT", "TRX(波场)": "TRXUSDT"}
    for name, symbol in crypto_symbols.items():
        try:
            url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1M&startTime={start_time_ms}"
            res = requests.get(url, timeout=4).json()
            if res and isinstance(res, list):
                highs = [float(k[2]) for k in res]
                max_price = max(highs)
                current_price = float(res[-1][4])
                drawdown = ((current_price - max_price) / max_price) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{current_price:.2f}", "最高价格": f"{max_price:.2f}", "涨跌幅": f"{drawdown:.2f}%"})
        except:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "获取失败", "最高价格": "-", "涨跌幅": "-"})

    us_symbols = {"标普500(SPX)": "^GSPC", "纳指100(NDX)": "^NDX", "黄金(XAUT)": "XAUT-USD"}
    headers = {'User-Agent': 'Mozilla/5.0'}
    for name, symbol in us_symbols.items():
        try:
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?period1={start_time_sec}&period2={current_time_sec}&interval=1mo"
            res = requests.get(url, headers=headers, timeout=4).json()
            result = res.get('chart', {}).get('result', [{}])[0]
            current_price = result.get('meta', {}).get('regularMarketPrice')
            high_list = result.get('indicators', {}).get('quote', [{}])[0].get('high', [])
            valid_highs = [h for h in high_list if h is not None]
            if valid_highs and current_price:
                max_price = max(valid_highs)
                drawdown = ((current_price - max_price) / max_price) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{current_price:.2f}", "最高价格": f"{max_price:.2f}", "涨跌幅": f"{drawdown:.2f}%"})
        except:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "获取失败", "最高价格": "-", "涨跌幅": "-"})

    cn_symbols = {"红利低波ETF(159307)": ["0.159307", "1.159307"]}
    for name, secid_list in cn_symbols.items():
        try:
            klines = []
            for secid in secid_list:
                url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&fields1=f1&fields2=f51,f52,f53,f54,f55&klt=103&fqt=1&end=20500101&lmt=120"
                res = requests.get(url, timeout=4).json()
                data_obj = res.get('data')
                if data_obj and isinstance(data_obj, dict) and data_obj.get('klines'):
                    klines = data_obj.get('klines')
                    break  
            if klines:
                highs = [float(k.split(',')[3]) for k in klines]
                closes = [float(k.split(',')[2]) for k in klines]
                drawdown = ((closes[-1] - max(highs)) / max(highs)) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{closes[-1]:.4f}", "最高价格": f"{max(highs):.4f}", "涨跌幅": f"{drawdown:.2f}%"})
        except:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "获取失败", "最高价格": "-", "涨跌幅": "-"})

    GLOBAL_DATA_CACHE = data_list
    return True, "数据刷新成功"

@app.route('/get_finance_data')
def get_finance_data():
    global GLOBAL_DATA_CACHE
    if not GLOBAL_DATA_CACHE:
        return jsonify([{"时间": "-", "类别": "节点唤醒中", "价格": "-", "最高价格": "-", "涨跌幅": "请手动刷新"}])
    return jsonify(GLOBAL_DATA_CACHE)

@app.route('/refresh_data', methods=['POST'])
def refresh_data():
    success, msg = fetch_and_update_data()
    return jsonify({"status": "success" if success else "error", "message": msg})

scheduler = BackgroundScheduler()
scheduler.add_job(func=fetch_and_update_data, trigger="cron", hour=9, minute=0)
scheduler.start()
atexit.register(lambda: scheduler.shutdown()) 
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

    try:
        response = requests.post(
            api_url, 
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": selected_model, "messages": full_messages, "stream": False, "temperature": 0.5},
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

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0')