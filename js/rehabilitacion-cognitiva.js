import { auth, db } from "./firebase.js";
import {
  ESCALAS_COGNITIVAS,
  calcularPuntajeEscalaCognitiva,
  interpretarEscalaCognitiva,
  obtenerPuntajesDominioCognitivo
} from "./data/escalasCognitivas.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  PRUEBAS_INTERACTIVAS,
  calcularPuntajePruebaInteractiva,
  interpretarPruebaInteractiva,
  obtenerPruebaInteractiva,
  puntajesDominioPruebaInteractiva
} from "./data/pruebasInteractivas.js";

import { obtenerUsuario } from "./services/usuarios.js";
import { crearResumenEscala, guardarEscalaAplicada } from "./services/escalas.js";

const INTRO_KEY = "cognicion_intro_rehabilitacion_vista";

const dominios = [
  "Atencion",
  "Memoria",
  "Funciones ejecutivas",
  "Lenguaje",
  "Velocidad de procesamiento",
  "Cognicion social",
  "Visuoespacial"
];

const tamizajes = [...ESCALAS_COGNITIVAS, ...PRUEBAS_INTERACTIVAS.filter((prueba) => !ESCALAS_COGNITIVAS.some((escala) => escala.id === prueba.id))].map((escala) => ({
  id: escala.id,
  icono: escala.nombre.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(),
  titulo: escala.nombre,
  nombre: escala.subtitulo || escala.area || "Tamizaje cognitivo",
  uso: escala.descripcion,
  evalua: escala.dominiosEvaluados || [],
  requiereInstrumentoOficial: escala.requiereInstrumentoOficial,
  interactiva: Boolean(obtenerPruebaInteractiva(escala.id)),
  puntajeMaximo: escala.puntajeMaximo,
  poblacionSugerida: escala.poblacionSugerida,
  limitaciones: escala.limitaciones || []
}));

const actividades = [
  {
    icono: "1B",
    nombre: "1-Back",
    descripcion: "Ejercicio de memoria de trabajo en el que debes identificar si el estimulo actual coincide con el anterior.",
    funciones: ["Memoria", "Atencion", "Velocidad de procesamiento"],
    estado: "Disponible",
    accion: "Entrenar",
    url: "nback.html"
  },
  {
    icono: "ST",
    nombre: "Stroop",
    descripcion: "Selecciona el color de la tinta e inhibe la lectura automatica de la palabra.",
    funciones: ["Funciones ejecutivas", "Atencion", "Velocidad de procesamiento"],
    estado: "Disponible",
    accion: "Entrenar",
    url: "stroop.html"
  },
  {
    icono: "GN",
    nombre: "Go / No-Go",
    descripcion: "Responde ante estimulos objetivo y detente ante estimulos de inhibicion.",
    funciones: ["Funciones ejecutivas", "Atencion", "Velocidad de procesamiento"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "SD",
    nombre: "Span de digitos",
    descripcion: "Recuerda secuencias numericas en orden directo o inverso.",
    funciones: ["Memoria", "Atencion"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "CO",
    nombre: "Memoria espacial tipo Corsi",
    descripcion: "Observa una secuencia de cuadros iluminados y repitela en el mismo orden.",
    funciones: ["Memoria", "Atencion", "Visuoespacial"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "TR",
    nombre: "Trail Making",
    descripcion: "Conecta numeros y letras alternadamente para entrenar velocidad, atencion y flexibilidad mental.",
    funciones: ["Funciones ejecutivas", "Velocidad de procesamiento", "Atencion"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "BV",
    nombre: "Busqueda visual",
    descripcion: "Encuentra un estimulo objetivo entre multiples distractores.",
    funciones: ["Atencion", "Velocidad de procesamiento", "Visuoespacial"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "MP",
    nombre: "Memory de parejas",
    descripcion: "Encuentra pares de tarjetas recordando su ubicacion.",
    funciones: ["Memoria", "Atencion"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "EM",
    nombre: "Reconocimiento de emociones",
    descripcion: "Identifica emociones basicas en rostros o expresiones.",
    funciones: ["Cognicion social", "Atencion"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "FV",
    nombre: "Fluidez verbal",
    descripcion: "Genera palabras por categoria o letra durante un tiempo limitado.",
    funciones: ["Lenguaje", "Velocidad de procesamiento", "Funciones ejecutivas"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "CM",
    nombre: "Calculo mental",
    descripcion: "Resuelve operaciones breves o series numericas progresivas.",
    funciones: ["Atencion", "Memoria", "Funciones ejecutivas"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  },
  {
    icono: "SP",
    nombre: "Secuencias y patrones",
    descripcion: "Identifica y continua patrones visuales, numericos o simbolicos.",
    funciones: ["Funciones ejecutivas", "Memoria", "Visuoespacial"],
    estado: "Proximamente",
    accion: "Ver ejercicio"
  }
];

let filtroActivo = "Todos";

document.addEventListener("DOMContentLoaded", () => {
  inicializarIntro();
  renderizarTamizajes();
  renderizarFiltros();
  renderizarActividades();
  configurarBusqueda();
  asegurarPanelTamizajeCognitivo();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  usuarioActualDatos = await obtenerUsuario(user.uid);
});

function inicializarIntro() {
  const intro = document.getElementById("introRehabilitacion");
  const saltar = document.getElementById("saltarIntro");
  const verIntro = document.getElementById("verIntro");

  if (!intro) return;

  if (localStorage.getItem(INTRO_KEY) === "1") {
    intro.classList.add("oculta");
  } else {
    window.setTimeout(() => cerrarIntro(), 4600);
  }

  saltar?.addEventListener("click", cerrarIntro);
  verIntro?.addEventListener("click", () => {
    intro.classList.remove("oculta");
    window.setTimeout(() => cerrarIntro(), 4600);
  });
}

function cerrarIntro() {
  const intro = document.getElementById("introRehabilitacion");
  intro?.classList.add("oculta");
  localStorage.setItem(INTRO_KEY, "1");
}

function renderizarTamizajes() {
  const grid = document.getElementById("gridTamizajes");
  if (!grid) return;

  grid.innerHTML = tamizajes.map((item) => `
    <article class="tarjeta-tamizaje">
      <div class="tarjeta-icono">${item.icono}</div>
      <div class="estado-tamizaje ${item.requiereInstrumentoOficial ? "oficial" : "disponible"}">
        ${item.interactiva ? "Aplicable en plataforma" : item.requiereInstrumentoOficial ? "Captura con instrumento oficial" : "Disponible"}
      </div>
      <h3>${item.titulo}</h3>
      <small>${item.nombre}</small>
      <p>${item.uso}</p>
      <ul>
        ${item.evalua.map((dominio) => `<li>${dominio}</li>`).join("")}
      </ul>
      <p class="texto-tamizaje-mini">${item.poblacionSugerida || "Aplicacion clinica supervisada."}</p>
      <div class="acciones-tarjeta-tamizaje">
        <button type="button" data-aplicar-tamizaje="${item.id}">Aplicar prueba ahora</button>
        <button type="button" class="boton-secundario" data-ficha-tamizaje="${item.id}">Capturar resultado previo</button>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-aplicar-tamizaje]").forEach((boton) => {
    boton.addEventListener("click", () => abrirTamizajeCognitivo(boton.dataset.aplicarTamizaje, "interactiva"));
  });

  grid.querySelectorAll("[data-ficha-tamizaje]").forEach((boton) => {
    boton.addEventListener("click", () => abrirTamizajeCognitivo(boton.dataset.fichaTamizaje, "manual"));
  });
}

let escalaCognitivaActual = null;
let pruebaInteractivaActual = null;
let modoTamizajeActual = "interactiva";
let resultadoTamizajeActual = null;
let usuarioActualDatos = null;

function asegurarPanelTamizajeCognitivo() {
  if (document.getElementById("panelTamizajeCognitivo")) return;
  const panel = document.createElement("section");
  panel.id = "panelTamizajeCognitivo";
  panel.className = "panel-tamizaje-cognitivo";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="panel-tamizaje-overlay" data-cerrar-tamizaje="true"></div>
    <div class="panel-tamizaje-card" role="dialog" aria-modal="true" aria-labelledby="tituloTamizajeCognitivo">
      <div class="panel-tamizaje-header">
        <div>
          <span id="subtituloTamizajeCognitivo">Tamizaje cognitivo</span>
          <h2 id="tituloTamizajeCognitivo">Escala</h2>
          <p id="descripcionTamizajeCognitivo"></p>
        </div>
        <button type="button" class="cerrar-tamizaje" data-cerrar-tamizaje="true">Cerrar</button>
      </div>
      <div class="modo-tamizaje-switch" role="tablist" aria-label="Modo de aplicacion">
        <button type="button" id="modoAplicarTamizaje" data-modo-tamizaje="interactiva">Aplicar prueba ahora</button>
        <button type="button" id="modoManualTamizaje" data-modo-tamizaje="manual">Capturar resultado previo</button>
      </div>
      <div id="avisoTamizajeCognitivo" class="aviso-tamizaje-cognitivo"></div>
      <div id="pasosTamizajeCognitivo" class="pasos-tamizaje-cognitivo"></div>
      <form id="formTamizajeCognitivo" class="form-tamizaje-cognitivo"></form>
      <label class="observaciones-tamizaje">Observaciones clinicas
        <textarea id="observacionesTamizajeCognitivo" placeholder="Observaciones, conducta durante la prueba, cooperacion, factores que puedan afectar el resultado."></textarea>
      </label>
      <label class="visibilidad-tamizaje-paciente">
        <input id="visibilidadTamizajePaciente" type="checkbox">
        Hacer visible para paciente
      </label>
      <div class="resultado-tamizaje-cognitivo" id="resultadoTamizajeCognitivo">
        <strong>Resultado</strong>
        <p>Aplica la prueba o captura puntajes y calcula el resultado.</p>
      </div>
      <div class="acciones-tamizaje-cognitivo">
        <button type="button" id="calcularTamizajeCognitivo">Calcular</button>
        <button type="button" id="guardarTamizajeCognitivo">Guardar en expediente</button>
        <button type="button" id="limpiarTamizajeCognitivo" class="boton-secundario">Limpiar</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelectorAll("[data-cerrar-tamizaje]").forEach((control) => control.addEventListener("click", cerrarTamizajeCognitivo));
  panel.querySelectorAll("[data-modo-tamizaje]").forEach((control) => control.addEventListener("click", () => cambiarModoTamizaje(control.dataset.modoTamizaje)));
  document.getElementById("calcularTamizajeCognitivo")?.addEventListener("click", calcularTamizajeCognitivoActual);
  document.getElementById("guardarTamizajeCognitivo")?.addEventListener("click", guardarTamizajeCognitivoActual);
  document.getElementById("limpiarTamizajeCognitivo")?.addEventListener("click", limpiarTamizajeCognitivoActual);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && panel.classList.contains("abierto")) cerrarTamizajeCognitivo();
  });
}

function abrirTamizajeCognitivo(idEscala, modo = "interactiva") {
  asegurarPanelTamizajeCognitivo();
  escalaCognitivaActual = ESCALAS_COGNITIVAS.find((escala) => escala.id === idEscala) || null;
  pruebaInteractivaActual = obtenerPruebaInteractiva(idEscala);
  if (!escalaCognitivaActual && !pruebaInteractivaActual) return;

  modoTamizajeActual = modo === "manual" || !pruebaInteractivaActual ? "manual" : "interactiva";
  const base = pruebaInteractivaActual || escalaCognitivaActual;
  resultadoTamizajeActual = null;

  document.getElementById("subtituloTamizajeCognitivo").textContent = base.subtitulo || base.area || "Tamizaje";
  document.getElementById("tituloTamizajeCognitivo").textContent = base.nombre;
  document.getElementById("descripcionTamizajeCognitivo").textContent = base.descripcion || "";
  document.getElementById("observacionesTamizajeCognitivo").value = "";
  document.getElementById("visibilidadTamizajePaciente").checked = false;
  document.getElementById("resultadoTamizajeCognitivo").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;

  actualizarModoVisualTamizaje();
  renderizarContenidoTamizaje();

  const panel = document.getElementById("panelTamizajeCognitivo");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
}

function cambiarModoTamizaje(modo) {
  if (modo === "interactiva" && !pruebaInteractivaActual) {
    mostrarToast("Esta escala solo tiene captura estructurada por ahora.");
    return;
  }
  modoTamizajeActual = modo === "manual" ? "manual" : "interactiva";
  resultadoTamizajeActual = null;
  actualizarModoVisualTamizaje();
  renderizarContenidoTamizaje();
  document.getElementById("resultadoTamizajeCognitivo").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;
}

function actualizarModoVisualTamizaje() {
  document.querySelectorAll("[data-modo-tamizaje]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.modoTamizaje === modoTamizajeActual);
  });
  document.getElementById("modoAplicarTamizaje")?.toggleAttribute("disabled", !pruebaInteractivaActual);
}

function cerrarTamizajeCognitivo() {
  const panel = document.getElementById("panelTamizajeCognitivo");
  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");
}

function renderizarContenidoTamizaje() {
  const base = modoTamizajeActual === "interactiva" ? pruebaInteractivaActual : escalaCognitivaActual || pruebaInteractivaActual;
  document.getElementById("avisoTamizajeCognitivo").innerHTML = construirAvisoTamizaje(base);
  document.getElementById("pasosTamizajeCognitivo").innerHTML = modoTamizajeActual === "interactiva" ? renderizarPasosPrueba(base) : "";
  renderizarFormularioTamizaje(base, modoTamizajeActual);
}

function construirAvisoTamizaje(escala) {
  if (!escala) return "";
  const modo = modoTamizajeActual === "manual" ? "Captura resultado previo" : "Aplicacion interactiva";
  const oficial = escala.requiereInstrumentoOficial
    ? `<p><strong>Instrumento oficial:</strong> use material autorizado. Cognicion guia la aplicacion/captura sin reproducir contenido protegido.</p>`
    : "";
  const limitaciones = escala.limitaciones ? `<p><strong>Limitaciones:</strong> ${escaparHTML(escala.limitaciones)}</p>` : "";
  const instrucciones = escala.instrucciones ? `<p><strong>${modo}:</strong> ${escaparHTML(escala.instrucciones)}</p>` : "";
  const referencias = escala.referencias ? `<p><strong>Criterio/fuente:</strong> ${escaparHTML(Array.isArray(escala.referencias) ? escala.referencias.join("; ") : escala.referencias)}</p>` : "";
  return `${oficial}${instrucciones}${limitaciones}${referencias}<p>Los resultados apoyan el juicio clinico y no sustituyen valoracion medica o neuropsicologica.</p>`;
}

function renderizarPasosPrueba(prueba) {
  if (!prueba) return "";
  const pasos = prueba.pasos || [];
  const temporizador = prueba.duracionSegundos ? `<div class="temporizador-tamizaje"><span data-tiempo-tamizaje>${prueba.duracionSegundos}</span>s <button type="button" data-iniciar-temporizador>Iniciar temporizador</button></div>` : "";
  const estimulo = prueba.estimulo ? `<p class="estimulo-tamizaje">${escaparHTML(prueba.estimulo)}</p>` : "";
  const lista = pasos.length ? `<ol>${pasos.map((paso) => `<li>${escaparHTML(paso)}</li>`).join("")}</ol>` : "";
  window.setTimeout(configurarTemporizadorTamizaje, 0);
  return `<div class="guia-prueba-tamizaje"><strong>Guia de aplicacion</strong>${lista}${estimulo}${temporizador}</div>`;
}

function configurarTemporizadorTamizaje() {
  const boton = document.querySelector("[data-iniciar-temporizador]");
  const etiqueta = document.querySelector("[data-tiempo-tamizaje]");
  if (!boton || !etiqueta || boton.dataset.configurado === "1") return;
  boton.dataset.configurado = "1";
  boton.addEventListener("click", () => {
    let restante = Number(etiqueta.textContent || 0);
    boton.disabled = true;
    const intervalo = window.setInterval(() => {
      restante -= 1;
      etiqueta.textContent = String(Math.max(0, restante));
      if (restante <= 0) {
        window.clearInterval(intervalo);
        boton.disabled = false;
        boton.textContent = "Reiniciar temporizador";
      }
    }, 1000);
  });
}

function renderizarFormularioTamizaje(escala, modo = "manual") {
  const form = document.getElementById("formTamizajeCognitivo");
  if (!form || !escala) return;
  const items = modo === "interactiva" ? escala.reactivos || [] : escala.items || escala.reactivos || [];
  form.innerHTML = items.map((item, index) => {
    if (item.tipo === "select") {
      const opciones = (item.opciones || []).map((opcion, opcionIndex) => {
        const valor = item.valores?.[opcionIndex] ?? opcion.valor ?? opcion;
        const texto = opcion.texto ?? opcion;
        return `<option value="${escaparHTML(valor)}">${escaparHTML(texto)} (${escaparHTML(valor)})</option>`;
      }).join("");
      return `
        <label class="item-tamizaje-cognitivo">
          <span>${index + 1}. ${escaparHTML(item.texto || `Item ${index + 1}`)}</span>
          <select data-item-tamizaje="${index}"><option value="">Seleccionar</option>${opciones}</select>
          <small>${escaparHTML(item.dominio || "")}</small>
        </label>
      `;
    }
    return `
      <label class="item-tamizaje-cognitivo">
        <span>${index + 1}. ${escaparHTML(item.texto || `Item ${index + 1}`)}</span>
        <input type="number" data-item-tamizaje="${index}" min="${item.min ?? 0}" max="${item.max ?? ""}" step="${item.step || 1}" placeholder="${item.min ?? 0}-${item.max ?? ""}">
        <small>${escaparHTML(item.dominio || "")}${item.max !== undefined ? ` - max ${escaparHTML(item.max)}` : ""}${item.ayuda ? ` - ${escaparHTML(item.ayuda)}` : ""}</small>
      </label>
    `;
  }).join("");
}

function leerRespuestasTamizaje(escala) {
  const items = modoTamizajeActual === "interactiva" ? escala.reactivos || [] : escala.items || escala.reactivos || [];
  const respuestas = [];
  let valido = true;
  document.querySelectorAll("[data-item-tamizaje]").forEach((control) => {
    const index = Number(control.dataset.itemTamizaje);
    const item = items[index];
    const valor = control.value === "" ? null : Number(control.value || 0);
    const min = Number(item.min ?? 0);
    const max = item.max !== undefined ? Number(item.max) : null;

    if (valor === null || Number.isNaN(valor) || valor < min || (max !== null && valor > max)) {
      control.classList.add("campo-error");
      valido = false;
    } else {
      control.classList.remove("campo-error");
    }

    respuestas.push({
      item: item.texto || `Item ${index + 1}`,
      dominio: item.dominio || "",
      respuesta: control.tagName === "SELECT" ? control.selectedOptions[0]?.textContent || String(valor) : String(valor),
      valor
    });
  });
  return { respuestas, valido };
}

function calcularTamizajeCognitivoActual() {
  const escala = modoTamizajeActual === "interactiva" ? pruebaInteractivaActual : escalaCognitivaActual || pruebaInteractivaActual;
  if (!escala) return;
  const { respuestas, valido } = leerRespuestasTamizaje(escala);
  if (!valido) {
    mostrarToast("Responde todos los campos y revisa rangos marcados.");
    return;
  }

  const puntaje = modoTamizajeActual === "interactiva"
    ? calcularPuntajePruebaInteractiva(escala, respuestas)
    : calcularPuntajeEscalaCognitiva(escala, respuestas);
  const interpretacion = modoTamizajeActual === "interactiva"
    ? interpretarPruebaInteractiva(escala, puntaje)
    : interpretarEscalaCognitiva(escala, puntaje, respuestas);
  const dominios = modoTamizajeActual === "interactiva"
    ? puntajesDominioPruebaInteractiva(respuestas)
    : obtenerPuntajesDominioCognitivo(respuestas);
  const dominiosTexto = Object.entries(dominios).map(([dominio, valor]) => `${dominio}: ${valor}`).join(" - ");
  const maximo = escala.puntajeMaximo ? `/${escala.puntajeMaximo}` : "";
  const observaciones = document.getElementById("observacionesTamizajeCognitivo")?.value.trim() || "";
  const fechaAplicacion = new Date().toISOString();

  resultadoTamizajeActual = { escala, respuestas, puntaje, interpretacion, dominios, observaciones, fechaAplicacion };

  document.getElementById("resultadoTamizajeCognitivo").innerHTML = `
    <strong>${escaparHTML(escala.nombre)}: ${escaparHTML(puntaje)}${escaparHTML(maximo)}</strong>
    <p>${escaparHTML(interpretacion)}</p>
    <p><strong>Fecha:</strong> ${escaparHTML(new Date(fechaAplicacion).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false }))}</p>
    <p><strong>Aplicador:</strong> ${escaparHTML(usuarioActualDatos?.nombre || auth.currentUser?.email || "Usuario actual")}</p>
    <p><strong>Visible para paciente:</strong> ${document.getElementById("visibilidadTamizajePaciente")?.checked ? "Si" : "No"}</p>
    ${dominiosTexto ? `<p><strong>Subpuntajes:</strong> ${escaparHTML(dominiosTexto)}</p>` : ""}
    ${observaciones ? `<p><strong>Observaciones:</strong> ${escaparHTML(observaciones)}</p>` : ""}
  `;
}

async function guardarTamizajeCognitivoActual() {
  if (!resultadoTamizajeActual) calcularTamizajeCognitivoActual();
  if (!resultadoTamizajeActual) return;
  const idPaciente = new URLSearchParams(window.location.search).get("id") || new URLSearchParams(window.location.search).get("paciente") || "";
  if (!idPaciente) {
    mostrarToast("Abre rehabilitacion desde el expediente del paciente para guardar el resultado.");
    return;
  }
  const usuario = auth.currentUser;
  const paciente = await obtenerUsuario(idPaciente);
  const idEscalaAplicada = doc(collection(db, "usuarios", idPaciente, "escalasAplicadas")).id;
  const visible = Boolean(document.getElementById("visibilidadTamizajePaciente")?.checked);
  const { escala, respuestas, puntaje, interpretacion, dominios, observaciones, fechaAplicacion } = resultadoTamizajeActual;
  const registro = {
    idEscalaAplicada,
    escalaId: escala.id,
    uidMedico: usuario?.uid || "",
    uidProfesional: usuario?.uid || "",
    rolProfesional: usuarioActualDatos?.rol || "",
    nombrePaciente: paciente?.nombre || paciente?.nombreCompleto || "",
    nombreEscala: escala.nombre,
    tipoEscala: escala.tipoEscala || "cognitiva",
    fechaAplicacion,
    origen: "rehabilitacion_cognitiva",
    modoAplicacion: modoTamizajeActual === "manual" ? "captura_resultado_previo" : "aplicacion_interactiva",
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo ?? "",
    dominiosEvaluados: escala.dominiosEvaluados || [],
    puntajesPorDominio: dominios,
    rango: escala.rango,
    interpretacion,
    respuestasPorItem: respuestas,
    observaciones,
    observacionesClinicas: observaciones,
    recomendaciones: generarRecomendacionesCognitivas(dominios, escala),
    medicoNombre: usuarioActualDatos?.nombre || usuario?.email || "",
    visibilidadPaciente: visible,
    visibleDesdePaciente: visible
  };
  await guardarEscalaAplicada(idPaciente, registro);
  mostrarToast("Resultado guardado en Escalas/Tamizajes del paciente.");
}

function generarRecomendacionesCognitivas(dominios = {}, escala = {}) {
  if ((escala.tipoEscala || "") !== "cognitiva" && escala.area !== "Cognitiva") return "";
  const claves = Object.keys(dominios).join(" ").toLowerCase();
  const recomendaciones = [];
  if (/atencion|velocidad/.test(claves)) recomendaciones.push("Ejercicios de atencion sostenida/selectiva y velocidad de procesamiento.");
  if (/memoria|recuerdo/.test(claves)) recomendaciones.push("Ejercicios de memoria de trabajo, evocacion y aprendizaje verbal.");
  if (/ejecutiva|flexibilidad|control/.test(claves)) recomendaciones.push("Ejercicios de planificacion, flexibilidad cognitiva e inhibicion.");
  if (/visuoespacial|reloj/.test(claves)) recomendaciones.push("Actividades visuoespaciales, copia de figuras y rutas visuales.");
  return recomendaciones.join(" ");
}

function limpiarTamizajeCognitivoActual() {
  resultadoTamizajeActual = null;
  document.querySelectorAll("[data-item-tamizaje]").forEach((control) => {
    control.value = "";
    control.classList.remove("campo-error");
  });
  const observaciones = document.getElementById("observacionesTamizajeCognitivo");
  if (observaciones) observaciones.value = "";
  document.getElementById("resultadoTamizajeCognitivo").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}function renderizarFiltros() {
  const contenedor = document.getElementById("filtrosDominios");
  if (!contenedor) return;

  const opciones = ["Todos", ...dominios];
  contenedor.innerHTML = opciones.map((dominio) => `
    <button class="filtro-dominio ${dominio === filtroActivo ? "activo" : ""}" type="button" data-dominio="${dominio}">
      ${dominio}
    </button>
  `).join("");

  contenedor.querySelectorAll(".filtro-dominio").forEach((boton) => {
    boton.addEventListener("click", () => {
      filtroActivo = boton.dataset.dominio || "Todos";
      renderizarFiltros();
      renderizarActividades();
    });
  });
}

function configurarBusqueda() {
  document.getElementById("buscadorActividad")?.addEventListener("input", renderizarActividades);
}

function renderizarActividades() {
  const grid = document.getElementById("gridActividades");
  const sinResultados = document.getElementById("sinResultados");
  const busqueda = normalizarTexto(document.getElementById("buscadorActividad")?.value || "");
  if (!grid) return;

  const filtradas = actividades.filter((actividad) => {
    const coincideTexto = !busqueda ||
      normalizarTexto(actividad.nombre).includes(busqueda) ||
      normalizarTexto(actividad.descripcion).includes(busqueda) ||
      actividad.funciones.some((funcion) => normalizarTexto(funcion).includes(busqueda));

    const coincideDominio = filtroActivo === "Todos" || actividad.funciones.includes(filtroActivo);
    return coincideTexto && coincideDominio;
  });

  grid.innerHTML = filtradas.map((actividad) => `
    <article class="tarjeta-actividad ${actividad.estado === "Disponible" ? "disponible" : ""}">
      <div class="tarjeta-icono">${actividad.icono}</div>
      <h3>${actividad.nombre}</h3>
      <p>${actividad.descripcion}</p>
      <div class="chips-actividad">
        ${actividad.funciones.map((funcion) => `<span class="chip">${funcion}</span>`).join("")}
      </div>
      <div class="actividad-footer">
        <span class="estado">${actividad.estado}</span>
        <button type="button" data-url="${actividad.url || ""}" data-nombre="${actividad.nombre}">
          ${actividad.accion}
        </button>
      </div>
    </article>
  `).join("");

  sinResultados?.classList.toggle("visible", filtradas.length === 0);

  grid.querySelectorAll("button").forEach((boton) => {
    boton.addEventListener("click", () => {
      if (boton.dataset.url) {
        window.location.href = boton.dataset.url;
        return;
      }
      mostrarToast(`${boton.dataset.nombre} esta preparado para integrarse proximamente.`);
    });
  });
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

let temporizadorToast = null;

function mostrarToast(mensaje) {
  const toast = document.getElementById("toastRehabilitacion");
  if (!toast) return;

  toast.textContent = mensaje;
  toast.classList.add("visible");
  window.clearTimeout(temporizadorToast);
  temporizadorToast = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2800);
}
