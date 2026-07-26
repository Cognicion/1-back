import {
  agruparEventosPorFecha,
  calcularPosiciones,
  escaparHTML,
  formatearFecha,
  formatearFechaCorta,
  generarMarcasTemporales,
  obtenerConfiguracionTipoEvento,
  obtenerClaveFecha,
  ordenarEventosPorFecha,
  debugTimelineRuntime,
  obtenerNombreCategoriaEvento,
  formatearOrigenEvento,
  formatearImportanciaEvento
  ,agruparEventosParaEscalaVisible
} from "./lineaTiempoUtils.js";

function textoImportancia(importancia) {
  return importancia === "alta" ? "Importancia alta" : importancia === "baja" ? "Importancia baja" : "Importancia media";
}

function textoCategoria(evento) {
  return evento.categoria ? `<small>${escaparHTML(evento.categoria)}</small>` : "";
}

function textoDescripcion(evento) {
  return `<p>${escaparHTML(evento.descripcion || "Sin descripción disponible.")}</p>`;
}

export function renderizarEstados(root, tipo, mensaje = "") {
  const estado = root.querySelector("[data-timeline-state]");
  if (!estado) return;
  estado.hidden = !tipo;
  estado.dataset.state = tipo || "";
  const titulo = estado.querySelector("[data-state-title]");
  const texto = estado.querySelector("[data-state-message]");
  if (titulo) titulo.textContent = tipo === "loading" ? "Cargando línea de tiempo…" : tipo === "error" ? "No fue posible cargar la línea de tiempo." : "Este paciente aún no tiene eventos en su línea de tiempo.";
  if (texto) texto.textContent = mensaje;
}

export function renderizarLineaTiempo(root, eventos, rango, zoom = 1, opciones = {}) {
  const canvas = root.querySelector("[data-timeline-canvas]");
  if (!canvas) return;
  canvas.replaceChildren();
  canvas.style.setProperty("--timeline-zoom", zoom);
  const elementosVisuales = opciones.elementosVisuales || agruparEventosParaEscalaVisible({
    eventos: ordenarEventosPorFecha(eventos),
    rangoVisibleInicioMs: rango.minimo.getTime(),
    rangoVisibleFinMs: rango.maximo.getTime(),
    anchoDisponiblePx: canvas.clientWidth || 900,
    zoom
  });
  const marcas = generarMarcasTemporales(rango, canvas.clientWidth || 900);
  const fragmento = document.createDocumentFragment();

  const eje = document.createElement("div");
  eje.className = "timeline-axis";
  fragmento.appendChild(eje);

  const marcadorFoco = document.createElement("span");
  marcadorFoco.className = "timeline-focus-marker";
  marcadorFoco.dataset.timelineFocusMarker = "true";
  marcadorFoco.hidden = !opciones.hasFocusMarker;
  if (opciones.hasFocusMarker && Number.isFinite(opciones.focusCanvasX)) {
    marcadorFoco.style.left = `${opciones.focusCanvasX}px`;
  }
  marcadorFoco.setAttribute("aria-hidden", "true");
  fragmento.appendChild(marcadorFoco);

  marcas.forEach((marca) => {
    const marcaNode = document.createElement("span");
    marcaNode.className = "timeline-tick";
    marcaNode.style.left = `${marca.posicion * 100}%`;
    marcaNode.textContent = formatearFechaCorta(marca.fecha);
    if (marca.esExtremo) {
      marcaNode.dataset.endpoint = "true";
      marcaNode.classList.add(marca.tipo === "extremo-inicial" ? "timeline-tick--start" : "timeline-tick--end");
    } else {
      marcaNode.classList.add("timeline-tick--middle");
    }
    fragmento.appendChild(marcaNode);
  });

  elementosVisuales.forEach((elemento, grupoIndex) => {
    const grupo = { items: elemento.items, fecha: new Date(elemento.fechaRepresentativaMs), clave: elemento.idGrupo || elemento.id };
    const posicion = rango.duracion === 0 ? .5 : Math.min(1, Math.max(0, (elemento.fechaRepresentativaMs - rango.minimo.getTime()) / rango.duracion));
    const esGrupo = elemento.tipo === "grupo";
    const seleccionado = opciones.selectedGroupId === grupo.clave;
    const bloque = document.createElement("div");
    bloque.className = `timeline-event timeline-event-group timeline-event-group--${grupoIndex % 2 ? "below" : "above"}`;
    bloque.style.setProperty("--event-position", posicion);
    bloque.style.setProperty("--card-offset-x", posicion < 0.12 ? "70px" : posicion > 0.88 ? "-70px" : "0px");
    bloque.dataset.groupId = grupo.clave;
    if (!esGrupo) bloque.dataset.eventId = grupo.items[0].id;
    else bloque.dataset.visualGroupId = elemento.idGrupo;
    bloque.setAttribute("aria-expanded", String(seleccionado));
    bloque.dataset.selected = String(seleccionado);
    bloque.dataset.cardVisible = "false";
    bloque.setAttribute("aria-label", esGrupo ? `${grupo.items.length} eventos en ${elemento.etiquetaPeriodo}` : `${formatearFechaCorta(grupo.fecha)}, ${grupo.items[0].titulo}, ${textoImportancia(grupo.items[0].importancia)}`);
    const configuracion = obtenerConfiguracionTipoEvento(grupo.items[0].tipo);
    const evento = grupo.items[0];
    const eventoId = grupo.items[0].id;
    const atributoIdentificador = esGrupo ? `data-visual-group-id="${escaparHTML(elemento.idGrupo)}"` : `data-event-id="${escaparHTML(eventoId)}"`;
    const contenidoMarcador = esGrupo ? `<span class="timeline-event__group-count" aria-hidden="true">${grupo.items.length}</span>` : `<span class="timeline-event__marker-core" aria-hidden="true">${escaparHTML(configuracion.icono)}</span>`;
    bloque.innerHTML = `<span class="timeline-event-stem" aria-hidden="true"></span><button type="button" class="timeline-event__marker timeline-event-dot${esGrupo ? " timeline-event__marker--group" : ""}${seleccionado ? " is-selected" : ""}" ${atributoIdentificador} data-group-id="${escaparHTML(grupo.clave)}" aria-expanded="false" aria-pressed="${String(seleccionado)}" aria-label="${escaparHTML(bloque.getAttribute("aria-label"))}" style="--event-color:${configuracion.color}">${contenidoMarcador}</button><article class="timeline-event-card timeline-event__preview" role="tooltip" aria-hidden="true" hidden><time>${escaparHTML(esGrupo ? elemento.etiquetaPeriodo : formatearFechaCorta(grupo.fecha))}</time><strong>${esGrupo ? `${grupo.items.length} eventos` : escaparHTML(evento.titulo)}</strong>${esGrupo ? `<small>${grupo.items.length} eventos en este periodo</small>` : `${textoCategoria(evento)}<small>${escaparHTML(textoImportancia(evento.importancia))}</small>`}</article>`;
    fragmento.appendChild(bloque);
  });

  canvas.appendChild(fragmento);
  const primerMarcador = canvas.querySelector(".timeline-event__marker");
  if (primerMarcador) {
    const rect = primerMarcador.getBoundingClientRect();
    const elementoReal = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    debugTimelineRuntime("element-from-point", {
      tag: elementoReal?.tagName || null,
      className: typeof elementoReal?.className === "string" ? elementoReal.className : null,
      isMarker: Boolean(elementoReal?.closest?.(".timeline-event__marker"))
    });
  }
}

function crearCampoDetalle(clave, etiqueta) {
  const campo = document.createElement("div");
  const termino = document.createElement("dt");
  const valor = document.createElement("dd");
  termino.textContent = etiqueta;
  valor.dataset.detailField = clave;
  campo.append(termino, valor);
  return campo;
}

function asignarTextoDetalle(detalle, campo, valor) {
  const elemento = detalle.querySelector(`[data-detail-field="${campo}"]`);
  if (!elemento) {
    console.warn(`[Línea de tiempo] Falta el campo de detalle: ${campo}`);
    return;
  }
  elemento.textContent = valor;
}

function formatearHoraEvento(evento) {
  const fecha = evento.fechaEvento;
  return fecha.getHours() || fecha.getMinutes()
    ? fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "No especificada";
}

function obtenerReferenciaEvento(evento) {
  return evento.referenciaId
    ? `${evento.referenciaTipo || "Relacionada"} · ${evento.referenciaId}`
    : "No aplica";
}

export function renderizarDetalleEvento(root, eventos, eventoId = "", grupoId = "", categorias = []) {
  const eventoParaTraza = eventos.find((evento) => evento.id === eventoId) || eventos.find((evento) => obtenerClaveFecha(evento.fechaEvento) === grupoId);
  debugTimelineRuntime("E-render-detail", { eventId: eventoParaTraza?.id || null });
  const contenido = root.querySelector("[data-detail-content]");
  const panel = root.querySelector("[data-event-detail]");
  debugTimelineRuntime("F-detail-container", {
    exists: Boolean(panel),
    connected: Boolean(panel?.isConnected),
    hiddenBefore: panel?.hidden
  });
  if (!contenido || !panel) return;
  const lista = grupoId ? eventos.filter((evento) => obtenerClaveFecha(evento.fechaEvento) === grupoId) : eventos.filter((evento) => evento.id === eventoId);
  contenido.replaceChildren();
  if (!lista.length) {
    panel.hidden = true;
    return;
  }
  const fragmento = document.createDocumentFragment();
  lista.forEach((evento) => {
    const configuracion = obtenerConfiguracionTipoEvento(evento.tipo);
    const card = document.createElement("article");
    card.className = "timeline-detail-event";
    card.innerHTML = `<div class="timeline-detail-event__header"><span class="timeline-event-dot" style="--event-color:${configuracion.color}">${escaparHTML(configuracion.icono)}</span><div><h3></h3><p></p></div></div><dl><div><dt>Fecha</dt><dd></dd></div><div><dt>Categoría</dt><dd></dd></div><div><dt>Origen</dt><dd></dd></div><div><dt>Importancia</dt><dd></dd></div></dl><p class="timeline-detail-event__description"></p><div class="timeline-detail-event__actions"></div>`;
    const detallePorClave = card.querySelector("dl");
    detallePorClave.replaceChildren(
      crearCampoDetalle("fecha", "Fecha"),
      crearCampoDetalle("categoria", "Categoría"),
      crearCampoDetalle("origen", "Origen"),
      crearCampoDetalle("importancia", "Importancia"),
      crearCampoDetalle("fechaFinal", "Fecha final"),
      crearCampoDetalle("hora", "Hora"),
      crearCampoDetalle("referencia", "Referencia")
    );
    const datosDetalle = {
      fecha: formatearFecha(evento.fechaEvento),
      categoria: obtenerNombreCategoriaEvento(evento, categorias),
      origen: formatearOrigenEvento(evento.origen),
      importancia: formatearImportanciaEvento(evento.importancia),
      fechaFinal: evento.fechaFin ? formatearFecha(evento.fechaFin) : "No aplica",
      hora: formatearHoraEvento(evento),
      referencia: obtenerReferenciaEvento(evento)
    };
    const titulo = card.querySelector("h3");
    const fecha = card.querySelector(".timeline-detail-event__header p");
    const categoria = detallePorClave.querySelector('[data-detail-field="categoria"]');
    const origen = detallePorClave.querySelector('[data-detail-field="origen"]');
    const importancia = detallePorClave.querySelector('[data-detail-field="importancia"]');
    const descripcion = card.querySelector(".timeline-detail-event__description");
    titulo.textContent = evento.titulo || "Evento sin título";
    fecha.textContent = datosDetalle.fecha;
    categoria.textContent = datosDetalle.categoria;
    origen.textContent = datosDetalle.origen;
    importancia.textContent = datosDetalle.importancia;
    descripcion.textContent = evento.descripcion || "Sin descripción disponible.";
    Object.entries(datosDetalle).forEach(([campo, valor]) => asignarTextoDetalle(card, campo, valor));
    card.dataset.eventId = evento.id;
    fragmento.appendChild(card);
  });
  contenido.appendChild(fragmento);
  panel.hidden = false;
  const estilos = getComputedStyle(panel);
  const rect = panel.getBoundingClientRect();
  debugTimelineRuntime("G-detail-result", {
    hiddenAfter: panel.hidden,
    display: estilos.display,
    visibility: estilos.visibility,
    opacity: estilos.opacity,
    width: rect.width,
    height: rect.height,
    top: rect.top
  });
}
