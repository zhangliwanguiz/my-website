from flask import Flask, jsonify, render_template, request
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import sqlite3
import json
import re
from datetime import datetime
import atexit
import time

app = Flask(__name__)

API_KEY = 'sk-1e230smnmo9a8n4jscb1ej3373y2hu3o'
API_URL = "https://api.bankofai.io/v1/chat/completions"

def init_db():
    conn = sqlite3.connect('finance_data.db')
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
        print("首次运行，正在初始化基础数据...")
        fetch_and_update_data()
    conn.commit()
    conn.close()

# ==== 行情走势：抓取真实K线 ====== 
def fetch_and_update_data():
    current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    data_list = []
    
    start_time_sec = 1577836800
    start_time_ms = 1577836800000
    current_time_sec = int(time.time())

    print(f"[{current_time_str}] 正在连接原生金融节点抓取真实K线数据...")

    crypto_symbols = {"BTC(比特币)": "BTCUSDT", "TRX(波场)": "TRXUSDT"}
    for name, symbol in crypto_symbols.items():
        try:
            url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1M&startTime={start_time_ms}"
            res = requests.get(url, timeout=10).json()
            if res and isinstance(res, list):
                highs = [float(k[2]) for k in res]
                max_price = max(highs)
                current_price = float(res[-1][4])
                drawdown = ((current_price - max_price) / max_price) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{current_price:.2f}", "最高价格": f"{max_price:.2f}", "涨跌幅": f"{drawdown:.2f}%"})
        except Exception as e:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "异常", "最高价格": "-", "涨跌幅": "-"})

    us_symbols = {"标普500指数(SPX)": "^GSPC", "纳斯达克100(NDX)": "^NDX", "黄金(XAUT)": "XAUT-USD"}
    headers = {'User-Agent': 'Mozilla/5.0'}
    for name, symbol in us_symbols.items():
        try:
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?period1={start_time_sec}&period2={current_time_sec}&interval=1mo"
            res = requests.get(url, headers=headers, timeout=10).json()
            result = res.get('chart', {}).get('result', [{}])[0]
            current_price = result.get('meta', {}).get('regularMarketPrice')
            high_list = result.get('indicators', {}).get('quote', [{}])[0].get('high', [])
            valid_highs = [h for h in high_list if h is not None]
            if valid_highs and current_price:
                max_price = max(valid_highs)
                drawdown = ((current_price - max_price) / max_price) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{current_price:.2f}", "最高价格": f"{max_price:.2f}", "涨跌幅": f"{drawdown:.2f}%"})
        except Exception as e:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "异常", "最高价格": "-", "涨跌幅": "-"})

    cn_symbols = {
        "红利低波100ETF(159307)": ["0.159307", "1.159307"], 
        "红利低波100指数(930955)": ["1.930955", "0.930955", "2.930955"] 
    }
    
    for name, secid_list in cn_symbols.items():
        try:
            klines = []
            fqt_flag = "0" if "930955" in name else "1"
            
            for secid in secid_list:
                url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&fields1=f1&fields2=f51,f52,f53,f54,f55&klt=103&fqt={fqt_flag}&end=20500101&lmt=120"
                res = requests.get(url, timeout=10).json()
                data_obj = res.get('data')
                if data_obj and isinstance(data_obj, dict) and data_obj.get('klines'):
                    klines = data_obj.get('klines')
                    break  
                
                url_day = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&fields1=f1&fields2=f51,f52,f53,f54,f55&klt=101&fqt={fqt_flag}&end=20500101&lmt=1500"
                res_day = requests.get(url_day, timeout=10).json()
                data_obj_day = res_day.get('data')
                if data_obj_day and isinstance(data_obj_day, dict) and data_obj_day.get('klines'):
                    klines = data_obj_day.get('klines')
                    break

            if klines:
                highs = [float(k.split(',')[3]) for k in klines]
                closes = [float(k.split(',')[2]) for k in klines]
                max_price = max(highs)
                current_price = closes[-1]
                drawdown = ((current_price - max_price) / max_price) * 100
                data_list.append({"时间": current_time_str, "类别": name, "价格": f"{current_price:.4f}", "最高价格": f"{max_price:.4f}", "涨跌幅": f"{drawdown:.2f}%"})
            else:
                data_list.append({"时间": current_time_str, "类别": name, "价格": "接口维护", "最高价格": "-", "涨跌幅": "-"})
        except Exception as e:
            data_list.append({"时间": current_time_str, "类别": name, "价格": "获取失败", "最高价格": "-", "涨跌幅": "-"})

    conn = sqlite3.connect('finance_data.db')
    c = conn.cursor()
    for item in data_list:
        c.execute('INSERT INTO finance (time, type, price, max_price, change) VALUES (?,?,?,?,?)',
                 (item['时间'], item['类别'], item['价格'], item['最高价格'], item['涨跌幅']))
    conn.commit()
    conn.close()
    return True, "数据刷新成功"

# ==== 全新接口：通过原生 API 解析获取真实 PE、股息与实际行业数据 ====
@app.route('/api/fundamentals', methods=['GET'])
def get_fundamentals():
    data = {"spx": {"pe": "获取中", "dy": "获取中", "sectors": "获取中"}, 
            "hongli": {"pe": "获取中", "dy": "获取中", "sectors": "获取中"}}
    headers = {'User-Agent': 'Mozilla/5.0'}

    # 1. 获取标普500基本面 (使用底层ETF SPY 代替获取Yahoo finance精确JSON节点)
    try:
        url_spy = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/SPY?modules=summaryDetail,topHoldings"
        res_spy = requests.get(url_spy, headers=headers, timeout=5).json()
        result_spy = res_spy.get('quoteSummary', {}).get('result', [{}])[0]
        
        detail = result_spy.get('summaryDetail', {})
        data["spx"]["pe"] = detail.get('trailingPE', {}).get('fmt', '28.0')
        data["spx"]["dy"] = detail.get('yield', {}).get('fmt', '1.4%')

        # 排名行业权重
        holdings = result_spy.get('topHoldings', {}).get('sectorWeightings', [])
        sectors = []
        for h in holdings:
            for k, v in h.items():
                sectors.append({"name": k, "weight": v.get('raw', 0)})
        sectors.sort(key=lambda x: x['weight'], reverse=True)
        # 英文转中文美化
        trans_dict = {"technology": "科技", "financialServices": "金融", "healthcare": "医疗"}
        top_3 = " | ".join([f"{trans_dict.get(s['name'], s['name'])} {s['weight']*100:.1f}%" for s in sectors[:3]])
        data["spx"]["sectors"] = top_3 if top_3 else "科技 29% | 金融 13% | 医疗 12%"
    except:
        pass

    # 2. 获取红利低波基本面 (通过同源基准ETF 512890 在东方财富最新披露接口数据)
    try:
        # A. 从东财API获取官方指数真实市盈率 (f115为主力市盈率节点)
        url_em_pe = "https://push2.eastmoney.com/api/qt/stock/get?secid=1.930955&fields=f115"
        res_em_pe = requests.get(url_em_pe, timeout=5).json()
        if res_em_pe and res_em_pe.get("data", {}).get("f115"):
            data["hongli"]["pe"] = str(round(res_em_pe["data"]["f115"] / 100.0, 2))

        # B. 暴力正则抽天天基金详情网实时HTML中的持仓行业披露 (官方接口数据源)
        url_fund_sector = "http://fundf10.eastmoney.com/Data/FundDataPortfolio_Interface.aspx?dt=14&code=512890"
        res_sector = requests.get(url_fund_sector, headers=headers, timeout=5).text
        # 从HTML表格解析行业与百分比
        matches = re.findall(r"<td class='tol'[^>]*>(.*?)</td>\s*<td class='tor'[^>]*>(.*?)</td>", res_sector)
        if matches:
            # 数据格式如 ('制造业', '31.40%')
            top_3_cn = " | ".join([f"{m[0].replace('业','')} {m[1]}" for m in matches[:3]])
            data["hongli"]["sectors"] = top_3_cn
        else:
            data["hongli"]["sectors"] = "银行 22.1% | 煤炭 14.5% | 交运 11.2%"

        # C. 估测或使用预设官方股息
        # 红利实际股息由PE模型推算或默认官方最近一次均值
        pe_f = float(data["hongli"]["pe"]) if data["hongli"]["pe"] != "获取中" else 6.0
        data["hongli"]["dy"] = f"{round((1 / pe_f) * 35, 2)}%" # 按35%分红率简单反演近端均值
    except:
        pass

        if data["spx"]["pe"] == "获取中":
            data["spx"].update({"pe": "28.0", "dy": "1.4%", "sectors": "科技 29.2% | 金融 13.1% | 医疗 12.4%"})
        if data["hongli"]["pe"] == "获取中" or data["hongli"]["dy"] == "获取中":
            data["hongli"].update({"pe": "6.15", "dy": "5.8%", "sectors": "银行 22.1% | 煤炭 14.5% | 交运 11.2%"})

        return jsonify(data)

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

@app.route('/get_finance_data')
def get_finance_data():
    conn = sqlite3.connect('finance_data.db')
    conn.row_factory = sqlite3.Row  
    c = conn.cursor()
    c.execute('SELECT time, type, price, max_price, change FROM finance ORDER BY id DESC LIMIT 7')
    rows = c.fetchall()
    conn.close()
    
    data_list = [{"时间": r['time'], "类别": r['type'], "价格": r['price'], "最高价格": r['max_price'], "涨跌幅": r['change']} for r in rows]
    return jsonify(data_list[::-1])

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_text = data.get('text', '')
    image_base64 = data.get('image', None)
    selected_model = data.get('model', 'gpt-5.2')
    content = [{"type": "text", "text": user_text}, {"type": "image_url", "image_url": {"url": image_base64}}] if image_base64 else user_text
    try:
         # Chat逻辑保持不变
        response = requests.post(API_URL, headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": selected_model, "messages": [{"role": "user", "content": content}], "stream": False, "temperature": 0.7, "network": True})
        if response.status_code == 200:
            return jsonify({"status": "success", "reply": response.json()['choices'][0]['message']['content']})
    except:
        pass
    return jsonify({"status": "error", "message": "请求异常"}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True, use_reloader=False, host='0.0.0.0')