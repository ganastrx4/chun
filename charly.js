// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v5.1 (Cashout EXACTO + Pred redondeada)
// Autor: Charly UNAM & GPT-5
// MODIFICADO: Añadida impresión de Estrategia de Apuesta Fija
// ===============================================================

// === Estado general ===
let gameState = {
  roundActive: false,
  currentCrash: 0.0,
  lastCrash: 0.0,
  waitingNextStart: false,
  predicted: null
};

// === Estrategia de Apuesta (Fija para Maximizar el Histórico) ===
const STRATEGY = {
  BET_AMOUNT: "MIN", // Usar el botón 'min' o un valor fijo bajo (ej. 0.00001920)
  PAYOUT_TARGET: 1.20 // Objetivo de Payout bajo para alta tasa de victorias
};

// === Selectores ===
const HISTORY_SELECTOR = '.styles_historyElement__3VTSn';
const CRASH_SELECTOR = '#crash-payout-text';

// === FUNCIONES DE ELEMENTOS ===
function getFloatFromElement(selector) {
  const el = document.querySelector(selector);
  return el ? parseFloat(el.innerText.replace(/[^\d.]/g, "")) : null;
}

// === BOTÓN APUESTA “At the next round” ===
function getBetButton() {
  return document.querySelector("#crash-pay-button");
}

// === BOTÓN CASHOUT ===
function getCashoutButton() {
  return document.evaluate(
    "//div[text()='Cashout']/parent::button",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
}

// === HISTORIAL ===
function getHistoryValues() {
  const items = document.querySelectorAll(HISTORY_SELECTOR);
  let vals = [];

  items.forEach(i => {
    const v = parseFloat(i.innerText.replace(/[^\d.]/g, ""));
    if (!isNaN(v)) {
      vals.push(v > 10 ? 10 : v); // Crashes > 10 se vuelven 10
    }
  });

  return vals.reverse();
}

// === SUAVIZADO EXPONENCIAL ===
function exponentialSmoothing(data, alpha = 0.25) {
  if (data.length === 0) return 1.0;
  let s = data[0];
  for (let i = 1; i < data.length; i++) {
    s = alpha * data[i] + (1 - alpha) * s;
  }
  return s;
}

// === CALCULAR PREDICCIÓN ===
function calculatePrediction() {
  const history = getHistoryValues();
  if (history.length < 3) return 1.0;
  let pred = exponentialSmoothing(history);
  return Math.max(1.01, pred);
}

// === DETECTAR INICIO/FÍN RONDA ===
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

      checkCashout(); // CASHOUT AQUÍ
    }
  }
}

// === APOSTAR (Solo click, sin configurar montos) ===
function tryBet() {
  if (!gameState.waitingNextStart) return;
  const betBtn = getBetButton();
  if (betBtn) {
    console.log("💸 Apostando a siguiente ronda…");
    betBtn.click();
    gameState.waitingNextStart = false;
  }
}

// === CASHOUT EXACTO ===
function checkCashout() {
  if (!gameState.roundActive) return;

  // Usamos el target fijo de la estrategia (1.20) para el cashout automático
  const target = STRATEGY.PAYOUT_TARGET; 
  const current = gameState.currentCrash;

  if (current >= target) {
    const cashoutBtn = getCashoutButton();
    if (cashoutBtn) {
      console.log(`💰 CASHOUT AUTOMÁTICO ACTIVADO en ${current}x (Objetivo ${target}x)`);
      cashoutBtn.click();
    }
  }
}

// === LOOP PRINCIPAL ===
setInterval(() => {
  updateCrashState();

  if (!gameState.roundActive && gameState.waitingNextStart) {
    // Si la ronda terminó y estamos esperando, intentamos apostar
    tryBet();
  }

  // Si la ronda terminó y no hemos calculado la predicción/estrategia
  if (!gameState.roundActive && !gameState.waitingNextStart) {
    const pred = calculatePrediction();
    gameState.predicted = pred;
    
    // -------------------------------------------------------------------
    // 💡 IMPRESIÓN DE DATOS CLAVE
    // -------------------------------------------------------------------
    console.log("======================================");
    console.log(`🔥 NUEVO CRASH FINALIZADO: ${gameState.currentCrash.toFixed(2)}x`);
    console.log("📊 Predicción (Análisis ES):", pred.toFixed(2));
    console.log("--- ESTRATEGIA PARA MAXIMIZAR SALDO ---");
    console.log(`➡️ Payout Objetivo: ${STRATEGY.PAYOUT_TARGET.toFixed(2)}x (Para Cashout)`);
    console.log(`➡️ Monto de Apuesta: ${STRATEGY.BET_AMOUNT} (Sugerencia Manual)`);
    console.log("======================================");
    // -------------------------------------------------------------------

    gameState.waitingNextStart = true;
  }

}, 150);


// ===============================================================
// 📌 TRACKER DE SALDO — SE ACTIVA SOLO AL DETECTAR NUEVO CRASH
// ===============================================================

// JSON interno con máximo y último saldo
let balanceTracker = {
  maxBalance: 0,
  lastBalance: 0
};

// Leer el saldo desde el DOM
function getBalanceClean() {
  const el = document.querySelector(".coinSelect_balance span");
  if (!el) return null;
  // Intenta limpiar el texto del saldo, asumiendo que es el formato de 8 decimales
  const text = el.innerText.replace(/[^\d.]/g, "");
  return parseFloat(text);
}

// Actualizar JSON y mostrar info
function runBalanceTrackerOnce() {
  const bal = getBalanceClean();
  if (!bal) return;

  balanceTracker.lastBalance = bal;

  if (bal > balanceTracker.maxBalance) {
    balanceTracker.maxBalance = bal;
  }

  const lost = balanceTracker.maxBalance - bal;

  console.log("📈 MÁXIMO HISTÓRICO ACTUALIZADO");
  console.log(`💰 Saldo actual: ${bal.toFixed(8)}`);
  console.log(`📈 Máximo histórico: ${balanceTracker.maxBalance.toFixed(8)}`);
  console.log(`📉 Pérdida desde el máximo: ${lost.toFixed(8)}`);
  console.log("--------------------------------------");
}

// =AFECTACIÓN AL CÓDIGO ORIGINAL=
// Se reemplaza la impresión del Balance Tracker por la que se hace
// en el LOOP PRINCIPAL, ya que es más limpia.
// ===============================

// Modificación del detector de mensajes para solo llamar al tracker
(function() {
  const originalLog = console.log;

  console.log = function(...args) {
    originalLog.apply(console, args);

    // Detección de la línea de la estrategia
    const msg = String(args[0] || "").toLowerCase();

    // Detectar el inicio de la impresión de la estrategia
    if (msg.includes("--- estrategia para maximizar saldo ---")) {
      runBalanceTrackerOnce();
    }
  };
})();


// ===============================================================
// 🔥 OPTIMIZACIONES DE CASHOUT INSTANTÁNEO (MANTIENE EL CÓDIGO)
// ===============================================================

// === 1) HACER LA ANIMACIÓN MÁS RÁPIDA ===
const style = document.createElement("style");
style.innerHTML = `
.crashGameAnimation {
    animation-duration: 0.0s !important;
    transition-duration: 0.0s !important;
}
`;
document.head.appendChild(style);

// === 2) FUNCIÓN DE CASHOUT INSTANTÁNEO (LEYENDO EL VALOR REAL) ===
function checkCashoutInstant() {
    if (!gameState.roundActive) return;
    
    // Usamos el target fijo de la estrategia (1.20)
    const target = STRATEGY.PAYOUT_TARGET;

    // LECTURA REAL DEL MULTIPLICADOR
    const realCrash = parseFloat(
        document.querySelector("#crash-payout-text")
            ?.innerText.replace(/[^\d.]/g, "")
    );

    if (!realCrash || isNaN(realCrash)) return;

    if (realCrash >= target) {
        const btn = getCashoutButton();
        if (btn) {
            queueMicrotask(() => btn.click()); // velocísimo
        }
    }
}

// === 3) DETECTOR DE FIN DE ANIMACIÓN DEL CRASH ===
function attachAnimationEndWatcher() {
    const el = document.querySelector("#crash-payout-text");
    if (!el) return;

    el.addEventListener("animationend", () => {
        // Cuando la animación termine, revisamos inmediatamente el valor REAL
        checkCashoutInstant();
    });
}

// Ejecutamos esto cada 300ms para enganchar el listener cuando el h1 se regenere
setInterval(attachAnimationEndWatcher, 300);
