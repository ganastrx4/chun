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

SYMBOLS = [
    "WLD/USDT",
    "XRP/USDT"
]

TIMEFRAME = "5m"
LIMIT = 300

LEVERAGE = 75
RIESGO = 0.10          # riesgo por trade por moneda
MARTINGALA_FACTOR = 1.01

TRAIL_START = 8
TRAIL_GIVEBACK = 3
MAX_DRAWDOWN = -18

LOOP_SECONDS = 18

# ============================================================
# BINANCE
# ============================================================

exchange = ccxt.binance({
    "apiKey": os.getenv("BINANCE_API_KEY"),
    "secret": os.getenv("BINANCE_SECRET_KEY"),
    "enableRateLimit": True,
    "options": {
        "defaultType": "future",
        "adjustForTimeDifference": True,
        "recvWindow": 15000
    }
})

# ============================================================
# ESTADO GLOBAL POR MONEDA
# ============================================================

state = {}

for s in SYMBOLS:
    state[s] = {
        "loss_streak": 0,
        "max_long": 0,
        "max_short": 0
    }

# ============================================================
# HELPERS
# ============================================================

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def num(x):
    try:
        return float(x)
    except:
        return 0.0

# ============================================================
# DATA
# ============================================================

def candles(symbol):
    data = exchange.fetch_ohlcv(symbol, TIMEFRAME, limit=LIMIT)

    df = pd.DataFrame(data, columns=[
        "time","open","high","low","close","volume"
    ])
    return df

# ============================================================
# INDICADORES
# ============================================================

def indicators(df):

    df["rsi"] = RSIIndicator(df["close"], 14).rsi()

    df["ema9"] = EMAIndicator(df["close"], 9).ema_indicator()
    df["ema21"] = EMAIndicator(df["close"], 21).ema_indicator()
    df["ema50"] = EMAIndicator(df["close"], 50).ema_indicator()

    macd = MACD(df["close"])
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()

    atr = AverageTrueRange(
        df["high"], df["low"], df["close"], 14
    )

    df["atr"] = atr.average_true_range()

    return df.dropna()

# ============================================================
# STRUCTURE
# ============================================================

def support_resistance(df):

    recent = df.tail(120)

    support = recent["low"].quantile(0.05)
    resistance = recent["high"].quantile(0.95)

    return support, resistance

def is_lateral(df):

    h = df.tail(80)["high"].max()
    l = df.tail(80)["low"].min()

    width = (h - l) / l * 100

    return width < 1.2

# ============================================================
# ORDERBOOK
# ============================================================

def obi(symbol):

    try:
        ob = exchange.fetch_order_book(symbol, 20)

        bids = sum(x[1] for x in ob["bids"][:10])
        asks = sum(x[1] for x in ob["asks"][:10])

        if bids + asks == 0:
            return 0

        return (bids - asks) / (bids + asks)

    except:
        return 0

# ============================================================
# SIGNAL
# ============================================================

def signal(df, ob):

    last = df.iloc[-1]

    score = 0

    if last["rsi"] > 58:
        score += 1

    if last["rsi"] < 42:
        score -= 1

    if last["ema9"] > last["ema21"] > last["ema50"]:
        score += 2

    if last["ema9"] < last["ema21"] < last["ema50"]:
        score -= 2

    if last["macd"] > last["macd_signal"]:
        score += 1
    else:
        score -= 1

    if ob > 0.18:
        score += 1

    if ob < -0.18:
        score -= 1

    if score >= 2:
        return "LONG"

    if score <= -2:
        return "SHORT"

    return "NEUTRAL"

# ============================================================
# POSITIONS
# ============================================================

def positions(symbol):

    bal = exchange.fetch_balance()
    arr = bal["info"]["positions"]

    target = symbol.replace("/", "")

    longp = None
    shortp = None

    for p in arr:

        if p["symbol"] == target:

            amt = num(p["positionAmt"])

            if amt > 0:
                longp = p

            elif amt < 0:
                shortp = p

    return longp, shortp

# ============================================================
# ROI
# ============================================================

def roi(pos, price):

    if not pos:
        return 0

    amt = num(pos["positionAmt"])

    entry = (
        pos.get("entryPrice")
        or pos.get("avgPrice")
        or pos.get("markPrice")
        or 0
    )

    entry = num(entry)

    if entry == 0:
        return 0

    if amt > 0:
        pnl = (price - entry) / entry
    else:
        pnl = (entry - price) / entry

    return pnl * LEVERAGE * 100

# ============================================================
# SIZE
# ============================================================

def qty(symbol, price, sl):

    loss = state[symbol]["loss_streak"]

    risk = RIESGO * (MARTINGALA_FACTOR ** loss)

    dist = abs(price - sl)

    if dist <= 0:
        return 0

    q = risk / dist

    try:
        q = float(exchange.amount_to_precision(symbol, q))
    except:
        q = round(q, 1)

    return q

# ============================================================
# OPEN
# ============================================================

def open_trade(symbol, side, price, sl):

    try:

        exchange.set_leverage(LEVERAGE, symbol)

        q = qty(symbol, price, sl)

        if q <= 0:
            return

        posSide = "LONG" if side == "buy" else "SHORT"

        log(f"{symbol} 🚀 {posSide} qty={q}")

        exchange.create_order(
            symbol,
            "MARKET",
            side,
            q,
            params={"positionSide": posSide}
        )

    except Exception as e:
        log(f"{symbol} ERROR OPEN {e}")

# ============================================================
# CLOSE
# ============================================================

def close_pos(symbol, pos):

    try:

        amt = abs(num(pos["positionAmt"]))

        if num(pos["positionAmt"]) > 0:
            side = "sell"
            posSide = "LONG"
        else:
            side = "buy"
            posSide = "SHORT"

        exchange.create_order(
            symbol,
            "MARKET",
            side,
            amt,
            params={"positionSide": posSide}
        )

        log(f"{symbol} ✅ CLOSED")

    except Exception as e:
        log(f"{symbol} ERROR CLOSE {e}")

# ============================================================
# CORE SYMBOL LOOP
# ============================================================

def run_symbol(symbol):

    try:

        df = candles(symbol)
        df = indicators(df)

        price = df["close"].iloc[-1]
        atr = df["atr"].iloc[-1]

        support, resistance = support_resistance(df)
        lateral = is_lateral(df)

        ob = obi(symbol)
        sig = signal(df, ob)

        longp, shortp = positions(symbol)

        # ----------------------------------
        # ENTRY
        # ----------------------------------

        if lateral:

            if price <= support * 1.002 and not longp:
                open_trade(symbol, "buy", price, support * 0.997)

            if price >= resistance * 0.998 and not shortp:
                open_trade(symbol, "sell", price, resistance * 1.003)

        else:

            if sig == "LONG" and not longp:
                open_trade(symbol, "buy", price, price - atr * 1.5)

            if sig == "SHORT" and not shortp:
                open_trade(symbol, "sell", price, price + atr * 1.5)

        # ----------------------------------
        # LONG MANAGEMENT
        # ----------------------------------

        if longp:

            r = roi(longp, price)

            if r > state[symbol]["max_long"]:
                state[symbol]["max_long"] = r

            mx = state[symbol]["max_long"]

            if mx > TRAIL_START and r < mx - TRAIL_GIVEBACK:
                close_pos(symbol, longp)

                if r < 0:
                    state[symbol]["loss_streak"] += 1
                else:
                    state[symbol]["loss_streak"] = 0

                state[symbol]["max_long"] = 0

            if r < MAX_DRAWDOWN:
                close_pos(symbol, longp)
                state[symbol]["max_long"] = 0

        # ----------------------------------
        # SHORT MANAGEMENT
        # ----------------------------------

        if shortp:

            r = roi(shortp, price)

            if r > state[symbol]["max_short"]:
                state[symbol]["max_short"] = r

            mx = state[symbol]["max_short"]

            if mx > TRAIL_START and r < mx - TRAIL_GIVEBACK:
                close_pos(symbol, shortp)

                if r < 0:
                    state[symbol]["loss_streak"] += 1
                else:
                    state[symbol]["loss_streak"] = 0

                state[symbol]["max_short"] = 0

            if r < MAX_DRAWDOWN:
                close_pos(symbol, shortp)
                state[symbol]["max_short"] = 0

        log(
            f"{symbol} | P={price:.4f} | {sig} | "
            f"Lateral={lateral} | "
            f"S={support:.4f} R={resistance:.4f}"
        )

    except Exception as e:
        log(f"{symbol} ⚠ {e}")

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
