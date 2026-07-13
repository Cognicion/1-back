import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  aplicarAparienciaGuardada,
  aplicarTemaCognicion,
  guardarPreferenciaAparienciaUsuario,
  OPCIONES_TEMA_COGNICION,
  sincronizarAparienciaUsuario,
  TEMAS_COGNICION
} from "./services/apariencia.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

aplicarAparienciaGuardada();
iniciarMonitoreoSesion("Configuracion - Apariencia");

let uidActual = null;
let temaGuardado = aplicarAparienciaGuardada();
let temaPendiente = temaGuardado;

function estado(texto) {
  const el = document.getElementById("estadoApariencia");
  if (el) el.textContent = texto;
}

function nombreTema(tema) {
  const opcion = OPCIONES_TEMA_COGNICION.find((item) => item.id === tema);
  return opcion?.nombre || "Clasica";
}

function hayCambiosPendientes() {
  return temaPendiente !== temaGuardado;
}

function actualizarBotonesAccion() {
  const aplicar = document.getElementById("aplicarTemaApariencia");
  const cancelar = document.getElementById("cancelarTemaApariencia");
  if (aplicar) aplicar.disabled = !hayCambiosPendientes();
  if (cancelar) cancelar.disabled = !hayCambiosPendientes();
}

function renderizarTemas() {
  const contenedor = document.getElementById("temasApariencia");
  if (!contenedor) return;
  contenedor.innerHTML = OPCIONES_TEMA_COGNICION.map((tema) => {
    const seleccionado = tema.id === temaPendiente;
    const guardado = tema.id === temaGuardado;
    return `
      <button type="button" class="tema-opcion ${seleccionado ? "activo" : ""} ${guardado ? "guardado" : ""}" data-tema="${tema.id}" aria-pressed="${seleccionado}">
        <div class="tema-preview ${tema.id}" aria-hidden="true"></div>
        <strong>${tema.nombre}</strong>
        <small>${tema.descripcion}</small>
      </button>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-tema]").forEach((boton) => {
    boton.addEventListener("click", () => {
      temaPendiente = boton.dataset.tema;
      aplicarTemaCognicion(temaPendiente);
      renderizarTemas();
      actualizarBotonesAccion();
      estado(hayCambiosPendientes()
        ? `Vista previa: ${nombreTema(temaPendiente)}. Pulsa Aplicar tema para guardar.`
        : `Preferencia activa: ${nombreTema(temaGuardado)}.`);
    });
  });

  actualizarBotonesAccion();
}

async function aplicarTemaPendiente() {
  try {
    estado("Guardando apariencia...");
    temaGuardado = await guardarPreferenciaAparienciaUsuario(uidActual, temaPendiente);
    temaPendiente = temaGuardado;
    renderizarTemas();
    estado(`Apariencia aplicada: ${nombreTema(temaGuardado)}.`);
  } catch (error) {
    console.error("No se pudo guardar la apariencia.", error);
    estado("No se pudo guardar en la nube. Se conservo localmente.");
  }
}

function cancelarVistaPrevia() {
  temaPendiente = temaGuardado;
  aplicarTemaCognicion(temaGuardado);
  renderizarTemas();
  estado(`Vista previa cancelada. Preferencia activa: ${nombreTema(temaGuardado)}.`);
}

async function restaurarTemaPredeterminado() {
  temaPendiente = TEMAS_COGNICION.CLASICA;
  aplicarTemaCognicion(temaPendiente);
  await aplicarTemaPendiente();
}

function inicializarControlesApariencia() {
  document.getElementById("aplicarTemaApariencia")?.addEventListener("click", aplicarTemaPendiente);
  document.getElementById("cancelarTemaApariencia")?.addEventListener("click", cancelarVistaPrevia);
  document.getElementById("restaurarTemaApariencia")?.addEventListener("click", restaurarTemaPredeterminado);
  actualizarBotonesAccion();
}

inicializarControlesApariencia();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  uidActual = user.uid;
  temaGuardado = await sincronizarAparienciaUsuario(user.uid);
  temaPendiente = temaGuardado;
  renderizarTemas();
  estado(`Preferencia activa: ${nombreTema(temaGuardado)}.`);
});