import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  CPT_ACTIVITY_VERSION,
  calcularMetricasCpt,
  cerrarEnsayoCpt,
  crearSemillaCpt,
  ensayosCptACsv,
  generarSecuenciaCpt,
  normalizarConfigCpt
} from "./cpt-core.js";

let usuarioId = "";
let pacienteId = "";
let config = normalizarConfigCpt();
let estado = "inicio";
let practica = false;
let secuencia = [];
let ensayos = [];
let indice = -1;
let ensayoActual = null;
let respondidoEnsayo = false;
let inicioSesionPerf = 0;
let inicioSesionIso = "";
let rafId = null;
let timeoutOcultar = null;
let timeoutFinalizar = null;
let timeoutCerrar = null;
let gamepadRaf = null;
let gamepadPrevio = false;
let dispositivoRespuesta = "sin_respuesta";
let interrupciones = [];
let resultadoActual = null;
let semillaSesion = 0;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  pacienteId = new URLSearchParams(window.location.search).get("id") || new URLSearchParams(window.location.search).get("paciente") || "";
  ocultarTodo("inicio");
  actualizarInstrucciones();
  configurarEventos();
  iniciarMonitoreoGamepad();
});

onAuthStateChanged(auth, (user) => {
  usuarioId = user?.uid || "";
  if (!pacienteId) pacienteId = usuarioId;
});

function configurarEventos() {
  $("btnIrConfiguracion")?.addEventListener("click", () => ocultarTodo("config"));
  $("modalidadCpt")?.addEventListener("change", actualizarInstrucciones);
  $("usarPractica")?.addEventListener("change", actualizarBotonesPractica);
  $("btnPractica")?.addEventListener("click", () => prepararSesion(true));
  $("btnSesion")?.addEventListener("click", () => prepararSesion(false));
  $("btnResponder")?.addEventListener("click", (event) => registrarRespuesta("boton", event));
  $("btnPausar")?.addEventListener("click", pausarSesion);
  $("btnCancelar")?.addEventListener("click", () => cancelarSesion("Sesion cancelada."));
  $("btnRepetir")?.addEventListener("click", () => prepararSesion(practica));
  $("btnContinuarSesion")?.addEventListener("click", () => prepararSesion(false));
  $("btnCambiar")?.addEventListener("click", () => ocultarTodo("config"));
  $("btnExportarJson")?.addEventListener("click", exportarJson);
  $("btnExportarCsv")?.addEventListener("click", exportarCsv);
  $("btnImprimir")?.addEventListener("click", () => window.print());
  document.addEventListener("keydown", manejarTeclado);
  document.addEventListener("visibilitychange", manejarVisibilidad);
  window.addEventListener("beforeunload", limpiarTemporizadores);
  document.querySelectorAll("[data-toggle-grafica]").forEach((boton) => boton.addEventListener("click", () => alternarGrafica(boton.dataset.toggleGrafica)));
}

function leerConfig() {
  return normalizarConfigCpt({
    modality: $("modalidadCpt")?.value,
    durationSeconds: $("duracionTotal")?.value,
    totalTrials: $("totalEnsayos")?.value,
    stimulusIntervalMs: $("intervaloEstimulo")?.value,
    stimulusVisibleMs: $("tiempoVisible")?.value,
    targetPercentage: $("porcentajeObjetivo")?.value,
    degradationLevel: $("degradacionVisual")?.value,
    practiceEnabled: $("usarPractica")?.value !== "no",
    practiceTrials: $("ensayosPractica")?.value,
    minimumValidLatencyMs: $("latenciaMinima")?.value,
    blockSize: $("tamanoBloque")?.value
  });
}

function actualizarInstrucciones() {
  const modalidad = $("modalidadCpt")?.value || "cpt_x";
  $("instruccionesCpt").innerHTML = `
    <strong>Instrucciones</strong>
    <p>En el centro de la pantalla aparecera un numero cada segundo. Presiona el boton unicamente cuando aparezca el numero 0. No respondas ante ningun otro numero. Trata de responder tan rapido y correctamente como puedas.</p>
    ${modalidad === "degraded" ? "<p>Los numeros pueden aparecer con ruido o parcialmente borrosos. Responde solamente cuando identifiques el numero 0.</p>" : ""}
  `;
  actualizarBotonesPractica();
}

function actualizarBotonesPractica() {
  const usarPractica = $("usarPractica")?.value !== "no";
  $("btnPractica")?.toggleAttribute("disabled", !usarPractica);
}

async function prepararSesion(esPractica) {
  limpiarTemporizadores();
  config = leerConfig();
  practica = Boolean(esPractica && config.practiceEnabled);
  const total = practica ? Math.max(1, config.practiceTrials) : config.totalTrials;
  semillaSesion = crearSemillaCpt();
  secuencia = generarSecuenciaCpt({ ...config, totalTrials: total }, semillaSesion);
  ensayos = secuencia.map((e) => ({ ...e }));
  indice = -1;
  ensayoActual = null;
  respondidoEnsayo = false;
  interrupciones = [];
  resultadoActual = null;
  dispositivoRespuesta = "sin_respuesta";
  inicioSesionPerf = performance.now();
  inicioSesionIso = new Date().toISOString();
  estado = "jugando";
  document.body.classList.add("en-sesion");
  ocultarTodo("juego");
  $("pantallaJuego")?.focus();
  $("modoJuego").textContent = practica ? "Practica" : "Sesion experimental";
  $("feedbackCpt").textContent = practica ? "Practica: responde solo ante 0." : "";
  $("barraProgreso").style.width = "0%";
  if ($("pantallaCompleta")?.value !== "no") {
    await document.documentElement.requestFullscreen?.().catch(() => {});
  }
  iniciarProgramador();
}

function iniciarProgramador() {
  const sesionMaxMs = config.durationSeconds * 1000;
  timeoutFinalizar = window.setTimeout(() => finalizarSesion(), sesionMaxMs + config.stimulusIntervalMs);
  programarSiguienteEnsayo();
}

function programarSiguienteEnsayo() {
  if (estado !== "jugando") return;
  if (indice + 1 >= ensayos.length || performance.now() - inicioSesionPerf >= config.durationSeconds * 1000) {
    finalizarSesion();
    return;
  }
  indice += 1;
  ensayoActual = ensayos[indice];
  respondidoEnsayo = false;
  const esperado = inicioSesionPerf + ensayoActual.expectedAtMs;
  const tick = () => {
    if (estado !== "jugando") return;
    if (performance.now() >= esperado) presentarEnsayo(esperado);
    else rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function presentarEnsayo(esperado) {
  const presentado = performance.now();
  ensayoActual.presentedAt = redondear(presentado - inicioSesionPerf, 2);
  ensayoActual.presentationDelayMs = redondear(presentado - esperado, 2);
  $("contadorEnsayos").textContent = `${indice + 1}/${ensayos.length}`;
  $("tiempoRestante").textContent = formatearSegundos(Math.max(0, config.durationSeconds - ((presentado - inicioSesionPerf) / 1000)));
  $("barraProgreso").style.width = `${Math.round((indice / Math.max(1, ensayos.length)) * 100)}%`;
  renderizarEstimulo(ensayoActual);
  timeoutOcultar = window.setTimeout(ocultarEstimulo, config.stimulusVisibleMs);
  const cierreMs = Math.max(config.stimulusVisibleMs, config.stimulusIntervalMs - 12);
  timeoutCerrar = window.setTimeout(cerrarEnsayoActual, cierreMs);
}

function renderizarEstimulo(ensayo) {
  const digito = $("digitoEstimulo");
  const canvas = $("canvasEstimulo");
  if (config.modality === "degraded") {
    digito.classList.remove("visible");
    canvas.classList.add("visible");
    dibujarEstimuloDegradado(canvas, ensayo.stimulus, ensayo.visualNoiseLevel, ensayo.visualNoiseSeed);
    return;
  }
  canvas.classList.remove("visible");
  digito.textContent = ensayo.stimulus;
  digito.classList.add("visible");
}

function dibujarEstimuloDegradado(canvas, stimulus, nivel, seed) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const rng = crearRngLocal(seed);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#050b14";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f8fbff";
  ctx.font = "900 220px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(stimulus), w / 2, h / 2 + 6);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const prob = Math.max(0, Math.min(0.9, nivel / 100));
  for (let i = 0; i < data.length; i += 4) {
    if (rng() > prob) continue;
    const ruido = Math.floor(rng() * 255);
    const mezcla = 0.58;
    data[i] = data[i] * (1 - mezcla) + ruido * mezcla;
    data[i + 1] = data[i + 1] * (1 - mezcla) + ruido * mezcla;
    data[i + 2] = data[i + 2] * (1 - mezcla) + ruido * mezcla;
  }
  ctx.putImageData(image, 0, 0);
}

function ocultarEstimulo() {
  $("digitoEstimulo")?.classList.remove("visible");
  $("canvasEstimulo")?.classList.remove("visible");
}

function registrarRespuesta(dispositivo = "desconocido", event) {
  event?.preventDefault?.();
  if (estado !== "jugando" || !ensayoActual || respondidoEnsayo) return;
  respondidoEnsayo = true;
  dispositivoRespuesta = dispositivoRespuesta === "sin_respuesta" ? dispositivo : `${dispositivoRespuesta},${dispositivo}`;
  const ahora = performance.now();
  ensayoActual.responded = true;
  ensayoActual.responseAt = redondear(ahora - inicioSesionPerf, 2);
  ensayoActual.reactionTimeMs = ensayoActual.presentedAt === null ? null : Math.round(ahora - (inicioSesionPerf + ensayoActual.presentedAt));
  ensayoActual = cerrarEnsayoCpt(ensayoActual, config);
  ensayos[indice] = ensayoActual;
  if (practica) retroalimentarPractica(ensayoActual.responseType);
}

function cerrarEnsayoActual() {
  if (estado !== "jugando" || !ensayoActual) return;
  if (ensayoActual.responseType !== "pending") {
    programarSiguienteEnsayo();
    return;
  }
  ensayoActual = cerrarEnsayoCpt(ensayoActual, config);
  ensayos[indice] = ensayoActual;
  if (practica) retroalimentarPractica(ensayoActual.responseType);
  programarSiguienteEnsayo();
}

function retroalimentarPractica(tipo) {
  const mapa = {
    hit: ["Correcto", "ok"],
    miss: ["No respondiste al objetivo", "warn"],
    false_alarm: ["Respuesta incorrecta", "error"],
    correct_rejection: ["Correcto", "ok"],
    anticipatory: ["Respuesta anticipada", "warn"]
  };
  const [texto, clase] = mapa[tipo] || ["Ensayo registrado", "warn"];
  $("feedbackCpt").textContent = texto;
  $("feedbackCpt").className = `feedback-cpt ${clase}`;
}

function manejarTeclado(event) {
  if ((event.code !== "Space" && event.code !== "Enter") || event.repeat) return;
  if (estado === "jugando") registrarRespuesta(event.code === "Space" ? "teclado_espacio" : "teclado_enter", event);
}

function iniciarMonitoreoGamepad() {
  const loop = () => {
    const pads = navigator.getGamepads?.() || [];
    const conectado = [...pads].some(Boolean);
    $("estadoMando").textContent = conectado ? "Mando conectado" : "Mando no detectado. Puedes usar espacio, Enter o el boton en pantalla.";
    $("mandoHud").textContent = conectado ? "Conectado" : "No detectado";
    const presionado = [...pads].some((pad) => pad?.buttons?.[0]?.pressed);
    if (presionado && !gamepadPrevio && estado === "jugando") registrarRespuesta("mando");
    gamepadPrevio = presionado;
    gamepadRaf = requestAnimationFrame(loop);
  };
  gamepadRaf = requestAnimationFrame(loop);
}

function manejarVisibilidad() {
  if (!document.hidden || estado !== "jugando") return;
  interrupciones.push({ type: "visibilitychange", atMs: Math.round(performance.now() - inicioSesionPerf), trialIndex: ensayoActual?.trialIndex || null });
  if (ensayoActual && ensayoActual.responseType === "pending") {
    ensayoActual.validForMetrics = false;
    ensayoActual.responseType = "visibility_invalid";
    ensayos[indice] = ensayoActual;
  }
  pausarSesion("La pestana perdio foco; el ensayo actual quedo marcado como invalido.");
}

function pausarSesion(mensaje = "Sesion pausada.") {
  if (estado !== "jugando") return;
  estado = "pausado";
  limpiarTemporizadores(false);
  ocultarEstimulo();
  $("feedbackCpt").textContent = `${mensaje} Presiona "Iniciar actividad" para comenzar de nuevo.`;
  $("feedbackCpt").className = "feedback-cpt warn";
  mostrarToast(mensaje);
}

function cancelarSesion(mensaje) {
  limpiarTemporizadores();
  estado = "config";
  document.body.classList.remove("en-sesion");
  ocultarEstimulo();
  ocultarTodo("config");
  mostrarToast(mensaje);
}

function finalizarSesion() {
  if (estado === "resultados") return;
  estado = "resultados";
  limpiarTemporizadores();
  ocultarEstimulo();
  document.body.classList.remove("en-sesion");
  document.exitFullscreen?.().catch(() => {});
  $("barraProgreso").style.width = "100%";
  const completados = ensayos.filter((e) => e.responseType !== "pending");
  const actualDurationSeconds = (performance.now() - inicioSesionPerf) / 1000;
  const metrics = calcularMetricasCpt(completados, config, { actualDurationSeconds });
  resultadoActual = construirResultado(metrics, completados, actualDurationSeconds);
  if (!practica) {
    guardarResultadoLocal(resultadoActual);
    guardarResultadoRemoto(resultadoActual);
  }
  renderizarResultados(resultadoActual);
  $("btnContinuarSesion")?.toggleAttribute("hidden", !practica);
  ocultarTodo("resultados");
}

function construirResultado(metrics, trialHistory, actualDurationSeconds) {
  return {
    activityId: "cpt",
    activityName: "Test de Ejecucion Continua, CPT",
    activityVersion: CPT_ACTIVITY_VERSION,
    userId: usuarioId,
    uidProfesional: usuarioId,
    patientId: pacienteId || usuarioId,
    date: inicioSesionIso,
    modality: config.modality,
    configuration: config,
    randomSeed: semillaSesion,
    sequence: secuencia.map(({ trialIndex, stimulus, isTarget, visualNoiseSeed }) => ({ trialIndex, stimulus, isTarget, visualNoiseSeed })),
    duration: Math.round(actualDurationSeconds),
    results: metrics,
    blockResults: metrics.blockResults,
    trialHistory,
    responseDevice: dispositivoRespuesta,
    interruptions,
    practice: practica
  };
}

function renderizarResultados(resultado) {
  const r = resultado.results;
  const modalidad = resultado.modality === "degraded" ? "CPT degradado" : "CPT-X";
  const items = [
    ["Aciertos", r.hits], ["Omisiones", r.misses], ["Falsas alarmas", r.falseAlarms], ["Rechazos correctos", r.correctRejections],
    ["% aciertos", `${r.hitPercentage}%`], ["% falsas alarmas", `${r.falseAlarmPercentage}%`], ["TR medio aciertos", `${r.meanHitReactionTimeMs} ms`],
    ["Mediana TR", `${r.medianHitReactionTimeMs} ms`], ["DE TR", `${r.sdHitReactionTimeMs} ms`], ["TR min/max", `${r.minHitReactionTimeMs}/${r.maxHitReactionTimeMs} ms`],
    ["TR falsas alarmas", `${r.meanFalseAlarmReactionTimeMs} ms`], ["Variabilidad", `${r.reactionTimeVariabilityMs} ms`],
    ["Anticipadas", r.anticipatoryResponses], ["Invalidas", r.invalidResponses], ["d-prime", r.dPrime],
    ["Criterio", r.responseCriterion], ["Modalidad", modalidad], ["Duracion", `${r.actualDurationSeconds} s`]
  ];
  $("resultadosGrid").innerHTML = items.map(([k, v]) => `<div class="resultado-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("interpretacionCpt").innerHTML = `<strong>Descripcion objetiva</strong><p>${interpretarResultado(resultado).join(" ")}</p>`;
  renderGraficaLinea("lineaRt", resultado.trialHistory.map((e) => e.responseType === "hit" || e.responseType === "false_alarm" ? e.reactionTimeMs || 0 : 0));
  renderBarras("barrasRespuestas", [["Aciertos", r.hits], ["Omisiones", r.misses], ["Falsas alarmas", r.falseAlarms], ["Rechazos", r.correctRejections]]);
  renderBarras("barrasBloques", r.blockResults.map((b) => [`B${b.blockIndex}`, b.hits + b.correctRejections]));
  const tercio = Math.max(1, Math.floor(resultado.trialHistory.length / 3));
  renderBarras("barrasComparacion", [["Primer tercio", precision(resultado.trialHistory.slice(0, tercio))], ["Ultimo tercio", precision(resultado.trialHistory.slice(-tercio))]]);
  renderizarTabla(resultado.trialHistory);
}

function interpretarResultado(resultado) {
  const r = resultado.results;
  const mensajes = [r.temporalTrend];
  if (r.misses > Math.max(2, r.totalTargets * 0.25)) mensajes.push("Se registro una mayor cantidad de omisiones ante estimulos objetivo.");
  if (r.falseAlarms > Math.max(2, r.totalNonTargets * 0.15)) mensajes.push("Se observaron falsas alarmas ante estimulos no objetivo.");
  if (r.reactionTimeVariabilityMs > 250) mensajes.push("El tiempo de reaccion mostro variabilidad elevada en los aciertos.");
  if (resultado.interruptions.length) mensajes.push("La sesion tuvo interrupciones o perdida de foco registradas.");
  return mensajes;
}

function renderizarTabla(trials) {
  $("tablaEnsayos").innerHTML = trials.map((t) => `
    <tr>
      <td>${t.trialIndex}</td>
      <td>${t.stimulus}</td>
      <td>${t.isTarget ? "Objetivo" : "No objetivo"}</td>
      <td>${t.responded ? "Si" : "No"}</td>
      <td>${etiquetaRespuesta(t.responseType)}</td>
      <td>${Number.isFinite(t.reactionTimeMs) ? `${t.reactionTimeMs} ms` : ""}</td>
      <td>${t.visualNoiseLevel}%</td>
      <td>${Number.isFinite(t.presentedAt) ? `${Math.round(t.presentedAt)} ms` : ""}</td>
    </tr>
  `).join("");
}

function exportarJson() {
  if (!resultadoActual) return;
  descargarArchivo(`cpt_${fechaArchivo()}.json`, JSON.stringify(resultadoActual, null, 2), "application/json");
}

function exportarCsv() {
  if (!resultadoActual) return;
  descargarArchivo(`cpt_${fechaArchivo()}.csv`, ensayosCptACsv(resultadoActual.trialHistory), "text/csv;charset=utf-8");
}

function guardarResultadoLocal(resultado) {
  const clave = `cognicion_cpt_${usuarioId || "anon"}`;
  const previos = JSON.parse(localStorage.getItem(clave) || "[]");
  previos.unshift(resultado);
  localStorage.setItem(clave, JSON.stringify(previos.slice(0, 30)));
}

async function guardarResultadoRemoto(resultado) {
  const propietarioResultados = resultado.patientId || usuarioId;
  if (!propietarioResultados) return;
  try {
    const ref = doc(collection(db, "usuarios", propietarioResultados, "rehabilitacionResultados"));
    await setDoc(ref, { ...resultado, idResultado: ref.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar CPT en Firestore; se conserva copia local.", error);
    mostrarToast("No se pudo guardar en red; se conservo copia local.");
  }
}

function limpiarTemporizadores(cancelarGamepad = false) {
  cancelAnimationFrame(rafId);
  window.clearTimeout(timeoutOcultar);
  window.clearTimeout(timeoutFinalizar);
  window.clearTimeout(timeoutCerrar);
  rafId = null;
  timeoutOcultar = null;
  timeoutFinalizar = null;
  timeoutCerrar = null;
  if (cancelarGamepad) cancelAnimationFrame(gamepadRaf);
}

function ocultarTodo(vista) {
  $("pantallaInicio")?.classList.toggle("oculta", vista !== "inicio");
  $("pantallaConfiguracion")?.classList.toggle("visible", vista === "config");
  $("pantallaConfiguracion")?.classList.toggle("oculta", vista !== "config");
  $("pantallaJuego")?.classList.toggle("visible", vista === "juego");
  $("pantallaJuego")?.classList.toggle("oculta", vista !== "juego");
  $("pantallaResultados")?.classList.toggle("visible", vista === "resultados");
  $("pantallaResultados")?.classList.toggle("oculta", vista !== "resultados");
}

function alternarGrafica(tipo) {
  const mapa = { rt: "graficaRt", bloques: "graficaBloques", respuestas: "graficaRespuestas", comparacion: "graficaComparacion" };
  $(mapa[tipo])?.classList.toggle("oculta");
}

function renderGraficaLinea(id, valores) {
  const nodo = $(id);
  const max = Math.max(...valores, 1);
  const puntos = valores.map((v, i) => `${(i / Math.max(1, valores.length - 1)) * 100},${96 - (v / max) * 86}`).join(" ");
  nodo.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${puntos}" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="0" y1="96" x2="100" y2="96" stroke="rgba(148,163,184,.25)" vector-effect="non-scaling-stroke"/></svg><small>Max: ${Math.round(max)} ms</small>`;
}

function renderBarras(id, datos) {
  const nodo = $(id);
  const max = Math.max(...datos.map(([, v]) => v), 1);
  nodo.innerHTML = datos.map(([k, v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4, (v / max) * 100)}%"></i><strong>${Math.round(v * 10) / 10}</strong></div>`).join("");
}

function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function crearRngLocal(seed) {
  let estadoLocal = Number(seed) >>> 0;
  return () => {
    estadoLocal ^= estadoLocal << 13;
    estadoLocal ^= estadoLocal >>> 17;
    estadoLocal ^= estadoLocal << 5;
    return ((estadoLocal >>> 0) / 0xffffffff);
  };
}

function etiquetaRespuesta(tipo) {
  return ({
    hit: "Acierto",
    miss: "Omision",
    false_alarm: "Falsa alarma",
    correct_rejection: "Rechazo correcto",
    anticipatory: "Anticipada",
    visibility_invalid: "Invalida por foco"
  })[tipo] || tipo;
}

function precision(trials) {
  return trials.length ? ((trials.filter((t) => t.responseType === "hit" || t.responseType === "correct_rejection").length / trials.length) * 100) : 0;
}

function redondear(valor, decimales = 1) {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

function formatearSegundos(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fechaArchivo() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mostrarToast(mensaje) {
  const t = $("toastCpt");
  if (!t) return;
  t.textContent = mensaje;
  t.classList.add("visible");
  window.setTimeout(() => t.classList.remove("visible"), 2600);
}
