const ENCABEZADOS_CLINICOS = /^(tratamiento farmacol[oó]gico actual|indicaciones vigentes|tratamiento e indicaciones)\s*:?\s*$/i;
const CONTEXTO_MEDICAMENTO_CONDICIONADO = /\b(en caso de|si presenta|cuando|seg[uú]n necesidad|prn|rescate|negativismo|condicionad[oa])\b/i;

export function limpiarNumeracionClinica(texto = "") {
  return String(texto)
    .replace(/^\s*(?:[-•]\s*)?\d+[.)-]*\s*/, "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();
}

export function normalizarClaveMedicamento(texto = "") {
  return limpiarNumeracionClinica(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\btomar\b/g, " ")
    .replace(/[()[\]{}.,;:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoDesdeObjeto(valor = {}) {
  return valor.indicacion
    || valor.texto
    || valor.descripcion
    || valor.nombre
    || valor.medicamento
    || "";
}

function lineasDesdeTexto(texto = "") {
  return String(texto)
    .replace(/\r\n?/g, "\n")
    .split(/\n|(?=\s+\d+[.)]\s+)/)
    .map((linea) => {
      const original = String(linea);
      return {
        texto: limpiarNumeracionClinica(original),
        numerada: /^\s*\d+[.)-]*\s+/.test(original)
      };
    })
    .filter(({ texto }) => texto && !ENCABEZADOS_CLINICOS.test(texto));
}

function lineasNormalizadas(valor) {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => lineasNormalizadas(item));
  }

  if (valor && typeof valor === "object") {
    const texto = textoDesdeObjeto(valor);
    if (texto) return lineasDesdeTexto(texto);

    const lista = valor.indicaciones || valor.items || valor.tratamientos;
    return lista ? lineasNormalizadas(lista) : [];
  }

  return lineasDesdeTexto(valor);
}

function esEncabezadoMedicacionCondicionada(texto = "") {
  const normalizado = String(texto).trim();
  return /\bmedicamentos?\b/i.test(normalizado)
    && CONTEXTO_MEDICAMENTO_CONDICIONADO.test(normalizado);
}

function agruparMedicacionCondicionada(lineas = []) {
  const resultado = [];

  for (let indice = 0; indice < lineas.length; indice += 1) {
    const linea = lineas[indice];
    if (!esEncabezadoMedicacionCondicionada(linea.texto)) {
      resultado.push({ texto: linea.texto, condicionada: CONTEXTO_MEDICAMENTO_CONDICIONADO.test(linea.texto) });
      continue;
    }

    const componentes = [linea.texto.replace(/:\s*$/, "")];
    let cursor = indice + 1;
    while (cursor < lineas.length && !lineas[cursor].numerada) {
      componentes.push(lineas[cursor].texto);
      cursor += 1;
    }
    resultado.push({
      texto: componentes.join(": ").replace(/:\s*:/g, ":"),
      condicionada: true
    });
    indice = cursor - 1;
  }

  return resultado;
}

export function normalizarEntradasClinicas(valor) {
  return agruparMedicacionCondicionada(lineasNormalizadas(valor));
}

export function deduplicarEntradasClinicas(entradas = []) {
  const vistos = new Set();
  return entradas.filter((entrada) => {
    const clave = normalizarClaveMedicamento(entrada?.texto ?? entrada);
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function normalizarMedicamentos(medicamentosActivos) {
  return deduplicarEntradasClinicas(normalizarEntradasClinicas(medicamentosActivos))
    .map(({ texto }) => texto);
}

function normalizarIndicaciones(indicacionesEstructuradas, medicamentos = []) {
  const clavesMedicamentos = new Set(medicamentos.map(normalizarClaveMedicamento));
  return deduplicarEntradasClinicas(normalizarEntradasClinicas(indicacionesEstructuradas))
    .filter(({ texto, condicionada }) => {
      if (condicionada) return true;
      return !clavesMedicamentos.has(normalizarClaveMedicamento(texto));
    })
    .map(({ texto }) => texto);
}

export function construirTratamientoEIndicaciones({
  medicamentosActivos,
  indicacionesEstructuradas,
  tratamientoTextoLegado
} = {}) {
  const medicamentos = normalizarMedicamentos(medicamentosActivos);
  const indicacionesNormalizadas = normalizarIndicaciones(indicacionesEstructuradas, medicamentos);
  const tieneIndicacionesEstructuradas = indicacionesNormalizadas.length > 0;

  if (tieneIndicacionesEstructuradas) {
    return {
      medicamentos,
      indicaciones: indicacionesNormalizadas,
      contenidoResumen: deduplicarEntradasClinicas(
        normalizarEntradasClinicas([...medicamentos, ...indicacionesNormalizadas])
      ).map(({ texto }) => texto),
      origen: "estructurado",
      tieneIndicacionesEstructuradas: true
    };
  }

  if (medicamentos.length) {
    return {
      medicamentos,
      indicaciones: [...medicamentos],
      contenidoResumen: [...medicamentos],
      origen: "medicamentos",
      tieneIndicacionesEstructuradas: false
    };
  }

  const legado = deduplicarEntradasClinicas(normalizarEntradasClinicas(tratamientoTextoLegado))
    .map(({ texto }) => texto);
  return {
    medicamentos: [],
    indicaciones: legado,
    contenidoResumen: legado,
    origen: legado.length ? "legado" : "vacio",
    tieneIndicacionesEstructuradas: false
  };
}
