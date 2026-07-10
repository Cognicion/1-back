import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const perfiles = {
  facil: { duracion: 60, ensayos: 40, visible: 1000, intervalo: 900, go: 80, variable: 0.12 },
  intermedio: { duracion: 60, ensayos: 50, visible: 800, intervalo: 650, go: 70, variable: 0.25 },
  dificil: { duracion: 75, ensayos: 60, visible: 560, intervalo: 460, go: 60, variable: 0.42 }
};

const estimulos = {
  colores: { go: { clase: "go", texto: "GO" }, nogo: { clase: "nogo", texto: "NO-GO" } },
  formas: { go: { clase: "go forma-go", texto: "CUADRO GO" }, nogo: { clase: "nogo forma-nogo", texto: "TRIANGULO NO-GO" } },
  flechas: { go: { clase: "go", texto: "→ GO" }, nogo: { clase: "nogo", texto: "← NO-GO" } },
  letras: { go: { clase: "go", texto: "X GO" }, nogo: { clase: "nogo", texto: "K NO-GO" } }
};

let usuarioId = "";
let config = null;
let estado = "inicio";
let practica = false;
let ensayos = [];
let indice = -1;
let ensayoActual = null;
let respondido = false;
let inicioSesion = 0;
let inicioEstimulo = 0;
let timeoutVisible = null;
let timeoutSiguiente = null;
let intervalReloj = null;
let audioCtx = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  ocultarTodo("inicio");
  $("btnIrConfiguracion")?.addEventListener("click", () => ocultarTodo("config"));
  $("dificultad")?.addEventListener("change", aplicarPerfilDificultad);
  $("btnPractica")?.addEventListener("click", () => iniciarFlujo(true));
  $("btnSesion")?.addEventListener("click", () => iniciarFlujo(false));
  $("btnResponder")?.addEventListener("click", registrarRespuesta);
  $("zonaEstimulo")?.addEventListener("click", registrarRespuesta);
  $("btnCancelar")?.addEventListener("click", cancelarSesion);
  $("btnRepetir")?.addEventListener("click", () => iniciarFlujo(practica));
  $("btnCambiar")?.addEventListener("click", () => ocultarTodo("config"));
  document.addEventListener("keydown", manejarTeclado);
  document.addEventListener("visibilitychange", () => { if (document.hidden && estado === "jugando") cancelarSesion("La sesion se pauso al cambiar de pestana."); });
  window.addEventListener("beforeunload", limpiarTemporizadores);
  document.querySelectorAll("[data-toggle-grafica]").forEach((boton) => boton.addEventListener("click", () => toggleGrafica(boton.dataset.toggleGrafica)));
  aplicarPerfilDificultad();
});

onAuthStateChanged(auth, (user) => { usuarioId = user?.uid || ""; });

function aplicarPerfilDificultad() {
  const perfil = perfiles[$("dificultad")?.value || "facil"] || perfiles.facil;
  $("duracionSesion").value = perfil.duracion;
  $("totalEnsayos").value = perfil.ensayos;
  $("duracionEstimulo").value = perfil.visible;
  $("intervaloEstimulo").value = perfil.intervalo;
  $("porcentajeGo").value = perfil.go;
}

function leerConfig() {
  const dificultad = $("dificultad").value;
  const perfil = perfiles[dificultad] || perfiles.facil;
  const porcentajeGo = limitar(Number($("porcentajeGo").value || perfil.go), 10, 90);
  return {
    dificultad,
    duracionSesion: limitar(Number($("duracionSesion").value || perfil.duracion), 20, 600),
    totalEnsayos: limitar(Number($("totalEnsayos").value || perfil.ensayos), 10, 200),
    duracionEstimulo: limitar(Number($("duracionEstimulo").value || perfil.visible), 200, 2000),
    intervaloEstimulo: limitar(Number($("intervaloEstimulo").value || perfil.intervalo), 200, 2500),
    porcentajeGo,
    porcentajeNoGo: 100 - porcentajeGo,
    tipoEstimulo: $("tipoEstimulo").value || "colores",
    sonido: $("sonido").value === "on",
    feedback: $("feedback").value === "on",
    efectos: $("efectos").value === "on",
    variabilidad: perfil.variable
  };
}

function iniciarFlujo(esPractica) {
  limpiarTemporizadores();
  config = leerConfig();
  practica = esPractica;
  ensayos = crearEnsayos(practica ? Math.min(8, config.totalEnsayos) : config.totalEnsayos, config.porcentajeGo);
  indice = -1;
  ensayoActual = null;
  respondido = false;
  estado = "cuenta";
  ocultarTodo("juego");
  $("modoJuego").textContent = practica ? "Practica" : "Sesion real";
  $("precisionActual").textContent = "--";
  $("barraProgreso").style.width = "0%";
  $("feedbackGo").textContent = practica ? "Practica: responde solo ante GO." : "Preparado.";
  cuentaRegresiva(3, () => {
    inicioSesion = performance.now();
    estado = "jugando";
    intervalReloj = window.setInterval(actualizarReloj, 250);
    siguienteEnsayo();
  });
}

function crearEnsayos(total, porcentajeGo) {
  const lista = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    tipo: Math.random() * 100 < porcentajeGo ? "go" : "nogo",
    respondio: false,
    correcta: null,
    rt: null,
    resultado: "pendiente"
  }));
  if (!lista.some((e) => e.tipo === "nogo") && lista.length > 2) lista[lista.length - 1].tipo = "nogo";
  if (!lista.some((e) => e.tipo === "go")) lista[0].tipo = "go";
  return lista;
}

function cuentaRegresiva(n, alTerminar) {
  const nodo = $("cuentaRegresiva");
  if (!nodo) return;
  nodo.textContent = n > 0 ? n : "GO";
  if (n <= 0) {
    window.setTimeout(() => { nodo.textContent = ""; alTerminar(); }, 500);
    return;
  }
  timeoutSiguiente = window.setTimeout(() => cuentaRegresiva(n - 1, alTerminar), 780);
}

function siguienteEnsayo() {
  limpiarEnsayoVisual();
  if (estado !== "jugando") return;
  if (indice + 1 >= ensayos.length || segundosTranscurridos() >= config.duracionSesion) {
    finalizarSesion();
    return;
  }
  indice += 1;
  ensayoActual = ensayos[indice];
  respondido = false;
  $("contadorEnsayos").textContent = `${indice + 1}/${ensayos.length}`;
  $("barraProgreso").style.width = `${Math.round((indice / ensayos.length) * 100)}%`;

  const variante = estimulos[config.tipoEstimulo] || estimulos.colores;
  const data = variante[ensayoActual.tipo];
  const estimulo = $("estimuloVisual");
  estimulo.className = `estimulo visible ${data.clase} entrada-${ensayoActual.tipo}`;
  $("textoEstimulo").textContent = data.texto;
  inicioEstimulo = performance.now();
  activarPulsoEstimulo(ensayoActual.tipo);
  beep(ensayoActual.tipo === "go" ? 520 : 260, 0.025);

  timeoutVisible = window.setTimeout(() => {
    if (!respondido) cerrarEnsayoSinRespuesta();
  }, config.duracionEstimulo);
}

function cerrarEnsayoSinRespuesta() {
  if (!ensayoActual || respondido) return;
  respondido = true;
  ensayoActual.respondio = false;
  if (ensayoActual.tipo === "go") {
    ensayoActual.correcta = false;
    ensayoActual.resultado = "omision";
    feedback("Omision", "warn");
  } else {
    ensayoActual.correcta = true;
    ensayoActual.resultado = "inhibicion";
    feedback("Inhibicion correcta", "ok");
  }
  programarSiguiente();
}


function activarPulsoEstimulo(tipo) {
  const zona = $("zonaEstimulo");
  if (!zona || config?.efectos === false) return;
  zona.classList.remove("pulso-go", "pulso-nogo", "cambio-estimulo");
  void zona.offsetWidth;
  zona.classList.add("cambio-estimulo", tipo === "go" ? "pulso-go" : "pulso-nogo");
  const texto = $("textoEstimulo");
  texto?.classList.remove("nuevo-estimulo");
  void texto?.offsetWidth;
  texto?.classList.add("nuevo-estimulo");
}
function registrarRespuesta(event) {
  event?.preventDefault?.();
  if (estado !== "jugando" || !ensayoActual || respondido) return;
  respondido = true;
  const rt = Math.max(0, performance.now() - inicioEstimulo);
  ensayoActual.respondio = true;
  ensayoActual.rt = Math.round(rt);
  if (ensayoActual.tipo === "go") {
    ensayoActual.correcta = true;
    ensayoActual.resultado = "acierto_go";
    feedback(`Correcto · ${ensayoActual.rt} ms`, "ok");
  } else {
    ensayoActual.correcta = false;
    ensayoActual.resultado = "error_comision";
    feedback("Error No-Go", "error");
  }
  programarSiguiente();
}

function programarSiguiente() {
  window.clearTimeout(timeoutVisible);
  const intervalo = intervaloVariable();
  actualizarPrecisionEnVivo();
  timeoutSiguiente = window.setTimeout(siguienteEnsayo, intervalo);
}

function intervaloVariable() {
  if (config.dificultad === "facil") return config.intervaloEstimulo;
  const rango = config.intervaloEstimulo * config.variabilidad;
  return Math.max(160, Math.round(config.intervaloEstimulo + (Math.random() * 2 - 1) * rango));
}

function manejarTeclado(event) {
  if (event.code !== "Space" || event.repeat) return;
  if (estado === "jugando") registrarRespuesta(event);
}

function actualizarReloj() {
  const restante = Math.max(0, config.duracionSesion - segundosTranscurridos());
  $("tiempoRestante").textContent = formatearSegundos(restante);
  if (restante <= 0 && estado === "jugando") finalizarSesion();
}

function finalizarSesion() {
  estado = "resultados";
  limpiarTemporizadores();
  limpiarEnsayoVisual();
  $("barraProgreso").style.width = "100%";
  const resultado = calcularResultados();
  if (!practica) {
    guardarResultadoLocal(resultado);
    guardarResultadoRemoto(resultado);
  }
  renderizarResultados(resultado);
  ocultarTodo("resultados");
}

function calcularResultados() {
  const completados = ensayos.filter((e) => e.resultado !== "pendiente");
  const go = completados.filter((e) => e.tipo === "go");
  const nogo = completados.filter((e) => e.tipo === "nogo");
  const correctGo = completados.filter((e) => e.resultado === "acierto_go").length;
  const omissions = completados.filter((e) => e.resultado === "omision").length;
  const commissionErrors = completados.filter((e) => e.resultado === "error_comision").length;
  const correctInhibitions = completados.filter((e) => e.resultado === "inhibicion").length;
  const rts = completados.map((e) => e.rt).filter((v) => Number.isFinite(v));
  const avg = promedio(rts);
  const accuracy = completados.length ? ((correctGo + correctInhibitions) / completados.length) * 100 : 0;
  const impulsivity = nogo.length ? (commissionErrors / nogo.length) * 100 : 0;
  return {
    activityId: "go_nogo",
    activityName: "Go / No-Go",
    userId: usuarioId,
    date: new Date().toISOString(),
    difficulty: config.dificultad,
    totalTrials: completados.length,
    goTrials: go.length,
    noGoTrials: nogo.length,
    correctGo,
    omissions,
    commissionErrors,
    correctInhibitions,
    averageReactionTime: Math.round(avg || 0),
    minimumReactionTime: rts.length ? Math.min(...rts) : 0,
    maximumReactionTime: rts.length ? Math.max(...rts) : 0,
    reactionTimeVariability: Math.round(desviacion(rts) || 0),
    accuracy: Math.round(accuracy * 10) / 10,
    errorRate: Math.round((100 - accuracy) * 10) / 10,
    impulsivityIndex: Math.round(impulsivity * 10) / 10,
    duration: Math.round(segundosTranscurridos()),
    trialHistory: completados
  };
}

function renderizarResultados(r) {
  const items = [
    ["Puntuacion global", `${r.accuracy}%`], ["Aciertos Go", r.correctGo], ["Omisiones", r.omissions], ["Errores No-Go", r.commissionErrors],
    ["Inhibiciones", r.correctInhibitions], ["TR promedio", `${r.averageReactionTime} ms`], ["TR minimo", `${r.minimumReactionTime} ms`],
    ["TR maximo", `${r.maximumReactionTime} ms`], ["Variabilidad", `${r.reactionTimeVariability} ms`], ["Impulsividad", `${r.impulsivityIndex}%`], ["Errores", `${r.errorRate}%`],
    ["Nivel", r.difficulty], ["Estimulos", r.totalTrials], ["Duracion", `${r.duration} s`], ["Fecha", new Date(r.date).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })]
  ];
  $("resultadosGrid").innerHTML = items.map(([k, v]) => `<div class="resultado-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("interpretacionGo").innerHTML = `<strong>Interpretacion prudente</strong><p>${interpretar(r).join(" ")}</p>`;
  renderGraficaLinea("lineaRt", r.trialHistory.map((e) => e.rt || 0));
  renderBarras("barrasAciertos", [["Aciertos Go", r.correctGo], ["Inhibiciones", r.correctInhibitions], ["Omisiones", r.omissions], ["Errores", r.commissionErrors]]);
  renderBarras("barrasDistribucion", [["Go", r.goTrials], ["No-Go", r.noGoTrials], ["Respondidos", r.trialHistory.filter((e) => e.respondio).length], ["Inhibidos/omitidos", r.trialHistory.filter((e) => !e.respondio).length]]);
  const bloques = dividirEnBloques(r.trialHistory, 4).map((bloque) => bloque.length ? (bloque.filter((e) => e.correcta).length / bloque.length) * 100 : 0);
  renderGraficaLinea("lineaEvolucion", bloques, "%");
}

function interpretar(r) {
  const mensajes = [];
  if (r.accuracy >= 85 && r.impulsivityIndex < 20) mensajes.push("Rendimiento alto en control inhibitorio para esta sesion.");
  else if (r.accuracy >= 70) mensajes.push("Rendimiento dentro de rango funcional para la sesion, sujeto a contexto clinico.");
  else mensajes.push("Precision disminuida durante la tarea; conviene revisar fatiga, comprension de instrucciones y contexto clinico.");
  if (r.commissionErrors >= Math.max(2, r.noGoTrials * 0.25)) mensajes.push("Se observa aumento de errores de comision, compatible con mayor dificultad de inhibicion en esta actividad.");
  if (r.omissions >= Math.max(2, r.goTrials * 0.2)) mensajes.push("Hay omisiones frecuentes ante estimulos Go, lo que puede sugerir fluctuacion atencional durante la tarea.");
  if (r.reactionTimeVariability > 250) mensajes.push("La variabilidad de respuesta fue elevada.");
  const ultimo = r.trialHistory.slice(Math.floor(r.trialHistory.length * 0.66));
  const primero = r.trialHistory.slice(0, Math.ceil(r.trialHistory.length * 0.33));
  if (precisionBloque(ultimo) + 10 < precisionBloque(primero)) mensajes.push("El rendimiento disminuyo hacia el final, posible fatiga o reduccion de atencion sostenida.");
  return mensajes;
}

function renderGraficaLinea(id, valores, sufijo = "ms") {
  const nodo = $(id);
  if (!nodo) return;
  const max = Math.max(...valores, 1);
  const puntos = valores.map((v, i) => `${(i / Math.max(1, valores.length - 1)) * 100},${100 - (v / max) * 86}`).join(" ");
  nodo.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${puntos}" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="0" y1="96" x2="100" y2="96" stroke="rgba(148,163,184,.25)" vector-effect="non-scaling-stroke"/></svg><small>Max: ${Math.round(max)} ${sufijo}</small>`;
}

function renderBarras(id, datos) {
  const nodo = $(id);
  const max = Math.max(...datos.map(([, v]) => v), 1);
  nodo.innerHTML = datos.map(([k, v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4, (v / max) * 100)}%"></i><strong>${v}</strong></div>`).join("");
}

function toggleGrafica(tipo) {
  const mapa = { rt: "graficaRt", aciertos: "graficaAciertos", distribucion: "graficaDistribucion", evolucion: "graficaEvolucion" };
  $(mapa[tipo])?.classList.toggle("oculta");
}

function cancelarSesion(mensaje = "Sesion cancelada.") {
  limpiarTemporizadores();
  limpiarEnsayoVisual();
  estado = "config";
  ocultarTodo("config");
  mostrarToast(mensaje);
}

function limpiarTemporizadores() {
  window.clearTimeout(timeoutVisible);
  window.clearTimeout(timeoutSiguiente);
  window.clearInterval(intervalReloj);
  timeoutVisible = null;
  timeoutSiguiente = null;
  intervalReloj = null;
}

function limpiarEnsayoVisual() {
  const estimulo = $("estimuloVisual");
  if (estimulo) estimulo.className = "estimulo";
  $("zonaEstimulo")?.classList.remove("pulso-go", "pulso-nogo", "cambio-estimulo");
  $("textoEstimulo")?.classList.remove("nuevo-estimulo");
  const texto = $("textoEstimulo");
  if (texto) texto.textContent = estado === "resultados" ? "Finalizado" : "Preparado";
}

function feedback(texto, tipo) {
  if (!config.feedback && !practica) return;
  const nodo = $("feedbackGo");
  nodo.textContent = texto;
  nodo.className = `feedback-go ${tipo}`;
}

function actualizarPrecisionEnVivo() {
  const hechos = ensayos.filter((e) => e.resultado !== "pendiente");
  const precision = precisionBloque(hechos);
  $("precisionActual").textContent = hechos.length ? `${Math.round(precision)}%` : "--";
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

function guardarResultadoLocal(resultado) {
  const clave = `cognicion_go_nogo_${usuarioId || "anon"}`;
  const previos = JSON.parse(localStorage.getItem(clave) || "[]");
  previos.unshift(resultado);
  localStorage.setItem(clave, JSON.stringify(previos.slice(0, 30)));
}

async function guardarResultadoRemoto(resultado) {
  if (!usuarioId) return;
  try {
    const ref = doc(collection(db, "usuarios", usuarioId, "rehabilitacionResultados"));
    await setDoc(ref, {
      ...resultado,
      idResultado: ref.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar Go / No-Go en Firestore; se conserva copia local.", error);
  }
}
function beep(freq, dur) {
  if (!config?.sonido) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.025;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (_) {}
}

function segundosTranscurridos() { return (performance.now() - inicioSesion) / 1000; }
function formatearSegundos(s) { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; }
function limitar(v, min, max) { return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)); }
function promedio(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function desviacion(arr) { const avg = promedio(arr); return arr.length ? Math.sqrt(promedio(arr.map((v) => (v - avg) ** 2))) : 0; }
function precisionBloque(arr) { return arr.length ? (arr.filter((e) => e.correcta).length / arr.length) * 100 : 0; }
function dividirEnBloques(arr, n) { const size = Math.ceil(arr.length / n) || 1; return Array.from({ length: n }, (_, i) => arr.slice(i * size, (i + 1) * size)); }
function mostrarToast(mensaje) { const t = $("toastGo"); if (!t) return; t.textContent = mensaje; t.classList.add("visible"); window.setTimeout(() => t.classList.remove("visible"), 2600); }