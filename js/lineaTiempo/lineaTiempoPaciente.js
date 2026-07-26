import { auth } from "../firebase.js";
import { obtenerUsuario, listarPacientes, medicoPuedeVer } from "../services/usuarios.js";
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
  formatearFecha,
  normalizarFecha,
  ordenarEventosPorFecha,
  debugTimelineRuntime,
  normalizarNombreCategoria,
  obtenerNombreCategoriaEvento,
  formatearImportanciaEvento,
  agruparEventosParaEscalaVisible
} from "./lineaTiempoUtils.js";
import { renderizarDetalleEvento, renderizarEstados, renderizarLineaTiempo } from "./lineaTiempoRenderer.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";

let root = null;
let pacienteId = "";
let eventos = [];
let categorias = [];
let usuarioActual = null;
let permisos = { puedeLeer: false, puedeEscribir: false };
let interacciones = null;
let animacion = null;
let zoomActual = 1;
let rangoTotalInicioMs = null;
let rangoTotalFinMs = null;
let rangoVisibleInicioMs = null;
let rangoVisibleFinMs = null;
let centroTemporalMs = null;
let focusRatio = 0.5;
let focusCanvasX = null;
let hasFocusMarker = false;
let selectedGroupId = null;
let gruposVisuales = new Map();
let eventoEditando = null;
let inicializado = false;
let destruir = () => {};
let cancelarAuth = () => {};
let detectorEventosClinicos = null;

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
  let paciente = null;
  try {
    paciente = await obtenerUsuario(pacienteId);
  } catch (error) {
    console.warn("No se pudo leer directamente el paciente; se usará la lista autorizada.", error?.code || error?.message || error);
  }
  if (!paciente) {
    const pacientesAutorizados = await listarPacientes(user.uid);
    pacientesAutorizados.forEach((documento) => {
      if (documento.id === pacienteId) {
        paciente = { id: documento.id, ...documento.data() };
      }
    });
  }
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
  const titulo = root.querySelector("[data-timeline-title]");
  const nombrePaciente = obtenerNombrePacienteParaMostrar(paciente);
  if (titulo && nombrePaciente) titulo.textContent = `Línea de tiempo de ${nombrePaciente}`;
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

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function sincronizarRangoTotal() {
  if (!eventos.length) return;
  rangoTotalInicioMs = eventos[0].fechaEvento.getTime();
  rangoTotalFinMs = eventos.at(-1).fechaEvento.getTime();
  if (zoomActual === 1 || rangoVisibleInicioMs === null || rangoVisibleFinMs === null) {
    rangoVisibleInicioMs = rangoTotalInicioMs;
    rangoVisibleFinMs = rangoTotalFinMs;
  }
}

function actualizarRangoVisible(zoom, focoRatio = null) {
  if (rangoTotalInicioMs === null || rangoTotalFinMs === null) return;
  const duracionTotal = Math.max(1, rangoTotalFinMs - rangoTotalInicioMs);
  const duracionVisible = Math.max(86400000, duracionTotal / zoom);
  if (zoom <= 1) {
    rangoVisibleInicioMs = rangoTotalInicioMs;
    rangoVisibleFinMs = rangoTotalFinMs;
    centroTemporalMs = null;
    return;
  }
  const duracionAnterior = Math.max(1, (rangoVisibleFinMs ?? rangoTotalFinMs) - (rangoVisibleInicioMs ?? rangoTotalInicioMs));
  const centroDesdeFoco = Number.isFinite(focoRatio)
    ? (rangoVisibleInicioMs ?? rangoTotalInicioMs) + limitar(focoRatio, 0, 1) * duracionAnterior
    : null;
  const centro = centroTemporalMs ?? centroDesdeFoco ?? rangoTotalFinMs;
  let inicio = centro - duracionVisible / 2;
  let fin = centro + duracionVisible / 2;
  if (fin > rangoTotalFinMs) {
    fin = rangoTotalFinMs;
    inicio = fin - duracionVisible;
  }
  if (inicio < rangoTotalInicioMs) {
    inicio = rangoTotalInicioMs;
    fin = inicio + duracionVisible;
  }
  rangoVisibleInicioMs = inicio;
  rangoVisibleFinMs = fin;
  centroTemporalMs = (inicio + fin) / 2;
}

function desplazarVentanaTemporal(proporcion) {
  if (zoomActual <= 1 || rangoVisibleInicioMs === null || rangoVisibleFinMs === null) return;
  const duracion = rangoVisibleFinMs - rangoVisibleInicioMs;
  const total = rangoTotalFinMs - rangoTotalInicioMs;
  let inicio = rangoVisibleInicioMs + proporcion * duracion;
  inicio = limitar(inicio, rangoTotalInicioMs, rangoTotalFinMs - duracion);
  rangoVisibleInicioMs = inicio;
  rangoVisibleFinMs = inicio + duracion;
  centroTemporalMs = inicio + duracion / 2;
}

function renderizarVista() {
  sincronizarRangoTotal();
  const rango = eventos.length ? {
    minimo: new Date(rangoVisibleInicioMs),
    maximo: new Date(rangoVisibleFinMs),
    duracion: Math.max(0, rangoVisibleFinMs - rangoVisibleInicioMs)
  } : { minimo: null, maximo: null, duracion: 0 };
  const shell = root.querySelector("[data-timeline-shell]");
  if (shell) shell.hidden = !eventos.length;
  const elementosVisuales = eventos.length ? agruparEventosParaEscalaVisible({
    eventos,
    rangoVisibleInicioMs,
    rangoVisibleFinMs,
    anchoDisponiblePx: root.querySelector("[data-timeline-scroll]")?.clientWidth || 900,
    zoom: zoomActual
  }) : [];
  gruposVisuales = new Map(elementosVisuales.filter((elemento) => elemento.tipo === "grupo").map((elemento) => [elemento.idGrupo, elemento]));
  renderizarLineaTiempo(root, eventos, rango, zoomActual, { focusRatio, focusCanvasX, hasFocusMarker, selectedGroupId, elementosVisuales });
  const viewport = root.querySelector("[data-timeline-scroll]");
  const viewportActual = document.getElementById("lineaTiempoViewport") || viewport;
  debugTimelineRuntime("viewport-after-render", {
    sameNode: viewportActual === viewport,
    connected: Boolean(viewportActual?.isConnected)
  });
  const etiqueta = root.querySelector("[data-zoom-label]");
  if (etiqueta) etiqueta.textContent = `${Math.round(zoomActual * 100)} %`;
  renderizarEstados(root, eventos.length ? "" : "empty");
  if (shell) shell.hidden = !eventos.length;
}

function buscarEvento(eventId) {
  debugTimelineRuntime("buscarEvento recibió", { eventId: eventId || null });
  return eventos.find((item) => String(item.id) === String(eventId));
}

function crearLineaResumen(etiqueta, valor) {
  const linea = document.createElement("p");
  linea.className = "timeline-event-popover__meta";
  const titulo = document.createElement("strong");
  titulo.textContent = `${etiqueta}: `;
  linea.append(titulo, document.createTextNode(valor));
  return linea;
}

function cerrarVentanaFlotanteEvento() {
  const ventana = root?.querySelector("#ventanaFlotanteEventoLineaTiempo");
  if (!ventana) return;
  ventana.hidden = true;
  ventana.replaceChildren();
  delete ventana.dataset.eventId;
}

function posicionarVentanaFlotanteEvento(ventana, marcador) {
  const viewport = root.querySelector("[data-timeline-scroll]");
  if (!viewport || !marcador) return;
  const marcadorRect = marcador.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const scrollLeft = viewport.scrollLeft;
  const margen = 12;
  const ancho = ventana.offsetWidth;
  const alto = ventana.offsetHeight;
  const minimoX = Math.max(margen, viewportRect.left + margen);
  const maximoX = Math.min(window.innerWidth - margen, viewportRect.right - margen);
  const centroMarcador = marcadorRect.left + marcadorRect.width / 2;
  const marcadorXEnContenido = centroMarcador - viewportRect.left + scrollLeft;
  let izquierda = centroMarcador + margen;
  if (izquierda + ancho > maximoX) izquierda = centroMarcador - ancho - margen;
  izquierda = Math.min(Math.max(izquierda, minimoX), Math.max(minimoX, maximoX - ancho));
  let arriba = marcadorRect.top - alto - margen;
  if (arriba < margen) arriba = marcadorRect.bottom + margen;
  ventana.style.left = `${Math.round(izquierda)}px`;
  ventana.style.top = `${Math.round(arriba)}px`;
  ventana.dataset.markerContentX = String(Math.round(marcadorXEnContenido));
}

function abrirVentanaFlotanteEvento(evento, marcador) {
  const ventana = root?.querySelector("#ventanaFlotanteEventoLineaTiempo");
  if (!ventana || !marcador) return;
  ventana.replaceChildren();
  ventana.dataset.eventId = evento.id;

  const encabezado = document.createElement("div");
  encabezado.className = "timeline-event-popover__header";
  const titulo = document.createElement("h2");
  titulo.textContent = evento.titulo || "Evento sin título";
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "timeline-button";
  cerrar.dataset.action = "close-event-popover";
  cerrar.setAttribute("aria-label", "Cerrar resumen del evento");
  cerrar.textContent = "Cerrar";
  encabezado.append(titulo, cerrar);

  const contenido = document.createElement("div");
  contenido.className = "timeline-event-popover__content";
  contenido.append(
    crearLineaResumen("Fecha", formatearFecha(evento.fechaEvento)),
    crearLineaResumen("Categoría", obtenerNombreCategoriaEvento(evento, categorias)),
    crearLineaResumen("Importancia", formatearImportanciaEvento(evento.importancia))
  );
  const descripcion = document.createElement("p");
  descripcion.className = "timeline-event-popover__description";
  descripcion.textContent = evento.descripcion?.trim() || "Sin descripción disponible.";
  contenido.appendChild(descripcion);

  const acciones = document.createElement("div");
  acciones.className = "timeline-event-popover__actions";
  const detalles = document.createElement("button");
  detalles.type = "button";
  detalles.className = "timeline-button";
  detalles.dataset.action = "event-popover-details";
  detalles.textContent = "Ver detalles";
  acciones.appendChild(detalles);
  if (permisos.puedeEscribir) {
    const editar = document.createElement("button");
    editar.type = "button";
    editar.className = "timeline-button";
    editar.dataset.editEvent = evento.id;
    editar.textContent = "Editar";
    const eliminar = document.createElement("button");
    eliminar.type = "button";
    eliminar.className = "timeline-button timeline-button--danger";
    eliminar.dataset.deleteEvent = evento.id;
    eliminar.textContent = "Eliminar";
    acciones.append(editar, eliminar);
  }
  ventana.append(encabezado, contenido, acciones);
  ventana.hidden = false;
  posicionarVentanaFlotanteEvento(ventana, marcador);
}

function seleccionarGrupoLineaTiempo(idGrupo, marcador) {
  const grupo = gruposVisuales.get(idGrupo);
  if (!grupo) return;
  const ventana = root.querySelector("#ventanaFlotanteEventoLineaTiempo");
  if (!ventana) return;
  ventana.replaceChildren();
  ventana.dataset.visualGroupId = idGrupo;
  const encabezado = document.createElement("div");
  encabezado.className = "timeline-event-popover__header";
  const titulo = document.createElement("h2");
  titulo.textContent = `Eventos de ${grupo.etiquetaPeriodo}`;
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "timeline-button";
  cerrar.dataset.action = "close-event-popover";
  cerrar.textContent = "Cerrar";
  encabezado.append(titulo, cerrar);
  const lista = document.createElement("div");
  lista.className = "timeline-event-popover__group-list";
  grupo.items.forEach((evento) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "timeline-event-popover__group-item";
    boton.dataset.action = "open-event-from-group";
    boton.dataset.eventId = evento.id;
    boton.textContent = `${formatearFecha(evento.fechaEvento)} — ${evento.titulo || "Evento sin título"}`;
    lista.appendChild(boton);
  });
  ventana.append(encabezado, lista);
  ventana.hidden = false;
  posicionarVentanaFlotanteEvento(ventana, marcador);
}

function seleccionarEventoLineaTiempo(eventId, marcador) {
  debugTimelineRuntime("seleccionarEventoLineaTiempo recibió", { eventId: eventId || null });
  const evento = buscarEvento(eventId);
  debugTimelineRuntime("D-event-search", {
    requestedId: eventId || null,
    totalEvents: eventos.length,
    found: Boolean(evento)
  });
  if (!evento) {
    console.warn("El marcador seleccionado no contiene un evento valido.");
    return;
  }
  centroTemporalMs = evento.fechaEvento.getTime();
  abrirVentanaFlotanteEvento(evento, marcador);
}

function abrirDetalle(seleccion) {
  const evento = buscarEvento(seleccion.eventoId);
  if (!evento) {
    console.warn("El marcador seleccionado no contiene un evento valido.");
    return;
  }
  selectedGroupId = seleccion.grupoId || null;
  renderizarDetalleEvento(root, eventos, seleccion.eventoId, seleccion.grupoId, categorias);
  root.querySelectorAll("[data-event-id]").forEach((card) => {
    const acciones = card.querySelector(".timeline-detail-event__actions");
    if (!acciones || !permisos.puedeEscribir) return;
    const id = card.dataset.eventId;
    acciones.innerHTML = `<button type="button" class="timeline-button" data-edit-event="${id}">Editar</button><button type="button" class="timeline-button timeline-button--danger" data-delete-event="${id}">Eliminar</button>`;
  });
  requestAnimationFrame(() => {
    root.querySelector("[data-event-detail]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  renderizarCategorias(obtenerIdCategoriaEvento(evento));
  form.elements.importancia.value = evento?.importancia || "media";
  root.querySelector("[data-form-error]").textContent = "";
  panel.hidden = false;
  form.elements.titulo.focus();
}

function obtenerIdCategoriaEvento(evento) {
  if (!evento) return "";
  if (evento.categoriaId && categorias.some((categoria) => String(categoria.id) === String(evento.categoriaId))) {
    return String(evento.categoriaId);
  }
  const nombre = obtenerNombreCategoriaEvento(evento, categorias);
  const categoriaCompatible = categorias.find((categoria) =>
    normalizarNombreCategoria(categoria.nombre) === normalizarNombreCategoria(nombre)
  );
  return categoriaCompatible?.id || "";
}

function renderizarCategorias(seleccion = "") {
  const select = root?.querySelector("[name='categoria']");
  if (!select) return;
  const categoriasActivas = categorias
    .filter((categoria) => categoria.activa !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  select.replaceChildren(new Option("Ninguna categoría", ""));
  categoriasActivas.forEach((categoria) => select.add(new Option(categoria.nombre, categoria.id)));
  const categoriaSeleccionada = categorias.find((categoria) => String(categoria.id) === String(seleccion));
  select.value = categoriaSeleccionada?.id || "";
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
    renderizarCategorias(categoria.id);
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
    const categoriaId = form.elements.categoria.value || null;
    const categoriaNombre = categoriaId
      ? form.elements.categoria.selectedOptions[0]?.textContent?.trim() || ""
      : "";
    const datos = {
      titulo: form.elements.titulo.value,
      descripcion: form.elements.descripcion.value,
      fechaEvento,
      fechaFin,
      categoriaId,
      categoriaNombre,
      categoria: categoriaNombre,
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
    cerrarVentanaFlotanteEvento();
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
    if (action === "close-event-popover") cerrarVentanaFlotanteEvento();
    if (action === "event-popover-details") {
      const eventId = root.querySelector("#ventanaFlotanteEventoLineaTiempo")?.dataset.eventId || "";
      const evento = buscarEvento(eventId);
      if (evento) {
        cerrarVentanaFlotanteEvento();
        abrirDetalle({ eventoId: evento.id, grupoId: "" });
      }
    }
    if (action === "open-event-from-group") {
      const eventId = event.target.closest("[data-event-id]")?.dataset.eventId || "";
      const evento = buscarEvento(eventId);
      const idGrupo = root.querySelector("#ventanaFlotanteEventoLineaTiempo")?.dataset.visualGroupId;
      const marcador = idGrupo ? root.querySelector(`[data-visual-group-id="${CSS.escape(idGrupo)}"]`) : null;
      if (evento && marcador) abrirVentanaFlotanteEvento(evento, marcador);
    }
    if (action === "add-category") agregarCategoria();
    if (action === "retry") cargarLineaTiempo();
    if (event.target.closest("[data-edit-event]")) {
      const evento = eventos.find((item) => item.id === event.target.closest("[data-edit-event]").dataset.editEvent);
      if (evento) abrirFormulario(evento);
    }
    if (event.target.closest("[data-delete-event]")) eliminarEvento(event.target.closest("[data-delete-event]").dataset.deleteEvent);
  };
  root.addEventListener("click", actionHandler);
  const cerrarAlHacerClickFuera = (event) => {
    const ventana = root.querySelector("#ventanaFlotanteEventoLineaTiempo");
    if (!ventana || ventana.hidden) return;
    if (event.target.closest(".timeline-event__marker, #ventanaFlotanteEventoLineaTiempo")) return;
    cerrarVentanaFlotanteEvento();
  };
  const cerrarConEscape = (event) => {
    if (event.key === "Escape") cerrarVentanaFlotanteEvento();
  };
  document.addEventListener("pointerdown", cerrarAlHacerClickFuera, true);
  document.addEventListener("keydown", cerrarConEscape);
  const categoryInput = root.querySelector("[name='nuevaCategoria']");
  const onCategoryInput = () => { root.querySelector("[data-action='add-category']").disabled = !categoryInput.value.trim(); };
  categoryInput?.addEventListener("input", onCategoryInput);
  root.querySelector("[data-event-form]").addEventListener("submit", guardarFormulario);
  return () => {
    root.removeEventListener("click", actionHandler);
    document.removeEventListener("pointerdown", cerrarAlHacerClickFuera, true);
    document.removeEventListener("keydown", cerrarConEscape);
    categoryInput?.removeEventListener("input", onCategoryInput);
    root.querySelector("[data-event-form]")?.removeEventListener("submit", guardarFormulario);
  };
}

async function cargarLineaTiempo() {
  renderizarEstados(root, "loading");
  root.querySelector("[data-timeline-shell]").hidden = true;
  try {
    const [resultadoEventos, resultadoCategorias] = await Promise.allSettled([
      cargarEventosPaciente(pacienteId),
      cargarCategoriasLineaTiempo(auth.currentUser.uid)
    ]);
    if (resultadoEventos.status === "rejected") throw resultadoEventos.reason;
    eventos = ordenarEventosPorFecha(resultadoEventos.value).filter((evento) => {
      if (!evento?.id) {
        console.warn("[Timeline 1.15] Evento omitido sin ID.");
        return false;
      }
      if (!(evento.fechaEvento instanceof Date) || Number.isNaN(evento.fechaEvento.getTime())) {
        console.warn("[Timeline 1.15] Evento omitido con fecha invÃ¡lida.");
        return false;
      }
      return true;
    });
    categorias = resultadoCategorias.status === "fulfilled" ? resultadoCategorias.value : [];
    if (resultadoCategorias.status === "rejected") {
      console.warn("No se pudieron cargar las categorÃ­as de la lÃ­nea de tiempo.", resultadoCategorias.reason?.code || resultadoCategorias.reason?.message || resultadoCategorias.reason);
    }
    renderizarCategorias();
    renderizarVista();
    return;
    /* Legacy sequential loading removed: events and categories are isolated above. */
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

async function inicializarDetectorEventosClinicos() {
  if (detectorEventosClinicos || !root || !pacienteId || !auth.currentUser) return;
  try {
    const detector = await import("./deteccionEventos/deteccionEventosClinicos.js");
    detectorEventosClinicos = await detector.inicializarDeteccionEventosClinicos({
      root,
      pacienteId,
      usuarioUid: auth.currentUser.uid,
      permisos,
      obtenerEventosExistentes: () => eventos,
      onEventoCreado: async () => {
        eventos = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
        renderizarVista();
      }
    });
  } catch (error) {
    console.warn("[Timeline] No se pudo cargar el detector de eventos clinicos.", error?.code || error?.message || error);
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
    onSelect: (eventId, marcador) => seleccionarEventoLineaTiempo(eventId, marcador),
    onSelectGroup: (idGrupo, marcador) => seleccionarGrupoLineaTiempo(idGrupo, marcador),
    onClearSelection: () => { selectedGroupId = null; cerrarDetalle(); },
    onFocus: ({ focusRatio: ratio, focusCanvasX: canvasX, hasFocusMarker: markerVisible }) => {
      focusRatio = ratio;
      if (rangoVisibleInicioMs !== null && rangoVisibleFinMs !== null) {
        centroTemporalMs = rangoVisibleInicioMs + ratio * (rangoVisibleFinMs - rangoVisibleInicioMs);
      }
      focusCanvasX = canvasX;
      hasFocusMarker = markerVisible;
      const marcador = root.querySelector("[data-timeline-focus-marker]");
      if (marcador) {
        marcador.hidden = !markerVisible;
        if (markerVisible && Number.isFinite(canvasX)) marcador.style.left = `${canvasX}px`;
      }
    },
    onZoom: (zoom, ratio, _grupoId, _hasMarker, tieneFocoTemporal) => { zoomActual = zoom; actualizarRangoVisible(zoom, tieneFocoTemporal ? ratio : null); renderizarVista(); },
    onPan: (proporcion) => { desplazarVentanaTemporal(proporcion); renderizarVista(); },
    onReset: () => { zoomActual = 1; actualizarRangoVisible(1); renderizarVista(); }
  });
  animacion = iniciarAnimacionADN(root.querySelector("[data-timeline-dna]"));
  await cargarLineaTiempo();
  await inicializarDetectorEventosClinicos();
  inicializado = true;
  destruir = () => {
    limpiarAcciones?.();
    interacciones?.destruir();
    animacion?.destruir();
    detectorEventosClinicos?.destruir?.();
    detectorEventosClinicos = null;
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
