// 🧠 CRASH BOT v5.3 (SIEMPRE ON — NO PAUSA, MODO RECUPERACIÓN AUTOMÁTICO)
// Autor: Reescrito para ejecución 24/7 (no requiere interacción del usuario)
// ===============================================================

/*
 Cambios clave vs versión anterior:
 - NUNCA pausa el bucle automáticamente. En vez de pausar, entra en modo "recovery"
   y ajusta agresividad (más agresivo o más conservador) según pérdida/ganancia.
 - Mejora detección del botón "Bet next round" (varios selectores y búsqueda por texto).
 - Si no puede leer balance en DOM, usa FALLBACK_BALANCE configurado para seguir funcionando.
 - Evita retornar monto 0 (usar mínimo configurado).
 - No solicita input del usuario; todo automático.
*/

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

const CONFIG = {
  BASE_BET_PERCENT: 0.001,        // 0.1% del balance por defecto
  MAX_BET_PERCENT: 0.02,          // 2% máximo
  MIN_BET_AMOUNT: 0.000001,       // mínimo de apuesta absoluto (evita 0)
  BASE_PAYOUT: 1.20,
  MIN_PAYOUT: 1.01,
  MAX_PAYOUT: 10.0,
  RECOVERY_THRESHOLD: 0.02,       // 2% desde máximo activa recovery adjustments
  RECOVERY_INCREASE_PAYOUT: 1.5,
  LOSS_STREAK_PENALTY: 0.12,
  WIN_STREAK_BOOST: 0.2,
  PREDICTION_ALPHA: 0.25,
  LOOP_MS: 120,
  TAKE_PROFIT_PERCENT: 0.10,      // si quieres, no detiene: solo informa y ajusta
  STOP_LOSS_PERCENT: 0.50,        // si gran pérdida, entra recovery pero sigue ON
  FALLBACK_BALANCE: 0.001         // si no puede leer balance del DOM, usar este
};

// Más selectores para detectar botones e inputs (ampliados)
const SELECTORS = {
  HISTORY: '.styles_historyElement__3VTSn',
  CRASH_TEXT: '#crash-payout-text',
  BET_BUTTON_SELECTORS: [
    '#crash-pay-button',
    '.playButton',
    '.bet-next',
    '.btn-play',
    'button[data-action="bet"]',
    'button.crash-play',
    '#bet-button',
    '.btn-bet'
  ],
  CASHOUT_XPATH: "//div[text()='Cashout']/parent::button",
  BALANCE_CSS_OPTIONS: [
    ".coinSelect_balance span",
    ".balance-value",
    "#balance span",
    ".wallet-balance",
    ".user-balance",
    ".balance"
  ],
  BET_INPUT_OPTIONS: [
    "input[name='bet-amount']",
    ".bet-amount-input",
    "input#betAmount",
    ".input-bet",
    "input[type='number']"
  ],
  BUTTON_MIN_SELECTORS: [
    "button[data-action='min']",
    "button.min-button",
    ".btn-min",
    "button[title='Min']"
  ]
};

// UTILIDADES DOM
function $q(sel){ return document.querySelector(sel); }
function $x(xpath){ return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }

function getCashoutButton(){ return $x(SELECTORS.CASHOUT_XPATH); }

function findBetButton(){
  // 1) probar selectores conocidos
  for(const s of SELECTORS.BET_BUTTON_SELECTORS){
    const el = document.querySelector(s);
    if(el) return el;
  }
  // 2) probar por texto en botones
  const buttons = document.querySelectorAll('button');
  for(const b of buttons){
    const txt = (b.innerText || "").toLowerCase();
    if(txt.includes('bet') || txt.includes('play') || txt.includes('apostar') || txt.includes('next round') || txt.includes('next')) return b;
  }
  // 3) fallback: cualquier botón visible con clase que parezca relevante
  for(const b of buttons){
    if(b.offsetParent !== null && b.innerText && b.innerText.length < 20) return b;
  }
  return null;
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
  if(!el){
    // fallback: si no aparece en DOM, usar valor de configuración
    return CONFIG.FALLBACK_BALANCE;
  }
  const t = el.innerText.replace(/[^\d.]/g,"");
  const n = parseFloat(t);
  return isNaN(n) ? CONFIG.FALLBACK_BALANCE : n;
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
  return false;
}

// HISTORIAL Y PREDICCION
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

// BALANCE TRACKER
let balanceTracker = {
  startBalance: null,
  maxBalance: 0,
  lastBalance: 0
};
function updateBalanceTracker(){
  const bal = getBalanceClean();
  if(balanceTracker.startBalance == null) balanceTracker.startBalance = bal;
  balanceTracker.lastBalance = bal;
  if(bal > balanceTracker.maxBalance) balanceTracker.maxBalance = bal;
}

// CÁLCULO DE APUESTA (evita 0)
function computeBetAmount(){
  updateBalanceTracker();
  const bal = balanceTracker.lastBalance || CONFIG.FALLBACK_BALANCE;
  if(!bal || isNaN(bal)) return CONFIG.MIN_BET_AMOUNT;

  let pct = CONFIG.BASE_BET_PERCENT;

  if(gameState.lossStreak > 0) pct = pct * Math.max(0, 1 - gameState.lossStreak * CONFIG.LOSS_STREAK_PENALTY);
  if(gameState.winStreak > 0) pct = pct * (1 + gameState.winStreak * CONFIG.WIN_STREAK_BOOST);

  const lossRel = (balanceTracker.maxBalance - bal) / (balanceTracker.maxBalance || bal);
  if(!isNaN(lossRel) && lossRel > CONFIG.RECOVERY_THRESHOLD){
    pct = pct * 1.5;
  }

  pct = Math.min(pct, CONFIG.MAX_BET_PERCENT);
  let amount = bal * pct;

  if(amount < CONFIG.MIN_BET_AMOUNT) amount = CONFIG.MIN_BET_AMOUNT;
  // evitar precisión ridícula y forzar 8 decimales
  amount = parseFloat(amount.toFixed(8));
  if(amount <= 0) amount = CONFIG.MIN_BET_AMOUNT;
  return amount;
}

// PAYOUT DINÁMICO (no quedarnos pegados)
function computePayoutTarget(){
  const pred = gameState.predicted || calculatePrediction();
  let target = Math.max(CONFIG.BASE_PAYOUT, pred);

  const bal = balanceTracker.lastBalance || balanceTracker.startBalance || CONFIG.FALLBACK_BALANCE;
  const lossRel = balanceTracker.maxBalance ? (balanceTracker.maxBalance - bal) / balanceTracker.maxBalance : 0;
  if(lossRel > CONFIG.RECOVERY_THRESHOLD){
    target = Math.min(target * CONFIG.RECOVERY_INCREASE_PAYOUT, CONFIG.MAX_PAYOUT);
  }

  if(gameState.lossStreak >= 3){
    target = Math.max(CONFIG.MIN_PAYOUT, target * 0.98);
  } else if(gameState.winStreak >= 2){
    target = Math.min(CONFIG.MAX_PAYOUT, target * 1.05);
  }

  target = Math.max(CONFIG.MIN_PAYOUT, Math.min(target, CONFIG.MAX_PAYOUT));
  // redondear a 2 decimales para evitar valores extraños
  return parseFloat(target.toFixed(2));
}

// LECTURA REAL DEL MULTIPLICADOR
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

// COLOCAR APUESTA (fuerte y robusto)
function placeBet(amount){
  // 1) intentar setear input
  const input = findBetInput();
  if(input && amount){
    try {
      // desbloquear input si está readonly/disabled (intento no destructivo)
      try { input.removeAttribute('readonly'); input.removeAttribute('disabled'); } catch(e){}
      input.focus();
      input.value = amount;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e){
      console.warn("No se pudo setear input de apuesta (se intentó):", e);
    }
  } else {
    // 2) si no hay input, intentar MIN
    const usedMin = clickMinIfNoInput();
    if(usedMin) {
      console.log("⚠️ No se encontró input de apuesta — se usó botón MIN como fallback.");
    }
  }

  // 3) intentar encontrar y clickear botón de apostar
  const betBtn = findBetButton();
  if(betBtn){
    try {
      console.log("💸 Click en botón 'Bet next round' (apostando) — amount:", amount);
      betBtn.click();
    } catch(e){
      console.warn("Error al clickear botón apuesta:", e);
    }
  } else {
    console.warn("❌ No se encontró botón de apostar (se buscó en múltiples selectores).");
  }
}

// LOGICA de resultado al final de ronda
function onRoundEnd(crashValue, cashoutHappened){
  if(cashoutHappened){
    gameState.lossStreak = 0;
    gameState.winStreak += 1;
    gameState.lastBetWon = true;
  } else {
    gameState.winStreak = 0;
    gameState.lossStreak += 1;
    gameState.lastBetWon = false;
  }
  gameState.lastCrash = crashValue || gameState.lastCrash;
}

// EN LUGAR DE PAUSAR: MODO RECUPERACIÓN que ajusta agresividad pero sigue ON
let recoveryMode = false;
function checkAndEnterRecoveryIfNeeded(){
  const bal = balanceTracker.lastBalance || CONFIG.FALLBACK_BALANCE;
  const max = balanceTracker.maxBalance || bal;
  const lossRel = max > 0 ? (max - bal) / max : 0;

  if(lossRel >= CONFIG.STOP_LOSS_PERCENT){
    recoveryMode = true;
    // aumentar base bet percent moderadamente para intentar recuperar (controlado)
    CONFIG.BASE_BET_PERCENT = Math.min(CONFIG.MAX_BET_PERCENT, CONFIG.BASE_BET_PERCENT * 1.8);
    console.log(`🔥 MODO RECOVERY ACTIVADO (pérdida ${ (lossRel*100).toFixed(2) }%). Base bet aumentada a ${CONFIG.BASE_BET_PERCENT}`);
    return;
  }

  if(lossRel < CONFIG.RECOVERY_THRESHOLD && recoveryMode){
    // si recuperamos por debajo del threshold, salir de recovery y normalizar
    recoveryMode = false;
    CONFIG.BASE_BET_PERCENT = Math.max(0.0005, CONFIG.BASE_BET_PERCENT / 1.4); // bajamos a valores más conservadores
    console.log("✅ RECUPERACIÓN: Modo recovery OFF. Base bet normalizada:", CONFIG.BASE_BET_PERCENT);
  }
}

// DETECCIÓN DE ESTADO DE CRASH Y REACCIONES
let lastRoundHadBet = false;
let lastRoundTarget = null;
let lastRoundWeClickedCashout = false;

function updateCrashStateAndReact(){
  const txtEl = document.querySelector(SELECTORS.CRASH_TEXT);
  if(!txtEl) return;
  const raw = txtEl.innerText;

  if(raw.includes("Starts in")){
    if(gameState.roundActive){
      onRoundEnd(gameState.currentCrash, lastRoundWeClickedCashout);
      updateBalanceTracker();
      checkAndEnterRecoveryIfNeeded();
    }
    gameState.roundActive = false;
    gameState.waitingNextStart = true;
    lastRoundWeClickedCashout = false;
    lastRoundHadBet = false;
    return;
  }

  if(raw.includes("x")){
    const val = parseFloat(raw.replace("x","").replace(/[^\d.]/g,""));
    if(!isNaN(val)){
      gameState.currentCrash = val;
      gameState.roundActive = true;

      // si apostamos la ronda, intentar cashout instantáneo
      if(lastRoundHadBet && lastRoundTarget){
        const cashed = attemptCashoutIfNeeded(lastRoundTarget);
        if(cashed) lastRoundWeClickedCashout = true;
      }
    }
  }
}

// PREPARAR Y APOSTAR
function prepareAndPlaceBetIfNeeded(){
  if(!gameState.waitingNextStart || gameState.roundActive) return;

  gameState.predicted = calculatePrediction();
  const payoutTarget = computePayoutTarget();
  const amount = computeBetAmount();

  console.log("======================================");
  console.log(`🔥 Último crash: ${gameState.lastCrash.toFixed(2)}x  | Predicción: ${gameState.predicted.toFixed(2)}x`);
  console.log(`🎯 Payout objetivo dinámico: ${payoutTarget}x`);
  console.log(`💵 Monto calculado: ${amount}`);
  console.log(`📉 Racha pérdida: ${gameState.lossStreak} | racha ganadora: ${gameState.winStreak}`);
  console.log(`🔁 RecoveryMode: ${recoveryMode}`);
  console.log("======================================");

  // setear y apostar
  placeBet(amount);

  lastRoundHadBet = true;
  lastRoundTarget = payoutTarget;
  gameState.waitingNextStart = false;
}

// Watcher para animationend (cashout final)
function attachAnimationEndWatcher(){
  const el = document.querySelector(SELECTORS.CRASH_TEXT);
  if(!el) return;
  if(el.__hasCrashListener) return;
  el.__hasCrashListener = true;
  el.addEventListener("animationend", ()=>{
    if(lastRoundHadBet && lastRoundTarget){
      attemptCashoutIfNeeded(lastRoundTarget);
    }
  });
}

// LOOP principal — NUNCA se detiene por diseño
setInterval(()=>{
  attachAnimationEndWatcher();
  updateCrashStateAndReact();

  if(gameState.waitingNextStart && !gameState.roundActive){
    prepareAndPlaceBetIfNeeded();
  }

  updateBalanceTracker();

  // no pausamos; verificamos y ajustamos recoveryMode si aplica
  checkAndEnterRecoveryIfNeeded();

}, CONFIG.LOOP_MS);

// LOG
console.log("✅ Crash Bot v5.3 inicializado — MODO 24/7 activo. No requiere intervención del usuario.");
console.log("Si quieres ajustar parámetros, modifica el objeto CONFIG en consola (ej. CONFIG.BASE_BET_PERCENT).");
