import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { aplicarAparienciaGuardada } from "./services/apariencia.js";
import { canAccessSofia, canUseSofiaPatientContext, isAdministrator } from "./utils/roles.js";
import { emitSofiaState } from "./sofia-mascota/mascotaEvents.js";
import { analyzeSelectedPatient, listAuthorizedSofiaPatients, renderClinicalAnalysis, renderClinicalAnalysisError } from "./sofia/clinicalAnalysis/clinicalAnalysisController.js?v=20260821-patient-pattern-profile-v1";
import { createSofiaUnifiedClient } from "./sofia/sofiaUnifiedClient.js";
import { applySofiaPageActions, collectSofiaPageState } from "./sofia/pageTools.js?v=20260821-patient-pattern-profile-v1";
import { listenForSofiaPatternContext } from "./patient-patterns/patternSofiaBridge.js";
import { renderEcgInterpretation } from "./sofia/electrocardiogram/ecgRenderer.js?v=20260821-sofia-ecg-v1";
import { interpretPatientElectrocardiogram } from "./services/sofiaElectrocardiograma.js?v=20260821-sofia-ecg-v1";
import {
  analizarInteraccionesMedicamentos,
  cargarExpedientePacienteSofia,
  construirLineaTiempo,
  construirMapaRelaciones,
  construirPacienteDigital,
  generarAlertasInteligentes,
  generarCriticaNota,
  generarNarrativaClinica,
  generarRazonamientoClinico,
  generarRecomendacionesLaboratorio,
  obtenerBaseFarmacologicaInicial
} from "./services/sofiaClinica.js?v=20260826-cuenta-profesional-gratuita-v1";

aplicarAparienciaGuardada();

const estadoAcceso = document.getElementById("estadoAcceso");
const chatBox = document.getElementById("chatBox");
const formSofia = document.getElementById("formSofia");
const mensajeSofia = document.getElementById("mensajeSofia");
const botonEnviar = formSofia?.querySelector("button");
const selectorPaciente = document.getElementById("selectorPacienteSofia");
const buscarPacienteSofia = document.getElementById("buscarPacienteSofia");
const resultadosPacientesSofia = document.getElementById("resultadosPacientesSofia");
const recargarSofia = document.getElementById("recargarSofia");
const buscarTimeline = document.getElementById("buscarTimelineSofia");
const notaCritica = document.getElementById("notaCriticaSofia");
const analizarNota = document.getElementById("analizarNotaSofia");
const limpiarCritica = document.getElementById("limpiarCriticaSofia");
const sofiaUnifiedClient = createSofiaUnifiedClient();

let usuarioActual = null;
let perfilActual = null;
let enviandoMensaje = false;
let pacientesSofia = [];
let expedienteActual = null;
let timelineActual = [];
let panelContextActual = {};
let notaCriticaActual = [];
let contextoPatronPendiente = null;
let ultimaClaveContextoPatron = "";
let indicePacienteActivo = -1;
let puedeUsarContextoPaciente = false;

function aplicarModoAccesoSofia(perfil = {}) {
  const admin = isAdministrator(perfil);
  puedeUsarContextoPaciente = canUseSofiaPatientContext(perfil);
  const adminPuro = admin && !puedeUsarContextoPaciente;
  document.body.classList.toggle("sofia-mode-admin", adminPuro);
  document.querySelectorAll("[data-sofia-clinical-link]").forEach((link) => {
    link.hidden = adminPuro;
  });
  const adminLink = document.querySelector("[data-sofia-admin-link]");
  if (adminLink) adminLink.hidden = !admin;
  const bienvenida = document.getElementById("mensajeBienvenidaSofia");
  if (adminPuro && bienvenida) {
    bienvenida.textContent = "Hola. Soy SOFÍA en modo administrativo. Puedo ayudarte con conocimiento agregado, matrices y relaciones globales, sin acceder a expedientes ni contexto clínico individual.";
  }
  return { admin, adminPuro, patientContext: puedeUsarContextoPaciente };
}

function agregarMensaje(texto, tipo, claseExtra = "") {
  const div = document.createElement("div");
  div.className = `msg ${tipo} ${claseExtra}`.trim();
  div.textContent = texto;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function agregarTrazasHerramientas(messageElement, result = {}) {
  const names = [...new Set((result.toolsUsed || []).filter((item) => item.status === "completed").map((item) => item.name))];
  if (!names.length && !result.legacyFallback) return;
  const trace = document.createElement("small");
  trace.className = "msg-tools";
  trace.textContent = result.legacyFallback
    ? "Modo compatible: chat sin herramientas clínicas."
    : `Herramientas utilizadas: ${names.join(", ")}.`;
  messageElement.appendChild(trace);
}

function sugerenciaPatron(patternId = "") {
  const label = String(patternId || "este patrón").replace(/^pattern-/, "").replaceAll("_", " ");
  return `¿Cómo se detectó ${label} y qué evidencia, parámetros e historial utilizaste?`;
}

async function aplicarContextoPatronSofia(context = {}) {
  if (!puedeUsarContextoPaciente) return;
  const patientId = String(context.patientId || "");
  const patternId = String(context.patternId || "");
  if (!patientId || !patternId || !pacientesSofia.length) {
    contextoPatronPendiente = context;
    return;
  }
  const authorized = pacientesSofia.some((patient) => patient.id === patientId);
  if (!authorized) return;
  const key = `${patientId}:${patternId}:${context.instrumentId || ""}`;
  if (key === ultimaClaveContextoPatron) return;
  ultimaClaveContextoPatron = key;
  contextoPatronPendiente = null;
  if (selectorPaciente.value !== patientId) await seleccionarPacienteSofia(patientId);
  const suggestion = sugerenciaPatron(patternId);
  if (mensajeSofia) {
    mensajeSofia.value = suggestion;
    mensajeSofia.focus();
  }
  agregarMensaje("Contexto del Detector de Patrones recibido. Puedes preguntar: ¿Cómo se detectó?, ¿con qué notas?, ¿cómo se calculó BSS?, ¿qué información falta? o ¿cómo cambió con el tiempo?", "sofia");
  document.getElementById("chatBox")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
}

listenForSofiaPatternContext((context) => { void aplicarContextoPatronSofia(context); });
document.addEventListener("sofia:ask-pattern", (event) => {
  const detail = event.detail || {};
  if (mensajeSofia) {
    mensajeSofia.value = sugerenciaPatron(detail.patternId);
    mensajeSofia.focus();
  }
  document.getElementById("chatBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

function bloquearAcceso(mensaje) {
  estadoAcceso.textContent = mensaje;
  if (formSofia) formSofia.style.display = "none";
  if (selectorPaciente) selectorPaciente.disabled = true;
  if (buscarPacienteSofia) buscarPacienteSofia.disabled = true;
  if (recargarSofia) recargarSofia.disabled = true;
}

function activarCarga() {
  enviandoMensaje = true;
  mensajeSofia.disabled = true;
  if (botonEnviar) {
    botonEnviar.disabled = true;
    botonEnviar.textContent = "Pensando...";
  }
}

function desactivarCarga() {
  enviandoMensaje = false;
  mensajeSofia.disabled = false;
  if (botonEnviar) {
    botonEnviar.disabled = false;
    botonEnviar.textContent = "Enviar";
  }
  mensajeSofia.focus();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  usuarioActual = user;
  try {
    const snapUsuario = await getDoc(doc(db, "usuarios", user.uid));
    if (!snapUsuario.exists()) {
      bloquearAcceso("Acceso restringido. Perfil no encontrado.");
      return;
    }
    perfilActual = snapUsuario.data();
    if (!canAccessSofia(perfilActual)) {
      bloquearAcceso("Acceso restringido. SOFÍA está disponible únicamente para personal autorizado.");
      return;
    }
    const mode = aplicarModoAccesoSofia(perfilActual);
    if (mode.adminPuro) {
      estadoAcceso.textContent = "Modo administrativo de SOFÍA. Chat general y conocimiento agregado, sin contexto clínico individual.";
      if (formSofia) formSofia.style.display = "flex";
      if (buscarPacienteSofia) buscarPacienteSofia.disabled = true;
      if (recargarSofia) recargarSofia.disabled = true;
      return;
    }
    estadoAcceso.textContent = "Acceso concedido. SOFIA v2 trabaja en modo explicable y no modifica el expediente.";
    await cargarSelectorPacientes();
  } catch (error) {
    console.debug("[SOFÍA][AUTH_ERROR]", { code: String(error?.code || error?.name || "unknown").slice(0, 120) });
    bloquearAcceso("No se pudo verificar el acceso. Intenta iniciar sesion nuevamente.");
  }
});

async function cargarSelectorPacientes() {
  if (!puedeUsarContextoPaciente) return;
  if (buscarPacienteSofia) {
    buscarPacienteSofia.disabled = true;
    buscarPacienteSofia.placeholder = "Cargando pacientes...";
  }
  pacientesSofia = await listAuthorizedSofiaPatients();
  if (!pacientesSofia.length) {
    if (buscarPacienteSofia) buscarPacienteSofia.placeholder = "Sin pacientes disponibles";
    renderEstadoVacio("No hay pacientes disponibles para SOFIA con los permisos actuales.");
    return;
  }
  if (buscarPacienteSofia) {
    buscarPacienteSofia.disabled = false;
    buscarPacienteSofia.placeholder = "Escribe el nombre del paciente";
  }
  if (contextoPatronPendiente) await aplicarContextoPatronSofia(contextoPatronPendiente);
}

function normalizarBusquedaPaciente(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function cerrarResultadosPacientes() {
  indicePacienteActivo = -1;
  if (resultadosPacientesSofia) {
    resultadosPacientesSofia.hidden = true;
    resultadosPacientesSofia.replaceChildren();
  }
  buscarPacienteSofia?.setAttribute("aria-expanded", "false");
}

function actualizarPacienteActivo() {
  const options = [...(resultadosPacientesSofia?.querySelectorAll("[role='option']") || [])];
  options.forEach((option, index) => {
    const active = index === indicePacienteActivo;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-selected", String(active));
  });
}

function coincidenciasPacientes(query = "") {
  const termino = normalizarBusquedaPaciente(query);
  if (!termino) return [];
  return pacientesSofia.filter((patient) => normalizarBusquedaPaciente(patient.label).includes(termino));
}

function renderResultadosPacientes(query = "") {
  if (!resultadosPacientesSofia) return [];
  const coincidencias = coincidenciasPacientes(query);
  resultadosPacientesSofia.replaceChildren();
  indicePacienteActivo = -1;

  if (!normalizarBusquedaPaciente(query)) {
    cerrarResultadosPacientes();
    return coincidencias;
  }

  if (!coincidencias.length) {
    const empty = document.createElement("p");
    empty.className = "sofia-patient-results__empty";
    empty.textContent = "No hay coincidencias entre tus pacientes autorizados.";
    resultadosPacientesSofia.append(empty);
  } else {
    coincidencias.forEach((patient) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "sofia-patient-results__option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = patient.label || "Paciente";
      option.addEventListener("click", () => { void seleccionarPacienteSofia(patient.id); });
      resultadosPacientesSofia.append(option);
    });
  }

  resultadosPacientesSofia.hidden = false;
  buscarPacienteSofia?.setAttribute("aria-expanded", "true");
  return coincidencias;
}

async function seleccionarPacienteSofia(patientId) {
  if (!puedeUsarContextoPaciente) return;
  const patient = pacientesSofia.find((candidate) => candidate.id === patientId);
  if (!patient || !selectorPaciente) return;
  selectorPaciente.value = patient.id;
  if (buscarPacienteSofia) buscarPacienteSofia.value = patient.label || "Paciente";
  cerrarResultadosPacientes();
  await cargarPacienteSeleccionado(patient.id);
}

buscarPacienteSofia?.addEventListener("input", () => {
  if (selectorPaciente) selectorPaciente.value = "";
  renderResultadosPacientes(buscarPacienteSofia.value);
});

buscarPacienteSofia?.addEventListener("keydown", (event) => {
  const coincidencias = coincidenciasPacientes(buscarPacienteSofia.value);
  if (event.key === "Escape") {
    cerrarResultadosPacientes();
    return;
  }
  if (!coincidencias.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;

  if (event.key === "Enter") {
    const patient = coincidencias[indicePacienteActivo] || (coincidencias.length === 1 ? coincidencias[0] : null);
    if (patient) {
      event.preventDefault();
      void seleccionarPacienteSofia(patient.id);
    }
    return;
  }

  event.preventDefault();
  indicePacienteActivo = event.key === "ArrowDown"
    ? Math.min(indicePacienteActivo + 1, coincidencias.length - 1)
    : Math.max(indicePacienteActivo - 1, 0);
  actualizarPacienteActivo();
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".sofia-patient-picker")) cerrarResultadosPacientes();
});

recargarSofia?.addEventListener("click", () => {
  if (selectorPaciente.value) cargarPacienteSeleccionado(selectorPaciente.value);
});

buscarTimeline?.addEventListener("input", () => renderTimeline(filtrarTimeline(buscarTimeline.value)));

function ejecutarCriticaNota() {
  notaCriticaActual = generarCriticaNota(notaCritica.value, expedienteActual);
  renderStack("criticaNotaSofia", notaCriticaActual.map((hallazgo) => ({
    ...hallazgo,
    meta: hallazgo.nivel,
    accion: hallazgo.porQue
  })));
  return true;
}

analizarNota?.addEventListener("click", ejecutarCriticaNota);

limpiarCritica?.addEventListener("click", () => {
  notaCritica.value = "";
  notaCriticaActual = [];
  document.getElementById("criticaNotaSofia").innerHTML = "";
});

async function cargarPacienteSeleccionado(idPaciente) {
  if (!puedeUsarContextoPaciente) throw new Error("SOFIA_PATIENT_CONTEXT_FORBIDDEN");
  if (!pacientesSofia.some((patient) => patient.id === idPaciente)) {
    console.debug("[SOFÍA][SOURCE]", { panel: "patient-selection", source: "REJECTED_UNAUTHORIZED_SELECTION" });
    throw new Error("SOFIA_PATIENT_NOT_AUTHORIZED");
  }
  sofiaUnifiedClient.selectPatient(idPaciente);
  emitSofiaState("analyzing", "patient-selection");
  setLoadingPanels("Construyendo paciente digital...");
  const analysisContainer = document.getElementById("clinicalAnalysisSofia");
  if (analysisContainer) analysisContainer.innerHTML = "<p>SOFÍA está estructurando el expediente autorizado…</p>";
  try {
    const [analysisResult, expediente] = await Promise.all([
      analyzeSelectedPatient(idPaciente),
      cargarExpedientePacienteSofia(idPaciente)
    ]);
    renderClinicalAnalysis(analysisContainer, analysisResult);
    tracePanelSource("structured-analysis", "BACKEND_CANONICAL");
    expedienteActual = expediente;
    timelineActual = construirLineaTiempo(expedienteActual);
    const digital = construirPacienteDigital(expedienteActual);
    const narrativa = generarNarrativaClinica(expedienteActual);
    const razonamiento = generarRazonamientoClinico(expedienteActual);
    const alertas = generarAlertasInteligentes(expedienteActual);
    const monitorizacion = generarRecomendacionesLaboratorio(expedienteActual);
    const interacciones = analizarInteraccionesMedicamentos(expedienteActual.tratamientos || []);
    const electrocardiogram = interpretPatientElectrocardiogram(expedienteActual);
    panelContextActual = construirContextoHerramientasPagina({
      digital,
      narrativa,
      razonamiento,
      alertas,
      monitorizacion,
      interacciones,
      electrocardiogram
    });
    renderPacienteDigital(digital);
    tracePanelSource("patient-digital", "LOCAL_DETERMINISTIC");
    renderTimeline(timelineActual);
    tracePanelSource("timeline", "LOCAL_DETERMINISTIC");
    renderMapa(construirMapaRelaciones(expedienteActual));
    tracePanelSource("relationships", "LOCAL_DETERMINISTIC");
    renderNarrativa(narrativa);
    tracePanelSource("narrative", "LOCAL_DETERMINISTIC");
    renderRazonamiento(razonamiento);
    tracePanelSource("clinical-reasoning", "LOCAL_DETERMINISTIC");
    renderStack("alertasSofia", alertas);
    tracePanelSource("alerts", "LOCAL_DETERMINISTIC");
    renderStack("prediccionSofia", digital.riesgos.map((r) => ({ titulo: r.titulo, nivel: r.nivel, detalle: `Marcadores: ${(r.factores || []).join(", ")}`, accion: `Datos por verificar: ${(r.faltantes || []).join(", ")}` })));
    tracePanelSource("clinical-signals", "LOCAL_DETERMINISTIC");
    renderStack("labsSofia", monitorizacion.map((r) => ({ titulo: r.estudio, nivel: r.prioridad, detalle: r.motivo, accion: `${r.periodicidad}. ${r.relacion}` })));
    tracePanelSource("monitoring", "LOCAL_DETERMINISTIC");
    renderFarmaco(expedienteActual);
    tracePanelSource("pharmacology", "LOCAL_DETERMINISTIC");
    renderEcgInterpretation(document.getElementById("ecgSofia"), electrocardiogram);
    tracePanelSource("electrocardiogram", "LOCAL_DETERMINISTIC");
    emitSofiaState("completed", "patient-selection", { duration: 1600, fallbackState: "idle" });
  } catch (error) {
    console.debug("[SOFÍA][LOAD_ERROR]", { code: String(error?.code || error?.name || "unknown").slice(0, 120) });
    panelContextActual = {};
    renderClinicalAnalysisError(analysisContainer, error);
    emitSofiaState("error", "patient-selection", { duration: 2200, fallbackState: "idle" });
    renderEstadoVacio("No se pudo cargar el expediente del paciente seleccionado.");
  }
}

function renderPacienteDigital(digital) {
  const cont = document.getElementById("pacienteDigitalSofia");
  const dx = digital.diagnosticos[0] ? formatearDiagnostico(digital.diagnosticos[0]) : "Sin diagnostico estructurado";
  cont.classList.remove("empty-state");
  cont.innerHTML = `
    ${metric("Paciente", digital.identificacion.nombre)}
    ${metric("Edad / sexo", `${digital.identificacion.edad ?? "--"} años · ${digital.identificacion.sexo}`)}
    ${metric("Institucion", digital.identificacion.institucion)}
    ${metric("Diagnostico principal", dx)}
    ${metric("Tratamientos activos", String(digital.tratamientosActivos.length))}
    ${metric("Cobertura del expediente", `${digital.cobertura.porcentaje}%`)}
    ${metric("Sintomas detectados", digital.sintomas.slice(0, 4).join(", ") || "Sin marcadores suficientes")}
    ${metric("Factores protectores", digital.protectores.join(", ") || "No documentados")}
  `;
}

function renderTimeline(eventos) {
  const cont = document.getElementById("timelineSofia");
  if (!eventos.length) {
    cont.className = "timeline empty-state";
    cont.textContent = "Sin eventos para mostrar.";
    return;
  }
  cont.className = "timeline";
  cont.innerHTML = eventos.slice(0, 80).map((e) => `
    <button class="timeline-item" type="button" title="${escapeHtml(e.detalle)}">
      <span class="timeline-dot ${escapeHtml(e.tipo)}"></span>
      <strong>${escapeHtml(e.titulo)}</strong>
      <small>${escapeHtml(e.fecha)} · ${escapeHtml(e.categoria)}</small>
      <p>${escapeHtml(e.detalle)}</p>
    </button>
  `).join("");
}

function renderMapa(mapa) {
  const cont = document.getElementById("mapaSofia");
  if (!mapa.nodos.length) {
    cont.className = "sofia-graph empty-state";
    cont.textContent = "Sin nodos.";
    return;
  }
  cont.className = "sofia-graph";
  cont.innerHTML = mapa.nodos.map((n) => `<span class="graph-node ${escapeHtml(n.tipo)}">${escapeHtml(n.etiqueta)}</span>`).join("") +
    `<div class="graph-lines">${mapa.enlaces.slice(0, 18).map((e) => `<span>${escapeHtml(e.etiqueta)}</span>`).join("")}</div>`;
}

function renderNarrativa(texto) {
  const cont = document.getElementById("narrativaSofia");
  cont.classList.remove("empty-state");
  cont.textContent = texto;
}

function renderRazonamiento(items) {
  const cont = document.getElementById("razonamientoSofia");
  cont.className = "reasoning-list";
  cont.innerHTML = items.map((item) => `
    <details class="reason-card" open>
      <summary><span>${escapeHtml(item.titulo)}</span><small>${escapeHtml(item.tipo)} · confianza ${escapeHtml(item.confianza)}</small></summary>
      ${lista("A favor", item.aFavor)}
      ${lista("En contra / limites", item.enContra)}
      ${lista("Evidencia", item.evidencia)}
    </details>
  `).join("");
}

function renderStack(id, items) {
  const cont = document.getElementById(id);
  if (!items.length) {
    cont.className = "stack-list empty-state";
    cont.textContent = "Sin elementos relevantes.";
    return;
  }
  cont.className = "stack-list";
  cont.innerHTML = items.map((item) => `
    <article class="mini-card level-${escapeHtml(item.nivel || "rutina")}">
      <div><strong>${escapeHtml(item.titulo)}</strong><small>${escapeHtml(item.nivel || item.meta || "")}</small></div>
      <p>${escapeHtml(item.detalle || "")}</p>
      ${item.accion ? `<details><summary>Por que?</summary><p>${escapeHtml(item.accion)}</p></details>` : ""}
    </article>
  `).join("");
}

function renderFarmaco(expediente) {
  const interacciones = analizarInteraccionesMedicamentos(expediente.tratamientos || []);
  const base = obtenerBaseFarmacologicaInicial();
  const activos = (expediente.tratamientos || []).filter((t) => t.medicamento).slice(0, 8);
  const tarjetas = [];
  interacciones.forEach((i) => tarjetas.push({ titulo: i.medicamentos.join(" + "), nivel: i.severidad, detalle: i.consecuencia, accion: i.mecanismo }));
  activos.forEach((t) => {
    const ficha = base.find((f) => String(t.medicamento).toLowerCase().includes(f.clave));
    if (ficha) tarjetas.push({ titulo: ficha.nombre, nivel: ficha.clase, detalle: ficha.mecanismo, accion: `Monitorizacion: ${ficha.monitorizacion.join(", ")}` });
  });
  renderStack("farmacoSofia", tarjetas);
}

function construirContextoHerramientasPagina({ digital, narrativa, razonamiento, alertas, monitorizacion, interacciones, electrocardiogram }) {
  const diagnosticos = (digital.diagnosticos || []).slice(0, 12).map((diagnostico) => ({
    code: diagnostico.codigo || null,
    system: diagnostico.sistema || null,
    status: diagnostico.estado || null,
    label: diagnostico.nombre || diagnostico.texto || diagnostico.diagnostico || null
  }));
  const treatments = (digital.tratamientosActivos || []).slice(0, 12).map((tratamiento) => ({
    medication: tratamiento.medicamento || tratamiento.nombreMedicamento || null,
    dose: tratamiento.dosis || null,
    route: tratamiento.via || null,
    frequency: tratamiento.frecuencia || null,
    status: tratamiento.estado || tratamiento.estatus || "active"
  }));
  return {
    patient_overview: {
      age: digital.identificacion?.edad ?? null,
      registeredSex: digital.identificacion?.sexo || null,
      diagnoses: diagnosticos,
      symptoms: (digital.sintomas || []).slice(0, 20),
      treatments,
      protectiveFactors: (digital.protectores || []).slice(0, 12),
      recordCoverage: digital.cobertura || null
    },
    alerts: (alertas || []).slice(0, 20).map((alerta) => ({
      level: alerta.nivel || null,
      title: alerta.titulo || null,
      detail: alerta.detalle || null,
      rationale: alerta.porQue || null,
      actionForProfessionalReview: alerta.accion || null
    })),
    risk_estimates: (digital.riesgos || []).slice(0, 12).map((riesgo) => ({
      title: riesgo.titulo || null,
      level: riesgo.nivel || null,
      factors: (riesgo.factores || []).slice(0, 12),
      missingVariables: (riesgo.faltantes || []).slice(0, 12),
      method: "local_deterministic_clinical_signals"
    })),
    narrative: narrativa || "",
    clinical_reasoning: (razonamiento || []).slice(0, 12).map((item) => ({
      title: item.titulo || null,
      type: item.tipo || null,
      confidence: item.confianza || null,
      supportingData: (item.aFavor || []).slice(0, 10),
      limitations: (item.enContra || []).slice(0, 10),
      evidenceSources: (item.evidencia || []).slice(0, 10)
    })),
    monitoring: (monitorizacion || []).slice(0, 20).map((item) => ({
      study: item.estudio || null,
      priority: item.prioridad || null,
      rationale: item.motivo || null,
      periodicity: item.periodicidad || null,
      relationship: item.relacion || null
    })),
    pharmacology: {
      activeTreatments: treatments,
      interactions: (interacciones || []).slice(0, 20).map((item) => ({
        severity: item.severidad || null,
        medications: (item.medicamentos || []).slice(0, 8),
        mechanism: item.mecanismo || null,
        consequence: item.consecuencia || null,
        professionalReview: item.conducta || null
      }))
    },
    electrocardiogram: electrocardiogram || null
  };
}

function construirEstadoPaginaParaChat() {
  if (!puedeUsarContextoPaciente) {
    return collectSofiaPageState({ capabilities: ["chat"], panelContext: {} });
  }
  const noteReview = notaCritica?.value.trim()
    ? generarCriticaNota(notaCritica.value, expedienteActual)
    : notaCriticaActual;
  return collectSofiaPageState({
    timelineFilter: buscarTimeline?.value || "",
    hasNoteDraft: Boolean(notaCritica?.value.trim()),
    panelContext: {
      ...panelContextActual,
      note_review: (noteReview || []).slice(0, 20).map((item) => ({
        level: item.nivel || null,
        title: item.titulo || null,
        detail: item.detalle || null,
        rationale: item.porQue || null
      }))
    }
  });
}

function filtrarTimeline(valor) {
  const q = String(valor || "").toLowerCase();
  if (!q) return timelineActual;
  return timelineActual.filter((e) => `${e.titulo} ${e.detalle} ${e.categoria}`.toLowerCase().includes(q));
}

function setLoadingPanels(texto) {
  emitSofiaState("analyzing", "panel-loading");
  ["pacienteDigitalSofia", "alertasSofia", "prediccionSofia", "timelineSofia", "mapaSofia", "narrativaSofia", "razonamientoSofia", "labsSofia", "farmacoSofia", "ecgSofia"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.className = `${el.className.split(" ")[0]} empty-state`; el.textContent = texto; }
  });
}

function renderEstadoVacio(texto) {
  setLoadingPanels(texto);
}

function tracePanelSource(panel, source) {
  console.debug("[SOFÍA][SOURCE]", { panel, source });
}

formSofia?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (enviandoMensaje) return;
  const mensaje = mensajeSofia.value.trim();
  if (!mensaje || !usuarioActual) { mensajeSofia.focus(); return; }
  agregarMensaje(mensaje, "user");
  mensajeSofia.value = "";
  const mensajePensando = agregarMensaje("SOFIA esta pensando...", "sofia", "mensaje-pensando");
  activarCarga();
  emitSofiaState("thinking", "chat-submit");
  let chatFailed = false;
  try {
    const resultado = await sofiaUnifiedClient.ask({
      message: mensaje,
      patientId: puedeUsarContextoPaciente ? (selectorPaciente?.value || "") : "",
      pageState: construirEstadoPaginaParaChat()
    });
    const acciones = await applySofiaPageActions(resultado.actions, {
      onRefresh: async () => {
        if (!selectorPaciente?.value) return false;
        await cargarPacienteSeleccionado(selectorPaciente.value);
        return true;
      },
      onAnalyzeNote: () => ejecutarCriticaNota(),
      onTrace: (trace) => console.debug("[SOFÍA Unified] Acción de página", trace)
    });
    console.debug("[SOFÍA Unified] Respuesta orquestada", {
      mode: resultado.mode,
      tools: (resultado.toolsUsed || []).map((item) => item.name),
      actions: acciones,
      clinicalWritesPerformed: resultado.clinicalWritesPerformed
    });
    const respuesta = resultado.respuesta || "SOFIA respondio, pero no llego texto interpretable.";
    mensajePensando.className = "msg sofia";
    mensajePensando.textContent = respuesta;
    agregarTrazasHerramientas(mensajePensando, resultado);
  } catch (error) {
    console.debug("[SOFÍA][CHAT_ERROR]", { code: String(error?.code || error?.name || "unknown").slice(0, 120) });
    chatFailed = true;
    emitSofiaState("error", "chat-submit", { duration: 2200, fallbackState: "idle" });
    mensajePensando.className = "msg sofia mensaje-error";
    mensajePensando.textContent = mensajeErrorSofia(error);
  } finally {
    if (!chatFailed) emitSofiaState("idle", "chat-finished");
    desactivarCarga();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

function mensajeErrorSofia(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code.includes("resource-exhausted")) return "Has alcanzado temporalmente el límite de uso de SOFÍA. Intenta nuevamente más tarde.";
  if (code.includes("permission-denied")) return "No tienes autorización para usar SOFÍA con este expediente.";
  if (code.includes("unauthenticated")) return "Tu sesión ya no está activa. Inicia sesión nuevamente.";
  if (code.includes("unavailable") || error?.message === "SOFIA_UNIFIED_CONTEXT_UNAVAILABLE") return error?.userMessage || "SOFÍA no puede acceder al contexto clínico autorizado en este momento. Intenta nuevamente más tarde.";
  return "SOFÍA tuvo un problema para responder. Intenta de nuevo en unos segundos.";
}

function metric(label, value) { return `<div class="metric-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`; }
function lista(titulo, items = []) { return `<div class="reason-block"><b>${escapeHtml(titulo)}</b><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") || "<li>Sin datos</li>"}</ul></div>`; }
function formatearDiagnostico(diag) { return [diag.codigo, diag.nombre || diag.texto || diag.diagnostico].filter(Boolean).join(" - ") || "Diagnostico sin nombre"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch])); }
