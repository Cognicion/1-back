import { actualizarUsuario, crearPacienteProvisional, obtenerUsuario } from "../../../services/usuarios.js";
import { construirNombreCompletoPaciente } from "../../../utils/nombresPacientes.js";
import { normalizeRecordNumber } from "../parsing/patientDuplicateMatcher.js";

function normalizeImportedDate(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return text;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) return text;
  return `${year}-${month}-${day}`;
}

function nonEmptyEntries(fields = {}) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => (
    value !== "" && value !== null && value !== undefined
  )));
}

export function buildPatientPayload(fields = {}, user = {}) {
  const nombres = String(fields.nombres || "").trim().replace(/\s+/g, " ");
  const apellidoPaterno = String(fields.apellidoPaterno || "").trim().replace(/\s+/g, " ");
  const apellidoMaterno = String(fields.apellidoMaterno || "").trim().replace(/\s+/g, " ");
  const name = construirNombreCompletoPaciente({ nombres, apellidoPaterno, apellidoMaterno }) || fields.nombre || "Paciente importado sin nombre";
  const expediente = normalizeRecordNumber(fields.expediente || fields.numeroExpediente);
  const fechaNacimiento = normalizeImportedDate(fields.fechaNacimiento);
  return {
    nombre: name,
    nombreCompleto: name,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreEstructurado: Boolean(nombres || apellidoPaterno || apellidoMaterno),
    edadManual: fields.edad || "",
    sexo: fields.sexo || "",
    fechaNacimiento,
    curp: fields.curp || "",
    tipoPaciente: fields.institucion ? "institucion" : "privada",
    institucionPaciente: fields.institucion || "",
    institucion: fields.institucion || "",
    servicioInstitucional: fields.servicio || "",
    servicio: fields.servicio || "",
    expediente,
    numeroExpediente: expediente,
    cama: fields.cama || "",
    genero: fields.genero || "",
    alergias: fields.alergias || "",
    diasEstancia: fields.diasEstancia || "",
    medicoTratante: fields.medicoTratante || "",
    medicoAdscritoEncargado: fields.medicoAdscrito || "",
    datosInstitucionales: {
      nombrePaciente: name,
      nombreCompleto: name,
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      edadManual: fields.edad || "",
      sexo: fields.sexo || "",
      fechaNacimiento,
      curp: fields.curp || "",
      institucionPaciente: fields.institucion || "",
      servicioInstitucional: fields.servicio || "",
      expediente,
      cama: fields.cama || "",
      genero: fields.genero || "",
      alergias: fields.alergias || "",
      diasEstancia: fields.diasEstancia || ""
    },
    origenTraspasoPacientesDocx: true,
    transferOperationId: fields.transferOperationId || "",
    creadoPor: user.uid || "",
    ownerUid: user.uid || "",
    createdByUid: user.uid || "",
    medicoUid: user.uid || "",
    medicoTratanteUid: user.uid || "",
    medicosAutorizados: [user.uid].filter(Boolean)
  };
}

export async function createTransferredPatient(fields, user) {
  const ref = await crearPacienteProvisional(buildPatientPayload(fields, user));
  return ref;
}

/**
 * Completa el expediente ya existente sin reemplazar valores clínicos o
 * administrativos que la importación no detectó.
 */
export async function mergeTransferredPatientFields(patientId, fields = {}, user = {}) {
  const current = await obtenerUsuario(patientId);
  const imported = buildPatientPayload(fields, user);
  const hasImportedName = Boolean(
    String(fields.nombres || "").trim()
    || String(fields.apellidoPaterno || "").trim()
    || String(fields.apellidoMaterno || "").trim()
    || String(fields.nombre || "").trim()
  );
  const importedInstitutional = nonEmptyEntries({
    nombrePaciente: hasImportedName ? imported.nombre : "",
    nombreCompleto: hasImportedName ? imported.nombreCompleto : "",
    nombres: hasImportedName ? imported.nombres : "",
    apellidoPaterno: hasImportedName ? imported.apellidoPaterno : "",
    apellidoMaterno: hasImportedName ? imported.apellidoMaterno : "",
    edadManual: fields.edad || "",
    sexo: fields.sexo || "",
    fechaNacimiento: imported.fechaNacimiento,
    curp: fields.curp || "",
    institucionPaciente: fields.institucion || "",
    servicioInstitucional: fields.servicio || "",
    expediente: imported.expediente,
    cama: fields.cama || "",
    genero: fields.genero || "",
    alergias: fields.alergias || "",
    diasEstancia: fields.diasEstancia || ""
  });
  const patch = nonEmptyEntries({
    nombre: hasImportedName ? imported.nombre : "",
    nombreCompleto: hasImportedName ? imported.nombreCompleto : "",
    nombres: hasImportedName ? imported.nombres : "",
    apellidoPaterno: hasImportedName ? imported.apellidoPaterno : "",
    apellidoMaterno: hasImportedName ? imported.apellidoMaterno : "",
    nombreEstructurado: hasImportedName ? imported.nombreEstructurado : null,
    edadManual: imported.edadManual,
    sexo: imported.sexo,
    fechaNacimiento: imported.fechaNacimiento,
    curp: imported.curp,
    tipoPaciente: fields.institucion ? imported.tipoPaciente : "",
    institucionPaciente: imported.institucionPaciente,
    institucion: imported.institucion,
    servicioInstitucional: imported.servicioInstitucional,
    servicio: imported.servicio,
    expediente: imported.expediente,
    numeroExpediente: imported.numeroExpediente,
    cama: imported.cama,
    genero: imported.genero,
    alergias: imported.alergias,
    diasEstancia: imported.diasEstancia,
    medicoTratante: imported.medicoTratante,
    medicoAdscritoEncargado: imported.medicoAdscritoEncargado,
    datosInstitucionales: {
      ...(current?.datosInstitucionales || {}),
      ...importedInstitutional
    }
  });
  await actualizarUsuario(patientId, patch);
  return patch;
}
