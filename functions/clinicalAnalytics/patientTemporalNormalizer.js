const SPANISH_NUMBERS = Object.freeze({
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15
});

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numericAmount(value) {
  const normalized = String(value || "").toLowerCase();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return SPANISH_NUMBERS[normalized] || null;
}

function subtract(date, amount, unit) {
  const result = new Date(date);
  if (/hora/.test(unit)) result.setUTCHours(result.getUTCHours() - amount);
  else if (/d[ií]a/.test(unit)) result.setUTCDate(result.getUTCDate() - amount);
  else if (/semana/.test(unit)) result.setUTCDate(result.getUTCDate() - (amount * 7));
  else if (/mes/.test(unit)) result.setUTCMonth(result.getUTCMonth() - amount);
  else if (/a[nñ]o/.test(unit)) result.setUTCFullYear(result.getUTCFullYear() - amount);
  return result;
}

function clinicalWindow({ amount, unit, historical }) {
  if (historical) return "historical";
  if (/hora/.test(unit) && amount <= 24) return "last_24h";
  const days = /d[ií]a/.test(unit) ? amount
    : /semana/.test(unit) ? amount * 7
      : /mes/.test(unit) ? amount * 30
        : /a[nñ]o/.test(unit) ? amount * 365
          : 0;
  if (days <= 1) return "last_24h";
  if (days <= 3) return "last_72h";
  if (days <= 7) return "last_7d";
  if (days <= 30) return "last_30d";
  return "historical";
}

function windowFromDocumentDate(date) {
  if (!date) return "current";
  const elapsedDays = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  if (elapsedDays <= 1) return "last_24h";
  if (elapsedDays <= 3) return "last_72h";
  if (elapsedDays <= 7) return "last_7d";
  if (elapsedDays <= 30) return "last_30d";
  return "historical";
}

function normalizeClinicalTime(excerpt = "", documentDate = null) {
  const date = validDate(documentDate);
  const text = String(excerpt || "").toLowerCase();
  const relative = text.match(/\bhace\s+(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince)\s+(hora(?:s)?|d[ií]a(?:s)?|semana(?:s)?|mes(?:es)?|a[nñ]o(?:s)?)\b/i);
  if (date && relative) {
    const amount = numericAmount(relative[1]);
    const unit = relative[2].toLowerCase();
    const estimated = subtract(date, amount, unit);
    return {
      documentDate: date.toISOString(),
      estimatedClinicalTime: estimated.toISOString(),
      temporalPrecision: /hora|d[ií]a/.test(unit) ? "day" : "approximate",
      clinicalTimeWindow: clinicalWindow({ amount, unit })
    };
  }

  if (/\b(actual(?:mente)?|hoy|en este momento|al momento)\b/i.test(text)) {
    return {
      documentDate: date?.toISOString() || null,
      estimatedClinicalTime: date?.toISOString() || null,
      temporalPrecision: date ? "day" : "unknown",
      clinicalTimeWindow: "current"
    };
  }

  if (/\b(antecedente|hist[oó]ric[oa]|previ[oa]|en el pasado|hace a[nñ]os)\b/i.test(text)) {
    return {
      documentDate: date?.toISOString() || null,
      estimatedClinicalTime: null,
      temporalPrecision: "historical",
      clinicalTimeWindow: "historical"
    };
  }

  return {
    documentDate: date?.toISOString() || null,
    estimatedClinicalTime: null,
    temporalPrecision: "unknown",
    clinicalTimeWindow: windowFromDocumentDate(date)
  };
}

module.exports = { normalizeClinicalTime, windowFromDocumentDate };
