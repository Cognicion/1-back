import { auth, db } from "./firebase.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

aplicarAparienciaGuardada();

const perfiles = {
  facil: { ensayos: 24, tiempo: 9, matriz: 4, similitud: "baja" },
  intermedio: { ensayos: 32, tiempo: 7, matriz: 5, similitud: "media" },
  dificil: { ensayos: 42, tiempo: 5, matriz: 6, similitud: "alta" }
};

const bancos = {
  formas: { objetivo: "◆", distractores: { baja: ["●", "▲", "■", "✚"], media: ["◇", "●", "◆", "■"], alta: ["◇", "◈", "◆", "⬖"] } },
  letras: { objetivo: "T", distractores: { baja: ["O", "X", "M", "L"], media: ["I", "F", "Y", "L"], alta: ["I", "l", "7", "┬"] } },
  orientacion: { objetivo: "↗", distractores: { baja: ["←", "↓", "→", "↙"], media: ["↖", "↘", "↑", "→"], alta: ["↖", "↘", "↗", "↔"] } },
  color: { objetivo: "●", colorObjetivo: "#22c55e", distractores: { baja: ["●"], media: ["●"], alta: ["●"] }, colores: { baja: ["#38bdf8", "#f59e0b", "#a78bfa", "#fb7185"], media: ["#14b8a6", "#84cc16", "#0ea5e9", "#f97316"], alta: ["#16a34a", "#65a30d", "#10b981", "#2dd4bf"] } }
};

let usuarioId = "";
let config = null;
let estado = "inicio";
let practica = false;
let ensayos = [];
let indice = -1;
let ensayoActual = null;
let inicioEnsayo = 0;
let timeoutEnsayo = null;
let intervalReloj = null;
let audioCtx = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  ocultarTodo("inicio");
  $("btnIrConfiguracion")?.addEventListener("click", () => ocultarTodo("config"));
  $("dificultad")?.addEventListener("change", aplicarPerfilDificultad);
  $("btnPractica")?.addEventListener("click", () => iniciarFlujo(true));
  $("btnSesion")?.addEventListener("click", () => iniciarFlujo(false));
  $("btnCancelar")?.addEventListener("click", cancelarSesion);
  $("btnRepetir")?.addEventListener("click", () => iniciarFlujo(practica));
  $("btnCambiar")?.addEventListener("click", () => ocultarTodo("config"));
  document.addEventListener("keydown", manejarTeclado);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && estado === "jugando") cancelarSesion("La sesion se pauso al cambiar de pestana.");
  });
  window.addEventListener("beforeunload", limpiarTemporizadores);
  aplicarPerfilDificultad();
});

onAuthStateChanged(auth, async (user) => {
  usuarioId = user?.uid || "";
  if (user?.uid) await sincronizarAparienciaUsuario(user.uid);
});

function aplicarPerfilDificultad() {
  const perfil = perfiles[$("dificultad")?.value || "facil"] || perfiles.facil;
  $("totalEnsayos").value = perfil.ensayos;
  $("tiempoEnsayo").value = perfil.tiempo;
  $("tamanoMatriz").value = perfil.matriz;
  $("similitud").value = perfil.similitud;
}

function leerConfig() {
  return {
    dificultad: $("dificultad").value || "facil",
    totalEnsayos: limitar(Number($("totalEnsayos").value || 30), 8, 120),
    tiempoEnsayo: limitar(Number($("tiempoEnsayo").value || 8), 2, 20),
    tamanoMatriz: limitar(Number($("tamanoMatriz").value || 5), 4, 7),
    tipoEstimulo: $("tipoEstimulo").value || "formas",
    similitud: $("similitud").value || "media",
    feedback: $("feedback").value === "on",
    sonido: $("sonido").value === "on"
  };
}

function iniciarFlujo(esPractica) {
  limpiarTemporizadores();
  config = leerConfig();
  practica = esPractica;
  ensayos = crearEnsayos(practica ? Math.min(8, config.totalEnsayos) : config.totalEnsayos);
  indice = -1;
  ensayoActual = null;
  estado = "cuenta";
  ocultarTodo("juego");
  $("modoJuego").textContent = practica ? "Practica" : "Sesion real";
  $("precisionActual").textContent = "--";
  $("barraProgreso").style.width = "0%";
  $("feedbackVisual").textContent = practica ? "Practica: encuentra el objetivo lo mas rapido posible." : "Preparado.";
  cuentaRegresiva(3, () => {
    estado = "jugando";
    intervalReloj = window.setInterval(actualizarReloj, 100);
    siguienteEnsayo();
  });
}

function crearEnsayos(total) {
  return Array.from({ length: total }, (_, i) => ({ id: i + 1, correcta: null, rt: null, resultado: "pendiente", objetivoIndex: -1, clicksDistractor: 0 }));
}

function cuentaRegresiva(n, alTerminar) {
  const nodo = $("cuentaRegresiva");
  if (!nodo) return;
  nodo.textContent = n > 0 ? n : "INICIO";
  if (n <= 0) {
    window.setTimeout(() => { nodo.textContent = ""; alTerminar(); }, 520);
    return;
  }
  timeoutEnsayo = window.setTimeout(() => cuentaRegresiva(n - 1, alTerminar), 760);
}

function siguienteEnsayo() {
  limpiarEnsayo();
  if (estado !== "jugando") return;
  if (indice + 1 >= ensayos.length) {
    finalizarSesion();
    return;
  }
  indice += 1;
  ensayoActual = ensayos[indice];
  $("contadorEnsayos").textContent = `${indice + 1}/${ensayos.length}`;
  $("barraProgreso").style.width = `${Math.round((indice / ensayos.length) * 100)}%`;
  renderizarMatriz();
  inicioEnsayo = performance.now();
  actualizarReloj();
  beep(420, 0.018);
  timeoutEnsayo = window.setTimeout(() => cerrarPorTiempo(), config.tiempoEnsayo * 1000);
}

function renderizarMatriz() {
  const matriz = $("matrizVisual");
  if (!matriz || !ensayoActual) return;
  const total = config.tamanoMatriz * config.tamanoMatriz;
  const objetivoIndex = Math.floor(Math.random() * total);
  ensayoActual.objetivoIndex = objetivoIndex;
  matriz.style.setProperty("--grid", config.tamanoMatriz);
  matriz.innerHTML = "";
  const banco = bancos[config.tipoEstimulo] || bancos.formas;
  $("objetivoTexto").textContent = banco.objetivo;
  if (config.tipoEstimulo === "color") $("objetivoTexto").innerHTML = `<span style="color:${banco.colorObjetivo}">${banco.objetivo}</span>`;
  for (let i = 0; i < total; i += 1) {
    const boton = document.createElement("button");
    const esObjetivo = i === objetivoIndex;
    boton.type = "button";
    boton.className = `celda-visual aparicion${esObjetivo ? " target" : ""}`;
    boton.dataset.index = String(i);
    boton.setAttribute("role", "gridcell");
    boton.setAttribute("aria-label", esObjetivo ? "Objetivo" : "Distractor");
    boton.style.animationDelay = `${Math.min(180, i * 12)}ms`;
    boton.textContent = esObjetivo ? banco.objetivo : escogerDistractor(banco);
    if (config.tipoEstimulo === "color") boton.style.color = esObjetivo ? banco.colorObjetivo : escogerColorDistractor(banco);
    boton.addEventListener("click", () => responderCelda(boton, esObjetivo));
    matriz.appendChild(boton);
  }
}

function escogerDistractor(banco) {
  const lista = banco.distractores?.[config.similitud] || banco.distractores?.media || ["●"];
  let valor = lista[Math.floor(Math.random() * lista.length)];
  if (valor === banco.objetivo) valor = lista.find((x) => x !== banco.objetivo) || valor;
  return valor;
}

function escogerColorDistractor(banco) {
  const lista = banco.colores?.[config.similitud] || banco.colores?.media || ["#38bdf8"];
  return lista[Math.floor(Math.random() * lista.length)];
}

function responderCelda(boton, esObjetivo) {
  if (estado !== "jugando" || !ensayoActual || ensayoActual.resultado !== "pendiente") return;
  if (esObjetivo) {
    ensayoActual.correcta = true;
    ensayoActual.rt = Math.round(performance.now() - inicioEnsayo);
    ensayoActual.resultado = "acierto";
    boton.classList.add("correcta");
    feedback(`Correcto · ${ensayoActual.rt} ms`, "ok");
    beep(720, 0.035);
    programarSiguiente(520);
    return;
  }
  ensayoActual.clicksDistractor += 1;
  boton.classList.add("error");
  window.setTimeout(() => boton.classList.remove("error"), 480);
  feedback("Distractor. Busca el objetivo.", "error");
  beep(220, 0.025);
}

function cerrarPorTiempo() {
  if (!ensayoActual || ensayoActual.resultado !== "pendiente") return;
  ensayoActual.correcta = false;
  ensayoActual.rt = null;
  ensayoActual.resultado = "omision";
  feedback("Tiempo agotado", "warn");
  programarSiguiente(680);
}

function programarSiguiente(delay = 450) {
  window.clearTimeout(timeoutEnsayo);
  actualizarPrecisionEnVivo();
  timeoutEnsayo = window.setTimeout(siguienteEnsayo, delay);
}

function finalizarSesion() {
  estado = "resultados";
  limpiarTemporizadores();
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
  const aciertos = completados.filter((e) => e.resultado === "acierto").length;
  const omisiones = completados.filter((e) => e.resultado === "omision").length;
  const distractores = completados.reduce((sum, e) => sum + (e.clicksDistractor || 0), 0);
  const rts = completados.filter((e) => e.rt !== null).map((e) => e.rt);
  const accuracy = completados.length ? (aciertos / completados.length) * 100 : 0;
  return {
    actividad: "Busqueda visual",
    tipo: "rehabilitacion_cognitiva",
    dominio: ["Atencion", "Velocidad de procesamiento", "Visuoespacial"],
    date: new Date().toISOString(),
    practice: practica,
    difficulty: config.dificultad,
    stimulusType: config.tipoEstimulo,
    similarity: config.similitud,
    gridSize: `${config.tamanoMatriz}x${config.tamanoMatriz}`,
    totalTrials: completados.length,
    hits: aciertos,
    omissions: omisiones,
    distractorClicks: distractores,
    accuracy: Math.round(accuracy * 10) / 10,
    averageSearchTime: Math.round(promedio(rts) || 0),
    minimumSearchTime: rts.length ? Math.min(...rts) : 0,
    maximumSearchTime: rts.length ? Math.max(...rts) : 0,
    reactionTimeVariability: Math.round(desviacion(rts) || 0),
    trialHistory: completados
  };
}

function renderizarResultados(r) {
  const items = [["Precision", `${r.accuracy}%`], ["Aciertos", r.hits], ["Omisiones", r.omissions], ["Clics en distractor", r.distractorClicks], ["Tiempo promedio", `${r.averageSearchTime} ms`], ["Tiempo minimo", `${r.minimumSearchTime} ms`], ["Variabilidad", `${r.reactionTimeVariability} ms`], ["Matriz", r.gridSize], ["Nivel", r.difficulty], ["Estimulos", r.totalTrials], ["Fecha", new Date(r.date).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })]];
  $("resultadosGrid").innerHTML = items.map(([k, v]) => `<div class="resultado-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("interpretacionVisual").innerHTML = `<strong>Interpretacion prudente</strong><p>${interpretar(r).join(" ")}</p>`;
  renderGraficaLinea("lineaRt", r.trialHistory.map((e) => e.rt || 0));
  renderBarras("barrasAciertos", [["Aciertos", r.hits], ["Omisiones", r.omissions], ["Distractores", r.distractorClicks]]);
}

function interpretar(r) {
  const mensajes = [];
  if (r.accuracy >= 85 && r.distractorClicks <= Math.max(1, r.totalTrials * 0.12)) mensajes.push("Rendimiento alto en busqueda visual para esta sesion.");
  else if (r.accuracy >= 70) mensajes.push("Rendimiento funcional con margen de mejora en precision o velocidad.");
  else mensajes.push("Precision disminuida durante la tarea; conviene revisar fatiga, comprension de instrucciones, vision, distractibilidad y contexto clinico.");
  if (r.distractorClicks > Math.max(2, r.totalTrials * 0.25)) mensajes.push("Se observaron clics frecuentes sobre distractores, compatible con dificultad de discriminacion o impulsividad visual durante la actividad.");
  if (r.omissions > Math.max(2, r.totalTrials * 0.2)) mensajes.push("Las omisiones sugieren posible lentificacion del escaneo visual o fluctuacion atencional.");
  if (r.reactionTimeVariability > 450) mensajes.push("La variabilidad del tiempo de busqueda fue elevada.");
  return mensajes;
}

function renderGraficaLinea(id, valores) {
  const nodo = $(id);
  if (!nodo) return;
  const max = Math.max(...valores, 1);
  const puntos = valores.map((v, i) => `${(i / Math.max(1, valores.length - 1)) * 100},${100 - (v / max) * 86}`).join(" ");
  nodo.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${puntos}" fill="none" stroke="#38bdf8" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="0" y1="96" x2="100" y2="96" stroke="rgba(148,163,184,.25)" vector-effect="non-scaling-stroke"/></svg><small>Max: ${Math.round(max)} ms</small>`;
}

function renderBarras(id, datos) {
  const nodo = $(id);
  if (!nodo) return;
  const max = Math.max(...datos.map(([, v]) => v), 1);
  nodo.innerHTML = datos.map(([k, v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4, (v / max) * 100)}%"></i><strong>${v}</strong></div>`).join("");
}

function cancelarSesion(mensaje = "Sesion cancelada.") { limpiarTemporizadores(); limpiarEnsayo(); estado = "config"; ocultarTodo("config"); mostrarToast(mensaje); }
function limpiarEnsayo() { $("matrizVisual").innerHTML = ""; $("tiempoRestante").textContent = "0.0 s"; }
function limpiarTemporizadores() { window.clearTimeout(timeoutEnsayo); window.clearInterval(intervalReloj); timeoutEnsayo = null; intervalReloj = null; }
function actualizarReloj() { if (estado !== "jugando" || !ensayoActual || ensayoActual.resultado !== "pendiente") return; const restante = Math.max(0, config.tiempoEnsayo - ((performance.now() - inicioEnsayo) / 1000)); $("tiempoRestante").textContent = `${restante.toFixed(1)} s`; }
function actualizarPrecisionEnVivo() { const hechos = ensayos.filter((e) => e.resultado !== "pendiente"); const precision = hechos.length ? (hechos.filter((e) => e.correcta).length / hechos.length) * 100 : 0; $("precisionActual").textContent = hechos.length ? `${Math.round(precision)}%` : "--"; }
function manejarTeclado(event) { if (event.key === "Escape" && estado === "jugando") cancelarSesion(); }
function ocultarTodo(vista) { $("pantallaInicio")?.classList.toggle("oculta", vista !== "inicio"); $("pantallaConfiguracion")?.classList.toggle("visible", vista === "config"); $("pantallaConfiguracion")?.classList.toggle("oculta", vista !== "config"); $("pantallaJuego")?.classList.toggle("visible", vista === "juego"); $("pantallaJuego")?.classList.toggle("oculta", vista !== "juego"); $("pantallaResultados")?.classList.toggle("visible", vista === "resultados"); $("pantallaResultados")?.classList.toggle("oculta", vista !== "resultados"); }
function guardarResultadoLocal(resultado) { const clave = `cognicion_busqueda_visual_${usuarioId || "anon"}`; const previos = JSON.parse(localStorage.getItem(clave) || "[]"); previos.unshift(resultado); localStorage.setItem(clave, JSON.stringify(previos.slice(0, 30))); }
async function guardarResultadoRemoto(resultado) { if (!usuarioId) return; try { const ref = doc(collection(db, "usuarios", usuarioId, "rehabilitacionResultados")); await setDoc(ref, { ...resultado, idResultado: ref.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }); } catch (error) { console.warn("No se pudo guardar Busqueda visual en Firestore; se conserva copia local.", error); } }
function feedback(texto, tipo) { if (!config.feedback && !practica) return; const nodo = $("feedbackVisual"); nodo.textContent = texto; nodo.className = `feedback-visual ${tipo}`; }
function beep(freq, dur) { if (!config?.sonido) return; try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.frequency.value = freq; gain.gain.value = 0.025; osc.connect(gain).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + dur); } catch (_) {} }
function limitar(v, min, max) { return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)); }
function promedio(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function desviacion(arr) { const avg = promedio(arr); return arr.length ? Math.sqrt(promedio(arr.map((v) => (v - avg) ** 2))) : 0; }
function mostrarToast(mensaje) { const t = $("toastVisual"); if (!t) return; t.textContent = mensaje; t.classList.add("visible"); window.setTimeout(() => t.classList.remove("visible"), 2600); }