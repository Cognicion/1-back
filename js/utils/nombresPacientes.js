function limpiarParteNombre(valor) {
  return String(valor ?? "").trim().replace(/\s+/g, " ");
}

export function construirNombreCompletoPaciente({
  nombres = "",
  apellidoPaterno = "",
  apellidoMaterno = ""
} = {}) {
  return [nombres, apellidoPaterno, apellidoMaterno]
    .map(limpiarParteNombre)
    .filter(Boolean)
    .join(" ");
}

export function obtenerNombrePacienteParaMostrar(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  const nombres = limpiarParteNombre(
    paciente.nombres ??
    institucional.nombres ??
    paciente.nombreNombres ??
    paciente.primerNombre ??
    paciente.nombrePropio ??
    ""
  );
  const apellidoPaterno = limpiarParteNombre(
    paciente.apellidoPaterno ??
    institucional.apellidoPaterno ??
    paciente.primerApellido ??
    ""
  );
  const apellidoMaterno = limpiarParteNombre(
    paciente.apellidoMaterno ??
    institucional.apellidoMaterno ??
    paciente.segundoApellido ??
    ""
  );

  const estructurado = construirNombreCompletoPaciente({
    nombres,
    apellidoPaterno,
    apellidoMaterno
  });
  if (estructurado) return estructurado;

  return limpiarParteNombre(
    paciente.nombreCompleto ??
    institucional.nombreCompleto ??
    paciente.nombrePaciente ??
    institucional.nombrePaciente ??
    paciente.nombre ??
    paciente.displayName ??
    ""
  );
}

export function normalizarTextoBusquedaPaciente(texto = "") {
  return limpiarParteNombre(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function textoBusquedaPaciente(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return normalizarTextoBusquedaPaciente([
    obtenerNombrePacienteParaMostrar(paciente),
    paciente.nombre,
    paciente.nombreCompleto,
    paciente.nombrePaciente,
    paciente.nombres,
    paciente.apellidoPaterno,
    paciente.apellidoMaterno,
    paciente.primerNombre,
    paciente.primerApellido,
    paciente.segundoApellido,
    institucional.nombrePaciente,
    institucional.nombres,
    institucional.apellidoPaterno,
    institucional.apellidoMaterno
  ].filter(Boolean).join(" "));
}
