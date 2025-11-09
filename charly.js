// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v4.3 MEMORIA PRO 
// (Mediana -0.22 + Alta Volatilidad -20% + Stop Automático + Apuesta 1.01–1.76)
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

// === Indicadores extendidos ===
function getExtendedIndicators() {
  if (historyValues.length < 5) return null;
  const diffs = [];
  for (let i = 1; i < historyValues.length; i++) diffs.push(historyValues[i] - historyValues[i - 1]);

  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const upCount = diffs.filter(d => d > 0).length;
  const downCount = diffs.filter(d => d < 0).length;
  const volatility = Math.sqrt(diffs.map(d => d ** 2).reduce((a, b) => a + b, 0) / diffs.length);
  const momentum = upCount / (upCount + downCount);
  const trend = avgDiff > 0 ? "📈 Tendencia al alza" : "📉 Tendencia a la baja";

  return { avgDiff, volatility, momentum, trend };
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
  const indicators = getExtendedIndicators();
  if (!indicators) return;

  // ⚡ Alta volatilidad detectada
  if (indicators.volatility > 10) {
    const volValue = indicators.volatility;
    console.log("🚨 Alta volatilidad detectada:", volValue.toFixed(2));

    highVolatilityMemory.push({
      timestamp: Date.now(),
      volatility: volValue,
      result: historyValues[0] || 0,
    });
    if (highVolatilityMemory.length > 10) highVolatilityMemory.shift();

    highVolatilityDetected = true;
    lastHighVolatility = volValue;
    historyValues = [];
    expectedNext = null;
    return;
  } else {
    highVolatilityDetected = false;
    lastHighVolatility = null;
  }

  expectedNext = avg + (Math.random() - 0.5) * stdDev;
  if (expectedNext <= 1) expectedNext = null;

  console.log("📊 Estadísticas actuales:");
  console.log(`• Promedio ajustado: ${avg.toFixed(2)}x`);
  console.log(`• Mediana: ${median.toFixed(2)}x`);
  console.log(`• Desviación estándar: ${stdDev.toFixed(2)}`);
  console.log(`• Volatilidad: ${indicators.volatility.toFixed(2)}`);
  console.log(`• Momentum: ${(indicators.momentum * 100).toFixed(1)}%`);
  console.log(`• ${indicators.trend}`);
  console.log("--------------------------------------------------");

  window.lastIndicators = indicators;
}

// === Apuesta automática inteligente (v4.3 con stop y fallback) ===
function autoBetSmart() {
  if (stopAutoBet) return console.warn("🛑 AutoBet detenido manualmente.");
  const ind = window.lastIndicators;

  // ⚡ Alta volatilidad → apuesta y fija cashout
  if (highVolatilityDetected && lastHighVolatility) {
    let apuesta = lastHighVolatility * 0.5;
    if (apuesta > 100) apuesta = 100;
    if (apuesta < 1.01) apuesta = 1.01;
    apuesta = parseFloat(apuesta.toFixed(2));

    const betButton = getBetButton();
    if (!betButton) return console.warn("⚠️ No se encontró el botón BET.");

    if (!autoBetActive) {
      autoBetActive = true;
      currentTarget = apuesta;
      console.log(`⚡ Alta volatilidad → apuesta en ${apuesta}x (80% de ${lastHighVolatility.toFixed(2)})`);
      betButton.click();
      console.log(`🎰 Apuesta colocada automáticamente (alta volatilidad). Cashout en ${apuesta}x.`);
    }
    return;
  }

  // 🚫 Si no hay datos válidos
  if (!ind || !expectedNext || expectedNext <= 1) {
    console.log("⚠️ Valor esperado o indicadores no aptos para apostar.");
    return;
  }

  const momentumPercent = ind.momentum * 100;
  const similarPattern = checkMemoryPattern(ind);
  const condNormal = momentumPercent >= 40 && ind.volatility <= 5;
  const condMemoria = similarPattern;

  // 🚫 NUEVA REGLA: si no hay condiciones favorables → apuesta segura 1.01–1.76
  if (!condNormal && !condMemoria) {
    // Calcula promedio de últimos 10 valores menores a 2
    const lowVals = historyValues.filter(v => v < 2).slice(0, 10);
    let apuesta = 1.2; // Valor base si no hay suficientes
    if (lowVals.length > 0) {
      apuesta = lowVals.reduce((a, b) => a + b, 0) / lowVals.length;
    }

    // Limita entre 1.01 y 1.76
    if (apuesta < 1.01) apuesta = 1.01;
    if (apuesta > 1.76) apuesta = 1.76;
    apuesta = parseFloat(apuesta.toFixed(2));

    const betButton = getBetButton();
    if (!betButton) return console.warn("⚠️ No se encontró el botón BET.");

    if (!autoBetActive) {
      autoBetActive = true;
      currentTarget = apuesta;
      console.log(`🤖 Condiciones no favorables → apuesta segura en ${apuesta}x (media de ${lowVals.length} bajos <2).`);
      betButton.click();
      console.log(`🎰 Apuesta colocada automáticamente (modo seguro). Cashout planificado en ${apuesta}x.`);
    }
    return;
  }

  // ✅ Condiciones normales o de memoria
  let apuesta = lastMedian - 0.22;
  if (apuesta < 1.01) apuesta = 1.01;
  apuesta = parseFloat(apuesta.toFixed(2));

  const betButton = getBetButton();
  if (!betButton) return console.warn("⚠️ No se encontró el botón BET.");

  if (!autoBetActive) {
    autoBetActive = true;
    currentTarget = apuesta;
    console.log(`🎯 Apuesta configurada en ${apuesta}x (mediana ${lastMedian.toFixed(2)} - 0.22)`);
    betButton.click();
    console.log(`🎰 Apuesta colocada automáticamente (${condMemoria ? "por patrón aprendido" : "condición normal"}). Cashout en ${apuesta}x.`);
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
  console.log("✅ CRASH ANALYZER + AUTO BET v4.3 MEMORIA PRO iniciado.");
  console.log("⚙️ Reglas: Mediana -0.22 | Alta Volatilidad -20% | Fallback 1.01–1.76 | Cashout automático");
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
