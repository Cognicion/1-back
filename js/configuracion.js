import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  aplicarAparienciaGuardada,
  aplicarModoInterfazCognicion,
  aplicarTemaCognicion,
  guardarModoInterfazUsuario,
  guardarPreferenciaAparienciaUsuario,
  MODOS_INTERFAZ_COGNICION,
  obtenerModoInterfazLocalCognicion,
  OPCIONES_MODO_INTERFAZ_COGNICION,
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
let modoInterfazGuardado = obtenerModoInterfazLocalCognicion();
let modoInterfazPendiente = modoInterfazGuardado;

function estado(texto) {
  const el = document.getElementById("estadoApariencia");
  if (el) el.textContent = texto;
}

function nombreTema(tema) {
  const opcion = OPCIONES_TEMA_COGNICION.find((item) => item.id === tema);
  return opcion?.nombre || "Clasica";
}

function nombreModoInterfaz(modo) {
  const opcion = OPCIONES_MODO_INTERFAZ_COGNICION.find((item) => item.id === modo);
  return opcion?.nombre || "Futurista Oscuro";
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
        : `Preferencia activa: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
    });
  });

  actualizarBotonesAccion();
}

function renderizarModosInterfaz() {
  const contenedor = document.getElementById("modoInterfazApariencia");
  if (!contenedor) return;
  contenedor.innerHTML = OPCIONES_MODO_INTERFAZ_COGNICION.map((modo) => {
    const seleccionado = modo.id === modoInterfazPendiente;
    const guardado = modo.id === modoInterfazGuardado;
    return `
      <button type="button" class="modo-interfaz-opcion ${seleccionado ? "activo" : ""} ${guardado ? "guardado" : ""}" data-modo-interfaz="${modo.id}" aria-pressed="${seleccionado}">
        <div class="modo-interfaz-preview ${modo.id}" aria-hidden="true">
          <span>${modo.icono}</span>
          <i></i><i></i><i></i>
        </div>
        <strong>${modo.icono} ${modo.nombre}</strong>
        <small>${modo.descripcion}</small>
      </button>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-modo-interfaz]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      modoInterfazPendiente = boton.dataset.modoInterfaz;
      aplicarModoInterfazCognicion(modoInterfazPendiente);
      renderizarModosInterfaz();
      estado(`Aplicando ${nombreModoInterfaz(modoInterfazPendiente)}...`);
      try {
        modoInterfazGuardado = await guardarModoInterfazUsuario(uidActual, modoInterfazPendiente);
        modoInterfazPendiente = modoInterfazGuardado;
        renderizarModosInterfaz();
        estado(`Preferencia activa: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
      } catch (error) {
        console.error("No se pudo guardar el tema de interfaz.", error);
        estado("El tema de interfaz se aplico localmente, pero no se pudo guardar en la nube.");
      }
    });
  });
}

async function aplicarTemaPendiente() {
  try {
    estado("Guardando apariencia...");
    temaGuardado = await guardarPreferenciaAparienciaUsuario(uidActual, temaPendiente);
    temaPendiente = temaGuardado;
    renderizarTemas();
    estado(`Apariencia aplicada: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
  } catch (error) {
    console.error("No se pudo guardar la apariencia.", error);
    estado("No se pudo guardar en la nube. Se conservo localmente.");
  }
}

function cancelarVistaPrevia() {
  temaPendiente = temaGuardado;
  aplicarTemaCognicion(temaGuardado);
  renderizarTemas();
  estado(`Vista previa cancelada. Preferencia activa: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
}

async function restaurarTemaPredeterminado() {
  temaPendiente = TEMAS_COGNICION.CLASICA;
  modoInterfazPendiente = MODOS_INTERFAZ_COGNICION.OSCURO;
  aplicarTemaCognicion(temaPendiente);
  aplicarModoInterfazCognicion(modoInterfazPendiente);
  await aplicarTemaPendiente();
  modoInterfazGuardado = await guardarModoInterfazUsuario(uidActual, modoInterfazPendiente);
  modoInterfazPendiente = modoInterfazGuardado;
  renderizarModosInterfaz();
  estado(`Preferencia activa: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
}

function inicializarControlesApariencia() {
  renderizarTemas();
  renderizarModosInterfaz();
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
  modoInterfazGuardado = obtenerModoInterfazLocalCognicion();
  modoInterfazPendiente = modoInterfazGuardado;
  renderizarTemas();
  renderizarModosInterfaz();
  estado(`Preferencia activa: ${nombreTema(temaGuardado)} · ${nombreModoInterfaz(modoInterfazGuardado)}.`);
});