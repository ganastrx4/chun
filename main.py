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
# CONFIGURACIÓN AVANZADA
# ===============================================================
API_KEY = os.getenv("BINANCE_API_KEY")
API_SECRET = os.getenv("BINANCE_SECRET_KEY")
client = Client(API_KEY, API_SECRET)

WATCH = ["WLDUSDT", "XRPUSDT"]
BASE_USDT = 6.0       # Margen inicial un poco más alto
MAX_MARGIN_TOTAL = 100 # Permitir que promedie hasta 100 USDT si es necesario
LEVERAGE = 75

# Memoria de racha y liquidez
market_memory = {s: {"high_1m": 0, "low_1m": 0, "last_action": None} for s in WATCH}

app = Flask(__name__)

# ===============================================================
# RED NEURONAL DE LIQUIDEZ Y REBOTE (1m)
# ===============================================================

def analizar_liquidez(symbol):
    """Detecta si el precio llegó a una zona de rebote por agotamiento de volumen"""
    k_1m = client.futures_klines(symbol=symbol, interval='1m', limit=20)
    closes = np.array([float(x[4]) for x in k_1m])
    volumes = np.array([float(x[5]) for x in k_1m])
    
    # Detección de agotamiento: Precio sube pero volumen baja (Divergencia)
    vol_trend = np.polyfit(range(len(volumes[-5:])), volumes[-5:], 1)[0]
    price_trend = np.polyfit(range(len(closes[-5:])), closes[-5:], 1)[0]
    
    # Si el precio sube con fuerza pero el volumen cae, viene un rebote
    if price_trend > 0 and vol_trend < 0:
        return "REBOTE_BAJISTA"
    if price_trend < 0 and vol_trend < 0:
        return "REBOTE_ALCISTA"
    
    return "NORMAL"

def neurona_consenso_pro(symbol):
    # Confirmación en 5m para tendencia pesada
    k5 = client.futures_klines(symbol=symbol, interval='5m', limit=15)
    c5 = np.array([float(x[4]) for x in k5])
    
    # Acción rápida en 1m
    k1 = client.futures_klines(symbol=symbol, interval='1m', limit=10)
    c1 = np.array([float(x[4]) for x in k1])
    v1 = np.array([float(x[5]) for x in k1])

    # Fuerza del mercado
    ema_corta = np.mean(c1[-3:])
    ema_larga = np.mean(c1[-10:])
    
    vol_status = analizar_liquidez(symbol)
    
    # Lógica Humana: No entres si hay agotamiento
    if ema_corta > ema_larga and vol_status != "REBOTE_BAJISTA":
        return "BULLISH"
    if ema_corta < ema_larga and vol_status != "REBOTE_ALCISTA":
        return "BEARISH"
    
    return "NEUTRAL"

# ===============================================================
# MOTOR DE EJECUCIÓN CON PROMEDIO DINÁMICO
# ===============================================================

def execute_logic(symbol):
    # 1. Obtener estado de cuenta y posición
    pos = client.futures_position_information(symbol=symbol)
    l_amt, s_amt, l_pnl, s_pnl, l_margin, s_margin = 0, 0, 0, 0, 0, 0
    
    for p in pos:
        amt = float(p["positionAmt"])
        if amt > 0: 
            l_amt = amt
            l_pnl = float(p["unRealizedProfit"])
            l_margin = float(p["isolatedMargin"])
        if amt < 0: 
            s_amt = abs(amt)
            s_pnl = float(p["unRealizedProfit"])
            s_margin = float(p["isolatedMargin"])

    price = float(client.futures_symbol_ticker(symbol=symbol)['price'])
    prediction = neurona_consenso_pro(symbol)
    vol_status = analizar_liquidez(symbol)
    
    # 2. CIERRE INTELIGENTE (EL "HUMANO")
    # Si detectamos rebote inminente, cerramos ganancia DE GOLPE
    if (l_amt > 0 and vol_status == "REBOTE_BAJISTA" and l_pnl > 0.10):
        client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=l_amt, positionSide='LONG')
        print(f"🧠 {symbol} Cierre por Agotamiento detectado (Long)")
        return

    if (s_amt > 0 and vol_status == "REBOTE_ALCISTA" and s_pnl > 0.10):
        client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=s_amt, positionSide='SHORT')
        print(f"🧠 {symbol} Cierre por Agotamiento detectado (Short)")
        return

    # 3. GESTIÓN DE PÉRDIDA / PROMEDIO (DCA)
    # Si perdemos más del 15% del margen actual, y la tendencia sigue a favor, promediamos
    current_pnl_pct = (l_pnl / l_margin) if l_margin > 0 else (s_pnl / s_margin) if s_margin > 0 else 0
    
    if current_pnl_pct < -0.25: # Perdiendo más del 25%
        if l_margin + s_margin < MAX_MARGIN_TOTAL:
            qty = round(BASE_USDT / price, 2)
            if l_amt > 0 and prediction == "BULLISH":
                client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=qty, positionSide='LONG')
                print(f"🛠️ Promediando LONG en {symbol}")
            elif s_amt > 0 and prediction == "BEARISH":
                client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=qty, positionSide='SHORT')
                print(f"🛠️ Promediando SHORT en {symbol}")

    # 4. ENTRADAS NUEVAS (Solo si no hay nada abierto)
    if l_amt == 0 and s_amt == 0 and prediction != "NEUTRAL":
        qty = round(BASE_USDT / price, 2)
        p_side = 'LONG' if prediction == "BULLISH" else 'SHORT'
        side = 'BUY' if prediction == "BULLISH" else 'SELL'
        client.futures_create_order(symbol=symbol, side=side, type='MARKET', quantity=qty, positionSide=p_side)

# ===============================================================
# DASHBOARD PARA RENDER
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
    except Exception as e: return str(e)

def bot_loop():
    while True:
        for s in WATCH:
            try: execute_logic(s)
            except Exception as e: print(f"Error {s}: {e}")
            time.sleep(1)
        time.sleep(5)

if __name__ == "__main__":
    threading.Thread(target=bot_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
