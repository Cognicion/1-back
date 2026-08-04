import { savePreferences } from "./mascotaPersistence.js";

export function bindMascotInteractions({ root, button, panel, closeButton, preferences, onPreferencesChange }) {
  const setPreferences = (changes) => {
    Object.assign(preferences, changes);
    savePreferences(preferences);
    onPreferencesChange(preferences);
  };
  const close = () => { panel.hidden = true; console.debug("[SOFÍA Mascota] Panel cerrado."); };
  const togglePanel = () => { panel.hidden = !panel.hidden; console.debug("[SOFÍA Mascota] Panel", panel.hidden ? "cerrado" : "abierto"); };
  const onEscape = (event) => { if (event.key === "Escape") close(); };
  const onOutsidePointer = (event) => { if (!root.contains(event.target)) close(); };
  button.addEventListener("click", togglePanel);
  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", onEscape);
  document.addEventListener("pointerdown", onOutsidePointer, { passive: true });
  root.querySelectorAll("[data-mascot-setting]").forEach((control) => control.addEventListener("click", () => {
    const setting = control.dataset.mascotSetting;
    if (setting === "animations") setPreferences({ animationsEnabled: !preferences.animationsEnabled });
    if (setting === "enabled") setPreferences({ enabled: false });
    if (setting === "size") setPreferences({ size: control.dataset.value });
    if (setting === "position") setPreferences({ position: control.dataset.value });
  }));
  return { close, destroy: () => { button.removeEventListener("click", togglePanel); closeButton.removeEventListener("click", close); document.removeEventListener("keydown", onEscape); document.removeEventListener("pointerdown", onOutsidePointer); } };
}
