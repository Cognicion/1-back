export const SOFIA_STATE_EVENT = "sofia:state-change";

export function listenToSofiaEvents(onEvent) {
  const handler = (event) => {
    const detail = event.detail || {};
    console.debug("[SOFÍA Mascota] Evento recibido.", detail);
    onEvent(detail);
  };
  document.addEventListener(SOFIA_STATE_EVENT, handler);
  return () => document.removeEventListener(SOFIA_STATE_EVENT, handler);
}

export function emitSofiaState(state, source = "ui", options = {}) {
  document.dispatchEvent(new CustomEvent(SOFIA_STATE_EVENT, { detail: { state, source, ...options } }));
}
