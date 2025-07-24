// --- NowPlayingView logic: Allow only user-initiated opens ---
  let userOpenedNPV = false;

  const NPV_BTN_SELECTOR = 'button[data-testid="control-button-npv"]';
  const NPV_VIEW_SELECTOR = '.NowPlayingView, aside[data-testid="now-playing-bar"]';
  const HIDE_BTN_SELECTOR = 'button[aria-label="Hide Now Playing view"]';

  // Track user opening NPV
  document.addEventListener('click', function(e) {
      const openBtn = e.target.closest(NPV_BTN_SELECTOR);
      const closeBtn = e.target.closest(HIDE_BTN_SELECTOR);
      if (openBtn && e.isTrusted) {
        userOpenedNPV = true;
      }
      if (closeBtn && e.isTrusted) {
        userOpenedNPV = false;
      }
      // Still block synthetic (non-trusted) opens
      if (openBtn && !e.isTrusted) {
          e.stopImmediatePropagation();
          e.preventDefault();
      }
  }, true);

  // Close NPV only if it was NOT opened by the user
  function closeNPV() {
      const hideBtn = document.querySelector(HIDE_BTN_SELECTOR);
      if (hideBtn && hideBtn.offsetParent !== null) {
          hideBtn.click();
      }
  }

  const npvObserver = new MutationObserver(() => {
      const npv = document.querySelector(NPV_VIEW_SELECTOR);
      // If NPV is open and user didn't open it, close it
      if (npv && npv.offsetParent !== null && !userOpenedNPV) {
          closeNPV();
      }
  });
  npvObserver.observe(document.body, { childList: true, subtree: true });

  // On page load, ensure NPV is closed if not user-initiated
  setTimeout(() => {
      const npv = document.querySelector(NPV_VIEW_SELECTOR);
      if (npv && npv.offsetParent !== null && !userOpenedNPV) {
          closeNPV();
      }
  }, 1000);
