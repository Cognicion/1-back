import { STATE_LABELS } from "./config.js";

export function updateMascotAccessibility(button, message, state) {
  const label = `SOFÍA ${STATE_LABELS[state] || "está activa"}`;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-describedby", message.id);
  message.textContent = `SOFÍA ${STATE_LABELS[state] || "está activa"}.`;
}
