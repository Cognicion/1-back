import { fechaAISO, normalizarFechaDocumento } from "./eventosDetectadosUtils.js";

const MESES = new Map([
  ["enero", 0], ["febrero", 1], ["marzo", 2], ["abril", 3], ["mayo", 4], ["junio", 5],
  ["julio", 6], ["agosto", 7], ["septiembre", 8], ["setiembre", 8], ["octubre", 9],
  ["noviembre", 10], ["diciembre", 11]
]);

const NUMEROS = new Map([
  ["un", 1], ["una", 1], ["uno", 1], ["dos", 2], ["tres", 3], ["cuatro", 4],
  ["cinco", 5], ["seis", 6], ["siete", 7], ["ocho", 8], ["nueve", 9], ["diez", 10],
  ["once", 11], ["doce", 12]
]);

function numeroTemporal(valor = "") {
  if (/^\d+$/.test(String(valor))) return Number(valor);
  return NUMEROS.get(String(valor).toLocaleLowerCase("es-MX")) || null;
}

function crearFecha(anio, mes = 0, dia = 1) {
  return new Date(Number(anio), Number(mes), Number(dia), 12, 0, 0, 0);
}

function restar(fechaReferencia, cantidad, unidad) {
  const fecha = new Date(fechaReferencia);
  fecha.setHours(12, 0, 0, 0);
  if (unidad.startsWith("dia")) fecha.setDate(fecha.getDate() - cantidad);
  else if (unidad.startsWith("semana")) fecha.setDate(fecha.getDate() - cantidad * 7);
  else if (unidad.startsWith("mes")) fecha.setMonth(fecha.getMonth() - cantidad);
  else if (unidad.startsWith("año") || unidad.startsWith("ano")) fecha.setFullYear(fecha.getFullYear() - cantidad);
  return fecha;
}

export function resolverFechaClinica(expresion = "", contexto = {}) {
  const texto = String(expresion || "").trim();
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
  const referencia = normalizarFechaDocumento(contexto.fechaReferencia) || new Date();
  const nacimiento = normalizarFechaDocumento(contexto.fechaNacimiento);

  let match = normalizado.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (match) {
    const fecha = crearFecha(match[3], Number(match[2]) - 1, match[1]);
    return resultado(fecha, "dia", texto, referencia, contexto, false);
  }

  match = normalizado.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (match) return resultado(crearFecha(match[1], Number(match[2]) - 1, match[3]), "dia", texto, referencia, contexto, false);

  match = normalizado.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (match && MESES.has(match[2])) return resultado(crearFecha(match[3], MESES.get(match[2]), match[1]), "dia", texto, referencia, contexto, false);

  match = normalizado.match(/\b([a-z]+)\s+de\s+(\d{4})\b/);
  if (match && MESES.has(match[1])) return resultado(crearFecha(match[2], MESES.get(match[1]), 1), "mes", texto, referencia, contexto, true);

  match = normalizado.match(/\b(?:en|desde|alrededor de|aproximadamente en)\s+(\d{4})\b/);
  if (match) return resultado(crearFecha(match[1], 0, 1), "anio", texto, referencia, contexto, true);

  match = normalizado.match(/\b(a principios de|a mediados de|a finales de)\s+(\d{4})\b/);
  if (match) {
    const mes = match[1].includes("principios") ? 0 : match[1].includes("mediados") ? 5 : 9;
    return resultado(crearFecha(match[2], mes, 1), "mes", texto, referencia, contexto, true);
  }

  if (/\bayer\b/.test(normalizado)) return resultado(restar(referencia, 1, "dias"), "dia", texto, referencia, contexto, true);
  if (/\banteayer\b/.test(normalizado)) return resultado(restar(referencia, 2, "dias"), "dia", texto, referencia, contexto, true);
  if (/\bla semana pasada\b/.test(normalizado)) return resultado(restar(referencia, 1, "semanas"), "semana", texto, referencia, contexto, true);
  if (/\bel mes pasado\b/.test(normalizado)) return resultado(restar(referencia, 1, "meses"), "mes", texto, referencia, contexto, true);
  if (/\bel ano pasado\b|\bel año pasado\b/.test(normalizado)) return resultado(crearFecha(referencia.getFullYear() - 1, 0, 1), "anio", texto, referencia, contexto, true);

  match = normalizado.match(/\b(?:desde\s+)?(?:aproximadamente\s+|alrededor\s+de\s+)?hace\s+(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(dia|dias|semana|semanas|mes|meses|ano|anos|año|años)\b/);
  if (match) {
    const cantidad = numeroTemporal(match[1]);
    const unidad = match[2].replace("anos", "años");
    if (cantidad) {
      const precision = unidad.startsWith("dia") ? "dia" : unidad.startsWith("semana") ? "semana" : unidad.startsWith("mes") ? "mes" : "anio";
      return resultado(restar(referencia, cantidad, unidad), precision, texto, referencia, contexto, true);
    }
  }

  match = normalizado.match(/\b(?:a los|desde los)\s+(\d{1,2})\s+anos\b/);
  if (match) {
    if (!nacimiento) {
      return {
        fechaInicioISO: null,
        fechaFinISO: null,
        precisionTemporal: "indeterminada",
        requiereRevisionFecha: true,
        expresionTemporalOriginal: texto,
        fechaReferenciaISO: fechaAISO(referencia),
        origenFechaReferencia: contexto.origenFechaReferencia || "fecha_actual_incierta"
      };
    }
    return resultado(crearFecha(nacimiento.getFullYear() + Number(match[1]), 0, 1), "anio", texto, referencia, contexto, true);
  }

  if (/\b(infancia|adolescencia|desde joven|desde pequeno|desde pequeño|hace tiempo|recientemente|anos atras|años atras)\b/.test(normalizado)) {
    return {
      fechaInicioISO: null,
      fechaFinISO: null,
      precisionTemporal: "indeterminada",
      requiereRevisionFecha: true,
      expresionTemporalOriginal: texto,
      fechaReferenciaISO: fechaAISO(referencia),
      origenFechaReferencia: contexto.origenFechaReferencia || "fecha_actual_incierta"
    };
  }

  return null;
}

export function resolverIntervaloClinico(frase = "", contexto = {}) {
  const texto = String(frase || "");
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
  const match = normalizado.match(/\bdel\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (!match || !MESES.has(match[3])) return null;
  const inicio = crearFecha(match[4], MESES.get(match[3]), match[1]);
  const fin = crearFecha(match[4], MESES.get(match[3]), match[2]);
  return {
    ...resultado(inicio, "dia", match[0], normalizarFechaDocumento(contexto.fechaReferencia) || new Date(), contexto, false),
    fechaFinISO: fechaAISO(fin)
  };
}

function resultado(fecha, precisionTemporal, expresionTemporalOriginal, fechaReferencia, contexto, aproximada) {
  return {
    fechaInicioISO: fechaAISO(fecha),
    fechaFinISO: null,
    precisionTemporal,
    requiereRevisionFecha: Boolean(aproximada || precisionTemporal !== "dia"),
    expresionTemporalOriginal,
    fechaReferenciaISO: fechaAISO(fechaReferencia),
    origenFechaReferencia: contexto.origenFechaReferencia || "fecha_documento"
  };
}
