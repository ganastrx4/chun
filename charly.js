// ===============================================================
// ⚡ CRASH AUTO BET v5.3 — Basado en PRIMER valor del historial
// Reglas simples y exactas (sin repeticiones, sin promedios)
// Autor: Charly UNAM & GPT-5
// ===============================================================

(() => {
  // === SELECTORES (ajusta según tu sitio) ===
  const CRASH_SELECTOR = '#crash-payout-text'; // texto que muestra "Starts in..." o "x"
  const BET_SELECTOR = '.styles_text__2Xv67.styles_bigText__2ppQe'; // botón Bet / Cashout
  const AMOUNT_SELECTOR = '.styles_text__2Xv67.styles_smallText__1xhai'; // monto mostrado
  const HISTORY_SELECTOR = '.styles_historyElement__3VTSn'; // historial de crashes (últimos valores visibles)

  // === ESTADO ===
  let firstCrashFromHistory = null;  // primer valor actual del historial (más reciente)
  let targetMultiplier = null;
  let hasBetThisRound = false;
  let bettingInProgress = false;

  // === UTILIDADES ===
  function log(...args) {
    console.log('CRASH-BOT ▶', ...args);
  }

  function getBetButton() {
    return document.querySelector(BET_SELECTOR);
  }

  function readAmountText() {
    const el = document.querySelector(AMOUNT_SELECTOR);
    return el ? el.innerText.trim() : '';
  }

  function clickCashoutButton() {
    const btnMain = getBetButton();
    if (btnMain && !btnMain.disabled) {
      btnMain.click();
      return true;
    }

    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.innerText || '').toLowerCase();
      if (t.includes('cash') || t.includes('retirar') || t.includes('retire')) {
        if (!b.disabled) {
          b.click();
          return true;
        }
      }
    }
    return false;
  }

  function doBetOnce() {
    if (hasBetThisRound) return false;
    const btn = getBetButton();
    if (!btn) {
      log('⚠️ No se encontró el botón BET — verifica selector.');
      return false;
    }
    btn.click();
    hasBetThisRound = true;
    bettingInProgress = true;
    log(`🎯 Apostando con target ${targetMultiplier?.toFixed(2)}x | Monto: ${readAmountText()}`);
    return true;
  }

  // === LEE EL PRIMER VALOR DEL HISTORIAL ===
  function getFirstCrashFromHistory() {
    const items = document.querySelectorAll(HISTORY_SELECTOR);
    if (!items || items.length === 0) return null;
    const first = parseFloat(items[0].innerText.trim());
    if (!isNaN(first)) return first;
    return null;
  }

  // === REGLAS DE APUESTA ===
  function computeNextBet(crash) {
    crash = Number(crash);
    if (!isFinite(crash) || crash <= 0) return 1.01;

    if (crash === 1.00) {
      const val = 1.01 + Math.random() * (10.00 - 1.01);
      return Number(val.toFixed(2));
    }
    if (crash > 1.00 && crash < 2.00) {
      const val = Math.max(1.01, crash - 0.10);
      return Number(val.toFixed(2));
    }
    return Number((crash + 0.01).toFixed(2));
  }

  // === OBSERVADOR PRINCIPAL ===
  function startObserver() {
    const payout = document.querySelector(CRASH_SELECTOR);
    if (!payout) {
      log('⚠️ No se encontró el elemento del crash principal.');
      return;
    }

    const mo = new MutationObserver(() => {
      const txt = payout.textContent.trim();

      // 🕒 Nueva ronda ("Starts in")
      if (txt.toLowerCase().includes('starts in') || txt.toLowerCase().includes('starting')) {
        if (!hasBetThisRound) {
          firstCrashFromHistory = getFirstCrashFromHistory();

          if (firstCrashFromHistory !== null) {
            targetMultiplier = computeNextBet(firstCrashFromHistory);
            log(`🕒 Nueva ronda → Primer valor historial: ${firstCrashFromHistory.toFixed(2)}x → Próxima apuesta: ${targetMultiplier.toFixed(2)}x`);
            setTimeout(() => {
              doBetOnce();
            }, 400 + Math.random() * 700);
          } else {
            log('⚠️ No se pudo leer el primer valor del historial aún.');
          }
        }
        return;
      }

      // 🚀 Ronda activa
      if (txt.endsWith('x')) {
        const current = parseFloat(txt.replace('x', ''));
        if (!isFinite(current)) return;

        // 💸 Cashout automático
        if (bettingInProgress && targetMultiplier && current >= targetMultiplier) {
          if (clickCashoutButton()) {
            log(`💸 Cashout automático en ${current.toFixed(2)}x (objetivo ${targetMultiplier.toFixed(2)}x alcanzado).`);
            bettingInProgress = false;
            hasBetThisRound = true;
            targetMultiplier = null;
          }
        }
      }
    });

    mo.observe(payout, { childList: true, subtree: true, characterData: true });
    log('✅ CRASH AUTO BET v5.3 iniciado — basado en primer valor del historial.');
  }

  // === INICIAR ===
  startObserver();

})();
