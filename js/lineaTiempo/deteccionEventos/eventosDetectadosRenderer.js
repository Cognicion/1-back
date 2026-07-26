import { ESTADOS_EVENTO_DETECTADO, nivelConfianza } from "./eventosDetectadosUtils.js";

export function asegurarSeccionEventosDetectados(root) {
  let seccion = root.querySelector("[data-detected-events-section]");
  if (seccion) return seccion;
  seccion = document.createElement("section");
  seccion.className = "timeline-detected";
  seccion.dataset.detectedEventsSection = "";
  seccion.innerHTML = `
    <header class="timeline-detected__header">
      <button type="button" class="timeline-detected__toggle" data-action="toggle-detected-events" aria-expanded="false">
        <span>Eventos detectados</span>
        <strong data-detected-count>0 pendientes</strong>
      </button>
      <div class="timeline-detected__actions">
        <button type="button" class="timeline-button timeline-button--primary" data-action="search-detected-events">Buscar nuevos eventos</button>
        <button type="button" class="timeline-button" data-action="toggle-discarded-events">Mostrar descartados</button>
      </div>
    </header>
    <p class="timeline-detected__status" data-detected-status>No se han buscado eventos nuevos.</p>
    <div class="timeline-detected__body" data-detected-body hidden></div>
  `;
  root.querySelector("[data-timeline-shell]")?.after(seccion);
  return seccion;
}

export function renderizarEstadoDeteccion(root, mensaje = "") {
  asegurarSeccionEventosDetectados(root).querySelector("[data-detected-status]").textContent = mensaje;
}

export function renderizarSugerenciasEventos(root, sugerencias = [], { mostrarDescartados = false, abierto = false } = {}) {
  const seccion = asegurarSeccionEventosDetectados(root);
  const pendientes = sugerencias.filter((item) => item.estado === ESTADOS_EVENTO_DETECTADO.pendiente);
  const visibles = sugerencias.filter((item) => mostrarDescartados || item.estado !== ESTADOS_EVENTO_DETECTADO.descartado);
  seccion.querySelector("[data-detected-count]").textContent = `${pendientes.length} pendientes`;
  const toggle = seccion.querySelector("[data-action='toggle-detected-events']");
  const body = seccion.querySelector("[data-detected-body]");
  const debeAbrir = abierto || pendientes.length > 0;
  toggle.setAttribute("aria-expanded", String(debeAbrir));
  body.hidden = !debeAbrir;
  body.replaceChildren();
  if (!visibles.length) {
    body.append(crearMensaje("No se detectaron eventos nuevos."));
    return;
  }
  visibles.forEach((sugerencia) => body.append(crearTarjetaSugerencia(sugerencia)));
}

function crearMensaje(texto) {
  const p = document.createElement("p");
  p.className = "timeline-detected__empty";
  p.textContent = texto;
  return p;
}

function crearTarjetaSugerencia(sugerencia) {
  const card = document.createElement("article");
  card.className = `timeline-detected-card timeline-detected-card--${sugerencia.estado}`;
  card.dataset.detectedId = sugerencia.id;
  const fecha = sugerencia.fechaInicioISO
    ? `${sugerencia.fechaInicioISO}${sugerencia.fechaFinISO ? ` → ${sugerencia.fechaFinISO}` : ""}`
    : "Fecha pendiente de confirmar";
  const aproximada = sugerencia.requiereRevisionFecha ? " · Fecha aproximada o pendiente" : "";
  card.innerHTML = `
    <div class="timeline-detected-card__meta">
      <span>Evento detectado</span>
      <span>${sugerencia.estado}</span>
    </div>
    <label>Titulo sugerido <input data-detected-field="titulo" maxlength="160"></label>
    <div class="timeline-detected-card__grid">
      <label>Fecha <input data-detected-field="fechaInicioISO" type="date"></label>
      <label>Fecha final <input data-detected-field="fechaFinISO" type="date"></label>
      <label>Importancia
        <select data-detected-field="importancia">
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
      </label>
    </div>
    <label>Descripcion <textarea data-detected-field="descripcion" maxlength="1200" rows="3"></textarea></label>
    <p class="timeline-detected-card__date">${fecha} · ${sugerencia.precisionTemporal}${aproximada}</p>
    <p class="timeline-detected-card__source">Fuente: ${sugerencia.origenSubtipo || sugerencia.origenTipo || "fuente clinica"} · Confianza ${nivelConfianza(sugerencia.confianza)} · Sujeto: ${sugerencia.sujeto || "paciente"}</p>
    ${sugerencia.posibleDuplicadoEventoId ? '<p class="timeline-detected-card__warning">Posible duplicado de un evento ya agregado.</p>' : ""}
    <details class="timeline-detected-card__fragment"><summary>Fragmento donde se detecto</summary><p></p></details>
    <p class="timeline-form-error" data-detected-error role="alert"></p>
    <div class="timeline-detected-card__actions"></div>
  `;
  card.querySelector("[data-detected-field='titulo']").value = sugerencia.tituloSugerido || "";
  card.querySelector("[data-detected-field='fechaInicioISO']").value = sugerencia.fechaInicioISO || "";
  card.querySelector("[data-detected-field='fechaFinISO']").value = sugerencia.fechaFinISO || "";
  card.querySelector("[data-detected-field='importancia']").value = sugerencia.importanciaSugerida || "media";
  card.querySelector("[data-detected-field='descripcion']").value = sugerencia.descripcionSugerida || "";
  card.querySelector(".timeline-detected-card__fragment p").textContent = sugerencia.fragmentoSoporte || sugerencia.fragmentoOriginal || "";
  const acciones = card.querySelector(".timeline-detected-card__actions");
  if (sugerencia.estado === ESTADOS_EVENTO_DETECTADO.descartado) {
    acciones.append(boton("Restaurar", "restore-detected-event", "timeline-button"));
  } else if (sugerencia.estado === ESTADOS_EVENTO_DETECTADO.pendiente) {
    acciones.append(
      boton("Añadir a la línea de tiempo", "accept-detected-event", "timeline-button timeline-button--primary"),
      boton("Descartar", "discard-detected-event", "timeline-button"),
      boton("Ver origen", "view-detected-origin", "timeline-button")
    );
  } else {
    acciones.append(boton("Ver origen", "view-detected-origin", "timeline-button"));
  }
  return card;
}

function boton(texto, action, clase) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = clase;
  button.dataset.action = action;
  button.textContent = texto;
  return button;
}

export function obtenerEdicionTarjeta(card) {
  return {
    titulo: card.querySelector("[data-detected-field='titulo']")?.value.trim() || "",
    descripcion: card.querySelector("[data-detected-field='descripcion']")?.value.trim() || "",
    fechaInicioISO: card.querySelector("[data-detected-field='fechaInicioISO']")?.value || "",
    fechaFinISO: card.querySelector("[data-detected-field='fechaFinISO']")?.value || "",
    importancia: card.querySelector("[data-detected-field='importancia']")?.value || "media"
  };
}

export function mostrarErrorTarjeta(card, mensaje = "") {
  const nodo = card?.querySelector("[data-detected-error]");
  if (nodo) nodo.textContent = mensaje;
}
