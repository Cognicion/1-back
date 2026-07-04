import { auth } from "./firebase.js";
import { ESCALAS_COGNITIVAS } from "./data/escalasCognitivas.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const tamizajes = ESCALAS_COGNITIVAS.map((escala) => ({
  id: escala.id,
  icono: escala.nombre.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(),
  titulo: escala.nombre,
  nombre: escala.subtitulo || escala.area || "Tamizaje cognitivo",
  uso: escala.descripcion,
  evalua: escala.dominiosEvaluados || [],
  requiereInstrumentoOficial: escala.requiereInstrumentoOficial,
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
    estado: "Proximamente",
    accion: "Ver ejercicio"
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
});

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "login.html";
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
        ${item.requiereInstrumentoOficial ? "Captura con instrumento oficial" : "Disponible"}
      </div>
      <h3>${item.titulo}</h3>
      <small>${item.nombre}</small>
      <p>${item.uso}</p>
      <ul>
        ${item.evalua.map((dominio) => `<li>${dominio}</li>`).join("")}
      </ul>
      <p class="texto-tamizaje-mini">${item.poblacionSugerida || "Aplicacion clinica supervisada."}</p>
      <button type="button" data-ficha-tamizaje="${item.id}">Ver ficha</button>
    </article>
  `).join("");

  grid.querySelectorAll("[data-ficha-tamizaje]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const escala = tamizajes.find((item) => item.id === boton.dataset.fichaTamizaje);
      if (!escala) return;
      const aviso = escala.requiereInstrumentoOficial
        ? `${escala.titulo}: usa el instrumento oficial y captura aqui los puntajes por dominio desde nota o expediente.`
        : `${escala.titulo}: disponible para registro clinico desde nota o expediente.`;
      mostrarToast(aviso);
    });
  });
}

function renderizarFiltros() {
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


