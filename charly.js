// 🧠 CRASH ANALYZER + AUTO BET v5.2 (Dinámico, objetivo y adaptativo)
// Autor: Charly UNAM & GPT-5 (reescrito)
// Objetivo: evitar quedarse "pegado" en 1.20, pensar estrategias dinámicas
// ===============================================================

// ---------- Estado general ----------
let gameState = {
  roundActive: false,
  waitingNextStart: false,
  currentCrash: 0.0,
  lastCrash: 0.0,
  predicted: 1.0,
  lossStreak: 0,
  winStreak: 0,
  lastBetWon: null
};

// ---------- Parámetros ajustables (ajusta con cuidado) ----------
const CONFIG = {
  BASE_BET_PERCENT: 0.001,   // porcentaje del saldo para apostar por defecto (0.1% = 0.001)
  MAX_BET_PERCENT: 0.02,     // máximo % del saldo a apostar
  MIN_BET_AMOUNT: null,      // si quieres forzar un mínimo, pon número (ej. 0.00001) o null
  BASE_PAYOUT: 1.20,         // payout objetivo por defecto
  MIN_PAYOUT: 1.01,          // mínimo permitido
  MAX_PAYOUT: 10.0,          // máximo permitido para no volar el riesgo
  RECOVERY_THRESHOLD: 0.02,  // si pierdes >2% respecto al max, activas modo recovery
  RECOVERY_INCREASE_PAYOUT: 1.5, // multiplicador para payout cuando estás en recovery
  LOSS_STREAK_PENALTY: 0.15, // cada pérdida reduce el bet% en 15% (relativo)
  WIN_STREAK_BOOST: 0.25,    // cada racha de victorias aumenta bet% en 25% (relativo)
  PREDICTION_ALPHA: 0.25,    // alpha para suavizado exponencial
  LOOP_MS: 120,              // frecuencia del loop principal
  TAKE_PROFIT_PERCENT: 0.05, // objetivo de ganancia respecto a `balanceTracker.startBalance` (5%)
  STOP_LOSS_PERCENT: 0.08,   // pérdida máxima relativa antes de pausar (8%)
};

// ---------- Selectores (intenta varios) ----------
const SELECTORS = {
  HISTORY: '.styles_historyElement__3VTSn',
  CRASH_TEXT: '#crash-payout-text',
  BET_BUTTON: '#crash-pay-button', // "At the next round"
  CASHOUT_XPATH: "//div[text()='Cashout']/parent::button",
  BALANCE_CSS_OPTIONS: [
    ".coinSelect_balance span",
    ".balance-value",
    "#balance span",
    ".wallet-balance"
  ],
  BET_INPUT_OPTIONS: [
    "input[name='bet-amount']",
    ".bet-amount-input",
    "input#betAmount",
    ".input-bet"
  ],
  BUTTON_MIN_SELECTORS: [
    "button[data-action='min']",
    "button.min-button",
    ".btn-min"
  ]
};

// ---------- Utilidades DOM ----------
function $(sel){ return document.querySelector(sel); }
function $x(xpath){ return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }

function getCashoutButton(){
  return $x(SELECTORS.CASHOUT_XPATH);
}

function findBalanceElement(){
  for(const s of SELECTORS.BALANCE_CSS_OPTIONS){
    const el = document.querySelector(s);
    if(el) return el;
  }
  return null;
}

function getBalanceClean(){
  const el = findBalanceElement();
  if(!el) return null;
  const t = el.innerText.replace(/[^\d.]/g,"");
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function findBetInput(){
  for(const s of SELECTORS.BET_INPUT_OPTIONS){
    const el = document.querySelector(s);
    if(el) return el;
  }
  return null;
}

function clickMinIfNoInput(){
  const input = findBetInput();
  if(input) return false;
  for(const s of SELECTORS.BUTTON_MIN_SELECTORS){
    const btn = document.querySelector(s);
    if(btn){ btn.click(); return true; }
  }
  // fallback: si no hay input y no hay botón min, no hacemos nada
  return false;
}

// ---------- Historial y predicción ----------
function getHistoryValues(){
  const items = document.querySelectorAll(SELECTORS.HISTORY);
  const vals = [];
  items.forEach(i=>{
    const v = parseFloat(i.innerText.replace(/[^\d.]/g,""));
    if(!isNaN(v)) vals.push(v>10?10:v);
  });
  return vals.reverse();
}

function exponentialSmoothing(data, alpha){
  if(data.length===0) return 1.0;
  let s = data[0];
  for(let i=1;i<data.length;i++){
    s = alpha*data[i] + (1-alpha)*s;
  }
  return s;
}

function calculatePrediction(){
  const hist = getHistoryValues();
  if(hist.length < 3) return 1.0;
  const pred = exponentialSmoothing(hist, CONFIG.PREDICTION_ALPHA);
  return Math.max(CONFIG.MIN_PAYOUT, Math.min(pred, CONFIG.MAX_PAYOUT));
}

// ---------- Balance tracker ----------
let balanceTracker = {
  startBalance: null,
  maxBalance: 0,
  lastBalance: 0
};

function updateBalanceTracker(){
  const bal = getBalanceClean();
  if(bal == null) return;
  if(balanceTracker.startBalance == null) balanceTracker.startBalance = bal;
  balanceTracker.lastBalance = bal;
  if(bal > balanceTracker.maxBalance) balanceTracker.maxBalance = bal;
}

// ---------- Lógica de tamaño de apuesta ----------
function computeBetAmount(){
  updateBalanceTracker();
  const bal = balanceTracker.lastBalance;
  if(!bal) return null;

  // base percent
  let pct = CONFIG.BASE_BET_PERCENT;

  // reducir cuando hay racha de pérdidas (penalizar)
  if(gameState.lossStreak > 0){
    pct = pct * Math.max(0, 1 - gameState.lossStreak * CONFIG.LOSS_STREAK_PENALTY);
  }

  // potenciar si hay racha de victorias
  if(gameState.winStreak > 0){
    pct = pct * (1 + gameState.winStreak * CONFIG.WIN_STREAK_BOOST);
  }

  // si estamos en recovery (perdida respecto al max > threshold), subir apuesta ligeramente
  const lossRel = (balanceTracker.maxBalance - bal) / (balanceTracker.maxBalance || bal);
  if(!isNaN(lossRel) && lossRel > CONFIG.RECOVERY_THRESHOLD){
    pct = pct * 1.5; // boost moderado
  }

  // aplicar techo
  pct = Math.min(pct, CONFIG.MAX_BET_PERCENT);
  let amount = bal * pct;

  // forzar mínimo (si configurado)
  if(CONFIG.MIN_BET_AMOUNT && amount < CONFIG.MIN_BET_AMOUNT) amount = CONFIG.MIN_BET_AMOUNT;

  // evitar 0
  if(amount <= 0) return null;
  return parseFloat(amount.toFixed(8));
}

// ---------- Lógica de payout objetivo dinámica ----------
function computePayoutTarget(){
  // Base: predicción (suavizada)
  const pred = gameState.predicted || calculatePrediction();

  // Si la predicción está muy baja, mantenemos al menos BASE_PAYOUT
  let target = Math.max(CONFIG.BASE_PAYOUT, pred);

  // Si estamos en recovery (bajada desde max), aumentar target para intentar recuperar
  const bal = balanceTracker.lastBalance || balanceTracker.startBalance || 0;
  const lossRel = balanceTracker.maxBalance ? (balanceTracker.maxBalance - bal) / balanceTracker.maxBalance : 0;
  if(lossRel > CONFIG.RECOVERY_THRESHOLD){
    target = Math.min(target * CONFIG.RECOVERY_INCREASE_PAYOUT, CONFIG.MAX_PAYOUT);
  }

  // Evitar que el bot se quede pegado a un valor: añadir ajuste por racha
  if(gameState.lossStreak >= 3){
    // Si llevas 3+ pérdidas, reducimos agresividad: bajar objetivo para ganar más veces
    target = Math.max(CONFIG.MIN_PAYOUT, target * 0.98);
  } else if(gameState.winStreak >= 2){
    // si vas ganando, subir un poco para intentar mejores ganancias
    target = Math.min(CONFIG.MAX_PAYOUT, target * 1.05);
  }

  // margen final y límites
  target = Math.max(CONFIG.MIN_PAYOUT, Math.min(target, CONFIG.MAX_PAYOUT));
  return parseFloat(target.toFixed(2));
}

// ---------- Cashout exacto (listener + chequeo rápido) ----------
function getRealCrashValue(){
  const el = document.querySelector(SELECTORS.CRASH_TEXT);
  if(!el) return null;
  const t = el.innerText.replace(/[^\d.]/g,"");
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function attemptCashoutIfNeeded(target){
  const current = getRealCrashValue();
  if(!current) return false;
  if(current >= target){
    const btn = getCashoutButton();
    if(btn){
      queueMicrotask(()=>btn.click());
      console.log(`💰 CASHOUT triggered @ ${current}x (target ${target}x)`);
      return true;
    }
  }
  return false;
}

// ---------- APOSTAR: setear monto si existe input, o usar MIN ----------
function placeBet(amount){
  // intenta setear input
  const input = findBetInput();
  if(input && amount){
    // algunos inputs son readOnly/disabled — forzamos valor y disparar eventos
    try {
      input.value = amount;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e){
      console.warn("No se pudo setear input de apuesta:", e);
    }
  } else {
    // si no hay input, intenta click en MIN para usar valor mínimo
    clickMinIfNoInput();
  }

  // click al botón de apostar
  const betBtn = document.querySelector(SELECTORS.BET_BUTTON);
  if(betBtn){
    console.log("💸 Click en botón 'Bet next round' (apostando) — amount:", amount);
    betBtn.click();
  } else {
    console.warn("No se encontró botón de apostar.");
  }
}

// ---------- Gestión de outcomes (win/loss) ----------
function onRoundEnd(crashValue, cashoutHappened){
  // Si hicimos cashout y el crash fue >= target => ganancia
  if(cashoutHappened){
    gameState.lossStreak = 0;
    gameState.winStreak += 1;
    gameState.lastBetWon = true;
  } else {
    // si no hubo cashout o crash < target => pérdida
    gameState.winStreak = 0;
    gameState.lossStreak += 1;
    gameState.lastBetWon = false;
  }

  // actualizar lastCrash
  gameState.lastCrash = crashValue || gameState.lastCrash;
}

// ---------- Mecanismos de seguridad: take-profit / stop-loss ----------
function checkRiskLimitsAndPause(){
  const start = balanceTracker.startBalance || 0;
  const last = balanceTracker.lastBalance || 0;
  if(!start || !last) return false;

  const profitRel = (last - start) / start;
  const lossRelFromMax = balanceTracker.maxBalance ? (balanceTracker.maxBalance - last) / balanceTracker.maxBalance : 0;

  if(profitRel >= CONFIG.TAKE_PROFIT_PERCENT){
    console.log(`🏆 TAKE-PROFIT alcanzado: ${ (profitRel*100).toFixed(2) }% — pausando bot.`);
    return true; // pausar
  }
  if(lossRelFromMax >= CONFIG.STOP_LOSS_PERCENT){
    console.log(`🛑 STOP-LOSS: pérdida de ${ (lossRelFromMax*100).toFixed(2) }% desde máximo — pausando bot.`);
    return true; // pausar
  }
  return false;
}

// ---------- Loop principal (detectar estados, apostar, cashout) ----------
let paused = false;
let lastRoundHadBet = false;
let lastRoundTarget = null;
let lastRoundWeClickedCashout = false;

function updateCrashStateAndReact(){
  const txtEl = document.querySelector(SELECTORS.CRASH_TEXT);
  if(!txtEl) return;
  const raw = txtEl.innerText;

  // Detecta "Starts in" -> estamos en espera
  if(raw.includes("Starts in")){
    if(gameState.roundActive) {
      // la ronda terminó — evaluar si ganamos o perdimos
      // crash real de la ronda anterior está en gameState.currentCrash
      onRoundEnd(gameState.currentCrash, lastRoundWeClickedCashout);
      // actualizar trackers
      updateBalanceTracker();
      // revisar riesgo y pausar si es necesario
      if(checkRiskLimitsAndPause()){
        paused = true;
      }
    }
    gameState.roundActive = false;
    gameState.waitingNextStart = true;
    lastRoundWeClickedCashout = false;
    lastRoundHadBet = false;
    return;
  }

  // Si muestra algo con 'x' es multiplicador en vivo
  if(raw.includes("x")){
    const val = parseFloat(raw.replace("x","").replace(/[^\d.]/g,""));
    if(!isNaN(val)){
      gameState.currentCrash = val;
      gameState.roundActive = true;

      // Chequeo de cashout instantáneo
      if(lastRoundHadBet && lastRoundTarget){
        const cashed = attemptCashoutIfNeeded(lastRoundTarget);
        if(cashed){
          lastRoundWeClickedCashout = true;
        }
      }
    }
  }
}

// Function para preparar apuesta justo cuando termina la ronda (cuando está en waitingNextStart)
function prepareAndPlaceBetIfNeeded(){
  if(paused) return;
  if(!gameState.waitingNextStart) return;

  // calcular predicción y payout objetivo
  gameState.predicted = calculatePrediction();
  const payoutTarget = computePayoutTarget();

  // calcular monto
  const amount = computeBetAmount();

  // imprimir info útil
  console.log("======================================");
  console.log(`🔥 Último crash: ${gameState.lastCrash.toFixed(2)}x  | Predicción: ${gameState.predicted.toFixed(2)}x`);
  console.log(`🎯 Payout objetivo dinámico: ${payoutTarget}x`);
  console.log(`💵 Monto calculado: ${amount}`);
  console.log(`📉 Racha pérdida: ${gameState.lossStreak} | racha ganadora: ${gameState.winStreak}`);
  console.log(`🔒 Pausado?: ${paused}`);
  console.log("======================================");

  // setear cantidad (si se puede) y apostar
  placeBet(amount);

  // marcar que apostamos esta ronda y almacenar objetivo
  lastRoundHadBet = true;
  lastRoundTarget = payoutTarget;
  gameState.waitingNextStart = false;
}

// ---------- Hooks para mejorar cashout exacto (attach animation end watcher) ----------
function attachAnimationEndWatcher(){
  const el = document.querySelector(SELECTORS.CRASH_TEXT);
  if(!el) return;
  // evitar múltiples listeners
  if(el.__hasCrashListener) return;
  el.__hasCrashListener = true;

  el.addEventListener("animationend", ()=>{
    // chequeo final rápido
    if(lastRoundHadBet && lastRoundTarget){
      attemptCashoutIfNeeded(lastRoundTarget);
    }
  });
}

// ---------- Iniciar loop ----------
const mainLoop = setInterval(()=>{
  // enganchar watcher de animación cuando aparezca
  attachAnimationEndWatcher();

  // actualizar estados de crash / betting
  updateCrashStateAndReact();

  // si estamos esperando el siguiente inicio, preparar apuesta
  if(gameState.waitingNextStart && !gameState.roundActive){
    prepareAndPlaceBetIfNeeded();
  }

  // actualizar balances periódicamente
  updateBalanceTracker();

  // si estamos en ronda activa, chequeo de inflación de logs cada X ms (opcional)
  // chequeo de límites de seguridad en cada iteración
  if(checkRiskLimitsAndPause()){
    paused = true;
  }

}, CONFIG.LOOP_MS);

// ---------- Comandos útiles (ejecutar en consola si quieres) ----------
console.log("Bot adaptativo v5.2 inicializado. Parámetros:", CONFIG);
console.log("Usa 'paused = true' para pausar manualmente, 'paused = false' para reanudar.");

// ---------- Nota de seguridad ----------
/*
  Este script intenta ser más "pensante": calcula payout dinámico y ajusta tamaño de apuesta.
  Sin embargo **ningún script garantiza ganancias**. Ajusta CONFIG con cuidado,
  y usa stop-loss / take-profit sensatos. Evita aumentar apuestas de forma descontrolada.
*/
