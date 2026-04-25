import ccxt
import pandas as pd
import numpy as np
import time
import os
import threading
from flask import Flask
from datetime import datetime
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator

# --- CONFIGURACIÓN DE RENDER (WEB SERVICE GRATUITO) ---
app = Flask(__name__)

@app.route('/')
def health_check():
    return f"Bot WLD Activo - Última actualización: {datetime.now().strftime('%H:%M:%S')}", 200

# --- CONFIGURACIÓN DEL TRADING ---
SYMBOL = 'WLD/USDT'
TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']
RIESGO_POR_OPERACION = 0.2 # Cantidad máxima a perder en USD por trade
APALANCAMIENTO = 75
LIMIT = 200

# Conexión a Binance (Usa variables de entorno en Render)
exchange = ccxt.binance({
    'apiKey': os.getenv('BINANCE_API_KEY'),
    'secret': os.getenv('BINANCE_SECRET_KEY'),
    'enableRateLimit': True,
    'options': {'defaultType': 'future'}
})

# --- FUNCIONES DE ANÁLISIS (TÚ LÓGICA) ---

def get_orderbook_data(symbol):
    try:
        ob = exchange.fetch_order_book(symbol)
        bids = sum([b[1] for b in ob['bids']])
        asks = sum([a[1] for a in ob['asks']])
        obi = (bids - asks) / (bids + asks) if (bids + asks) > 0 else 0
        absorption = abs(sum([b[1] for b in ob['bids'][:10]]) - sum([a[1] for a in ob['asks'][:10]]))
        return obi, bids, asks, absorption
    except:
        return 0, 0, 0, 0

def get_volume_delta(df):
    buy_vol = df[df['close'] > df['open']]['volume'].sum()
    sell_vol = df[df['close'] < df['open']]['volume'].sum()
    return ((buy_vol - sell_vol) / (buy_vol + sell_vol)) * 100 if (buy_vol + sell_vol) > 0 else 0

def get_fvg(df):
    if len(df) < 3: return "SOLIDO"
    c3, c2, c1 = df.iloc[-3], df.iloc[-2], df.iloc[-1]
    if c3['high'] < c1['low']: return "BULL G"
    if c3['low'] > c1['high']: return "BEAR G"
    return "SOLIDO"

def get_bias_pro(df, obi, delta, rsi):
    price = df['close'].iloc[-1]
    ema20 = EMAIndicator(df['close'], window=20).ema_indicator().iloc[-1]
    ema50 = EMAIndicator(df['close'], window=50).ema_indicator().iloc[-1]

    score = 0
    if obi < -0.1: score -= 1
    if obi > 0.1: score += 1
    if delta < -10: score -= 1
    if delta > 10: score += 1
    if rsi < 45: score -= 1
    if rsi > 55: score += 1
    if price < ema20: score -= 1
    if price > ema20: score += 1
    if ema20 < ema50: score -= 1
    if ema20 > ema50: score += 1

    if score <= -3: return "SHORT"
    if score >= 3: return "LONG"
    return "NEUTRAL"

def get_daily_volatility(symbol):
    try:
        ohlcv = exchange.fetch_ohlcv(symbol, '1d', limit=4)
        df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
        df['range'] = df['high'] - df['low']
        return df['range'].tail(3).mean()
    except:
        return 0.1 # Valor por defecto si falla

# --- GESTIÓN DE EJECUCIÓN ---

def calcular_cantidad(precio, sl_precio):
    distancia = abs(precio - sl_precio)
    if distancia == 0: return 0
    return RIESGO_POR_OPERACION / distancia

def abrir_posicion(side, precio, sl, tp):
    try:
        exchange.set_leverage(APALANCAMIENTO, SYMBOL)
        cantidad = calcular_cantidad(precio, sl)
        
        # Redondear cantidad según reglas de Binance (WLD suele ser 1 decimal o entero)
        cantidad = exchange.amount_to_precision(SYMBOL, cantidad)
        
        print(f"🚀 Enviando orden {side} | Cantidad: {cantidad}")
        
        # Orden de entrada
        order = exchange.create_market_order(SYMBOL, side, cantidad)
        
        # Órdenes de cierre (SL y TP)
        lado_cierre = 'sell' if side == 'buy' else 'buy'
        exchange.create_order(SYMBOL, 'STOP_MARKET', lado_cierre, cantidad, params={'stopPrice': sl})
        exchange.create_order(SYMBOL, 'TAKE_PROFIT_MARKET', lado_cierre, cantidad, params={'stopPrice': tp})
        
        print(f"✅ Trade configurado: SL {sl} | TP {tp}")
    except Exception as e:
        print(f"❌ Error al ejecutar trade: {e}")

def bot_loop():
    print("🤖 Bot iniciado y analizando mercado...")
    while True:
        try:
            # Datos de mercado
            obi, bids, asks, absorp = get_orderbook_data(SYMBOL)
            rango_limite = get_daily_volatility(SYMBOL)
            
            # Usamos 15m para la decisión de entrada
            ohlcv = exchange.fetch_ohlcv(SYMBOL, '15m', limit=LIMIT)
            df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
            
            precio_actual = df['close'].iloc[-1]
            rsi = RSIIndicator(df['close']).rsi().iloc[-1]
            delta = get_volume_delta(df)
            bias = get_bias_pro(df, obi, delta, rsi)
            
            # Soporte y Resistencia para SL/TP
            h_liq = df['high'].rolling(20).max().iloc[-1]
            l_liq = df['low'].rolling(20).min().iloc[-1]

            # Verificar posición actual
            balance = exchange.fetch_balance()
            posiciones = balance['info']['positions']
            pos_wld = next((p for p in posiciones if p['symbol'] == 'WLDUSDT'), None)
            amt = float(pos_wld['positionAmt']) if pos_wld else 0

            if amt == 0: # Si no hay trades abiertos
                distancia_dia = abs(precio_actual - df['open'].iloc[0])
                
                if bias == "LONG" and distancia_dia < rango_limite:
                    abrir_posicion('buy', precio_actual, l_liq, h_liq)
                
                elif bias == "SHORT" and distancia_dia < rango_limite:
                    abrir_posicion('sell', precio_actual, h_liq, l_liq)

            print(f"Log: {datetime.now().strftime('%H:%M')} | Precio: {precio_actual} | Bias: {bias}")
            time.sleep(60) # Revisar cada minuto

        except Exception as e:
            print(f"Error en loop: {e}")
            time.sleep(30)

# --- INICIO ---
if __name__ == "__main__":
    # Iniciar bot en segundo plano
    t = threading.Thread(target=bot_loop)
    t.daemon = True
    t.start()
    
    # Iniciar servidor Flask para Render
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
