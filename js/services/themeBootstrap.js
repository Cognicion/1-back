import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../firebase.js";
import { applyTheme, initializeThemeForUser } from "./themeService.js";

applyTheme(document.documentElement.dataset.theme || "light");
document.documentElement.style.removeProperty("background-color");
console.debug("[ThemeBootstrap] inicialización modular completada", { theme: document.documentElement.dataset.theme });
onAuthStateChanged(auth, (user) => { void initializeThemeForUser(user); });
