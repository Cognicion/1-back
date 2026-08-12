import { db } from "../firebase.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";
import { normalizarTextoFrecuencia } from "../utils/frecuencias.js";
import { CATALOGO_FARMACOLOGICO_OFICIAL } from "../data/catalogoFarmacologicoUnificado.js?v=20260811-pharmacology-files-consolidated-v1";
import { evaluarMedicamentosPaciente } from "./motorClinicoMedicamentos.js?v=20260811-pharmacology-files-consolidated-v1";
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CAMPOS_FECHA = ["fechaAplicacion", "fecha", "createdAt", "updatedAt", "fechaNota", "fechaCreacion", "fechaInicio", "fechaSuspension"];

export const BASE_FARMACOLOGICA_SOFIA = CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => ({
  clave: medicamento.id,
  clinicalMedicationId: medicamento.id,
  nombre: medicamento.nombre,
  clase: medicamento.clasePrincipal,
  mecanismo: medicamento.mecanismoAccion || medicamento.notas || "",
  metabolismo: medicamento.metabolismo || "",
  monitorizacion: medicamento.monitoring || medicamento.datosClinicos?.precauciones || [],
  riesgos: medicamento.categoriasInteraccion || [],
  medicamento
}));

export function obtenerBaseFarmacologicaInicial() { return BASE_FARMACOLOGICA_SOFIA; }

export function calcularEdad(fechaNacimiento) {
  const fecha = normalizarFecha(fechaNacimiento);
  if (!fecha) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return Number.isFinite(edad) ? edad : null;
}

export async function cargarPacientesSofia(usuario, perfilUsuario = {}) {
  const snap = await getDocs(collection(db, "usuarios"));
  const rol = normalizarTexto(perfilUsuario.rol || "");
  const pacientes = [];
  snap.forEach((docSnap) => {
    const datos = docSnap.data() || {};
    const rolPaciente = normalizarTexto(datos.rol || datos.tipoUsuario || "");
    const parecePaciente = rolPaciente === "paciente" || datos.esPaciente === true || datos.fechaNacimiento || datos.diagnostico || datos.historialDiagnosticos;
    if (!parecePaciente) return;
    if (rol !== "admin" && !pacienteVinculadoConUsuario(datos, usuario?.uid)) return;
    pacientes.push({ id: docSnap.id, ...datos });
  });
  return pacientes.sort((a, b) => nombrePaciente(a).localeCompare(nombrePaciente(b), "es"));
}

export async function cargarExpedientePacienteSofia(idPaciente) {
  const snap = await getDoc(doc(db, "usuarios", idPaciente));
  if (!snap.exists()) throw new Error("Paciente no encontrado");
  const paciente = { id: snap.id, ...snap.data() };
  const [tratamientos, notas, notasRapidas, estudios, escalasUsuario, escalasPaciente] = await Promise.all([
    leerSubcoleccionUsuario(idPaciente, "tratamientos"), leerSubcoleccionUsuario(idPaciente, "notas"), leerSubcoleccionUsuario(idPaciente, "notasRapidas"),
    leerSubcoleccionUsuario(idPaciente, "estudios"), leerSubcoleccionUsuario(idPaciente, "escalasAplicadas"), leerSubcoleccionPaciente(idPaciente, "escalasAplicadas")
  ]);
  return { paciente, tratamientos, notas, notasRapidas, estudios, escalas: mezclarPorId([...escalasUsuario, ...escalasPaciente]) };
}

export function construirPacienteDigital(expediente) {
  const paciente = expediente?.paciente || {};
  const edad = calcularEdad(paciente.fechaNacimiento || paciente.nacimiento) ?? paciente.edad ?? null;
  const diagnosticos = extraerDiagnosticos(expediente);
  const tratamientosActivos = (expediente.tratamientos || []).filter((t) => estaActivo(t));
  const textoClinico = recolectarTextoClinico(expediente);
  const sintomas = detectarSintomasClinicos(textoClinico);
  const riesgos = estimarRiesgosClinicos(expediente);
  const protectores = detectarFactoresProtectores(textoClinico);
  const consumo = detectarConsumo(textoClinico);

  return {
    identificacion: {
      nombre: nombrePaciente(paciente),
      sexo: paciente.sexo || paciente.genero || "Sin registro",
      edad,
      institucion: paciente.institucion || paciente.atencionEn || paciente.tipoPaciente || "Sin registro",
      medicoTratante: paciente.medicoTratante || paciente.medico || "Sin registro"
    },
    diagnosticos,
    sintomas,
    tratamientosActivos,
    escalas: expediente.escalas || [],
    estudios: expediente.estudios || [],
    riesgos,
    protectores,
    consumo,
    cobertura: calcularCobertura(expediente)
  };
}

export function construirLineaTiempo(expediente) {
  const eventos = [];
  const paciente = expediente?.paciente || {};
  agregarEvento(eventos, paciente.fechaRegistro || paciente.createdAt, "Registro", "Ingreso a Cognicion", nombrePaciente(paciente), "registro");
  (expediente.notas || []).forEach((nota) => {
    const tituloNota = String(nota.titulo || "").trim();
    const tipoNota = nota.observacionFray?.tipoNota || nota.tipoNota || nota.formato || "Nota clinica";
    const etiquetaNota = `${tituloNota ? `${tituloNota} · ` : ""}${tipoNota}${nota.esNotaPrevia === true ? " · Nota previa" : ""}`;
    const fechaNota = nota.esNotaPrevia === true && nota.fechaNota
      ? nota.fechaNota
      : obtenerFechaDocumento(nota);
    agregarEvento(
      eventos,
      fechaNota,
      "Nota",
      etiquetaNota,
      nota.subjetivo || nota.padecimientoActual || nota.texto || nota.objetivo || "Sin resumen",
      "nota",
      nota.id
    );
  });
  (expediente.tratamientos || []).forEach((t) => {
    agregarEvento(eventos, t.fechaInicio || t.createdAt, "Tratamiento", t.medicamento || "Medicamento", resumenTratamiento(t), "tratamiento", t.id);
    if (t.fechaSuspension) agregarEvento(eventos, t.fechaSuspension, "Suspension", t.medicamento || "Medicamento", t.motivoSuspension || "Suspension registrada", "tratamiento", t.id);
  });
  (expediente.estudios || []).forEach((e) => agregarEvento(eventos, e.fecha || e.createdAt, "Estudio", e.nombre || e.tipo || "Estudio", e.resultado || e.resumen || "Sin resultado", "estudio", e.id));
  (expediente.escalas || []).forEach((e) => agregarEvento(eventos, e.fechaAplicacion || e.createdAt, "Escala", e.nombreEscala || e.nombre || "Escala", `${e.puntajeTotal ?? "--"} ${e.interpretacion || ""}`.trim(), "escala", e.id));
  (expediente.notasRapidas || []).forEach((n) => agregarEvento(eventos, n.fecha || n.createdAt, "Nota rapida", "Observacion breve", n.texto || n.nota || "Sin texto", "nota-rapida", n.id));
  return eventos.filter((evento) => evento.fechaOrden).sort((a, b) => b.fechaOrden - a.fechaOrden);
}

export function construirMapaRelaciones(expediente) {
  const digital = construirPacienteDigital(expediente);
  const nodos = [{ id: "paciente", etiqueta: digital.identificacion.nombre, tipo: "paciente" }];
  const enlaces = [];
  digital.diagnosticos.slice(0, 8).forEach((diag, index) => {
    const id = `dx-${index}`;
    nodos.push({ id, etiqueta: `${diag.codigo || "Dx"} ${diag.nombre || diag.texto || "Diagnostico"}`.trim(), tipo: "diagnostico" });
    enlaces.push({ desde: "paciente", hacia: id, etiqueta: index === 0 ? "principal" : "relacionado" });
  });
  digital.sintomas.slice(0, 10).forEach((sintoma, index) => {
    const id = `sx-${index}`;
    nodos.push({ id, etiqueta: sintoma, tipo: "sintoma" });
    enlaces.push({ desde: "paciente", hacia: id, etiqueta: "refiere" });
  });
  digital.tratamientosActivos.slice(0, 8).forEach((trat, index) => {
    const id = `tx-${index}`;
    nodos.push({ id, etiqueta: trat.medicamento || "Tratamiento", tipo: "medicamento" });
    enlaces.push({ desde: "paciente", hacia: id, etiqueta: "indicado" });
  });
  digital.riesgos.forEach((riesgo, index) => {
    const id = `rk-${index}`;
    nodos.push({ id, etiqueta: riesgo.titulo, tipo: "riesgo" });
    enlaces.push({ desde: "paciente", hacia: id, etiqueta: riesgo.nivel });
  });
  digital.protectores.forEach((factor, index) => {
    const id = `fp-${index}`;
    nodos.push({ id, etiqueta: factor, tipo: "protector" });
    enlaces.push({ desde: "paciente", hacia: id, etiqueta: "protege" });
  });
  return { nodos, enlaces };
}

export function generarNarrativaClinica(expediente) {
  const digital = construirPacienteDigital(expediente);
  const paciente = digital.identificacion;
  const principal = digital.diagnosticos[0];
  const tratamientos = digital.tratamientosActivos.map((t) => t.medicamento).filter(Boolean).slice(0, 5).join(", ");
  const timeline = construirLineaTiempo(expediente);
  const primerEvento = timeline.length ? timeline[timeline.length - 1] : null;
  const ultimoEvento = timeline[0] || null;
  const sintomas = digital.sintomas.slice(0, 6).join(", ");
  const protectores = digital.protectores.slice(0, 4).join(", ");
  const riesgos = digital.riesgos.filter((r) => r.nivel !== "bajo").map((r) => r.titulo).join(", ");
  const partes = [];
  partes.push(`Paciente ${paciente.sexo || "sin sexo registrado"}${paciente.edad !== null ? ` de ${paciente.edad} años` : ""}, con atencion registrada en ${paciente.institucion || "la plataforma"}.`);
  if (principal) partes.push(`El diagnostico principal registrado es ${formatearDiagnostico(principal)}.`);
  if (primerEvento) partes.push(`La linea temporal inicia con ${primerEvento.titulo.toLowerCase()} (${formatearFecha(primerEvento.fechaOrden)}).`);
  if (sintomas) partes.push(`En la informacion disponible se identifican elementos clinicos relacionados con ${sintomas}.`);
  if (tratamientos) partes.push(`Cuenta con tratamiento activo registrado con ${tratamientos}.`);
  if (ultimoEvento) partes.push(`El ultimo evento documentado corresponde a ${ultimoEvento.titulo.toLowerCase()} (${formatearFecha(ultimoEvento.fechaOrden)}).`);
  if (protectores) partes.push(`Como factores protectores o de apoyo aparecen: ${protectores}.`);
  if (riesgos) partes.push(`SOFIA detecta focos de vigilancia: ${riesgos}.`);
  partes.push("Esta narrativa es una integracion automatica y debe ser revisada por el profesional antes de utilizarse en una decision clinica.");
  return partes.join(" ");
}

export function generarRazonamientoClinico(expediente) {
  const digital = construirPacienteDigital(expediente);
  const texto = normalizarTexto(recolectarTextoClinico(expediente));
  const hipotesis = [];
  digital.diagnosticos.slice(0, 5).forEach((diag, index) => {
    hipotesis.push({
      titulo: formatearDiagnostico(diag),
      tipo: index === 0 ? "Diagnostico principal registrado" : "Diagnostico diferencial/relacionado",
      confianza: index === 0 ? "media" : "baja-media",
      aFavor: ["Diagnostico documentado en el expediente", ...digital.sintomas.slice(0, 3)],
      enContra: extraerDatosFaltantes(expediente).slice(0, 3),
      evidencia: ["Diagnosticos estructurados", "Notas clinicas", "Tratamientos y escalas disponibles"]
    });
  });
  if (texto.includes("suicid") || texto.includes("autoles") || texto.includes("muerte")) {
    hipotesis.push({ titulo: "Riesgo suicida a vigilar", tipo: "Riesgo clinico", confianza: "media-alta", aFavor: ["Terminos de riesgo detectados en notas"], enContra: ["Requiere entrevista de riesgo estructurada"], evidencia: ["Texto de notas", "Factores protectores y antecedentes"] });
  }
  if (!hipotesis.length) hipotesis.push({ titulo: "Integracion insuficiente", tipo: "Necesita mas datos", confianza: "baja", aFavor: ["Expediente con poca informacion clinica analizable"], enContra: ["No hay sintomas, escalas o diagnosticos suficientes"], evidencia: ["Cobertura de expediente"] });
  return hipotesis;
}

export function generarCriticaNota(textoNota, expediente = null) {
  const texto = normalizarTexto(textoNota || "");
  const hallazgos = [];
  const requiere = [
    ["padecimiento actual", ["padecimiento", "subjetivo", "evolucion", "motivo"]],
    ["exploracion mental", ["mental", "objetivo", "afecto", "pensamiento", "sensopercepcion"]],
    ["riesgo suicida", ["suicid", "riesgo", "autoles", "muerte"]],
    ["impresion diagnostica", ["diagnost", "cie", "impresion"]],
    ["plan terapeutico", ["plan", "tratamiento", "indicacion", "seguimiento"]]
  ];
  requiere.forEach(([nombre, claves]) => {
    if (!claves.some((clave) => texto.includes(clave))) {
      hallazgos.push({ nivel: nombre === "riesgo suicida" ? "alto" : "moderado", titulo: `Posible ausencia de ${nombre}`, detalle: `No se identificaron terminos compatibles con ${nombre}. Revise si debe documentarse de forma explicita.`, porQue: "SOFIA busca marcadores textuales minimos de calidad documental; no modifica la nota." });
    }
  });
  if (texto.includes("sin riesgo") && (texto.includes("suicid") || texto.includes("autoles"))) {
    hallazgos.push({ nivel: "alto", titulo: "Revise congruencia de riesgo", detalle: "La nota contiene terminos de riesgo junto con una posible negacion general. Conviene precisar ideacion, plan, intento, medios y factores protectores.", porQue: "Las notas de riesgo deben diferenciar negacion actual, antecedente, plan, acceso a medios e intervencion familiar." });
  }
  if (expediente) {
    analizarInteraccionesMedicamentos(expediente.tratamientos || []).forEach((interaccion) => {
      if (["importante", "contraindicada"].includes(interaccion.severidad)) hallazgos.push({ nivel: "alto", titulo: `Interaccion a considerar: ${interaccion.medicamentos.join(" + ")}`, detalle: interaccion.consecuencia, porQue: interaccion.mecanismo });
    });
  }
  return hallazgos.length ? hallazgos : [{ nivel: "bajo", titulo: "Sin omisiones mayores detectadas por reglas basicas", detalle: "La revision automatica no encontro faltantes obvios. Mantenga revision clinica manual antes de guardar.", porQue: "Analisis preliminar basado en reglas, no auditoria medico-legal completa." }];
}

export function estimarRiesgosClinicos(expediente) {
  const texto = normalizarTexto(recolectarTextoClinico(expediente));
  const tratamientos = expediente?.tratamientos || [];
  const riesgos = [];
  const riesgoSuicida = puntuar(texto, ["suicid", "autoles", "morir", "muerte", "sobredosis", "cort", "colgar", "arrojar"]);
  if (riesgoSuicida >= 2) riesgos.push({ titulo: "Riesgo suicida", nivel: riesgoSuicida >= 4 ? "alto" : "moderado", factores: ["Marcadores de suicidio/autolesion en notas", "Requiere entrevista de riesgo estructurada"], faltantes: ["Plan", "Acceso a medios", "Intentos previos", "Factores protectores"] });
  if (puntuar(texto, ["abandono", "suspend", "dejo", "no toma", "mala adherencia"]) > 0) riesgos.push({ titulo: "Riesgo de abandono/adherencia", nivel: "moderado", factores: ["Suspension o baja adherencia documentada"], faltantes: ["Motivo de suspension", "Efectos adversos", "Apoyo familiar"] });
  if (puntuar(texto, ["hospital", "urgencia", "ingreso", "reingreso", "cama"]) > 1) riesgos.push({ titulo: "Riesgo de rehospitalizacion", nivel: "moderado", factores: ["Hospitalizaciones o atencion institucional documentada"], faltantes: ["Fecha de alta", "Plan de continuidad", "Red de apoyo"] });
  if (tratamientos.some((t) => /olanzapina|quetiapina|risperidona|clozapina/i.test(t.medicamento || ""))) riesgos.push({ titulo: "Riesgo metabolico por antipsicotico", nivel: "moderado", factores: ["Antipsicotico activo"], faltantes: ["Peso", "IMC", "Glucosa/HbA1c", "Lipidos"] });
  if (!riesgos.length) riesgos.push({ titulo: "Sin riesgos altos detectados por reglas", nivel: "bajo", factores: ["No se identificaron marcadores suficientes"], faltantes: ["La ausencia de datos no equivale a ausencia de riesgo"] });
  return riesgos;
}

export function generarAlertasInteligentes(expediente) {
  const alertas = [];
  analizarInteraccionesMedicamentos(expediente?.tratamientos || []).forEach((interaccion) => {
    if (interaccion.severidad !== "sin_interaccion") alertas.push({ nivel: interaccion.severidad, titulo: `Interaccion: ${interaccion.medicamentos.join(" + ")}`, detalle: interaccion.consecuencia, porQue: interaccion.mecanismo, accion: interaccion.conducta });
  });
  generarRecomendacionesLaboratorio(expediente).forEach((rec) => {
    if (rec.prioridad !== "rutina") alertas.push({ nivel: rec.prioridad, titulo: `Monitorizacion sugerida: ${rec.estudio}`, detalle: rec.motivo, porQue: rec.relacion, accion: rec.periodicidad });
  });
  return alertas;
}

export function generarRecomendacionesLaboratorio(expediente) {
  const meds = (expediente?.tratamientos || []).map((t) => normalizarTexto(t.medicamento || "")).join(" ");
  const recs = [];
  const agregar = (estudio, motivo, relacion, periodicidad = "Segun criterio clinico", prioridad = "rutina") => recs.push({ estudio, motivo, relacion, periodicidad, prioridad });
  if (/olanzapina|quetiapina|risperidona|haloperidol|clozapina/.test(meds)) {
    agregar("Perfil metabolico", "Vigilar peso, glucosa, HbA1c y lipidos.", "Antipsicoticos pueden aumentar riesgo metabolico.", "Basal y seguimiento periodico", "moderado");
    agregar("ECG", "Considerar si hay riesgo cardiovascular, dosis altas o combinaciones que prolongan QT.", "Algunos antipsicoticos pueden prolongar QT.", "Basal si riesgo o sintomas", "moderado");
  }
  if (/litio/.test(meds)) {
    agregar("Litio serico", "Evitar toxicidad y verificar rango terapeutico.", "Litio tiene ventana terapeutica estrecha.", "Basal tras ajuste y seguimiento", "importante");
    agregar("Funcion renal, TSH y electrolitos", "Detectar efectos renales, tiroideos o electroliticos.", "Litio se elimina por rinon y puede alterar tiroides.", "Basal y periodico", "importante");
  }
  if (/valproato|carbamazepina/.test(meds)) agregar("Biometria hematica y funcion hepatica", "Detectar citopenias o hepatotoxicidad.", "Anticonvulsivos estabilizadores requieren vigilancia.", "Basal y seguimiento", "moderado");
  if (/carbamazepina/.test(meds)) agregar("Sodio serico", "Detectar hiponatremia.", "Carbamazepina puede inducir SIADH/hiponatremia.", "Basal y si sintomas", "moderado");
  if (/sertralina|fluoxetina|paroxetina|venlafaxina|duloxetina/.test(meds)) agregar("Sodio serico", "Considerar en adultos mayores, polifarmacia o sintomas compatibles.", "ISRS/IRSN pueden asociarse con hiponatremia.", "Segun riesgo", "rutina");
  return recs;
}

export function analizarInteraccionesMedicamentos(tratamientos = []) {
  const activos = tratamientos.filter((t) => estaActivo(t));
  const resultado = evaluarMedicamentosPaciente({ medicamentos: activos });
  const severidadSofia = {
    critica: "contraindicada",
    alta: "importante",
    moderada: "moderada",
    baja: "baja",
    informativa: "informativa"
  };
  return resultado.alertas
    .filter((alerta) => alerta.medicamentos?.length)
    .map((alerta) => ({
      id: alerta.id,
      severidad: severidadSofia[alerta.severidad] || alerta.severidad,
      medicamentos: alerta.medicamentos,
      mecanismo: alerta.mecanismo,
      consecuencia: alerta.efectoClinico || alerta.efecto,
      conducta: alerta.recomendacion,
      categoria: alerta.categoria || alerta.tipoInteraccion || alerta.tipo
    }));
}

function pacienteVinculadoConUsuario(datos, uid) {
  if (!uid) return false;
  const campos = [datos.uidMedico, datos.medicoUid, datos.medicoTratanteUid, datos.creadoPor, datos.idMedico];
  if (campos.includes(uid)) return true;
  if (Array.isArray(datos.medicosAutorizados) && datos.medicosAutorizados.includes(uid)) return true;
  if (Array.isArray(datos.profesionalesAutorizados) && datos.profesionalesAutorizados.includes(uid)) return true;
  if (datos.permisos && (datos.permisos[uid] || datos.permisos.includes?.(uid))) return true;
  return false;
}

async function leerSubcoleccionUsuario(idPaciente, nombre) { return leerColeccionConId(collection(db, "usuarios", idPaciente, nombre)); }
async function leerSubcoleccionPaciente(idPaciente, nombre) {
  try { return await leerColeccionConId(collection(db, "pacientes", idPaciente, nombre)); } catch { return []; }
}
async function leerColeccionConId(ref) {
  try {
    const snap = await getDocs(ref);
    const docs = [];
    snap.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
    return docs.sort((a, b) => (obtenerFechaDocumento(b)?.getTime() || 0) - (obtenerFechaDocumento(a)?.getTime() || 0));
  } catch (error) {
    console.warn("SOFIA no pudo leer subcoleccion", error);
    return [];
  }
}

function normalizarFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (valor?.toDate) return valor.toDate();
  if (typeof valor === "number") return new Date(valor);
  if (typeof valor === "string") {
    const limpio = valor.trim();
    const ddmmaa = limpio.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (ddmmaa) return new Date(Number(ddmmaa[3]), Number(ddmmaa[2]) - 1, Number(ddmmaa[1]), Number(ddmmaa[4] || 0), Number(ddmmaa[5] || 0));
    const fecha = new Date(limpio);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  return null;
}
function obtenerFechaDocumento(docu) {
  for (const campo of CAMPOS_FECHA) {
    const fecha = normalizarFecha(docu?.[campo]);
    if (fecha) return fecha;
  }
  return null;
}
function agregarEvento(eventos, fechaValor, categoria, titulo, detalle, tipo, id = null) {
  const fecha = normalizarFecha(fechaValor);
  if (!fecha) return;
  eventos.push({ fecha: formatearFecha(fecha), fechaOrden: fecha, categoria, titulo, detalle: resumenCorto(detalle), tipo, id });
}
function formatearFecha(fecha) {
  const f = normalizarFecha(fecha);
  if (!f) return "Sin fecha";
  return f.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function nombrePaciente(paciente = {}) {
  return obtenerNombrePacienteParaMostrar(paciente) || "Paciente sin nombre";
}
function normalizarTexto(texto) { return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function resumenCorto(texto, max = 180) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return "Sin detalle";
  return limpio.length > max ? `${limpio.slice(0, max - 1)}...` : limpio;
}
function estaActivo(tratamiento) {
  const estado = normalizarTexto(tratamiento.estado || tratamiento.estatus || "activo");
  return !/suspend|elimin|inactivo|finaliz/.test(estado) && !tratamiento.fechaSuspension;
}
function resumenTratamiento(t) { return [t.medicamento, t.dosis, normalizarTextoFrecuencia(t.frecuencia), t.via].filter(Boolean).join(". ") || "Tratamiento registrado"; }
function extraerDiagnosticos(expediente) {
  const paciente = expediente?.paciente || {};
  const dx = [];
  const agregar = (item) => {
    if (!item) return;
    if (typeof item === "object" && item.estado === "descartado") return;
    if (typeof item === "string") dx.push({ texto: item, nombre: item });
    else if (typeof item === "object") dx.push({ ...item, texto: item.texto || item.nombre || item.diagnostico || item.codigo || "Diagnostico" });
  };
  agregar(paciente.diagnostico);
  (paciente.diagnosticos || []).forEach(agregar);
  (paciente.historialDiagnosticos || []).filter((item) => item?.estado !== "descartado").forEach(agregar);
  (expediente.notas || []).forEach((nota) => (nota.diagnosticos || nota.diagnosticosSeleccionados || []).forEach?.(agregar));
  return mezclarDiagnosticos(dx).sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
}
function mezclarDiagnosticos(items) {
  const mapa = new Map();
  items.forEach((item, index) => {
    const clave = normalizarTexto(`${item.codigo || ""}-${item.nombre || item.texto || ""}`);
    if (!mapa.has(clave)) mapa.set(clave, { ...item, orden: item.orden ?? index });
  });
  return [...mapa.values()];
}
function mezclarPorId(items) {
  const mapa = new Map();
  items.forEach((item, index) => mapa.set(item.id || `${item.nombreEscala || "item"}-${index}`, item));
  return [...mapa.values()];
}
function formatearDiagnostico(diag) { return [diag.codigo, diag.nombre || diag.texto || diag.diagnostico].filter(Boolean).join(" - ") || "Diagnostico sin nombre"; }
function recolectarTextoClinico(expediente) {
  const partes = [];
  const paciente = expediente?.paciente || {};
  [paciente.motivoConsulta, paciente.antecedentes, paciente.historiaClinica, paciente.observaciones, paciente.alergias].forEach((v) => partes.push(v));
  (expediente.notas || []).forEach((n) => partes.push(n.subjetivo, n.objetivo, n.analisis, n.plan, n.padecimientoActual, n.exploracionMental, n.comentarioClinico, n.texto));
  (expediente.notasRapidas || []).forEach((n) => partes.push(n.texto, n.nota));
  (expediente.estudios || []).forEach((e) => partes.push(e.resultado, e.resumen, e.observaciones));
  return partes.filter(Boolean).join("\n");
}
function detectarSintomasClinicos(textoOriginal) {
  const texto = normalizarTexto(textoOriginal);
  const reglas = [["animo depresivo", /triste|hipotim|llanto|depres/], ["anhedonia", /anhedon|no disfruta|ya no disfruta|sin interes/], ["ansiedad", /ansiedad|preocupacion|inquietud|panico|angustia/], ["insomnio", /insomnio|no duerme|despierta|suen[oñ]/], ["psicosis o alteraciones sensoperceptivas", /alucin|delirio|voces|persecut/], ["sintomas maniformes", /euforia|verborrea|grandios|fuga de ideas|disminucion de sueno/], ["consumo de sustancias", /alcohol|cannabis|cocaina|cristal|metanfetamina|opioide|benzodiacepina/], ["riesgo suicida/autolesivo", /suicid|autoles|cortarse|sobredosis|morir/]];
  return reglas.filter(([, regex]) => regex.test(texto)).map(([nombre]) => nombre);
}
function detectarFactoresProtectores(textoOriginal) {
  const texto = normalizarTexto(textoOriginal);
  const factores = [];
  if (/familia|madre|padre|herman|pareja|hijo|acompan/.test(texto)) factores.push("Red de apoyo familiar");
  if (/trabajo|escuela|estudia|empleo/.test(texto)) factores.push("Funcion ocupacional/academica documentada");
  if (/adheren|toma tratamiento|acude|seguimiento/.test(texto)) factores.push("Seguimiento terapeutico documentado");
  if (/religion|espiritual|iglesia/.test(texto)) factores.push("Recurso espiritual referido");
  return factores;
}
function detectarConsumo(textoOriginal) {
  const texto = normalizarTexto(textoOriginal);
  return ["alcohol", "cannabis", "cocaina", "metanfetamina", "opioides", "benzodiacepinas"].filter((s) => texto.includes(s.replace("opioides", "opioide")) || texto.includes(s));
}
function calcularCobertura(expediente) {
  const faltantes = extraerDatosFaltantes(expediente);
  const total = 8;
  return { porcentaje: Math.max(0, Math.round(((total - faltantes.length) / total) * 100)), faltantes };
}
function extraerDatosFaltantes(expediente) {
  const paciente = expediente?.paciente || {};
  const faltantes = [];
  if (!paciente.fechaNacimiento) faltantes.push("Fecha de nacimiento");
  if (!paciente.sexo && !paciente.genero) faltantes.push("Sexo/genero");
  if (!extraerDiagnosticos(expediente).length) faltantes.push("Diagnosticos estructurados");
  if (!(expediente?.tratamientos || []).length) faltantes.push("Tratamientos");
  if (!(expediente?.notas || []).length) faltantes.push("Notas clinicas");
  if (!(expediente?.escalas || []).length) faltantes.push("Escalas clinicas");
  if (!(expediente?.estudios || []).length) faltantes.push("Estudios/laboratorios");
  if (!paciente.alergias) faltantes.push("Alergias");
  return faltantes;
}
function puntuar(texto, claves) { return claves.reduce((acc, clave) => acc + (texto.includes(clave) ? 1 : 0), 0); }
