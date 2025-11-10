// ===============================================================
// ⚡ CRASH AUTO BET v5.3 — Primer Crash Edition
// Detecta el primer crash y aplica tus reglas directas
// Autor: Charly UNAM & GPT-5
// ===============================================================

(() => {
  // === Selectores principales ===
  const CRASH_SELECTOR = '#crash-payout-text'; // texto con "Starts in" o "x"
  const BET_SELECTOR = '.styles_text__2Xv67.styles_bigText__2ppQe'; // botón Bet / Cashout
  const AMOUNT_SELECTOR = '.styles_text__2Xv67.styles_smallText__1xhai'; // texto de monto

  // === Estado global ===
  let primerCrash = null;
  let targetMultiplier = null;
  let hasBetThisRound = false;
  let bettingInProgress = false;
  let rondaActiva = false;

  // === Utilidades ===
  function log(...a) { console.log('⚙️ CrashBot ▶', ...a); }

  function getBetButton() {
    return document.querySelector(BET_SELECTOR);
  }

  function readAmount() {
    const el = document.querySelector(AMOUNT_SELECTOR);
    return el ? el.innerText.trim() : '0 ADA';
  }

  function computeNextBet(crash) {
    if (crash > 2) return parseFloat((crash + 0.01).toFixed(2));
    if (crash > 1.0 && crash < 2) return Math.max(1.01, parseFloat((crash - 0.10).toFixed(2)));
    return 1.01;
  }

  function apostar() {
    const btn = getBetButton();
    if (!btn || hasBetThisRound) return;
    btn.click();
    hasBetThisRound = true;
    bettingInProgress = true;
    log(`🎯 Apostado con target ${targetMultiplier.toFixed(2)}x | Monto: ${readAmount()}`);
  }

  function intentarCashout(crashActual) {
    if (!bettingInProgress || !targetMultiplier) return;
    if (crashActual >= targetMultiplier) {
      const btn = getBetButton();
      if (btn) {
        btn.click();
        bettingInProgress = false;
        log(`💸 Cashout automático en ${crashActual.toFixed(2)}x (objetivo ${targetMultiplier.toFixed(2)}x alcanzado).`);
      }
    }
  }

  // === Observador principal ===
  function iniciarObservador() {
    const payout = document.querySelector(CRASH_SELECTOR);
    if (!payout) {
      log('⚠️ No se encontró el elemento del crash.');
      return;
    }

    let tempCrash = null;
    const mo = new MutationObserver(() => {
      const txt = payout.textContent.trim();

      // 🕒 Inicio de nueva ronda
      if (txt.toLowerCase().includes('starts in')) {
        rondaActiva = false;
        hasBetThisRound = false;
        if (primerCrash !== null) {
          // calcula target según el primer crash anterior
          targetMultiplier = computeNextBet(primerCrash);
          log(`🔁 Nueva ronda detectada → primer crash previo: ${primerCrash.toFixed(2)}x → próxima apuesta: ${targetMultiplier.toFixed(2)}x`);
          setTimeout(() => apostar(), 400 + Math.random() * 600);
        } else {
          log('Esperando primer crash inicial...');
        }
        return;
      }

      // 🚀 Durante ronda activa (muestra números "x")
      if (txt.endsWith('x')) {
        const val = parseFloat(txt.replace('x', ''));
        if (isNaN(val)) return;

        // Primer crash detectado
        if (!rondaActiva) {
          primerCrash = val;
          rondaActiva = true;
          log(`💥 Primer crash detectado: ${primerCrash.toFixed(2)}x`);
        }

        // Cashout automático
        intentarCashout(val);
      }
    });

    mo.observe(payout, { childList: true, subtree: true, characterData: true });
    log('✅ CRASH AUTO BET v5.3 (Primer Crash Edition) iniciado.');
  }

  // === Lanzar ===
  iniciarObservador();

})();
