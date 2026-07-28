import { auth, db } from "../firebase.js";
import { obtenerUsuario, listarPacientes, medicoPuedeVer } from "../services/usuarios.js";
import { registrarEventoAuditoria } from "../services/auditoria.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
  obtenerEtiquetaOrigenEvento,
  formatearImportanciaEvento,
  agruparEventosParaEscalaVisible
} from "./lineaTiempoUtils.js";
import { renderizarDetalleEvento, renderizarEstados, renderizarLineaTiempo } from "./lineaTiempoRenderer.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";
import {
  DETECTED_EVENTS_DEBUG_LABEL,
  ESTADOS_DETECCION_EVENTOS,
  crearFuenteClinicaComun,
  detectarEventosEnFuentes,
  fechaISO as fechaISOEventoDetectado,
  hashDeteccionEstable,
  fuenteEsNarrativaAnalizable,
  normalizarTipoOrigenDeteccion,
  normalizarTextoDeteccion as normalizarTextoEventoDetectado
} from "./lineaTiempoDeteccionEventos.js";

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
  const origenDetectado = obtenerEtiquetaOrigenEvento(evento);
  if (origenDetectado) {
    contenido.appendChild(crearLineaResumen("Origen", origenDetectado));
  }

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
      referenciaTipo: eventoEditando?.referenciaTipo || null,
      detectedEventId: eventoEditando?.detectedEventId || null,
      deteccionId: eventoEditando?.deteccionId || null,
      sourceType: eventoEditando?.sourceType || null,
      sourceId: eventoEditando?.sourceId || null,
      sourceLabel: eventoEditando?.sourceLabel || null,
      sourceDate: eventoEditando?.sourceDate || null
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

const ESTADOS_DETECCION = Object.freeze({ pendiente: "pendiente", aceptado: "aceptado", descartado: "descartado", obsoleto: "obsoleto" });
const PATRON_TEMPORAL_DETECCION = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|[a-záéíóúñ]+\s+de\s+\d{4}|(?:en|desde|alrededor de)\s+\d{4}|(?:ayer|anteayer|la semana pasada|el mes pasado|el año pasado|el ano pasado)|(?:desde\s+)?(?:aproximadamente\s+)?hace\s+(?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:día|dias|días|semana|semanas|mes|meses|año|años|ano|anos)|(?:a los|desde los)\s+\d{1,2}\s+años|infancia|adolescencia|desde joven|desde pequeño|desde pequeno)\b/i;
const PATRON_RELEVANCIA_DETECCION = /\b(ingres|internad|hospitaliz|alta|urgencia|crisis|intento suicida|suicid|autoles|violencia|diagnostic|tratamiento|medicamento|suspend|inici|resonancia|tomografia|laboratorio|gabinete|estudio|cirugia|enfermedad|consumo|alcohol|cocaina|metanfetamina|cannabis|recaid|trauma|fallec|murio|muerte|embarazo|parto|legal|aislamiento|insomnio|ansiedad|depres)/i;
const PATRON_NEGACION_DETECCION = /\b(niega|niegan|no ha presentado|no presenta|sin antecedente|se descarto|descarta|no refiere|niega antecedente)\b/i;
const PATRON_FUTURO_DETECCION = /\b(se considerara|si empeora|proxima consulta|se hospitalizara|se programo|se indicara)\b/i;
const MESES_DETECCION = new Map([["enero",0],["febrero",1],["marzo",2],["abril",3],["mayo",4],["junio",5],["julio",6],["agosto",7],["septiembre",8],["setiembre",8],["octubre",9],["noviembre",10],["diciembre",11]]);
const NUMEROS_DETECCION = new Map([["un",1],["una",1],["dos",2],["tres",3],["cuatro",4],["cinco",5],["seis",6],["siete",7],["ocho",8],["nueve",9],["diez",10],["once",11],["doce",12]]);

function refEventosDetectados() {
  return collection(db, "pacientes", pacienteId, "eventosDetectados");
}

function normalizarTextoDeteccion(texto = "") {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es-MX");
}

function fechaISO(fecha) {
  if (!fecha) return null;
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
}

function fechaLocalISO(iso = "") {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

async function hashDeteccion(texto = "") {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(texto || "")));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fechaDocDeteccion(datos = {}) {
  for (const valor of [datos.fechaNota, datos.fecha, datos.fechaNotaDefinitiva, datos.fechaCreacion, datos.createdAt, datos.creadoEn, datos.fechaActualizacion, datos.fechaInicio]) {
    const fecha = normalizarFecha(valor);
    if (fecha) return fecha;
  }
  return new Date();
}

function resolverFechaDetectada(expresion = "", fechaReferencia = new Date(), fechaNacimiento = null) {
  const texto = normalizarTextoDeteccion(expresion);
  let m = texto.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m) return { fechaInicioISO: fechaISO(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false };
  m = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { fechaInicioISO: fechaISO(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false };
  m = texto.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (m && MESES_DETECCION.has(m[2])) return { fechaInicioISO: fechaISO(new Date(Number(m[3]), MESES_DETECCION.get(m[2]), Number(m[1]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false };
  m = texto.match(/\b([a-z]+)\s+de\s+(\d{4})\b/);
  if (m && MESES_DETECCION.has(m[1])) return { fechaInicioISO: fechaISO(new Date(Number(m[2]), MESES_DETECCION.get(m[1]), 1, 12)), precisionTemporal: "mes", requiereRevisionFecha: true };
  m = texto.match(/\b(?:en|desde|alrededor de)\s+(\d{4})\b/);
  if (m) return { fechaInicioISO: `${m[1]}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true };
  if (texto.includes("ayer")) return { fechaInicioISO: fechaISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), fechaReferencia.getDate() - 1, 12)), precisionTemporal: "dia", requiereRevisionFecha: true };
  if (texto.includes("anteayer")) return { fechaInicioISO: fechaISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), fechaReferencia.getDate() - 2, 12)), precisionTemporal: "dia", requiereRevisionFecha: true };
  if (texto.includes("semana pasada")) return { fechaInicioISO: fechaISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), fechaReferencia.getDate() - 7, 12)), precisionTemporal: "semana", requiereRevisionFecha: true };
  if (texto.includes("mes pasado")) return { fechaInicioISO: fechaISO(new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() - 1, 1, 12)), precisionTemporal: "mes", requiereRevisionFecha: true };
  if (texto.includes("ano pasado") || texto.includes("año pasado")) return { fechaInicioISO: `${fechaReferencia.getFullYear() - 1}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true };
  m = texto.match(/\bhace\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(dia|dias|semana|semanas|mes|meses|ano|anos|año|años)\b/);
  if (m) {
    const cantidad = Number(m[1]) || NUMEROS_DETECCION.get(m[1]) || 1;
    const unidad = m[2];
    const fecha = new Date(fechaReferencia);
    if (unidad.startsWith("dia")) fecha.setDate(fecha.getDate() - cantidad);
    else if (unidad.startsWith("semana")) fecha.setDate(fecha.getDate() - cantidad * 7);
    else if (unidad.startsWith("mes")) fecha.setMonth(fecha.getMonth() - cantidad);
    else fecha.setFullYear(fecha.getFullYear() - cantidad);
    return { fechaInicioISO: fechaISO(fecha), precisionTemporal: unidad.startsWith("dia") ? "dia" : unidad.startsWith("semana") ? "semana" : unidad.startsWith("mes") ? "mes" : "anio", requiereRevisionFecha: true };
  }
  m = texto.match(/\b(?:a los|desde los)\s+(\d{1,2})\s+anos\b/);
  if (m && fechaNacimiento) return { fechaInicioISO: `${fechaNacimiento.getFullYear() + Number(m[1])}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true };
  return { fechaInicioISO: null, precisionTemporal: "indeterminada", requiereRevisionFecha: true };
}

function tituloDetectado(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/madre|padre|herman|familiar/.test(texto) && /fallec|murio|muerte/.test(texto)) return "Fallecimiento de familiar";
  if (/intento suicida|suicid/.test(texto)) return "Intento suicida";
  if (/hospitaliz|internad|ingres/.test(texto)) return "Hospitalizacion o ingreso";
  if (/diagnostic/.test(texto)) return "Diagnostico referido";
  if (/tratamiento|medicamento|suspend|inici/.test(texto)) return "Cambio de tratamiento";
  if (/resonancia|tomografia|laboratorio|gabinete|estudio/.test(texto)) return "Estudio clinico";
  if (/consumo|alcohol|cocaina|metanfetamina|cannabis|tabaco/.test(texto)) return "Consumo de sustancias";
  return "Evento clinico detectado";
}

function categoriaDetectada(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/hospitaliz|internad|ingres/.test(texto)) return "hospitalizacion";
  if (/intento suicida|suicid/.test(texto)) return "intento_suicida";
  if (/diagnostic/.test(texto)) return "diagnostico";
  if (/tratamiento|medicamento|suspend/.test(texto)) return "cambio_tratamiento";
  if (/resonancia|tomografia|laboratorio|gabinete|estudio/.test(texto)) return "estudio_gabinete";
  return null;
}

function asegurarSeccionDeteccion() {
  let seccion = root.querySelector("[data-detected-events-section]");
  if (seccion) return seccion;
  seccion = document.createElement("section");
  seccion.className = "timeline-detected";
  seccion.dataset.detectedEventsSection = "";
  seccion.innerHTML = `<header class="timeline-detected__header"><button type="button" class="timeline-detected__toggle" data-action="toggle-detected-events" aria-expanded="false"><span>Eventos detectados</span><strong data-detected-count>0 pendientes</strong></button><div class="timeline-detected__actions"><select class="timeline-detected__filter" data-detected-filter aria-label="Filtrar eventos detectados"><option value="todos">Todos</option><option value="notas">Notas</option><option value="historia">Historia clinica</option><option value="estudios">Estudios</option><option value="alta">Alta confianza</option><option value="revision">Revision adicional</option><option value="sin_fecha">Sin fecha definida</option></select><button type="button" class="timeline-button timeline-button--primary" data-action="search-detected-events">Buscar nuevos eventos</button><button type="button" class="timeline-button" data-action="reanalyze-detected-events">Volver a analizar fuentes</button><button type="button" class="timeline-button" data-action="toggle-discarded-events">Mostrar descartados</button></div></header><p class="timeline-detected__progress" data-detected-progress hidden></p><p class="timeline-detected__status" data-detected-status>No se han buscado eventos nuevos.</p><div class="timeline-detected__body" data-detected-body hidden></div>`;
  root.querySelector("[data-timeline-shell]")?.after(seccion);
  return seccion;
}

function aplicarFiltroSugerenciasDeteccion(sugerencias = [], filtro = "todos") {
  if (filtro === "notas") return sugerencias.filter((s) => s.origenTipo === "nota");
  if (filtro === "historia") return sugerencias.filter((s) => s.origenTipo === "historia_clinica" || s.origenTipo === "paciente");
  if (filtro === "estudios") return sugerencias.filter((s) => s.origenTipo === "estudio");
  if (filtro === "alta") return sugerencias.filter((s) => s.nivelConfianza === "alta" || Number(s.confianza || 0) >= 0.85);
  if (filtro === "revision") return sugerencias.filter((s) => s.nivelConfianza === "baja" || Number(s.confianza || 0) < 0.6 || s.requiereRevisionFecha === true);
  if (filtro === "sin_fecha") return sugerencias.filter((s) => !s.fechaInicioISO);
  return sugerencias;
}

function estadoCompatibleSugerencia(sugerencia = {}) {
  const estado = String(sugerencia.estado || sugerencia.status || "").trim().toLowerCase();
  if (estado === "aceptada" || estado === "agregado" || estado === "agregada") return ESTADOS_DETECCION.aceptado;
  if (estado === "descartada" || estado === "rechazado" || estado === "rechazada") return ESTADOS_DETECCION.descartado;
  if (estado === "obsoleta" || estado === "obsoleto") return ESTADOS_DETECCION.obsoleto;
  return ESTADOS_DETECCION[estado] || ESTADOS_DETECCION.pendiente;
}

const TIPOS_ORIGEN_ESTRUCTURADO_EXCLUIDO = new Set([
  "diagnostico",
  "diagnosticos",
  "diagnosticos_activos",
  "diagnosticos_paciente",
  "cie10",
  "cie11",
  "dsm5",
  "tratamiento",
  "tratamientos",
  "medicamento",
  "medicamentos",
  "indicacion",
  "indicaciones",
  "receta",
  "recetas",
  "prescripcion",
  "prescripciones"
]);

function sugerenciaProvieneDeOrigenEstructuradoExcluido(sugerencia = {}) {
  const tipo = normalizarTipoOrigenDeteccion(sugerencia.origenTipo || sugerencia.sourceType || sugerencia.referenciaTipo || "");
  const subtipo = normalizarTipoOrigenDeteccion(sugerencia.origenSubtipo || sugerencia.sourceLabel || "");
  return TIPOS_ORIGEN_ESTRUCTURADO_EXCLUIDO.has(tipo) || TIPOS_ORIGEN_ESTRUCTURADO_EXCLUIDO.has(subtipo) || sugerencia.ocultaPorOrigenEstructurado === true || sugerencia.origenDeteccion === "estructurado_excluido";
}

const MESES_ETIQUETA_DETECCION = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function etiquetaFechaSugerenciaDetectada(sugerencia = {}) {
  if (sugerencia.etiquetaTemporal && !/pendiente/i.test(sugerencia.etiquetaTemporal)) return sugerencia.etiquetaTemporal;
  const fecha = String(sugerencia.fechaInicioISO || "").slice(0, 10);
  if (!fecha) return "Fecha pendiente de confirmar";
  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (sugerencia.precisionTemporal === "anio") return String(anio);
  if (sugerencia.precisionTemporal === "periodo_anual") return sugerencia.etiquetaTemporal || `Periodo de ${anio}`;
  if (sugerencia.precisionTemporal === "mes") return `${MESES_ETIQUETA_DETECCION[(mes || 1) - 1]} de ${anio}`;
  if (sugerencia.precisionTemporal === "semana") return `Semana del ${fecha}`;
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${anio}`;
}

function etiquetaCertezaSugerenciaDetectada(sugerencia = {}) {
  if (!sugerencia.fechaInicioISO) return "Fecha pendiente de confirmar";
  if (sugerencia.precisionTemporal === "anio") return "Fecha aproximada al año";
  if (sugerencia.precisionTemporal === "mes") return "Fecha aproximada al mes";
  if (sugerencia.precisionTemporal === "periodo_anual") return "Fecha aproximada: periodo del año";
  if (sugerencia.precisionTemporal === "semana") return "Fecha aproximada";
  return sugerencia.fechaEsAproximada || sugerencia.requiereRevisionFecha ? "Fecha aproximada" : "Fecha exacta";
}

function etiquetaReferenciasSugerenciaDetectada(sugerencia = {}) {
  const refs = Array.isArray(sugerencia.referenciasOrigen) ? sugerencia.referenciasOrigen : [];
  return refs.length > 1 ? `Detectado en ${refs.length} referencias` : "";
}

function renderizarSugerenciasDeteccion(sugerencias = [], mostrarDescartados = false, abierto = false, filtro = "todos") {
  const seccion = asegurarSeccionDeteccion();
  const sugerenciasDisponibles = filtrarEventosDetectadosDisponibles(sugerencias, eventos, mostrarDescartados);
  const filtradas = aplicarFiltroSugerenciasDeteccion(sugerenciasDisponibles, filtro);
  const pendientes = sugerenciasDisponibles.filter((s) => s.estado === ESTADOS_DETECCION.pendiente);
  seccion.querySelector("[data-detected-count]").textContent = `${pendientes.length} pendientes`;
  const body = seccion.querySelector("[data-detected-body]");
  body.hidden = !(abierto || pendientes.length);
  body.replaceChildren();
  filtradas.forEach((s) => {
    const card = document.createElement("article");
    card.className = `timeline-detected-card timeline-detected-card--${s.estado}`;
    card.dataset.detectedId = s.id;
    card.innerHTML = `<div class="timeline-detected-card__meta"><span>Evento detectado</span><span>${s.estado}</span></div><label>Titulo sugerido <input data-detected-field="titulo" maxlength="160"></label><div class="timeline-detected-card__grid"><label>Fecha <input data-detected-field="fechaInicioISO" type="date"></label><label>Fecha final <input data-detected-field="fechaFinISO" type="date"></label><label>Importancia <select data-detected-field="importancia"><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label></div><label>Descripcion <textarea data-detected-field="descripcion" maxlength="1200" rows="3"></textarea></label><p class="timeline-detected-card__date">${s.fechaInicioISO || "Fecha pendiente de confirmar"} · ${s.precisionTemporal || "indeterminada"}${s.requiereRevisionFecha ? " · Fecha aproximada" : ""}</p><p class="timeline-detected-card__source">Fuente: ${s.origenSubtipo || s.origenTipo || "fuente clinica"} · Sujeto: ${s.sujeto || "paciente"}</p>${s.posibleDuplicadoEventoId ? '<p class="timeline-detected-card__warning">Posible duplicado de un evento ya agregado.</p>' : ""}<details class="timeline-detected-card__fragment"><summary>Fragmento donde se detecto</summary><p></p></details><p class="timeline-form-error" data-detected-error role="alert"></p><div class="timeline-detected-card__actions"></div>`;
    card.querySelector("[data-detected-field='titulo']").value = s.tituloSugerido || "";
    card.querySelector("[data-detected-field='fechaInicioISO']").value = s.fechaInicioISO || "";
    card.querySelector("[data-detected-field='fechaFinISO']").value = s.fechaFinISO || "";
    card.querySelector("[data-detected-field='importancia']").value = s.importanciaSugerida || "media";
    card.querySelector("[data-detected-field='descripcion']").value = s.descripcionSugerida || "";
    const fechaResumen = card.querySelector(".timeline-detected-card__date");
    if (fechaResumen) fechaResumen.textContent = etiquetaFechaSugerenciaDetectada(s);
    const precisionCampo = document.createElement("p");
    precisionCampo.className = "timeline-detected-card__precision";
    precisionCampo.textContent = `Precisión: ${s.precisionTemporal || "indeterminada"}`;
    card.querySelector(".timeline-detected-card__grid")?.after(precisionCampo);
    const etiquetaFuente = [s.sourceLabel || s.origenSubtipo || s.origenTipo || "fuente clinica", s.origenSeccion].filter(Boolean).join(", ");
    const fuenteNodo = card.querySelector(".timeline-detected-card__source");
    if (fuenteNodo) fuenteNodo.textContent = `Detectado en: ${etiquetaFuente}${s.origenFechaISO ? ` del ${s.origenFechaISO}` : ""} · ${s.origenDeteccion || "narrativo"} · Sujeto: ${s.sujeto || "paciente"}`;
    const certeza = document.createElement("p");
    certeza.className = "timeline-detected-card__certainty";
    certeza.textContent = `${etiquetaCertezaSugerenciaDetectada(s)}${s.requiereRevisionClinica ? " · Interpretacion clinica pendiente de revision" : ""}`;
    fuenteNodo?.before(certeza);
    const referencias = etiquetaReferenciasSugerenciaDetectada(s);
    if (referencias && fuenteNodo) {
      const refs = document.createElement("p");
      refs.className = "timeline-detected-card__references";
      refs.textContent = referencias;
      fuenteNodo.before(refs);
    }
    const resumenFragmento = card.querySelector(".timeline-detected-card__fragment summary");
    if (resumenFragmento) resumenFragmento.textContent = "Fragmento clinico de soporte";
    card.querySelector(".timeline-detected-card__fragment p").textContent = s.fragmentoSoporte || "";
    const acciones = card.querySelector(".timeline-detected-card__actions");
    if (s.estado === ESTADOS_DETECCION.descartado && !sugerenciaProvieneDeOrigenEstructuradoExcluido(s)) acciones.innerHTML = '<button type="button" class="timeline-button" data-action="restore-detected-event">Restaurar</button>';
    else if (s.estado === ESTADOS_DETECCION.descartado) acciones.innerHTML = '<p class="timeline-detected-card__warning">Esta sugerencia ya no es compatible con los criterios actuales.</p>';
    else if (s.estado === ESTADOS_DETECCION.pendiente) acciones.innerHTML = '<button type="button" class="timeline-button timeline-button--primary" data-action="accept-detected-event">Añadir a la línea de tiempo</button><button type="button" class="timeline-button" data-action="discard-detected-event">Descartar</button><button type="button" class="timeline-button" data-action="view-detected-origin">Ver origen</button>';
    else acciones.innerHTML = '<button type="button" class="timeline-button" data-action="view-detected-origin">Ver origen</button>';
    if (s.estado === ESTADOS_DETECCION.pendiente) {
      const regenerar = document.createElement("button");
      regenerar.type = "button";
      regenerar.className = "timeline-button";
      regenerar.dataset.action = "regenerate-detected-event";
      regenerar.textContent = "Regenerar propuesta";
      acciones.querySelector("[data-action='discard-detected-event']")?.before(regenerar);
    }
    body.append(card);
  });
}

async function cargarSugerenciasDetectadas() {
  const snap = await getDocs(refEventosDetectados());
  const sugerenciasCargadas = snap.docs.map((d) => {
    const datos = d.data();
    const sugerencia = { id: d.id, ...datos, estado: estadoCompatibleSugerencia(datos) };
    if (sugerencia.estado !== ESTADOS_DETECCION.aceptado && sugerenciaProvieneDeOrigenEstructuradoExcluido(sugerencia)) {
      sugerencia.estado = ESTADOS_DETECCION.obsoleto;
      sugerencia.ocultaPorOrigenEstructurado = true;
      sugerencia.origenDeteccion = "estructurado_excluido";
    }
    return sugerencia;
  });
  const obsoletasPorMarcar = sugerenciasCargadas.filter((s) => s.ocultaPorOrigenEstructurado === true && s.estado === ESTADOS_DETECCION.obsoleto);
  await Promise.allSettled(obsoletasPorMarcar.map((s) => updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", s.id), {
    estado: ESTADOS_DETECCION.obsoleto,
    ocultaPorOrigenEstructurado: true,
    origenDeteccion: "estructurado_excluido",
    actualizadoPorCriterio: "exclusion_origen_estructurado_1_31"
  })));
  return sugerenciasCargadas;
}

function obtenerDetectedEventIdSugerencia(sugerencia = {}) {
  return String(sugerencia.detectedEventId || sugerencia.hashConceptual || sugerencia.deteccionId || sugerencia.id || "").trim();
}

function obtenerDetectedEventIdEvento(evento = {}) {
  return String(evento.detectedEventId || evento.deteccionId || "").trim();
}

function obtenerClavesDeteccionSugerencia(sugerencia = {}) {
  return [sugerencia.detectedEventId, sugerencia.hashConceptual, sugerencia.deteccionId, sugerencia.id]
    .map((valor) => String(valor || "").trim())
    .filter(Boolean);
}

function obtenerClavesDeteccionEvento(evento = {}) {
  return [evento.detectedEventId, evento.deteccionId]
    .map((valor) => String(valor || "").trim())
    .filter(Boolean);
}

function filtrarEventosDetectadosDisponibles(eventosDetectados = [], eventosLineaTiempo = [], mostrarDescartados = false) {
  const idsRegistrados = new Set(eventosLineaTiempo.flatMap(obtenerClavesDeteccionEvento));
  const eventosDisponibles = eventosDetectados
    .filter((sugerencia) => sugerencia.estado !== ESTADOS_DETECCION.obsoleto && !sugerenciaProvieneDeOrigenEstructuradoExcluido(sugerencia))
    .filter((sugerencia) => mostrarDescartados || (sugerencia.estado !== ESTADOS_DETECCION.descartado && sugerencia.estado !== ESTADOS_DETECCION.aceptado))
    .filter((sugerencia) => !obtenerClavesDeteccionSugerencia(sugerencia).some((id) => idsRegistrados.has(id)))
    .map((sugerencia) => sugerencia);
  console.debug("[Eventos detectados] Filtrado", {
    totalDetectados: eventosDetectados.length,
    totalYaRegistrados: idsRegistrados.size,
    totalDisponibles: eventosDisponibles.length
  });
  return eventosDisponibles;
}

async function obtenerFragmentosClinicosDeteccion() {
  const [{ obtenerUsuario }, { obtenerHistorialNotas }, { obtenerHistoriaClinica }] = await Promise.all([
    import("../services/usuarios.js"),
    import("../services/notas.js"),
    import("../services/historias.js")
  ]);
  const paciente = await obtenerUsuario(pacienteId);
  const fechaNacimiento = normalizarFecha(paciente?.fechaNacimiento);
  const fragmentos = [];
  const agregar = async ({ texto, origenTipo, origenSubtipo, origenId, fecha }) => {
    const limpio = String(texto || "").replace(/\s+/g, " ").trim();
    if (!limpio) return;
    fragmentos.push({ texto: limpio.slice(0, 1800), origenTipo, origenSubtipo, origenId, fechaDocumento: fecha || new Date(), hashFragmento: await hashDeteccion(`${origenTipo}|${origenId}|${limpio}`) });
  };
  await agregar({ texto: [paciente?.padecimientoActual, paciente?.antecedentes, paciente?.diagnostico].filter(Boolean).join(". "), origenTipo: "paciente", origenSubtipo: "datos_clinicos", origenId: pacienteId, fecha: fechaDocDeteccion(paciente) });
  try {
    const historia = await obtenerHistoriaClinica(pacienteId);
    if (historia.exists()) await agregar({ texto: Object.values(historia.data()).filter((v) => typeof v === "string").join(". "), origenTipo: "historia_clinica", origenSubtipo: "historia_inicial", origenId: historia.id, fecha: fechaDocDeteccion(historia.data()) });
  } catch { /* fuente sin permiso o inexistente */ }
  try {
    const notas = await obtenerHistorialNotas(pacienteId);
    notas.forEach((n) => {
      const d = n.data();
      const v = d.notaEditada && typeof d.notaEditada === "object" ? d.notaEditada : d;
      agregar({ texto: [v.titulo, v.tipoNota, v.contenido, v.texto, v.nota, v.evolucion, v.subjetivo, v.padecimientoActual, v.analisis].filter(Boolean).join(". "), origenTipo: "nota", origenSubtipo: v.tipoNotaClave || v.tipoNota || "nota_clinica", origenId: n.id, fecha: fechaDocDeteccion(v) });
    });
  } catch { /* fuente sin permiso o inexistente */ }
  return { fragmentos, fechaNacimiento };
}

function extraerSugerenciasLocales(fragmentos = [], fechaNacimiento = null) {
  const salida = [];
  fragmentos.forEach((f) => {
    String(f.texto || "").split(/(?<=[.!?])\s+/).forEach((frase) => {
      const normal = normalizarTextoDeteccion(frase);
      if (!PATRON_TEMPORAL_DETECCION.test(frase) || !PATRON_RELEVANCIA_DETECCION.test(normal) || PATRON_NEGACION_DETECCION.test(normal) || PATRON_FUTURO_DETECCION.test(normal)) return;
      const intervalo = normal.match(/\bdel\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
      const expresion = frase.match(PATRON_TEMPORAL_DETECCION)?.[0] || "";
      const fecha = resolverFechaDetectada(expresion || frase, f.fechaDocumento, fechaNacimiento);
      if (intervalo && MESES_DETECCION.has(intervalo[3])) {
        fecha.fechaInicioISO = fechaISO(new Date(Number(intervalo[4]), MESES_DETECCION.get(intervalo[3]), Number(intervalo[1]), 12));
        fecha.fechaFinISO = fechaISO(new Date(Number(intervalo[4]), MESES_DETECCION.get(intervalo[3]), Number(intervalo[2]), 12));
        fecha.precisionTemporal = "dia";
        fecha.requiereRevisionFecha = false;
      }
      salida.push({ tituloSugerido: tituloDetectado(frase), descripcionSugerida: frase.replace(expresion, "").trim().slice(0, 360), ...fecha, expresionTemporalOriginal: expresion, fragmentoSoporte: frase.slice(0, 280), categoriaSugerida: categoriaDetectada(frase), importanciaSugerida: /suicid|hospitaliz|urgencia/i.test(normal) ? "alta" : "media", confianza: fecha.fechaInicioISO ? 0.78 : 0.52, sujeto: /\bmadre|padre|herman|familiar\b/.test(normal) ? "familiar" : "paciente", origenTipo: f.origenTipo, origenSubtipo: f.origenSubtipo, origenId: f.origenId, origenFechaISO: fechaISO(f.fechaDocumento), hashFragmento: f.hashFragmento });
    });
  });
  return salida;
}

function tipoFuenteContadoresIniciales() {
  return {
    notas: 0,
    historiaClinica: 0,
    estudios: 0,
    tratamientos: 0,
    diagnosticos: 0,
    paciente: 0
  };
}

function obtenerTextoDiagnosticoDeteccion(diagnostico = {}) {
  if (typeof diagnostico === "string") return diagnostico.trim();
  if (!diagnostico || typeof diagnostico !== "object") return "";
  const codigo = diagnostico.codigo || diagnostico.code || diagnostico.id || "";
  const nombre = diagnostico.nombre || diagnostico.name || diagnostico.descripcion || diagnostico.texto || diagnostico.textoVisible || diagnostico.diagnostico || "";
  return [codigo, nombre].filter(Boolean).join(" - ").trim();
}

function obtenerDiagnosticosPacienteDeteccion(paciente = {}) {
  const acumulados = [
    ...(Array.isArray(paciente.historialDiagnosticos) ? paciente.historialDiagnosticos : []),
    ...(Array.isArray(paciente.diagnosticos) ? paciente.diagnosticos : []),
    ...(Array.isArray(paciente.datosClinicosResumen?.historialDiagnosticos) ? paciente.datosClinicosResumen.historialDiagnosticos : [])
  ];
  if (paciente.diagnostico) acumulados.push({ diagnostico: paciente.diagnostico, fecha: paciente.fechaDiagnostico || paciente.fechaCreacion });
  const unicos = new Map();
  acumulados.forEach((dx, index) => {
    const texto = obtenerTextoDiagnosticoDeteccion(dx);
    if (!texto) return;
    const clave = hashDeteccionEstable(["diagnostico", normalizarTextoEventoDetectado(texto), dx.fechaDiagnostico || dx.fecha || index].join("|"));
    if (!unicos.has(clave)) unicos.set(clave, { id: dx.id || clave, ...dx, texto });
  });
  return [...unicos.values()];
}

function crearFuenteComunDeteccion(datos) {
  return crearFuenteClinicaComun(datos);
}

async function cargarFuentesClinicasDeteccion127() {
  const [{ obtenerHistorialNotas }, { obtenerHistoriaClinica }, { listarEstudios }] = await Promise.all([
    import("../services/notas.js"),
    import("../services/historias.js"),
    import("../services/estudios.js")
  ]);
  const contadoresPorTipo = tipoFuenteContadoresIniciales();
  const errores = [];
  const fuentes = [];
  const paciente = await obtenerUsuario(pacienteId);
  const fechaNacimiento = normalizarFecha(paciente?.fechaNacimiento);
  const agregarFuente = (fuente) => {
    if (!fuente?.origenId || !fuente?.origenTipo) return;
    if (fuenteEsNarrativaAnalizable(fuente)) fuentes.push(fuente);
    const mapa = {
      nota: "notas",
      historia_clinica: "historiaClinica",
      estudio: "estudios",
      tratamiento: "tratamientos",
      diagnostico: "diagnosticos",
      paciente: "paciente"
    };
    const clave = mapa[fuente.origenTipo] || fuente.origenTipo;
    contadoresPorTipo[clave] = (contadoresPorTipo[clave] || 0) + 1;
  };
  agregarFuente(crearFuenteComunDeteccion({
    origenId: pacienteId,
    origenTipo: "paciente",
    origenSubtipo: "datos_clinicos",
    fechaDocumento: fechaDocDeteccion(paciente),
    tituloDocumento: "Datos clinicos del paciente",
    datos: {
      padecimientoActual: paciente?.padecimientoActual,
      antecedentes: paciente?.antecedentes,
      diagnostico: paciente?.diagnostico,
      fecha: paciente?.fechaCreacion || paciente?.createdAt
    }
  }));
  contadoresPorTipo.diagnosticos = obtenerDiagnosticosPacienteDeteccion(paciente).length;
  try {
    const historia = await obtenerHistoriaClinica(pacienteId);
    if (historia.exists()) agregarFuente(crearFuenteComunDeteccion({
      origenId: historia.id,
      origenTipo: "historia_clinica",
      origenSubtipo: "historia_inicial",
      fechaDocumento: fechaDocDeteccion(historia.data()),
      tituloDocumento: "Historia clinica",
      datos: historia.data()
    }));
  } catch (error) {
    errores.push({ tipo: "historiaClinica", code: error?.code || error?.message || "error" });
  }
  try {
    const notas = await obtenerHistorialNotas(pacienteId);
    notas.forEach((n) => {
      const d = n.data();
      const vigente = d.notaEditada && typeof d.notaEditada === "object" ? d.notaEditada : d;
      agregarFuente(crearFuenteComunDeteccion({
        origenId: n.id,
        origenTipo: "nota",
        origenSubtipo: vigente.tipoNotaClave || vigente.tipoNota || "nota_clinica",
        fechaDocumento: fechaDocDeteccion(vigente),
        tituloDocumento: vigente.tipoNota || vigente.titulo || "Nota clinica",
        datos: vigente
      }));
    });
  } catch (error) {
    errores.push({ tipo: "notas", code: error?.code || error?.message || "error" });
  }
  try {
    const estudios = await listarEstudios(pacienteId);
    estudios
      .filter((estudio) => estudio && estudio.eliminado !== true && estudio.estado !== "eliminado")
      .forEach((estudio) => agregarFuente(crearFuenteComunDeteccion({
        origenId: estudio.id,
        origenTipo: "estudio",
        origenSubtipo: estudio.tipo || estudio.nombre || "estudio",
        fechaDocumento: estudio.fechaRealizacion || estudio.fechaEstudio || estudio.fecha || estudio.fechaCreacion,
        tituloDocumento: estudio.nombre || estudio.tipo || "Estudios",
        datos: estudio
      })));
  } catch (error) {
    errores.push({ tipo: "estudios", code: error?.code || error?.message || "error" });
  }
  return { fuentes, fechaNacimiento, contadoresPorTipo, errores };
}

function resumenDeteccionVacio() {
  return {
    fuentesEncontradas: 0,
    fuentesConTexto: 0,
    fragmentosGenerados: 0,
    fragmentosConExpresionesTemporales: 0,
    eventosExtraidos: 0,
    eventosNormalizados: 0,
    eventosDescartados: 0,
    duplicadosDetectados: 0,
    sugerenciasGuardadas: 0,
    sugerenciasPendientes: 0,
    notasAnalizadas: 0,
    historiasAnalizadas: 0,
    estudiosNarrativosAnalizados: 0,
    diagnosticosEstructuradosAnalizados: 0,
    tratamientosEstructuradosAnalizados: 0,
    candidatosNarrativos: 0,
    candidatosEstructurados: 0,
    administrativosDescartados: 0,
    candidatosTotales: 0,
    candidatosClaros: 0,
    candidatosReparados: 0,
    candidatosDivididos: 0,
    candidatosAmbiguos: 0,
    candidatosDescartadosPorIncoherencia: 0,
    fuentesEstructuradasOmitidas: 0
  };
}

function actualizarEstadoVisibleDeteccion({ totalFuentes = 0, errores = [], pendientes = 0, nuevas = 0, totalGuardadas = 0, analizado = false } = {}) {
  const statusNode = root.querySelector("[data-detected-status]");
  if (!statusNode) return;
  if (errores.length && totalFuentes === 0) {
    statusNode.textContent = "No fue posible buscar eventos en este momento.";
    return;
  }
  if (!totalFuentes) {
    statusNode.textContent = "No se encontraron documentos clinicos disponibles para analizar.";
    return;
  }
  if (errores.length) {
    statusNode.textContent = `Se analizaron ${Math.max(0, totalFuentes - errores.length)} de ${totalFuentes} documentos. Algunos no pudieron procesarse.`;
    return;
  }
  if (pendientes) {
    statusNode.textContent = `${pendientes} eventos pendientes de revision.`;
    return;
  }
  if (totalGuardadas > 0 && !pendientes) {
    statusNode.textContent = "Todos los eventos detectados ya fueron añadidos o descartados.";
    return;
  }
  if (analizado || nuevas === 0) {
    statusNode.textContent = "Se analizaron las fuentes disponibles, pero no se detectaron eventos nuevos.";
  }
}

function actualizarProgresoDeteccion(texto = "") {
  const nodo = root.querySelector("[data-detected-progress]");
  if (!nodo) return;
  nodo.hidden = !texto;
  nodo.textContent = texto;
}

function obtenerClavesProcesadasSugerencias(sugerencias = []) {
  return new Set(sugerencias.flatMap((s) => [s.detectedEventId, s.hashConceptual, s.hashFragmento]).filter(Boolean));
}

function detectarDuplicadoEventoExistente(sugerencia, eventosLineaTiempo = []) {
  const titulo = normalizarTextoEventoDetectado(sugerencia.tituloSugerido).slice(0, 24);
  return eventosLineaTiempo.find((evento) => {
    const mismaFecha = fechaISOEventoDetectado(evento.fechaEvento) === sugerencia.fechaInicioISO;
    const tituloEvento = normalizarTextoEventoDetectado(evento.titulo).slice(0, 24);
    const mismaDeteccion = obtenerClavesDeteccionEvento(evento).includes(sugerencia.detectedEventId);
    return mismaDeteccion || (mismaFecha && titulo && tituloEvento === titulo);
  });
}

async function persistirSugerenciasDetectadas127(candidatos = [], existentes = [], forzarReanalisis = false) {
  const claves = obtenerClavesProcesadasSugerencias(existentes);
  const nuevas = [];
  let duplicadosDetectados = 0;
  for (const candidato of candidatos) {
    const clavesCandidato = [candidato.detectedEventId, candidato.hashConceptual, candidato.hashFragmento].filter(Boolean);
    if (!forzarReanalisis && clavesCandidato.some((clave) => claves.has(clave))) {
      duplicadosDetectados += 1;
      continue;
    }
    if (forzarReanalisis && clavesCandidato.some((clave) => claves.has(clave))) {
      duplicadosDetectados += 1;
      continue;
    }
    const posibleDuplicado = detectarDuplicadoEventoExistente(candidato, eventos);
    await addDoc(refEventosDetectados(), {
      ...candidato,
      posibleDuplicadoEventoId: posibleDuplicado?.id || null,
      detectadoPor: auth.currentUser.uid,
      detectadoEn: serverTimestamp(),
      revisadoPor: null,
      revisadoEn: null,
      eventoCreadoId: null,
      detectorVersion: "1.32"
    });
    clavesCandidato.forEach((clave) => claves.add(clave));
    nuevas.push(candidato);
  }
  return { nuevas, duplicadosDetectados };
}

async function regenerarSugerenciaDetectada(sugerencia = {}) {
  const fragmento = String(sugerencia.fragmentoSoporte || "").trim();
  if (!fragmento) throw new Error("FRAGMENTO_SOPORTE_REQUERIDO");
  const fuente = crearFuenteClinicaComun({
    origenId: sugerencia.origenId || sugerencia.id,
    origenTipo: sugerencia.origenTipo || "nota",
    origenSubtipo: sugerencia.origenSubtipo || "",
    fechaDocumento: sugerencia.origenFechaISO || sugerencia.sourceDate || null,
    tituloDocumento: sugerencia.sourceLabel || sugerencia.origenSubtipo || "Fuente clinica",
    datos: { contenido: fragmento }
  });
  const resultado = detectarEventosEnFuentes({ fuentes: [fuente], pacienteId, incluirEstructurados: false });
  const candidatos = resultado.eventos;
  const candidato = candidatos[0];
  if (!candidato) throw new Error("SIN_PROPUESTA_REGENERADA");
  const camposPropuesta = (valor) => ({
    tituloSugerido: valor.tituloSugerido,
    descripcionSugerida: valor.descripcionSugerida,
    tipoEvento: valor.tipoEvento || null,
    categoriaSugerida: valor.categoriaSugerida || null,
    importanciaSugerida: valor.importanciaSugerida || sugerencia.importanciaSugerida || "media",
    fechaInicioISO: valor.fechaInicioISO || null,
    fechaFinISO: valor.fechaFinISO || null,
    precisionTemporal: valor.precisionTemporal || "indeterminada",
    fechaEsAproximada: valor.fechaEsAproximada !== false,
    etiquetaTemporal: valor.etiquetaTemporal || null,
    requiereRevisionFecha: valor.requiereRevisionFecha === true,
    requiereRevisionClinica: valor.requiereRevisionClinica === true,
    motivoRevision: valor.motivoRevision || null,
    confianzaSemantica: valor.confianzaSemantica || valor.confianza || null,
    sujeto: valor.sujeto || "paciente",
    relacionSujeto: valor.relacionSujeto || null,
    expresionTemporalOriginal: valor.expresionTemporalOriginal || null,
    expresionTemporalPropia: valor.expresionTemporalPropia || null,
    clausulaOrigen: valor.clausulaOrigen || null,
    fragmentoSoporte: valor.fragmentoSoporte || fragmento
  });
  await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), {
    ...camposPropuesta(candidato),
    detectorVersion: "1.32",
    estado: ESTADOS_DETECCION.pendiente,
    regeneradoEn: serverTimestamp(),
    regeneradoPor: auth.currentUser.uid
  });
  for (const adicional of candidatos.slice(1)) {
    await addDoc(refEventosDetectados(), {
      ...adicional,
      ...camposPropuesta(adicional),
      estado: ESTADOS_DETECCION.pendiente,
      detectedEventId: adicional.detectedEventId || hashDeteccionEstable([pacienteId, sugerencia.id, adicional.tituloSugerido, adicional.fechaInicioISO || "sin-fecha"].join("|")),
      hashConceptual: adicional.hashConceptual || adicional.detectedEventId || null,
      origenId: sugerencia.origenId || adicional.origenId || "",
      origenTipo: sugerencia.origenTipo || adicional.origenTipo || "nota",
      origenSubtipo: sugerencia.origenSubtipo || adicional.origenSubtipo || "",
      sourceLabel: sugerencia.sourceLabel || adicional.sourceLabel || "Fuente clinica",
      origenFechaISO: sugerencia.origenFechaISO || adicional.origenFechaISO || null,
      posibleDuplicadoEventoId: null,
      detectadoPor: auth.currentUser.uid,
      detectadoEn: serverTimestamp(),
      revisadoPor: null,
      revisadoEn: null,
      eventoCreadoId: null,
      detectorVersion: "1.32",
      regeneradoDesdeSugerenciaId: sugerencia.id
    });
  }
  return {
    divididas: Math.max(0, candidatos.length - 1),
    fechasReasignadas: candidatos.filter((valor) => valor.fechaInicioISO !== sugerencia.fechaInicioISO).length
  };
}

async function inicializarDetectorEventosClinicosLocal() {
  let sugerencias = [];
  let mostrarDescartados = false;
  let filtroActual = "todos";
  let buscando = false;
  const status = () => root.querySelector("[data-detected-status]");
  asegurarSeccionDeteccion();
  const cargar = async () => {
    try {
      sugerencias = await cargarSugerenciasDetectadas();
      renderizarSugerenciasDeteccion(sugerencias, mostrarDescartados, false, filtroActual);
      const disponibles = filtrarEventosDetectadosDisponibles(sugerencias, eventos, mostrarDescartados);
      const pendientes = disponibles.filter((s) => s.estado === ESTADOS_DETECCION.pendiente).length;
      if (!sugerencias.length) {
        if (status()) status().textContent = "No se han buscado eventos nuevos.";
      } else {
        actualizarEstadoVisibleDeteccion({ totalFuentes: 1, pendientes, totalGuardadas: sugerencias.length, analizado: true });
      }
    } catch (error) {
      if (status()) status().textContent = "No fue posible leer las sugerencias detectadas.";
      console.warn("[Eventos detectados] Error al cargar sugerencias", error?.code || error?.message || error);
    }
  };
  const buscar = async () => {
    if (buscando || !permisos.puedeLeer) return;
    buscando = true;
    if (status()) status().textContent = "Analizando fuentes clinicas…";
    try {
      const { fragmentos, fechaNacimiento } = await obtenerFragmentosClinicosDeteccion();
      const existentes = await cargarSugerenciasDetectadas();
      const claves = new Set(existentes.map((s) => s.hashConceptual || s.hashFragmento));
      const nuevas = [];
      for (const s of extraerSugerenciasLocales(fragmentos, fechaNacimiento)) {
        const hashConceptual = [pacienteId, s.fechaInicioISO || "sin-fecha", normalizarTextoDeteccion(s.tituloSugerido), s.sujeto].join("|");
        if (claves.has(hashConceptual)) continue;
        const posibleDuplicado = eventos.find((e) => fechaISO(e.fechaEvento) === s.fechaInicioISO && normalizarTextoDeteccion(e.titulo).slice(0, 18) === normalizarTextoDeteccion(s.tituloSugerido).slice(0, 18));
        await addDoc(refEventosDetectados(), { ...s, detectedEventId: hashConceptual, hashConceptual, estado: ESTADOS_DETECCION.pendiente, posibleDuplicadoEventoId: posibleDuplicado?.id || null, detectadoPor: auth.currentUser.uid, detectadoEn: serverTimestamp(), revisadoPor: null, revisadoEn: null, eventoCreadoId: null });
        claves.add(hashConceptual);
        nuevas.push(s);
      }
      await registrarEventoAuditoria({ accion: "detectar_eventos_linea_tiempo", modulo: "Linea de tiempo del paciente", descripcion: "Deteccion asistida de eventos clinicos.", usuarioUid: auth.currentUser.uid, pacienteUid: pacienteId, detalles: { fuentesAnalizadas: fragmentos.length, sugerenciasNuevas: nuevas.length } });
      await cargar();
      if (status()) status().textContent = nuevas.length ? `${nuevas.length} eventos nuevos detectados.` : "No se detectaron eventos nuevos.";
    } catch (error) {
      if (status()) status().textContent = "No fue posible analizar algunas fuentes.";
      console.warn("[Eventos detectados] Fallo tecnico", error?.code || error?.message || error);
    } finally {
      buscando = false;
    }
  };
  const buscar127 = async ({ forzarReanalisis = false } = {}) => {
    if (buscando || !permisos.puedeLeer) return;
    buscando = true;
    const botonBuscar = root.querySelector("[data-action='search-detected-events']");
    const botonReanalizar = root.querySelector("[data-action='reanalyze-detected-events']");
    [botonBuscar, botonReanalizar].forEach((boton) => {
      if (!boton) return;
      boton.disabled = true;
      boton.setAttribute("aria-busy", "true");
    });
    const resumen = resumenDeteccionVacio();
    if (status()) status().textContent = "Leyendo fuentes clinicas...";
    actualizarProgresoDeteccion("Leyendo fuentes...");
    try {
      const { fuentes, fechaNacimiento, contadoresPorTipo, errores } = await cargarFuentesClinicasDeteccion127();
      resumen.fuentesEncontradas = fuentes.length;
      resumen.fuentesConTexto = fuentes.filter(fuenteEsNarrativaAnalizable).length;
      actualizarProgresoDeteccion("Analizando notas e historia clinica...");
      const resultadoDeteccion = detectarEventosEnFuentes({ fuentes, fechaNacimiento, pacienteId, incluirEstructurados: false });
      resumen.fragmentosGenerados = resultadoDeteccion.fragmentosGenerados;
      resumen.fragmentosConExpresionesTemporales = resultadoDeteccion.fragmentosConExpresionesTemporales;
      resumen.eventosExtraidos = resultadoDeteccion.eventosExtraidos;
      resumen.eventosNormalizados = resultadoDeteccion.eventosNormalizados;
      resumen.eventosDescartados = resultadoDeteccion.eventosDescartados;
      resumen.duplicadosDetectados = resultadoDeteccion.duplicadosDetectados;
      resumen.notasAnalizadas = contadoresPorTipo.notas || 0;
      resumen.historiasAnalizadas = contadoresPorTipo.historiaClinica || 0;
      resumen.estudiosNarrativosAnalizados = contadoresPorTipo.estudios || 0;
      resumen.diagnosticosEstructuradosAnalizados = 0;
      resumen.tratamientosEstructuradosAnalizados = 0;
      resumen.fuentesEstructuradasOmitidas = (contadoresPorTipo.diagnosticos || 0) + (contadoresPorTipo.tratamientos || 0) + (resultadoDeteccion.fuentesEstructuradasOmitidas || 0);
      resumen.candidatosNarrativos = resultadoDeteccion.candidatosNarrativos || 0;
      resumen.candidatosEstructurados = resultadoDeteccion.candidatosEstructurados || 0;
      resumen.administrativosDescartados = resultadoDeteccion.administrativosDescartados || 0;
      resumen.candidatosTotales = resultadoDeteccion.candidatosTotales || 0;
      resumen.candidatosClaros = resultadoDeteccion.candidatosClaros || 0;
      resumen.candidatosReparados = resultadoDeteccion.candidatosReparados || 0;
      resumen.candidatosDivididos = resultadoDeteccion.candidatosDivididos || 0;
      resumen.candidatosAmbiguos = resultadoDeteccion.candidatosAmbiguos || 0;
      resumen.candidatosDescartadosPorIncoherencia = resultadoDeteccion.candidatosDescartadosPorIncoherencia || 0;
      actualizarProgresoDeteccion("Comparando duplicados...");
      const existentes = await cargarSugerenciasDetectadas();
      const persistencia = await persistirSugerenciasDetectadas127(resultadoDeteccion.eventos, existentes, forzarReanalisis);
      resumen.duplicadosDetectados += persistencia.duplicadosDetectados;
      resumen.sugerenciasGuardadas = persistencia.nuevas.length;
      await registrarEventoAuditoria({
        accion: "detectar_eventos_linea_tiempo",
        modulo: "Linea de tiempo del paciente",
        descripcion: "Deteccion asistida de eventos clinicos.",
        usuarioUid: auth.currentUser.uid,
        pacienteUid: pacienteId,
        detalles: { fuentesAnalizadas: resumen.fuentesEncontradas, sugerenciasNuevas: resumen.sugerenciasGuardadas }
      });
      await cargar();
      const disponibles = filtrarEventosDetectadosDisponibles(sugerencias, eventos, mostrarDescartados);
      resumen.sugerenciasPendientes = disponibles.filter((s) => s.estado === ESTADOS_DETECCION.pendiente).length;
      console.debug(DETECTED_EVENTS_DEBUG_LABEL, resumen);
      console.debug(`${DETECTED_EVENTS_DEBUG_LABEL} fuentes`, contadoresPorTipo);
      if (resultadoDeteccion.motivosDescarte && Object.keys(resultadoDeteccion.motivosDescarte).length) {
        console.debug(`${DETECTED_EVENTS_DEBUG_LABEL} descartes`, resultadoDeteccion.motivosDescarte);
      }
      actualizarEstadoVisibleDeteccion({
        totalFuentes: resumen.fuentesEncontradas,
        errores,
        pendientes: resumen.sugerenciasPendientes,
        nuevas: resumen.sugerenciasGuardadas,
        totalGuardadas: sugerencias.length,
        analizado: true
      });
      actualizarProgresoDeteccion(`${resumen.notasAnalizadas} notas analizadas · ${resumen.historiasAnalizadas} historia clinica analizada · ${resumen.estudiosNarrativosAnalizados} estudios narrativos analizados · ${resumen.candidatosNarrativos} eventos narrativos detectados.`);
    } catch (error) {
      if (status()) status().textContent = "No fue posible buscar eventos en este momento.";
      console.warn("[Eventos detectados] Fallo tecnico", error?.code || error?.message || error);
    } finally {
      buscando = false;
      [botonBuscar, botonReanalizar].forEach((boton) => {
        if (!boton) return;
        boton.disabled = false;
        boton.removeAttribute("aria-busy");
      });
    }
  };
  const onClick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const card = event.target.closest("[data-detected-id]");
    if (action === "toggle-detected-events") {
      const body = root.querySelector("[data-detected-body]");
      body.hidden = !body.hidden;
      event.target.closest("button")?.setAttribute("aria-expanded", String(!body.hidden));
    }
    if (event.target.closest("[data-detected-filter]")) {
      filtroActual = event.target.closest("[data-detected-filter]").value || "todos";
      renderizarSugerenciasDeteccion(sugerencias, mostrarDescartados, true, filtroActual);
    }
    if (action === "toggle-discarded-events") { mostrarDescartados = !mostrarDescartados; event.target.textContent = mostrarDescartados ? "Ocultar descartados" : "Mostrar descartados"; renderizarSugerenciasDeteccion(sugerencias, mostrarDescartados, true, filtroActual); }
    if (action === "search-detected-events") buscar127();
    if (action === "reanalyze-detected-events") {
      const confirmar = confirm("Se volveran a analizar las fuentes clinicas del paciente. Las sugerencias aceptadas o descartadas no se eliminaran.");
      if (confirmar) buscar127({ forzarReanalisis: true });
    }
    if (!card) return;
    const sugerencia = sugerencias.find((s) => s.id === card.dataset.detectedId);
    if (!sugerencia) return;
    if (action === "view-detected-origin") alert(`Origen: ${sugerencia.origenSubtipo || sugerencia.origenTipo}\nFecha: ${sugerencia.origenFechaISO || "sin fecha"}\n\nFragmento:\n${sugerencia.fragmentoSoporte || "Sin fragmento disponible."}`);
    if (action === "regenerate-detected-event") {
      try {
        const resumenRegeneracion = await regenerarSugerenciaDetectada(sugerencia);
        console.debug("[Eventos detectados 1.32] Regeneración completada", resumenRegeneracion);
        await cargar();
        return;
      } catch (error) {
        card.querySelector("[data-detected-error]").textContent = "No fue posible regenerar la propuesta con el fragmento disponible.";
        console.warn("[Eventos detectados] Error al regenerar propuesta", error?.code || error?.message || error);
        return;
      }
    }
    if (action === "discard-detected-event") { await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), { estado: ESTADOS_DETECCION.descartado, revisadoPor: auth.currentUser.uid, revisadoEn: serverTimestamp(), motivoDescarte: "revision_usuario" }); await cargar(); }
    if (action === "restore-detected-event") {
      if (sugerenciaProvieneDeOrigenEstructuradoExcluido(sugerencia)) {
        await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), { estado: ESTADOS_DETECCION.obsoleto, ocultaPorOrigenEstructurado: true, origenDeteccion: "estructurado_excluido" });
        await cargar();
        return;
      }
      await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), { estado: ESTADOS_DETECCION.pendiente, revisadoPor: auth.currentUser.uid, revisadoEn: serverTimestamp(), motivoDescarte: "" }); await cargar();
    }
    if (action === "accept-detected-event") {
      const datos = {
        titulo: card.querySelector("[data-detected-field='titulo']").value.trim(),
        descripcion: card.querySelector("[data-detected-field='descripcion']").value.trim(),
        fechaInicioISO: card.querySelector("[data-detected-field='fechaInicioISO']").value,
        fechaFinISO: card.querySelector("[data-detected-field='fechaFinISO']").value,
        importancia: card.querySelector("[data-detected-field='importancia']").value || "media"
      };
      if (!datos.titulo || !datos.fechaInicioISO) { card.querySelector("[data-detected-error]").textContent = "Titulo y fecha son obligatorios."; return; }
      const detectedEventId = obtenerDetectedEventIdSugerencia(sugerencia);
      const eventosActuales = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
      const clavesSugerencia = new Set(obtenerClavesDeteccionSugerencia(sugerencia));
      const existente = eventosActuales.find((evento) => obtenerClavesDeteccionEvento(evento).some((id) => clavesSugerencia.has(id)));
      if (existente) {
        eventos = eventosActuales;
        card.querySelector("[data-detected-error]").textContent = "Este evento ya fue agregado a la Linea de tiempo.";
        renderizarVista();
        abrirDetalle({ eventoId: existente.id, grupoId: "" });
        await cargar();
        return;
      }
      const evento = await crearEventoPaciente(pacienteId, { titulo: datos.titulo, descripcion: datos.descripcion, fechaEvento: fechaLocalISO(datos.fechaInicioISO), fechaFin: fechaLocalISO(datos.fechaFinISO), importancia: datos.importancia, origen: "detectado", referenciaTipo: sugerencia.origenSubtipo || sugerencia.origenTipo, referenciaId: sugerencia.origenId, detectedEventId, deteccionId: sugerencia.id, sourceType: sugerencia.origenTipo || "", sourceId: sugerencia.origenId || "", sourceLabel: sugerencia.origenSubtipo || sugerencia.origenTipo || "", sourceDate: sugerencia.origenFechaISO || "", fechaEsAproximada: sugerencia.fechaEsAproximada === true || sugerencia.requiereRevisionFecha === true, precisionTemporal: sugerencia.precisionTemporal, etiquetaTemporal: sugerencia.etiquetaTemporal, relacionSujeto: sugerencia.relacionSujeto, contextoClinico: sugerencia.contextoClinico }, auth.currentUser.uid);
      await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), { detectedEventId, estado: ESTADOS_DETECCION.aceptado, revisadoPor: auth.currentUser.uid, revisadoEn: serverTimestamp(), eventoCreadoId: evento.id });
      eventos = ordenarEventosPorFecha(await cargarEventosPaciente(pacienteId));
      renderizarVista();
      await cargar();
    }
  };
  const onChange = (event) => {
    if (!event.target.closest("[data-detected-filter]")) return;
    filtroActual = event.target.closest("[data-detected-filter]").value || "todos";
    renderizarSugerenciasDeteccion(sugerencias, mostrarDescartados, true, filtroActual);
  };
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  await cargar();
  return { destruir() { root.removeEventListener("click", onClick); root.removeEventListener("change", onChange); } };
}

async function inicializarDetectorEventosClinicos() {
  if (detectorEventosClinicos || !root || !pacienteId || !auth.currentUser) return;
  detectorEventosClinicos = await inicializarDetectorEventosClinicosLocal();
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
