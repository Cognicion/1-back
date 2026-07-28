export function normalizarSexo(valor = "") {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-MX");
}

export function esPacienteMujer(paciente = {}) {
  const valor = paciente.sexo ?? paciente.datosInstitucionales?.sexo ?? paciente.sexoBiologico ?? paciente.genero ?? paciente.datosInstitucionales?.genero;
  return ["f", "femenino", "mujer", "female"].includes(normalizarSexo(valor));
}
