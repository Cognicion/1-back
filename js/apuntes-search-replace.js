export function buscarCoincidenciasLiterales(texto, busqueda, distinguirMayusculas = false) {
  const contenido = String(texto ?? "");
  const consulta = String(busqueda ?? "");
  if (!consulta) return [];

  const contenidoComparable = distinguirMayusculas ? contenido : contenido.toLocaleLowerCase("es-MX");
  const consultaComparable = distinguirMayusculas ? consulta : consulta.toLocaleLowerCase("es-MX");
  const coincidencias = [];
  let desde = 0;
  while (desde <= contenidoComparable.length - consultaComparable.length) {
    const inicio = contenidoComparable.indexOf(consultaComparable, desde);
    if (inicio < 0) break;
    coincidencias.push({ inicio, fin: inicio + consulta.length });
    desde = inicio + Math.max(1, consulta.length);
  }
  return coincidencias;
}

export function reemplazarCoincidenciasLiterales(texto, busqueda, reemplazo, distinguirMayusculas = false) {
  const contenido = String(texto ?? "");
  const sustituto = String(reemplazo ?? "");
  const coincidencias = buscarCoincidenciasLiterales(contenido, busqueda, distinguirMayusculas);
  if (!coincidencias.length) return { texto: contenido, cantidad: 0 };

  const partes = [];
  let cursor = 0;
  coincidencias.forEach(({ inicio, fin }) => {
    partes.push(contenido.slice(cursor, inicio), sustituto);
    cursor = fin;
  });
  partes.push(contenido.slice(cursor));
  return { texto: partes.join(""), cantidad: coincidencias.length };
}
