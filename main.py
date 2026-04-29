# ============================================================
# CHC GOD MODE MULTI BOT
# XRP + WLD AL MISMO TIEMPO
# Binance Futures / Render Ready
# ============================================================

import ccxt
import pandas as pd
import time
import os
import threading

from flask import Flask
from datetime import datetime

from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator, MACD
from ta.volatility import AverageTrueRange

# ============================================================
# FLASK HEALTHCHECK
# ============================================================

app = Flask(__name__)

@app.route("/")
def home():
    return f"🤖 MULTI BOT ONLINE | {datetime.now().strftime('%H:%M:%S')}", 200

# ============================================================
# CONFIG GENERAL
# ============================================================

import time
import math
import numpy as np
from statistics import mean
from binance.client import Client
from binance.enums import *

# ===============================================================
# CONFIGURACIÓN
# ===============================================================
API_KEY = "an460B0AemHRLgbQ5ropCoz8XCm6YqeNp3vNs649A4XgDGcYQ1iIqIIfKwxPb7XN"
API_SECRET = "ULKGrnpjZItj4VGZbfeoT03ubVPi3ev935m6WcGcO0zBYdzodbjy4KoLDARbFWAV"
client = Client(API_KEY, API_SECRET)

WATCH = ["WLDUSDT", "XRPUSDT"]
BASE_USDT = 5.5
MAX_POS_USDT = 30
LEVERAGE = 75

# ===============================================================
# CEREBRO: ARQUITECTURA TRIPLE RED
# ===============================================================

def red_momentum(closes):
    """ Red 1: Evalúa la aceleración (Fuerza) """
    diffs = np.diff(closes)
    acceleration = np.diff(diffs)
    if acceleration[-1] > 0 and closes[-1] > np.mean(closes):
        return 1  # Bullish
    elif acceleration[-1] < 0 and closes[-1] < np.mean(closes):
        return -1 # Bearish
    return 0

def red_volatilidad(closes):
    """ Red 2: Filtro de Calidad (Evita laterales) """
    std_dev = np.std(closes[-20:])
    avg_price = np.mean(closes[-20:])
    # Si la volatilidad es muy baja respecto al precio, es zona peligrosa (muerta)
    if std_dev < (avg_price * 0.0005): 
        return 0 # Mercado plano, no operar
    return 1 # Hay suficiente movimiento

def red_volumen_flow(closes, volumes):
    """ Red 3: Sentimiento de Ballenas """
    vol_avg = np.mean(volumes[-10:])
    current_vol = volumes[-1]
    
    # Si el precio sube con volumen > promedio: Compra fuerte
    if closes[-1] > closes[-2] and current_vol > vol_avg:
        return 1
    # Si el precio baja con volumen > promedio: Venta fuerte
    elif closes[-1] < closes[-2] and current_vol > vol_avg:
        return -1
    return 0

def neurona_consenso(symbol):
    """ Integra las 3 redes en una decisión final """
    k = client.futures_klines(symbol=symbol, interval='1m', limit=30)
    closes = np.array([float(x[4]) for x in k])
    volumes = np.array([float(x[5]) for x in k])
    
    r1 = red_momentum(closes)
    r2 = red_volatilidad(closes)
    r3 = red_volumen_flow(closes, volumes)
    
    # Lógica de Consenso:
    # Si la red de volatilidad dice que no hay movimiento (0), bloqueamos todo.
    if r2 == 0: return "NEUTRAL"
    
    # Sumatoria de señales
    total_score = r1 + r3
    
    if total_score >= 1.5: return "BULLISH"
    if total_score <= -1.5: return "BEARISH"
    return "NEUTRAL"

# ===============================================================
# MOTOR DE EJECUCIÓN (HEDGE & PRECISION)
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
    price = float(client.futures_symbol_ticker(symbol=symbol)['price'])
    
    # Obtener info de posiciones
    pos = client.futures_position_information(symbol=symbol)
    l_amt, s_amt, l_pnl, s_pnl = 0, 0, 0, 0
    for p in pos:
        amt = float(p["positionAmt"])
        if amt > 0: l_amt, l_pnl = amt, float(p["unRealizedProfit"])
        if amt < 0: s_amt, s_pnl = abs(amt), float(p["unRealizedProfit"])

    net_pnl = l_pnl + s_pnl
    print(f"[{symbol}] IA: {prediction} | Net PNL: {round(net_pnl, 3)}")

    # 1. SALIDA DE EMERGENCIA / TAKE PROFIT NETO
    if net_pnl >= 0.15: # Cierra todo si el conjunto gana 0.15 USDT
        if l_amt > 0: client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=l_amt, positionSide='LONG')
        if s_amt > 0: client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=s_amt, positionSide='SHORT')
        print("💰 CICLO CERRADO EN GANANCIA")
        return

    # 2. REVERSIÓN INTELIGENTE (Recovery)
    if net_pnl < -(BASE_USDT * 0.08):
        # Si la tendencia confirmada por las 3 redes es contraria a la pérdida
        raw_qty = (abs(net_pnl) * 1.2) / price
        target_qty = round(raw_qty, qty_prec)
        
        if prediction == "BULLISH" and l_amt > 0:
            client.futures_create_order(symbol=symbol, side='BUY', type='MARKET', quantity=target_qty, positionSide='LONG')
            print(f"💉 Inyectando recuperación a LONG")
        elif prediction == "BEARISH" and s_amt > 0:
            client.futures_create_order(symbol=symbol, side='SELL', type='MARKET', quantity=target_qty, positionSide='SHORT')
            print(f"💉 Inyectando recuperación a SHORT")

    # 3. ENTRADAS NUEVAS
    if prediction != "NEUTRAL":
        side = 'BUY' if prediction == "BULLISH" else 'SELL'
        p_side = 'LONG' if prediction == "BULLISH" else 'SHORT'
        current_exp = (l_amt if prediction == "BULLISH" else s_amt) * price
        
        if current_exp < MAX_POS_USDT:
            qty = round(BASE_USDT / price, qty_prec)
            if qty > 0:
                client.futures_create_order(symbol=symbol, side=side, type='MARKET', quantity=qty, positionSide=p_side)

# ===============================================================
# LOOP PRINCIPAL
# ===============================================================
while True:
    for s in WATCH:
        try: execute_logic(s)
        except Exception as e: print(f"Error: {e}")
    time.sleep(4)

# ============================================================
# MASTER LOOP
# ============================================================

def bot():

    log("🤖 MULTI BOT XRP + WLD ONLINE")

    while True:

        for symbol in SYMBOLS:
            run_symbol(symbol)
            time.sleep(2)

        time.sleep(LOOP_SECONDS)

# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    t = threading.Thread(target=bot)
    t.daemon = True
    t.start()

    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
