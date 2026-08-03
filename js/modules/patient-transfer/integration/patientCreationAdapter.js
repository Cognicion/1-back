import { crearPacienteProvisional } from "../../../services/usuarios.js?v=20260729-imc-payload-fix";

export function buildPatientPayload(fields = {}, user = {}) {
  const name = fields.nombre || "Paciente importado sin nombre";
  return {
    nombre: name,
    nombreCompleto: name,
    edadManual: fields.edad || "",
    sexo: fields.sexo || "",
    fechaNacimiento: fields.fechaNacimiento || "",
    curp: fields.curp || "",
    tipoPaciente: fields.institucion ? "institucion" : "privada",
    institucionPaciente: fields.institucion || "",
    institucion: fields.institucion || "",
    servicioInstitucional: fields.servicio || "",
    servicio: fields.servicio || "",
    expediente: fields.expediente || "",
    numeroExpediente: fields.expediente || "",
    medicoTratante: fields.medicoTratante || "",
    medicoAdscritoEncargado: fields.medicoAdscrito || "",
    datosInstitucionales: {
      nombrePaciente: name,
      nombreCompleto: name,
      edadManual: fields.edad || "",
      sexo: fields.sexo || "",
      fechaNacimiento: fields.fechaNacimiento || "",
      curp: fields.curp || "",
      institucionPaciente: fields.institucion || "",
      servicioInstitucional: fields.servicio || "",
      expediente: fields.expediente || ""
    },
    origenTraspasoPacientesDocx: true,
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
