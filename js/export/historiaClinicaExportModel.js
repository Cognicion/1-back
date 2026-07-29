import { HISTORIA_CLINICA_EXPORT_VERSION } from "../config/appVersion.js";

const texto = (valor) => String(valor ?? "").trim();
const tiene = (valor) => texto(valor).length > 0;
const valor = (datos, clave, alternos = []) => {
  for (const fuente of [datos, datos?.datosInstitucionales, datos?.datosClinicosResumen, datos?.signosVitales, datos?.somatometria]) {
    if (!fuente) continue;
    for (const nombre of [clave, ...alternos]) if (tiene(fuente[nombre])) return fuente[nombre];
  }
  return "";
};

function edad(fecha) {
  if (!fecha) return "";
  const nacimiento = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let resultado = hoy.getFullYear() - nacimiento.getFullYear();
  if (hoy.getMonth() < nacimiento.getMonth() || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())) resultado -= 1;
  return resultado >= 0 ? resultado : "";
}

function nombrePaciente(paciente = {}) {
  return texto(paciente.nombreCompleto || paciente.nombre || [paciente.nombres, paciente.apellidoPaterno, paciente.apellidoMaterno].filter(Boolean).join(" ")) || "Paciente";
}

function lineas(valorCampo) {
  return texto(valorCampo).replace(/\r\n?/g, "\n").split("\n").map((linea) => linea.trimEnd()).filter((linea, indice, lista) => linea || lista[indice - 1]);
}

function deduplicar(lista = []) {
  const vistos = new Set();
  return lista.filter((item) => {
    const clave = JSON.stringify(item).toLowerCase();
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

const SECCIONES = [
  ["motivo", "Motivo de consulta o ingreso", ["motivoConsulta", "motivoIngreso"]],
  ["padecimientoActual", "Padecimiento actual", ["padecimientoActual"]],
  ["ahf", "Antecedentes heredofamiliares", ["ahf", "antecedentesHeredofamiliares"]],
  ["antecedentesPerinatales", "Antecedentes perinatales", ["antecedentesPerinatales"]],
  ["app", "Antecedentes personales patológicos", ["app", "antecedentesPersonalesPatologicos"]],
  ["apnp", "Antecedentes personales no patológicos", ["apnp", "antecedentesPersonalesNoPatologicos"]],
  ["antecedentesGinecoobstetricos", "Antecedentes ginecoobstétricos", ["antecedentesGinecoobstetricos"]],
  ["hitosDesarrollo", "Antecedentes del desarrollo", ["hitosDesarrollo"]],
  ["historiaAcademica", "Antecedentes escolares", ["historiaAcademica"]],
  ["historiaLaboral", "Antecedentes laborales", ["historiaLaboral"]],
  ["historiaSocial", "Antecedentes sociales", ["historiaSocial"]],
  ["historiaFamiliar", "Historia familiar", ["historiaFamiliar"]],
  ["sustancias", "Consumo de sustancias", ["sustancias", "consumoSustancias"]],
  ["exploracionFisica", "Exploración física", ["exploracionFisica", "exploracionFisicaNarrativa"]],
  ["exploracionNeurologica", "Exploración neurológica", ["exploracionNeurologica"]],
  ["exploracionMental", "Examen mental", ["exploracionMental"]],
  ["diagnosticos", "Diagnósticos", ["diagnosticos", "diagnosticoClinico", "diagnostico"]],
  ["tratamiento", "Tratamiento", ["tratamientoFarmacologico", "tratamiento"]],
  ["indicaciones", "Indicaciones vigentes", ["indicaciones", "psicoterapia"]],
  ["plan", "Plan", ["seguimiento", "plan"]],
  ["pronostico", "Pronóstico", ["pronostico"]],
  ["observaciones", "Observaciones", ["observaciones"]]
];

function contenidoEspecial(clave, historia, ui) {
  if (clave === "hitosDesarrollo") {
    const datos = ui.hitosDesarrollo || historia.hitosDesarrollo || {};
    return datos.registros?.length || tiene(datos.observacionesGenerales) ? { kind: "development", data: datos } : null;
  }
  if (clave === "familiograma") return null;
  if (clave === "sustancias") {
    const datos = ui.sustancias || historia.sustancias || {};
    const partes = (datos.seleccionadas || []).map((item) => typeof item === "string" ? item : [item.nombre, item.frecuencia, item.cantidad].filter(Boolean).join(" · "));
    const textoSustancias = [partes.join("\n"), datos.observacionesGenerales, historia.tabaco, historia.alcohol, historia.otrasSustancias].filter(tiene).join("\n");
    return textoSustancias ? { kind: "text", data: textoSustancias } : null;
  }
  return null;
}

export function normalizarHistoriaClinicaParaExportacion({ paciente = {}, historia = {}, ui = {}, medico = {}, generadoEn = new Date() } = {}) {
  const fechaNacimiento = valor(paciente, "fechaNacimiento", ["fecha_nacimiento", "fechaDeNacimiento"]);
  const institucional = {
    institucion: valor(ui, "institucionPaciente", ["institucion"]) || valor(paciente, "institucionPaciente", ["institucion"]),
    expediente: valor(ui, "expediente", ["numeroExpediente"]) || valor(paciente, "expediente", ["numeroExpediente"]),
    servicio: valor(ui, "servicioInstitucional", ["servicio"]) || valor(paciente, "servicioInstitucional", ["servicio"]),
    cama: valor(ui, "cama") || valor(paciente, "cama"),
    fechaIngreso: valor(ui, "fechaIngreso") || valor(paciente, "fechaIngreso"),
    tipoAtencion: valor(ui, "tipoPaciente") || valor(paciente, "tipoPaciente")
  };
  const campos = { ...historia, ...ui };
  const secciones = [];
  for (const [clave, titulo, alternos] of SECCIONES) {
    const especial = contenidoEspecial(clave, historia, ui);
    if (especial) secciones.push({ clave, titulo, ...especial });
    else {
      const contenido = alternos.map((nombre) => campos[nombre]).find(tiene);
      if (tiene(contenido)) secciones.push({ clave, titulo, kind: "text", data: lineas(contenido).join("\n") });
    }
  }
  const familiograma = ui.familiograma || historia.familiograma || {};
  if (familiograma.personas?.length) secciones.splice(11, 0, { clave: "familiograma", titulo: "Familiograma", kind: "family", data: familiograma });
  const dx = deduplicar([...(Array.isArray(historia.diagnosticos) ? historia.diagnosticos : []), ...(tiene(campos.diagnosticoClinico) ? [{ diagnostico: campos.diagnosticoClinico, codigo: campos.codigoDiagnostico, estado: campos.estadoDiagnostico, sistema: campos.sistemaDiagnostico }] : [])].map((item) => ({ codigo: texto(item.codigo || item.cie10), diagnostico: texto(item.diagnostico || item.nombre || item.texto), estado: texto(item.estado || ""), sistema: texto(item.sistema || item.sistemaDiagnostico || "") })).filter((item) => item.diagnostico || item.codigo));
  const signos = paciente.signosVitales || historia.signosVitales || {};
  return {
    version: HISTORIA_CLINICA_EXPORT_VERSION,
    marca: "COGNICIÓN LABS",
    titulo: "HISTORIA CLÍNICA",
    generadoEn: generadoEn.toISOString(),
    paciente: { nombre: nombrePaciente(paciente), fechaNacimiento, edad: edad(fechaNacimiento), sexo: valor(campos, "sexo"), genero: valor(campos, "genero", ["identidadGenero"]), curp: valor(paciente, "curp", ["CURP"]), telefono: valor(paciente, "telefono", ["telefonoPaciente", "celular"]) },
    institucional,
    seguridad: { alergias: valor(campos, "alergias"), tipoSangre: valor(campos, "tipoSangre") },
    somatometria: { peso: valor(campos, "peso"), talla: valor(campos, "talla"), imc: valor(campos, "imc"), perimetroAbdominal: valor(campos, "perimetroAbdominal") },
    vitales: { presionArterial: valor(signos, "presionArterial", ["presion" , "pa"]), frecuenciaCardiaca: valor(signos, "frecuenciaCardiaca", ["fc"]), frecuenciaRespiratoria: valor(signos, "frecuenciaRespiratoria", ["fr"]), temperatura: valor(signos, "temperatura", ["temp"]), saturacionO2: valor(signos, "saturacionO2", ["spo2", "saturacion"]) },
    diagnosticos: dx,
    tratamiento: { farmacologico: texto(campos.tratamientoFarmacologico || campos.tratamiento), indicaciones: texto(campos.indicaciones || campos.psicoterapia) },
    secciones,
    medico: { nombre: texto(medico.nombre), cargo: texto(medico.cargo || medico.cargoSistema || medico.puesto), cedula: texto(medico.cedula || medico.cedulaProfesional) }
  };
}
