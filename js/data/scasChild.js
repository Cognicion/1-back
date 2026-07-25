// SCAS infantil completa: metadatos y algoritmo sin reproducir el instrumento.
// Los textos de los reactivos deben llegar desde una fuente autorizada.

export const SCAS_CHILD_FILLER_ITEMS = Object.freeze([11, 17, 26, 31, 38, 43]);

export const SCAS_CHILD_SUBSCALES = Object.freeze({
  ansiedadSeparacion: Object.freeze([5, 8, 12, 15, 16, 44]),
  fobiaSocial: Object.freeze([6, 7, 9, 10, 29, 35]),
  obsesionesCompulsiones: Object.freeze([14, 19, 27, 40, 41, 42]),
  panicoAgorafobia: Object.freeze([13, 21, 28, 30, 32, 34, 36, 37, 39]),
  miedoDanoFisico: Object.freeze([2, 18, 23, 25, 33]),
  ansiedadGeneralizada: Object.freeze([1, 3, 4, 20, 22, 24])
});

export const SCAS_CHILD_PUNCTUABLE_ITEMS = Object.freeze(
  Array.from({ length: 44 }, (_, index) => index + 1)
    .filter((item) => !SCAS_CHILD_FILLER_ITEMS.includes(item))
);

export const SCAS_CHILD_RESPONSE_OPTIONS = Object.freeze([
  { texto: "Nunca", valor: 0 },
  { texto: "A veces", valor: 1 },
  { texto: "Frecuentemente", valor: 2 },
  { texto: "Siempre", valor: 3 }
]);

export const SCAS_CHILD_SCALE = Object.freeze({
  id: "scas-child",
  nombre: "Escala de Ansiedad para Niños de Spence",
  subtitulo: "SCAS · Autoinforme infantil completo",
  nombreOriginal: "Spence Children's Anxiety Scale",
  version: "SCAS Child completa",
  tipoEscala: "psiquiatrica",
  area: "Ansiedad infantil",
  categoria: "Ansiedad",
  subcategoria: "Población infantil",
  poblacion: "Niños y adolescentes",
  informante: "Autoinforme",
  numeroItems: 44,
  itemsPuntuables: 38,
  itemsRelleno: SCAS_CHILD_FILLER_ITEMS,
  tiempoEstimado: "10 a 15 minutos",
  idioma: "Español",
  puntajeMaximo: 114,
  rango: "0-114",
  dominiosEvaluados: [
    "Ansiedad por separación",
    "Fobia social",
    "Obsesiones y compulsiones",
    "Pánico y agorafobia",
    "Miedo al daño físico",
    "Ansiedad generalizada"
  ],
  descripcion: "Evalúa síntomas de ansiedad en población infantil y adolescente por dimensiones específicas.",
  instrucciones: "Instrumento oficial pendiente de carga autorizada. No se reproducen reactivos sin permiso.",
  referencias: "Spence Children's Anxiety Scale; fuente oficial: https://www.scaswebsite.com/spanish/",
  requiereInstrumentoOficial: true,
  requiereFuenteAutorizada: true,
  fuenteItems: "https://www.scaswebsite.com/spanish/",
  itemsSource: "js/data/scasChildItems.js",
  fuenteNormativa: "https://www.scaswebsite.com/portfolio/scas-child-normative-data/",
  scoringVersion: "1.0.0",
  reactivos: []
});

function normalizeItemNumber(item) {
  return Number(item?.numero ?? item?.number ?? item?.id);
}

/**
 * Valida un paquete de reactivos obtenido de una fuente autorizada.
 * No genera textos ni completa reactivos faltantes.
 */
export function validateAuthorizedScasItems(items) {
  if (!Array.isArray(items) || items.length !== 44) {
    throw new Error("La SCAS autorizada debe contener exactamente 44 reactivos.");
  }

  const numbers = items.map(normalizeItemNumber);
  const expected = Array.from({ length: 44 }, (_, index) => index + 1);
  if (numbers.some((number) => !Number.isInteger(number)) || new Set(numbers).size !== 44 || numbers.some((number, index) => number !== expected[index])) {
    throw new Error("Los reactivos SCAS deben estar numerados del 1 al 44 y conservar su orden.");
  }

  items.forEach((item, index) => {
    if (!String(item?.texto || "").trim()) {
      throw new Error(`Falta el texto autorizado del reactivo SCAS ${index + 1}.`);
    }
  });

  return items.map((item) => {
    const numero = normalizeItemNumber(item);
    const puntuable = !SCAS_CHILD_FILLER_ITEMS.includes(numero);
    const subescala = Object.entries(SCAS_CHILD_SUBSCALES).find(([, numeros]) => numeros.includes(numero))?.[0] || null;
    return {
      ...item,
      numero,
      texto: String(item.texto),
      tipo: puntuable ? "puntuable" : "relleno_positivo",
      puntuable,
      subescala,
      opciones: item.opciones || SCAS_CHILD_RESPONSE_OPTIONS
    };
  });
}

export function attachAuthorizedScasItems(items) {
  return {
    ...SCAS_CHILD_SCALE,
    reactivos: validateAuthorizedScasItems(items)
  };
}

export async function loadScasChildFromAuthorizedSource(loadItems) {
  if (typeof loadItems !== "function") {
    throw new TypeError("Se requiere un cargador de reactivos SCAS autorizado.");
  }
  return attachAuthorizedScasItems(await loadItems());
}

function readResponse(responses, numero) {
  const response = responses.find((item) => Number(item?.numero ?? item?.itemNumber ?? item?.item) === numero);
  if (response == null || response.valor === "" || response.valor == null) return null;
  const value = Number(response.valor);
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new RangeError(`La respuesta SCAS ${numero} debe estar entre 0 y 3.`);
  }
  return value;
}

export function scoreScasChild(responses = []) {
  const missingItems = SCAS_CHILD_PUNCTUABLE_ITEMS.filter((numero) => readResponse(responses, numero) === null);
  const scores = {};

  for (const [subscale, numbers] of Object.entries(SCAS_CHILD_SUBSCALES)) {
    scores[subscale] = numbers.reduce((sum, numero) => sum + (readResponse(responses, numero) ?? 0), 0);
  }

  const total = SCAS_CHILD_PUNCTUABLE_ITEMS.reduce((sum, numero) => sum + (readResponse(responses, numero) ?? 0), 0);
  return {
    total: Math.min(114, Math.max(0, total)),
    subscales: scores,
    missingItems,
    complete: missingItems.length === 0
  };
}
