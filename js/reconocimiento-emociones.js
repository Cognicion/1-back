import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { BANCO_ESTIMULOS_EMOCIONES, CONFIG_EMOCIONES, EMOCIONES_BASICAS, obtenerEmocion } from "./data/emociones.js";

let usuarioId = null;
let config = {};
let ensayos = [];
let indice = 0;
let practica = true;
let activo = false;
let respondido = false;
let inicioEnsayo = 0;
let timeoutEnsayo = null;
let intervalReloj = null;
let cuentaTimeout = null;
let historial = [];

const $ = (id) => document.getElementById(id);
const els = {
  inicio: $("pantallaInicio"), config: $("pantallaConfiguracion"), juego: $("pantallaJuego"), resultados: $("pantallaResultados"),
  btnConfigurar: $("btnConfigurar"), btnPractica: $("btnPractica"), btnSesion: $("btnSesion"), btnCancelar: $("btnCancelar"), btnRepetir: $("btnRepetir"), btnCambiar: $("btnCambiar"),
  dificultad: $("dificultad"), totalEnsayos: $("totalEnsayos"), tiempoEnsayo: $("tiempoEnsayo"), tipoEstimulo: $("tipoEstimulo"), numeroOpciones: $("numeroOpciones"), feedback: $("feedback"), sinLimite: $("sinLimite"), efectos: $("efectos"), emocionesIncluidas: $("emocionesIncluidas"),
  modo: $("modoJuego"), contador: $("contadorEnsayos"), tiempo: $("tiempoRestante"), precision: $("precisionActual"), barra: $("barraProgreso"), cuenta: $("cuentaRegresiva"), avatar: $("avatarEmocion"), tipoEnsayo: $("tipoEnsayo"), prompt: $("promptEstimulo"), opciones: $("opcionesRespuesta"), feedbackTxt: $("feedbackEmocion"),
  resultadosGrid: $("resultadosGrid"), interpretacion: $("interpretacionResultado"), barrasEmociones: $("barrasEmociones"), lineaTiempos: $("lineaTiempos"), matriz: $("matrizConfusion"), toast: $("toastEmocion")
};

document.addEventListener("DOMContentLoaded", inicializar);
onAuthStateChanged(auth, (user) => { usuarioId = user?.uid || null; });

function inicializar() {
  renderizarChecksEmociones();
  aplicarPerfil("facil");
  els.btnConfigurar.addEventListener("click", () => mostrar("config"));
  els.btnPractica.addEventListener("click", () => iniciarActividad(true));
  els.btnSesion.addEventListener("click", () => iniciarActividad(false));
  els.btnCancelar.addEventListener("click", cancelarSesion);
  els.btnRepetir.addEventListener("click", () => iniciarActividad(false));
  els.btnCambiar.addEventListener("click", () => mostrar("config"));
  els.dificultad.addEventListener("change", () => aplicarPerfil(els.dificultad.value));
  document.addEventListener("keydown", manejarTeclado);
  document.addEventListener("visibilitychange", () => { if (document.hidden && activo) cancelarSesion(); });
  document.querySelectorAll("[data-grafica]").forEach((btn) => btn.addEventListener("click", () => alternarGrafica(btn.dataset.grafica)));
}

function renderizarChecksEmociones() {
  els.emocionesIncluidas.innerHTML = EMOCIONES_BASICAS.map((emocion) => `<label><input type="checkbox" value="${emocion.id}" checked><span style="--tono:${emocion.color}">${emocion.nombre}</span></label>`).join("");
}

function aplicarPerfil(nivel) {
  const perfil = CONFIG_EMOCIONES[nivel];
  els.totalEnsayos.value = perfil.ensayos;
  els.tiempoEnsayo.value = perfil.tiempoMaximoMs;
  els.numeroOpciones.value = perfil.opciones;
  els.feedback.value = perfil.feedback ? "on" : "off";
  document.querySelectorAll("#emocionesIncluidas input").forEach((input) => { input.checked = perfil.emociones.includes(input.value); });
}

function leerConfig() {
  const emociones = [...document.querySelectorAll("#emocionesIncluidas input:checked")].map((input) => input.value);
  return {
    dificultad: els.dificultad.value,
    totalEnsayos: limitar(Number(els.totalEnsayos.value) || 20, 8, 80),
    tiempoMaximoMs: limitar(Number(els.tiempoEnsayo.value) || 7000, 2500, 20000),
    tipoEstimulo: els.tipoEstimulo.value,
    numeroOpciones: limitar(Number(els.numeroOpciones.value) || 4, 2, 7),
    feedback: els.feedback.value === "on",
    sinLimite: els.sinLimite.value === "on",
    efectos: els.efectos.value === "on",
    emociones: emociones.length ? emociones : ["alegria", "tristeza", "neutral"]
  };
}

function iniciarActividad(esPractica) {
  limpiarTimers();
  practica = esPractica;
  config = leerConfig();
  const total = esPractica ? Math.min(CONFIG_EMOCIONES[config.dificultad].practica, config.totalEnsayos) : config.totalEnsayos;
  ensayos = generarEnsayos(total, config);
  if (!ensayos.length) { toast("No hay estimulos suficientes para esta configuracion."); return; }
  indice = 0;
  historial = [];
  activo = false;
  mostrar("juego");
  iniciarCuentaRegresiva(() => {
    activo = true;
    siguienteEnsayo();
  });
}

function generarEnsayos(total, cfg) {
  let candidatos = BANCO_ESTIMULOS_EMOCIONES.filter((estimulo) => cfg.emociones.includes(estimulo.emotion));
  if (cfg.tipoEstimulo !== "mixto") candidatos = candidatos.filter((estimulo) => estimulo.type === cfg.tipoEstimulo);
  candidatos = candidatos.filter((estimulo) => cfg.dificultad === "dificil" || estimulo.difficulty !== "dificil" || cfg.dificultad === "intermedio");
  if (!candidatos.length) return [];
  const mezclados = barajar(candidatos);
  const lista = [];
  while (lista.length < total) lista.push(...barajar(mezclados));
  return lista.slice(0, total).map((estimulo) => ({ ...estimulo, opcionesFinales: construirOpciones(estimulo, cfg) }));
}

function construirOpciones(estimulo, cfg) {
  const base = new Set([estimulo.correctAnswer, ...estimulo.options]);
  const disponibles = EMOCIONES_BASICAS.map((e) => e.id).filter((id) => cfg.emociones.includes(id) && !base.has(id));
  while (base.size < cfg.numeroOpciones && disponibles.length) base.add(disponibles.splice(Math.floor(Math.random() * disponibles.length), 1)[0]);
  return barajar([...base]).slice(0, cfg.numeroOpciones);
}

function iniciarCuentaRegresiva(callback) {
  let n = 3;
  els.cuenta.hidden = false;
  els.cuenta.textContent = n;
  cuentaTimeout = setInterval(() => {
    n -= 1;
    els.cuenta.textContent = n > 0 ? n : "Inicia";
    if (n < 0) {
      clearInterval(cuentaTimeout);
      els.cuenta.hidden = true;
      callback();
    }
  }, 700);
}

function siguienteEnsayo() {
  limpiarTimers();
  if (indice >= ensayos.length) { finalizar(); return; }
  respondido = false;
  const ensayo = ensayos[indice];
  els.modo.textContent = practica ? "Practica" : "Sesion real";
  els.contador.textContent = `${indice + 1}/${ensayos.length}`;
  els.barra.style.width = `${indice / ensayos.length * 100}%`;
  els.precision.textContent = precisionParcial();
  els.feedbackTxt.textContent = "";
  els.tipoEnsayo.textContent = ensayo.type === "facial" ? "Identificacion facial" : "Identificacion contextual";
  els.prompt.textContent = ensayo.prompt;
  renderizarAvatar(ensayo);
  renderizarOpciones(ensayo);
  els.prompt.classList.remove("entrada");
  void els.prompt.offsetWidth;
  els.prompt.classList.add("entrada");
  inicioEnsayo = performance.now();
  iniciarReloj();
  if (!config.sinLimite) timeoutEnsayo = setTimeout(() => registrarRespuesta(null), config.tiempoMaximoMs);
}

function renderizarAvatar(ensayo) {
  els.avatar.className = `avatar-emocion ${ensayo.type === "contextual" ? "contexto" : ensayo.emotion} intensidad-${ensayo.intensity}`;
  els.avatar.innerHTML = ensayo.type === "contextual" ? `<div class="contexto-icono">${obtenerEmocion(ensayo.emotion).clave}</div>` : `<span class="ojo izq"></span><span class="ojo der"></span><span class="boca"></span><span class="ceja izq"></span><span class="ceja der"></span>`;
}

function renderizarOpciones(ensayo) {
  els.opciones.innerHTML = ensayo.opcionesFinales.map((id, index) => {
    const emocion = obtenerEmocion(id);
    return `<button type="button" data-respuesta="${id}" aria-label="${index + 1}. ${emocion.nombre}"><span>${index + 1}</span>${emocion.nombre}</button>`;
  }).join("");
  els.opciones.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => registrarRespuesta(btn.dataset.respuesta)));
}

function registrarRespuesta(respuesta) {
  if (!activo || respondido) return;
  respondido = true;
  limpiarTimers();
  const ensayo = ensayos[indice];
  const rt = respuesta ? performance.now() - inicioEnsayo : null;
  const correcta = respuesta === ensayo.correctAnswer;
  historial.push({ ensayo: indice + 1, idEstimulo: ensayo.id, type: ensayo.type, emotion: ensayo.emotion, intensity: ensayo.intensity, difficulty: ensayo.difficulty, respuesta, correcta, omitida: !respuesta, rt, correctAnswer: ensayo.correctAnswer });
  els.opciones.querySelectorAll("button").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.respuesta === ensayo.correctAnswer) btn.classList.add("correcta");
    if (respuesta && btn.dataset.respuesta === respuesta && !correcta) btn.classList.add("incorrecta");
  });
  if (config.feedback || practica) mostrarFeedback(ensayo, respuesta, correcta);
  else els.feedbackTxt.textContent = respuesta ? "Respuesta registrada." : "Omitido.";
  setTimeout(() => { indice += 1; siguienteEnsayo(); }, practica ? 1450 : 800);
}

function mostrarFeedback(ensayo, respuesta, correcta) {
  if (!respuesta) els.feedbackTxt.textContent = `Sin respuesta. La respuesta correcta era ${obtenerEmocion(ensayo.correctAnswer).nombre}. ${ensayo.explanation}`;
  else if (correcta) els.feedbackTxt.textContent = `Correcto: ${obtenerEmocion(ensayo.correctAnswer).nombre}. ${ensayo.explanation}`;
  else els.feedbackTxt.textContent = `Seleccionaste ${obtenerEmocion(respuesta).nombre}. La respuesta correcta era ${obtenerEmocion(ensayo.correctAnswer).nombre}. ${ensayo.explanation}`;
}

function iniciarReloj() {
  if (config.sinLimite) { els.tiempo.textContent = "Sin limite"; return; }
  intervalReloj = setInterval(() => {
    const restante = Math.max(0, config.tiempoMaximoMs - (performance.now() - inicioEnsayo));
    els.tiempo.textContent = `${(restante / 1000).toFixed(1)}s`;
  }, 100);
}

function finalizar() {
  activo = false;
  limpiarTimers();
  els.barra.style.width = "100%";
  if (practica) { toast("Practica completada. Puedes iniciar la sesion real."); mostrar("config"); return; }
  const resultado = calcularMetricas();
  guardarResultadoLocal(resultado);
  guardarResultadoRemoto(resultado);
  renderizarResultados(resultado);
  mostrar("resultados");
}

function calcularMetricas() {
  const total = historial.length;
  const correctas = historial.filter((r) => r.correcta).length;
  const omisiones = historial.filter((r) => r.omitida).length;
  const incorrectas = total - correctas - omisiones;
  const tiempos = historial.filter((r) => Number.isFinite(r.rt)).map((r) => r.rt);
  const promedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
  const min = tiempos.length ? Math.min(...tiempos) : 0;
  const max = tiempos.length ? Math.max(...tiempos) : 0;
  const varianza = tiempos.length ? tiempos.reduce((acc, t) => acc + Math.pow(t - promedio, 2), 0) / tiempos.length : 0;
  const porEmocion = {};
  const matriz = {};
  historial.forEach((r) => {
    porEmocion[r.emotion] ||= { total: 0, correctas: 0, tiempos: [] };
    porEmocion[r.emotion].total += 1;
    if (r.correcta) porEmocion[r.emotion].correctas += 1;
    if (Number.isFinite(r.rt)) porEmocion[r.emotion].tiempos.push(r.rt);
    if (r.respuesta && !r.correcta) {
      matriz[r.emotion] ||= {};
      matriz[r.emotion][r.respuesta] = (matriz[r.emotion][r.respuesta] || 0) + 1;
    }
  });
  const accuracyByEmotion = Object.fromEntries(Object.entries(porEmocion).map(([id, d]) => [id, Math.round(d.correctas / d.total * 100)]));
  const responseTimeByEmotion = Object.fromEntries(Object.entries(porEmocion).map(([id, d]) => [id, d.tiempos.length ? Math.round(d.tiempos.reduce((a, b) => a + b, 0) / d.tiempos.length) : 0]));
  const mejor = Object.entries(accuracyByEmotion).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dificil = Object.entries(accuracyByEmotion).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  return { activityId: "reconocimiento_emociones", activityName: "Reconocimiento de emociones", userId: usuarioId, date: new Date().toISOString(), difficulty: config.dificultad, mode: "sesion", stimulusType: config.tipoEstimulo, emotionsIncluded: config.emociones, totalTrials: total, correctResponses: correctas, incorrectResponses: incorrectas, omissions: omisiones, accuracy: total ? Math.round(correctas / total * 100) : 0, averageResponseTime: Math.round(promedio), minimumResponseTime: Math.round(min), maximumResponseTime: Math.round(max), responseTimeVariability: Math.round(Math.sqrt(varianza)), accuracyByEmotion, responseTimeByEmotion, confusionMatrix: matriz, trialHistory: historial, bestEmotion: mejor, hardestEmotion: dificil, duration: historial.reduce((acc, r) => acc + (r.rt || config.tiempoMaximoMs), 0), completed: true };
}

function renderizarResultados(resultado) {
  els.resultadosGrid.innerHTML = [
    ["Precision", `${resultado.accuracy}%`], ["Aciertos", resultado.correctResponses], ["Errores", resultado.incorrectResponses], ["Omisiones", resultado.omissions], ["Tiempo medio", `${resultado.averageResponseTime} ms`], ["Variabilidad", `${resultado.responseTimeVariability} ms`]
  ].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
  els.interpretacion.innerHTML = `<h3>Interpretacion descriptiva</h3><p>${generarInterpretacion(resultado)}</p>`;
  renderizarBarrasEmociones(resultado);
  renderizarLineaTiempos(resultado);
  renderizarMatriz(resultado);
}

function generarInterpretacion(r) {
  const frases = [];
  frases.push(r.accuracy >= 80 ? "Buen reconocimiento global de emociones basicas." : r.accuracy >= 60 ? "Rendimiento global intermedio, con areas susceptibles de entrenamiento." : "Rendimiento global bajo en esta sesion; interpretar junto con atencion, fatiga y condiciones de aplicacion.");
  if (r.bestEmotion) frases.push(`Mejor reconocimiento: ${obtenerEmocion(r.bestEmotion).nombre}.`);
  if (r.hardestEmotion) frases.push(`Mayor dificultad: ${obtenerEmocion(r.hardestEmotion).nombre}.`);
  if (r.responseTimeVariability > 1200) frases.push("Variabilidad elevada en los tiempos de respuesta.");
  const confusiones = Object.entries(r.confusionMatrix).flatMap(([real, respuestas]) => Object.entries(respuestas).map(([sel, n]) => ({ real, sel, n }))).sort((a, b) => b.n - a.n);
  if (confusiones[0]) frases.push(`Confusion mas frecuente: ${obtenerEmocion(confusiones[0].real).nombre} identificado como ${obtenerEmocion(confusiones[0].sel).nombre}.`);
  return frases.join(" ") + " No implica diagnostico clinico.";
}

function renderizarBarrasEmociones(r) {
  els.barrasEmociones.innerHTML = Object.entries(r.accuracyByEmotion).map(([id, valor]) => `<div class="barra-item"><span>${obtenerEmocion(id).nombre}</span><i><b style="width:${valor}%"></b></i><em>${valor}%</em></div>`).join("");
}

function renderizarLineaTiempos(r) {
  const valores = r.trialHistory.map((item) => item.rt || config.tiempoMaximoMs);
  const max = Math.max(...valores, 1);
  els.lineaTiempos.innerHTML = valores.map((valor, i) => `<span title="Ensayo ${i + 1}: ${Math.round(valor)} ms" style="height:${Math.max(8, valor / max * 100)}%"></span>`).join("");
}

function renderizarMatriz(r) {
  const emociones = [...new Set([...Object.keys(r.confusionMatrix), ...Object.values(r.confusionMatrix).flatMap((o) => Object.keys(o))])];
  if (!emociones.length) { els.matriz.innerHTML = "<p>Sin confusiones registradas.</p>"; return; }
  els.matriz.innerHTML = `<table><thead><tr><th>Real</th>${emociones.map((id) => `<th>${obtenerEmocion(id).nombre}</th>`).join("")}</tr></thead><tbody>${emociones.map((real) => `<tr><th>${obtenerEmocion(real).nombre}</th>${emociones.map((sel) => `<td>${r.confusionMatrix[real]?.[sel] || 0}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function manejarTeclado(event) {
  if (!activo || respondido) return;
  if (/^[1-9]$/.test(event.key)) {
    const btn = els.opciones.querySelectorAll("button")[Number(event.key) - 1];
    if (btn) registrarRespuesta(btn.dataset.respuesta);
  }
}

function precisionParcial() {
  if (!historial.length) return "--";
  return `${Math.round(historial.filter((r) => r.correcta).length / historial.length * 100)}%`;
}

function mostrar(pantalla) {
  [els.inicio, els.config, els.juego, els.resultados].forEach((el) => el.hidden = true);
  els[pantalla].hidden = false;
}

function cancelarSesion() {
  activo = false;
  limpiarTimers();
  mostrar("config");
  toast("Sesion detenida.");
}

function limpiarTimers() {
  clearTimeout(timeoutEnsayo);
  clearInterval(intervalReloj);
  clearInterval(cuentaTimeout);
}

function guardarResultadoLocal(resultado) {
  const clave = `cognicion_emociones_${usuarioId || "anon"}`;
  const previos = JSON.parse(localStorage.getItem(clave) || "[]");
  previos.unshift(resultado);
  localStorage.setItem(clave, JSON.stringify(previos.slice(0, 20)));
}

async function guardarResultadoRemoto(resultado) {
  if (!usuarioId) return;
  try {
    const ref = doc(collection(db, "usuarios", usuarioId, "rehabilitacionResultados"));
    await setDoc(ref, { ...resultado, idResultado: ref.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (error) {
    console.warn("No se pudo guardar Reconocimiento de emociones en Firestore; se conserva copia local.", error);
  }
}

function alternarGrafica(nombre) {
  const mapa = { emociones: $("graficaEmociones"), tiempos: $("graficaTiempos"), confusion: $("graficaConfusion") };
  mapa[nombre]?.classList.toggle("oculta");
}

function barajar(lista) {
  return lista.slice().sort(() => Math.random() - 0.5);
}

function limitar(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function toast(mensaje) {
  els.toast.textContent = mensaje;
  els.toast.classList.add("visible");
  setTimeout(() => els.toast.classList.remove("visible"), 2400);
}