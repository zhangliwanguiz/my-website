from flask import Flask, jsonify, render_template, request
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sqlite3
import time
import os
from datetime import datetime
import atexit
# === 新增：文件上传处理依赖 ===
import werkzeug.utils
import re
# ==============================

app = Flask(__name__)
GLOBAL_DATA_CACHE = []
DB_PATH = '/tmp/finance_data.db' if os.environ.get('VERCEL') else 'finance_data.db'
API_KEY = 'sk-6yu0ht1bqzqltkrdb373gecs7x41fd4h'
API_URL = "https://api.bankofai.io/v1/chat/completions"

# === 新增：上传目录配置 ===
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 限制最大 20MB（Flask底层拦截）
# ========================

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

# === 新增：文件上传后端接收接口 ===
@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "没有找到文件内容"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "未选择任何文件"}), 400
    
    # 后端兜底的安全校验拓展名
    allowed_extensions = {'png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'zip', 'txt', 'csv'}
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({"status": "error", "message": "不支持的文件格式"}), 400

    filename = werkzeug.utils.secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)
    return jsonify({"status": "success", "message": "上传完成", "filename": filename})
# ===============================

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
    content = user_text
    try:
        response = requests.post(
            API_URL, 
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": selected_model, "messages": [{"role": "user", "content": content}], "stream": False, "temperature": 0.5},
        )
        if response.status_code == 200:
            res_json = response.json()
            reply_text = res_json['choices'][0]['message']['content']
            
            # === 新增：Token 统计逻辑 ===
            # 首选方案：从主流大模型 API 的 usage 字段精准获取
            total_tokens = res_json.get('usage', {}).get('total_tokens')
            if not total_tokens:
                # 兜底方案：按照词元/标点/空格拆分计算近似 Token
                combined_text = content + reply_text
                tokens_count = len(re.findall(r'[\u4e00-\u9fa5]|\w+|[^\w\s]', combined_text))
                total_tokens = tokens_count
            # =========================
            
            return jsonify({
                "status": "success", 
                "reply": reply_text,
                "tokens": total_tokens # === 新增字段 ===
            })
        else:
            return jsonify({"status": "error", "reply": f"⚠️ 接口层拦截: {response.text}"})
    except Exception as e:
        return jsonify({"status": "error", "reply": f"⚠️ 系统异常: {str(e)}"})

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0')