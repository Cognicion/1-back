import { aplicarPresetMembrana, construirTablaIonica, calcularGHK, calcularPotencialesEquilibrio, ESTADO_MEMBRANA_BASE, IONES, PRESETS_MEMBRANA, sustituirEcuacionGHK, sustituirEcuacionNernst, validarEstadoMembrana } from "./ionModel.js";
import { simularPotencialAccion } from "./actionPotentialModel.js";
import { simularPropagacionAxonal } from "./axonPropagationModel.js";
import { EXPERIMENTOS_NEUROFISIOLOGIA } from "./experimentManager.js";
import { duplicarProyectoLaboratorio, eliminarProyectoLaboratorio, exportarCSVLaboratorio, guardarProyectoLaboratorio, listarProyectosLaboratorio } from "./labNotebook.js";
import { REGISTRO_FARMACOS_NEURO } from "./drugRegistry.js";
import { crearUiModeNeuro, GRAFICAS_POR_NIVEL, PASOS_TUTORIAL_NEURO } from "./learningModeController.js";
import { REGISTRO_ECUACIONES_NEURO } from "./equationRegistry.js";
import { aplicarFarmacoIntegrado, avanzarNeuronaIntegrada, crearEstadoNeuronaIntegrada, estimularNeuronaIntegrada, limpiarFarmacosIntegrados, actualizarParametrosIntegrados } from "./integratedNeuronModel.js";
import { dibujarGraficaIntegrada, poblarSelectorEcuaciones, poblarSelectorGraficas, renderizarEscenaIntegrada, renderizarExplicacionIntegrada, renderizarIndicadoresIntegrados, renderizarMatematicasIntegradas, renderizarTarjetaEstadoActual, renderizarVariablesIntegradas, resumenCopiableEcuacion } from "./integratedNeuronRenderer.js";
import { identificarZonaNeuroCanvas } from "./curvedMembraneRenderer.js";


const $ = (id) => document.getElementById(id);
let estadoMembrana = aplicarPresetMembrana("fisiologica");
let membranaActiva = false;
let accionActiva = false;
let axonActivo = false;
let rafMembrana = null;
let rafAccion = null;
let rafAxon = null;
let tiempoAccion = 0;
let tiempoAxon = 0;
let resultadoAccion = simularPotencialAccion();
let superposiciones = [];
let resultadoAxon = simularPropagacionAxonal();
let ultimoProyecto = null;
let integradaActiva = false;
let rafIntegrada = null;
let estadoIntegrado = crearEstadoNeuronaIntegrada();
let graficasIntegradasVisibles = new Set(["Vm"]);
let ecuacionCongelada = null;
let uiModeNeuro = crearUiModeNeuro();
let zonaNeuroSeleccionada = null;
let interaccionesCanvasIntegradoListas = false;
let cierreDetalleNeuroEnCurso = false;
let ultimoDisparadorDetalleNeuro = null;
let cierreGlobalDetalleInstalado = false;
const arrastreNeuro = { activo: false, movido: false, inicioX: 0, inicioY: 0, ultimoX: 0, ultimoY: 0 };
let tutorialVistoNeuro = localStorage.getItem("cognicionNeuroTutorialVisto") === "1";
const escena = $("escenaMembrana");
const graficaAccion = $("graficaAccion");
const graficaAxon = $("graficaAxon");
const graficaIntegrada = $("graficaIntegrada");

inicializarSeguro();

function asignarAyudasNeuro() {
  const ayudas = {
    btnIntegradaPlay: "Inicia la simulacion integrada: estimulo, potencial de accion, axon, Ca2+ terminal y sinapsis avanzan juntos.",
    btnIntegradaPausa: "Pausa la simulacion sin reiniciar variables. Util para observar canales, gradientes y graficas.",
    btnIntegradaReset: "Reinicia neurona, axon y sinapsis al estado fisiologico basal.",
    btnIntegradaPulso: "Aplica un estimulo unico breve. Permite observar un potencial aislado sin tren repetitivo.",
    globalPlaybackNeuro: "Controla el tiempo del modelo. Valores menores muestran los eventos ionicos en camara lenta.",
    intCamaraNeuro: "Cambia la escala visual: membrana, axon, terminal, sinapsis, farmacologia, matematica o modelo 3D fisico-quimico.",
    intNivelAprendizaje: "Ajusta cuanta informacion se muestra: basico para estudiantes, avanzado para variables y ecuaciones.",
    intIonVisible: "Filtra el ion protagonista para observar su gradiente y su flujo neto.",
    intMostrarCargas: "Muestra polaridad relativa dentro y fuera de la membrana.",
    intExplicacionPaso: "Activa explicacion sincronizada paso a paso y enlentece el avance educativo.",
    intFrecuencia: "Modifica la frecuencia de disparo del estimulo. Aumentarla genera mas eventos por unidad de tiempo.",
    intIntensidad: "Aumenta o reduce la corriente aplicada. Si supera umbral, facilita potenciales de accion.",
    intTipoSinapsis: "Selecciona neurotransmisor y tipo funcional de sinapsis para modificar receptores y respuesta postsinaptica.",
    intRecaptura: "Aumenta o reduce eliminacion por transportadores presinapticos.",
    intDegradacion: "Aumenta o reduce catabolismo enzimatico del neurotransmisor.",
    intFarmaco: "Selecciona un farmaco o droga experimental para observar cambios en canales, receptores o recaptura."
  };
  Object.entries(ayudas).forEach(([id, texto]) => {
    const el = $(id);
    if (el) el.title = texto;
  });
  document.querySelectorAll(".tabs-lab button,[data-lab-jump]").forEach((btn) => {
    if (!btn.title) btn.title = "Cambia de simulador conservando la logica sincronizada del laboratorio.";
  });
}
const AYUDAS_CONTROLES_NEURO = {
  intCamaraNeuro: { nombre: "Camara", tipo: "Visual", unidad: "vista", definicion: "Cambia la region anatomo-funcional que observas.", funcion: "No modifica ecuaciones; enfoca membrana, axon, terminal, sinapsis o una reconstruccion 3D fisico-quimica.", aumenta: "Permite acercarte a detalles moleculares.", disminuye: "Vuelve a una vista global.", rango: "Membrana, axon, terminal, sinapsis, general, farmacologia, matematica y modelo 3D.", ejemplo: "Usa Modelo 3D para rotar la neurona y ver gradientes, canales, mielina y sinapsis en volumen." },
  intNivelAprendizaje: { nombre: "Nivel de aprendizaje", tipo: "Visual", unidad: "nivel", definicion: "Ajusta cuanta informacion aparece en pantalla.", funcion: "Controla etiquetas, detalle y graficas visibles.", aumenta: "Muestra mas estructuras y variables.", disminuye: "Reduce saturacion visual.", rango: "Basico, intermedio, avanzado.", ejemplo: "Basico para entender el flujo; avanzado para ecuaciones." },
  globalPlaybackNeuro: { nombre: "Tiempo global", tipo: "Temporal", unidad: "x", definicion: "Escala la velocidad de reproduccion del modelo.", funcion: "Modifica la velocidad con la que avanzan los eventos simulados.", aumenta: "Los eventos ocurren mas rapido.", disminuye: "Se observa en camara lenta.", rango: "0.05x a 8x.", ejemplo: "0.1x ayuda a ver entrada de Ca2+ y liberacion vesicular." },
  intVelocidadParticulas: { nombre: "Velocidad visual de particulas", tipo: "Visual", unidad: "categoria", definicion: "Controla la rapidez con la que se dibujan iones y moleculas.", funcion: "No cambia corriente, voltaje ni concentraciones; solo representacion.", aumenta: "Las particulas se desplazan mas rapido.", disminuye: "El movimiento se vuelve mas didactico.", rango: "Muy lenta, lenta, normal educativa.", ejemplo: "Muy lenta permite seguir el Ca2+ hacia la zona activa." },
  intDensidadParticulas: { nombre: "Intensidad visual de particulas", tipo: "Visual", unidad: "categoria", definicion: "Ajusta cuantas particulas se dibujan.", funcion: "Representa visibilidad, no numero real de iones.", aumenta: "La escena se ve mas poblada.", disminuye: "Menos saturacion visual.", rango: "Muy baja a alta.", ejemplo: "Baja evita que se encimen los neurotransmisores." },
  intIonVisible: { nombre: "Ion visible", tipo: "Visual", unidad: "ion", definicion: "Filtra la particula que quieres estudiar.", funcion: "Ayuda a seguir Na+, K+, Cl- o Ca2+ sin modificar el modelo.", aumenta: "No aplica.", disminuye: "No aplica.", rango: "Todos, Na+, K+, Cl-, Ca2+.", ejemplo: "Selecciona Ca2+ para ver fusion vesicular." },
  intMostrarCargas: { nombre: "Mostrar cargas", tipo: "Visual", unidad: "on/off", definicion: "Dibuja polaridad relativa intra y extracelular.", funcion: "Facilita entender gradiente electrico.", aumenta: "Muestra signos de carga.", disminuye: "Oculta una capa visual.", rango: "Activado o desactivado.", ejemplo: "Util para explicar por que el interior es negativo." },
  intExplicacionPaso: { nombre: "Explicacion paso a paso", tipo: "Didactico", unidad: "on/off", definicion: "Sincroniza explicaciones con las fases del modelo.", funcion: "No cambia fisiologia; cambia la guia educativa.", aumenta: "La simulacion queda mas narrada.", disminuye: "La escena queda mas libre.", rango: "Activado o desactivado.", ejemplo: "Activala en clase o tutorial." },
  intReducirAnimaciones: { nombre: "Reducir animaciones", tipo: "Accesibilidad", unidad: "on/off", definicion: "Disminuye movimiento para mejorar tolerancia visual.", funcion: "No cambia ecuaciones.", aumenta: "Menos movimiento en pantalla.", disminuye: "Animacion completa.", rango: "Activado o desactivado.", ejemplo: "Usalo si la escena se siente saturada." },
  intFrecuencia: { nombre: "Frecuencia de estimulacion", tipo: "Fisiologico", unidad: "Hz", definicion: "Numero de estimulos por segundo.", funcion: "Modifica la probabilidad de eventos repetidos en el modelo integrado.", aumenta: "Mas disparos y mayor activacion terminal.", disminuye: "Menos activacion sinaptica.", rango: "0.1 a 40 Hz didacticos.", ejemplo: "Frecuencias altas pueden aumentar liberacion de neurotransmisor." },
  intIntensidad: { nombre: "Intensidad del estimulo", tipo: "Fisiologico", unidad: "relativa", definicion: "Magnitud de corriente aplicada a la neurona.", funcion: "Si supera umbral, favorece potencial de accion.", aumenta: "Mayor despolarizacion.", disminuye: "Estimulos subumbrales.", rango: "0 a 30 unidades relativas.", ejemplo: "Al subirla, se activa NaV con mayor facilidad." },
  intDiametro: { nombre: "Diametro del axon", tipo: "Anatomico/Fisiologico", unidad: "um", definicion: "Grosor transversal del axon.", funcion: "En el modelo participa en velocidad de conduccion al modificar resistencia axial aproximada.", aumenta: "Menor resistencia axial y conduccion mas rapida.", disminuye: "Mayor resistencia axial y conduccion mas lenta.", rango: "0.2 a 12 um.", ejemplo: "Axones grandes conducen con mayor facilidad, especialmente con mielina." },
  intTemperatura: { nombre: "Temperatura", tipo: "Fisiologico", unidad: "C", definicion: "Temperatura del tejido simulado.", funcion: "Afecta cinetica y velocidad de conduccion aproximada.", aumenta: "Canales y conduccion se aceleran hasta limites fisiologicos.", disminuye: "Conduccion mas lenta.", rango: "10 a 42 C.", ejemplo: "Hipotermia enlentece la conduccion." },
  intTipoSinapsis: { nombre: "Tipo de sinapsis", tipo: "Fisiologico", unidad: "neurotransmisor", definicion: "Selecciona el sistema neurotransmisor predominante.", funcion: "Cambia receptores, transportadores y tipo de respuesta postsinaptica.", aumenta: "No aplica.", disminuye: "No aplica.", rango: "Glutamato, GABA, dopamina, serotonina, noradrenalina.", ejemplo: "GABA favorece inhibicion por Cl- y K+." },
  intVesiculas: { nombre: "Vesiculas visibles", tipo: "Visual", unidad: "conteo educativo", definicion: "Cantidad de vesiculas dibujadas en la terminal.", funcion: "Representa disponibilidad visual; no es conteo real.", aumenta: "Mas vesiculas en pantalla.", disminuye: "Menos saturacion.", rango: "8 a 48.", ejemplo: "Subelo para estudiar reservas vesiculares." },
  intLiberacion: { nombre: "Probabilidad basal de liberacion", tipo: "Fisiologico", unidad: "0-1", definicion: "Probabilidad aproximada de fusion vesicular ante Ca2+.", funcion: "Afecta liberacion de neurotransmisor.", aumenta: "Mas neurotransmisor en hendidura.", disminuye: "Menor respuesta postsinaptica.", rango: "0.05 a 1.", ejemplo: "Toxinas o farmacos pueden modificar liberacion." },
  intRecaptura: { nombre: "Recaptura", tipo: "Fisiologico", unidad: "relativa", definicion: "Actividad de transportadores que retiran neurotransmisor.", funcion: "Reduce neurotransmisor disponible en hendidura.", aumenta: "Senal mas breve.", disminuye: "Senal mas prolongada.", rango: "0 a 1.5.", ejemplo: "Cocaina reduce DAT y aumenta dopamina sinaptica." },
  intDegradacion: { nombre: "Degradacion enzimatica", tipo: "Fisiologico", unidad: "relativa", definicion: "Catabolismo del neurotransmisor por enzimas.", funcion: "Reduce concentracion sinaptica.", aumenta: "Senal mas corta.", disminuye: "Senal mas persistente.", rango: "0 a 1.5.", ejemplo: "MAO/COMT metabolizan monoaminas." },
  intSensibilidad: { nombre: "Sensibilidad postsinaptica", tipo: "Fisiologico", unidad: "relativa", definicion: "Respuesta de receptores postsinapticos al neurotransmisor.", funcion: "Modula amplitud del potencial postsinaptico.", aumenta: "Mayor respuesta por la misma cantidad de neurotransmisor.", disminuye: "Respuesta menor.", rango: "0.2 a 2.", ejemplo: "Cambios adaptativos pueden aumentar o reducir sensibilidad." },
  intFarmaco: { nombre: "Farmaco o droga", tipo: "Experimental", unidad: "sustancia", definicion: "Selecciona una sustancia para modificar canales, receptores o recaptura.", funcion: "Aplica efectos pedagogicos sobre el modelo.", aumenta: "Depende del farmaco elegido.", disminuye: "Depende del farmaco elegido.", rango: "Catalogo experimental.", ejemplo: "Cocaina aumenta monoaminas al bloquear recaptura." },
  tiempoIonesMembrana: { nombre: "Tiempo de movimiento de iones", tipo: "Temporal/Visual", unidad: "x mas lento", definicion: "Escala la animacion de iones del simulador de membrana.", funcion: "No modifica GHK ni Nernst; solo la velocidad visual.", aumenta: "Movimiento mas lento.", disminuye: "Movimiento mas rapido.", rango: "0.6 a 6x.", ejemplo: "6x permite observar entradas y salidas con calma." },
  estimuloIntensidad: { nombre: "Intensidad del estimulo", tipo: "Fisiologico", unidad: "uA/cm2 aprox.", definicion: "Corriente externa aplicada en el modelo HH reducido.", funcion: "Puede llevar Vm al umbral.", aumenta: "Mas probabilidad de potencial de accion.", disminuye: "Respuesta subumbral.", rango: "0 a 30.", ejemplo: "Un pulso intenso abre canales de Na+." },
  diametroAxon: { nombre: "Diametro del axon", tipo: "Anatomico/Fisiologico", unidad: "um", definicion: "Grosor del axon en propagacion.", funcion: "Participa en velocidad por resistencia axial aproximada.", aumenta: "Conduccion mas rapida.", disminuye: "Conduccion mas lenta.", rango: "0.2 a 12 um.", ejemplo: "Mayor diametro facilita propagacion." }
};

function instalarAyudasContextualesNeuro() {
  document.querySelectorAll(".controles-lab label").forEach((label) => {
    const control = label.querySelector("input, select, textarea");
    if (!control || label.querySelector(".btn-ayuda-control")) return;
    const meta = AYUDAS_CONTROLES_NEURO[control.id] || ayudaGenericaDesdeControl(label, control);
    if (!meta) return;
    label.classList.add("label-con-ayuda");
    const badge = document.createElement("span");
    badge.className = `tipo-parametro tipo-${String(meta.tipo || "visual").toLowerCase().split("/")[0]}`;
    badge.textContent = meta.tipo || "Visual";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-ayuda-control";
    btn.textContent = "?";
    btn.title = `Explicar ${meta.nombre}`;
    btn.setAttribute("aria-label", `Explicar ${meta.nombre}`);
    btn.addEventListener("pointerdown", (evento) => evento.stopPropagation());
    btn.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      mostrarAyudaParametroNeuro(meta, control, btn);
    });
    label.append(badge, btn);
  });
}

function ayudaGenericaDesdeControl(label, control) {
  const nombre = (label.childNodes[0]?.textContent || control.id || "Parametro").trim();
  return {
    nombre,
    tipo: control.type === "checkbox" ? "Visual" : control.type === "range" ? "Fisiologico/Visual" : "Parametro",
    unidad: control.min || control.max ? "segun rango del control" : "variable",
    definicion: "Parametro del laboratorio de neurofisiologia.",
    funcion: "Modifica el comportamiento o la representacion segun el simulador activo.",
    aumenta: "Si aumenta, observa el cambio en la escena y en las graficas.",
    disminuye: "Si disminuye, compara la respuesta con el valor basal.",
    rango: control.min || control.max ? `${control.min || "min"} a ${control.max || "max"}` : "Opciones del selector.",
    ejemplo: "Usalo junto con las graficas para distinguir efecto fisiologico y efecto visual."
  };
}

function mostrarAyudaParametroNeuro(meta, control, disparador) {
  ultimoDisparadorDetalleNeuro = disparador || control || null;
  let panel = document.getElementById("panelAyudaParametroNeuro");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "panelAyudaParametroNeuro";
    panel.className = "panel-ayuda-parametro-neuro";
    document.body.appendChild(panel);
  }
  const valor = control?.type === "checkbox" ? (control.checked ? "Activado" : "Desactivado") : (control?.value ?? "");
  panel.hidden = false;
  panel.inert = false;
  panel.setAttribute("aria-hidden", "false");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `Ayuda: ${meta.nombre}`);
  panel.innerHTML = `<button type="button" data-cerrar-ayuda-neuro aria-label="Cerrar ayuda">x</button><span class="kicker">${meta.tipo || "Parametro"}</span><h3>${meta.nombre}</h3><dl><dt>Definicion sencilla</dt><dd>${meta.definicion}</dd><dt>Funcion</dt><dd>${meta.funcion}</dd><dt>Efecto en el modelo</dt><dd>${meta.tipo === "Visual" ? "Cambia la representacion grafica, no las ecuaciones." : "Puede modificar variables del modelo o su reproduccion."}</dd><dt>Si aumenta</dt><dd>${meta.aumenta}</dd><dt>Si disminuye</dt><dd>${meta.disminuye}</dd><dt>Unidad</dt><dd>${meta.unidad || "No especificada"}</dd><dt>Valor actual</dt><dd>${valor}</dd><dt>Rango</dt><dd>${meta.rango || "Segun control"}</dd><dt>Ejemplo</dt><dd>${meta.ejemplo}</dd><dt>Relacion farmacologica</dt><dd>${meta.farmaco || "Farmacos y drogas pueden modificar canales, receptores, recaptura, degradacion o excitabilidad segun el caso."}</dd><dt>Nivel de evidencia del modelo</dt><dd>${meta.tipo === "Visual" ? "Solo visual" : "Aproximacion didactica basada en principios fisiologicos."}</dd></dl>`;
  panel.querySelector("[data-cerrar-ayuda-neuro]")?.focus();
}

function cerrarAyudaParametroNeuro() {
  const panel = document.getElementById("panelAyudaParametroNeuro");
  if (!panel) return;
  panel.hidden = true;
  panel.inert = true;
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = "";
  devolverFocoDetalleNeuro();
}

function instalarCierreGlobalDetalleNeuro() {
  if (cierreGlobalDetalleInstalado) return;
  cierreGlobalDetalleInstalado = true;
  const cerrarSiCorresponde = (evento) => {
    const botonDetalle = evento.target?.closest?.("[data-cerrar-detalle-neuro]");
    const botonAyuda = evento.target?.closest?.("[data-cerrar-ayuda-neuro]");
    const botonAislar = evento.target?.closest?.("[data-neuro-aislar]");
    if (!botonDetalle && !botonAyuda && !botonAislar) return;
    evento.preventDefault();
    evento.stopPropagation();
    if (botonDetalle) cerrarDetalleNeuroSeleccionado();
    if (botonAyuda) cerrarAyudaParametroNeuro();
    if (botonAislar) aislarFuncionamientoNeuro();
  };
  document.addEventListener("pointerup", cerrarSiCorresponde, true);
  document.addEventListener("click", cerrarSiCorresponde, true);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      cerrarDetalleNeuroSeleccionado();
      cerrarAyudaParametroNeuro();
    }
    if ((evento.key === "Enter" || evento.key === " ") && evento.target?.matches?.("[data-cerrar-detalle-neuro], [data-cerrar-ayuda-neuro]")) {
      evento.preventDefault();
      if (evento.target.matches("[data-cerrar-detalle-neuro]")) cerrarDetalleNeuroSeleccionado();
      if (evento.target.matches("[data-cerrar-ayuda-neuro]")) cerrarAyudaParametroNeuro();
    }
  }, true);
}

function devolverFocoDetalleNeuro() {
  const destino = ultimoDisparadorDetalleNeuro;
  ultimoDisparadorDetalleNeuro = null;
  if (destino && typeof destino.focus === "function" && document.contains(destino)) destino.focus({ preventScroll: true });
}
function factorTiempoGlobalNeuro() {
  const valor = Number($("globalPlaybackNeuro")?.value || 1);
  return Math.max(0.05, Math.min(8, valor));
}

function configurarSaltosEntreSimuladores() {
  document.querySelectorAll("[data-lab-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.labJump;
      if (destino === "accion") actualizarAccion();
      if (destino === "axon") actualizarAxon();
      cambiarTab(destino);
    });
  });
}
function inicializarSeguro() {
  try {
    inicializar();
  } catch (error) {
    console.error("Error al iniciar laboratorio de neurofisiologia", error);
    mostrarErrorLaboratorio(error);
  }
}

function ejecutarBloqueLaboratorio(nombre, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`Error en ${nombre}`, error);
    mostrarErrorLaboratorio(error, nombre);
  }
}

function inicializar() {
  ejecutarBloqueLaboratorio("tabs", () => document.querySelectorAll(".tabs-lab button").forEach((btn) => btn.addEventListener("click", () => cambiarTab(btn.dataset.tab))));
  ejecutarBloqueLaboratorio("ayudas", () => { asignarAyudasNeuro(); instalarAyudasContextualesNeuro(); instalarCierreGlobalDetalleNeuro(); });
  ejecutarBloqueLaboratorio("presets", poblarPresets);
  ejecutarBloqueLaboratorio("simulador integrado", vincularIntegrada);
  ejecutarBloqueLaboratorio("interacciones de canvas integrado", vincularInteraccionesCanvasIntegrado);
  ejecutarBloqueLaboratorio("membrana", vincularMembrana);
  ejecutarBloqueLaboratorio("potencial de accion", vincularAccion);
  ejecutarBloqueLaboratorio("axon", vincularAxon);
  ejecutarBloqueLaboratorio("experimentos", renderizarExperimentos);
  ejecutarBloqueLaboratorio("saltos", configurarSaltosEntreSimuladores);
  ejecutarBloqueLaboratorio("cuaderno", vincularCuaderno);
  ejecutarBloqueLaboratorio("render membrana", () => { sincronizarControlesMembrana(); renderizarMembrana(); });
  ejecutarBloqueLaboratorio("render accion", actualizarAccion);
  ejecutarBloqueLaboratorio("render axon", actualizarAxon);
  ejecutarBloqueLaboratorio("proyectos", renderizarProyectos);
}

function mostrarErrorLaboratorio(error, contexto = "laboratorio") {
  const contenedor = document.querySelector(".neuro-shell") || document.body;
  if (!contenedor || document.getElementById("errorLaboratorioNeuro")) return;
  const aviso = document.createElement("div");
  aviso.id = "errorLaboratorioNeuro";
  aviso.className = "alerta-lab";
  aviso.textContent = `Se detecto un problema al iniciar ${contexto}. Revisa consola: ${error?.message || error}`;
  contenedor.prepend(aviso);
}

function cambiarTab(tab) {
  document.querySelectorAll(".tabs-lab button").forEach((b) => b.classList.toggle("activo", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("activo", p.id === `tab-${tab}`));
}

function poblarPresets() {
  const select = $("presetMembrana");
  select.innerHTML = Object.entries(PRESETS_MEMBRANA).map(([id, p]) => `<option value="${id}">${p.nombre}</option>`).join("") + `<option value="fisiologica">Restablecer valores fisiologicos</option>`;
}

function leerTiempoIonicoMembrana() {
  const valor = Number($("tiempoIonesMembrana")?.value || 2.5);
  return Math.max(0.6, Math.min(6, valor));
}

function actualizarEtiquetaTiempoIonico() {
  const escala = leerTiempoIonicoMembrana();
  const etiqueta = $("tiempoIonesMembranaValor");
  if (etiqueta) etiqueta.textContent = `${escala.toFixed(1)}x mas lento`;
  if (escena) escena.style.setProperty("--ion-time-scale", escala.toFixed(2));
}
function vincularMembrana() {
  $("presetMembrana").addEventListener("change", (e) => { estadoMembrana = aplicarPresetMembrana(e.target.value); sincronizarControlesMembrana(); renderizarMembrana(); actualizarAccion(); actualizarAxon(); });
  document.querySelectorAll("[data-ion]").forEach((input) => input.addEventListener("input", () => { const [ion, lugar] = input.dataset.ion.split("."); estadoMembrana.concentraciones[ion][lugar] = Number(input.value); renderizarMembrana(); }));
  document.querySelectorAll("[data-perm]").forEach((input) => input.addEventListener("input", () => { estadoMembrana.permeabilidades[input.dataset.perm] = Number(input.value); renderizarMembrana(); }));
  document.querySelector("[data-membrana='temperaturaC']").addEventListener("input", (e) => { estadoMembrana.temperaturaC = Number(e.target.value); renderizarMembrana(); actualizarAxon(); });
  $("bombaNaK").addEventListener("input", (e) => { estadoMembrana.bombaNaK = Number(e.target.value); renderizarMembrana(); });
  $("zoomMembrana").addEventListener("input", (e) => { escena.style.transform = `scale(${e.target.value})`; });
  $("tiempoIonesMembrana")?.addEventListener("input", () => { actualizarEtiquetaTiempoIonico(); renderizarMembrana(); });
  ["verIones", "verCargas", "verCanales", "verFlechas"].forEach((id) => $(id).addEventListener("change", renderizarMembrana));
  ["ionActivoMembrana", "vistaMembrana", "drogaAbusoMembrana"].forEach((id) => $(id)?.addEventListener("change", renderizarMembrana));
  $("btnMembranaPlay").addEventListener("click", () => { membranaActiva = true; animarMembrana(); });
  $("btnMembranaPausa").addEventListener("click", () => { membranaActiva = false; cancelAnimationFrame(rafMembrana); });
  $("btnMembranaReset").addEventListener("click", () => { estadoMembrana = aplicarPresetMembrana("fisiologica"); sincronizarControlesMembrana(); renderizarMembrana(); });
  $("btnMembranaPaso").addEventListener("click", () => desplazarIones(true));
}

function sincronizarControlesMembrana() {
  document.querySelector("[data-membrana='temperaturaC']").value = estadoMembrana.temperaturaC;
  Object.entries(estadoMembrana.concentraciones).forEach(([ion, vals]) => { document.querySelector(`[data-ion='${ion}.extra']`).value = vals.extra; document.querySelector(`[data-ion='${ion}.intra']`).value = vals.intra; });
  Object.entries(estadoMembrana.permeabilidades).forEach(([ion, val]) => { const input = document.querySelector(`[data-perm='${ion}']`); if (input) input.value = val; });
  $("bombaNaK").value = estadoMembrana.bombaNaK;
}

function renderizarMembrana() {
  escena.querySelectorAll(".ion,.flecha-flujo,.carga,.ion-flujo-dirigido,.canal-selectivo,.droga-abuso-molecula").forEach((n) => n.remove());
  escena.classList.remove("vista-corte", "vista-sinapsis");
  const vm = calcularGHK(estadoMembrana);
  const potenciales = calcularPotencialesEquilibrio(estadoMembrana);
  const validacion = validarEstadoMembrana(estadoMembrana);
  const tabla = construirTablaIonica(estadoMembrana);
  const ionActivo = $("ionActivoMembrana")?.value || "na";
  const vista = $("vistaMembrana")?.value || "membrana";
  const droga = $("drogaAbusoMembrana")?.value || "ninguna";
  aplicarVistaEducativaMembrana(vista);
  if ($("verIones").checked) crearIonesVisuales();
  if ($("verFlechas").checked) crearFlechasVisuales();
  escena.classList.toggle("sin-canales", !$("verCanales").checked);
  crearCanalSelectivoMembrana(tabla, ionActivo, droga);
  crearFlujoDirigidoMembrana(tabla, ionActivo, droga);
  renderizarPanelNeurovisualMembrana(tabla, ionActivo, vista, droga, vm, potenciales);
  $("indicadoresMembrana").innerHTML = [
    ["Vm actual", `${vm.toFixed(1)} mV`], ["ENa", `${potenciales.na.toFixed(1)} mV`], ["EK", `${potenciales.k.toFixed(1)} mV`], ["ECl", `${potenciales.cl.toFixed(1)} mV`], ["ECa", `${potenciales.ca.toFixed(1)} mV`], ["Bomba Na/K", `${Math.round(estadoMembrana.bombaNaK * 100)}%`]
  ].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("") + validacion.advertencias.map((a) => `<article><span>Advertencia</span><strong>${a}</strong></article>`).join("");
  $("tablaIonica").querySelector("tbody").innerHTML = tabla.map((r) => `<tr class="${r.ion.id === ionActivo ? "ion-activo-row" : ""}"><td style="color:${r.ion.color}">${r.ion.etiqueta}</td><td>${r.intra}</td><td>${r.extra}</td><td>${Number(r.permeabilidad).toFixed(3)}</td><td>${r.potencial.toFixed(1)} mV</td><td>${r.flujo.direccion}</td></tr>`).join("");
  $("ecuacionesMembrana").innerHTML = `<code>${sustituirEcuacionGHK(estadoMembrana)}</code>` + Object.keys(IONES).map((id) => `<code>${sustituirEcuacionNernst(estadoMembrana, id)}</code>`).join("");
}

function aplicarVistaEducativaMembrana(vista) {
  escena.classList.toggle("vista-corte", vista === "corte");
  escena.classList.toggle("vista-sinapsis", vista === "sinapsis");
}

function crearCanalSelectivoMembrana(tabla, ionActivo, droga) {
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  if (!fila) return;
  const canal = document.createElement("span");
  canal.className = `canal-selectivo ${ionActivo}`;
  canal.innerHTML = `<b>${fila.ion.etiqueta}</b><small>${fila.flujo.direccion}</small>`;
  escena.appendChild(canal);
  if (droga !== "ninguna") {
    const molecula = document.createElement("span");
    molecula.className = `droga-abuso-molecula droga-${droga}`;
    molecula.textContent = etiquetaDrogaAbuso(droga);
    escena.appendChild(molecula);
  }
}

function crearFlujoDirigidoMembrana(tabla, ionActivo, droga) {
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  if (!fila) return;
  const haciaInterior = fila.flujo.direccion === "hacia el interior";
  const cantidad = Math.max(5, Math.min(18, Math.round(Math.abs(fila.flujo.flujo) / 7) + 6));
  for (let i = 0; i < cantidad; i += 1) {
    const p = document.createElement("span");
    p.className = `ion-flujo-dirigido ${ionActivo} ${haciaInterior ? "entra" : "sale"}`;
    p.textContent = fila.ion.etiqueta;
    p.style.setProperty("--x", `${20 + ((i * 9) % 58)}%`);
    p.style.setProperty("--delay", `${i * 0.13}s`);
    p.style.setProperty("--color", fila.ion.color);
    if (droga !== "ninguna") p.classList.add("modulado");
    escena.appendChild(p);
  }
}

function renderizarPanelNeurovisualMembrana(tabla, ionActivo, vista, droga, vm, potenciales) {
  const panel = $("panelNeurovisualMembrana");
  if (!panel) return;
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  const drogaInfo = efectoDrogaAbuso(droga);
  const vistaHtml = vista === "corte" ? crearCorteAxonalHtml(fila) : vista === "sinapsis" ? crearSinapsisZoomHtml(fila, droga) : crearMembranaZoomHtml(fila);
  panel.innerHTML = `
    <article class="neurovisual-card principal"><span class="kicker">Ion protagonista</span><h3>${fila.ion.etiqueta}: ${fila.flujo.direccion}</h3><p>${fila.flujo.gradienteQuimico}. ${fila.flujo.gradienteElectrico}. Vm ${vm.toFixed(1)} mV; E${fila.ion.etiqueta} ${potenciales[fila.ion.id].toFixed(1)} mV.</p></article>
    <article class="neurovisual-card visual">${vistaHtml}</article>
    <article class="neurovisual-card droga"><span class="kicker">Droga de abuso</span><h3>${drogaInfo.titulo}</h3><p>${drogaInfo.texto}</p></article>`;
}

function crearMembranaZoomHtml(fila) {
  return `<div class="mini-membrana"><span class="mini-extra">Extracelular</span><span class="mini-bicapa"><i>${fila.ion.etiqueta}</i><b>Canal selectivo</b></span><span class="mini-intra">Intracelular</span><em class="mini-transportador">Na/K ATPasa</em></div>`;
}

function crearCorteAxonalHtml(fila) {
  return `<div class="corte-axon-mini"><span class="mielina-anillo"></span><span class="axon-citoplasma"><i>${fila.ion.etiqueta}</i><i>${fila.ion.etiqueta}</i><i>${fila.ion.etiqueta}</i></span><b>Nodo/corte transversal</b><small>Se observan gradientes alrededor de la membrana axonal.</small></div>`;
}

function crearSinapsisZoomHtml(fila, droga) {
  return `<div class="sinapsis-mini"><span class="boton-presinaptico"><i></i><i></i><i></i><b>Vesiculas</b></span><span class="hendidura-mini"><i></i><i></i><i></i></span><span class="post-mini"><b>Receptores</b><em>Transportadores</em><em>Enzimas catabolicas</em></span>${droga !== "ninguna" ? `<strong>${etiquetaDrogaAbuso(droga)}</strong>` : ""}</div>`;
}

function etiquetaDrogaAbuso(droga) {
  return ({ cocaina: "Cocaina", anfetamina: "Anfetamina", alcohol: "Alcohol", opioide: "Opioide", cannabis: "Cannabis" })[droga] || "Sin droga";
}

function efectoDrogaAbuso(droga) {
  const mapa = {
    ninguna: { titulo: "Sin modulacion", texto: "La simulacion muestra el flujo ionico basal segun concentraciones, permeabilidad y Vm." },
    cocaina: { titulo: "Cocaina", texto: "Modelo educativo: aumenta senal monoaminergica por bloqueo de recaptura; se resaltan transportadores y mayor activacion sinaptica." },
    anfetamina: { titulo: "Anfetamina / metanfetamina", texto: "Modelo educativo: favorece liberacion monoaminergica; se visualiza mayor salida de neurotransmisor." },
    alcohol: { titulo: "Alcohol", texto: "Modelo educativo: potencia tono inhibitorio GABAergico y reduce excitabilidad; se resaltan Cl- y receptores inhibitorios." },
    opioide: { titulo: "Opioide", texto: "Modelo educativo: hiperpolarizacion por salida de K+ y menor liberacion presinaptica; se ve menor activacion terminal." },
    cannabis: { titulo: "Cannabis", texto: "Modelo educativo: modulacion presinaptica de liberacion; la sinapsis muestra menor probabilidad de descarga vesicular." }
  };
  return mapa[droga] || mapa.ninguna;
}
function crearIonesVisuales() {
  Object.values(IONES).forEach((ion) => {
    const total = ion.id === "ca" ? 8 : 18;
    for (let i = 0; i < total; i += 1) {
      const s = document.createElement("span");
      s.className = `ion ${ion.id}`;
      s.textContent = ion.etiqueta;
      s.style.left = `${5 + Math.random() * 88}%`;
      const extra = i < total / 2;
      s.style.top = extra ? `${6 + Math.random() * 28}%` : `${66 + Math.random() * 25}%`;
      escena.appendChild(s);
    }
  });
}

function crearFlechasVisuales() {
  Object.keys(IONES).forEach((ionId, i) => {
    const fila = construirTablaIonica(estadoMembrana).find((r) => r.ion.id === ionId);
    const f = document.createElement("span");
    f.className = "flecha-flujo";
    f.style.left = fila.flujo.direccion === "hacia el interior" ? "38%" : "52%";
    f.style.top = `${44 + i * 3.5}%`;
    f.style.width = `${24 + Math.min(34, Math.abs(fila.flujo.flujo) / 3)}px`;
    f.style.background = fila.ion.color;
    f.style.transform = fila.flujo.direccion === "hacia el exterior" ? "rotate(180deg)" : "none";
    escena.appendChild(f);
  });
}

function animarMembrana() {
  if (!membranaActiva) return;
  desplazarIones(false);
  rafMembrana = requestAnimationFrame(animarMembrana);
}

function desplazarIones() {
  const velocidad = Number($("velocidadMembrana").value || 1);
  escena.querySelectorAll(".ion").forEach((ion) => {
    const y = parseFloat(ion.style.top);
    const delta = (Math.random() - 0.5) * 1.8 * velocidad;
    ion.style.transform = `translate(${(Math.random() - 0.5) * 8}px, ${delta}px)`;
    if (y > 41 && y < 58) ion.style.transform += " scale(0.86)";
  });
}

function vincularAccion() {
  ["estimuloIntensidad", "estimuloDuracion", "estimuloInicio", "segundoEstimulo", "separacionEstimulo", "nivelAccion"].forEach((id) => $(id).addEventListener("input", actualizarAccion));
  $("btnAplicarEstimulo").addEventListener("click", actualizarAccion);
  $("btnAccionPlay").addEventListener("click", () => { accionActiva = true; tiempoAccion = 0; animarAccion(); });
  $("btnAccionPausa").addEventListener("click", () => { accionActiva = false; cancelAnimationFrame(rafAccion); });
  $("btnAccionReset").addEventListener("click", () => { accionActiva = false; tiempoAccion = 0; dibujarAccion(); });
  $("btnSuperponer").addEventListener("click", () => { superposiciones.push(resultadoAccion.trazas); dibujarAccion(); });
  $("btnLimpiarSuperposiciones").addEventListener("click", () => { superposiciones = []; dibujarAccion(); });
  graficaAccion.addEventListener("mousemove", tooltipAccion);
  graficaAccion.addEventListener("mouseleave", () => { const tip = $("tooltipAccion"); if (tip) tip.style.display = "none"; });
}

function parametrosAccion() {
  const potenciales = calcularPotencialesEquilibrio(estadoMembrana);
  return { ENa: potenciales.na, EK: potenciales.k, estimulo: { inicio: Number($("estimuloInicio").value), duracion: Number($("estimuloDuracion").value), intensidad: Number($("estimuloIntensidad").value) }, segundoEstimulo: { activo: $("segundoEstimulo").checked, separacion: Number($("separacionEstimulo").value), intensidad: Number($("estimuloIntensidad").value), duracion: Number($("estimuloDuracion").value) } };
}

function actualizarAccion() {
  resultadoAccion = simularPotencialAccion(parametrosAccion());
  dibujarAccion();
  $("resumenAccion").innerHTML = [["Pico", `${resultadoAccion.resumen.pico.toFixed(1)} mV`], ["Tiempo pico", `${resultadoAccion.resumen.tiempoPico.toFixed(2)} ms`], ["Umbral", resultadoAccion.resumen.superoUmbral ? "Superado" : "Subumbral"], ["Refractario abs.", resultadoAccion.resumen.refractarioAbsoluto ? resultadoAccion.resumen.refractarioAbsoluto.map((x) => x.toFixed(1)).join("-") + " ms" : "No evidente"]].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
}

function dibujarAccion(cursor = null) {
  const ctx = graficaAccion.getContext("2d");
  const w = graficaAccion.width, h = graficaAccion.height;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, w, h); dibujarGrid(ctx, w, h);
  superposiciones.forEach((tr) => dibujarTraza(ctx, tr, "rgba(125,211,252,.24)", "Vm", w, h));
  dibujarTraza(ctx, resultadoAccion.trazas, "#38bdf8", "Vm", w, h);
  if ($("nivelAccion").value !== "basico") { dibujarTraza(ctx, resultadoAccion.trazas, "#fb923c", "INa", w, h, 0.18); dibujarTraza(ctx, resultadoAccion.trazas, "#34d399", "IK", w, h, 0.18); }
  if (cursor !== null) { ctx.strokeStyle = "#e0f2fe"; ctx.beginPath(); ctx.moveTo(cursor, 0); ctx.lineTo(cursor, h); ctx.stroke(); }
  const punto = resultadoAccion.trazas[Math.min(resultadoAccion.trazas.length - 1, Math.floor((tiempoAccion / resultadoAccion.parametros.duracionMs) * resultadoAccion.trazas.length))] || resultadoAccion.trazas[0];
  $("canalSodio").textContent = punto.canales.sodio; $("canalPotasio").textContent = punto.canales.potasio;
}

function dibujarGrid(ctx, w, h) { ctx.strokeStyle = "rgba(125,211,252,.08)"; for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } }
function dibujarTraza(ctx, trazas, color, campo, w, h, escala = 1) { const maxT = trazas.at(-1).t; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); trazas.forEach((p, i) => { const x = p.t / maxT * w; const valor = campo === "Vm" ? p.Vm : p[campo] * escala; const y = h - ((valor + 90) / 150) * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); }
function animarAccion() { if (!accionActiva) return; tiempoAccion += 0.15 * Number($("velocidadAccion").value || 1) * factorTiempoGlobalNeuro(); if (tiempoAccion > resultadoAccion.parametros.duracionMs) { accionActiva = false; return; } dibujarAccion(tiempoAccion / resultadoAccion.parametros.duracionMs * graficaAccion.width); rafAccion = requestAnimationFrame(animarAccion); }
function tooltipAccion(e) {
  const rect = graficaAccion.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * graficaAccion.width;
  const idx = Math.max(0, Math.min(resultadoAccion.trazas.length - 1, Math.floor(x / graficaAccion.width * resultadoAccion.trazas.length)));
  const p = resultadoAccion.trazas[idx];
  const tip = $("tooltipAccion");
  if (!p || !tip) return;
  tip.innerHTML = `${p.t.toFixed(2)} ms<br>Vm ${p.Vm.toFixed(1)} mV<br>INa ${p.INa.toFixed(1)} | IK ${p.IK.toFixed(1)}<br>${p.fase}`;
  tip.style.display = "block";
  const margen = 12;
  const ancho = tip.offsetWidth || 170;
  const alto = tip.offsetHeight || 78;
  let left = e.clientX + 14;
  let top = e.clientY - alto - 14;
  if (top < margen) top = e.clientY + 18;
  left = Math.min(window.innerWidth - ancho - margen, Math.max(margen, left));
  top = Math.min(window.innerHeight - alto - margen, Math.max(margen, top));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function vincularAxon() { ["tipoAxon", "longitudAxon", "diametroAxon", "grosorMielina", "temperaturaAxon", "densidadNaAxon", "bloqueoAxon", "desmielinizacionActiva", "severidadDesmielina", "estimularDesde", "bidireccional"].forEach((id) => $(id).addEventListener("input", actualizarAxon)); $("btnAxonPlay").addEventListener("click", () => { axonActivo = true; tiempoAxon = 0; animarAxon(); }); $("btnAxonPausa").addEventListener("click", () => { axonActivo = false; cancelAnimationFrame(rafAxon); }); $("btnAxonReset").addEventListener("click", () => { axonActivo = false; tiempoAxon = 0; dibujarAxonVisual(); dibujarGraficaAxon(); }); }
function parametrosAxon() { return { longitudMm: Number($("longitudAxon").value), diametroUm: Number($("diametroAxon").value), mielina: $("tipoAxon").value === "mielinizado", grosorMielina: Number($("grosorMielina").value), temperaturaC: Number($("temperaturaAxon").value), densidadNa: Number($("densidadNaAxon").value), bloqueoCanales: Number($("bloqueoAxon").value), estimulacion: $("estimularDesde").value, bidireccional: $("bidireccional").checked, desmielinizacion: { activa: $("desmielinizacionActiva").checked, severidad: Number($("severidadDesmielina").value), inicioMm: 35, longitudMm: 15 } }; }
function actualizarAxon() { resultadoAxon = simularPropagacionAxonal(parametrosAxon()); dibujarAxonVisual(); dibujarGraficaAxon(); $("resumenAxon").innerHTML = [["Velocidad", `${resultadoAxon.velocidadMms.toFixed(2)} mm/ms`], ["Tiempo total", `${resultadoAxon.tiempoTotalMs.toFixed(1)} ms`], ["Seguridad", `${Math.round(resultadoAxon.seguridadConduccion * 100)}%`], ["Tipo", resultadoAxon.parametros.mielina ? "Saltatoria" : "Continua"]].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join(""); }
function dibujarAxonVisual() {
  const el = $("axonVisual");
  const p = resultadoAxon.parametros;
  el.innerHTML = `<div class="axon-linea"></div><span class="axon-label-mini inicio">Segmento inicial</span><span class="axon-label-mini terminal">Terminal axonal</span>`;
  if (p.desmielinizacion.activa) el.innerHTML += `<span class="lesion" style="left:${5 + p.desmielinizacion.inicioMm / p.longitudMm * 90}%;width:${p.desmielinizacion.longitudMm / p.longitudMm * 90}%"></span><span class="axon-label-mini lesion-label" style="left:${6 + p.desmielinizacion.inicioMm / p.longitudMm * 90}%">Desmielinizacion focal</span>`;
  if (p.mielina) {
    for (let x = 6; x < 92; x += 14) el.innerHTML += `<span class="mielina" style="left:${x}%;width:10%"></span><span class="nodo" style="left:${x + 10}%"></span><span class="axon-label-mini nodo-label" style="left:${x + 8}%">Nodo</span>`;
  } else {
    el.innerHTML += `<span class="axon-label-mini continuo">Conduccion continua</span>`;
  }
  resultadoAxon.electrodos.forEach((e, i) => { el.innerHTML += `<span class="electrodo" style="left:${5 + e.posicion / p.longitudMm * 90}%"></span><span class="axon-label-mini electrodo-label" style="left:${4 + e.posicion / p.longitudMm * 90}%">E${i + 1}</span>`; });
  const pos = Math.min(90, tiempoAxon / resultadoAxon.tiempoTotalMs * 90);
  el.innerHTML += `<span class="onda" style="left:${5 + pos}%"></span><span class="axon-label-mini onda-label" style="left:${5 + pos}%">Impulso</span>`;
}
function dibujarGraficaAxon() { const ctx = graficaAxon.getContext("2d"); const w = graficaAxon.width, h = graficaAxon.height; ctx.clearRect(0,0,w,h); ctx.fillStyle="#020617"; ctx.fillRect(0,0,w,h); dibujarGrid(ctx,w,h); const colores=["#38bdf8","#34d399","#facc15"]; resultadoAxon.electrodos.forEach((e,i)=>dibujarTraza(ctx,e.traza,colores[i%colores.length],"Vm",w,h)); }
function animarAxon(){ if(!axonActivo)return; tiempoAxon += 0.25 * factorTiempoGlobalNeuro(); if(tiempoAxon>resultadoAxon.tiempoTotalMs){axonActivo=false;return;} dibujarAxonVisual(); rafAxon=requestAnimationFrame(animarAxon); }

function renderizarExperimentos(){ $("listaExperimentos").innerHTML=EXPERIMENTOS_NEUROFISIOLOGIA.map((e)=>`<article class="experimento-card"><span class="kicker">${e.variableIndependiente}</span><h3>${e.titulo}</h3><p>${e.objetivo}</p><button data-exp="${e.id}">Cargar configuracion</button><details><summary>Ver guia</summary><p><b>Hipotesis:</b> ${e.hipotesis}</p><ol>${e.pasos.map(p=>`<li>${p}</li>`).join("")}</ol><p><b>Resultado esperado:</b> ${e.resultadoEsperado}</p><p>${e.explicacion}</p></details></article>`).join(""); document.querySelectorAll("[data-exp]").forEach((b)=>b.addEventListener("click",()=>cargarExperimento(b.dataset.exp))); }
function cargarExperimento(id){ const exp=EXPERIMENTOS_NEUROFISIOLOGIA.find(e=>e.id===id); if(!exp)return; if(exp.parametros.preset){estadoMembrana=aplicarPresetMembrana(exp.parametros.preset);sincronizarControlesMembrana();renderizarMembrana();} if(exp.parametros.gNa||exp.parametros.gK||exp.parametros.segundoEstimulo){$("segundoEstimulo").checked=Boolean(exp.parametros.segundoEstimulo);actualizarAccion();cambiarTab("accion");} else if(exp.parametros.mielina!==undefined||exp.parametros.desmielinizacion){$("tipoAxon").value=exp.parametros.mielina===false?"amielinico":"mielinizado";$("desmielinizacionActiva").checked=Boolean(exp.parametros.desmielinizacion);actualizarAxon();cambiarTab("axon");} else cambiarTab("membrana"); $("observacionesProyecto").value=`Experimento: ${exp.titulo}\nHipotesis: ${exp.hipotesis}\n`; }

function vincularCuaderno(){ $("btnGuardarProyecto").addEventListener("click",guardarProyectoActual); $("btnExportarCSV").addEventListener("click",()=>exportarCSVLaboratorio(resultadoAccion.trazas)); $("btnReporte").addEventListener("click",()=>window.print()); }
function guardarProyectoActual(){ ultimoProyecto=guardarProyectoLaboratorio({ nombre: $("nombreProyecto").value || "Proyecto neurofisiologia", observaciones: $("observacionesProyecto").value, parametrosMembrana: estadoMembrana, resultadoAccion: resultadoAccion.resumen, resultadoAxon: { velocidad: resultadoAxon.velocidadMms, seguridad: resultadoAxon.seguridadConduccion } }); renderizarProyectos(); }
function renderizarProyectos(){ const proyectos=listarProyectosLaboratorio(); $("listaProyectos").innerHTML=proyectos.length?proyectos.map(p=>`<div class="proyecto-item"><div><strong>${p.nombre}</strong><br><small>${p.actualizadoEn}</small></div><div><button data-dup="${p.id}">Duplicar</button><button data-del="${p.id}">Eliminar</button></div></div>`).join(""):"<p class='muted'>Aun no hay proyectos guardados.</p>"; document.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{if(confirm("Eliminar proyecto?")){eliminarProyectoLaboratorio(b.dataset.del);renderizarProyectos();}})); document.querySelectorAll("[data-dup]").forEach(b=>b.addEventListener("click",()=>{duplicarProyectoLaboratorio(b.dataset.dup);renderizarProyectos();})); }
function vincularIntegrada() {
  poblarFarmacosIntegrados();
  poblarSelectorEcuaciones($("intEcuacionSeleccionada"));
  aplicarNivelAprendizaje("basico");
  ["intFrecuencia", "intIntensidad", "intTipoAxon", "intDiametro", "intTemperatura", "intDesmielina", "intTipoSinapsis", "intVesiculas", "intLiberacion", "intRecaptura", "intDegradacion", "intSensibilidad"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { leerControlesIntegrados(); renderizarIntegrada(); });
  });
  ["intCamaraNeuro", "intNivelAprendizaje", "intVelocidadParticulas", "intDensidadParticulas", "intIonVisible", "intEtiquetasNeuro", "intMostrarCargas", "intExplicacionPaso", "intReducirAnimaciones", "intVistaMatematica"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { leerUiModeIntegrado(); renderizarIntegrada(true); });
  });
  $("intCategoriaFarmaco")?.addEventListener("change", poblarFarmacosIntegrados);
  $("intFarmaco")?.addEventListener("change", mostrarInfoFarmaco);
  $("btnIntegradaPlay")?.addEventListener("click", () => { estadoIntegrado.soloPulsoUnico = false; integradaActiva = true; animarIntegrada(); });
  $("btnIntegradaPausa")?.addEventListener("click", () => { integradaActiva = false; cancelAnimationFrame(rafIntegrada); });
  $("btnIntegradaReset")?.addEventListener("click", () => { integradaActiva = false; cancelAnimationFrame(rafIntegrada); estadoIntegrado = crearEstadoNeuronaIntegrada(); sincronizarControlesIntegrados(); renderizarIntegrada(true); });
  $("btnIntegradaPulso")?.addEventListener("click", () => { estimularNeuronaIntegrada(estadoIntegrado, null, { unico: true, duracionMs: 1.2 }); renderizarIntegrada(true); if (!integradaActiva) { integradaActiva = true; animarIntegrada(); } });
  $("btnIntAgregarFarmaco")?.addEventListener("click", () => { aplicarFarmacoIntegrado(estadoIntegrado, $("intFarmaco").value, Number($("intFarmacoIntensidad").value)); renderizarIntegrada(true); });
  $("btnIntLimpiarFarmacos")?.addEventListener("click", () => { limpiarFarmacosIntegrados(estadoIntegrado); renderizarIntegrada(true); });
  $("intSeguirEcuacion")?.addEventListener("change", () => renderizarIntegrada(true));
  $("intCongelarEcuacion")?.addEventListener("change", (e) => { ecuacionCongelada = e.target.checked ? ($("intEcuacionSeleccionada").value || estadoIntegrado.ecuacionActiva) : null; renderizarIntegrada(true); });
  $("intEcuacionSeleccionada")?.addEventListener("change", () => { ecuacionCongelada = $("intCongelarEcuacion")?.checked ? $("intEcuacionSeleccionada").value : null; renderizarIntegrada(true); });
  $("btnCopiarEcuacion")?.addEventListener("click", async () => {
    const texto = resumenCopiableEcuacion(estadoIntegrado, ecuacionCongelada || $("intEcuacionSeleccionada")?.value || estadoIntegrado.ecuacionActiva);
    try { await navigator.clipboard.writeText(texto); } catch { console.log(texto); }
  });
  $("btnTutorialNeuro")?.addEventListener("click", () => iniciarTutorialNeuro());
  $("btnPorQueNeuro")?.addEventListener("click", explicarPorQueNeuro);
  $("btnComenzarRecorrido")?.addEventListener("click", () => iniciarTutorialNeuro());
  $("tutorialNext")?.addEventListener("click", () => moverTutorialNeuro(1));
  $("tutorialPrev")?.addEventListener("click", () => moverTutorialNeuro(-1));
  $("tutorialSkip")?.addEventListener("click", cerrarTutorialNeuro);
  sincronizarControlesIntegrados();
  if (!tutorialVistoNeuro) iniciarTutorialNeuro();
}

function cerrarDetalleNeuroSeleccionado() {
  cierreDetalleNeuroEnCurso = true;
  zonaNeuroSeleccionada = null;
  uiModeNeuro.focusedStructure = "reposo";
  const panel = $("detalleIntegradaSeleccion");
  if (panel) {
    panel.hidden = true;
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    panel.removeAttribute("data-panel-neuro-abierto");
    panel.innerHTML = "";
  }
  const tip = $("tooltipIntegrada");
  if (tip) {
    tip.style.display = "none";
    tip.setAttribute("aria-hidden", "true");
  }
  renderizarIntegrada(false);
  devolverFocoDetalleNeuro();
  window.setTimeout(() => { cierreDetalleNeuroEnCurso = false; }, 0);
}

function eventoDentroDetalleNeuro(evento) {
  return Boolean(evento.target?.closest?.(".detalle-neuro-seleccion, [data-cerrar-detalle-neuro]"));
}
function limitarCamaraNeuro() {
  uiModeNeuro.cameraZoom = Math.max(0.55, Math.min(3.4, Number(uiModeNeuro.cameraZoom || 1)));
  uiModeNeuro.cameraPanX = Math.max(-1400, Math.min(1400, Number(uiModeNeuro.cameraPanX || 0)));
  uiModeNeuro.cameraPanY = Math.max(-1000, Math.min(1000, Number(uiModeNeuro.cameraPanY || 0)));
  uiModeNeuro.orbitYaw = Math.max(-Math.PI, Math.min(Math.PI, Number(uiModeNeuro.orbitYaw || -0.55)));
  uiModeNeuro.orbitPitch = Math.max(-1.05, Math.min(1.05, Number(uiModeNeuro.orbitPitch || 0.28)));
}

function recentrarCamaraNeuro() {
  uiModeNeuro.cameraZoom = 1;
  uiModeNeuro.cameraPanX = 0;
  uiModeNeuro.cameraPanY = 0;
  renderizarIntegrada(true);
}

function zoomCamaraNeuro(delta, clientX, clientY) {
  const escena = $("escenaIntegrada");
  if (!escena) return;
  const rect = escena.getBoundingClientRect();
  const zoomPrevio = Math.max(0.55, Math.min(3.4, Number(uiModeNeuro.cameraZoom || 1)));
  const factor = delta < 0 ? 1.12 : 0.89;
  const zoomNuevo = Math.max(0.55, Math.min(3.4, zoomPrevio * factor));
  if (Math.abs(zoomNuevo - zoomPrevio) < 0.001) return;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const mundoX = (x - rect.width / 2 - Number(uiModeNeuro.cameraPanX || 0)) / zoomPrevio + rect.width / 2;
  const mundoY = (y - rect.height / 2 - Number(uiModeNeuro.cameraPanY || 0)) / zoomPrevio + rect.height / 2;
  uiModeNeuro.cameraZoom = zoomNuevo;
  uiModeNeuro.cameraPanX = x - rect.width / 2 - (mundoX - rect.width / 2) * zoomNuevo;
  uiModeNeuro.cameraPanY = y - rect.height / 2 - (mundoY - rect.height / 2) * zoomNuevo;
  limitarCamaraNeuro();
  renderizarIntegrada(true);
}

function textoNeuroExtendido(zona) {
  const bloques = [];
  if (zona.detalle) bloques.push(`<p>${zona.detalle}</p>`);
  if (zona.cientifica) bloques.push(`<p><b>Base cientifica:</b> ${zona.cientifica}</p>`);
  if (zona.aumenta) bloques.push(`<p><b>Si aumenta:</b> ${zona.aumenta}</p>`);
  if (zona.disminuye) bloques.push(`<p><b>Si disminuye:</b> ${zona.disminuye}</p>`);
  if (zona.medicamentos) bloques.push(`<p><b>Farmacos:</b> ${zona.medicamentos}</p>`);
  if (zona.enfermedades) bloques.push(`<p><b>Clinica:</b> ${zona.enfermedades}</p>`);
  return bloques.join("");
}
function vincularInteraccionesCanvasIntegrado() {
  if (interaccionesCanvasIntegradoListas) return;
  const escenaIntegrada = $("escenaIntegrada");
  if (!escenaIntegrada) return;
  interaccionesCanvasIntegradoListas = true;
  const zonaDesdeEvento = (evento) => {
    const canvas = escenaIntegrada.querySelector(".neuro-canvas-principal");
    return identificarZonaNeuroCanvas(canvas, estadoIntegrado, uiModeNeuro, evento.clientX, evento.clientY);
  };
  escenaIntegrada.addEventListener("mousemove", (evento) => {
    if (arrastreNeuro.activo || eventoDentroDetalleNeuro(evento)) return;
    const zona = zonaDesdeEvento(evento);
    mostrarTooltipNeuro(zona, evento.clientX, evento.clientY);
    escenaIntegrada.classList.toggle("zona-detectada", Boolean(zona));
  });
  escenaIntegrada.addEventListener("mouseleave", () => {
    const tip = $("tooltipIntegrada");
    if (tip) tip.style.display = "none";
    escenaIntegrada.classList.remove("zona-detectada");
  });
  escenaIntegrada.addEventListener("wheel", (evento) => {
    if (eventoDentroDetalleNeuro(evento)) return;
    evento.preventDefault();
    zoomCamaraNeuro(evento.deltaY, evento.clientX, evento.clientY);
  }, { passive: false });
  escenaIntegrada.addEventListener("click", (evento) => {
    if (evento.target?.closest?.("[data-cerrar-detalle-neuro]")) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
      cerrarDetalleNeuroSeleccionado();
    }
  }, true);
  escenaIntegrada.addEventListener("pointerdown", (evento) => {
    if (eventoDentroDetalleNeuro(evento)) return;
    if (evento.button !== 0) return;
    arrastreNeuro.activo = true;
    arrastreNeuro.movido = false;
    arrastreNeuro.inicioX = evento.clientX;
    arrastreNeuro.inicioY = evento.clientY;
    arrastreNeuro.ultimoX = evento.clientX;
    arrastreNeuro.ultimoY = evento.clientY;
    escenaIntegrada.classList.add("pan-activo");
    escenaIntegrada.setPointerCapture?.(evento.pointerId);
  }, true);
  escenaIntegrada.addEventListener("pointermove", (evento) => {
    if (!arrastreNeuro.activo) return;
    const dx = evento.clientX - arrastreNeuro.ultimoX;
    const dy = evento.clientY - arrastreNeuro.ultimoY;
    arrastreNeuro.ultimoX = evento.clientX;
    arrastreNeuro.ultimoY = evento.clientY;
    if (Math.hypot(evento.clientX - arrastreNeuro.inicioX, evento.clientY - arrastreNeuro.inicioY) > 4) arrastreNeuro.movido = true;
    if (!arrastreNeuro.movido) return;
    if (uiModeNeuro.cameraMode === "modelo3d") {
      uiModeNeuro.orbitYaw = Number(uiModeNeuro.orbitYaw || -0.55) + dx * 0.008;
      uiModeNeuro.orbitPitch = Number(uiModeNeuro.orbitPitch || 0.28) - dy * 0.006;
    } else {
      uiModeNeuro.cameraPanX = Number(uiModeNeuro.cameraPanX || 0) + dx;
      uiModeNeuro.cameraPanY = Number(uiModeNeuro.cameraPanY || 0) + dy;
    }
    limitarCamaraNeuro();
    const tip = $("tooltipIntegrada");
    if (tip) tip.style.display = "none";
    renderizarIntegrada(false);
  });
  escenaIntegrada.addEventListener("pointerup", (evento) => {
    if (!arrastreNeuro.activo) return;
    arrastreNeuro.activo = false;
    escenaIntegrada.classList.remove("pan-activo");
    escenaIntegrada.releasePointerCapture?.(evento.pointerId);
    window.setTimeout(() => { arrastreNeuro.movido = false; }, 0);
  });
  escenaIntegrada.addEventListener("pointercancel", () => {
    arrastreNeuro.activo = false;
    arrastreNeuro.movido = false;
    escenaIntegrada.classList.remove("pan-activo");
  });
  escenaIntegrada.addEventListener("dblclick", (evento) => {
    if (eventoDentroDetalleNeuro(evento)) return;
    recentrarCamaraNeuro();
  });
  escenaIntegrada.addEventListener("click", (evento) => {
    if (arrastreNeuro.movido || cierreDetalleNeuroEnCurso || eventoDentroDetalleNeuro(evento)) return;
    const zona = zonaDesdeEvento(evento);
    if (!zona) return;
    zonaNeuroSeleccionada = zona;
    uiModeNeuro.focusedStructure = zona.id;
    if ($("intCamaraNeuro") && zona.camara && zona.camara !== uiModeNeuro.cameraMode) {
      uiModeNeuro.cameraMode = zona.camara;
      $("intCamaraNeuro").value = zona.camara;
    }
    mostrarDetalleNeuroSeleccionado(zona);
    renderizarIntegrada(true);
  });
}

function mostrarTooltipNeuro(zona, x, y) {
  const tip = $("tooltipIntegrada");
  if (!tip) return;
  if (!zona) { tip.style.display = "none"; return; }
  tip.innerHTML = `<strong>${zona.titulo}</strong><br>${zona.detalle}`;
  tip.style.display = "block";
  const margen = 12;
  const ancho = tip.offsetWidth || 260;
  const alto = tip.offsetHeight || 90;
  tip.style.left = `${Math.min(window.innerWidth - ancho - margen, Math.max(margen, x + 14))}px`;
  tip.style.top = `${Math.min(window.innerHeight - alto - margen, Math.max(margen, y + 14))}px`;
}

function mostrarDetalleNeuroSeleccionado(zona, disparador = null) {
  const panel = $("detalleIntegradaSeleccion");
  if (!panel || !zona) return;
  ultimoDisparadorDetalleNeuro = disparador || document.activeElement || $("btnPorQueNeuro");
  panel.hidden = false;
  panel.inert = false;
  panel.setAttribute("aria-hidden", "false");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", zona.titulo || "Estructura seleccionada");
  panel.setAttribute("data-panel-neuro-abierto", "true");
  panel.tabIndex = -1;
  panel.innerHTML = construirDetalleNeuroHTML(zona);
  panel.querySelector("[data-cerrar-detalle-neuro]")?.focus({ preventScroll: true });
}

function construirDetalleNeuroHTML(zona) {
  const secciones = zona.secciones || crearSeccionesNeuroDesdeZona(zona);
  return `<button type="button" data-cerrar-detalle-neuro aria-label="Cerrar detalle">x</button><span class="kicker">Estructura seleccionada</span><h3>${zona.titulo}</h3><div class="detalle-neuro-secciones">${secciones.map((s) => `<section><h4>${s.titulo}</h4>${Array.isArray(s.texto) ? `<ul>${s.texto.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p>${s.texto}</p>`}</section>`).join("")}</div><div class="detalle-neuro-acciones"><button type="button" class="secundario" data-neuro-aislar>Ver funcionamiento aislado</button></div><small>Rueda = zoom. Arrastra el canvas = desplazar. Escape cierra este panel.</small>`;
}

function crearSeccionesNeuroDesdeZona(zona) {
  return [
    { titulo: "Que esta pasando", texto: zona.detalle || "Se selecciono una estructura funcional de la neurona." },
    { titulo: "Por que esta pasando", texto: zona.cientifica || "Su estado depende del potencial de membrana, gradientes electroquimicos, conductancias y modulacion sinaptica." },
    { titulo: "Estructuras participantes", texto: zona.estructuras || ["Membrana plasmatica", "Canales o receptores", "Gradientes ionicos", "Bomba Na+/K+ ATPasa cuando aplica"] },
    { titulo: "Iones o moleculas que se mueven", texto: zona.iones || ["Na+", "K+", "Cl-", "Ca2+", "neurotransmisor segun la sinapsis"] },
    { titulo: "Que ocurrira despues", texto: zona.despues || "Si el cambio de voltaje alcanza umbral, se amplificara la respuesta; si no, la membrana regresara hacia reposo." },
    { titulo: "Parametro que cambio", texto: zona.parametro || "Revisa los controles fisiologicos y visuales activos en el panel izquierdo." },
    { titulo: "Relacion con la grafica", texto: zona.grafica || "La curva de potencial de membrana (Vm) muestra si la celula se despolariza, repolariza o hiperpolariza." },
    { titulo: "Farmacos o experimentos", texto: zona.medicamentos || "Farmacos, drogas o bloqueadores pueden modificar canales, receptores, recaptura, degradacion o liberacion vesicular." }
  ];
}

function explicarPorQueNeuro() {
  const vm = Number(estadoIntegrado.Vm || 0);
  const fase = vm > -45 ? "despolarizacion" : vm < -75 ? "hiperpolarizacion" : "reposo funcional";
  const zona = zonaNeuroSeleccionada || {
    id: "estado_actual",
    titulo: "Por que ocurre esto ahora",
    detalle: `La neurona se encuentra en fase de ${fase}. Potencial de membrana (Vm): ${vm.toFixed(1)} mV.`,
    cientifica: `La membrana integra corrientes de Na+, K+, Ca2+ y Cl-. INa ${estadoIntegrado.INa.toFixed(1)} e IK ${estadoIntegrado.IK.toFixed(1)} reflejan el balance actual de conductancias y gradientes.`,
    estructuras: ["Bicapa fosfolipidica", "Canales de Na+ y K+", "Canales de Ca2+ terminales", "Bomba Na+/K+ ATPasa", "Receptores postsinapticos"],
    iones: ["Na+ entra si se abren canales de sodio", "K+ suele salir y favorece repolarizacion", "Ca2+ entra en la terminal y activa fusion vesicular", "Cl- estabiliza o inhibe segun su gradiente"],
    despues: vm > -55 ? "Si la despolarizacion progresa, se activaran mas canales de Na+ y puede generarse un potencial de accion." : "Si no entra suficiente carga positiva, la bomba y canales de fuga llevaran la membrana hacia reposo.",
    parametro: `Frecuencia ${$("intFrecuencia")?.value || ""} Hz, intensidad del estimulo ${$("intIntensidad")?.value || ""}, tipo de sinapsis ${$("intTipoSinapsis")?.value || ""}.`,
    grafica: "En la grafica, Vm muestra el voltaje; INa e IK muestran corrientes principales; Ca2+ y NT muestran la activacion terminal y sinaptica.",
    medicamentos: "Bloqueadores de Na+ reducen excitabilidad; moduladores GABA favorecen inhibicion; drogas de recaptura aumentan neurotransmisor en hendidura."
  };
  zonaNeuroSeleccionada = zona;
  uiModeNeuro.focusedStructure = zona.id;
  mostrarDetalleNeuroSeleccionado(zona, $("btnPorQueNeuro"));
}


function aislarFuncionamientoNeuro() {
  if (!zonaNeuroSeleccionada) return;
  uiModeNeuro.focusedStructure = zonaNeuroSeleccionada.id || "reposo";
  if (zonaNeuroSeleccionada.camara && $("intCamaraNeuro")) {
    uiModeNeuro.cameraMode = zonaNeuroSeleccionada.camara;
    $("intCamaraNeuro").value = zonaNeuroSeleccionada.camara;
  }
  uiModeNeuro.cameraZoom = Math.max(Number(uiModeNeuro.cameraZoom || 1), 1.45);
  if ($("intEtiquetasNeuro") && $("intEtiquetasNeuro").value === "none") {
    $("intEtiquetasNeuro").value = "basicas";
    uiModeNeuro.labelMode = "basicas";
  }
  limitarCamaraNeuro();
  renderizarIntegrada(true);
  const panel = $("detalleIntegradaSeleccion");
  const boton = panel?.querySelector("[data-neuro-aislar]");
  if (boton) {
    boton.textContent = "Funcionamiento resaltado";
    boton.setAttribute("aria-pressed", "true");
  }
}
function aplicarNivelAprendizaje(nivel) {
  uiModeNeuro.learningLevel = nivel;
  graficasIntegradasVisibles = new Set(GRAFICAS_POR_NIVEL[nivel] || ["Vm"]);
  if ($("selectorGraficasIntegradas")) {
    poblarSelectorGraficas($("selectorGraficasIntegradas"), graficasIntegradasVisibles);
    document.querySelectorAll("[data-grafica-integrada]").forEach((check) => check.addEventListener("change", () => {
      if (check.checked) graficasIntegradasVisibles.add(check.dataset.graficaIntegrada); else graficasIntegradasVisibles.delete(check.dataset.graficaIntegrada);
      dibujarGraficaIntegrada(graficaIntegrada, estadoIntegrado, graficasIntegradasVisibles);
    }));
  }
}

function leerUiModeIntegrado() {
  const nivelAnterior = uiModeNeuro.learningLevel;
  uiModeNeuro.cameraMode = $("intCamaraNeuro")?.value || "membrana";
  if (uiModeNeuro.cameraMode === "modelo3d") {
    uiModeNeuro.orbitYaw = Number(uiModeNeuro.orbitYaw || -0.55);
    uiModeNeuro.orbitPitch = Number(uiModeNeuro.orbitPitch || 0.28);
  }
  uiModeNeuro.learningLevel = $("intNivelAprendizaje")?.value || "basico";
  uiModeNeuro.particleSpeed = $("intVelocidadParticulas")?.value || "lenta";
  uiModeNeuro.particleDensity = $("intDensidadParticulas")?.value || "baja";
  uiModeNeuro.ionFilter = $("intIonVisible")?.value || "todos";
  uiModeNeuro.labelMode = $("intEtiquetasNeuro")?.value || "basicas";
  uiModeNeuro.showCharges = $("intMostrarCargas") ? Boolean($("intMostrarCargas").checked) : true;
  uiModeNeuro.explanationMode = Boolean($("intExplicacionPaso")?.checked);
  uiModeNeuro.reducedMotion = Boolean($("intReducirAnimaciones")?.checked);
  uiModeNeuro.mathView = $("intVistaMatematica")?.value || "resumida";
  if (nivelAnterior !== uiModeNeuro.learningLevel) aplicarNivelAprendizaje(uiModeNeuro.learningLevel);
}

function poblarFarmacosIntegrados() {
  const select = $("intFarmaco");
  if (!select) return;
  const categoria = $("intCategoriaFarmaco")?.value || "principales";
  const principales = new Set(["fenitoina", "benzodiacepina", "pregabalina", "levetiracetam", "litio", "valproato"]);
  const filtros = {
    principales: (f) => principales.has(f.id),
    na: (f) => /Na\+|sodio|Na/i.test(`${f.diana} ${f.clase}`),
    gaba: (f) => /GABA/i.test(`${f.diana} ${f.clase}`),
    ca: (f) => /Ca2|calcio|alfa2delta/i.test(`${f.diana} ${f.clase}`),
    vesicular: (f) => /vesicula|SV2A|liberacion/i.test(`${f.diana} ${f.clase} ${f.descripcion}`),
    intracelular: (f) => /intracelular|multimodal/i.test(`${f.diana} ${f.clase} ${f.descripcion}`),
    herramientas: (f) => /experimental|Tetrodotoxina|Tetraetilamonio/i.test(`${f.nombre} ${f.clase}`),
    abuso: (f) => /droga de abuso/i.test(f.clase),
    todos: () => true
  };
  const lista = REGISTRO_FARMACOS_NEURO.filter(filtros[categoria] || filtros.principales);
  select.innerHTML = lista.map((farmaco) => `<option value="${farmaco.id}">${farmaco.nombre}</option>`).join("");
  mostrarInfoFarmaco();
}

function mostrarInfoFarmaco() {
  const id = $("intFarmaco")?.value;
  const f = REGISTRO_FARMACOS_NEURO.find((item) => item.id === id);
  const box = $("intInfoFarmaco");
  if (!box || !f) return;
  box.innerHTML = `<b>${f.nombre}</b><span>Diana: ${f.diana}</span><span>Efecto: ${f.descripcion}</span><span>Que observar: cambios en ${Object.keys(f.efectos || {}).join(", ")}.</span>`;
}

function sincronizarControlesIntegrados() {
  if (!$("intFrecuencia")) return;
  $("intFrecuencia").value = estadoIntegrado.controles.frecuenciaHz;
  $("intIntensidad").value = estadoIntegrado.controles.intensidad;
  $("intTipoAxon").value = estadoIntegrado.axon.mielina ? "mielinizado" : "amielinico";
  $("intDiametro").value = estadoIntegrado.axon.diametroUm;
  $("intTemperatura").value = estadoIntegrado.axon.temperaturaC;
  $("intDesmielina").checked = estadoIntegrado.axon.desmielinizacion.activa;
  $("intTipoSinapsis").value = estadoIntegrado.sinapsis.tipoId;
  $("intVesiculas").value = estadoIntegrado.sinapsis.vesiculasVisuales;
  $("intLiberacion").value = estadoIntegrado.sinapsis.basalLiberacion;
  $("intRecaptura").value = estadoIntegrado.sinapsis.recaptura;
  $("intDegradacion").value = estadoIntegrado.sinapsis.degradacion;
  $("intSensibilidad").value = estadoIntegrado.sinapsis.sensibilidad;
  if ($("intCamaraNeuro")) $("intCamaraNeuro").value = uiModeNeuro.cameraMode || "membrana";
  $("intNivelAprendizaje").value = uiModeNeuro.learningLevel;
  $("intVelocidadParticulas").value = uiModeNeuro.particleSpeed;
  $("intDensidadParticulas").value = uiModeNeuro.particleDensity;
  if ($("intIonVisible")) $("intIonVisible").value = uiModeNeuro.ionFilter || "todos";
  if ($("intEtiquetasNeuro")) $("intEtiquetasNeuro").value = uiModeNeuro.labelMode || "basicas";
  if ($("intMostrarCargas")) $("intMostrarCargas").checked = uiModeNeuro.showCharges !== false;
  $("intExplicacionPaso").checked = uiModeNeuro.explanationMode;
  $("intReducirAnimaciones").checked = uiModeNeuro.reducedMotion;
  $("intVistaMatematica").value = uiModeNeuro.mathView;
}

function leerControlesIntegrados() {
  if (!$("intFrecuencia")) return;
  actualizarParametrosIntegrados(estadoIntegrado, {
    frecuenciaHz: $("intFrecuencia").value,
    intensidad: $("intIntensidad").value,
    tipoAxon: $("intTipoAxon").value,
    diametroUm: $("intDiametro").value,
    temperaturaC: $("intTemperatura").value,
    desmielinizacion: $("intDesmielina").checked,
    tipoSinapsis: $("intTipoSinapsis").value,
    vesiculasVisuales: $("intVesiculas").value,
    basalLiberacion: $("intLiberacion").value,
    recaptura: $("intRecaptura").value,
    degradacion: $("intDegradacion").value,
    sensibilidad: $("intSensibilidad").value
  });
}

function animarIntegrada() {
  if (!integradaActiva) return;
  leerControlesIntegrados();
  leerUiModeIntegrado();
  const paso = (uiModeNeuro.explanationMode ? 0.18 : 0.34) * factorTiempoGlobalNeuro();
  avanzarNeuronaIntegrada(estadoIntegrado, paso);
  renderizarIntegrada(false);
  rafIntegrada = requestAnimationFrame(animarIntegrada);
}

function renderizarIntegrada(forzarTexto = false) {
  if (!$("escenaIntegrada")) return;
  const ecuacionSeleccionada = ecuacionCongelada || ($("intSeguirEcuacion")?.checked ? estadoIntegrado.ecuacionActiva : ($("intEcuacionSeleccionada")?.value || estadoIntegrado.ecuacionActiva));
  if ($("intEcuacionSeleccionada") && !ecuacionCongelada && $("intSeguirEcuacion")?.checked) $("intEcuacionSeleccionada").value = ecuacionSeleccionada;
  ejecutarBloqueLaboratorio("render escena integrada", () => renderizarEscenaIntegrada($("escenaIntegrada"), estadoIntegrado, uiModeNeuro));
  if (zonaNeuroSeleccionada) ejecutarBloqueLaboratorio("detalle seleccionado", () => mostrarDetalleNeuroSeleccionado(zonaNeuroSeleccionada));
  ejecutarBloqueLaboratorio("indicadores integrados", () => renderizarIndicadoresIntegrados($("estadoIntegrado"), estadoIntegrado, uiModeNeuro));
  ejecutarBloqueLaboratorio("estado actual", () => renderizarTarjetaEstadoActual($("tarjetaEstadoActual"), estadoIntegrado, uiModeNeuro));
  ejecutarBloqueLaboratorio("variables integradas", () => renderizarVariablesIntegradas($("variablesIntegradas"), estadoIntegrado));
  ejecutarBloqueLaboratorio("matematicas integradas", () => renderizarMatematicasIntegradas($("matematicasIntegradas"), estadoIntegrado, ecuacionSeleccionada, uiModeNeuro));
  if (forzarTexto || uiModeNeuro.explanationMode) ejecutarBloqueLaboratorio("explicacion integrada", () => renderizarExplicacionIntegrada($("explicacionIntegrada"), estadoIntegrado));
  ejecutarBloqueLaboratorio("grafica integrada", () => dibujarGraficaIntegrada(graficaIntegrada, estadoIntegrado, graficasIntegradasVisibles));
  const listaFarmacos = $("intFarmacosActivos");
  if (listaFarmacos) listaFarmacos.innerHTML = estadoIntegrado.farmacos.activos.length ? estadoIntegrado.farmacos.activos.map((f) => `<span>${f.nombre} ${Math.round(f.intensidad * 100)}%</span>`).join("") : `<span>Sin farmacos activos</span>`;
}

function iniciarTutorialNeuro() {
  uiModeNeuro.tutorialActive = true;
  uiModeNeuro.tutorialStep = 0;
  mostrarPasoTutorialNeuro();
}

function moverTutorialNeuro(delta) {
  if (delta > 0 && uiModeNeuro.tutorialStep >= PASOS_TUTORIAL_NEURO.length - 1) {
    cerrarTutorialNeuro();
    return;
  }
  uiModeNeuro.tutorialStep = Math.max(0, Math.min(PASOS_TUTORIAL_NEURO.length - 1, uiModeNeuro.tutorialStep + delta));
  mostrarPasoTutorialNeuro();
}

function mostrarPasoTutorialNeuro() {
  const modal = $("tutorialNeuro");
  const paso = PASOS_TUTORIAL_NEURO[uiModeNeuro.tutorialStep];
  if (!modal || !paso) return;
  modal.hidden = false;
  $("tutorialTitulo").textContent = paso.titulo;
  $("tutorialTexto").textContent = paso.texto;
  document.querySelectorAll(".tutorial-focus").forEach((el) => el.classList.remove("tutorial-focus"));
  const objetivo = $(paso.foco);
  if (objetivo) objetivo.classList.add("tutorial-focus");
  $("tutorialPrev").disabled = uiModeNeuro.tutorialStep === 0;
  $("tutorialNext").textContent = uiModeNeuro.tutorialStep === PASOS_TUTORIAL_NEURO.length - 1 ? "Explorar libremente" : "Siguiente";
  if (uiModeNeuro.tutorialStep === PASOS_TUTORIAL_NEURO.length - 1) localStorage.setItem("cognicionNeuroTutorialVisto", "1");
}

function cerrarTutorialNeuro() {
  uiModeNeuro.tutorialActive = false;
  localStorage.setItem("cognicionNeuroTutorialVisto", "1");
  $("tutorialNeuro").hidden = true;
  document.querySelectorAll(".tutorial-focus").forEach((el) => el.classList.remove("tutorial-focus"));
}
