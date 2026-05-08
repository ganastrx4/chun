import time
import math
import numpy as np
import os
import threading
from binance.client import Client
from binance.enums import *
from flask import Flask
from datetime import datetime

# ===============================================================
# CONFIGURACIÓN PROD - RENDER (Referencia image_1c2953.png)
# ===============================================================
API_KEY = os.getenv("BINANCE_API_KEY")
API_SECRET = os.getenv("BINANCE_SECRET_KEY")

# Inicialización segura del cliente
client = Client(API_KEY, API_SECRET)

WATCH = ["WLDUSDT", "XRPUSDT"]
BASE_USDT = 6.0       # Margen inicial
MAX_MARGIN_TOTAL = 100 # Techo de DCA
LEVERAGE = 75

market_memory = {s: {"high_1m": 0, "low_1m": 0, "last_action": None} for s in WATCH}

app = Flask(__name__)

# ===============================================================
# LÓGICA DE ANÁLISIS (IA & LIQUIDEZ)
# ===============================================================

def analizar_liquidez(symbol):
    """Detecta agotamiento: Precio sube pero volumen baja"""
    try:
        k_1m = client.futures_klines(symbol=symbol, interval='1m', limit=20)
        closes = np.array([float(x[4]) for x in k_1m])
        volumes = np.array([float(x[5]) for x in k_1m])
        
        # Tendencias de los últimos 5 periodos
        vol_trend = np.polyfit(range(len(volumes[-5:])), volumes[-5:], 1)[0]
        price_trend = np.polyfit(range(len(closes[-5:])), closes[-5:], 1)[0]
        
        if price_trend > 0 and vol_trend < 0:
            return "REBOTE_BAJISTA"
        if price_trend < 0 and vol_trend < 0:
            return "REBOTE_ALCISTA"
        return "NORMAL"
    except:
        return "NORMAL"

def neurona_consenso_pro(symbol):
    try:
        k1 = client.futures_klines(symbol=symbol, interval='1m', limit=10)
        c1 = np.array([float(x[4]) for x in k1])
        
        ema_corta = np.mean(c1[-3:])
        ema_larga = np.mean(c1[-10:])
        vol_status = analizar_liquidez(symbol)
        
        if ema_corta > ema_larga and vol_status != "REBOTE_BAJISTA":
            return "BULLISH"
        if ema_corta < ema_larga and vol_status != "REBOTE_ALCISTA":
            return "BEARISH"
        return "NEUTRAL"
    except:
        return "NEUTRAL"

# ===============================================================
# MOTOR DE EJECUCIÓN
# ===============================================================

def execute_logic(symbol):
    pos = client.futures_position_information(symbol=symbol)
    l_amt, s_amt, l_pnl, s_pnl, l_margin, s_margin = 0, 0, 0, 0, 0, 0
    
    for p in pos:
        amt = float(p["positionAmt"])
        if amt > 0: 
            l_amt = amt
            l_pnl = float(p["unRealizedProfit"])
            l_margin = float(p["isolatedMargin"])
        elif amt < 0: 
            s_amt = abs(amt)
            s_pnl = float(p["unRealizedProfit"])
            s_margin = float(p["isolatedMargin"])

    price = float(client.futures_symbol_ticker(symbol=symbol)['price'])
    prediction = neurona_consenso_pro(symbol)
    vol_status = analizar_liquidez(symbol)
    
    # CIERRE POR AGOTAMIENTO
    if (l_amt > 0 and vol_status == "REBOTE_BAJISTA" and l_pnl > 0.10):
        client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=l_amt, positionSide='LONG')
        print(f"🧠 {symbol} Cierre por Agotamiento (Long)")
        return

    if (s_amt > 0 and vol_status == "REBOTE_ALCISTA" and s_pnl > 0.10):
        client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=s_amt, positionSide='SHORT')
        print(f"🧠 {symbol} Cierre por Agotamiento (Short)")
        return

    # GESTIÓN DCA (PROMEDIO)
    current_pnl_pct = (l_pnl / l_margin) if l_margin > 0 else (s_pnl / s_margin) if s_margin > 0 else 0
    
    if current_pnl_pct < -0.25:
        if l_margin + s_margin < MAX_MARGIN_TOTAL:
            qty = round(BASE_USDT / price, 2)
            if l_amt > 0 and prediction == "BULLISH":
                client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=qty, positionSide='LONG')
            elif s_amt > 0 and prediction == "BEARISH":
                client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=qty, positionSide='SHORT')

    # NUEVAS ENTRADAS
    if l_amt == 0 and s_amt == 0 and prediction != "NEUTRAL":
        qty = round(BASE_USDT / price, 2)
        p_side = 'LONG' if prediction == "BULLISH" else 'SHORT'
        side = 'BUY' if prediction == "BULLISH" else 'SELL'
        client.futures_create_order(symbol=symbol, side=side, type='MARKET', quantity=qty, positionSide=p_side)

# ===============================================================
# DASHBOARD & SERVER
# ===============================================================

@app.route("/")
def home():
    try:
        acc = client.futures_account()
        wallet = round(float(acc['totalWalletBalance']), 2)
        pos = [p for p in client.futures_position_information() if float(p['positionAmt']) != 0]
        
        html = f"<body style='background:#111; color:#0ecb81; font-family:sans-serif; padding:30px;'>"
        html += f"<h1>🤖 IA PRO-LIQUIDITY ONLINE</h1>"
        html += f"<h2>Wallet: {wallet} USDT</h2><hr>"
        for p in pos:
            pnl = float(p['unRealizedProfit'])
            color = "#0ecb81" if pnl > 0 else "#f6465d"
            html += f"<div style='border:1px solid #333; padding:10px; margin:5px;'>"
            html += f"<b>{p['symbol']}</b> | PNL: <span style='color:{color}'>{round(pnl, 2)} USDT</span><br>"
            html += f"Margen: {round(float(p['isolatedMargin']), 2)} USDT</div>"
        return html + "</body>"
    except Exception as e: 
        return f"Error: {str(e)}"

def bot_loop():
    while True:
        for s in WATCH:
            try: 
                execute_logic(s)
            except Exception as e: 
                print(f"Error en loop {s}: {e}")
            time.sleep(1)
        time.sleep(5)

if __name__ == "__main__":
    # Iniciar el bot en un hilo separado
    threading.Thread(target=bot_loop, daemon=True).start()
    
    # Render usa el puerto 10000 por defecto según tu imagen
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
