import ccxt
import pandas as pd
import numpy as np
import time
import os
from datetime import datetime
from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator

# --- CONFIGURACIÓN DE SEGURIDAD ---
SYMBOL = 'WLD/USDT'
TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']
LIMIT = 202
RIESGO_POR_OPERACION = 0.50  # Cuánto dinero estás dispuesto a perder por trade (de tus $4.5)
APALANCAMIENTO = 75  # Ajusta según tu perfil

# Llaves API (Usa variables de entorno en Render)
exchange = ccxt.binance({
    'apiKey': os.getenv('BINANCE_API_KEY'),
    'secret': os.getenv('BINANCE_SECRET_KEY'),
    'enableRateLimit': True,
    'options': {'defaultType': 'future'}
})

def get_daily_volatility(symbol):
    """ Calcula el promedio de movimiento de las últimas 3 velas de 1D """
    ohlcv = exchange.fetch_ohlcv(symbol, '1d', limit=4)
    df = pd.DataFrame(ohlcv, columns=['time','open','high','low','close','volume'])
    df['range'] = df['high'] - df['low']
    return df['range'].tail(3).mean()

def calcular_cantidad(precio, sl_precio):
    """ Calcula cuánto comprar para arriesgar solo el monto definido """
    distancia_stop = abs(precio - sl_precio)
    if distancia_stop == 0: return 0
    # Cantidad = Riesgo / Distancia al Stop
    cantidad = RIESGO_POR_OPERACION / distancia_stop
    return cantidad

def abrir_posicion(side, precio, sl, tp):
    """ Ejecuta la orden en Binance con SL y TP """
    try:
        print(f"🚀 Ejecutando {side}...")
        exchange.set_leverage(APALANCAMIENTO, SYMBOL)
        
        cantidad = calcular_cantidad(precio, sl)
        
        # Orden de Mercado
        order = exchange.create_market_order(SYMBOL, side, cantidad)
        
        # Stop Loss y Take Profit (Órdenes de cierre)
        tipo_cierre = 'sell' if side == 'buy' else 'buy'
        exchange.create_order(SYMBOL, 'STOP_MARKET', tipo_cierre, cantidad, params={'stopPrice': sl})
        exchange.create_order(SYMBOL, 'TAKE_PROFIT_MARKET', tipo_cierre, cantidad, params={'stopPrice': tp})
        
        print(f"✅ Posición abierta. SL: {sl} | TP: {tp}")
    except Exception as e:
        print(f"❌ Error al abrir: {e}")

# ... (Aquí van tus funciones get_orderbook_data, get_volume_delta, get_fvg, get_bias_pro) ...

# --- MAIN LOOP DE EJECUCIÓN ---
while True:
    try:
        # 1. Obtener Análisis
        obi, bids, asks, absorption = get_orderbook_data(SYMBOL)
        rango_3d = get_daily_volatility(SYMBOL)
        
        # Obtenemos datos de 15m para la entrada (es un buen equilibrio)
        ohlcv_15 = exchange.fetch_ohlcv(SYMBOL, '15m', limit=LIMIT)
        df_15 = pd.DataFrame(ohlcv_15, columns=['time','open','high','low','close','volume'])
        
        precio_actual = df_15['close'].iloc[-1]
        rsi_15 = RSIIndicator(df_15['close']).rsi().iloc[-1]
        delta_15 = get_volume_delta(df_15)
        bias_actual = get_bias_pro(df_15, obi, delta_15, rsi_15)
        
        # Puntos de liquidez para SL/TP
        high_liq = df_15['high'].rolling(20).max().iloc[-1]
        low_liq = df_15['low'].rolling(20).min().iloc[-1]

        # 2. Lógica de Trading (Evitar liquidación)
        posiciones = exchange.fetch_positions([SYMBOL])
        tiene_posicion = float(posiciones[0]['info']['positionAmt']) != 0

        if not tiene_posicion:
            # Solo entra si el movimiento no ha superado el promedio de 3 días (evita comprar caro)
            distancia_recorrida = abs(precio_actual - df_15['open'].iloc[0])
            
            if bias_actual == "LONG" and distancia_recorrida < rango_3d:
                abrir_posicion('buy', precio_actual, low_liq, high_liq)
            
            elif bias_actual == "SHORT" and distancia_recorrida < rango_3d:
                abrir_posicion('sell', precio_actual, high_liq, low_liq)

        print(f"Esperando señal... Precio: {precio_actual} | Bias: {bias_actual}")
        time.sleep(30)

    except Exception as e:
        print(f"Error en loop: {e}")
        time.sleep(10)
