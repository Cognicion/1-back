import {
  agruparEventosPorFecha,
  calcularPosiciones,
  escaparHTML,
  formatearFecha,
  formatearFechaCorta,
  generarMarcasTemporales,
  obtenerConfiguracionTipoEvento,
  obtenerClaveFecha
} from "./lineaTiempoUtils.js";

function textoImportancia(importancia) {
  return importancia === "alta" ? "Importancia alta" : importancia === "baja" ? "Importancia baja" : "Importancia media";
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

export function renderizarLineaTiempo(root, eventos, rango, zoom = 1) {
  const canvas = root.querySelector("[data-timeline-canvas]");
  if (!canvas) return;
  canvas.replaceChildren();
  canvas.style.setProperty("--timeline-zoom", zoom);
  const grupos = agruparEventosPorFecha(eventos);
  const posiciones = calcularPosiciones(eventos, rango);
  const posicionPorId = new Map(posiciones.map((item) => [item.evento.id, item.posicion]));
  const marcas = generarMarcasTemporales(rango);
  const fragmento = document.createDocumentFragment();

  const eje = document.createElement("div");
  eje.className = "timeline-axis";
  fragmento.appendChild(eje);
  marcas.forEach((marca) => {
    const marcaNode = document.createElement("span");
    marcaNode.className = "timeline-tick";
    marcaNode.style.left = `${marca.posicion * 100}%`;
    marcaNode.textContent = formatearFechaCorta(marca.fecha);
    fragmento.appendChild(marcaNode);
  });

  grupos.forEach((grupo, grupoIndex) => {
    const posicion = grupo.items.reduce((suma, item) => suma + (posicionPorId.get(item.id) || .5), 0) / grupo.items.length;
    const bloque = document.createElement("div");
    bloque.className = `timeline-event-group timeline-event-group--${grupoIndex % 2 ? "below" : "above"}`;
    bloque.style.setProperty("--event-position", posicion);
    bloque.dataset.groupId = grupo.clave;
    bloque.setAttribute("role", "button");
    bloque.tabIndex = 0;
    bloque.setAttribute("aria-label", grupo.items.length > 1 ? `${grupo.items.length} eventos del ${formatearFecha(grupo.fecha, { timeStyle: undefined })}` : `${grupo.items[0].titulo}, ${formatearFecha(grupo.fecha)}`);
    const configuracion = obtenerConfiguracionTipoEvento(grupo.items[0].tipo);
    bloque.innerHTML = `<span class="timeline-event-stem" aria-hidden="true"></span><span class="timeline-event-dot" style="--event-color:${configuracion.color}">${escaparHTML(configuracion.icono)}</span><article class="timeline-event-card"><time>${escaparHTML(formatearFechaCorta(grupo.fecha))}</time><strong>${grupo.items.length > 1 ? `${grupo.items.length} eventos` : escaparHTML(grupo.items[0].titulo)}</strong><small>${escaparHTML(grupo.items.length > 1 ? "Abrir eventos de esta fecha" : `${configuracion.etiqueta} · ${textoImportancia(grupo.items[0].importancia)}`)}</small><p>${escaparHTML(grupo.items.length > 1 ? "Selecciona para consultar el grupo." : grupo.items[0].descripcion || "Sin descripción disponible.")}</p></article>`;
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
    categoria.textContent = `${evento.categoria || "Evento clínico"} · ${configuracion.etiqueta}`;
    origen.textContent = evento.origen === "automatico" ? "Automático" : "Manual";
    importancia.textContent = textoImportancia(evento.importancia);
    descripcion.textContent = evento.descripcion || "Sin descripción disponible.";
    card.dataset.eventId = evento.id;
    fragmento.appendChild(card);
  });
  contenido.appendChild(fragmento);
  panel.hidden = false;
}
