const INACTIVITY_MS = 90000;

export function createInactivityMonitor({ isProcessing, onSleep }) {
  let timerId = null;
  let lastActivity = 0;
  const reset = () => {
    const now = Date.now();
    if (now - lastActivity < 500) return;
    lastActivity = now;
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => { if (!isProcessing()) onSleep(); }, INACTIVITY_MS);
  };
  ["pointerdown", "keydown", "scroll"].forEach((type) => document.addEventListener(type, reset, { passive: true }));
  reset();
  return () => {
    if (timerId) clearTimeout(timerId);
    ["pointerdown", "keydown", "scroll"].forEach((type) => document.removeEventListener(type, reset));
  };
}
