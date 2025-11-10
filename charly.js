// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v4.4 REGLAS DINÁMICAS
// (Reglas personalizadas + Memoria + Stop automático)
// Autor: Charly UNAM & GPT-5
// ===============================================================

// === Variables globales ===
let stopAnalyzer = false;
let stopAutoBet = false;
let historyValues = [];
let highVolatilityMemory = [];
let lossStreak = 0;
let lastCrashTime = null;
let avgCycleTime = 6000;
let expectedNext = null;
let autoBetActive = false;
let lastMedian = 2.0;
let highVolatilityDetected = false;
let lastHighVolatility = null;
let currentTarget = null; // 🎯 Guardará el multiplicador objetivo (cashout)

// === Estado general ===
let gameState = {
  roundActive: false,
  currentCrash: 0.0,
  lastCrash: 0.0,
  waitingNextStart: false,
};

// === Selectores ===
const HISTORY_SELECTOR = '.styles_historyElement__3VTSn';
const CRASH_SELECTOR = '#crash-payout-text';
const BET_SELECTOR = '.styles_text__2Xv67.styles_bigText__2ppQe';

// === Obtener botón BET ===
function getBetButton() {
  return document.querySelector(BET_SELECTOR);
}

// === Actualiza el historial (solo 11 últimos) ===
function updateHistoryValues() {
  const elements = document.querySelectorAll(HISTORY_SELECTOR);
  const newValues = [];

  elements.forEach(el => {
    const value = parseFloat(el.innerText.trim());
    if (!isNaN(value)) newValues.push(value);
  });

  if (newValues.length > 0) {
    historyValues = [...new Set([...newValues, ...historyValues])];
    if (historyValues.length > 11) historyValues = historyValues.slice(0, 11);
  }
}

// === Promedio ajustado ===
function calculateAdjustedAverage() {
  if (historyValues.length < 4) return { avg: 2.0, median: 2.0 };
  const sorted = [...historyValues].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const median = trimmed[Math.floor(trimmed.length / 2)];
  lastMedian = median;
  return { avg, median };
}

// === Analiza memoria ===
function checkMemoryPattern(currentIndicators) {
  if (highVolatilityMemory.length < 5) return false;

  const lastVols = highVolatilityMemory.map(m => m.volatility);
  const avgVol = lastVols.reduce((a, b) => a + b, 0) / lastVols.length;
  const recentHigh = highVolatilityMemory.filter(m => m.result > 5).length;

  if (recentHigh >= 3 && Math.abs(currentIndicators.volatility - avgVol) < 1.2) {
    console.log("🧠 Patrón aprendido detectado → posible crash alto inminente");
    return true;
  }
  return false;
}

// === Estadísticas extendidas ===
function getStats() {
  const { avg, median } = calculateAdjustedAverage();
  const variance = historyValues
    .map(v => Math.pow(v - avg, 2))
    .reduce((a, b) => a + b, 0) / historyValues.length;
  const stdDev = Math.sqrt(variance);

  console.log("📊 Estadísticas actuales:");
  console.log(`• Promedio ajustado: ${avg.toFixed(2)}x`);
  console.log(`• Mediana: ${median.toFixed(2)}x`);
  console.log(`• Desviación estándar: ${stdDev.toFixed(2)}`);
  console.log("--------------------------------------------------");
}

// === Apuesta automática según NUEVAS REGLAS personalizadas ===
function autoBetSmart() {
  if (stopAutoBet) return console.warn("🛑 AutoBet detenido manualmente.");

  const last = gameState.lastCrash || 0;
  let apuesta = 1.01; // valor por defecto

  // === Reglas personalizadas ===
  if (last === 1.0) {
    apuesta = parseFloat((1.01 + Math.random() * (10 - 1.01)).toFixed(2));
    console.log(`🎯 Regla 1: Último crash fue 1.0 → próxima apuesta entre 1.01–10 → ${apuesta}x`);
  }

  else if (last < 2 && last > 0) {
    const prev = historyValues[1] || 0;

    // Si el anterior también fue menor a 2 → menor a 3
    if (prev < 2 && prev > 0) {
      apuesta = parseFloat((1.01 + Math.random() * (3 - 1.01)).toFixed(2));
      console.log(`⚠️ Doble crash <2 → próxima apuesta menor a 3 (${apuesta}x)`);
    } 
    else {
      apuesta = parseFloat((1.01 + Math.random() * (5 - 1.01)).toFixed(2));
      console.log(`📉 Último crash <2 → próxima apuesta entre 1.01–5 (${apuesta}x)`);
    }
  }

  else if (last >= 2) {
    apuesta = parseFloat((last + 0.01).toFixed(2));
    console.log(`📈 Último crash >2 → próxima apuesta será ${apuesta}x`);
  }

  // Ajuste adicional: si sale menor a 2 (excepto la primera regla)
  if (last < 2 && last !== 1.0) {
    apuesta = parseFloat((Math.max(1.01, last - 0.10)).toFixed(2));
    console.log(`🔧 Ajuste: Último crash menor a 2 → apuesta = ${apuesta}x`);
  }

  // === Esperar a que salga un número >2 antes de apostar nuevamente ===
  if (last < 2) {
    console.log("⏸️ Esperando a que salga un número mayor a 2 antes de volver a apostar...");
    return; // no apostar aún
  }

  // === Ejecutar apuesta ===
  const betButton = getBetButton();
  if (!betButton) return console.warn("⚠️ No se encontró el botón BET.");

  if (!autoBetActive) {
    autoBetActive = true;
    currentTarget = apuesta;
    console.log(`🎰 Apuesta automática configurada en ${apuesta}x (según reglas personalizadas).`);
    betButton.click();
  }
}

// === Monitor de rondas ===
function monitorCrashCycle() {
  const payoutElement = document.querySelector(CRASH_SELECTOR);
  if (!payoutElement) {
    console.warn("⚠️ No se encontró el elemento principal del crash.");
    return;
  }

  const observer = new MutationObserver(() => {
    const text = payoutElement.textContent.trim();

    // Nueva ronda
    if (text.includes("Starts in")) {
      if (!gameState.waitingNextStart) {
        gameState.waitingNextStart = true;
        gameState.roundActive = false;
        gameState.lastCrash = gameState.currentCrash;
        gameState.currentCrash = 0.0;
        lastCrashTime = Date.now();

        updateHistoryValues();
        getStats();
        console.log(`🕒 Nueva ronda → último crash: ${gameState.lastCrash}x`);

        autoBetActive = false;
        currentTarget = null;
        setTimeout(() => autoBetSmart(), 1000);
      }
    }

    // Ronda activa
    else if (text.endsWith("x")) {
      const currentCrash = parseFloat(text.replace("x", ""));
      gameState.currentCrash = currentCrash;

      if (!gameState.roundActive) {
        gameState.roundActive = true;
        gameState.waitingNextStart = false;
      }

      // 💸 Cashout automático (stop)
      if (currentTarget && currentCrash >= currentTarget && autoBetActive) {
        const betButton = getBetButton();
        if (betButton) {
          betButton.click();
          autoBetActive = false;
          console.log(`💸 Cashout automático en ${currentCrash.toFixed(2)}x (objetivo ${currentTarget}x alcanzado).`);
          currentTarget = null;
        }
      }
    }
  });

  observer.observe(payoutElement, { childList: true, subtree: true });
}

// === Iniciar analizador ===
function startCrashAnalyzer() {
  if (stopAnalyzer) {
    console.warn("🛑 Analizador detenido.");
    return;
  }
  console.log("✅ CRASH ANALYZER + AUTO BET v4.4 REGLAS DINÁMICAS iniciado.");
  console.log("⚙️ Reglas: Personalizadas por Charly | Espera >2x antes de apostar | Cashout automático");
  monitorCrashCycle();
}

// === Iniciar ===
startCrashAnalyzer();

// ===============================================================
// 🔧 COMANDOS MANUALES
// stopAnalyzer = true;   → Detiene el sistema
// stopAutoBet = true;    → Detiene el auto-bet
// highVolatilityMemory   → Ver memoria de volatilidad aprendida
// getStats()             → Ver estadísticas actuales
// ===============================================================
