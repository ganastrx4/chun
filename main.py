import time
import math
import numpy as np
import os
import threading
from statistics import mean
from binance.client import Client
from binance.enums import *
from flask import Flask
from datetime import datetime

# ===============================================================
# FLASK HEALTHCHECK (Para Render)
# ===============================================================
app = Flask(__name__)

@app.route("/")
def home():
    return f"🤖 IA BOT ONLINE | {datetime.now().strftime('%H:%M:%S')}", 200

# ===============================================================
# CONFIGURACIÓN
# ===============================================================
API_KEY = os.getenv("BINANCE_API_KEY")
API_SECRET = os.getenv("BINANCE_SECRET_KEY")
client = Client(API_KEY, API_SECRET)

WATCH = ["WLDUSDT", "XRPUSDT"]
BASE_USDT = 5.25  # Aproximadamente 0.07 USDT de margen con x75
MAX_POS_USDT = 30
LEVERAGE = 75

# MEMORIA DE CONGELADORA
cooldown_state = {s: {"active": False, "last_price": 0} for s in WATCH}

# ===============================================================
# CEREBRO: ARQUITECTURA TRIPLE RED
# ===============================================================

def red_momentum(closes):
    diffs = np.diff(closes)
    acceleration = np.diff(diffs)
    if acceleration[-1] > 0 and closes[-1] > np.mean(closes):
        return 1
    elif acceleration[-1] < 0 and closes[-1] < np.mean(closes):
        return -1
    return 0

def red_volatilidad(closes):
    std_dev = np.std(closes[-20:])
    avg_price = np.mean(closes[-20:])
    if std_dev < (avg_price * 0.0005): 
        return 0
    return 1

def red_volumen_flow(closes, volumes):
    vol_avg = np.mean(volumes[-10:])
    current_vol = volumes[-1]
    if closes[-1] > closes[-2] and current_vol > vol_avg:
        return 1
    elif closes[-1] < closes[-2] and current_vol > vol_avg:
        return -1
    return 0

def neurona_consenso(symbol):
    # CAMBIADO A 5 MINUTOS ('5m')
    k = client.futures_klines(symbol=symbol, interval='5m', limit=30)
    closes = np.array([float(x[4]) for x in k])
    volumes = np.array([float(x[5]) for x in k])
    
    r1 = red_momentum(closes)
    r2 = red_volatilidad(closes)
    r3 = red_volumen_flow(closes, volumes)
    
    if r2 == 0: return "NEUTRAL"
    total_score = r1 + r3
    
    if total_score >= 1.5: return "BULLISH"
    if total_score <= -1.5: return "BEARISH"
    return "NEUTRAL"

# ===============================================================
# MOTOR DE EJECUCIÓN
# ===============================================================

def get_precision(symbol):
    info = client.futures_exchange_info()
    for s in info['symbols']:
        if s['symbol'] == symbol:
            for f in s['filters']:
                if f['filterType'] == 'LOT_SIZE':
                    return int(round(-math.log10(float(f['stepSize'])), 0))
    return 2

def execute_logic(symbol):
    qty_prec = get_precision(symbol)
    prediction = neurona_consenso(symbol)
    ticker = client.futures_symbol_ticker(symbol=symbol)
    price = float(ticker['price'])
    
    # Obtener info de posiciones
    pos = client.futures_position_information(symbol=symbol)
    l_amt, s_amt, l_pnl, s_pnl = 0, 0, 0, 0
    for p in pos:
        amt = float(p["positionAmt"])
        if amt > 0: l_amt, l_pnl = amt, float(p["unRealizedProfit"])
        if amt < 0: s_amt, s_pnl = abs(amt), float(p["unRealizedProfit"])

    net_pnl = l_pnl + s_pnl
    print(f"[{symbol}] IA: {prediction} | PNL: {round(net_pnl, 3)} | Congelada: {cooldown_state[symbol]['active']}")

    # 1. SALIDA DE EMERGENCIA / TAKE PROFIT (Congela al ganar)
    if net_pnl >= 0.15:
        if l_amt > 0: client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=l_amt, positionSide='LONG')
        if s_amt > 0: client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=s_amt, positionSide='SHORT')
        
        # ACTIVAR CONGELADORA
        cooldown_state[symbol]["active"] = True
        cooldown_state[symbol]["last_price"] = price
        print(f"💰 {symbol} CERRADO EN GANANCIA - CONGELADORA ACTIVADA")
        return

    # 2. REVERSIÓN / RECOVERY (Solo si hay pérdida acumulada)
    if net_pnl < -(BASE_USDT * 0.08):
        raw_qty = (abs(net_pnl) * 1.2) / price
        target_qty = round(raw_qty, qty_prec)
        if prediction == "BULLISH" and l_amt > 0:
            client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=target_qty, positionSide='LONG')
        elif prediction == "BEARISH" and s_amt > 0:
            client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=target_qty, positionSide='SHORT')

    # 3. FILTRO DE RE-ENTRADA (CONGELADORA)
    if cooldown_state[symbol]["active"]:
        diff = abs(price - cooldown_state[symbol]["last_price"]) / price * 100
        if diff > 0.3: # El precio debe alejarse 0.3% para descongelar
            cooldown_state[symbol]["active"] = False
            print(f"❄️ {symbol} DESCONGELADO")
        else:
            return # No hace nada si está congelado

    # 4. ENTRADAS NUEVAS
    if prediction != "NEUTRAL":
        side = 'BUY' if prediction == "BULLISH" else 'SELL'
        p_side = 'LONG' if prediction == "BULLISH" else 'SHORT'
        current_amt = l_amt if prediction == "BULLISH" else s_amt
        
        # Solo abre si no tiene ya una posición en esa dirección
        if current_amt == 0:
            qty = round(BASE_USDT / price, qty_prec)
            if qty > 0:
                client.futures_create_order(symbol=symbol, side=side, type='MARKET', quantity=qty, positionSide=p_side)
                print(f"🚀 {symbol} Entrada pequeña enviada")

# ===============================================================
# LOOP PRINCIPAL
# ===============================================================
def bot_loop():
    print("🤖 IA BOT MULTI-SYMBOL ACTIVADO")
    while True:
        for s in WATCH:
            try:
                execute_logic(s)
            except Exception as e:
                print(f"Error en {s}: {e}")
            time.sleep(2)
        time.sleep(10)

if __name__ == "__main__":
    # Hilo para el bot
    t = threading.Thread(target=bot_loop)
    t.daemon = True
    t.start()
    
    # Servidor Flask para Render
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
