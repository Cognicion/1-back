import { auth } from "./firebase.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  DOMINIOS_EVC,
  generarPlanEvc,
  resumirPlanEvc
} from "./rehabilitacion-evc-core.js?v=20260814-evc-bateria-v2";
import {
  BATERIA_EVC_VERSION,
  PRUEBAS_EVC,
  calificarPruebaEvc,
  crearResultadoNoEvaluable,
  normalizarPalabrasFluidez,
  progresoBateriaEvc
} from "./rehabilitacion-evc-evaluacion-core.js?v=20260814-evc-bateria-v2";

aplicarAparienciaGuardada();

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(window.location.search);
const idPaciente = parametros.get("id") || parametros.get("paciente") || "";
const PALABRAS_MEMORIA = Object.freeze(["carta", "limón", "puente", "camisa", "nube"]);
const DISTRACTORES_MEMORIA = Object.freeze(["mesa", "tren", "flor", "zapato", "río"]);
const CLAVE_VELOCIDAD = Object.freeze({ "○": 1, "△": 2, "□": 3, "◇": 4 });
const SECUENCIA_VELOCIDAD = Object.freeze(["△", "○", "◇", "□", "○", "□", "△", "◇", "◇", "△", "□", "○", "△", "◇", "○", "□", "□", "○", "◇", "△"]);

let uidUsuarioActual = "";
let planActual = null;
let resultadosPruebas = {};
let pruebaActiva = "";
let estadoPrueba = {};
let temporizadorToast = null;
let intervalosPrueba = [];
let temporizadoresPrueba = [];

document.addEventListener("DOMContentLoaded", () => {
  renderizarDominios();
  configurarEnlaces();
  configurarEventos();
});

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  uidUsuarioActual = usuario.uid;
  await sincronizarAparienciaUsuario(usuario.uid);
  await cargarContextoPaciente();
  restaurarBorradorLocal();
});

function configurarEventos() {
  $("dominiosEvaluacionEvc")?.addEventListener("click", manejarAccionDominio);
  $("formEvaluacionEvc")?.addEventListener("submit", crearPlanDesdeFormulario);
  $("guardarPlanEvc")?.addEventListener("click", guardarBorradorLocal);
  $("copiarPlanEvc")?.addEventListener("click", copiarResumenPlan);
  $("imprimirPlanEvc")?.addEventListener("click", () => window.print());
  $("editarEvaluacionEvc")?.addEventListener("click", () => $("evaluacion")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  $("formEvaluacionEvc")?.addEventListener("input", marcarCambiosPendientes);
  $("cerrarPruebaEvc")?.addEventListener("click", cerrarDialogPrueba);
  $("dialogPruebaEvc")?.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    cerrarDialogPrueba();
  });
}

function renderizarDominios() {
  const contenedor = $("dominiosEvaluacionEvc");
  if (!contenedor) return;
  contenedor.innerHTML = DOMINIOS_EVC.map((dominio, indice) => {
    const prueba = PRUEBAS_EVC[dominio.id];
    const resultado = resultadosPruebas[dominio.id];
    const estado = resultado?.noEvaluable ? "No evaluable" : resultado?.completada ? resultado.etiqueta : "Pendiente";
    const nivel = Number.isFinite(resultado?.nivelApoyo) ? resultado.nivelApoyo : "";
    return `
      <article class="dominio-evc ${resultado ? "evaluado" : ""}" data-tarjeta-dominio="${dominio.id}" data-nivel="${nivel}">
        <header>
          <span class="dominio-evc-indice">${indice + 1}</span>
          <span class="dominio-evc-copy">
            <strong>${escaparHTML(dominio.nombre)}</strong>
            <small>${escaparHTML(dominio.descripcion)}</small>
          </span>
          <span class="estado-prueba-dominio-evc">${escaparHTML(estado)}</span>
        </header>
        <div class="ficha-prueba-dominio-evc">
          <div><span>Prueba</span><strong>${escaparHTML(prueba.nombre)}</strong></div>
          <div><span>Duración</span><strong>${escaparHTML(prueba.duracion)}</strong></div>
          <p>${escaparHTML(prueba.mide)}</p>
          <small>${escaparHTML(prueba.cautela)}</small>
        </div>
        ${resultado ? renderizarResultadoTarjeta(resultado) : ""}
        <footer>
          <button type="button" data-iniciar-prueba="${dominio.id}">${resultado ? "Repetir prueba" : "Aplicar prueba"}</button>
          <button type="button" class="boton-secundario" data-no-evaluable="${dominio.id}">${resultado?.noEvaluable ? "Cambiar registro" : "No se puede aplicar"}</button>
        </footer>
      </article>
    `;
  }).join("");
  actualizarProgresoBateria();
}

function renderizarResultadoTarjeta(resultado) {
  const advertencias = resultado.advertencias?.length
    ? `<ul>${resultado.advertencias.map((item) => `<li>${escaparHTML(item)}</li>`).join("")}</ul>`
    : "";
  return `
    <section class="resultado-prueba-dominio-evc ${resultado.noEvaluable ? "resultado-no-evaluable" : ""}">
      <span>${escaparHTML(resultado.etiqueta)}</span>
      <p>${escaparHTML(resultado.resumen)}</p>
      ${advertencias}
      <small>${escaparHTML(resultado.interpretacion)}</small>
    </section>
  `;
}

function manejarAccionDominio(evento) {
  const botonPrueba = evento.target.closest("[data-iniciar-prueba]");
  if (botonPrueba) {
    abrirIntroduccionPrueba(botonPrueba.dataset.iniciarPrueba);
    return;
  }
  const botonNoEvaluable = evento.target.closest("[data-no-evaluable]");
  if (botonNoEvaluable) abrirRegistroNoEvaluable(botonNoEvaluable.dataset.noEvaluable);
}

function actualizarProgresoBateria() {
  const progreso = progresoBateriaEvc(resultadosPruebas);
  const estado = $("estadoEvaluacionEvc");
  if (!estado) return;
  if (!progreso.abordados) estado.textContent = "0 de 6 pruebas";
  else if (progreso.completa) estado.textContent = `${progreso.completados} completas${progreso.noEvaluables ? ` · ${progreso.noEvaluables} no evaluables` : ""}`;
  else estado.textContent = `${progreso.abordados} de ${progreso.total} abordadas`;
}

function prepararDialog(dominioId) {
  limpiarTemporizadoresPrueba();
  pruebaActiva = dominioId;
  estadoPrueba = {};
  const dominio = DOMINIOS_EVC.find((item) => item.id === dominioId);
  const prueba = PRUEBAS_EVC[dominioId];
  $("pasoDialogPruebaEvc").textContent = `Batería COGNICIÓN-EVC ${BATERIA_EVC_VERSION}`;
  $("tituloDialogPruebaEvc").textContent = dominio?.nombre || "Prueba cognitiva";
  $("descripcionDialogPruebaEvc").textContent = prueba?.nombre || "Tarea orientativa";
  actualizarProgresoDialog(0);
  const dialog = $("dialogPruebaEvc");
  if (!dialog.open) dialog.showModal();
}

function abrirIntroduccionPrueba(dominioId) {
  prepararDialog(dominioId);
  const prueba = PRUEBAS_EVC[dominioId];
  $("contenidoPruebaEvc").innerHTML = `
    <section class="intro-prueba-evc">
      <span>Tarea orientativa · ${escaparHTML(prueba.duracion)}</span>
      <h3>${escaparHTML(prueba.nombre)}</h3>
      <p>${escaparHTML(prueba.mide)}</p>
      <div class="cautela-prueba-evc"><strong>Antes de comenzar</strong><p>${escaparHTML(prueba.cautela)}</p></div>
      <p class="referencia-prueba-evc">${escaparHTML(prueba.referencia)}</p>
    </section>
  `;
  accionesDialog([
    { id: "cancelarInicioPrueba", texto: "Cancelar", secundaria: true, accion: cerrarDialogPrueba },
    { id: "comenzarPrueba", texto: "Comenzar", accion: () => iniciarPrueba(dominioId) }
  ]);
}

function iniciarPrueba(dominioId) {
  const iniciadores = {
    atencion: iniciarAtencion,
    memoria: iniciarMemoria,
    ejecutivas: iniciarEjecutivas,
    lenguaje: iniciarLenguaje,
    velocidad: iniciarVelocidad,
    visuoespacial: iniciarVisuoespacial
  };
  iniciadores[dominioId]?.();
}

function abrirRegistroNoEvaluable(dominioId) {
  prepararDialog(dominioId);
  $("descripcionDialogPruebaEvc").textContent = "Registrar tarea no evaluable";
  $("contenidoPruebaEvc").innerHTML = `
    <section class="registro-no-evaluable-evc">
      <h3>¿Por qué no puede interpretarse esta tarea?</h3>
      <p>Esto no cuenta como resultado normal ni alterado. El plan indicará que se necesita adaptación o un método distinto.</p>
      <label>Motivo principal
        <select id="motivoNoEvaluableEvc">
          <option value="Barreras de lenguaje o comprensión">Barreras de lenguaje o comprensión</option>
          <option value="Alteración visual o del campo visual">Alteración visual o del campo visual</option>
          <option value="Limitación motora o de acceso al dispositivo">Limitación motora o de acceso al dispositivo</option>
          <option value="Fatiga, dolor o baja tolerancia">Fatiga, dolor o baja tolerancia</option>
          <option value="Interrupción o condiciones de aplicación no válidas">Condiciones de aplicación no válidas</option>
          <option value="Otro motivo documentado">Otro motivo</option>
        </select>
      </label>
      <label>Detalle opcional
        <textarea id="detalleNoEvaluableEvc" maxlength="220" placeholder="Describe la adaptación o valoración pendiente."></textarea>
      </label>
    </section>
  `;
  accionesDialog([
    { id: "cancelarNoEvaluable", texto: "Cancelar", secundaria: true, accion: cerrarDialogPrueba },
    { id: "guardarNoEvaluable", texto: "Registrar no evaluable", accion: () => {
      const motivo = $("motivoNoEvaluableEvc")?.value || "La tarea no pudo completarse";
      const detalle = $("detalleNoEvaluableEvc")?.value.trim();
      guardarResultadoPrueba(crearResultadoNoEvaluable(dominioId, detalle ? `${motivo}: ${detalle}` : motivo));
    } }
  ]);
}

function iniciarAtencion() {
  const objetivos = new Set([1, 6, 9, 14, 18, 21, 25, 30, 34, 38]);
  const distractores = ["1", "4", "T", "L", "2", "Z", "5", "Y"];
  const items = Array.from({ length: 40 }, (_, indice) => ({
    indice,
    objetivo: objetivos.has(indice),
    simbolo: objetivos.has(indice) ? "7" : distractores[(indice * 3 + 2) % distractores.length],
    lado: indice < 20 ? "izquierda" : "derecha"
  }));
  estadoPrueba = { inicio: performance.now(), items, seleccionados: new Set() };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-atencion-evc">
      <div class="instruccion-tarea-evc"><strong>Seleccione todos los números 7</strong><span id="relojPruebaEvc">45 s</span></div>
      <p>No seleccione letras ni otros números. Revise toda la cuadrícula.</p>
      <div class="cuadricula-cancelacion-evc" role="group" aria-label="Cuadrícula de cancelación">
        ${items.map((item) => `<button type="button" data-item-atencion="${item.indice}" aria-label="Símbolo ${escaparHTML(item.simbolo)}">${escaparHTML(item.simbolo)}</button>`).join("")}
      </div>
    </section>
  `;
  $("contenidoPruebaEvc").querySelectorAll("[data-item-atencion]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const indice = Number(boton.dataset.itemAtencion);
      if (estadoPrueba.seleccionados.has(indice)) return;
      estadoPrueba.seleccionados.add(indice);
      boton.classList.add("seleccionado");
      boton.disabled = true;
    });
  });
  accionesDialog([{ id: "terminarAtencion", texto: "Terminar", deshabilitado: true, accion: finalizarAtencion }]);
  programarTimeout(() => { if ($("terminarAtencion")) $("terminarAtencion").disabled = false; }, 15000);
  iniciarCuentaRegresiva(45, "relojPruebaEvc", finalizarAtencion);
}

function finalizarAtencion() {
  if (pruebaActiva !== "atencion" || !estadoPrueba.items) return;
  const seleccionados = estadoPrueba.seleccionados;
  const aciertos = estadoPrueba.items.filter((item) => item.objetivo && seleccionados.has(item.indice));
  const comisiones = estadoPrueba.items.filter((item) => !item.objetivo && seleccionados.has(item.indice));
  const omitidos = estadoPrueba.items.filter((item) => item.objetivo && !seleccionados.has(item.indice));
  guardarResultadoPrueba(calificarPruebaEvc("atencion", {
    objetivos: estadoPrueba.items.filter((item) => item.objetivo).length,
    aciertos: aciertos.length,
    comisiones: comisiones.length,
    omisionesIzquierda: omitidos.filter((item) => item.lado === "izquierda").length,
    omisionesDerecha: omitidos.filter((item) => item.lado === "derecha").length,
    duracionSegundos: (performance.now() - estadoPrueba.inicio) / 1000
  }));
}

function iniciarMemoria() {
  estadoPrueba = { fase: "codificacion", inicioCodificacion: performance.now() };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-memoria-evc">
      <div class="instruccion-tarea-evc"><strong>Aprenda estas cinco palabras</strong><span id="relojPruebaEvc">20 s</span></div>
      <p>Léalas en voz alta si es posible. Después habrá una tarea breve antes de reconocerlas.</p>
      <div class="palabras-memoria-evc">${PALABRAS_MEMORIA.map((palabra) => `<strong>${escaparHTML(palabra)}</strong>`).join("")}</div>
    </section>
  `;
  accionesDialog([{ id: "continuarMemoria", texto: "Continuar a interferencia", deshabilitado: true, accion: iniciarInterferenciaMemoria }]);
  programarTimeout(() => { if ($("continuarMemoria")) $("continuarMemoria").disabled = false; }, 10000);
  iniciarCuentaRegresiva(20, "relojPruebaEvc", iniciarInterferenciaMemoria);
}

function iniciarInterferenciaMemoria() {
  if (pruebaActiva !== "memoria" || estadoPrueba.fase === "interferencia") return;
  limpiarTemporizadoresPrueba();
  estadoPrueba.fase = "interferencia";
  estadoPrueba.finCodificacion = performance.now();
  estadoPrueba.indiceInterferencia = 0;
  const numeros = [3, 8, 1, 6, 9, 4, 7, 2, 5, 8, 1, 6, 3, 4, 7];
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-interferencia-evc">
      <div class="instruccion-tarea-evc"><strong>Interferencia breve: pulse “PAR” solo ante un número par</strong><span id="relojPruebaEvc">30 s</span></div>
      <div class="numero-interferencia-evc" id="numeroInterferenciaEvc">${numeros[0]}</div>
      <button type="button" id="respuestaParEvc">PAR</button>
      <small>Esta parte evita repetir activamente las palabras y no se usa para calificar memoria.</small>
    </section>
  `;
  $("respuestaParEvc")?.addEventListener("click", () => {
    $("respuestaParEvc").classList.add("pulsado");
    programarTimeout(() => $("respuestaParEvc")?.classList.remove("pulsado"), 180);
  });
  accionesDialog([]);
  programarIntervalo(() => {
    estadoPrueba.indiceInterferencia = (estadoPrueba.indiceInterferencia + 1) % numeros.length;
    if ($("numeroInterferenciaEvc")) $("numeroInterferenciaEvc").textContent = numeros[estadoPrueba.indiceInterferencia];
  }, 2000);
  iniciarCuentaRegresiva(30, "relojPruebaEvc", iniciarReconocimientoMemoria);
}

function iniciarReconocimientoMemoria() {
  if (pruebaActiva !== "memoria" || estadoPrueba.fase === "reconocimiento") return;
  limpiarTemporizadoresPrueba();
  estadoPrueba.fase = "reconocimiento";
  estadoPrueba.inicioReconocimiento = performance.now();
  estadoPrueba.seleccionadas = new Set();
  const opciones = ["mesa", "carta", "flor", "limón", "tren", "puente", "zapato", "camisa", "río", "nube"];
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-reconocimiento-evc">
      <div class="instruccion-tarea-evc"><strong>Seleccione exactamente las cinco palabras anteriores</strong><span id="conteoMemoriaEvc">0/5</span></div>
      <div class="opciones-memoria-evc">${opciones.map((palabra) => `<button type="button" data-palabra-memoria="${escaparHTML(palabra)}">${escaparHTML(palabra)}</button>`).join("")}</div>
    </section>
  `;
  $("contenidoPruebaEvc").querySelectorAll("[data-palabra-memoria]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const palabra = boton.dataset.palabraMemoria;
      if (estadoPrueba.seleccionadas.has(palabra)) {
        estadoPrueba.seleccionadas.delete(palabra);
        boton.classList.remove("seleccionado");
      } else if (estadoPrueba.seleccionadas.size < 5) {
        estadoPrueba.seleccionadas.add(palabra);
        boton.classList.add("seleccionado");
      }
      $("conteoMemoriaEvc").textContent = `${estadoPrueba.seleccionadas.size}/5`;
      if ($("terminarMemoria")) $("terminarMemoria").disabled = estadoPrueba.seleccionadas.size !== 5;
    });
  });
  accionesDialog([{ id: "terminarMemoria", texto: "Calificar reconocimiento", deshabilitado: true, accion: finalizarMemoria }]);
  actualizarProgresoDialog(82);
}

function finalizarMemoria() {
  const seleccionadas = [...(estadoPrueba.seleccionadas || [])];
  if (seleccionadas.length !== 5) return;
  guardarResultadoPrueba(calificarPruebaEvc("memoria", {
    objetivos: PALABRAS_MEMORIA.length,
    reconocidos: seleccionadas.filter((palabra) => PALABRAS_MEMORIA.includes(palabra)).length,
    falsosPositivos: seleccionadas.filter((palabra) => DISTRACTORES_MEMORIA.includes(palabra)).length,
    demoraSegundos: (estadoPrueba.inicioReconocimiento - estadoPrueba.finCodificacion) / 1000
  }));
}

function crearEnsayosEjecutivos() {
  const numeros = [2, 5, 8, 3, 4, 7, 6, 1, 9, 2, 5, 8, 3, 6, 7, 4];
  const reglas = ["par", "par", "par", "par", "par", "mayor5", "par", "mayor5", "par", "mayor5", "par", "mayor5", "par", "mayor5", "par", "mayor5"];
  return numeros.map((numero, indice) => ({
    numero,
    regla: reglas[indice],
    cambio: indice > 0 && reglas[indice] !== reglas[indice - 1],
    correcta: reglas[indice] === "par" ? numero % 2 === 0 : numero > 5
  }));
}

function iniciarEjecutivas() {
  estadoPrueba = { indice: 0, ensayos: crearEnsayosEjecutivos(), respuestas: [] };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-ejecutiva-evc">
      <p>Responda SÍ o NO según la regla escrita. La regla cambiará durante la tarea.</p>
      <div class="regla-ejecutiva-evc" id="reglaEjecutivaEvc"></div>
      <div class="numero-ejecutivo-evc" id="numeroEjecutivoEvc"></div>
      <div class="respuestas-ejecutivas-evc">
        <button type="button" data-respuesta-ejecutiva="si">SÍ</button>
        <button type="button" data-respuesta-ejecutiva="no">NO</button>
      </div>
      <small id="contadorEjecutivoEvc"></small>
    </section>
  `;
  $("contenidoPruebaEvc").querySelectorAll("[data-respuesta-ejecutiva]").forEach((boton) => {
    boton.addEventListener("click", () => responderEjecutiva(boton.dataset.respuestaEjecutiva === "si"));
  });
  accionesDialog([]);
  mostrarEnsayoEjecutivo();
}

function mostrarEnsayoEjecutivo() {
  const ensayo = estadoPrueba.ensayos[estadoPrueba.indice];
  if (!ensayo) {
    finalizarEjecutivas();
    return;
  }
  $("reglaEjecutivaEvc").textContent = ensayo.regla === "par" ? "Regla A · ¿El número es PAR?" : "Regla B · ¿El número es MAYOR QUE 5?";
  $("reglaEjecutivaEvc").dataset.regla = ensayo.regla;
  $("numeroEjecutivoEvc").textContent = ensayo.numero;
  $("contadorEjecutivoEvc").textContent = `Ensayo ${estadoPrueba.indice + 1} de ${estadoPrueba.ensayos.length}`;
  estadoPrueba.inicioEnsayo = performance.now();
  actualizarProgresoDialog((estadoPrueba.indice / estadoPrueba.ensayos.length) * 100);
}

function responderEjecutiva(respuesta) {
  const ensayo = estadoPrueba.ensayos?.[estadoPrueba.indice];
  if (!ensayo) return;
  estadoPrueba.respuestas.push({ ...ensayo, respuesta, acierto: respuesta === ensayo.correcta, rt: performance.now() - estadoPrueba.inicioEnsayo });
  estadoPrueba.indice += 1;
  mostrarEnsayoEjecutivo();
}

function finalizarEjecutivas() {
  const respuestas = estadoPrueba.respuestas || [];
  const cambios = respuestas.filter((item) => item.cambio);
  guardarResultadoPrueba(calificarPruebaEvc("ejecutivas", {
    total: respuestas.length,
    correctas: respuestas.filter((item) => item.acierto).length,
    cambios: cambios.length,
    cambiosCorrectos: cambios.filter((item) => item.acierto).length,
    medianaRespuestaMs: mediana(respuestas.map((item) => item.rt))
  }));
}

function iniciarLenguaje() {
  estadoPrueba = { inicio: performance.now() };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-lenguaje-evc">
      <div class="instruccion-tarea-evc"><strong>Diga todos los animales que pueda</strong><span id="relojPruebaEvc">60 s</span></div>
      <p>Una persona acompañante puede transcribir. Separe cada respuesta con coma o Enter y retire entradas que no sean animales.</p>
      <label>Respuestas
        <textarea id="palabrasLenguajeEvc" rows="6" spellcheck="false" placeholder="perro, gato, caballo…" autofocus></textarea>
      </label>
      <div class="campos-lenguaje-evc">
        <label>Quién registra
          <select id="modoLenguajeEvc">
            <option value="acompañante">Acompañante o profesional</option>
            <option value="paciente">Paciente escribe</option>
          </select>
        </label>
        <label>Ayuda utilizada
          <select id="ayudaLenguajeEvc">
            <option value="ninguna">Ninguna</option>
            <option value="repeticion-instruccion">Se repitió la instrucción</option>
            <option value="claves">Se dieron claves</option>
            <option value="no-completa">No logró completar</option>
          </select>
        </label>
        <label>Entradas no válidas
          <input id="invalidasLenguajeEvc" type="number" min="0" max="100" value="0">
        </label>
      </div>
      <p class="conteo-lenguaje-evc" id="conteoLenguajeEvc">0 palabras distintas · 0 repeticiones</p>
    </section>
  `;
  const actualizarConteo = () => {
    const conteo = normalizarPalabrasFluidez($("palabrasLenguajeEvc")?.value || "");
    $("conteoLenguajeEvc").textContent = `${conteo.unicas.length} palabras distintas · ${conteo.repeticiones} repeticiones`;
  };
  $("palabrasLenguajeEvc")?.addEventListener("input", actualizarConteo);
  accionesDialog([{ id: "terminarLenguaje", texto: "Terminar y calificar", accion: finalizarLenguaje }]);
  iniciarCuentaRegresiva(60, "relojPruebaEvc", finalizarLenguaje);
}

function finalizarLenguaje() {
  if (pruebaActiva !== "lenguaje") return;
  const conteo = normalizarPalabrasFluidez($("palabrasLenguajeEvc")?.value || "");
  const invalidas = Math.max(0, Math.min(conteo.unicas.length, Number($("invalidasLenguajeEvc")?.value || 0)));
  guardarResultadoPrueba(calificarPruebaEvc("lenguaje", {
    palabrasValidas: conteo.unicas.length - invalidas,
    repeticiones: conteo.repeticiones,
    ayuda: $("ayudaLenguajeEvc")?.value,
    modoRegistro: $("modoLenguajeEvc")?.value,
    duracionSegundos: (performance.now() - estadoPrueba.inicio) / 1000
  }));
}

function iniciarVelocidad() {
  estadoPrueba = { inicio: performance.now(), inicioEnsayo: performance.now(), indice: 0, respuestas: [] };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-velocidad-evc">
      <div class="instruccion-tarea-evc"><strong>Pulse el número que corresponde al símbolo</strong><span id="relojPruebaEvc">45 s</span></div>
      <div class="clave-velocidad-evc">${Object.entries(CLAVE_VELOCIDAD).map(([simbolo, numero]) => `<span><b>${simbolo}</b>${numero}</span>`).join("")}</div>
      <div class="simbolo-velocidad-evc" id="simboloVelocidadEvc"></div>
      <div class="respuestas-velocidad-evc">${[1, 2, 3, 4].map((numero) => `<button type="button" data-respuesta-velocidad="${numero}">${numero}</button>`).join("")}</div>
      <small id="contadorVelocidadEvc"></small>
    </section>
  `;
  $("contenidoPruebaEvc").querySelectorAll("[data-respuesta-velocidad]").forEach((boton) => {
    boton.addEventListener("click", () => responderVelocidad(Number(boton.dataset.respuestaVelocidad)));
  });
  accionesDialog([{ id: "terminarVelocidad", texto: "Terminar", secundaria: true, accion: finalizarVelocidad }]);
  mostrarEnsayoVelocidad();
  iniciarCuentaRegresiva(45, "relojPruebaEvc", finalizarVelocidad);
}

function mostrarEnsayoVelocidad() {
  const simbolo = SECUENCIA_VELOCIDAD[estadoPrueba.indice];
  if (!simbolo) {
    finalizarVelocidad();
    return;
  }
  $("simboloVelocidadEvc").textContent = simbolo;
  $("contadorVelocidadEvc").textContent = `${estadoPrueba.indice + 1} de ${SECUENCIA_VELOCIDAD.length}`;
  estadoPrueba.inicioEnsayo = performance.now();
  actualizarProgresoDialog((estadoPrueba.indice / SECUENCIA_VELOCIDAD.length) * 100);
}

function responderVelocidad(respuesta) {
  const simbolo = SECUENCIA_VELOCIDAD[estadoPrueba.indice];
  if (!simbolo) return;
  estadoPrueba.respuestas.push({ simbolo, respuesta, correcta: respuesta === CLAVE_VELOCIDAD[simbolo], rt: performance.now() - estadoPrueba.inicioEnsayo });
  estadoPrueba.indice += 1;
  mostrarEnsayoVelocidad();
}

function finalizarVelocidad() {
  if (pruebaActiva !== "velocidad") return;
  const respuestas = estadoPrueba.respuestas || [];
  if (!respuestas.length) {
    guardarResultadoPrueba(crearResultadoNoEvaluable("velocidad", "No se registraron respuestas en la tarea de codificación."));
    return;
  }
  guardarResultadoPrueba(calificarPruebaEvc("velocidad", {
    intentos: respuestas.length,
    correctas: respuestas.filter((item) => item.correcta).length,
    duracionSegundos: (performance.now() - estadoPrueba.inicio) / 1000,
    medianaRespuestaMs: mediana(respuestas.map((item) => item.rt)),
    usoManoComprometido: Boolean(document.querySelector('input[name="factorInterferencia"][value="motor"]:checked'))
  }));
}

function iniciarVisuoespacial() {
  const lineas = [
    { ancho: 78, desplazamiento: 7 },
    { ancho: 58, desplazamiento: 30 },
    { ancho: 88, desplazamiento: 3 },
    { ancho: 66, desplazamiento: 9 },
    { ancho: 74, desplazamiento: 22 }
  ];
  estadoPrueba = { errores: new Map(), lineas };
  $("contenidoPruebaEvc").innerHTML = `
    <section class="tarea-visuoespacial-evc">
      <div class="instruccion-tarea-evc"><strong>Señale el centro de cada línea</strong><span id="conteoLineasEvc">0/5</span></div>
      <p>Haga un solo clic por línea. No use una regla ni mida la pantalla.</p>
      <div class="lineas-biseccion-evc">
        ${lineas.map((linea, indice) => `<button type="button" data-linea-biseccion="${indice}" style="--ancho-linea:${linea.ancho}%;--desplazamiento-linea:${linea.desplazamiento}%" aria-label="Línea ${indice + 1}"><i></i></button>`).join("")}
      </div>
    </section>
  `;
  $("contenidoPruebaEvc").querySelectorAll("[data-linea-biseccion]").forEach((boton) => {
    boton.addEventListener("click", (evento) => {
      const indice = Number(boton.dataset.lineaBiseccion);
      if (estadoPrueba.errores.has(indice)) return;
      const rect = boton.getBoundingClientRect();
      const posicion = Math.max(0, Math.min(100, ((evento.clientX - rect.left) / rect.width) * 100));
      estadoPrueba.errores.set(indice, posicion - 50);
      boton.querySelector("i").style.left = `${posicion}%`;
      boton.classList.add("respondida");
      boton.disabled = true;
      $("conteoLineasEvc").textContent = `${estadoPrueba.errores.size}/5`;
      actualizarProgresoDialog((estadoPrueba.errores.size / lineas.length) * 100);
      if ($("terminarVisuoespacial")) $("terminarVisuoespacial").disabled = estadoPrueba.errores.size !== lineas.length;
    });
  });
  accionesDialog([{ id: "terminarVisuoespacial", texto: "Calificar bisección", deshabilitado: true, accion: finalizarVisuoespacial }]);
}

function finalizarVisuoespacial() {
  guardarResultadoPrueba(calificarPruebaEvc("visuoespacial", {
    erroresPorcentaje: [...(estadoPrueba.errores?.values() || [])]
  }));
}

function guardarResultadoPrueba(resultado) {
  limpiarTemporizadoresPrueba();
  resultadosPruebas = { ...resultadosPruebas, [resultado.dominio]: resultado };
  renderizarDominios();
  planActual = null;
  if ($("planEvc")) $("planEvc").hidden = true;
  cerrarDialogPrueba();
  mostrarToast(resultado.noEvaluable ? "Dominio registrado como no evaluable." : "Resultado orientativo registrado.");
}

function accionesDialog(acciones) {
  const contenedor = $("accionesPruebaEvc");
  if (!contenedor) return;
  contenedor.innerHTML = acciones.map((accion) => `<button type="button" id="${accion.id}" class="${accion.secundaria ? "boton-secundario" : ""}" ${accion.deshabilitado ? "disabled" : ""}>${escaparHTML(accion.texto)}</button>`).join("");
  acciones.forEach((accion) => $(accion.id)?.addEventListener("click", accion.accion));
}

function iniciarCuentaRegresiva(segundos, idReloj, alTerminar) {
  const inicio = performance.now();
  const duracion = segundos * 1000;
  const actualizar = () => {
    const transcurrido = performance.now() - inicio;
    const restante = Math.max(0, Math.ceil((duracion - transcurrido) / 1000));
    if ($(idReloj)) $(idReloj).textContent = `${restante} s`;
    actualizarProgresoDialog(Math.min(100, (transcurrido / duracion) * 100));
  };
  actualizar();
  programarIntervalo(actualizar, 250);
  programarTimeout(alTerminar, duracion);
}

function actualizarProgresoDialog(porcentaje) {
  if ($("progresoDialogPruebaEvc")) $("progresoDialogPruebaEvc").style.width = `${Math.max(0, Math.min(100, Number(porcentaje) || 0))}%`;
}

function programarIntervalo(funcion, demora) {
  const id = window.setInterval(funcion, demora);
  intervalosPrueba.push(id);
  return id;
}

function programarTimeout(funcion, demora) {
  const id = window.setTimeout(funcion, demora);
  temporizadoresPrueba.push(id);
  return id;
}

function limpiarTemporizadoresPrueba() {
  intervalosPrueba.forEach((id) => window.clearInterval(id));
  temporizadoresPrueba.forEach((id) => window.clearTimeout(id));
  intervalosPrueba = [];
  temporizadoresPrueba = [];
}

function cerrarDialogPrueba() {
  limpiarTemporizadoresPrueba();
  const dialog = $("dialogPruebaEvc");
  if (dialog?.open) dialog.close();
  pruebaActiva = "";
  estadoPrueba = {};
}

function leerFormulario() {
  const dominios = {};
  DOMINIOS_EVC.forEach((dominio) => {
    const resultado = resultadosPruebas[dominio.id];
    dominios[dominio.id] = resultado?.completada ? resultado.nivelApoyo : null;
  });
  return {
    dominios,
    pruebas: resultadosPruebas,
    nombrePaciente: $("nombrePacienteEvc")?.value || "",
    fechaEvc: $("fechaEvc")?.value || "",
    fatiga: $("fatigaEvc")?.value || "1",
    apoyo: $("apoyoEvc")?.value || "ocasional",
    diasSemana: $("diasSemanaEvc")?.value || "3",
    instrumentoReferencia: $("instrumentoReferenciaEvc")?.value || "no-aplicado",
    factoresInterferencia: [...document.querySelectorAll('input[name="factorInterferencia"]:checked')].map((campo) => campo.value),
    metaPrincipal: $("metaPrincipalEvc")?.value || "",
    actividadSignificativa: $("actividadSignificativaEvc")?.value || "",
    observaciones: $("observacionesEvc")?.value || ""
  };
}

function crearPlanDesdeFormulario(evento) {
  evento.preventDefault();
  const error = $("errorEvaluacionEvc");
  if (error) error.textContent = "";
  const progreso = progresoBateriaEvc(resultadosPruebas);
  if (!progreso.completa) {
    if (error) error.textContent = `Aborda los ${progreso.total} dominios: faltan ${progreso.total - progreso.abordados} pruebas por completar o marcar como no evaluables.`;
    $("evaluacion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!$("confirmacionEvc")?.checked) {
    if (error) error.textContent = "Confirma la estabilidad clínica y la revisión profesional antes de generar el plan.";
    $("confirmacionEvc")?.focus();
    return;
  }
  const resultado = generarPlanEvc(leerFormulario());
  if (!resultado.valido) {
    if (error) error.textContent = resultado.errores.join(" ");
    $("evaluacion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  planActual = resultado;
  renderizarPlan(resultado);
  $("planEvc")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderizarPlan(plan) {
  const panel = $("planEvc");
  if (!panel) return;
  panel.hidden = false;
  $("fechaPlanEvc").textContent = `Generado ${new Date(plan.creadoEn).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", hour12: false })}. Revisión profesional requerida.`;
  $("metaPlanEvc").textContent = plan.metaFuncional;
  $("resumenPlanEvc").innerHTML = [
    ["Periodo inicial", `${plan.duracionInicialSemanas} semanas`],
    ["Frecuencia", `${plan.diasSemana} días/semana`],
    ["Sesión", `Hasta ${plan.minutosSesion} minutos`],
    ["Seguimiento", "Semanal"]
  ].map(([etiqueta, valor]) => `<article><span>${etiqueta}</span><strong>${valor}</strong></article>`).join("");

  $("perfilDominiosEvc").innerHTML = plan.perfil.map((dominio) => {
    const evaluable = Number.isFinite(dominio.puntaje);
    const ancho = evaluable ? (dominio.puntaje === 0 ? 2 : (dominio.puntaje / 3) * 100) : 0;
    return `
      <div class="perfil-dominio-evc ${evaluable ? "" : "perfil-no-evaluable"}">
        <span>${escaparHTML(dominio.nombre)}</span>
        <div class="barra-perfil-evc" aria-hidden="true"><i style="--nivel:${ancho}%"></i></div>
        <small>${escaparHTML(dominio.nivel)}</small>
        ${dominio.prueba?.resumen ? `<p>${escaparHTML(dominio.prueba.resumen)}</p>` : ""}
      </div>
    `;
  }).join("");

  $("prioridadesPlanEvc").innerHTML = plan.prioridades.map((prioridad, indice) => `
    <article class="prioridad-plan-evc">
      <span>Prioridad ${indice + 1} · ${escaparHTML(prioridad.nivel)}</span>
      <h4>${escaparHTML(prioridad.nombre)}</h4>
      <p>${escaparHTML(prioridad.objetivo)}</p>
      <ul>${prioridad.estrategias.map((estrategia) => `<li>${escaparHTML(estrategia)}</li>`).join("")}</ul>
    </article>
  `).join("");

  $("actividadesPlanEvc").innerHTML = plan.actividades.map((actividad) => `
    <article class="actividad-plan-evc">
      <span>${escaparHTML(actividad.tipo)}</span>
      <h4>${escaparHTML(actividad.nombre)}</h4>
      <p>${escaparHTML(actividad.descripcion)}</p>
      <footer>
        <small>${actividad.minutos} min sugeridos</small>
        ${actividad.url ? `<a href="${escaparHTML(urlConPaciente(actividad.url))}">Abrir actividad</a>` : "<small>Práctica acompañada</small>"}
      </footer>
    </article>
  `).join("");

  renderizarProtocolo(plan.protocolo);
  $("apoyosPlanEvc").innerHTML = plan.apoyos.map((apoyo) => `<li>${escaparHTML(apoyo)}</li>`).join("");
  const contenedorAlertas = $("contenedorAlertasPlanEvc");
  contenedorAlertas.hidden = plan.alertas.length === 0;
  $("alertasPlanEvc").innerHTML = plan.alertas.map((alerta) => `<li>${escaparHTML(alerta)}</li>`).join("");
  $("estadoGuardadoEvc").textContent = "";
}

function renderizarProtocolo(protocolo) {
  $("alcanceProtocoloEvc").textContent = protocolo.alcance;
  $("fasesProtocoloEvc").innerHTML = protocolo.fases.map((fase) => `
    <article><span>${escaparHTML(fase.periodo)}</span><strong>${escaparHTML(fase.dosis)}</strong><p>${escaparHTML(fase.objetivo)}</p></article>
  `).join("");
  $("estructuraSesionEvc").innerHTML = protocolo.estructuraSesion.map((item) => `<li>${escaparHTML(item)}</li>`).join("");
  $("progresionPlanEvc").innerHTML = protocolo.progresion.map((item) => `<li>${escaparHTML(item)}</li>`).join("");
  $("suspensionPlanEvc").innerHTML = protocolo.criteriosSuspension.map((item) => `<li>${escaparHTML(item)}</li>`).join("");
  $("limitesPlanEvc").innerHTML = protocolo.limites.map((item) => `<li>${escaparHTML(item)}</li>`).join("");
  $("seguimientoProtocoloEvc").textContent = protocolo.seguimiento;
}

async function cargarContextoPaciente() {
  if (!idPaciente) return;
  const contexto = $("contextoPacienteEvc");
  const detalle = $("detallePacienteEvc");
  if (contexto) contexto.textContent = "Cargando paciente…";
  try {
    const paciente = await obtenerUsuario(idPaciente);
    const nombre = paciente?.nombreCompleto || paciente?.nombre || paciente?.displayName || "Paciente seleccionado";
    if (contexto) contexto.textContent = nombre;
    if (detalle) detalle.textContent = "El identificador del paciente se conservará al abrir las actividades.";
    if ($("nombrePacienteEvc")) $("nombrePacienteEvc").value = nombre;
  } catch (_) {
    if (contexto) contexto.textContent = "Paciente seleccionado";
    if (detalle) detalle.textContent = "No fue posible cargar el nombre; el identificador se conservará en la navegación.";
  }
}

function configurarEnlaces() {
  document.querySelectorAll("[data-volver-rehabilitacion]").forEach((enlace) => {
    enlace.href = urlConPaciente("rehabilitacion-cognitiva.html");
  });
}

function urlConPaciente(url) {
  if (!idPaciente) return url;
  const destino = new URL(url, window.location.href);
  destino.searchParams.set("id", idPaciente);
  return `${destino.pathname.split("/").pop()}${destino.search}`;
}

function claveBorrador() {
  return `cognicion:rehabilitacion-evc:borrador:${idPaciente || uidUsuarioActual || "general"}`;
}

function guardarBorradorLocal() {
  if (!planActual) return;
  try {
    localStorage.setItem(claveBorrador(), JSON.stringify({ version: 2, guardadoEn: new Date().toISOString(), evaluacion: planActual.evaluacion }));
    $("estadoGuardadoEvc").textContent = "Borrador guardado en este dispositivo. No se añadió al expediente clínico.";
    mostrarToast("Borrador guardado en este dispositivo.");
  } catch (_) {
    $("estadoGuardadoEvc").textContent = "No fue posible guardar el borrador en este dispositivo.";
  }
}

function restaurarBorradorLocal() {
  try {
    const registro = JSON.parse(localStorage.getItem(claveBorrador()) || "null");
    if (!registro?.evaluacion) return;
    cargarEvaluacionEnFormulario(registro.evaluacion);
    if (!Object.keys(registro.evaluacion.pruebas || {}).length) {
      mostrarToast("El borrador anterior requiere completar la nueva batería.");
      return;
    }
    const restaurado = generarPlanEvc(registro.evaluacion);
    if (!restaurado.valido) return;
    planActual = restaurado;
    renderizarPlan(restaurado);
    $("estadoGuardadoEvc").textContent = `Borrador recuperado de este dispositivo${registro.guardadoEn ? ` · ${new Date(registro.guardadoEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })}` : ""}.`;
  } catch (_) {
    // Un borrador local inválido no debe impedir una nueva evaluación.
  }
}

function cargarEvaluacionEnFormulario(evaluacion) {
  const asignar = (id, valor) => { if ($(id) && valor !== undefined && valor !== null) $(id).value = String(valor); };
  if (!$("nombrePacienteEvc")?.value) asignar("nombrePacienteEvc", evaluacion.nombrePaciente);
  asignar("fechaEvc", evaluacion.fechaEvc);
  asignar("fatigaEvc", evaluacion.fatiga);
  asignar("apoyoEvc", evaluacion.apoyo);
  asignar("diasSemanaEvc", evaluacion.diasSemana);
  asignar("instrumentoReferenciaEvc", evaluacion.instrumentoReferencia);
  asignar("metaPrincipalEvc", evaluacion.metaPrincipal);
  asignar("actividadSignificativaEvc", evaluacion.actividadSignificativa);
  asignar("observacionesEvc", evaluacion.observaciones);
  const factores = new Set(evaluacion.factoresInterferencia || []);
  document.querySelectorAll('input[name="factorInterferencia"]').forEach((campo) => { campo.checked = factores.has(campo.value); });
  resultadosPruebas = { ...(evaluacion.pruebas || {}) };
  renderizarDominios();
  if ($("confirmacionEvc")) $("confirmacionEvc").checked = true;
}

async function copiarResumenPlan() {
  if (!planActual) return;
  try {
    await navigator.clipboard.writeText(resumirPlanEvc(planActual));
    mostrarToast("Resumen copiado.");
  } catch (_) {
    mostrarToast("No fue posible copiar el resumen.");
  }
}

function marcarCambiosPendientes(evento) {
  if (!planActual || evento.target.closest("#planEvc")) return;
  const estado = $("estadoEvaluacionEvc");
  if (estado) estado.textContent = "Cambios pendientes de generar";
}

function mediana(valores) {
  const lista = valores.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!lista.length) return 0;
  const mitad = Math.floor(lista.length / 2);
  return Math.round(lista.length % 2 ? lista[mitad] : (lista[mitad - 1] + lista[mitad]) / 2);
}

function mostrarToast(mensaje) {
  const toast = $("toastEvc");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.classList.add("visible");
  window.clearTimeout(temporizadorToast);
  temporizadorToast = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export { leerFormulario, renderizarPlan };
