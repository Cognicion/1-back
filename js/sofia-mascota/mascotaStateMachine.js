import { MASCOT_STATES, STATE_MAP, TEMPORARY_STATES } from "./config.js";

export function createMascotStateMachine(onStateChange) {
  let currentState = MASCOT_STATES.IDLE;
  let timerId = null;
  let transitionId = 0;

  function setState(functionalState, options = {}) {
    const nextState = STATE_MAP[functionalState] || functionalState;
    if (!Object.values(MASCOT_STATES).includes(nextState)) {
      console.debug("[SOFÍA Mascota] Estado desconocido.", { functionalState });
      return false;
    }
    const id = ++transitionId;
    if (timerId) clearTimeout(timerId);
    if (nextState === currentState && !options.force) return false;
    const previousState = currentState;
    currentState = nextState;
    onStateChange({ previousState, nextState, source: options.source || "event" });
    if (TEMPORARY_STATES.has(nextState) && options.duration) {
      timerId = setTimeout(() => {
        if (id === transitionId) setState(options.fallbackState || MASCOT_STATES.IDLE, { source: "temporary-timeout" });
      }, options.duration);
    }
    return true;
  }

  return {
    getState: () => currentState,
    setState,
    destroy: () => { if (timerId) clearTimeout(timerId); timerId = null; transitionId += 1; }
  };
}
