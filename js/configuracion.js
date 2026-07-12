import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  aplicarAparienciaGuardada,
  guardarPreferenciaAparienciaUsuario,
  OPCIONES_TEMA_COGNICION,
  sincronizarAparienciaUsuario
} from "./services/apariencia.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

aplicarAparienciaGuardada();
iniciarMonitoreoSesion("Configuracion - Apariencia");

let uidActual = null;
let temaActual = aplicarAparienciaGuardada();

function estado(texto) {
  const el = document.getElementById("estadoApariencia");
  if (el) el.textContent = texto;
}

function renderizarTemas() {
  const contenedor = document.getElementById("temasApariencia");
  if (!contenedor) return;
  contenedor.innerHTML = OPCIONES_TEMA_COGNICION.map((tema) => `
    <button type="button" class="tema-opcion ${tema.id === temaActual ? "activo" : ""}" data-tema="${tema.id}" aria-pressed="${tema.id === temaActual}">
      <div class="tema-preview ${tema.id}" aria-hidden="true"></div>
      <strong>${tema.nombre}</strong>
      <small>${tema.descripcion}</small>
    </button>
  `).join("");

  contenedor.querySelectorAll("[data-tema]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      const tema = boton.dataset.tema;
      try {
        estado("Guardando apariencia...");
        temaActual = await guardarPreferenciaAparienciaUsuario(uidActual, tema);
        renderizarTemas();
        estado("Apariencia guardada automaticamente.");
      } catch (error) {
        console.error("No se pudo guardar la apariencia.", error);
        estado("No se pudo guardar en la nube. Se conservo localmente.");
      }
    });
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  uidActual = user.uid;
  temaActual = await sincronizarAparienciaUsuario(user.uid);
  renderizarTemas();
  estado("Preferencia activa: " + (temaActual === "laboratorio" ? "Laboratorio" : "Clasica") + ".");
});