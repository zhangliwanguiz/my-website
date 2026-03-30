from flask import Flask, jsonify, render_template, request
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sqlite3
import time
import os
from datetime import datetime
import atexit
import werkzeug.utils
import re
import base64
import uuid

app = Flask(__name__)
GLOBAL_DATA_CACHE = []
DB_PATH = '/tmp/finance_data.db' if os.environ.get('VERCEL') else 'finance_data.db'
API_KEY = 'sk-2ilbzoamvyen6fkuy3m0wpdeywcqzu4v'
API_URL = "https://api.bankofai.io/v1/chat/completions"

# === 升级：文件上传目录与 100MB 限制配置 ===
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 限制最大 100MB
# ========================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS finance (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 time TEXT NOT NULL,
                 type TEXT NOT NULL,
                 price TEXT NOT NULL,
                 max_price TEXT NOT NULL,
                 change TEXT NOT NULL)''')
    c.execute('SELECT COUNT(*) FROM finance')
    if c.fetchone()[0] == 0:
        fetch_and_update_data()
    conn.commit()
    conn.close()

def fetch_and_update_data():
    global GLOBAL_DATA_CACHE
    current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    data_list = []
    start_time_sec = 1577836800
    start_time_ms = 1577836800000
    current_time_sec = int(time.time())

    # 1. 虚拟货币
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

    # 2. 美股
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

    # 3. A股
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

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "没有找到文件内容"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "未选择任何文件"}), 400
    
    # 支持的拓展名库扩大到代码等文件
    allowed_extensions = {'png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'zip', 'txt', 'csv', 'md', 'json', 'py', 'js', 'html', 'css', 'cpp'}
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({"status": "error", "message": "不支持的文件格式"}), 400

    # 升级：采用 UUID 重命名解决中文名被框架拦截变空导致AI读取失败的问题
    new_filename = f"{uuid.uuid4().hex}.{ext}"
    save_path = os.path.join(UPLOAD_FOLDER, new_filename)
    file.save(save_path)
    
    return jsonify({
        "status": "success", 
        "message": "上传完成", 
        "filename": new_filename,
        "original_name": file.filename
    })

scheduler = BackgroundScheduler()
scheduler.add_job(func=fetch_and_update_data, trigger="cron", hour=9, minute=0)
scheduler.start()
atexit.register(lambda: scheduler.shutdown()) 

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_text = data.get('text', '')
    selected_model = data.get('model', 'gpt-3.5-turbo')
    files_to_process = data.get('files', [])  # 获取前端传来的待处理文件ID列表

    # === 升级：AI 真阅读 - 构建支持图像及文件解析的混合协议块 ===
    payload_content = []
    
    # 率先压入用户的文字 prompt
    payload_content.append({"type": "text", "text": user_text})
    
    # 依次处理附件交给 AI
    for f_info in files_to_process:
        fname = f_info.get('id')
        og_name = f_info.get('name')
        fpath = os.path.join(UPLOAD_FOLDER, fname)
        
        if os.path.exists(fpath):
            ext = fname.rsplit('.', 1)[-1].lower() if '.' in fname else ''
            
            # --- 分支A：图像 Vision 处理 ---
            if ext in ['png', 'jpg', 'jpeg', 'webp']:
                try:
                    with open(fpath, "rb") as image_file:
                        b64_str = base64.b64encode(image_file.read()).decode('utf-8')
                        mime = "image/jpeg" if ext == 'jpg' else f"image/{ext}"
                        payload_content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64_str}"}
                        })
                except Exception as e:
                    pass
            
            # --- 分支B：文本/文档提炼处理 ---
            elif ext in ['txt', 'csv', 'md', 'json', 'py', 'js', 'html', 'css', 'cpp']:
                try:
                    with open(fpath, "r", encoding="utf-8") as text_file:
                        doc_text = text_file.read()[:20000] # 防超长截断处理
                        payload_content.append({
                            "type": "text", 
                            "text": f"\n\n[用户提供的重要文件附件 {og_name} 的内容如下，请在回答中参考上下文]:\n```\n{doc_text}\n```"
                        })
                except Exception as e:
                    pass
            
            # --- 分支C：二进制文件提醒 ---
            else:
                payload_content.append({
                    "type": "text", 
                    "text": f"\n\n[通知：用户已上传文件 {og_name}，但由于接口限制这是二进制格式，可能无法精准读取深层内容]"
                })

    # 如果只有文本没有文件，将其退化为普通的 string 提供更好兼容性
    final_content = payload_content if len(payload_content) > 1 else user_text
    
    try:
        response = requests.post(
            API_URL, 
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "model": selected_model, 
                "messages": [{"role": "user", "content": final_content}], 
                "stream": False, 
                "temperature": 0.5
            },
        )
        if response.status_code == 200:
            res_json = response.json()
            reply_text = res_json['choices'][0]['message']['content']
            
            total_tokens = res_json.get('usage', {}).get('total_tokens')
            if not total_tokens:
                combined_text = user_text + reply_text
                total_tokens = len(re.findall(r'[\u4e00-\u9fa5]|\w+|[^\w\s]', combined_text))
            
            return jsonify({
                "status": "success", 
                "reply": reply_text,
                "tokens": total_tokens 
            })
        else:
            return jsonify({"status": "error", "reply": f"⚠️ 接口层返回错误: {response.text}"})
    except Exception as e:
        return jsonify({"status": "error", "reply": f"⚠️ 服务器连接异常: {str(e)}"})

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0')