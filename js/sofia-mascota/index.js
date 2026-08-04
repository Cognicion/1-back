import { DEFAULT_PREFERENCES, MASCOT_STATES } from "./config.js";
import { loadPreferences } from "./mascotaPersistence.js";
import { createMascotStateMachine } from "./mascotaStateMachine.js";
import { listenToSofiaEvents } from "./mascotaEvents.js";
import { bindMascotInteractions } from "./mascotaInteractions.js";
import { createInactivityMonitor } from "./mascotaInactivity.js";
import { renderMascotState } from "./mascotaController.js";

export function initializeSofiaMascot() {
  console.debug("[SOFÍA Mascota] initializeSofiaMascot ejecutada");
  if (!document.body) {
    console.warn("[SOFÍA Mascota] Montaje cancelado: document.body no disponible");
    return null;
  }
  if (document.body.dataset.sofiaMascot !== "enabled") {
    console.debug("[SOFÍA Mascota] Montaje cancelado: marca no habilitada", { value: document.body.dataset.sofiaMascot });
    return null;
  }
  const existing = document.getElementById("sofiaMascot");
  if (existing) {
    console.debug("[SOFÍA Mascota] Ya existe un contenedor", existing);
    return existing;
  }
  const preferences = { ...DEFAULT_PREFERENCES, ...loadPreferences() };
  const root = document.createElement("div");
  root.id = "sofiaMascot";
  root.className = "sofia-mascot";
  root.dataset.mounted = "true";
  root.innerHTML = `<button class="sofia-mascot__button" type="button" aria-label="SOFÍA está inactiva"><span class="sofia-mascot__sprite" aria-hidden="true"><i class="sofia-mascot__brain"></i><i class="sofia-mascot__glasses"></i><i class="sofia-mascot__eyes"></i><i class="sofia-mascot__arm sofia-mascot__arm--left"></i><i class="sofia-mascot__arm sofia-mascot__arm--right"></i><i class="sofia-mascot__leg sofia-mascot__leg--left"></i><i class="sofia-mascot__leg sofia-mascot__leg--right"></i></span></button><section class="sofia-mascot__panel" hidden role="dialog" aria-labelledby="sofiaMascotTitle"><div class="sofia-mascot__panel-head"><h2 id="sofiaMascotTitle">Estado de SOFÍA</h2><button class="sofia-mascot__close" type="button" aria-label="Cerrar panel">×</button></div><p class="sofia-mascot__status" aria-live="polite"></p><p class="sofia-mascot__message" id="sofiaMascotMessage"></p><div class="sofia-mascot__settings"><button type="button" data-mascot-setting="animations">Animaciones</button><button type="button" data-mascot-setting="size" data-value="small">Pequeña</button><button type="button" data-mascot-setting="size" data-value="medium">Mediana</button><button type="button" data-mascot-setting="size" data-value="large">Grande</button><button type="button" data-mascot-setting="position" data-value="bottom-left">Izquierda</button><button type="button" data-mascot-setting="position" data-value="bottom-right">Derecha</button><button type="button" data-mascot-setting="enabled">Ocultar</button></div></section><p class="sofia-mascot__sr-message" id="sofiaMascotLiveMessage"></p>`;
  if (!existing) document.body.appendChild(root);
  const button = root.querySelector(".sofia-mascot__button");
  const panel = root.querySelector(".sofia-mascot__panel");
  const message = root.querySelector(".sofia-mascot__message");
  const status = root.querySelector(".sofia-mascot__status");
  const stateMachine = createMascotStateMachine(({ nextState, previousState, source }) => {
    status.textContent = nextState.replace("-", " ");
    renderMascotState({ root, button, message, state: nextState, previousState, source, preferences });
  });
  const applyPreferences = (next) => {
    root.classList.toggle("is-hidden", !next.enabled);
    root.dataset.position = next.position;
    root.dataset.size = next.size;
    root.classList.toggle("animations-off", !next.animationsEnabled);
    renderMascotState({ root, button, message, state: stateMachine.getState(), previousState: stateMachine.getState(), source: "preferences", preferences: next });
  };
  applyPreferences(preferences);
  const stopEvents = listenToSofiaEvents(({ state, source, duration, fallbackState }) => stateMachine.setState(state, { source, duration, fallbackState }));
  const interactions = bindMascotInteractions({ root, button, panel, closeButton: root.querySelector(".sofia-mascot__close"), preferences, onPreferencesChange: applyPreferences });
  const stopInactivity = createInactivityMonitor({ isProcessing: () => ["thinking", "reading", "pattern-detection"].includes(stateMachine.getState()), onSleep: () => stateMachine.setState(MASCOT_STATES.SLEEPING, { source: "inactivity" }) });
  const onVisibility = () => renderMascotState({ root, button, message, state: stateMachine.getState(), previousState: stateMachine.getState(), source: "visibility", preferences });
  document.addEventListener("visibilitychange", onVisibility);
  console.debug("[SOFÍA Mascota] Contenedor montado", { connected: root.isConnected, rect: root.getBoundingClientRect() });
  const styles = getComputedStyle(root);
  console.debug("[SOFÍA Mascota] Inspección DOM", { exists: true, connected: root.isConnected, className: root.className, state: root.dataset.state });
  console.debug("[SOFÍA Mascota] Estilos calculados", { display: styles.display, visibility: styles.visibility, opacity: styles.opacity, position: styles.position, zIndex: styles.zIndex, width: styles.width, height: styles.height, pointerEvents: styles.pointerEvents });
  console.debug("[SOFÍA Mascota] Montaje.");
  root._sofiaMascotDestroy = () => { stopEvents(); stopInactivity(); interactions.destroy(); interactions.close(); stateMachine.destroy(); document.removeEventListener("visibilitychange", onVisibility); root.remove(); console.debug("[SOFÍA Mascota] Desmontaje."); };
  return root;
}
