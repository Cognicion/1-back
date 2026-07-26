import { auth } from "../firebase.js";
import { obtenerUsuario, medicoPuedeVer } from "../services/usuarios.js";
import { registrarEventoAuditoria } from "../services/auditoria.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  cargarEventosPaciente,
  cargarCategoriasLineaTiempo,
  crearCategoriaLineaTiempo,
  crearEventoPaciente,
  actualizarEventoPaciente,
  eliminarEventoPaciente,
  destruirLineaTiempoDataService
} from "./lineaTiempoDataService.js";
import { configurarInteracciones } from "./lineaTiempoInteractions.js";
import { iniciarAnimacionADN } from "./lineaTiempoAnimation.js";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  formatearFecha,
  normalizarFecha,
  ordenarEventosPorFecha
} from "./lineaTiempoUtils.js";
import { renderizarDetalleEvento, renderizarEstados, renderizarLineaTiempo } from "./lineaTiempoRenderer.js";

let root = null;
let pacienteId = "";
let eventos = [];
let categorias = [];
let usuarioActual = null;
let permisos = { puedeLeer: false, puedeEscribir: false };
let interacciones = null;
let animacion = null;
let zoomActual = 1;
let eventoEditando = null;
let inicializado = false;
let destruir = () => {};
let cancelarAuth = () => {};

export function obtenerPacienteIdDesdeUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("pacienteId") || params.get("id") || params.get("paciente") || "";
}

function mostrarErrorTecnico(error) {
  const mensaje = error?.code || error?.message || "error_desconocido";
  console.error("No se pudo cargar la línea de tiempo:", mensaje);
}

async function validarAccesoPaciente() {
  const user = auth.currentUser;
  if (!user || !pacienteId) return false;
  const perfil = await obtenerUsuario(user.uid);
  const paciente = await obtenerUsuario(pacienteId);
  if (!paciente) return false;
  const esPaciente = user.uid === pacienteId;
  const accesoProfesional = await medicoPuedeVer(user.uid, pacienteId);
  if (!esPaciente && !accesoProfesional) return false;
  const permisoDirecto = paciente.permisosMedicos?.[user.uid] || {};
  const rol = String(perfil?.rol || perfil?.role || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  permisos = {
    puedeLeer: true,
    puedeEscribir: Boolean(accesoProfesional && permisoDirecto.lectura !== false && rol !== "estudiante")
  };
  const etiqueta = root.querySelector("[data-patient-label]");
  if (etiqueta) etiqueta.textContent = esPaciente ? "Tu expediente clínico · eventos ordenados cronológicamente." : "Eventos clínicos ordenados cronológicamente.";
  return true;
}

function fechaFormulario(fecha) {
  const valor = normalizarFecha(fecha) || new Date();
  const pad = (numero) => String(numero).padStart(2, "0");
  return {
    fecha: `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`,
    hora: `${pad(valor.getHours())}:${pad(valor.getMinutes())}`
  };
}

function renderizarVista() {
  const rango = eventos.length ? { minimo: eventos[0].fechaEvento, maximo: eventos.at(-1).fechaEvento, duracion: eventos.at(-1).fechaEvento - eventos[0].fechaEvento } : { minimo: null, maximo: null, duracion: 0 };
  renderizarLineaTiempo(root, eventos, rango, zoomActual);
  const etiqueta = root.querySelector("[data-zoom-label]");
  if (etiqueta) etiqueta.textContent = `${Math.round(zoomActual * 100)} %`;
  renderizarEstados(root, eventos.length ? "" : "empty");
  root.querySelector("[data-timeline-shell]").hidden = !eventos.length;
}

function abrirDetalle(seleccion) {
  renderizarDetalleEvento(root, eventos, seleccion.eventoId, seleccion.grupoId);
  root.querySelectorAll("[data-event-id]").forEach((card) => {
    const acciones = card.querySelector(".timeline-detail-event__actions");
    if (!acciones || !permisos.puedeEscribir) return;
    const id = card.dataset.eventId;
    acciones.innerHTML = `<button type="button" class="timeline-button" data-edit-event="${id}">Editar</button><button type="button" class="timeline-button timeline-button--danger" data-delete-event="${id}">Eliminar</button>`;
  });
}

function cerrarDetalle() {
  const panel = root.querySelector("[data-event-detail]");
  if (panel) panel.hidden = true;
}

function abrirFormulario(evento = null) {
  eventoEditando = evento;
  const panel = root.querySelector("[data-event-form-panel]");
  const form = root.querySelector("[data-event-form]");
  const titulo = root.querySelector("[data-form-title]");
  if (!panel || !form) return;
  form.reset();
  titulo.textContent = evento ? "Editar evento" : "Añadir evento";
  const datosFecha = fechaFormulario(evento?.fechaEvento);
  form.elements.titulo.value = evento?.titulo || "";
  form.elements.fechaEvento.value = datosFecha.fecha;
  form.elements.horaEvento.value = evento ? datosFecha.hora : "";
  form.elements.fechaFin.value = evento?.fechaFin ? fechaFormulario(evento.fechaFin).fecha : "";
  form.elements.descripcion.value = evento?.descripcion || "";
  form.elements.nuevaCategoria.value = "";
  renderizarCategorias(evento?.categoria || "");
  form.elements.importancia.value = evento?.importancia || "media";
  root.querySelector("[data-form-error]").textContent = "";
  panel.hidden = false;
  form.elements.titulo.focus();
}

function renderizarCategorias(seleccion = "") {
  const select = root?.querySelector("[name='categoria']");
  if (!select) return;
  const nombres = new Set(categorias.map((categoria) => categoria.nombre));
  if (seleccion) nombres.add(seleccion);
  select.replaceChildren(new Option("Ninguna categoría", ""));
  [...nombres].sort((a, b) => a.localeCompare(b, "es")).forEach((nombre) => select.add(new Option(nombre, nombre)));
  select.value = seleccion;
}

async function agregarCategoria() {
  const input = root.querySelector("[name='nuevaCategoria']");
  const boton = root.querySelector("[data-action='add-category']");
  const nombre = input?.value.trim();
  if (!nombre || !boton || !auth.currentUser) return;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const categoria = await crearCategoriaLineaTiempo(auth.currentUser.uid, nombre);
    categorias = [...categorias.filter((item) => item.id !== categoria.id && item.nombre.toLocaleLowerCase("es-MX") !== categoria.nombre.toLocaleLowerCase("es-MX")), categoria];
    renderizarCategorias(categoria.nombre);
    input.value = "";
  } catch (error) {
    root.querySelector("[data-form-error]").textContent = "No fue posible guardar la categoría.";
    mostrarErrorTecnico(error);
  } finally {
    boton.textContent = "Añadir";
    boton.disabled = !input?.value.trim();
  }
}

function cerrarFormulario() {
  eventoEditando = null;
  root.querySelector("[data-event-form-panel]").hidden = true;
}

async function guardarFormulario(event) {
  event.preventDefault();
  if (!permisos.puedeEscribir || !auth.currentUser) return;
  const form = event.currentTarget;
  const errorNode = root.querySelector("[data-form-error]");
  const fechaEvento = new Date(`${form.elements.fechaEvento.value}T${form.elements.horaEvento.value || "00:00"}`);
  const fechaFin = form.elements.fechaFin.value ? new Date(`${form.elements.fechaFin.value}T23:59`) : null;
  if (!form.elements.titulo.value.trim() || Number.isNaN(fechaEvento.getTime())) {
    errorNode.textContent = "Título y fecha del evento son obligatorios.";
    return;
  }
  if (fechaFin && fechaFin < fechaEvento) {
    errorNode.textContent = "La fecha final debe ser posterior a la fecha inicial.";
    return;
  }
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Guardando…";
  errorNode.textContent = "";
  try {
    const datos = {
      titulo: form.elements.titulo.value,
      descripcion: form.elements.descripcion.value,
      fechaEvento,
      fechaFin,
      categoria: form.elements.categoria.value,
      importancia: form.elements.importancia.value,
      origen: eventoEditando?.origen || "manual",
      referenciaId: eventoEditando?.referenciaId || null,
      referenciaTipo: eventoEditando?.referenciaTipo || null
    };
    if (eventoEditando) await actualizarEventoPaciente(pacienteId, eventoEditando.id, datos, auth.currentUser.uid);
    else await crearEventoPaciente(pacienteId, datos, auth.currentUser.uid);
    eventos = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
    cerrarFormulario();
    renderizarVista();
  } catch (error) {
    errorNode.textContent = error.message || "No fue posible guardar el evento.";
    mostrarErrorTecnico(error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Guardar evento";
  }
}

async function eliminarEvento(id) {
  if (!permisos.puedeEscribir || !confirm("¿Eliminar este evento de la línea de tiempo?")) return;
  try {
    await eliminarEventoPaciente(pacienteId, id, auth.currentUser.uid);
    eventos = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
    cerrarDetalle();
    renderizarVista();
  } catch (error) {
    mostrarErrorTecnico(error);
    alert("No fue posible eliminar el evento.");
  }
}

function configurarAcciones() {
  const actionHandler = (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "back") {
      event.preventDefault();
      destruir();
      window.location.href = `paciente.html?id=${encodeURIComponent(pacienteId)}`;
    }
    if (action === "add" || action === "add-first") abrirFormulario();
    if (action === "close-form" || action === "cancel-form") cerrarFormulario();
    if (action === "close-detail") cerrarDetalle();
    if (action === "add-category") agregarCategoria();
    if (action === "retry") cargarLineaTiempo();
    if (event.target.closest("[data-edit-event]")) {
      const evento = eventos.find((item) => item.id === event.target.closest("[data-edit-event]").dataset.editEvent);
      if (evento) abrirFormulario(evento);
    }
    if (event.target.closest("[data-delete-event]")) eliminarEvento(event.target.closest("[data-delete-event]").dataset.deleteEvent);
  };
  root.addEventListener("click", actionHandler);
  const categoryInput = root.querySelector("[name='nuevaCategoria']");
  const onCategoryInput = () => { root.querySelector("[data-action='add-category']").disabled = !categoryInput.value.trim(); };
  categoryInput?.addEventListener("input", onCategoryInput);
  root.querySelector("[data-event-form]").addEventListener("submit", guardarFormulario);
  return () => {
    root.removeEventListener("click", actionHandler);
    categoryInput?.removeEventListener("input", onCategoryInput);
    root.querySelector("[data-event-form]")?.removeEventListener("submit", guardarFormulario);
  };
}

async function cargarLineaTiempo() {
  renderizarEstados(root, "loading");
  root.querySelector("[data-timeline-shell]").hidden = true;
  try {
    try {
      categorias = await cargarCategoriasLineaTiempo(auth.currentUser.uid);
    } catch (error) {
      categorias = [];
      console.warn("No se pudieron cargar las categorías de la línea de tiempo.", error?.code || error?.message || error);
    }
    renderizarCategorias();
    eventos = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
    renderizarVista();
  } catch (error) {
    renderizarEstados(root, "error", "Revisa tu conexión y vuelve a intentarlo.");
    mostrarErrorTecnico(error);
  }
}

async function inicializarLineaTiempoPaciente() {
  if (inicializado) return;
  root = document.querySelector("[data-timeline-root]");
  pacienteId = obtenerPacienteIdDesdeUrl();
  if (!root || !pacienteId || !auth.currentUser) {
    window.location.href = "paciente.html";
    return;
  }
  const acceso = await validarAccesoPaciente();
  if (!acceso) {
    renderizarEstados(root, "error", "No tienes permisos para consultar este expediente.");
    root.querySelector("[data-state-title]").textContent = "Acceso no autorizado";
    root.querySelector("[data-action='retry']").hidden = true;
    root.querySelector("[data-timeline-shell]").hidden = true;
    return;
  }
  const back = root.querySelector("[data-action='back']");
  back.href = `paciente.html?id=${encodeURIComponent(pacienteId)}`;
  root.querySelector("[data-action='add']").hidden = !permisos.puedeEscribir;
  root.querySelector("[data-action='add-first']").hidden = !permisos.puedeEscribir;
  const limpiarAcciones = configurarAcciones();
  interacciones = configurarInteracciones({
    root,
    onSelect: abrirDetalle,
    onZoom: (zoom) => { zoomActual = zoom; renderizarVista(); },
    onReset: (modo) => { zoomActual = modo === "fit" && eventos.length > 1 ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, 1.2)) : 1; renderizarVista(); }
  });
  animacion = iniciarAnimacionADN(root.querySelector("[data-timeline-dna]"));
  await cargarLineaTiempo();
  inicializado = true;
  destruir = () => {
    limpiarAcciones?.();
    interacciones?.destruir();
    animacion?.destruir();
    destruirLineaTiempoDataService();
    cancelarAuth();
    cancelarAuth = () => {};
    inicializado = false;
  };
}

export function destruirLineaTiempoPaciente() {
  destruir();
}

cancelarAuth = onAuthStateChanged(auth, () => {
  if (!auth.currentUser) {
    window.location.href = "login.html";
    return;
  }
  inicializarLineaTiempoPaciente().catch(mostrarErrorTecnico);
});
window.destruirLineaTiempoPaciente = destruirLineaTiempoPaciente;
window.addEventListener("pagehide", destruirLineaTiempoPaciente, { once: true });
