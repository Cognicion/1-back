import { auth, db } from "./firebase.js";
import { ESCALAS_PSIQUIATRICAS } from "./data/escalasPsiquiatricas.js";
import { ESCALAS_COGNITIVAS } from "./data/escalasCognitivas.js";
import {
  crearResumenEscala,
  formatearFechaEscala,
  listarEscalasAplicadas
} from "./services/escalas.js";
import { MEDICAMENTOS_PRESENTACIONES } from "./data/medicamentos.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { detectarInteraccionesFarmacologicas } from "./data/interaccionesFarmacologicas.js";
import {
  aplicarPermisosFormatosPagina,
  obtenerPermisosFormatosUsuario,
  usuarioPuedeUsarFormato
} from "./services/formatosInstitucionales.js";
import {
  obtenerTemaLocalCognicion,
  TEMAS_COGNICION
} from "./services/apariencia.js";
import { calcularEdadPediatrica } from "./pediatria/edad.js";
import {
  calcularIMC as calcularIMCPediatrico,
  mantenimientoHollidaySegar,
  superficieCorporal
} from "./pediatria/formulas.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
  actualizarUsuario,
  solicitarEliminacionPaciente,
  buscarMedicoPorCorreo,
  otorgarPermisoMedico,
  listarPermisosMedicos,
  cambiarRolPermisoMedico,
  revocarPermisoMedico
} from "./services/usuarios.js";

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

import {
  crearNotaRapida,
  listarNotasRapidas
} from "./services/notasRapidas.js";

import {
  crearCodigoExpedienteParaPaciente,
  vincularExpedienteConCodigoPaciente
} from "./services/vinculacion.js";

let uidPaciente = "";
let datosPacienteActual = null;
let medicoActualDatos = {};
let rolUsuarioActual = "";
let permisosFormatosUsuarioActual = {};
let tratamientosCache = [];
let estudiosCache = [];
let escalasAsignadasCache = new Map();
let diagnosticosCatalogoActual = [];
let diagnosticoReemplazoIndex = null;
let intervaloEstanciaPaciente = null;
let campoFechaIngresoModal = "fechaIngreso";
let textoIndicacionesEditado = false;
let apuntesMedicoPacienteCache = [];
let catalogoMedicosFirmasIndicacionesCache = [];
let indicacionesPacienteCache = [];
let medicamentosRecetaActual = [];
const VISTAS_DATOS_GENERALES_PACIENTE = Object.freeze({
  CLASICA: "clasica",
  LABORATORIO: "laboratorio"
});
let estudiosSolicitudActual = [];
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";
let catalogoManualDiagnosticos = cargarCatalogoManualDiagnosticos();
const CLAVE_MEDICAMENTOS_MANUALES = "cognicion_catalogo_medicamentos_manual";
let catalogoManualMedicamentos = cargarCatalogoManualMedicamentos();
const CLAVE_CATALOGOS_INDICACIONES = "cognicion_catalogos_indicaciones";
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

iniciarMonitoreoSesion("Expediente paciente");

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
    const estado = diagnostico.estado ? ` — ${diagnostico.estado}` : "";
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
    partes.push(`${estancia.dias} dia${estancia.dias === 1 ? "" : "s"}`);
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

  return hora ? `${partes[2]}-${partes[1]}-${partes[0]} ${hora}` : `${partes[2]}-${partes[1]}-${partes[0]}`;
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
  const tema = obtenerTemaLocalCognicion();
  return tema === TEMAS_COGNICION.LABORATORIO
    ? VISTAS_DATOS_GENERALES_PACIENTE.LABORATORIO
    : VISTAS_DATOS_GENERALES_PACIENTE.CLASICA;
}

function obtenerVistaDatosGeneralesPaciente() {
  try {
    const guardada = localStorage.getItem(claveVistaDatosGeneralesPaciente());
    return Object.values(VISTAS_DATOS_GENERALES_PACIENTE).includes(guardada)
      ? guardada
      : vistaInicialDatosGeneralesPaciente();
  } catch (error) {
    return vistaInicialDatosGeneralesPaciente();
  }
}

function guardarVistaDatosGeneralesPaciente(vista) {
  const vistaSegura = Object.values(VISTAS_DATOS_GENERALES_PACIENTE).includes(vista)
    ? vista
    : VISTAS_DATOS_GENERALES_PACIENTE.CLASICA;
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
  const diagnosticos = obtenerHistorialDiagnosticos(datos)
    .map((dx) => formatearDiagnostico(dx))
    .filter((dx) => dx && dx !== "Sin diagnostico");
  return diagnosticos.length ? diagnosticos : ["Sin diagnostico registrado"];
}

function listaTratamientosLaboratorio(datos = datosPacienteActual || {}) {
  const activos = tratamientosCache
    .filter((tratamiento) => (tratamiento.estado || "activo").toLowerCase() === "activo")
    .map((tratamiento) => tratamiento.medicamento || tratamiento.nombre || tratamiento.texto)
    .filter(Boolean);
  if (activos.length) return activos;
  const resumen = datos.tratamiento || datos.tratamientoActual || datos.datosClinicosResumen?.tratamiento;
  return resumen ? [resumen] : ["Sin tratamiento activo registrado"];
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
  return eventos.length ? eventos : [{ etiqueta: "Seguimiento", valor: "Sin eventos cronologicos registrados" }];
}

function renderizarListaLab(items) {
  return items.map((item) => `<li>${escaparHTML(item)}</li>`).join("");
}

function renderizarVistaLaboratorioPaciente(datos = datosPacienteActual || {}) {
  const contenedor = document.getElementById("datosGeneralesLaboratorio");
  if (!contenedor || !datos) return;

  const fechaIngreso = obtenerFechaIngreso(datos);
  const edad = calcularEdad(obtenerFechaNacimiento(datos));
  const diagnosticos = listaDiagnosticosLaboratorio(datos);
  const tratamientos = listaTratamientosLaboratorio(datos);
  const estudios = listaEstudiosLaboratorio(datos);
  const timeline = listaTimelineLaboratorio(datos);
  const organos = [
    ["cerebro", "Cerebro", "Diagnosticos, escalas cognitivas, sintomas y evolucion clinica registrada."],
    ["ojos", "Ojos", "Hallazgos visuales, efectos adversos o estudios oftalmologicos si existen."],
    ["tiroides", "Tiroides", "Datos tiroideos, peso, energia, apetito y laboratorios endocrinos registrados."],
    ["corazon", "Corazon", "Frecuencia cardiaca, presion arterial y riesgos cardiovasculares documentados."],
    ["pulmon", "Pulmones", "Frecuencia respiratoria, saturacion y antecedentes respiratorios si existen."],
    ["higado", "Higado", "Metabolismo farmacologico, consumo de sustancias y resultados hepaticos registrados."],
    ["rinon", "Rinones", "Funcion renal, hidratacion y ajustes farmacologicos si hay estudios registrados."],
    ["pancreas", "Pancreas", "Glucosa, metabolismo, apetito y datos endocrino-metabolicos disponibles."],
    ["estomago", "Estomago", "Tolerancia oral, apetito, nausea, dolor o sintomas gastrointestinales registrados."],
    ["intestinos", "Intestinos", "Habito intestinal, nutricion, efectos adversos y sintomas digestivos registrados."],
    ["vascular", "Sistema vascular", "Presion arterial, perfusion, edema, riesgo vascular y eventos relacionados."],
    ["nervioso", "Sistema nervioso", "Exploracion neurologica, movimientos, sensibilidad y funcionamiento cognitivo."],
    ["columna", "Columna", "Dolor, movilidad, lesiones medulares o datos musculoesqueleticos registrados."],
    ["piel", "Piel", "Lesiones, alergias, eventos adversos o hallazgos cutaneos registrados."],
    ["musculo", "Musculos", "Movilidad, dolor, caidas, funcionalidad y rehabilitacion."],
    ["extremidades", "Extremidades", "Marcha, movilidad, fuerza, caidas, lesiones o edema documentado."],
    ["sangre", "Hematologico", "Tipo de sangre, biometria, anemias o alteraciones registradas."]
  ];

  contenedor.innerHTML = `
    <div class="lab-paciente-shell">
      <div class="lab-paciente-top">
        <div>
          <span class="lab-kicker">Vista Laboratorio</span>
          <h3>${escaparHTML(datos.nombre || "Paciente sin nombre")}</h3>
          <p>Lectura visual del expediente con datos reales. Los campos vacios se muestran como sin registro.</p>
        </div>
        <div class="lab-paciente-id">
          <span>Expediente</span>
          <strong>${escaparHTML(valorPaciente(datos, ["expedienteCognicion", "datosInstitucionales.expedienteCognicion"], "Sin expediente"))}</strong>
        </div>
      </div>

      <div class="lab-metricas-panel lab-metricas-sin-modelo">
          <div class="lab-gauge principal">
            <span>Edad</span>
            <strong>${edad !== "" ? `${escaparHTML(edad)} años` : "Sin registro"}</strong>
          </div>
          <div class="lab-gauge">
            <span>PA</span>
            <strong>${escaparHTML(valorPaciente(datos, ["presionArterial", "signosVitales.presionArterial", "datosInstitucionales.presionArterial"], "Sin registro"))}</strong>
          </div>
          <div class="lab-gauge">
            <span>FC</span>
            <strong>${escaparHTML(valorPaciente(datos, ["frecuenciaCardiaca", "signosVitales.frecuenciaCardiaca"], "Sin registro"))}</strong>
          </div>
          <div class="lab-gauge">
            <span>SpO2</span>
            <strong>${escaparHTML(valorPaciente(datos, ["saturacionO2", "saturacionOxigeno", "signosVitales.saturacionO2", "signosVitales.saturacionOxigeno"], "Sin registro"))}</strong>
          </div>
          <div class="lab-gauge">
            <span>IMC</span>
            <strong>${escaparHTML(valorPaciente(datos, ["imc", "somatometria.imc", "signosVitales.imc", "datosInstitucionales.imc"], "Sin registro"))}</strong>
          </div>
        </div>

      <div class="lab-info-grid">
        <article class="lab-card">
          <span>Identificacion</span>
          <p><b>Sexo:</b> ${escaparHTML(valorPaciente(datos, ["sexo"]))}</p>
          <p><b>Genero:</b> ${escaparHTML(valorPaciente(datos, ["genero", "identidadGenero"]))}</p>
          <p><b>Tipo:</b> ${escaparHTML(etiquetaTipoPaciente(datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente))}</p>
        </article>
        <article class="lab-card">
          <span>Institucion</span>
          <p><b>Institucion:</b> ${escaparHTML(valorPaciente(datos, ["institucionPaciente", "institucion"]))}</p>
          <p><b>Servicio:</b> ${escaparHTML(valorPaciente(datos, ["servicioInstitucional", "servicio"]))}</p>
          <p><b>Cama:</b> ${escaparHTML(valorPaciente(datos, ["cama"]))}</p>
        </article>
        <article class="lab-card">
          <span>Ingreso</span>
          <p><b>Fecha:</b> ${escaparHTML(formatearFecha(fechaIngreso))}</p>
          <p><b>Estancia:</b> <span id="labEstanciaPaciente">${escaparHTML(formatearEstancia(calcularDiasEstancia(fechaIngreso)))}</span></p>
          <p><b>Ultimo ingreso:</b> ${escaparHTML(formatearFecha(obtenerUltimoIngreso(datos)))}</p>
        </article>
        <article class="lab-card">
          <span>Somatometria</span>
          <p><b>Peso:</b> ${escaparHTML(valorPaciente(datos, ["peso", "somatometria.peso", "signosVitales.peso", "datosInstitucionales.peso"]))}</p>
          <p><b>Talla:</b> ${escaparHTML(valorPaciente(datos, ["talla", "somatometria.talla", "signosVitales.talla", "datosInstitucionales.talla"]))}</p>
          <p><b>Perimetro:</b> ${escaparHTML(valorPaciente(datos, ["perimetroAbdominal", "somatometria.perimetroAbdominal"]))}</p>
        </article>
        <article class="lab-card lab-card-lista">
          <span>Diagnosticos</span>
          <ul>${renderizarListaLab(diagnosticos)}</ul>
        </article>
        <article class="lab-card lab-card-lista">
          <span>Tratamiento activo</span>
          <ul>${renderizarListaLab(tratamientos)}</ul>
        </article>
        <article class="lab-card lab-card-lista">
          <span>Estudios</span>
          <ul>${renderizarListaLab(estudios)}</ul>
        </article>
        <article class="lab-card lab-card-lista">
          <span>Linea clinica</span>
          <ul>${timeline.map((item) => `<li><b>${escaparHTML(item.etiqueta)}:</b> ${escaparHTML(item.valor)}</li>`).join("")}</ul>
        </article>
      </div>
    </div>
  `;
}

function obtenerPesoPaciente(datos = {}) {
  return datos.peso || datos.signosVitales?.peso || datos.somatometria?.peso || datos.datosInstitucionales?.peso || "";
}

function obtenerTallaPaciente(datos = {}) {
  return datos.talla || datos.signosVitales?.talla || datos.somatometria?.talla || datos.datosInstitucionales?.talla || "";
}

function renderizarResumenPediatricoPaciente(datos = datosPacienteActual || {}) {
  const bloque = document.getElementById("resumenPediatriaPaciente");
  const boton = document.getElementById("btnPediatriaPaciente");
  if (!bloque) return;

  const edad = calcularEdadPediatrica(obtenerFechaNacimiento(datos));
  const esPediatrico = Boolean(edad && edad.anos < 18);

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
      Pediatria
      <button class="boton-editar-dato" onclick="abrirModuloPediatriaPaciente()">Abrir modulo</button>
    </label>
    <div class="pediatria-resumen-grid">
      <span><b>Edad exacta</b>${escaparHTML(edad.edadCronologicaTexto)}</span>
      <span><b>Dia de vida</b>${escaparHTML(String(edad.diaDeVida))}</span>
      <span><b>IMC</b>${imc ? imc.toFixed(2) : "Sin calcular"}</span>
      <span><b>SC Mosteller</b>${sc ? `${sc.mosteller.toFixed(2)} m2` : "Sin calcular"}</span>
      <span><b>Mantenimiento</b>${liquidos ? `${liquidos.mlDia.toFixed(0)} mL/dia` : "Sin peso"}</span>
      <span><b>Regla 4-2-1</b>${liquidos ? `${liquidos.regla421.toFixed(1)} mL/h` : "Sin peso"}</span>
    </div>
    <small>Los percentiles se calculan solo con tablas LMS oficiales cargadas en Pediatria.</small>
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
  const vistaSegura = Object.values(VISTAS_DATOS_GENERALES_PACIENTE).includes(vista)
    ? vista
    : VISTAS_DATOS_GENERALES_PACIENTE.CLASICA;
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

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function referenciaCatalogoMedicosFirmasIndicaciones() {
  const uidMedico = auth.currentUser?.uid;
  if (!uidMedico) return null;
  return collection(db, "usuarios", uidMedico, "catalogoMedicosFirmas");
}

function renderizarCatalogoMedicosFirmasIndicaciones() {
  const datalist = document.getElementById("catalogoMedicosFirmasIndicaciones");
  const opciones = catalogoMedicosFirmasIndicacionesCache
    .map((medico) => {
      const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<option value="${escaparHTML(medico.nombre || "")}" label="${escaparHTML(detalle)}"></option>`;
    })
    .join("");

  if (datalist) datalist.innerHTML = opciones;

  [1, 2, 3].forEach((numeroFirma) => {
    const selector = document.getElementById(`indicacionesFirma${numeroFirma}Catalogo`);
    const valorActual = selector?.value || "";
    if (!selector) return;

    selector.innerHTML = `
      <option value="">Seleccionar medico</option>
      ${catalogoMedicosFirmasIndicacionesCache.map((medico) => {
        const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
          .filter(Boolean)
          .join(" · ");
        return `<option value="${escaparHTML(medico.id)}">${escaparHTML(medico.nombre || "Sin nombre")}${detalle ? ` · ${escaparHTML(detalle)}` : ""}</option>`;
      }).join("")}
    `;
    selector.value = valorActual;
  });
}

async function cargarCatalogoMedicosFirmasIndicaciones() {
  const ref = referenciaCatalogoMedicosFirmasIndicaciones();
  if (!ref) return;

  const snap = await getDocs(query(ref, orderBy("nombre")));
  catalogoMedicosFirmasIndicacionesCache = snap.docs.map((docMedico) => ({
    id: docMedico.id,
    ...docMedico.data()
  }));

  renderizarCatalogoMedicosFirmasIndicaciones();
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
    alert("No se pudo identificar al medico para guardar el catalogo.");
    return;
  }

  if (!nombre) {
    alert("Escribe el nombre del medico antes de agregarlo al catalogo.");
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
    const confirmar = confirm("Este medico ya existe en el catalogo. ¿Deseas actualizar cargo y cedula?");
    if (!confirmar) return;
    await updateDoc(doc(db, "usuarios", uidMedico, "catalogoMedicosFirmas", existente.id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      creadoEn: serverTimestamp()
    });
  }

  await cargarCatalogoMedicosFirmasIndicaciones();
  alert("Medico agregado al catalogo de firmas.");
}

function referenciaApuntesMedicoPaciente() {
  const uidMedico = auth.currentUser?.uid;
  if (!uidMedico) return null;
  return collection(db, "usuarios", uidMedico, "apuntesMedico");
}

function ponerEstadoApuntesPaciente(texto) {
  const estado = document.getElementById("estadoApuntesMedicoPaciente");
  if (estado) estado.textContent = texto;
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
    lista.innerHTML = `<p class="apuntes-vacio-paciente">No se encontraron apuntes.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map((apunte) => `
    <button type="button" class="apunte-paciente-item ${apunte.id === activo ? "activo" : ""}" data-apunte-paciente="${apunte.id}">
      <strong>${escaparHTML(apunte.titulo || "Apunte sin titulo")}</strong>
      <span>${escaparHTML((apunte.contenido || "").slice(0, 92))}</span>
    </button>
  `).join("");

  lista.querySelectorAll("[data-apunte-paciente]").forEach((boton) => {
    boton.addEventListener("click", () => seleccionarApunteMedicoPaciente(boton.dataset.apuntePaciente));
  });
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

  const renderizarCatalogo = () => {
    lista.innerHTML = catalogoMedicamentosTratamiento()
    .map((medicamento) => `
      <option
        value="${escaparHTML(medicamento.texto)}"
        label="${escaparHTML(`${medicamento.agregadoManual ? "Agregado manualmente · " : ""}${medicamento.clase || "Sin clase"} · ${medicamento.dosisHabitual || "Sin dosis habitual"}`)}"
      ></option>
    `)
    .join("");
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
    );
    estado.textContent = existe
      ? "Medicamento encontrado en catálogo."
      : "No está en el catálogo. Puedes añadirlo manualmente.";
    estado.classList.add("visible");
    estado.classList.toggle("alerta", !existe);
  };

  renderizarCatalogo();

  campo.addEventListener("change", () => {
    const seleccionado = catalogoMedicamentosTratamiento().find((medicamento) =>
      medicamento.texto.toLowerCase() === campo.value.trim().toLowerCase()
    );

    if (seleccionado) campo.value = seleccionado.texto;
    actualizarEstado();
  });

  campo.addEventListener("input", actualizarEstado);

  document.addEventListener("catalogoMedicamentosActualizado", () => {
    renderizarCatalogo();
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
          label="${escaparHTML(`${medicamento.agregadoManual ? "Agregado manualmente · " : ""}${medicamento.clase || "Medicamento"}`)}"
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
    alert("Escribe medicamento y presentación.");
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

const ESTADOS_DIAGNOSTICO = [
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

function estadoDiagnosticoValido(estado) {
  return ESTADOS_DIAGNOSTICO.includes(estado) ? estado : ESTADOS_DIAGNOSTICO[0];
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
      estado: ESTADOS_DIAGNOSTICO[0],
      orden: index
    };
    return { ...base, id: crearIdDiagnostico(base, index) };
  }

  const catalogo = diagnostico.catalogo || catalogoFallback;
  const nombre = diagnostico.nombre || diagnostico.texto || diagnostico.descripcion || "";
  const orden = Number.isFinite(Number(diagnostico.orden)) ? Number(diagnostico.orden) : index;
  const normalizado = {
    id: diagnostico.id || "",
    codigo: diagnostico.codigo || "",
    nombre,
    texto: diagnostico.texto || `${diagnostico.codigo || ""}${diagnostico.codigo && nombre ? " - " : ""}${nombre}`.trim() || nombre,
    catalogo,
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString(),
    estado: estadoDiagnosticoValido(diagnostico.estado),
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

function renderizarDiagnosticos(datos) {
  const diagnosticoDiv = document.getElementById("diagnostico");

  if (!diagnosticoDiv) return;

  diagnosticoDiv.innerHTML = "";

  const historial = obtenerHistorialDiagnosticos(datos);
  const principal = historial[0] || (datos.diagnostico ? normalizarDiagnostico(datos.diagnostico, datos.diagnostico?.catalogo || "CIE-10") : "");

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

  const texto = buscador.value.trim().toLowerCase();

  if (!texto) {
    contenedor.textContent = diagnosticoReemplazoIndex === null
      ? "Escribe para buscar en el catalogo."
      : "Busca el diagnostico que sustituira al seleccionado.";
    return;
  }

  diagnosticosCatalogoActual = obtenerCatalogoDiagnostico()
    .filter((dx) => `${dx.codigo} ${dx.nombre}`.toLowerCase().includes(texto))
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
    boton.addEventListener("click", () => agregarDiagnosticoPaciente(Number(boton.dataset.agregarDiagnostico)));
  });
}

function opcionesEstadoDiagnostico(estadoActual = ESTADOS_DIAGNOSTICO[0]) {
  return ESTADOS_DIAGNOSTICO.map((estado) => `
    <option value="${escaparHTML(estado)}" ${estado === estadoActual ? "selected" : ""}>${escaparHTML(estado)}</option>
  `).join("");
}

function renderizarPanelDiagnosticos() {
  const contenedor = document.getElementById("panelDiagnosticosPaciente");
  if (!contenedor) return;

  const historial = obtenerHistorialDiagnosticos();

  if (!historial.length) {
    contenedor.innerHTML = "<p>Aun no hay diagnosticos registrados.</p>";
    return;
  }

  contenedor.innerHTML = historial.map((dx, index) => {
    const esPrincipal = index === 0;
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
              ${opcionesEstadoDiagnostico(dx.estado)}
            </select>
          </label>
          <button type="button" data-mover-diagnostico="${index}" data-direccion="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-mover-diagnostico="${index}" data-direccion="1" ${index === historial.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-reemplazar-diagnostico="${index}">Cambiar por catalogo</button>
          <button type="button" data-editar-diagnostico="${index}">Editar codigo/texto</button>
          <button type="button" class="boton-peligro" data-quitar-diagnostico="${index}">Quitar</button>
        </div>
      </article>
    `;
  }).join("");

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
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const parametros = new URLSearchParams(window.location.search);
  uidPaciente = parametros.get("id");
  medicoActualDatos = await obtenerUsuario(user.uid) || {};
  rolUsuarioActual = medicoActualDatos.rol || "";
  permisosFormatosUsuarioActual = await obtenerPermisosFormatosUsuario(user.uid, medicoActualDatos);
  aplicarPermisosFormatosPaciente();
  aplicarRestriccionesRolExpediente();

  await cargarDatosPaciente();
});


function formatoInstitucionalPermitidoPaciente(valor = "") {
  return usuarioPuedeUsarFormato(valor, permisosFormatosUsuarioActual, rolUsuarioActual);
}

function aplicarPermisosFormatosPaciente() {
  aplicarPermisosFormatosPagina([
    ["#interconsultaFormato", "cognicion", "Cognicion"],
    ["#indicacionesFormato", "cognicion", "Cognicion"],
    ["#recetaFormato", "cognicion", "Cognicion - Receta general"],
    ["#solicitudEstudioFormato", "cognicion", "Cognicion - Solicitud general"]
  ], permisosFormatosUsuarioActual, { rol: rolUsuarioActual });
}

function alertaFormatoNoAutorizado() {
  alert("No tienes autorizacion para usar este formato institucional. Solicita acceso al administrador.");
}
function usuarioEsPsicologo() {
  return rolUsuarioActual === "psicologo";
}

function aplicarRestriccionesRolExpediente() {
  const ocultarTratamiento = usuarioEsPsicologo();
  document.getElementById("btnTratamientoPaciente")?.classList.toggle("oculto", ocultarTratamiento);
  document.getElementById("datoResumenTratamiento")?.classList.toggle("oculto", ocultarTratamiento);
  document.getElementById("seccionTratamiento")?.classList.toggle("oculto", ocultarTratamiento);
}

function normalizarTipoPaciente(valor = "") {
  return String(valor || "").trim().toLowerCase();
}

function esTipoPacienteInstitucional(valor = "") {
  const tipo = normalizarTipoPaciente(valor);
  return tipo === "institucion" || tipo === "institucional" || tipo === "paciente de institucion";
}

function etiquetaTipoPaciente(valor = "") {
  const tipo = normalizarTipoPaciente(valor);
  if (tipo === "privada" || tipo === "privado" || tipo === "consulta privada") return "Privado";
  if (esTipoPacienteInstitucional(valor)) return "Institucional";
  if (tipo === "clinica" || tipo === "clínica") return "Clinica";
  return String(valor || "").trim() || "Privado";
}

function actualizarVisibilidadCamposInstitucionalesPaciente(datos = datosPacienteActual || {}) {
  const mostrar = esTipoPacienteInstitucional(datos?.tipoPaciente || datos?.datosInstitucionales?.tipoPaciente);
  document.querySelectorAll(".campo-institucional-paciente").forEach((campo) => {
    campo.classList.toggle("oculto", !mostrar);
  });
}

async function cargarDatosPaciente() {
  const datos = await obtenerUsuario(uidPaciente);
  datosPacienteActual = datos;

  if (!datos) {
    document.getElementById("nombrePaciente").innerText =
      "Paciente no encontrado";
    return;
  }

  document.getElementById("nombrePaciente").innerText =
    datos.nombre || "Paciente sin nombre";

  document.getElementById("correoPaciente").innerText =
    datos.email || "Sin correo";

  document.getElementById("expedienteCognicionPaciente").innerText =
    datos.expedienteCognicion ||
    datos.datosInstitucionales?.expedienteCognicion ||
    "Sin expediente";

  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edadCalculada = calcularEdad(fechaNacimiento);

  const edadVisible = edadCalculada !== "" && edadCalculada !== null && edadCalculada !== undefined
  ? edadCalculada
  : "";

  document.getElementById("fechaNacimientoPaciente").innerText =
  formatearFecha(fechaNacimiento);

  document.getElementById("edadPaciente").innerText =
  edadVisible !== "" && edadVisible !== null && edadVisible !== undefined
    ? `${edadVisible} a\u00f1os`
    : "No registrada";

  if (fechaNacimiento && datos.fechaNacimiento !== fechaNacimiento) {
    await actualizarUsuario(uidPaciente, {
      fechaNacimiento,
      edad: deleteField(),
      "datosInstitucionales.edad": deleteField()
    });
    datos.fechaNacimiento = fechaNacimiento;
    delete datos.edad;
    if (datos.datosInstitucionales) delete datos.datosInstitucionales.edad;
    datosPacienteActual = datos;
  }

  renderizarDiagnosticos(datos);
  renderizarPanelDiagnosticos();

  document.getElementById("tratamiento").innerText =
    datos.tratamiento || "Sin tratamiento registrado";

  document.getElementById("medicoTratante").innerText =
    datos.medicoTratante || "Sin médico tratante";

  document.getElementById("ultimaConsulta").innerText =
    formatearFecha(datos.ultimaConsulta) || "Sin fecha";

  document.getElementById("proximaConsulta").textContent =
    datos.proximaConsulta ? formatearFecha(datos.proximaConsulta) : "Sin programar";

  document.getElementById("telefonoPaciente").innerText =
    datos.telefono || "Sin tel\u00e9fono";

  document.getElementById("tipoPaciente").innerText =
    etiquetaTipoPaciente(datos.tipoPaciente || datos.datosInstitucionales?.tipoPaciente);

  document.getElementById("institucionPaciente").innerText =
    datos.institucionPaciente || datos.institucion || "Sin institucion";

  document.getElementById("servicioInstitucional").innerText =
    datos.servicioInstitucional || datos.servicio || "Sin servicio";

  document.getElementById("expedientePaciente").innerText =
    datos.expediente || datos.numeroExpediente || "Sin expediente";

  document.getElementById("camaPaciente").innerText =
    datos.cama || "Sin cama";

  document.getElementById("curpPaciente").innerText =
    datos.curp || datos.datosInstitucionales?.curp || "Sin registro";

  actualizarEstanciaPaciente(datos);
  iniciarActualizacionEstanciaPaciente();

  document.getElementById("ultimoIngresoPaciente").innerText =
    formatearFecha(obtenerUltimoIngreso(datos));

  document.getElementById("medicoAdscritoEncargadoPaciente").innerText =
    datos.medicoAdscritoEncargado ||
    datos.datosInstitucionales?.medicoAdscritoEncargado ||
    datos.medicoAdscrito ||
    "Sin registro";

  document.getElementById("residenteEncargadoPaciente").innerText =
    datos.residenteEncargado ||
    datos.datosInstitucionales?.residenteEncargado ||
    datos.medicoResidente ||
    "Sin registro";

  document.getElementById("sexoPaciente").innerText =
    datos.sexo || "Sin registro";

  document.getElementById("generoPaciente").innerText =
    datos.genero || datos.identidadGenero || "Sin registro";

  document.getElementById("alergiasPaciente").innerText =
    datos.alergias || datos.datosInstitucionales?.alergias || "Sin registro";

  document.getElementById("tipoSangrePaciente").innerText =
    datos.tipoSangre || datos.datosInstitucionales?.tipoSangre || "Sin registro";

  document.getElementById("pesoPaciente").innerText =
    datos.peso || datos.signosVitales?.peso || datos.somatometria?.peso || datos.datosInstitucionales?.peso || "Sin registro";

  document.getElementById("tallaPaciente").innerText =
    datos.talla || datos.signosVitales?.talla || datos.somatometria?.talla || datos.datosInstitucionales?.talla || "Sin registro";

  document.getElementById("perimetroAbdominalPaciente").innerText =
    datos.perimetroAbdominal || datos.signosVitales?.perimetroAbdominal || datos.somatometria?.perimetroAbdominal || datos.datosInstitucionales?.perimetroAbdominal || "Sin registro";

  document.getElementById("imcPaciente").innerText =
    datos.imc || datos.signosVitales?.imc || datos.somatometria?.imc || datos.datosInstitucionales?.imc || "Sin registro";

  actualizarEstanciaPaciente(datos);
  actualizarVisibilidadCamposInstitucionalesPaciente(datos);
  inicializarSelectorVistaDatosGeneralesPaciente();
  renderizarVistaLaboratorioPaciente(datos);
  renderizarResumenPediatricoPaciente(datos);
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
  await cargarTratamientosPaciente();
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
  if (!valorCampo("solicitudEstudioFecha")) ponerValor("solicitudEstudioFecha", fechaISOHoy());
  if (!valorCampo("solicitudEstudioSolicita")) {
    ponerValor("solicitudEstudioSolicita", medicoActualDatos?.nombre || datosPacienteActual?.medicoTratante || "");
  }
  configurarSolicitudEstudios();
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
  const respuestas = (escala.respuestasPorItem || []).map((respuesta) => `
    <li>
      <strong>${escaparHTML(respuesta.item || "")}</strong>
      <span>${escaparHTML(respuesta.respuesta || "")} (${respuesta.valor ?? ""})${respuesta.dominio ? ` - ${escaparHTML(respuesta.dominio)}` : ""}</span>
    </li>
  `).join("");
  const dominios = escala.puntajesPorDominio && Object.keys(escala.puntajesPorDominio).length
    ? `<p><strong>Puntajes por dominio:</strong> ${escaparHTML(Object.entries(escala.puntajesPorDominio).map(([dominio, valor]) => `${dominio}: ${valor}`).join("; "))}</p>`
    : "";
  const puedeCambiarVisibilidad = ["medico", "psicologo", "admin"].includes(rolUsuarioActual);
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
        <div class="resultado-puntaje">${escaparHTML(String(escala.puntajeTotal ?? ""))}${maximo}</div>
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
    const escalas = await listarEscalasAplicadas(uidPaciente, 120);
    const cognitivas = escalas.filter((escala) => String(escala.tipoEscala || "").toLowerCase() === "cognitiva");

    if (!cognitivas.length) {
      if (perfil) perfil.innerHTML = `<p>No hay tamizajes cognitivos aplicados todavía.</p>`;
      if (historial) historial.innerHTML = `<p>Aplica una escala cognitiva desde nota clínica o desde el módulo de rehabilitación cognitiva.</p>`;
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
  const claves = dominios.length ? dominios.map((item) => item.dominio) : ["Atencion", "Memoria", "Funciones ejecutivas"];
  return claves.slice(0, 6).map((dominio) => `
    <article class="registro-card">
      <strong>${escaparHTML(dominio)}</strong>
      <p>${escaparHTML(mapa[dominio] || "Seleccionar actividades de rehabilitacion segun entrevista clinica y desempeño observado.")}</p>
    </article>
  `).join("");
}
async function cargarEscalasAsignablesPaciente() {
  const contenedor = document.getElementById("listaEscalasAsignables");
  if (!contenedor) return;
  contenedor.textContent = "Cargando escalas...";

  try {
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
      ? "El medico hizo visible una escala en Mi Salud."
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
              <span>${escaparHTML(tarea.fechaLimite ? `Limite: ${tarea.fechaLimite}` : "Sin fecha limite")}</span>
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
      <p>No hay médicos con permisos registrados.</p>
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
    alert("Escribe el correo del médico.");
    return;
  }

  const medico = await buscarMedicoPorCorreo(correo);

  if (!medico) {
    alert("No se encontró un médico registrado con ese correo.");
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
  const confirmar = confirm("¿Seguro que deseas revocar el acceso de este médico?");

  if (!confirmar) return;

  await revocarPermisoMedico(uidPaciente, uidMedico);

  alert("Permiso revocado.");

  await cargarPermisosMedicos();
};

window.editarNombrePaciente = async function() {
  const nuevoNombre = prompt("Nuevo nombre:");

  if (!nuevoNombre) return;

  await actualizarUsuario(uidPaciente, {
    nombre: nuevoNombre
  });

  await cargarDatosPaciente();

  alert("Nombre actualizado");
};

window.editarDatosPaciente = async function() {
  const datos = await obtenerUsuario(uidPaciente);

  const nuevoTelefono = prompt("Tel\u00e9fono:", datos.telefono || "");
  if (nuevoTelefono === null) return;

  const nuevoDiagnostico = prompt("Diagnóstico:", datos.diagnostico || "");
  if (nuevoDiagnostico === null) return;

  const nuevoTratamiento = prompt("Tratamiento:", datos.tratamiento || "");
  if (nuevoTratamiento === null) return;

  const nuevoMedico = prompt("Médico tratante:", datos.medicoTratante || "");
  if (nuevoMedico === null) return;

  const nuevaConsulta = prompt("Última consulta:", datos.ultimaConsulta || "");
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
          <p style="margin:0 0 4px;color:#38bdf8;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;">Datos generales</p>
          <h3 style="margin:0;">Tipo de paciente</h3>
        </div>
        <button type="button" data-cerrar-tipo-paciente style="margin:0;width:32px;height:32px;padding:0;border-radius:999px;">x</button>
      </div>
      <label style="display:block;margin-bottom:8px;color:#94a3b8;font-weight:700;">Seleccionar tipo</label>
      <select id="modalTipoPacienteSelect" style="width:100%;padding:11px;border-radius:14px;background:#0f172a;color:#fff;border:1px solid rgba(148,163,184,.28);">
        <option value="privada">Privado</option>
        <option value="institucion">Institucional</option>
        <option value="clinica">Clinica</option>
        <option value="otro">Otro...</option>
      </select>
      <input id="modalTipoPacienteManual" placeholder="Especificar tipo de paciente" style="width:100%;margin-top:10px;padding:11px;border-radius:14px;background:#0f172a;color:#fff;border:1px solid rgba(148,163,184,.28);">
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
  let nuevoValor = null;

  if (tipo === "textarea") {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  } else if (tipo === "date") {
    nuevoValor = prompt(`${etiquetaCampo} (AAAA-MM-DD):`, valorActual);
  } else if (tipo === "datetime") {
    nuevoValor = prompt(`${etiquetaCampo} (DD/MM/AAAA HH:mm):`, formatearFecha(valorActual));
  } else if (tipo === "number") {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  } else {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  }

  if (nuevoValor === null) return;
  if (campo === "fechaIngreso") nuevoValor = normalizarFechaIngreso(nuevoValor);

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
    "diasEstancia"
  ]);

  if (campo === "fechaNacimiento") {
    actualizacion.edad = deleteField();
  }

  if (camposInstitucionales.has(campo)) {
    const datosInstitucionales = {
      ...(datos?.datosInstitucionales || {}),
      [campo]: nuevoValor
    };
    delete datosInstitucionales.edad;
    actualizacion.datosInstitucionales = datosInstitucionales;

    if (campo === "institucionPaciente") actualizacion.institucion = nuevoValor;
    if (campo === "servicioInstitucional") actualizacion.servicio = nuevoValor;
    if (campo === "expediente") actualizacion.numeroExpediente = nuevoValor;
    if (["peso", "talla", "imc", "perimetroAbdominal"].includes(campo)) {
      const pesoBase = campo === "peso" ? nuevoValor : (datos?.peso || datos?.signosVitales?.peso || datos?.somatometria?.peso || datos?.datosInstitucionales?.peso || "");
      const tallaBase = campo === "talla" ? nuevoValor : (datos?.talla || datos?.signosVitales?.talla || datos?.somatometria?.talla || datos?.datosInstitucionales?.talla || "");
      const pesoNumero = numeroDesdeTexto(pesoBase);
      const tallaNumero = numeroDesdeTexto(tallaBase);
      const imcCalculado = pesoNumero && tallaNumero ? (pesoNumero / (tallaNumero * tallaNumero)).toFixed(2) : "";
      if (imcCalculado && campo !== "imc") {
        actualizacion.imc = imcCalculado;
        datosInstitucionales.imc = imcCalculado;
      }
      actualizacion.signosVitales = {
        ...(datos?.signosVitales || {}),
        [campo]: nuevoValor,
        ...(imcCalculado && campo !== "imc" ? { imc: imcCalculado } : {})
      };
      actualizacion.somatometria = {
        ...(datos?.somatometria || {}),
        [campo]: nuevoValor,
        ...(imcCalculado && campo !== "imc" ? { imc: imcCalculado } : {})
      };
    }
  }

  await actualizarUsuario(uidPaciente, actualizacion);
  await cargarDatosPaciente();
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
  inputHora.value = esNacimiento ? "" : partes.hora;
  if (titulo) {
    titulo.textContent = esNacimiento
      ? "Seleccionar fecha de nacimiento"
      : campo === "ultimoIngreso"
        ? "Seleccionar ultimo ingreso"
        : "Seleccionar ingreso";
  }
  if (subtitulo) {
    subtitulo.textContent = esNacimiento
      ? "Fecha de nacimiento"
      : campo === "ultimoIngreso"
        ? "Ultimo ingreso"
        : "Fecha de ingreso";
  }
  grupoHora?.classList.toggle("oculto", esNacimiento);
  if (ayuda) {
    ayuda.textContent = esNacimiento
      ? "Selecciona la fecha en formato DD-MM-AAAA."
      : "Si no seleccionas hora, se tomara el inicio del dia.";
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
    alert(campoFechaIngresoModal === "fechaNacimiento" ? "Selecciona la fecha de nacimiento." : "Selecciona el dia de ingreso.");
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
  const remoto = await obtenerUsuario(uidPaciente).catch(() => null);
  const baseActual = remoto || datosPacienteActual || {};
  const historialActual = obtenerHistorialDiagnosticos(baseActual);

  let limpio = normalizarHistorialDiagnosticos(historial);

  if (!permitirEliminar && historialActual.length > limpio.length) {
    const clavesNuevas = new Set(limpio.map(claveDiagnostico).filter(Boolean));
    const preservados = historialActual.filter((dx) => {
      const clave = claveDiagnostico(dx);
      return clave && !clavesNuevas.has(clave);
    });
    limpio = normalizarHistorialDiagnosticos([...limpio, ...preservados]);
  }

  const diagnosticoPrincipal = limpio[0] || "";

  await actualizarUsuario(uidPaciente, {
    diagnostico: diagnosticoPrincipal || deleteField(),
    historialDiagnosticos: limpio,
    datosClinicosResumen: {
      ...(baseActual?.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal || null,
      historialDiagnosticos: limpio,
      fechaActualizacionDiagnosticos: new Date().toISOString()
    }
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

async function agregarDiagnosticoPaciente(index) {
  const diagnostico = diagnosticosCatalogoActual[index];
  if (!diagnostico) return;

  const historial = obtenerHistorialDiagnosticos();

  if (diagnosticoReemplazoIndex !== null) {
    const anterior = historial[diagnosticoReemplazoIndex];
    if (!anterior) {
      diagnosticoReemplazoIndex = null;
      return;
    }

    historial[diagnosticoReemplazoIndex] = { ...normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", diagnosticoReemplazoIndex), estado: anterior.estado, orden: anterior.orden };

    await guardarHistorialDiagnosticos(historial);

    await registrarAccionExpediente({
      accion: "cambiar_diagnostico",
      descripcion: "El medico cambio un diagnostico usando el catalogo diagnostico.",
      detalles: {
        anterior: formatearDiagnostico(anterior),
        nuevo: formatearDiagnostico(diagnostico),
        catalogo: diagnostico.catalogo
      }
    });

    diagnosticoReemplazoIndex = null;
    ponerValor("diagnosticoBusqueda", "");
    await cargarDatosPaciente();
    renderizarResultadosBusquedaDiagnosticos();
    return;
  }

  const existe = historial.some((dx) => claveDiagnostico(dx) === claveDiagnostico(diagnostico));

  if (existe) {
    alert("Ese diagnostico ya esta registrado.");
    return;
  }

  const nuevoHistorial = [...historial, normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", historial.length)];
  await guardarHistorialDiagnosticos(nuevoHistorial);

  await registrarAccionExpediente({
    accion: "agregar_diagnostico",
    descripcion: "El medico agrego un diagnostico al expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      catalogo: diagnostico.catalogo
    }
  });

  ponerValor("diagnosticoBusqueda", "");
  await cargarDatosPaciente();
  renderizarResultadosBusquedaDiagnosticos();
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
      guardarCatalogoManualDiagnosticos();
    }
  }

  const historial = obtenerHistorialDiagnosticos();
  const nuevoHistorial = [...historial, normalizarDiagnostico(diagnostico, diagnostico.catalogo || "CIE-10", historial.length)];
  await guardarHistorialDiagnosticos(nuevoHistorial);

  await registrarAccionExpediente({
    accion: "agregar_diagnostico_manual",
    descripcion: "El medico agrego un diagnostico manual al expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      catalogo
    }
  });

  ["diagnosticoManualCodigo", "diagnosticoManualNombre", "diagnosticoManualTexto"].forEach((id) => ponerValor(id, ""));
  const incluirCatalogo = document.getElementById("diagnosticoManualIncluirCatalogo");
  if (incluirCatalogo) incluirCatalogo.checked = false;
  await cargarDatosPaciente();
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
    estado: estadoDiagnosticoValido(estado)
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
async function quitarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) return;
  if (!confirm("Quitar este diagnostico del expediente?")) return;

  const nuevoHistorial = historial.filter((_, i) => i !== index);

  await guardarHistorialDiagnosticos(nuevoHistorial, { permitirEliminar: true });

  await registrarAccionExpediente({
    accion: "quitar_diagnostico",
    descripcion: "El medico quito un diagnostico del expediente.",
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
          <span>${nota.contraida ? "Contraida" : "Visible"}</span>
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
    pacienteNombre: paciente.nombre || "",
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
          <small>${escaparHTML(item.fecha || "")} · ${escaparHTML(item.prioridad || "")}</small>
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
    nombrePaciente: paciente.nombre || datosInst.nombrePaciente || "",
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
      &nbsp;&nbsp; <b>Fecha de nacimiento:</b> ${textoWordPaciente(formatoFechaInterconsulta(datos.fechaNacimiento))}
      &nbsp;&nbsp; <b>Edad:</b> ${textoWordPaciente(datos.edad)} ANOS
      &nbsp;&nbsp; <b>Cama:</b> ${textoWordPaciente(datos.cama)}
      &nbsp;&nbsp; <b>Expediente:</b> ${textoWordPaciente(datos.expediente)}
      &nbsp;&nbsp; <b>Sexo:</b> ${textoWordPaciente(datos.sexo)}
      &nbsp;&nbsp; <b>Genero:</b> ${textoWordPaciente(datos.genero)}
      &nbsp;&nbsp; <b>Servicio:</b> ${textoWordPaciente(datos.servicio)}
      &nbsp;&nbsp; <b>Alergias:</b> ${textoWordPaciente(datos.alergias)}
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
  const encabezadoCognicion = `<h1>Cognicion - Solicitud de interconsulta</h1>`;
  const motivoCompleto = [
    datos.motivo,
    datos.resumen ? `Resumen clinico: ${datos.resumen}` : "",
    datos.pregunta ? `Pregunta clinica: ${datos.pregunta}` : ""
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
          <p><b>Fecha:</b> ${textoWordPaciente(formatoFechaInterconsulta(datos.fecha))} &nbsp;&nbsp; <b>Hora:</b> ${textoWordPaciente(datos.hora)} &nbsp;&nbsp; <b>CURP:</b> ${textoWordPaciente(datos.curp)}</p>
          <p><b>Servicio solicitante:</b> ${textoWordPaciente(datos.servicioSolicitante)} &nbsp;&nbsp; <b>Servicio interconsultante:</b> ${textoWordPaciente(datos.servicio)} &nbsp;&nbsp; <b>Prioridad:</b> ${textoWordPaciente(datos.prioridad)}</p>
          <p><b>Peso:</b> ${textoWordPaciente(datos.peso)} Kg &nbsp;&nbsp; <b>Talla:</b> ${textoWordPaciente(datos.talla)} m &nbsp;&nbsp; <b>Perimetro abdominal:</b> ${textoWordPaciente(datos.perimetroAbdominal)} cm</p>
          <h2>Sospecha diagnostica</h2>
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
  if (!uidPaciente) return;

  try {
    tratamientosCache = await listarTratamientos(uidPaciente);
  } catch (error) {
    console.warn("No se pudieron cargar tratamientos para indicaciones:", error);
  }
}

function medicamentosActivosIndicaciones() {
  const checksDisponibles = [...document.querySelectorAll("[data-medicamento-indicacion]")];
  const checks = checksDisponibles
    .filter((check) => check.checked)
    .map((check) => check.value)
    .filter(Boolean);

  if (checksDisponibles.length) return checks;

  return tratamientosCache
    .filter((t) => (t.estado || "activo") === "activo")
    .map((t) => formatearIndicacionTratamiento(t, true))
    .filter(Boolean);
}

function construirTextoIndicaciones(medicamentos = medicamentosActivosIndicaciones()) {
  const dieta = valorCampo("indicacionesDieta") || "NORMAL";
  const cuidados = valorCampo("indicacionesCuidados") || "Signos vitales por turno y cuidados generales por enfermeria";
  const alergias = valorCampo("indicacionesAlergias") || "Negadas";
  const riesgoCaida = valorCampo("indicacionesRiesgoCaida") || "MEDIO";
  const vigilancia = valorCampo("indicacionesVigilancia") || "RIESGO SUICIDA";
  const notaMedicamentos = valorCampo("indicacionesNotaMedicamentos") || "EN CASO DE NEGATIVISMO, ADMINISTRAR MOLIDOS Y DISUELTOS";
  const eventualidades = valorCampo("indicacionesEventualidades") || "Reportar Eventualidades";
  const listaMedicamentos = medicamentos.length
    ? medicamentos.map((medicamento) => `-${medicamento}`).join("\n")
    : "-Sin medicamentos activos registrados.";

  return [
    `1. Dieta ${dieta}`,
    `2. ${cuidados}`,
    `3. Alergias: ${alergias}`,
    `4. Riesgo de caida: ${riesgoCaida}`,
    `5. Vigilancia por: ${vigilancia}`,
    `6. Medicamentos${notaMedicamentos ? ` (${notaMedicamentos})` : ""}`,
    listaMedicamentos,
    `7. ${eventualidades}`
  ].join("\n");
}

function actualizarTextoIndicaciones() {
  ponerValor("indicacionesTexto", construirTextoIndicaciones());
  textoIndicacionesEditado = false;
}

function renderizarMedicamentosIndicaciones() {
  const contenedor = document.getElementById("listaMedicamentosIndicaciones");
  if (!contenedor) return;

  const tratamientosActivos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
  contenedor.innerHTML = tratamientosActivos.length
    ? tratamientosActivos.map((tratamiento, index) => {
      const indicacion = formatearIndicacionTratamiento(tratamiento, true);
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
  return tratamientosCache
    .filter((t) => (t.estado || "activo") === "activo")
    .map((t) => ({
      id: t.id || "",
      medicamento: t.medicamento || "Medicamento sin nombre",
      indicacion: formatearIndicacionTratamiento(t, false),
      dosisDia: t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || ""
    }))
    .filter((t) => t.medicamento && t.medicamento !== "Medicamento sin nombre");
}

function cerrarInteraccionesFarmacologicas() {
  const modal = document.getElementById("modalInteraccionesFarmacologicas");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function renderizarInteraccionesFarmacologicas(medicamentos = [], origen = "tratamiento") {
  const contenedor = document.getElementById("contenidoInteraccionesFarmacologicas");
  if (!contenedor) return;

  const interacciones = detectarInteraccionesFarmacologicas(medicamentos);
  const tituloOrigen = origen === "indicaciones" ? "medicamentos activos vinculados a indicaciones" : "tratamientos activos";
  const listaMedicamentos = medicamentos.length
    ? medicamentos.map((med) => `
      <li>
        <strong>${escaparHTML(med.medicamento)}</strong>
        ${med.indicacion ? `<span>${escaparHTML(med.indicacion)}</span>` : ""}
        ${med.dosisDia ? `<small>Dosis/dia: ${escaparHTML(med.dosisDia)}</small>` : ""}
      </li>
    `).join("")
    : "<li>No hay medicamentos activos registrados.</li>";

  contenedor.innerHTML = `
    <p class="texto-suave">Revision orientativa basada en los ${escaparHTML(tituloOrigen)}. No sustituye el juicio clinico ni la revision de fuentes farmacologicas institucionales.</p>
    <div class="interacciones-medicamentos-revisados">
      <strong>Medicamentos revisados</strong>
      <ul>${listaMedicamentos}</ul>
    </div>
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

  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
  const contenedor = document.getElementById("contenidoInteraccionesFarmacologicas");
  if (contenedor) contenedor.innerHTML = "<p>Cargando revision de interacciones...</p>";

  await asegurarTratamientosCache();
  renderizarInteraccionesFarmacologicas(tratamientosActivosParaInteracciones(), origen);
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
    indicacionesFirma1Cargo: paciente.medicoAdscritoEncargado || paciente.medicoTratante || medicoActualDatos.nombre ? "Medico adscrito" : "",
    indicacionesFirma1Cedula: medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || "",
    indicacionesFirma2Nombre: paciente.residenteEncargado || "",
    indicacionesFirma2Cargo: paciente.residenteEncargado ? "Medico residente" : "",
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
    alert("Escribe las indicaciones medicas.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "indicaciones"), {
    ...datos,
    medicoUid: auth.currentUser?.uid || "",
    fechaCreacion: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "crear_indicaciones",
    descripcion: "El medico registro indicaciones medicas del paciente.",
    detalles: { formato: datos.formato, servicio: datos.servicio }
  });

  await cargarIndicacionesPaciente();
  alert("Indicaciones guardadas.");
}

async function cargarIndicacionesPaciente() {
  const lista = document.getElementById("listaIndicacionesPaciente");
  if (!lista) return;

  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "indicaciones"), orderBy("fechaCreacion", "desc")));
  indicacionesPacienteCache = snap.docs.map((docIndicacion) => ({
    id: docIndicacion.id,
    ...docIndicacion.data()
  }));

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
          <small>${escaparHTML(item.fecha || "")} · ${escaparHTML(item.hora || "")}</small>
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

window.previsualizarMiSalud = function() {
  window.location.href = `mi-salud.html?paciente=${uidPaciente}&preview=1`;
};

window.solicitarEliminarPaciente = async function() {
  const confirmar = confirm(
    "¿Deseas suspender este paciente y solicitar eliminación al administrador?"
  );

  if (!confirmar) return;

  try {
    await solicitarEliminacionPaciente(
      uidPaciente,
      auth.currentUser.uid
    );

    alert("Paciente suspendido. Eliminación pendiente de autorización.");

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

function datosFormularioTratamiento() {
  actualizarDosisTotalDiaTratamiento();
  return {
    medicamento: valorCampo("tratamientoMedicamento"),
    dosis: valorCampo("tratamientoDosis"),
    frecuencia: valorCampo("tratamientoFrecuencia"),
    via: valorCampo("tratamientoVia"),
    horarios: valorCampo("tratamientoHorarios"),
    cantidadTotalDia: valorCampo("cantidadTotalDia"),
    dosisTotalDia: valorCampo("tratamientoDosisTotalDia"),
    fechaInicio: valorCampo("tratamientoFechaInicio"),
    estado: valorCampo("tratamientoEstado") || "activo",
    fechaSuspension: valorCampo("tratamientoFechaSuspension"),
    motivoSuspension: valorCampo("tratamientoMotivoSuspension"),
    observaciones: valorCampo("tratamientoObservaciones"),
    creadoPor: auth.currentUser?.uid || ""
  };
}

function limpiarFormularioTratamiento() {
  [
    "tratamientoId",
    "tratamientoMedicamento",
    "tratamientoDosis",
    "tratamientoFrecuencia",
    "tratamientoVia",
    "tratamientoHorarios",
    "cantidadTotalDia",
    "tratamientoDosisTotalDia",
    "tratamientoFechaInicio",
    "tratamientoFechaSuspension",
    "tratamientoMotivoSuspension",
    "tratamientoObservaciones"
  ].forEach((id) => ponerValor(id, ""));
  const campoCantidad = document.getElementById("cantidadTotalDia");
  if (campoCantidad) campoCantidad.dataset.auto = "";
  ponerValor("tratamientoEstado", "activo");
}

async function guardarTratamientoPaciente() {
  const datos = datosFormularioTratamiento();

  if (!datos.medicamento) {
    alert("Escribe el medicamento.");
    return;
  }

  const tratamientoId = valorCampo("tratamientoId");

  if (tratamientoId) {
    await actualizarTratamiento(uidPaciente, tratamientoId, datos);
  } else {
    await crearTratamiento(uidPaciente, datos);
  }

  await registrarAccionExpediente({
    accion: tratamientoId ? "editar_tratamiento" : "crear_tratamiento",
    descripcion: tratamientoId
      ? "El medico edito un tratamiento del expediente."
      : "El medico creo un tratamiento en el expediente.",
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

  activos.textContent = "Cargando tratamientos...";
  suspendidos.textContent = "Cargando tratamientos...";

  try {
    tratamientosCache = await listarTratamientos(uidPaciente);
    const listaActivos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
    const listaSuspendidos = tratamientosCache.filter((t) => t.estado === "suspendido");

    activos.innerHTML = listaActivos.length
      ? listaActivos.map(renderizarTratamiento).join("")
      : "<p>Aun no hay tratamientos activos.</p>";

    suspendidos.innerHTML = listaSuspendidos.length
      ? listaSuspendidos.map(renderizarTratamiento).join("")
      : "<p>No hay tratamientos suspendidos.</p>";

    vincularAccionesTratamientos();
  } catch (error) {
    console.error("Error al cargar tratamientos:", error);
    activos.textContent = "No se pudieron cargar los tratamientos.";
    suspendidos.textContent = "No se pudieron cargar los tratamientos.";
  }
}

function renderizarTratamiento(t) {
  const indicacion = formatearIndicacionTratamiento(t, false);
  const dosisTotalDia = t.dosisTotalDia || calcularDosisTotalDiaTratamiento(t).texto || "";
  return `
    <article class="registro-card">
      <div class="registro-top">
        <div>
          <strong>${escaparHTML(t.medicamento || "Medicamento")}</strong>
          <span>${escaparHTML(indicacion || "Sin indicacion completa")}</span>
        </div>
        <span class="estado-badge ${t.estado === "suspendido" ? "suspendido" : "activo"}">${escaparHTML(t.estado || "activo")}</span>
      </div>
      <p><b>Inicio:</b> ${escaparHTML(formatearFecha(t.fechaInicio) || "Sin fecha")}</p>
      ${dosisTotalDia ? `<p><b>Dosis total al dia:</b> ${escaparHTML(dosisTotalDia)}</p>` : ""}
      ${t.estado === "suspendido" ? `<p><b>Suspension:</b> ${escaparHTML(formatearFecha(t.fechaSuspension))} · ${escaparHTML(t.motivoSuspension || "Sin motivo registrado")}</p>` : ""}
      ${t.observaciones ? `<p>${escaparHTML(t.observaciones)}</p>` : ""}
      <div class="registro-actions">
        <button type="button" data-editar-tratamiento="${t.id}">Editar</button>
        <button type="button" class="boton-peligro" data-eliminar-tratamiento="${t.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function vincularAccionesTratamientos() {
  document.querySelectorAll("[data-editar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => editarTratamientoPaciente(boton.dataset.editarTratamiento));
  });

  document.querySelectorAll("[data-eliminar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarTratamientoPaciente(boton.dataset.eliminarTratamiento));
  });
}

function editarTratamientoPaciente(id) {
  const t = tratamientosCache.find((item) => item.id === id);
  if (!t) return;

  ponerValor("tratamientoId", t.id);
  ponerValor("tratamientoMedicamento", t.medicamento);
  ponerValor("tratamientoDosis", t.dosis);
  ponerValor("tratamientoFrecuencia", t.frecuencia);
  ponerValor("tratamientoVia", t.via);
  ponerValor("tratamientoHorarios", t.horarios);
  ponerValor("cantidadTotalDia", t.cantidadTotalDia);
  ponerValor("tratamientoDosisTotalDia", t.dosisTotalDia);
  const campoCantidad = document.getElementById("cantidadTotalDia");
  if (campoCantidad) campoCantidad.dataset.auto = "false";
  ponerValor("tratamientoFechaInicio", t.fechaInicio);
  ponerValor("tratamientoEstado", t.estado || "activo");
  ponerValor("tratamientoFechaSuspension", t.fechaSuspension);
  ponerValor("tratamientoMotivoSuspension", t.motivoSuspension);
  ponerValor("tratamientoObservaciones", t.observaciones);
}

async function eliminarTratamientoPaciente(id) {
  if (!confirm("Eliminar este tratamiento del expediente?")) return;
  const tratamiento = tratamientosCache.find((item) => item.id === id);
  await eliminarTratamiento(uidPaciente, id);
  await registrarAccionExpediente({
    accion: "eliminar_tratamiento",
    descripcion: "El medico elimino un tratamiento del expediente.",
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
  const activos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
  const resumen = activos.map((t) =>
    formatearIndicacionTratamiento(t, true)
  ).filter(Boolean).join("\n");

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

function extraerCantidadesDosis(dosis = "") {
  const texto = String(dosis || "");
  const matches = [...texto.matchAll(/(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:tabletas?|tabs?|comprimidos?|capsulas?|caps?|gotas?|ampolletas?|ml|mg|mg\.|capsula|tableta)\b/gi)];
  return matches.map((match) => numeroDesdeTexto(match[1])).filter((valor) => valor > 0);
}

function calcularDosisTotalDiaTratamiento(t = {}) {
  const presentacion = extraerPresentacionMedicamento(t.medicamento || "");
  const cantidades = extraerCantidadesDosis(t.dosis || "");
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
      texto: `${totalRedondeado} ${presentacion.unidad}/dia`
    };
  }

  return {
    cantidadTotal,
    texto: `${cantidadTotal} unidad${cantidadTotal === 1 ? "" : "es"}/dia`
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

function limpiarPuntoFinal(texto = "") {
  return String(texto).trim().replace(/[.\s]+$/, "");
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
  const frecuencia = limpiarPuntoFinal(t.frecuencia || "");
  const dosis = limpiarPuntoFinal(t.dosis || "");
  const horarios = formatearHorariosTratamiento(t.horarios || "");

  const tomar = [via, frecuencia].filter(Boolean).join(" ");
  const partes = [];

  if (medicamento) partes.push(medicamento);
  if (tomar) partes.push(asegurarPunto(`Tomar ${tomar}`));
  if (dosis || horarios) partes.push(asegurarPunto([dosis, horarios].filter(Boolean).join(" ")));

  if (!partes.length && !incluirMedicamento) {
    return [t.dosis, t.frecuencia, t.via, t.horarios].filter(Boolean).join(" · ");
  }

  return partes.join(" ");
}

configurarCatalogoMedicamentosTratamiento();
configurarCatalogoMedicamentosReceta();

function fechaISOHoy() {
  return new Date().toISOString().slice(0, 10);
}

function obtenerNombrePacienteActual() {
  return datosPacienteActual?.nombre || document.getElementById("nombrePaciente")?.textContent || "Paciente";
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
    medico: medicoActualDatos?.nombre || datosPacienteActual?.medicoTratante || "Medico tratante",
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

  return `
    <div class="receta-marca">COGNICION</div>
    <div class="receta-encabezado">
      <div>
        <h2>Receta medica</h2>
        <p>Tecnologia clinica para una medicina mas precisa, humana y basada en evidencia.</p>
      </div>
      <span>${escaparHTML(formatearFecha(datos.fecha) || datos.fecha)}</span>
    </div>

    <div class="receta-datos">
      <p><b>Paciente:</b> ${escaparHTML(datos.pacienteNombre)}</p>
      <p><b>Edad:</b> ${datos.edad !== "" ? escaparHTML(`${datos.edad} anos`) : "No registrada"}</p>
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
      <small>${datos.cedula ? `Ced. Prof. ${escaparHTML(datos.cedula)}` : "Cedula profesional"}</small>
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
  const activos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
  medicamentosRecetaActual = activos.map((t) => ({
    medicamento: t.medicamento || "Medicamento",
    indicacion: formatearIndicacionTratamiento(t, false)
  }));
  renderizarMedicamentosReceta();
  actualizarPreviewReceta();
}

async function guardarRecetaPaciente() {
  const datos = datosRecetaActual();
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
  body{margin:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;}
  .hoja{width:760px;min-height:980px;margin:32px auto;padding:48px;background:white;border-radius:22px;box-shadow:0 22px 70px rgba(15,23,42,.18),0 0 0 1px rgba(14,165,233,.14);}
  .receta-marca{color:#0284c7;font-weight:900;letter-spacing:.22em;font-size:12px;margin-bottom:18px;}
  .receta-encabezado{display:flex;justify-content:space-between;gap:22px;border-bottom:2px solid #dbeafe;padding-bottom:18px;margin-bottom:22px;}
  h2{margin:0;color:#082f49;font-size:30px;} h3{margin:24px 0 10px;color:#0369a1;font-size:14px;text-transform:uppercase;letter-spacing:.12em;}
  p{line-height:1.45;} .receta-datos{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:#f8fbff;border:1px solid #dbeafe;border-radius:16px;padding:14px 16px;}
  .receta-datos p{margin:0;} .receta-medicamentos{padding-left:22px;} .receta-medicamentos li{margin:0 0 14px;} .receta-medicamentos strong{display:block;color:#0f172a;} .receta-medicamentos span{display:block;margin-top:4px;}
  .receta-vigencia{margin-top:20px;color:#475569;} .receta-firma{margin-top:80px;text-align:center;margin-left:auto;width:280px;} .receta-firma span{display:block;border-top:1px solid #0f172a;margin-bottom:8px;} .receta-firma strong,.receta-firma small{display:block;}
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

function configurarSolicitudEstudios() {
  const categoria = document.getElementById("solicitudEstudioCategoria");
  const estudio = document.getElementById("solicitudEstudioNombre");
  if (!categoria || !estudio) return;

  const renderizarOpciones = () => {
    const tipo = categoria.value || "laboratorio";
    estudio.innerHTML = (CATALOGO_SOLICITUD_ESTUDIOS[tipo] || [])
      .map((nombre) => `<option value="${escaparHTML(nombre)}">${escaparHTML(nombre)}</option>`)
      .join("");
    actualizarPreviewSolicitudEstudios();
  };

  categoria.addEventListener("change", renderizarOpciones);
  renderizarOpciones();
}

function datosSolicitudEstudiosActual() {
  const fecha = valorCampo("solicitudEstudioFecha") || fechaISOHoy();
  return {
    formato: valorCampo("solicitudEstudioFormato") || "cognicion",
    fecha,
    pacienteNombre: obtenerNombrePacienteActual(),
    edad: calcularEdad(obtenerFechaNacimiento(datosPacienteActual || {})),
    fechaNacimiento: obtenerFechaNacimiento(datosPacienteActual || {}),
    sexo: datosPacienteActual?.sexo || datosPacienteActual?.datosInstitucionales?.sexo || "",
    expediente:
      datosPacienteActual?.expedienteCognicion ||
      datosPacienteActual?.datosInstitucionales?.expedienteCognicion ||
      datosPacienteActual?.expediente ||
      datosPacienteActual?.numeroExpediente ||
      "",
    cama: datosPacienteActual?.cama || datosPacienteActual?.datosInstitucionales?.cama || "",
    institucion: datosPacienteActual?.institucionPaciente || datosPacienteActual?.institucion || "",
    prioridad: valorCampo("solicitudEstudioPrioridad") || "Ordinaria",
    motivo: valorCampo("solicitudEstudioMotivo"),
    solicita: valorCampo("solicitudEstudioSolicita") || medicoActualDatos?.nombre || datosPacienteActual?.medicoTratante || "Medico solicitante",
    cedula: medicoActualDatos?.cedula || medicoActualDatos?.cedulaProfesional || "",
    estudios: estudiosSolicitudActual
  };
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
        <p>Formato ${escaparHTML(datos.formato)} · ${escaparHTML(datos.prioridad)}</p>
      </div>
      <span>${escaparHTML(formatearFecha(datos.fecha) || datos.fecha)}</span>
    </div>

    <div class="receta-datos">
      <p><b>Paciente:</b> ${escaparHTML(datos.pacienteNombre)}</p>
      <p><b>Edad:</b> ${datos.edad !== "" ? escaparHTML(`${datos.edad} anos`) : "No registrada"}</p>
      <p><b>Sexo:</b> ${escaparHTML(datos.sexo || "No registrado")}</p>
      <p><b>Expediente:</b> ${escaparHTML(datos.expediente || "No registrado")}</p>
      <p><b>Cama:</b> ${escaparHTML(datos.cama || "No registrada")}</p>
      <p><b>Institucion:</b> ${escaparHTML(datos.institucion || "No registrada")}</p>
    </div>

    <h3>Estudios solicitados</h3>
    <ol class="receta-medicamentos">${estudios}</ol>

    ${datos.motivo ? `<h3>Indicacion clinica</h3><p>${escaparHTML(datos.motivo)}</p>` : ""}

    <div class="receta-firma">
      <span></span>
      <strong>${escaparHTML(datos.solicita)}</strong>
      <small>${datos.cedula ? `Ced. Prof. ${escaparHTML(datos.cedula)}` : "Quien solicita"}</small>
    </div>
  `;
}

function actualizarPreviewSolicitudEstudios() {
  const preview = document.getElementById("solicitudEstudiosPreview");
  if (!preview) return;
  preview.innerHTML = htmlSolicitudEstudiosPreview();
}

function agregarEstudioSolicitud() {
  const categoria = valorCampo("solicitudEstudioCategoria") || "laboratorio";
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
  ponerValor("solicitudEstudioMotivo", "");
  ponerValor("solicitudEstudioPrioridad", "Ordinaria");
  ponerValor("solicitudEstudioFecha", fechaISOHoy());
  ponerValor("solicitudEstudioSolicita", medicoActualDatos?.nombre || datosPacienteActual?.medicoTratante || "");
  renderizarListaSolicitudEstudios();
  actualizarPreviewSolicitudEstudios();
}

async function guardarSolicitudEstudios() {
  const datos = datosSolicitudEstudiosActual();
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

function descargarSolicitudEstudios() {
  const datos = datosSolicitudEstudiosActual();
  if (!datos.estudios.length) {
    alert("Agrega al menos un estudio a la solicitud.");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Solicitud de estudios ${escaparHTML(datos.pacienteNombre)}</title>
<style>
  body{margin:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;}
  .hoja{position:relative;width:760px;min-height:980px;margin:32px auto;padding:48px;background:white;border-radius:22px;box-shadow:0 22px 70px rgba(15,23,42,.18),0 0 0 1px rgba(14,165,233,.14);}
  .solicitud-logo{position:absolute;top:34px;right:38px;width:54px;height:54px;object-fit:contain;}
  .receta-marca{color:#0284c7;font-weight:900;letter-spacing:.22em;font-size:12px;margin-bottom:18px;}
  .receta-encabezado{display:flex;justify-content:space-between;gap:80px;border-bottom:2px solid #dbeafe;padding-bottom:18px;margin-bottom:22px;}
  h2{margin:0;color:#082f49;font-size:30px;} h3{margin:24px 0 10px;color:#0369a1;font-size:14px;text-transform:uppercase;letter-spacing:.12em;}
  p{line-height:1.45;} .receta-datos{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;background:#f8fbff;border:1px solid #dbeafe;border-radius:16px;padding:14px 16px;}
  .receta-datos p{margin:0;} .receta-medicamentos{padding-left:22px;} .receta-medicamentos li{margin:0 0 14px;} .receta-medicamentos strong{display:block;color:#0f172a;} .receta-medicamentos span{display:block;margin-top:4px;color:#475569;}
  .receta-firma{margin-top:90px;text-align:center;margin-left:auto;width:280px;} .receta-firma span{display:block;border-top:1px solid #0f172a;margin-bottom:8px;} .receta-firma strong,.receta-firma small{display:block;}
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
      ? "El medico edito un estudio del expediente."
      : "El medico registro un estudio en el expediente.",
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
    contenedor.innerHTML = estudiosCache.length
      ? estudiosCache.map(renderizarEstudio).join("")
      : "<p>Aun no hay estudios registrados.</p>";
    vincularAccionesEstudios();
  } catch (error) {
    console.error("Error al cargar estudios:", error);
    contenedor.textContent = "No se pudieron cargar los estudios.";
  }
}

function renderizarEstudio(estudio) {
  return `
    <article class="registro-card">
      <div class="registro-top">
        <div>
          <strong>${escaparHTML(estudio.nombre || "Estudio")}</strong>
          <span>${escaparHTML(estudio.tipo || "Sin tipo")} · ${escaparHTML(formatearFecha(estudio.fecha))}</span>
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
    medicoNombre: medico?.nombre || medico?.email || "Medico",
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
          const fecha = nota.fechaISO ? new Date(nota.fechaISO).toLocaleString("es-MX") : "Sin fecha";
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

document.getElementById("guardarTratamiento")?.addEventListener("click", guardarTratamientoPaciente);
document.getElementById("limpiarTratamiento")?.addEventListener("click", limpiarFormularioTratamiento);
document.getElementById("abrirInteraccionesTratamiento")?.addEventListener("click", () => abrirInteraccionesFarmacologicas("tratamiento"));
document.getElementById("abrirInteraccionesIndicaciones")?.addEventListener("click", () => abrirInteraccionesFarmacologicas("indicaciones"));
document.getElementById("cerrarInteraccionesFarmacologicas")?.addEventListener("click", cerrarInteraccionesFarmacologicas);
[
  "tratamientoMedicamento",
  "tratamientoDosis",
  "tratamientoFrecuencia",
  "cantidadTotalDia"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", actualizarDosisTotalDiaTratamiento);
  document.getElementById(id)?.addEventListener("change", actualizarDosisTotalDiaTratamiento);
});
document.getElementById("abrirMedicamentoManual")?.addEventListener("click", abrirMedicamentoManual);
document.getElementById("cerrarMedicamentoManual")?.addEventListener("click", cerrarMedicamentoManual);
document.getElementById("cancelarMedicamentoManual")?.addEventListener("click", cerrarMedicamentoManual);
document.getElementById("guardarMedicamentoManual")?.addEventListener("click", guardarMedicamentoManual);
document.querySelector("#panelApuntesMedicoPaciente .boton-cerrar-panel")?.addEventListener("click", window.cerrarApuntesMedicoPaciente);
document.getElementById("fondoApuntesMedicoPaciente")?.addEventListener("click", window.cerrarApuntesMedicoPaciente);
document.getElementById("guardarEstudio")?.addEventListener("click", guardarEstudioPaciente);
document.getElementById("limpiarEstudio")?.addEventListener("click", limpiarFormularioEstudio);
document.getElementById("agregarEstudioSolicitud")?.addEventListener("click", agregarEstudioSolicitud);
document.getElementById("limpiarSolicitudEstudios")?.addEventListener("click", limpiarSolicitudEstudios);
document.getElementById("guardarSolicitudEstudios")?.addEventListener("click", guardarSolicitudEstudios);
document.getElementById("descargarSolicitudEstudios")?.addEventListener("click", descargarSolicitudEstudios);
[
  "solicitudEstudioFormato",
  "solicitudEstudioFecha",
  "solicitudEstudioCategoria",
  "solicitudEstudioNombre",
  "solicitudEstudioMotivo",
  "solicitudEstudioPrioridad",
  "solicitudEstudioSolicita"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", actualizarPreviewSolicitudEstudios);
  document.getElementById(id)?.addEventListener("change", actualizarPreviewSolicitudEstudios);
});
document.getElementById("guardarNotaRapida")?.addEventListener("click", guardarNotaRapidaPaciente);
document.getElementById("guardarTareaMiSalud")?.addEventListener("click", guardarTareaMiSaludPaciente);
document.getElementById("btnGenerarCodigoPaciente")?.addEventListener("click", generarCodigoVinculacionDesdeMedico);
document.getElementById("btnVincularCodigoPaciente")?.addEventListener("click", vincularCuentaPacienteDesdeMedico);
document.getElementById("diagnosticoBusqueda")?.addEventListener("input", renderizarResultadosBusquedaDiagnosticos);
document.getElementById("diagnosticoCatalogo")?.addEventListener("change", () => {
  ponerValor("diagnosticoBusqueda", "");
  renderizarResultadosBusquedaDiagnosticos();
});
document.getElementById("agregarDiagnosticoManual")?.addEventListener("click", agregarDiagnosticoManualPaciente);
document.getElementById("crearCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("nuevaCarpetaPaciente")));
document.getElementById("asignarCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("selectorCarpetasPaciente")));
document.getElementById("buscadorApuntesPaciente")?.addEventListener("input", renderizarListaApuntesMedicoPaciente);
document.getElementById("apunteMedicoPacienteTitulo")?.addEventListener("input", () => ponerEstadoApuntesPaciente("Cambios sin guardar"));
document.getElementById("apunteMedicoPacienteContenido")?.addEventListener("input", () => ponerEstadoApuntesPaciente("Cambios sin guardar"));
document.getElementById("guardarNotaFlotante")?.addEventListener("click", guardarNotaFlotantePaciente);
document.getElementById("nuevaNotaFlotante")?.addEventListener("click", limpiarNotaFlotantePaciente);
document.getElementById("guardarInterconsulta")?.addEventListener("click", guardarInterconsultaPaciente);
document.getElementById("descargarInterconsulta")?.addEventListener("click", descargarInterconsultaPaciente);
document.getElementById("guardarIndicaciones")?.addEventListener("click", guardarIndicacionesPaciente);
document.getElementById("descargarIndicaciones")?.addEventListener("click", descargarIndicacionesPaciente);
document.getElementById("actualizarTextoIndicaciones")?.addEventListener("click", actualizarTextoIndicaciones);
document.getElementById("indicacionesTexto")?.addEventListener("input", () => {
  textoIndicacionesEditado = true;
});
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
