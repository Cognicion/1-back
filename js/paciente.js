import { auth, db } from "./firebase.js";
import {
  MEDICAMENTOS_PRESENTACIONES,
  MEDICAMENTOS_MAESTROS,
  buscarMedicamentos,
  medicamentoPorTexto
} from "./data/catalogoFarmacologicoUnificado.js?v=20260811-pharmacology-files-consolidated-v1";
import { CIE10, CIE11 } from "./data/catalogoDiagnosticos.js?v=20260811-diagnosticos-unificados-v1";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import {
  detectarAlertasClinicasMedicamentos,
  detectarInteraccionesFarmacologicas
} from "./data/interaccionesFarmacologicas.js";
import {
  aplicarPermisosFormatosPagina,
  obtenerPermisosFormatosUsuario,
  usuarioPuedeUsarFormato,
  resolverFormatoSolicitud,
  FORMATO_SOLICITUD_IMAGENOLOGIA,
  FORMATO_SOLICITUD_LABORATORIO_FRAY
} from "./services/formatosInstitucionales.js?v=20260813-hugo-wilson-brand-assets-v1";
import {
  CATALOGO_FRAY_ANALISIS_CLINICOS,
  CATALOGO_FRAY_ANALISIS_CLINICOS_PLANO,
  ID_FORMATO_LABORATORIO_FRAY
} from "./catalogs/catalogoLaboratorioFray.js";
import { renderizarFormularioLaboratorioFray } from "./components/solicitudLaboratorioFray.js";
import {
  construirNombreCompletoPaciente,
  obtenerNombrePacienteParaMostrar
} from "./utils/nombresPacientes.js";
import { normalizarTextoFrecuencia } from "./utils/frecuencias.js";
import {
  ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL,
  usuarioEsEnfermeriaSaludMental
} from "./utils/roles.js";
import { calcularEdadPediatrica } from "./pediatria/edad.js";
import { calcularIMC as calcularIMCCentral } from "./utils/imc.js";
import { construirTratamientoEIndicaciones } from "./utils/tratamientoIndicaciones.js";
import { buildGrowthAssessment } from "./services/growth/growthCalculationService.js";
import {
  calcularIMC as calcularIMCPediatrico,
  mantenimientoHollidaySegar,
  superficieCorporal
} from "./pediatria/formulas.js";
import { getAuthenticatedUserOnce, getUserProfileOnce } from "./services/authContextService.js";
import { guardarTransferenciaClinicaLocal } from "./services/clinicalLocalStore.js";
import { resolverExpedienteInstitucional, formatearFechaDocumento, formatearHoraLocalDocumento } from "./services/solicitudImagenologiaPlantilla.js";
import { construirRegistroHistorialSignoVital } from "./services/signosVitalesNotas.js?v=20260810-vitals-history-write-proof-v1";
import { construirActualizacionHistorialDiagnosticos } from "./services/diagnosticosPaciente.js?v=v160-imported-diagnoses-v1";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  listarPacientes,
  medicoPuedeVer,
  actualizarUsuario,
  solicitarEliminacionPaciente,
  buscarMedicoPorCorreo,
  otorgarPermisoMedico,
  listarPermisosMedicos,
  cambiarRolPermisoMedico,
  revocarPermisoMedico
} from "./services/usuarios.js?v=20260718-patient-access";

import {
  crearTratamiento,
  listarTratamientos,
  actualizarTratamiento,
  eliminarTratamiento
} from "./services/tratamientos.js";

import {
  crearEstudio,
  listarEstudios,
  actualizarEstudio,
  eliminarEstudio
} from "./services/estudios.js";
import { listarSolicitudesImagenologia } from "./services/solicitudesImagenologia.js?v=20260728-img-request-v1";

import {
  crearNotaRapida,
  listarNotasRapidas
} from "./services/notasRapidas.js";

import {
  crearCodigoExpedienteParaPaciente,
  vincularExpedienteConCodigoPaciente
} from "./services/vinculacion.js";

let ESCALAS_PSIQUIATRICAS = [];
let ESCALAS_COGNITIVAS = [];
let crearResumenEscala = null;
let listarEscalasAplicadas = null;
console.info("[PACIENTE BUILD] diagnosticos-descartables-1.42-20260731");
console.info("[PACIENTE] módulo evaluado");

let dependenciasEscalasPacientePromise = null;

function formatearFechaEscalaFallback(valor, conHora = false) {
  if (!valor) return "Sin fecha";
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleString("es-MX", conHora ? {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  } : {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

let formatearFechaEscala = formatearFechaEscalaFallback;

async function cargarDependenciasEscalasPaciente() {
  if (!dependenciasEscalasPacientePromise) {
    dependenciasEscalasPacientePromise = Promise.all([
      import("./data/escalasPsiquiatricas.js?v=20260716-expediente-fix-2"),
      import("./data/escalasCognitivas.js?v=20260716-expediente-fix-2"),
      import("./services/escalas.js?v=20260716-expediente-fix-2")
    ]).then(([psiquiatricas, cognitivas, servicioEscalas]) => {
      ESCALAS_PSIQUIATRICAS = psiquiatricas.ESCALAS_PSIQUIATRICAS || [];
      ESCALAS_COGNITIVAS = cognitivas.ESCALAS_COGNITIVAS || [];
      crearResumenEscala = servicioEscalas.crearResumenEscala;
      formatearFechaEscala = servicioEscalas.formatearFechaEscala || formatearFechaEscalaFallback;
      listarEscalasAplicadas = servicioEscalas.listarEscalasAplicadas;

      if (typeof crearResumenEscala !== "function" || typeof listarEscalasAplicadas !== "function") {
        throw new Error("El servicio de escalas no expone las funciones requeridas.");
      }
    }).catch((error) => {
      dependenciasEscalasPacientePromise = null;
      throw error;
    });
  }

  return dependenciasEscalasPacientePromise;
}

let uidPaciente = "";
let datosPacienteActual = null;
let medicoActualDatos = {};
let rolUsuarioActual = "";

function technicalFingerprint(value = "") {
  const text = String(value || "");
  if (!text) return "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function firebaseRuntimeInfo() {
  return {
    projectId: String(db?.app?.options?.projectId || ""),
    appName: String(db?.app?.name || "")
  };
}

function patientVitalSignsPresence(patient = {}) {
  const current = patient.signosVitales || {};
  const institutional = patient.datosInstitucionales || {};
  return {
    hasPA: Boolean(patient.presionArterial ?? current.presionArterial ?? institutional.presionArterial),
    hasFC: Boolean(patient.frecuenciaCardiaca ?? current.frecuenciaCardiaca ?? institutional.frecuenciaCardiaca),
    hasFR: Boolean(patient.frecuenciaRespiratoria ?? current.frecuenciaRespiratoria ?? institutional.frecuenciaRespiratoria),
    hasTemperature: Boolean(patient.temperatura ?? current.temperatura ?? institutional.temperatura),
    hasSpO2: Boolean(patient.saturacionO2 ?? patient.saturacionOxigeno ?? current.saturacionO2 ?? current.saturacionOxigeno)
  };
}

function patientVitalHistoryCount(patient = {}) {
  return ["presionArterial", "frecuenciaCardiaca", "frecuenciaRespiratoria", "temperatura", "saturacionO2"]
    .reduce((count, field) => count + (Array.isArray(patient.historialSignosVitales?.[field]) ? patient.historialSignosVitales[field].length : 0), 0);
}

let permisosFormatosUsuarioActual = {};
let tratamientosCache = [];
let tratamientosCacheCargado = false;
let tratamientosCachePatientId = "";
let tratamientosCargaToken = 0;
let estudiosCache = [];
let solicitudesImagenologiaCache = [];
let escalasAsignadasCache = new Map();
let diagnosticosCatalogoActual = [];
let diagnosticoReemplazoIndex = null;
let diagnosticoGuardadoEnCurso = false;
let intervaloEstanciaPaciente = null;
let campoFechaIngresoModal = "fechaIngreso";
let textoIndicacionesEditado = false;
let apuntesMedicoPacienteCache = [];
let catalogoMedicosFirmasIndicacionesCache = [];
let catalogoMedicosFirmasIndicacionesPromise = null;
let indicacionesPacienteCache = [];
let indicacionResumenCacheCargada = false;
let indicacionResumenCachePacienteId = "";
let indicacionResumenCargaPromise = null;
let medicamentosRecetaActual = [];
const ID_PACIENTE_BORRADOR_NUEVO = "__nuevo_paciente__";
let draftClinicoNuevoInicializado = false;

function contextoNuevoPacienteDraft() {
  return window.COGNICION_NUEVO_PACIENTE_DRAFT || null;
}

function modoNuevoPacienteDraft() {
  return Boolean(contextoNuevoPacienteDraft());
}

function asegurarEstructuraDraftClinico() {
  const draft = contextoNuevoPacienteDraft();
  if (!draft) return null;
  draft.datosPersonales = draft.datosPersonales || {};
  draft.diagnosticos = Array.isArray(draft.diagnosticos) ? draft.diagnosticos : [];
  draft.tratamiento = draft.tratamiento || {};
  draft.tratamiento.medicamentos = Array.isArray(draft.tratamiento.medicamentos)
    ? draft.tratamiento.medicamentos
    : [];
  draft.tratamiento.indicaciones = Array.isArray(draft.tratamiento.indicaciones)
    ? draft.tratamiento.indicaciones
    : [];
  draft.datosClinicosResumen = draft.datosClinicosResumen || {};
  return draft;
}

function sincronizarDatosPacienteDesdeDraft() {
  const draft = asegurarEstructuraDraftClinico();
  if (!draft) return;
  const diagnosticoPrincipal = draft.diagnosticos.find((dx) => dx && dx.estado !== ESTADO_DIAGNOSTICO_DESCARTADO) || "";
  datosPacienteActual = {
    ...(datosPacienteActual || {}),
    ...(draft.datosPersonales || {}),
    diagnostico: diagnosticoPrincipal,
    historialDiagnosticos: draft.diagnosticos,
    tratamiento: draft.datosClinicosResumen.tratamientoActivo || "",
    indicacionesEstructuradas: draft.tratamiento.indicaciones[0]?.indicaciones || draft.indicacionesEstructuradas || null,
    datosClinicosResumen: {
      ...(draft.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal || null,
      historialDiagnosticos: draft.diagnosticos
    }
  };
}

function sincronizarDraftTratamientoResumen() {
  const draft = asegurarEstructuraDraftClinico();
  if (!draft) return;
  const activos = tratamientosCache.filter(esTratamientoVigente);
  const resumen = activos.map((t) =>
    formatearIndicacionTratamientoConCambio(t, true)
  ).filter(Boolean).join("\n");
  draft.tratamiento.medicamentos = tratamientosCache;
  draft.datosClinicosResumen = {
    ...(draft.datosClinicosResumen || {}),
    tratamientoActivo: resumen,
    tratamientosActivos: activos,
    medicamentosDosisDia: activos.map((t) => ({
      medicamento: t.medicamento || "",
      dosisDia: t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || "",
      cantidadTotalDia: t.cantidadTotalDia || ""
    })),
    fechaActualizacionTratamiento: new Date().toISOString()
  };
  sincronizarDatosPacienteDesdeDraft();
}
const VISTAS_DATOS_GENERALES_PACIENTE = Object.freeze({
  CLASICA: "clasica",
  LABORATORIO: "laboratorio"
});
let estudiosSolicitudActual = [];
const estadoSolicitud = {
  formatoId: "cognicion",
  categoria: "laboratorio",
  medicoSolicitanteId: "",
  medicoAdscritoId: "",
  modoSolicitante: "catalogo",
  modoAdscrito: "catalogo",
  manualSolicitante: { nombre: "", cargo: "", cedula: "" },
  manualAdscrito: { nombre: "", cargo: "", cedula: "" },
  estudiosFrayLaboratorio: [],
  frayLaboratorio: {
    tipo: "Ordinario",
    derechohabiencia: "Sin registro",
    sospechaDiagnostica: "",
    motivoUrgencia: "",
    observaciones: "",
    consentimientoHiv: false,
    cultivo: ""
  }
};
let solicitudImagenologiaModulePromise = null;
let solicitudImagenologiaActiva = null;
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";
let catalogoManualDiagnosticos = cargarCatalogoManualDiagnosticos();
const CLAVE_MEDICAMENTOS_MANUALES = "cognicion_catalogo_medicamentos_manual";
let catalogoManualMedicamentos = cargarCatalogoManualMedicamentos();
const CLAVE_CATALOGOS_INDICACIONES = "cognicion_catalogos_indicaciones";
const ETIQUETAS_CAMBIO_TRATAMIENTO = {
  aumenta: "Aumenta",
  disminuye: "Disminuye",
  pendiente_familiar: "Pendiente traer por el familiar",
  se_suspende: "Se suspende",
  otro: "Otro"
};
const CAMBIOS_TRATAMIENTO_PERMITIDOS = new Set(["", ...Object.keys(ETIQUETAS_CAMBIO_TRATAMIENTO)]);
const CATALOGOS_INDICACIONES_DEFAULT = {
  dieta: ["NORMAL", "BLANDA", "LIQUIDA", "HIPOSODICA", "DIABETICA"],
  cuidados: [
    "Signos vitales por turno y cuidados generales por enfermeria",
    "Signos vitales por turno",
    "Cuidados generales por enfermeria",
    "Signos vitales cada 8 horas",
    "Signos vitales cada 6 horas"
  ],
  alergias: ["Negadas", "No conocidas"],
  riesgoCaida: ["BAJO", "MEDIO", "ALTO"],
  vigilancia: ["RIESGO SUICIDA", "RIESGO HETEROAGRESIVO", "RIESGO DE FUGA", "RIESGO DE AUTOLESION"]
};
let catalogosIndicaciones = cargarCatalogosIndicaciones();
const CATALOGO_SOLICITUD_ESTUDIOS = {
  laboratorio: [
    "Biometria hematica completa",
    "Quimica sanguinea",
    "Glucosa",
    "Urea",
    "Creatinina",
    "Electrolitos sericos",
    "Sodio",
    "Potasio",
    "Cloro",
    "Calcio",
    "Pruebas de funcion hepatica",
    "Perfil de lipidos",
    "Hemoglobina glucosilada",
    "Examen general de orina",
    "Prueba de embarazo",
    "Perfil tiroideo",
    "TSH",
    "T4 libre",
    "Vitamina B12",
    "Acido folico",
    "Niveles sericos de litio",
    "Niveles sericos de valproato",
    "Prolactina",
    "VIH",
    "VDRL",
    "Toxicologico en orina"
  ],
  imagen: [
    "TAC simple de craneo",
    "TAC contrastada de craneo",
    "Resonancia magnetica de encefalo",
    "Electroencefalograma",
    "Radiografia de torax",
    "Ultrasonido abdominal",
    "Electrocardiograma",
    "Ecocardiograma"
  ]
};

ejecutarSeguroPaciente("monitoreo de sesin del expediente", () => iniciarMonitoreoSesion("Expediente paciente"));

function diferirPaciente(callback, timeout = 600) {
  if (typeof callback !== "function") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: Math.max(timeout, 1200) });
    return;
  }
  window.setTimeout(callback, timeout);
}

function debouncePaciente(callback, espera = 180) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), espera);
  };
}

function cargarReporteGlobalDiferido() {
  diferirPaciente(() => {
    import("./reportes.js").catch((error) => {
      console.warn("No se pudo cargar el widget global de reportes", error);
    });
  }, 1000);
}

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

function textoBusquedaCatalogoDiagnostico(diagnostico = {}) {
  return [diagnostico.codigo, diagnostico.nombre, ...(diagnostico.aliases || [])]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function prioridadCoincidenciaDiagnostico(diagnostico = {}, consulta = "") {
  const codigo = String(diagnostico.codigo || "").toLowerCase();
  const nombre = String(diagnostico.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (codigo === consulta) return 0;
  if (codigo.startsWith(consulta)) return 1;
  if (nombre.startsWith(consulta)) return 2;
  return 3;
}

function cargarCatalogoManualMedicamentos() {
  try {
    const guardado = localStorage.getItem(CLAVE_MEDICAMENTOS_MANUALES);
    const datos = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo manual de medicamentos", error);
    return [];
  }
}

function guardarCatalogoManualMedicamentos() {
  localStorage.setItem(CLAVE_MEDICAMENTOS_MANUALES, JSON.stringify(catalogoManualMedicamentos));
}

function catalogoMedicamentosTratamiento() {
  return [
    ...MEDICAMENTOS_PRESENTACIONES,
    ...catalogoManualMedicamentos
  ];
}

function cargarCatalogosIndicaciones() {
  try {
    const guardado = localStorage.getItem(CLAVE_CATALOGOS_INDICACIONES);
    const datos = guardado ? JSON.parse(guardado) : {};

    return Object.fromEntries(
      Object.entries(CATALOGOS_INDICACIONES_DEFAULT).map(([clave, valores]) => [
        clave,
        Array.from(new Set([...(Array.isArray(datos[clave]) ? datos[clave] : []), ...valores]))
      ])
    );
  } catch (error) {
    console.warn("No se pudieron cargar los catalogos de indicaciones", error);
    return { ...CATALOGOS_INDICACIONES_DEFAULT };
  }
}

function guardarCatalogosIndicaciones() {
  localStorage.setItem(CLAVE_CATALOGOS_INDICACIONES, JSON.stringify(catalogosIndicaciones));
}

function renderizarCatalogosIndicaciones() {
  const mapas = {
    dieta: "catalogoIndicacionesDieta",
    cuidados: "catalogoIndicacionesCuidados",
    alergias: "catalogoIndicacionesAlergias",
    riesgoCaida: "catalogoIndicacionesRiesgoCaida",
    vigilancia: "catalogoIndicacionesVigilancia"
  };

  Object.entries(mapas).forEach(([clave, id]) => {
    const lista = document.getElementById(id);
    if (!lista) return;

    lista.innerHTML = (catalogosIndicaciones[clave] || [])
      .map((valor) => `<option value="${escaparHTML(valor)}"></option>`)
      .join("");
  });
}

function agregarValorCatalogoIndicaciones(clave, inputId) {
  const valor = valorCampo(inputId).trim();

  if (!valor) {
    alert("Escribe un valor para agregarlo al catalogo.");
    return;
  }

  const actuales = catalogosIndicaciones[clave] || [];
  const existe = actuales.some((item) => item.toLowerCase() === valor.toLowerCase());

  if (!existe) {
    catalogosIndicaciones[clave] = [...actuales, valor].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
    guardarCatalogosIndicaciones();
    renderizarCatalogosIndicaciones();
  }

  alert("Valor agregado al catalogo.");
}

function formatearDiagnostico(diagnostico) {
  if (!diagnostico) return "Sin diagnostico";

  if (typeof diagnostico === "string") {
    return diagnostico.trim() || "Sin diagnostico";
  }

  if (typeof diagnostico === "object") {
    const codigo = diagnostico.codigo ? `${diagnostico.codigo} - ` : "";
    const texto =
      diagnostico.texto ||
      diagnostico.nombre ||
      diagnostico.descripcion ||
      "";

    const base = `${codigo}${texto}`.trim();
    const estado = diagnostico.estado ? ` , ${diagnostico.estado}` : "";
    return `${base}${estado}`.trim() || "Sin diagnostico";
  }

  return String(diagnostico);
}

function claveDiagnostico(diagnostico) {
  if (!diagnostico) return "";

  if (typeof diagnostico === "object") {
    return [
      diagnostico.codigo || "",
      diagnostico.texto || "",
      diagnostico.nombre || ""
    ].join("|");
  }

  return String(diagnostico);
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";

  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }

  return edad >= 0 ? edad : "";
}

function obtenerFechaNacimiento(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return (
    datos.fechaNacimiento ||
    institucional.fechaNacimiento ||
    datos.fecha_nacimiento ||
    datos.fechaDeNacimiento ||
    datos.fechaNac ||
    datos.nacimiento ||
    ""
  );
}

function obtenerFechaIngreso(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return (
    datos.fechaIngreso ||
    institucional.fechaIngreso ||
    datos.fecha_ingreso ||
    datos.ingreso ||
    ""
  );
}

function obtenerUltimoIngreso(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return (
    datos.ultimoIngreso ||
    institucional.ultimoIngreso ||
    datos.fechaUltimoIngreso ||
    institucional.fechaUltimoIngreso ||
    ""
  );
}

function normalizarFechaIngreso(valor = "") {
  const limpio = String(valor).trim();
  if (!limpio) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio;

  const coincidencia = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(limpio);
  if (!coincidencia) return limpio;

  const [, dia, mes, anio, hora = "00", minuto = "00"] = coincidencia;
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`;
}

function partesFechaIngreso(valor = "") {
  const normalizada = normalizarFechaIngreso(valor);
  if (!normalizada) return { fecha: "", hora: "" };

  const [fecha, hora = ""] = normalizada.split("T");
  return { fecha, hora };
}

function normalizarHoraClinica(valor = "", fallback = "00:00") {
  const limpio = String(valor || "").trim();
  if (!limpio) return fallback;
  const compacta = /^(\d{1,2})(\d{2})$/.exec(limpio);
  const separada = /^(\d{1,2})(?::|\.|h)?(\d{2})?$/.exec(limpio);
  const coincidencia = compacta || separada;
  if (!coincidencia) return fallback;
  const hora = Number(coincidencia[1]);
  const minuto = Number(coincidencia[2] ?? 0);
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return fallback;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function poblarSelectorHora24h(inputOculto, valorActual = "") {
  const selectorHora = document.getElementById("ingresoPacienteHoraHH");
  const selectorMinuto = document.getElementById("ingresoPacienteHoraMM");
  const inputManual = document.getElementById("ingresoPacienteHoraManual");
  if (!inputOculto || !selectorHora || !selectorMinuto) return;

  const valor = normalizarHoraClinica(valorActual, "00:00");
  const [horaActual, minutoActual] = valor.split(":");
  selectorHora.innerHTML = Array.from({ length: 24 }, (_, h) => {
    const hora = String(h).padStart(2, "0");
    return `<option value="${hora}" ${hora === horaActual ? "selected" : ""}>${hora}</option>`;
  }).join("");
  selectorMinuto.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const minuto = String(i * 5).padStart(2, "0");
    return `<option value="${minuto}" ${minuto === minutoActual ? "selected" : ""}>${minuto}</option>`;
  }).join("");
  inputOculto.value = valor;
  if (inputManual) inputManual.value = valor;

  const sincronizarDesdeSelectores = () => {
    const hora = `${selectorHora.value || "00"}:${selectorMinuto.value || "00"}`;
    inputOculto.value = normalizarHoraClinica(hora, "00:00");
    if (inputManual) inputManual.value = inputOculto.value;
  };
  const sincronizarDesdeManual = () => {
    const hora = normalizarHoraClinica(inputManual?.value || "", inputOculto.value || "00:00");
    inputOculto.value = hora;
    const [h, m] = hora.split(":");
    selectorHora.value = h;
    const minutoRedondeado = String(Math.min(55, Math.round(Number(m) / 5) * 5)).padStart(2, "0");
    selectorMinuto.value = minutoRedondeado;
    inputOculto.value = `${selectorHora.value}:${selectorMinuto.value}`;
    if (inputManual) inputManual.value = inputOculto.value;
  };

  selectorHora.onchange = sincronizarDesdeSelectores;
  selectorMinuto.onchange = sincronizarDesdeSelectores;
  if (inputManual) inputManual.onblur = sincronizarDesdeManual;
}
function parsearFechaIngreso(fechaIngreso) {
  if (!fechaIngreso) return null;

  const valor = String(fechaIngreso);
  const fecha = valor.includes("T")
    ? new Date(valor)
    : new Date(`${valor}T00:00:00`);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function calcularDiasEstancia(fechaIngreso) {
  const ingreso = parsearFechaIngreso(fechaIngreso);
  if (!ingreso) return null;

  const diferencia = Date.now() - ingreso.getTime();
  if (diferencia < 0) return null;

  const horasTotales = Math.floor(diferencia / 3600000);
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;

  return { dias, horas, horasTotales };
}

function formatearEstancia(estancia) {
  if (!estancia) return "Sin registro";
  if (estancia.horasTotales < 1) return "Menos de 1 h";

  const partes = [];
  if (estancia.dias > 0) {
    partes.push(`${estancia.dias} día${estancia.dias === 1 ? "" : "s"}`);
  }
  partes.push(`${estancia.horas} h`);

  return partes.join(" ");
}

function actualizarEstanciaPaciente(datos = datosPacienteActual || {}) {
  const fechaIngreso = obtenerFechaIngreso(datos);
  const fechaIngresoElemento = document.getElementById("fechaIngresoPaciente");
  const estanciaElemento = document.getElementById("diasEstanciaPaciente");

  if (fechaIngresoElemento) {
    fechaIngresoElemento.innerText = formatearFecha(fechaIngreso);
  }

  const estanciaTexto = formatearEstancia(calcularDiasEstancia(fechaIngreso));
  if (estanciaElemento) {
    estanciaElemento.innerText = estanciaTexto;
  }

  const estanciaLaboratorio = document.getElementById("labEstanciaPaciente");
  if (estanciaLaboratorio) {
    estanciaLaboratorio.innerText = estanciaTexto;
  }
}

function iniciarActualizacionEstanciaPaciente() {
  if (intervaloEstanciaPaciente) {
    clearInterval(intervaloEstanciaPaciente);
  }

  actualizarEstanciaPaciente();
  intervaloEstanciaPaciente = setInterval(() => {
    actualizarEstanciaPaciente();
  }, 60000);
}

function formatearFecha(fecha) {
  if (!fecha) return "Sin registro";

  const [soloFecha, hora] = normalizarFechaIngreso(fecha).split("T");
  const partes = soloFecha.split("-");
  if (partes.length !== 3) return fecha;

  return hora ? `${partes[2]}/${partes[1]}/${partes[0]} ${hora}` : `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function claveVistaDatosGeneralesPaciente() {
  return `cognicion.paciente.${uidPaciente || "actual"}.vistaDatosGenerales`;
}

function vistaInicialDatosGeneralesPaciente() {
  return VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO;
}

function obtenerVistaDatosGeneralesPaciente() {
  return VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO;
}

function guardarVistaDatosGeneralesPaciente(vista) {
  const vistaSegura = VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO;
  try {
    localStorage.setItem(claveVistaDatosGeneralesPaciente(), vistaSegura);
  } catch (error) {
    console.warn("No se pudo guardar la vista de datos generales", error);
  }
  return vistaSegura;
}

function valorPaciente(datos, rutas, alterno = "Sin registro") {
  for (const ruta of rutas) {
    const partes = ruta.split(".");
    let actual = datos;
    for (const parte of partes) {
      actual = actual?.[parte];
    }
    if (actual !== undefined && actual !== null && String(actual).trim() !== "") {
      return actual;
    }
  }
  return alterno;
}

function listaDiagnosticosLaboratorio(datos = datosPacienteActual || {}) {
  const diagnosticos = obtenerDiagnosticosActivos(datos)
    .map((dx) => formatearDiagnostico(dx))
    .filter((dx) => dx && dx !== "Sin diagnostico");
  return diagnosticos.length ? diagnosticos : ["Sin diagnstico registrado"];
}

function listaTratamientosLaboratorio(datos = datosPacienteActual || {}) {
  void asegurarIndicacionResumenPaciente();

  const medicamentosDesdeCache = tratamientosCache
    .filter(esTratamientoVigente)
    .map((tratamiento) => formatearIndicacionTratamientoConCambio(tratamiento, true))
    .filter(Boolean);
  const tratamientosPersistidos = datos.datosClinicosResumen?.tratamientosActivos;
  const medicamentosActivos = medicamentosDesdeCache.length
    ? medicamentosDesdeCache
    : Array.isArray(tratamientosPersistidos) && tratamientosPersistidos.length
      ? tratamientosPersistidos
        .map((tratamiento) => formatearIndicacionTratamientoConCambio(tratamiento, true))
        .filter(Boolean)
      : datos.tratamiento || datos.tratamientoActual || datos.datosClinicosResumen?.tratamientoActivo || "";
  const indicacionesEstructuradas = indicacionesPacienteCache[0]?.indicaciones
    || datos.indicacionesEstructuradas
    || datos.indicacionesActuales
    || datos.datosClinicosResumen?.indicaciones
    || null;
  const tratamientoTextoLegado = datos.tratamiento
    || datos.tratamientoActual
    || datos.datosClinicosResumen?.tratamientoActivo
    || "";
  const composicion = construirTratamientoEIndicaciones({
    medicamentosActivos,
    indicacionesEstructuradas,
    tratamientoTextoLegado
  });

  console.debug("[RESUMEN] indicaciones origen:", composicion.origen);
  console.debug("[RESUMEN] indicaciones antes:", medicamentosActivos.length);
  console.debug("[RESUMEN] indicaciones después:", composicion.contenidoResumen.length);
  return composicion.contenidoResumen.length
    ? composicion.contenidoResumen
    : ["Sin tratamiento activo registrado"];
}

function textoFuenteDocxMultilinea(texto, alterno = "Sin apartado documentado en la nota.") {
  const valor = String(texto || "").trim() || alterno;
  return escaparHTML(valor).replace(/\r?\n/g, "<br>");
}

function fechaFuenteDocxNota(nota = {}) {
  const fecha = nota.fechaNotaInput || nota.fecha || "";
  const hora = nota.horaNotaInput || "";
  return [fecha, hora].filter(Boolean).join(" ") || "Fecha clínica sin registro";
}

async function cargarResumenClinicoFuenteDocx(pacienteId) {
  if (!pacienteId) return null;
  try {
    const snap = await getDocs(collection(db, "usuarios", pacienteId, "notasMedicas"));
    const notas = snap.docs
      .map((docNota) => ({ id: docNota.id, ...docNota.data() }))
      .filter((nota) => nota.importacionDocx?.importMethod === "docx-patient-transfer")
      .filter((nota) => String(nota.diagnostico || "").trim() || String(nota.tratamiento || "").trim())
      .sort((a, b) => fechaFuenteDocxNota(b).localeCompare(fechaFuenteDocxNota(a)));

    if (!notas.length) return null;
    return {
      origen: "notas_docx_verbatim",
      requiereValidacionClinica: true,
      notas: notas.map((nota) => ({
        id: nota.id,
        fechaNotaInput: nota.fechaNotaInput || "",
        horaNotaInput: nota.horaNotaInput || "",
        diagnostico: nota.diagnostico || "",
        tratamiento: nota.tratamiento || "",
        archivoFuente: nota.importacionDocx?.sourceFileName || "Documento fuente preservado"
      }))
    };
  } catch (error) {
    console.warn("No se pudo cargar el resumen clínico de notas DOCX.", error?.code || error?.message || error);
    return null;
  }
}

function cargarResumenClinicoFuenteDocxEnSegundoPlano(pacienteId, datosPaciente) {
  const pacienteIdSolicitado = String(pacienteId || "").trim();
  if (!pacienteIdSolicitado || !datosPaciente) return;

  void cargarResumenClinicoFuenteDocx(pacienteIdSolicitado).then((resumen) => {
    if (!resumen) return;
    if (pacienteIdSolicitado !== String(uidPaciente || "").trim()) return;
    if (datosPacienteActual !== datosPaciente) return;

    datosPaciente.importacionDocxResumen = resumen;
    datosPacienteActual = datosPaciente;
    ejecutarSeguroPaciente(
      "fuente clinica DOCX del resumen",
      () => renderizarVistaLaboratorioPaciente(datosPaciente)
    );
  });
}

function renderizarBloqueFuenteClinicaDocx(datos = datosPacienteActual || {}) {
  const resumen = datos.importacionDocxResumen;
  const notas = Array.isArray(resumen?.notas) ? resumen.notas : [];
  if (!notas.length) return "";

  return `
    <article class="lab-card lab-card-lista">
      <span>Diagnóstico y tratamiento fuente DOCX</span>
      <p class="texto-suave">Texto preservado de las notas importadas. Requiere validación clínica antes de registrarlo como diagnóstico activo o prescripción vigente.</p>
      ${notas.map((nota) => `
        <details>
          <summary>${escaparHTML(fechaFuenteDocxNota(nota))} · ${escaparHTML(nota.archivoFuente)}</summary>
          <p><strong>Diagnóstico documentado</strong><br>${textoFuenteDocxMultilinea(nota.diagnostico)}</p>
          <p><strong>Tratamiento documentado</strong><br>${textoFuenteDocxMultilinea(nota.tratamiento)}</p>
        </details>
      `).join("")}
    </article>
  `;
}

async function asegurarIndicacionResumenPaciente() {
  const pacienteId = String(uidPaciente || "").trim();
  if (!pacienteId) return;
  if (indicacionResumenCacheCargada && indicacionResumenCachePacienteId === pacienteId) return;
  if (indicacionResumenCargaPromise && indicacionResumenCachePacienteId === pacienteId) {
    return indicacionResumenCargaPromise;
  }

  indicacionResumenCachePacienteId = pacienteId;
  indicacionResumenCargaPromise = getDocs(query(
    collection(db, "usuarios", pacienteId, "indicaciones"),
    orderBy("fechaCreacion", "desc"),
    limit(1)
  ))
    .then((snap) => {
      if (pacienteId !== String(uidPaciente || "").trim()) return;
      indicacionesPacienteCache = snap.docs.map((docIndicacion) => ({
        id: docIndicacion.id,
        ...docIndicacion.data()
      }));
      indicacionResumenCacheCargada = true;
      renderizarVistaLaboratorioPaciente(datosPacienteActual || {});
    })
    .catch((error) => {
      if (pacienteId !== String(uidPaciente || "").trim()) return;
      indicacionResumenCacheCargada = true;
      console.warn("[RESUMEN] No se pudo cargar la última indicación estructurada.", {
        codigo: error?.code || null
      });
    })
    .finally(() => {
      if (indicacionResumenCachePacienteId === pacienteId) {
        indicacionResumenCargaPromise = null;
      }
    });

  return indicacionResumenCargaPromise;
}

function listaEstudiosLaboratorio(datos = datosPacienteActual || {}) {
  const desdeCache = estudiosCache
    .map((estudio) => estudio.nombre || estudio.tipo || estudio.resultado || estudio.resumen)
    .filter(Boolean);
  if (desdeCache.length) return desdeCache.slice(0, 4);
  const posibles = [
    ...(Array.isArray(datos.estudios) ? datos.estudios : []),
    ...(Array.isArray(datos.laboratorios) ? datos.laboratorios : []),
    ...(Array.isArray(datos.estudiosDiagnosticos) ? datos.estudiosDiagnosticos : [])
  ].map((estudio) => typeof estudio === "string" ? estudio : estudio?.nombre || estudio?.tipo || estudio?.resultado).filter(Boolean);
  return posibles.length ? posibles.slice(0, 4) : ["Sin estudios registrados"];
}

function listaTimelineLaboratorio(datos = datosPacienteActual || {}) {
  const eventos = [];
  const ingreso = obtenerFechaIngreso(datos);
  if (ingreso) eventos.push({ etiqueta: "Ingreso", valor: formatearFecha(ingreso) });
  if (datos.ultimaConsulta) eventos.push({ etiqueta: "Ultima consulta", valor: formatearFecha(datos.ultimaConsulta) });
  if (datos.proximaConsulta) eventos.push({ etiqueta: "Proxima consulta", valor: formatearFecha(datos.proximaConsulta) });
  const ultimoIngreso = obtenerUltimoIngreso(datos);
  if (ultimoIngreso) eventos.push({ etiqueta: "Ultimo ingreso", valor: formatearFecha(ultimoIngreso) });
  return eventos.length ? eventos : [{ etiqueta: "Seguimiento", valor: "Sin eventos cronolgicos registrados" }];
}

function renderizarListaLab(items) {
  return items.map((item) => `<li>${escaparHTML(String(item))}</li>`).join("");
}

const OPCIONES_SELECT_PACIENTE = {
  sexo: ["Femenino", "Masculino", "Intersexual", "No especificado", "Otro..."],
  genero: ["Femenino-CIS", "Masculino-CIS", "Mujer trans", "Hombre trans", "No binario", "Prefiere no decir", "Otro..."],
  tipoSangre: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "Desconocido", "Otro..."],
  alergias: ["Negadas", "No conocidas", "A medicamentos", "A alimentos", "A ltex", "Otro..."],
  institucionPaciente: [
    "Hospital Psiquiátrico Fray Bernardino Álvarez",
    "Hospital Psiquiátrico Infantil Juan N. Navarro",
    "Clínica privada",
    "Otra..."
  ],
  servicioInstitucional: ["Observación", "Hospitalización continua", "Consulta externa", "Urgencias", "Interconsulta", "Otro..."],
  estadoCivil: ["Soltero/a", "Casado/a", "Unión libre", "Divorciado/a", "Separado/a", "Viudo/a", "Otro..."]
};

const OPCIONES_CARGO_CLINICO = [
  "Psiquiatría",
  "Psicología",
  "Medicina interna",
  "Medicina general",
  "Cardiología",
  "Neurología",
  "Nutrición",
  "Trabajo social",
  "Enfermería",
  "Terapia ocupacional",
  "Otro..."
];

const SIGNOS_VITALES_LAB = {
  presionArterial: {
    etiqueta: "PA",
    titulo: "Presión arterial",
    rutas: ["presionArterial", "signosVitales.presionArterial", "datosInstitucionales.presionArterial"],
    unidad: "mmHg",
    tipo: "presion"
  },
  frecuenciaCardiaca: {
    etiqueta: "FC",
    titulo: "Frecuencia cardíaca",
    rutas: ["frecuenciaCardiaca", "signosVitales.frecuenciaCardiaca"],
    unidad: "lpm"
  },
  saturacionO2: {
    etiqueta: "SpO2",
    titulo: "Saturación O2",
    rutas: ["saturacionO2", "saturacionOxigeno", "signosVitales.saturacionO2", "signosVitales.saturacionOxigeno"],
    unidad: "%"
  },
  frecuenciaRespiratoria: {
    etiqueta: "FR",
    titulo: "Frecuencia respiratoria",
    rutas: ["frecuenciaRespiratoria", "signosVitales.frecuenciaRespiratoria", "datosInstitucionales.frecuenciaRespiratoria"],
    unidad: "rpm"
  },
  temperatura: {
    etiqueta: "Temp",
    titulo: "Temperatura",
    rutas: ["temperatura", "signosVitales.temperatura", "datosInstitucionales.temperatura"],
    unidad: "°C"
  },
  imc: {
    etiqueta: "IMC",
    titulo: "IMC",
    rutas: ["imc", "somatometria.imc", "signosVitales.imc", "datosInstitucionales.imc"],
    unidad: "kg/m"
  }
};

function opcionesCampoPaciente(campo) {
  return OPCIONES_SELECT_PACIENTE[campo] || [];
}

function obtenerEquipoClinicoPaciente(datos = {}) {
  return Array.isArray(datos.equipoClinico)
    ? datos.equipoClinico.filter((item) => item && (item.cargo || item.nombre))
    : [];
}

function renderizarEquipoClinicoLab(equipo = []) {
  const lista = equipo.length
    ? equipo.map((item, index) => `
        <div class="lab-equipo-item" data-equipo-index="${index}">
          <p><b>${escaparHTML(item.cargo || "Personal clínico")}:</b> ${escaparHTML(item.nombre || "Sin nombre")}</p>
        </div>
      `).join("")
    : `<p class="lab-muted">Sin integrantes registrados. Agrega personal clínico con el botón +.</p>`;

  return `
    <div class="lab-equipo-lista">
      ${lista}
      <div id="equipoClinicoPlaceholder" class="lab-equipo-placeholder"></div>
    </div>
  `;
}
function renderizarEquipoResumenPaciente(datos = {}, equipo = []) {
  if (obtenerVisibilidadResumenPaciente(datos).equipoClinico === false) {
    return renderizarDatoResumenPaciente(datos, "equipoClinico", "");
  }
  return renderizarEquipoClinicoLab(equipo);
}

function renderizarGaugeVital(clave, datos = {}) {
  const signo = SIGNOS_VITALES_LAB[clave];
  if (!signo) return "";
  const registroVisible = obtenerRegistroVisibleSignoVital(datos, clave);
  const talla = obtenerTallaPaciente(datos);
  const imcCalculado = clave === "imc"
    ? calcularIMCCentral(obtenerPesoPaciente(datos), Number(talla) > 3 ? Number(talla) / 100 : talla)
    : null;
  const valor = clave === "imc"
    ? (imcCalculado === null ? "Sin registro" : imcCalculado.toFixed(2))
    : (registroVisible?.valor || valorPaciente(datos, signo.rutas, "Sin registro"));
  const meta = registroVisible?.texto
    ? `<small class="lab-gauge-meta ${registroVisible.esHoy ? "es-hoy" : "es-ultimo"}">${escaparHTML(registroVisible.texto)}</small>`
    : "";
  return `
    <div class="lab-gauge lab-gauge-interactivo">
      <span>${escaparHTML(signo.etiqueta)}</span>
      <strong>${escaparHTML(valor)}</strong>
      ${meta}
      <div class="lab-gauge-actions">
        <button type="button" onclick="registrarSignoVitalPaciente('${clave}', {}, this)">Registrar</button>
        <button type="button" onclick="registrarSignoVitalPaciente('${clave}', { previo: true }, this)">Previo</button>
        <button type="button" onclick="abrirHistorialSignoVitalPaciente('${clave}')">Curva</button>
      </div>
    </div>
  `;
}

const VERSION_RESUMEN_EXPEDIENTE = "1.41";
const CAMPOS_RESUMEN_PACIENTE = Object.freeze({
  identificacion: [
    ["email", "Correo", "text", ["email", "correo"]],
    ["fechaNacimiento", "Fecha de nacimiento", "date", ["fechaNacimiento"]],
    ["sexo", "Sexo", "text", ["sexo"]],
    ["genero", "Género", "text", ["genero", "identidadGenero"]],
    ["curp", "CURP", "text", ["curp", "datosInstitucionales.curp"]],
    ["telefono", "Teléfono", "text", ["telefono"]]
  ],
  institucion: [
    ["institucionPaciente", "Institución", "text", ["institucionPaciente", "institucion"]],
    ["expediente", "Expediente institucional", "text", ["expediente", "numeroExpediente"]],
    ["cama", "Cama", "text", ["cama"]]
  ],
  ingreso: [
    ["fechaIngreso", "Fecha de ingreso", "date", ["fechaIngreso"]],
    ["servicioInstitucional", "Servicio", "text", ["servicioInstitucional", "servicio"]],
    ["ultimoIngreso", "Último ingreso", "date", ["ultimoIngreso"]],
    ["ultimaConsulta", "Última consulta", "date", ["ultimaConsulta"]],
    ["numeroConsultas", "Número de consultas", "number", ["numeroConsultas", "consultasTotales", "conteoConsultas"]],
    ["proximaConsulta", "Próxima consulta", "date", ["proximaConsulta"]],
    ["fechaEgreso", "Fecha de egreso", "date", ["fechaEgreso"]],
    ["tipoAtencion", "Tipo de atención", "text", ["tipoAtencion"]]
  ],
  somatometria: [
    ["peso", "Peso", "number", ["peso", "signosVitales.peso", "somatometria.peso"]],
    ["talla", "Talla", "number", ["talla", "signosVitales.talla", "somatometria.talla"]],
    ["perimetroAbdominal", "Perímetro abdominal", "number", ["perimetroAbdominal", "signosVitales.perimetroAbdominal", "somatometria.perimetroAbdominal"]]
  ],
  seguridad: [
    ["alergias", "Alergias", "textarea", ["alergias", "datosInstitucionales.alergias"]],
    ["tipoSangre", "Tipo de sangre", "text", ["tipoSangre", "datosInstitucionales.tipoSangre"]]
  ],
  equipo: [["equipoClinico", "Equipo clínico", "textarea", ["equipoClinico"]]]
});

const CAMPOS_INSTITUCION_INGRESO = Object.freeze([
  ["institucionPaciente", "Institución", "text", ["institucionPaciente", "institucion"], "Institución"],
  ["expediente", "Expediente institucional", "text", ["expediente", "numeroExpediente"], "Institución"],
  ["cama", "Cama", "text", ["cama"], "Institución"],
  ["fechaIngreso", "Fecha de ingreso", "date", ["fechaIngreso"], "Ingreso y consultas"],
  ["servicioInstitucional", "Servicio", "text", ["servicioInstitucional", "servicio"], "Ingreso y consultas"],
  ["estancia", "Estancia", "text", ["estancia"], "Ingreso y consultas"],
  ["ultimoIngreso", "Último ingreso", "date", ["ultimoIngreso"], "Ingreso y consultas"],
  ["ultimaConsulta", "Última consulta", "date", ["ultimaConsulta"], "Ingreso y consultas"],
  ["numeroConsultas", "Número de consultas", "number", ["numeroConsultas", "consultasTotales", "conteoConsultas"], "Ingreso y consultas"],
  ["proximaConsulta", "Próxima consulta", "date", ["proximaConsulta"], "Ingreso y consultas"],
  ["fechaEgreso", "Fecha de egreso", "date", ["fechaEgreso"], "Ingreso y consultas"],
  ["tipoAtencion", "Tipo de atención", "text", ["tipoAtencion"], "Ingreso y consultas"]
]);

const CAMPOS_VISIBILIDAD_RESUMEN = Object.freeze({
  institucionPaciente: "institucion",
  expediente: "expedienteInstitucional",
  cama: "cama",
  fechaIngreso: "fechaIngreso",
  servicioInstitucional: "servicio",
  estancia: "estancia",
  ultimoIngreso: "ultimoIngreso",
  ultimaConsulta: "ultimaConsulta",
  numeroConsultas: "numeroConsultas",
  proximaConsulta: "proximaConsulta",
  fechaEgreso: "fechaEgreso",
  tipoAtencion: "tipoAtencion",
  curp: "curp",
  telefono: "telefono",
  peso: "peso",
  talla: "talla",
  tipoSangre: "tipoSangre",
  institucion: "institucion",
  expedienteInstitucional: "expedienteInstitucional",
  servicio: "servicio"
});

const CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO = Object.freeze({
  institucion: "institucion",
  expedienteInstitucional: "expedienteInstitucional",
  cama: "cama",
  fechaIngreso: "fechaIngreso",
  servicio: "servicio",
  estancia: "estancia",
  ultimoIngreso: "ultimoIngreso",
  ultimaConsulta: "ultimaConsulta",
  numeroConsultas: "numeroConsultas",
  proximaConsulta: "proximaConsulta",
  fechaEgreso: "fechaEgreso",
  tipoAtencion: "tipoAtencion"
});

function resolverCampoVisibilidad(campoId) {
  return CAMPOS_VISIBILIDAD_RESUMEN[campoId] || campoId;
}

function resumenPuedeEditar() {
  return ["admin", "administrador", "medico", "psicologo", "enfermeria", "enfermero"]
    .includes(String(rolUsuarioActual || "").toLowerCase());
}

function obtenerVisibilidadResumenPaciente(datos = {}) {
  const configuracion = {
    ...(datos.datosInstitucionales?.visibilidadResumen || {}),
    ...(datos.visibilidadResumen || {})
  };
  return Object.entries(configuracion).reduce((resultado, [campoId, visible]) => {
    resultado[resolverCampoVisibilidad(campoId)] = visible;
    return resultado;
  }, {});
}

function crearIndicadorDatoOculto() {
  return '<span class="resumen-dato-oculto" title="Dato oculto en el resumen" aria-label="Dato oculto en el resumen"><span aria-hidden="true">&#128065;&#824;</span></span>';
}

function renderizarCampoResumen({ campo, valor, visibilidadResumen = {} }) {
  const campoId = resolverCampoVisibilidad(campo);
  console.debug("[VISIBILIDAD] valor leído durante render", {
    campoId,
    configuracion: visibilidadResumen?.[campoId]
  });
  if (visibilidadResumen?.[campoId] === false) {
    console.debug("[RESUMEN] campo oculto aplicado:", campoId);
    return crearIndicadorDatoOculto();
  }
  return escaparHTML(valor ?? "Sin registro");
}

function renderizarDatoResumenPaciente(datos, campo, valor) {
  return renderizarCampoResumen({
    campo,
    valor,
    visibilidadResumen: obtenerVisibilidadResumenPaciente(datos)
  });
  /* Compatibilidad con la implementación anterior, ya no ejecutada. */
  if (obtenerVisibilidadResumenPaciente(datos)[campo] === false) {
    console.debug("[RESUMEN] campo oculto aplicado:", campo);
    return '<span class="resumen-dato-oculto" title="Dato oculto en el resumen" aria-label="Dato oculto en el resumen"><span aria-hidden="true">&#128065;&#824;</span></span>';
  }
  if (obtenerVisibilidadResumenPaciente(datos)[campo] === false) {
    return '<span class="resumen-dato-oculto" title="Dato oculto en el resumen" aria-label="Dato oculto en el resumen">👁̸</span>';
  }
  return escaparHTML(valor ?? "Sin registro");
}

function debeMostrarCampoResumen(campoId, visibilidadResumen = {}) {
  return visibilidadResumen[resolverCampoVisibilidad(campoId)] !== false;
}

function renderizarDatoVertical({ campoId, etiqueta, valor, visibilidadResumen }) {
  if (!debeMostrarCampoResumen(campoId, visibilidadResumen)) return "";
  return `<div class="resumen-dato resumen-dato--vertical" data-campo-id="${escaparHTML(resolverCampoVisibilidad(campoId))}">
    <span class="resumen-dato__etiqueta">${escaparHTML(etiqueta)}</span>
    <span class="resumen-dato__valor">${escaparHTML(valor ?? "Sin registro")}</span>
  </div>`;
}

function encabezadoResumenPaciente(titulo, seccionId, editable = true) {
  return `<div class="resumen-cuadro-encabezado"><span>${escaparHTML(titulo)}</span>${editable && resumenPuedeEditar()
    ? `<button type="button" class="resumen-cuadro-editar" data-resumen-editar="${escaparHTML(seccionId)}">Editar</button>`
    : ""}</div>`;
}

function valorInicialResumenPaciente(datos, campo, rutas) {
  if (campo === "estancia") return formatearEstancia(calcularDiasEstancia(obtenerFechaIngreso(datos)));
  if (campo === "equipoClinico") {
    return obtenerEquipoClinicoPaciente(datos).map((item) => `${item.cargo || "Personal clínico"}: ${item.nombre || ""}`).join("\n");
  }
  return valorPaciente(datos, rutas, "");
}

function valorFechaEditorResumen(valor) {
  return String(valor || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function abrirEditorResumen({ seccionId, titulo, campos, valoresActuales }) {
  if (!resumenPuedeEditar()) return;
  document.getElementById("modalEditorResumenPaciente")?.remove();
  const modal = document.createElement("div");
  modal.id = "modalEditorResumenPaciente";
  modal.className = "resumen-editor-overlay";
  modal.innerHTML = `<section class="resumen-editor-card" role="dialog" aria-modal="true" aria-labelledby="tituloEditorResumen">
    <header><h3 id="tituloEditorResumen">${escaparHTML(titulo)}</h3><button type="button" data-cerrar-resumen aria-label="Cerrar">×</button></header>
    <div class="resumen-editor-campos">${campos.map(([campo, etiqueta, tipo, , grupo], index) => {
      const valor = valoresActuales[campo] || "";
      const control = tipo === "textarea"
        ? `<textarea data-resumen-campo="${campo}">${escaparHTML(valor)}</textarea>`
        : `<input data-resumen-campo="${campo}" type="${tipo}" value="${escaparHTML(tipo === "date" ? valorFechaEditorResumen(valor) : valor)}">`;
      const subtitulo = grupo && (index === 0 || campos[index - 1]?.[4] !== grupo) ? `<h4 class="resumen-editor-subtitulo">${escaparHTML(grupo)}</h4>` : "";
      const campoId = resolverCampoVisibilidad(campo);
      return `${subtitulo}<label>${escaparHTML(etiqueta)}${control}<span class="resumen-ocultar-control"><input class="resumen-ocultar-checkbox" type="checkbox" data-resumen-oculto="${campo}" ${obtenerVisibilidadResumenPaciente(datosPacienteActual || {})[campoId] === false ? "checked" : ""}><span>Ocultar este dato en el resumen</span></span></label>`;
    }).join("")}</div>
    <p class="resumen-editor-error" data-resumen-error role="alert"></p>
    <footer><button type="button" data-cerrar-resumen>Cancelar</button><button type="button" data-guardar-resumen>Guardar</button></footer>
  </section>`;
  document.body.appendChild(modal);
  const cerrar = () => modal.remove();
  modal.querySelectorAll("[data-cerrar-resumen]").forEach((boton) => boton.addEventListener("click", cerrar));
  modal.querySelector("[data-guardar-resumen]")?.addEventListener("click", async () => {
    try {
      const valores = Object.fromEntries(campos.map(([campo]) => [campo, modal.querySelector(`[data-resumen-campo="${campo}"]`)?.value || ""]));
      const visibilidad = Object.fromEntries(campos.map(([campo]) => {
        const campoId = resolverCampoVisibilidad(campo);
        const checkbox = modal.querySelector(`[data-resumen-oculto="${campo}"]`);
        const checked = Boolean(checkbox?.checked);
        const visible = !checked;
        console.debug("[VISIBILIDAD] checkbox leído", { seccionId, campoId, checked });
        return [campoId, visible];
      }));
      await guardarEditorResumen(seccionId, valores, visibilidad);
      cerrar();
    } catch (error) {
      const errorNodo = modal.querySelector("[data-resumen-error]");
      if (errorNodo) errorNodo.textContent = error.message || "No fue posible guardar el cuadro.";
    }
  });
  console.debug("[RESUMEN STEP 5] modal inicializado", { seccionId });
}

async function guardarEditorResumen(seccionId, valores, visibilidad) {
  const payloadVisibilidad = Object.fromEntries(Object.entries(visibilidad).map(([campoId, visible]) => [resolverCampoVisibilidad(campoId), visible === true]));
  const visibilidadActual = obtenerVisibilidadResumenPaciente(datosPacienteActual || {});
  const visibilidadResumen = { ...visibilidadActual, ...payloadVisibilidad };
  const valoresPersistibles = { ...valores };
  delete valoresPersistibles.estancia;
  const actualizacion = { ...valoresPersistibles, visibilidadResumen };
  console.debug("[VISIBILIDAD] payload a guardar", payloadVisibilidad);
  console.debug("[RESUMEN] visibilidad guardada:", seccionId);
  if (seccionId === "equipo") {
    actualizacion.equipoClinico = String(valores.equipoClinico || "").split(/\r?\n/).map((linea) => {
      const [cargo, ...nombre] = linea.split(":");
      return { cargo: cargo.trim(), nombre: nombre.join(":").trim() };
    }).filter((item) => item.cargo && item.nombre);
  }
  await actualizarUsuario(uidPaciente, actualizacion);
  datosPacienteActual = { ...(datosPacienteActual || {}), ...actualizacion };
  console.debug("[VISIBILIDAD] estado local actualizado", visibilidadResumen);
  renderizarCuadroResumenPaciente(seccionId);
  console.debug("[RESUMEN STEP 6] visibilidad aplicada", { seccionId });
}

function vincularEditoresResumenPaciente(contenedor) {
  contenedor.querySelectorAll("[data-resumen-editar]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const seccionId = boton.dataset.resumenEditar;
      const campos = seccionId === "institucionIngreso"
        ? CAMPOS_INSTITUCION_INGRESO
        : CAMPOS_RESUMEN_PACIENTE[seccionId] || [];
      const valoresActuales = Object.fromEntries(campos.map(([campo, , , rutas]) => [campo, valorInicialResumenPaciente(datosPacienteActual || {}, campo, rutas)]));
      abrirEditorResumen({ seccionId, titulo: boton.parentElement?.querySelector("span")?.textContent || seccionId, campos, valoresActuales });
    });
  });
}

function renderizarCuadroResumenPaciente(seccionId) {
  const cuadro = document.querySelector(`[data-resumen-cuadro="${seccionId}"]`);
  if (!cuadro) return;
  const datos = datosPacienteActual || {};
  const tipoPaciente = datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente || "privada";
  const renderizadores = {
    identificacion: () => renderizarBloqueIdentificacionLab(datos, tipoPaciente),
    institucionIngreso: () => renderizarBloqueInstitucionIngresoVertical(datos, pacienteRequiereCamposInstitucionales(tipoPaciente)),
    somatometria: () => renderizarBloqueSomatometriaLab(datos),
    seguridad: () => renderizarBloqueSeguridadLab(datos),
    equipo: () => `<article class="lab-card resumen-cuadro" data-resumen-cuadro="equipo">${encabezadoResumenPaciente("Equipo clínico", "equipo")}${renderizarEquipoClinicoLab(obtenerEquipoClinicoPaciente(datos))}<button class="lab-equipo-add" type="button" onclick="agregarEquipoClinicoPaciente()" aria-label="Agregar integrante al equipo clínico">+</button></article>`
  };
  const html = renderizadores[seccionId]?.();
  if (!html) return;
  const plantilla = document.createElement("template");
  plantilla.innerHTML = html.trim();
  const nuevoCuadro = plantilla.content.firstElementChild;
  if (!nuevoCuadro) return;
  cuadro.replaceWith(nuevoCuadro);
  vincularEditoresResumenPaciente(nuevoCuadro);
}

function renderizarBloqueIdentificacionLab(datos = {}, tipoPaciente = "privada") {
  const fechaNacimiento = obtenerFechaNacimiento(datos);
  return `<article class="lab-card resumen-cuadro" data-resumen-cuadro="identificacion">
    ${encabezadoResumenPaciente("Identificación", "identificacion")}
    <p><b>Correo:</b> ${renderizarDatoResumenPaciente(datos, "email", valorPaciente(datos, ["email", "correo"], "Sin correo"))}</p>
    <p><b>Fecha de nacimiento:</b> ${renderizarDatoResumenPaciente(datos, "fechaNacimiento", formatearFecha(fechaNacimiento))}</p>
    <p><b>Sexo:</b> ${renderizarDatoResumenPaciente(datos, "sexo", valorPaciente(datos, ["sexo"]))}</p>
    <p><b>Género:</b> ${renderizarDatoResumenPaciente(datos, "genero", valorPaciente(datos, ["genero", "identidadGenero"]))}</p>
    <p><b>CURP:</b> ${renderizarDatoResumenPaciente(datos, "curp", valorPaciente(datos, ["curp", "datosInstitucionales.curp"]))}</p>
    <p><b>Teléfono:</b> ${renderizarDatoResumenPaciente(datos, "telefono", valorPaciente(datos, ["telefono"], "Sin teléfono"))}</p>
    <p><b>Tipo:</b> ${escaparHTML(etiquetaTipoPaciente(tipoPaciente))}</p>
  </article>`;
}

function renderizarBloqueSomatometriaLab(datos = {}) {
  const peso = obtenerPesoPaciente(datos);
  const talla = obtenerTallaPaciente(datos);
  const tallaMetros = Number(talla) > 3 ? Number(talla) / 100 : talla;
  const imcCalculado = calcularIMCCentral(peso, tallaMetros);
  return `<article class="lab-card resumen-cuadro" data-resumen-cuadro="somatometria">
    ${encabezadoResumenPaciente("Somatometría", "somatometria")}
    <p><b>Peso:</b> ${renderizarDatoResumenPaciente(datos, "peso", valorPaciente(datos, ["peso", "somatometria.peso", "signosVitales.peso"], "Sin registro"))}</p>
    <p><b>Talla:</b> ${renderizarDatoResumenPaciente(datos, "talla", valorPaciente(datos, ["talla", "somatometria.talla", "signosVitales.talla"], "Sin registro"))}</p>
    <p><b>Perímetro abdominal:</b> ${renderizarDatoResumenPaciente(datos, "perimetroAbdominal", valorPaciente(datos, ["perimetroAbdominal", "somatometria.perimetroAbdominal", "signosVitales.perimetroAbdominal"], "Sin registro"))}</p>
    <p><b>IMC:</b> ${renderizarDatoResumenPaciente(datos, "imc", imcCalculado === null ? "Sin registro" : imcCalculado.toFixed(2))}</p>
    ${renderizarResumenPediatricoSeguro(datos)}
  </article>`;
}

function renderizarResumenPediatricoSeguro(datos = {}) {
  const edad = calcularEdadPediatrica(obtenerFechaNacimiento(datos));
  const edadAnios = Number(edad?.["años"] ?? edad?.["aÃ±os"]);
  if (!edad || !Number.isFinite(edadAnios) || edadAnios >= 18) return "";

  const sexo = valorPaciente(datos, ["sexo", "datosInstitucionales.sexo"], "");
  const peso = numeroDesdeTexto(valorPaciente(datos, ["peso", "somatometria.peso", "signosVitales.peso"], ""));
  const tallaNumero = numeroDesdeTexto(valorPaciente(datos, ["talla", "somatometria.talla", "signosVitales.talla"], ""));
  const tallaCm = tallaNumero > 3 ? tallaNumero : tallaNumero * 100;
  if (!sexo || !Number.isFinite(peso) || peso <= 0 || !Number.isFinite(tallaCm) || tallaCm <= 0) {
    return `<p class="lab-muted">Sin datos suficientes para calcular percentiles</p>`;
  }

  try {
    const assessment = buildGrowthAssessment({
      sexo,
      fechaNacimiento: obtenerFechaNacimiento(datos),
      pesoKg: peso,
      tallaCm,
      tallaUnidad: "cm",
      perimetroCefalico: numeroDesdeTexto(valorPaciente(datos, ["perimetroCefalico", "somatometria.perimetroCefalico"], ""))
    });
    const indicadores = assessment.indicators.filter((item) => item.status === "ready");
    if (!indicadores.length) return `<p class="lab-muted">Sin datos suficientes para calcular percentiles</p>`;
    console.debug("[RESUMEN STEP 7] pediatría aplicada");
    return `<div class="resumen-pediatrico-compacto"><b>Datos pediátricos</b>${indicadores.map((item) => `<small>${escaparHTML(item.label)}: P${Number(item.percentile).toFixed(1)} · Z ${Number(item.z).toFixed(2)}</small>`).join("")}</div>`;
  } catch (error) {
    console.error("[PACIENTE] pediatría:", { name: error?.name || null, code: error?.code || null, message: error?.message || null });
    return `<p class="lab-muted">Sin datos suficientes para calcular percentiles</p>`;
  }
}

function renderizarBloqueSeguridadLab(datos = {}) {
  return `<article class="lab-card resumen-cuadro" data-resumen-cuadro="seguridad">
    ${encabezadoResumenPaciente("Seguridad clínica", "seguridad")}
    <p><b>Alergias:</b> ${renderizarDatoResumenPaciente(datos, "alergias", valorPaciente(datos, ["alergias", "datosInstitucionales.alergias"], "Sin registro"))}</p>
    <p><b>Tipo de sangre:</b> ${renderizarDatoResumenPaciente(datos, "tipoSangre", valorPaciente(datos, ["tipoSangre", "datosInstitucionales.tipoSangre"], "Sin registro"))}</p>
  </article>`;
}

function renderizarBloqueInstitucionLab(datos = {}, mostrarInstitucional = false) {
  if (!mostrarInstitucional) return "";
  return `
    <article class="lab-card resumen-cuadro" data-resumen-cuadro="institucion">
      ${encabezadoResumenPaciente("Institución", "institucion")}
      <p><b>Institución:</b> ${renderizarDatoResumenPaciente(datos, "institucionPaciente", valorPaciente(datos, ["institucionPaciente", "institucion"]))}</p>
      <p><b>Expediente institucional:</b> ${renderizarDatoResumenPaciente(datos, "expediente", valorPaciente(datos, ["expediente", "numeroExpediente"], "Sin expediente"))}</p>
      <p><b>Cama:</b> ${renderizarDatoResumenPaciente(datos, "cama", valorPaciente(datos, ["cama"], "Sin cama"))}</p>
    </article>
  `;
}

function renderizarBloqueIngresoLab(datos = {}, mostrarInstitucional = false) {
  const fechaIngreso = obtenerFechaIngreso(datos);
  const consultas = valorPaciente(datos, ["numeroConsultas", "consultasTotales", "conteoConsultas"], "Sin registro");
  return `
    <article class="lab-card resumen-cuadro" data-resumen-cuadro="ingreso">
      ${encabezadoResumenPaciente("Ingreso y consultas", "ingreso")}
      ${mostrarInstitucional ? `
        <p><b>Fecha de ingreso:</b> ${renderizarDatoResumenPaciente(datos, "fechaIngreso", formatearFecha(fechaIngreso))}</p>
        <p><b>Servicio:</b> ${renderizarDatoResumenPaciente(datos, "servicioInstitucional", valorPaciente(datos, ["servicioInstitucional", "servicio"]))}</p>
        <p><b>Estancia:</b> <span id="labEstanciaPaciente">${escaparHTML(formatearEstancia(calcularDiasEstancia(fechaIngreso)))}</span></p>
        <p><b>Último ingreso:</b> ${renderizarDatoResumenPaciente(datos, "ultimoIngreso", formatearFecha(obtenerUltimoIngreso(datos)))}</p>
      ` : ""}
      <p><b>Última consulta:</b> ${renderizarDatoResumenPaciente(datos, "ultimaConsulta", formatearFecha(datos.ultimaConsulta) || "Sin fecha")}</p>
      <p><b>Número de consultas:</b> ${renderizarDatoResumenPaciente(datos, "numeroConsultas", consultas)}</p>
      <p><b>Próxima consulta:</b> ${renderizarDatoResumenPaciente(datos, "proximaConsulta", datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar")}</p>
    </article>
  `;
}

function renderizarVistaLaboratorioPaciente(datos = datosPacienteActual || {}) {
  const contenedor = document.getElementById("datosGeneralesLaboratorio");
  if (!contenedor || !datos) return;

  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edad = calcularEdad(fechaNacimiento);
  const tipoPaciente = datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente || "privada";
  const mostrarInstitucional = pacienteRequiereCamposInstitucionales(tipoPaciente);
  const equipoClinico = obtenerEquipoClinicoPaciente(datos);
  const diagnosticos = listaDiagnosticosLaboratorio(datos);
  const tratamientos = listaTratamientosLaboratorio(datos);
  const estudios = listaEstudiosLaboratorio(datos);
  contenedor.innerHTML = `
    <div class="lab-paciente-shell">
      <div class="lab-paciente-top">
        <div>
          <span class="lab-kicker">Resumen del expediente</span>
          <p>Datos generales integrados del expediente. Los campos vacos se muestran como sin registro.</p>
          <small class="lab-version-resumen">Versión ${VERSION_RESUMEN_EXPEDIENTE}</small>
        </div>
        <div class="lab-paciente-id">
          <span>Expediente Cognición</span>
          <strong>${escaparHTML(valorPaciente(datos, ["expedienteCognicion", "datosInstitucionales.expedienteCognicion"], "Sin expediente"))}</strong>
        </div>
      </div>

      <div class="lab-metricas-panel lab-metricas-sin-modelo">
        <div class="lab-gauge principal">
          <span>Edad</span>
          <strong>${edad !== "" ? `${escaparHTML(edad)} años` : "Sin registro"}</strong>
        </div>
        ${renderizarGaugeVital("presionArterial", datos)}
        ${renderizarGaugeVital("frecuenciaCardiaca", datos)}
        ${renderizarGaugeVital("frecuenciaRespiratoria", datos)}
        ${renderizarGaugeVital("temperatura", datos)}
        ${renderizarGaugeVital("saturacionO2", datos)}
        ${renderizarGaugeVital("imc", datos)}
      </div>
      <div class="lab-vitales-global-actions">
        <button type="button" onclick="abrirGraficaGlobalSignosVitalesPaciente()">Ver grfica de signos vitales</button>
      </div>

      <div class="lab-info-grid">
        ${renderizarBloqueIdentificacionLab(datos, tipoPaciente)}

        ${renderizarBloqueInstitucionIngresoVertical(datos, mostrarInstitucional)}

        ${renderizarBloqueSomatometriaLab(datos)}

        ${renderizarBloqueSeguridadLab(datos)}

        <article class="lab-card lab-card-lista">
          <span>Diagnsticos</span>
          <ul>${renderizarListaLab(diagnosticos)}</ul>
        </article>
        <article class="lab-card lab-card-lista">
          <span>Tratamiento activo</span>
          <ol>${renderizarListaLab(tratamientos)}</ol>
        </article>
        ${renderizarBloqueFuenteClinicaDocx(datos)}
        <article class="lab-card lab-card-lista">
          <span>Estudios</span>
          <ul>${renderizarListaLab(estudios)}</ul>
        </article>
        <article class="lab-card resumen-cuadro" data-resumen-cuadro="equipo">
          ${encabezadoResumenPaciente("Equipo clínico", "equipo")}
          ${renderizarEquipoResumenPaciente(datos, equipoClinico)}
          <button class="lab-equipo-add" type="button" onclick="agregarEquipoClinicoPaciente()" aria-label="Agregar integrante al equipo clnico">+</button>
        </article>
      </div>
    </div>
  `;
  vincularEditoresResumenPaciente(contenedor);
  console.debug("[RESUMEN STEP 4] botones consolidados");
  console.debug("[RESUMEN STEP 1] línea clínica eliminada");
  console.debug("[RESUMEN STEP 2] equipo clínico reordenado");
  console.debug("[RESUMEN STEP 3] tratamiento normalizado", { indicaciones: tratamientos.length });
}

function renderizarBloqueInstitucionIngresoLab(datos = {}, mostrarInstitucional = false) {
  if (!mostrarInstitucional) return "";
  const fechaIngreso = obtenerFechaIngreso(datos);
  const consultas = valorPaciente(datos, ["numeroConsultas", "consultasTotales", "conteoConsultas"], "Sin registro");
  return `<article class="lab-card resumen-cuadro" data-resumen-cuadro="institucionIngreso">
    ${encabezadoResumenPaciente("Institución e ingreso", "institucionIngreso")}
    <div class="resumen-subgrupo"><strong>Institución</strong>
      <p><b>Institución:</b> ${renderizarDatoResumenPaciente(datos, "institucionPaciente", valorPaciente(datos, ["institucionPaciente", "institucion"], "Sin registro"))}</p>
      <p><b>Expediente institucional:</b> ${renderizarDatoResumenPaciente(datos, "expediente", valorPaciente(datos, ["expediente", "numeroExpediente"], "Sin expediente"))}</p>
      <p><b>Cama:</b> ${renderizarDatoResumenPaciente(datos, "cama", valorPaciente(datos, ["cama"], "Sin cama"))}</p>
    </div>
    <div class="resumen-subgrupo"><strong>Ingreso y consultas</strong>
      <p><b>Fecha de ingreso:</b> ${renderizarDatoResumenPaciente(datos, "fechaIngreso", formatearFecha(fechaIngreso))}</p>
      <p><b>Servicio:</b> ${renderizarDatoResumenPaciente(datos, "servicioInstitucional", valorPaciente(datos, ["servicioInstitucional", "servicio"], "Sin servicio"))}</p>
      <p><b>Estancia:</b> <span id="labEstanciaPaciente">${escaparHTML(formatearEstancia(calcularDiasEstancia(fechaIngreso)))}</span></p>
      <p><b>Último ingreso:</b> ${renderizarDatoResumenPaciente(datos, "ultimoIngreso", formatearFecha(obtenerUltimoIngreso(datos)))}</p>
      <p><b>Última consulta:</b> ${renderizarDatoResumenPaciente(datos, "ultimaConsulta", formatearFecha(datos.ultimaConsulta) || "Sin fecha")}</p>
      <p><b>Número de consultas:</b> ${renderizarDatoResumenPaciente(datos, "numeroConsultas", consultas)}</p>
      <p><b>Próxima consulta:</b> ${renderizarDatoResumenPaciente(datos, "proximaConsulta", datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar")}</p>
      <p><b>Fecha de egreso:</b> ${renderizarDatoResumenPaciente(datos, "fechaEgreso", formatearFecha(datos.fechaEgreso) || "Sin registro")}</p>
      <p><b>Tipo de atención:</b> ${renderizarDatoResumenPaciente(datos, "tipoAtencion", valorPaciente(datos, ["tipoAtencion"], "Sin registro"))}</p>
    </div>
  </article>`;
}
function obtenerPesoPaciente(datos = {}) {
  return datos.peso || datos.signosVitales?.peso || datos.somatometria?.peso || datos.datosInstitucionales?.peso || "";
}

function renderizarFilaInstitucionIngreso(etiqueta, valor) {
  return `<p class="resumen-dato"><b class="resumen-dato__etiqueta">${etiqueta}:</b><span class="resumen-dato__valor">${valor}</span></p>`;
}

function renderizarBloqueInstitucionIngresoCorregido(datos = {}, mostrarInstitucional = false) {
  if (!mostrarInstitucional) return "";
  const fechaIngreso = obtenerFechaIngreso(datos);
  const consultas = valorPaciente(datos, ["numeroConsultas", "consultasTotales", "conteoConsultas"], "Sin registro");
  return `<article class="lab-card resumen-cuadro resumen-card--institucion-ingreso" data-resumen-cuadro="institucionIngreso">
    ${encabezadoResumenPaciente("INSTITUCIÓN E INGRESO", "institucionIngreso")}
    <div class="institucion-ingreso-grid">
      <div class="institucion-ingreso-columna">
        ${renderizarFilaInstitucionIngreso("Instituci&oacute;n", renderizarDatoResumenPaciente(datos, "institucionPaciente", valorPaciente(datos, ["institucionPaciente", "institucion"], "Sin registro")))}
        ${renderizarFilaInstitucionIngreso("Expediente institucional", renderizarDatoResumenPaciente(datos, "expediente", valorPaciente(datos, ["expediente", "numeroExpediente"], "Sin expediente")))}
        ${renderizarFilaInstitucionIngreso("Cama", renderizarDatoResumenPaciente(datos, "cama", valorPaciente(datos, ["cama"], "Sin cama")))}
      </div>
      <div class="institucion-ingreso-columna">
        ${renderizarFilaInstitucionIngreso("Fecha de ingreso", renderizarDatoResumenPaciente(datos, "fechaIngreso", formatearFecha(fechaIngreso)))}
        ${renderizarFilaInstitucionIngreso("Servicio", renderizarDatoResumenPaciente(datos, "servicioInstitucional", valorPaciente(datos, ["servicioInstitucional", "servicio"], "Sin servicio")))}
        ${renderizarFilaInstitucionIngreso("Estancia", `<span id="labEstanciaPaciente">${escaparHTML(formatearEstancia(calcularDiasEstancia(fechaIngreso)))}</span>`)}
        ${renderizarFilaInstitucionIngreso("&Uacute;ltimo ingreso", renderizarDatoResumenPaciente(datos, "ultimoIngreso", formatearFecha(obtenerUltimoIngreso(datos))))}
        ${renderizarFilaInstitucionIngreso("&Uacute;ltima consulta", renderizarDatoResumenPaciente(datos, "ultimaConsulta", formatearFecha(datos.ultimaConsulta) || "Sin fecha"))}
        ${renderizarFilaInstitucionIngreso("N&uacute;mero de consultas", renderizarDatoResumenPaciente(datos, "numeroConsultas", consultas))}
        ${renderizarFilaInstitucionIngreso("Pr&oacute;xima consulta", renderizarDatoResumenPaciente(datos, "proximaConsulta", datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar"))}
        ${renderizarFilaInstitucionIngreso("Fecha de egreso", renderizarDatoResumenPaciente(datos, "fechaEgreso", formatearFecha(datos.fechaEgreso) || "Sin registro"))}
        ${renderizarFilaInstitucionIngreso("Tipo de atenci&oacute;n", renderizarDatoResumenPaciente(datos, "tipoAtencion", valorPaciente(datos, ["tipoAtencion"], "Sin registro")))}
      </div>
    </div>
  </article>`;
}

function renderizarBloqueInstitucionIngresoVertical(datos = {}, mostrarInstitucional = false) {
  if (!mostrarInstitucional) return "";
  const visibilidadResumen = obtenerVisibilidadResumenPaciente(datos);
  const fechaIngreso = obtenerFechaIngreso(datos);
  const consultas = valorPaciente(datos, ["numeroConsultas", "consultasTotales", "conteoConsultas"], "Sin registro");
  const estancia = formatearEstancia(calcularDiasEstancia(fechaIngreso));
  return `<article class="lab-card resumen-cuadro resumen-card--institucion-ingreso" data-resumen-cuadro="institucionIngreso">
    ${encabezadoResumenPaciente("INSTITUCIÓN E INGRESO", "institucionIngreso")}
    <div class="institucion-ingreso-grid">
      <div class="institucion-ingreso-columna">
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.institucion, etiqueta: "Institución", valor: valorPaciente(datos, ["institucionPaciente", "institucion"], "Sin registro"), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.expedienteInstitucional, etiqueta: "Expediente institucional", valor: valorPaciente(datos, ["expediente", "numeroExpediente"], "Sin expediente"), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.cama, etiqueta: "Cama", valor: valorPaciente(datos, ["cama"], "Sin cama"), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.fechaIngreso, etiqueta: "Fecha de ingreso", valor: formatearFecha(fechaIngreso), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.servicio, etiqueta: "Servicio", valor: valorPaciente(datos, ["servicioInstitucional", "servicio"], "Sin servicio"), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.estancia, etiqueta: "Estancia", valor: estancia, visibilidadResumen })}
      </div>
      <div class="institucion-ingreso-columna">
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.ultimoIngreso, etiqueta: "Último ingreso", valor: formatearFecha(obtenerUltimoIngreso(datos)), visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.ultimaConsulta, etiqueta: "Última consulta", valor: formatearFecha(datos.ultimaConsulta) || "Sin fecha", visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.numeroConsultas, etiqueta: "Número de consultas", valor: consultas, visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.proximaConsulta, etiqueta: "Próxima consulta", valor: datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar", visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.fechaEgreso, etiqueta: "Fecha de egreso", valor: formatearFecha(datos.fechaEgreso) || "Sin registro", visibilidadResumen })}
        ${renderizarDatoVertical({ campoId: CAMPOS_VISIBILIDAD_INSTITUCION_INGRESO.tipoAtencion, etiqueta: "Tipo de atención", valor: valorPaciente(datos, ["tipoAtencion"], "Sin registro"), visibilidadResumen })}
      </div>
    </div>
  </article>`;
}

function obtenerTallaPaciente(datos = {}) {
  return datos.talla || datos.signosVitales?.talla || datos.somatometria?.talla || datos.datosInstitucionales?.talla || "";
}

function renderizarResumenPediatricoPaciente(datos = datosPacienteActual || {}) {
  const bloque = document.getElementById("resumenPediatriaPaciente");
  const boton = document.getElementById("btnPediatriaPaciente");
  if (!bloque) return;

  const edad = calcularEdadPediatrica(obtenerFechaNacimiento(datos));
  const esPediatrico = Boolean(edad && edad.años < 18);

  bloque.style.display = esPediatrico ? "" : "none";
  if (boton) boton.style.display = esPediatrico ? "" : "none";

  if (!esPediatrico) {
    bloque.innerHTML = "";
    return;
  }

  const peso = obtenerPesoPaciente(datos);
  const talla = obtenerTallaPaciente(datos);
  const imc = calcularIMCPediatrico(peso, talla);
  const sc = superficieCorporal(peso, talla);
  const liquidos = mantenimientoHollidaySegar(peso);

  bloque.innerHTML = `
    <label>
      Pediatra
      <button class="boton-editar-dato" onclick="abrirModuloPediatriaPaciente()">Abrir mdulo</button>
    </label>
    <div class="pediatria-resumen-grid">
      <span><b>Edad exacta</b>${escaparHTML(edad.edadCronologicaTexto)}</span>
      <span><b>Día de vida</b>${escaparHTML(String(edad.diaDeVida))}</span>
      <span><b>IMC</b>${imc ? imc.toFixed(2) : "Sin calcular"}</span>
      <span><b>SC Mosteller</b>${sc ? `${sc.mosteller.toFixed(2)} m2` : "Sin calcular"}</span>
      <span><b>Mantenimiento</b>${liquidos ? `${liquidos.mlDia.toFixed(0)} mL/día` : "Sin peso"}</span>
      <span><b>Regla 4-2-1</b>${liquidos ? `${liquidos.regla421.toFixed(1)} mL/h` : "Sin peso"}</span>
    </div>
    <small>Los percentiles se calculan solo con tablas LMS oficiales cargadas en Pediatra.</small>
  `;
}

window.abrirModuloPediatriaPaciente = function() {
  const destino = uidPaciente ? `pediatria.html?id=${encodeURIComponent(uidPaciente)}` : "pediatria.html";
  window.location.href = destino;
};

function posicionOrganoLab(id) {
  const posiciones = {
    cerebro: "left:45%;top:9%;",
    ojos: "left:56%;top:13%;",
    tiroides: "left:52%;top:24%;",
    corazon: "left:43%;top:34%;",
    pulmon: "left:56%;top:36%;",
    higado: "left:38%;top:48%;",
    rinon: "left:62%;top:54%;",
    pancreas: "left:50%;top:50%;",
    estomago: "left:43%;top:56%;",
    intestinos: "left:53%;top:62%;",
    vascular: "left:68%;top:42%;",
    nervioso: "left:24%;top:34%;",
    columna: "left:31%;top:49%;",
    piel: "left:74%;top:67%;",
    musculo: "left:30%;top:76%;",
    extremidades: "left:58%;top:80%;",
    sangre: "left:67%;top:28%;"
  };
  return posiciones[id] || "left:50%;top:50%;";
}

function abrirOrganoLaboratorioPaciente(organo = {}) {
  const panel = document.getElementById("panelOrganoLaboratorioPaciente");
  if (!panel) return;
  document.getElementById("tituloOrganoLaboratorioPaciente").textContent = organo.nombre || "Estructura";
  document.getElementById("textoOrganoLaboratorioPaciente").textContent = organo.texto || "Sin informacion registrada.";
  panel.classList.remove("oculto");
}

function cerrarOrganoLaboratorioPaciente() {
  document.getElementById("panelOrganoLaboratorioPaciente")?.classList.add("oculto");
}

function aplicarVistaDatosGeneralesPaciente(vista = obtenerVistaDatosGeneralesPaciente()) {
  const vistaSegura = VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO;
  const clasica = document.getElementById("datosGeneralesClasicos");
  const laboratorio = document.getElementById("datosGeneralesLaboratorio");
  const esLaboratorio = vistaSegura === VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO;

  clasica?.classList.toggle("oculto", esLaboratorio);
  laboratorio?.classList.toggle("oculto", !esLaboratorio);
  document.querySelectorAll("[data-vista-datos]").forEach((boton) => {
    const activo = boton.dataset.vistaDatos === vistaSegura;
    boton.classList.toggle("activo", activo);
    boton.setAttribute("aria-pressed", activo ? "true" : "false");
  });

  if (esLaboratorio) renderizarVistaLaboratorioPaciente();
}

function inicializarSelectorVistaDatosGeneralesPaciente() {
  document.querySelectorAll("[data-vista-datos]").forEach((boton) => {
    if (boton.dataset.vistaDatosInicializada === "1") return;
    boton.dataset.vistaDatosInicializada = "1";
    boton.addEventListener("click", () => {
      aplicarVistaDatosGeneralesPaciente(guardarVistaDatosGeneralesPaciente(boton.dataset.vistaDatos));
    });
  });
  aplicarVistaDatosGeneralesPaciente(obtenerVistaDatosGeneralesPaciente());
}

function valorCampo(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function ponerValor(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function ponerTexto(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = valor ?? "";
}

function ejecutarSeguroPaciente(etiqueta, tarea) {
  try {
    const resultado = typeof tarea === "function" ? tarea() : null;
    if (resultado && typeof resultado.catch === "function") {
      resultado.catch((error) => console.error(`Error en ${etiqueta}:`, error));
    }
    return resultado;
  } catch (error) {
    console.error(`Error en ${etiqueta}:`, error);
    return null;
  }
}

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function referenciaCatalogoMedicosFirmasIndicaciones(uidMedico = auth.currentUser?.uid || "") {
  if (!uidMedico) return null;
  return collection(db, "usuarios", uidMedico, "catalogoMedicosFirmas");
}

function renderizarCatalogoMedicosFirmasIndicaciones() {
  const datalist = document.getElementById("catalogoMedicosFirmasIndicaciones");
  const opciones = catalogoMedicosFirmasIndicacionesCache
    .map((medico) => {
      const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
        .filter(Boolean)
        .join("  ");
      return `<option value="${escaparHTML(medico.nombre || "")}" label="${escaparHTML(detalle)}"></option>`;
    })
    .join("");

  if (datalist) datalist.innerHTML = opciones;

  [1, 2, 3].forEach((numeroFirma) => {
    const selector = document.getElementById(`indicacionesFirma${numeroFirma}Catalogo`);
    const valorActual = selector?.value || "";
    if (!selector) return;

    selector.innerHTML = `
      <option value="">Seleccionar mdico</option>
      ${catalogoMedicosFirmasIndicacionesCache.map((medico) => {
        const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
          .filter(Boolean)
          .join(" , ");
        return `<option value="${escaparHTML(medico.id)}">${escaparHTML(medico.nombre || "Sin nombre")}${detalle ? `  ${escaparHTML(detalle)}` : ""}</option>`;
      }).join("")}
    `;
    selector.value = valorActual;
  });
}

async function cargarCatalogoMedicosFirmasIndicaciones() {
  if (catalogoMedicosFirmasIndicacionesCache.length) return catalogoMedicosFirmasIndicacionesCache;
  if (catalogoMedicosFirmasIndicacionesPromise) return catalogoMedicosFirmasIndicacionesPromise;
  const usuarioAutenticado = auth.currentUser || await getAuthenticatedUserOnce().catch(() => null);
  const ref = referenciaCatalogoMedicosFirmasIndicaciones(usuarioAutenticado?.uid || "");
  if (!ref) return [];
  catalogoMedicosFirmasIndicacionesPromise = (async () => {
    let snap;
    try {
      snap = await getDocs(query(ref, orderBy("nombre")));
    } catch (error) {
      console.warn("No se pudo ordenar el catálogo de médicos por nombre; se cargará sin orden.", error);
      snap = await getDocs(ref);
    }
    catalogoMedicosFirmasIndicacionesCache = snap.docs
      .map((docMedico) => ({ id: docMedico.id, ...docMedico.data() }))
      .sort((a, b) => normalizarTextoBusqueda(a.nombreCompleto || a.nombre || a.displayName).localeCompare(normalizarTextoBusqueda(b.nombreCompleto || b.nombre || b.displayName), "es"));
    console.debug("[SOLICITUD ESTUDIO] catálogo de médicos cargado:", catalogoMedicosFirmasIndicacionesCache.length);
    renderizarCatalogoMedicosFirmasIndicaciones();
    return catalogoMedicosFirmasIndicacionesCache;
  })();
  try {
    return await catalogoMedicosFirmasIndicacionesPromise;
  } finally {
    catalogoMedicosFirmasIndicacionesPromise = null;
  }
}

function buscarMedicoFirmaIndicacionesPorNombre(nombre) {
  const clave = normalizarTextoBusqueda(nombre);
  if (!clave) return null;

  return catalogoMedicosFirmasIndicacionesCache.find((medico) =>
    normalizarTextoBusqueda(medico.nombre) === clave
  ) || null;
}

function aplicarMedicoFirmaIndicaciones(numeroFirma, medico) {
  if (!medico) return;

  ponerValor(`indicacionesFirma${numeroFirma}Nombre`, medico.nombre || "");
  ponerValor(`indicacionesFirma${numeroFirma}Cargo`, medico.cargo || "");
  ponerValor(`indicacionesFirma${numeroFirma}Cedula`, medico.cedula || "");
}

function aplicarMedicoFirmaIndicacionesPorId(numeroFirma, medicoId) {
  const medico = catalogoMedicosFirmasIndicacionesCache.find((item) => item.id === medicoId);
  if (medico) aplicarMedicoFirmaIndicaciones(numeroFirma, medico);
}

async function guardarMedicoFirmaIndicaciones(numeroFirma) {
  const uidMedico = auth.currentUser?.uid;
  const ref = referenciaCatalogoMedicosFirmasIndicaciones();
  const nombre = valorCampo(`indicacionesFirma${numeroFirma}Nombre`);
  const cargo = valorCampo(`indicacionesFirma${numeroFirma}Cargo`);
  const cedula = valorCampo(`indicacionesFirma${numeroFirma}Cedula`);

  if (!ref || !uidMedico) {
    alert("No se pudo identificar al mdico para guardar el catlogo.");
    return;
  }

  if (!nombre) {
    alert("Escribe el nombre del mdico antes de agregarlo al catlogo.");
    return;
  }

  const existente = buscarMedicoFirmaIndicacionesPorNombre(nombre);
  const payload = {
    nombre,
    cargo,
    cedula,
    actualizadoEn: serverTimestamp()
  };

  if (existente?.id) {
    const confirmar = confirm("Este mdico ya existe en el catlogo. Deseas actualizar cargo y cdula?");
    if (!confirmar) return;
    await updateDoc(doc(db, "usuarios", uidMedico, "catalogoMedicosFirmas", existente.id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      creadoEn: serverTimestamp()
    });
  }

  await cargarCatalogoMedicosFirmasIndicaciones();
  alert("Mdico agregado al catlogo de firmas.");
}

async function guardarMedicoCatalogoIndicaciones({ nombre, cargo, cedula, firmaDestino = "" } = {}) {
  const uidMedico = auth.currentUser?.uid;
  const ref = referenciaCatalogoMedicosFirmasIndicaciones();

  if (!ref || !uidMedico) {
    alert("No se pudo identificar al mdico para guardar el catlogo.");
    return null;
  }

  if (!nombre?.trim()) {
    alert("Escribe el nombre del mdico antes de agregarlo al catlogo.");
    return null;
  }

  const payload = {
    nombre: nombre.trim(),
    cargo: (cargo || "").trim(),
    cedula: (cedula || "").trim(),
    actualizadoEn: serverTimestamp()
  };
  const existente = buscarMedicoFirmaIndicacionesPorNombre(payload.nombre);

  if (existente?.id) {
    const confirmar = confirm("Este mdico ya existe en el catlogo. Deseas actualizar cargo y cdula?");
    if (!confirmar) return null;
    await updateDoc(doc(db, "usuarios", uidMedico, "catalogoMedicosFirmas", existente.id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      creadoEn: serverTimestamp()
    });
  }

  await cargarCatalogoMedicosFirmasIndicaciones();
  const actualizado = buscarMedicoFirmaIndicacionesPorNombre(payload.nombre) || payload;
  if (firmaDestino) aplicarMedicoFirmaIndicaciones(firmaDestino, actualizado);
  return actualizado;
}

function obtenerTituloVisibleApunte(apunte) {
  const titulo = typeof apunte?.titulo === "string"
    ? apunte.titulo.replace(/\s+/g, " ").trim()
    : "";
  return titulo || "Sin título";
}

async function cargarApuntesMedicoPaciente() {
  const lista = document.getElementById("listaApuntesMedicoPaciente");
  const ref = referenciaApuntesMedicoPaciente();

  if (!lista || !ref) return;

  lista.textContent = "Cargando apuntes...";

  const snap = await getDocs(query(ref, orderBy("fechaActualizacion", "desc")));
  apuntesMedicoPacienteCache = snap.docs.map((docApunte) => ({
    id: docApunte.id,
    ...docApunte.data()
  }));

  renderizarListaApuntesMedicoPaciente();

  if (apuntesMedicoPacienteCache.length && !valorCampo("apunteMedicoPacienteId")) {
    seleccionarApunteMedicoPaciente(apuntesMedicoPacienteCache[0].id);
  } else if (!apuntesMedicoPacienteCache.length) {
    nuevoApunteMedicoPaciente();
  }
}

function renderizarListaApuntesMedicoPaciente() {
  const lista = document.getElementById("listaApuntesMedicoPaciente");
  const busqueda = (document.getElementById("buscadorApuntesPaciente")?.value || "").trim().toLowerCase();
  const activo = valorCampo("apunteMedicoPacienteId");

  if (!lista) return;

  const filtrados = apuntesMedicoPacienteCache.filter((apunte) => {
    const titulo = (apunte.titulo || "").toLowerCase();
    const contenido = (apunte.contenido || "").toLowerCase();
    return !busqueda || titulo.includes(busqueda) || contenido.includes(busqueda);
  });

  if (!filtrados.length) {
    const vacio = document.createElement("p");
    vacio.className = "apuntes-vacio-paciente";
    vacio.textContent = "No se encontraron apuntes.";
    lista.replaceChildren(vacio);
    return;
  }

  const fragmento = document.createDocumentFragment();
  filtrados.forEach((apunte) => {
    const tituloVisible = obtenerTituloVisibleApunte(apunte);
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `apunte-paciente-item ${apunte.id === activo ? "activo" : ""}`;
    boton.dataset.apuntePaciente = apunte.id;
    boton.setAttribute("aria-selected", apunte.id === activo ? "true" : "false");
    boton.title = tituloVisible;
    boton.addEventListener("click", () => seleccionarApunteMedicoPaciente(apunte.id));

    const titulo = document.createElement("span");
    titulo.className = "apunte-paciente-item__titulo";
    titulo.textContent = tituloVisible;
    boton.appendChild(titulo);
    fragmento.appendChild(boton);
  });
  lista.replaceChildren(fragmento);
}

function seleccionarApunteMedicoPaciente(id) {
  const apunte = apuntesMedicoPacienteCache.find((item) => item.id === id);
  if (!apunte) return;

  ponerValor("apunteMedicoPacienteId", apunte.id);
  ponerValor("apunteMedicoPacienteTitulo", apunte.titulo || "");
  ponerValor("apunteMedicoPacienteContenido", apunte.contenido || "");
  ponerEstadoApuntesPaciente("Guardado");
  renderizarListaApuntesMedicoPaciente();
}

window.nuevoApunteMedicoPaciente = function() {
  ponerValor("apunteMedicoPacienteId", "");
  ponerValor("apunteMedicoPacienteTitulo", "");
  ponerValor("apunteMedicoPacienteContenido", "");
  ponerEstadoApuntesPaciente("Nuevo apunte");
  renderizarListaApuntesMedicoPaciente();
};

window.guardarApunteMedicoPaciente = async function() {
  const ref = referenciaApuntesMedicoPaciente();
  const id = valorCampo("apunteMedicoPacienteId");
  const titulo = valorCampo("apunteMedicoPacienteTitulo") || "Apunte sin titulo";
  const contenido = valorCampo("apunteMedicoPacienteContenido");

  if (!ref) return;

  if (!contenido) {
    alert("Escribe el contenido del apunte.");
    return;
  }

  const payload = {
    titulo,
    contenido,
    fechaActualizacion: new Date().toISOString()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
  }

  await cargarApuntesMedicoPaciente();
  ponerEstadoApuntesPaciente("Guardado");
};

window.eliminarApunteMedicoPaciente = async function() {
  const id = valorCampo("apunteMedicoPacienteId");

  if (!id) {
    nuevoApunteMedicoPaciente();
    return;
  }

  if (!confirm("Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id));
  nuevoApunteMedicoPaciente();
  await cargarApuntesMedicoPaciente();
};

window.abrirApuntesMedicoPaciente = async function() {
  moverPanelApuntesPacienteAlBody();
  document.getElementById("fondoApuntesMedicoPaciente")?.classList.remove("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  if (panel) {
    panel.classList.add("abierto");
    panel.setAttribute("aria-hidden", "false");
  }

  await cargarApuntesMedicoPaciente();
};

window.cerrarApuntesMedicoPaciente = function() {
  document.getElementById("fondoApuntesMedicoPaciente")?.classList.add("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  if (panel) {
    panel.classList.remove("abierto");
    panel.setAttribute("aria-hidden", "true");
  }
};

function moverPanelApuntesPacienteAlBody() {
  [
    "fondoApuntesMedicoPaciente",
    "panelApuntesMedicoPaciente"
  ].forEach((id) => {
    const elemento = document.getElementById(id);
    if (elemento && elemento.parentElement !== document.body) {
      document.body.appendChild(elemento);
    }
  });
}

function configurarCatalogoMedicamentosTratamiento() {
  const lista = document.getElementById("catalogoMedicamentosPsiquiatricos");
  const campo = document.getElementById("tratamientoMedicamento");
  const estado = document.getElementById("estadoCatalogoMedicamento");

  if (!lista || !campo) return;

  const renderizarCatalogo = (query = campo.value) => {
    const texto = String(query || "").trim();
    const catalogo = texto ? buscarMedicamentos(texto, { limit: 16, strict: true }) : [];
    const manuales = texto
      ? catalogoManualMedicamentos.filter((medicamento) =>
        medicamento.texto.toLowerCase().includes(texto.toLowerCase())
      ).slice(0, 16)
      : [];
    lista.innerHTML = [...catalogo, ...manuales].map((medicamento) => `
      <option
        value="${escaparHTML(medicamento.agregadoManual ? medicamento.texto : (medicamento.genericName || medicamento.nombre))}"
        label="${escaparHTML(`${medicamento.agregadoManual ? "Agregado manualmente  " : ""}${medicamento.clase || "Medicamento"}`)}"
      ></option>
    `).join("");
  };

  const actualizarEstado = () => {
    if (!estado) return;
    const texto = campo.value.trim();
    if (!texto) {
      estado.textContent = "";
      estado.classList.remove("visible");
      return;
    }

    const existe = catalogoMedicamentosTratamiento().some((medicamento) =>
      medicamento.texto.toLowerCase() === texto.toLowerCase()
    ) || Boolean(resolverMedicamentoEditor(texto));
    estado.textContent = existe
      ? "Medicamento encontrado en catlogo."
      : "No est en el catlogo. Puedes aadirlo manualmente.";
    estado.classList.add("visible");
    estado.classList.toggle("alerta", !existe);
  };

  renderizarCatalogo();

  campo.addEventListener("change", () => {
    const seleccionado = buscarMedicamentos(campo.value, { limit: 1, strict: true })[0]
      || catalogoManualMedicamentos.find((medicamento) =>
        medicamento.texto.toLowerCase() === campo.value.trim().toLowerCase()
      );

    if (seleccionado && !seleccionado.agregadoManual) {
      campo.value = seleccionado.genericName || seleccionado.nombre;
    } else if (seleccionado) campo.value = seleccionado.texto;
    campo.dataset.catalogMedicationText = campo.value;
    actualizarEstado();
    actualizarCapturaFarmacologica();
  });

  campo.addEventListener("input", () => {
    renderizarCatalogo(campo.value);
    if (campo.dataset.catalogMedicationId && campo.value !== campo.dataset.catalogMedicationText) {
      delete campo.dataset.catalogMedicationId;
      delete campo.dataset.catalogMedicationText;
    }
    actualizarEstado();
    actualizarCapturaFarmacologica();
  });

  document.addEventListener("catalogoMedicamentosActualizado", () => {
    renderizarCatalogo(campo.value);
    actualizarEstado();
  });
}

function configurarCatalogoMedicamentosReceta() {
  const lista = document.getElementById("catalogoMedicamentosReceta");
  if (!lista) return;

  const renderizar = () => {
    lista.innerHTML = catalogoMedicamentosTratamiento()
      .map((medicamento) => `
        <option
          value="${escaparHTML(medicamento.texto)}"
          label="${escaparHTML(`${medicamento.agregadoManual ? "Agregado manualmente  " : ""}${medicamento.clase || "Medicamento"}`)}"
        ></option>
      `)
      .join("");
  };

  renderizar();
  document.addEventListener("catalogoMedicamentosActualizado", renderizar);
}

function abrirMedicamentoManual() {
  const modal = document.getElementById("modalMedicamentoManual");
  if (!modal) return;

  const textoActual = valorCampo("tratamientoMedicamento");
  if (textoActual) {
    const partes = textoActual.split(",");
    ponerValor("medicamentoManualNombre", partes[0]?.trim() || "");
    ponerValor("medicamentoManualPresentacion", partes.slice(1).join(",").replace(/\.$/, "").trim());
  }

  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarMedicamentoManual() {
  const modal = document.getElementById("modalMedicamentoManual");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function limpiarMedicamentoManual() {
  [
    "medicamentoManualNombre",
    "medicamentoManualPresentacion",
    "medicamentoManualClase",
    "medicamentoManualDosisHabitual",
    "medicamentoManualNotas"
  ].forEach((id) => ponerValor(id, ""));
}

function guardarMedicamentoManual() {
  const nombre = valorCampo("medicamentoManualNombre");
  const presentacion = valorCampo("medicamentoManualPresentacion");
  const clase = valorCampo("medicamentoManualClase") || "Manual";
  const dosisHabitual = valorCampo("medicamentoManualDosisHabitual");
  const notas = valorCampo("medicamentoManualNotas");

  if (!nombre || !presentacion) {
    alert("Escribe medicamento y presentacin.");
    return;
  }

  const texto = `${nombre}, ${presentacion.replace(/\.$/, "")}.`;
  const existe = catalogoMedicamentosTratamiento().some((medicamento) =>
    medicamento.texto.toLowerCase() === texto.toLowerCase()
  );

  if (!existe) {
    catalogoManualMedicamentos.push({
      nombre,
      presentacion,
      clase,
      dosisHabitual,
      notas,
      texto,
      agregadoManual: true,
      fechaAgregado: new Date().toISOString()
    });
    guardarCatalogoManualMedicamentos();
  }

  ponerValor("tratamientoMedicamento", texto);
  document.dispatchEvent(new CustomEvent("catalogoMedicamentosActualizado"));
  limpiarMedicamentoManual();
  cerrarMedicamentoManual();
}

function ocultarSecciones() {
  [
    "seccionResumen",
    "seccionPermisos",
    "seccionResultadosEscalas",
    "seccionRehabilitacionCognitivaPaciente",
    "seccionTratamiento",
    "seccionDiagnosticos",
    "seccionCarpetas",
    "seccionNotasFlotantes",
    "seccionInterconsulta",
    "seccionIndicaciones",
    "seccionReceta",
    "seccionEstudios",
    "seccionNotasRapidas"
  ].forEach((id) => {
    const seccion = document.getElementById(id);
    if (seccion) seccion.style.display = "none";
  });
}

function ordenarTratamientoEIndicaciones() {
  const tratamiento = document.getElementById("seccionTratamiento");
  const indicaciones = document.getElementById("seccionIndicaciones");
  if (!tratamiento || !indicaciones || tratamiento.nextElementSibling === indicaciones) return;
  tratamiento.insertAdjacentElement("afterend", indicaciones);
}

ordenarTratamientoEIndicaciones();

const ESTADOS_DIAGNOSTICO = [
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
const ESTADO_DIAGNOSTICO_ACTIVO = "activo";
const ESTADO_DIAGNOSTICO_DESCARTADO = "descartado";

function estadoClinicoDiagnosticoValido(estado) {
  return ESTADOS_DIAGNOSTICO.includes(estado) ? estado : "";
}

function resolverMedicamentoEditor(texto = valorCampo("tratamientoMedicamento")) {
  const consulta = String(texto || "").trim();
  if (consulta.length < 3) return null;
  return medicamentoPorTexto(consulta)
    || buscarMedicamentos(consulta, { limit: 1 })[0]
    || MEDICAMENTOS_MAESTROS.find((medicamento) =>
      medicamento.nombre.toLowerCase() === consulta.toLowerCase()
    )
    || null;
}

function medicamentoSeleccionadoTratamiento() {
  return resolverMedicamentoEditor();
}

function resetearDependientesMedicamento() {
  [
    "tratamientoPresentacion",
    "tratamientoDosis",
    "tratamientoDosisOtra",
    "tratamientoVia",
    "tratamientoFrecuencia",
    "tratamientoFrecuenciaRapida",
    "tratamientoFrecuenciaOtra",
    "tratamientoVecesDia",
    "tratamientoHorarios",
    "cantidadTotalDia",
    "tratamientoDosisTotalDia"
  ].forEach((id) => ponerValor(id, ""));
  const modoHorario = document.getElementById("tratamientoModoHorario");
  if (modoHorario) modoHorario.value = "horas";
  const frecuenciaOtra = document.getElementById("tratamientoFrecuenciaOtra");
  if (frecuenciaOtra) frecuenciaOtra.hidden = true;
  document.querySelectorAll("[data-momento-dia]").forEach((elemento) => { elemento.checked = false; });
  document.getElementById("contenedorTomasTratamiento")?.replaceChildren();
}

function actualizarCapturaFarmacologica() {
  const medicamento = medicamentoSeleccionadoTratamiento();
  const campoMedicamento = document.getElementById("tratamientoMedicamento");
  const presentacion = document.getElementById("tratamientoPresentacion");
  const principios = document.getElementById("tratamientoPrincipiosActivos");
  if (!presentacion) return;

  const seleccionConfirmada = Boolean(
    campoMedicamento?.dataset.catalogMedicationText &&
    campoMedicamento.value === campoMedicamento.dataset.catalogMedicationText
  );
  const medicationId = seleccionConfirmada ? (medicamento?.id || "") : "";
  if ((campoMedicamento?.dataset.catalogMedicationId || "") !== medicationId) {
    resetearDependientesMedicamento();
    if (campoMedicamento) campoMedicamento.dataset.catalogMedicationId = medicationId;
  }

  const presentaciones = medicamento?.presentaciones || [];
  presentacion.innerHTML = `<option value="">Seleccionar presentación</option>${presentaciones.map((item, index) =>
    `<option value="${escaparHTML(item.texto)}" data-via="${escaparHTML(item.via || "oral")}" data-index="${index}">${escaparHTML(item.texto)}</option>`).join("")}`;
  const actual = valorCampo("tratamientoPresentacion");
  if (actual && presentaciones.some((item) => item.texto === actual)) presentacion.value = actual;
  if (!presentacion.value) {
    const textoMedicamento = valorCampo("tratamientoMedicamento").toLowerCase();
    const heredada = presentaciones.find((item) => textoMedicamento.includes(item.texto.toLowerCase()));
    if (heredada) presentacion.value = heredada.texto;
  }
  if (principios) principios.textContent = medicamento?.principiosActivos?.length
    ? `Principios activos: ${medicamento.principiosActivos.join(" / ")}` : "";
}

function sincronizarCapturaFarmacologica() {
  const presentacion = document.getElementById("tratamientoPresentacion");
  const opcion = presentacion?.selectedOptions?.[0];
  if (opcion?.value) {
    ponerValor("tratamientoVia", opcion.dataset.via || valorCampo("tratamientoVia"));
    const medicamento = medicamentoSeleccionadoTratamiento();
    ponerValor("tratamientoMedicamento", `${medicamento?.genericName || valorCampo("tratamientoMedicamento")}, ${opcion.value}.`);
    const campoMedicamento = document.getElementById("tratamientoMedicamento");
    if (campoMedicamento) campoMedicamento.dataset.catalogMedicationText = campoMedicamento.value;
  }
}

function diagnosticoEstaActivo(diagnostico = {}) {
  return diagnostico.estado !== ESTADO_DIAGNOSTICO_DESCARTADO;
}

function crearIdDiagnostico(diagnostico, index = 0) {
  if (diagnostico?.id) return diagnostico.id;
  const base = [diagnostico?.catalogo, diagnostico?.codigo, diagnostico?.nombre || diagnostico?.texto, index]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `diagnostico-${index}`;
}

function normalizarDiagnostico(diagnostico = {}, catalogoFallback = "CIE-10", index = 0) {
  if (typeof diagnostico === "string") {
    const base = {
      codigo: "",
      nombre: diagnostico,
      texto: diagnostico,
      catalogo: catalogoFallback,
      fechaSeleccion: new Date().toISOString(),
      estado: ESTADO_DIAGNOSTICO_ACTIVO,
      estadoClinico: "",
      orden: index
    };
    return { ...base, id: crearIdDiagnostico(base, index) };
  }

  const catalogo = diagnostico.catalogo || catalogoFallback;
  const nombre = diagnostico.nombre || diagnostico.texto || diagnostico.descripcion || "";
  const orden = Number.isFinite(Number(diagnostico.orden)) ? Number(diagnostico.orden) : index;
  const estadoAnterior = String(diagnostico.estado || "");
  const estado = estadoAnterior === ESTADO_DIAGNOSTICO_DESCARTADO
    ? ESTADO_DIAGNOSTICO_DESCARTADO
    : ESTADO_DIAGNOSTICO_ACTIVO;
  const estadoClinico = diagnostico.estadoClinico || (
    estadoAnterior && ![ESTADO_DIAGNOSTICO_ACTIVO, ESTADO_DIAGNOSTICO_DESCARTADO].includes(estadoAnterior)
      ? estadoClinicoDiagnosticoValido(estadoAnterior)
      : ""
  );
  const normalizado = {
    ...diagnostico,
    id: diagnostico.id || "",
    codigo: diagnostico.codigo || "",
    nombre,
    texto: diagnostico.texto || `${diagnostico.codigo || ""}${diagnostico.codigo && nombre ? " - " : ""}${nombre}`.trim() || nombre,
    catalogo,
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString(),
    estado,
    estadoClinico,
    orden,
    manual: diagnostico.manual === true,
    agregadoManual: diagnostico.agregadoManual === true,
    editadoManual: diagnostico.editadoManual === true,
    incluidoEnCatalogo: diagnostico.incluidoEnCatalogo === true
  };
  normalizado.id = crearIdDiagnostico(normalizado, index);
  return normalizado;
}

function normalizarHistorialDiagnosticos(historial = []) {
  return historial
    .filter(Boolean)
    .map((dx, index) => normalizarDiagnostico(dx, dx?.catalogo || "CIE-10", index))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((dx, index) => ({ ...dx, orden: index }));
}

function limpiarDiagnosticoParaFirestore(diagnostico = {}) {
  return Object.fromEntries(
    Object.entries(diagnostico).filter(([, valor]) => valor !== undefined)
  );
}

function deduplicarHistorialDiagnosticos(historial = []) {
  const vistos = new Set();
  return normalizarHistorialDiagnosticos(historial).filter((dx) => {
    const clave = claveDiagnostico(dx) || dx.id;
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }).map((dx, index) => ({ ...dx, orden: index }));
}

function recolectarDiagnosticosPaciente(datos = {}) {
  return [
    ...(Array.isArray(datos.historialDiagnosticos) ? datos.historialDiagnosticos : []),
    ...(Array.isArray(datos.datosClinicosResumen?.historialDiagnosticos) ? datos.datosClinicosResumen.historialDiagnosticos : []),
    ...(Array.isArray(datos.diagnosticos) ? datos.diagnosticos : []),
    ...(datos.diagnostico ? [datos.diagnostico] : []),
    ...(datos.datosClinicosResumen?.diagnostico ? [datos.datosClinicosResumen.diagnostico] : [])
  ];
}

function obtenerHistorialDiagnosticos(datos = datosPacienteActual || {}) {
  return deduplicarHistorialDiagnosticos(recolectarDiagnosticosPaciente(datos));
}

function obtenerDiagnosticosActivos(datos = datosPacienteActual || {}) {
  return obtenerHistorialDiagnosticos(datos).filter(diagnosticoEstaActivo);
}

function obtenerDiagnosticosDescartados(datos = datosPacienteActual || {}) {
  return obtenerHistorialDiagnosticos(datos).filter((dx) => !diagnosticoEstaActivo(dx));
}

function renderizarDiagnosticos(datos) {
  const diagnosticoDiv = document.getElementById("diagnostico");

  if (!diagnosticoDiv) return;

  diagnosticoDiv.innerHTML = "";

  const historial = obtenerDiagnosticosActivos(datos);
  const principal = historial[0] || "";

  if (historial.length === 0) {
    const linea = document.createElement("div");
    linea.className = "diagnostico-linea principal";
    linea.textContent = formatearDiagnostico(principal);
    diagnosticoDiv.appendChild(linea);
    return;
  }

  historial.forEach((dx, index) => {
    const esPrincipal = index === 0;
    const linea = document.createElement("div");
    linea.className = `diagnostico-linea${esPrincipal ? " principal" : ""}`;

    const texto = document.createElement("span");
    texto.textContent = formatearDiagnostico(dx);

    const acciones = document.createElement("div");
    acciones.className = "diagnostico-acciones";

    const etiqueta = document.createElement("span");
    etiqueta.className = "diagnostico-principal-badge";
    etiqueta.textContent = esPrincipal ? "Principal" : "Secundario";
    acciones.appendChild(etiqueta);

    linea.append(texto, acciones);
    diagnosticoDiv.appendChild(linea);
  });
}

function obtenerCatalogoDiagnostico() {
  const catalogo = document.getElementById("diagnosticoCatalogo")?.value || "CIE-10";
  const base = catalogo === "CIE-11" ? CIE11 : CIE10;
  return [...base, ...catalogoManualPorTipo(catalogo)];
}

function renderizarResultadosBusquedaDiagnosticos() {
  const contenedor = document.getElementById("resultadosBusquedaDiagnosticos");
  const buscador = document.getElementById("diagnosticoBusqueda");
  const catalogoSeleccionado = document.getElementById("diagnosticoCatalogo")?.value || "CIE-10";

  if (!contenedor || !buscador) return;

  const texto = buscador.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (!texto) {
    contenedor.textContent = diagnosticoReemplazoIndex === null
      ? "Escribe para buscar en el catlogo."
      : "Busca el diagnostico que sustituira al seleccionado.";
    return;
  }

  diagnosticosCatalogoActual = obtenerCatalogoDiagnostico()
    .filter((dx) => textoBusquedaCatalogoDiagnostico(dx).includes(texto))
    .sort((a, b) => prioridadCoincidenciaDiagnostico(a, texto) - prioridadCoincidenciaDiagnostico(b, texto)
      || String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true }))
    .slice(0, 18)
    .map((dx) => normalizarDiagnostico(dx, catalogoSeleccionado));

  contenedor.innerHTML = diagnosticosCatalogoActual.length
    ? diagnosticosCatalogoActual.map((dx, index) => `
      <button type="button" class="diagnostico-opcion" data-agregar-diagnostico="${index}">
        <strong>
          ${escaparHTML(dx.catalogo)} ${escaparHTML(dx.codigo)}
          ${dx.agregadoManual ? '<em class="diagnostico-manual-badge">Agregado manualmente</em>' : ""}
        </strong>
        <span>${escaparHTML(dx.nombre)}</span>
      </button>
    `).join("")
    : "<p>No se encontraron resultados en el catalogo seleccionado.</p>";

  contenedor.querySelectorAll("[data-agregar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => agregarDiagnosticoPaciente(Number(boton.dataset.agregarDiagnostico), boton));
  });
}

function opcionesEstadoDiagnostico(estadoActual = "") {
  return ESTADOS_DIAGNOSTICO.map((estado) => `
    <option value="${escaparHTML(estado)}" ${estado === estadoActual ? "selected" : ""}>${escaparHTML(estado || "No mostrar estado")}</option>
  `).join("");
}

function renderizarPanelDiagnosticos() {
  const contenedor = document.getElementById("panelDiagnosticosPaciente");
  if (!contenedor) return;

  const historial = obtenerHistorialDiagnosticos();
  const activos = historial.filter(diagnosticoEstaActivo);
  const descartados = historial.filter((dx) => !diagnosticoEstaActivo(dx));

  if (!historial.length) {
    contenedor.innerHTML = "<p>Aun no hay diagnosticos registrados.</p>";
    return;
  }

  const renderActivo = (dx) => {
    const index = historial.findIndex((item) => item.id === dx.id);
    const esPrincipal = activos[0]?.id === dx.id;
    return `
      <article class="registro-card diagnostico-card">
        <div class="registro-top">
          <div>
            <strong>${escaparHTML(dx.catalogo || "CIE")} ${escaparHTML(dx.codigo || "")}</strong>
            <span>${escaparHTML(dx.nombre || dx.texto || "Diagnostico")}</span>
          </div>
          <span class="diagnostico-principal-badge">${esPrincipal ? "Principal" : "Secundario"}</span>
        </div>
        <div class="registro-actions diagnostico-orden-acciones">
          <label class="diagnostico-estado-label">
            Estado
            <select data-estado-diagnostico="${index}">
              ${opcionesEstadoDiagnostico(dx.estadoClinico)}
            </select>
          </label>
          <button type="button" data-mover-diagnostico="${index}" data-direccion="-1" ${index === 0 ? "disabled" : ""}>?</button>
          <button type="button" data-mover-diagnostico="${index}" data-direccion="1" ${index === historial.length - 1 ? "disabled" : ""}>?</button>
          <button type="button" data-reemplazar-diagnostico="${index}">Cambiar por catalogo</button>
          <button type="button" data-editar-diagnostico="${index}">Editar codigo/texto</button>
          <button type="button" data-descartar-diagnostico="${index}">Descartar diagnóstico</button>
          <button type="button" class="boton-peligro" data-quitar-diagnostico="${index}">Eliminar diagnóstico</button>
        </div>
      </article>
    `;
  };

  const renderDescartado = (dx) => {
    const index = historial.findIndex((item) => item.id === dx.id);
    return `
      <article class="registro-card diagnostico-card diagnostico-descartado">
        <div class="registro-top">
          <div>
            <strong>▱ ${escaparHTML(dx.catalogo || "CIE")} ${escaparHTML(dx.codigo || "")}</strong>
            <span><s>${escaparHTML(dx.nombre || dx.texto || "Diagnostico")}</s></span>
          </div>
          <span class="diagnostico-principal-badge">Descartado</span>
        </div>
        <p class="texto-suave">Creado: ${escaparHTML(formatearFechaEscalaFallback(dx.fechaSeleccion))} · Descartado: ${escaparHTML(formatearFechaEscalaFallback(dx.fechaDescartado))}</p>
        <p class="texto-suave">Descartado por: ${escaparHTML(dx.usuarioDescartadoNombre || dx.usuarioDescartado || "Sin registro")}</p>
        <p class="texto-suave">${escaparHTML(dx.motivoDescartado || "Sin motivo indicado.")}</p>
        <div class="registro-actions diagnostico-orden-acciones">
          <button type="button" data-restaurar-diagnostico="${index}">Restaurar</button>
          <button type="button" class="boton-peligro" data-quitar-diagnostico="${index}">Eliminar diagnóstico</button>
        </div>
      </article>
    `;
  };

  contenedor.innerHTML = `
    <div class="diagnosticos-activos">${activos.map(renderActivo).join("") || "<p>No hay diagnósticos activos.</p>"}</div>
    <div class="diagnosticos-historial">
      <h3>Historial de diagnósticos descartados</h3>
      ${descartados.map(renderDescartado).join("") || "<p class=\"texto-suave\">No hay diagnósticos descartados.</p>"}
    </div>
  `;

  contenedor.querySelectorAll("[data-estado-diagnostico]").forEach((selector) => {
    selector.addEventListener("change", () => cambiarEstadoDiagnosticoPaciente(Number(selector.dataset.estadoDiagnostico), selector.value));
  });

  contenedor.querySelectorAll("[data-mover-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => moverDiagnosticoPaciente(Number(boton.dataset.moverDiagnostico), Number(boton.dataset.direccion)));
  });

  contenedor.querySelectorAll("[data-editar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => editarDiagnosticoPaciente(Number(boton.dataset.editarDiagnostico)));
  });

  contenedor.querySelectorAll("[data-reemplazar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => prepararReemplazoDiagnostico(Number(boton.dataset.reemplazarDiagnostico)));
  });

  contenedor.querySelectorAll("[data-quitar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => quitarDiagnosticoPaciente(Number(boton.dataset.quitarDiagnostico)));
  });
  contenedor.querySelectorAll("[data-descartar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => descartarDiagnosticoPaciente(Number(boton.dataset.descartarDiagnostico)));
  });
  contenedor.querySelectorAll("[data-restaurar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => restaurarDiagnosticoPaciente(Number(boton.dataset.restaurarDiagnostico)));
  });
}

function iniciarCargaExpedientePaciente() {
  getAuthenticatedUserOnce().then(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const parametros = new URLSearchParams(window.location.search);
    const patientIdAnterior = uidPaciente;
    uidPaciente =
      parametros.get("id") ||
      parametros.get("paciente") ||
      parametros.get("pacienteId") ||
      parametros.get("idPaciente") ||
      parametros.get("pacienteUid") ||
      parametros.get("uidPaciente") ||
      parametros.get("uid") ||
      parametros.get("usuario") ||
      parametros.get("user") ||
      "";
    if (patientIdAnterior !== uidPaciente) {
      invalidarContextoTratamientosPaciente();
    }
    try {
      medicoActualDatos = await getUserProfileOnce(user.uid) || {};
    } catch (error) {
      console.warn("No se pudo cargar el perfil del usuario actual. Se continuar con la carga del paciente.", error);
      medicoActualDatos = { uid: user.uid, correo: user.email || "", email: user.email || "" };
    }
    rolUsuarioActual = medicoActualDatos.rol || "";
    if (!uidPaciente && rolUsuarioActual === "paciente") {
      uidPaciente = user.uid;
    }
    console.info("patient:vitals-firebase-runtime", firebaseRuntimeInfo());
    console.info("patient:vitals-reader-target", {
      targetFingerprint: technicalFingerprint(uidPaciente)
    });
    try {
      permisosFormatosUsuarioActual = await obtenerPermisosFormatosUsuario(user.uid, medicoActualDatos);
    } catch (error) {
      console.warn("No se pudieron cargar permisos de formatos. Se usarn permisos bsicos para no bloquear el expediente.", error);
      permisosFormatosUsuarioActual = {};
    }
    ejecutarSeguroPaciente("permisos de formatos del expediente", aplicarPermisosFormatosPaciente);
    ejecutarSeguroPaciente("restricciones por rol del expediente", aplicarRestriccionesRolExpediente);

    try {
      await cargarDatosPaciente();
    } catch (error) {
      console.error("No se pudieron cargar los datos del paciente:", error);
      ponerTexto("nombrePaciente", "No se pudieron cargar los datos del paciente");
    }
  }).catch((error) => {
    console.error("No se pudo inicializar el expediente del paciente:", error);
    window.location.href = "dashboard.html";
  });
}


function formatoInstitucionalPermitidoPaciente(valor = "") {
  return usuarioPuedeUsarFormato(valor, permisosFormatosUsuarioActual, rolUsuarioActual, medicoActualDatos);
}

function aplicarPermisosFormatosPaciente() {
  aplicarPermisosFormatosPagina([
    ["#interconsultaFormato", "cognicion", "Cognicion"],
    ["#indicacionesFormato", "cognicion", "Cognicion"],
    ["#recetaFormato", "cognicion", "Cognicion - Receta general"],
    ["#solicitudEstudioFormato", "cognicion", "Cognicion - Solicitud general"]
  ], permisosFormatosUsuarioActual, { rol: rolUsuarioActual, usuario: medicoActualDatos });
}

function alertaFormatoNoAutorizado() {
  alert("No tienes autorizacion para usar este formato institucional. Solicita acceso al administrador.");
}
function usuarioEsPsicologo() {
  return rolUsuarioActual === "psicologo";
}

function usuarioActualEsEnfermeriaSaludMental() {
  return usuarioEsEnfermeriaSaludMental(rolUsuarioActual);
}

function aplicarRestriccionesRolExpediente() {
  const ocultarTratamiento = usuarioEsPsicologo();
  document.getElementById("btnTratamientoPaciente")?.classList.toggle("oculto", ocultarTratamiento);
  document.getElementById("datoResumenTratamiento")?.classList.toggle("oculto", ocultarTratamiento);
  document.getElementById("seccionTratamiento")?.classList.toggle("oculto", ocultarTratamiento);
  actualizarAvisosFarmacologiaEnfermeria();
}

function normalizarTipoPaciente(valor = "") {
  return String(valor || "").trim().toLowerCase();
}

function esTipoPacienteInstitucional(valor = "") {
  const tipo = normalizarTipoPaciente(valor);
  return tipo === "institucion" || tipo === "institucional" || tipo === "paciente de institucion";
}

function actualizarAvisosFarmacologiaEnfermeria() {
  const leyenda = document.getElementById("leyendaFarmacologiaEnfermeria");
  if (leyenda) {
    leyenda.classList.toggle("oculto", !usuarioActualEsEnfermeriaSaludMental());
  }
}

function avisoFarmacologiaVistoPaciente() {
  return datosPacienteActual?.uiFlags?.farmacologiaAvisoVisto === true;
}

function asegurarModalAvisoFarmacologiaEnfermeria() {
  let modal = document.getElementById("modalAvisoFarmacologiaEnfermeria");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "modalAvisoFarmacologiaEnfermeria";
  modal.className = "modal-ingreso aviso-farmacologia-enfermeria";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="panel-ingreso panel-aviso-farmacologia" role="dialog" aria-modal="true" aria-labelledby="tituloAvisoFarmacologiaEnfermeria">
      <div class="panel-ingreso-header">
        <div>
          <p>${escaparHTML(ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL)}</p>
          <h3 id="tituloAvisoFarmacologiaEnfermeria">Aviso importante</h3>
        </div>
        <button type="button" data-cerrar-aviso-farmacologia-enfermeria aria-label="Cerrar"></button>
      </div>
      <div class="aviso-farmacologia-contenido">
        <p>La prescripcion, inicio, modificacion y suspension de tratamientos farmacologicos corresponde exclusivamente al medico tratante conforme a la normatividad vigente.</p>
        <p>Este modulo permite registrar el tratamiento indicado por el medico con fines de seguimiento clinico, monitoreo de adherencia terapeutica, registro de efectos adversos, continuidad de la atencion y documentacion del expediente.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-cerrar-aviso-farmacologia-enfermeria]")?.addEventListener("click", cerrarAvisoFarmacologiaEnfermeria);
  return modal;
}

async function cerrarAvisoFarmacologiaEnfermeria() {
  const modal = document.getElementById("modalAvisoFarmacologiaEnfermeria");
  modal?.classList.remove("abierto");
  modal?.setAttribute("aria-hidden", "true");

  if (!uidPaciente) return;
  try {
    await updateDoc(doc(db, "usuarios", uidPaciente), {
      "uiFlags.farmacologiaAvisoVisto": true
    });
    datosPacienteActual = {
      ...(datosPacienteActual || {}),
      uiFlags: {
        ...(datosPacienteActual?.uiFlags || {}),
        farmacologiaAvisoVisto: true
      }
    };
  } catch (error) {
    console.warn("No se pudo guardar el estado del aviso de farmacologia:", error);
  }
}

function mostrarAvisoFarmacologiaEnfermeriaSiCorresponde() {
  actualizarAvisosFarmacologiaEnfermeria();
  if (!usuarioActualEsEnfermeriaSaludMental() || avisoFarmacologiaVistoPaciente()) return;
  const modal = asegurarModalAvisoFarmacologiaEnfermeria();
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function esTipoPacientePrivado(valor = "") {
  const tipo = normalizarTipoPaciente(valor);
  return tipo === "" || tipo === "privada" || tipo === "privado" || tipo === "consulta privada";
}

function pacienteRequiereCamposInstitucionales(valor = "") {
  return !esTipoPacientePrivado(valor);
}

function etiquetaTipoPaciente(valor = "") {
  const tipo = normalizarTipoPaciente(valor);
  if (tipo === "privada" || tipo === "privado" || tipo === "consulta privada") return "Privado";
  if (esTipoPacienteInstitucional(valor)) return "Institucional";
  if (tipo === "clnica" || tipo === "clinica") return "Clnica";
  return String(valor || "").trim() || "Privado";
}

function actualizarVisibilidadCamposInstitucionalesPaciente(datos = datosPacienteActual || {}) {
  const mostrar = pacienteRequiereCamposInstitucionales(datos?.tipoPaciente || datos?.datosInstitucionales?.tipoPaciente);
  document.querySelectorAll(".campo-institucional-paciente").forEach((campo) => {
    campo.classList.toggle("oculto", !mostrar);
  });
}

async function obtenerPacientePorListaAutorizada(uid) {
  const usuario = auth.currentUser;
  if (!uid || !usuario) return null;

  const resultado = await listarPacientes(usuario.uid);
  let encontrado = null;

  resultado.forEach((docPaciente) => {
    if (docPaciente.id === uid) {
      encontrado = {
        id: docPaciente.id,
        ...docPaciente.data()
      };
    }
  });

  return encontrado;
}

async function cargarDatosPaciente() {
  if (modoNuevoPacienteDraft()) {
    sincronizarDatosPacienteDesdeDraft();
    ejecutarSeguroPaciente("diagnosticos del resumen borrador", () => renderizarDiagnosticos(datosPacienteActual || {}));
    ejecutarSeguroPaciente("panel de diagnosticos borrador", renderizarPanelDiagnosticos);
    ponerTexto("tratamiento", datosPacienteActual?.tratamiento || "Sin tratamiento registrado");
    return;
  }

  if (!uidPaciente) {
    datosPacienteActual = null;
    ponerTexto("nombrePaciente", "Paciente no seleccionado");
    ponerTexto("correoPaciente", "Sin paciente seleccionado");
    return;
  }

  let datos = null;
  try {
    datos = await obtenerUsuario(uidPaciente);
  } catch (error) {
    console.warn("No se pudo leer el documento directo del paciente. Se intentar cargar desde la lista autorizada.", error);
    try {
      datos = await obtenerPacientePorListaAutorizada(uidPaciente);
    } catch (fallbackError) {
      console.error("No se pudo cargar el paciente desde la lista autorizada:", fallbackError);
      datosPacienteActual = null;
      ponerTexto("nombrePaciente", "No se pudo acceder al paciente");
      ponerTexto("correoPaciente", "Revisa permisos de lectura o vnculo del paciente");
      return;
    }
  }
  datosPacienteActual = datos;

  if (!datos) {
    try {
      datos = await obtenerPacientePorListaAutorizada(uidPaciente);
      datosPacienteActual = datos;
    } catch (fallbackError) {
      console.warn("No se pudo encontrar el paciente en la lista autorizada.", fallbackError);
    }
    if (!datos) {
      console.info("patient:vitals-read", {
        ...firebaseRuntimeInfo(),
        targetFingerprint: technicalFingerprint(uidPaciente),
        documentExists: false,
        hasPA: false,
        hasFC: false,
        hasFR: false,
        hasTemperature: false,
        hasSpO2: false,
        historyCount: 0
      });
      ponerTexto("nombrePaciente", "Paciente no encontrado");
      return;
    }
  }

  const usuario = auth.currentUser;
  const accesoPropioPaciente = rolUsuarioActual === "paciente" && usuario?.uid === uidPaciente;
  const accesoProfesional = usuario?.uid && await medicoPuedeVer(usuario.uid, uidPaciente);

  if (!accesoPropioPaciente && !accesoProfesional) {
    datosPacienteActual = null;
    ponerTexto("nombrePaciente", "Acceso no autorizado");
    ponerTexto("correoPaciente", "No tienes acceso autorizado a este expediente");
    document.body.classList.add("bloqueado");
    throw new Error("patient_access_denied");
  }

  console.info("patient:vitals-read", {
    ...firebaseRuntimeInfo(),
    targetFingerprint: technicalFingerprint(uidPaciente),
    documentExists: true,
    ...patientVitalSignsPresence(datos),
    historyCount: patientVitalHistoryCount(datos)
  });

  ponerTexto("nombrePaciente", obtenerNombrePacienteParaMostrar(datos) || "Paciente sin nombre");
  actualizarAvisoFormatoNombrePaciente(datos);

  ponerTexto("correoPaciente", datos.email || "Sin correo");

  ponerTexto(
    "expedienteCognicionPaciente",
    datos.expedienteCognicion ||
      datos.datosInstitucionales?.expedienteCognicion ||
      "Sin expediente"
  );

  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edadCalculada = calcularEdad(fechaNacimiento);

  const edadVisible = edadCalculada !== "" && edadCalculada !== null && edadCalculada !== undefined
  ? edadCalculada
  : "";

  ponerTexto("fechaNacimientoPaciente", formatearFecha(fechaNacimiento));

  ponerTexto(
    "edadPaciente",
    edadVisible !== "" && edadVisible !== null && edadVisible !== undefined
      ? `${edadVisible} años`
      : "No registrada"
  );

  if (fechaNacimiento && datos.fechaNacimiento !== fechaNacimiento) {
    try {
      await actualizarUsuario(uidPaciente, {
        fechaNacimiento,
        edad: deleteField(),
        "datosInstitucionales.edad": deleteField()
      });
    } catch (error) {
      console.warn("No se pudo normalizar la fecha de nacimiento del paciente al cargar.", error);
    }
    datos.fechaNacimiento = fechaNacimiento;
    delete datos.edad;
    if (datos.datosInstitucionales) delete datos.datosInstitucionales.edad;
    datosPacienteActual = datos;
  }

  ejecutarSeguroPaciente("selector de vista de datos generales", inicializarSelectorVistaDatosGeneralesPaciente);

  ejecutarSeguroPaciente("diagnsticos del resumen", () => renderizarDiagnosticos(datos));
  ejecutarSeguroPaciente("panel de diagnsticos", renderizarPanelDiagnosticos);

  ponerTexto("tratamiento", datos.tratamiento || "Sin tratamiento registrado");

  ponerTexto("medicoTratante", datos.medicoTratante || "Sin mdico tratante");

  ponerTexto("ultimaConsulta", formatearFecha(datos.ultimaConsulta) || "Sin fecha");

  ponerTexto("proximaConsulta", datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar");

  ponerTexto("telefonoPaciente", datos.telefono || "Sin telfono");

  ponerTexto("tipoPaciente", etiquetaTipoPaciente(datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente));

  ponerTexto("institucionPaciente", datos.institucionPaciente || datos.institucion || "Sin institucin");

  ponerTexto("servicioInstitucional", datos.servicioInstitucional || datos.servicio || "Sin servicio");

  ponerTexto("expedientePaciente", datos.expediente || datos.numeroExpediente || "Sin expediente");

  ponerTexto("camaPaciente", datos.cama || "Sin cama");

  ponerTexto("curpPaciente", datos.curp || datos.datosInstitucionales?.curp || "Sin registro");

  ejecutarSeguroPaciente("estancia del paciente", () => actualizarEstanciaPaciente(datos));
  ejecutarSeguroPaciente("actualizacin automtica de estancia", iniciarActualizacionEstanciaPaciente);

  ponerTexto("ultimoIngresoPaciente", formatearFecha(obtenerUltimoIngreso(datos)));

  ponerTexto(
    "medicoAdscritoEncargadoPaciente",
    datos.medicoAdscritoEncargado ||
      datos.datosInstitucionales?.medicoAdscritoEncargado ||
      datos.medicoAdscrito ||
      "Sin registro"
  );

  ponerTexto(
    "residenteEncargadoPaciente",
    datos.residenteEncargado ||
      datos.datosInstitucionales?.residenteEncargado ||
      datos.medicoResidente ||
      "Sin registro"
  );

  ponerTexto("sexoPaciente", datos.sexo || "Sin registro");

  ponerTexto("generoPaciente", datos.genero || datos.identidadGenero || "Sin registro");

  ponerTexto("alergiasPaciente", datos.alergias || datos.datosInstitucionales?.alergias || "Sin registro");

  ponerTexto("tipoSangrePaciente", datos.tipoSangre || datos.datosInstitucionales?.tipoSangre || "Sin registro");

  ponerTexto("pesoPaciente", datos.peso || datos.signosVitales?.peso || datos.somatometria?.peso || datos.datosInstitucionales?.peso || "Sin registro");

  ponerTexto("tallaPaciente", datos.talla || datos.signosVitales?.talla || datos.somatometria?.talla || datos.datosInstitucionales?.talla || "Sin registro");

  ponerTexto("perimetroAbdominalPaciente", datos.perimetroAbdominal || datos.signosVitales?.perimetroAbdominal || datos.somatometria?.perimetroAbdominal || datos.datosInstitucionales?.perimetroAbdominal || "Sin registro");

  ponerTexto("imcPaciente", datos.imc || datos.signosVitales?.imc || datos.somatometria?.imc || datos.datosInstitucionales?.imc || "Sin registro");

  ejecutarSeguroPaciente("estancia del paciente", () => actualizarEstanciaPaciente(datos));
  ejecutarSeguroPaciente("visibilidad de campos institucionales", () => actualizarVisibilidadCamposInstitucionalesPaciente(datos));
  ejecutarSeguroPaciente("vista laboratorio de datos generales", () => renderizarVistaLaboratorioPaciente(datos));
  ejecutarSeguroPaciente("resumen peditrico del paciente", () => renderizarResumenPediatricoPaciente(datos));
  cargarResumenClinicoFuenteDocxEnSegundoPlano(uidPaciente, datos);
}

window.mostrarResumen = function() {
  ocultarSecciones();
  document.getElementById("seccionResumen").style.display = "block";
};

window.mostrarPermisos = async function() {
  ocultarSecciones();
  document.getElementById("seccionPermisos").style.display = "block";

  await cargarPermisosMedicos();
};

window.mostrarResultadosEscalas = async function() {
  ocultarSecciones();
  document.getElementById("seccionResultadosEscalas").style.display = "block";
  await cargarResultadosEscalasPaciente();
  await cargarEscalasAsignablesPaciente();
  await cargarTareasMiSaludMedico();
};

window.mostrarTratamiento = async function() {
  if (usuarioEsPsicologo()) {
    alert("El apartado de tratamiento no esta disponible para el rol Psicologo.");
    mostrarResumen();
    return;
  }

  ocultarSecciones();
  document.getElementById("seccionTratamiento").style.display = "block";
  document.getElementById("seccionIndicaciones").style.display = "block";
  mostrarAvisoFarmacologiaEnfermeriaSiCorresponde();
  await cargarTratamientosPaciente();
  renderizarCatalogosIndicaciones();
  await cargarCatalogoMedicosFirmasIndicaciones();
  await asegurarTratamientosCache();
  autollenarIndicaciones();
  renderizarMedicamentosIndicaciones();
  await cargarIndicacionesPaciente();
};

window.mostrarDiagnosticos = function() {
  ocultarSecciones();
  document.getElementById("seccionDiagnosticos").style.display = "block";
  renderizarPanelDiagnosticos();
  renderizarResultadosBusquedaDiagnosticos();
};

window.mostrarCarpetas = async function() {
  ocultarSecciones();
  document.getElementById("seccionCarpetas").style.display = "block";
  await cargarCarpetasPaciente();
};

window.mostrarNotasFlotantes = async function() {
  ocultarSecciones();
  document.getElementById("seccionNotasFlotantes").style.display = "block";
  await cargarNotasFlotantesPaciente();
};

window.mostrarInterconsulta = async function() {
  ocultarSecciones();
  document.getElementById("seccionInterconsulta").style.display = "block";
  autollenarInterconsulta();
  await cargarInterconsultasPaciente();
};

window.mostrarIndicaciones = async function() {
  ocultarSecciones();
  document.getElementById("seccionIndicaciones").style.display = "block";
  renderizarCatalogosIndicaciones();
  await cargarCatalogoMedicosFirmasIndicaciones();
  await asegurarTratamientosCache();
  autollenarIndicaciones();
  renderizarMedicamentosIndicaciones();
  await cargarIndicacionesPaciente();
};

window.mostrarReceta = async function() {
  ocultarSecciones();
  document.getElementById("seccionReceta").style.display = "block";
  if (!valorCampo("recetaFecha")) ponerValor("recetaFecha", fechaISOHoy());
  await cargarTratamientoActivoEnReceta();
};

window.mostrarEstudios = async function() {
  ocultarSecciones();
  document.getElementById("seccionEstudios").style.display = "block";
  const formatoImagen = document.getElementById("solicitudEstudioFormato");
  if (formatoImagen && ![...formatoImagen.options].some((opcion) => opcion.value === FORMATO_SOLICITUD_IMAGENOLOGIA.clave) && usuarioPuedeUsarFormato("solicitud_imagenologia", permisosFormatosUsuarioActual, rolUsuarioActual, medicoActualDatos)) {
    const opcion = document.createElement("option");
    opcion.value = FORMATO_SOLICITUD_IMAGENOLOGIA.clave;
    opcion.textContent = "Formatos Fray · Solicitud de estudio de imagenología · FTO-HPFBA-EXPC-IMG-SEI";
    formatoImagen.appendChild(opcion);
  }
  if (formatoImagen && ![...formatoImagen.options].some((opcion) => opcion.value === ID_FORMATO_LABORATORIO_FRAY) && usuarioPuedeUsarFormato(ID_FORMATO_LABORATORIO_FRAY, permisosFormatosUsuarioActual, rolUsuarioActual, medicoActualDatos)) {
    const opcion = document.createElement("option");
    opcion.value = ID_FORMATO_LABORATORIO_FRAY;
    opcion.textContent = "Formatos Fray · Solicitud de análisis clínicos · FTO-HPFBA-EXPC-LAB-SAC";
    formatoImagen.appendChild(opcion);
  }
  if (!valorCampo("solicitudEstudioFecha")) ponerValor("solicitudEstudioFecha", fechaISOHoy());
  if (!catalogoMedicosFirmasIndicacionesCache.length) {
    await cargarCatalogoMedicosFirmasIndicaciones().catch((error) => console.warn("No se pudo cargar el catálogo de médicos para la solicitud", error));
  }
  configurarSolicitudEstudios();
  configurarMedicosSolicitud();
  if (!estadoSolicitud.medicoSolicitanteId && estadoSolicitud.modoSolicitante === "catalogo") {
    const uidActual = auth.currentUser?.uid || medicoActualDatos?.uid || "";
    const nombreActual = normalizarTextoBusqueda(medicoActualDatos?.nombre || medicoActualDatos?.nombreCompleto || "");
    const medicoActualCatalogo = catalogoMedicosFirmasIndicacionesCache.find((medico) => medico.id === uidActual || normalizarTextoBusqueda(medico.nombre) === nombreActual);
    if (medicoActualCatalogo) estadoSolicitud.medicoSolicitanteId = medicoActualCatalogo.id;
  }
  sincronizarFormularioPorFormatoSolicitud(valorCampo("solicitudEstudioFormato"));
  if (resolverFormatoSolicitud(valorCampo("solicitudEstudioFormato"))?.id === FORMATO_SOLICITUD_IMAGENOLOGIA.clave && !solicitudImagenologiaActiva) {
    manejarCambioFormatoSolicitud();
  }
  renderizarListaSolicitudEstudios();
  actualizarPreviewSolicitudEstudios();
  await cargarEstudiosPaciente();
};

window.mostrarNotasRapidas = async function() {
  ocultarSecciones();
  document.getElementById("seccionNotasRapidas").style.display = "block";
  await cargarNotasRapidasPaciente();
};

async function cargarResultadosEscalasPaciente() {
  const contenedor = document.getElementById("resultadosEscalasExpediente");
  if (!contenedor) return;
  contenedor.innerHTML = "Cargando resultados...";

  try {
    await cargarDependenciasEscalasPaciente();
    const escalas = await listarEscalasAplicadas(uidPaciente, 80);

    if (!escalas.length) {
      contenedor.innerHTML = "<p>No hay resultados de escalas registrados.</p>";
      return;
    }

    contenedor.innerHTML = escalas.map((r) => renderizarEscalaHistorialPaciente(r)).join("");
    enlazarControlesHistorialEscalas(contenedor, escalas);
    contenedor.querySelectorAll("[data-copiar-resumen-escala]").forEach((boton) => {
      boton.addEventListener("click", async () => {
        const escala = escalas.find((item) => item.idEscalaAplicada === boton.dataset.copiarResumenEscala);
        if (!escala) return;
        await navigator.clipboard?.writeText(crearResumenEscala(escala));
        alert("Resumen de escala copiado.");
      });
    });
  } catch (error) {
    console.error("Error al cargar escalas:", error);
    contenedor.innerHTML = "<p>No se pudieron cargar los resultados.</p>";
  }
}

function renderizarEscalaHistorialPaciente(escala) {
  const maximo = escala.puntajeMaximo ? ` / ${escaparHTML(escala.puntajeMaximo)}` : escala.rango ? ` / ${escaparHTML(escala.rango)}` : "";
  const respuestas = (escala.respuestasPorItem || []).map((respuesta) => {
    const valorRespuesta = respuesta.valor !== undefined && respuesta.valor !== null && respuesta.valor !== ""
      ? ` (${escaparHTML(respuesta.valor)})`
      : "";
    const dominioRespuesta = respuesta.dominio ? ` - ${escaparHTML(respuesta.dominio)}` : "";
    return `
    <li>
      <strong>${escaparHTML(respuesta.item || "")}</strong>
      <span>${escaparHTML(respuesta.respuesta || "")}${valorRespuesta}${dominioRespuesta}</span>
    </li>
  `;
  }).join("");
  const dominios = escala.puntajesPorDominio && Object.keys(escala.puntajesPorDominio).length
    ? `<p><strong>Puntajes por dominio:</strong> ${escaparHTML(Object.entries(escala.puntajesPorDominio).map(([dominio, valor]) => `${dominio}: ${valor}`).join("; "))}</p>`
    : "";
  const puedeCambiarVisibilidad = rolUsuarioActual === "admin" || rolUsuarioActual === "psicologo" || usuarioActualEsEnfermeriaSaludMental() || rolUsuarioActual === "medico";
  const visible = escala.visibilidadPaciente === true || escala.visibleDesdePaciente === true;
  const controlVisibilidad = puedeCambiarVisibilidad ? `
    <label class="switch-linea resultado-visibilidad">
      <input type="checkbox" data-visible-resultado-escala="${escaparHTML(escala.idEscalaAplicada)}" ${visible ? "checked" : ""}>
      Visible para paciente
    </label>
  ` : `<span class="badge-visibilidad">${visible ? "Visible para paciente" : "Oculta para paciente"}</span>`;

  return `
    <details class="resultado-escala-card resultado-escala-collapsible">
      <summary>
        <div>
          <strong>${escaparHTML(escala.nombreEscala || "Escala")}</strong>
          <span>${escaparHTML(escala.tipoEscala || "")} - ${escaparHTML(formatearFechaEscala(escala.fechaAplicacion))} - ${escaparHTML(escala.origen || "")}</span>
        </div>
        <div class="resultado-puntaje">${escaparHTML(String(escala.puntajeTotal ? escala.puntajeTotal : ""))}${maximo}</div>
        <p>${escaparHTML(escala.interpretacion || "Sin interpretacion")}</p>
        ${controlVisibilidad}
      </summary>
      <div class="resultado-escala-detalle">
        <p><strong>Profesional aplicador:</strong> ${escaparHTML(escala.medicoNombre || escala.uidProfesional || escala.uidMedico || "Sin registro")}</p>
        <p><strong>Fecha y hora:</strong> ${escaparHTML(formatearFechaEscala(escala.fechaAplicacion, true))}</p>
        <p><strong>Observaciones:</strong> ${escaparHTML(escala.observacionesClinicas || escala.observaciones || "Sin observaciones")}</p>
        ${dominios}
        ${escala.recomendaciones ? `<p><strong>Recomendaciones:</strong> ${escaparHTML(escala.recomendaciones)}</p>` : ""}
        <ul>${respuestas || "<li>Sin respuestas registradas.</li>"}</ul>
        <div class="resultado-escala-acciones">
          <button type="button" data-copiar-resumen-escala="${escaparHTML(escala.idEscalaAplicada)}">Copiar resumen clinico</button>
          <button type="button" disabled>Exportar PDF proximamente</button>
        </div>
      </div>
    </details>
  `;
}

function enlazarControlesHistorialEscalas(contenedor, escalas) {
  contenedor.querySelectorAll("[data-visible-resultado-escala]").forEach((control) => {
    control.addEventListener("change", async () => {
      const escala = escalas.find((item) => item.idEscalaAplicada === control.dataset.visibleResultadoEscala);
      await actualizarVisibilidadResultadoEscala(control.dataset.visibleResultadoEscala, control.checked, escala);
    });
  });
}

async function actualizarVisibilidadResultadoEscala(idEscalaAplicada, visible, escala = {}) {
  if (!idEscalaAplicada) return;
  const datos = {
    visibilidadPaciente: visible,
    visibleDesdePaciente: visible,
    actualizadoPor: auth.currentUser?.uid || "",
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, "usuarios", uidPaciente, "escalasAplicadas", idEscalaAplicada), datos, { merge: true });
  await setDoc(doc(db, "usuarios", uidPaciente, "resultadosEscalas", idEscalaAplicada), datos, { merge: true });

  await registrarAccionExpediente({
    accion: visible ? "hacer_visible_resultado_escala" : "ocultar_resultado_escala",
    descripcion: visible
      ? "El profesional hizo visible un resultado de escala para el paciente."
      : "El profesional oculto un resultado de escala para el paciente.",
    detalles: {
      idEscalaAplicada,
      nombreEscala: escala?.nombreEscala || ""
    }
  });
}
window.abrirRehabilitacionCognitivaPaciente = function() {
  if (!uidPaciente) {
    alert("Selecciona o recarga el expediente del paciente antes de aplicar un tamizaje cognitivo.");
    return;
  }
  window.location.href = `rehabilitacion-cognitiva.html?id=${encodeURIComponent(uidPaciente)}`;
};

window.mostrarRehabilitacionCognitivaPaciente = async function() {
  ocultarSecciones();
  const seccion = document.getElementById("seccionRehabilitacionCognitivaPaciente");
  if (seccion) seccion.style.display = "block";
  await cargarRehabilitacionCognitivaPaciente();
};

async function cargarRehabilitacionCognitivaPaciente() {
  const perfil = document.getElementById("perfilCognitivoPaciente");
  const historial = document.getElementById("historialCognitivoPaciente");
  const recomendaciones = document.getElementById("recomendacionesCognitivasPaciente");
  if (perfil) perfil.textContent = "Cargando perfil cognitivo...";
  if (historial) historial.textContent = "Cargando resultados...";
  if (recomendaciones) recomendaciones.textContent = "Cargando recomendaciones...";

  try {
    await cargarDependenciasEscalasPaciente();
    const escalas = await listarEscalasAplicadas(uidPaciente, 120);
    const cognitivas = escalas.filter((escala) => String(escala.tipoEscala || "").toLowerCase() === "cognitiva");

    if (!cognitivas.length) {
      if (perfil) perfil.innerHTML = `<p>No hay tamizajes cognitivos aplicados todava.</p>`;
      if (historial) historial.innerHTML = `<p>Aplica una escala cognitiva desde nota clnica o desde el mdulo de rehabilitacin cognitiva.</p>`;
      if (recomendaciones) recomendaciones.innerHTML = renderizarRecomendacionesCognitivas([]);
      return;
    }

    const ultima = cognitivas[0];
    const dominios = consolidarDominiosCognitivos(cognitivas);

    if (perfil) {
      perfil.innerHTML = `
        <article class="registro-card">
          <div class="registro-top">
            <div>
              <strong>${escaparHTML(cognitivas.length)} tamizaje(s) cognitivo(s)</strong>
              <span>Ultima aplicacion: ${escaparHTML(formatearFechaEscala(ultima.fechaAplicacion, true))}</span>
            </div>
            <span class="badge-visibilidad">${escaparHTML(ultima.nombreEscala || "Escala")}</span>
          </div>
          <p>${escaparHTML(ultima.interpretacion || "Sin interpretacion registrada")}</p>
          <p><strong>Dominios registrados:</strong> ${escaparHTML(dominios.map((item) => item.dominio).join(", ") || "Sin dominios capturados")}</p>
        </article>
      `;
    }

    if (historial) {
      historial.innerHTML = cognitivas.map((escala) => renderizarEscalaHistorialPaciente(escala)).join("");
      enlazarControlesHistorialEscalas(historial, cognitivas);
      historial.querySelectorAll("[data-copiar-resumen-escala]").forEach((boton) => {
        boton.addEventListener("click", async () => {
          const escala = cognitivas.find((item) => item.idEscalaAplicada === boton.dataset.copiarResumenEscala);
          if (!escala) return;
          await navigator.clipboard?.writeText(crearResumenEscala(escala));
          alert("Resumen de escala copiado.");
        });
      });
    }

    if (recomendaciones) recomendaciones.innerHTML = renderizarRecomendacionesCognitivas(dominios);
  } catch (error) {
    console.error("Error al cargar rehabilitacion cognitiva del paciente:", error);
    if (perfil) perfil.textContent = "No se pudo cargar el perfil cognitivo.";
    if (historial) historial.textContent = "No se pudo cargar el historial cognitivo.";
    if (recomendaciones) recomendaciones.textContent = "No se pudieron cargar recomendaciones.";
  }
}

function consolidarDominiosCognitivos(escalas = []) {
  const conteo = new Map();
  escalas.forEach((escala) => {
    const dominios = escala.puntajesPorDominio || {};
    Object.entries(dominios).forEach(([dominio, valor]) => {
      const actual = conteo.get(dominio) || { dominio, aplicaciones: 0, puntaje: 0 };
      actual.aplicaciones += 1;
      actual.puntaje += Number(valor || 0);
      conteo.set(dominio, actual);
    });
    (escala.dominiosEvaluados || []).forEach((dominio) => {
      if (!conteo.has(dominio)) conteo.set(dominio, { dominio, aplicaciones: 1, puntaje: 0 });
    });
  });
  return Array.from(conteo.values()).sort((a, b) => b.aplicaciones - a.aplicaciones || a.dominio.localeCompare(b.dominio));
}

function renderizarRecomendacionesCognitivas(dominios = []) {
  const mapa = {
    "Atencion": "Ejercicios de atencion sostenida/selectiva, busqueda visual y Go/No-Go.",
    "Memoria": "Ejercicios de evocacion, aprendizaje verbal, memoria visual y memoria de trabajo.",
    "Funciones ejecutivas": "Planificacion, flexibilidad cognitiva, inhibicion y tareas tipo Stroop/Trail Making.",
    "Lenguaje": "Fluidez verbal, denominacion supervisada y ejercicios de acceso lexico.",
    "Velocidad de procesamiento": "Tareas breves cronometradas con registro de precision y tiempo de reaccion.",
    "Visuoespacial": "Copia de figuras, reloj, rutas visuales y memoria espacial tipo Corsi.",
    "Cognicion social": "Reconocimiento emocional y ejercicios de interpretacion de claves sociales."
  };
  const claves = dominios.length ? dominios.map((item) => item.dominio) : ["Atencin", "Memoria", "Funciones ejecutivas"];
  return claves.slice(0, 6).map((dominio) => `
    <article class="registro-card">
      <strong>${escaparHTML(dominio)}</strong>
      <p>${escaparHTML(mapa[dominio] || "Seleccionar actividades de rehabilitacin segn entrevista clnica y desempeo observado.")}</p>
    </article>
  `).join("");
}
async function cargarEscalasAsignablesPaciente() {
  const contenedor = document.getElementById("listaEscalasAsignables");
  if (!contenedor) return;
  contenedor.textContent = "Cargando escalas...";

  try {
    await cargarDependenciasEscalasPaciente();
    const snap = await getDocs(collection(db, "usuarios", uidPaciente, "escalasAsignadas"));
    escalasAsignadasCache = new Map(snap.docs.map((docEscala) => [docEscala.id, docEscala.data()]));

    const escalasAsignables = [
      ...ESCALAS_PSIQUIATRICAS.map((escala) => ({ ...escala, tipoAsignable: "psiquiatrica" })),
      ...ESCALAS_COGNITIVAS.map((escala) => ({ ...escala, area: "Cognitiva", descripcion: escala.descripcion, tipoAsignable: "cognitiva" }))
    ];

    contenedor.innerHTML = escalasAsignables.map((escala) => {
      const asignada = escalasAsignadasCache.get(escala.id);
      const visible = asignada?.visiblePaciente === true;
      return `
        <article class="registro-card escala-asignable">
          <div class="registro-top">
            <div>
              <strong>${escaparHTML(escala.nombre)}</strong>
              <span>${escaparHTML(escala.area || "")}</span>
            </div>
            <label class="switch-linea">
              <input type="checkbox" data-escala-visible="${escala.id}" ${visible ? "checked" : ""}>
              Visible
            </label>
          </div>
          <p>${escaparHTML(escala.descripcion || "Sin descripcion")}</p>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-escala-visible]").forEach((control) => {
      control.addEventListener("change", () => actualizarVisibilidadEscala(control));
    });
  } catch (error) {
    console.error("Error al cargar escalas asignables:", error);
    contenedor.textContent = "No se pudieron cargar las escalas.";
  }
}

async function actualizarVisibilidadEscala(control) {
  try {
    await cargarDependenciasEscalasPaciente();
  } catch (error) {
    console.error("No se pudo cargar el mdulo de escalas:", error);
    control.checked = !control.checked;
    alert("El mdulo de escalas no est disponible. El resto del expediente contina funcionando.");
    return;
  }

  const escalaId = control.dataset.escalaVisible;
  const escala = [
    ...ESCALAS_PSIQUIATRICAS,
    ...ESCALAS_COGNITIVAS.map((item) => ({ ...item, area: "Cognitiva" }))
  ].find((item) => item.id === escalaId);
  if (!escala) return;

  const visiblePaciente = control.checked;

  await setDoc(doc(db, "usuarios", uidPaciente, "escalasAsignadas", escalaId), {
    escalaId,
    escalaNombre: escala.nombre,
    area: escala.area || "",
    visiblePaciente,
    actualizadoPor: auth.currentUser?.uid || "",
    actualizadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  }, { merge: true });

  await registrarAccionExpediente({
    accion: visiblePaciente ? "activar_escala_mi_salud" : "ocultar_escala_mi_salud",
    descripcion: visiblePaciente
      ? "El mdico hizo visible una escala en Mi Salud."
      : "El medico oculto una escala en Mi Salud.",
    detalles: {
      escalaId,
      escalaNombre: escala.nombre
    }
  });
}

async function guardarTareaMiSaludPaciente() {
  const titulo = valorCampo("tareaMiSaludTitulo").trim();
  const indicaciones = valorCampo("tareaMiSaludIndicaciones").trim();
  const fechaLimite = valorCampo("tareaMiSaludFecha");

  if (!titulo) {
    alert("Escribe la tarea que quieres asignar.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "tareasMiSalud"), {
    titulo,
    indicaciones,
    fechaLimite,
    estado: "pendiente",
    visiblePaciente: true,
    creadoPor: auth.currentUser?.uid || "",
    creadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "asignar_tarea_mi_salud",
    descripcion: "El medico asigno una tarea en Mi Salud.",
    detalles: {
      titulo,
      fechaLimite
    }
  });

  ponerValor("tareaMiSaludTitulo", "");
  ponerValor("tareaMiSaludIndicaciones", "");
  ponerValor("tareaMiSaludFecha", "");
  await cargarTareasMiSaludMedico();
}

async function cargarTareasMiSaludMedico() {
  const contenedor = document.getElementById("listaTareasMiSaludMedico");
  if (!contenedor) return;
  contenedor.textContent = "Cargando tareas...";

  try {
    const q = query(
      collection(db, "usuarios", uidPaciente, "tareasMiSalud"),
      orderBy("fechaISO", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      contenedor.innerHTML = "<p>Aun no hay tareas asignadas.</p>";
      return;
    }

    contenedor.innerHTML = snap.docs.map((docTarea) => {
      const tarea = docTarea.data();
      return `
        <article class="registro-card">
          <div class="registro-top">
            <div>
              <strong>${escaparHTML(tarea.titulo || "Tarea")}</strong>
              <span>${escaparHTML(tarea.fechaLimite ? `Lmite: ${tarea.fechaLimite}` : "Sin fecha lmite")}</span>
            </div>
            <span class="estado-badge ${tarea.estado === "completada" ? "activo" : ""}">${escaparHTML(tarea.estado || "pendiente")}</span>
          </div>
          ${tarea.indicaciones ? `<p>${escaparHTML(tarea.indicaciones)}</p>` : ""}
          <div class="registro-actions">
            <button type="button" class="boton-peligro" data-eliminar-tarea-mi-salud="${docTarea.id}">Eliminar</button>
          </div>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-eliminar-tarea-mi-salud]").forEach((boton) => {
      boton.addEventListener("click", () => eliminarTareaMiSaludPaciente(boton.dataset.eliminarTareaMiSalud));
    });
  } catch (error) {
    console.error("Error al cargar tareas de Mi Salud:", error);
    contenedor.textContent = "No se pudieron cargar las tareas.";
  }
}

async function eliminarTareaMiSaludPaciente(tareaId) {
  if (!confirm("Eliminar esta tarea de Mi Salud?")) return;

  await deleteDoc(doc(db, "usuarios", uidPaciente, "tareasMiSalud", tareaId));
  await registrarAccionExpediente({
    accion: "eliminar_tarea_mi_salud",
    descripcion: "El medico elimino una tarea de Mi Salud.",
    detalles: { tareaId }
  });
  await cargarTareasMiSaludMedico();
}

async function cargarPermisosMedicos() {
  const contenedor = document.getElementById("listaPermisosMedicos");
  contenedor.innerHTML = "Cargando permisos...";

  const permisos = await listarPermisosMedicos(uidPaciente);

  if (permisos.length === 0) {
    contenedor.innerHTML = `
      <p>No hay medicos con permisos registrados.</p>
    `;
    return;
  }

  contenedor.innerHTML = "";

  for (const permiso of permisos) {
    const medico = await obtenerUsuario(permiso.uid);

    const nombreMedico =
      medico?.nombre ||
      medico?.email ||
      permiso.uid;

    const rolActual = permiso.rolPermiso || "estudiante";

    contenedor.innerHTML += `
      <div class="dato" style="margin-bottom:16px;">
        <strong>${nombreMedico}</strong>
        <br>
        <span>Rol actual: ${rolActual}</span>
        <br><br>

        <select id="rol-${permiso.uid}">
          <option value="tratante" ${rolActual === "tratante" ? "selected" : ""}>Tratante</option>
          <option value="colaborador" ${rolActual === "colaborador" ? "selected" : ""}>Colaborador</option>
          <option value="estudiante" ${rolActual === "estudiante" ? "selected" : ""}>Estudiante</option>
        </select>

        <button onclick="cambiarRolPermiso('${permiso.uid}')">
          Cambiar rol
        </button>

        <button style="background:#8b0000; color:white;" onclick="revocarPermiso('${permiso.uid}')">
          Revocar
        </button>
      </div>
    `;
  }
}

window.agregarPermisoMedico = async function() {
  const correo = document
    .getElementById("correoMedicoPermiso")
    .value
    .trim()
    .toLowerCase();

  const rol = document.getElementById("rolPermisoMedico").value;

  if (!correo) {
    alert("Escribe el correo del medico.");
    return;
  }

  const medico = await buscarMedicoPorCorreo(correo);

  if (!medico) {
    alert("No se encontr un mdico registrado con ese correo.");
    return;
  }

  await otorgarPermisoMedico(
    uidPaciente,
    medico.uid,
    rol,
    auth.currentUser.uid
  );

  alert("Permiso otorgado correctamente.");

  document.getElementById("correoMedicoPermiso").value = "";

  await cargarPermisosMedicos();
};

window.cambiarRolPermiso = async function(uidMedico) {
  const nuevoRol = document.getElementById(`rol-${uidMedico}`).value;

  await cambiarRolPermisoMedico(
    uidPaciente,
    uidMedico,
    nuevoRol,
    auth.currentUser.uid
  );

  alert("Rol actualizado.");

  await cargarPermisosMedicos();
};

window.revocarPermiso = async function(uidMedico) {
  const confirmar = confirm("Seguro que deseas revocar el acceso de este mdico?");

  if (!confirmar) return;

  await revocarPermisoMedico(uidPaciente, uidMedico);

  alert("Permiso revocado.");

  await cargarPermisosMedicos();
};

function limpiarParteNombrePaciente(valor = "") {
  return String(valor || "").trim().replace(/\s+/g, " ");
}

function nombrePacienteEstructurado(datos = {}) {
  return datos?.nombreEstructurado === true ||
    Boolean(limpiarParteNombrePaciente(datos?.nombres) && limpiarParteNombrePaciente(datos?.apellidoPaterno));
}

function claveAvisoNombrePaciente() {
  return `avisoNombreCerrado:${uidPaciente || "sin-paciente"}`;
}

function actualizarAvisoFormatoNombrePaciente(datos = datosPacienteActual || {}) {
  const aviso = document.getElementById("avisoFormatoNombrePaciente");
  if (!aviso) return;
  const debeMostrarse = !nombrePacienteEstructurado(datos) && !sessionStorage.getItem(claveAvisoNombrePaciente());
  aviso.classList.toggle("oculto", !debeMostrarse);
}

function actualizarNombrePacienteEnPantalla(datos = datosPacienteActual || {}) {
  ponerTexto("nombrePaciente", obtenerNombrePacienteParaMostrar(datos) || "Paciente sin nombre");
  actualizarAvisoFormatoNombrePaciente(datos);
  renderizarVistaLaboratorioPaciente(datos);
}

function cerrarEditorNombrePaciente() {
  document.getElementById("modalNombrePaciente")?.remove();
}

function campoEditorNombrePaciente(id, etiqueta, valor = "") {
  return `
    <label>${escaparHTML(etiqueta)}
      <input id="${id}" value="${escaparHTML(valor)}">
    </label>
  `;
}

function htmlCamposNombreSeparado(datos = {}, valores = {}) {
  return `
    <div class="editor-nombre-paciente-grid">
      ${campoEditorNombrePaciente("editorNombresPaciente", "Nombre(s)", valores.nombres ?? datos.nombres ?? datos.datosInstitucionales?.nombres ?? "")}
      ${campoEditorNombrePaciente("editorApellidoPaternoPaciente", "Apellido paterno", valores.apellidoPaterno ?? datos.apellidoPaterno ?? datos.datosInstitucionales?.apellidoPaterno ?? "")}
      ${campoEditorNombrePaciente("editorApellidoMaternoPaciente", "Apellido materno", valores.apellidoMaterno ?? datos.apellidoMaterno ?? datos.datosInstitucionales?.apellidoMaterno ?? "")}
    </div>
  `;
}

function renderizarEditorNombreSeparado(contenido, datos = {}, modoNormalizado = false) {
  contenido.innerHTML = `
    <h3>Editar nombre</h3>
    ${!modoNormalizado ? `<div class="editor-nombre-paciente-referencia"><b>Nombre actual:</b><br>${escaparHTML(obtenerNombrePacienteParaMostrar(datos) || "")}</div>` : ""}
    ${htmlCamposNombreSeparado(datos)}
    <div class="modal-tipo-paciente-acciones">
      <button type="button" id="guardarNombreSeparadoPaciente">${modoNormalizado ? "Guardar cambios" : "Guardar nombre separado"}</button>
      <button type="button" class="boton-secundario" data-cancelar-nombre-paciente>Cancelar</button>
    </div>
  `;

  contenido.querySelector("[data-cancelar-nombre-paciente]")?.addEventListener("click", cerrarEditorNombrePaciente);
  contenido.querySelector("#guardarNombreSeparadoPaciente")?.addEventListener("click", guardarNombreSeparadoPacienteDesdeEditor);
}

async function guardarNombreCompletoAntiguoPacienteDesdeEditor() {
  const campo = document.getElementById("editorNombreCompletoPaciente");
  const nombreCompleto = limpiarParteNombrePaciente(campo?.value || "");
  if (!nombreCompleto) {
    alert("Escribe el nombre del paciente.");
    return;
  }

  const datos = datosPacienteActual || {};
  const datosInstitucionales = {
    ...(datos.datosInstitucionales || {}),
    nombrePaciente: nombreCompleto,
    nombreCompleto
  };
  const actualizacion = {
    nombre: nombreCompleto,
    nombreCompleto,
    datosInstitucionales
  };

  await actualizarUsuario(uidPaciente, actualizacion);
  datosPacienteActual = {
    ...datos,
    ...actualizacion
  };
  cerrarEditorNombrePaciente();
  actualizarNombrePacienteEnPantalla(datosPacienteActual);
}

async function guardarNombreSeparadoPacienteDesdeEditor() {
  const nombres = limpiarParteNombrePaciente(document.getElementById("editorNombresPaciente")?.value || "");
  const apellidoPaterno = limpiarParteNombrePaciente(document.getElementById("editorApellidoPaternoPaciente")?.value || "");
  const apellidoMaterno = limpiarParteNombrePaciente(document.getElementById("editorApellidoMaternoPaciente")?.value || "");

  if (!nombres) {
    alert("Escribe el nombre o nombres del paciente.");
    return;
  }
  if (!apellidoPaterno) {
    alert("Escribe el apellido paterno del paciente.");
    return;
  }

  const nombreCompleto = construirNombreCompletoPaciente({ nombres, apellidoPaterno, apellidoMaterno });
  const datos = datosPacienteActual || {};
  const datosInstitucionales = {
    ...(datos.datosInstitucionales || {}),
    nombrePaciente: nombreCompleto,
    nombreCompleto,
    nombres,
    apellidoPaterno,
    apellidoMaterno
  };
  const actualizacion = {
    nombre: nombreCompleto,
    nombreCompleto,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreEstructurado: true,
    fechaActualizacionNombre: serverTimestamp(),
    datosInstitucionales
  };

  await actualizarUsuario(uidPaciente, actualizacion);
  datosPacienteActual = {
    ...datos,
    ...actualizacion
  };
  cerrarEditorNombrePaciente();
  actualizarNombrePacienteEnPantalla(datosPacienteActual);
}

window.editarNombrePaciente = async function() {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente) || {};
  datosPacienteActual = datos;
  const normalizado = nombrePacienteEstructurado(datos);

  cerrarEditorNombrePaciente();
  const modal = document.createElement("div");
  modal.id = "modalNombrePaciente";
  modal.className = "modal-tipo-paciente";
  modal.innerHTML = `
    <div class="modal-tipo-paciente-contenido selector-campo-paciente">
      <div data-contenido-editor-nombre></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (evento) => {
    if (evento.target === modal) cerrarEditorNombrePaciente();
  });

  const contenido = modal.querySelector("[data-contenido-editor-nombre]");
  if (normalizado) {
    renderizarEditorNombreSeparado(contenido, datos, true);
    return;
  }

  contenido.innerHTML = `
    <h3>Editar nombre</h3>
    <div class="editor-nombre-paciente-opciones">
      <div>
        <label>Nombre actual
          <input id="editorNombreCompletoPaciente" value="${escaparHTML(obtenerNombrePacienteParaMostrar(datos) || "")}">
        </label>
        <button type="button" id="guardarNombreCompletoAntiguoPaciente">Guardar nombre como est</button>
      </div>
      <div class="editor-nombre-paciente-referencia">
        <b>Separar nombre por apellidos</b>
        <p>Escribe manualmente cada parte. No se separar el nombre automticamente.</p>
        <button type="button" class="boton-secundario" id="separarNombrePacienteManual">Separar nombre por apellidos</button>
      </div>
      <div class="modal-tipo-paciente-acciones">
        <button type="button" class="boton-secundario" data-cancelar-nombre-paciente>Cancelar</button>
      </div>
    </div>
  `;

  contenido.querySelector("[data-cancelar-nombre-paciente]")?.addEventListener("click", cerrarEditorNombrePaciente);
  contenido.querySelector("#guardarNombreCompletoAntiguoPaciente")?.addEventListener("click", guardarNombreCompletoAntiguoPacienteDesdeEditor);
  contenido.querySelector("#separarNombrePacienteManual")?.addEventListener("click", () => renderizarEditorNombreSeparado(contenido, datos, false));
};

window.editarDatosPaciente = async function() {
  const datos = await obtenerUsuario(uidPaciente);

  const nuevoTelefono = prompt("Telfono:", datos.telefono || "");
  if (nuevoTelefono === null) return;

  const nuevoDiagnostico = prompt("Diagnstico:", datos.diagnostico || "");
  if (nuevoDiagnostico === null) return;

  const nuevoTratamiento = prompt("Tratamiento:", datos.tratamiento || "");
  if (nuevoTratamiento === null) return;

  const nuevoMedico = prompt("Mdico tratante:", datos.medicoTratante || "");
  if (nuevoMedico === null) return;

  const nuevaConsulta = prompt("última consulta:", datos.ultimaConsulta || "");
  if (nuevaConsulta === null) return;

  await actualizarUsuario(uidPaciente, {
    telefono: nuevoTelefono,
    diagnostico: nuevoDiagnostico,
    tratamiento: nuevoTratamiento,
    medicoTratante: nuevoMedico,
    ultimaConsulta: nuevaConsulta
  });

  await cargarDatosPaciente();

  alert("Datos actualizados");
};

window.editarTipoPaciente = async function() {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente) || {};
  const valorActual = datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente || "privada";
  const tipoNormalizado = normalizarTipoPaciente(valorActual);
  const opcionesBase = ["privada", "institucion", "clinica"];
  const valorSelect = opcionesBase.includes(tipoNormalizado) || tipoNormalizado === "institucional"
    ? (esTipoPacienteInstitucional(valorActual) ? "institucion" : tipoNormalizado)
    : "otro";

  document.getElementById("modalTipoPaciente")?.remove();

  const modal = document.createElement("div");
  modal.id = "modalTipoPaciente";
  modal.style.cssText = "position:fixed;inset:0;z-index:120;display:grid;place-items:center;background:rgba(2,6,23,.68);backdrop-filter:blur(8px);padding:18px;";
  modal.innerHTML = `
    <section style="width:min(380px,100%);border:1px solid rgba(56,189,248,.28);border-radius:18px;background:rgba(8,12,20,.98);box-shadow:0 22px 70px rgba(0,0,0,.44);padding:18px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px;">
        <div>
          <p style="margin:0 0 4px;color:#529866;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Datos generales</p>
          <h3 style="margin:0;">Tipo de paciente</h3>
        </div>
        <button type="button" data-cerrar-tipo-paciente style="margin:0;width:32px;height:32px;padding:0;border-radius:999px;">x</button>
      </div>
      <label style="display:block;margin-bottom:8px;color:#94a3b8;font-weight:700;">Seleccionar tipo</label>
      <select id="modalTipoPacienteSelect" style="width:100%;padding:11px;border-radius:14px;background:#0e1411;color:#fff;border:1px solid rgba(148,163,184,.28);">
        <option value="privada">Privado</option>
        <option value="institucion">Institucional</option>
        <option value="clinica">Clinica</option>
        <option value="otro">Otro...</option>
      </select>
      <input id="modalTipoPacienteManual" placeholder="Especificar tipo de paciente" style="width:100%;margin-top:10px;padding:11px;border-radius:14px;background:#0e1411;color:#fff;border:1px solid rgba(148,163,184,.28);">
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" data-cerrar-tipo-paciente>Cancelar</button>
        <button type="button" id="guardarTipoPacienteModal">Guardar</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  const selector = document.getElementById("modalTipoPacienteSelect");
  const manual = document.getElementById("modalTipoPacienteManual");

  selector.value = valorSelect;
  manual.value = valorSelect === "otro" ? String(valorActual || "") : "";

  const actualizarManual = () => {
    manual.style.display = selector.value === "otro" ? "block" : "none";
  };

  actualizarManual();
  selector.addEventListener("change", actualizarManual);

  modal.querySelectorAll("[data-cerrar-tipo-paciente]").forEach((boton) => {
    boton.addEventListener("click", () => modal.remove());
  });

  document.getElementById("guardarTipoPacienteModal")?.addEventListener("click", async () => {
    const tipoPaciente = selector.value === "otro"
      ? (manual.value.trim() || "otro")
      : selector.value;

    const datosInstitucionales = {
      ...(datos.datosInstitucionales || {}),
      tipoPaciente
    };

    await actualizarUsuario(uidPaciente, {
      tipoPaciente,
      datosInstitucionales
    });

    modal.remove();
    await cargarDatosPaciente();
    alert("Tipo de paciente actualizado");
  });
};

function seleccionarValorPaciente(etiqueta = "Campo", valorActual = "", opciones = []) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-tipo-paciente";
    const opcionesHtml = opciones.map((opcion) => `
      <option value="${escaparHTML(opcion)}" ${String(valorActual) === opcion ? "selected" : ""}>${escaparHTML(opcion)}</option>
    `).join("");
    modal.innerHTML = `
      <div class="modal-tipo-paciente-contenido selector-campo-paciente">
        <h3>${escaparHTML(etiqueta)}</h3>
        <label>
          Seleccionar opcion
          <select id="selectorCampoPaciente">${opcionesHtml}</select>
        </label>
        <label id="campoManualPacienteWrap" class="oculto">
          Especificar
          <input id="campoManualPaciente" type="text" value="${escaparHTML(valorActual)}" placeholder="Escribe el valor">
        </label>
        <div class="modal-tipo-paciente-acciones">
          <button type="button" class="boton-secundario" data-cancelar-selector-paciente>Cancelar</button>
          <button type="button" class="boton-primario" id="guardarSelectorCampoPaciente">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const selector = modal.querySelector("#selectorCampoPaciente");
    const manualWrap = modal.querySelector("#campoManualPacienteWrap");
    const manual = modal.querySelector("#campoManualPaciente");
    const actualizarManual = () => manualWrap?.classList.toggle("oculto", selector.value !== "Otro..." && selector.value !== "Otra...");
    actualizarManual();
    selector?.addEventListener("change", actualizarManual);

    modal.querySelector("[data-cancelar-selector-paciente]")?.addEventListener("click", () => {
      modal.remove();
      resolve(null);
    });
    modal.querySelector("#guardarSelectorCampoPaciente")?.addEventListener("click", () => {
      const esManual = selector.value === "Otro..." || selector.value === "Otra...";
      const valor = esManual ? manual.value.trim() : selector.value;
      modal.remove();
      resolve(valor);
    });
  });
}

async function guardarCampoPacienteInline(campo, nuevoValor, datos = {}) {
  if (nuevoValor === null) return;
  if (campo === "fechaIngreso") nuevoValor = normalizarFechaIngreso(nuevoValor);

  if (["peso", "talla", "imc", "perimetroAbdominal"].includes(campo)) {
    const valorNumerico = numeroDesdeTexto(nuevoValor);
    if (!valorNumerico) {
      alert("Registra un valor numérico válido para este dato somatométrico.");
      return;
    }
    nuevoValor = String(valorNumerico);
  }

  // La somatometría se registra en varias vistas. Siempre parte del documento
  // más reciente para no sobrescribir cambios de otros campos anidados.
  const datosActuales = ["peso", "talla", "imc", "perimetroAbdominal"].includes(campo)
    ? (await obtenerUsuario(uidPaciente) || datos)
    : datos;

  const actualizacion = {
    [campo]: nuevoValor
  };

  const camposInstitucionales = new Set([
    "tipoPaciente",
    "institucionPaciente",
    "servicioInstitucional",
    "expediente",
    "cama",
    "curp",
    "fechaIngreso",
    "ultimoIngreso",
    "medicoAdscritoEncargado",
    "residenteEncargado",
    "fechaNacimiento",
    "sexo",
    "genero",
    "alergias",
    "tipoSangre",
    "peso",
    "talla",
    "imc",
    "perimetroAbdominal",
    "diasEstancia",
    "díasEstancia"
  ]);

  if (campo === "fechaNacimiento") {
    actualizacion.edad = deleteField();
  }

  if (camposInstitucionales.has(campo)) {
    const datosInstitucionales = {
      ...(datosActuales?.datosInstitucionales || {}),
      [campo]: nuevoValor
    };
    delete datosInstitucionales.edad;
    actualizacion.datosInstitucionales = datosInstitucionales;

    if (campo === "institucionPaciente") actualizacion.institucion = nuevoValor;
    if (campo === "servicioInstitucional") actualizacion.servicio = nuevoValor;
    if (campo === "expediente") actualizacion.numeroExpediente = nuevoValor;
    if (["peso", "talla", "perimetroAbdominal"].includes(campo)) {
      actualizacion.signosVitales = {
        ...(datosActuales?.signosVitales || {}),
        [campo]: nuevoValor,
      };
      actualizacion.somatometria = {
        ...(datosActuales?.somatometria || {}),
        [campo]: nuevoValor,
      };
    }
  }

  try {
    await actualizarUsuario(uidPaciente, actualizacion);
    await cargarDatosPaciente();
  } catch (error) {
    console.error("No se pudo guardar el dato del paciente.", {
      campo,
      codigo: error?.code || null
    });
    alert("No fue posible guardar el dato. Verifica tu conexión y permisos, e inténtalo de nuevo.");
    throw error;
  }
}

function crearControlEditorCampoPaciente(campo, tipo, valorActual, opciones = []) {
  if (opciones.length) {
    return `
      <select class="editor-campo-paciente-control" data-editor-campo-valor>
        ${opciones.map((opcion) => `<option value="${escaparHTML(opcion)}" ${opcion === valorActual ? "selected" : ""}>${escaparHTML(opcion)}</option>`).join("")}
      </select>
      <input class="editor-campo-paciente-manual" data-editor-campo-manual placeholder="Escribir otra opcion" value="">
    `;
  }
  if (tipo === "textarea") {
    return `<textarea class="editor-campo-paciente-control" data-editor-campo-valor>${escaparHTML(valorActual)}</textarea>`;
  }
  return `<input class="editor-campo-paciente-control" data-editor-campo-valor type="${tipo === "number" ? "number" : tipo === "date" ? "date" : "text"}" value="${escaparHTML(valorActual)}">`;
}

window.editarCampoPaciente = async function(campo, etiqueta, tipo = "text") {
  if (campo === "edad") {
    alert("La edad se calcula automaticamente a partir de la fecha de nacimiento. Edita la fecha de nacimiento para actualizarla.");
    return;
  }

  if (campo === "fechaIngreso") {
    window.abrirSelectorIngresoPaciente();
    return;
  }

  if (campo === "fechaNacimiento") {
    window.abrirSelectorFechaNacimientoPaciente();
    return;
  }

  if (campo === "ultimoIngreso") {
    window.abrirSelectorUltimoIngresoPaciente();
    return;
  }

  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const valorActual = campo === "fechaNacimiento"
    ? obtenerFechaNacimiento(datos)
    : campo === "fechaIngreso"
      ? obtenerFechaIngreso(datos)
      : datos?.[campo] || datos?.datosInstitucionales?.[campo] || "";
  const etiquetaCampo = etiqueta || campo;
  const opciones = opcionesCampoPaciente(campo);
  const disparador = document.activeElement?.classList?.contains("boton-editar-dato")
    ? document.activeElement
    : null;
  const fila = disparador?.closest("p, .registro-card, .lab-card, article") || disparador?.parentElement;

  document.querySelectorAll(".editor-campo-paciente-inline").forEach((editor) => editor.remove());
  const editor = document.createElement("div");
  editor.className = "editor-campo-paciente-inline";
  editor.innerHTML = `
    <strong>${escaparHTML(etiquetaCampo)}</strong>
    ${crearControlEditorCampoPaciente(campo, tipo, valorActual, opciones)}
    <div class="editor-campo-paciente-actions">
      <button type="button" data-guardar-editor-paciente>Guardar</button>
      <button type="button" class="boton-secundario" data-cancelar-editor-paciente>Cancelar</button>
    </div>
  `;

  const destino = fila || document.querySelector("#seccionResumen .tarjeta") || document.body;
  destino.insertAdjacentElement("afterend", editor);

  editor.querySelector("[data-cancelar-editor-paciente]")?.addEventListener("click", () => editor.remove());
  editor.querySelector("[data-guardar-editor-paciente]")?.addEventListener("click", async () => {
    const manual = editor.querySelector("[data-editor-campo-manual]")?.value?.trim();
    const control = editor.querySelector("[data-editor-campo-valor]");
    const nuevoValor = manual || control?.value || "";
    const botonGuardar = editor.querySelector("[data-guardar-editor-paciente]");
    botonGuardar.disabled = true;
    try {
      await guardarCampoPacienteInline(campo, nuevoValor, datos);
      editor.remove();
    } catch {
      botonGuardar.disabled = false;
    }
  });
  editor.querySelector("[data-editor-campo-valor]")?.focus();
};

async function guardarEquipoClinicoPaciente(equipoClinico = []) {
  await actualizarUsuario(uidPaciente, { equipoClinico });
  await cargarDatosPaciente();
}

function opcionesCargoClinicoHtml(valorActual = "") {
  const normalizado = String(valorActual || "").trim();
  const opciones = [...new Set([...OPCIONES_CARGO_CLINICO, normalizado].filter(Boolean))];
  return opciones
    .map((opcion) => `<option value="${escaparHTML(opcion)}" ${opcion === normalizado ? "selected" : ""}>${escaparHTML(opcion)}</option>`)
    .join("");
}

function cerrarEditoresEquipoClinico() {
  document.querySelectorAll(".editor-equipo-clinico-inline").forEach((editor) => editor.remove());
}

async function abrirEditorEquipoClinicoInline(index = null, item = {}) {
  const lista = document.querySelector(".lab-equipo-lista");
  const destino = index === null
    ? document.getElementById("equipoClinicoPlaceholder") || lista
    : document.querySelector(`[data-equipo-index="${index}"]`);

  if (!destino) return;

  cerrarEditoresEquipoClinico();
  const editor = document.createElement("div");
  editor.className = "editor-equipo-clinico-inline";
  editor.innerHTML = `
    <label>Cargo o especialidad
      <select data-equipo-cargo>${opcionesCargoClinicoHtml(item.cargo || "")}</select>
    </label>
    <label>Nombre
      <input data-equipo-nombre value="${escaparHTML(item.nombre || "")}" placeholder="Ej. Dr. Aldo Sandokan Aguilar Valenzuela">
    </label>
    <label>Escribir cargo manual
      <input data-equipo-cargo-manual placeholder="Ej. Paidopsiquiatra">
    </label>
    <div class="editor-equipo-clinico-actions">
      <button type="button" data-equipo-guardar>Guardar</button>
      <button type="button" class="boton-secundario" data-equipo-cancelar>Cancelar</button>
    </div>
  `;

  destino.insertAdjacentElement(index === null ? "afterend" : "afterend", editor);
  editor.querySelector("[data-equipo-cancelar]")?.addEventListener("click", cerrarEditoresEquipoClinico);
  editor.querySelector("[data-equipo-guardar]")?.addEventListener("click", async () => {
    const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
    const equipo = obtenerEquipoClinicoPaciente(datos);
    const cargoManual = editor.querySelector("[data-equipo-cargo-manual]")?.value?.trim();
    const cargo = cargoManual || editor.querySelector("[data-equipo-cargo]")?.value?.trim() || "Personal clnico";
    const nombre = editor.querySelector("[data-equipo-nombre]")?.value?.trim() || "";

    if (!nombre) {
      alert("Escribe el nombre del integrante del equipo clnico.");
      return;
    }

    const payload = { cargo, nombre, actualizadoEn: new Date().toISOString() };
    if (index === null) equipo.push(payload);
    else equipo[index] = payload;

    cerrarEditoresEquipoClinico();
    await guardarEquipoClinicoPaciente(equipo);
  });
  editor.querySelector("[data-equipo-nombre]")?.focus();
}

window.agregarEquipoClinicoPaciente = function() {
  abrirEditorEquipoClinicoInline(null);
};

window.editarEquipoClinicoPaciente = async function(index) {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const equipo = obtenerEquipoClinicoPaciente(datos);
  if (!equipo[index]) return;
  abrirEditorEquipoClinicoInline(index, equipo[index]);
};

window.eliminarEquipoClinicoPaciente = async function(index) {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const equipo = obtenerEquipoClinicoPaciente(datos);
  if (!equipo[index]) return;
  if (!confirm("Quitar este integrante del equipo clnico?")) return;
  equipo.splice(index, 1);
  await guardarEquipoClinicoPaciente(equipo);
};

function obtenerHistorialSignoVital(datos = {}, clave = "") {
  const historial = datos.historialSignosVitales?.[clave];
  return Array.isArray(historial) ? historial : [];
}

function fechaLocalISO(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function horaLocalSignoVital(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function esFechaDeHoySignoVital(fecha) {
  return fechaLocalISO(fecha) === fechaLocalISO(new Date());
}

function obtenerUltimoRegistroSignoVital(datos = {}, clave = "", filtro = null) {
  return obtenerHistorialSignoVital(datos, clave)
    .map((registro) => ({ ...registro, fechaObjeto: fechaRegistroSigno(registro) }))
    .filter((registro) => registro.fechaObjeto && (!filtro || filtro(registro)))
    .sort((a, b) => b.fechaObjeto - a.fechaObjeto)[0] || null;
}

function obtenerRegistroVisibleSignoVital(datos = {}, clave = "") {
  const registroHoy = obtenerUltimoRegistroSignoVital(datos, clave, (registro) => esFechaDeHoySignoVital(registro.fechaObjeto));
  if (registroHoy) {
    return {
      valor: registroHoy.valor || "",
      fecha: registroHoy.fechaObjeto,
      esHoy: true,
      texto: `Hoy ${horaLocalSignoVital(registroHoy.fechaObjeto)}`
    };
  }

  const ultimo = obtenerUltimoRegistroSignoVital(datos, clave);
  if (ultimo) {
    return {
      valor: ultimo.valor || "",
      fecha: ultimo.fechaObjeto,
      esHoy: false,
      texto: `ltimo registro ${fechaHoraLocalParaInput(ultimo.fechaObjeto)}`
    };
  }

  return null;
}

function fechaHoraLocalParaInput(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function partesFechaHoraLocal(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return { fecha: "", hora: "" };
  const pad = (valor) => String(valor).padStart(2, "0");
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function isoDesdeFechaHoraSignoVital(valor = "") {
  const texto = String(valor || "").trim();
  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  const fecha = match
    ? new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0)
    )
    : texto
      ? new Date(texto)
      : new Date();
  return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString();
}

function fechaRegistroSigno(registro = {}) {
  const fecha = new Date(registro.fecha || registro.fechaToma || registro.creadoEn || "");
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function parsearPresionArterial(valor = "") {
  const partes = String(valor || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!partes) return { sistolica: null, diastolica: null };
  return {
    sistolica: Number(partes[1]),
    diastolica: Number(partes[2])
  };
}

function valorNumericoParaGrafica(valor = "", clave = "") {
  if (clave === "presionArterial") return parsearPresionArterial(valor).sistolica;
  return numeroDesdeTexto(valor);
}

function puntosSerieSigno(clave, registros = [], opciones = {}) {
  const componente = opciones.componente || "";
  return registros
    .map((registro, index) => {
      const fecha = fechaRegistroSigno(registro);
      let valor = valorNumericoParaGrafica(registro.valor, clave);
      if (clave === "presionArterial" && componente) {
        valor = parsearPresionArterial(registro.valor)[componente];
      }
      return { index, fecha, valor, texto: registro.valor || "", nota: registro.nota || "" };
    })
    .filter((punto) => punto.fecha && Number.isFinite(punto.valor) && punto.valor > 0)
    .sort((a, b) => a.fecha - b.fecha);
}

function construirGraficaSeriesSignos(series = [], opciones = {}) {
  const visibles = series.filter((serie) => serie.puntos.length);
  const puntos = visibles.flatMap((serie) => serie.puntos);
  if (!puntos.length || visibles.every((serie) => serie.puntos.length < 2)) {
    return `<div class="historial-signo-vacio">Se necesitan al menos dos registros numricos para dibujar la curva.</div>`;
  }

  const ancho = opciones.ancho || 840;
  const alto = opciones.alto || 300;
  const margen = 42;
  const minFecha = Math.min(...puntos.map((p) => p.fecha.getTime()));
  const maxFecha = Math.max(...puntos.map((p) => p.fecha.getTime()));
  const min = Math.min(...puntos.map((p) => p.valor));
  const max = Math.max(...puntos.map((p) => p.valor));
  const rangoValor = Math.max(max - min, 1);
  const rangoTiempo = Math.max(maxFecha - minFecha, 1);
  const xPunto = (punto, serie) => {
    if (rangoTiempo > 1) return margen + ((punto.fecha.getTime() - minFecha) / rangoTiempo) * (ancho - margen * 2);
    const divisor = Math.max(serie.puntos.length - 1, 1);
    return margen + (punto.index / divisor) * (ancho - margen * 2);
  };
  const yPunto = (punto) => alto - margen - ((punto.valor - min) / rangoValor) * (alto - margen * 2);
  const paleta = ["#347a4d", "#f97316", "#a78bfa", "#10b981", "#f43f5e", "#eab308", "#529866"];

  return `
    <svg viewBox="0 0 ${ancho} ${alto}" class="historial-signo-svg" role="img" aria-label="Curva histrica de signos vitales">
      <line x1="${margen}" y1="${alto - margen}" x2="${ancho - margen}" y2="${alto - margen}" />
      <line x1="${margen}" y1="${margen}" x2="${margen}" y2="${alto - margen}" />
      <text x="${margen}" y="22">${max}</text>
      <text x="${margen}" y="${alto - 8}">${min}</text>
      ${visibles.map((serie, serieIndex) => {
        const color = serie.color || paleta[serieIndex % paleta.length];
        const coords = serie.puntos.map((punto) => `${xPunto(punto, serie).toFixed(1)},${yPunto(punto).toFixed(1)}`).join(" ");
        return `
          <polyline points="${coords}" style="stroke:${color}" />
          ${serie.puntos.map((punto) => `
            <circle cx="${xPunto(punto, serie).toFixed(1)}" cy="${yPunto(punto).toFixed(1)}" r="4" style="stroke:${color}">
              <title>${escaparHTML(serie.nombre)}: ${escaparHTML(String(punto.texto || punto.valor))}  ${escaparHTML(formatearFecha(punto.fecha.toISOString()))}</title>
            </circle>
          `).join("")}
        `;
      }).join("")}
    </svg>
    <div class="historial-signo-leyenda">
      ${visibles.map((serie, index) => `<span><i style="background:${serie.color || paleta[index % paleta.length]}"></i>${escaparHTML(serie.nombre)}</span>`).join("")}
    </div>
  `;
}

function construirGraficaSignoVital(clave, registros = []) {
  if (clave === "presionArterial") {
    return construirGraficaSeriesSignos([
      { id: "ta_sistolica", nombre: "TA sistlica", puntos: puntosSerieSigno(clave, registros, { componente: "sistolica" }), color: "#347a4d" },
      { id: "ta_diastolica", nombre: "TA diastlica", puntos: puntosSerieSigno(clave, registros, { componente: "diastolica" }), color: "#f97316" }
    ]);
  }

  const signo = SIGNOS_VITALES_LAB[clave] || {};
  return construirGraficaSeriesSignos([
    { id: clave, nombre: signo.titulo || clave, puntos: puntosSerieSigno(clave, registros), color: "#347a4d" }
  ]);
}

function posicionarPopoverSignoVital(popover, ancla) {
  const rect = ancla?.getBoundingClientRect?.();
  if (!rect) {
    popover.style.top = "120px";
    popover.style.left = "50%";
    popover.style.transform = "translateX(-50%)";
    return;
  }

  const margen = 14;
  const ancho = popover.offsetWidth || 320;
  const alto = popover.offsetHeight || 260;
  let left = rect.right + margen;
  let top = rect.top - 12;

  if (left + ancho > window.innerWidth - margen) {
    left = Math.max(margen, rect.left - ancho - margen);
  }
  if (left < margen) {
    left = Math.min(window.innerWidth - ancho - margen, rect.left);
    top = rect.bottom + margen;
  }
  if (top + alto > window.innerHeight - margen) top = window.innerHeight - alto - margen;
  if (top < margen) top = margen;

  popover.style.left = `${Math.max(margen, left)}px`;
  popover.style.top = `${Math.max(margen, top)}px`;
}

function abrirPopoverSignoVitalPaciente({ clave, signo, valorActual = "", previo = false, ancla = null } = {}) {
  document.getElementById("popoverSignoVitalPaciente")?.remove();

  return new Promise((resolve) => {
    const fechaHoraActual = partesFechaHoraLocal();
    const popover = document.createElement("div");
    popover.id = "popoverSignoVitalPaciente";
    popover.className = "popover-signo-vital";
    popover.innerHTML = `
      <form>
        <header>
          <div>
            <span>${previo ? "Valor previo" : "Signo vital"}</span>
            <strong>${escaparHTML(signo?.titulo || clave || "Signo vital")}</strong>
          </div>
          <button type="button" data-cancelar-signo aria-label="Cerrar"></button>
        </header>
        <label>
          Valor ${signo?.unidad ? `<small>${escaparHTML(signo.unidad)}</small>` : ""}
          <input data-signo-valor value="${escaparHTML(valorActual || "")}" placeholder="${clave === "presionArterial" ? "Ej. 120/80" : "Ej. 80"}">
        </label>
        <div class="popover-signo-fecha-hora ${previo ? "" : "solo-hora"}">
          ${previo ? `
          <label>
            Fecha
            <input data-signo-fecha type="date" value="${escaparHTML(fechaHoraActual.fecha)}">
          </label>
          ` : ""}
          <label>
            Hora de toma
            <input data-signo-hora type="time" lang="en-GB" step="60" value="${escaparHTML(fechaHoraActual.hora)}">
          </label>
        </div>
        <label>
          Nota clinica
          <textarea data-signo-nota placeholder="Opcional"></textarea>
        </label>
        <div class="popover-signo-actions">
          <button type="button" data-cancelar-signo>Cancelar</button>
          <button type="submit">Guardar</button>
        </div>
      </form>
    `;

    const cerrar = (resultado = null) => {
      popover.remove();
      document.removeEventListener("keydown", manejarEscape);
      resolve(resultado);
    };
    const manejarEscape = (evento) => {
      if (evento.key === "Escape") cerrar(null);
    };

    popover.querySelectorAll("[data-cancelar-signo]").forEach((boton) => {
      boton.addEventListener("click", () => cerrar(null));
    });
    popover.querySelector("form")?.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const valor = popover.querySelector("[data-signo-valor]")?.value?.trim() || "";
      if (!valor) {
        popover.querySelector("[data-signo-valor]")?.focus();
        return;
      }
      cerrar({
        valor,
        nota: popover.querySelector("[data-signo-nota]")?.value?.trim() || "",
        fechaToma: `${(previo ? popover.querySelector("[data-signo-fecha]")?.value : fechaHoraActual.fecha) || fechaHoraActual.fecha}T${popover.querySelector("[data-signo-hora]")?.value || fechaHoraActual.hora || "00:00"}`
      });
    });

    document.body.appendChild(popover);
    posicionarPopoverSignoVital(popover, ancla);
    document.addEventListener("keydown", manejarEscape);
    popover.querySelector("[data-signo-valor]")?.focus();
    popover.querySelector("[data-signo-valor]")?.select();
  });
}

window.registrarSignoVitalPaciente = async function(clave, opciones = {}, ancla = null) {
  const signo = SIGNOS_VITALES_LAB[clave];
  if (!signo) return;
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const registroVisible = obtenerRegistroVisibleSignoVital(datos, clave);
  const valorActual = registroVisible?.valor || valorPaciente(datos, signo.rutas, "");
  const captura = await abrirPopoverSignoVitalPaciente({
    clave,
    signo,
    valorActual,
    previo: opciones.previo === true,
    ancla
  });
  if (!captura) return;
  const fechaRegistro = isoDesdeFechaHoraSignoVital(captura.fechaToma);
  const historial = {
    ...(datos?.historialSignosVitales || {}),
    [clave]: [
      ...obtenerHistorialSignoVital(datos, clave),
      construirRegistroHistorialSignoVital({
        valor: captura.valor,
        nota: captura.nota,
        fechaRegistro,
        esPrevio: opciones.previo === true,
        uidRegistro: auth.currentUser?.uid || ""
      })
    ]
  };
  const actualizacion = {
    historialSignosVitales: historial
  };

  if (!opciones.previo) {
    actualizacion[clave] = captura.valor;
    actualizacion.datosInstitucionales = {
      ...(datos?.datosInstitucionales || {}),
      [clave]: captura.valor
    };
    actualizacion.signosVitales = {
      ...(datos?.signosVitales || {}),
      [clave]: captura.valor
    };
    actualizacion.signosVitalesMeta = {
      ...(datos?.signosVitalesMeta || {}),
      [clave]: {
        fecha: fechaRegistro,
        hora: horaLocalSignoVital(fechaRegistro),
        uidRegistro: auth.currentUser?.uid || ""
      }
    };
    if (clave === "imc") {
      actualizacion.somatometria = {
        ...(datos?.somatometria || {}),
        imc: captura.valor
      };
    }
  }
  await actualizarUsuario(uidPaciente, actualizacion);
  await cargarDatosPaciente();
};

window.abrirHistorialSignoVitalPaciente = function(clave) {
  const signo = SIGNOS_VITALES_LAB[clave];
  if (!signo) return;
  const datos = datosPacienteActual || {};
  const registros = obtenerHistorialSignoVital(datos, clave);
  const modalPrevio = document.getElementById("modalHistorialSignoVital");
  modalPrevio?.remove();

  const modal = document.createElement("div");
  modal.id = "modalHistorialSignoVital";
  modal.className = "historial-signo-overlay";
  modal.innerHTML = `
    <section class="historial-signo-card" aria-label="Historial de ${escaparHTML(signo.titulo)}">
      <header>
        <div>
          <span>Signos vitales</span>
          <h3>${escaparHTML(signo.titulo)}</h3>
        </div>
        <div class="historial-signo-actions">
          <button type="button" data-ampliar-historial>Ampliar</button>
          <button type="button" data-cerrar-historial></button>
        </div>
      </header>
      <div class="historial-signo-grafica">
        ${construirGraficaSignoVital(clave, registros)}
      </div>
      <div class="historial-signo-lista">
        ${registros.length ? registros.slice().reverse().map((registro) => `
          <article>
            <b>${escaparHTML(registro.valor || "Sin valor")}</b>
            <span>${escaparHTML(formatearFecha(registro.fecha) || registro.fecha || "Sin fecha")}</span>
            ${registro.nota ? `<p>${escaparHTML(registro.nota)}</p>` : ""}
          </article>
        `).join("") : `<p class="lab-muted">An no hay registros histricos para este signo vital.</p>`}
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-cerrar-historial]")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (evento) => {
    if (evento.target === modal) modal.remove();
  });
  modal.querySelector("[data-ampliar-historial]")?.addEventListener("click", () => {
    modal.querySelector(".historial-signo-card")?.classList.toggle("amplia");
  });
};

function rangoFechasSignosVitales(datos = {}) {
  const fechas = Object.keys(SIGNOS_VITALES_LAB)
    .flatMap((clave) => obtenerHistorialSignoVital(datos, clave))
    .map(fechaRegistroSigno)
    .filter(Boolean)
    .sort((a, b) => a - b);
  return {
    inicio: fechas[0] ? fechas[0].toISOString().slice(0, 10) : "",
    fin: fechas[fechas.length - 1] ? fechas[fechas.length - 1].toISOString().slice(0, 10) : ""
  };
}

function seriesGlobalesSignosVitales(datos = {}, opciones = {}) {
  const inicio = opciones.inicio ? new Date(`${opciones.inicio}T00:00:00`) : null;
  const fin = opciones.fin ? new Date(`${opciones.fin}T23:59:59`) : null;
  const incluir = new Set(opciones.incluir || []);
  const tieneFiltroSeries = Array.isArray(opciones.incluir);
  const filtrar = (puntos) => puntos.filter((punto) =>
    (!inicio || punto.fecha >= inicio) &&
    (!fin || punto.fecha <= fin)
  );
  const series = [];

  Object.entries(SIGNOS_VITALES_LAB).forEach(([clave, signo]) => {
    const registros = obtenerHistorialSignoVital(datos, clave);
    if (clave === "presionArterial") {
      [
        ["ta_sistolica", "TA sistlica", "sistolica", "#347a4d"],
        ["ta_diastolica", "TA diastlica", "diastolica", "#f97316"]
      ].forEach(([id, nombre, componente, color]) => {
        if (tieneFiltroSeries && !incluir.has(id)) return;
        series.push({ id, nombre, color, puntos: filtrar(puntosSerieSigno(clave, registros, { componente })) });
      });
      return;
    }

    if (tieneFiltroSeries && !incluir.has(clave)) return;
    series.push({
      id: clave,
      nombre: signo.titulo,
      puntos: filtrar(puntosSerieSigno(clave, registros))
    });
  });

  return series;
}

function renderizarGraficaGlobalSignosVitales(modal, datos = {}) {
  const contenedor = modal.querySelector("[data-grafica-global-signos]");
  if (!contenedor) return;
  const incluir = [...modal.querySelectorAll("[data-serie-signo]:checked")].map((check) => check.value);
  const inicio = modal.querySelector("[data-signos-desde]")?.value || "";
  const fin = modal.querySelector("[data-signos-hasta]")?.value || "";
  const series = seriesGlobalesSignosVitales(datos, { incluir, inicio, fin });
  contenedor.innerHTML = construirGraficaSeriesSignos(series, { ancho: 980, alto: 340 });
}

window.abrirGraficaGlobalSignosVitalesPaciente = function() {
  const datos = datosPacienteActual || {};
  const modalPrevio = document.getElementById("modalGraficaGlobalSignos");
  modalPrevio?.remove();
  const rango = rangoFechasSignosVitales(datos);
  const opcionesSeries = [
    ["ta_sistolica", "TA sistlica"],
    ["ta_diastolica", "TA diastlica"],
    ...Object.entries(SIGNOS_VITALES_LAB)
      .filter(([clave]) => clave !== "presionArterial")
      .map(([clave, signo]) => [clave, signo.titulo])
  ];

  const modal = document.createElement("div");
  modal.id = "modalGraficaGlobalSignos";
  modal.className = "historial-signo-overlay";
  modal.innerHTML = `
    <section class="historial-signo-card amplia" aria-label="Grfica global de signos vitales">
      <header>
        <div>
          <span>Signos vitales</span>
          <h3>Grfica global</h3>
        </div>
        <div class="historial-signo-actions">
          <button type="button" data-cerrar-global-signos>,</button>
        </div>
      </header>
      <div class="signos-global-controles">
        <label>Desde<input type="date" data-signos-desde value="${escaparHTML(rango.inicio)}"></label>
        <label>Hasta<input type="date" data-signos-hasta value="${escaparHTML(rango.fin)}"></label>
        <div class="signos-global-series">
          ${opcionesSeries.map(([id, nombre]) => `
            <label><input type="checkbox" data-serie-signo value="${escaparHTML(id)}" checked> ${escaparHTML(nombre)}</label>
          `).join("")}
        </div>
      </div>
      <div class="historial-signo-grafica" data-grafica-global-signos></div>
    </section>
  `;
  document.body.appendChild(modal);
  renderizarGraficaGlobalSignosVitales(modal, datos);
  modal.querySelector("[data-cerrar-global-signos]")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (evento) => {
    if (evento.target === modal) modal.remove();
  });
  modal.querySelectorAll("[data-serie-signo], [data-signos-desde], [data-signos-hasta]").forEach((control) => {
    control.addEventListener("change", () => renderizarGraficaGlobalSignosVitales(modal, datos));
  });
};

async function abrirSelectorFechaPaciente(campo = "fechaIngreso") {
  const modal = document.getElementById("modalIngresoPaciente");
  const inputFecha = document.getElementById("ingresoPacienteFecha");
  const inputHora = document.getElementById("ingresoPacienteHora");
  const titulo = document.getElementById("tituloIngresoPaciente");
  const subtitulo = modal?.querySelector(".panel-ingreso-header p");
  const grupoHora = document.getElementById("grupoHoraIngresoPaciente");
  const ayuda = document.getElementById("ayudaIngresoPaciente");
  if (!modal || !inputFecha || !inputHora) return;

  campoFechaIngresoModal = campo;
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const valor = campo === "fechaNacimiento"
    ? obtenerFechaNacimiento(datos)
    : campo === "ultimoIngreso"
      ? obtenerUltimoIngreso(datos)
      : obtenerFechaIngreso(datos);
  const partes = partesFechaIngreso(valor);
  const esNacimiento = campo === "fechaNacimiento";

  inputFecha.value = partes.fecha;
  poblarSelectorHora24h(inputHora, esNacimiento ? "" : partes.hora);
  if (titulo) {
    titulo.textContent = esNacimiento
      ? "Seleccionar fecha de nacimiento"
      : campo === "ultimoIngreso"
        ? "Seleccionar ltimo ingreso"
        : "Seleccionar ingreso";
  }
  if (subtitulo) {
    subtitulo.textContent = esNacimiento
      ? "Fecha de nacimiento"
      : campo === "ultimoIngreso"
        ? "ltimo ingreso"
        : "Fecha de ingreso";
  }
  grupoHora?.classList.toggle("oculto", esNacimiento);
  if (ayuda) {
    ayuda.textContent = esNacimiento
      ? "Selecciona la fecha en formato DD-MM-AAAA."
      : "Si no seleccionas hora, se tomará el inicio del día.";
  }
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

window.abrirSelectorIngresoPaciente = function() {
  abrirSelectorFechaPaciente("fechaIngreso");
};

window.abrirSelectorUltimoIngresoPaciente = function() {
  abrirSelectorFechaPaciente("ultimoIngreso");
};

window.abrirSelectorFechaNacimientoPaciente = function() {
  abrirSelectorFechaPaciente("fechaNacimiento");
};

function cerrarSelectorIngresoPaciente() {
  const modal = document.getElementById("modalIngresoPaciente");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

async function guardarIngresoPacienteDesdeModal() {
  const fecha = document.getElementById("ingresoPacienteFecha")?.value || "";
  const hora = document.getElementById("ingresoPacienteHora")?.value || "00:00";

  if (!fecha) {
    alert(campoFechaIngresoModal === "fechaNacimiento" ? "Selecciona la fecha de nacimiento." : "Selecciona el día de ingreso.");
    return;
  }

  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const campo = campoFechaIngresoModal === "fechaNacimiento"
    ? "fechaNacimiento"
    : campoFechaIngresoModal === "ultimoIngreso"
      ? "ultimoIngreso"
      : "fechaIngreso";
  const fechaIngreso = campo === "fechaNacimiento" ? fecha : `${fecha}T${hora || "00:00"}`;
  const datosInstitucionales = {
    ...(datos?.datosInstitucionales || {}),
    [campo]: fechaIngreso
  };
  if (campo === "fechaNacimiento") delete datosInstitucionales.edad;

  const actualizacion = {
    [campo]: fechaIngreso,
    datosInstitucionales
  };
  if (campo === "fechaNacimiento") actualizacion.edad = deleteField();

  await actualizarUsuario(uidPaciente, actualizacion);

  datosPacienteActual = {
    ...(datosPacienteActual || datos || {}),
    [campo]: fechaIngreso,
    datosInstitucionales
  };
  if (campo !== "fechaNacimiento") actualizarEstanciaPaciente(datosPacienteActual);
  cerrarSelectorIngresoPaciente();
  await cargarDatosPaciente();
}

async function limpiarIngresoPacienteDesdeModal() {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const campo = campoFechaIngresoModal === "fechaNacimiento"
    ? "fechaNacimiento"
    : campoFechaIngresoModal === "ultimoIngreso"
      ? "ultimoIngreso"
      : "fechaIngreso";
  const datosInstitucionales = {
    ...(datos?.datosInstitucionales || {}),
    [campo]: ""
  };
  if (campo === "fechaNacimiento") delete datosInstitucionales.edad;

  const actualizacion = {
    [campo]: "",
    datosInstitucionales
  };
  if (campo === "fechaNacimiento") actualizacion.edad = deleteField();

  await actualizarUsuario(uidPaciente, actualizacion);

  datosPacienteActual = {
    ...(datosPacienteActual || datos || {}),
    [campo]: "",
    datosInstitucionales
  };
  if (campo !== "fechaNacimiento") actualizarEstanciaPaciente(datosPacienteActual);
  cerrarSelectorIngresoPaciente();
  await cargarDatosPaciente();
}

window.marcarDiagnosticoPrincipal = async function(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) {
    alert("No se encontro el diagnostico seleccionado.");
    return;
  }

  const nuevoHistorial = historial.filter((_, i) => i !== index);
  nuevoHistorial.unshift(diagnostico);
  await guardarHistorialDiagnosticos(nuevoHistorial);

  await registrarAccionExpediente({
    accion: "cambiar_diagnostico_principal",
    descripcion: "El medico cambio el diagnostico principal del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico)
    }
  });

  await cargarDatosPaciente();
};

async function guardarHistorialDiagnosticos(historial, opciones = {}) {
  const permitirEliminar = opciones.permitirEliminar === true;
  if (modoNuevoPacienteDraft()) {
    const draft = asegurarEstructuraDraftClinico();
    const historialActual = draft?.diagnosticos || [];
    let limpio = normalizarHistorialDiagnosticos(historial)
      .map(limpiarDiagnosticoParaFirestore);

    if (!permitirEliminar && historialActual.length > limpio.length) {
      const clavesNuevas = new Set(limpio.map(claveDiagnostico).filter(Boolean));
      const preservados = historialActual.filter((dx) => {
        const clave = claveDiagnostico(dx);
        return clave && !clavesNuevas.has(clave);
      });
      limpio = normalizarHistorialDiagnosticos([...limpio, ...preservados])
        .map(limpiarDiagnosticoParaFirestore);
    }

    const diagnosticoPrincipal = limpio.find(diagnosticoEstaActivo) || "";
    draft.diagnosticos = limpio;
    draft.datosClinicosResumen = {
      ...(draft.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal || null,
      historialDiagnosticos: limpio,
      fechaActualizacionDiagnosticos: new Date().toISOString()
    };
    sincronizarDatosPacienteDesdeDraft();
    return;
  }

  const remoto = await obtenerUsuario(uidPaciente).catch(() => null);
  const baseActual = remoto || datosPacienteActual || {};
  const historialActual = obtenerHistorialDiagnosticos(baseActual);

  let limpio = normalizarHistorialDiagnosticos(historial)
    .map(limpiarDiagnosticoParaFirestore);

  if (!permitirEliminar && historialActual.length > limpio.length) {
    const clavesNuevas = new Set(limpio.map(claveDiagnostico).filter(Boolean));
    const preservados = historialActual.filter((dx) => {
      const clave = claveDiagnostico(dx);
      return clave && !clavesNuevas.has(clave);
    });
    limpio = normalizarHistorialDiagnosticos([...limpio, ...preservados])
      .map(limpiarDiagnosticoParaFirestore);
  }

  const diagnosticoPrincipal = limpio.find(diagnosticoEstaActivo) || "";

  const actualizacionDiagnosticos = construirActualizacionHistorialDiagnosticos(baseActual, limpio);
  await actualizarUsuario(uidPaciente, {
    ...actualizacionDiagnosticos,
    diagnostico: diagnosticoPrincipal || deleteField()
  });

  datosPacienteActual = {
    ...(baseActual || {}),
    diagnostico: diagnosticoPrincipal,
    historialDiagnosticos: limpio,
    datosClinicosResumen: {
      ...(baseActual?.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal || null,
      historialDiagnosticos: limpio,
      fechaActualizacionDiagnosticos: new Date().toISOString()
    }
  };
}

async function agregarDiagnosticoPaciente(index, botonOrigen = null) {
  if (diagnosticoGuardadoEnCurso) return;

  const diagnostico = diagnosticosCatalogoActual[index];
  if (!diagnostico) return;
  const patientId = String(uidPaciente || "").trim();
  const userId = auth.currentUser?.uid || "";

  if (!patientId) {
    alert("No se pudo identificar al paciente seleccionado.");
    return;
  }
  if (!userId) {
    alert("Tu sesión expiró. Inicia sesión nuevamente para guardar el diagnóstico.");
    return;
  }

  diagnosticoGuardadoEnCurso = true;
  if (botonOrigen) {
    botonOrigen.disabled = true;
    botonOrigen.setAttribute("aria-busy", "true");
  }
  console.debug("[Diagnósticos] Flujo de guardado", {
    patientId,
    userId,
    origen: diagnostico.manual ? "manual" : "catalogo",
    catalogo: diagnostico.catalogo || null,
    codigo: diagnostico.codigo || null,
    nombrePresente: Boolean(diagnostico.nombre || diagnostico.texto)
  });

  try {
    const historial = obtenerHistorialDiagnosticos();

    if (diagnosticoReemplazoIndex !== null) {
      const anterior = historial[diagnosticoReemplazoIndex];
      if (!anterior) {
        diagnosticoReemplazoIndex = null;
        return;
      }

      historial[diagnosticoReemplazoIndex] = {
        ...normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", diagnosticoReemplazoIndex),
        estado: anterior.estado,
        estadoClinico: anterior.estadoClinico || "",
        orden: anterior.orden
      };

      await guardarHistorialDiagnosticos(historial);

      await registrarAccionDiagnosticoSegura({
        accion: "cambiar_diagnostico",
        descripcion: "El medico cambio un diagnostico usando el catalogo diagnostico.",
        detalles: { catalogo: diagnostico.catalogo, codigo: diagnostico.codigo || null }
      });

      diagnosticoReemplazoIndex = null;
      ponerValor("diagnosticoBusqueda", "");
      await cargarDatosPaciente();
      renderizarResultadosBusquedaDiagnosticos();
      alert("Diagnóstico actualizado correctamente.");
      return;
    }

    const existe = historial.some((dx) => claveDiagnostico(dx) === claveDiagnostico(diagnostico));

    if (existe) {
      alert("Ese diagnóstico ya está registrado.");
      return;
    }

    const nuevoHistorial = [...historial, normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", historial.length)];
    await guardarHistorialDiagnosticos(nuevoHistorial);

    await registrarAccionDiagnosticoSegura({
      accion: "agregar_diagnostico",
      descripcion: "El medico agrego un diagnostico al expediente.",
      detalles: { catalogo: diagnostico.catalogo, codigo: diagnostico.codigo || null }
    });

    ponerValor("diagnosticoBusqueda", "");
    await cargarDatosPaciente();
    renderizarResultadosBusquedaDiagnosticos();
    alert("Diagnóstico agregado correctamente.");
  } catch (error) {
    console.error("[Diagnósticos] Error al guardar:", error);
    alert("No fue posible guardar el diagnóstico. Intenta nuevamente.");
  } finally {
    diagnosticoGuardadoEnCurso = false;
    if (botonOrigen) {
      botonOrigen.disabled = false;
      botonOrigen.removeAttribute("aria-busy");
    }
  }
}

function prepararReemplazoDiagnostico(index) {
  diagnosticoReemplazoIndex = index;
  ponerValor("diagnosticoBusqueda", "");
  document.getElementById("diagnosticoBusqueda")?.focus();
  renderizarResultadosBusquedaDiagnosticos();
}

async function editarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) return;

  const catalogo = prompt("Catalogo:", diagnostico.catalogo || "CIE-10");
  if (catalogo === null) return;

  const codigo = prompt("Codigo diagnostico:", diagnostico.codigo || "");
  if (codigo === null) return;

  const nombre = prompt("Nombre diagnostico:", diagnostico.nombre || diagnostico.texto || "");
  if (nombre === null) return;

  const texto = prompt("Texto visible del diagnostico:", diagnostico.texto || diagnostico.nombre || "");
  if (texto === null) return;

  const actualizado = {
    ...diagnostico,
    catalogo: catalogo.trim() || diagnostico.catalogo || "Manual",
    codigo: codigo.trim(),
    nombre: nombre.trim() || texto.trim() || diagnostico.nombre,
    texto: texto.trim() || nombre.trim() || diagnostico.texto || diagnostico.nombre,
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString()
  };

  historial[index] = actualizado;

  await guardarHistorialDiagnosticos(historial);

  await registrarAccionExpediente({
    accion: "editar_diagnostico",
    descripcion: "El medico cambio el texto de un diagnostico del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(actualizado)
    }
  });

  await cargarDatosPaciente();
}

async function agregarDiagnosticoManualPaciente() {
  if (diagnosticoGuardadoEnCurso) return;

  const boton = document.getElementById("agregarDiagnosticoManual");
  const patientId = String(uidPaciente || "").trim();
  const userId = auth.currentUser?.uid || "";
  if (!patientId) {
    alert("No se pudo identificar al paciente seleccionado.");
    return;
  }
  if (!userId) {
    alert("Tu sesión expiró. Inicia sesión nuevamente para guardar el diagnóstico.");
    return;
  }

  const catalogo = valorCampo("diagnosticoManualCatalogo") || "Manual";
  const codigo = valorCampo("diagnosticoManualCodigo");
  const nombre = valorCampo("diagnosticoManualNombre");
  const texto = valorCampo("diagnosticoManualTexto") || nombre;
  const incluirEnCatalogo = document.getElementById("diagnosticoManualIncluirCatalogo")?.checked || false;

  if (!codigo && !texto) {
    alert("Escribe al menos un codigo o un texto diagnostico.");
    return;
  }

  const diagnostico = normalizarDiagnostico({
    catalogo,
    codigo,
    nombre: nombre || texto || codigo,
    texto: texto || nombre || codigo,
    manual: true
  }, catalogo);

  if (incluirEnCatalogo) {
    if (!["CIE-10", "CIE-11"].includes(catalogo)) {
      alert("Para incluirlo en catalogo, elige CIE-10 o CIE-11.");
      return;
    }

    if (!codigo || !(nombre || texto)) {
      alert("Para incluirlo en catalogo, escribe codigo y nombre diagnostico.");
      return;
    }

    const existe = catalogoDiagnosticosCombinado().some((dx) =>
      dx.codigo.toLowerCase() === codigo.toLowerCase() &&
      (dx.catalogo || "CIE-10") === catalogo
    );

    if (!existe) {
      catalogoManualDiagnosticos.push({
        codigo,
        nombre: nombre || texto,
        catalogo,
        texto: `${codigo} - ${nombre || texto}`,
        agregadoManual: true,
        fechaAgregado: new Date().toISOString()
      });
       try {
         guardarCatalogoManualDiagnosticos();
       } catch (error) {
         console.error("[Diagnósticos] No se pudo actualizar el catálogo local:", {
           codigo: error?.name || null
         });
       }
    }
  }

  diagnosticoGuardadoEnCurso = true;
  if (boton) {
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    boton.textContent = "Guardando…";
  }
  console.debug("[Diagnósticos] Flujo de guardado", {
    patientId,
    userId,
    origen: "manual",
    catalogo,
    codigo: codigo || null,
    nombrePresente: Boolean(nombre || texto)
  });

  try {
    const historial = obtenerHistorialDiagnosticos();
    const nuevoHistorial = [...historial, normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", historial.length)];
    await guardarHistorialDiagnosticos(nuevoHistorial);

    await registrarAccionDiagnosticoSegura({
      accion: "agregar_diagnostico_manual",
      descripcion: "El medico agrego un diagnostico manual al expediente.",
      detalles: { catalogo, codigo: codigo || null }
    });

    ["diagnosticoManualCodigo", "diagnosticoManualNombre", "diagnosticoManualTexto"].forEach((id) => ponerValor(id, ""));
    const incluirCatalogo = document.getElementById("diagnosticoManualIncluirCatalogo");
    if (incluirCatalogo) incluirCatalogo.checked = false;
    await cargarDatosPaciente();
    alert("Diagnóstico agregado correctamente.");
  } catch (error) {
    console.error("[Diagnósticos] Error al guardar:", error);
    alert("No fue posible guardar el diagnóstico. Intenta nuevamente.");
  } finally {
    diagnosticoGuardadoEnCurso = false;
    if (boton) {
      boton.disabled = false;
      boton.removeAttribute("aria-busy");
      boton.textContent = "Agregar diagnostico manual";
    }
  }
}

async function registrarAccionDiagnosticoSegura(datos) {
  try {
    await registrarAccionExpediente(datos);
  } catch (error) {
    console.error("[Diagnósticos] Error de auditoría posterior al guardado:", {
      codigo: error?.code || null
    });
  }
}

async function moverDiagnosticoPaciente(index, direccion) {
  const historial = obtenerHistorialDiagnosticos();
  const destino = index + direccion;

  if (!historial[index] || destino < 0 || destino >= historial.length) return;

  [historial[index], historial[destino]] = [historial[destino], historial[index]];
  await guardarHistorialDiagnosticos(historial.map((dx, orden) => ({ ...dx, orden })));
  await registrarAccionExpediente({
    accion: "reordenar_diagnosticos",
    descripcion: "El medico cambio el orden de los diagnosticos del expediente.",
    detalles: {
      diagnosticoPrincipal: formatearDiagnostico(historial[0])
    }
  });
  renderizarPanelDiagnosticos();
  renderizarDiagnosticos(datosPacienteActual);
}

async function cambiarEstadoDiagnosticoPaciente(index, estado) {
  const historial = obtenerHistorialDiagnosticos();
  if (!historial[index]) return;

  historial[index] = {
    ...historial[index],
    estado: historial[index].estado === ESTADO_DIAGNOSTICO_DESCARTADO
      ? ESTADO_DIAGNOSTICO_DESCARTADO
      : ESTADO_DIAGNOSTICO_ACTIVO,
    estadoClinico: estadoClinicoDiagnosticoValido(estado)
  };

  await guardarHistorialDiagnosticos(historial);
  await registrarAccionExpediente({
    accion: "cambiar_estado_diagnostico",
    descripcion: "El medico cambio el estado clinico de un diagnostico.",
    detalles: {
      diagnostico: formatearDiagnostico(historial[index]),
      estado: historial[index].estado
    }
  });
  renderizarPanelDiagnosticos();
  renderizarDiagnosticos(datosPacienteActual);
}

async function descartarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];
  if (!diagnostico || !diagnosticoEstaActivo(diagnostico)) return;

  const motivo = prompt("Motivo para descartar el diagnóstico (opcional):", "");
  if (motivo === null) return;

  const usuario = auth.currentUser;
  const perfil = usuario ? await obtenerUsuario(usuario.uid).catch(() => null) : null;
  historial[index] = {
    ...diagnostico,
    estado: ESTADO_DIAGNOSTICO_DESCARTADO,
    fechaDescartado: new Date().toISOString(),
    usuarioDescartado: usuario?.uid || "",
    usuarioDescartadoNombre: perfil?.nombre || usuario?.email || "",
    motivoDescartado: motivo.trim()
  };

  await guardarHistorialDiagnosticos(historial);
  await registrarAccionDiagnosticoSegura({
    accion: "descartar_diagnostico",
    descripcion: "El medico descarto un diagnostico sin eliminarlo del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      diagnosticoId: diagnostico.id,
      motivo: motivo.trim() || null
    }
  });
  await cargarDatosPaciente();
}

async function restaurarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];
  if (!diagnostico || diagnosticoEstaActivo(diagnostico)) return;

  const { fechaDescartado, usuarioDescartado, usuarioDescartadoNombre, motivoDescartado, ...resto } = diagnostico;
  historial[index] = {
    ...resto,
    estado: ESTADO_DIAGNOSTICO_ACTIVO
  };

  await guardarHistorialDiagnosticos(historial);
  await registrarAccionDiagnosticoSegura({
    accion: "restaurar_diagnostico",
    descripcion: "El medico restauro un diagnostico descartado.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      diagnosticoId: diagnostico.id
    }
  });
  await cargarDatosPaciente();
}

async function quitarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) return;
  if (!confirm("Este diagnóstico se eliminará permanentemente del expediente.\n\nSi únicamente ya no aplica para el paciente, se recomienda utilizar \'Descartar diagnóstico\'.\n\n¿Deseas eliminarlo definitivamente?")) return;

  const nuevoHistorial = historial.filter((_, i) => i !== index);

  await guardarHistorialDiagnosticos(nuevoHistorial, { permitirEliminar: true });

  await registrarAccionExpediente({
    accion: "eliminar_diagnostico",
    descripcion: "El medico elimino definitivamente un diagnostico del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico)
    }
  });

  await cargarDatosPaciente();
}

async function cargarCarpetasPaciente() {
  const selector = document.getElementById("selectorCarpetasPaciente");
  const lista = document.getElementById("listaCarpetasPaciente");
  if (!selector || !lista) return;

  const uidMedico = auth.currentUser?.uid;
  const carpetasAsignadas = Array.isArray(datosPacienteActual?.carpetas)
    ? datosPacienteActual.carpetas
    : [];

  selector.innerHTML = `<option value="">Seleccionar carpeta</option>`;

  if (uidMedico) {
    const snap = await getDocs(query(collection(db, "usuarios", uidMedico, "carpetasPacientes"), orderBy("nombre", "asc")));
    snap.forEach((docCarpeta) => {
      const carpeta = docCarpeta.data();
      selector.innerHTML += `<option value="${escaparHTML(carpeta.nombre || "")}">${escaparHTML(carpeta.nombre || "Sin nombre")}</option>`;
    });
  }

  lista.innerHTML = carpetasAsignadas.length
    ? carpetasAsignadas.map((nombre) => `
      <article class="registro-card">
        <div class="registro-top">
          <strong>${escaparHTML(nombre)}</strong>
          <button type="button" class="boton-peligro" data-quitar-carpeta="${escaparHTML(nombre)}">Quitar</button>
        </div>
      </article>
    `).join("")
    : "<p>Este paciente aun no esta en carpetas.</p>";

  lista.querySelectorAll("[data-quitar-carpeta]").forEach((boton) => {
    boton.addEventListener("click", () => quitarCarpetaPaciente(boton.dataset.quitarCarpeta));
  });
}

async function asignarCarpetaPorNombre(nombre) {
  const carpeta = String(nombre || "").trim();
  if (!carpeta) {
    alert("Escribe o selecciona una carpeta.");
    return;
  }

  const uidMedico = auth.currentUser?.uid;
  if (uidMedico) {
    await setDoc(doc(db, "usuarios", uidMedico, "carpetasPacientes", carpeta.toLowerCase().replace(/\s+/g, "-")), {
      nombre: carpeta,
      fechaActualizacion: new Date().toISOString()
    }, { merge: true });
  }

  const actuales = Array.isArray(datosPacienteActual?.carpetas) ? datosPacienteActual.carpetas : [];
  const carpetas = Array.from(new Set([...actuales, carpeta]));

  await actualizarUsuario(uidPaciente, { carpetas });
  datosPacienteActual = { ...(datosPacienteActual || {}), carpetas };
  ponerValor("nuevaCarpetaPaciente", "");

  await registrarAccionExpediente({
    accion: "asignar_carpeta_paciente",
    descripcion: "El medico asigno el paciente a una carpeta.",
    detalles: { carpeta }
  });

  await cargarCarpetasPaciente();
}

async function quitarCarpetaPaciente(nombre) {
  const carpeta = String(nombre || "").trim();
  const actuales = Array.isArray(datosPacienteActual?.carpetas) ? datosPacienteActual.carpetas : [];
  const carpetas = actuales.filter((item) => item !== carpeta);
  await actualizarUsuario(uidPaciente, { carpetas });
  datosPacienteActual = { ...(datosPacienteActual || {}), carpetas };
  await cargarCarpetasPaciente();
}

async function cargarNotasFlotantesPaciente() {
  const lista = document.getElementById("listaNotasFlotantesPaciente");
  if (!lista) return;

  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));

  if (snap.empty) {
    lista.innerHTML = "<p>No hay notas flotantes registradas.</p>";
    return;
  }

  lista.innerHTML = snap.docs.map((docNota) => {
    const nota = docNota.data();
    const abierta = nota.contraida ? "" : " open";
    return `
      <details class="nota-flotante-card"${abierta}>
        <summary>
          <strong>${escaparHTML(nota.titulo || "Nota flotante")}</strong>
          <span>${nota.contraida ? "Contrada" : "Visible"}</span>
        </summary>
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <div class="registro-actions">
          <button type="button" data-editar-nota-flotante="${docNota.id}">Editar</button>
          <button type="button" class="boton-peligro" data-eliminar-nota-flotante="${docNota.id}">Eliminar</button>
        </div>
      </details>
    `;
  }).join("");

  lista.querySelectorAll("[data-editar-nota-flotante]").forEach((boton) => {
    boton.addEventListener("click", () => editarNotaFlotantePaciente(boton.dataset.editarNotaFlotante));
  });

  lista.querySelectorAll("[data-eliminar-nota-flotante]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarNotaFlotantePaciente(boton.dataset.eliminarNotaFlotante));
  });
}

async function guardarNotaFlotantePaciente() {
  const id = valorCampo("notaFlotanteId");
  const titulo = valorCampo("notaFlotanteTitulo") || "Nota flotante";
  const texto = valorCampo("notaFlotanteTexto");
  const contraida = valorCampo("notaFlotanteContraida") === "true";

  if (!texto) {
    alert("Escribe el contenido de la nota flotante.");
    return;
  }

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
    await addDoc(collection(db, "usuarios", uidPaciente, "notasFlotantes"), {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
  }

  limpiarNotaFlotantePaciente();
  await cargarNotasFlotantesPaciente();
}

function limpiarNotaFlotantePaciente() {
  ponerValor("notaFlotanteId", "");
  ponerValor("notaFlotanteTitulo", "");
  ponerValor("notaFlotanteTexto", "");
  ponerValor("notaFlotanteContraida", "false");
}

async function editarNotaFlotantePaciente(id) {
  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));
  const docNota = snap.docs.find((item) => item.id === id);
  if (!docNota) return;
  const nota = docNota.data();
  ponerValor("notaFlotanteId", id);
  ponerValor("notaFlotanteTitulo", nota.titulo || "");
  ponerValor("notaFlotanteTexto", nota.texto || "");
  ponerValor("notaFlotanteContraida", nota.contraida ? "true" : "false");
  document.getElementById("notaFlotanteTitulo")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function eliminarNotaFlotantePaciente(id) {
  if (!confirm("Eliminar esta nota flotante?")) return;
  await deleteDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id));
  await cargarNotasFlotantesPaciente();
}

function datosInterconsultaFormulario() {
  const paciente = datosPacienteActual || {};
  const fechaNacimiento = obtenerFechaNacimiento(paciente);
  const edad = calcularEdad(fechaNacimiento);
  const datosInst = paciente.datosInstitucionales || {};
  const resumen = paciente.datosClinicosResumen || {};

  return {
    formato: valorCampo("interconsultaFormato") || "cognicion",
    servicioSolicitante: valorCampo("interconsultaServicioSolicitante") || paciente.servicioInstitucional || paciente.servicio || datosInst.servicioInstitucional || "",
    servicio: valorCampo("interconsultaServicio"),
    prioridad: valorCampo("interconsultaPrioridad") || "ordinaria",
    fecha: valorCampo("interconsultaFecha") || new Date().toISOString().slice(0, 10),
    hora: valorCampo("interconsultaHora") || new Date().toTimeString().slice(0, 5),
    motivo: valorCampo("interconsultaMotivo"),
    resumen: valorCampo("interconsultaResumen"),
    pregunta: valorCampo("interconsultaPregunta"),
    pacienteNombre: obtenerNombrePacienteParaMostrar(paciente) || "",
    fechaNacimiento,
    curp: valorCampo("interconsultaCurp") || paciente.curp || datosInst.curp || "",
    edad: edad !== "" ? `${edad}` : "",
    sexo: paciente.sexo || datosInst.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || datosInst.genero || "",
    expediente: paciente.expediente || paciente.numeroExpediente || datosInst.expediente || "",
    cama: paciente.cama || datosInst.cama || "",
    alergias: paciente.alergias || datosInst.alergias || "",
    peso: valorCampo("interconsultaPeso") || paciente.peso || paciente.signosVitales?.peso || "",
    talla: valorCampo("interconsultaTalla") || paciente.talla || paciente.signosVitales?.talla || "",
    perimetroAbdominal: valorCampo("interconsultaPerimetroAbdominal") || paciente.perimetroAbdominal || paciente.signosVitales?.perimetroAbdominal || "",
    diagnostico: valorCampo("interconsultaSospechaDiagnostica") || formatearDiagnostico(resumen.diagnostico || paciente.diagnostico),
    medicoSolicitante: valorCampo("interconsultaMedicoSolicitante") || paciente.medicoTratante || medicoActualDatos.nombre || "",
    cedulaSolicitante: valorCampo("interconsultaCedulaSolicitante") || medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || ""
  };
}

function autollenarInterconsulta() {
  const paciente = datosPacienteActual || {};
  const ahora = new Date();
  const fechaNacimiento = obtenerFechaNacimiento(paciente);
  const datosInst = paciente.datosInstitucionales || {};
  const resumen = paciente.datosClinicosResumen || {};
  const valores = {
    interconsultaServicioSolicitante: paciente.servicioInstitucional || paciente.servicio || datosInst.servicioInstitucional || "Observacion",
    interconsultaFecha: ahora.toISOString().slice(0, 10),
    interconsultaHora: ahora.toTimeString().slice(0, 5),
    interconsultaCurp: paciente.curp || datosInst.curp || "",
    interconsultaPeso: paciente.peso || paciente.signosVitales?.peso || "",
    interconsultaTalla: paciente.talla || paciente.signosVitales?.talla || "",
    interconsultaPerimetroAbdominal: paciente.perimetroAbdominal || paciente.signosVitales?.perimetroAbdominal || "",
    interconsultaSospechaDiagnostica: formatearDiagnostico(resumen.diagnostico || paciente.diagnostico),
    interconsultaMedicoSolicitante: paciente.medicoTratante || medicoActualDatos.nombre || "",
    interconsultaCedulaSolicitante: medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || ""
  };

  Object.entries(valores).forEach(([id, valor]) => {
    if (!valorCampo(id)) ponerValor(id, valor);
  });

  const motivo = document.getElementById("interconsultaMotivo");
  if (motivo && !motivo.value.trim()) {
    motivo.value = "";
  }
}

async function guardarInterconsultaPaciente() {
  aplicarPermisosFormatosPaciente();
  const datos = datosInterconsultaFormulario();

  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alertaFormatoNoAutorizado();
    return;
  }
  if (!datos.servicio || !datos.motivo) {
    alert("Indica el servicio solicitado y el motivo de interconsulta.");
    return;
  }

  await actualizarUsuario(uidPaciente, {
    curp: datos.curp || "",
    peso: datos.peso || "",
    talla: datos.talla || "",
    perimetroAbdominal: datos.perimetroAbdominal || "",
    datosInstitucionales: {
      ...(datosPacienteActual?.datosInstitucionales || {}),
      curp: datos.curp || "",
      peso: datos.peso || "",
      talla: datos.talla || "",
      perimetroAbdominal: datos.perimetroAbdominal || "",
      servicioInstitucional: datos.servicioSolicitante || datosPacienteActual?.servicioInstitucional || ""
    },
    signosVitales: {
      ...(datosPacienteActual?.signosVitales || {}),
      peso: datos.peso || "",
      talla: datos.talla || "",
      perimetroAbdominal: datos.perimetroAbdominal || ""
    }
  });

  await addDoc(collection(db, "usuarios", uidPaciente, "interconsultas"), {
    ...datos,
    medicoUid: auth.currentUser?.uid || "",
    fechaCreacion: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "solicitar_interconsulta",
    descripcion: "El medico registro una solicitud de interconsulta.",
    detalles: { servicio: datos.servicio, formato: datos.formato }
  });

  datosPacienteActual = await obtenerUsuario(uidPaciente);
  await cargarInterconsultasPaciente();
  alert("Interconsulta guardada.");
}

async function cargarInterconsultasPaciente() {
  const lista = document.getElementById("listaInterconsultasPaciente");
  if (!lista) return;

  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "interconsultas"), orderBy("fechaCreacion", "desc")));

  lista.innerHTML = snap.empty
    ? "<p>No hay interconsultas registradas.</p>"
    : snap.docs.map((docInterconsulta) => {
      const item = docInterconsulta.data();
      return `
        <article class="registro-card">
          <div class="registro-top">
            <strong>${escaparHTML(item.servicio || "Interconsulta")}</strong>
            <span class="estado-badge">${escaparHTML(item.formato || "cognicion")}</span>
          </div>
          <p>${escaparHTML(item.motivo || "")}</p>
          <small>${escaparHTML(item.fecha || "")}  ${escaparHTML(item.prioridad || "")}</small>
        </article>
      `;
    }).join("");
}

async function recursoDataUriPaciente(ruta) {
  const respuesta = await fetch(ruta);
  const blob = await respuesta.blob();
  return await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

function formatoFechaInterconsulta(fecha = "") {
  if (!fecha) return "";
  const partes = String(fecha).split("-");
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function textoWordPaciente(valor) {
  return escaparHTML(valor || "");
}

function textoMultilineaWordPaciente(valor) {
  return textoWordPaciente(valor).replace(/\n/g, "<br>");
}

function datosIdentificacionInstitucionalPaciente(paciente = {}) {
  const datosInst = paciente.datosInstitucionales || {};
  const fechaNacimiento = obtenerFechaNacimiento(paciente);
  const edad = calcularEdad(fechaNacimiento);

  return {
    nombrePaciente: obtenerNombrePacienteParaMostrar(paciente) || datosInst.nombrePaciente || "",
    fechaNacimiento,
    edad: edad !== "" ? `${edad}` : "",
    cama: paciente.cama || datosInst.cama || "",
    expediente: paciente.expediente || paciente.numeroExpediente || datosInst.expediente || "",
    sexo: paciente.sexo || datosInst.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || datosInst.genero || "",
    servicio: paciente.servicioInstitucional || paciente.servicio || datosInst.servicioInstitucional || "Observacion",
    alergias: paciente.alergias || datosInst.alergias || "",
    curp: paciente.curp || datosInst.curp || "",
    peso: paciente.peso || paciente.signosVitales?.peso || datosInst.peso || "",
    talla: paciente.talla || paciente.signosVitales?.talla || datosInst.talla || "",
    perimetroAbdominal: paciente.perimetroAbdominal || paciente.signosVitales?.perimetroAbdominal || datosInst.perimetroAbdominal || "",
    diagnostico: formatearDiagnostico(paciente.datosClinicosResumen?.diagnostico || paciente.diagnostico)
  };
}

async function encabezadoFrayPacienteHTML() {
  const logoSalud = await recursoDataUriPaciente("assets/fray-observacion-salud-conasama-stack.png");
  const logoFray = await recursoDataUriPaciente("assets/fray-observacion-image2.png");

  return `
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
          SECRETARIA DE SALUD<br>
          COMISION NACIONAL DE SALUD MENTAL Y ADICCIONES<br>
          HOSPITAL PSIQUIATRICO "FRAY BERNARDINO ALVAREZ"
        </td>
        <td class="encabezado-logo-der">
          <img
            class="logo-fray"
            src="${logoFray}"
            style="width:1.53cm;height:auto;"
            width="58"
          >
        </td>
      </tr>
    </table>
  `;
}

function estilosFrayPacienteHTML() {
  return `
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
    p { margin: 0; mso-margin-top-alt: 0cm; mso-margin-bottom-alt: 0cm; line-height: 1.0; mso-line-height-rule: exactly; text-align: left; }
    .identificacion { font-size: 8.6pt; line-height: 1.35; margin: 2pt 0 7pt; }
    .identificacion b { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin: 3pt 0 8pt; }
    th, td { border: 1px solid #333; padding: 4pt 5pt; vertical-align: top; font-size: 8.8pt; }
    th { text-align: center; font-weight: 700; }
    .sin-borde td { border: none; }
    .contenido-largo { min-height: 110pt; line-height: 1.08; }
    .firma-tabla td { width: 33.33%; height: 46pt; text-align: center; vertical-align: bottom; border: none; font-size: 8.5pt; }
  `;
}

function bloqueIdentificacionFrayPaciente(datos = {}) {
  return `
    <p class="identificacion">
      <b>Nombre del paciente:</b> ${textoWordPaciente(datos.nombrePaciente)}
         <b>Fecha de nacimiento:</b> ${textoWordPaciente(formatoFechaInterconsulta(datos.fechaNacimiento))}
          <b>Edad:</b> ${textoWordPaciente(datos.edad)} AÑOS
         <b>Cama:</b> ${textoWordPaciente(datos.cama)}
         <b>Expediente:</b> ${textoWordPaciente(datos.expediente)}
         <b>Sexo:</b> ${textoWordPaciente(datos.sexo)}
         <b>Genero:</b> ${textoWordPaciente(datos.genero)}
         <b>Servicio:</b> ${textoWordPaciente(datos.servicio)}
         <b>Alergias:</b> ${textoWordPaciente(datos.alergias)}
    </p>
  `;
}

function firmasFrayPacienteHTML(firmas = []) {
  const campos = [0, 1, 2].map((indice) => {
    const firma = firmas[indice] || {};
    return `
      <td>
        ${textoWordPaciente(firma.nombre)}<br>
        ${textoWordPaciente(firma.cargo)}<br>
        ${firma.cedula ? `Ced. Prof. ${textoWordPaciente(firma.cedula)}` : ""}
      </td>
    `;
  }).join("");

  return `<table class="firma-tabla"><tr>${campos}</tr></table>`;
}

async function htmlInterconsultaWord(datos) {
  const encabezadoFray = datos.formato === "fray" ? await encabezadoFrayPacienteHTML() : "";
  const encabezadoCognicion = `<h1>Cognicin - Solicitud de interconsulta</h1>`;
  const motivoCompleto = [
    datos.motivo,
    datos.resumen ? `Resumen clnico: ${datos.resumen}` : "",
    datos.pregunta ? `Pregunta clnica: ${datos.pregunta}` : ""
  ].filter(Boolean).join("\n\n");
  const identificacion = bloqueIdentificacionFrayPaciente({
    nombrePaciente: datos.pacienteNombre,
    fechaNacimiento: datos.fechaNacimiento,
    edad: datos.edad,
    cama: datos.cama,
    expediente: datos.expediente,
    sexo: datos.sexo,
    genero: datos.genero,
    alergias: datos.alergias,
    servicio: datos.servicioSolicitante || datos.servicio
  });

  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <title>Interconsulta Fray Bernardino</title>
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
          ${estilosFrayPacienteHTML()}
        </style>
      </head>
      <body>
        <div class="WordSection1">
          ${datos.formato === "fray" ? encabezadoFray : encabezadoCognicion}
          <h1>SOLICITUD DE INTERCONSULTA</h1>
          ${identificacion}
          <p><b>Fecha:</b> ${textoWordPaciente(formatoFechaInterconsulta(datos.fecha))}    <b>Hora:</b> ${textoWordPaciente(datos.hora)}    <b>CURP:</b> ${textoWordPaciente(datos.curp)}</p>
          <p><b>Servicio solicitante:</b> ${textoWordPaciente(datos.servicioSolicitante)}    <b>Servicio interconsultante:</b> ${textoWordPaciente(datos.servicio)}    <b>Prioridad:</b> ${textoWordPaciente(datos.prioridad)}</p>
          <p><b>Peso:</b> ${textoWordPaciente(datos.peso)} Kg    <b>Talla:</b> ${textoWordPaciente(datos.talla)} m    <b>Perimetro abdominal:</b> ${textoWordPaciente(datos.perimetroAbdominal)} cm</p>
          <h2>Sospecha diagnstica</h2>
          <p>${textoWordPaciente(datos.diagnostico)}</p>
          <h2>Motivo de la interconsulta</h2>
          <p class="contenido-largo">${textoMultilineaWordPaciente(motivoCompleto)}</p>
          <table class="sin-borde">
            <tr>
              <td><b>Medico solicitante:</b> ${textoWordPaciente(datos.medicoSolicitante)}<br><b>Cedula profesional:</b> ${textoWordPaciente(datos.cedulaSolicitante)}</td>
              <td><b>Medico interconsultante:</b><br>______________________________________<br><b>Cedula profesional:</b> __________________</td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;
}

function datosIndicacionesFormulario() {
  const paciente = datosPacienteActual || {};
  const base = datosIdentificacionInstitucionalPaciente(paciente);
  const ahora = new Date();
  const medicamentosActivos = medicamentosActivosIndicaciones();
  const indicacionesGeneradas = construirTextoIndicaciones(medicamentosActivos);
  const indicaciones = textoIndicacionesEditado
    ? valorCampo("indicacionesTexto")
    : indicacionesGeneradas;

  if (!textoIndicacionesEditado) ponerValor("indicacionesTexto", indicacionesGeneradas);

  return {
    formato: valorCampo("indicacionesFormato") || (formatoInstitucionalPermitidoPaciente("fray") ? "fray" : "cognicion"),
    servicio: valorCampo("indicacionesServicio") || base.servicio || "Observacion",
    fecha: valorCampo("indicacionesFecha") || ahora.toISOString().slice(0, 10),
    hora: valorCampo("indicacionesHora") || ahora.toTimeString().slice(0, 5),
    dieta: valorCampo("indicacionesDieta"),
    cuidados: valorCampo("indicacionesCuidados"),
    alergiasIndicaciones: valorCampo("indicacionesAlergias"),
    riesgoCaida: valorCampo("indicacionesRiesgoCaida"),
    vigilancia: valorCampo("indicacionesVigilancia"),
    notaMedicamentos: valorCampo("indicacionesNotaMedicamentos"),
    medicamentos: medicamentosActivos,
    eventualidades: valorCampo("indicacionesEventualidades"),
    indicaciones,
    pacienteNombre: base.nombrePaciente,
    fechaNacimiento: base.fechaNacimiento,
    edad: base.edad,
    cama: base.cama,
    expediente: base.expediente,
    sexo: base.sexo,
    genero: base.genero,
    alergias: base.alergias,
    firmas: [
      {
        nombre: valorCampo("indicacionesFirma1Nombre"),
        cargo: valorCampo("indicacionesFirma1Cargo"),
        cedula: valorCampo("indicacionesFirma1Cedula")
      },
      {
        nombre: valorCampo("indicacionesFirma2Nombre"),
        cargo: valorCampo("indicacionesFirma2Cargo"),
        cedula: valorCampo("indicacionesFirma2Cedula")
      },
      {
        nombre: valorCampo("indicacionesFirma3Nombre"),
        cargo: valorCampo("indicacionesFirma3Cargo"),
        cedula: valorCampo("indicacionesFirma3Cedula")
      }
    ]
  };
}

async function asegurarTratamientosCache() {
  if (modoNuevoPacienteDraft()) {
    const draft = asegurarEstructuraDraftClinico();
    tratamientosCache = (draft?.tratamiento?.medicamentos || []).map(normalizarTratamientoFrecuenciaPaciente);
    tratamientosCachePatientId = ID_PACIENTE_BORRADOR_NUEVO;
    tratamientosCacheCargado = true;
    return;
  }

  const patientIdActual = String(uidPaciente || "").trim();
  if (!patientIdActual) {
    throw new Error("No se pudo identificar al paciente activo.");
  }
  if (tratamientosCacheCargado && tratamientosCachePatientId === patientIdActual) return;

  const token = ++tratamientosCargaToken;
  try {
    const tratamientos = await listarTratamientos(patientIdActual);
    if (token !== tratamientosCargaToken || patientIdActual !== String(uidPaciente || "").trim()) {
      return;
    }
    tratamientosCache = (Array.isArray(tratamientos) ? tratamientos : [])
      .map(normalizarTratamientoFrecuenciaPaciente);
    tratamientosCachePatientId = patientIdActual;
    tratamientosCacheCargado = true;
  } catch (error) {
    console.warn("No se pudieron cargar tratamientos para indicaciones:", error);
    if (token === tratamientosCargaToken && patientIdActual === String(uidPaciente || "").trim()) {
      tratamientosCache = [];
      tratamientosCachePatientId = patientIdActual;
      tratamientosCacheCargado = false;
    }
    throw error;
  }
}

function esTratamientoVigente(tratamiento = {}) {
  if (!tratamiento || typeof tratamiento !== "object") return false;

  const estado = String(tratamiento.estado || "activo").trim().toLowerCase();
  if (tratamiento.activo === false) return false;
  if (tratamiento.suspendido === true) return false;
  if (tratamiento.eliminado === true || tratamiento.archivado === true) return false;
  if (["suspendido", "eliminado", "archivado", "borrador", "cancelado", "inactivo"].includes(estado)) {
    return false;
  }

  return Boolean(
    tratamiento.medicamentoId ||
    tratamiento.medicamento ||
    tratamiento.genericName ||
    tratamiento.nombre
  );
}

function obtenerClaveMedicamentoTratamiento(tratamiento = {}) {
  return normalizarTextoBusqueda(
    tratamiento.medicamentoId ||
    tratamiento.genericName ||
    tratamiento.medicamento ||
    tratamiento.nombre ||
    ""
  );
}

function obtenerTratamientosVigentesUnicos() {
  const patientIdActual = String(uidPaciente || "").trim();
  if (!patientIdActual || tratamientosCachePatientId !== patientIdActual) return [];

  const unicos = new Map();
  tratamientosCache.filter(esTratamientoVigente).forEach((tratamiento) => {
    const clave = obtenerClaveMedicamentoTratamiento(tratamiento);
    if (clave && !unicos.has(clave)) unicos.set(clave, tratamiento);
  });
  return [...unicos.values()];
}

function invalidarContextoTratamientosPaciente() {
  tratamientosCargaToken += 1;
  tratamientosCache = [];
  tratamientosCacheCargado = false;
  tratamientosCachePatientId = "";
  indicacionesPacienteCache = [];
  indicacionResumenCacheCargada = false;
  indicacionResumenCachePacienteId = "";
  indicacionResumenCargaPromise = null;
  cerrarInteraccionesFarmacologicas();
}

function medicamentosActivosIndicaciones() {
  const checksDisponibles = [...document.querySelectorAll("[data-medicamento-indicacion]")];
  const checks = checksDisponibles
    .filter((check) => check.checked)
    .map((check) => check.value)
    .filter(Boolean);

  if (checksDisponibles.length) return checks;

  return obtenerTratamientosVigentesUnicos()
    .map((t) => formatearIndicacionTratamientoConCambio(t, true))
    .filter(Boolean);
}

function construirTextoIndicaciones(medicamentos = medicamentosActivosIndicaciones()) {
  const dieta = valorCampo("indicacionesDieta") || "NORMAL";
  const cuidados = valorCampo("indicacionesCuidados") || "Signos vitales por turno y cuidados generales por enfermera";
  const cuidadosMostrar = cuidados
    .replace(/\s*y cuidados generales por enfermer[i]a/i, "")
    .trim();
  const alergias = valorCampo("indicacionesAlergias") || "Negadas";
  const riesgoCaida = valorCampo("indicacionesRiesgoCaida") || "MEDIO";
  const vigilancia = valorCampo("indicacionesVigilancia") || "RIESGO SUICIDA";
  const notaMedicamentos = valorCampo("indicacionesNotaMedicamentos") || "EN CASO DE NEGATIVISMO, ADMINISTRAR MOLIDOS Y DISUELTOS";
  const eventualidadesCapturadas = valorCampo("indicacionesEventualidades");
  const eventualidades = !eventualidadesCapturadas || /^reportar eventualidades$/i.test(eventualidadesCapturadas.trim())
    ? "Favor de reportar eventualidades. Gracias."
    : eventualidadesCapturadas;
  const lineas = [
    `1. Dieta: ${dieta}`,
    `2. Signos vitales y cuidados generales por enfermera: ${cuidadosMostrar}`,
    `3. Vigilancia por: ${vigilancia}`,
    `4. Riesgo de cada: ${riesgoCaida}`,
    `5. Alergias: ${alergias}`,
    `6. Medicamentos${notaMedicamentos ? ` (${notaMedicamentos.toLowerCase()})` : ""}:`
  ];

  if (medicamentos.length) {
    medicamentos.forEach((medicamento) => {
      lineas.push(`   ${medicamento}`);
    });
  } else {
    lineas.push("   -Sin medicamentos activos registrados.");
  }

  lineas.push(eventualidades || "Favor de reportar eventualidades. Gracias.");
  const indiceEventualidades = lineas.length - 1;
  lineas[indiceEventualidades] = /^7\./.test(lineas[indiceEventualidades])
    ? lineas[indiceEventualidades]
    : `7. ${lineas[indiceEventualidades]}`;

  return lineas.join("\n");
}

const CLAVE_TRANSFERENCIA_INDICACIONES = "cognicion_indicaciones_generadas_ultimo";

async function guardarIndicacionesGeneradasParaNota() {
  const texto = valorCampo("indicacionesTexto").trim();
  const pacienteId = uidPaciente || document.getElementById("uidPaciente")?.value || "";
  try {
    await guardarTransferenciaClinicaLocal(CLAVE_TRANSFERENCIA_INDICACIONES, {
      pacienteId,
      texto,
      actualizadoEn: new Date().toISOString()
    });
    localStorage.removeItem(CLAVE_TRANSFERENCIA_INDICACIONES);
  } catch (error) {
    console.warn("No se pudo sincronizar indicaciones generadas con nota:", error?.name || "error");
  }
}

function actualizarTextoIndicaciones() {
  ponerValor("indicacionesTexto", construirTextoIndicaciones());
  textoIndicacionesEditado = false;
  guardarIndicacionesGeneradasParaNota();
}

function configurarControlesIndicacionesGeneradas() {
  const textarea = document.getElementById("indicacionesTexto");
  const controles = document.querySelector("[data-controles-indicaciones-texto]");
  if (!textarea || !controles) return;

  const minimo = 90;
  const base = 150;
  const aplicarAltura = (altura) => {
    textarea.style.height = `${Math.max(minimo, Math.round(altura))}px`;
    textarea.closest(".indicaciones-generadas-control")?.classList.remove("seccion-contraida");
  };

  controles.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button");
    if (!boton) return;
    const accion = boton.dataset.accion;
    const actual = textarea.getBoundingClientRect().height || base;

    if (accion === "menos") aplicarAltura(actual - 48);
    if (accion === "mas") aplicarAltura(actual + 48);
    if (accion === "contraer") {
      const seccion = textarea.closest(".indicaciones-generadas-control");
      const contraer = !seccion?.classList.contains("seccion-contraida");
      textarea.style.height = `${contraer ? minimo : base}px`;
      seccion?.classList.toggle("seccion-contraida", contraer);
    }
    if (accion === "reiniciar") aplicarAltura(base);
  });
}

function renderizarMedicamentosIndicaciones() {
  const contenedor = document.getElementById("listaMedicamentosIndicaciones");
  if (!contenedor) return;

  const tratamientosActivos = obtenerTratamientosVigentesUnicos();
  contenedor.innerHTML = tratamientosActivos.length
    ? tratamientosActivos.map((tratamiento, index) => {
      const indicacion = formatearIndicacionTratamientoConCambio(tratamiento, true);
      return `
        <label class="medicamento-indicacion-item">
          <input type="checkbox" data-medicamento-indicacion value="${escaparHTML(indicacion)}" checked>
          <span>${escaparHTML(indicacion || `Medicamento ${index + 1}`)}</span>
        </label>
      `;
    }).join("")
    : "<p>Sin medicamentos activos registrados.</p>";

  contenedor.querySelectorAll("[data-medicamento-indicacion]").forEach((check) => {
    check.addEventListener("change", () => {
      if (!textoIndicacionesEditado) actualizarTextoIndicaciones();
    });
  });
}

function tratamientosActivosParaInteracciones() {
  return obtenerTratamientosVigentesUnicos()
    .map((t) => ({
      ...t,
      id: t.id || "",
      medicamento: t.medicamento || t.genericName || t.nombre || "",
      indicacion: formatearIndicacionTratamiento(t, false),
      dosisDia: t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || ""
    }))
    .filter((t) => t.medicamento);
}

function tratamientosSeleccionadosIndicacionesParaInteracciones() {
  const seleccionados = [...document.querySelectorAll("[data-medicamento-indicacion]")]
    .filter((check) => check.checked)
    .map((check) => check.value)
    .filter(Boolean);
  const activos = obtenerTratamientosVigentesUnicos();

  if (!seleccionados.length) return tratamientosActivosParaInteracciones();

  return seleccionados
    .map((indicacionSeleccionada, index) => {
      const tratamiento = activos.find((t) => formatearIndicacionTratamientoConCambio(t, true) === indicacionSeleccionada);
      if (tratamiento) {
        return {
          ...tratamiento,
          id: tratamiento.id || `indicacion-${index}`,
          medicamento: tratamiento.medicamento || "Medicamento sin nombre",
          indicacion: formatearIndicacionTratamiento(tratamiento, false),
          dosisDia: tratamiento.dosisTotalDia || calcularDosisTotalDiaTratamiento(tratamiento).texto || ""
        };
      }

      return null;
    })
    .filter(Boolean);
}

function cerrarInteraccionesFarmacologicas() {
  const modal = document.getElementById("modalInteraccionesFarmacologicas");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function obtenerTextoDiagnosticoInteracciones(diagnostico) {
  if (typeof diagnostico === "string") return diagnostico.trim();
  if (!diagnostico || typeof diagnostico !== "object") return "";

  const codigo = diagnostico.codigo ?? diagnostico.code ?? diagnostico.id ?? "";
  const nombre = diagnostico.nombre
    ?? diagnostico.name
    ?? diagnostico.descripcion
    ?? diagnostico.description
    ?? diagnostico.textoVisible
    ?? diagnostico.texto
    ?? "";
  const partes = [codigo, nombre]
    .filter((valor) => typeof valor === "string" || typeof valor === "number")
    .map((valor) => String(valor).trim())
    .filter(Boolean);
  const texto = [...new Set(partes)].join(" - ");

  if (!texto) {
    console.warn("[Interacciones] Diagnóstico sin texto renderizable", {
      keys: Object.keys(diagnostico)
    });
  }

  return texto;
}

function renderizarInteraccionesFarmacologicas(medicamentos = [], origen = "tratamiento") {
  const contenedor = document.getElementById("contenidoInteraccionesFarmacologicas");
  if (!contenedor) return;

  const interacciones = detectarInteraccionesFarmacologicas(medicamentos);
  const evaluacionClinica = detectarAlertasClinicasMedicamentos(medicamentos, datosPacienteActual || {});
  const alertasClinicas = evaluacionClinica.alertas || [];
  const tituloOrigen = origen === "indicaciones" ? "medicamentos activos vinculados a indicaciones" : "tratamientos activos";
  const listaMedicamentos = medicamentos.length
    ? medicamentos.map((med) => `
      <li>
        <strong>${escaparHTML(med.medicamento)}</strong>
        ${med.indicacion ? `<span>${escaparHTML(med.indicacion)}</span>` : ""}
        ${med.dosisDia ? `<small>Dosis/día: ${escaparHTML(med.dosisDia)}</small>` : ""}
      </li>
    `).join("")
    : "<li>No hay medicamentos activos registrados.</li>";
  const diagnosticosEvaluados = evaluacionClinica.diagnosticosEvaluados || [];
  const diagnosticosDetectados = evaluacionClinica.diagnosticosDetectados || [];
  const contextoDiagnostico = diagnosticosEvaluados.length
    ? diagnosticosEvaluados.map((dx) => `
      <li>
        ${escaparHTML(obtenerTextoDiagnosticoInteracciones(dx) || "Diagnóstico sin texto")}
        ${typeof dx.estado === "string" || typeof dx.estado === "number" ? `<small>${escaparHTML(String(dx.estado))}</small>` : ""}
      </li>
    `).join("")
    : "<li>Sin diagnosticos estructurados evaluables.</li>";
  const categoriasDiagnosticas = diagnosticosDetectados.length
    ? diagnosticosDetectados.map((dx) => obtenerTextoDiagnosticoInteracciones(dx)).filter(Boolean).map((texto) => escaparHTML(texto)).join(", ")
    : "Sin categorias clinicas detectadas por las reglas locales.";

  contenedor.innerHTML = `
    <p class="texto-suave">Revisin orientativa basada en los ${escaparHTML(tituloOrigen)}. Analizado a partir de ${escaparHTML(String(medicamentos.length))} medicamentos activos. No sustituye el juicio clnico ni la revisin de fuentes farmacolgicas institucionales.</p>
    <article class="interaccion-card severidad-${escaparHTML(evaluacionClinica.indicador?.clase || "ok")}">
          <strong>Indicador contextual: ${escaparHTML(evaluacionClinica.indicador?.etiqueta || "Sin alerta encontrada con la base actual")}</strong>
      <p>${alertasClinicas.length ? "Se detectaron alertas por diagnsticos, comorbilidades, interacciones o carga acumulativa." : "No se detectaron alertas clnicas contextuales con las reglas locales actuales."}</p>
    </article>
    <div class="interacciones-medicamentos-revisados">
      <strong>Medicamentos revisados</strong>
      <ul>${listaMedicamentos}</ul>
    </div>
    <div class="interacciones-medicamentos-revisados">
      <strong>Diagnosticos usados para contexto clinico</strong>
      <small>Categorias detectadas: ${categoriasDiagnosticas}</small>
      <ul>${contextoDiagnostico}</ul>
    </div>
    ${alertasClinicas.length ? `
      <div class="interacciones-lista">
        ${alertasClinicas.map((alerta) => `
          <article class="interaccion-card severidad-${escaparHTML(alerta.severidad)}">
            <div class="registro-top">
              <div>
                <strong>${escaparHTML(alerta.titulo)}</strong>
                <span>${escaparHTML((alerta.medicamentos || []).join(" + ") || "Contexto clnico")}</span>
              </div>
              <em>${escaparHTML(alerta.severidad)}</em>
            </div>
            ${alerta.diagnosticos?.length ? `<small>Contexto: ${alerta.diagnosticos.map((dx) => obtenerTextoDiagnosticoInteracciones(dx)).filter(Boolean).map((texto) => escaparHTML(texto)).join(", ")}</small>` : ""}
            <p>${escaparHTML(alerta.efecto)}</p>
            <small>${escaparHTML(alerta.recomendacion)}</small>
            ${alerta.requiereJustificacion ? "<small>Requiere justificacin clnica si se decide continuar.</small>" : ""}
          </article>
        `).join("")}
      </div>
    ` : ""}
    ${interacciones.length ? `
      <div class="interacciones-lista">
        ${interacciones.map((interaccion) => `
          <article class="interaccion-card severidad-${escaparHTML(interaccion.severidad.toLowerCase())}">
            <div class="registro-top">
              <div>
                <strong>${escaparHTML(interaccion.titulo)}</strong>
                <span>${escaparHTML(interaccion.medicamentos.join(" + "))}</span>
              </div>
              <em>${escaparHTML(interaccion.severidad)}</em>
            </div>
            <p>${escaparHTML(interaccion.efecto)}</p>
            <small>${escaparHTML(interaccion.recomendacion)}</small>
          </article>
        `).join("")}
      </div>
    ` : `
      <article class="interaccion-card">
        <strong>Sin interacciones relevantes detectadas con las reglas locales.</strong>
        <p>Si hay comorbilidades, cambios de dosis, alteraciones hepaticas/renales o polifarmacia compleja, revisa una fuente farmacologica formal.</p>
      </article>
    `}
  `;
}

async function abrirInteraccionesFarmacologicas(origen = "tratamiento") {
  const modal = document.getElementById("modalInteraccionesFarmacologicas");
  if (!modal) return;
  const patientIdAlIniciar = String(uidPaciente || "").trim();
  if (!patientIdAlIniciar) {
    console.error("[Interacciones] No se pudo identificar al paciente activo.");
    return;
  }

  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
  const contenedor = document.getElementById("contenidoInteraccionesFarmacologicas");
  if (contenedor) contenedor.innerHTML = "<p>Cargando revision de interacciones...</p>";

  try {
    await asegurarTratamientosCache();
  } catch (error) {
    console.error("[Interacciones] No se pudo cargar el tratamiento vigente:", error);
    cerrarInteraccionesFarmacologicas();
    if (contenedor) contenedor.innerHTML = "<p>No se pudo cargar el tratamiento vigente del paciente.</p>";
    return;
  }
  if (patientIdAlIniciar !== String(uidPaciente || "").trim() || tratamientosCachePatientId !== patientIdAlIniciar) {
    cerrarInteraccionesFarmacologicas();
    return;
  }
  const medicamentos = origen === "indicaciones"
    ? tratamientosSeleccionadosIndicacionesParaInteracciones()
    : tratamientosActivosParaInteracciones();
  console.debug("[Interacciones] Contexto de análisis", {
    patientId: patientIdAlIniciar,
    totalTratamientosCargados: tratamientosCache.length,
    totalVigentes: obtenerTratamientosVigentesUnicos().length,
    clavesMedicamentos: obtenerTratamientosVigentesUnicos().map(obtenerClaveMedicamentoTratamiento)
  });
  console.debug("[Interacciones] Medicamentos analizados", {
    patientId: patientIdAlIniciar,
    medicamentos: medicamentos.map((medicamento) => ({
      id: medicamento.id || null,
      nombreNormalizado: normalizarTextoBusqueda(medicamento.medicamento || "")
    }))
  });
  renderizarInteraccionesFarmacologicas(medicamentos, origen);
}
function autollenarIndicaciones() {
  const paciente = datosPacienteActual || {};
  const base = datosIdentificacionInstitucionalPaciente(paciente);
  const ahora = new Date();
  const valores = {
    indicacionesServicio: base.servicio || "Observacion",
    indicacionesFecha: ahora.toISOString().slice(0, 10),
    indicacionesHora: ahora.toTimeString().slice(0, 5),
    indicacionesDieta: "NORMAL",
    indicacionesCuidados: "Signos vitales por turno y cuidados generales por enfermeria",
    indicacionesAlergias: base.alergias || "Negadas",
    indicacionesRiesgoCaida: "MEDIO",
    indicacionesVigilancia: "RIESGO SUICIDA",
    indicacionesNotaMedicamentos: "EN CASO DE NEGATIVISMO, ADMINISTRAR MOLIDOS Y DISUELTOS",
    indicacionesEventualidades: "Reportar Eventualidades",
    indicacionesFirma1Nombre: paciente.medicoAdscritoEncargado || paciente.medicoTratante || medicoActualDatos.nombre || "",
    indicacionesFirma1Cargo: paciente.medicoAdscritoEncargado || paciente.medicoTratante || medicoActualDatos.nombre ? "Mdico adscrito" : "",
    indicacionesFirma1Cedula: medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || "",
    indicacionesFirma2Nombre: paciente.residenteEncargado || "",
    indicacionesFirma2Cargo: paciente.residenteEncargado ? "Mdico residente" : "",
    indicacionesFirma2Cedula: ""
  };

  Object.entries(valores).forEach(([id, valor]) => {
    if (!valorCampo(id)) ponerValor(id, valor);
  });

  const texto = document.getElementById("indicacionesTexto");
  if (texto && !texto.value.trim()) {
    actualizarTextoIndicaciones();
  }
}

async function guardarIndicacionesPaciente() {
  aplicarPermisosFormatosPaciente();
  const datos = datosIndicacionesFormulario();

  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alertaFormatoNoAutorizado();
    return;
  }

  if (!datos.indicaciones) {
    alert("Escribe las indicaciones mdicas.");
    return;
  }

  if (modoNuevoPacienteDraft()) {
    const draft = asegurarEstructuraDraftClinico();
    const indicacion = {
      id: `draft-indicaciones-${Date.now()}`,
      ...datos,
      medicoUid: auth.currentUser?.uid || "",
      fechaCreacion: new Date().toISOString()
    };
    draft.tratamiento.indicaciones.unshift(indicacion);
    draft.indicacionesEstructuradas = datos;
    draft.datosClinicosResumen = {
      ...(draft.datosClinicosResumen || {}),
      indicaciones: datos,
      fechaActualizacionIndicaciones: new Date().toISOString()
    };
    indicacionesPacienteCache = draft.tratamiento.indicaciones;
    sincronizarDatosPacienteDesdeDraft();
    await cargarIndicacionesPaciente();
    alert("Indicaciones guardadas en el borrador del paciente.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "indicaciones"), {
    ...datos,
    medicoUid: auth.currentUser?.uid || "",
    fechaCreacion: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "crear_indicaciones",
    descripcion: "El mdico registr indicaciones mdicas del paciente.",
    detalles: { formato: datos.formato, servicio: datos.servicio }
  });

  await cargarIndicacionesPaciente();
  alert("Indicaciones guardadas.");
}

async function cargarIndicacionesPaciente() {
  const lista = document.getElementById("listaIndicacionesPaciente");
  if (!lista) return;

  if (modoNuevoPacienteDraft()) {
    const draft = asegurarEstructuraDraftClinico();
    indicacionesPacienteCache = draft?.tratamiento?.indicaciones || [];
    indicacionResumenCacheCargada = true;
    indicacionResumenCachePacienteId = ID_PACIENTE_BORRADOR_NUEVO;
  } else {
  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "indicaciones"), orderBy("fechaCreacion", "desc")));
  indicacionesPacienteCache = snap.docs.map((docIndicacion) => ({
    id: docIndicacion.id,
    ...docIndicacion.data()
  }));
  indicacionResumenCacheCargada = true;
  indicacionResumenCachePacienteId = String(uidPaciente || "").trim();
  renderizarVistaLaboratorioPaciente(datosPacienteActual || {});
  }

  lista.innerHTML = indicacionesPacienteCache.length === 0
    ? "<p>No hay indicaciones registradas.</p>"
    : indicacionesPacienteCache.map((item) => {
      return `
        <article class="registro-card">
          <div class="registro-top">
            <strong>${escaparHTML(item.servicio || "Indicaciones")}</strong>
            <span class="estado-badge">${escaparHTML(item.formato || "fray")}</span>
          </div>
          <p>${escaparHTML(item.indicaciones || "").replace(/\n/g, "<br>")}</p>
          <small>${escaparHTML(item.fecha || "")}  ${escaparHTML(item.hora || "")}</small>
          <div class="registro-actions">
            <button type="button" data-cargar-indicacion-borrador="${item.id}">Cargar como borrador</button>
          </div>
        </article>
      `;
    }).join("");

  lista.querySelectorAll("[data-cargar-indicacion-borrador]").forEach((boton) => {
    boton.addEventListener("click", () => cargarIndicacionComoBorrador(boton.dataset.cargarIndicacionBorrador));
  });
}

function cargarIndicacionComoBorrador(id) {
  const indicacion = indicacionesPacienteCache.find((item) => item.id === id);
  if (!indicacion) return;

  const campos = {
    indicacionesFormato: indicacion.formato || (formatoInstitucionalPermitidoPaciente("fray") ? "fray" : "cognicion"),
    indicacionesServicio: indicacion.servicio || "",
    indicacionesFecha: new Date().toISOString().slice(0, 10),
    indicacionesHora: new Date().toTimeString().slice(0, 5),
    indicacionesDieta: indicacion.dieta || "",
    indicacionesCuidados: indicacion.cuidados || "",
    indicacionesAlergias: indicacion.alergiasIndicaciones || indicacion.alergias || "",
    indicacionesRiesgoCaida: indicacion.riesgoCaida || "",
    indicacionesVigilancia: indicacion.vigilancia || "",
    indicacionesNotaMedicamentos: indicacion.notaMedicamentos || "",
    indicacionesEventualidades: indicacion.eventualidades || "",
    indicacionesTexto: indicacion.indicaciones || "",
    indicacionesFirma1Nombre: indicacion.firmas?.[0]?.nombre || "",
    indicacionesFirma1Cargo: indicacion.firmas?.[0]?.cargo || "",
    indicacionesFirma1Cedula: indicacion.firmas?.[0]?.cedula || "",
    indicacionesFirma2Nombre: indicacion.firmas?.[1]?.nombre || "",
    indicacionesFirma2Cargo: indicacion.firmas?.[1]?.cargo || "",
    indicacionesFirma2Cedula: indicacion.firmas?.[1]?.cedula || "",
    indicacionesFirma3Nombre: indicacion.firmas?.[2]?.nombre || "",
    indicacionesFirma3Cargo: indicacion.firmas?.[2]?.cargo || "",
    indicacionesFirma3Cedula: indicacion.firmas?.[2]?.cedula || ""
  };

  Object.entries(campos).forEach(([campo, valor]) => ponerValor(campo, valor));
  textoIndicacionesEditado = true;
  renderizarMedicamentosIndicaciones();
  document.getElementById("indicacionesFormato")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function htmlIndicacionesWord(datos) {
  const encabezadoFray = datos.formato === "fray" ? await encabezadoFrayPacienteHTML() : "";
  const encabezadoCognicion = `<h1>Cognicion - Indicaciones medicas</h1>`;
  const identificacion = bloqueIdentificacionFrayPaciente({
    nombrePaciente: datos.pacienteNombre,
    fechaNacimiento: datos.fechaNacimiento,
    edad: datos.edad,
    cama: datos.cama,
    expediente: datos.expediente,
    sexo: datos.sexo,
    genero: datos.genero,
    servicio: datos.servicio,
    alergias: datos.alergias
  });

  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
          <meta charset="UTF-8">
          <title>Indicaciones Fray Bernardino</title>
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
        p { margin: 0; mso-margin-top-alt: 0cm; mso-margin-bottom-alt: 0cm; line-height: 1.0; mso-line-height-rule: exactly; text-align: left; }
        .identificacion { font-size: 8.6pt; line-height: 1.35; margin: 2pt 0 7pt; }
        .identificacion b { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 3pt 0 8pt; }
        th, td { border: 1px solid #222; padding: 4pt; vertical-align: top; text-align: left; font-size: 8.8pt; }
        th { text-align: center; font-weight: 700; }
        .tabla-indicaciones th:first-child,
        .tabla-indicaciones td:first-child { width: 22%; text-align: center; }
        .tabla-indicaciones td:last-child { width: 78%; }
        .contenido-largo { min-height: 110pt; line-height: 1.08; text-align: left; }
        .firma-tabla td { border: none; width: 33.33%; height: 46pt; text-align: center; vertical-align: bottom; font-size: 8.5pt; }
      </style>
    </head>
    <body>
        <div class="WordSection1">
          ${datos.formato === "fray" ? encabezadoFray : encabezadoCognicion}
          <h1>INDICACIONES MEDICAS</h1>
          ${identificacion}
          <table class="tabla-indicaciones">
            <tr>
              <th colspan="2">INDICACIONES MEDICAS DEL SERVICIO DE ${textoWordPaciente(datos.servicio).toUpperCase()}</th>
            </tr>
            <tr>
              <td>
                <b>Fecha y Hora</b><br>
                ${textoWordPaciente(formatoFechaInterconsulta(datos.fecha))}<br>
                ${textoWordPaciente(datos.hora)} h
              </td>
              <td class="contenido-largo">${textoMultilineaWordPaciente(datos.indicaciones)}</td>
            </tr>
          </table>
          ${firmasFrayPacienteHTML(datos.firmas)}
        </div>
      </body>
    </html>
  `;
}

async function descargarIndicacionesPaciente() {
  aplicarPermisosFormatosPaciente();
  const datos = datosIndicacionesFormulario();

  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alertaFormatoNoAutorizado();
    return;
  }

  if (!datos.indicaciones) {
    alert("Escribe las indicaciones medicas antes de descargar.");
    return;
  }

  const html = await htmlIndicacionesWord(datos);
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Indicaciones_${datos.formato}_${(datos.pacienteNombre || "paciente").replace(/\s+/g, "_")}_${datos.fecha}.doc`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function fechaHoraZipActual() {
  const fecha = new Date();
  const horaDos = (
    (fecha.getHours() << 11) |
    (fecha.getMinutes() << 5) |
    Math.floor(fecha.getSeconds() / 2)
  );
  const fechaDos = (
    ((fecha.getFullYear() - 1980) << 9) |
    ((fecha.getMonth() + 1) << 5) |
    fecha.getDate()
  );
  return { horaDos, fechaDos };
}

let tablaCrc32 = null;

function obtenerTablaCrc32() {
  if (tablaCrc32) return tablaCrc32;
  tablaCrc32 = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tablaCrc32[i] = c >>> 0;
  }
  return tablaCrc32;
}

function crc32(bytes) {
  const tabla = obtenerTablaCrc32();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirUint16(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
}

function escribirUint32(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
  buffer[offset + 2] = (valor >>> 16) & 0xff;
  buffer[offset + 3] = (valor >>> 24) & 0xff;
}

function unirBytes(partes, total) {
  const salida = new Uint8Array(total);
  let offset = 0;
  partes.forEach((parte) => {
    salida.set(parte, offset);
    offset += parte.length;
  });
  return salida;
}

function crearZipSinCompresion(archivos) {
  const encoder = new TextEncoder();
  const { horaDos, fechaDos } = fechaHoraZipActual();
  const partes = [];
  const centrales = [];
  let offset = 0;

  archivos.forEach((archivo) => {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = typeof archivo.contenido === "string"
      ? encoder.encode(archivo.contenido)
      : archivo.contenido;
    const crc = crc32(contenido);
    const local = new Uint8Array(30 + nombre.length);

    escribirUint32(local, 0, 0x04034b50);
    escribirUint16(local, 4, 20);
    escribirUint16(local, 6, 0);
    escribirUint16(local, 8, 0);
    escribirUint16(local, 10, horaDos);
    escribirUint16(local, 12, fechaDos);
    escribirUint32(local, 14, crc);
    escribirUint32(local, 18, contenido.length);
    escribirUint32(local, 22, contenido.length);
    escribirUint16(local, 26, nombre.length);
    escribirUint16(local, 28, 0);
    local.set(nombre, 30);

    partes.push(local, contenido);

    const central = new Uint8Array(46 + nombre.length);
    escribirUint32(central, 0, 0x02014b50);
    escribirUint16(central, 4, 20);
    escribirUint16(central, 6, 20);
    escribirUint16(central, 8, 0);
    escribirUint16(central, 10, 0);
    escribirUint16(central, 12, horaDos);
    escribirUint16(central, 14, fechaDos);
    escribirUint32(central, 16, crc);
    escribirUint32(central, 20, contenido.length);
    escribirUint32(central, 24, contenido.length);
    escribirUint16(central, 28, nombre.length);
    escribirUint16(central, 30, 0);
    escribirUint16(central, 32, 0);
    escribirUint16(central, 34, 0);
    escribirUint16(central, 36, 0);
    escribirUint32(central, 38, 0);
    escribirUint32(central, 42, offset);
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
  escribirUint32(fin, 0, 0x06054b50);
  escribirUint16(fin, 4, 0);
  escribirUint16(fin, 6, 0);
  escribirUint16(fin, 8, archivos.length);
  escribirUint16(fin, 10, archivos.length);
  escribirUint32(fin, 12, offset - inicioCentral);
  escribirUint32(fin, 16, inicioCentral);
  escribirUint16(fin, 20, 0);
  partes.push(fin);
  offset += fin.length;

  return unirBytes(partes, offset);
}

function crearDocxDesdeHtml(html) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
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
</Relationships>`
    },
    {
      nombre: "word/afchunk.html",
      contenido: `\ufeff${html}`
    }
  ];

  return new Blob([crearZipSinCompresion(archivos)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function descargarInterconsultaPaciente() {
  aplicarPermisosFormatosPaciente();
  const datos = datosInterconsultaFormulario();

  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alertaFormatoNoAutorizado();
    return;
  }
  const html = await htmlInterconsultaWord(datos);
  const blob = crearDocxDesdeHtml(html);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Interconsulta_${datos.formato}_${(datos.pacienteNombre || "paciente").replace(/\s+/g, "_")}_${datos.fecha}.docx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

window.abrirNota = function() {
  window.location.href = "nota.html?id=" + uidPaciente;
};

window.abrirNotaPorVozPaciente = function() {
  if (!uidPaciente) {
    alert("Selecciona o recarga el expediente del paciente antes de abrir la nota por voz.");
    return;
  }
  const datos = datosPacienteActual || {};
  const institucional = datos.datosInstitucionales || {};
  const encounterId = datos.encounterId
    || datos.encuentroId
    || datos.atencionId
    || datos.encuentroActivoId
    || datos.atencionActualId
    || datos.ingresoActivoId
    || institucional.encounterId
    || institucional.encuentroId
    || institucional.atencionId
    || datos.ultimaConsulta
    || `paciente:${uidPaciente}`;
  const noteId = datos.notaActualId || datos.borradorNotaId || datos.notaId || "";
  const qs = new URLSearchParams({
    patientId: uidPaciente,
    id: uidPaciente,
    encounterId,
    returnUrl: `paciente.html?id=${encodeURIComponent(uidPaciente)}`
  });
  if (noteId) qs.set("noteId", noteId);
  qs.set("v", "20260719-mental-exam-v1");
  window.location.href = `nota-por-voz.html?${qs.toString()}`;
};

window.previsualizarMiSalud = function() {
  window.location.href = `mi-salud.html?paciente=${uidPaciente}&preview=1`;
};

window.solicitarEliminarPaciente = async function() {
  const confirmar = confirm(
    "Deseas suspender este paciente y solicitar eliminacin al administrador?"
  );

  if (!confirmar) return;

  try {
    await solicitarEliminacionPaciente(
      uidPaciente,
      auth.currentUser.uid,
      {
        pacienteNombre: datosPacienteActual?.nombre || "",
        usuarioUid: auth.currentUser.uid,
        usuarioEmail: auth.currentUser.email || medicoActualDatos.email || medicoActualDatos.correo || "",
        usuarioNombre: medicoActualDatos.nombre || auth.currentUser.displayName || auth.currentUser.email || "",
        usuarioRol: rolUsuarioActual,
        pagina: window.location.pathname,
        url: window.location.href,
        userAgent: navigator.userAgent || ""
      }
    );

    alert("Paciente suspendido. La solicitud de eliminacin ya aparece en Reportes del administrador.");

    window.location.href = "medico.html";
  } catch (error) {
    alert(error.message);
  }
};

window.abrirHistoriaClinica = function() {
  if (!uidPaciente) {
    alert("No se encontró el ID del paciente.");
    return;
  }

  window.location.href = `historia.html?id=${uidPaciente}`;
};

async function abrirSolicitudImagenologiaPaciente() {
  if (!uidPaciente || !datosPacienteActual) {
    alert("No se identificó el paciente seleccionado.");
    return;
  }
  if (!usuarioPuedeUsarFormato("solicitud_imagenologia", permisosFormatosUsuarioActual, rolUsuarioActual, medicoActualDatos)) {
    alert("Este formato requiere autorización institucional.");
    return;
  }
  if (!catalogoMedicosFirmasIndicacionesCache.length) {
    try {
      await cargarCatalogoMedicosFirmasIndicaciones();
    } catch (error) {
      console.error("No se pudo cargar el catálogo de médicos del Fray:", error);
    }
  }
  if (!solicitudImagenologiaModulePromise) {
    solicitudImagenologiaModulePromise = Promise.all([
      import("./components/solicitudImagenologia.js?v=20260730-img-request-v2"),
      import("./services/solicitudesImagenologia.js?v=20260728-img-request-v1")
    ]);
  }
  const [{ abrirSolicitudImagenologia }, { guardarSolicitudImagenologia }] = await solicitudImagenologiaModulePromise;
  solicitudImagenologiaActiva = abrirSolicitudImagenologia({
    paciente: datosPacienteActual,
    medico: { ...medicoActualDatos, uid: auth.currentUser?.uid || "" },
    uidPaciente,
    catalogoMedicos: catalogoMedicosFirmasIndicacionesCache,
    servicio: datosPacienteActual.servicioInstitucional || datosPacienteActual.servicio || medicoActualDatos.servicio || "",
    onPersist: async (solicitud, definitiva) => {
      const resultado = await guardarSolicitudImagenologia(uidPaciente, solicitud, { definitiva, usuario: medicoActualDatos });
      await registrarAccionExpediente({
        accion: definitiva ? "generar_solicitud_imagenologia" : "guardar_borrador_solicitud_imagenologia",
        descripcion: definitiva ? "Se generó una solicitud institucional de imagenología." : "Se guardó un borrador de solicitud de imagenología.",
        detalles: { solicitudId: resultado.solicitudId, estudios: solicitud.estudios?.length || 0, estado: resultado.estado }
      });
      if (definitiva) await cargarEstudiosPaciente();
      return resultado;
    }
  });
}

window.abrirLineaTiempoPaciente = function() {
  if (!auth.currentUser || !uidPaciente) {
    alert("No se encontró el paciente o la sesión actual.");
    return;
  }
  window.location.href = `linea-tiempo.html?pacienteId=${encodeURIComponent(uidPaciente)}`;
};

function datosFormularioTratamiento() {
  sincronizarCapturaFarmacologica();
  sincronizarCamposTratamientoDesdeTomas();
  actualizarDosisTotalDiaTratamiento();
  const tomas = leerTomasTratamiento();
  const cambio = obtenerCambioTratamientoDesdeFormulario();
  const datos = {
    medicamento: valorCampo("tratamientoMedicamento"),
    medicamentoId: medicamentoSeleccionadoTratamiento()?.id || "",
    genericName: medicamentoSeleccionadoTratamiento()?.genericName || "",
    principiosActivos: medicamentoSeleccionadoTratamiento()?.principiosActivos || [],
    presentacion: valorCampo("tratamientoPresentacion"),
    dosis: valorCampo("tratamientoDosis"),
    frecuencia: normalizarTextoFrecuenciaTratamiento(valorCampo("tratamientoFrecuencia")),
    modoFrecuencia: valorCampo("tratamientoModoFrecuencia") || "horas_especificas",
    vecesDia: valorCampo("tratamientoVecesDia") || String(tomas.length || numeroTomasTratamiento()),
    tomas,
    via: valorCampo("tratamientoVia"),
    horarios: valorCampo("tratamientoHorarios"),
    cantidadTotalDia: valorCampo("cantidadTotalDia"),
    dosisTotalDia: valorCampo("tratamientoDosisTotalDia"),
    fechaInicio: valorCampo("tratamientoFechaInicio"),
    estado: valorCampo("tratamientoEstado") || "activo",
    fechaSuspension: valorCampo("tratamientoFechaSuspension"),
    motivoSuspension: valorCampo("tratamientoMotivoSuspension"),
    observaciones: valorCampo("tratamientoObservaciones"),
    duracion: valorCampo("tratamientoDuracion") === "otro"
      ? valorCampo("tratamientoDuracionOtra")
      : valorCampo("tratamientoDuracion"),
    modoHorario: valorCampo("tratamientoModoHorario") || "horas",
    momentosDia: [...document.querySelectorAll("[data-momento-dia]:checked")].map((elemento) => elemento.value),
    creadoPor: auth.currentUser?.uid || "",
    _auditoria: {
      usuarioUid: auth.currentUser?.uid || "",
      usuarioNombre: medicoActualDatos?.nombre || auth.currentUser?.email || "",
      usuarioRol: rolUsuarioActual || medicoActualDatos?.rol || ""
    }
  };

  if (cambio.cambioIndicacion) {
    datos.cambioIndicacion = cambio.cambioIndicacion;
    datos.cambioIndicacionTexto = cambio.cambioIndicacionTexto || "";
  } else {
    datos.cambioIndicacion = "";
    datos.cambioIndicacionTexto = "";
  }

  if (datos.cambioIndicacion === "se_suspende") {
    datos.estado = "suspendido";
    if (!datos.fechaSuspension) datos.fechaSuspension = fechaISOHoy();
    if (!datos.motivoSuspension) datos.motivoSuspension = ETIQUETAS_CAMBIO_TRATAMIENTO.se_suspende;
  }

  return datos;
}

function normalizarTextoCambioTratamiento(valor = "") {
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, 160);
}

function obtenerCambioTratamientoDesdeFormulario(contenedor = document) {
  const selector = contenedor.querySelector("[data-cambio-tratamiento]");
  const valor = selector?.value?.trim() || "";
  if (!CAMBIOS_TRATAMIENTO_PERMITIDOS.has(valor) || !valor) return {};
  if (valor !== "otro") return { cambioIndicacion: valor };

  return {
    cambioIndicacion: "otro",
    cambioIndicacionTexto: normalizarTextoCambioTratamiento(
      contenedor.querySelector("[data-cambio-tratamiento-texto]")?.value || ""
    )
  };
}

function ponerErrorCambioTratamiento(mensaje = "") {
  const error = document.getElementById("tratamientoCambioIndicacionError");
  if (error) error.textContent = mensaje;
}

function validarCambioTratamiento(datos = {}) {
  ponerErrorCambioTratamiento("");
  const cambio = typeof datos.cambioIndicacion === "string" ? datos.cambioIndicacion : "";
  if (!CAMBIOS_TRATAMIENTO_PERMITIDOS.has(cambio)) {
    ponerErrorCambioTratamiento("Selecciona un cambio o estado valido.");
    return false;
  }
  if (cambio === "otro" && !normalizarTextoCambioTratamiento(datos.cambioIndicacionTexto || "")) {
    ponerErrorCambioTratamiento("Especifica el cambio o estado del medicamento.");
    return false;
  }
  return true;
}

function actualizarCampoCambioTratamiento() {
  const selector = document.getElementById("tratamientoCambioIndicacion");
  const wrap = document.getElementById("tratamientoCambioIndicacionOtroWrap");
  const texto = document.getElementById("tratamientoCambioIndicacionTexto");
  const mostrarOtro = selector?.value === "otro";
  if (wrap) wrap.hidden = !mostrarOtro;
  if (!mostrarOtro) ponerErrorCambioTratamiento("");
  if (mostrarOtro) texto?.focus();
}

function obtenerEtiquetaCambioTratamiento(tratamiento = {}) {
  const cambio = typeof tratamiento.cambioIndicacion === "string" ? tratamiento.cambioIndicacion : "";
  if (!CAMBIOS_TRATAMIENTO_PERMITIDOS.has(cambio) || !cambio) return "";
  if (cambio === "otro") return normalizarTextoCambioTratamiento(tratamiento.cambioIndicacionTexto || "");
  return ETIQUETAS_CAMBIO_TRATAMIENTO[cambio] || "";
}

function claseCambioTratamiento(tratamiento = {}) {
  const cambio = typeof tratamiento.cambioIndicacion === "string" ? tratamiento.cambioIndicacion : "";
  return CAMBIOS_TRATAMIENTO_PERMITIDOS.has(cambio) && cambio ? cambio : "sin_cambio";
}

function limpiarFormularioTratamiento() {
  [
    "tratamientoId",
    "tratamientoMedicamento",
    "tratamientoPresentacion",
    "tratamientoDosis",
    "tratamientoFrecuencia",
    "tratamientoFrecuenciaRapida",
    "tratamientoFrecuenciaOtra",
    "tratamientoModoFrecuencia",
    "tratamientoVecesDia",
    "tratamientoVia",
    "tratamientoHorarios",
    "cantidadTotalDia",
    "tratamientoDosisTotalDia",
    "tratamientoFechaInicio",
    "tratamientoFechaSuspension",
    "tratamientoMotivoSuspension",
    "tratamientoObservaciones",
    "tratamientoDuracion",
    "tratamientoDuracionOtra",
    "tratamientoCambioIndicacion",
    "tratamientoCambioIndicacionTexto"
  ].forEach((id) => ponerValor(id, ""));
  ponerErrorCambioTratamiento("");
  const campoCantidad = document.getElementById("cantidadTotalDia");
  if (campoCantidad) campoCantidad.dataset.auto = "";
  ponerValor("tratamientoEstado", "activo");
  ponerValor("tratamientoModoFrecuencia", "horas_especificas");
  ponerValor("tratamientoVecesDia", "");
  ponerValor("tratamientoFrecuencia", "");
  ponerValor("tratamientoModoHorario", "horas");
  const campoMedicamento = document.getElementById("tratamientoMedicamento");
  if (campoMedicamento) {
    delete campoMedicamento.dataset.catalogMedicationId;
    delete campoMedicamento.dataset.catalogMedicationText;
  }
  const frecuenciaOtra = document.getElementById("tratamientoFrecuenciaOtra");
  if (frecuenciaOtra) frecuenciaOtra.hidden = true;
  actualizarCampoCambioTratamiento();
  ponerValor("tratamientoDuracion", "30 días");
  document.querySelectorAll("[data-momento-dia]").forEach((elemento) => { elemento.checked = false; });
  actualizarCapturaFarmacologica();
  renderizarTomasTratamiento();
}

async function guardarTratamientoPaciente() {
  const datos = datosFormularioTratamiento();

  if (!datos.medicamento) {
    alert("Escribe el medicamento.");
    return;
  }
  if (!validarCambioTratamiento(datos)) return;
  if (datos.cambioIndicacion === "se_suspende") {
    const continuarSuspension = confirm("Esta indicacion marcara el medicamento como suspendido. El registro permanecera en el historial. Deseas continuar?");
    if (!continuarSuspension) return;
  }
  console.debug("[Tratamiento] Cambio de indicacion", {
    tratamientoId: valorCampo("tratamientoId") || null,
    medicamentoId: null,
    cambioIndicacion: datos.cambioIndicacion || "",
    tieneTextoPersonalizado: Boolean(datos.cambioIndicacionTexto)
  });

  const tratamientoId = valorCampo("tratamientoId");
  const medicamentosPrevios = tratamientosCache
    .filter((t) => esTratamientoVigente(t) && t.id !== tratamientoId)
    .map((t) => ({
      ...t,
      id: t.id || "",
      medicamento: t.medicamento || "",
      indicacion: formatearIndicacionTratamiento(t, false),
      dosisDia: t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || ""
    }));
  const medicamentosParaEvaluacion = datos.estado === "suspendido"
    ? medicamentosPrevios
    : [...medicamentosPrevios, { ...datos, medicamento: datos.medicamento, indicacion: formatearIndicacionTratamiento(datos, false), dosisDia: datos.dosisTotalDia }];
  const evaluacionNuevo = detectarAlertasClinicasMedicamentos(
    medicamentosParaEvaluacion,
    datosPacienteActual || {}
  );
  const alertasImportantes = (evaluacionNuevo.alertas || []).filter((alerta) => (alerta.prioridad || 0) >= 4);
  if (alertasImportantes.length) {
    const resumen = alertasImportantes
      .slice(0, 5)
      .map((alerta) => `- ${alerta.titulo}: ${alerta.efecto || alerta.recomendacion || ""}`)
      .join("\n");
    const continuar = confirm(`Se detectaron alertas clnicas relevantes antes de guardar:\n\n${resumen}\n\nDeseas guardar de todos modos con revisin clnica documentada?`);
    if (!continuar) return;
  }

  if (modoNuevoPacienteDraft()) {
    const ahora = new Date().toISOString();
    const tratamientoDraft = {
      ...normalizarTratamientoFrecuenciaPaciente(datos),
      id: tratamientoId || `draft-tratamiento-${Date.now()}`,
      creadoPorRol: datos._auditoria?.usuarioRol || "",
      creadoPorNombre: datos._auditoria?.usuarioNombre || "",
      modificadoPor: datos._auditoria?.usuarioUid || "",
      modificadoPorRol: datos._auditoria?.usuarioRol || "",
      modificadoPorNombre: datos._auditoria?.usuarioNombre || "",
      fechaCreacion: datos.fechaCreacion || ahora,
      fechaActualizacion: ahora,
      historialCambios: [
        ...(Array.isArray(datos.historialCambios) ? datos.historialCambios : []),
        {
          accion: tratamientoId ? "actualizar" : "crear",
          usuarioUid: datos._auditoria?.usuarioUid || "",
          usuarioNombre: datos._auditoria?.usuarioNombre || "",
          usuarioRol: datos._auditoria?.usuarioRol || "",
          fecha: ahora,
          hora: ahora
        }
      ]
    };
    delete tratamientoDraft._auditoria;
    const indice = tratamientosCache.findIndex((t) => t.id === tratamientoDraft.id);
    if (indice >= 0) {
      tratamientosCache[indice] = tratamientoDraft;
    } else {
      tratamientosCache.unshift(tratamientoDraft);
    }
    sincronizarDraftTratamientoResumen();
    limpiarFormularioTratamiento();
    await cargarTratamientosPaciente();
    renderizarMedicamentosIndicaciones();
    if (document.getElementById("seccionIndicaciones")?.style.display !== "none") {
      actualizarTextoIndicaciones();
    }
    alert("Tratamiento guardado en el borrador del paciente.");
    return;
  }

  if (tratamientoId) {
    await actualizarTratamiento(uidPaciente, tratamientoId, datos);
  } else {
    await crearTratamiento(uidPaciente, datos);
  }

  await registrarAccionExpediente({
    accion: tratamientoId ? "editar_tratamiento" : "crear_tratamiento",
    descripcion: tratamientoId
      ? "El mdico edit un tratamiento del expediente."
      : "El mdico cre un tratamiento en el expediente.",
    detalles: {
      tratamientoId,
      medicamento: datos.medicamento,
      estado: datos.estado
    }
  });

  limpiarFormularioTratamiento();
  await cargarTratamientosPaciente();
  await sincronizarResumenTratamiento();
  renderizarMedicamentosIndicaciones();
  if (document.getElementById("seccionIndicaciones")?.style.display !== "none") {
    actualizarTextoIndicaciones();
  }
  alert("Tratamiento guardado.");
}

async function cargarTratamientosPaciente() {
  const activos = document.getElementById("tratamientosActivos");
  const suspendidos = document.getElementById("tratamientosSuspendidos");
  if (!activos || !suspendidos) return;
  if (modoNuevoPacienteDraft()) {
    await asegurarTratamientosCache();
    const listaActivos = tratamientosCache.filter(esTratamientoVigente);
    const listaSuspendidos = tratamientosCache.filter((t) => t.estado === "suspendido");
    activos.innerHTML = listaActivos.length
      ? listaActivos.map(renderizarTratamiento).join("")
      : "<p>An no hay tratamientos activos.</p>";
    suspendidos.innerHTML = listaSuspendidos.length
      ? listaSuspendidos.map(renderizarTratamiento).join("")
      : "<p>No hay tratamientos suspendidos.</p>";
    vincularAccionesTratamientos();
    return;
  }

  const patientIdAlIniciar = String(uidPaciente || "").trim();
  if (!patientIdAlIniciar) return;
  const token = ++tratamientosCargaToken;

  activos.textContent = "Cargando tratamientos...";
  suspendidos.textContent = "Cargando tratamientos...";

  try {
    const tratamientos = await listarTratamientos(patientIdAlIniciar);
    if (token !== tratamientosCargaToken || patientIdAlIniciar !== String(uidPaciente || "").trim()) return;
    tratamientosCache = (Array.isArray(tratamientos) ? tratamientos : []).map(normalizarTratamientoFrecuenciaPaciente);
    tratamientosCachePatientId = patientIdAlIniciar;
    tratamientosCacheCargado = true;
    const listaActivos = tratamientosCache.filter(esTratamientoVigente);
    const listaSuspendidos = tratamientosCache.filter((t) => t.estado === "suspendido");

    activos.innerHTML = listaActivos.length
      ? listaActivos.map(renderizarTratamiento).join("")
      : "<p>An no hay tratamientos activos.</p>";

    suspendidos.innerHTML = listaSuspendidos.length
      ? listaSuspendidos.map(renderizarTratamiento).join("")
      : "<p>No hay tratamientos suspendidos.</p>";

    vincularAccionesTratamientos();
  } catch (error) {
    if (token === tratamientosCargaToken && patientIdAlIniciar === String(uidPaciente || "").trim()) {
      tratamientosCache = [];
      tratamientosCachePatientId = patientIdAlIniciar;
      tratamientosCacheCargado = false;
    }
    console.error("Error al cargar tratamientos:", error);
    activos.textContent = "No se pudieron cargar los tratamientos.";
    suspendidos.textContent = "No se pudieron cargar los tratamientos.";
  }
}

function renderizarTratamiento(t) {
  const tratamiento = normalizarTratamientoFrecuenciaPaciente(t);
  const indicacion = formatearIndicacionTratamiento(tratamiento, false);
  const dosisTotalDia = tratamiento.dosisTotalDia || calcularDosisTotalDiaTratamiento(tratamiento).texto || "";
  const indicador = indicadorSeguridadTratamiento(tratamiento);
  const alertaHTML = indicador.estado !== "sin_alertas"
    ? `<button type="button" class="med-alerta-badge med-alerta-${escaparHTML(indicador.clase)}" title="${escaparHTML(indicador.etiqueta)}" data-ver-interacciones>? ${escaparHTML(indicador.etiqueta)}</button>`
    : "";
  const fechaSuspension = t.fechaSuspension || t["fechaSuspensi?n"] || "";
  const motivoSuspension = t.motivoSuspension || t["motivoSuspensi?n"] || "";
  const cambioIndicacion = obtenerEtiquetaCambioTratamiento(tratamiento);
  const cambioHTML = cambioIndicacion
    ? `<p class="tratamiento-cambio-badge tratamiento-cambio-${escaparHTML(claseCambioTratamiento(tratamiento))}">${escaparHTML(cambioIndicacion)}</p>`
    : "";
  return `
    <article class="registro-card">
      <div class="registro-top">
        <div>
          <strong>${escaparHTML(tratamiento.medicamento || "Medicamento")} ${alertaHTML}</strong>
          <span>${escaparHTML(indicacion || "Sin indicacion completa")}</span>
        </div>
        <span class="estado-badge ${tratamiento.estado === "suspendido" ? "suspendido" : "activo"}">${escaparHTML(tratamiento.estado || "activo")}</span>
      </div>
      <p><b>Inicio:</b> ${escaparHTML(formatearFecha(tratamiento.fechaInicio) || "Sin fecha")}</p>
      ${dosisTotalDia ? `<p><b>Dosis total al día:</b> ${escaparHTML(dosisTotalDia)}</p>` : ""}
      ${tratamiento.estado === "suspendido" ? `<p><b>Suspensión:</b> ${escaparHTML(formatearFecha(fechaSuspension))}  ${escaparHTML(motivoSuspension || "Sin motivo registrado")}</p>` : ""}
      ${tratamiento.observaciones ? `<p>${escaparHTML(tratamiento.observaciones)}</p>` : ""}
      ${cambioHTML}
      ${tratamiento.modificadoPorRol || tratamiento.creadoPorRol ? `<p class="texto-suave"><b>última modificacin:</b> ${escaparHTML(tratamiento.modificadoPorNombre || tratamiento.creadoPorNombre || "Usuario")}  ${escaparHTML(tratamiento.modificadoPorRol || tratamiento.creadoPorRol || "")}  ${escaparHTML(formatearFecha(tratamiento.fechaActualizacion) || "")}</p>` : ""}
      <div class="registro-actions">
        <button type="button" data-editar-tratamiento="${t.id}">Editar</button>
        <button type="button" class="boton-peligro" data-eliminar-tratamiento="${t.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function indicadorSeguridadTratamiento(tratamiento) {
  const medicamentos = tratamientosActivosParaInteracciones();
  const existe = medicamentos.some((med) => med.id === tratamiento.id);
  const lista = existe
    ? medicamentos
    : [...medicamentos, {
      ...tratamiento,
      id: tratamiento.id || "",
      medicamento: tratamiento.medicamento || "",
      indicacion: formatearIndicacionTratamiento(tratamiento, false),
      dosisDia: tratamiento.dosisTotalDia || calcularDosisTotalDiaTratamiento(tratamiento).texto || ""
    }];
  const evaluacion = detectarAlertasClinicasMedicamentos(lista, datosPacienteActual || {});
  const nombre = (tratamiento.medicamento || "").toLowerCase();
  const alertasRelacionadas = (evaluacion.alertas || []).filter((alerta) =>
    !alerta.medicamentos?.length || alerta.medicamentos.some((med) => String(med || "").toLowerCase().includes(nombre) || nombre.includes(String(med || "").toLowerCase()))
  );
  return alertasRelacionadas.length ? evaluacion.indicador : { estado: "sin_alertas", etiqueta: "Sin alerta encontrada con la base actual", clase: "ok" };
}

function vincularAccionesTratamientos() {
  document.querySelectorAll("[data-editar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => editarTratamientoPaciente(boton.dataset.editarTratamiento));
  });

  document.querySelectorAll("[data-eliminar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarTratamientoPaciente(boton.dataset.eliminarTratamiento));
  });

  document.querySelectorAll("[data-ver-interacciones]").forEach((boton) => {
    boton.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      abrirInteraccionesFarmacologicas("tratamiento");
    });
  });
}

function editarTratamientoPaciente(id) {
  const t = tratamientosCache.find((item) => item.id === id);
  if (!t) return;

  ponerValor("tratamientoId", t.id);
  ponerValor("tratamientoMedicamento", t.medicamento);
  const medicamentoEditado = resolverMedicamentoEditor(t.medicamento);
  const campoMedicamento = document.getElementById("tratamientoMedicamento");
  if (campoMedicamento) campoMedicamento.dataset.catalogMedicationId = t.catalogMedicationId || medicamentoEditado?.id || "";
  if (campoMedicamento) campoMedicamento.dataset.catalogMedicationText = t.medicamento || "";
  ponerValor("tratamientoPresentacion", t.presentacion || "");
  ponerValor("tratamientoDosis", t.dosis);
  ponerValor("tratamientoFrecuencia", normalizarTextoFrecuenciaTratamiento(t.frecuencia));
  ponerValor("tratamientoModoFrecuencia", t.modoFrecuencia || "horas_especificas");
  const tomasGuardadas = Array.isArray(t.tomas) ? t.tomas.length : 0;
  ponerValor("tratamientoVecesDia", t.vecesDia || String(tomasGuardadas || obtenerVecesPorDia(t.frecuencia || "") || 1));
  ponerValor("tratamientoVia", t.via);
  ponerValor("tratamientoHorarios", t.horarios);
  ponerValor("cantidadTotalDia", t.cantidadTotalDia);
  ponerValor("tratamientoDosisTotalDia", t.dosisTotalDia);
  const campoCantidad = document.getElementById("cantidadTotalDia");
  if (campoCantidad) campoCantidad.dataset.auto = "false";
  ponerValor("tratamientoFechaInicio", t.fechaInicio);
  ponerValor("tratamientoEstado", t.estado || "activo");
  ponerValor("tratamientoFechaSuspension", t.fechaSuspension || t["fechaSuspensi?n"] || "");
  ponerValor("tratamientoMotivoSuspension", t.motivoSuspension || t["motivoSuspensi?n"] || "");
  ponerValor("tratamientoObservaciones", t.observaciones);
  ponerValor("tratamientoDuracion", t.duracion || "");
  ponerValor("tratamientoDuracionOtra", t.duracion && !["7 días", "14 días", "21 días", "30 días", "60 días", "90 días", "Indefinido"].includes(t.duracion) ? t.duracion : "");
  ponerValor("tratamientoModoHorario", t.modoHorario || "horas");
  document.querySelectorAll("[data-momento-dia]").forEach((elemento) => { elemento.checked = (t.momentosDia || []).includes(elemento.value); });
  actualizarCapturaFarmacologica();
  ponerValor("tratamientoCambioIndicacion", CAMBIOS_TRATAMIENTO_PERMITIDOS.has(t.cambioIndicacion || "") ? (t.cambioIndicacion || "") : "");
  ponerValor("tratamientoCambioIndicacionTexto", normalizarTextoCambioTratamiento(t.cambioIndicacionTexto || ""));
  actualizarCampoCambioTratamiento();
  renderizarTomasTratamiento(tomasDesdeTratamientoGuardado(t));
}

async function eliminarTratamientoPaciente(id) {
  if (!confirm("Eliminar este tratamiento del expediente?")) return;
  const tratamiento = tratamientosCache.find((item) => item.id === id);
  if (modoNuevoPacienteDraft()) {
    tratamientosCache = tratamientosCache.filter((item) => item.id !== id);
    sincronizarDraftTratamientoResumen();
    await cargarTratamientosPaciente();
    renderizarMedicamentosIndicaciones();
    if (document.getElementById("seccionIndicaciones")?.style.display !== "none") {
      actualizarTextoIndicaciones();
    }
    return;
  }
  await eliminarTratamiento(uidPaciente, id);
  await registrarAccionExpediente({
    accion: "eliminar_tratamiento",
    descripcion: "El mdico elimin un tratamiento del expediente.",
    detalles: {
      tratamientoId: id,
      medicamento: tratamiento?.medicamento || ""
    }
  });
  await cargarTratamientosPaciente();
  await sincronizarResumenTratamiento();
  renderizarMedicamentosIndicaciones();
  if (document.getElementById("seccionIndicaciones")?.style.display !== "none") {
    actualizarTextoIndicaciones();
  }
}

async function sincronizarResumenTratamiento() {
  const activos = tratamientosCache.filter(esTratamientoVigente);
  const resumen = activos.map((t) =>
    formatearIndicacionTratamientoConCambio(t, true)
  ).filter(Boolean).join("\n");

  if (modoNuevoPacienteDraft()) {
    sincronizarDraftTratamientoResumen();
    const tratamiento = document.getElementById("tratamiento");
    if (tratamiento) tratamiento.innerText = resumen || "Sin tratamiento registrado";
    return;
  }

  await actualizarUsuario(uidPaciente, {
    tratamiento: resumen,
    datosClinicosResumen: {
      ...(datosPacienteActual?.datosClinicosResumen || {}),
      tratamientoActivo: resumen,
      tratamientosActivos: activos,
      medicamentosDosisDia: activos.map((t) => ({
        medicamento: t.medicamento || "",
        dosisDia: t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || "",
        cantidadTotalDia: t.cantidadTotalDia || ""
      })),
      fechaActualizacionTratamiento: new Date().toISOString()
    }
  });

  const tratamiento = document.getElementById("tratamiento");
  if (tratamiento) tratamiento.innerText = resumen || "Sin tratamiento registrado";
}

function numeroDesdeTexto(valor = "") {
  const texto = String(valor || "").trim().replace(",", ".");
  const fraccion = texto.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraccion) {
    const numerador = Number(fraccion[1]);
    const denominador = Number(fraccion[2]);
    return denominador ? numerador / denominador : 0;
  }

  const numero = texto.match(/\d+(?:\.\d+)?/);
  return numero ? Number(numero[0]) : 0;
}

function obtenerVecesPorDia(frecuencia = "") {
  const texto = String(frecuencia || "").toLowerCase();
  const numero = numeroDesdeTexto(texto);
  if (numero > 0) return numero;
  if (texto.includes("cada 24")) return 1;
  if (texto.includes("cada 12")) return 2;
  if (texto.includes("cada 8")) return 3;
  if (texto.includes("cada 6")) return 4;
  return 0;
}

function extraerPresentacionMedicamento(medicamento = "") {
  const match = String(medicamento || "").match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|\u00b5g|g|ml|ui|u)\b/i);
  if (!match) return null;
  return {
    valor: Number(match[1].replace(",", ".")),
    unidad: match[2].replace("\u00b5g", "mcg")
  };
}

function unidadDosisDesdePresentacion(medicamento = "") {
  const texto = normalizarTextoBusqueda(medicamento);
  if (!texto) return { singular: "unidad", plural: "unidades" };

  if (/\bgota(s)?\b/.test(texto)) return { singular: "gota", plural: "gotas" };
  if (/\bcapsula(s)?\b|\bcaps\b/.test(texto)) return { singular: "capsula", plural: "capsulas" };
  if (/\btableta(s)?\b|\btab(s)?\b|\bcomprimido(s)?\b/.test(texto)) return { singular: "tableta", plural: "tabletas" };
  if (/\bampolleta(s)?\b|\bampula(s)?\b|\bfrasco ampula\b/.test(texto)) return { singular: "ampolleta", plural: "ampolletas" };
  if (/\bparche(s)?\b/.test(texto)) return { singular: "parche", plural: "parches" };
  if (/\bsolucion\b|\bsuspension\b|\bjarabe\b|\bmg\/ml\b|\bmg\/5 ml\b/.test(texto)) return { singular: "ml", plural: "ml" };

  return { singular: "unidad", plural: "unidades" };
}

function esCantidadSimple(valor = "") {
  return /^\s*\d+(?:[.,]\d+)?\s*$/.test(valor) || /^\s*\d+\s*\/\s*\d+\s*$/.test(valor);
}

function cantidadNumericaSimple(valor = "") {
  return numeroDesdeTexto(String(valor || "").replace(/\s*a\s+las\s+\d{1,2}:\d{2}.*/i, ""));
}

function formatearCantidadConPresentacion(cantidad = "", medicamento = "") {
  const limpio = String(cantidad || "").trim();
  if (!limpio || !esCantidadSimple(limpio)) return limpio;

  const numero = cantidadNumericaSimple(limpio);
  const unidad = unidadDosisDesdePresentacion(medicamento);
  const etiqueta = numero > 0 && numero <= 1 ? unidad.singular : unidad.plural;
  return `${limpio} ${etiqueta}`;
}

function extraerCantidadesDosis(dosis = "") {
  const texto = String(dosis || "");
  const conUnidad = [...texto.matchAll(/(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:tabletas?|tabs?|comprimidos?|capsulas?|caps?|gotas?|ampolletas?|ml|mg|mg\.|capsula|tableta|unidades?)\b/gi)]
    .map((match) => numeroDesdeTexto(match[1]));
  if (conUnidad.length) return conUnidad.filter((valor) => valor > 0);

  return texto
    .split(/[,;]/)
    .map((parte) => parte.replace(/\s*a\s+las\s+\d{1,2}:\d{2}.*/i, "").trim())
    .filter(esCantidadSimple)
    .map(cantidadNumericaSimple)
    .filter((valor) => valor > 0);
}

const HORARIOS_TRATAMIENTO_DEFAULT = ["08:00", "15:00", "22:00", "22:00"];

function numeroTomasTratamiento() {
  const modo = valorCampo("tratamientoModoFrecuencia");
  if (modo === "cada_8_horas" || modo === "manana_tarde_noche") return 3;
  if (modo === "cada_12_horas") return 2;
  const frecuencia = valorCampo("tratamientoFrecuencia");
  const vecesDia = Number(valorCampo("tratamientoVecesDia")) || obtenerVecesPorDia(frecuencia);
  if (!frecuencia && !vecesDia) return 0;
  return Math.max(1, vecesDia || 1);
}

function horariosPorModoTratamiento(modo, total) {
  if (modo === "cada_8_horas") return ["08:00", "16:00", "00:00"].slice(0, total);
  if (modo === "cada_12_horas") return ["08:00", "20:00"].slice(0, total);
  if (modo === "manana_tarde_noche") return ["08:00", "15:00", "22:00"].slice(0, total);
  return HORARIOS_TRATAMIENTO_DEFAULT.slice(0, total);
}

function etiquetaFrecuenciaTratamiento(modo, total) {
  if (modo === "cada_8_horas") return "cada 8 horas";
  if (modo === "cada_12_horas") return "cada 12 horas";
  if (modo === "manana_tarde_noche") return "mañana, tarde y noche";
  return `${total} vez${total === 1 ? "" : "es"} al día`;
}

function leerTomasTratamiento() {
  return [...document.querySelectorAll("[data-toma-tratamiento]")]
    .map((row) => ({
      cantidad: row.querySelector("[data-toma-cantidad]")?.value?.trim() || "",
      horario: row.querySelector("[data-toma-horario]")?.value?.trim() || ""
    }))
    .filter((toma) => toma.cantidad || toma.horario);
}

function sincronizarCamposTratamientoDesdeTomas() {
  const tomas = leerTomasTratamiento();
  const modo = valorCampo("tratamientoModoFrecuencia") || "horas_especificas";
  const total = Math.max(tomas.length, numeroTomasTratamiento());
  if (!total) {
    ponerValor("tratamientoFrecuencia", "");
    ponerValor("tratamientoDosis", "");
    ponerValor("tratamientoHorarios", "");
    return;
  }
  const frecuencia = etiquetaFrecuenciaTratamiento(modo, total);
  const dosis = tomas
    .map((toma) => [
      formatearCantidadConPresentacion(toma.cantidad, valorCampo("tratamientoMedicamento")),
      toma.horario ? `a las ${toma.horario}` : ""
    ].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  ponerValor("tratamientoFrecuencia", normalizarTextoFrecuenciaTratamiento(frecuencia));
  ponerValor("tratamientoDosis", dosis);
  ponerValor("tratamientoHorarios", tomas.map((toma) => toma.horario).filter(Boolean).join(", "));
}

function renderizarTomasTratamiento(tomasIniciales = null) {
  const contenedor = document.getElementById("contenedorTomasTratamiento");
  if (!contenedor) return;

  const modo = valorCampo("tratamientoModoFrecuencia") || "horas_especificas";
  const total = numeroTomasTratamiento();
  const horarios = horariosPorModoTratamiento(modo, total);
  const tomasActuales = Array.isArray(tomasIniciales) && tomasIniciales.length
    ? tomasIniciales
    : leerTomasTratamiento();

  contenedor.innerHTML = Array.from({ length: total }, (_, index) => {
    const toma = tomasActuales[index] || {};
    const cantidad = toma.cantidad || (index === 0 ? "1" : "");
    const horario = toma.horario || horarios[index] || "";
    return `
      <div class="tratamiento-toma-row" data-toma-tratamiento>
        <label><span>Dosis ${index + 1}</span><input data-toma-cantidad placeholder="Ej. 1" value="${escaparHTML(cantidad)}"></label>
        <label><span>Horario</span><input data-toma-horario list="catalogoHorariosTratamiento" placeholder="08:00" value="${escaparHTML(horario)}"></label>
      </div>
    `;
  }).join("");

  contenedor.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      sincronizarCamposTratamientoDesdeTomas();
      actualizarDosisTotalDiaTratamiento();
    });
    input.addEventListener("change", () => {
      sincronizarCamposTratamientoDesdeTomas();
      actualizarDosisTotalDiaTratamiento();
    });
  });

  sincronizarCamposTratamientoDesdeTomas();
  actualizarDosisTotalDiaTratamiento();
}

function tomasDesdeTratamientoGuardado(t = {}) {
  if (Array.isArray(t.tomas) && t.tomas.length) return t.tomas;
  const dosis = String(t.dosis || "");
  const horarios = String(t.horarios || "")
    .split(/[,;]/)
    .map((h) => h.trim())
    .filter(Boolean);
  const partesDosis = dosis
    .split(/,(?=\s*\d|\s*[a-z])/i)
    .map((p) => p.trim())
    .filter(Boolean);

  return horarios.map((horario, index) => ({
    cantidad: (partesDosis[index] || partesDosis[0] || "").replace(/\s*a\s+las\s+\d{1,2}:\d{2}.*/i, "").trim(),
    horario
  }));
}

function calcularDosisTotalDiaTratamiento(t = {}) {
  const presentacion = extraerPresentacionMedicamento(t.medicamento || "");
  const dosisFuente = Array.isArray(t.tomas) && t.tomas.length
    ? t.tomas.map((toma) => toma.cantidad).join(", ")
    : t.dosis || "";
  const cantidades = extraerCantidadesDosis(dosisFuente);
  const veces = obtenerVecesPorDia(t.frecuencia || "");
  const cantidadManual = Number(String(t.cantidadTotalDia || "").replace(",", "."));

  let cantidadTotal = Number.isFinite(cantidadManual) && cantidadManual > 0 ? cantidadManual : 0;

  if (!cantidadTotal && cantidades.length > 1) {
    cantidadTotal = cantidades.reduce((total, valor) => total + valor, 0);
  } else if (!cantidadTotal && cantidades.length === 1 && veces > 0) {
    cantidadTotal = cantidades[0] * veces;
  } else if (!cantidadTotal && cantidades.length === 1) {
    cantidadTotal = cantidades[0];
  } else if (!cantidadTotal && veces > 0) {
    cantidadTotal = veces;
  }

  if (!cantidadTotal) return { cantidadTotal: "", texto: "" };

  if (presentacion?.valor) {
    const total = cantidadTotal * presentacion.valor;
    const totalRedondeado = Number.isInteger(total) ? total : Number(total.toFixed(2));
    return {
      cantidadTotal,
      texto: `${totalRedondeado} ${presentacion.unidad}/día`
    };
  }

  return {
    cantidadTotal,
    texto: `${cantidadTotal} unidad${cantidadTotal === 1 ? "" : "es"}/día`
  };
}

function actualizarDosisTotalDiaTratamiento(evento = null) {
  const campoCantidad = document.getElementById("cantidadTotalDia");

  if (evento?.target?.id === "cantidadTotalDia" && campoCantidad) {
    campoCantidad.dataset.auto = "false";
  } else if (campoCantidad?.dataset.auto === "true") {
    ponerValor("cantidadTotalDia", "");
  }

  const calculo = calcularDosisTotalDiaTratamiento({
    medicamento: valorCampo("tratamientoMedicamento"),
    dosis: valorCampo("tratamientoDosis"),
    frecuencia: valorCampo("tratamientoFrecuencia"),
    cantidadTotalDia: valorCampo("cantidadTotalDia")
  });

  if (!valorCampo("cantidadTotalDia") && calculo.cantidadTotal) {
    ponerValor("cantidadTotalDia", calculo.cantidadTotal);
    if (campoCantidad) campoCantidad.dataset.auto = "true";
  }

  ponerValor("tratamientoDosisTotalDia", calculo.texto);
}

function corregirCampoFrecuenciaTratamiento() {
  const actual = valorCampo("tratamientoFrecuencia");
  const normalizado = normalizarTextoFrecuenciaTratamiento(actual);
  if (actual !== normalizado) ponerValor("tratamientoFrecuencia", normalizado);
}

function configurarMenuFrecuenciaTratamiento() {
  const input = document.getElementById("tratamientoFrecuencia");
  const boton = document.getElementById("abrirOpcionesFrecuenciaTratamiento");
  const menu = document.getElementById("opcionesFrecuenciaTratamientoMenu");
  if (!input || !menu) return;

  const abrir = () => {
    menu.classList.add("abierto");
    input.setAttribute("aria-expanded", "true");
  };
  const cerrar = () => {
    menu.classList.remove("abierto");
    input.setAttribute("aria-expanded", "false");
  };

  input.addEventListener("focus", abrir);
  input.addEventListener("click", abrir);
  boton?.addEventListener("click", (evento) => {
    evento.preventDefault();
    input.focus();
    abrir();
  });

  menu.querySelectorAll("[data-frecuencia-tratamiento]").forEach((opcion) => {
    opcion.addEventListener("mousedown", (evento) => evento.preventDefault());
    opcion.addEventListener("click", () => {
      const valor = normalizarTextoFrecuenciaTratamiento(opcion.dataset.frecuenciaTratamiento || "");
      ponerValor("tratamientoFrecuencia", valor);
      const veces = obtenerVecesPorDia(valor);
      if (veces) ponerValor("tratamientoVecesDia", String(veces));
      actualizarDosisTotalDiaTratamiento();
      renderizarTomasTratamiento();
      cerrar();
    });
  });

  document.addEventListener("click", (evento) => {
    const objetivo = evento.target instanceof Element ? evento.target : null;
    if (objetivo?.closest(".tratamiento-frecuencia-combo")) return;
    cerrar();
  });

  input.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cerrar();
    if (evento.key === "ArrowDown") {
      abrir();
      menu.querySelector("button")?.focus();
    }
  });
}

function limpiarPuntoFinal(texto = "") {
  return String(texto).trim().replace(/[.\s]+$/, "");
}

function normalizarTextoFrecuenciaTratamiento(texto = "") {
  return normalizarTextoFrecuencia(texto);
}

function normalizarTratamientoFrecuenciaPaciente(tratamiento = {}) {
  return {
    ...tratamiento,
    frecuencia: normalizarTextoFrecuenciaTratamiento(tratamiento.frecuencia)
  };
}

function asegurarPunto(texto = "") {
  const limpio = String(texto).trim();
  if (!limpio) return "";
  return /[.!?]$/.test(limpio) ? limpio : `${limpio}.`;
}

function formatearHorariosTratamiento(horarios = "") {
  const limpio = String(horarios).trim();
  if (!limpio) return "";

  if (/^(a\s+las|alrededor\s+de|por\s+la|en\s+la)/i.test(limpio)) {
    return limpio;
  }

  const multiples = limpio
    .split(/[,;]/)
    .map((h) => h.trim())
    .filter(Boolean);

  if (multiples.length > 1) {
    return `a las ${multiples.join(", ")}`;
  }

  return `a las ${limpio}`;
}

function formatearIndicacionTratamiento(t = {}, incluirMedicamento = true) {
  const medicamento = incluirMedicamento ? asegurarPunto(t.medicamento || "") : "";
  const via = limpiarPuntoFinal(t.via || "");
  const frecuencia = limpiarPuntoFinal(normalizarTextoFrecuenciaTratamiento(t.frecuencia || ""));
  const dosisTomas = Array.isArray(t.tomas) && t.tomas.length
    ? t.tomas
      .map((toma) => [
        limpiarPuntoFinal(formatearCantidadConPresentacion(toma.cantidad || "", t.medicamento || "")),
        toma.horario ? `a las ${limpiarPuntoFinal(toma.horario)}` : ""
      ].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(", ")
    : "";
  const dosis = limpiarPuntoFinal(dosisTomas || formatearCantidadConPresentacion(t.dosis || "", t.medicamento || "") || "");
  const horarios = formatearHorariosTratamiento(t.horarios || "");

  const tomar = [via, frecuencia].filter(Boolean).join(" ");
  const partes = [];

  if (medicamento) partes.push(medicamento);
  if (tomar) partes.push(asegurarPunto(`Tomar ${tomar}`));
  if (dosis) {
    partes.push(asegurarPunto(dosis));
  } else if (horarios) {
    partes.push(asegurarPunto(horarios));
  }

  if (!partes.length && !incluirMedicamento) {
    return [t.dosis, normalizarTextoFrecuenciaTratamiento(t.frecuencia), t.via, t.horarios].filter(Boolean).join("  ");
  }

  return partes.join(" ");
}

function formatearIndicacionTratamientoConCambio(t = {}, incluirMedicamento = true) {
  const base = formatearIndicacionTratamiento(t, incluirMedicamento);
  const cambio = obtenerEtiquetaCambioTratamiento(t);
  if (!cambio) return base;
  return [base, asegurarPunto(cambio)].filter(Boolean).join(" ");
}

configurarCatalogoMedicamentosTratamiento();
configurarCatalogoMedicamentosReceta();

const HUGO_WILSON_RECETA_FORMAT_ID = "hugo_wilson_receta";
const HUGO_WILSON_RECETA_LOGO_URL = new URL(
  "../assets/formatos-hugo-wilson/receta-emblema.png",
  import.meta.url
).href;

function fechaISOHoy() {
  return new Date().toISOString().slice(0, 10);
}

function obtenerNombrePacienteActual() {
  return obtenerNombrePacienteParaMostrar(datosPacienteActual || {}) || document.getElementById("nombrePaciente")?.textContent || "Paciente";
}

function datosRecetaActual() {
  const fecha = valorCampo("recetaFecha") || fechaISOHoy();
  return {
    formato: valorCampo("recetaFormato") || "cognicion",
    fecha,
    pacienteNombre: obtenerNombrePacienteActual(),
    edad: calcularEdad(obtenerFechaNacimiento(datosPacienteActual || {})),
    fechaNacimiento: obtenerFechaNacimiento(datosPacienteActual || {}),
    sexo: datosPacienteActual?.sexo || datosPacienteActual?.datosInstitucionales?.sexo || "",
    expediente: datosPacienteActual?.expedienteCognicion || datosPacienteActual?.datosInstitucionales?.expedienteCognicion || datosPacienteActual?.expediente || "",
    medico: medicoActualDatos?.nombre || datosPacienteActual?.medicoTratante || "Mdico tratante",
    cedula: medicoActualDatos?.cedula || medicoActualDatos?.cedulaProfesional || "",
    institucion: datosPacienteActual?.institucionPaciente || datosPacienteActual?.institucion || "",
    medicamentos: medicamentosRecetaActual,
    observaciones: valorCampo("recetaObservaciones"),
    vigencia: valorCampo("recetaVigencia")
  };
}

function renderizarMedicamentosReceta() {
  const contenedor = document.getElementById("listaMedicamentosReceta");
  if (!contenedor) return;

  contenedor.innerHTML = medicamentosRecetaActual.length
    ? medicamentosRecetaActual.map((medicamento, index) => `
      <article class="medicamento-receta-item">
        <div>
          <strong>${escaparHTML(medicamento.medicamento || "Medicamento")}</strong>
          <span>${escaparHTML(medicamento.indicacion || "Sin indicacion")}</span>
        </div>
        <button type="button" class="boton-peligro-suave" data-quitar-medicamento-receta="${index}">Quitar</button>
      </article>
    `).join("")
    : "<p>Sin medicamentos seleccionados.</p>";

  contenedor.querySelectorAll("[data-quitar-medicamento-receta]").forEach((boton) => {
    boton.addEventListener("click", () => {
      medicamentosRecetaActual.splice(Number(boton.dataset.quitarMedicamentoReceta), 1);
      renderizarMedicamentosReceta();
      actualizarPreviewReceta();
    });
  });
}

function htmlRecetaPreview(datos = datosRecetaActual()) {
  const medicamentos = datos.medicamentos?.length
    ? datos.medicamentos.map((item, index) => `
      <li>
        <strong>${escaparHTML(item.medicamento)}</strong>
        <span>${escaparHTML(item.indicacion || "")}</span>
      </li>
    `).join("")
    : "<li><span>Sin medicamentos seleccionados.</span></li>";

  const marca = datos.formato === HUGO_WILSON_RECETA_FORMAT_ID
    ? `<div class="receta-marca receta-marca--hugo-wilson"><img src="${HUGO_WILSON_RECETA_LOGO_URL}" alt="Dr. Hugo Wilson - Psiquiatria"></div>`
    : '<div class="receta-marca">COGNICION</div>';

  return `
    ${marca}
    <div class="receta-encabezado">
      <div>
        <h2>Receta medica</h2>
        <p>Tecnologia clinica para una medicina mas precisa, humana y basada en evidencia.</p>
      </div>
      <span>${escaparHTML(formatearFecha(datos.fecha) || datos.fecha)}</span>
    </div>

    <div class="receta-datos">
      <p><b>Paciente:</b> ${escaparHTML(datos.pacienteNombre)}</p>
      <p><b>Edad:</b> ${datos.edad !== "" ? escaparHTML(`${datos.edad} años`) : "No registrada"}</p>
      <p><b>Sexo:</b> ${escaparHTML(datos.sexo || "No registrado")}</p>
      <p><b>Expediente:</b> ${escaparHTML(datos.expediente || "No registrado")}</p>
    </div>

    <h3>Prescripcion</h3>
    <ol class="receta-medicamentos">${medicamentos}</ol>

    ${datos.observaciones ? `<h3>Observaciones</h3><p>${escaparHTML(datos.observaciones)}</p>` : ""}
    ${datos.vigencia ? `<p class="receta-vigencia">${escaparHTML(datos.vigencia)}</p>` : ""}

    <div class="receta-firma">
      <span></span>
      <strong>${escaparHTML(datos.medico)}</strong>
      <small>${datos.cedula ? `Ced. Prof. ${escaparHTML(datos.cedula)}` : "Cdula profesional"}</small>
    </div>
  `;
}

function actualizarPreviewReceta() {
  const preview = document.getElementById("recetaPreview");
  if (!preview) return;
  preview.innerHTML = htmlRecetaPreview();
}

function agregarMedicamentoReceta() {
  const medicamento = valorCampo("recetaMedicamentoCatalogo");
  const indicacion = valorCampo("recetaIndicacionManual");

  if (!medicamento && !indicacion) {
    alert("Escribe o selecciona un medicamento.");
    return;
  }

  medicamentosRecetaActual.push({
    medicamento: medicamento || "Medicamento no especificado",
    indicacion
  });

  ponerValor("recetaMedicamentoCatalogo", "");
  ponerValor("recetaIndicacionManual", "");
  renderizarMedicamentosReceta();
  actualizarPreviewReceta();
}

async function cargarTratamientoActivoEnReceta() {
  await asegurarTratamientosCache();
  const activos = tratamientosCache.filter(esTratamientoVigente);
  medicamentosRecetaActual = activos.map((t) => ({
    medicamento: t.medicamento || "Medicamento",
    indicacion: formatearIndicacionTratamientoConCambio(t, false)
  }));
  renderizarMedicamentosReceta();
  actualizarPreviewReceta();
}

async function guardarRecetaPaciente() {
  const datos = datosRecetaActual();
  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alert("No tienes autorizacion para usar este formato de receta.");
    return;
  }
  if (!datos.medicamentos.length) {
    alert("Agrega al menos un medicamento a la receta.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "recetas"), {
    ...datos,
    creadoPor: auth.currentUser?.uid || "",
    creadoEn: serverTimestamp()
  });

  await registrarAccionExpediente({
    accion: "crear_receta",
    descripcion: "El medico genero una receta medica.",
    detalles: {
      formato: datos.formato,
      medicamentos: datos.medicamentos.length
    }
  });

  alert("Receta guardada.");
}

function descargarRecetaPaciente() {
  const datos = datosRecetaActual();
  if (!formatoInstitucionalPermitidoPaciente(datos.formato)) {
    alert("No tienes autorizacion para usar este formato de receta.");
    return;
  }
  if (!datos.medicamentos.length) {
    alert("Agrega al menos un medicamento a la receta.");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Receta ${escaparHTML(datos.pacienteNombre)}</title>
<style>
  body{margin:0;background:#f2f3ee;font-family:Arial,Helvetica,sans-serif;color:#0e1411;}
  .hoja{width:760px;min-height:980px;margin:32px auto;padding:48px;background:white;border-radius:22px;box-shadow:0 22px 70px rgba(14,20,17,.18),0 0 0 1px rgba(52,122,77,.14);}
  .receta-marca{color:#0284c7;font-weight:900;letter-spacing:.22em;font-size:12px;margin-bottom:18px;}
  .receta-marca--hugo-wilson{display:flex;justify-content:center;margin:0 0 16px;letter-spacing:0;}.receta-marca--hugo-wilson img{display:block;width:150px;height:150px;object-fit:contain;border-radius:12px;}
  .receta-encabezado{display:flex;justify-content:space-between;gap:22px;border-bottom:2px solid #dbeafe;padding-bottom:18px;margin-bottom:22px;}
  h2{margin:0;color:#082f49;font-size:30px;} h3{margin:24px 0 10px;color:#0369a1;font-size:14px;text-transform:uppercase;letter-spacing:.12em;}
  p{line-height:1.45;} .receta-datos{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:#f8fbff;border:1px solid #dbeafe;border-radius:16px;padding:14px 16px;}
  .receta-datos p{margin:0;} .receta-medicamentos{padding-left:22px;} .receta-medicamentos li{margin:0 0 14px;} .receta-medicamentos strong{display:block;color:#0e1411;} .receta-medicamentos span{display:block;margin-top:4px;}
  .receta-vigencia{margin-top:20px;color:#4c554f;} .receta-firma{margin-top:80px;text-align:center;margin-left:auto;width:280px;} .receta-firma span{display:block;border-top:1px solid #0e1411;margin-bottom:8px;} .receta-firma strong,.receta-firma small{display:block;}
  @media print{body{background:white}.hoja{width:auto;min-height:auto;margin:0;box-shadow:none;border-radius:0}}
</style>
</head>
<body><main class="hoja">${htmlRecetaPreview(datos)}</main></body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Receta_${(datos.pacienteNombre || "paciente").replace(/\s+/g, "_")}_${datos.fecha}.html`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function normalizarCategoriaEstudio(valor = "") {
  const v = String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["imagen", "image", "imagenologia"].includes(v)) return "imagen";
  if (["laboratorio", "lab"].includes(v)) return "laboratorio";
  return v;
}

function obtenerEstudiosPorCategoria(categoria = "") {
  return [...(CATALOGO_SOLICITUD_ESTUDIOS[normalizarCategoriaEstudio(categoria)] || [])];
}

function esFormatoFrayLaboratorio(formatoId = estadoSolicitud.formatoId) {
  return formatoId === ID_FORMATO_LABORATORIO_FRAY || formatoId === FORMATO_SOLICITUD_LABORATORIO_FRAY.clave;
}

function obtenerEstudiosFrayLaboratorioSeleccionados() {
  return Array.isArray(estadoSolicitud.estudiosFrayLaboratorio) ? estadoSolicitud.estudiosFrayLaboratorio.map((item) => ({ ...item })) : [];
}

function configurarCamposLaboratorioFray() {
  const ids = [
    ["solicitudFrayLaboratorioTipo", "tipo"],
    ["solicitudFrayLaboratorioDerechohabiencia", "derechohabiencia"],
    ["solicitudFrayLaboratorioDiagnostico", "sospechaDiagnostica"],
    ["solicitudFrayLaboratorioUrgencia", "motivoUrgencia"],
    ["solicitudFrayLaboratorioObservaciones", "observaciones"],
    ["solicitudFrayLaboratorioConsentimientoHiv", "consentimientoHiv"]
  ];
  ids.forEach(([id, clave]) => {
    const nodo = document.getElementById(id);
    if (!nodo || nodo.dataset.configurado === "true") return;
    nodo.dataset.configurado = "true";
    nodo.addEventListener(nodo.type === "checkbox" ? "change" : "input", () => {
      estadoSolicitud.frayLaboratorio[clave] = nodo.type === "checkbox" ? nodo.checked : nodo.value;
      actualizarVistaCamposLaboratorioFray();
      actualizarPreviewSolicitudEstudios();
    });
  });
  actualizarVistaCamposLaboratorioFray();
}

function actualizarVistaCamposLaboratorioFray() {
  const urgente = valorCampo("solicitudFrayLaboratorioTipo") === "Urgente" || estadoSolicitud.frayLaboratorio.tipo === "Urgente";
  const motivo = document.getElementById("solicitudFrayLaboratorioMotivoUrgencia");
  if (motivo) motivo.hidden = !urgente;
  const antiHiv = estadoSolicitud.estudiosFrayLaboratorio.some((item) => item.id === "anti_hiv_1_2");
  const aviso = document.getElementById("solicitudFrayLaboratorioHivAviso");
  if (aviso) aviso.hidden = !antiHiv;
  const confirmacion = document.getElementById("solicitudFrayLaboratorioConsentimientoHiv");
  if (confirmacion && !antiHiv) {
    confirmacion.checked = false;
    estadoSolicitud.frayLaboratorio.consentimientoHiv = false;
  }
}

function sincronizarFormularioPorFormatoSolicitud(formatoId = "") {
  const formato = resolverFormatoSolicitud(formatoId || valorCampo("solicitudEstudioFormato"));
  estadoSolicitud.formatoId = formato?.id || formatoId || valorCampo("solicitudEstudioFormato") || "cognicion";
  const esFrayLaboratorioActivo = esFormatoFrayLaboratorio(estadoSolicitud.formatoId);
  const panel = document.getElementById("solicitudFrayLaboratorioPanel");
  const campos = document.getElementById("solicitudFrayLaboratorioCampos");
  const categoriaSelect = document.getElementById("solicitudEstudioCategoria");
  const estudioSelect = document.getElementById("solicitudEstudioNombre");
  const agregar = document.getElementById("agregarEstudioSolicitud");
  const estudioLabel = estudioSelect?.closest("label");
  const motivoGeneralLabel = document.getElementById("solicitudEstudioMotivo")?.closest("label");
  const prioridadGeneralLabel = document.getElementById("solicitudEstudioPrioridad")?.closest("label");
  if (panel) panel.hidden = !esFrayLaboratorioActivo;
  if (campos) campos.hidden = !esFrayLaboratorioActivo;
  if (categoriaSelect) categoriaSelect.disabled = esFrayLaboratorioActivo;
  if (estudioSelect) estudioSelect.disabled = esFrayLaboratorioActivo;
  if (agregar) agregar.hidden = esFrayLaboratorioActivo;
  if (estudioLabel) estudioLabel.hidden = esFrayLaboratorioActivo;
  if (motivoGeneralLabel) motivoGeneralLabel.hidden = esFrayLaboratorioActivo;
  if (prioridadGeneralLabel) prioridadGeneralLabel.hidden = esFrayLaboratorioActivo;
  configurarCamposLaboratorioFray();

  if (esFrayLaboratorioActivo) {
    if (categoriaSelect) categoriaSelect.value = "laboratorio";
    estadoSolicitud.categoria = "laboratorio";
    estudiosSolicitudActual = [];
    sincronizarEstudiosPorCategoria("laboratorio");
    renderizarFormularioLaboratorioFray(panel, obtenerEstudiosFrayLaboratorioSeleccionados(), (seleccionados) => {
      estadoSolicitud.estudiosFrayLaboratorio = seleccionados;
      actualizarVistaCamposLaboratorioFray();
      actualizarPreviewSolicitudEstudios();
    });
  } else {
    estadoSolicitud.estudiosFrayLaboratorio = [];
    estadoSolicitud.frayLaboratorio = { tipo: "Ordinario", derechohabiencia: "Sin registro", sospechaDiagnostica: "", motivoUrgencia: "", observaciones: "", consentimientoHiv: false, cultivo: "" };
    ["solicitudFrayLaboratorioDiagnostico", "solicitudFrayLaboratorioUrgencia", "solicitudFrayLaboratorioObservaciones"].forEach((id) => ponerValor(id, ""));
    ponerValor("solicitudFrayLaboratorioTipo", "Ordinario");
    ponerValor("solicitudFrayLaboratorioDerechohabiencia", "Sin registro");
    const consentimiento = document.getElementById("solicitudFrayLaboratorioConsentimientoHiv");
    if (consentimiento) consentimiento.checked = false;
  }
  sincronizarCamposMedicosPorFormato(estadoSolicitud.formatoId);
  actualizarVistaCamposLaboratorioFray();
}

function sincronizarEstudiosPorCategoria(categoriaSeleccionada = "") {
  const categoriaSelect = document.getElementById("solicitudEstudioCategoria");
  const estudioSelect = document.getElementById("solicitudEstudioNombre");
  const categoria = normalizarCategoriaEstudio(categoriaSeleccionada || categoriaSelect?.value || "laboratorio");
  estadoSolicitud.categoria = categoria;
  if (categoriaSelect && categoriaSelect.value !== categoria) categoriaSelect.value = categoria;
  if (!estudioSelect) return;
  const estudios = obtenerEstudiosPorCategoria(categoria);
  estudioSelect.replaceChildren(new Option("Seleccionar estudio", ""));
  estudios.forEach((nombre) => estudioSelect.add(new Option(nombre, nombre)));
  estudioSelect.value = "";
  console.debug("[SOLICITUD ESTUDIO] categoría inicial:", estadoSolicitud.categoria);
  console.debug("[SOLICITUD ESTUDIO] estudios cargados:", estudios.length);
  actualizarPreviewSolicitudEstudios();
}

function normalizarMedicoSolicitud(medico = {}) {
  return {
    id: medico.id || medico.uid || "",
    nombre: medico.nombreCompleto || medico.nombre || medico.displayName || "",
    cargo: medico.cargoCompleto || medico.cargo || medico.grado || medico.especialidad || "",
    cedulaProfesional: medico.cedulaProfesional || medico.cedula || "",
    cedulaEspecialidad: medico.cedulaEspecialidad || medico.cedulaEspecialidadMedica || medico.cedulaProfesional || medico.cedula || "",
    especialidad: medico.especialidad || medico.cargoCompleto || medico.cargo || "",
    firmaId: medico.firmaId || medico.firma || ""
  };
}

function medicoSolicitudDesdeEstado(tipo) {
  const esAdscrito = tipo === "adscrito";
  const modo = esAdscrito ? estadoSolicitud.modoAdscrito : estadoSolicitud.modoSolicitante;
  if (modo === "otro") {
    const manual = esAdscrito ? estadoSolicitud.manualAdscrito : estadoSolicitud.manualSolicitante;
    return { id: "__otro__", nombre: manual.nombre, cargo: manual.cargo, cedulaProfesional: manual.cedula, cedulaEspecialidad: manual.cedula, especialidad: manual.cargo, firmaId: "" };
  }
  const id = esAdscrito ? estadoSolicitud.medicoAdscritoId : estadoSolicitud.medicoSolicitanteId;
  return normalizarMedicoSolicitud(catalogoMedicosFirmasIndicacionesCache.find((medico) => medico.id === id) || {});
}

function actualizarModoManualMedicoSolicitud(tipo) {
  const esAdscrito = tipo === "adscrito";
  const contenedor = document.getElementById(esAdscrito ? "solicitudMedicoAdscritoOtro" : "solicitudMedicoSolicitanteOtro");
  const modo = esAdscrito ? estadoSolicitud.modoAdscrito : estadoSolicitud.modoSolicitante;
  if (contenedor) contenedor.hidden = modo !== "otro";
}

function sincronizarCamposMedicosPorFormato(formatoId = "") {
  const formatoResuelto = resolverFormatoSolicitud(formatoId || valorCampo("solicitudEstudioFormato"));
  estadoSolicitud.formatoId = formatoResuelto?.id || formatoId || valorCampo("solicitudEstudioFormato") || "cognicion";
  const esFormatoFrayImagenologia = estadoSolicitud.formatoId === FORMATO_SOLICITUD_IMAGENOLOGIA.clave;
  const contenedor = document.getElementById("solicitudMedicosInstitucional");
  if (contenedor) contenedor.hidden = false;
  const campoAdscrito = document.getElementById("solicitudMedicoAdscritoCampo");
  if (campoAdscrito) campoAdscrito.hidden = !esFormatoFrayImagenologia;
  if (!esFormatoFrayImagenologia) {
    estadoSolicitud.medicoAdscritoId = "";
    estadoSolicitud.modoAdscrito = "catalogo";
    estadoSolicitud.manualAdscrito = { nombre: "", cargo: "", cedula: "" };
    ["solicitudMedicoAdscritoNombre", "solicitudMedicoAdscritoCargo", "solicitudMedicoAdscritoCedula"].forEach((id) => ponerValor(id, ""));
    const adscrito = document.getElementById("solicitudMedicoAdscritoId");
    if (adscrito) adscrito.value = "";
    actualizarModoManualMedicoSolicitud("adscrito");
  }
  renderizarSelectoresMedicosSolicitud();
  console.debug("[SOLICITUD ESTUDIO] formato médico:", estadoSolicitud.formatoId);
}

function renderizarSelectoresMedicosSolicitud() {
  const contenedor = document.getElementById("solicitudMedicosInstitucional");
  const solicitante = document.getElementById("solicitudMedicoSolicitanteId");
  const adscrito = document.getElementById("solicitudMedicoAdscritoId");
  if (!contenedor || !solicitante || !adscrito) return;
  const esFray = estadoSolicitud.formatoId === FORMATO_SOLICITUD_IMAGENOLOGIA.clave;
  contenedor.hidden = false;
  const campoAdscrito = document.getElementById("solicitudMedicoAdscritoCampo");
  if (campoAdscrito) campoAdscrito.hidden = !esFray;
  const opciones = `<option value="">Seleccionar médico</option>${catalogoMedicosFirmasIndicacionesCache.map((medico) => {
    const normalizado = normalizarMedicoSolicitud(medico);
    const detalle = [normalizado.cargo, normalizado.cedulaProfesional ? `Céd. ${normalizado.cedulaProfesional}` : ""].filter(Boolean).join(" · ");
    return `<option value="${escaparHTML(normalizado.id)}">${escaparHTML(normalizado.nombre || "Sin nombre")}${detalle ? ` — ${escaparHTML(detalle)}` : ""}</option>`;
  }).join("")}<option value="__otro__">Otro…</option>`;
  const valorSolicitante = estadoSolicitud.modoSolicitante === "otro" ? "__otro__" : estadoSolicitud.medicoSolicitanteId;
  const valorAdscrito = estadoSolicitud.modoAdscrito === "otro" ? "__otro__" : estadoSolicitud.medicoAdscritoId;
  solicitante.innerHTML = opciones;
  adscrito.innerHTML = opciones;
  solicitante.value = valorSolicitante;
  adscrito.value = valorAdscrito;
  actualizarModoManualMedicoSolicitud("solicitante");
  actualizarModoManualMedicoSolicitud("adscrito");
  console.debug("[SOLICITUD ESTUDIO] solicitante:", estadoSolicitud.medicoSolicitanteId);
  console.debug("[SOLICITUD ESTUDIO] adscrito:", estadoSolicitud.medicoAdscritoId);
  console.debug("[SOLICITUD ESTUDIO] modo solicitante:", estadoSolicitud.modoSolicitante);
  console.debug("[SOLICITUD ESTUDIO] modo adscrito:", estadoSolicitud.modoAdscrito);
}

function validarMedicosSolicitud() {
  const esFray = estadoSolicitud.formatoId === FORMATO_SOLICITUD_IMAGENOLOGIA.clave;
  const faltantes = [];
  const solicitante = medicoSolicitudDesdeEstado("solicitante");
  if (estadoSolicitud.modoSolicitante === "otro") {
    if (!solicitante.nombre) faltantes.push("Nombre del médico solicitante");
    if (!solicitante.cargo) faltantes.push("Cargo del médico solicitante");
    if (!solicitante.cedulaProfesional) faltantes.push("Cédula profesional del solicitante");
  } else {
    if (!estadoSolicitud.medicoSolicitanteId) faltantes.push("ID del médico solicitante");
    if (!solicitante.nombre) faltantes.push("Nombre del médico solicitante");
    if (!solicitante.cargo) faltantes.push("Cargo del médico solicitante");
    if (!solicitante.cedulaProfesional) faltantes.push("Cédula profesional del solicitante");
  }
  if (!esFray) return faltantes;
  const adscrito = medicoSolicitudDesdeEstado("adscrito");
  if (estadoSolicitud.modoAdscrito === "otro") {
    if (!adscrito.nombre) faltantes.push("Nombre del médico adscrito");
    if (!adscrito.especialidad) faltantes.push("Especialidad o cargo del médico adscrito");
    if (!adscrito.cedulaEspecialidad) faltantes.push("Cédula de especialidad del adscrito");
  } else {
    if (!estadoSolicitud.medicoAdscritoId) faltantes.push("ID del médico adscrito");
    if (!adscrito.nombre) faltantes.push("Nombre del médico adscrito");
    if (!adscrito.cedulaEspecialidad) faltantes.push("Cédula de especialidad del adscrito");
  }
  return faltantes;
}

function validarSolicitudLaboratorioFray(datos = datosSolicitudEstudiosActual()) {
  if (!esFormatoFrayLaboratorio(datos.formatoId)) return [];
  const faltantes = [];
  if (!datos.expediente) faltantes.push("Número de expediente institucional");
  if (!datos.pacienteNombre) faltantes.push("Nombre completo del paciente");
  if (!datos.servicio) faltantes.push("Servicio solicitante");
  if (!datos.frayLaboratorio?.sospechaDiagnostica) faltantes.push("Sospecha diagnóstica");
  if (!datos.estudios.length) faltantes.push("Al menos un análisis clínico");
  if (datos.estudios.some((item) => item.id === "cultivo" && !item.texto)) faltantes.push("Especificación del cultivo");
  if (datos.frayLaboratorio?.tipo === "Urgente" && !datos.frayLaboratorio.motivoUrgencia) faltantes.push("Motivo de urgencia");
  if (datos.estudios.some((item) => item.id === "anti_hiv_1_2") && !datos.frayLaboratorio?.consentimientoHiv) faltantes.push("Confirmación de consentimiento informado para Ac. anti-HIV 1 y 2");
  return faltantes;
}

function configurarMedicosSolicitud() {
  const solicitante = document.getElementById("solicitudMedicoSolicitanteId");
  const adscrito = document.getElementById("solicitudMedicoAdscritoId");
  if (!solicitante || !adscrito || solicitante.dataset.configurado === "true") return;
  solicitante.dataset.configurado = "true";
  const configurar = (select, tipo) => select.addEventListener("change", () => {
    const esAdscrito = tipo === "adscrito";
    if (select.value === "__otro__") {
      if (esAdscrito) { estadoSolicitud.medicoAdscritoId = ""; estadoSolicitud.modoAdscrito = "otro"; }
      else { estadoSolicitud.medicoSolicitanteId = ""; estadoSolicitud.modoSolicitante = "otro"; }
    } else {
      if (esAdscrito) { estadoSolicitud.medicoAdscritoId = select.value; estadoSolicitud.modoAdscrito = "catalogo"; }
      else { estadoSolicitud.medicoSolicitanteId = select.value; estadoSolicitud.modoSolicitante = "catalogo"; }
    }
    actualizarModoManualMedicoSolicitud(tipo);
    actualizarPreviewSolicitudEstudios();
  });
  configurar(solicitante, "solicitante");
  configurar(adscrito, "adscrito");
  [
    ["solicitudMedicoSolicitanteNombre", "manualSolicitante", "nombre"], ["solicitudMedicoSolicitanteCargo", "manualSolicitante", "cargo"], ["solicitudMedicoSolicitanteCedula", "manualSolicitante", "cedula"],
    ["solicitudMedicoAdscritoNombre", "manualAdscrito", "nombre"], ["solicitudMedicoAdscritoCargo", "manualAdscrito", "cargo"], ["solicitudMedicoAdscritoCedula", "manualAdscrito", "cedula"]
  ].forEach(([id, grupo, campo]) => document.getElementById(id)?.addEventListener("input", (evento) => { estadoSolicitud[grupo][campo] = evento.target.value; actualizarPreviewSolicitudEstudios(); }));
}

function configurarSolicitudEstudios() {
  const categoria = document.getElementById("solicitudEstudioCategoria");
  const estudio = document.getElementById("solicitudEstudioNombre");
  if (!categoria || !estudio) return;

  if (categoria.dataset.solicitudConfigurada === "true") return;
  categoria.dataset.solicitudConfigurada = "true";

  categoria.addEventListener("change", () => {
    sincronizarEstudiosPorCategoria(categoria.value);
  });
  sincronizarEstudiosPorCategoria(categoria.value || "laboratorio");
}

function datosSolicitudEstudiosActual() {
  const fecha = valorCampo("solicitudEstudioFecha") || fechaISOHoy();
  const formatoId = estadoSolicitud.formatoId || resolverFormatoSolicitud(valorCampo("solicitudEstudioFormato"))?.id || "cognicion";
  const esFray = formatoId === FORMATO_SOLICITUD_IMAGENOLOGIA.clave;
  const esFrayLaboratorioActivo = esFormatoFrayLaboratorio(formatoId);
  const expedienteSolicitud = esFrayLaboratorioActivo
    ? resolverExpedienteInstitucional(datosPacienteActual || {})
    : (datosPacienteActual?.expedienteCognicion || datosPacienteActual?.datosInstitucionales?.expedienteCognicion || datosPacienteActual?.expediente || datosPacienteActual?.numeroExpediente || "");
  const medicoSolicitante = medicoSolicitudDesdeEstado("solicitante");
  const medicoAdscrito = esFray ? medicoSolicitudDesdeEstado("adscrito") : {};
  const datos = {
    formatoId,
    formato: formatoId,
    categoria: estadoSolicitud.categoria,
    medicoSolicitanteId: estadoSolicitud.medicoSolicitanteId,
    modoSolicitante: estadoSolicitud.modoSolicitante,
    modoAdscrito: estadoSolicitud.modoAdscrito,
    fecha,
    pacienteNombre: obtenerNombrePacienteActual(),
    edad: calcularEdad(obtenerFechaNacimiento(datosPacienteActual || {})),
    fechaNacimiento: obtenerFechaNacimiento(datosPacienteActual || {}),
    sexo: datosPacienteActual?.sexo || datosPacienteActual?.datosInstitucionales?.sexo || "",
    expediente: expedienteSolicitud,
    cama: datosPacienteActual?.cama || datosPacienteActual?.datosInstitucionales?.cama || "",
    institucion: datosPacienteActual?.institucionPaciente || datosPacienteActual?.institucion || "",
    prioridad: esFrayLaboratorioActivo ? (valorCampo("solicitudFrayLaboratorioTipo") || "Ordinario") : (valorCampo("solicitudEstudioPrioridad") || "Ordinaria"),
    motivo: esFrayLaboratorioActivo ? valorCampo("solicitudFrayLaboratorioObservaciones") : valorCampo("solicitudEstudioMotivo"),
    servicio: datosPacienteActual?.servicioInstitucional || datosPacienteActual?.servicio || "",
    sospechaDiagnostica: esFrayLaboratorioActivo ? valorCampo("solicitudFrayLaboratorioDiagnostico") : "",
    frayLaboratorio: esFrayLaboratorioActivo ? {
      tipo: valorCampo("solicitudFrayLaboratorioTipo") || "Ordinario",
      derechohabiencia: valorCampo("solicitudFrayLaboratorioDerechohabiencia") || "Sin registro",
      sospechaDiagnostica: valorCampo("solicitudFrayLaboratorioDiagnostico"),
      motivoUrgencia: valorCampo("solicitudFrayLaboratorioUrgencia"),
      observaciones: valorCampo("solicitudFrayLaboratorioObservaciones"),
      consentimientoHiv: Boolean(document.getElementById("solicitudFrayLaboratorioConsentimientoHiv")?.checked)
    } : null,
    solicita: medicoSolicitante.nombre || "Médico solicitante",
    cedula: medicoSolicitante.cedulaProfesional || "",
    medicoSolicitante,
    estudios: esFrayLaboratorioActivo ? obtenerEstudiosFrayLaboratorioSeleccionados() : estudiosSolicitudActual
  };
  if (esFray) {
    datos.medicoAdscritoId = estadoSolicitud.medicoAdscritoId;
    datos.medicoAdscrito = medicoAdscrito;
  }
  return datos;
}

function formatoSolicitudActivo(datos = datosSolicitudEstudiosActual()) {
  return resolverFormatoSolicitud(datos.formatoId || datos.formato);
}

function datosImagenologiaDesdeSolicitudBase(datos) {
  return {
    id: "",
    pacienteId: uidPaciente,
    formatoId: FORMATO_SOLICITUD_IMAGENOLOGIA.clave,
    solicitud: { fecha: datos.fecha, hora: "", fechaCita: "", horaCita: "" },
    paciente: {
      expediente: resolverExpedienteInstitucional(datosPacienteActual || {}),
      nombreCompleto: datos.pacienteNombre,
      fechaNacimiento: datos.fechaNacimiento,
      edad: datos.edad,
      curp: datosPacienteActual?.curp || "",
      sexo: datos.sexo,
      genero: datosPacienteActual?.genero || "",
      pa: datosPacienteActual?.pa || datosPacienteActual?.presionArterial || "",
      camaConsultorio: datos.cama,
      pesoKg: datosPacienteActual?.peso || datosPacienteActual?.somatometria?.peso || "",
      tallaM: datosPacienteActual?.talla || datosPacienteActual?.somatometria?.talla || "",
      servicio: datosPacienteActual?.servicioInstitucional || datosPacienteActual?.servicio || "",
      alergias: datosPacienteActual?.alergias || ""
    },
    datosClinicos: datos.motivo || "",
    estudios: datos.estudios.map((estudio, indice) => ({
      id: `estudio-${indice + 1}`,
      tipo: datos.prioridad === "Urgente" ? "Urgente" : "Ordinario",
      modalidad: estudio.categoria === "imagen" ? "Imagen" : "",
      nombre: estudio.nombre,
      region: "",
      contraste: "",
      observaciones: "",
      criterioUrgencia: ""
    })),
    medicoSolicitante: { uid: datos.medicoSolicitante?.id || auth.currentUser?.uid || "", nombre: datos.medicoSolicitante?.nombre || datos.solicita, cargo: datos.medicoSolicitante?.cargo || "", cedulaProfesional: datos.medicoSolicitante?.cedulaProfesional || datos.cedula, servicio: datosPacienteActual?.servicioInstitucional || datosPacienteActual?.servicio || "", firmaId: datos.medicoSolicitante?.firmaId || "" },
    medicoAdscrito: { uid: datos.medicoAdscrito?.id || "", nombre: datos.medicoAdscrito?.nombre || "", cedulaEspecialidad: datos.medicoAdscrito?.cedulaEspecialidad || "", especialidad: datos.medicoAdscrito?.especialidad || datos.medicoAdscrito?.cargo || "", firmaId: datos.medicoAdscrito?.firmaId || "" }
  };
}

function htmlSolicitudImagenologiaPreview(datos) {
  const estudios = datos.estudios?.length
    ? datos.estudios.map((item) => `<tr><td>${escaparHTML(item.tipo)}</td><td>${escaparHTML(item.nombre)}</td><td>${escaparHTML(item.criterioUrgencia || "")}</td></tr>`).join("")
    : "<tr><td colspan=\"3\">Sin estudios solicitados.</td></tr>";
  const paciente = datos.paciente || {};
  return `<div class="solicitud-fray-preview"><header><strong>SECRETARÍA DE SALUD</strong><br><strong>COMISIÓN NACIONAL DE SALUD MENTAL Y ADICCIONES</strong><br><strong>HOSPITAL PSIQUIÁTRICO FRAY BERNARDINO ÁLVAREZ</strong><h2>SOLICITUD DE ESTUDIO DE IMAGENOLOGÍA</h2><strong>FTO-HPFBA-EXPC-IMG-SEI</strong></header><section><h3>Datos de la solicitud</h3><p>Fecha: ${escaparHTML(datos.solicitud?.fecha || "")} · Hora: ${escaparHTML(datos.solicitud?.hora || "")}</p><h3>Identificación del paciente</h3><p>Paciente: ${escaparHTML(paciente.nombreCompleto || "")} · Expediente: ${escaparHTML(paciente.expediente || "")}</p><p>Fecha de nacimiento: ${escaparHTML(paciente.fechaNacimiento || "")} · Edad: ${escaparHTML(paciente.edad || "")} · Sexo: ${escaparHTML(paciente.sexo || "")}</p><h3>Datos físicos y ubicación</h3><p>PA: ${escaparHTML(paciente.pa || "")} · Cama o consultorio: ${escaparHTML(paciente.camaConsultorio || "")} · Peso: ${escaparHTML(paciente.pesoKg || "")} · Talla: ${escaparHTML(paciente.tallaM || "")}</p><p>Servicio: ${escaparHTML(paciente.servicio || "")} · Alergias: ${escaparHTML(paciente.alergias || "Sin información registrada")}</p><h3>Datos clínicos y sospecha diagnóstica</h3><p>${escaparHTML(datos.datosClinicos || "").replace(/\n/g, "<br>")}</p><h3>Estudios solicitados</h3><table><thead><tr><th>Tipo</th><th>Estudio</th><th>Criterio de urgencia</th></tr></thead><tbody>${estudios}</tbody></table><h3>Datos médicos</h3><p>Médico solicitante: ${escaparHTML(datos.medicoSolicitante?.nombre || "")} · Cédula: ${escaparHTML(datos.medicoSolicitante?.cedulaProfesional || "")}</p><p>Médico adscrito: ____________________ · Cédula de especialidad: ____________________</p><div class="solicitud-fray-firmas"><span>Firma médico solicitante</span><span>Firma médico adscrito</span></div></section><footer>Solicitud institucional · Snapshot de datos al momento de emisión</footer></div>`;
}

function htmlSolicitudLaboratorioFrayPreview(datos) {
  const seleccionados = new Map((datos.estudios || []).map((item) => [item.id, item]));
  const categorias = CATALOGO_FRAY_ANALISIS_CLINICOS.map((categoria) => `
    <section><h4>${escaparHTML(categoria.nombre)}</h4><ul>${categoria.estudios.map((estudio) => {
      const item = seleccionados.get(estudio.id);
      return `<li>${item ? "☒" : "☐"} ${escaparHTML(estudio.nombre)}${item?.texto ? ` ${escaparHTML(item.texto)}` : ""}</li>`;
    }).join("")}</ul></section>
  `).join("");
  const laboratorio = datos.frayLaboratorio || {};
  return `<div class="solicitud-fray-laboratorio-preview">
    <header><strong>SECRETARÍA DE SALUD</strong><h2>SOLICITUD DE ANÁLISIS CLÍNICOS</h2><span>FTO-HPFBA-EXPC-LAB-SAC</span></header>
    <div class="receta-datos"><p><b>Paciente:</b> ${escaparHTML(datos.pacienteNombre)}</p><p><b>Expediente:</b> ${escaparHTML(datos.expediente)}</p><p><b>Fecha:</b> ${escaparHTML(formatearFechaDocumento(datos.fecha))}</p><p><b>Servicio:</b> ${escaparHTML(datos.servicio)}</p><p><b>Edad:</b> ${escaparHTML(datos.edad)}</p><p><b>Cama:</b> ${escaparHTML(datos.cama)}</p><p><b>Tipo:</b> ${escaparHTML(laboratorio.tipo || "Ordinario")}</p><p><b>Derechohabiencia:</b> ${escaparHTML(laboratorio.derechohabiencia || "Sin registro")}</p></div>
    <p><b>Sospecha diagnóstica:</b> ${escaparHTML(laboratorio.sospechaDiagnostica || "")}</p>
    <div class="solicitud-fray-laboratorio-categorias-preview">${categorias}</div>
    ${laboratorio.motivoUrgencia ? `<p><b>Motivo de urgencia:</b> ${escaparHTML(laboratorio.motivoUrgencia)}</p>` : ""}
    ${laboratorio.observaciones ? `<p><b>Observaciones:</b> ${escaparHTML(laboratorio.observaciones)}</p>` : ""}
    ${seleccionados.has("anti_hiv_1_2") ? `<p class="solicitud-fray-lab-hiv"><b>Consentimiento informado:</b> ${laboratorio.consentimientoHiv ? "Confirmado" : "Pendiente"}</p>` : ""}
    <footer><b>Médico solicitante:</b> ${escaparHTML(datos.medicoSolicitante?.nombre || "")} · <b>Cédula:</b> ${escaparHTML(datos.medicoSolicitante?.cedulaProfesional || "")}</footer>
  </div>`;
}

function renderizarListaSolicitudEstudios() {
  const contenedor = document.getElementById("listaSolicitudEstudios");
  if (!contenedor) return;

  contenedor.innerHTML = estudiosSolicitudActual.length
    ? estudiosSolicitudActual.map((item, index) => `
      <article class="medicamento-receta-item">
        <div>
          <strong>${escaparHTML(item.nombre)}</strong>
          <span>${escaparHTML(item.categoria === "imagen" ? "Imagen" : "Laboratorio")}</span>
        </div>
        <button type="button" class="boton-peligro-suave" data-quitar-estudio-solicitud="${index}">Quitar</button>
      </article>
    `).join("")
    : "<p>Sin estudios agregados.</p>";

  contenedor.querySelectorAll("[data-quitar-estudio-solicitud]").forEach((boton) => {
    boton.addEventListener("click", () => {
      estudiosSolicitudActual.splice(Number(boton.dataset.quitarEstudioSolicitud), 1);
      renderizarListaSolicitudEstudios();
      actualizarPreviewSolicitudEstudios();
    });
  });
}

function htmlSolicitudEstudiosPreview(datos = datosSolicitudEstudiosActual()) {
  const formato = formatoSolicitudActivo(datos);
  if (!formato) {
    return `<div class="solicitud-formato-error" role="alert"><strong>No se encontró el generador del formato ${escaparHTML(datos.formatoId || datos.formato || "desconocido")}.</strong><p>La solicitud no fue sustituida por otro formato.</p></div>`;
  }
  if (formato?.id === FORMATO_SOLICITUD_IMAGENOLOGIA.clave) {
    return htmlSolicitudImagenologiaPreview(datosImagenologiaDesdeSolicitudBase(datos));
  }
  if (esFormatoFrayLaboratorio(formato.id)) return htmlSolicitudLaboratorioFrayPreview(datos);
  const estudios = datos.estudios?.length
    ? datos.estudios.map((item) => `
      <li>
        <strong>${escaparHTML(item.nombre)}</strong>
        <span>${escaparHTML(item.categoria === "imagen" ? "Imagen" : "Laboratorio")}</span>
      </li>
    `).join("")
    : "<li><span>Sin estudios solicitados.</span></li>";

  return `
    <img class="solicitud-logo" src="assets/favicon-cognicion.png" alt="Cognicion">
    <div class="receta-marca">COGNICION</div>
    <div class="receta-encabezado">
      <div>
        <h2>Solicitud de estudios</h2>
        <p>Formato ${escaparHTML(datos.formato)}  ${escaparHTML(datos.prioridad)}</p>
      </div>
      <span>${escaparHTML(formatearFecha(datos.fecha) || datos.fecha)}</span>
    </div>

    <div class="receta-datos">
      <p><b>Paciente:</b> ${escaparHTML(datos.pacienteNombre)}</p>
      <p><b>Edad:</b> ${datos.edad !== "" ? escaparHTML(`${datos.edad} años`) : "No registrada"}</p>
      <p><b>Sexo:</b> ${escaparHTML(datos.sexo || "No registrado")}</p>
      <p><b>Expediente:</b> ${escaparHTML(datos.expediente || "No registrado")}</p>
      <p><b>Cama:</b> ${escaparHTML(datos.cama || "No registrada")}</p>
      <p><b>Institucion:</b> ${escaparHTML(datos.institucion || "No registrada")}</p>
    </div>

    <h3>Estudios solicitados</h3>
    <ol class="receta-medicamentos">${estudios}</ol>

    ${datos.motivo ? `<h3>Indicacin clnica</h3><p>${escaparHTML(datos.motivo)}</p>` : ""}

    <div class="receta-firma">
      <span></span>
      <strong>${escaparHTML(datos.solicita)}</strong>
      <small>${datos.cedula ? `Ced. Prof. ${escaparHTML(datos.cedula)}` : "Quién solicita"}</small>
    </div>
  `;
}

function actualizarPreviewSolicitudEstudios() {
  const preview = document.getElementById("solicitudEstudiosPreview");
  if (!preview) return;
  const datos = datosSolicitudEstudiosActual();
  const formato = formatoSolicitudActivo(datos);
  console.debug("[Estudios:Preview]", { formatoId: datos.formatoId, rendererId: formato?.id === FORMATO_SOLICITUD_IMAGENOLOGIA.clave ? "renderSolicitudImagenologia" : formato ? "htmlSolicitudEstudiosPreview" : null, result: formato ? "rendered" : "format-not-found" });
  preview.replaceChildren();
  preview.innerHTML = htmlSolicitudEstudiosPreview(datos);
}

function manejarCambioFormatoSolicitud() {
  const formatoId = resolverFormatoSolicitud(valorCampo("solicitudEstudioFormato"))?.id;
  const categoria = document.getElementById("solicitudEstudioCategoria");
  solicitudImagenologiaActiva?.cerrar?.();
  solicitudImagenologiaActiva = null;
  sincronizarFormularioPorFormatoSolicitud(formatoId);
  if (formatoId === FORMATO_SOLICITUD_IMAGENOLOGIA.clave) {
    if (categoria) {
      categoria.value = "imagen";
      sincronizarEstudiosPorCategoria(categoria.value);
    }
    console.debug("[Estudios:FormatoSeleccionado]", { formatoId, categoria: "imagen", rendererId: "renderSolicitudImagenologia", generatorId: "crearDocumentoWordFray" });
    abrirSolicitudImagenologiaPaciente();
  } else if (esFormatoFrayLaboratorio(formatoId)) {
    console.debug("[Estudios:FormatoSeleccionado]", { formatoId, categoria: "laboratorio", rendererId: "renderSolicitudLaboratorioFray", generatorId: "crearDocumentoWordDesdePlantilla" });
  } else {
    console.debug("[Estudios:FormatoSeleccionado]", { formatoId: formatoId || null, categoria: categoria?.value || null, rendererId: "htmlSolicitudEstudiosPreview", generatorId: "generarSolicitudCognicion" });
  }
  actualizarPreviewSolicitudEstudios();
}

function agregarEstudioSolicitud() {
  const categoria = estadoSolicitud.categoria || normalizarCategoriaEstudio(valorCampo("solicitudEstudioCategoria") || "laboratorio");
  const nombre = valorCampo("solicitudEstudioNombre");

  if (!nombre) {
    alert("Selecciona un estudio.");
    return;
  }

  const existe = estudiosSolicitudActual.some((item) =>
    item.categoria === categoria && item.nombre.toLowerCase() === nombre.toLowerCase()
  );

  if (!existe) {
    estudiosSolicitudActual.push({ categoria, nombre });
  }

  renderizarListaSolicitudEstudios();
  actualizarPreviewSolicitudEstudios();
}

function limpiarSolicitudEstudios() {
  estudiosSolicitudActual = [];
  estadoSolicitud.medicoSolicitanteId = "";
  estadoSolicitud.medicoAdscritoId = "";
  estadoSolicitud.modoSolicitante = "catalogo";
  estadoSolicitud.modoAdscrito = "catalogo";
  estadoSolicitud.manualSolicitante = { nombre: "", cargo: "", cedula: "" };
  estadoSolicitud.manualAdscrito = { nombre: "", cargo: "", cedula: "" };
  estadoSolicitud.estudiosFrayLaboratorio = [];
  estadoSolicitud.frayLaboratorio = { tipo: "Ordinario", derechohabiencia: "Sin registro", sospechaDiagnostica: "", motivoUrgencia: "", observaciones: "", consentimientoHiv: false, cultivo: "" };
  ["solicitudMedicoSolicitanteNombre", "solicitudMedicoSolicitanteCargo", "solicitudMedicoSolicitanteCedula", "solicitudMedicoAdscritoNombre", "solicitudMedicoAdscritoCargo", "solicitudMedicoAdscritoCedula", "solicitudFrayLaboratorioDiagnostico", "solicitudFrayLaboratorioUrgencia", "solicitudFrayLaboratorioObservaciones"].forEach((id) => ponerValor(id, ""));
  ponerValor("solicitudFrayLaboratorioTipo", "Ordinario");
  ponerValor("solicitudFrayLaboratorioDerechohabiencia", "Sin registro");
  const consentimientoHiv = document.getElementById("solicitudFrayLaboratorioConsentimientoHiv");
  if (consentimientoHiv) consentimientoHiv.checked = false;
  ponerValor("solicitudEstudioMotivo", "");
  ponerValor("solicitudEstudioPrioridad", "Ordinaria");
  ponerValor("solicitudEstudioFecha", fechaISOHoy());
  sincronizarFormularioPorFormatoSolicitud(estadoSolicitud.formatoId);
  renderizarListaSolicitudEstudios();
  actualizarPreviewSolicitudEstudios();
}

async function guardarSolicitudEstudios() {
  const datos = datosSolicitudEstudiosActual();
  const formato = formatoSolicitudActivo(datos);
  if (!formato) {
    console.error("[FormatosFray:Resolver]", { formatoId: datos.formatoId, result: "not-found" });
    alert(`No se encontró el generador del formato ${datos.formatoId}. La solicitud no fue sustituida por otro formato.`);
    return;
  }
  const faltantesMedicos = validarMedicosSolicitud();
  if (faltantesMedicos.length) {
    alert(`Datos faltantes de médicos:\n\n${faltantesMedicos.map((item) => `• ${item}`).join("\n")}`);
    return;
  }
  const faltantesLaboratorio = validarSolicitudLaboratorioFray(datos);
  if (faltantesLaboratorio.length) {
    alert(`Datos faltantes de la solicitud de laboratorio:\n\n${faltantesLaboratorio.map((item) => `• ${item}`).join("\n")}`);
    return;
  }
  if (formato.id === FORMATO_SOLICITUD_IMAGENOLOGIA.clave) {
    alert("Guarda la solicitud desde el formulario institucional de imagenología.");
    if (!solicitudImagenologiaActiva) abrirSolicitudImagenologiaPaciente();
    return;
  }
  if (!datos.estudios.length) {
    alert("Agrega al menos un estudio a la solicitud.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "solicitudesEstudios"), {
    ...datos,
    creadoPor: auth.currentUser?.uid || "",
    creadoEn: serverTimestamp()
  });

  await registrarAccionExpediente({
    accion: "crear_solicitud_estudios",
    descripcion: "El medico genero una solicitud de estudios.",
    detalles: {
      formato: datos.formato,
      estudios: datos.estudios.length,
      prioridad: datos.prioridad
    }
  });

  alert("Solicitud de estudios guardada.");
}

async function descargarSolicitudEstudios() {
  const datos = datosSolicitudEstudiosActual();
  if (!datos.estudios.length) {
    alert("Agrega al menos un estudio a la solicitud.");
    return;
  }

  const formato = formatoSolicitudActivo(datos);
  if (!formato) {
    console.error("[FormatosFray:Resolver]", { formatoId: datos.formatoId, result: "not-found" });
    alert(`No se encontró el generador del formato ${datos.formatoId}. La solicitud no fue sustituida por otro formato.`);
    return;
  }
  const faltantesMedicos = validarMedicosSolicitud();
  if (faltantesMedicos.length) {
    alert(`Datos faltantes de médicos:\n\n${faltantesMedicos.map((item) => `• ${item}`).join("\n")}`);
    return;
  }
  const faltantesLaboratorio = validarSolicitudLaboratorioFray(datos);
  if (faltantesLaboratorio.length) {
    alert(`Datos faltantes de la solicitud de laboratorio:\n\n${faltantesLaboratorio.map((item) => `• ${item}`).join("\n")}`);
    return;
  }

  if (formato.id === FORMATO_SOLICITUD_IMAGENOLOGIA.clave) {
    const snapshot = datosImagenologiaDesdeSolicitudBase(datos);
    const { crearDocumentoWordDesdePlantilla, nombreSeguroNotaWord } = await import("./services/frayDocx.js");
    console.debug("[Estudios:Exportacion]", { formatoId: formato.id, tipoExportacion: "docx", generatorId: "crearDocumentoWordDesdePlantilla", result: "started" });
    const valores = {
      fechaSolicitud: formatearFechaDocumento(new Date()), horaSolicitud: formatearHoraLocalDocumento(new Date()), fechaNacimiento: formatearFechaDocumento(snapshot.paciente.fechaNacimiento), FECHA_CITA: "", HORA_CITA: "", fechaCita: "", horaCita: "",
      NUMERO_EXPEDIENTE: snapshot.paciente.expediente, NOMBRE_COMPLETO: snapshot.paciente.nombreCompleto, EDAD: snapshot.paciente.edad, CURP: snapshot.paciente.curp,
      PA: snapshot.paciente.pa, CAMA_CONSULTORIO: snapshot.paciente.camaConsultorio, PESO: snapshot.paciente.pesoKg, TALLA: snapshot.paciente.tallaM,
      ALERGIAS: snapshot.paciente.alergias, ESTUDIO: snapshot.estudios.map((item) => item.nombre).join("\n"), DATOS_CLINICOS_1: snapshot.datosClinicos, DATOS_CLINICOS_2: "", DATOS_CLINICOS_3: "",
      MEDICO_SOLICITANTE: snapshot.medicoSolicitante.nombre, CARGO_SOLICITANTE: snapshot.medicoSolicitante.cargo, CEDULA_SOLICITANTE: snapshot.medicoSolicitante.cedulaProfesional,
      MEDICO_ADSCRITO: snapshot.medicoAdscrito?.nombre || "", CEDULA_ADSCRITO: snapshot.medicoAdscrito?.cedulaEspecialidad || "", sexo: snapshot.paciente.sexo, "g?nero": snapshot.paciente.genero, "servicio solicitante": snapshot.paciente.servicio,
      tipo: snapshot.estudios[0]?.tipo || "Ordinario", "criterio de urgencia": ""
    };
    const documento = await crearDocumentoWordDesdePlantilla({ valores });
    const enlace = document.createElement("a"); enlace.href = URL.createObjectURL(documento);
    enlace.download = nombreSeguroNotaWord({ tipoNota: "Solicitud_imagenologia_FTO-HPFBA-EXPC-IMG-SEI", apellidoPaciente: datos.pacienteNombre || "Paciente", fecha: datos.fecha });
    enlace.click(); URL.revokeObjectURL(enlace.href); return;
  }

  if (esFormatoFrayLaboratorio(formato.id)) {
    const { crearDocumentoWordDesdePlantilla, nombreSeguroNotaWord } = await import("./services/frayDocx.js");
    const fechaGeneracion = new Date();
    const expedienteInstitucional = resolverExpedienteInstitucional(datosPacienteActual || {});
    const nombrePaciente = datos.pacienteNombre || "";
    const medico = datos.medicoSolicitante || {};
    const observaciones = datos.frayLaboratorio?.observaciones || "";
    const reemplazosTexto = {
      "189 032": expedienteInstitucional,
      "LESLIE MICHELLE HUGHES OCAMPO": nombrePaciente,
      "HUOL021215MDFGCSA5": datosPacienteActual?.curp || "",
      "LABORATORIOS DE INGRESO": observaciones,
      "Karla Fernanda López Sánchez": medico.nombre || "",
      "12742251": medico.cedulaProfesional || ""
    };
    const valores = {
      Servicio: datos.servicio,
      Sexo: datos.sexo,
      "Género": datosPacienteActual?.genero || "",
      "Motivo de urgencia": datos.frayLaboratorio?.motivoUrgencia || "",
      tipo: datos.frayLaboratorio?.tipo || "Ordinario",
      derechohabiencia: datos.frayLaboratorio?.derechohabiencia || "Sin registro",
      CULTIVO_PERSONALIZADO: datos.estudios.find((item) => item.id === "cultivo")?.texto || "",
      CEDULA_SOLICITANTE: medico.cedulaProfesional || "",
      fechaSolicitud: formatearFechaDocumento(fechaGeneracion),
      horaSolicitud: formatearHoraLocalDocumento(fechaGeneracion),
      fechaNacimiento: formatearFechaDocumento(datos.fechaNacimiento),
      EDAD: datos.edad || "",
      CAMA: datos.cama || ""
    };
    const documento = await crearDocumentoWordDesdePlantilla({
      plantillaUrl: "assets/formatos-fray/FTO-HPFBA-EXPC-LAB-SAC.docx",
      valores,
      checkboxIds: CATALOGO_FRAY_ANALISIS_CLINICOS_PLANO.map((item) => item.id),
      checkboxSeleccionados: datos.estudios.map((item) => item.id),
      controlesSinEtiqueta: [formatearFechaDocumento(fechaGeneracion), formatearHoraLocalDocumento(fechaGeneracion), formatearFechaDocumento(datos.fechaNacimiento)],
      controlesEtiquetados: {
        "Motivo de urgencia": [datos.frayLaboratorio?.sospechaDiagnostica || "", datos.frayLaboratorio?.motivoUrgencia || ""]
      },
      reemplazosTexto,
      limpiarPrefijoMedico: true
    });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(documento);
    enlace.download = nombreSeguroNotaWord({ tipoNota: "Solicitud_analisis_clinicos_FTO-HPFBA-EXPC-LAB-SAC", apellidoPaciente: datos.pacienteNombre || "Paciente", fecha: datos.fecha });
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Solicitud de estudios ${escaparHTML(datos.pacienteNombre)}</title>
<style>
  body{margin:0;background:#f2f3ee;font-family:Arial,Helvetica,sans-serif;color:#0e1411;}
  .hoja{position:relative;width:760px;min-height:980px;margin:32px auto;padding:48px;background:white;border-radius:22px;box-shadow:0 22px 70px rgba(14,20,17,.18),0 0 0 1px rgba(52,122,77,.14);}
  .solicitud-logo{position:absolute;top:34px;right:38px;width:54px;height:54px;object-fit:contain;}
  .receta-marca{color:#0284c7;font-weight:900;letter-spacing:.22em;font-size:12px;margin-bottom:18px;}
  .receta-encabezado{display:flex;justify-content:space-between;gap:80px;border-bottom:2px solid #dbeafe;padding-bottom:18px;margin-bottom:22px;}
  h2{margin:0;color:#082f49;font-size:30px;} h3{margin:24px 0 10px;color:#0369a1;font-size:14px;text-transform:uppercase;letter-spacing:.12em;}
  p{line-height:1.45;} .receta-datos{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:#f8fbff;border:1px solid #dbeafe;border-radius:16px;padding:14px 16px;}
  .receta-datos p{margin:0;} .receta-medicamentos{padding-left:22px;} .receta-medicamentos li{margin:0 0 14px;} .receta-medicamentos strong{display:block;color:#0e1411;} .receta-medicamentos span{display:block;margin-top:4px;color:#4c554f;}
  .receta-firma{margin-top:90px;text-align:center;margin-left:auto;width:280px;} .receta-firma span{display:block;border-top:1px solid #0e1411;margin-bottom:8px;} .receta-firma strong,.receta-firma small{display:block;}
  @media print{body{background:white}.hoja{width:auto;min-height:auto;margin:0;box-shadow:none;border-radius:0}}
</style>
</head>
<body><main class="hoja">${htmlSolicitudEstudiosPreview(datos)}</main></body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Solicitud_estudios_${(datos.pacienteNombre || "paciente").replace(/\s+/g, "_")}_${datos.fecha}.html`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function datosFormularioEstudio() {
  return {
    nombre: valorCampo("estudioNombre"),
    tipo: valorCampo("estudioTipo"),
    fecha: valorCampo("estudioFecha"),
    resultado: valorCampo("estudioResultado"),
    observaciones: valorCampo("estudioObservaciones"),
    enlace: valorCampo("estudioEnlace"),
    creadoPor: auth.currentUser?.uid || ""
  };
}

function limpiarFormularioEstudio() {
  [
    "estudioId",
    "estudioNombre",
    "estudioTipo",
    "estudioFecha",
    "estudioResultado",
    "estudioObservaciones",
    "estudioEnlace"
  ].forEach((id) => ponerValor(id, ""));
}

async function guardarEstudioPaciente() {
  const datos = datosFormularioEstudio();
  if (!datos.nombre) {
    alert("Escribe el nombre del estudio.");
    return;
  }

  const estudioId = valorCampo("estudioId");
  if (estudioId) {
    await actualizarEstudio(uidPaciente, estudioId, datos);
  } else {
    await crearEstudio(uidPaciente, datos);
  }

  await registrarAccionExpediente({
    accion: estudioId ? "editar_estudio" : "crear_estudio",
    descripcion: estudioId
      ? "El médico editó un estudio del expediente."
      : "El médico registró un estudio en el expediente.",
    detalles: {
      estudioId,
      nombre: datos.nombre,
      tipo: datos.tipo
    }
  });

  limpiarFormularioEstudio();
  await cargarEstudiosPaciente();
  alert("Estudio guardado.");
}

async function cargarEstudiosPaciente() {
  const contenedor = document.getElementById("listaEstudios");
  if (!contenedor) return;
  contenedor.textContent = "Cargando estudios...";

  try {
    estudiosCache = await listarEstudios(uidPaciente);
    try {
      solicitudesImagenologiaCache = await listarSolicitudesImagenologia(uidPaciente);
    } catch (error) {
      solicitudesImagenologiaCache = [];
      console.error("[SolicitudImagen:Documento]", { code: error?.code || null, stage: "list-drafts", result: "error" });
    }
    const borradores = solicitudesImagenologiaCache.filter((solicitud) => solicitud.estado === "borrador");
    contenedor.innerHTML = [...borradores.map(renderizarBorradorSolicitud), ...estudiosCache.map(renderizarEstudio)].join("") || "<p>Aun no hay estudios registrados.</p>";
    vincularAccionesEstudios();
  } catch (error) {
    console.error("Error al cargar estudios:", error);
    contenedor.textContent = "No se pudieron cargar los estudios.";
  }
}

function renderizarBorradorSolicitud(solicitud) {
  return `<article class="registro-card solicitud-borrador-card"><div class="registro-top"><div><strong>Borrador de solicitud</strong><span>FTO-HPFBA-EXPC-IMG-SEI · ${escaparHTML(solicitud.solicitud?.fecha || solicitud.fechaActualizacion || "")}</span></div></div><p>${escaparHTML((solicitud.estudios || []).map((e) => e.nombre).join(", ") || "Sin estudios agregados")}</p><small>El borrador no se considera estudio solicitado.</small></article>`;
}

function renderizarEstudio(estudio) {
  return `
    <article class="registro-card">
      <div class="registro-top">
      <div>
        <strong>${escaparHTML(estudio.nombre || "Estudio")}</strong>
        <span>${escaparHTML(estudio.tipo || "Sin tipo")} · ${escaparHTML(estudio.estado || "registrado")} · ${escaparHTML(formatearFecha(estudio.fecha))}</span>
        </div>
      </div>
      ${estudio.resultado ? `<p><b>Resultado:</b> ${escaparHTML(estudio.resultado)}</p>` : ""}
      ${estudio.observaciones ? `<p>${escaparHTML(estudio.observaciones)}</p>` : ""}
      ${estudio.enlace ? `<p><a href="${escaparHTML(estudio.enlace)}" target="_blank" rel="noopener">Abrir enlace</a></p>` : ""}
      <div class="registro-actions">
        <button type="button" data-editar-estudio="${estudio.id}">Editar</button>
        <button type="button" class="boton-peligro" data-eliminar-estudio="${estudio.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function vincularAccionesEstudios() {
  document.querySelectorAll("[data-editar-estudio]").forEach((boton) => {
    boton.addEventListener("click", () => editarEstudioPaciente(boton.dataset.editarEstudio));
  });

  document.querySelectorAll("[data-eliminar-estudio]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarEstudioPaciente(boton.dataset.eliminarEstudio));
  });
}

function editarEstudioPaciente(id) {
  const estudio = estudiosCache.find((item) => item.id === id);
  if (!estudio) return;

  ponerValor("estudioId", estudio.id);
  ponerValor("estudioNombre", estudio.nombre);
  ponerValor("estudioTipo", estudio.tipo);
  ponerValor("estudioFecha", estudio.fecha);
  ponerValor("estudioResultado", estudio.resultado);
  ponerValor("estudioObservaciones", estudio.observaciones);
  ponerValor("estudioEnlace", estudio.enlace);
}

async function eliminarEstudioPaciente(id) {
  if (!confirm("Eliminar este estudio del expediente?")) return;
  const estudio = estudiosCache.find((item) => item.id === id);
  await eliminarEstudio(uidPaciente, id);
  await registrarAccionExpediente({
    accion: "eliminar_estudio",
    descripcion: "El medico elimino un estudio del expediente.",
    detalles: {
      estudioId: id,
      nombre: estudio?.nombre || ""
    }
  });
  await cargarEstudiosPaciente();
}

async function guardarNotaRapidaPaciente() {
  const texto = valorCampo("notaRapidaTexto");
  if (!texto) {
    alert("Escribe una observacion.");
    return;
  }

  const medico = await obtenerUsuario(auth.currentUser.uid);
  await crearNotaRapida(uidPaciente, {
    texto,
    medicoUid: auth.currentUser.uid,
    medicoNombre: medico?.nombre || medico?.email || "Mdico",
    pacienteId: uidPaciente
  });

  await registrarAccionExpediente({
    accion: "crear_nota_rapida",
    descripcion: "El medico creo una nota rapida en el expediente.",
    detalles: {
      longitudTexto: texto.length
    }
  });

  ponerValor("notaRapidaTexto", "");
  await cargarNotasRapidasPaciente();
  alert("Nota rapida guardada.");
}

async function cargarNotasRapidasPaciente() {
  const contenedor = document.getElementById("historialNotasRapidas");
  if (!contenedor) return;
  contenedor.textContent = "Cargando notas...";

  try {
    const notas = await listarNotasRapidas(uidPaciente);
    contenedor.innerHTML = notas.length
      ? notas.map((nota) => {
          const fecha = nota.fechaISO ? new Date(nota.fechaISO).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false }) : "Sin fecha";
          return `
            <article class="registro-card">
              <div class="registro-top">
                <div>
                  <strong>${escaparHTML(nota.medicoNombre || "Medico")}</strong>
                  <span>${escaparHTML(fecha)}</span>
                </div>
              </div>
              <p>${escaparHTML(nota.texto)}</p>
            </article>
          `;
        }).join("")
      : "<p>Aun no hay notas rapidas.</p>";
  } catch (error) {
    console.error("Error al cargar notas rapidas:", error);
    contenedor.textContent = "No se pudieron cargar las notas rapidas.";
  }
}

function configurarTamanoNotaRapida() {
  const textarea = document.getElementById("notaRapidaTexto");
  const botonContraer = document.getElementById("contraerNotaRapida");
  const botonAmpliar = document.getElementById("ampliarNotaRapida");
  if (!textarea) return;
  const clave = `cognicion_nota_rapida_altura_${uidPaciente || "global"}`;
  const aplicarAltura = (altura) => {
    textarea.style.minHeight = `${altura}px`;
    textarea.style.height = `${altura}px`;
    localStorage.setItem(clave, String(altura));
  };
  aplicarAltura(Number(localStorage.getItem(clave)) || 110);
  botonContraer?.addEventListener("click", () => aplicarAltura(90));
  botonAmpliar?.addEventListener("click", () => aplicarAltura(220));
  textarea.addEventListener("mouseup", () => {
    const altura = Math.max(90, Math.min(420, textarea.offsetHeight));
    localStorage.setItem(clave, String(altura));
  });
}

document.getElementById("guardarTratamiento")?.addEventListener("click", guardarTratamientoPaciente);
document.getElementById("limpiarTratamiento")?.addEventListener("click", limpiarFormularioTratamiento);
document.getElementById("abrirInteraccionesTratamiento")?.addEventListener("click", () => abrirInteraccionesFarmacologicas("tratamiento"));
document.getElementById("abrirInteraccionesIndicaciones")?.addEventListener("click", () => abrirInteraccionesFarmacologicas("indicaciones"));
document.getElementById("cerrarInteraccionesFarmacologicas")?.addEventListener("click", cerrarInteraccionesFarmacologicas);
document.addEventListener("click", (evento) => {
  const objetivo = evento.target instanceof Element ? evento.target : null;
  const cerrar = objetivo?.closest("#cerrarInteraccionesFarmacologicas, [data-cerrar-interacciones]");
  if (!cerrar) return;
  evento.preventDefault();
  evento.stopPropagation();
  cerrarInteraccionesFarmacologicas();
});
[
  "tratamientoMedicamento",
  "tratamientoDosis",
  "tratamientoFrecuencia",
  "cantidadTotalDia"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", actualizarDosisTotalDiaTratamiento);
  document.getElementById(id)?.addEventListener("change", (evento) => {
    if (id === "tratamientoFrecuencia") corregirCampoFrecuenciaTratamiento();
    actualizarDosisTotalDiaTratamiento(evento);
  });
});
document.getElementById("tratamientoFrecuencia")?.addEventListener("blur", corregirCampoFrecuenciaTratamiento);
document.getElementById("tratamientoCambioIndicacion")?.addEventListener("change", actualizarCampoCambioTratamiento);
document.getElementById("tratamientoCambioIndicacionTexto")?.addEventListener("input", () => ponerErrorCambioTratamiento(""));
document.getElementById("tratamientoModoFrecuencia")?.addEventListener("change", () => {
  renderizarTomasTratamiento();
});
document.getElementById("tratamientoVecesDia")?.addEventListener("change", () => {
  renderizarTomasTratamiento();
});
document.getElementById("tratamientoPresentacion")?.addEventListener("change", () => {
  sincronizarCapturaFarmacologica();
  actualizarCapturaFarmacologica();
});
document.getElementById("tratamientoFrecuenciaRapida")?.addEventListener("change", (evento) => {
  const esOtro = evento.target.value === "otro";
  const otro = document.getElementById("tratamientoFrecuenciaOtra");
  if (otro) otro.hidden = !esOtro;
  if (!esOtro && evento.target.value) ponerValor("tratamientoFrecuencia", evento.target.value);
  if (esOtro) otro?.focus();
});
document.getElementById("tratamientoFrecuenciaOtra")?.addEventListener("input", (evento) => ponerValor("tratamientoFrecuencia", evento.target.value));
document.getElementById("tratamientoDuracion")?.addEventListener("change", (evento) => {
  const esOtro = evento.target.value === "otro";
  const otro = document.getElementById("tratamientoDuracionOtra");
  if (otro) otro.hidden = !esOtro;
});
configurarCatalogoMedicamentosTratamiento();
actualizarCapturaFarmacologica();
renderizarTomasTratamiento();
configurarMenuFrecuenciaTratamiento();
document.getElementById("abrirMedicamentoManual")?.addEventListener("click", abrirMedicamentoManual);
document.getElementById("cerrarMedicamentoManual")?.addEventListener("click", cerrarMedicamentoManual);
document.getElementById("cancelarMedicamentoManual")?.addEventListener("click", cerrarMedicamentoManual);
document.getElementById("guardarMedicamentoManual")?.addEventListener("click", guardarMedicamentoManual);
document.getElementById("guardarEstudio")?.addEventListener("click", guardarEstudioPaciente);
document.getElementById("limpiarEstudio")?.addEventListener("click", limpiarFormularioEstudio);
document.getElementById("agregarEstudioSolicitud")?.addEventListener("click", agregarEstudioSolicitud);
document.getElementById("limpiarSolicitudEstudios")?.addEventListener("click", limpiarSolicitudEstudios);
document.getElementById("guardarSolicitudEstudios")?.addEventListener("click", guardarSolicitudEstudios);
document.getElementById("descargarSolicitudEstudios")?.addEventListener("click", descargarSolicitudEstudios);
document.getElementById("solicitudEstudioFormato")?.addEventListener("change", manejarCambioFormatoSolicitud);
[
  "solicitudEstudioFormato",
  "solicitudEstudioFecha",
  "solicitudEstudioCategoria",
  "solicitudEstudioNombre",
  "solicitudEstudioMotivo",
  "solicitudEstudioPrioridad",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", actualizarPreviewSolicitudEstudios);
  document.getElementById(id)?.addEventListener("change", actualizarPreviewSolicitudEstudios);
});
document.getElementById("guardarNotaRapida")?.addEventListener("click", guardarNotaRapidaPaciente);
configurarTamanoNotaRapida();
document.getElementById("guardarTareaMiSalud")?.addEventListener("click", guardarTareaMiSaludPaciente);
document.getElementById("btnGenerarCodigoPaciente")?.addEventListener("click", generarCodigoVinculacionDesdeMedico);
document.getElementById("btnVincularCodigoPaciente")?.addEventListener("click", vincularCuentaPacienteDesdeMedico);
document.getElementById("diagnosticoBusqueda")?.addEventListener("input", debouncePaciente(renderizarResultadosBusquedaDiagnosticos, 160));
document.getElementById("diagnosticoCatalogo")?.addEventListener("change", () => {
  ponerValor("diagnosticoBusqueda", "");
  renderizarResultadosBusquedaDiagnosticos();
});
document.getElementById("agregarDiagnosticoManual")?.addEventListener("click", agregarDiagnosticoManualPaciente);
document.getElementById("crearCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("nuevaCarpetaPaciente")));
document.getElementById("asignarCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("selectorCarpetasPaciente")));
document.getElementById("guardarNotaFlotante")?.addEventListener("click", guardarNotaFlotantePaciente);
document.getElementById("nuevaNotaFlotante")?.addEventListener("click", limpiarNotaFlotantePaciente);
document.getElementById("cerrarAvisoNombrePaciente")?.addEventListener("click", () => {
  sessionStorage.setItem(claveAvisoNombrePaciente(), "1");
  actualizarAvisoFormatoNombrePaciente(datosPacienteActual || {});
});
document.getElementById("guardarInterconsulta")?.addEventListener("click", guardarInterconsultaPaciente);
document.getElementById("descargarInterconsulta")?.addEventListener("click", descargarInterconsultaPaciente);
document.getElementById("guardarIndicaciones")?.addEventListener("click", guardarIndicacionesPaciente);
document.getElementById("descargarIndicaciones")?.addEventListener("click", descargarIndicacionesPaciente);
document.getElementById("actualizarTextoIndicaciones")?.addEventListener("click", actualizarTextoIndicaciones);
document.getElementById("indicacionesTexto")?.addEventListener("input", () => {
  textoIndicacionesEditado = true;
  guardarIndicacionesGeneradasParaNota();
});
configurarControlesIndicacionesGeneradas();
[
  "indicacionesDieta",
  "indicacionesCuidados",
  "indicacionesAlergias",
  "indicacionesRiesgoCaida",
  "indicacionesVigilancia",
  "indicacionesNotaMedicamentos",
  "indicacionesEventualidades"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    if (!textoIndicacionesEditado) actualizarTextoIndicaciones();
  });
});
document.getElementById("actualizarMedicamentosIndicaciones")?.addEventListener("click", async () => {
  await asegurarTratamientosCache();
  renderizarMedicamentosIndicaciones();
  actualizarTextoIndicaciones();
});
document.getElementById("agregarMedicamentoReceta")?.addEventListener("click", agregarMedicamentoReceta);
document.getElementById("actualizarTratamientoReceta")?.addEventListener("click", cargarTratamientoActivoEnReceta);
document.getElementById("guardarRecetaPaciente")?.addEventListener("click", guardarRecetaPaciente);
document.getElementById("descargarRecetaPaciente")?.addEventListener("click", descargarRecetaPaciente);
[
  "recetaFecha",
  "recetaFormato",
  "recetaVigencia",
  "recetaObservaciones"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", actualizarPreviewReceta);
  document.getElementById(id)?.addEventListener("change", actualizarPreviewReceta);
});
document.querySelectorAll("[data-catalogo-indicaciones]").forEach((boton) => {
  boton.addEventListener("click", () => {
    agregarValorCatalogoIndicaciones(
      boton.dataset.catalogoIndicaciones,
      boton.dataset.inputCatalogo
    );
  });
});
document.querySelectorAll("[data-firma-indicaciones-nombre]").forEach((campo) => {
  campo.addEventListener("change", () => {
    const numeroFirma = campo.dataset.firmaIndicacionesNombre;
    const medico = buscarMedicoFirmaIndicacionesPorNombre(campo.value);
    if (medico) aplicarMedicoFirmaIndicaciones(numeroFirma, medico);
  });
});
document.querySelectorAll("[data-firma-indicaciones-select]").forEach((selector) => {
  selector.addEventListener("change", () => {
    aplicarMedicoFirmaIndicacionesPorId(
      selector.dataset.firmaIndicacionesSelect,
      selector.value
    );
  });
});
document.querySelectorAll("[data-guardar-medico-indicaciones]").forEach((boton) => {
  boton.addEventListener("click", () => guardarMedicoFirmaIndicaciones(boton.dataset.guardarMedicoIndicaciones));
});
document.getElementById("cerrarIngresoPaciente")?.addEventListener("click", cerrarSelectorIngresoPaciente);
document.getElementById("guardarIngresoPaciente")?.addEventListener("click", guardarIngresoPacienteDesdeModal);
document.getElementById("limpiarIngresoPaciente")?.addEventListener("click", limpiarIngresoPacienteDesdeModal);
document.getElementById("modalIngresoPaciente")?.addEventListener("click", (e) => {
  if (e.target.id === "modalIngresoPaciente") cerrarSelectorIngresoPaciente();
});
document.getElementById("modalMedicamentoManual")?.addEventListener("click", (e) => {
  if (e.target.id === "modalMedicamentoManual") cerrarMedicamentoManual();
});
document.getElementById("modalInteraccionesFarmacologicas")?.addEventListener("click", (e) => {
  if (e.target.id === "modalInteraccionesFarmacologicas") cerrarInteraccionesFarmacologicas();
});

async function generarCodigoVinculacionDesdeMedico() {
  const contenedor = document.getElementById("codigoVinculacionMedico");
  if (!auth.currentUser || !uidPaciente) return;

  try {
    const codigo = await crearCodigoExpedienteParaPaciente(uidPaciente, auth.currentUser.uid);
    if (contenedor) contenedor.textContent = codigo;

    await registrarAccionExpediente({
      accion: "generar_codigo_vinculacion_paciente",
      descripcion: "El medico genero un codigo para vincular el expediente con la cuenta del paciente.",
      detalles: { codigo }
    });
  } catch (error) {
    alert("No se pudo generar el codigo: " + error.message);
  }
}

async function vincularCuentaPacienteDesdeMedico() {
  const input = document.getElementById("codigoPacienteParaMedico");
  const codigo = input?.value.trim().toUpperCase();

  if (!codigo) {
    alert("Escribe el codigo entregado por el paciente.");
    return;
  }

  if (!confirm("Vincular este expediente con la cuenta del paciente?")) return;

  try {
    const resultado = await vincularExpedienteConCodigoPaciente(
      codigo,
      uidPaciente,
      auth.currentUser?.uid || ""
    );

    await registrarAccionExpediente({
      accion: "vincular_expediente_con_cuenta_paciente",
      descripcion: "El medico vinculo un expediente previo con una cuenta de paciente.",
      detalles: {
        codigo,
        pacienteCuentaUid: resultado.pacienteUid,
        expedientePrevioUid: resultado.expedientePrevioUid
      }
    });

    alert("Cuenta vinculada correctamente.");
    window.location.href = `paciente.html?id=${resultado.pacienteUid}`;
  } catch (error) {
    alert("No se pudo vincular la cuenta: " + error.message);
  }
}

async function registrarAccionExpediente({ accion, descripcion, detalles = {} }) {
  if (modoNuevoPacienteDraft()) return;
  const usuario = auth.currentUser;
  if (!usuario) return;

  const medico = await obtenerUsuario(usuario.uid);
  const paciente = datosPacienteActual || await obtenerUsuario(uidPaciente);

  await registrarEventoAuditoria({
    accion,
    modulo: "Expediente paciente",
    descripcion,
    usuarioUid: usuario.uid,
    usuarioNombre: medico?.nombre || usuario.email || "",
    usuarioRol: medico?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: paciente?.nombre || "",
    exito: true,
    detalles
  });
}

window.inicializarPacienteClinicoDraft = function({ datosPaciente = {}, medico = {}, rol = "" } = {}) {
  const draft = asegurarEstructuraDraftClinico();
  uidPaciente = ID_PACIENTE_BORRADOR_NUEVO;
  medicoActualDatos = medico || {};
  rolUsuarioActual = rol || medicoActualDatos?.rol || "medico";
  permisosFormatosUsuarioActual = {};
  if (draft) {
    draft.datosPersonales = {
      ...(draft.datosPersonales || {}),
      ...(datosPaciente || {})
    };
    tratamientosCache = (draft.tratamiento.medicamentos || []).map(normalizarTratamientoFrecuenciaPaciente);
    tratamientosCachePatientId = ID_PACIENTE_BORRADOR_NUEVO;
    tratamientosCacheCargado = true;
    indicacionesPacienteCache = draft.tratamiento.indicaciones || [];
    indicacionResumenCacheCargada = true;
    indicacionResumenCachePacienteId = ID_PACIENTE_BORRADOR_NUEVO;
  }
  sincronizarDatosPacienteDesdeDraft();
  ordenarTratamientoEIndicaciones();
  renderizarPanelDiagnosticos();
  renderizarResultadosBusquedaDiagnosticos();
  configurarCatalogoMedicamentosTratamiento();
  renderizarCatalogosIndicaciones();
  if (!draftClinicoNuevoInicializado) {
    limpiarFormularioTratamiento();
    draftClinicoNuevoInicializado = true;
  }
  renderizarMedicamentosIndicaciones();
  autollenarIndicaciones();
  cargarTratamientosPaciente();
  cargarIndicacionesPaciente();
};

window.obtenerEstadoClinicoDraftPaciente = function() {
  const draft = asegurarEstructuraDraftClinico();
  if (!draft) return null;
  sincronizarDraftTratamientoResumen();
  const indicacionActual = datosIndicacionesFormulario();
  if (indicacionActual.indicaciones) {
    draft.indicacionesEstructuradas = indicacionActual;
    draft.datosClinicosResumen = {
      ...(draft.datosClinicosResumen || {}),
      indicaciones: indicacionActual
    };
  }
  return {
    diagnosticos: draft.diagnosticos || [],
    tratamiento: draft.tratamiento || { medicamentos: [], indicaciones: [] },
    datosClinicosResumen: draft.datosClinicosResumen || {},
    indicacionesEstructuradas: draft.indicacionesEstructuradas || null
  };
};

if (!modoNuevoPacienteDraft()) {
  iniciarCargaExpedientePaciente();
  cargarReporteGlobalDiferido();
}
