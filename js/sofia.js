import { auth, db, functions } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { aplicarAparienciaGuardada } from "./services/apariencia.js";
import {
  analizarInteraccionesMedicamentos,
  cargarExpedientePacienteSofia,
  cargarPacientesSofia,
  construirLineaTiempo,
  construirMapaRelaciones,
  construirPacienteDigital,
  generarAlertasInteligentes,
  generarCriticaNota,
  generarNarrativaClinica,
  generarRazonamientoClinico,
  generarRecomendacionesLaboratorio,
  obtenerBaseFarmacologicaInicial
} from "./services/sofiaClinica.js";

aplicarAparienciaGuardada();

const estadoAcceso = document.getElementById("estadoAcceso");
const chatBox = document.getElementById("chatBox");
const formSofia = document.getElementById("formSofia");
const mensajeSofia = document.getElementById("mensajeSofia");
const botonEnviar = formSofia?.querySelector("button");
const selectorPaciente = document.getElementById("selectorPacienteSofia");
const recargarSofia = document.getElementById("recargarSofia");
const buscarTimeline = document.getElementById("buscarTimelineSofia");
const notaCritica = document.getElementById("notaCriticaSofia");
const analizarNota = document.getElementById("analizarNotaSofia");
const limpiarCritica = document.getElementById("limpiarCriticaSofia");

let usuarioActual = null;
let perfilActual = null;
let enviandoMensaje = false;
let pacientesSofia = [];
let expedienteActual = null;
let timelineActual = [];

function agregarMensaje(texto, tipo, claseExtra = "") {
  const div = document.createElement("div");
  div.className = `msg ${tipo} ${claseExtra}`.trim();
  div.textContent = texto;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function bloquearAcceso(mensaje) {
  estadoAcceso.textContent = mensaje;
  if (formSofia) formSofia.style.display = "none";
  if (selectorPaciente) selectorPaciente.disabled = true;
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
    const rol = String(perfilActual.rol || "").toLowerCase();
    if (!["admin", "medico", "psicologo"].includes(rol)) {
      bloquearAcceso("Acceso restringido. SOFIA v2 esta disponible para admin, medicos y psicologos.");
      return;
    }
    estadoAcceso.textContent = "Acceso concedido. SOFIA v2 trabaja en modo explicable y no modifica el expediente.";
    await cargarSelectorPacientes();
  } catch (error) {
    console.error(error);
    bloquearAcceso("No se pudo verificar el acceso. Intenta iniciar sesion nuevamente.");
  }
});

async function cargarSelectorPacientes() {
  selectorPaciente.innerHTML = `<option value="">Cargando pacientes...</option>`;
  pacientesSofia = await cargarPacientesSofia(usuarioActual, perfilActual);
  if (!pacientesSofia.length) {
    selectorPaciente.innerHTML = `<option value="">Sin pacientes disponibles</option>`;
    renderEstadoVacio("No hay pacientes disponibles para SOFIA con los permisos actuales.");
    return;
  }
  selectorPaciente.innerHTML = `<option value="">Selecciona un paciente</option>` + pacientesSofia.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(nombrePaciente(p))}</option>`).join("");
}

selectorPaciente?.addEventListener("change", () => {
  if (selectorPaciente.value) cargarPacienteSeleccionado(selectorPaciente.value);
});

recargarSofia?.addEventListener("click", () => {
  if (selectorPaciente.value) cargarPacienteSeleccionado(selectorPaciente.value);
});

buscarTimeline?.addEventListener("input", () => renderTimeline(filtrarTimeline(buscarTimeline.value)));

analizarNota?.addEventListener("click", () => {
  const hallazgos = generarCriticaNota(notaCritica.value, expedienteActual);
  renderStack("criticaNotaSofia", hallazgos.map((h) => ({ ...h, meta: h.nivel, accion: h.porQue })));
});

limpiarCritica?.addEventListener("click", () => {
  notaCritica.value = "";
  document.getElementById("criticaNotaSofia").innerHTML = "";
});

async function cargarPacienteSeleccionado(idPaciente) {
  setLoadingPanels("Construyendo paciente digital...");
  try {
    expedienteActual = await cargarExpedientePacienteSofia(idPaciente);
    timelineActual = construirLineaTiempo(expedienteActual);
    renderPacienteDigital(construirPacienteDigital(expedienteActual));
    renderTimeline(timelineActual);
    renderMapa(construirMapaRelaciones(expedienteActual));
    renderNarrativa(generarNarrativaClinica(expedienteActual));
    renderRazonamiento(generarRazonamientoClinico(expedienteActual));
    renderStack("alertasSofia", generarAlertasInteligentes(expedienteActual));
    renderStack("prediccionSofia", construirPacienteDigital(expedienteActual).riesgos.map((r) => ({ titulo: r.titulo, nivel: r.nivel, detalle: `Factores: ${(r.factores || []).join(", ")}`, accion: `Variables faltantes: ${(r.faltantes || []).join(", ")}` })));
    renderStack("labsSofia", generarRecomendacionesLaboratorio(expedienteActual).map((r) => ({ titulo: r.estudio, nivel: r.prioridad, detalle: r.motivo, accion: `${r.periodicidad}. ${r.relacion}` })));
    renderFarmaco(expedienteActual);
  } catch (error) {
    console.error(error);
    renderEstadoVacio("No se pudo cargar el expediente del paciente seleccionado.");
  }
}

function renderPacienteDigital(digital) {
  const cont = document.getElementById("pacienteDigitalSofia");
  const dx = digital.diagnosticos[0] ? formatearDiagnostico(digital.diagnosticos[0]) : "Sin diagnostico estructurado";
  cont.classList.remove("empty-state");
  cont.innerHTML = `
    ${metric("Paciente", digital.identificacion.nombre)}
    ${metric("Edad / sexo", `${digital.identificacion.edad ?? "--"} anos · ${digital.identificacion.sexo}`)}
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

function filtrarTimeline(valor) {
  const q = String(valor || "").toLowerCase();
  if (!q) return timelineActual;
  return timelineActual.filter((e) => `${e.titulo} ${e.detalle} ${e.categoria}`.toLowerCase().includes(q));
}

function setLoadingPanels(texto) {
  ["pacienteDigitalSofia", "alertasSofia", "prediccionSofia", "timelineSofia", "mapaSofia", "narrativaSofia", "razonamientoSofia", "labsSofia", "farmacoSofia"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.className = `${el.className.split(" ")[0]} empty-state`; el.textContent = texto; }
  });
}

function renderEstadoVacio(texto) {
  setLoadingPanels(texto);
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
  try {
    const chatSofia = httpsCallable(functions, "chatSofia");
    const resultado = await chatSofia({ mensaje });
    const respuesta = resultado?.data?.respuesta || "SOFIA respondio, pero no llego texto interpretable.";
    mensajePensando.className = "msg sofia";
    mensajePensando.textContent = respuesta;
  } catch (error) {
    console.error(error);
    mensajePensando.className = "msg sofia mensaje-error";
    mensajePensando.textContent = "SOFIA tuvo un problema para responder. Intenta de nuevo en unos segundos.";
  } finally {
    desactivarCarga();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

function metric(label, value) { return `<div class="metric-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`; }
function lista(titulo, items = []) { return `<div class="reason-block"><b>${escapeHtml(titulo)}</b><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") || "<li>Sin datos</li>"}</ul></div>`; }
function nombrePaciente(p) { return p.nombreCompleto || p.nombre || [p.nombres, p.apellidos].filter(Boolean).join(" ") || p.displayName || "Paciente sin nombre"; }
function formatearDiagnostico(diag) { return [diag.codigo, diag.nombre || diag.texto || diag.diagnostico].filter(Boolean).join(" - ") || "Diagnostico sin nombre"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch])); }
