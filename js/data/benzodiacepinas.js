export const FUENTES_BENZODIACEPINAS = {
  ashton_2007: {
    id: "ashton_2007",
    nombre: "Ashton C.H. Benzodiazepine Equivalence Table",
    url: "https://www.benzo.org.uk/bzequiv",
    fechaPublicacion: "Abril 2007",
    fechaRevisionLocal: "2026-07-10",
    nota: "Tabla clinica de equivalencias aproximadas a 10 mg de diazepam. La propia fuente advierte variabilidad individual y desacuerdo entre autores."
  },
  wikipedia_lista_2026_07_10: {
    id: "wikipedia_lista_2026_07_10",
    nombre: "List of benzodiazepines - pharmacokinetic properties table",
    url: "https://en.wikipedia.org/wiki/List_of_benzodiazepines",
    fechaPublicacion: "Consulta web",
    fechaRevisionLocal: "2026-07-10",
    nota: "Referencia secundaria utilizada para contrastar valores de vida media, formulaciones y discrepancias."
  },
  wikipedia_use_disorder_2026_07_10: {
    id: "wikipedia_use_disorder_2026_07_10",
    nombre: "Benzodiazepine use disorder - pharmacological and pharmacokinetic factors table",
    url: "https://en.wikipedia.org/wiki/Benzodiazepine_use_disorder",
    fechaPublicacion: "Consulta web",
    fechaRevisionLocal: "2026-07-10",
    nota: "Referencia secundaria utilizada para duracion de efecto conductual y algunos rangos alternativos."
  }
};

const OBSERVACION_GENERAL = [
  "La equivalencia es aproximada y no sustituye valoracion clinica.",
  "La respuesta puede variar por edad, tolerancia, comorbilidades, funcion hepatica, interacciones y duracion del tratamiento.",
  "No usar para construir automaticamente pautas de retirada o prescripcion."
];

export const BENZODIACEPINAS = [
  { id: "alprazolam", nombre: "Alprazolam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 0.5, vidaMediaMinHoras: 6, vidaMediaMaxHoras: 15, vidaMediaTexto: "6-15 horas (otras tablas: 10-20 h)", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Benzodiacepina de alta potencia; puede asociarse a sintomas interdosis en algunos pacientes."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "bromazepam", nombre: "Bromazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 6, dosisReferenciaTexto: "5-6 mg", vidaMediaMinHoras: 10, vidaMediaMaxHoras: 20, vidaMediaTexto: "10-20 horas (otras tablas: 20-40 h)", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Equivalencia publicada como 5-6 mg; se usa 6 mg como valor operativo conservador."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "clonazepam", nombre: "Clonazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 0.5, vidaMediaMinHoras: 18, vidaMediaMaxHoras: 50, vidaMediaTexto: "18-50 horas", duracionAccion: "Prolongada", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Benzodiacepina de alta potencia y vida media prolongada."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "clordiazepoxido", nombre: "Clordiazepoxido", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 25, vidaMediaMinHoras: 5, vidaMediaMaxHoras: 30, vidaMediaTexto: "5-30 horas; metabolitos activos 36-200 h", duracionAccion: "Prolongada", metabolitosActivos: true, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Tiene metabolitos activos prolongados; considerar acumulacion en poblaciones vulnerables."], fuentes: ["ashton_2007", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "clobazam", nombre: "Clobazam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 20, vidaMediaMinHoras: 12, vidaMediaMaxHoras: 60, vidaMediaTexto: "12-60 horas", duracionAccion: "Prolongada", metabolitosActivos: true, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "En algunas jurisdicciones se usa principalmente como anticonvulsivante; no asumir equivalencia clinica ansiolitica directa."], fuentes: ["ashton_2007"], fechaRevision: "2026-07-10" },
  { id: "diazepam", nombre: "Diazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 10, vidaMediaMinHoras: 20, vidaMediaMaxHoras: 100, vidaMediaTexto: "20-100 horas; metabolitos activos 36-200 h", duracionAccion: "Prolongada", metabolitosActivos: true, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Vida media y metabolitos activos prolongados; puede acumularse."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "estazolam", nombre: "Estazolam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 2, dosisReferenciaTexto: "1-2 mg", vidaMediaMinHoras: 10, vidaMediaMaxHoras: 24, vidaMediaTexto: "10-24 horas", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Equivalencia publicada como 1-2 mg; se usa 2 mg como valor operativo."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "flunitrazepam", nombre: "Flunitrazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 1, vidaMediaMinHoras: 18, vidaMediaMaxHoras: 26, vidaMediaTexto: "18-26 horas; algunas tablas anotan metabolitos activos prolongados", duracionAccion: "Intermedia", metabolitosActivos: true, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Disponibilidad y regulacion varian por pais."], fuentes: ["ashton_2007", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "lorazepam", nombre: "Lorazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 1, vidaMediaMinHoras: 10, vidaMediaMaxHoras: 20, vidaMediaTexto: "10-20 horas", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Metabolismo por glucuronidacion; sin metabolitos activos farmacologicamente relevantes."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "midazolam", nombre: "Midazolam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 15, dosisReferenciaTexto: "10-15 mg segun tabla", vidaMediaMinHoras: 1.8, vidaMediaMaxHoras: 6, vidaMediaTexto: "1.8-6 horas (otras tablas: hasta 2.5 h)", duracionAccion: "Corta", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Tiene uso frecuente procedural; no extrapolar automaticamente a uso cronico."], fuentes: ["wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "nitrazepam", nombre: "Nitrazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 10, vidaMediaMinHoras: 15, vidaMediaMaxHoras: 38, vidaMediaTexto: "15-38 horas", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Usado principalmente como hipnotico en algunas tablas."], fuentes: ["ashton_2007", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "oxazepam", nombre: "Oxazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 20, vidaMediaMinHoras: 4, vidaMediaMaxHoras: 15, vidaMediaTexto: "4-15 horas", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Discrepancia relevante: algunas tablas secundarias usan 30 mg como equivalente a 10 mg de diazepam."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "temazepam", nombre: "Temazepam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 20, dosisReferenciaTexto: "15-20 mg", vidaMediaMinHoras: 8, vidaMediaMaxHoras: 22, vidaMediaTexto: "8-22 horas (otras tablas: 4-11 h)", duracionAccion: "Intermedia", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Equivalencia publicada como rango 15-20 mg; se usa 20 mg como valor operativo."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" },
  { id: "triazolam", nombre: "Triazolam", equivalenciaDiazepamMg: 10, dosisReferenciaMg: 0.5, vidaMediaMinHoras: 2, vidaMediaMaxHoras: 2, vidaMediaTexto: "2 horas", duracionAccion: "Corta", metabolitosActivos: false, viaReferencia: "Oral", observaciones: [...OBSERVACION_GENERAL, "Benzodiacepina de vida media corta; algunas tablas secundarias usan 0.25 mg."], fuentes: ["ashton_2007", "wikipedia_lista_2026_07_10", "wikipedia_use_disorder_2026_07_10"], fechaRevision: "2026-07-10" }
];

export function obtenerBenzodiacepinaPorId(id) {
  return BENZODIACEPINAS.find((medicamento) => medicamento.id === id) || null;
}

export function normalizarNumero(valor) {
  if (typeof valor === "number") return valor;
  if (valor === null || valor === undefined) return NaN;
  return Number(String(valor).trim().replace(",", "."));
}

export function calcularDosisTotalDiaria(dosis, frecuencia = "total_diaria", tomasPersonalizadas = 1) {
  const dosisNumerica = normalizarNumero(dosis);
  const tomas = normalizarNumero(tomasPersonalizadas);
  if (!Number.isFinite(dosisNumerica)) return NaN;
  const factores = {
    total_diaria: 1,
    una_vez: 1,
    nocturna: 1,
    cada_12: 2,
    cada_8: 3,
    cada_6: 4,
    personalizada: Number.isFinite(tomas) && tomas > 0 ? tomas : NaN
  };
  const factor = factores[frecuencia] ? NaN;
  return Number.isFinite(factor) ? dosisNumerica * factor : NaN;
}

export function calcularDiazepamEquivalente(origenId, dosisDiaria) {
  const origen = obtenerBenzodiacepinaPorId(origenId);
  const dosis = normalizarNumero(dosisDiaria);
  if (!origen || !Number.isFinite(dosis) || !origen.dosisReferenciaMg || !origen.equivalenciaDiazepamMg) return NaN;
  return (dosis / origen.dosisReferenciaMg) * origen.equivalenciaDiazepamMg;
}

export function convertirBenzodiacepina(origenId, dosisDiaria, destinoId) {
  const origen = obtenerBenzodiacepinaPorId(origenId);
  const destino = obtenerBenzodiacepinaPorId(destinoId);
  const dosis = normalizarNumero(dosisDiaria);
  if (!origen || !destino || !Number.isFinite(dosis)) return null;
  const diazepamEquivalente = calcularDiazepamEquivalente(origenId, dosis);
  if (!Number.isFinite(diazepamEquivalente) || !destino.equivalenciaDiazepamMg || !destino.dosisReferenciaMg) return null;
  const dosisDestino = (dosis / origen.dosisReferenciaMg) * origen.equivalenciaDiazepamMg / destino.equivalenciaDiazepamMg * destino.dosisReferenciaMg;
  return {
    origen,
    destino,
    dosisDiariaOrigen: dosis,
    diazepamEquivalente,
    dosisDiariaDestino: dosisDestino,
    relacion: `${formatearDosis(origen.dosisReferenciaMg)} mg de ${origen.nombre} ≈ ${formatearDosis(origen.equivalenciaDiazepamMg)} mg de diazepam; ${formatearDosis(destino.dosisReferenciaMg)} mg de ${destino.nombre} ≈ ${formatearDosis(destino.equivalenciaDiazepamMg)} mg de diazepam`,
    comparacionVidaMedia: compararVidaMedia(origenId, destinoId)
  };
}

export function formatearDosis(valor) {
  const numero = normalizarNumero(valor);
  if (!Number.isFinite(numero)) return "--";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(numero);
}

export function compararVidaMedia(origenId, destinoId) {
  const origen = obtenerBenzodiacepinaPorId(origenId);
  const destino = obtenerBenzodiacepinaPorId(destinoId);
  if (!origen || !destino) return null;
  const promedioOrigen = (origen.vidaMediaMinHoras + origen.vidaMediaMaxHoras) / 2;
  const promedioDestino = (destino.vidaMediaMinHoras + destino.vidaMediaMaxHoras) / 2;
  const diferenciaPromedioHoras = promedioDestino - promedioOrigen;
  return {
    origen: { min: origen.vidaMediaMinHoras, max: origen.vidaMediaMaxHoras, texto: origen.vidaMediaTexto },
    destino: { min: destino.vidaMediaMinHoras, max: destino.vidaMediaMaxHoras, texto: destino.vidaMediaTexto },
    diferenciaPromedioHoras,
    texto: diferenciaPromedioHoras === 0
      ? "Vida media promedio similar segun los rangos usados."
      : `El destino tiene una vida media promedio ${diferenciaPromedioHoras > 0 ? "mayor" : "menor"} por aproximadamente ${formatearDosis(Math.abs(diferenciaPromedioHoras))} horas.`
  };
}

export function validarDatosConversion(datos) {
  const errores = [];
  const advertencias = [];
  const dosis = normalizarNumero(datos?.dosis);
  const dosisDiaria = normalizarNumero(datos?.dosisDiaria);
  if (!datos?.origenId) errores.push("Selecciona la benzodiacepina actual.");
  if (!datos?.destinoId) errores.push("Selecciona la benzodiacepina de destino.");
  if (!Number.isFinite(dosis)) errores.push("Introduce una dosis valida.");
  if (Number.isFinite(dosis) && dosis < 0) errores.push("La dosis no puede ser negativa.");
  if (Number.isFinite(dosis) && dosis === 0) advertencias.push("La dosis es cero; el resultado matematico sera cero.");
  if (datos?.origenId && datos?.destinoId && datos.origenId === datos.destinoId) advertencias.push("Origen y destino son el mismo medicamento; la conversion no cambia la dosis total diaria.");
  if (Number.isFinite(dosisDiaria) && dosisDiaria > 1000) advertencias.push("Cantidad extremadamente alta. Verifica el dato; la calculadora no valida seguridad de dosis.");
  const diazepam = datos?.origenId ? calcularDiazepamEquivalente(datos.origenId, dosisDiaria) : NaN;
  if (Number.isFinite(diazepam) && diazepam > 200) advertencias.push("Equivalente diazepam muy alto. Confirmar unidades y contexto clinico.");
  return { valido: errores.length === 0, errores, advertencias };
}

export function validarDatosFarmacologicos(lista = BENZODIACEPINAS) {
  const errores = [];
  const ids = new Set();
  lista.forEach((medicamento) => {
    if (ids.has(medicamento.id)) errores.push(`ID duplicado: ${medicamento.id}`);
    ids.add(medicamento.id);
    if (!medicamento.dosisReferenciaMg || medicamento.dosisReferenciaMg <= 0) errores.push(`${medicamento.nombre}: dosis de referencia invalida.`);
    if (!medicamento.equivalenciaDiazepamMg || medicamento.equivalenciaDiazepamMg <= 0) errores.push(`${medicamento.nombre}: equivalencia ausente o invalida.`);
    if (medicamento.vidaMediaMinHoras < 0 || medicamento.vidaMediaMaxHoras < 0) errores.push(`${medicamento.nombre}: vida media negativa.`);
    if (!Array.isArray(medicamento.fuentes) || medicamento.fuentes.length === 0) errores.push(`${medicamento.nombre}: fuentes vacias.`);
    if (!medicamento.fechaRevision) errores.push(`${medicamento.nombre}: falta fecha de revision.`);
  });
  return errores;
}