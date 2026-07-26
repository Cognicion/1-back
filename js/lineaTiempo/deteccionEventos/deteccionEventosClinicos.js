import { registrarEventoAuditoria } from "../../services/auditoria.js";
import { obtenerFuentesEventosClinicos } from "./fuentesEventosClinicosService.js";
import { extraerEventosClinicosLocales } from "./extraccionEventosService.js";
import { deduplicarEventosDetectados } from "./deduplicacionEventosDetectados.js";
import {
  aceptarSugerenciaEvento,
  cargarSugerenciasEventosDetectados,
  descartarSugerenciaEvento,
  guardarSugerenciasDetectadas,
  restaurarSugerenciaEvento
} from "./eventosDetectadosRepository.js";
import {
  asegurarSeccionEventosDetectados,
  mostrarErrorTarjeta,
  obtenerEdicionTarjeta,
  renderizarEstadoDeteccion,
  renderizarSugerenciasEventos
} from "./eventosDetectadosRenderer.js";

export async function inicializarDeteccionEventosClinicos({
  root,
  pacienteId,
  usuarioUid,
  permisos,
  obtenerEventosExistentes,
  onEventoCreado
}) {
  let sugerencias = [];
  let mostrarDescartados = false;
  let buscando = false;
  let destruido = false;
  asegurarSeccionEventosDetectados(root);

  async function cargarGuardadas() {
    sugerencias = await cargarSugerenciasEventosDetectados(pacienteId);
    if (destruido) return;
    renderizarSugerenciasEventos(root, sugerencias, { mostrarDescartados });
    const pendientes = sugerencias.filter((item) => item.estado === "pendiente").length;
    renderizarEstadoDeteccion(root, pendientes ? `${pendientes} eventos pendientes de revision.` : "No hay sugerencias pendientes.");
  }

  async function buscarNuevosEventos() {
    if (buscando) return;
    if (!permisos?.puedeLeer) return;
    buscando = true;
    renderizarEstadoDeteccion(root, "Analizando fuentes clinicas…");
    try {
      await auditar("inicio_deteccion_eventos", pacienteId, usuarioUid);
      const { paciente, fragmentos, errores } = await obtenerFuentesEventosClinicos({ pacienteId, usuarioUid });
      renderizarEstadoDeteccion(root, `Analizando documentos 0 de ${fragmentos.length}…`);
      const detectadas = deduplicarEventosDetectados(
        extraerEventosClinicosLocales(fragmentos, paciente),
        pacienteId
      );
      sugerencias = await guardarSugerenciasDetectadas({
        pacienteId,
        sugerencias: detectadas,
        usuarioUid,
        eventosExistentes: obtenerEventosExistentes?.() || []
      });
      const pendientes = sugerencias.filter((item) => item.estado === "pendiente").length;
      const resumenErrores = errores.length ? ` ${errores.length} fuentes no pudieron analizarse.` : "";
      renderizarSugerenciasEventos(root, sugerencias, { mostrarDescartados, abierto: true });
      renderizarEstadoDeteccion(root, pendientes ? `${pendientes} eventos pendientes de revision.${resumenErrores}` : `No se detectaron eventos nuevos.${resumenErrores}`);
    } catch (error) {
      renderizarEstadoDeteccion(root, "No fue posible analizar algunas fuentes.");
      console.warn("[Eventos detectados] Fallo tecnico de deteccion", error?.code || error?.message || error);
    } finally {
      buscando = false;
    }
  }

  async function aceptar(card) {
    const sugerencia = sugerencias.find((item) => item.id === card?.dataset.detectedId);
    if (!sugerencia || !permisos?.puedeEscribir) return;
    const datos = obtenerEdicionTarjeta(card);
    if (!datos.titulo) {
      mostrarErrorTarjeta(card, "El titulo es obligatorio.");
      return;
    }
    if (!datos.fechaInicioISO) {
      mostrarErrorTarjeta(card, "Selecciona una fecha antes de añadir el evento.");
      return;
    }
    try {
      const evento = await aceptarSugerenciaEvento({ pacienteId, sugerencia, datosEditados: datos, usuarioUid });
      await cargarGuardadas();
      await onEventoCreado?.(evento);
    } catch (error) {
      mostrarErrorTarjeta(card, error?.message || "No fue posible añadir el evento.");
    }
  }

  async function descartar(card) {
    const sugerenciaId = card?.dataset.detectedId;
    if (!sugerenciaId) return;
    await descartarSugerenciaEvento({ pacienteId, sugerenciaId, usuarioUid, motivo: "revision_usuario" });
    await cargarGuardadas();
  }

  async function restaurar(card) {
    const sugerenciaId = card?.dataset.detectedId;
    if (!sugerenciaId) return;
    await restaurarSugerenciaEvento({ pacienteId, sugerenciaId, usuarioUid });
    await cargarGuardadas();
  }

  function verOrigen(card) {
    const sugerencia = sugerencias.find((item) => item.id === card?.dataset.detectedId);
    if (!sugerencia) return;
    alert(`Origen: ${sugerencia.origenSubtipo || sugerencia.origenTipo}\nFecha: ${sugerencia.origenFechaISO || "sin fecha"}\n\nFragmento:\n${sugerencia.fragmentoSoporte || sugerencia.fragmentoOriginal || "Sin fragmento disponible."}`);
    auditar("abrir_origen_evento_detectado", pacienteId, usuarioUid, {
      referenciaTipo: sugerencia.origenSubtipo,
      referenciaId: sugerencia.origenId
    });
  }

  const onClick = (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const card = event.target.closest("[data-detected-id]");
    if (action === "toggle-detected-events") {
      const body = root.querySelector("[data-detected-body]");
      const toggle = root.querySelector("[data-action='toggle-detected-events']");
      if (body) body.hidden = !body.hidden;
      toggle?.setAttribute("aria-expanded", String(!body?.hidden));
    }
    if (action === "toggle-discarded-events") {
      mostrarDescartados = !mostrarDescartados;
      event.target.textContent = mostrarDescartados ? "Ocultar descartados" : "Mostrar descartados";
      renderizarSugerenciasEventos(root, sugerencias, { mostrarDescartados, abierto: true });
    }
    if (action === "search-detected-events") buscarNuevosEventos();
    if (action === "accept-detected-event") aceptar(card);
    if (action === "discard-detected-event") descartar(card);
    if (action === "restore-detected-event") restaurar(card);
    if (action === "view-detected-origin") verOrigen(card);
  };

  root.addEventListener("click", onClick);
  await cargarGuardadas();
  return {
    buscarNuevosEventos,
    destruir() {
      destruido = true;
      root.removeEventListener("click", onClick);
    }
  };
}

async function auditar(accion, pacienteId, usuarioUid = "", detalles = {}) {
  try {
    await registrarEventoAuditoria({
      accion,
      modulo: "Linea de tiempo del paciente",
      descripcion: `Operacion ${accion} en deteccion asistida de eventos.`,
      usuarioUid,
      pacienteUid: pacienteId,
      detalles
    });
  } catch {
    // Auditoria no debe bloquear la deteccion ni exponer contenido clinico.
  }
}
