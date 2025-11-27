// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v7.2
// (Saldo seguro + Predicción -25% + MinBet tras 2 mini-crashes)
// Autor: Charly UNAM + GPT-5
// ===============================================================


// ===================================================================
// 🟦 ESTADO GENERAL
// ===================================================================
let gameState = {
    roundActive: false,
    currentCrash: 0.0,
    lastCrash: 0.0,
    waitingNextStart: false,
    predicted: null
};


// ===================================================================
// 🟦 MEMORIA INTERNA (JSON)
// ===================================================================
let memory = {
    crashes: [],
    fiboGroups: {
        low: 0,
        mid: 0,
        high: 0,
        ultra: 0
    }
};


// ===================================================================
// 🟦 CLASIFICACIÓN FIBONACCI
// ===================================================================
function classifyFibo(n) {
    if (n <= 1.61) return "low";
    if (n <= 2.61) return "mid";
    if (n <= 4.23) return "high";
    return "ultra";
}


// ===================================================================
// 🟦 ACTUALIZAR MEMORIA
// ===================================================================
function updateMemory(crash) {
    memory.crashes.push(crash);

    const c = classifyFibo(crash);
    memory.fiboGroups[c]++;

    if (memory.crashes.length > 5000) {
        memory.crashes.shift();
    }
}


// ===================================================================
// 🟦 SELECTORES
// ===================================================================
const HISTORY_SELECTOR = '.styles_historyElement__3VTSn';
const CRASH_SELECTOR = '#crash-payout-text';


// ===================================================================
// 🟦 FUNCIONES DE ELEMENTOS
// ===================================================================
function getFloatFromElement(selector) {
    const el = document.querySelector(selector);
    return el ? parseFloat(el.innerText.replace(/[^\d.]/g, "")) : null;
}


// Botón APUESTA
function getBetButton() {
    return document.querySelector("#crash-pay-button");
}


// Botón CASHOUT
function getCashoutButton() {
    return document.evaluate(
        "//div[text()='Cashout']/parent::button",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;
}


// ===================================================================
// 🟦 LEER HISTORIAL VISUAL
// ===================================================================
function getHistoryValues() {
    const items = document.querySelectorAll(HISTORY_SELECTOR);
    let vals = [];

    items.forEach(i => {
        const v = parseFloat(i.innerText.replace(/[^\d.]/g, ""));
        if (!isNaN(v)) vals.push(v > 10 ? 10 : v);
    });

    return vals.reverse();
}


// ===================================================================
// 🟦 SUAVIZADO EXPONENCIAL
// ===================================================================
function exponentialSmoothing(data, alpha = 0.25) {
    if (data.length === 0) return 1.0;

    let s = data[0];
    for (let i = 1; i < data.length; i++) {
        s = alpha * data[i] + (1 - alpha) * s;
    }
    return s;
}


// ===================================================================
// 🟦 PREDICCIÓN
// ===================================================================
function calculatePrediction() {
    if (memory.crashes.length < 5) return 1.10;

    let smoothed = exponentialSmoothing(memory.crashes);

    let wLow = memory.fiboGroups.low * 0.4;
    let wMid = memory.fiboGroups.mid * 0.7;
    let wHigh = memory.fiboGroups.high * 1.2;
    let wUltra = memory.fiboGroups.ultra * 2.0;

    let totalWeight = wLow + wMid + wHigh + wUltra;

    let fiboWeighted =
        (1.3 * wLow +
         1.9 * wMid +
         2.8 * wHigh +
         4.5 * wUltra) / (totalWeight || 1);

    let pred = Math.max(1.05, smoothed * 0.7 + fiboWeighted * 0.3);

    // 🔥 REDUCE PREDICCIÓN 25%
    pred = pred * 0.75;

    return pred;
}


// ===================================================================
// 🟦 DETECTAR INICIO / FIN DE RONDA
// ===================================================================
function updateCrashState() {
    const txt = document.querySelector(CRASH_SELECTOR);
    if (!txt) return;

    let raw = txt.innerText;

    if (raw.includes("Starts in")) {
        gameState.roundActive = false;
        gameState.waitingNextStart = true;
        return;
    }

    if (raw.includes("x")) {
        let crash = parseFloat(raw.replace("x", ""));
        if (!isNaN(crash)) {
            gameState.currentCrash = crash;
            gameState.roundActive = true;

            updateMemory(crash);
            registerMiniCrash(crash);   // 🆕 REGISTRO DE CRASH < 2

            checkCashout();
        }
    }
}


// ===================================================================
// 🟦 AUTO BET
// ===================================================================
function tryBet() {
    if (!gameState.waitingNextStart) return;
    const btn = getBetButton();
    if (btn) {
        console.log("💸 Apostando automáticamente…");
        btn.click();
        gameState.waitingNextStart = false;
    }
}


// ===================================================================
// 🟦 CASHOUT EXACTO
// ===================================================================
function checkCashout() {
    if (!gameState.roundActive || !gameState.predicted) return;

    const target = parseFloat(gameState.predicted.toFixed(2));
    const current = gameState.currentCrash;

    if (current >= target) {
        const btn = getCashoutButton();
        if (btn) {
            console.log(`💰 CASHOUT: ${current}x (pred ${target})`);
            btn.click();
            gameState.predicted = null;
        }
    }
}


// ===================================================================
// 🟦 TRACKER DE SALDO
// ===================================================================
let balanceTracker = {
    maxBalance: 0,
    lastBalance: 0
};


function getBalanceClean() {
    const el = document.querySelector(".coinSelect_balance span");
    if (!el) return null;

    let text = el.innerText.trim();

    text = text.replace(/[≈$,]/g, "");

    let bal = parseFloat(text);

    return isNaN(bal) ? null : bal;
}

function updateBalance() {
    const bal = getBalanceClean();
    if (!bal) return;

    balanceTracker.lastBalance = bal;
    if (bal > balanceTracker.maxBalance) balanceTracker.maxBalance = bal;
}



// ===================================================================
// 🟦 🔥 NUEVO: DETECTOR DE 2 CRASHES MENORES A 2.00
// ===================================================================
let miniCrashCount = 0;
let forceMinBet = false;

function registerMiniCrash(value) {
    if (value < 2) {
        miniCrashCount++;
    } else {
        miniCrashCount = 0;
        forceMinBet = false;
    }

    if (miniCrashCount >= 2) {
        console.log("⚠️ Se detectaron 2 crashes consecutivos menores a 2x.");
        console.log("⛔ Activando apuesta mínima obligatoria.");
        forceMinBet = true;
    }
}



// ===================================================================
// 🟦 PROPUESTA DE APUESTA (RECUPERAR PERDIDAS / MINBET FORZADO)
// ===================================================================
async function proposeRecoveryBet(predicted) {
    updateBalance();

    const bal = balanceTracker.lastBalance;
    const maxBal = balanceTracker.maxBalance;

    let stake;

    // 🆕 SI HAY DOS CRASHES SEGUIDOS < 2
    if (forceMinBet) {
        stake = 0.00000001;  // apuesta mínima real
    }
    else {
        let lost = maxBal - bal;

        if (lost <= 0) {
            stake = bal * 0.01;
        } else {
            stake = lost / (predicted - 1);
        }

        stake = Math.max(stake, 0.00000001);
        if (stake > bal * 0.10) {
            stake = bal * 0.10;
        }
    }

    stake = parseFloat(stake.toFixed(8));

    console.log("🎯 Apuesta sugerida:", stake);

    try {
        await navigator.clipboard.writeText(stake.toString());
        console.log("📋 Copiado al portapapeles:", stake);
    } catch (e) {
        console.log("⛔ No se pudo copiar al portapapeles.");
    }
}



// ===================================================================
// 🟦 LOOP PRINCIPAL
// ===================================================================
setInterval(() => {

    updateCrashState();

    if (!gameState.roundActive && gameState.waitingNextStart) {
        tryBet();
    }

    if (!gameState.roundActive && !gameState.waitingNextStart) {

        const pred = calculatePrediction();
        gameState.predicted = pred;

        console.log("🔥 NUEVO CRASH:", gameState.currentCrash);
        console.log("📊 Predicción:", pred.toFixed(2));
        console.log("📦 #Memoria:", memory.crashes.length);
        console.log("🔢 Fibo:", memory.fiboGroups);

        proposeRecoveryBet(pred);

        gameState.waitingNextStart = true;
    }

}, 150);


// ===================================================================
// 🟦 CASHOUT INSTANTÁNEO
// ===================================================================
const style = document.createElement("style");
style.innerHTML = `
.crashGameAnimation {
    animation-duration: 0.0s !important;
    transition-duration: 0.0s !important;
}
`;
document.head.appendChild(style);


function checkCashoutInstant() {
    if (!gameState.roundActive || !gameState.predicted) return;

    const target = parseFloat(gameState.predicted.toFixed(2));

    const realCrash = parseFloat(
        document.querySelector("#crash-payout-text")
            ?.innerText.replace(/[^\d.]/g, "")
    );

    if (!realCrash || isNaN(realCrash)) return;

    if (realCrash >= target) {
        const btn = getCashoutButton();
        if (btn) queueMicrotask(() => btn.click());
        gameState.predicted = null;
    }
}


function attachAnimationEndWatcher() {
    const el = document.querySelector("#crash-payout-text");
    if (!el) return;

    el.addEventListener("animationend", () => {
        checkCashoutInstant();
    });
}

setInterval(attachAnimationEndWatcher, 300);
