import { auth, db, obtenerFunctions } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { guardarSolicitudEliminacion } from "./services/reportes.js?v=20260716-1";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { MEDICAMENTOS } from "./data/medicamentos.js";
import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "./data/escalasPsiquiatricas.js";
import {
  ESCALAS_MEDICINA_GENERAL,
  ESCALAS_PEDIATRICAS_NOTA
} from "./data/escalasMedicinaGeneral.js";
import {
  ESCALAS_COGNITIVAS,
  calcularPuntajeEscalaCognitiva,
  interpretarEscalaCognitiva,
  obtenerPuntajesDominioCognitivo
} from "./data/escalasCognitivas.js";
import {
  PRUEBAS_INTERACTIVAS,
  calcularPuntajePruebaInteractiva,
  interpretarPruebaInteractiva,
  obtenerPruebaInteractiva,
  puntajesDominioPruebaInteractiva
} from "./data/pruebasInteractivas.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { normalizarTextoFrecuencia } from "./utils/frecuencias.js";
import {
  calcularPuntajeEscala,
  crearResumenEscala,
  formatearFechaEscala,
  guardarEscalaAplicada,
  listarEscalasAplicadas,
  obtenerOpcionesItemEscala,
  obtenerPuntajesDominioEscala,
  textoItemEscala
} from "./services/escalas.js?v=20260716-expediente-fix-2";
import {
  aplicarPermisosFormatosSelect,
  obtenerPermisosFormatosUsuario,
  usuarioPuedeUsarFormato
} from "./services/formatosInstitucionales.js?v=20260719-actor-format-permissions";
import { getAuthenticatedUserOnce, getUserProfileOnce } from "./services/authContextService.js";
import {
  eliminarBorradorClinicoLocal,
  guardarBorradorClinicoLocal,
  obtenerBorradorClinicoLocal,
  obtenerTransferenciaClinicaLocal
} from "./services/clinicalLocalStore.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  listarPacientes,
  actualizarUsuario,
  medicoPuedeVer
} from "./services/usuarios.js";

import {
  guardarNota,
  obtenerHistorialNotas,
  actualizarNota,
  guardarBorradorNotaClinica,
  finalizarNotaClinica,
  buscarBorradorNotaClinica
} from "./services/notas.js?v=20260716-2";
import {
  crearDocumentoWordFray,
  nombreSeguroNotaWord
} from "./services/frayDocx.js?v=20260716-1";

import {
  obtenerHistoriaClinica
} from "./services/historias.js";
import { listarEstudios } from "./services/estudios.js";
import { listarTratamientos } from "./services/tratamientos.js";
import { calcularEdadPediatrica, formatearFechaDDMMAAAA } from "./pediatria/edad.js";
import {
  calcularIMC as calcularIMCPediatrico,
  mantenimientoHollidaySegar,
  numero as numeroPediatrico,
  superficieCorporal
} from "./pediatria/formulas.js";

let uidPacienteActual = null;
let diagnosticosSeleccionados = [];
let notaEditandoId = null;
let edicionVersionadaActiva = false;
let modoEdicionNota = null;
let notasHistorial = {};
let notasHistorialOrdenadas = [];
let historiaClinicaActual = {};
let pacienteActualDatos = {};
let uidMedicoActual = "";
let perfilMedicoActual = {};
let rolUsuarioActual = "";
let permisosFormatosActual = {};
let apuntesMedicoCache = [];
let notasFlotantesPacienteCache = [];
let catalogoMedicosFirmasCache = [];
let escalasPreviasNotaCache = [];
let escalasAplicadasPendientesNota = [];
let estadoNotaActual = "nueva";

const NOTE_FIELD_REGISTRY = Object.freeze({
  subjective: {
    fieldId: "subjetivo",
    label: "Subjetivo / Padecimiento actual o evolución"
  },
  physicalExam: {
    fieldId: "obsExploracionFisicaNeurologica",
    label: "Exploración física y neurológica"
  },
  mentalStatusExam: {
    fieldId: "objetivo",
    label: "Examen mental"
  },
  results: {
    fieldId: "obsResultadosEstudios",
    label: "Resultados de estudios"
  },
  analysis: {
    fieldId: "analisis",
    label: "Análisis clínico / comentario"
  },
  plan: {
    fieldId: "plan",
    label: "Plan"
  },
  prognosis: {
    fieldId: "obsPronostico",
    label: "Pronóstico"
  },
  destination: {
    fieldId: "obsDestino",
    label: "Destino"
  }
});
let cambiosNotaPendientes = false;
let inicializacionFlujoNotasCompleta = false;
let temporizadorRespaldoNota = null;
const PREFIJO_RESPALDO_NOTA = "cognicion_respaldo_nota_v1";

const IDS_PRUEBAS_INTERACTIVAS = new Set(PRUEBAS_INTERACTIVAS.map((escala) => escala.id));

function escalaAplicableEnNota(escala = {}) {
  return Boolean(
    escala.interactiva ||
    escala.aplicableEnNota ||
    escala.reactivos?.length ||
    escala.items?.length
  );
}

const ESCALAS_NOTA = [
  ...ESCALAS_PSIQUIATRICAS
    .filter((escala) => !IDS_PRUEBAS_INTERACTIVAS.has(escala.id))
    .map((escala) => ({ ...escala, tipoEscala: "psiquiatrica", interactiva: escalaAplicableEnNota(escala) })),
  ...ESCALAS_MEDICINA_GENERAL.map((escala) => ({
    ...escala,
    tipoEscala: "medicina_general",
    interactiva: escalaAplicableEnNota(escala)
  })),
  ...ESCALAS_PEDIATRICAS_NOTA.map((escala) => ({
    ...escala,
    tipoEscala: "pediatrica",
    pediatrica: true,
    interactiva: escalaAplicableEnNota(escala)
  })),
  ...ESCALAS_COGNITIVAS
    .filter((escala) => !IDS_PRUEBAS_INTERACTIVAS.has(escala.id))
    .map((escala) => ({ ...escala, interactiva: escalaAplicableEnNota(escala) })),
  ...PRUEBAS_INTERACTIVAS.map((escala) => ({
    ...escala,
    tipoEscala: escala.tipoEscala || "cognitiva",
    items: escala.reactivos || escala.items || [],
    interactiva: true
  }))
];
let modoEscalaNota = "interactiva";

iniciarMonitoreoSesion("Nota medica");

const CLAVE_ALTURAS_NOTA = "cognicion_nota_alturas_secciones";
const camposNotaRedimensionables = [
  "tratamiento",
  "notaRapida",
  "subjetivo",
  "obsExploracionFisicaNeurologica",
  "objetivo",
  "obsResultadosEstudios",
  "analisis",
  "plan",
  "obsPronostico"
];

function cargarAlturasNota() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALTURAS_NOTA);
    const datos = guardado ? JSON.parse(guardado) : {};
    return datos && typeof datos === "object" ? datos : {};
  } catch (error) {
    console.warn("No se pudieron cargar las alturas de la nota", error);
    return {};
  }
}

function guardarAlturaNota(clave, altura) {
  const alturas = cargarAlturasNota();
  alturas[clave] = Math.max(80, Math.round(altura));
  localStorage.setItem(CLAVE_ALTURAS_NOTA, JSON.stringify(alturas));
}

function guardarEstadoSeccionNota(clave, cambios = {}) {
  const alturas = cargarAlturasNota();
  alturas[clave] = {
    ...(typeof alturas[clave] === "object" ? alturas[clave] : { altura: alturas[clave] }),
    ...cambios
  };
  localStorage.setItem(CLAVE_ALTURAS_NOTA, JSON.stringify(alturas));
}

function alturaGuardadaSeccion(valor) {
  if (typeof valor === "number") return valor;
  if (valor && typeof valor === "object") return valor.altura;
  return null;
}

function estaContraidaSeccion(valor) {
  return Boolean(valor && typeof valor === "object" && valor.contraida);
}

function aplicarAlturaSeccionNota(clave, objetivo, altura, minimo = 80) {
  const alto = Math.max(minimo, Math.round(altura));
  objetivo.style.height = `${alto}px`;
  guardarEstadoSeccionNota(clave, { altura: alto, contraida: false });
  objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable")?.classList.remove("seccion-contraida");
}

function alternarContraerSeccionNota(clave, objetivo, minimo = 80) {
  const contenedor = objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable");
  const contraida = !contenedor?.classList.contains("seccion-contraida");
  if (contraida) {
    guardarEstadoSeccionNota(clave, {
      altura: Math.max(minimo, Math.round(objetivo.getBoundingClientRect().height)),
      contraida: true
    });
    objetivo.style.height = `${minimo}px`;
    contenedor?.classList.add("seccion-contraida");
    return;
  }

  const estado = cargarAlturasNota()[clave];
  aplicarAlturaSeccionNota(clave, objetivo, alturaGuardadaSeccion(estado) || 130, minimo);
}

const CLAVE_TRANSFERENCIA_INDICACIONES = "cognicion_indicaciones_generadas_ultimo";

async function indicacionesGeneradasGuardadasNota() {
  try {
    const pacienteId = uidPacienteActual || document.getElementById("uidPaciente")?.value || "";
    const guardado = await obtenerTransferenciaClinicaLocal(CLAVE_TRANSFERENCIA_INDICACIONES, { consumir: false });
    if (guardado?.pacienteId && pacienteId && guardado.pacienteId !== pacienteId) return "";
    if (guardado?.texto) return String(guardado.texto || "").trim();

    const legado = JSON.parse(localStorage.getItem(CLAVE_TRANSFERENCIA_INDICACIONES) || "{}");
    localStorage.removeItem(CLAVE_TRANSFERENCIA_INDICACIONES);
    if (legado.pacienteId && pacienteId && legado.pacienteId !== pacienteId) return "";
    return String(legado.texto || "").trim();
  } catch (error) {
    console.warn("No se pudieron leer las indicaciones generadas:", error?.name || "error");
    return "";
  }
}

async function obtenerIndicacionesGeneradasActuales() {
  const campoVisible = document.getElementById("indicacionesTexto");
  if (campoVisible) return String(campoVisible.value || campoVisible.textContent || "").trim();
  return indicacionesGeneradasGuardadasNota();
}

async function asignarTextoCampoNotaDesdeIndicaciones(idCampo, etiquetaCampo) {
  const texto = await obtenerIndicacionesGeneradasActuales();
  if (!texto) {
    alert("No hay indicaciones generadas para actualizar.");
    return;
  }

  const campo = document.getElementById(idCampo);
  if (!campo) {
    console.error(`No se encontró el campo ${etiquetaCampo}.`);
    return;
  }

  campo.value = texto;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  campo.dispatchEvent(new Event("change", { bubbles: true }));
  marcarCambiosNotaPendientes();
  guardarRespaldoTemporalNota();
}

function actualizarPlanDesdeIndicaciones() {
  asignarTextoCampoNotaDesdeIndicaciones("plan", "Plan");
}

function actualizarTratamientoDesdeIndicaciones() {
  asignarTextoCampoNotaDesdeIndicaciones("tratamiento", "Tratamiento e indicaciones");
}

function claveCatalogoPronosticosNota() {
  return `cognicion_catalogo_pronosticos:${uidMedicoActual || auth.currentUser?.uid || "sin_usuario"}`;
}

function cargarCatalogoPronosticosNota() {
  try {
    const datos = JSON.parse(localStorage.getItem(claveCatalogoPronosticosNota()) || "[]");
    return Array.isArray(datos) ? datos.filter((item) => String(item || "").trim()) : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo de pronosticos:", error);
    return [];
  }
}

function guardarCatalogoPronosticosNota(catalogo = []) {
  localStorage.setItem(claveCatalogoPronosticosNota(), JSON.stringify(catalogo));
}

function normalizarPronosticoCatalogo(texto = "") {
  return String(texto || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asignarPronosticoNota(texto = "") {
  const campo = document.getElementById("obsPronostico");
  if (!campo) return;
  campo.value = texto;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  campo.dispatchEvent(new Event("change", { bubbles: true }));
  marcarCambiosNotaPendientes();
  guardarRespaldoTemporalNota();
}

function agregarPronosticoActualAlCatalogo() {
  const texto = String(document.getElementById("obsPronostico")?.value || "").trim();
  if (!texto) {
    alert("Escribe un pronostico antes de agregarlo.");
    return;
  }

  const catalogo = cargarCatalogoPronosticosNota();
  const clave = normalizarPronosticoCatalogo(texto);
  const existe = catalogo.some((item) => normalizarPronosticoCatalogo(item) === clave);
  if (existe) {
    alert("Este pronostico ya existe en el catalogo.");
    return;
  }

  guardarCatalogoPronosticosNota([texto, ...catalogo]);
  alert("Pronostico agregado al catalogo.");
}

function renderizarListaCatalogoPronosticos(modal) {
  const lista = modal.querySelector("[data-lista-pronosticos]");
  const busqueda = normalizarPronosticoCatalogo(modal.querySelector("[data-buscar-pronostico]")?.value || "");
  const catalogo = cargarCatalogoPronosticosNota()
    .filter((texto) => !busqueda || normalizarPronosticoCatalogo(texto).includes(busqueda));

  if (!lista) return;
  lista.innerHTML = catalogo.length
    ? catalogo.map((texto, index) => `
      <button type="button" data-pronostico-index="${index}">
        ${escaparHTML(texto)}
      </button>
    `).join("")
    : "<p>Sin pronosticos guardados.</p>";

  lista.querySelectorAll("[data-pronostico-index]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const texto = catalogo[Number(boton.dataset.pronosticoIndex)] || "";
      asignarPronosticoNota(texto);
      modal.remove();
      alert("Pronostico insertado.");
    });
  });
}

function abrirCatalogoPronosticos() {
  document.getElementById("modalCatalogoPronosticos")?.remove();
  const modal = document.createElement("div");
  modal.id = "modalCatalogoPronosticos";
  modal.className = "modal-catalogo-pronosticos";
  modal.innerHTML = `
    <div class="panel-catalogo-pronosticos" role="dialog" aria-modal="true" aria-labelledby="tituloCatalogoPronosticos">
      <div class="panel-catalogo-pronosticos-header">
        <h3 id="tituloCatalogoPronosticos">Elegir pronostico</h3>
        <button type="button" data-cerrar-catalogo-pronosticos aria-label="Cerrar">×</button>
      </div>
      <input data-buscar-pronostico placeholder="Buscar pronostico">
      <div class="lista-catalogo-pronosticos" data-lista-pronosticos></div>
    </div>
  `;
  document.body.appendChild(modal);
  renderizarListaCatalogoPronosticos(modal);
  modal.querySelector("[data-cerrar-catalogo-pronosticos]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-buscar-pronostico]")?.addEventListener("input", () => renderizarListaCatalogoPronosticos(modal));
  modal.addEventListener("click", (evento) => {
    if (evento.target === modal) modal.remove();
  });
}

function crearControlesTactilesSeccion(clave, objetivo, minimo = 80, alturaBase = 130) {
  const controles = document.createElement("div");
  controles.className = "controles-tamano-nota";
  controles.innerHTML = `
    <button type="button" data-accion="menos" title="Hacer mas pequeno">-</button>
    <button type="button" data-accion="mas" title="Hacer mas grande">+</button>
    <button type="button" data-accion="contraer" title="Contraer o expandir">Contraer</button>
    <button type="button" data-accion="reiniciar" title="Restablecer tamano">Reiniciar</button>
    ${clave === "campo:plan" ? '<button type="button" data-accion="actualizar-plan-indicaciones" title="Actualizar Plan desde indicaciones">Actualizar texto</button>' : ""}
    ${clave === "campo:tratamiento" ? '<button type="button" data-accion="actualizar-tratamiento-indicaciones" title="Actualizar tratamiento e indicaciones">Actualizar texto</button>' : ""}
    ${clave === "campo:obsPronostico" ? '<button type="button" data-accion="elegir-pronostico" title="Elegir pronostico">Elegir pronostico</button><button type="button" data-accion="agregar-pronostico" title="Agregar pronostico al catalogo">Agregar al catalogo</button>' : ""}
  `;

  controles.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button");
    if (!boton) return;
    const actual = objetivo.getBoundingClientRect().height;
    const accion = boton.dataset.accion;

    if (accion === "menos") aplicarAlturaSeccionNota(clave, objetivo, actual - 48, minimo);
    if (accion === "mas") aplicarAlturaSeccionNota(clave, objetivo, actual + 48, minimo);
    if (accion === "contraer") alternarContraerSeccionNota(clave, objetivo, minimo);
    if (accion === "reiniciar") aplicarAlturaSeccionNota(clave, objetivo, alturaBase, minimo);
    if (accion === "actualizar-plan-indicaciones") actualizarPlanDesdeIndicaciones();
    if (accion === "actualizar-tratamiento-indicaciones") actualizarTratamientoDesdeIndicaciones();
    if (accion === "agregar-pronostico") agregarPronosticoActualAlCatalogo();
    if (accion === "elegir-pronostico") abrirCatalogoPronosticos();
  });

  return controles;
}

function crearSeparadorVertical(clave, objetivo, minimo = 80) {
  const separador = document.createElement("div");
  separador.className = "separador-vertical-nota";
  separador.setAttribute("role", "separator");
  separador.setAttribute("aria-orientation", "horizontal");
  separador.title = "Arrastrar para ajustar altura";

  separador.addEventListener("pointerdown", (evento) => {
    evento.preventDefault();
    const inicioY = evento.clientY;
    const altoInicial = objetivo.getBoundingClientRect().height;
    separador.setPointerCapture(evento.pointerId);
    document.body.classList.add("ajustando-seccion-nota");

    const mover = (movimiento) => {
      const nuevoAlto = Math.max(minimo, altoInicial + movimiento.clientY - inicioY);
      objetivo.style.height = `${nuevoAlto}px`;
      objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable")?.classList.remove("seccion-contraida");
    };

    const terminar = (final) => {
      guardarEstadoSeccionNota(clave, {
        altura: objetivo.getBoundingClientRect().height,
        contraida: false
      });
      document.body.classList.remove("ajustando-seccion-nota");
      separador.releasePointerCapture(final.pointerId);
      separador.removeEventListener("pointermove", mover);
      separador.removeEventListener("pointerup", terminar);
      separador.removeEventListener("pointercancel", terminar);
    };

    separador.addEventListener("pointermove", mover);
    separador.addEventListener("pointerup", terminar);
    separador.addEventListener("pointercancel", terminar);
  });

  return separador;
}

function envolverCampoRedimensionable(campo, clave, alturaGuardada) {
  if (!campo || campo.closest(".seccion-nota-redimensionable")) return;

  const etiqueta = campo.previousElementSibling?.tagName === "LABEL"
    ? campo.previousElementSibling
    : null;
  const seccion = document.createElement("section");
  seccion.className = "seccion-nota-redimensionable";
  seccion.dataset.seccionNota = clave;

  const referencia = etiqueta || campo;
  referencia.parentNode.insertBefore(seccion, referencia);
  if (etiqueta) seccion.appendChild(etiqueta);
  seccion.appendChild(crearControlesTactilesSeccion(clave, campo, 80, 130));
  seccion.appendChild(campo);

  const altura = alturaGuardadaSeccion(alturaGuardada);
  if (altura) campo.style.height = `${altura}px`;
  if (estaContraidaSeccion(alturaGuardada)) {
    seccion.classList.add("seccion-contraida");
    campo.style.height = "80px";
  }
  seccion.appendChild(crearSeparadorVertical(clave, campo, 80));
}

function prepararPanelRedimensionable(panel, clave, alturaGuardada) {
  if (!panel || panel.dataset.redimensionNota === "true") return;
  panel.dataset.redimensionNota = "true";
  panel.classList.add("panel-nota-redimensionable");

  panel.appendChild(crearControlesTactilesSeccion(clave, panel, 110, 180));
  const altura = alturaGuardadaSeccion(alturaGuardada);
  if (altura) panel.style.height = `${altura}px`;
  if (estaContraidaSeccion(alturaGuardada)) {
    panel.classList.add("seccion-contraida");
    panel.style.height = "110px";
  }
  panel.appendChild(crearSeparadorVertical(clave, panel, 110));
}

function configurarSeccionesRedimensionablesNota() {
  const alturas = cargarAlturasNota();

  camposNotaRedimensionables.forEach((id) => {
    envolverCampoRedimensionable(
      document.getElementById(id),
      `campo:${id}`,
      alturas[`campo:${id}`]
    );
  });

  document.querySelectorAll("#bloqueObservacionFray > .observacion-seccion, #bloqueObservacionFray > details.observacion-seccion")
    .forEach((panel, index) => prepararPanelRedimensionable(panel, `observacion:${index}`, alturas[`observacion:${index}`]));

  prepararPanelRedimensionable(
    document.querySelector("#bloqueNotaCompleta .tabla-diagnosticos"),
    "panel:diagnosticos-cie10",
    alturas["panel:diagnosticos-cie10"]
  );
}

const buscadorDiagnostico = document.getElementById("buscadorDiagnostico");
const resultadosCIE10 = document.getElementById("resultadosCIE10");
const cie10Codigo = document.getElementById("cie10Codigo");
const cie10Nombre = document.getElementById("cie10Nombre");
const buscadorCIE10 = document.getElementById("buscadorCIE10");
const buscadorCIE11 = document.getElementById("buscadorCIE11");
const resultadosCIE10Lista = document.getElementById("resultadosCIE10Lista");
const resultadosCIE11Lista = document.getElementById("resultadosCIE11Lista");
const diagnosticoCatalogoVisible = document.getElementById("diagnosticoCatalogoVisible");
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";
let catalogoManualDiagnosticos = cargarCatalogoManualDiagnosticos();

function cargarCatalogoManualDiagnosticos() {
  try {
    const guardado = localStorage.getItem(CLAVE_CATALOGO_MANUAL);
    const datos = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo manual de diagnosticos", error);
    return [];
  }
}

function guardarCatalogoManualDiagnosticos() {
  localStorage.setItem(CLAVE_CATALOGO_MANUAL, JSON.stringify(catalogoManualDiagnosticos));
}

function catalogoManualPorTipo(nombreCatalogo) {
  return catalogoManualDiagnosticos.filter((dx) => dx.catalogo === nombreCatalogo);
}

function catalogoDiagnosticosCombinado() {
  return [
    ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
    ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" })),
    ...catalogoManualDiagnosticos
  ];
}

function configurarBuscadorCatalogo(input, contenedor, catalogo, nombreCatalogo) {
  if (!input || !contenedor) return;

  input.addEventListener("input", () => {
    const texto = input.value.toLowerCase().trim();
    contenedor.innerHTML = "";

    if (texto.length < 2) return;

    [...catalogo, ...catalogoManualPorTipo(nombreCatalogo)]
      .filter((dx) =>
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      )
      .slice(0, 10)
      .forEach((dx) => {
        const item = document.createElement("div");
        item.classList.add("resultado-cie10");
        const etiquetaManual = dx.agregadoManual
          ? `<em class="diagnostico-manual-badge">Agregado manualmente</em>`
          : "";
        item.innerHTML = `<strong>${dx.codigo}</strong> <span>${nombreCatalogo}</span> ${etiquetaManual} - ${dx.nombre}`;
        item.addEventListener("click", () => {
          agregarDiagnostico({ ...dx, catalogo: nombreCatalogo });
          input.value = "";
          contenedor.innerHTML = "";
        });
        contenedor.appendChild(item);
      });
  });
}

configurarBuscadorCatalogo(buscadorCIE10, resultadosCIE10Lista, CIE10, "CIE-10");
configurarBuscadorCatalogo(buscadorCIE11, resultadosCIE11Lista, CIE11, "CIE-11");

if (buscadorDiagnostico && resultadosCIE10 && cie10Codigo && cie10Nombre) {
  buscadorDiagnostico.addEventListener("input", () => {
    const texto = buscadorDiagnostico.value.toLowerCase().trim();

    resultadosCIE10.innerHTML = "";

    if (texto.length < 2) return;

    const resultados = catalogoDiagnosticosCombinado().filter((dx) => {
      return (
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      );
    }).slice(0, 10);

    resultados.forEach((dx) => {
      const item = document.createElement("div");
      item.classList.add("resultado-cie10");
      const etiquetaManual = dx.agregadoManual
        ? `<em class="diagnostico-manual-badge">Agregado manualmente</em>`
        : "";

      item.innerHTML = `
        <strong>${dx.codigo}</strong> <span>${dx.catalogo}</span> ${etiquetaManual} - ${dx.nombre}
      `;

      item.addEventListener("click", () => {
        agregarDiagnostico(dx);
        buscadorDiagnostico.value = "";
        resultadosCIE10.innerHTML = "";
      });

      resultadosCIE10.appendChild(item);
    });
  });
}

const buscadorMedicamento = document.getElementById("buscadorMedicamento");
const resultadosMedicamentos = document.getElementById("resultadosMedicamentos");

if (buscadorMedicamento && resultadosMedicamentos) {
  buscadorMedicamento.addEventListener("input", () => {
    const texto = buscadorMedicamento.value.toLowerCase().trim();
    resultadosMedicamentos.innerHTML = "";

    if (texto.length < 2) return;

    MEDICAMENTOS.filter((med) =>
      med.nombre.toLowerCase().includes(texto) ||
      med.clase.toLowerCase().includes(texto)
    ).slice(0, 10).forEach((med) => {
      const item = document.createElement("div");
      item.className = "resultado-cie10";
      item.innerHTML = `<strong>${med.nombre}</strong> - ${med.clase}<br><small>${med.dosisHabitual} | ${med.notas}</small>`;
      item.addEventListener("click", () => {
        const tratamiento = document.getElementById("tratamiento");
        const textoMed = `${med.nombre} (${med.clase}) - ${med.dosisHabitual}. ${med.notas}`;
        tratamiento.value = tratamiento.value
          ? `${tratamiento.value}\n${textoMed}`
          : textoMed;
        buscadorMedicamento.value = "";
        resultadosMedicamentos.innerHTML = "";
      });
      resultadosMedicamentos.appendChild(item);
    });
  });

  sincronizarDiagnosticosObservacion();
}

function configurarPanelEscalaNota() {
  const selector = document.getElementById("selectorEscalaNota");
  const botonGuardar = document.getElementById("guardarEscalaNota");
  const botonPrevias = document.getElementById("abrirEscalasPreviasNota");
  const botonCerrarPrevias = document.getElementById("cerrarEscalasPreviasNota");
  const buscadorPrevias = document.getElementById("buscarEscalasPreviasNota");
  document.getElementById("filtroTipoEscalaNota")?.addEventListener("change", renderizarOpcionesEscalasNota);
  document.getElementById("buscarEscalaNota")?.addEventListener("input", renderizarOpcionesEscalasNota);
  const filtroPrevias = document.getElementById("filtrarEscalasPreviasNota");

  if (!selector) return;

  renderizarOpcionesEscalasNota();

  selector.addEventListener("change", () => {
    const escala = escalaNotaActual();
    modoEscalaNota = escala?.interactiva ? "interactiva" : "manual";
    renderizarEscalaNotaSeleccionada();
  });
  document.querySelectorAll("[data-modo-escala-nota]").forEach((boton) => {
    boton.addEventListener("click", () => cambiarModoEscalaNota(boton.dataset.modoEscalaNota));
  });
  botonGuardar?.addEventListener("click", guardarEscalaDesdeNota);
  botonPrevias?.addEventListener("click", abrirPanelEscalasPreviasNota);
  botonCerrarPrevias?.addEventListener("click", cerrarPanelEscalasPreviasNota);
  buscadorPrevias?.addEventListener("input", renderizarEscalasPreviasNota);
  filtroPrevias?.addEventListener("change", renderizarEscalasPreviasNota);
  renderizarEscalaNotaSeleccionada();
}

function pacienteNotaEsPediatrico() {
  const edad = calcularEdadPediatrica(fechaNacimientoPacienteNota());
  return Boolean(edad && edad.años < 18);
}

function htmlGrupoEscalasNota(etiqueta, escalas) {
  if (!escalas.length) return "";
  return `
    <optgroup label="${escaparHTML(etiqueta)}">
      ${escalas.map((escala) => {
        const subtitulo = escala.area || escala.subtitulo || escala.tipoEscala || "Clínica";
        return `<option value="${escaparHTML(escala.id)}">${escaparHTML(escala.nombre)} - ${escaparHTML(subtitulo)}</option>`;
      }).join("")}
    </optgroup>
  `;
}

function renderizarOpcionesEscalasNota() {
  const selector = document.getElementById("selectorEscalaNota");
  if (!selector) return;

  const seleccionPrevia = selector.value;
  const filtroTipo = document.getElementById("filtroTipoEscalaNota")?.value || "todas";
  const busqueda = normalizarTextoBusqueda(document.getElementById("buscarEscalaNota")?.value || "");
  const filtrarEscala = (escala) => {
    if (busqueda) {
      const texto = normalizarTextoBusqueda([
        escala.nombre,
        escala.subtitulo,
        escala.area,
        escala.tipoEscala,
        escala.descripcionClinica
      ].filter(Boolean).join(" "));
      if (!texto.includes(busqueda)) return false;
    }

    if (filtroTipo === "todas") return true;
    if (filtroTipo === "cardiologia") return normalizarTextoBusqueda(escala.area || "").includes("cardio") || normalizarTextoBusqueda(escala.nombre || "").includes("cardio");
    if (filtroTipo === "cognitiva") return esEscalaCognitivaNota(escala);
    return escala.tipoEscala === filtroTipo;
  };

  const escalasPsiquiatricasNota = ESCALAS_NOTA.filter((escala) => escala.tipoEscala === "psiquiatrica" && filtrarEscala(escala));
  const escalasMedicinaNota = ESCALAS_NOTA.filter((escala) => escala.tipoEscala === "medicina_general" && filtrarEscala(escala));
  const escalasPediatricasNota = pacienteNotaEsPediatrico()
    ? ESCALAS_NOTA.filter((escala) => escala.tipoEscala === "pediatrica" && filtrarEscala(escala))
    : [];
  const escalasCognitivasNota = ESCALAS_NOTA.filter((escala) => esEscalaCognitivaNota(escala) && filtrarEscala(escala));

  selector.innerHTML = [
    htmlGrupoEscalasNota("Escalas clínicas", escalasPsiquiatricasNota),
    htmlGrupoEscalasNota("Medicina general", escalasMedicinaNota),
    htmlGrupoEscalasNota("Escalas pediátricas", escalasPediatricasNota),
    htmlGrupoEscalasNota("Escalas y tamizajes cognitivos", escalasCognitivasNota)
  ].join("");

  const idsDisponibles = [...selector.options].map((opcion) => opcion.value);
  selector.value = idsDisponibles.includes(seleccionPrevia)
    ? seleccionPrevia
    : selector.options[0]?.value || "";

  const escala = escalaNotaActual();
  modoEscalaNota = escala?.interactiva ? "interactiva" : "manual";
}

function escalaNotaActual() {
  const id = document.getElementById("selectorEscalaNota")?.value;
  return ESCALAS_NOTA.find((escala) => escala.id === id) || ESCALAS_NOTA[0];
}

function esEscalaCognitivaNota(escala = {}) {
  return escala.tipoEscala === "cognitiva" || escala.area === "Cognitiva";
}

function cambiarModoEscalaNota(modo) {
  const escala = escalaNotaActual();
  if (modo === "interactiva" && !escalaAplicableEnNota(escala)) {
    alert("Esta escala no tiene reactivos configurados para aplicarse dentro de la nota.");
    return;
  }
  modoEscalaNota = modo === "manual" ? "manual" : "interactiva";
  renderizarEscalaNotaSeleccionada();
}

function actualizarModoEscalaNota() {
  const escala = escalaNotaActual();
  const aplicable = escalaAplicableEnNota(escala);
  if (!aplicable) modoEscalaNota = "manual";
  document.querySelectorAll("[data-modo-escala-nota]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.modoEscalaNota === modoEscalaNota);
  });
  document.getElementById("modoAplicarEscalaNota")?.toggleAttribute("disabled", !aplicable);
}

function itemsEscalaNota(escala = {}) {
  return modoEscalaNota === "interactiva" ? escala.reactivos || escala.items || [] : escala.items || escala.reactivos || [];
}

function renderizarEscalaNotaSeleccionada() {
  const escala = escalaNotaActual();
  const descripcion = document.getElementById("descripcionEscalaNota");
  const items = document.getElementById("itemsEscalaNota");
  if (!escala || !descripcion || !items) return;
  actualizarModoEscalaNota();

  const intro = escala.introduccion || escala.instrucciones
    ? `<p>${escaparHTML(escala.introduccion || escala.instrucciones)}</p>`
    : "";
  const pasos = escala.pasos?.length
    ? `<div class="guia-escala-nota"><strong>Guía de aplicación</strong><ol>${escala.pasos.map((paso) => `<li>${escaparHTML(paso)}</li>`).join("")}</ol></div>`
    : "";
  const temporizador = escala.duracionSegundos
    ? `<div class="temporizador-escala-nota"><span data-tiempo-escala-nota>${escala.duracionSegundos}</span>s <button type="button" data-iniciar-temporizador-escala-nota>Iniciar temporizador</button></div>`
    : "";
  const estimulo = escala.estimulo ? `<p class="estimulo-escala-nota">${escaparHTML(escala.estimulo)}</p>` : "";
  const limitaciones = escala.limitaciones
    ? `<p class="advertencia-escala-nota">${escaparHTML(escala.limitaciones)}</p>`
    : "";
  const oficial = escala.requiereInstrumentoOficial
    ? `<p class="advertencia-escala-nota">Este instrumento requiere material oficial o aplicación clínica supervisada. Cognición guía la aplicación/captura sin reproducir contenido protegido.</p>`
    : "";
  const consideraciones = Array.isArray(escala.consideraciones) && escala.consideraciones.length
    ? `<div class="consideraciones-escala-nota"><strong>Consideraciones clínicas</strong><ul>${escala.consideraciones.map((item) => `<li>${escaparHTML(item)}</li>`).join("")}</ul></div>`
    : "";

  descripcion.innerHTML = `
    <strong>${escaparHTML(escala.nombre)}</strong> - ${escaparHTML(escala.subtitulo || escala.area || "")}
    <br>${escaparHTML(escala.descripcion || "")}
    <br><small>Modo: ${modoEscalaNota === "manual" ? "Capturar resultado previo" : "Aplicar prueba ahora"}. Rango: ${escaparHTML(escala.rango || "")}. Resultado integrado al expediente.</small>
    ${intro}
    ${oficial}
    ${limitaciones}
    ${pasos}
    ${estimulo}
    ${temporizador}
    ${consideraciones}
  `;
  window.setTimeout(configurarTemporizadorEscalaNota, 0);

  const reactivos = itemsEscalaNota(escala);
  if (!reactivos.length) {
    items.innerHTML = "<p class=\"texto-suave\">Esta escala aún no tiene reactivos configurados. Usa captura de resultado previo.</p>";
    return;
  }
  items.innerHTML = reactivos.map((item, index) => {
    if (item.tipo === "numero") {
      return `
        <div class="item-escala-nota">
          <label>${index + 1}. ${escaparHTML(textoItemEscala(item))}
            <input data-item-escala-nota="${index}" type="number" min="${item.min !== undefined ? item.min : ""}" max="${item.max !== undefined ? item.max : ""}" step="${item.step || 1}" placeholder="${item.min !== undefined ? item.min : ""}-${item.max !== undefined ? item.max : ""}">
          </label>
          <small>${escaparHTML(item.dominio || "")}${item.max !== undefined ? ` - Máximo ${escaparHTML(item.max)}` : ""}${item.ayuda ? ` - ${escaparHTML(item.ayuda)}` : ""}</small>
        </div>
      `;
    }

    const opciones = obtenerOpcionesEscalaNota(escala, item);
    return `
      <div class="item-escala-nota">
        <label>${index + 1}. ${escaparHTML(textoItemEscala(item))}
          <select data-item-escala-nota="${index}">
            <option value="">Seleccionar</option>
            ${opciones.map((opcion) => `<option value="${escaparHTML(opcion.valor)}">${escaparHTML(opcion.texto)}${opcion.texto.includes("(") ? "" : ` (${escaparHTML(opcion.valor)})`}</option>`).join("")}
          </select>
        </label>
        <small>${escaparHTML(item.dominio || "")}</small>
      </div>
    `;
  }).join("");
}

function obtenerOpcionesEscalaNota(escala, item) {
  if (Array.isArray(item.opciones) && item.opciones.length) {
    return item.opciones.map((opcion, opcionIndex) => {
      if (typeof opcion === "object") return {
        texto: opcion.texto ? String(opcion.texto) : String(opcionIndex),
        valor: Number(opcion.valor !== undefined ? opcion.valor : opcionIndex)
      };
      return { texto: String(opcion), valor: Number(item.valores?.[opcionIndex] ? opcionIndex : opcion) };
    });
  }
  return obtenerOpcionesItemEscala(escala, item);
}

function configurarTemporizadorEscalaNota() {
  const boton = document.querySelector("[data-iniciar-temporizador-escala-nota]");
  const etiqueta = document.querySelector("[data-tiempo-escala-nota]");
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

async function guardarEscalaDesdeNota() {
  const selectorPaciente = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selectorPaciente?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente antes de guardar la escala.");
    return;
  }

  const escala = escalaNotaActual();
  if (!escala) return;

  const reactivos = itemsEscalaNota(escala);
  const controles = [...document.querySelectorAll("[data-item-escala-nota]")];
  const respuestas = controles.map((control, index) => {
    const item = reactivos[index];
    const valor = control.value === "" ? null : Number(control.value);
    const respuesta = control.tagName === "SELECT"
      ? control.options[control.selectedIndex]?.textContent || ""
      : control.value;

    return {
      item: textoItemEscala(item),
      dominio: item?.dominio || "",
      valor,
      respuesta
    };
  });

  if (respuestas.some((respuesta) => respuesta.valor === null)) {
    alert("Responde todos los reactivos de la escala.");
    return;
  }

  const esInteractiva = modoEscalaNota === "interactiva" && Boolean(obtenerPruebaInteractiva(escala.id));
  const esCognitiva = esEscalaCognitivaNota(escala);
  const fueraDeRango = respuestas.some((respuesta, index) => {
    const item = reactivos[index] || {};
    if (item.tipo !== "numero") return false;
    if (item.min !== undefined && respuesta.valor < item.min) return true;
    if (item.max !== undefined && respuesta.valor > item.max) return true;
    return false;
  });

  if (fueraDeRango) {
    alert("Revisa los puntajes: hay valores fuera del rango permitido para la escala.");
    return;
  }

  const puntaje = esInteractiva
    ? calcularPuntajePruebaInteractiva(escala, respuestas)
    : esCognitiva
      ? calcularPuntajeEscalaCognitiva(escala, respuestas)
      : calcularPuntajeEscala(respuestas);
  const interpretacion = esInteractiva
    ? interpretarPruebaInteractiva(escala, puntaje)
    : esCognitiva
      ? interpretarEscalaCognitiva(escala, puntaje, respuestas)
      : interpretarEscala(escala, puntaje);
  const puntajesPorDominio = esInteractiva
    ? puntajesDominioPruebaInteractiva(respuestas)
    : esCognitiva
      ? obtenerPuntajesDominioCognitivo(respuestas)
      : obtenerPuntajesDominioEscala(respuestas);
  const usuario = auth.currentUser;
  const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
  const pacienteActual = await obtenerUsuario(uidPaciente);
  const observaciones = document.getElementById("observacionesEscalaNota")?.value?.trim() || "";
  const idEscalaAplicada = doc(collection(db, "usuarios", uidPaciente, "escalasAplicadas")).id;
  const fechaAplicacion = new Date().toISOString();

  await guardarEscalaAplicada(uidPaciente, {
    idEscalaAplicada,
    escalaId: escala.id,
    uidMedico: usuario?.uid || "",
    uidProfesional: usuario?.uid || "",
    rolProfesional: medicoActual?.rol || "",
    nombrePaciente: obtenerNombrePacienteParaMostrar(pacienteActual || {}) || "",
    nombreEscala: escala.nombre,
    tipoEscala: esCognitiva ? "cognitiva" : escala.tipoEscala || escala.area,
    fechaAplicacion,
    origen: "nota_clinica",
    modoAplicacion: esInteractiva ? "aplicacion_interactiva" : "captura_resultado_previo",
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo ? escala.puntajeMaximo : "",
    dominiosEvaluados: escala.dominiosEvaluados || [],
    puntajesPorDominio,
    rango: escala.rango,
    interpretacion,
    respuestasPorItem: respuestas,
    observaciones,
    observacionesClinicas: observaciones,
    observacionesOpcionales: observaciones,
    recomendaciones: esCognitiva ? generarRecomendacionesCognitivas(puntajesPorDominio, escala) : "",
    idNota: notaEditandoId || "",
    medicoNombre: medicoActual?.nombre || usuario?.email || "",
    aplicadoPorMedico: true,
    visiblePaciente: false,
    visibilidadPaciente: false,
    visibleDesdePaciente: false,
  });

  if (!notaEditandoId) {
    escalasAplicadasPendientesNota.push(idEscalaAplicada);
  }

  insertarResumenEscalaEnNota(crearResumenEscala({
    idEscalaAplicada,
    nombreEscala: escala.nombre,
    fechaAplicacion,
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo ? escala.puntajeMaximo : "",
    interpretacion,
    observaciones
  }), idEscalaAplicada);

  await registrarEventoAuditoria({
    accion: "guardar_escala_desde_nota",
    modulo: "Nota medica",
    descripcion: "El medico aplico una escala clinica desde la nota.",
    usuarioUid: usuario?.uid || "",
    usuarioNombre: medicoActual?.nombre || usuario?.email || "",
    usuarioRol: medicoActual?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: obtenerNombrePacienteParaMostrar(pacienteActual || {}) || "",
    exito: true,
    detalles: {
      escalaId: escala.id,
      escalaNombre: escala.nombre,
      puntaje,
      interpretacion
    }
  });

  alert(`Escala guardada: ${escala.nombre} = ${puntaje} (${interpretacion})`);
  renderizarEscalaNotaSeleccionada();
  const observacionesCampo = document.getElementById("observacionesEscalaNota");
  if (observacionesCampo) observacionesCampo.value = "";
}

function generarRecomendacionesCognitivas(puntajesPorDominio = {}, escala = {}) {
  const respuestas = [];
  const dominios = Object.keys(puntajesPorDominio);

  if (dominios.some((dominio) => /atencion/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de atencion sostenida/selectiva y velocidad de respuesta.");
  }
  if (dominios.some((dominio) => /memoria|recuerdo/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de memoria de trabajo, aprendizaje verbal y evocacion.");
  }
  if (dominios.some((dominio) => /ejecutiv|flexibilidad|inhib/i.test(dominio))) {
    respuestas.push("Considerar tareas de planificacion, flexibilidad cognitiva e inhibicion.");
  }
  if (dominios.some((dominio) => /visuo|reloj|espacial/i.test(dominio))) {
    respuestas.push("Considerar tareas visuoespaciales, copia, rutas visuales y organizacion perceptual.");
  }
  if (dominios.some((dominio) => /lenguaje|fluencia/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de fluidez verbal, denominacion y acceso lexico.");
  }

  respuestas.push(`Recomendacion orientativa basada en ${escala.nombre || "tamizaje cognitivo"}; integrar con entrevista y valoracion clinica.`);
  return respuestas.join(" ");
}

function insertarResumenEscalaEnNota(resumen, idEscalaAplicada = "") {
  const campoAnalisis = document.getElementById("analisis");
  if (!campoAnalisis || !resumen) return;

  if (campoAnalisis.value.includes(resumen)) return;

  campoAnalisis.value = [campoAnalisis.value.trim(), resumen].filter(Boolean).join("\n\n");
}

async function vincularEscalasPendientesANota(uidPaciente, idNota) {
  if (!uidPaciente || !idNota || !escalasAplicadasPendientesNota.length) return;

  const idsUnicos = [...new Set(escalasAplicadasPendientesNota)];
  await Promise.all(idsUnicos.flatMap((idEscalaAplicada) => [
    setDoc(doc(db, "usuarios", uidPaciente, "escalasAplicadas", idEscalaAplicada), { idNota }, { merge: true }),
    setDoc(doc(db, "usuarios", uidPaciente, "resultadosEscalas", idEscalaAplicada), { idNota }, { merge: true })
  ]));

  escalasAplicadasPendientesNota = [];
}

async function abrirPanelEscalasPreviasNota() {
  const selectorPaciente = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selectorPaciente?.value;
  const panel = document.getElementById("panelEscalasPreviasNota");
  const lista = document.getElementById("listaEscalasPreviasNota");
  if (!panel || !lista) return;

  panel.classList.add("abierto");
  panel.setAttribute("aria-hidden", "false");
  lista.textContent = "Cargando escalas previas...";

  if (!uidPaciente) {
    lista.textContent = "Selecciona un paciente para consultar escalas previas.";
    return;
  }

  escalasPreviasNotaCache = await listarEscalasAplicadas(uidPaciente, 80);
  poblarFiltroEscalasPreviasNota();
  renderizarEscalasPreviasNota();
}

function cerrarPanelEscalasPreviasNota() {
  const panel = document.getElementById("panelEscalasPreviasNota");
  if (!panel) return;
  panel.classList.remove("abierto");
  panel.setAttribute("aria-hidden", "true");
}

function poblarFiltroEscalasPreviasNota() {
  const filtro = document.getElementById("filtrarEscalasPreviasNota");
  if (!filtro) return;
  const valorActual = filtro.value;
  const tipos = [...new Set(escalasPreviasNotaCache.map((escala) => escala.tipoEscala).filter(Boolean))].sort();
  filtro.innerHTML = `<option value="">Todas las areas</option>${tipos.map((tipo) => `<option value="${escaparHTML(tipo)}">${escaparHTML(tipo)}</option>`).join("")}`;
  filtro.value = tipos.includes(valorActual) ? valorActual : "";
}

function renderizarEscalasPreviasNota() {
  const lista = document.getElementById("listaEscalasPreviasNota");
  if (!lista) return;

  const texto = (document.getElementById("buscarEscalasPreviasNota")?.value || "").trim().toLowerCase();
  const tipo = document.getElementById("filtrarEscalasPreviasNota")?.value || "";
  const escalas = escalasPreviasNotaCache.filter((escala) => {
    const coincideTexto = !texto || (escala.nombreEscala || "").toLowerCase().includes(texto);
    const coincideTipo = !tipo || escala.tipoEscala === tipo;
    return coincideTexto && coincideTipo;
  });

  if (!escalas.length) {
    lista.textContent = "No hay escalas para mostrar con esos filtros.";
    return;
  }

  lista.innerHTML = escalas.map((escala) => renderizarTarjetaEscalaPreviaNota(escala)).join("");
  lista.querySelectorAll("[data-copiar-escala-previa]").forEach((boton) => {
    boton.addEventListener("click", () => copiarResumenEscalaPrevia(boton.dataset.copiarEscalaPrevia));
  });
  lista.querySelectorAll("[data-insertar-escala-previa]").forEach((boton) => {
    boton.addEventListener("click", () => insertarEscalaPreviaEnNota(boton.dataset.insertarEscalaPrevia));
  });
}

function renderizarTarjetaEscalaPreviaNota(escala) {
  const respuestas = (escala.respuestasPorItem || []).map((respuesta) => `
    <li><strong>${escaparHTML(respuesta.item || "")}</strong><span>${escaparHTML(respuesta.respuesta || "")} (${respuesta.valor ? `${escaparHTML(respuesta.valor)}` : ""}) ${respuesta.dominio ? `· ${escaparHTML(respuesta.dominio)}` : ""}</span></li>
  `).join("");
  const puntajesDominio = escala.puntajesPorDominio && Object.keys(escala.puntajesPorDominio).length
    ? `<p><strong>Puntajes por dominio:</strong> ${escaparHTML(Object.entries(escala.puntajesPorDominio).map(([dominio, valor]) => `${dominio}: ${valor}`).join(" · "))}</p>`
    : "";
  const maximo = escala.puntajeMaximo ? `/${escaparHTML(escala.puntajeMaximo)}` : "";

  return `
    <details class="escala-previa-card">
      <summary>
        <span>${escaparHTML(formatearFechaEscala(escala.fechaAplicacion))}</span>
        <strong>${escaparHTML(escala.nombreEscala)}</strong>
        <em>${escaparHTML(String(escala.puntajeTotal))}${maximo} - ${escaparHTML(escala.interpretacion || "")}</em>
      </summary>
      <div class="escala-previa-detalle">
        <p><strong>Origen:</strong> ${escaparHTML(escala.origen || "")}</p>
        <p><strong>Medico:</strong> ${escaparHTML(escala.medicoNombre || escala.uidMedico || "Sin registro")}</p>
        <p><strong>Fecha y hora:</strong> ${escaparHTML(formatearFechaEscala(escala.fechaAplicacion, true))}</p>
        ${puntajesDominio}
        <ul>${respuestas || "<li>Sin respuestas registradas.</li>"}</ul>
        <p><strong>Observaciones:</strong> ${escaparHTML(escala.observaciones || "Sin observaciones")}</p>
        ${escala.recomendaciones ? `<p><strong>Recomendaciones:</strong> ${escaparHTML(escala.recomendaciones)}</p>` : ""}
        <div class="acciones-escala-previa">
          <button type="button" data-copiar-escala-previa="${escaparHTML(escala.idEscalaAplicada)}">Copiar resumen</button>
          <button type="button" data-insertar-escala-previa="${escaparHTML(escala.idEscalaAplicada)}">Insertar en nota</button>
        </div>
      </div>
    </details>
  `;
}

async function copiarResumenEscalaPrevia(idEscalaAplicada) {
  const escala = escalasPreviasNotaCache.find((item) => item.idEscalaAplicada === idEscalaAplicada);
  if (!escala) return;
  await navigator.clipboard?.writeText(crearResumenEscala(escala));
  alert("Resumen copiado al portapapeles.");
}

function insertarEscalaPreviaEnNota(idEscalaAplicada) {
  const escala = escalasPreviasNotaCache.find((item) => item.idEscalaAplicada === idEscalaAplicada);
  if (!escala) return;
  insertarResumenEscalaEnNota(crearResumenEscala(escala), `previa-${idEscalaAplicada}`);
}

configurarPanelEscalaNota();
configurarSeccionesRedimensionablesNota();

const ESTADOS_DIAGNOSTICO_NOTA = [
  "",
  "Se agrega",
  "Se descarta",
  "Probable",
  "A descartar",
  "Confirmado",
  "En seguimiento",
  "Antecedente",
  "Remisión",
  "Diferencial"
];

function estadoDiagnosticoNotaValido(estado) {
  return ESTADOS_DIAGNOSTICO_NOTA.includes(estado) ? estado : "";
}

function crearIdDiagnosticoNota(dx, index = 0) {
  if (dx?.id) return dx.id;
  const base = [dx?.catalogo, dx?.codigo, dx?.nombre || dx?.texto, index]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `diagnostico-${index}`;
}

function normalizarDiagnosticoNota(dx = {}, index = 0) {
  if (typeof dx === "string") {
    const base = {
      codigo: "",
      nombre: dx,
      catalogo: "CIE-10",
      texto: dx,
      fechaSeleccion: new Date().toISOString(),
      estado: "",
      orden: index
    };
    return { ...base, id: crearIdDiagnosticoNota(base, index) };
  }

  const nombre = dx.nombre || dx.texto || dx.descripcion || "";
  const normalizado = {
    ...dx,
    id: dx.id || "",
    codigo: dx.codigo || "",
    nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: dx.texto || `${dx.codigo || ""}${dx.codigo && dx.nombre ? " - " : ""}${nombre}`.trim() || nombre,
    fechaSeleccion: dx.fechaSeleccion || new Date().toISOString(),
    estado: estadoDiagnosticoNotaValido(dx.estado),
    orden: Number.isFinite(Number(dx.orden)) ? Number(dx.orden) : index
  };
  normalizado.id = crearIdDiagnosticoNota(normalizado, index);
  return normalizado;
}

function normalizarDiagnosticosNota(lista = []) {
  return lista
    .map((dx, index) => normalizarDiagnosticoNota(dx, index))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((dx, index) => ({ ...dx, orden: index }));
}

function textoDiagnosticoConEstado(dx) {
  const base = dx?.texto || `${dx?.codigo || ""}${dx?.codigo && dx?.nombre ? " - " : ""}${dx?.nombre || ""}`.trim();
  const estado = dx?.estado ? ` — ${dx.estado}` : "";
  return `${base}${estado}`.trim();
}

function opcionesEstadoDiagnosticoNota(estadoActual = "") {
  return ESTADOS_DIAGNOSTICO_NOTA.map((estado) => `
    <option value="${escaparHTML(estado)}" ${estado === estadoActual ? "selected" : ""}>${escaparHTML(estado || "No mostrar estado")}</option>
  `).join("");
}
function agregarDiagnostico(dx) {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  const yaExiste = diagnosticosSeleccionados.some(
    (item) =>
      item.codigo === dx.codigo &&
      (item.catalogo || "CIE-10") === (dx.catalogo || "CIE-10")
  );

  if (yaExiste) {
    alert("Este diagnóstico ya está seleccionado");
    return;
  }

  const nuevoDiagnostico = normalizarDiagnosticoNota({
    codigo: dx.codigo,
    nombre: dx.nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: `${dx.codigo} - ${dx.nombre}`,
    fechaSeleccion: new Date().toISOString()
  }, diagnosticosSeleccionados.length);

  diagnosticosSeleccionados.push(nuevoDiagnostico);
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);

  cie10Codigo.value = dx.codigo;
  cie10Nombre.value = dx.nombre;

  renderizarDiagnosticosSeleccionados();
}

function anexarTextoGenerado(id, texto, titulo = "Sugerencia automatica") {
  const campo = document.getElementById(id);
  const limpio = String(texto || "").trim();
  if (!campo || !limpio) return;

  const encabezado = `--- ${titulo} ---`;
  const patron = new RegExp(`\\n?\\n?--- ${titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ---[\\s\\S]*?(?=\\n\\n--- |$)`, "g");
  const previo = campo.value.replace(patron, "").trim();
  campo.value = previo
    ? `${previo}\n\n${encabezado}\n${limpio}`
    : limpio;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

function textoRiesgosAutomaticos(riesgos = []) {
  if (!riesgos.length) return "";
  return riesgos.map((riesgo) =>
    `${riesgo.tipo} (${riesgo.severidad}): ${riesgo.marcadores.join(", ")}`
  ).join("\n");
}

function renderizarDiagnosticosSeleccionados() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  sincronizarDiagnosticosObservacion();

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML = `
      <p style="color:#999;">No hay diagnósticos seleccionados</p>
    `;
    return;
  }

  ["CIE-10", "CIE-11"].forEach((catalogo) => {
    const diagnosticos = diagnosticosSeleccionados
      .map((dx, index) => ({ ...dx, index }))
      .filter((dx) => (dx.catalogo || "CIE-10") === catalogo);

    if (diagnosticos.length === 0) return;

    contenedor.innerHTML += `<h4 class="diagnostico-catalogo-titulo">${catalogo}</h4>`;

    diagnosticos.forEach((dx) => {
      contenedor.innerHTML += `
        <div class="diagnostico-item">
          <span>${dx.texto}</span>

          <button type="button" onclick="eliminarDiagnostico(${dx.index})">
            Eliminar diagnóstico
          </button>
        </div>
      `;
    });
  });
}

function renderizarDiagnosticosSeleccionadosEditable() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);

  contenedor.innerHTML = `
    <div class="diagnostico-manual-nota">
      <div>
        <strong>Diagnostico manual</strong>
        <small>Agrega un diagnostico sin buscarlo en catalogo, o usa esta area para un especificador clinico.</small>
      </div>
      <button type="button" class="boton-secundario" onclick="agregarDiagnosticoManualNota()">
        Agregar diagnostico manual
      </button>
    </div>
  `;
  sincronizarDiagnosticosObservacion();

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML += `<p style="color:#999;">No hay diagnosticos seleccionados</p>`;
    return;
  }

  contenedor.innerHTML += `
    <div class="diagnosticos-editables-tabla">
      <div class="diagnosticos-editables-head">
        <span>Codigo</span>
        <span>Diagnostico</span>
        <span>Estado</span>
        <span>Catalogo</span>
        <span>Orden</span>
        <span>Catalogo local</span>
        <span></span>
      </div>
      ${diagnosticosSeleccionados.map((dx, index) => `
        <div class="diagnosticos-editables-row">
          <input
            value="${escaparHTML(dx.codigo || "")}"
            data-dx-index="${index}"
            data-dx-campo="codigo"
            oninput="actualizarDiagnosticoSeleccionado(this)"
            placeholder="Codigo"
          >
          <input
            value="${escaparHTML(dx.nombre || dx.texto || "")}"
            data-dx-index="${index}"
            data-dx-campo="nombre"
            oninput="actualizarDiagnosticoSeleccionado(this)"
            placeholder="Nombre del diagnostico"
          >
          <select data-dx-index="${index}" data-dx-campo="estado" onchange="actualizarDiagnosticoSeleccionado(this)">
            ${opcionesEstadoDiagnosticoNota(dx.estado)}
          </select>
          <select data-dx-index="${index}" data-dx-campo="catalogo" onchange="actualizarDiagnosticoSeleccionado(this)">
            <option value="CIE-10" ${(dx.catalogo || "CIE-10") === "CIE-10" ? "selected" : ""}>CIE-10</option>
            <option value="CIE-11" ${(dx.catalogo || "CIE-10") === "CIE-11" ? "selected" : ""}>CIE-11</option>
            <option value="Manual" ${(dx.catalogo || "CIE-10") === "Manual" ? "selected" : ""}>Manual</option>
          </select>
          <div class="diagnostico-orden-nota">
            <button type="button" onclick="moverDiagnosticoSeleccionado(${index}, -1)" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" onclick="moverDiagnosticoSeleccionado(${index}, 1)" ${index === diagnosticosSeleccionados.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <button type="button" class="boton-catalogo-manual" onclick="incluirDiagnosticoManualEnCatalogo(${index})">
            Incluir
          </button>
          <button type="button" onclick="eliminarDiagnostico(${index})">
            Eliminar
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

renderizarDiagnosticosSeleccionados = renderizarDiagnosticosSeleccionadosEditable;

window.abrirModuloNotaPorVoz = function() {
  const parametros = new URLSearchParams();
  const pacienteId = uidPacienteActual || document.getElementById("uidPaciente")?.value || "";
  const contexto = obtenerContextoAtencion(pacienteId);
  if (pacienteId) parametros.set("id", pacienteId);
  if (contexto.id) parametros.set("encounterId", contexto.id);
  if (notaEditandoId) parametros.set("noteId", notaEditandoId);
  parametros.set("returnUrl", `${location.pathname.split("/").pop() || "nota.html"}${location.search || ""}`);
  parametros.set("v", "20260719-mental-exam-v1");
  window.location.href = `nota-por-voz.html?${parametros.toString()}`;
};

window.actualizarDiagnosticoSeleccionado = function(campo) {
  const index = Number(campo.dataset.dxIndex);
  const nombreCampo = campo.dataset.dxCampo;

  if (!Number.isInteger(index) || !nombreCampo || !diagnosticosSeleccionados[index]) return;

  diagnosticosSeleccionados[index] = {
    ...diagnosticosSeleccionados[index],
    [nombreCampo]: campo.value,
    editadoManual: true,
    fechaEdicionManual: new Date().toISOString()
  };

  if (nombreCampo === "codigo" || nombreCampo === "nombre") {
    const dx = diagnosticosSeleccionados[index];
    diagnosticosSeleccionados[index].texto = `${dx.codigo || ""}${dx.codigo && dx.nombre ? " - " : ""}${dx.nombre || ""}`.trim();
  }

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  sincronizarDiagnosticosObservacion();
};

window.agregarDiagnosticoManualNota = function() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  diagnosticosSeleccionados.push(normalizarDiagnosticoNota({
    codigo: "",
    nombre: "Diagnostico manual",
    catalogo: "Manual",
    texto: "Diagnostico manual",
    manual: true,
    fechaSeleccion: new Date().toISOString()
  }, diagnosticosSeleccionados.length));

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  renderizarDiagnosticosSeleccionados();
};

window.moverDiagnosticoSeleccionado = function(index, direccion) {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  const destino = index + direccion;

  if (!diagnosticosSeleccionados[index] || destino < 0 || destino >= diagnosticosSeleccionados.length) return;

  [diagnosticosSeleccionados[index], diagnosticosSeleccionados[destino]] = [diagnosticosSeleccionados[destino], diagnosticosSeleccionados[index]];
  diagnosticosSeleccionados = diagnosticosSeleccionados.map((dx, orden) => ({ ...dx, orden }));
  renderizarDiagnosticosSeleccionados();
};
window.incluirDiagnosticoManualEnCatalogo = function(index) {
  const dx = diagnosticosSeleccionados[index];
  if (!dx) return;

  const catalogo = dx.catalogo || "Manual";
  const codigo = (dx.codigo || "").trim();
  const nombre = (dx.nombre || dx.texto || "").trim();

  if (!codigo || !nombre) {
    alert("Escribe codigo y nombre antes de incluir el diagnostico en un catalogo.");
    return;
  }

  if (!["CIE-10", "CIE-11"].includes(catalogo)) {
    alert("Elige CIE-10 o CIE-11 en la columna Catalogo antes de incluirlo.");
    return;
  }

  const existeEnBase = catalogoDiagnosticosCombinado().some((item) =>
    item.codigo.toLowerCase() === codigo.toLowerCase() &&
    (item.catalogo || "CIE-10") === catalogo
  );

  if (existeEnBase) {
    alert("Ese codigo ya existe en el catalogo seleccionado.");
    return;
  }

  catalogoManualDiagnosticos.push({
    codigo,
    nombre,
    catalogo,
    texto: `${codigo} - ${nombre}`,
    agregadoManual: true,
    fechaAgregado: new Date().toISOString()
  });
  guardarCatalogoManualDiagnosticos();

  diagnosticosSeleccionados[index] = {
    ...dx,
    codigo,
    nombre,
    catalogo,
    texto: `${codigo} - ${nombre}`,
    incluidoEnCatalogo: true
  };

  alert(`Diagnostico incluido en ${catalogo}.`);
  renderizarDiagnosticosSeleccionados();
};

window.eliminarDiagnostico = function(index) {
  const confirmar = confirm("¿Eliminar diagnóstico?");

  if (!confirmar) return;

  diagnosticosSeleccionados.splice(index, 1);

  renderizarDiagnosticosSeleccionados();
};

function diagnosticoActual() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  if (diagnosticosSeleccionados.length === 0) return null;

  return diagnosticosSeleccionados[0];
}

function textoDiagnosticos() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  if (diagnosticosSeleccionados.length === 0) return "";

  return diagnosticosSeleccionados
    .map(textoDiagnosticoConEstado)
    .join("\n");
}

function calcularEdadDesdeFecha(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? String(edad) : "";
}

function normalizarFechaIngresoNota(valor = "") {
  if (!valor) return "";
  if (typeof valor.toDate === "function") {
    const fecha = valor.toDate();
    return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(0, 16);
  }
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? "" : valor.toISOString().slice(0, 16);
  }

  const limpio = String(valor).trim();

  if (!limpio) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return `${limpio}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(limpio)) return limpio.slice(0, 16);

  const partes = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (partes) {
    const [, dia, mes, anio, hora = "00", minuto = "00"] = partes;
    return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`;
  }

  return limpio;
}

function parsearFechaIngresoNota(valor = "") {
  const normalizada = normalizarFechaIngresoNota(valor);
  if (!normalizada) return null;

  const fecha = normalizada.includes("T")
    ? new Date(normalizada)
    : new Date(`${normalizada}T00:00`);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function calcularEstanciaDesdeIngresoNota(fechaIngreso = "") {
  const ingreso = parsearFechaIngresoNota(fechaIngreso);
  if (!ingreso) return "";

  const diferencia = Date.now() - ingreso.getTime();
  if (diferencia < 0) return "";

  const horasTotales = Math.floor(diferencia / (1000 * 60 * 60));
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;

  if (dias > 0 && horas > 0) return `${dias} d ${horas} h`;
  if (dias > 0) return `${dias} d`;
  return `${horas} h`;
}

function fechaLocalInputNota(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function horaLocalInputNota(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fechaRegistroSignoNota(registro = {}) {
  const fecha = new Date(registro.fechaToma || registro.fecha || registro.creadoEn || "");
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function ultimoRegistroSignoNota(paciente = {}, clave = "") {
  const historial = paciente.historialSignosVitales?.[clave];
  if (!Array.isArray(historial)) return null;
  return historial
    .map((registro) => ({ ...registro, fechaObjeto: fechaRegistroSignoNota(registro) }))
    .filter((registro) => registro.fechaObjeto && String(registro.valor || "").trim())
    .sort((a, b) => b.fechaObjeto - a.fechaObjeto)[0] || null;
}

function signosVitalesVinculadosNota(paciente = {}) {
  const vitales = paciente.signosVitales || paciente.vitales || {};
  const mapa = {
    presionArterial: ["presionArterial", "pa"],
    temperatura: ["temperatura"],
    frecuenciaCardiaca: ["frecuenciaCardiaca", "fc"],
    frecuenciaRespiratoria: ["frecuenciaRespiratoria", "fr"],
    saturacionO2: ["saturacionO2", "saturacionOxigeno", "spo2"],
    peso: ["peso"],
    talla: ["talla"],
    imc: ["imc"]
  };

  return Object.entries(mapa).reduce((salida, [clave, aliases]) => {
    const registro = ultimoRegistroSignoNota(paciente, clave);
    const valorFallback = aliases
      .map((alias) => vitales[alias] || paciente[alias] || paciente.datosInstitucionales?.[alias] || paciente.somatometria?.[alias])
      .find((valor) => valor !== undefined && valor !== null && String(valor).trim() !== "");
    const fechaFallback = paciente.signosVitalesMeta?.[clave]?.fecha || paciente.signosVitalesMeta?.[aliases[0]]?.fecha || "";
    const fecha = registro?.fechaObjeto || (fechaFallback ? new Date(fechaFallback) : null);
    const valor = registro?.valor || valorFallback || "";
    salida[clave] = {
      valor,
      fechaToma: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : "",
      horaToma: fecha && !Number.isNaN(fecha.getTime()) ? horaLocalInputNota(fecha) : "",
      origen: registro ? "historialSignosVitales" : (valor ? "signosVitales" : "")
    };
    return salida;
  }, {});
}

const tipoNota = document.getElementById("tipoNota");
const bloqueNotaRapida = document.getElementById("bloqueNotaRapida");
const bloqueNotaCompleta = document.getElementById("bloqueNotaCompleta");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const formatoNota = document.getElementById("formatoNota");
const bloqueObservacionFray = document.getElementById("bloqueObservacionFray");
const btnSincronizarDxObs = document.getElementById("btnSincronizarDxObs");

const camposObservacionFray = {
  tipoNota: "obsTipoNota",
  fechaNota: "obsFechaNota",
  horaNota: "obsHoraNota",
  diasEstancia: "obsDiasEstancia",
  presionArterial: "obsPresionArterial",
  temperatura: "obsTemperatura",
  frecuenciaCardiaca: "obsFrecuenciaCardiaca",
  frecuenciaRespiratoria: "obsFrecuenciaRespiratoria",
  saturacionO2: "obsSaturacionO2",
  peso: "obsPeso",
  talla: "obsTalla",
  imc: "obsIMC",
  exploracionFisicaNeurologica: "obsExploracionFisicaNeurologica",
  resultadosEstudios: "obsResultadosEstudios",
  pronostico: "obsPronostico",
  destino: "obsDestino",
  firma1Nombre: "obsFirma1Nombre",
  firma1Cargo: "obsFirma1Cargo",
  firma1Cedula: "obsFirma1Cedula",
  firma2Nombre: "obsFirma2Nombre",
  firma2Cargo: "obsFirma2Cargo",
  firma2Cedula: "obsFirma2Cedula",
  firma3Nombre: "obsFirma3Nombre",
  firma3Cargo: "obsFirma3Cargo",
  firma3Cedula: "obsFirma3Cedula"
};

function sincronizarTipoNota() {
  const esRapida = tipoNota?.value === "rapida";
  bloqueNotaRapida?.classList.toggle("oculto", !esRapida);
  bloqueNotaCompleta?.classList.toggle("oculto", esRapida);
}

tipoNota?.addEventListener("change", sincronizarTipoNota);
sincronizarTipoNota();

function valorCampo(id) {
  return document.getElementById(id)?.value || "";
}

function asignarValor(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function referenciaCatalogoMedicosFirmas() {
  if (!uidMedicoActual) return null;
  return collection(db, "usuarios", uidMedicoActual, "catalogoMedicosFirmas");
}

function renderizarCatalogoMedicosFirmas() {
  const datalist = document.getElementById("catalogoMedicosFirmas");
  if (!datalist) return;

  datalist.innerHTML = catalogoMedicosFirmasCache
    .map((medico) => {
      const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<option value="${escaparHTML(medico.nombre || "")}" label="${escaparHTML(detalle)}"></option>`;
    })
    .join("");
}

async function cargarCatalogoMedicosFirmas() {
  const ref = referenciaCatalogoMedicosFirmas();
  if (!ref) return;

  const qCatalogo = query(ref, orderBy("nombre"));
  const snap = await getDocs(qCatalogo);
  catalogoMedicosFirmasCache = snap.docs.map((docMedico) => ({
    id: docMedico.id,
    ...docMedico.data()
  }));

  renderizarCatalogoMedicosFirmas();
}

function buscarMedicoFirmaPorNombre(nombre) {
  const clave = normalizarTextoBusqueda(nombre);
  if (!clave) return null;
  return catalogoMedicosFirmasCache.find((medico) => normalizarTextoBusqueda(medico.nombre) === clave) || null;
}

function aplicarMedicoFirma(numeroFirma, medico) {
  if (!medico) return;
  asignarValor(`obsFirma${numeroFirma}Nombre`, medico.nombre || "");
  asignarValor(`obsFirma${numeroFirma}Cargo`, medico.cargo || "");
  asignarValor(`obsFirma${numeroFirma}Cedula`, medico.cedula || "");
}

function configurarCatalogoMedicosFirmas() {
  document.querySelectorAll("[data-firma-nombre]").forEach((campo) => {
    campo.addEventListener("change", () => {
      const numeroFirma = campo.dataset.firmaNombre;
      const medico = buscarMedicoFirmaPorNombre(campo.value);
      if (medico) aplicarMedicoFirma(numeroFirma, medico);
    });
  });

  document.querySelectorAll("[data-guardar-medico-firma]").forEach((boton) => {
    boton.addEventListener("click", () => guardarMedicoFirmaDesdeCampo(boton.dataset.guardarMedicoFirma));
  });

  document.querySelectorAll("[data-limpiar-firma]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const numeroFirma = boton.dataset.limpiarFirma;
      ["Nombre", "Cargo", "Cedula"].forEach((campo) => asignarValor(`obsFirma${numeroFirma}${campo}`, ""));
    });
  });
}

async function guardarMedicoFirmaDesdeCampo(numeroFirma) {
  const nombre = valorCampo(`obsFirma${numeroFirma}Nombre`).trim();
  const cargo = valorCampo(`obsFirma${numeroFirma}Cargo`).trim();
  const cedula = valorCampo(`obsFirma${numeroFirma}Cedula`).trim();
  const ref = referenciaCatalogoMedicosFirmas();

  if (!ref) {
    alert("No se pudo identificar al medico para guardar el catalogo.");
    return;
  }

  if (!nombre) {
    alert("Escribe el nombre del medico antes de agregarlo al catalogo.");
    return;
  }

  const existente = buscarMedicoFirmaPorNombre(nombre);
  const payload = {
    nombre,
    cargo,
    cedula,
    actualizadoEn: serverTimestamp()
  };

  if (existente?.id) {
    const confirmar = confirm("Este médico ya existe en el catálogo. ¿Deseas actualizar cargo y cédula?");
    if (!confirmar) return;
    await updateDoc(doc(db, "usuarios", uidMedicoActual, "catalogoMedicosFirmas", existente.id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      creadoEn: serverTimestamp()
    });
  }

  await cargarCatalogoMedicosFirmas();
  alert("Medico agregado al catalogo de firmas.");
}

function numeroClinico(valor) {
  const limpio = String(valor || "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

function calcularIMCNota() {
  const peso = numeroClinico(valorCampo("obsPeso"));
  const talla = numeroClinico(valorCampo("obsTalla"));
  const campoIMC = document.getElementById("obsIMC");

  if (!campoIMC) return "";

  if (!peso || !talla || talla <= 0) {
    campoIMC.value = "";
    return "";
  }

  const imc = peso / (talla * talla);
  const imcTexto = imc.toFixed(2);
  campoIMC.value = imcTexto;
  return imcTexto;
}

["obsPeso", "obsTalla"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    calcularIMCNota();
    sincronizarParametrosPediatriaNota();
  });
});

document.getElementById("omitirPediatriaNota")?.addEventListener("change", () => {
  document.getElementById("bloquePediatriaNota")?.classList.toggle(
    "omitido",
    Boolean(document.getElementById("omitirPediatriaNota")?.checked)
  );
});

function valorClinicoDesdePaciente(paciente = {}, clave) {
  const institucional = paciente.datosInstitucionales || {};
  const signos = paciente.signosVitales || {};
  const somatometria = paciente.somatometria || {};
  return paciente[clave] || signos[clave] || somatometria[clave] || institucional[clave] || "";
}

function valorSignoVinculadoNota(paciente = {}, clave = "") {
  return signosVitalesVinculadosNota(paciente)[clave]?.valor || "";
}

function fechaNacimientoPacienteNota(paciente = pacienteActualDatos || {}) {
  const institucional = paciente.datosInstitucionales || {};
  return paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    "";
}

function tallaCmParaPediatria(valor) {
  const talla = numeroPediatrico(valor);
  if (talla === null) return null;
  return talla > 3 ? talla : talla * 100;
}

function calcularParametrosPediatriaNota() {
  const fechaNacimiento = fechaNacimientoPacienteNota();
  const edad = calcularEdadPediatrica(fechaNacimiento);
  if (!edad || edad.años >= 18) return null;

  const peso = numeroPediatrico(valorCampo("obsPeso") || valorClinicoDesdePaciente(pacienteActualDatos, "peso"));
  const tallaCm = tallaCmParaPediatria(valorCampo("obsTalla") || valorClinicoDesdePaciente(pacienteActualDatos, "talla"));
  const imc = calcularIMCPediatrico(peso, tallaCm);
  const sc = superficieCorporal(peso, tallaCm);
  const mantenimiento = mantenimientoHollidaySegar(peso);

  return {
    aplica: true,
    omitido: Boolean(document.getElementById("omitirPediatriaNota")?.checked),
    fechaNacimiento: formatearFechaDDMMAAAA(fechaNacimiento),
    edadTexto: edad.edadCronologicaTexto,
    años: edad.años,
    meses: edad.meses,
    dias: edad.dias,
    diasVida: edad.diaDeVida,
    semanasVida: Number(edad.semanasTotales.toFixed(1)),
    pesoKg: peso,
    tallaCm,
    imc: imc ? Number(imc.toFixed(2)) : null,
    superficieCorporalM2: sc?.mosteller ? Number(sc.mosteller.toFixed(2)) : null,
    mantenimientoMlDia: mantenimiento?.mlDia ? Math.round(mantenimiento.mlDia) : null,
    mantenimientoMlHora: mantenimiento?.mlHora ? Number(mantenimiento.mlHora.toFixed(1)) : null,
    regla421MlHora: mantenimiento?.regla421 ? Number(mantenimiento.regla421.toFixed(1)) : null
  };
}

function textoResumenPediatriaNota(datos) {
  if (!datos) return "";
  return [
    `Edad pediátrica: ${datos.edadTexto} (${datos.diasVida} días de vida).`,
    `Somatometría: peso ${datos.pesoKg != null ? datos.pesoKg : "-"} kg, talla ${datos.tallaCm != null ? datos.tallaCm : "-"} cm, IMC ${datos.imc != null ? datos.imc : "-"}, SC ${datos.superficieCorporalM2 != null ? datos.superficieCorporalM2 : "-"} m2.`,
    `Líquidos de mantenimiento estimados: ${datos.mantenimientoMlDia != null ? datos.mantenimientoMlDia : "-"} mL/día (${datos.mantenimientoMlHora != null ? datos.mantenimientoMlHora : "-"} mL/h). Regla 4-2-1: ${datos.regla421MlHora != null ? datos.regla421MlHora : "-"} mL/h.`
  ].join("\n");
}

function sincronizarParametrosPediatriaNota(datosGuardados = null) {
  const bloque = document.getElementById("bloquePediatriaNota");
  renderizarOpcionesEscalasNota();
  if (!bloque) return null;

  const calculados = calcularParametrosPediatriaNota();
  const datos = datosGuardados?.aplica ? { ...calculados, ...datosGuardados } : calculados;

  if (!datos) {
    bloque.classList.add("oculto");
    renderizarEscalaNotaSeleccionada();
    return null;
  }

  bloque.classList.remove("oculto");
  const omitido = Boolean(datos.omitido);
  const checkbox = document.getElementById("omitirPediatriaNota");
  if (checkbox) checkbox.checked = omitido;
  bloque.classList.toggle("omitido", omitido);

  asignarValor("notaPedEdad", datos.edadTexto || "");
  asignarValor("notaPedDiaVida", datos.diasVida ? `${datos.diasVida} días` : "");
  asignarValor("notaPedPeso", datos.pesoKg !== null && datos.pesoKg !== undefined ? `${datos.pesoKg} kg` : "");
  asignarValor("notaPedTalla", datos.tallaCm ? `${datos.tallaCm} cm` : "");
  asignarValor("notaPedIMC", datos.imc ? `${datos.imc}` : "");
  asignarValor("notaPedSC", datos.superficieCorporalM2 ? `${datos.superficieCorporalM2} m2` : "");
  asignarValor("notaPedMantenimiento", datos.mantenimientoMlDia ? `${datos.mantenimientoMlDia} mL/día` : "");
  asignarValor("notaPedRegla421", datos.regla421MlHora ? `${datos.regla421MlHora} mL/h` : "");
  asignarValor("notaPediatriaResumen", omitido ? "Parámetros pediátricos omitidos en esta nota." : textoResumenPediatriaNota(datos));
  renderizarEscalaNotaSeleccionada();
  return datos;
}

function leerParametrosPediatriaNota() {
  const datos = calcularParametrosPediatriaNota();
  if (!datos) return { aplica: false, omitido: true };
  return {
    ...datos,
    omitido: Boolean(document.getElementById("omitirPediatriaNota")?.checked),
    resumen: document.getElementById("notaPediatriaResumen")?.value || textoResumenPediatriaNota(datos)
  };
}


function puedeUsarFormatoNota(valor = formatoNota?.value || "") {
  return usuarioPuedeUsarFormato(valor, permisosFormatosActual, rolUsuarioActual, perfilMedicoActual);
}

function aplicarPermisosFormatoNota() {
  aplicarPermisosFormatosSelect(formatoNota, permisosFormatosActual, {
    rol: rolUsuarioActual,
    usuario: perfilMedicoActual,
    fallback: "cognicion",
    fallbackLabel: "PDF Cognicion"
  });
}
function esFormatoFray() {
  return formatoNota?.value?.startsWith("fray_observacion") || false;
}

function sincronizarFormatoNota() {
  aplicarPermisosFormatoNota();
  if (formatoNota && !puedeUsarFormatoNota(formatoNota.value)) {
    formatoNota.value = "cognicion";
  }
  bloqueObservacionFray?.classList.remove("oculto");

  if (formatoNota?.value?.startsWith("fray_observacion")) {
    const tipoInstitucional = formatoNota.value.includes("envio_piso")
      ? "envio_piso"
      : formatoNota.value.includes("evolucion")
        ? "evolucion"
        : "ingreso";
    asignarValor("obsTipoNota", tipoInstitucional);

    if (tipoInstitucional === "envio_piso" && !valorCampo("obsDestino")) {
      asignarValor("obsDestino", "Se envia a piso de hospitalizacion continua");
    }
  }

  if (!valorCampo("obsFechaNota")) asignarValor("obsFechaNota", fechaLocalInputNota());
  if (!valorCampo("obsHoraNota")) asignarValor("obsHoraNota", horaLocalInputNota());
  sincronizarDiagnosticosObservacion();
}

function aplicarTiempoActualNota() {
  const ahora = new Date();
  asignarValor("obsFechaNota", fechaLocalInputNota(ahora));
  asignarValor("obsHoraNota", horaLocalInputNota(ahora));
  const estanciaActual = datosInstitucionalesPaciente(pacienteActualDatos || {}).diasEstancia || "";
  asignarValor("obsDiasEstancia", estanciaActual);
}

function formatearIndicacionTratamientoNota(t = {}) {
  const medicamento = String(t.medicamento || t.nombre || "").trim();
  const via = String(t.via || "").trim();
  const frecuencia = normalizarTextoFrecuencia(t.frecuencia);
  const dosis = Array.isArray(t.tomas) && t.tomas.length
    ? t.tomas
      .map((toma) => [toma.cantidad, toma.horario ? `a las ${toma.horario}` : ""].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ")
    : String(t.dosis || "").trim();
  return [
    medicamento,
    [via, frecuencia].filter(Boolean).join(" "),
    dosis
  ].filter(Boolean).join(" - ");
}

async function resumenTratamientoIndicacionesNota(uidPaciente) {
  const partes = [];
  try {
    const tratamientos = await listarTratamientos(uidPaciente);
    const activos = tratamientos
      .filter((t) => String(t.estado || "activo").toLowerCase() === "activo")
      .map(formatearIndicacionTratamientoNota)
      .filter(Boolean);
    if (activos.length) {
      partes.push(`Tratamiento farmacológico actual:\n${activos.map((item) => `- ${item}`).join("\n")}`);
    }
  } catch (error) {
    console.warn("No se pudo cargar tratamiento activo para la nota:", error);
  }

  try {
    const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "indicaciones"), orderBy("fechaCreacion", "desc")));
    const ultima = snap.docs.map((docIndicacion) => ({ id: docIndicacion.id, ...docIndicacion.data() }))[0];
    if (ultima?.indicaciones) {
      partes.push(`Indicaciones vigentes:\n${ultima.indicaciones}`);
    }
  } catch (error) {
    console.warn("No se pudieron cargar indicaciones vigentes para la nota:", error);
  }

  const resumenPaciente = pacienteActualDatos?.tratamiento || pacienteActualDatos?.datosClinicosResumen?.tratamientoActivo || "";
  if (!partes.length && resumenPaciente) partes.push(`Tratamiento farmacológico actual:\n${resumenPaciente}`);
  return partes.join("\n\n");
}

async function aplicarPlanTratamientoIndicacionesNota(uidPaciente, opciones = {}) {
  const resumen = await resumenTratamientoIndicacionesNota(uidPaciente);
  if (!resumen) return "";
  if (opciones.forzar || !valorCampo("plan")) asignarValor("plan", resumen);
  if (opciones.forzar || !valorCampo("tratamiento")) asignarValor("tratamiento", resumen);
  return resumen;
}

async function refrescarDatosVivosParaNota(uidPaciente, opciones = {}) {
  if (!uidPaciente) return;
  try {
    const actualizados = await obtenerUsuario(uidPaciente);
    if (actualizados) pacienteActualDatos = actualizados;
  } catch (error) {
    console.warn("No se pudieron refrescar datos vivos del paciente para la nota:", error);
  }

  aplicarTiempoActualNota();
  aplicarDatosInstitucionalesPaciente(pacienteActualDatos || {}, {
    forzarSignosVitales: opciones.forzarSignosVitales !== false
  });
  await aplicarPlanTratamientoIndicacionesNota(uidPaciente, {
    forzar: Boolean(opciones.forzarPlan)
  });
}

formatoNota?.addEventListener("change", sincronizarFormatoNota);
btnSincronizarDxObs?.addEventListener("click", sincronizarDiagnosticosObservacion);

function diagnosticosCIE10Observacion() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  return diagnosticosSeleccionados
    .filter((dx) => (dx.catalogo || "CIE-10") === "CIE-10")
    .map((dx) => ({
      codigo: dx.codigo || "",
      diagnostico: `${dx.nombre || dx.texto || ""}${dx.estado ? ` — ${dx.estado}` : ""}`.trim(),
      texto: textoDiagnosticoConEstado(dx)
    }));
}

function sincronizarDiagnosticosObservacion() {
  const contenedor = document.getElementById("obsDiagnosticosLista");
  if (!contenedor) return;

  const diagnosticos = diagnosticosCIE10Observacion();

  if (diagnosticos.length === 0) {
    contenedor.innerHTML = "<p>Sin diagnósticos CIE-10 sincronizados.</p>";
    return;
  }

  contenedor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Diagnóstico</th>
        </tr>
      </thead>
      <tbody>
        ${diagnosticos.map((dx) => `
          <tr>
            <td>${escaparHTML(dx.codigo)}</td>
            <td>${escaparHTML(dx.diagnostico)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function leerFormularioObservacionFray() {
  calcularIMCNota();
  const datos = Object.entries(camposObservacionFray).reduce((salida, [clave, id]) => {
    salida[clave] = valorCampo(id);
    return salida;
  }, {});
  const administrativos = datosInstitucionalesPaciente(pacienteActualDatos || {});

  return {
    nombrePaciente: administrativos.nombrePaciente,
    servicio: administrativos.servicioInstitucional || "Observación",
    cama: administrativos.cama,
    expediente: administrativos.expediente,
    fechaNacimiento: administrativos.fechaNacimiento,
    edad: administrativos.edad,
    sexo: administrativos.sexo,
    genero: administrativos.genero,
    alergias: administrativos.alergias,
    diasEstancia: administrativos.diasEstancia || "",
    díasEstancia: administrativos.díasEstancia || "",
    ...datos,
    motivoAtencion: valorCampo("subjetivo"),
    examenMental: valorCampo("objetivo"),
    planTerapeutico: valorCampo("plan"),
    comentarioAnalisis: valorCampo("analisis"),
    diagnosticosCIE10: diagnosticosCIE10Observacion(),
    preparadoParaWord: true,
    plantillaSugerida: datos.tipoNota === "envio_piso"
      ? "fray_observacion_envio_piso"
      : datos.tipoNota === "evolucion"
        ? "fray_observacion_evolucion"
        : "fray_observacion_ingreso"
  };
}

function llenarFormularioObservacionFray(datos = {}) {
  const datosCompatibles = {
    ...datos,
    firma1Nombre: datos.firma1Nombre || datos.medicoAdscrito || "",
    firma1Cargo: datos.firma1Cargo || (datos.medicoAdscrito ? "Médico adscrito" : ""),
    firma1Cedula: datos.firma1Cedula || datos.cedulaAdscrito || "",
    firma2Nombre: datos.firma2Nombre || datos.medicoR3 || "",
    firma2Cargo: datos.firma2Cargo || (datos.medicoR3 ? "Médico residente de 3er año" : ""),
    firma2Cedula: datos.firma2Cedula || datos.cedulaR3 || "",
    firma3Nombre: datos.firma3Nombre || datos.medicoR2 || "",
    firma3Cargo: datos.firma3Cargo || (datos.medicoR2 ? "Médico residente de 2o año" : ""),
    firma3Cedula: datos.firma3Cedula || datos.cedulaR2 || ""
  };

  Object.entries(camposObservacionFray).forEach(([clave, id]) => {
    asignarValor(id, datosCompatibles[clave] || "");
  });
  calcularIMCNota();
  sincronizarDiagnosticosObservacion();
}

function datosInstitucionalesPaciente(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  const fray = paciente.frayObservacion || {};
  const fechaNacimiento =
    paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    "";
  const fechaIngreso =
    paciente.fechaIngreso ||
    institucional.fechaIngreso ||
    paciente.fecha_ingreso ||
    paciente.ingreso ||
    "";
  const diasEstancia =
    paciente.diasEstancia ||
    paciente.díasEstancia ||
    institucional.diasEstancia ||
    institucional.díasEstancia ||
    calcularEstanciaDesdeIngresoNota(fechaIngreso);

  return {
    nombrePaciente: obtenerNombrePacienteParaMostrar(paciente) || institucional.nombrePaciente || "",
    tipoPaciente: paciente.tipoPaciente || institucional.tipoPaciente || "privada",
    institucionPaciente: paciente.institucionPaciente || paciente.institucion || institucional.institucionPaciente || "",
    servicioInstitucional: paciente.servicioInstitucional || paciente.servicio || institucional.servicioInstitucional || "",
    cama: paciente.cama || institucional.cama || "",
    expediente: paciente.expediente || paciente.numeroExpediente || institucional.expediente || "",
    fechaNacimiento,
    edad: calcularEdadDesdeFecha(fechaNacimiento) || "",
    sexo: paciente.sexo || institucional.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || institucional.genero || "",
    alergias: paciente.alergias || institucional.alergias || "",
    fechaIngreso,
    diasEstancia,
    díasEstancia: diasEstancia,
    firma1Nombre: fray.firma1Nombre || fray.medicoAdscrito || paciente.medicoTratante || "",
    firma1Cargo: fray.firma1Cargo || (fray.medicoAdscrito || paciente.medicoTratante ? "Médico adscrito" : ""),
    firma1Cedula: fray.firma1Cedula || fray.cedulaAdscrito || "",
    firma2Nombre: fray.firma2Nombre || fray.medicoR3 || "",
    firma2Cargo: fray.firma2Cargo || (fray.medicoR3 ? "Médico residente de 3er año" : ""),
    firma2Cedula: fray.firma2Cedula || fray.cedulaR3 || "",
    firma3Nombre: fray.firma3Nombre || fray.medicoR2 || "",
    firma3Cargo: fray.firma3Cargo || (fray.medicoR2 ? "Médico residente de 2o año" : ""),
    firma3Cedula: fray.firma3Cedula || fray.cedulaR2 || ""
  };
}

function aplicarDatosInstitucionalesPaciente(paciente = {}, opciones = {}) {
  const datos = datosInstitucionalesPaciente(paciente);
  const forzarSignos = Boolean(opciones.forzarSignosVitales);

  const valorPA = valorSignoVinculadoNota(paciente, "presionArterial") || paciente.presionArterial || paciente.pa || "";
  const valorTemp = valorSignoVinculadoNota(paciente, "temperatura") || paciente.temperatura || "";
  const valorFC = valorSignoVinculadoNota(paciente, "frecuenciaCardiaca") || paciente.frecuenciaCardiaca || paciente.fc || "";
  const valorFR = valorSignoVinculadoNota(paciente, "frecuenciaRespiratoria") || paciente.frecuenciaRespiratoria || paciente.fr || "";
  const valorSpO2 = valorSignoVinculadoNota(paciente, "saturacionO2") || paciente.saturacionO2 || paciente.spo2 || "";
  const valorPeso = valorSignoVinculadoNota(paciente, "peso") || paciente.peso || paciente.signosVitales?.peso || paciente.datosInstitucionales?.peso || "";
  const valorTalla = valorSignoVinculadoNota(paciente, "talla") || paciente.talla || paciente.signosVitales?.talla || paciente.datosInstitucionales?.talla || "";

  if (forzarSignos || !valorCampo("obsPresionArterial")) asignarValor("obsPresionArterial", valorPA);
  if (forzarSignos || !valorCampo("obsTemperatura")) asignarValor("obsTemperatura", valorTemp);
  if (forzarSignos || !valorCampo("obsFrecuenciaCardiaca")) asignarValor("obsFrecuenciaCardiaca", valorFC);
  if (forzarSignos || !valorCampo("obsFrecuenciaRespiratoria")) asignarValor("obsFrecuenciaRespiratoria", valorFR);
  if (forzarSignos || !valorCampo("obsSaturacionO2")) asignarValor("obsSaturacionO2", valorSpO2);
  if (forzarSignos || !valorCampo("obsPeso")) asignarValor("obsPeso", valorPeso);
  if (forzarSignos || !valorCampo("obsTalla")) asignarValor("obsTalla", valorTalla);
  calcularIMCNota();
  if (!valorCampo("obsFirma1Nombre")) asignarValor("obsFirma1Nombre", datos.firma1Nombre);
  if (!valorCampo("obsFirma1Cargo")) asignarValor("obsFirma1Cargo", datos.firma1Cargo);
  if (!valorCampo("obsFirma1Cedula")) asignarValor("obsFirma1Cedula", datos.firma1Cedula);
  if (!valorCampo("obsFirma2Nombre")) asignarValor("obsFirma2Nombre", datos.firma2Nombre);
  if (!valorCampo("obsFirma2Cargo")) asignarValor("obsFirma2Cargo", datos.firma2Cargo);
  if (!valorCampo("obsFirma2Cedula")) asignarValor("obsFirma2Cedula", datos.firma2Cedula);
  if (!valorCampo("obsFirma3Nombre")) asignarValor("obsFirma3Nombre", datos.firma3Nombre);
  if (!valorCampo("obsFirma3Cargo")) asignarValor("obsFirma3Cargo", datos.firma3Cargo);
  if (!valorCampo("obsFirma3Cedula")) asignarValor("obsFirma3Cedula", datos.firma3Cedula);
}

async function autollenarResultadosEstudiosDiagnosticos(uidPaciente) {
  const campo = document.getElementById("obsResultadosEstudios");
  if (!campo || !uidPaciente || campo.dataset.editadoManual === "true") return;

  try {
    const estudios = await listarEstudios(uidPaciente);
    const texto = estudios
      .map((estudio) => {
        const nombre = estudio.nombre || estudio.nombreEstudio || estudio.tipo || "Estudio";
        const resultado = estudio.resultado || estudio.resumen || estudio.observaciones || "";
        return resultado ? `${nombre}: ${resultado}` : "";
      })
      .filter(Boolean)
      .join("\n");

    if (texto && !campo.value.trim()) {
      campo.value = texto;
      campo.dataset.autollenado = "true";
    }
  } catch (error) {
    console.warn("No se pudieron autollenar estudios diagnosticos:", error);
  }
}

function aplicarHistoriaClinicaObservacion(historia = {}) {
  if (!valorCampo("subjetivo")) asignarValor("subjetivo", historia.padecimientoActual || "");
  if (!valorCampo("objetivo")) {
    const examenMental = [
      historia.apariencia ? `Apariencia y conducta: ${historia.apariencia}` : "",
      historia.lenguaje ? `Lenguaje: ${historia.lenguaje}` : "",
      historia.afecto ? `Estado de ánimo y afecto: ${historia.afecto}` : "",
      historia.pensamiento ? `Pensamiento: ${historia.pensamiento}` : "",
      historia.sensopercepcion ? `Sensopercepción: ${historia.sensopercepcion}` : "",
      historia.cognicion ? `Funciones cognitivas: ${historia.cognicion}` : "",
      historia.juicio ? `Juicio e insight: ${historia.juicio}` : ""
    ].filter(Boolean).join("\n");
    asignarValor("objetivo", examenMental);
  }
  if (!valorCampo("plan")) {
    asignarValor("plan", [
      historia.tratamientoFarmacologico,
      historia.psicoterapia,
      historia.seguimiento
    ].filter(Boolean).join("\n"));
  }
  if (!valorCampo("analisis")) asignarValor("analisis", historia.diagnosticoClinico || "");
}

function datosPersistentesDesdeObservacion(observacion = {}) {
  return {
    frayObservacion: {
      firma1Nombre: observacion.firma1Nombre || "",
      firma1Cargo: observacion.firma1Cargo || "",
      firma1Cedula: observacion.firma1Cedula || "",
      firma2Nombre: observacion.firma2Nombre || "",
      firma2Cargo: observacion.firma2Cargo || "",
      firma2Cedula: observacion.firma2Cedula || "",
      firma3Nombre: observacion.firma3Nombre || "",
      firma3Cargo: observacion.firma3Cargo || "",
      firma3Cedula: observacion.firma3Cedula || ""
    }
  };
}

function valorNormalizadoElemento(elemento) {
  if (!elemento) return "";
  if (elemento.matches?.("input[type='checkbox']")) return Boolean(elemento.checked);
  if (elemento.matches?.("input[type='radio']")) return elemento.checked ? elemento.value : "";
  if (elemento.isContentEditable) return elemento.innerHTML || elemento.textContent || "";
  return typeof elemento.value === "string" ? elemento.value : elemento.textContent || "";
}

function camposDinamicosNota() {
  return [...document.querySelectorAll("[data-note-field]")].reduce((salida, elemento) => {
    const clave = elemento.dataset.noteField;
    if (clave) salida[clave] = valorNormalizadoElemento(elemento);
    return salida;
  }, {});
}

function obtenerContextoAtencion(uidPaciente = uidPacienteActual) {
  const parametros = new URLSearchParams(location.search);
  const candidatos = [
    ["encuentro", parametros.get("encounterId")],
    ["atencion", parametros.get("atencionId")],
    ["consulta", parametros.get("consultaId")],
    ["ingreso", parametros.get("ingresoId")],
    ["expediente", parametros.get("expedienteId")],
    ["atencion", pacienteActualDatos.atencionActivaId],
    ["consulta", pacienteActualDatos.consultaActivaId],
    ["ingreso", pacienteActualDatos.ingresoActivoId],
    ["expediente", pacienteActualDatos.expediente || pacienteActualDatos.numeroExpediente]
  ];
  const encontrado = candidatos.find(([, id]) => String(id || "").trim());
  if (encontrado) return { tipo: encontrado[0], id: String(encontrado[1]).trim() };
  return uidPaciente ? { tipo: "expediente", id: `paciente:${uidPaciente}` } : { tipo: "", id: "" };
}

function collectNoteData() {
  const formato = formatoNota?.value || "cognicion";
  const observacionFray = leerFormularioObservacionFray();
  const contexto = obtenerContextoAtencion();

  return {
    formatoNota: formato,
    formatoInstitucional: esFormatoFray() ? "fray_bernardino_observacion" : "",
    exportacionWord: {
      habilitada: true,
      formato,
      plantillaSugerida: observacionFray.plantillaSugerida || formato
    },
    pacienteId: uidPacienteActual || document.getElementById("uidPaciente")?.value || "",
    expedienteId: observacionFray.expediente || contexto.id,
    atencionId: contexto.id,
    tipoAtencion: contexto.tipo,
    usuarioId: uidMedicoActual || auth.currentUser?.uid || "",
    usuarioNombre: perfilMedicoActual.nombre || perfilMedicoActual.nombreCompleto || auth.currentUser?.displayName || auth.currentUser?.email || "",
    medicoResponsable: valorCampo("medico") || observacionFray.firma1Nombre || perfilMedicoActual.nombre || perfilMedicoActual.nombreCompleto || "",
    servicio: observacionFray.servicio || pacienteActualDatos.servicio || "",
    tratamiento: valorCampo("tratamiento"),
    diagnosticos: normalizarDiagnosticosNota(diagnosticosSeleccionados),
    diagnosticoCatalogoVisible: diagnosticoCatalogoVisible?.value || "auto",
    ultimaConsulta: valorCampo("ultimaConsulta"),
    proximaConsulta: valorCampo("proximaConsulta"),
    observacionFray,
    tipoNota: tipoNota?.value || "completa",
    tipoNotaClave: `${tipoNota?.value || "completa"}:${observacionFray.tipoNota || formato}`,
    notaRapida: document.getElementById("notaRapida")?.value || "",
    subjetivo: document.getElementById("subjetivo").value,
    objetivo: document.getElementById("objetivo").value,
    analisis: document.getElementById("analisis").value,
    plan: document.getElementById("plan").value,
    signosVitalesVinculados: signosVitalesVinculadosNota(pacienteActualDatos || {}),
    pediatriaNota: leerParametrosPediatriaNota(),
    camposDinamicos: camposDinamicosNota()
  };
}

const leerFormularioNota = collectNoteData;

function llenarFormularioNota(datos) {
  if (formatoNota) formatoNota.value = datos.formatoNota || "cognicion";
  if (tipoNota) tipoNota.value = datos.tipoNota || (datos.notaRapida ? "rapida" : "completa");
  document.getElementById("notaRapida").value = datos.notaRapida || "";
  document.getElementById("subjetivo").value = datos.subjetivo || "";
  document.getElementById("objetivo").value = datos.objetivo || "";
  document.getElementById("analisis").value = datos.analisis || "";
  document.getElementById("plan").value = datos.plan || "";
  asignarValor("tratamiento", datos.tratamiento || "");
  asignarValor("medico", datos.medicoResponsable || datos.autor || datos.medico || "");
  asignarValor("ultimaConsulta", datos.ultimaConsulta || "");
  asignarValor("proximaConsulta", datos.proximaConsulta || "");
  if (diagnosticoCatalogoVisible) diagnosticoCatalogoVisible.value = datos.diagnosticoCatalogoVisible || "auto";

  const diagnosticosFuente =
    Array.isArray(datos.diagnosticos) && datos.diagnosticos.length
     ? datos.diagnosticos
      : Array.isArray(datos.historialDiagnosticos)
       ? datos.historialDiagnosticos
       : [];

diagnosticosSeleccionados =
  normalizarDiagnosticosNota(diagnosticosFuente);

renderizarDiagnosticosSeleccionados();

  document.querySelectorAll("[data-note-field]").forEach((elemento) => {
    const valor = datos.camposDinamicos?.[elemento.dataset.noteField];

    if (valor === undefined) return;

    if (elemento.matches("input[type='checkbox']")) elemento.checked = Boolean(valor);
    else if (elemento.isContentEditable) elemento.innerHTML = String(valor);
    else elemento.value = String(valor);
  });
  
  llenarFormularioObservacionFray(datos.observacionFray || {});
  sincronizarParametrosPediatriaNota(datos.pediatriaNota || datos["ped?atriaNota"] || null);
  sincronizarTipoNota();
  sincronizarFormatoNota();
}

function limpiarFormularioNota() {
  notaEditandoId = null;
  edicionVersionadaActiva = false;
  modoEdicionNota = null;
  estadoNotaActual = "nueva";
  escalasAplicadasPendientesNota = [];
  llenarFormularioNota({ tipoNota: "completa" });
  establecerModoLecturaNota(false);
  marcarNotaGuardada();
  btnCancelarEdicion?.classList.add("oculto");
}

window.cancelarEdicionNota = function() {
  limpiarFormularioNota();
};

function elementosEditablesNota() {
  const selectores = [
    "#bloqueNotaRapida input, #bloqueNotaRapida textarea, #bloqueNotaRapida select, #bloqueNotaRapida [contenteditable]",
    "#bloqueNotaCompleta input, #bloqueNotaCompleta textarea, #bloqueNotaCompleta select, #bloqueNotaCompleta [contenteditable]",
    "#bloqueObservacionFray input, #bloqueObservacionFray textarea, #bloqueObservacionFray select, #bloqueObservacionFray [contenteditable]",
    "#tratamiento, #medico, #ultimaConsulta, #proximaConsulta, #tipoNota",
    "[data-note-field]"
  ];
  return [...new Set([...document.querySelectorAll(selectores.join(","))])];
}

function establecerModoLecturaNota(bloqueada) {
  elementosEditablesNota().forEach((elemento) => {
    if (elemento.isContentEditable) {
      elemento.contentEditable = bloqueada ? "false" : "true";
    } else {
      elemento.disabled = Boolean(bloqueada);
    }
  });
  document.getElementById("btnGuardarBorradorNota")?.toggleAttribute("disabled", Boolean(bloqueada));
  document.getElementById("btnGuardarNotaDefinitiva")?.toggleAttribute("disabled", Boolean(bloqueada));
}

function claveRespaldoNota() {
  const pacienteId = uidPacienteActual || document.getElementById("uidPaciente")?.value || "sin-paciente";
  const atencionId = obtenerContextoAtencion(pacienteId).id || "sin-atencion";
  return `${PREFIJO_RESPALDO_NOTA}:${uidMedicoActual || "sin-usuario"}:${pacienteId}:${atencionId}`;
}

async function guardarRespaldoTemporalNota() {
  if (!cambiosNotaPendientes || estadoNotaActual === "definitiva") return;
  try {
    await guardarBorradorClinicoLocal(claveRespaldoNota(), {
      pacienteId: uidPacienteActual || document.getElementById("uidPaciente")?.value || "",
      atencionId: obtenerContextoAtencion().id,
      actualizadoEn: Date.now(),
      notaId: notaEditandoId || "",
      edicionVersionada: edicionVersionadaActiva,
      modoEdicion: modoEdicionNota,
      datos: collectNoteData()
    });
  } catch (error) {
    console.warn("No se pudo crear el respaldo temporal de la nota:", error?.name || "error");
  }
}

function marcarCambiosNotaPendientes() {
  if (estadoNotaActual === "definitiva") return;
  cambiosNotaPendientes = true;
  clearTimeout(temporizadorRespaldoNota);
  temporizadorRespaldoNota = setTimeout(guardarRespaldoTemporalNota, 500);
}

function marcarNotaGuardada() {
  cambiosNotaPendientes = false;
  clearTimeout(temporizadorRespaldoNota);
  eliminarBorradorClinicoLocal(claveRespaldoNota()).catch(() => {});
}

function configurarPrevencionPerdidaNota() {
  if (inicializacionFlujoNotasCompleta) return;
  inicializacionFlujoNotasCompleta = true;
  document.addEventListener("input", (evento) => {
    if (elementosEditablesNota().includes(evento.target)) marcarCambiosNotaPendientes();
  });
  document.addEventListener("change", (evento) => {
    if (elementosEditablesNota().includes(evento.target)) marcarCambiosNotaPendientes();
  });
  window.addEventListener("beforeunload", (evento) => {
    if (!cambiosNotaPendientes) return;
    guardarRespaldoTemporalNota();
    evento.preventDefault();
    evento.returnValue = "";
  });
}

function referenciaApuntesMedico() {
  if (!uidMedicoActual) return null;
  return collection(db, "usuarios", uidMedicoActual, "apuntesMedico");
}

async function migrarBorradorLegacySiExiste() {
  if (!uidMedicoActual) return;

  const refLegacy = doc(db, "usuarios", uidMedicoActual, "borradoresMedico", "notasGenerales");
  const snapLegacy = await getDoc(refLegacy);

  if (!snapLegacy.exists() || !snapLegacy.data().contenido) return;

  const refApuntes = referenciaApuntesMedico();
  if (!refApuntes) return;

  await addDoc(refApuntes, {
    titulo: "Borrador general",
    contenido: snapLegacy.data().contenido || "",
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    migradoDesdeBorrador: true
  });

  await deleteDoc(refLegacy);
}

async function cargarBorradoresMedico() {
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!ref) return;
  if (estado) estado.textContent = "Cargando...";

  await migrarBorradorLegacySiExiste();

  const qApuntes = query(ref, orderBy("fechaActualizacion", "desc"));
  const snap = await getDocs(qApuntes);

  apuntesMedicoCache = snap.docs.map((docApunte) => ({
    id: docApunte.id,
    ...docApunte.data()
  }));

  renderizarListaApuntes();

  if (apuntesMedicoCache.length > 0) {
    seleccionarApunteMedico(apuntesMedicoCache[0].id);
  } else {
    nuevoApunteMedico();
  }

  if (estado) estado.textContent = apuntesMedicoCache.length ? "Guardado" : "Sin apuntes";
}

window.abrirBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  fondo?.classList.remove("oculto");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  document.getElementById("buscadorApuntesMedico")?.focus();
};

window.cerrarBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!panel?.classList.contains("abierto")) {
      fondo?.classList.add("oculto");
    }
  }, 220);
};

async function cargarNotasFlotantesParaNota() {
  const contenedor = document.getElementById("listaNotasFlotantesNota");
  const uidPaciente = uidPacienteActual || document.getElementById("uidPaciente")?.value;

  if (!contenedor) return;

  if (!uidPaciente) {
    contenedor.textContent = "Selecciona un paciente para cargar sus notas flotantes.";
    notasFlotantesPacienteCache = [];
    renderizarNotasFlotantesCostado();
    return;
  }

  contenedor.textContent = "Cargando notas flotantes...";
  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));
  notasFlotantesPacienteCache = snap.docs.map((docNota) => ({
    id: docNota.id,
    ...docNota.data()
  }));

  renderizarNotasFlotantesEnNota();
  renderizarNotasFlotantesCostado();
}

function renderizarNotasFlotantesEnNota() {
  const contenedor = document.getElementById("listaNotasFlotantesNota");
  const activa = document.getElementById("notaFlotanteNotaId")?.value || "";
  if (!contenedor) return;

  if (!notasFlotantesPacienteCache.length) {
    contenedor.innerHTML = `<p class="apuntes-vacio">Este paciente no tiene notas flotantes.</p>`;
    return;
  }

  contenedor.innerHTML = notasFlotantesPacienteCache.map((nota) => {
    return `
      <details class="nota-flotante-nota ${nota.id === activa ? "activa" : ""}"${nota.contraida ? "" : " open"}>
        <summary>${escaparHTML(nota.titulo || "Nota flotante")}</summary>
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <div class="acciones-nota-flotante-nota">
          <button type="button" class="boton-secundario" onclick="seleccionarNotaFlotanteDesdeNota('${nota.id}')">
            Editar
          </button>
          <button type="button" class="boton-secundario" onclick="alternarNotaFlotanteDesdeNota('${nota.id}')">
            ${nota.contraida ? "Mostrar" : "Contraer"}
          </button>
        </div>
      </details>
    `;
  }).join("");
}

function renderizarNotasFlotantesCostado() {
  const costado = document.getElementById("notasFlotantesCostado");
  if (!costado) return;

  const visibles = notasFlotantesPacienteCache.filter((nota) => nota.texto || nota.titulo);

  if (!visibles.length) {
    costado.innerHTML = "";
    costado.classList.remove("con-notas");
    return;
  }

  costado.classList.add("con-notas");
  costado.innerHTML = visibles.map((nota) => `
    <article class="nota-flotante-costado ${nota.contraida ? "contraida" : "abierta"}">
      <button type="button" class="nota-flotante-costado-header" onclick="alternarNotaFlotanteDesdeNota('${nota.id}')">
        <span>${escaparHTML(nota.titulo || "Nota flotante")}</span>
        <small>${nota.contraida ? "Mostrar" : "Contraer"}</small>
      </button>
      <div class="nota-flotante-costado-cuerpo">
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <button type="button" class="boton-secundario" onclick="abrirNotasFlotantesPaciente(); seleccionarNotaFlotanteDesdeNota('${nota.id}')">
          Editar
        </button>
      </div>
    </article>
  `).join("");
}

window.alternarNotaFlotanteDesdeNota = async function(id) {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const nota = notasFlotantesPacienteCache.find((item) => item.id === id);

  if (!uidPaciente || !nota) return;

  const contraida = !nota.contraida;
  nota.contraida = contraida;

  await updateDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id), {
    contraida,
    fechaActualizacion: new Date().toISOString()
  });

  const idActivo = document.getElementById("notaFlotanteNotaId")?.value;
  if (idActivo === id) {
    const selector = document.getElementById("notaFlotanteNotaContraida");
    if (selector) selector.value = contraida ? "true" : "false";
  }

  renderizarNotasFlotantesEnNota();
  renderizarNotasFlotantesCostado();
};

function uidPacienteParaNotaFlotante() {
  return uidPacienteActual || document.getElementById("uidPaciente")?.value || "";
}

window.nuevaNotaFlotanteDesdeNota = function() {
  ["notaFlotanteNotaId", "notaFlotanteNotaTitulo", "notaFlotanteNotaTexto"].forEach((id) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = "";
  });
  const contraida = document.getElementById("notaFlotanteNotaContraida");
  if (contraida) contraida.value = "false";
  const estado = document.getElementById("estadoNotasFlotantesNota");
  if (estado) estado.textContent = "Nueva nota";
  renderizarNotasFlotantesEnNota();
};

window.seleccionarNotaFlotanteDesdeNota = function(id) {
  const nota = notasFlotantesPacienteCache.find((item) => item.id === id);
  if (!nota) return;

  document.getElementById("notaFlotanteNotaId").value = nota.id;
  document.getElementById("notaFlotanteNotaTitulo").value = nota.titulo || "";
  document.getElementById("notaFlotanteNotaTexto").value = nota.texto || "";
  document.getElementById("notaFlotanteNotaContraida").value = nota.contraida ? "true" : "false";
  const estado = document.getElementById("estadoNotasFlotantesNota");
  if (estado) estado.textContent = "Editando";
  renderizarNotasFlotantesEnNota();
};

window.guardarNotaFlotanteDesdeNota = async function() {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const id = document.getElementById("notaFlotanteNotaId")?.value || "";
  const titulo = document.getElementById("notaFlotanteNotaTitulo")?.value.trim() || "Nota flotante";
  const texto = document.getElementById("notaFlotanteNotaTexto")?.value.trim() || "";
  const contraida = document.getElementById("notaFlotanteNotaContraida")?.value === "true";
  const estado = document.getElementById("estadoNotasFlotantesNota");

  if (!uidPaciente) {
    alert("Selecciona un paciente para guardar una nota flotante.");
    return;
  }

  if (!texto) {
    alert("Escribe el contenido de la nota flotante.");
    return;
  }

  if (estado) estado.textContent = "Guardando...";

  const payload = {
    titulo,
    texto,
    contraida,
    medicoUid: auth.currentUser?.uid || "",
    fechaActualizacion: new Date().toISOString()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id), payload);
  } else {
    const nueva = await addDoc(collection(db, "usuarios", uidPaciente, "notasFlotantes"), {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
    document.getElementById("notaFlotanteNotaId").value = nueva.id;
  }

  if (estado) estado.textContent = "Guardado";
  await cargarNotasFlotantesParaNota();
};

window.eliminarNotaFlotanteDesdeNota = async function() {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const id = document.getElementById("notaFlotanteNotaId")?.value || "";

  if (!uidPaciente || !id) {
    alert("Selecciona una nota flotante para eliminar.");
    return;
  }

  if (!confirm("¿Eliminar esta nota flotante?")) return;

  await deleteDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id));
  window.nuevaNotaFlotanteDesdeNota();
  await cargarNotasFlotantesParaNota();
};

window.abrirNotasFlotantesPaciente = async function() {
  const fondo = document.getElementById("fondoNotasFlotantesPaciente");
  const panel = document.getElementById("panelNotasFlotantesPaciente");

  fondo?.classList.remove("oculto");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  await cargarNotasFlotantesParaNota();
};

window.cerrarNotasFlotantesPaciente = function() {
  const fondo = document.getElementById("fondoNotasFlotantesPaciente");
  const panel = document.getElementById("panelNotasFlotantesPaciente");

  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!panel?.classList.contains("abierto")) {
      fondo?.classList.add("oculto");
    }
  }, 220);
};

window.guardarBorradoresMedico = async function() {
  const texto = document.getElementById("borradoresMedicoTexto");
  const titulo = document.getElementById("apunteMedicoTitulo");
  const id = document.getElementById("apunteMedicoId")?.value;
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!texto || !ref) {
    alert("No se pudo identificar al medico para guardar el apunte.");
    return;
  }

  if (estado) estado.textContent = "Guardando...";

  const payload = {
    titulo: titulo?.value.trim() || "Sin título",
    contenido: texto.value,
    fechaActualizacion: new Date().toISOString(),
    fechaActualizacionServidor: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id), payload);
  } else {
    const nuevo = await addDoc(ref, {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
    document.getElementById("apunteMedicoId").value = nuevo.id;
  }

  if (estado) estado.textContent = "Guardado";
  await cargarBorradoresMedico();
};

window.nuevoApunteMedico = function() {
  document.getElementById("apunteMedicoId").value = "";
  document.getElementById("apunteMedicoTitulo").value = "";
  document.getElementById("borradoresMedicoTexto").value = "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Nuevo apunte";
  document.getElementById("apunteMedicoTitulo")?.focus();
};

window.seleccionarApunteMedico = function(id) {
  const apunte = apuntesMedicoCache.find((item) => item.id === id);
  if (!apunte) return;

  document.getElementById("apunteMedicoId").value = apunte.id;
  document.getElementById("apunteMedicoTitulo").value = apunte.titulo || "";
  document.getElementById("borradoresMedicoTexto").value = apunte.contenido || "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Guardado";
  renderizarListaApuntes();
};

window.eliminarApunteMedicoActual = async function() {
  const id = document.getElementById("apunteMedicoId")?.value;
  if (!id) {
    nuevoApunteMedico();
    return;
  }

  if (!confirm("¿Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id));
  await cargarBorradoresMedico();
};

function renderizarListaApuntes() {
  const lista = document.getElementById("listaApuntesMedico");
  const buscador = document.getElementById("buscadorApuntesMedico");
  const activo = document.getElementById("apunteMedicoId")?.value;
  if (!lista) return;

  const textoBusqueda = (buscador?.value || "").trim().toLowerCase();
  const filtrados = apuntesMedicoCache.filter((apunte) => {
    const titulo = (apunte.titulo || "").toLowerCase();
    const contenido = (apunte.contenido || "").toLowerCase();
    return !textoBusqueda || titulo.includes(textoBusqueda) || contenido.includes(textoBusqueda);
  });

  if (!filtrados.length) {
    lista.innerHTML = `<p class="apuntes-vacio">No se encontraron apuntes.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map((apunte) => `
    <button
      type="button"
      class="apunte-lista-item ${apunte.id === activo ? "activo" : ""}"
      onclick="seleccionarApunteMedico('${apunte.id}')"
    >
      <strong>${escaparHTML(apunte.titulo || "Sin título")}</strong>
      <span>${escaparHTML((apunte.contenido || "").slice(0, 90))}</span>
    </button>
  `).join("");
}

function bloqueContenidoNota(datos, titulo) {
  const esRapida = datos.tipoNota === "rapida" || datos.notaRapida;
  return `
    <div class="version-nota">
      <h4>${titulo}</h4>
      ${esRapida ? `<p><b>Nota rápida:</b><br>${escaparHTML(datos.notaRapida || "")}</p>` : `
        <p><b>Subjetivo:</b><br>${escaparHTML(datos.subjetivo || "")}</p>
        <p><b>Objetivo:</b><br>${escaparHTML(datos.objetivo || "")}</p>
        <p><b>Analisis:</b><br>${escaparHTML(datos.analisis || "")}</p>
        <p><b>Plan:</b><br>${escaparHTML(datos.plan || "")}</p>
      `}
    </div>
  `;
}

function versionesEditadasNota(datos = {}) {
  const versiones = Array.isArray(datos.ediciones)
    ? [...datos.ediciones].filter((version) => version && typeof version === "object")
    : [];
  if (datos.notaEditada && typeof datos.notaEditada === "object") {
    const versionActual = Number(datos.notaEditada.version || 0);
    const fechaActual = datos.notaEditada.fechaEdicion || datos.notaEditada.fechaUltimaModificacion || "";
    const yaIncluida = versiones.some((version) => (
      (versionActual && Number(version.version || 0) === versionActual)
      || (fechaActual && (version.fechaEdicion || version.fechaUltimaModificacion) === fechaActual)
    ));
    if (!yaIncluida) versiones.push(datos.notaEditada);
  }
  return versiones.sort((a, b) => {
    const versionA = Number(a.version || 0);
    const versionB = Number(b.version || 0);
    if (versionA !== versionB) return versionA - versionB;
    return fechaNotaHistorial(a).getTime() - fechaNotaHistorial(b).getTime();
  });
}

const ESTADOS_BORRADOR_NOTA = new Set(["borrador", "draft"]);
const ESTADOS_DEFINITIVOS_NOTA = new Set([
  "definitiva", "definitivo", "firmada", "firmado", "cerrada", "cerrado", "final"
]);

function valorEstadoPersistidoNota(datos = {}) {
  return String(datos.estadoNota || datos.estado || "").trim().toLowerCase();
}

function estadoPersistidoNota(datos = {}) {
  const estadoRaiz = valorEstadoPersistidoNota(datos);
  if (datos.bloqueada === true || ESTADOS_DEFINITIVOS_NOTA.has(estadoRaiz)) return "definitiva";
  if (ESTADOS_BORRADOR_NOTA.has(estadoRaiz) || datos.esBorrador === true) return "borrador";
  if (datos.esBorrador === false || (datos.notaEditada && Array.isArray(datos.ediciones))) return "definitiva";

  const estadoVigente = valorEstadoPersistidoNota(datos.notaEditada || {});
  return ESTADOS_BORRADOR_NOTA.has(estadoVigente) ? "borrador" : "definitiva";
}

function fechaPropiaNotaEnMs(datos = {}) {
  const valor = datos.fechaUltimaModificacion || datos.fechaEdicion || datos.fechaGuardadoBorrador
    || datos.fechaNotaDefinitiva || datos.fecha || datos.fechaCreacion || datos.createdAt || datos.fechaRegistro;
  if (!valor) return 0;
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}

function datosVigentesNota(datos = {}) {
  if (!datos.notaEditada || typeof datos.notaEditada !== "object") return datos;
  if (estadoPersistidoNota(datos) !== "borrador") return datos.notaEditada;
  return fechaPropiaNotaEnMs(datos.notaEditada) > fechaPropiaNotaEnMs(datos)
    ? datos.notaEditada
    : datos;
}

function fechaNotaHistorial(datos = {}) {
  const vigente = datosVigentesNota(datos);
  const valor = vigente.fecha || vigente.fechaNotaDefinitiva || vigente.fechaGuardadoBorrador
    || vigente.fechaEdicion || vigente.fechaUltimaModificacion
    || datos.fecha || datos.fechaNotaDefinitiva || datos.fechaGuardadoBorrador
    || datos.fechaUltimaEdicion || datos.fechaCreacion || datos.createdAt || datos.fechaRegistro;
  if (!valor) return new Date();
  if (typeof valor.toDate === "function") return valor.toDate();
  if (typeof valor.seconds === "number") return new Date(valor.seconds * 1000);
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? new Date() : fecha;
}

window.editarNotaDesdeHistorial = function(notaId) {
  const datos = notasHistorial[notaId];
  if (!datos) return;
  if (estadoPersistidoNota(datos) === "borrador") {
    alert("Esta nota sigue siendo borrador. Usa Continuar borrador para editar el mismo documento sin crear historial.");
    return;
  }
  const vigente = datosVigentesNota(datos);
  notaEditandoId = notaId;
  edicionVersionadaActiva = true;
  modoEdicionNota = "editar-definitiva";
  estadoNotaActual = "borrador";
  escalasAplicadasPendientesNota = [];
  llenarFormularioNota(vigente);
  establecerModoLecturaNota(false);
  marcarNotaGuardada();
  btnCancelarEdicion?.classList.remove("oculto");
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
  alert(`Edicion versionada iniciada. La version ${vigente.version || datos.version || 1} permanecera en el historial cuando guardes.`);
};

function continuarBorradorNota(notaId, { silencioso = false } = {}) {
  const datos = notasHistorial[notaId];
  if (!datos) {
    if (!silencioso) alert("No se encontro el borrador seleccionado.");
    return false;
  }
  if (estadoPersistidoNota(datos) !== "borrador") {
    if (!silencioso) alert("Solo las notas en estado borrador pueden continuarse sin historial.");
    return false;
  }

  notaEditandoId = notaId;
  edicionVersionadaActiva = false;
  modoEdicionNota = "continuar-borrador";
  estadoNotaActual = "borrador";
  escalasAplicadasPendientesNota = [];
  llenarFormularioNota(datosVigentesNota(datos));
  establecerModoLecturaNota(false);
  marcarNotaGuardada();
  btnCancelarEdicion?.classList.remove("oculto");
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!silencioso) alert("Borrador abierto. Los siguientes guardados actualizaran esta misma nota sin crear historial.");
  return true;
}

window.continuarBorradorDesdeHistorial = function(notaId) {
  return continuarBorradorNota(notaId);
};

function abrirNotaIndicadaEnUrl() {
  const notaId = new URLSearchParams(location.search).get("notaId") || new URLSearchParams(location.search).get("noteId") || "";
  if (!notaId || !notasHistorial[notaId]) return false;
  return continuarBorradorNota(notaId, { silencioso: true });
}

async function cargarDatosNotaComoBorrador(notaId, opciones = {}) {
  const datosNota = notasHistorial[notaId];

  if (!datosNota) {
    alert("No se encontro la nota seleccionada.");
    return;
  }

  const datos = datosVigentesNota(datosNota);
  const formatoActual = formatoNota?.value || "cognicion";
  llenarFormularioNota({
    ...datos,
    formatoNota: opciones.mantenerFormatoActual
      ? formatoActual
      : datos.formatoNota || formatoActual
  });
  await refrescarDatosVivosParaNota(uidPacienteActual || document.getElementById("uidPaciente")?.value || "", {
    forzarSignosVitales: true,
    forzarPlan: true
  });

  notaEditandoId = null;
  edicionVersionadaActiva = false;
  modoEdicionNota = null;
  estadoNotaActual = "nueva";
  establecerModoLecturaNota(false);
  marcarCambiosNotaPendientes();
  btnCancelarEdicion?.classList.remove("oculto");
  sincronizarFormatoNota();
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

window.cargarNotaComoBorrador = async function(notaId) {
  if (await cargarDatosNotaComoBorrador(notaId)) {
    alert("Nota cargada como borrador nuevo. Al guardar se creara un documento distinto y la nota previa permanecera intacta.");
  }
};

window.cargarNotaPreviaEnFormulario = async function() {
  const previa = notasHistorialOrdenadas.find((nota) => nota?.datos);

  if (!previa) {
    alert("No hay una nota previa para cargar.");
    return;
  }

  if (await cargarDatosNotaComoBorrador(previa.id, { mantenerFormatoActual: true })) {
    alert("Datos de la nota previa cargados. Se guardaran como una nota nueva.");
  }
};

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function usuarioActualPuedeAccederPaciente(uidPaciente) {
  const usuarioAuth = auth.currentUser;
  if (!usuarioAuth || !uidPaciente) return false;

  const perfilUsuario = await obtenerUsuario(usuarioAuth.uid);
  if (perfilUsuario?.rol === "admin") return true;
  if (!usuarioEsPersonalClinico(perfilUsuario?.rol)) return false;

  return await medicoPuedeVer(usuarioAuth.uid, uidPaciente);
}

async function recuperarBorradorCorrespondiente() {
  if (!uidPacienteActual || !uidMedicoActual || cambiosNotaPendientes) return;
  const contexto = obtenerContextoAtencion(uidPacienteActual);
  try {
    const borrador = await buscarBorradorNotaClinica(uidPacienteActual, {
      atencionId: contexto.id,
      tipoNotaClave: `${tipoNota?.value || "completa"}:${valorCampo("obsTipoNota") || formatoNota?.value || "cognicion"}`,
      usuarioId: uidMedicoActual
    });
    let fechaFirebase = 0;
    if (borrador) {
      const borradorVigente = datosVigentesNota(borrador);
      notaEditandoId = borrador.id;
      edicionVersionadaActiva = false;
      modoEdicionNota = "continuar-borrador";
      estadoNotaActual = "borrador";
      llenarFormularioNota(borradorVigente);
      establecerModoLecturaNota(false);
      btnCancelarEdicion?.classList.remove("oculto");
      fechaFirebase = fechaNotaHistorial(borradorVigente).getTime();
    }

    let respaldo = null;
    try { respaldo = await obtenerBorradorClinicoLocal(claveRespaldoNota()); } catch (error) {
      console.warn("El respaldo temporal de la nota no pudo leerse:", error?.name || "error");
    }
    const respaldoValido = respaldo
      && respaldo.pacienteId === uidPacienteActual
      && respaldo.atencionId === contexto.id
      && Number(respaldo.actualizadoEn || 0) > fechaFirebase;
    if (respaldoValido && window.confirm("Existe un respaldo local mas reciente de esta misma atencion. ¿Desea recuperarlo?")) {
      llenarFormularioNota(respaldo.datos || {});
      notaEditandoId = respaldo.notaId || borrador?.id || null;
      edicionVersionadaActiva = Boolean(respaldo.edicionVersionada && respaldo.notaId);
      modoEdicionNota = respaldo.modoEdicion
        || (edicionVersionadaActiva ? "editar-definitiva" : (notaEditandoId ? "continuar-borrador" : null));
      estadoNotaActual = notaEditandoId ? "borrador" : "nueva";
      cambiosNotaPendientes = true;
    } else {
      marcarNotaGuardada();
    }
  } catch (error) {
    console.error("No se pudo recuperar el borrador clinico:", error);
  }
}

async function inicializarNotaClinica() {
  const user = await getAuthenticatedUserOnce();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await getUserProfileOnce(user.uid);

  if (!usuario || (usuario.rol !== "admin" && !usuarioEsPersonalClinico(usuario.rol))) {
  alert("Acceso restringido al personal clinico");
  window.location.href = "dashboard.html";
  return;
}

  uidMedicoActual = user.uid;
  perfilMedicoActual = usuario;
  rolUsuarioActual = usuario.rol || "";
  configurarPrevencionPerdidaNota();
  permisosFormatosActual = await obtenerPermisosFormatosUsuario(user.uid, usuario);
  aplicarPermisosFormatoNota();
  await cargarBorradoresMedico();
  await cargarCatalogoMedicosFirmas();
  configurarCatalogoMedicosFirmas();
  document.getElementById("obsResultadosEstudios")?.addEventListener("input", (evento) => {
    evento.target.dataset.editadoManual = "true";
  });
  document.getElementById("borradoresMedicoTexto")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
  });
  document.getElementById("apunteMedicoTitulo")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
    renderizarListaApuntes();
  });
  document.getElementById("buscadorApuntesMedico")?.addEventListener("input", renderizarListaApuntes);

  const parametros = new URLSearchParams(window.location.search);
  uidPacienteActual = parametros.get("id");

  if (uidPacienteActual) {
    const bloqueSelector = document.getElementById("bloqueSelectorPaciente");

    if (bloqueSelector) {
      bloqueSelector.style.display = "none";
    }

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
    if (!abrirNotaIndicadaEnUrl()) await recuperarBorradorCorrespondiente();
  } else {
    await cargarListaPacientes();
  }
}

inicializarNotaClinica().catch((error) => {
  console.error("No se pudo inicializar la nota clinica:", error);
  window.location.href = "dashboard.html";
});

async function cargarListaPacientes() {
  const selector = document.getElementById("uidPaciente");

  if (!selector) return;

  selector.innerHTML = '<option value="">Seleccionar paciente</option>';

  if (!uidMedicoActual) {
    const opcion = document.createElement("option");
    opcion.disabled = true;
    opcion.textContent = "No se pudo identificar al profesional";
    selector.appendChild(opcion);
    return;
  }

  try {
    const pacientes = await listarPacientes(uidMedicoActual);

    if (pacientes.empty || pacientes.size === 0) {
      const opcion = document.createElement("option");
      opcion.disabled = true;
      opcion.textContent = "No hay pacientes autorizados";
      selector.appendChild(opcion);
      return;
    }

    pacientes.forEach((paciente) => {
      const datos = paciente.data();
      const opcion = document.createElement("option");

      opcion.value = paciente.id;
      opcion.textContent = obtenerNombrePacienteParaMostrar(datos) || "Sin nombre";
      selector.appendChild(opcion);
    });
  } catch (error) {
    console.error("Error al cargar pacientes autorizados:", error);
    const opcion = document.createElement("option");
    opcion.disabled = true;
    opcion.textContent = "No se pudieron cargar pacientes";
    selector.appendChild(opcion);
  }

  selector.addEventListener("change", async () => {
    const uidAnterior = uidPacienteActual || "";
    if (cambiosNotaPendientes && !window.confirm("Hay cambios de la nota sin guardar. ¿Desea cambiar de paciente y conservar solo el respaldo temporal?")) {
      selector.value = uidAnterior;
      return;
    }
    if (cambiosNotaPendientes) guardarRespaldoTemporalNota();
    uidPacienteActual = selector.value;
    notaEditandoId = null;
    edicionVersionadaActiva = false;
    modoEdicionNota = null;
    estadoNotaActual = "nueva";
    cambiosNotaPendientes = false;
    if (!uidPacienteActual) return;
    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
    await recuperarBorradorCorrespondiente();
  });
}

async function cargarPaciente(uidPaciente) {
  const tieneAcceso = await usuarioActualPuedeAccederPaciente(uidPaciente);

  if (!tieneAcceso) {
    alert("No tienes permiso para acceder a este paciente.");
    uidPacienteActual = null;
    window.location.href = "medico.html";
    return;
  }

  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) return;
  pacienteActualDatos = datos;

  try {
    const historiaSnap = await obtenerHistoriaClinica(uidPaciente);
    historiaClinicaActual = historiaSnap.exists() ? historiaSnap.data() : {};
  } catch (error) {
    console.warn("No se pudo cargar historia clinica para la nota:", error);
    historiaClinicaActual = {};
  }

  const tratamiento = document.getElementById("tratamiento");
  const medico = document.getElementById("medico");
  const ultimaConsulta = document.getElementById("ultimaConsulta");
  const proximaConsulta = document.getElementById("proximaConsulta");

  diagnosticosSeleccionados = [];

  if (Array.isArray(datos.historialDiagnosticos)) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota(datos.historialDiagnosticos);
  } else if (Array.isArray(datos.datosClinicosResumen?.historialDiagnosticos)) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota(datos.datosClinicosResumen.historialDiagnosticos);
  } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota([datos.diagnostico]);
  } else if (typeof datos.diagnostico === "string" && datos.diagnostico.trim() !== "") {
    diagnosticosSeleccionados = normalizarDiagnosticosNota([
      {
        codigo: "",
        nombre: datos.diagnostico,
        texto: datos.diagnostico,
        fechaSeleccion: new Date().toISOString()
      }
    ]);
  }

  renderizarDiagnosticosSeleccionados();

  const dxActual = diagnosticoActual();

  if (buscadorDiagnostico) {
    buscadorDiagnostico.value = dxActual?.texto || "";
  }

  if (cie10Codigo) {
    cie10Codigo.value = dxActual?.codigo || "";
  }

  if (cie10Nombre) {
    cie10Nombre.value = dxActual?.nombre || "";
  }

  if (tratamiento) tratamiento.value = datos.tratamiento || datos.datosClinicosResumen?.tratamientoActivo || datos.datosClinicosResumen?.tratamientoHistoria || "";
  if (medico) medico.value = datos.medicoTratante || "";
  if (ultimaConsulta) ultimaConsulta.value = datos.ultimaConsulta || "";
  if (proximaConsulta) proximaConsulta.value = datos.proximaConsulta || "";
  if (diagnosticoCatalogoVisible) {
    diagnosticoCatalogoVisible.value = datos.diagnosticoCatalogoVisible || "auto";
  }

  aplicarDatosInstitucionalesPaciente(datos);
  aplicarTiempoActualNota();
  await autollenarResultadosEstudiosDiagnosticos(uidPaciente);
  await aplicarPlanTratamientoIndicacionesNota(uidPaciente, { forzar: false });
  aplicarHistoriaClinicaObservacion(historiaClinicaActual);
  sincronizarParametrosPediatriaNota();
  cargarNotasFlotantesParaNota();

  const institucion = `${datos.institucionPaciente || datos.institucion || ""}`.toLowerCase();
  const esPacienteFray = datos.tipoPaciente === "institucion" && institucion.includes("fray");
  if (esPacienteFray && formatoNota?.value === "cognicion" && puedeUsarFormatoNota("fray_observacion_evolucion")) {
    formatoNota.value = "fray_observacion_evolucion";
  }

  sincronizarFormatoNota();
}

async function guardarNotaMedicaConEstadoLegacy(estadoNota = "definitiva") {
  const selector = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selector?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const tieneAccesoPaciente = await usuarioActualPuedeAccederPaciente(uidPaciente);
  if (!tieneAccesoPaciente) {
    alert("No tienes permiso para guardar notas de este paciente.");
    return;
  }

  aplicarPermisosFormatoNota();
  if (formatoNota && !puedeUsarFormatoNota(formatoNota.value)) {
    alert("No tienes autorizacion para usar este formato institucional. Solicita acceso al administrador.");
    formatoNota.value = "cognicion";
    sincronizarFormatoNota();
    return;
  }

  const esBorrador = estadoNota === "borrador";

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  await refrescarDatosVivosParaNota(uidPaciente, {
    forzarSignosVitales: true,
    forzarPlan: false
  });
  const diagnostico = diagnosticoActual();

  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;
  const proximaConsulta = document.getElementById("proximaConsulta").value;

  const datosNotaClinica = leerFormularioNota();
  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  try {
    const datosPersistentesInstitucionales = esFormatoFray()
      ? datosPersistentesDesdeObservacion(datosNotaClinica.observacionFray)
      : {};

    await actualizarUsuario(uidPaciente, {
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      medicoTratante: medico,
      ultimaConsulta,
      proximaConsulta,
      ...datosPersistentesInstitucionales
    });

    const notaPayload = {
      autor: medico,
      estadoNota,
      esBorrador,
      fechaGuardadoBorrador: esBorrador ? new Date().toISOString() : "",
      fechaNotaDefinitiva: esBorrador ? "" : new Date().toISOString(),
      ...datosNotaClinica,
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      ultimaConsulta,
      proximaConsulta
    };

    let idNotaGuardada = notaEditandoId || "";

    if (notaEditandoId) {
      await actualizarNota(uidPaciente, notaEditandoId, {
        ...notaPayload,
        fechaEdicion: new Date().toISOString()
      });
    } else {
      idNotaGuardada = await guardarNota(uidPaciente, notaPayload);
      await vincularEscalasPendientesANota(uidPaciente, idNotaGuardada);
    }

    const usuario = auth.currentUser;
    const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
    const pacienteActual = await obtenerUsuario(uidPaciente);

    await registrarEventoAuditoria({
      accion: notaEditandoId
        ? (esBorrador ? "editar_borrador_nota_medica" : "editar_nota_medica_definitiva")
        : (esBorrador ? "crear_borrador_nota_medica" : "crear_nota_medica_definitiva"),
      modulo: "Nota medica",
      descripcion: notaEditandoId
        ? (esBorrador
          ? "El médico guardó cambios como borrador sin borrar la nota original."
          : "El médico guardó una nota definitiva sin borrar la nota original.")
        : (esBorrador
          ? "El médico guardó una nota médica como borrador."
          : "El medico creo una nota medica definitiva."),
      usuarioUid: usuario?.uid || "",
      usuarioNombre: medicoActual?.nombre || usuario?.email || medico || "",
      usuarioRol: medicoActual?.rol || "",
      pacienteUid: uidPaciente,
      pacienteNombre: obtenerNombrePacienteParaMostrar(pacienteActual || {}) || "",
      exito: true,
      detalles: {
        notaId: idNotaGuardada || "",
        estadoNota,
        esBorrador,
        tipoNota: datosNotaClinica.tipoNota || "",
        formatoNota: datosNotaClinica.formatoNota || "cognicion",
        formatoInstitucional: datosNotaClinica.formatoInstitucional || "",
        diagnosticos: normalizarDiagnosticosNota(diagnosticosSeleccionados).map(textoDiagnosticoConEstado)
      }
    });

    if (esBorrador) {
      alert(notaEditandoId ? "Borrador actualizado sin borrar la nota original" : "Borrador guardado correctamente");
    } else {
      alert(notaEditandoId ? "Nota definitiva guardada sin borrar la nota original" : "Nota definitiva guardada correctamente");
    }
    limpiarFormularioNota();

    await cargarHistorial(uidPaciente);

  } catch(error) {
    alert("Error: " + error.message);
  }
}

async function guardarNotaClinicaSeguro(estadoNota = "definitiva") {
  const selector = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selector?.value;
  const esBorrador = estadoNota === "borrador";
  const esEdicionVersionada = Boolean(
    modoEdicionNota === "editar-definitiva" && edicionVersionadaActiva && notaEditandoId
  );
  const boton = document.getElementById(esBorrador ? "btnGuardarBorradorNota" : "btnGuardarNotaDefinitiva");
  const textoOriginal = boton?.textContent || "";

  if (!uidPaciente) {
    alert("Selecciona un paciente antes de guardar la nota.");
    return;
  }
  if (!auth.currentUser) {
    alert("La sesion expiro. Inicia sesion nuevamente; el contenido permanecera en pantalla.");
    return;
  }
  const contexto = obtenerContextoAtencion(uidPaciente);
  if (!contexto.id) {
    alert("No se encontro una atencion, consulta, ingreso o expediente activo para esta nota.");
    return;
  }
  if (estadoNotaActual === "definitiva" && !esEdicionVersionada) {
    alert("La nota definitiva esta bloqueada. Para corregirla se requiere una adenda separada.");
    return;
  }

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = esBorrador ? "Guardando borrador..." : "Cerrando nota...";
      boton.setAttribute("aria-busy", "true");
    }
    if (!(await usuarioActualPuedeAccederPaciente(uidPaciente))) throw new Error("PERMISO_PACIENTE");
    aplicarPermisosFormatoNota();
    if (formatoNota && !puedeUsarFormatoNota(formatoNota.value)) throw new Error("FORMATO_NO_AUTORIZADO");

    diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
    await refrescarDatosVivosParaNota(uidPaciente, {
      forzarSignosVitales: true,
      forzarPlan: false
    });
    const diagnostico = diagnosticoActual();
    const datosNotaClinica = collectNoteData();
    const tratamiento = datosNotaClinica.tratamiento;
    const medico = datosNotaClinica.medicoResponsable || perfilMedicoActual.nombre || perfilMedicoActual.nombreCompleto || auth.currentUser.displayName || "";
    const ultimaConsulta = datosNotaClinica.ultimaConsulta;
    const proximaConsulta = datosNotaClinica.proximaConsulta;
    const catalogoVisible = datosNotaClinica.diagnosticoCatalogoVisible;
    const contenidoClinico = [
      datosNotaClinica.notaRapida, datosNotaClinica.subjetivo, datosNotaClinica.objetivo,
      datosNotaClinica.analisis, datosNotaClinica.plan,
      datosNotaClinica.observacionFray?.exploracionFisicaNeurologica,
      datosNotaClinica.observacionFray?.resultadosEstudios,
      datosNotaClinica.observacionFray?.pronostico, tratamiento,
      ...Object.values(datosNotaClinica.camposDinamicos || {})
    ].some((valor) => String(valor || "").replace(/<[^>]*>/g, "").trim());
    if (!esBorrador && !contenidoClinico) throw new Error("CONTENIDO_CLINICO_REQUERIDO");
    if (!esBorrador && !window.confirm("¿Confirma que desea cerrar esta nota como definitiva? Despues no podra editarse sin una adenda trazable.")) return;

    const notaPayload = {
      autor: medico,
      medicoResponsable: medico,
      usuarioId: auth.currentUser.uid,
      usuarioNombre: perfilMedicoActual.nombre || perfilMedicoActual.nombreCompleto || auth.currentUser.displayName || auth.currentUser.email || "",
      pacienteId: uidPaciente,
      expedienteId: datosNotaClinica.expedienteId || contexto.id,
      atencionId: contexto.id,
      tipoAtencion: contexto.tipo,
      ...datosNotaClinica,
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      ultimaConsulta,
      proximaConsulta
    };
    const eraNueva = !notaEditandoId;
    const datosEditor = {
      usuarioId: auth.currentUser.uid,
      usuarioNombre: notaPayload.usuarioNombre
    };
    const ahoraIso = new Date().toISOString();
    const confirmada = esEdicionVersionada
      ? await actualizarNota(uidPaciente, notaEditandoId, {
          ...notaPayload,
          estadoNota,
          esBorrador,
          bloqueada: !esBorrador,
          fecha: ahoraIso,
          fechaUltimaModificacion: ahoraIso,
          ...(esBorrador
            ? { fechaGuardadoBorrador: ahoraIso }
            : { fechaNotaDefinitiva: ahoraIso, fechaCierre: ahoraIso })
        }, datosEditor)
      : esBorrador
        ? await guardarBorradorNotaClinica(uidPaciente, notaEditandoId, notaPayload)
        : await finalizarNotaClinica(uidPaciente, notaEditandoId, notaPayload, datosEditor);

    notaEditandoId = confirmada.id;
    estadoNotaActual = esEdicionVersionada
      ? confirmada.notaEditada?.estadoNota || estadoNota
      : confirmada.estadoNota;
    if (!esEdicionVersionada) modoEdicionNota = esBorrador ? "continuar-borrador" : null;
    if (esEdicionVersionada && !esBorrador) {
      edicionVersionadaActiva = false;
      modoEdicionNota = null;
    }
    if (eraNueva) await vincularEscalasPendientesANota(uidPaciente, confirmada.id);

    try {
      await actualizarUsuario(uidPaciente, {
        diagnostico,
        diagnosticoCatalogoVisible: catalogoVisible,
        diagnosticos: diagnosticosSeleccionados,
        historialDiagnosticos: diagnosticosSeleccionados,
        tratamiento,
        medicoTratante: medico,
        ultimaConsulta,
        proximaConsulta,
        ...(esFormatoFray() ? datosPersistentesDesdeObservacion(datosNotaClinica.observacionFray) : {})
      });
    } catch (errorPerfil) {
      console.warn("La nota se guardo, pero no se pudo actualizar el resumen del paciente:", errorPerfil);
    }

    try {
      const pacienteActual = await obtenerUsuario(uidPaciente);
      await registrarEventoAuditoria({
        accion: esEdicionVersionada
          ? (esBorrador ? "guardar_version_borrador_nota_medica" : "guardar_version_definitiva_nota_medica")
          : eraNueva
            ? (esBorrador ? "crear_borrador_nota_medica" : "crear_nota_medica_definitiva")
            : (esBorrador ? "editar_borrador_nota_medica" : "cerrar_borrador_como_nota_definitiva"),
        modulo: "Nota medica",
        descripcion: esEdicionVersionada
          ? `El medico guardo la version ${confirmada.notaEditada?.version || confirmada.version || ""} sin sobrescribir las versiones anteriores.`
          : esBorrador
            ? (eraNueva ? "El medico creo un borrador clinico." : "El medico actualizo el mismo borrador clinico.")
            : (eraNueva ? "El medico creo y cerro una nota definitiva." : "El medico convirtio el borrador existente en nota definitiva."),
        usuarioUid: auth.currentUser.uid,
        usuarioNombre: notaPayload.usuarioNombre,
        usuarioRol: perfilMedicoActual.rol || "",
        pacienteUid: uidPaciente,
        pacienteNombre: obtenerNombrePacienteParaMostrar(pacienteActual || {}) || "",
        exito: true,
        detalles: {
          notaId: confirmada.id,
          estadoNota,
          tipoNota: datosNotaClinica.tipoNota || "",
          formatoNota: datosNotaClinica.formatoNota || "cognicion",
          version: confirmada.version || 1
        }
      });
    } catch (errorAuditoria) {
      console.error("La nota se guardo, pero fallo el registro de auditoria:", errorAuditoria);
    }

    marcarNotaGuardada();
    btnCancelarEdicion?.classList.remove("oculto");
    if (!esBorrador) establecerModoLecturaNota(true);
    await cargarHistorial(uidPaciente);
    alert(esBorrador
      ? (esEdicionVersionada
          ? `Version ${confirmada.notaEditada?.version || confirmada.version} guardada como borrador y verificada en Firebase.`
          : `Borrador ${eraNueva ? "guardado" : "actualizado"} y verificado en Firebase.`)
      : (esEdicionVersionada
          ? `Version ${confirmada.notaEditada?.version || confirmada.version} definitiva guardada sin sobrescribir el historial.`
          : "Nota definitiva cerrada y verificada en Firebase. Quedo en modo lectura."));
  } catch (error) {
    console.error(`Error al ${esBorrador ? "guardar borrador" : "cerrar nota definitiva"}:`, error);
    guardarRespaldoTemporalNota();
    const codigo = error?.code || "";
    let mensaje = "No se pudo guardar la nota. El contenido permanece en pantalla.";
    if (error?.message === "PERMISO_PACIENTE" || codigo === "permission-denied") mensaje = "No tienes permiso para guardar notas de este paciente.";
    else if (error?.message === "FORMATO_NO_AUTORIZADO") mensaje = "No tienes autorizacion para usar este formato institucional.";
    else if (error?.message === "CONTENIDO_CLINICO_REQUERIDO") mensaje = "Falta contenido clinico: captura al menos un apartado de la nota antes de cerrarla.";
    else if (codigo === "unauthenticated") mensaje = "La sesion expiro. Inicia sesion nuevamente; el contenido permanece en pantalla.";
    else if (["unavailable", "deadline-exceeded"].includes(codigo)) mensaje = "No hay conexion con Firebase. Se conservo un respaldo temporal y el contenido sigue en pantalla.";
    else if (/definitiva|bloqueada|cerrada/i.test(error?.message || "")) mensaje = error.message;
    alert(mensaje);
  } finally {
    if (boton) {
      boton.disabled = estadoNotaActual === "definitiva";
      boton.textContent = textoOriginal;
      boton.removeAttribute("aria-busy");
    }
  }
}

window.guardarBorradorNota = function() {
  return guardarNotaClinicaSeguro("borrador");
};

window.guardarNotaDefinitiva = function() {
  return guardarNotaClinicaSeguro("definitiva");
};

window.guardarNotaMedica = function() {
  return guardarNotaClinicaSeguro("definitiva");
};

async function cargarHistorial(uidPaciente) {
  const contenedor = document.getElementById("historialNotas");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  notasHistorial = {};
  notasHistorialOrdenadas = [];

  let notas;
  try {
    notas = await obtenerHistorialNotas(uidPaciente);
  } catch (error) {
    console.error("Error al cargar historial de notas:", error);
    contenedor.innerHTML = `
      <p style="color:#ffb4b4">
        No se pudo cargar el historial de notas. Revisa permisos o conexión.
      </p>
    `;
    return;
  }

  if (notas.empty) {
    contenedor.innerHTML = `
      <p style="color:#999">
        No hay notas registradas
      </p>
    `;
    return;
  }

  notas.forEach((nota) => {
    const datos = nota.data();
    notasHistorial[nota.id] = datos;
    notasHistorialOrdenadas.push({ id: nota.id, datos });

    const fecha = fechaNotaHistorial(datos);

    const fechaTexto = fecha.toLocaleDateString("es-MX");

    const horaTexto = fecha.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const notaVigente = datosVigentesNota(datos);
    const estadoNota = estadoPersistidoNota(datos);
    const estadoTexto = estadoNota === "borrador" ? "Borrador" : "Definitiva";
    const versionesEditadas = estadoNota === "borrador" ? [] : versionesEditadasNota(datos);
    const notaPrincipalHistorial = estadoNota === "borrador" ? notaVigente : datos;
    const accionesNota = estadoNota === "borrador" ? `
      <button type="button" class="boton-secundario" onclick="continuarBorradorDesdeHistorial('${nota.id}')">
        Continuar borrador
      </button>
      <button type="button" class="boton-secundario" onclick="cargarNotaComoBorrador('${nota.id}')">
        Usar como borrador (nueva nota)
      </button>
    ` : `
      <button type="button" class="boton-secundario" onclick="cargarNotaComoBorrador('${nota.id}')">
        Usar como borrador (nueva nota)
      </button>
      <button type="button" class="boton-secundario" onclick="editarNotaDesdeHistorial('${nota.id}')">
        Editar esta nota
      </button>
    `;
    const accionSolicitarEliminacion = `
      <button type="button" class="boton-secundario" onclick="solicitarEliminarNotaDesdeHistorial('${nota.id}')">
        Solicitar eliminacion
      </button>
    `;

    let diagnosticosTexto = "";

    if (Array.isArray(notaVigente.historialDiagnosticos)) {
      diagnosticosTexto = notaVigente.historialDiagnosticos
        .map((dx) => dx.texto || "")
        .join("<br>");
    } else if (typeof notaVigente.diagnostico === "object" && notaVigente.diagnostico !== null) {
      diagnosticosTexto = notaVigente.diagnostico.texto || "";
    } else {
      diagnosticosTexto = notaVigente.diagnostico || "";
    }

    contenedor.innerHTML += `
      <details style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:22px;
        margin-bottom:20px;
      ">

        <summary style="
          cursor:pointer;
          font-size:18px;
          font-weight:bold;
          outline:none;
        ">
          ${fechaTexto} · ${horaTexto} · ${datos.autor || "Sin médico"} · ${estadoTexto}
        </summary>

        <div style="margin-top:20px;">

          <p><b>Diagnósticos:</b><br>
            ${diagnosticosTexto}
          </p>

          ${bloqueContenidoNota(notaPrincipalHistorial, estadoNota === "borrador" ? "Borrador actual" : "Nota original")}

          ${versionesEditadas.map((version, indice) => bloqueContenidoNota(
            version,
            `Versión ${version.version || indice + 2}${version.editadoPorNombre ? ` · ${escaparHTML(version.editadoPorNombre)}` : ""}`
          )).join("")}

          <div class="acciones-historial-nota">
            ${accionesNota}
            ${accionSolicitarEliminacion}
          </div>

        </div>

      </details>
    `;
  });

  notasHistorialOrdenadas.sort((a, b) => {
    const fechaA = fechaNotaHistorial(a.datos).getTime();
    const fechaB = fechaNotaHistorial(b.datos).getTime();
    return fechaB - fechaA;
  });
}

window.solicitarEliminarNotaDesdeHistorial = async function(notaId) {
  const nota = notasHistorial[notaId];
  if (!nota || !uidPacienteActual) {
    alert("No se pudo identificar la nota o el paciente.");
    return;
  }

  const confirmar = confirm(
    "La nota no se eliminara de inmediato. Se enviara una solicitud al administrador para su revision. ¿Deseas continuar?"
  );
  if (!confirmar) return;

  const motivoSolicitud = prompt("Motivo de la solicitud de eliminacion (opcional):") || "";
  const pacienteNombre = obtenerNombrePacienteParaMostrar(pacienteActualDatos || {}) || document.getElementById("nombre")?.value || "";

  try {
    await guardarSolicitudEliminacion({
      recursoTipo: "nota_medica",
      recursoId: notaId,
      pacienteUid: uidPacienteActual,
      pacienteNombre,
      motivoSolicitud,
      usuarioUid: auth.currentUser?.uid || uidMedicoActual,
      usuarioEmail: auth.currentUser?.email || perfilMedicoActual.email || perfilMedicoActual.correo || "",
      usuarioNombre: perfilMedicoActual.nombre || perfilMedicoActual.nombreCompleto
        || auth.currentUser?.displayName || auth.currentUser?.email || "",
      usuarioRol: rolUsuarioActual,
      pagina: window.location.pathname,
      url: window.location.href,
      userAgent: navigator.userAgent || "",
      detallesSolicitud: {
        estadoNota: estadoPersistidoNota(nota),
        fechaNota: nota.fecha || nota.fechaCreacion || "",
        autorNota: nota.autor || nota.medico || ""
      }
    });
    alert("Solicitud enviada. Ya aparece en Reportes del administrador.");
  } catch (error) {
    console.error("No se pudo solicitar la eliminacion de la nota:", error);
    alert("No se pudo enviar la solicitud de eliminacion: " + error.message);
  }
};

window.regresarDesdeNota = function() {
  if (cambiosNotaPendientes && !window.confirm("Hay cambios sin guardar. ¿Desea salir y conservar solo el respaldo temporal?")) return;
  if (cambiosNotaPendientes) guardarRespaldoTemporalNota();
  if (uidPacienteActual) {
    window.location.href = `paciente.html?id=${uidPacienteActual}`;
  } else {
    window.location.href = "medico.html";
  }
};

let contenedorPdfCognicionActivo = null;
let manejadorAfterPrintCognicion = null;

function clonarNodoPdfCognicion(nodo) {
  if (!nodo) return null;
  const clon = nodo.cloneNode(true);
  const selectorControles = "input, textarea, select";
  const controlesOrigen = nodo.matches?.(selectorControles)
    ? [nodo, ...nodo.querySelectorAll(selectorControles)]
    : [...nodo.querySelectorAll(selectorControles)];
  const controlesClon = clon.matches?.(selectorControles)
    ? [clon, ...clon.querySelectorAll(selectorControles)]
    : [...clon.querySelectorAll(selectorControles)];

  controlesOrigen.forEach((control, indice) => {
    const copia = controlesClon[indice];
    if (!copia) return;
    if (control.matches("input[type='checkbox'], input[type='radio']")) copia.checked = control.checked;
    else if (control.tagName === "SELECT") copia.selectedIndex = control.selectedIndex;
    else copia.value = control.value;
  });
  return clon;
}

function convertirControlesPdfCognicion(contenedor) {
  contenedor.querySelectorAll("button, datalist, select, input[type='hidden'], .controles-tamano-nota, .separador-vertical-nota, .pediatria-omitir")
    .forEach((elemento) => elemento.remove());

  contenedor.querySelectorAll("input:not([type='hidden']), textarea").forEach((control) => {
    const salida = document.createElement("div");
    salida.className = `valor-campo-pdf-cognicion${control.tagName === "TEXTAREA" ? " valor-textarea-pdf-cognicion" : ""}`;
    salida.textContent = control.value || "";
    control.replaceWith(salida);
  });

  contenedor.querySelectorAll(".seccion-nota-redimensionable, .panel-nota-redimensionable").forEach((seccion) => {
    seccion.style.removeProperty("height");
    seccion.style.removeProperty("min-height");
    seccion.style.removeProperty("max-height");
    seccion.style.removeProperty("overflow");
  });
  contenedor.querySelectorAll("[id]").forEach((elemento) => elemento.removeAttribute("id"));
}

function valorFirmaPdfCognicion(tarjeta, campo) {
  const selectores = {
    nombre: "[data-firma-nombre], input[id*='Firma'][id$='Nombre']",
    cargo: "[data-firma-cargo], input[id*='Firma'][id$='Cargo']",
    cedula: "[data-firma-cedula], input[id*='Firma'][id$='Cedula']"
  };
  const control = tarjeta.querySelector(selectores[campo] || "");
  return String(control?.value || control?.textContent || "").trim();
}

function obtenerFirmasPdfCognicion() {
  return [...document.querySelectorAll("#bloqueObservacionFray .seccion-firmas .firma-campo")]
    .map((tarjeta, indice) => ({
      orden: indice,
      nombre: valorFirmaPdfCognicion(tarjeta, "nombre"),
      cargo: valorFirmaPdfCognicion(tarjeta, "cargo"),
      cedula: valorFirmaPdfCognicion(tarjeta, "cedula"),
      vacia: !valorFirmaPdfCognicion(tarjeta, "nombre") &&
        !valorFirmaPdfCognicion(tarjeta, "cargo") &&
        !valorFirmaPdfCognicion(tarjeta, "cedula")
    }));
}

function crearSeccionFirmasPdfCognicion(firmas = []) {
  const firmasParaPdf = Array.isArray(firmas) ? firmas : [];
  if (!firmasParaPdf.some((firma) => firma.nombre || firma.cargo || firma.cedula)) return null;

  const seccion = document.createElement("section");
  seccion.className = "observacion-seccion pdf-firmas-seccion";

  const encabezado = document.createElement("h3");
  encabezado.textContent = "NOMBRE, FIRMA Y C\u00c9DULA PROFESIONAL DEL M\u00c9DICO QUE REALIZA Y SUPERVISA:";
  seccion.appendChild(encabezado);

  const contenedor = document.createElement("div");
  contenedor.className = "pdf-firmas";
  contenedor.style.setProperty("--columnas-firmas", String(Math.min(Math.max(firmasParaPdf.length, 1), 4)));

  firmasParaPdf.forEach((firma) => {
    const bloque = document.createElement("div");
    bloque.className = "pdf-firma";
    bloque.dataset.ordenFirmaPdf = String(firma.orden + 1);
    if (firma.vacia) {
      bloque.setAttribute("aria-hidden", "true");
      contenedor.appendChild(bloque);
      return;
    }

    if (firma.nombre) {
      const nombre = document.createElement("div");
      nombre.className = "pdf-firma-nombre";
      nombre.textContent = firma.nombre;
      bloque.appendChild(nombre);
    }
    if (firma.cargo) {
      const cargo = document.createElement("div");
      cargo.className = "pdf-firma-cargo";
      cargo.textContent = firma.cargo;
      bloque.appendChild(cargo);
    }
    if (firma.cedula) {
      const cedula = document.createElement("div");
      cedula.className = "pdf-firma-cedula";
      cedula.textContent = `C\u00e9d. Prof. ${firma.cedula}`;
      bloque.appendChild(cedula);
    }
    contenedor.appendChild(bloque);
  });

  seccion.appendChild(contenedor);
  return seccion;
}

function reemplazarFirmasPdfCognicion(contenedor) {
  const editorFirmas = contenedor.querySelector(".firmas-extra");
  if (!editorFirmas) return;
  const seccionFirmas = crearSeccionFirmasPdfCognicion(obtenerFirmasPdfCognicion());
  if (seccionFirmas) editorFirmas.replaceWith(seccionFirmas);
  else editorFirmas.remove();
}

function esperarRenderPdfCognicion() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function esperarImagenesPdfCognicion(contenedor) {
  const imagenes = [...contenedor.querySelectorAll("img")];
  await Promise.all(imagenes.map(async (imagen) => {
    if (!imagen.complete) {
      await new Promise((resolve) => {
        imagen.addEventListener("load", resolve, { once: true });
        imagen.addEventListener("error", resolve, { once: true });
      });
    }
    if (typeof imagen.decode === "function") {
      try { await imagen.decode(); } catch (error) {
        console.warn("Una imagen del PDF Cognicion no pudo decodificarse; se continuara sin bloquear la nota.", error?.name || "error");
      }
    }
  }));
}

function construirContenedorPdfCognicion() {
  const fuente = document.querySelector(".contenedor");
  if (!fuente) throw new Error("No se encontro el contenedor de la nota clinica Cognicion.");

  const documento = document.createElement("main");
  documento.className = "contenedor cognicion-pdf-documento";
  documento.setAttribute("aria-label", "Nota clinica Cognicion para PDF");

  const agregarNodo = (nodo) => {
    const clon = clonarNodoPdfCognicion(nodo);
    if (clon) documento.appendChild(clon);
    return clon;
  };
  const agregarCampo = (id) => {
    const campo = document.getElementById(id);
    if (!campo) return;
    const etiqueta = campo.previousElementSibling;
    if (etiqueta?.tagName === "LABEL" && !etiqueta.contains(campo)) agregarNodo(etiqueta);
    agregarNodo(campo);
  };

  agregarNodo(fuente.querySelector(":scope > .logo-nota"));
  agregarNodo(fuente.querySelector(":scope > h1"));
  ["tratamiento", "medico", "ultimaConsulta", "proximaConsulta"].forEach(agregarCampo);

  const bloqueObservacion = agregarNodo(document.getElementById("bloqueObservacionFray"));
  bloqueObservacion?.classList.remove("oculto");
  if (bloqueObservacion) reemplazarFirmasPdfCognicion(bloqueObservacion);
  bloqueObservacion?.querySelectorAll("details").forEach((detalle) => { detalle.open = true; });
  if (bloqueObservacion) bloqueObservacion.replaceWith(...bloqueObservacion.childNodes);

  const bloquePediatria = document.getElementById("bloquePediatriaNota");
  const omitirPediatria = document.getElementById("omitirPediatriaNota")?.checked;
  if (bloquePediatria && !bloquePediatria.classList.contains("oculto") && !omitirPediatria) {
    agregarNodo(bloquePediatria)?.classList.remove("oculto");
  }

  const tituloNota = [...fuente.children].find((elemento) => (
    elemento.tagName === "H2" && /nota interna medica/i.test(elemento.textContent || "")
  ));
  agregarNodo(tituloNota);
  const bloqueNota = tipoNota?.value === "rapida" ? bloqueNotaRapida : bloqueNotaCompleta;
  agregarNodo(bloqueNota)?.classList.remove("oculto");

  convertirControlesPdfCognicion(documento);
  return documento;
}

function limpiarContenedorPdfCognicion() {
  if (manejadorAfterPrintCognicion) {
    window.removeEventListener("afterprint", manejadorAfterPrintCognicion);
    manejadorAfterPrintCognicion = null;
  }
  document.body.classList.remove("modo-impresion-cognicion");
  contenedorPdfCognicionActivo?.remove();
  contenedorPdfCognicionActivo = null;
}

window.generarPDFNota = async function() {
  if (esFormatoFray()) {
    console.error("El generador PDF Cognicion no puede utilizarse para formatos Word.");
    alert("Selecciona PDF Cognicion para generar este documento.");
    return;
  }

  const boton = document.getElementById("btnDescargarNota");
  const textoOriginal = boton?.textContent || "Descargar nota";
  let impresionSolicitada = false;

  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Generando PDF...";
      boton.setAttribute("aria-busy", "true");
    }
    limpiarContenedorPdfCognicion();
    contenedorPdfCognicionActivo = construirContenedorPdfCognicion();
    document.body.appendChild(contenedorPdfCognicionActivo);
    document.body.classList.add("modo-impresion-cognicion");
    await esperarRenderPdfCognicion();
    if (document.fonts?.ready) await document.fonts.ready;
    await esperarImagenesPdfCognicion(contenedorPdfCognicionActivo);
    await esperarRenderPdfCognicion();

    const texto = contenedorPdfCognicionActivo.innerText.trim();
    const ancho = contenedorPdfCognicionActivo.scrollWidth;
    const alto = contenedorPdfCognicionActivo.scrollHeight;
    if (!texto) throw new Error("El contenedor temporal de la nota Cognicion esta vacio.");
    if (ancho <= 0 || alto <= 0) throw new Error("El contenedor temporal de la nota Cognicion no tiene dimensiones visibles.");

    manejadorAfterPrintCognicion = limpiarContenedorPdfCognicion;
    window.addEventListener("afterprint", manejadorAfterPrintCognicion, { once: true });
    window.print();
    impresionSolicitada = true;
  } catch (error) {
    console.error("No se pudo generar el PDF del formato Cognicion:", error);
    limpiarContenedorPdfCognicion();
    alert("No fue posible generar el PDF de la nota Cognicion. El contenido permanece sin cambios.");
  } finally {
    if (!impresionSolicitada) limpiarContenedorPdfCognicion();
    if (boton) {
      boton.disabled = false;
      boton.textContent = textoOriginal;
      boton.removeAttribute("aria-busy");
    }
  }
};

function textoWord(valor) {
  return escaparHTML(valor || "").replace(/\n/g, "<br>");
}

function fechaHoraZipNotaActual() {
  const fecha = new Date();
  return {
    horaDos: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    fechaDos: ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  };
}

let tablaCrc32Nota = null;

function obtenerTablaCrc32Nota() {
  if (tablaCrc32Nota) return tablaCrc32Nota;
  tablaCrc32Nota = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tablaCrc32Nota[i] = c >>> 0;
  }
  return tablaCrc32Nota;
}

function crc32Nota(bytes) {
  const tabla = obtenerTablaCrc32Nota();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirUint16Nota(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
}

function escribirUint32Nota(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
  buffer[offset + 2] = (valor >>> 16) & 0xff;
  buffer[offset + 3] = (valor >>> 24) & 0xff;
}

function unirBytesNota(partes, total) {
  const salida = new Uint8Array(total);
  let offset = 0;
  partes.forEach((parte) => {
    salida.set(parte, offset);
    offset += parte.length;
  });
  return salida;
}

function crearZipNotaSinCompresion(archivos) {
  const encoder = new TextEncoder();
  const { horaDos, fechaDos } = fechaHoraZipNotaActual();
  const partes = [];
  const centrales = [];
  let offset = 0;

  archivos.forEach((archivo) => {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = typeof archivo.contenido === "string"
      ? encoder.encode(archivo.contenido)
      : archivo.contenido;
    const crc = crc32Nota(contenido);
    const local = new Uint8Array(30 + nombre.length);

    escribirUint32Nota(local, 0, 0x04034b50);
    escribirUint16Nota(local, 4, 20);
    escribirUint16Nota(local, 6, 0);
    escribirUint16Nota(local, 8, 0);
    escribirUint16Nota(local, 10, horaDos);
    escribirUint16Nota(local, 12, fechaDos);
    escribirUint32Nota(local, 14, crc);
    escribirUint32Nota(local, 18, contenido.length);
    escribirUint32Nota(local, 22, contenido.length);
    escribirUint16Nota(local, 26, nombre.length);
    escribirUint16Nota(local, 28, 0);
    local.set(nombre, 30);
    partes.push(local, contenido);

    const central = new Uint8Array(46 + nombre.length);
    escribirUint32Nota(central, 0, 0x02014b50);
    escribirUint16Nota(central, 4, 20);
    escribirUint16Nota(central, 6, 20);
    escribirUint16Nota(central, 8, 0);
    escribirUint16Nota(central, 10, 0);
    escribirUint16Nota(central, 12, horaDos);
    escribirUint16Nota(central, 14, fechaDos);
    escribirUint32Nota(central, 16, crc);
    escribirUint32Nota(central, 20, contenido.length);
    escribirUint32Nota(central, 24, contenido.length);
    escribirUint16Nota(central, 28, nombre.length);
    escribirUint16Nota(central, 30, 0);
    escribirUint16Nota(central, 32, 0);
    escribirUint16Nota(central, 34, 0);
    escribirUint16Nota(central, 36, 0);
    escribirUint32Nota(central, 38, 0);
    escribirUint32Nota(central, 42, offset);
    central.set(nombre, 46);
    centrales.push(central);
    offset += local.length + contenido.length;
  });

  const inicioCentral = offset;
  centrales.forEach((central) => {
    partes.push(central);
    offset += central.length;
  });

  const fin = new Uint8Array(22);
  escribirUint32Nota(fin, 0, 0x06054b50);
  escribirUint16Nota(fin, 4, 0);
  escribirUint16Nota(fin, 6, 0);
  escribirUint16Nota(fin, 8, archivos.length);
  escribirUint16Nota(fin, 10, archivos.length);
  escribirUint32Nota(fin, 12, offset - inicioCentral);
  escribirUint32Nota(fin, 16, inicioCentral);
  escribirUint16Nota(fin, 20, 0);
  partes.push(fin);
  offset += fin.length;

  return unirBytesNota(partes, offset);
}

function crearDocxNotaDesdeHtml(html) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const archivos = [
    {
      nombre: "[Content_Types].xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="html" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
    },
    {
      nombre: "_rels/.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      nombre: "word/document.xml",
      contenido: documentXml
    },
    {
      nombre: "word/_rels/document.xml.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/>
  <Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      nombre: "word/styles.xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
  </w:style>
</w:styles>`
    },
    {
      nombre: "word/afchunk.html",
      contenido: `\ufeff${html}`
    }
  ];

  return new Blob([crearZipNotaSinCompresion(archivos)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function filaWord(etiqueta, valor) {
  return `
    <tr>
      <th>${textoWord(etiqueta)}</th>
      <td>${textoWord(valor)}</td>
    </tr>
  `;
}

function seccionWord(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    ${contenido}
  `;
}

function tablaCamposWord(filas) {
  return `<table>${filas.join("")}</table>`;
}

function nombreArchivoWordFray(datos) {
  const paciente = (datos.nombrePaciente || obtenerNombrePacienteParaMostrar(pacienteActualDatos || {}) || document.getElementById("uidPaciente")?.selectedOptions?.[0]?.textContent || "paciente")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
  const tipo = datos.tipoNota === "envio_piso"
    ? "envio_hospitalizacion_continua"
    : datos.tipoNota === "evolucion"
      ? "evolucion"
      : "ingreso";
  const fecha = datos.fechaNota || fechaLocalInputNota();
  return `Fray_Observacion_${tipo}_${paciente}_${fecha}.docx`;
}

function formatoFechaFray(fecha) {
  if (!fecha) return "";
  const partes = fecha.split("-");
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tituloNotaFray(tipo) {
  if (tipo === "envio_piso") return "NOTA DE ENVIO A HOSPITALIZACION CONTINUA";
  return tipo === "evolucion"
    ? "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN"
    : "NOTA DE INGRESO AL SERVICIO DE OBSERVACION";
}

function bloqueWordFray(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    <table class="tabla-texto">
      <tr><td>${textoWord(contenido)}</td></tr>
    </table>
  `;
}

async function recursoDataUri(ruta) {
  try {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) throw new Error("No se pudo leer el recurso");
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("No se pudo incrustar imagen en Word:", ruta, error);
    return ruta;
  }
}

async function htmlWordFrayObservacion() {
  sincronizarDiagnosticosObservacion();

  const logoSalud = await recursoDataUri("assets/fray-observacion-salud-conasama-stack.png");
  const logoFray = await recursoDataUri("assets/fray-observacion-image2.png");
  const datos = leerFormularioObservacionFray();
  const datosCognicion = leerFormularioNota();
  const diagnosticos = datos.diagnosticosCIE10.length
    ? datos.diagnosticosCIE10
    : normalizarDiagnosticosNota(diagnosticosSeleccionados).map((dx) => ({
        codigo: dx.codigo || "",
        diagnostico: `${dx.nombre || dx.texto || ""}${dx.estado ? ` — ${dx.estado}` : ""}`.trim()
      }));

  const tablaDiagnosticos = diagnosticos.length
    ? `
      <table class="tabla-diagnosticos-word">
        <thead>
          <tr><th>DIAGNÓSTICO</th><th>CIE-10</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${diagnosticos.map((dx) => textoWord(dx.diagnostico)).join("<br>")}</td>
            <td>${diagnosticos.map((dx) => textoWord(dx.codigo)).join("<br>")}</td>
          </tr>
        </tbody>
      </table>
    `
    : "<p>Sin diagnósticos CIE-10 registrados.</p>";

  const exploracionFisicaNeurologica = datos.exploracionFisicaNeurologica || "";

  const vitales = `
    <table class="tabla-vitales">
      <thead>
        <tr>
          <th>Presión arterial</th>
          <th>Temperatura</th>
          <th>Frecuencia cardíaca</th>
          <th>Frecuencia respiratoria</th>
          <th>SatO2</th>
          <th>Peso</th>
          <th>Talla</th>
          <th>IMC</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${textoWord(datos.presionArterial)}</td>
          <td>${textoWord(datos.temperatura)}</td>
          <td>${textoWord(datos.frecuenciaCardiaca)}</td>
          <td>${textoWord(datos.frecuenciaRespiratoria)}</td>
          <td>${textoWord(datos.saturacionO2)}</td>
          <td>${textoWord(datos.peso)}</td>
          <td>${textoWord(datos.talla)}</td>
          <td>${textoWord(datos.imc)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const firmas = `
    <table class="tabla-firmas">
      <tr>
        <td>${textoWord(datos.firma1Nombre)}<br>${textoWord(datos.firma1Cargo)}<br>Ced. Prof. ${textoWord(datos.firma1Cedula)}</td>
        <td>${textoWord(datos.firma2Nombre)}<br>${textoWord(datos.firma2Cargo)}<br>Ced. Prof. ${textoWord(datos.firma2Cedula)}</td>
        <td>${textoWord(datos.firma3Nombre)}<br>${textoWord(datos.firma3Cargo)}<br>Ced. Prof. ${textoWord(datos.firma3Cedula)}</td>
      </tr>
    </table>
  `;

  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
          <meta charset="UTF-8">
          <title>Nota Observación Fray Bernardino</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          
          <style>
    @page WordSection1 {
      size: 21.59cm 27.94cm;
      margin: 36.0pt 36.0pt 36.0pt 36.0pt;
    }

    div.WordSection1 {
      page: WordSection1;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 9pt;
      color: #111;
      margin: 0;
      padding: 0;
    }

        .encabezado { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 8pt; border-bottom: 1px dashed #777; }
        .encabezado td { border: none; vertical-align: middle; padding: 0 0 4pt; }
        .encabezado-logo-izq { width: 20%; text-align: left; }
        .encabezado-centro { width: 62%; text-align: center; font-weight: 700; font-size: 11pt; line-height: 1.12; text-transform: uppercase; white-space: nowrap; }
        .encabezado-logo-der { width: 14%; text-align: right; }
        .logo-salud { width: 118px; }
        .logo-fray { width: 58px; }
        h1 { text-align: center; font-size: 11.5pt; color: #7b7b7b; margin: 8pt 0 12pt; text-transform: uppercase; letter-spacing: .2pt; }
        h2 { font-size: 9.5pt; margin: 10pt 0 3pt; text-align: left; text-transform: uppercase; }
        p {
          margin: 0;
          margin-top: 0;
          margin-bottom: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
          mso-para-margin-top: 0cm;
          mso-para-margin-bottom: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
          text-align: left;
        }
        .identificacion { font-size: 8.6pt; line-height: 1.35; margin: 2pt 0 7pt; }
        .identificacion b { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 3pt 0 8pt; }
        th, td {
          border: 1px solid #222;
          padding: 4pt;
          vertical-align: top;
          text-align: left;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
        }
        .tabla-vitales { width: auto; table-layout: auto; margin: 2pt 0 6pt; }
        .tabla-vitales th,
        .tabla-vitales td {
          text-align: center;
          white-space: nowrap;
          padding: 1.4pt 3.2pt;
          margin: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-vitales th { font-size: 6.6pt; font-weight: 700; }
        .tabla-vitales td { font-size: 7.4pt; }
        .tabla-vitales th p,
        .tabla-vitales td p {
          margin: 0;
          margin-top: 0;
          margin-bottom: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
          mso-para-margin-top: 0cm;
          mso-para-margin-bottom: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-texto td { min-height: 42pt; line-height: 1.0; text-align: left; }
        .tabla-diagnosticos-word th { font-size: 8.5pt; text-align: left; }
        .tabla-diagnosticos-word th:first-child,
        .tabla-diagnosticos-word td:first-child { width: 86%; }
        .tabla-diagnosticos-word th:last-child,
        .tabla-diagnosticos-word td:last-child { width: 14%; }
        .pronostico-destino { margin-top: 6pt; }
        .tabla-firmas td { border: none; width: 33.33%; text-align: center; height: 48pt; vertical-align: bottom; font-size: 8.5pt; }
      </style>
    </head>
    <body>
        <div class="WordSection1">
          <table class="encabezado">
        <tr>
          <td class="encabezado-logo-izq">
            <img
              class="logo-salud"
              src="${logoSalud}"
              style="width:2.8cm;height:auto;"
              width="106"
            >
          </td>
          <td class="encabezado-centro">
            SECRETARÍA DE SALUD<br>
            COMISION NACIONAL DE SALUD MENTAL Y ADICCIONES<br>
            HOSPITAL PSIQUIÁTRICO "FRAY BERNARDINO ÁLVAREZ"
          </td>
          <td class="encabezado-logo-der"><img class="logo-fray" src="${logoFray}"></td>
        </tr>
      </table>

      <h1>${tituloNotaFray(datos.tipoNota)}</h1>

      <p class="identificacion">
        <b>Nombre del paciente:</b> ${textoWord(datos.nombrePaciente || obtenerNombrePacienteParaMostrar(pacienteActualDatos || {}))}
           <b>Fecha de nacimiento:</b> ${textoWord(formatoFechaFray(datos.fechaNacimiento))}
           <b>Edad:</b> ${textoWord(datos.edad)} AÑOS
           <b>Cama:</b> ${textoWord(datos.cama)}
           <b>Expediente:</b> ${textoWord(datos.expediente)}
           <b>Sexo:</b> ${textoWord(datos.sexo)}
           <b>Género:</b> ${textoWord(datos.genero)}
           <b>Servicio:</b> ${textoWord(datos.servicio || "OBSERVACIÓN")}
           <b>Alergias:</b> ${textoWord(datos.alergias)}
           <b>Fecha:</b> ${textoWord(formatoFechaFray(datos.fechaNota))}
           <b>Hora:</b> ${textoWord(datos.horaNota)} H
           <b>Días estancia:</b> ${textoWord(datos.diasEstancia || datos.díasEstancia || "")}
      </p>

      ${vitales}
      ${bloqueWordFray("MOTIVO DE ATENCIÓN / ACTUALIZACIÓN DEL CUADRO CLÍNICO", datos.motivoAtencion || datosCognicion.subjetivo)}
      ${bloqueWordFray("EXPLORACIÓN FÍSICA Y NEUROLÓGICA", exploracionFisicaNeurologica)}
      ${bloqueWordFray("EXAMEN MENTAL", datos.examenMental || datosCognicion.objetivo)}
      ${bloqueWordFray("RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNÓSTICO", datos.resultadosEstudios)}
      <h2>DIAGNÓSTICOS DE ACUERDO A CIE-10 (PRIMARIO Y COMORBILIDADES)</h2>
      ${tablaDiagnosticos}
      ${bloqueWordFray("PLAN TERAPÉUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLÓGICO)", datos.planTerapeutico || datosCognicion.plan)}
      ${bloqueWordFray("COMENTARIO Y/O ANÁLISIS CLÍNICO Y FUNDAMENTACIÓN DIAGNÓSTICA Y TERAPÉUTICA", datos.comentarioAnalisis || datosCognicion.analisis)}
      <p class="pronostico-destino"><b>PRONÓSTICO:</b> ${textoWord(datos.pronostico)}</p>
      <p class="pronostico-destino"><b>DESTINO:</b> ${textoWord(datos.destino)}</p>
      <h2>NOMBRE, FIRMA Y CÉDULA PROFESIONAL DEL MÉDICO QUE REALIZA Y SUPERVISA:</h2>
      ${firmas}
      </div>
      </body>
    </html>
  `;
}

window.descargarNotaFrayObservacion = async function() {
  return window.descargarNotaSeleccionada();
};

window.descargarNotaSeleccionada = async function() {
  if (!esFormatoFray()) {
    return window.generarPDFNota();
  }
  const boton = document.getElementById("btnDescargarNota");
  const textoOriginal = boton?.textContent || "Descargar nota";
  try {
    if (boton) {
      boton.disabled = true;
      boton.textContent = "Generando Word...";
      boton.setAttribute("aria-busy", "true");
    }
    const datosNota = collectNoteData();
    const observacion = datosNota.observacionFray || {};
    const identificacion = datosInstitucionalesPaciente(pacienteActualDatos || {});
    const fecha = observacion.fechaNota || fechaLocalInputNota();
    const hora = observacion.horaNota || horaLocalInputNota();
    const tipoInstitucional = esFormatoFray()
      ? (observacion.tipoNota || "evolucion")
      : (datosNota.tipoNota || "clinica");
    const secciones = datosNota.tipoNota === "rapida"
      ? [{ titulo: "NOTA RÁPIDA", contenido: datosNota.notaRapida }]
      : [
          { titulo: "PADECIMIENTO ACTUAL / EVOLUCIÓN", contenido: datosNota.subjetivo },
          { titulo: "EXPLORACIÓN FÍSICA Y NEUROLÓGICA", contenido: observacion.exploracionFisicaNeurologica },
          { titulo: "EXAMEN MENTAL", contenido: datosNota.objetivo },
          { titulo: "RESULTADOS RELEVANTES DE ESTUDIOS", contenido: observacion.resultadosEstudios },
          { titulo: "COMENTARIO Y ANÁLISIS CLÍNICO", contenido: datosNota.analisis },
          { titulo: "PLAN", contenido: datosNota.plan },
          { titulo: "TRATAMIENTO E INDICACIONES", contenido: datosNota.tratamiento },
          { titulo: "PRONÓSTICO", contenido: observacion.pronostico },
          { titulo: "DESTINO", contenido: observacion.destino }
        ];
    Object.entries(datosNota.camposDinamicos || {}).forEach(([clave, contenido]) => {
      if (String(contenido || "").trim()) secciones.push({ titulo: clave.replace(/[_-]+/g, " ").toUpperCase(), contenido });
    });

    const recursos = [];
    for (const ruta of ["assets/fray-observacion-salud-conasama-stack.png", "assets/fray-observacion-image2.png"]) {
      try {
        const respuesta = await fetch(ruta);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        recursos.push({ bytes: new Uint8Array(await respuesta.arrayBuffer()), extension: "png" });
      } catch (errorRecurso) {
        console.warn("El logotipo no se pudo incluir; el Word se generara sin ese recurso:", ruta, errorRecurso);
      }
    }

    const documento = crearDocumentoWordFray({
      institucion: 'HOSPITAL PSIQUIÁTRICO "FRAY BERNARDINO ÁLVAREZ"',
      titulo: esFormatoFray() ? tituloNotaFray(tipoInstitucional) : "NOTA CLÍNICA",
      servicio: observacion.servicio || datosNota.servicio || "",
      fecha: formatoFechaFray(fecha),
      hora,
      fechaHora: `${formatoFechaFray(fecha)} ${hora}`.trim(),
      estadoNota: estadoNotaActual === "nueva" ? "Sin guardar" : estadoNotaActual,
      paciente: {
        nombre: observacion.nombrePaciente || identificacion.nombrePaciente,
        expediente: observacion.expediente || identificacion.expediente,
        fechaNacimiento: formatoFechaFray(observacion.fechaNacimiento || identificacion.fechaNacimiento),
        edad: observacion.edad || identificacion.edad,
        sexo: observacion.sexo || identificacion.sexo,
        genero: observacion.genero || identificacion.genero,
        alergias: observacion.alergias || identificacion.alergias,
        cama: observacion.cama || identificacion.cama,
        diasEstancia: observacion.diasEstancia || identificacion.diasEstancia
      },
      vitales: {
        presionArterial: observacion.presionArterial,
        temperatura: observacion.temperatura,
        frecuenciaCardiaca: observacion.frecuenciaCardiaca,
        frecuenciaRespiratoria: observacion.frecuenciaRespiratoria,
        saturacionO2: observacion.saturacionO2,
        peso: observacion.peso,
        talla: observacion.talla,
        imc: observacion.imc
      },
      medico: {
        nombre: datosNota.medicoResponsable,
        cargo: observacion.firma1Cargo || perfilMedicoActual.cargo || "",
        especialidad: perfilMedicoActual.especialidad || "",
        cedula: observacion.firma1Cedula || perfilMedicoActual.cedulaProfesional || perfilMedicoActual.cedula || ""
      },
      secciones,
      diagnosticos: observacion.diagnosticosCIE10?.length
        ? observacion.diagnosticosCIE10
        : datosNota.diagnosticos,
      firmas: [1, 2, 3].map((indice) => ({
        nombre: observacion[`firma${indice}Nombre`] || (indice === 1 ? datosNota.medicoResponsable : ""),
        cargo: observacion[`firma${indice}Cargo`] || "",
        especialidad: indice === 1 ? perfilMedicoActual.especialidad || "" : "",
        cedula: observacion[`firma${indice}Cedula`] || ""
      }))
    }, recursos);
    if (!(documento instanceof Blob) || documento.size < 1000) throw new Error("El generador produjo un archivo Word incompleto.");

    const nombrePaciente = observacion.nombrePaciente || identificacion.nombrePaciente || "Paciente";
    const partesNombre = nombrePaciente.trim().split(/\s+/);
    const nombreArchivo = nombreSeguroNotaWord({
      tipoNota: tipoInstitucional,
      apellidoPaciente: partesNombre.length > 1 ? partesNombre[partesNombre.length - 1] : partesNombre[0],
      fecha
    });
    const url = URL.createObjectURL(documento);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.style.display = "none";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    alert(`Documento Word generado correctamente: ${nombreArchivo}`);
  } catch (error) {
    console.error("Error al generar o descargar la nota Word:", error);
    let mensaje = "No se pudo generar el documento Word. La nota permanece intacta.";
    if (/paciente/i.test(error?.message || "")) mensaje = "No se pudieron obtener los datos del paciente para el documento Word.";
    else if (/incompleto|zip|xml|documento/i.test(error?.message || "")) mensaje = "No se pudo construir un archivo Word valido. La nota permanece intacta.";
    else if (typeof Blob === "undefined" || typeof URL?.createObjectURL !== "function") mensaje = "El navegador no admite la descarga de documentos Word.";
    alert(mensaje);
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = textoOriginal;
      boton.removeAttribute("aria-busy");
    }
  }
};
