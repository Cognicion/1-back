import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "../data/escalasPsiquiatricas.js";
import {
  ESCALAS_COGNITIVAS,
  calcularPuntajeEscalaCognitiva,
  interpretarEscalaCognitiva,
  obtenerPuntajesDominioCognitivo
} from "../data/escalasCognitivas.js";
import { ESCALAS_SOLICITADAS, ESCALAS_COMPLETAS_ADICIONALES } from "../data/escalasSolicitadas.js";
import {
  calcularPuntajeEscala,
  guardarEscalaAplicada,
  obtenerOpcionesItemEscala,
  obtenerPuntajesDominioEscala,
  textoItemEscala
} from "../services/escalas.js";
import { analizarResultadoEscala } from "../services/analisisClinicoEscala.js";

let inicializado = false;
let escalaActual = null;
let modoActual = "aplicar";
let registroPrevioActual = "resultado";
let contextoActual = {};

const ESCALAS = [
  ...ESCALAS_PSIQUIATRICAS,
  ...ESCALAS_COGNITIVAS,
  ...ESCALAS_SOLICITADAS,
  ...ESCALAS_COMPLETAS_ADICIONALES
];

function escaparHTML(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemsDeEscala(escala) {
  return Array.isArray(escala?.items)
    ? escala.items
    : Array.isArray(escala?.reactivos) ? escala.reactivos : [];
}

function fechaLocalParaInput() {
  const fecha = new Date();
  const ajuste = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha.getTime() - ajuste).toISOString().slice(0, 16);
}

function fechaParaGuardar(valor) {
  const fecha = new Date(valor || "");
  return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString();
}

function todasLasEscalas() {
  return ESCALAS.filter((escala, index, lista) => lista.findIndex((item) => item.id === escala.id) === index);
}

function crearModal() {
  if (document.getElementById("modalEscalaPaciente")) return;
  const modal = document.createElement("section");
  modal.id = "modalEscalaPaciente";
  modal.className = "modal-escala-paciente";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-escala-paciente-velo" data-cerrar-escala-paciente></div>
    <div class="modal-escala-paciente-panel" role="dialog" aria-modal="true" aria-labelledby="tituloEscalaPaciente">
      <div class="panel-header">
        <div>
          <span id="modoEscalaPacienteEtiqueta" class="texto-suave">Escala</span>
          <h2 id="tituloEscalaPaciente">Escala</h2>
          <p id="descripcionEscalaPaciente" class="texto-suave"></p>
        </div>
        <button type="button" class="boton-secundario" data-cerrar-escala-paciente>Cerrar</button>
      </div>
      <div class="form-grid">
        <label>Escala
          <select id="selectorEscalaPaciente"></select>
        </label>
        <label>Fecha y hora de aplicacion o registro
          <input id="fechaEscalaPaciente" type="datetime-local">
        </label>
      </div>
      <div id="tipoRegistroEscalaPaciente" class="form-actions"></div>
      <p id="avisoEscalaPaciente" class="texto-suave"></p>
      <form id="formEscalaPaciente" class="form-escala-paciente"></form>
      <label id="campoPuntajeEscalaPaciente">Resultado total
        <input id="puntajeEscalaPaciente" type="number" step="any">
      </label>
      <label>Interpretacion
        <textarea id="interpretacionEscalaPaciente" rows="3" placeholder="Interpretacion clinica o referencia del registro previo"></textarea>
      </label>
      <label>Observaciones
        <textarea id="observacionesEscalaPaciente" rows="3" placeholder="Observaciones opcionales"></textarea>
      </label>
      <div id="resultadoCalculadoEscalaPaciente" class="resultado-escala-paciente"></div>
      <div class="form-actions">
        <button type="button" id="calcularEscalaPaciente">Calcular resultado</button>
        <button type="button" id="guardarEscalaPaciente">Guardar escala</button>
        <button type="button" class="boton-secundario" data-cerrar-escala-paciente>Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function obtenerEscalaSeleccionada() {
  const id = document.getElementById("selectorEscalaPaciente")?.value;
  return todasLasEscalas().find((escala) => escala.id === id) || null;
}

function renderizarSelector() {
  const selector = document.getElementById("selectorEscalaPaciente");
  if (!selector) return;
  selector.innerHTML = todasLasEscalas().map((escala) => `
    <option value="${escaparHTML(escala.id)}">${escaparHTML(escala.nombre)} · ${escaparHTML(escala.area || "Clinica")}</option>
  `).join("");
  if (escalaActual) selector.value = escalaActual.id;
}

function renderizarTipoRegistro() {
  const contenedor = document.getElementById("tipoRegistroEscalaPaciente");
  if (!contenedor) return;
  if (modoActual !== "previa") {
    contenedor.innerHTML = `<span class="texto-suave">Se registraran todos los items de la escala.</span>`;
    return;
  }
  contenedor.innerHTML = `
    <span class="texto-suave">Tipo de registro previo:</span>
    <label><input type="radio" name="tipoRegistroEscalaPaciente" value="resultado" ${registroPrevioActual === "resultado" ? "checked" : ""}> Solo resultado</label>
    <label><input type="radio" name="tipoRegistroEscalaPaciente" value="items" ${registroPrevioActual === "items" ? "checked" : ""}> Resultado e items</label>`;
  contenedor.querySelectorAll("[name=tipoRegistroEscalaPaciente]").forEach((control) => {
    control.addEventListener("change", () => {
      registroPrevioActual = control.value;
      renderizarFormulario();
    });
  });
}

function renderizarFormulario() {
  escalaActual = obtenerEscalaSeleccionada() || escalaActual;
  const form = document.getElementById("formEscalaPaciente");
  const puntaje = document.getElementById("campoPuntajeEscalaPaciente");
  const aviso = document.getElementById("avisoEscalaPaciente");
  if (!form || !escalaActual) return;

  const items = itemsDeEscala(escalaActual);
  const capturarItems = modoActual === "aplicar" || registroPrevioActual === "items";
  document.getElementById("modoEscalaPacienteEtiqueta").textContent = modoActual === "aplicar"
    ? "Aplicar escala"
    : "Registrar escala previa";
  document.getElementById("tituloEscalaPaciente").textContent = escalaActual.nombre || "Escala";
  document.getElementById("descripcionEscalaPaciente").textContent = escalaActual.descripcion || "";
  aviso.textContent = capturarItems
    ? `Se muestran todos los items disponibles (${items.length}). Debes responderlos todos para calcular el resultado.`
    : "Captura el resultado total y, si existe, la interpretacion del registro previo.";
  puntaje.style.display = capturarItems ? "none" : "block";
  form.innerHTML = capturarItems ? items.map((item, index) => {
    const opciones = obtenerOpcionesItemEscala(escalaActual, item);
    const texto = textoItemEscala(item) || `Item ${index + 1}`;
    if (opciones.length || item?.tipo === "select") {
      return `<label class="item-escala-paciente"><span>${index + 1}. ${escaparHTML(texto)}</span><select data-item-escala-paciente="${index}"><option value="">Seleccionar</option>${opciones.map((opcion) => `<option value="${Number(opcion.valor)}">${escaparHTML(opcion.texto)} (${Number(opcion.valor)})</option>`).join("")}</select><small>${escaparHTML(item?.dominio || "")}</small></label>`;
    }
    return `<label class="item-escala-paciente"><span>${index + 1}. ${escaparHTML(texto)}</span><input type="number" data-item-escala-paciente="${index}" min="${item?.min ?? ""}" max="${item?.max ?? ""}" step="${item?.step ?? 1}" placeholder="${item?.min ?? ""}-${item?.max ?? ""}"><small>${escaparHTML(item?.dominio || "")}</small></label>`;
  }).join("") : "";
  document.getElementById("resultadoCalculadoEscalaPaciente").innerHTML = "";
}

function leerRespuestas() {
  const items = itemsDeEscala(escalaActual);
  const respuestas = [];
  let valido = true;
  document.querySelectorAll("[data-item-escala-paciente]").forEach((control) => {
    const index = Number(control.dataset.itemEscalaPaciente);
    const item = items[index] || {};
    const valor = control.value === "" ? null : Number(control.value);
    const min = item.min == null ? Number.NEGATIVE_INFINITY : Number(item.min);
    const max = item.max == null ? Number.POSITIVE_INFINITY : Number(item.max);
    const invalido = valor === null || Number.isNaN(valor) || valor < min || valor > max;
    control.classList.toggle("campo-error", invalido);
    if (invalido) valido = false;
    respuestas.push({
      item: textoItemEscala(item) || `Item ${index + 1}`,
      dominio: item.dominio || "",
      valor,
      respuesta: control.tagName === "SELECT" ? control.options[control.selectedIndex]?.textContent || "" : control.value
    });
  });
  return { respuestas, valido };
}

function calcularResultado() {
  const capturarItems = modoActual === "aplicar" || registroPrevioActual === "items";
  let respuestas = [];
  let puntaje;
  let valido = true;
  if (capturarItems) {
    const lectura = leerRespuestas();
    respuestas = lectura.respuestas;
    valido = lectura.valido;
    if (!valido) {
      document.getElementById("resultadoCalculadoEscalaPaciente").textContent = "Responde todos los items y revisa los rangos marcados.";
      return null;
    }
    puntaje = escalaActual.tipoEscala === "cognitiva"
      ? calcularPuntajeEscalaCognitiva(escalaActual, respuestas)
      : calcularPuntajeEscala(respuestas, escalaActual);
  } else {
    puntaje = Number(document.getElementById("puntajeEscalaPaciente")?.value);
    valido = Number.isFinite(puntaje);
    if (!valido) {
      document.getElementById("resultadoCalculadoEscalaPaciente").textContent = "Captura un resultado total valido.";
      return null;
    }
  }
  const interpretacionAuto = escalaActual.tipoEscala === "cognitiva"
    ? interpretarEscalaCognitiva(escalaActual, puntaje, respuestas)
    : typeof escalaActual.interpretarPuntaje === "function"
      ? escalaActual.interpretarPuntaje(puntaje, respuestas)
      : interpretarEscala(escalaActual, puntaje);
  const interpretacionInput = document.getElementById("interpretacionEscalaPaciente");
  if (interpretacionInput && !interpretacionInput.value.trim()) interpretacionInput.value = interpretacionAuto || "";
  const dominios = escalaActual.tipoEscala === "cognitiva"
    ? obtenerPuntajesDominioCognitivo(respuestas)
    : obtenerPuntajesDominioEscala(respuestas);
  const resultado = { respuestas, puntaje, interpretacion: interpretacionInput?.value.trim() || interpretacionAuto || "", dominios };
  document.getElementById("resultadoCalculadoEscalaPaciente").innerHTML = `<strong>${escaparHTML(escalaActual.nombre)}: ${escaparHTML(puntaje)}${escalaActual.puntajeMaximo ? `/${escaparHTML(escalaActual.puntajeMaximo)}` : ""}</strong><p>${escaparHTML(resultado.interpretacion)}</p>`;
  return resultado;
}

async function guardarResultado() {
  const idPaciente = contextoActual.getPatientId?.();
  if (!idPaciente || !escalaActual) return;
  const resultado = calcularResultado();
  if (!resultado) return;
  const paciente = contextoActual.getPatientData?.() || {};
  const profesional = contextoActual.getProfessional?.() || {};
  const visible = false;
  const registro = {
    idPaciente,
    uidMedico: profesional.uid || profesional.uidMedico || "",
    uidProfesional: profesional.uid || profesional.uidMedico || "",
    rolProfesional: profesional.rol || "",
    nombrePaciente: paciente.nombre || paciente.nombreCompleto || "Paciente",
    nombreEscala: escalaActual.nombre,
    escalaId: escalaActual.id,
    tipoEscala: escalaActual.tipoEscala || escalaActual.area || "clinica",
    fechaAplicacion: fechaParaGuardar(document.getElementById("fechaEscalaPaciente")?.value),
    origen: "expediente_paciente",
    modoAplicacion: modoActual === "aplicar" ? "aplicacion_interactiva" : registroPrevioActual === "items" ? "registro_previo_con_items" : "registro_previo_resultado",
    capturaCompleta: modoActual === "aplicar" || registroPrevioActual === "items",
    puntajeTotal: resultado.puntaje,
    puntajeMaximo: escalaActual.puntajeMaximo || "",
    dominiosEvaluados: escalaActual.dominiosEvaluados || [],
    puntajesPorDominio: resultado.dominios || {},
    rango: escalaActual.rango || "",
    respuestasPorItem: resultado.respuestas,
    interpretacion: resultado.interpretacion,
    observaciones: document.getElementById("observacionesEscalaPaciente")?.value.trim() || "",
    observacionesClinicas: document.getElementById("observacionesEscalaPaciente")?.value.trim() || "",
    observacionesOpcionales: document.getElementById("observacionesEscalaPaciente")?.value.trim() || "",
    recomendaciones: "Interpretar dentro del contexto clinico.",
    aplicadoPorMedico: true,
    visiblePaciente: visible,
    visibilidadPaciente: visible,
    visibleDesdePaciente: visible,
    medicoNombre: profesional.nombre || profesional.nombreCompleto || profesional.email || ""
  };
  registro.analisisClinico = analizarResultadoEscala({
    escala: escalaActual,
    puntaje: resultado.puntaje,
    puntajeMaximo: escalaActual.puntajeMaximo || "",
    interpretacion: resultado.interpretacion,
    dominios: resultado.dominios,
    respuestas: resultado.respuestas,
    observaciones: registro.observaciones
  });
  const boton = document.getElementById("guardarEscalaPaciente");
  if (boton) boton.disabled = true;
  try {
    await guardarEscalaAplicada(idPaciente, registro);
    contextoActual.onSaved?.();
    cerrarModal();
  } catch (error) {
    console.error("No se pudo guardar la escala del expediente:", {
      stage: error?.stage || "unknown",
      code: error?.code || "unknown",
      message: error?.message || "",
      patientId: idPaciente
    });
    document.getElementById("resultadoCalculadoEscalaPaciente").textContent = error?.code === "permission-denied"
      ? "Tu cuenta no tiene permiso para guardar escalas en este expediente."
      : "No se pudo guardar la escala. Intenta nuevamente.";
  } finally {
    if (boton) boton.disabled = false;
  }
}

function abrirModal(modo) {
  modoActual = modo === "previa" ? "previa" : "aplicar";
  registroPrevioActual = "resultado";
  escalaActual = obtenerEscalaSeleccionada() || todasLasEscalas()[0] || null;
  renderizarSelector();
  document.getElementById("selectorEscalaPaciente").value = escalaActual?.id || "";
  document.getElementById("fechaEscalaPaciente").value = fechaLocalParaInput();
  document.getElementById("puntajeEscalaPaciente").value = "";
  document.getElementById("interpretacionEscalaPaciente").value = "";
  document.getElementById("observacionesEscalaPaciente").value = "";
  renderizarTipoRegistro();
  renderizarFormulario();
  const modal = document.getElementById("modalEscalaPaciente");
  modal.hidden = false;
  modal.classList.add("abierto");
}

function cerrarModal() {
  const modal = document.getElementById("modalEscalaPaciente");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.hidden = true;
}

export function inicializarEscalasPaciente(contexto = {}) {
  contextoActual = contexto;
  crearModal();
  if (inicializado) return;
  inicializado = true;
  const aplicar = document.getElementById("btnAplicarEscalaPaciente");
  const previa = document.getElementById("btnRegistrarEscalaPreviaPaciente");
  aplicar?.addEventListener("click", () => abrirModal("aplicar"));
  previa?.addEventListener("click", () => abrirModal("previa"));
  document.getElementById("selectorEscalaPaciente")?.addEventListener("change", () => {
    escalaActual = obtenerEscalaSeleccionada();
    renderizarFormulario();
  });
  document.getElementById("calcularEscalaPaciente")?.addEventListener("click", calcularResultado);
  document.getElementById("guardarEscalaPaciente")?.addEventListener("click", guardarResultado);
  document.querySelectorAll("[data-cerrar-escala-paciente]").forEach((elemento) => elemento.addEventListener("click", cerrarModal));
}
