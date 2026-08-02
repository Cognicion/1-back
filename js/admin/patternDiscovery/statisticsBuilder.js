export function estadisticasFrecuencia(filas, totalNotas = 0) {
  return filas.map((fila) => ({ ...fila, frecuenciaRelativa: totalNotas ? fila.frecuencia / totalNotas : 0 }));
}
