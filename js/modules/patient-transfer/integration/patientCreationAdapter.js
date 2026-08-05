import { crearPacienteProvisional } from "../../../services/usuarios.js?v=20260729-imc-payload-fix";
import { construirNombreCompletoPaciente } from "../../../utils/nombresPacientes.js";
import { normalizeRecordNumber } from "../parsing/patientDuplicateMatcher.js";

export function buildPatientPayload(fields = {}, user = {}) {
  const nombres = String(fields.nombres || "").trim().replace(/\s+/g, " ");
  const apellidoPaterno = String(fields.apellidoPaterno || "").trim().replace(/\s+/g, " ");
  const apellidoMaterno = String(fields.apellidoMaterno || "").trim().replace(/\s+/g, " ");
  const name = construirNombreCompletoPaciente({ nombres, apellidoPaterno, apellidoMaterno }) || fields.nombre || "Paciente importado sin nombre";
  const expediente = normalizeRecordNumber(fields.expediente || fields.numeroExpediente);
  return {
    nombre: name,
    nombreCompleto: name,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreEstructurado: Boolean(nombres || apellidoPaterno || apellidoMaterno),
    edadManual: fields.edad || "",
    sexo: fields.sexo || "",
    fechaNacimiento: fields.fechaNacimiento || "",
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
      fechaNacimiento: fields.fechaNacimiento || "",
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
