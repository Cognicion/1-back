import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  aplicarAparienciaGuardada,
  aplicarModoInterfazCognicion,
  aplicarPaletaClaraCognicion,
  aplicarTemaCognicion,
  guardarModoInterfazUsuario,
  guardarPaletaClaraUsuario,
  guardarPreferenciasBiocellularUsuario,
  MODOS_INTERFAZ_COGNICION,
  obtenerModoInterfazLocalCognicion,
  obtenerPaletaClaraLocalCognicion,
  OPCIONES_MODO_INTERFAZ_COGNICION,
  OPCIONES_PALETA_CLARA_COGNICION,
  sincronizarAparienciaUsuario
} from "./services/apariencia.js";
import { getBiocellularPreferences } from "./themes/biocellularPreferences.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { abrirLegalModal } from "./legal/legalModal.js";
import { betaConsent, privacyNotice } from "./legal/legalDocuments.js";
import { actualizarPreferenciaComunicaciones, obtenerEstadoConsentimientoLegal } from "./legal/legalConsentService.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { renderizarFotoPerfil, subirFotoPerfil } from "./services/profilePhotoService.js";
import { isAdministrator, usuarioEsPersonalClinico } from "./utils/roles.js";
import { executeAppointmentCommand, appointmentErrorCode } from "./services/appointmentCommandService.js";

aplicarAparienciaGuardada();
iniciarMonitoreoSesion("Configuracion - Apariencia");

let uidActual = null;
let modoInterfazGuardado = obtenerModoInterfazLocalCognicion();
let modoInterfazPendiente = modoInterfazGuardado;
let paletaClaraGuardada = obtenerPaletaClaraLocalCognicion();
let paletaClaraPendiente = paletaClaraGuardada;
let biocellularPendiente = getBiocellularPreferences();
let biocellularGuardado = { ...biocellularPendiente };
let guardandoApariencia = false;
const DIAS_JORNADA = [["monday", "Lunes"], ["tuesday", "Martes"], ["wednesday", "Miércoles"], ["thursday", "Jueves"], ["friday", "Viernes"], ["saturday", "Sábado"], ["sunday", "Domingo"]];

function estadoDisponibilidad(texto) { const el = document.getElementById("estadoDisponibilidad"); if (el) el.textContent = texto; }
function intervaloJornadaHtml(day, interval = { start: "09:00", end: "17:00" }) {
  return `<div class="working-interval"><input type="time" data-start value="${interval.start}"><span>–</span><input type="time" data-end value="${interval.end}"><button type="button" data-remove-interval aria-label="Eliminar intervalo">×</button></div>`;
}
function renderizarJornada(schedule = {}) {
  const root = document.getElementById("jornadaSemanal"); if (!root) return;
  root.innerHTML = DIAS_JORNADA.map(([key, label]) => `<section class="schedule-day" data-day="${key}"><strong>${label}</strong><div class="working-intervals">${(schedule[key] || []).map((item) => intervaloJornadaHtml(key, item)).join("")}</div><button class="btn-secundario" type="button" data-add-interval>Agregar horario</button></section>`).join("");
  root.querySelectorAll("[data-add-interval]").forEach((button) => button.addEventListener("click", () => { const container = button.closest(".schedule-day").querySelector(".working-intervals"); container.insertAdjacentHTML("beforeend", intervaloJornadaHtml()); const remove = container.lastElementChild.querySelector("[data-remove-interval]"); remove.addEventListener("click", () => remove.closest(".working-interval").remove()); }));
  root.querySelectorAll("[data-remove-interval]").forEach((button) => button.addEventListener("click", () => button.closest(".working-interval").remove()));
}
function leerJornada() {
  const weeklySchedule = {};
  document.querySelectorAll(".schedule-day").forEach((day) => {
    weeklySchedule[day.dataset.day] = [...day.querySelectorAll(".working-interval")].map((row) => ({ start: row.querySelector("[data-start]").value, end: row.querySelector("[data-end]").value }));
  });
  return weeklySchedule;
}
async function inicializarDisponibilidad(user) {
  const perfil = await obtenerUsuario(user.uid); const rol = perfil?.rol || perfil?.role || "";
  if (!perfil || (!isAdministrator(perfil) && !usuarioEsPersonalClinico(rol))) return;
  document.getElementById("navDisponibilidad").hidden = false;
  document.getElementById("disponibilidad").hidden = false;
  try {
    const result = await executeAppointmentCommand({ action: "availabilitySettings" });
    const settings = result.settings || {};
    document.getElementById("timezoneDisponibilidad").value = settings.timeZone || "";
    document.getElementById("bookingEnabledDisponibilidad").checked = Boolean(settings.bookingEnabled);
    renderizarJornada(settings.weeklySchedule || {});
    estadoDisponibilidad(result.bookingReady ? "Disponible para reservas externas." : "Configura zona horaria y jornada antes de habilitar reservas externas.");
  } catch (error) { renderizarJornada(); estadoDisponibilidad("Aún no hay una configuración de disponibilidad."); console.warn("[AGENDA][DISPONIBILIDAD] No se pudo cargar.", { code: appointmentErrorCode(error) }); }
  document.getElementById("formDisponibilidad").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = document.getElementById("guardarDisponibilidad");
    const settings = { timeZone: document.getElementById("timezoneDisponibilidad").value.trim(), bookingEnabled: document.getElementById("bookingEnabledDisponibilidad").checked, weeklySchedule: leerJornada(), slotDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumBookingNoticeMinutes: null, maximumBookingAdvanceDays: null, dateExceptions: [] };
    button.disabled = true; estadoDisponibilidad("Guardando disponibilidad…");
    try { const result = await executeAppointmentCommand({ action: "updateAvailabilitySettings", settings }); estadoDisponibilidad(result.bookingReady ? "Disponibilidad guardada y lista para reservas externas." : "Disponibilidad guardada. Falta una jornada válida para reservas externas."); }
    catch (error) { const code = appointmentErrorCode(error); estadoDisponibilidad(code === "invalid-timezone" ? "La zona horaria debe ser un identificador IANA válido." : code.includes("working") || code.includes("schedule") ? "Revisa horarios: inicio antes de fin y sin solapamientos." : "No se pudo guardar la disponibilidad."); console.warn("[AGENDA][DISPONIBILIDAD] Guardado rechazado.", { code }); }
    finally { button.disabled = false; }
  }, { once: true });
}

function estado(texto) {
  const el = document.getElementById("estadoApariencia");
  if (el) el.textContent = texto;
}

function nombreModoInterfaz(modo) {
  const opcion = OPCIONES_MODO_INTERFAZ_COGNICION.find((item) => item.id === modo);
  return opcion?.nombre || "Futurista Oscuro";
}

function nombrePaletaClara(paleta) {
  return OPCIONES_PALETA_CLARA_COGNICION.find((item) => item.id === paleta)?.nombre || "Menta";
}

function textoPreferenciaActiva() {
  const paleta = modoInterfazGuardado === MODOS_INTERFAZ_COGNICION.CLARO
    ? ` · Paleta ${nombrePaletaClara(paletaClaraGuardada)}`
    : "";
  return `Interfaz Laboratorio · ${nombreModoInterfaz(modoInterfazGuardado)}${paleta}.`;
}

function formatearFechaLegal(valor) {
  if (!valor) return "pendiente";
  const fecha = typeof valor.toDate === "function" ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "pendiente" : fecha.toLocaleString("es-MX");
}

function hayCambiosPendientes() {
  return modoInterfazPendiente !== modoInterfazGuardado
    || paletaClaraPendiente !== paletaClaraGuardada
    || JSON.stringify(biocellularPendiente) !== JSON.stringify(biocellularGuardado);
}

function actualizarBotonesAccion() {
  const aplicar = document.getElementById("aplicarTemaApariencia");
  const cancelar = document.getElementById("cancelarTemaApariencia");
  const hayCambios = hayCambiosPendientes();
  if (aplicar) {
    aplicar.disabled = guardandoApariencia || !hayCambios;
    aplicar.setAttribute("aria-disabled", String(aplicar.disabled));
  }
  if (cancelar) {
    cancelar.disabled = guardandoApariencia || !hayCambios;
    cancelar.setAttribute("aria-disabled", String(cancelar.disabled));
  }
}

function actualizarVistaPrevia() {
  aplicarTemaCognicion();
  aplicarPaletaClaraCognicion(paletaClaraPendiente);
  aplicarModoInterfazCognicion(modoInterfazPendiente);
  const settings = document.getElementById("biocellularSettings");
  if (settings) settings.hidden = modoInterfazPendiente !== MODOS_INTERFAZ_COGNICION.BIOCELULAR;
  const paletaClaraSettings = document.getElementById("paletaClaraSettings");
  if (paletaClaraSettings) paletaClaraSettings.hidden = modoInterfazPendiente !== MODOS_INTERFAZ_COGNICION.CLARO;
}

function estadoVistaPrevia() {
  const paleta = modoInterfazPendiente === MODOS_INTERFAZ_COGNICION.CLARO
    ? ` · Paleta ${nombrePaletaClara(paletaClaraPendiente)}`
    : "";
  estado(hayCambiosPendientes()
    ? `Vista previa: Laboratorio · ${nombreModoInterfaz(modoInterfazPendiente)}${paleta}. Pulsa Aplicar tema para guardar.`
    : textoPreferenciaActiva());
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
        <strong>${modo.icono} ${modo.nombre}${modo.id === MODOS_INTERFAZ_COGNICION.BIOCELULAR ? ' <span class="tema-default-badge">Predeterminado</span>' : ""}</strong>
        <small>${modo.descripcion}</small>
      </button>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-modo-interfaz]").forEach((boton) => {
    boton.addEventListener("click", () => {
      modoInterfazPendiente = boton.dataset.modoInterfaz;
      actualizarVistaPrevia();
      renderizarModosInterfaz();
      renderizarPaletasClaras();
      actualizarBotonesAccion();
      estadoVistaPrevia();
    });
  });

  document.querySelectorAll("[data-bio-setting]").forEach((control) => {
    const key = control.dataset.bioSetting;
    if (control.type === "checkbox") control.checked = Boolean(biocellularPendiente[key]);
    else control.value = biocellularPendiente[key] || control.value;
    control.onchange = () => { biocellularPendiente = { ...biocellularPendiente, [key]: control.type === "checkbox" ? control.checked : control.value }; globalThis.__cognicionBiocellularRefresh?.(biocellularPendiente); actualizarBotonesAccion(); estadoVistaPrevia(); };
  });

  actualizarBotonesAccion();
}

function renderizarPaletasClaras() {
  const contenedor = document.getElementById("paletasClarasApariencia");
  if (!contenedor) return;
  contenedor.innerHTML = OPCIONES_PALETA_CLARA_COGNICION.map((paleta) => {
    const seleccionada = paleta.id === paletaClaraPendiente;
    const guardada = paleta.id === paletaClaraGuardada;
    return `
      <button type="button" class="paleta-clara-opcion ${seleccionada ? "activa" : ""} ${guardada ? "guardada" : ""}" data-paleta-clara="${paleta.id}" aria-pressed="${seleccionada}">
        <span class="paleta-clara-muestra ${paleta.id}" aria-hidden="true"><i></i><i></i><i></i></span>
        <strong>${paleta.nombre}</strong>
        <small>${paleta.descripcion}</small>
      </button>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-paleta-clara]").forEach((boton) => {
    boton.addEventListener("click", () => {
      paletaClaraPendiente = boton.dataset.paletaClara;
      aplicarPaletaClaraCognicion(paletaClaraPendiente);
      renderizarPaletasClaras();
      actualizarBotonesAccion();
      estadoVistaPrevia();
    });
  });
}

async function aplicarTemaPendiente() {
  if (!hayCambiosPendientes() || guardandoApariencia) return;
  guardandoApariencia = true;
  actualizarBotonesAccion();
  try {
    estado("Guardando apariencia...");
    if (modoInterfazPendiente !== modoInterfazGuardado) {
      modoInterfazGuardado = await guardarModoInterfazUsuario(uidActual, modoInterfazPendiente);
      modoInterfazPendiente = modoInterfazGuardado;
    }
    if (paletaClaraPendiente !== paletaClaraGuardada) {
      paletaClaraGuardada = await guardarPaletaClaraUsuario(uidActual, paletaClaraPendiente);
      paletaClaraPendiente = paletaClaraGuardada;
    }
    if (JSON.stringify(biocellularPendiente) !== JSON.stringify(biocellularGuardado)) {
      biocellularGuardado = await guardarPreferenciasBiocellularUsuario(uidActual, biocellularPendiente);
      biocellularPendiente = { ...biocellularGuardado };
    }
    actualizarVistaPrevia();
    renderizarModosInterfaz();
    renderizarPaletasClaras();
    estado(textoPreferenciaActiva());
  } catch (error) {
    console.error("No se pudo guardar la apariencia.", error);
    estado("No se pudo guardar en la nube. La vista previa sigue activa; puedes reintentar o cancelar.");
  } finally {
    guardandoApariencia = false;
    actualizarBotonesAccion();
  }
}

function cancelarVistaPrevia() {
  modoInterfazPendiente = modoInterfazGuardado;
  paletaClaraPendiente = paletaClaraGuardada;
  biocellularPendiente = { ...biocellularGuardado };
  actualizarVistaPrevia();
  renderizarModosInterfaz();
  renderizarPaletasClaras();
  actualizarBotonesAccion();
  estado(`Vista previa cancelada. ${textoPreferenciaActiva()}`);
}

function restaurarTemaPredeterminado() {
  modoInterfazPendiente = MODOS_INTERFAZ_COGNICION.BIOCELULAR;
  paletaClaraPendiente = "menta";
  biocellularPendiente = getBiocellularPreferences();
  actualizarVistaPrevia();
  renderizarModosInterfaz();
  renderizarPaletasClaras();
  actualizarBotonesAccion();
  estado("Predeterminado en vista previa. Pulsa Aplicar tema para guardar.");
}

function inicializarControlesApariencia() {
  renderizarModosInterfaz();
  renderizarPaletasClaras();
  actualizarVistaPrevia();
  document.getElementById("aplicarTemaApariencia")?.addEventListener("click", aplicarTemaPendiente);
  document.getElementById("cancelarTemaApariencia")?.addEventListener("click", cancelarVistaPrevia);
  document.getElementById("restaurarTemaApariencia")?.addEventListener("click", restaurarTemaPredeterminado);
  actualizarBotonesAccion();
}

async function inicializarFotoPerfilConfiguracion(user) {
  const perfil = await obtenerUsuario(user.uid);
  const rol = perfil?.rol || perfil?.role || "";
  if (!perfil || (!isAdministrator(perfil) && !usuarioEsPersonalClinico(rol))) return;

  const nav = document.getElementById("navFotoPerfil");
  const seccion = document.getElementById("foto-perfil");
  const input = document.getElementById("fotoPerfilConfiguracion");
  const preview = document.getElementById("fotoPerfilConfiguracionPreview");
  const status = document.getElementById("estadoFotoPerfilConfiguracion");
  const nombre = perfil.nombre || user.displayName || user.email || "DR";
  let fotoUrl = perfil.fotoProfesional || user.photoURL || "";

  nav.hidden = false;
  seccion.hidden = false;
  input.disabled = false;
  renderizarFotoPerfil(preview, { url: fotoUrl, nombre, alt: "Foto de perfil profesional" });
  status.textContent = fotoUrl ? "Fotografía actual guardada." : "Aún no has agregado una fotografía.";

  if (input.dataset.profilePhotoReady === "true") return;
  input.dataset.profilePhotoReady = "true";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    status.textContent = "Subiendo fotografía...";
    try {
      const resultado = await subirFotoPerfil(user.uid, file, {
        onProgress: (porcentaje) => {
          status.textContent = porcentaje > 0
            ? `Subiendo fotografía... ${porcentaje}%`
            : "Preparando fotografía...";
        }
      });
      fotoUrl = resultado.url;
      renderizarFotoPerfil(preview, { url: fotoUrl, nombre, alt: "Foto de perfil profesional" });
      status.textContent = "Fotografía actualizada. Ya está disponible en tu perfil profesional.";
      registrarEventoAuditoria({
        accion: "actualizar_foto_perfil",
        modulo: "Configuración",
        descripcion: "El usuario actualizó su fotografía de perfil desde Configuración.",
        usuarioUid: user.uid,
        usuarioNombre: perfil.nombre || "",
        usuarioRol: rol || "medico",
        exito: true,
        detalles: { storagePath: resultado.storagePath }
      }).catch((error) => {
        console.warn("No se pudo registrar la auditoría de la fotografía.", error?.code || error?.name || "error");
      });
    } catch (error) {
      console.error("No se pudo actualizar la fotografía de perfil.", error);
      status.textContent = error?.message || "No se pudo subir la fotografía. Intenta nuevamente.";
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });
}

inicializarControlesApariencia();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  uidActual = user.uid;
  inicializarFotoPerfilConfiguracion(user).catch((error) => {
    console.error("No se pudo inicializar la fotografía de perfil.", error);
  });
  inicializarDisponibilidad(user).catch((error) => {
    console.warn("[AGENDA][DISPONIBILIDAD] Inicialización pendiente.", { code: appointmentErrorCode(error) });
  });
  document.getElementById("verAvisoPrivacidad")?.addEventListener("click", (event) => abrirLegalModal(privacyNotice, event.currentTarget));
  document.getElementById("verConsentimientoBeta")?.addEventListener("click", (event) => abrirLegalModal(betaConsent, event.currentTarget));
  const preferenciaComunicaciones = document.getElementById("preferenciaComunicaciones");
  const estadoComunicaciones = document.getElementById("estadoComunicaciones");
  try {
    const legal = await obtenerEstadoConsentimientoLegal(user);
    const estadoLegal = document.getElementById("estadoLegal");
    estadoLegal.textContent = `Aviso: ${legal.privacyAccepted ? legal.privacyVersion : "pendiente"} (${formatearFechaLegal(legal.privacyAcceptedAt)}) · Consentimiento Beta: ${legal.betaAccepted ? legal.betaVersion : "pendiente"} (${formatearFechaLegal(legal.betaAcceptedAt)}). ${legal.requiresUpdate ? "Requiere actualización." : "Vigente."}`;
    preferenciaComunicaciones.checked = legal.communicationsAccepted;
    preferenciaComunicaciones.addEventListener("change", async () => {
      preferenciaComunicaciones.disabled = true;
      try { await actualizarPreferenciaComunicaciones(uidActual, preferenciaComunicaciones.checked); estadoComunicaciones.textContent = "Preferencia guardada."; } catch (error) { preferenciaComunicaciones.checked = !preferenciaComunicaciones.checked; estadoComunicaciones.textContent = "No se pudo guardar la preferencia. Intenta nuevamente."; console.error("[LEGAL][SETTINGS] Error de persistencia", { code: error?.code || "unknown" }); } finally { preferenciaComunicaciones.disabled = false; }
    });
  } catch (error) {
    document.getElementById("estadoLegal").textContent = "No se pudieron cargar los consentimientos.";
    console.error("[LEGAL][SETTINGS] Error de lectura", { code: error?.code || "unknown" });
  }
  await sincronizarAparienciaUsuario(user.uid);
  modoInterfazGuardado = obtenerModoInterfazLocalCognicion();
  modoInterfazPendiente = modoInterfazGuardado;
  paletaClaraGuardada = obtenerPaletaClaraLocalCognicion();
  paletaClaraPendiente = paletaClaraGuardada;
  biocellularGuardado = getBiocellularPreferences();
  biocellularPendiente = { ...biocellularGuardado };
  renderizarModosInterfaz();
  renderizarPaletasClaras();
  actualizarVistaPrevia();
  actualizarBotonesAccion();
  estado(textoPreferenciaActiva());
});
