from flask import Flask, jsonify, render_template, request
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sqlite3
import time
import os
from datetime import datetime
import atexit
import re

app = Flask(__name__)
GLOBAL_DATA_CACHE = []
DB_PATH = '/tmp/finance_data.db' if os.environ.get('VERCEL') else 'finance_data.db'
API_KEY = 'sk-6yu0ht1bqzqltkrdb373gecs7x41fd4h'
API_URL = "https://api.bankofai.io/v1/chat/completions"

# 让 Flask 放开限制，真正的拦截会被转移到前端处理，防止 Vercel 崩溃
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_text = data.get('text', '')
    selected_model = data.get('model', 'gpt-3.5-turbo')
    files_to_process = data.get('files', [])  

    payload_content = []
    
    if user_text:
        payload_content.append({"type": "text", "text": user_text})
    
    # 彻底升级：直接接收前端处理好的 Base64图片/纯文本，杜绝 Vercel 读不到 /uploads 和体积过大的 Bug
    for f_info in files_to_process:
        f_type = f_info.get('type')
        f_name = f_info.get('name')
        f_content = f_info.get('content')
        
        if f_type == 'image':
            payload_content.append({
                "type": "image_url",
                "image_url": {"url": f_content}
            })
        elif f_type == 'text':
            # 只截取前3万字防止过曝
            doc_text = f_content[:30000]
            payload_content.append({
                "type": "text", 
                "text": f"\n\n[用户提供的重要附件 {f_name} 的内容如下，请参考上下文回答]:\n```\n{doc_text}\n```"
            })

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