// ===============================================================
// ⚡ CRASH AUTO BET v5.2 — Limpio, simple y correcto
// Reglas exactas solicitadas por Charly UNAM
// ===============================================================

(() => {
  // --- Configuración / Selectores (ajusta si tu sitio usa otros)
  const CRASH_SELECTOR = '#crash-payout-text'; // elemento que muestra "Starts in ..." o "2.35x"
  const BET_SELECTOR = '.styles_text__2Xv67.styles_bigText__2ppQe'; // botón que hace Bet / Cashout según estado
  const AMOUNT_SELECTOR = '.styles_text__2Xv67.styles_smallText__1xhai'; // texto que muestra el monto (solo para leer)

  // --- Estado
  let lastCrash = null;            // último crash final detectado (ej. 7.56)
  let targetMultiplier = null;     // multiplicador objetivo para cashout (ej. 7.57)
  let hasBetThisRound = false;     // evita 2 clicks en la misma ronda
  let bettingInProgress = false;   // true si ya hicimos bet y esperamos cashout

  // --- Utilidades
  function log(...args) { console.log('CRASH-BOT ▶', ...args); }

  function getBetButton() {
    return document.querySelector(BET_SELECTOR);
  }

  function readAmountText() {
    const el = document.querySelector(AMOUNT_SELECTOR);
    return el ? el.innerText.trim() : '';
  }

  function clickCashoutButton() {
    // Intentos robustos para encontrar / clickear el botón de cashout:
    // 1) Botón principal (será toggle Bet/Cashout en muchos UI)
    const btnMain = getBetButton();
    if (btnMain && !btnMain.disabled) {
      btnMain.click();
      return true;
    }

    // 2) Buscar botón con texto 'Cash Out' / 'Cashout' / 'Retirar'
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.innerText || '').toLowerCase();
      if (t.includes('cash') || t.includes('retirar') || t.includes('retire')) {
        if (!b.disabled) { b.click(); return true; }
      }
    }

    // 3) fallback: buscar input/button con id 'cashout' o similar
    const alt = document.querySelector('#cashout, #cash_out, [data-action="cashout"]');
    if (alt && !alt.disabled) { alt.click(); return true; }

    return false;
  }

  function doBetOnce() {
    if (hasBetThisRound) return false;
    const btn = getBetButton();
    if (!btn) { log('No se encontró el botón BET — verifica el selector.'); return false; }

    // clic en "Bet" (o botón principal)
    btn.click();
    hasBetThisRound = true;
    bettingInProgress = true;
    log('Apostado: target =', targetMultiplier ? targetMultiplier.toFixed(2) + 'x' : 'sin target');
    return true;
  }

  // --- Reglas de apuesta (exactas)
  function computeNextBet(crash) {
    crash = Number(crash);
    if (!isFinite(crash) || crash <= 0) return 1.01;

    if (crash === 1.00) {
      // aleatorio entre 1.01 y 10.00
      const val = 1.01 + Math.random() * (10.00 - 1.01);
      return Number(val.toFixed(2));
    }
    if (crash > 1.00 && crash < 2.00) {
      // aleatorio entre 1.01 y 5.00, pero no menor que 1.01
      const val = 1.01 + Math.random() * (5.00 - 1.01);
      return Number(Math.max(1.01, val).toFixed(2));
    }
    // crash >= 2.00
    return Number((crash + 0.01).toFixed(2));
  }

  // --- Observador del texto del crash
  function startObserver() {
    const payout = document.querySelector(CRASH_SELECTOR);
    if (!payout) {
      log('No se encontró elemento de crash (', CRASH_SELECTOR, '). Detén y ajusta el selector.');
      return;
    }

    const mo = new MutationObserver(muts => {
      const txt = payout.textContent.trim();

      // Caso: "Starts in ..."  → preparar apuesta (solo una vez por ronda)
      if (txt.toLowerCase().includes('starts in') || txt.toLowerCase().includes('starting')) {
        // Si ya tenemos el último crash calculado y no hemos apostado esta ronda:
        if (!hasBetThisRound && lastCrash !== null) {
          // calcular target según regla y establecerlo
          targetMultiplier = computeNextBet(lastCrash);
          log('Nueva ronda detectada → último crash:', lastCrash.toFixed(2) + 'x',
              '| target calculado:', targetMultiplier.toFixed(2) + 'x',
              '| monto mostrado:', readAmountText());
          // esperar un pequeño retardo humano y apostar solo 1 vez
          setTimeout(() => { doBetOnce(); }, 400 + Math.random() * 700);
        } else {
          // Si no hay lastCrash aún, esperamos que termine la siguiente ronda para capturarlo
          log('Nueva ronda detectada (sin lastCrash todavía).');
        }
        return;
      }

      // Caso: muestra un multiplicador en tiempo real "2.35x" (ronda activa)
      if (txt.endsWith('x')) {
        const current = parseFloat(txt.replace('x', ''));
        if (!isFinite(current)) return;

        // Si la ronda acaba (el site actualiza a valor final cuando crasha),
        // capturamos ese valor como lastCrash — pero sólo cuando la ronda finalizó.
        // El sitio puede mostrar el multiplicador final como parte del mismo elemento;
        // por tanto, detectamos fin de ronda al ver un número y además si antes
        // teníamos bettingInProgress = true y luego se resetea a "Starts in".
        //
        // Aquí: si el valor cambia y la ronda NO está activa (waitingStart true),
        // lo asignamos como último crash final cuando detectemos el cambio a "Starts in"
        //
        // Simpler approach: cuando veamos un valor numérico, lo guardamos como current
        // y cuando luego aparezca "Starts in" sabremos que ese fue el final. Pero para
        // evitar updates constantes guardamos sólo cuando el valor disminuye o cuando ronda cambie.
        //
        // IMPLEMENTACIÓN práctica: guardamos current en una variable temporal 'currentVisible'
        // y cuando luego aparezca "Starts in" lo convertimos en lastCrash.
        //
        // Para no complicar, hacemos: si el texto numérico aparece y la ronda NO está marcada
        // como roundActive, lo marcamos como roundActive. Si luego aparece "Starts in", ya usamos
        // game flow to set lastCrash.
        //
        // Pero simplificamos aún más: guardamos como 'currentRoundValue' y actualizamos lastCrash
        // cuando detectemos "Starts in" — eso ya lo hacemos arriba.
        //
        // Sin embargo necesitamos también checar si debemos hacer CASHOUT: si bettingInProgress y
        // current >= targetMultiplier -> ejecutar cashout.
        if (bettingInProgress && targetMultiplier && current >= targetMultiplier) {
          // Intentar cashout una sola vez
          if (clickCashoutButton()) {
            log('Cashout ejecutado en', current.toFixed(2) + 'x (target ' + targetMultiplier.toFixed(2) + 'x)');
            bettingInProgress = false;
            // reset para la siguiente ronda (se liberará también cuando detectemos "Starts in")
            hasBetThisRound = true;
            targetMultiplier = null;
          } else {
            log('Intento de cashout falló — botón no disponible. Reintentando más tarde si es posible.');
          }
        }

        return;
      }
    });

    mo.observe(payout, { childList: true, subtree: true, characterData: true });

    // Observador adicional para capturar el paso final: cuando "Starts in" aparece
    // queremos convertir el número que vimos antes en lastCrash. Para eso guardamos el último
    // texto numérico visible en tempLastVisible.
    let tempLastVisible = null;

    const mo2 = new MutationObserver(() => {
      const t = payout.textContent.trim();
      if (t.endsWith('x')) {
        const v = parseFloat(t.replace('x', ''));
        if (isFinite(v)) tempLastVisible = v;
      } else if (t.toLowerCase().includes('starts in') || t.toLowerCase().includes('starting')) {
        // "Starts in" llegó => tempLastVisible era el crash final de la ronda anterior
        if (tempLastVisible !== null) {
          lastCrash = tempLastVisible;
          log('💥 Crash final confirmado:', lastCrash.toFixed(2) + 'x');
          // reset flags for next round
          hasBetThisRound = false;
          bettingInProgress = false;
          targetMultiplier = null;
          tempLastVisible = null;
        } else {
          // No teníamos valor visible (p.ej. al cargar): no hacemos nada
          log('Starts in detectado — no había valor previo guardado.');
        }
      }
    });

    mo2.observe(payout, { childList: true, subtree: true, characterData: true });

    log('Observer activo. Esperando rondas...');
  }

  // --- Lanzar
  startObserver();

})(); 
