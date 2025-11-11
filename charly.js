// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v4.4 ULTRA INTELIGENTE
// (Probabilidad + Regresión + Confianza + Ciclo Adaptativo + Rebate Control)
// Autor: Charly UNAM
// DONACIONES: Tether TRC20 (USDT) TYQFZCGEffQvPMqQD5pHszbP4r1uzZbVDT
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
let currentTarget = null;
let predictionAccuracy = 0.5;

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

// === Memoria probabilística ===
function getCrashProbabilities() {
  if (historyValues.length < 10) return { low: 0.5, high: 0.5 };
  const low = historyValues.filter(v => v < 2).length / historyValues.length;
  const high = historyValues.filter(v => v > 5).length / historyValues.length;
  return { low, high };
}

// === Regresión lineal local (predicción de dirección) ===
function linearPrediction() {
  if (historyValues.length < 5) return null;
  const n = historyValues.length;
  const xs = [...Array(n).keys()];
  const ys = historyValues;
  const avgX = xs.reduce((a, b) => a + b, 0) / n;
  const avgY = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.map((x, i) => (x - avgX) * (ys[i] - avgY)).reduce((a, b) => a + b, 0);
  const den = xs.map(x => (x - avgX) ** 2).reduce((a, b) => a + b, 0);
  const slope = num / den;
  return slope > 0 ? "up" : "down";
}

// === Actualiza confianza según resultado ===
function updateConfidence(success) {
  predictionAccuracy += success ? 0.05 : -0.05;
  predictionAccuracy = Math.max(0.1, Math.min(0.9, predictionAccuracy));
  console.log(`📊 Precisión adaptativa actual: ${(predictionAccuracy * 100).toFixed(1)}%`);
}

// === Actualiza tiempo promedio del ciclo ===
function updateCycleTime() {
  if (!lastCrashTime) return;
  const diff = Date.now() - lastCrashTime;
  avgCycleTime = avgCycleTime * 0.7 + diff * 0.3;
  console.log(`⏱️ Tiempo promedio de ciclo actualizado: ${avgCycleTime.toFixed(0)} ms`);
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
  const variance = historyValues.map(v => Math.pow(v - avg, 2)).reduce((a, b) => a + b, 0) / historyValues.length;
  const stdDev = Math.sqrt(variance);
  const indicators = getExtendedIndicators();
  if (!indicators) return;

  if (indicators.volatility > 10) {
    console.log("🚨 Alta volatilidad detectada:", indicators.volatility.toFixed(2));
    highVolatilityMemory.push({
      timestamp: Date.now(),
      volatility: indicators.volatility,
      result: historyValues[0] || 0,
    });
    if (highVolatilityMemory.length > 10) highVolatilityMemory.shift();
    highVolatilityDetected = true;
    lastHighVolatility = indicators.volatility;
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

// === Apuesta automática inteligente v4.4 ===
function autoBetSmart() {
  if (stopAutoBet) return console.warn("🛑 AutoBet detenido manualmente.");
  const ind = window.lastIndicators;
  const betButton = getBetButton();
  if (!betButton) return console.warn("⚠️ No se encontró el botón BET.");

  // ⚡ Alta volatilidad
  if (highVolatilityDetected && lastHighVolatility) {
    let apuesta = lastHighVolatility * 0.5;
    apuesta = Math.min(Math.max(apuesta, 1.01), 100);
    apuesta = parseFloat(apuesta.toFixed(2));
    if (!autoBetActive) {
      autoBetActive = true;
      currentTarget = apuesta;
      console.log(`⚡ Alta volatilidad → apuesta ${apuesta}x`);
      betButton.click();
    }
    return;
  }

  // 🚫 Sin datos suficientes
  if (!ind || !expectedNext || expectedNext <= 1) {
    console.log("⚠️ Sin datos suficientes para apostar.");
    return;
  }

  const probs = getCrashProbabilities();
  const trendDirection = linearPrediction();
  const similarPattern = checkMemoryPattern(ind);
  let apuesta = lastMedian - 0.22;

  // Ajustes adaptativos
  if (trendDirection === "up") apuesta += 0.3;
  else apuesta -= 0.1;

  if (probs.low > 0.7) apuesta = 1.05; // Muchos crashes bajos → modo seguro
  if (probs.high > 0.3) apuesta += 0.3;

  apuesta = Math.min(Math.max(apuesta, 1.01), 3.0);
  apuesta = parseFloat(apuesta.toFixed(2));

  // 🎯 Ajuste por confianza
  if (predictionAccuracy < 0.4) apuesta = Math.max(1.05, apuesta - 0.1);
  else if (predictionAccuracy > 0.7) apuesta += 0.2;

  // 🌀 Rebote control
  if (ind.volatility < 1 && historyValues[0] > 10) {
    console.log("🌀 Posible rebote → cashout 1.5x forzado");
    apuesta = 1.5;
  }

  if (!autoBetActive) {
    autoBetActive = true;
    currentTarget = apuesta;
    console.log(`🎯 Apuesta configurada en ${apuesta}x (precisión ${(predictionAccuracy * 100).toFixed(0)}%)`);
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

    if (text.includes("Starts in")) {
      if (!gameState.waitingNextStart) {
        gameState.waitingNextStart = true;
        gameState.roundActive = false;
        gameState.lastCrash = gameState.currentCrash;
        gameState.currentCrash = 0.0;
        updateCycleTime();
        updateHistoryValues();
        getStats();
        console.log(`🕒 Nueva ronda → último crash: ${gameState.lastCrash}x`);
        autoBetActive = false;
        currentTarget = null;
        setTimeout(() => autoBetSmart(), 1000);
      }
    }

    else if (text.endsWith("x")) {
      const currentCrash = parseFloat(text.replace("x", ""));
      gameState.currentCrash = currentCrash;
      if (!gameState.roundActive) {
        gameState.roundActive = true;
        gameState.waitingNextStart = false;
      }

      if (currentTarget && currentCrash >= currentTarget && autoBetActive) {
        const betButton = getBetButton();
        if (betButton) {
          betButton.click();
          autoBetActive = false;
          updateConfidence(true);
          console.log(`💸 Cashout automático en ${currentCrash.toFixed(2)}x`);
          currentTarget = null;
        }
      }

      if (gameState.roundActive && currentCrash < (currentTarget || 1)) {
        updateConfidence(false);
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
  console.log("✅ CRASH ANALYZER + AUTO BET v4.4 ULTRA INTELIGENTE iniciado.");
  console.log("⚙️ Módulos: Probabilidad + Regresión + Confianza + Ciclo Adaptativo + Rebote");
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
