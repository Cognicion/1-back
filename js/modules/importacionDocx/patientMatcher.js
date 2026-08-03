import { listarPacientes } from "../../services/usuarios.js?v=20260718-patient-access";
import {
  obtenerNombrePacienteParaMostrar,
  normalizarTextoBusquedaPaciente
} from "../../utils/nombresPacientes.js";

function puntuarPaciente(paciente = {}, campos = {}) {
  let score = 0;
  const nombrePaciente = normalizarTextoBusquedaPaciente(obtenerNombrePacienteParaMostrar(paciente));
  const nombreImportado = normalizarTextoBusquedaPaciente(campos.nombre || "");
  if (nombrePaciente && nombreImportado && (nombrePaciente.includes(nombreImportado) || nombreImportado.includes(nombrePaciente))) score += 5;
  if (campos.curp && paciente.curp && String(paciente.curp).toUpperCase() === String(campos.curp).toUpperCase()) score += 8;
  if (campos.expediente && [paciente.expediente, paciente.numeroExpediente, paciente.expedienteCognicion].some((valor) => String(valor || "").trim() === String(campos.expediente).trim())) score += 4;
  return score;
}

export async function buscarPacientesCandidatos(uidMedico, campos = {}) {
  const snap = await listarPacientes(uidMedico);
  const pacientes = [];
  snap.forEach((docPaciente) => pacientes.push({ id: docPaciente.id, ...docPaciente.data() }));
  return pacientes
    .map((paciente) => ({
      id: paciente.id,
      nombre: obtenerNombrePacienteParaMostrar(paciente) || paciente.nombre || "Paciente sin nombre",
      expediente: paciente.expediente || paciente.numeroExpediente || paciente.expedienteCognicion || "",
      score: puntuarPaciente(paciente, campos),
      datos: paciente
    }))
    .sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 80);
}
