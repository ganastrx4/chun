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
