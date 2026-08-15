import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../firebase.js";
import { applyTheme, initializeThemeForUser, setThemeForUser } from "../services/themeService.js";

function renderSelector(container) {
  container.innerHTML = `
    <div class="cognicion-theme-selector" role="group" aria-label="Selector de tema">
      <span class="cognicion-theme-label">Tema:</span>
      <button type="button" data-theme-option="biocelular" data-cognicion-theme="biocelular" aria-pressed="false">Biocelular <small>Predeterminado</small></button>
      <button type="button" data-theme-option="dark" data-cognicion-theme="dark" aria-pressed="false">Oscuro</button>
    </div>`;
  container.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-theme-option]");
    if (!button) return;
    await setThemeForUser(auth.currentUser, button.dataset.themeOption);
  });
}

function initializeSelector() {
  applyTheme(document.documentElement.dataset.theme || "biocelular");
  document.querySelectorAll("[data-cognicion-theme-selector]").forEach(renderSelector);
  onAuthStateChanged(auth, (user) => { void initializeThemeForUser(user); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeSelector, { once: true });
else initializeSelector();
