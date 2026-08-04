import { updateMascotAccessibility } from "./mascotaAccessibility.js";

const STATUS_COPY = {
  idle: "Disponible para acompañar el flujo de SOFÍA.", listening: "Esperando una entrada.", thinking: "Procesando una operación de SOFÍA.",
  reading: "Consultando contexto autorizado.", "pattern-detection": "Organizando relaciones semánticas.", success: "Operación completada.",
  warning: "Requiere atención del profesional.", error: "La operación encontró un problema.", sleeping: "En pausa por inactividad."
};

export function renderMascotState({ root, button, message, state, previousState, source, preferences }) {
  root.dataset.state = state;
  root.classList.toggle("is-animated", preferences.animationsEnabled);
  root.classList.toggle("is-paused", document.hidden);
  button.disabled = !preferences.enabled;
  updateMascotAccessibility(button, message, state);
  message.textContent = STATUS_COPY[state] || STATUS_COPY.idle;
  console.debug("[SOFÍA Mascota]", { previousState, nextState: state, source });
}
