// ===============================================================
// 🧠 CRASH ANALYZER + AUTO BET v5.0 — ULTRA INTELIGENTE
// - Autor: Charly UNAM & GPT-5 (reescrito v5.0)
// - Reglas: no apostar si último crash < 1.49, track >10x en JSON,
//          apuesta base 0.0001, modo agresivo basado en intervalos,
//          "time target" como multiplier objetivo (ej. 2.0).
// ===============================================================

/* ----------------------------
   CONFIGURACIÓN (ajusta aquí)
   ---------------------------- */
const HISTORY_SELECTOR = '.styles_historyElement__3VTSn';      // historial (usa tu selector)
const CRASH_SELECTOR = '#crash-payout-text';                  // donde aparece "Starts in" o "1.23x"
const BET_BUTTON_SELECTOR = '.styles_text__2Xv67.styles_bigText__2ppQe'; // botón BET
const BET_AMOUNT_INPUT_SELECTOR = 'input[name="bet-amount"]'; // opcional: si hay input para amount
const USE_LOCALSTORAGE = true; // persistir datos entre sesiones

// Parámetros básicos
let baseBet = 0.0001;            // apuesta base solicitada
let targetMultiplier = 2.0;      // "tiempo" objetivo (ej: 2.0x)
let maxAggressionFactor = 4.0;   // hasta cuanto multiplicar la apuesta en modo agresivo
let aggressiveMultiplierIncrease = 2.0; // cuánto se incrementa la apuesta en modo agresivo (factor)
let minBet = 0.00000001;        // seguridad mínima
let persistKey = 'crash_analyzer_v5_state'; // clave localStorage

/* ----------------------------
   ESTADO Y MEMORIA (JSON)
   ---------------------------- */
let stopAnalyzer = false;
let stopAutoBet = false;
let historyValues = [];         // últimos valores del historial (p.ej. 11)
let gameState = {
  roundActive: false,
  lastCrash: null,              // último crash finalizado
  currentCrash: 0,
  waitingNextStart: false,
};
let highCrashMemory = {         // memoria de grandes crashes > 10x
  lastBigTimestamps: [],       // timestamps (ms)
  avgInterval: null,           // avg ms entre >10x
};
let bettingSession = {          // stats en JSON
  baseBet,
  targetMultiplier,
  totalRounds: 0,
  betsPlaced: 0,
  wins: 0,
  losses: 0,
  profit: 0,   // en la misma unidad de apuesta (ej 0.0001)
  net: 0,
  history: [],  // registro por ronda {ts, target, amount, result, crashValue}
};

// estado interno
let autoBetActive = false;
let currentTarget = null;
let currentBetAmount = 0;
let pendingBet = null; // {amount, target, placedTs}

/* ----------------------------
   UTILIDADES
   ---------------------------- */
function saveState() {
  if (!USE_LOCALSTORAGE) return;
  const payload = {
    highCrashMemory,
    bettingSession,
    baseBet,
    targetMultiplier,
  };
  try { localStorage.setItem(persistKey, JSON.stringify(payload)); }
  catch (e) { console.warn('No se pudo guardar estado en localStorage', e); }
}

function loadState() {
  if (!USE_LOCALSTORAGE) return;
  try {
    const raw = localStorage.getItem(persistKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.highCrashMemory) highCrashMemory = parsed.highCrashMemory;
    if (parsed.bettingSession) bettingSession = parsed.bettingSession;
    if (parsed.baseBet) baseBet = parsed.baseBet;
    if (parsed.targetMultiplier) targetMultiplier = parsed.targetMultiplier;
    console.log('✅ Estado cargado desde localStorage.');
  } catch (e) {
    console.warn('No se pudo cargar estado:', e);
  }
}

// simple logger compacto
function log(...args) { console.log('[CRASH v5]', ...args); }

/* ----------------------------
   HISTORIAL Y ESTADÍSTICAS
   ---------------------------- */
function updateHistoryValues() {
  const elements = document.querySelectorAll(HISTORY_SELECTOR);
  const newVals = [];
  elements.forEach(el => {
    const txt = el.innerText.trim();
    const v = parseFloat(txt);
    if (!isNaN(v)) newVals.push(v);
  });
  if (newVals.length > 0) {
    // mantén únicos y orden (nuevo primero)
    historyValues = [...new Set([...newVals, ...historyValues])].slice(0, 20);
  }
}

// calcula promedio ajustado y mediana simple
function calculateStatsFromHistory() {
  if (historyValues.length === 0) return { avg: 2.0, median: 2.0 };
  const arr = [...historyValues].sort((a,b)=>a-b);
  const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
  const median = arr[Math.floor(arr.length/2)];
  return { avg, median };
}

/* ----------------------------
   MEMORIA DE GRANDES CRASHES > 10x
   ---------------------------- */
function recordBigCrashIfAny(crashValue) {
  if (crashValue > 10) {
    const ts = Date.now();
    highCrashMemory.lastBigTimestamps.push(ts);
    // mantén solo últimos N
    if (highCrashMemory.lastBigTimestamps.length > 30) highCrashMemory.lastBigTimestamps.shift();
    // recalcular avg interval
    const arr = highCrashMemory.lastBigTimestamps;
    if (arr.length >= 2) {
      const diffs = [];
      for (let i=1;i<arr.length;i++) diffs.push(arr[i]-arr[i-1]);
      const avg = diffs.reduce((a,b)=>a+b,0)/diffs.length;
      highCrashMemory.avgInterval = avg;
    }
    saveState();
    log('🚀 Registrado big crash >10x. avgInterval:', highCrashMemory.avgInterval);
  }
}

/* ----------------------------
   DECISIÓN: ¿apostar o no?
   ---------------------------- */
function shouldSkipNextBet() {
  // Si no hay lastCrash conocido, no apostar por seguridad
  const last = gameState.lastCrash;
  if (last === null || last === undefined) {
    log('⚠️ Último crash desconocido → no apostar (esperando datos).');
    return true;
  }
  // regla principal: no apostar si el crash anterior fue < 1.49
  if (last < 1.49) {
    log(`⛔ Último crash ${last.toFixed(2)}x < 1.49 → saltando apuesta.`);
    return true;
  }
  // Si memoria sugiere pausa (ej: estamos dentro de una ronda de caída), también saltar
  // Puedes ampliar aquí lógica adicional.
  return false;
}

/* ----------------------------
   MODO AGRESIVO (basado en avg interval de >10x)
   ---------------------------- */
function isAggressiveWindow() {
  if (!highCrashMemory.avgInterval || highCrashMemory.lastBigTimestamps.length < 2) return false;
  const lastTs = highCrashMemory.lastBigTimestamps[highCrashMemory.lastBigTimestamps.length - 1];
  const sinceLast = Date.now() - lastTs;
  // si hemos alcanzado, por ejemplo, el 80% del avgInterval, nos preparamos agresivamente
  const threshold = 0.8 * highCrashMemory.avgInterval;
  const aggressive = sinceLast >= threshold;
  if (aggressive) log('🔥 Modo agresivo sugerido — time since last big:', (sinceLast/1000).toFixed(0),'s, avgInterval:', (highCrashMemory.avgInterval/1000).toFixed(0),'s');
  return aggressive;
}

/* ----------------------------
   FUNCIONES DE APUESTA (simples)
   - Intenta poner cantidad en input si existe.
   - Hace click al botón BET.
   ---------------------------- */
function getBetButton() {
  return document.querySelector(BET_BUTTON_SELECTOR);
}

function setBetAmountInInput(amount) {
  const input = document.querySelector(BET_AMOUNT_INPUT_SELECTOR);
  if (!input) return false;
  try {
    // forza valor incluso si disabled
    input.removeAttribute('disabled');
    input.value = amount;
    // dispatch events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (e) {
    console.warn('No se pudo establecer la cantidad en input', e);
    return false;
  }
}

function placeBet(amount, target) {
  // prepara bet
  const betButton = getBetButton();
  if (!betButton) { log('⚠️ Botón BET no encontrado.'); return false; }

  // intenta setear amount si hay input
  const setOk = setBetAmountInInput(amount);
  if (!setOk) {
    // no hay input; solo informamos y click
    log('🟡 No se encontró input de cantidad, se hará click en BET sin setear monto.');
  }

  // marcar pendingBet para evaluar resultado al finalizar ronda
  pendingBet = {
    amount,
    target,
    placedTs: Date.now(),
  };
  bettingSession.betsPlaced += 1;
  saveState();

  // click real
  betButton.click();
  log(`🎲 Apuesta colocada → amount ${amount} target ${target}x`);
  return true;
}

/* ----------------------------
   LÓGICA AUTO-BET (decidir cantidad y target por ronda)
   ---------------------------- */
function computeBetForRound() {
  // base
  let amount = baseBet;
  // si estamos en modo agresivo, aumentamos la apuesta (pero con tope)
  if (isAggressiveWindow()) {
    amount = Math.min(baseBet * aggressiveMultiplierIncrease, baseBet * maxAggressionFactor);
  }
  // Asegurar mínimos
  if (amount < minBet) amount = minBet;
  // Target: el configurable targetMultiplier
  const target = targetMultiplier;
  return { amount, target };
}

function autoBetSmartIfNeeded() {
  if (stopAutoBet) { log('🛑 AutoBet desactivado.'); return; }

  // validaciones
  if (shouldSkipNextBet()) {
    autoBetActive = false;
    return;
  }

  // no apostar si ya hay pending bet para esta ronda
  if (pendingBet && gameState.roundActive) {
    log('ℹ️ Ya hay una apuesta pendiente para esta ronda.');
    return;
  }

  // decide apuesta
  const { amount, target } = computeBetForRound();

  // colocar apuesta (usar placeBet)
  const ok = placeBet(amount, target);
  if (ok) {
    autoBetActive = true;
    currentTarget = target;
    currentBetAmount = amount;
  }
}

/* ----------------------------
   OBSERVADOR DEL CICLO (MutationObserver)
   - Detecta "Starts in" → nueva ronda
   - Detecta valores "1.23x" en tiempo real → monitor
   - Al terminar la ronda (cuando aparece "Starts in" otra vez): resolvemos pendingBet
   ---------------------------- */

function monitorCrashCycle() {
  const payoutElement = document.querySelector(CRASH_SELECTOR);
  if (!payoutElement) { log('⚠️ No se encontró el elemento del payout/crash. Ajusta CRASH_SELECTOR.'); return; }

  const observer = new MutationObserver(mutations => {
    const text = payoutElement.textContent.trim();
    // caso "Starts in" -> nueva ronda a punto de empezar o la pantalla de espera
    if (/Starts in/i.test(text) || /Starts in/.test(text)) {
      // ronda finalizada recientemente, procesar pendingBet
      if (gameState.roundActive || pendingBet) {
        // resolvemos el resultado: si pendingBet existe y gameState.lastCrash lo informa
        if (pendingBet) {
          // si el último crash fue >= target -> ganaste
          const last = gameState.lastCrash;
          if (last !== null && last >= pendingBet.target) {
            bettingSession.wins += 1;
            bettingSession.profit += pendingBet.amount;
            bettingSession.net = bettingSession.profit - (bettingSession.losses * pendingBet.amount);
            log(`✅ GANASTE la apuesta. target ${pendingBet.target}x alcanzado (crash ${last}x). +${pendingBet.amount}`);
          } else {
            bettingSession.losses += 1;
            bettingSession.profit -= pendingBet.amount;
            bettingSession.net = bettingSession.profit - (0);
            log(`❌ PERDISTE la apuesta. target ${pendingBet.target}x NO alcanzado (crash ${last}x). -${pendingBet.amount}`);
          }

          // guardar en history
          bettingSession.history.push({
            ts: Date.now(),
            amount: pendingBet.amount,
            target: pendingBet.target,
            resultCrash: gameState.lastCrash,
            win: (gameState.lastCrash !== null && gameState.lastCrash >= pendingBet.target),
          });
          bettingSession.totalRounds += 1;

          // limpiar pending
          pendingBet = null;
          currentTarget = null;
          currentBetAmount = 0;
          saveState();
        }
      }

      // estado para próxima ronda
      gameState.roundActive = false;
      gameState.waitingNextStart = true;

      // decidir si en la espera se coloca apuesta previa (la acción de "bet" depende del sitio)
      // esperamos un pequeño margen antes de ejecutar la lógica de apostar para no interferir
      setTimeout(() => {
        // si no está detenido, intentar autoBet
        if (!stopAutoBet) autoBetSmartIfNeeded();
      }, 800); // pequeño delay para dejar que el sitio procese

      return;
    }

    // si el texto termina con 'x' entonces es el multiplicador actual en la ronda
    const match = text.match(/([\d.]+)x$/);
    if (match) {
      const cur = parseFloat(match[1]);
      if (!isNaN(cur)) {
        gameState.currentCrash = cur;
        // si la ronda estaba en espera, marcar activa
        if (!gameState.roundActive) {
          gameState.roundActive = true;
          gameState.waitingNextStart = false;
        }

        // si hay un currentTarget y la ronda alcanza/excede -> intentamos clickear para cashout
        if (currentTarget && autoBetActive && cur >= currentTarget) {
          // aquí simulamos cashout con click en botón (algunos juegos requieren botón distinto)
          const betButton = getBetButton();
          if (betButton) {
            try {
              betButton.click();
              log(`💸 Cashout automático en ${cur.toFixed(2)}x (target ${currentTarget}x)`);
            } catch (e) {
              console.warn('No se pudo clickear para cashout:', e);
            }
          }
          // marcaremos el resultado al final de la ronda
        }
      }
    }
  });

  observer.observe(payoutElement, { childList: true, subtree: true });
  log('✅ Observador del ciclo iniciado.');
}

/* ----------------------------
   OBSERVADOR PARA SABER EL "último crash" (cuando la tabla de historial se actualiza)
   Esto detecta el momento en que la ronda finalizó y actualiza gameState.lastCrash
   ---------------------------- */
function monitorHistoryForLastCrash() {
  const container = document.querySelector(HISTORY_SELECTOR)?.parentElement || document.body;
  if (!container) { log('⚠️ No se encontró contenedor de historial para monitorizar.'); return; }

  const hObserver = new MutationObserver(() => {
    // leer la lista y tomar el primer elemento (más reciente)
    const elements = document.querySelectorAll(HISTORY_SELECTOR);
    if (!elements || elements.length === 0) return;
    const first = elements[0];
    const v = parseFloat(first.innerText.trim());
    if (!isNaN(v) && v !== gameState.lastCrash) {
      // actualizamos lastCrash y registramos si es >10x
      gameState.lastCrash = v;
      lastCrashTime = Date.now();
      log('🧾 Nuevo crash registrado en historial:', v);
      recordBigCrashIfAny(v);
      updateHistoryValues();
      saveState();
    }
  });

  hObserver.observe(container, { childList: true, subtree: true, characterData: true });
  log('✅ Observador de historial iniciado.');
}

/* ----------------------------
   INICIO / STOP
   ---------------------------- */
function startCrashAnalyzer() {
  stopAnalyzer = false;
  stopAutoBet = false;
  loadState();
  updateHistoryValues();
  monitorCrashCycle();
  monitorHistoryForLastCrash();
  log('▶️ CRASH ANALYZER v5.0 iniciado.');
}

function stopCrashAnalyzer() {
  stopAnalyzer = true;
  stopAutoBet = true;
  log('⏹️ CRASH ANALYZER detenido (manual).');
}

function resetStats() {
  bettingSession = {
    baseBet,
    targetMultiplier,
    totalRounds: 0,
    betsPlaced: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    net: 0,
    history: [],
  };
  highCrashMemory = { lastBigTimestamps: [], avgInterval: null };
  saveState();
  log('🔄 Estadísticas reseteadas.');
}

/* ----------------------------
   API simple para controlar desde consola
   ---------------------------- */
function setTargetMultiplier(x) {
  targetMultiplier = parseFloat(x);
  bettingSession.targetMultiplier = targetMultiplier;
  saveState();
  log('🎯 targetMultiplier set to', targetMultiplier);
}

function setBaseBet(x) {
  baseBet = parseFloat(x);
  bettingSession.baseBet = baseBet;
  saveState();
  log('💵 baseBet set to', baseBet);
}

function showStats() {
  console.table({
    baseBet,
    targetMultiplier,
    totalRounds: bettingSession.totalRounds,
    betsPlaced: bettingSession.betsPlaced,
    wins: bettingSession.wins,
    losses: bettingSession.losses,
    profit: bettingSession.profit,
    net: bettingSession.net,
    bigCrashCount: highCrashMemory.lastBigTimestamps.length,
    avgBigCrashInterval_s: highCrashMemory.avgInterval ? (highCrashMemory.avgInterval/1000).toFixed(1) : 'N/A',
  });
  return { bettingSession, highCrashMemory, historyValues, gameState };
}

// Exponer funciones útiles en ventana global para control desde consola
window.crashV5 = {
  startCrashAnalyzer,
  stopCrashAnalyzer,
  setTargetMultiplier,
  setBaseBet,
  resetStats,
  showStats,
  bettingSession,
  highCrashMemory,
  getState: () => ({ bettingSession, highCrashMemory, historyValues, gameState }),
};

// auto-start (si quieres comentar la línea siguiente para no iniciar automáticamente, coméntala)
startCrashAnalyzer();
