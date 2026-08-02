export function cumpleFiltros(item, filtros = {}) {
  const texto = `${item.clave} ${item.campo} ${item.diagnostico} ${item.servicio} ${item.institucion}`.toLowerCase();
  if (filtros.busqueda && !texto.includes(String(filtros.busqueda).toLowerCase())) return false;
  if (filtros.medico && item.medicoUid !== filtros.medico) return false;
  if (filtros.paciente && item.pacienteUid !== filtros.paciente) return false;
  if (filtros.institucion && item.institucion !== filtros.institucion) return false;
  if (filtros.servicio && item.servicio !== filtros.servicio) return false;
  if (filtros.desde && item.fecha < filtros.desde) return false;
  if (filtros.hasta && item.fecha > `${filtros.hasta}T23:59:59.999Z`) return false;
  return true;
}
