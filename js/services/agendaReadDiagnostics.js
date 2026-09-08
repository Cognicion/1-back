// Only static query metadata crosses this boundary; never log paths or values.
export const agendaReadSources = [
  { source: 'legacy-date', where: [['fecha', '>='], ['fecha', '<=']], orderBy: [] },
  { source: 'civil-overlap', where: [['startDate', '<='], ['endDate', '>=']], orderBy: [['startDate', 'asc'], ['endDate', 'asc']] },
  { source: 'recurrence', where: [['recurrence', 'in']], orderBy: [] }
];
export function agendaReadDiagnostic(error, index) {
  const source = agendaReadSources[index];
  const raw = String(error?.message || '');
  const known = ['failed-precondition', 'permission-denied', 'unauthenticated', 'unavailable', 'deadline-exceeded'];
  const code = known.find(x => String(error?.code || '').endsWith(x)) || 'internal';
  const message = /requires an index|no matching index|index.*building/i.test(raw)
    ? 'La consulta necesita un índice compuesto disponible.'
    : code === 'permission-denied' ? 'La lectura fue rechazada por permisos.'
      : code === 'failed-precondition' ? 'Precondición de lectura incumplida; verificar índice y su estado.' : 'No se completó la lectura.';
  return { ...source, operation: 'getDocs', collection: 'agenda', scope: 'COLLECTION', code, message,
    requiredIndex: index === 1 ? ['startDate ASC', 'endDate ASC'] : null };
}
