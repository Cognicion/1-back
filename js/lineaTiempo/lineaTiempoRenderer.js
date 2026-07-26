import {
  agruparEventosPorFecha,
  calcularPosiciones,
  escaparHTML,
  formatearFecha,
  formatearFechaCorta,
  generarMarcasTemporales,
  obtenerConfiguracionTipoEvento,
  obtenerClaveFecha,
  ordenarEventosPorFecha
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
  const eventosOrdenados = ordenarEventosPorFecha(eventos);
  const grupos = agruparEventosPorFecha(eventosOrdenados);
  const posiciones = calcularPosiciones(eventosOrdenados, rango);
  const posicionPorId = new Map(posiciones.map((item) => [item.evento.id, item.posicion]));
  const marcas = generarMarcasTemporales(rango);
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

  grupos.forEach((grupo, grupoIndex) => {
    const posicion = grupo.items.reduce((suma, item) => suma + (posicionPorId.get(item.id) ?? 0.5), 0) / grupo.items.length;
    const seleccionado = opciones.selectedGroupId === grupo.clave;
    const bloque = document.createElement("div");
    bloque.className = `timeline-event timeline-event-group timeline-event-group--${grupoIndex % 2 ? "below" : "above"}`;
    bloque.style.setProperty("--event-position", posicion);
    bloque.style.setProperty("--card-offset-x", posicion < 0.12 ? "70px" : posicion > 0.88 ? "-70px" : "0px");
    bloque.dataset.groupId = grupo.clave;
    bloque.dataset.eventId = grupo.items[0].id;
    bloque.setAttribute("aria-expanded", String(seleccionado));
    bloque.dataset.selected = String(seleccionado);
    bloque.dataset.cardVisible = "false";
    bloque.setAttribute("aria-label", grupo.items.length > 1 ? `${grupo.items.length} eventos del ${formatearFecha(grupo.fecha)}` : `${formatearFechaCorta(grupo.fecha)}, ${grupo.items[0].titulo}, ${textoImportancia(grupo.items[0].importancia)}`);
    const configuracion = obtenerConfiguracionTipoEvento(grupo.items[0].tipo);
    const evento = grupo.items[0];
    const eventoId = grupo.items[0].id;
    bloque.innerHTML = `<span class="timeline-event-stem" aria-hidden="true"></span><button type="button" class="timeline-event__marker timeline-event-dot${seleccionado ? " is-selected" : ""}" data-event-id="${escaparHTML(eventoId)}" data-group-id="${escaparHTML(grupo.clave)}" aria-expanded="false" aria-pressed="${String(seleccionado)}" aria-label="${escaparHTML(bloque.getAttribute("aria-label"))}" style="--event-color:${configuracion.color}"><span class="timeline-event__marker-core" aria-hidden="true">${escaparHTML(configuracion.icono)}</span></button><article class="timeline-event-card timeline-event__preview" role="tooltip" aria-hidden="true" hidden><time>${escaparHTML(formatearFechaCorta(grupo.fecha))}</time><strong>${grupo.items.length > 1 ? `${grupo.items.length} eventos` : escaparHTML(evento.titulo)}</strong>${grupo.items.length > 1 ? `<small>${grupo.items.length} eventos en esta fecha</small>` : `${textoCategoria(evento)}<small>${escaparHTML(textoImportancia(evento.importancia))}</small>`}</article>`;
    fragmento.appendChild(bloque);
  });

  canvas.appendChild(fragmento);
  canvas.style.setProperty("--timeline-content-width", `${Math.max(100, 100 * zoom)}%`);
}

export function renderizarDetalleEvento(root, eventos, eventoId = "", grupoId = "") {
  const contenido = root.querySelector("[data-detail-content]");
  const panel = root.querySelector("[data-event-detail]");
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
    const [titulo, fecha, categoria, origen, importancia, descripcion] = [
      card.querySelector("h3"), card.querySelector(".timeline-detail-event__header p"), card.querySelectorAll("dd")[0], card.querySelectorAll("dd")[1], card.querySelectorAll("dd")[2], card.querySelector(".timeline-detail-event__description")
    ];
    titulo.textContent = evento.titulo;
    fecha.textContent = formatearFecha(evento.fechaEvento);
    categoria.textContent = evento.categoria || "Sin categoría";
    origen.textContent = evento.origen === "automatico" ? "Automático" : "Manual";
    importancia.textContent = textoImportancia(evento.importancia);
    descripcion.textContent = evento.descripcion || "Sin descripción disponible.";
    const detalles = card.querySelector("dl");
    [
      ["Fecha final", evento.fechaFin ? formatearFecha(evento.fechaFin) : "No aplica"],
      ["Hora", evento.fechaEvento.getHours() || evento.fechaEvento.getMinutes() ? evento.fechaEvento.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "No especificada"],
      ["Referencia", evento.referenciaId ? `${evento.referenciaTipo || "Relacionada"} · ${evento.referenciaId}` : "No aplica"]
    ].forEach(([etiqueta, valor]) => {
      const item = document.createElement("div");
      item.innerHTML = `<dt>${escaparHTML(etiqueta)}</dt><dd>${escaparHTML(valor)}</dd>`;
      detalles.appendChild(item);
    });
    card.dataset.eventId = evento.id;
    fragmento.appendChild(card);
  });
  contenido.appendChild(fragmento);
  panel.hidden = false;
}
