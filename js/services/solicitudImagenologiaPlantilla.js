function valorNoVacio(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null && String(valor).trim() !== "") || "";
}

export function resolverExpedienteInstitucional(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return String(valorNoVacio(
    paciente.expediente,
    paciente.numeroExpediente,
    institucional.expediente,
    institucional.numeroExpediente
  )).trim();
}

function fechaLocalDesdeTexto(valor) {
  const texto = String(valor || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) return texto;
  const soloFecha = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (soloFecha) return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  return null;
}

export function formatearFechaDocumento(valor) {
  if (!valor) return "";
  if (typeof valor?.toDate === "function") valor = valor.toDate();
  const fechaTexto = typeof valor === "string" ? fechaLocalDesdeTexto(valor) : null;
  const fecha = fechaTexto || (valor instanceof Date ? valor : new Date(valor));
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "";
  return [fecha.getDate(), fecha.getMonth() + 1, fecha.getFullYear()]
    .map((parte, indice) => indice < 2 ? String(parte).padStart(2, "0") : String(parte))
    .join("/");
}

export function formatearHoraLocalDocumento(fecha = new Date()) {
  const hora = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(hora.getTime())) return "";
  return `${String(hora.getHours()).padStart(2, "0")}:${String(hora.getMinutes()).padStart(2, "0")}`;
}

export function normalizarMedicoCatalogo(medico = {}) {
  return {
    id: medico.id || medico.uid || "",
    uid: medico.uid || medico.id || "",
    nombre: valorNoVacio(medico.nombreCompleto, medico.nombre, medico.displayName),
    cargo: valorNoVacio(medico.cargoCompleto, medico.cargo, medico.grado, medico.especialidad),
    cedulaProfesional: valorNoVacio(medico.cedulaProfesional, medico.cedula),
    cedulaEspecialidad: valorNoVacio(medico.cedulaEspecialidad, medico.cedulaEspecialidadMedica, medico.cedulaProfesional, medico.cedula),
    especialidad: valorNoVacio(medico.especialidad, medico.cargoCompleto, medico.cargo),
    firmaId: valorNoVacio(medico.firmaId, medico.firma)
  };
}

export function resolverMedicoCatalogo(catalogo = [], id = "") {
  const encontrado = catalogo.find((medico) => String(medico.id || medico.uid || "") === String(id || ""));
  return encontrado ? normalizarMedicoCatalogo(encontrado) : null;
}
