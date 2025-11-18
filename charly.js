// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v5.1 (Cashout EXACTO + Pred redondeada)
// Autor: Charly UNAM & GPT-5
// ===============================================================

// === Estado general ===
let gameState = {
  roundActive: false,
  currentCrash: 0.0,
  lastCrash: 0.0,
  waitingNextStart: false,
  predicted: null
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
// Buscamos el botón exacto que aparece con texto “Cashout”
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

// === APOSTAR ===
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
// SI EL BOTÓN “Cashout” EXISTE → cashoutBtn != null
// SI EL CRASH ACTUAL >= predicción → HACER CLICK
function checkCashout() {
  if (!gameState.roundActive) return;
  if (!gameState.predicted) return;

  const target = parseFloat(gameState.predicted.toFixed(2));
  const current = gameState.currentCrash;

  if (current >= target) {
    const cashoutBtn = getCashoutButton();
    if (cashoutBtn) {
      console.log(`💰 CASHOUT ACTIVADO en ${current}x (pred ${target})`);
      cashoutBtn.click();
      gameState.predicted = null;
    }
  }
}

// === LOOP PRINCIPAL ===
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
  return parseFloat(el.innerText);
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

  console.log("======================================");
  console.log("💰 Saldo actual:", bal.toFixed(8));
  console.log("📈 Máximo histórico:", balanceTracker.maxBalance.toFixed(8));
  console.log("📉 Pérdida desde el máximo:", lost.toFixed(8));
  console.log("======================================");
}

// ===============================================================
// 🔥 DETECTOR DEL MENSAJE "NUEVO CRASH: XX"
// ===============================================================

// Observa la consola del juego
(function() {
  const originalLog = console.log;

  console.log = function(...args) {
    originalLog.apply(console, args);

    // Convertir todo a minúsculas para que siempre coincida
    const msg = String(args[0] || "").toLowerCase();

    // Detectar “nuevo crash” sin importar mayúsculas
    if (msg.includes("nuevo crash")) {
      runBalanceTrackerOnce();
    }
  };
})();





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
    if (!gameState.predicted) return;

    const target = parseFloat(gameState.predicted.toFixed(2));

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
        gameState.predicted = null;
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



