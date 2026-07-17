export const CPT_ACTIVITY_VERSION = "1.0.0";

export const CPT_DEFAULT_CONFIG = {
  modality: "cpt_x",
  durationSeconds: 120,
  totalTrials: 100,
  stimulusIntervalMs: 1000,
  stimulusVisibleMs: 500,
  targetPercentage: 20,
  degradationLevel: 40,
  practiceEnabled: true,
  practiceTrials: 10,
  minimumValidLatencyMs: 120,
  maxConsecutiveTargets: 2,
  blockSize: 20
};

export function normalizarConfigCpt(entrada = {}) {
  return {
    modality: entrada.modality === "degraded" ? "degraded" : "cpt_x",
    durationSeconds: limitar(Number(entrada.durationSeconds ?? CPT_DEFAULT_CONFIG.durationSeconds), 10, 3600),
    totalTrials: limitar(Number(entrada.totalTrials ?? CPT_DEFAULT_CONFIG.totalTrials), 5, 1000),
    stimulusIntervalMs: limitar(Number(entrada.stimulusIntervalMs ?? CPT_DEFAULT_CONFIG.stimulusIntervalMs), 300, 5000),
    stimulusVisibleMs: limitar(Number(entrada.stimulusVisibleMs ?? CPT_DEFAULT_CONFIG.stimulusVisibleMs), 100, 3000),
    targetPercentage: limitar(Number(entrada.targetPercentage ?? CPT_DEFAULT_CONFIG.targetPercentage), 1, 80),
    degradationLevel: limitar(Number(entrada.degradationLevel ?? CPT_DEFAULT_CONFIG.degradationLevel), 0, 90),
    practiceEnabled: entrada.practiceEnabled !== false,
    practiceTrials: limitar(Number(entrada.practiceTrials ?? CPT_DEFAULT_CONFIG.practiceTrials), 0, 100),
    minimumValidLatencyMs: limitar(Number(entrada.minimumValidLatencyMs ?? CPT_DEFAULT_CONFIG.minimumValidLatencyMs), 0, 1000),
    maxConsecutiveTargets: limitar(Number(entrada.maxConsecutiveTargets ?? CPT_DEFAULT_CONFIG.maxConsecutiveTargets), 1, 5),
    blockSize: limitar(Number(entrada.blockSize ?? CPT_DEFAULT_CONFIG.blockSize), 5, 100)
  };
}

export function crearSemillaCpt() {
  const cryptoArray = globalThis.crypto?.getRandomValues?.(new Uint32Array(1));
  return cryptoArray?.[0] || Math.floor(Math.random() * 0xffffffff);
}

export function crearRngCpt(seed = crearSemillaCpt()) {
  let estado = Number(seed) >>> 0;
  return () => {
    estado ^= estado << 13;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    return ((estado >>> 0) / 0xffffffff);
  };
}

export function generarSecuenciaCpt(configEntrada = {}, seed = crearSemillaCpt()) {
  const config = normalizarConfigCpt(configEntrada);
  const rng = crearRngCpt(seed);
  const totalTargets = Math.max(1, Math.round(config.totalTrials * (config.targetPercentage / 100)));
  const bolsa = [
    ...Array.from({ length: totalTargets }, () => 0),
    ...Array.from({ length: Math.max(0, config.totalTrials - totalTargets) }, () => 1 + Math.floor(rng() * 9))
  ];

  for (let i = bolsa.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]];
  }

  limitarCerosConsecutivos(bolsa, config.maxConsecutiveTargets, rng);

  return bolsa.map((stimulus, index) => ({
    trialId: `cpt-${seed}-${index + 1}`,
    trialIndex: index + 1,
    stimulus,
    isTarget: stimulus === 0,
    expectedAtMs: index * config.stimulusIntervalMs,
    presentedAt: null,
    responseAt: null,
    reactionTimeMs: null,
    responded: false,
    responseType: "pending",
    validForMetrics: true,
    presentationDelayMs: null,
    visualNoiseLevel: config.modality === "degraded" ? config.degradationLevel : 0,
    visualNoiseSeed: Math.floor(rng() * 0xffffffff)
  }));
}

export function clasificarEnsayoCpt(ensayo, configEntrada = {}) {
  const config = normalizarConfigCpt(configEntrada);
  if (!ensayo.validForMetrics) return ensayo.responseType || "invalid";
  if (ensayo.responded && !Number.isFinite(ensayo.reactionTimeMs)) return "anticipatory";
  if (ensayo.responded && Number.isFinite(ensayo.reactionTimeMs) && ensayo.reactionTimeMs < config.minimumValidLatencyMs) return "anticipatory";
  if (ensayo.isTarget && ensayo.responded) return "hit";
  if (ensayo.isTarget && !ensayo.responded) return "miss";
  if (!ensayo.isTarget && ensayo.responded) return "false_alarm";
  return "correct_rejection";
}

export function cerrarEnsayoCpt(ensayo, configEntrada = {}) {
  const responseType = clasificarEnsayoCpt(ensayo, configEntrada);
  return { ...ensayo, responseType };
}

export function calcularMetricasCpt(ensayos = [], configEntrada = {}, session = {}) {
  const config = normalizarConfigCpt(configEntrada);
  const validos = ensayos.filter((e) => e.validForMetrics !== false);
  const totalTargets = validos.filter((e) => e.isTarget).length;
  const totalNonTargets = validos.filter((e) => !e.isTarget).length;
  const hits = validos.filter((e) => e.responseType === "hit").length;
  const misses = validos.filter((e) => e.responseType === "miss").length;
  const falseAlarms = validos.filter((e) => e.responseType === "false_alarm").length;
  const correctRejections = validos.filter((e) => e.responseType === "correct_rejection").length;
  const anticipatoryResponses = validos.filter((e) => e.responseType === "anticipatory").length;
  const invalidResponses = ensayos.filter((e) => e.validForMetrics === false || e.responseType === "invalid" || e.responseType === "visibility_invalid").length;
  const hitRts = validos.filter((e) => e.responseType === "hit").map((e) => e.reactionTimeMs).filter(Number.isFinite);
  const falseAlarmRts = validos.filter((e) => e.responseType === "false_alarm").map((e) => e.reactionTimeMs).filter(Number.isFinite);
  const hitRate = tasa(hits, totalTargets);
  const falseAlarmRate = tasa(falseAlarms, totalNonTargets);
  const dPrimeData = calcularDPrime(hitRate, falseAlarmRate, totalTargets, totalNonTargets);
  const blockResults = calcularBloquesCpt(validos, config.blockSize);
  const temporalTrend = describirTendenciaBloques(blockResults);

  return {
    totalTrials: validos.length,
    totalTargets,
    totalNonTargets,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    anticipatoryResponses,
    hitRate,
    hitPercentage: redondear(hitRate * 100, 1),
    falseAlarmRate,
    falseAlarmPercentage: redondear(falseAlarmRate * 100, 1),
    meanHitReactionTimeMs: redondear(promedio(hitRts), 1),
    medianHitReactionTimeMs: redondear(mediana(hitRts), 1),
    sdHitReactionTimeMs: redondear(desviacion(hitRts), 1),
    minHitReactionTimeMs: hitRts.length ? Math.min(...hitRts) : 0,
    maxHitReactionTimeMs: hitRts.length ? Math.max(...hitRts) : 0,
    meanFalseAlarmReactionTimeMs: redondear(promedio(falseAlarmRts), 1),
    reactionTimeVariabilityMs: redondear(desviacion(hitRts), 1),
    invalidResponses,
    actualDurationSeconds: redondear(Number(session.actualDurationSeconds || 0), 1),
    dPrime: dPrimeData.dPrime,
    responseCriterion: dPrimeData.criterion,
    blockResults,
    temporalTrend
  };
}

export function calcularBloquesCpt(ensayos = [], blockSize = CPT_DEFAULT_CONFIG.blockSize) {
  const size = Math.max(1, Number(blockSize) || CPT_DEFAULT_CONFIG.blockSize);
  const bloques = [];
  for (let start = 0; start < ensayos.length; start += size) {
    const bloque = ensayos.slice(start, start + size);
    const hits = bloque.filter((e) => e.responseType === "hit").length;
    const misses = bloque.filter((e) => e.responseType === "miss").length;
    const falseAlarms = bloque.filter((e) => e.responseType === "false_alarm").length;
    const correctRejections = bloque.filter((e) => e.responseType === "correct_rejection").length;
    const rts = bloque.filter((e) => e.responseType === "hit").map((e) => e.reactionTimeMs).filter(Number.isFinite);
    bloques.push({
      blockIndex: bloques.length + 1,
      fromTrial: bloque[0]?.trialIndex || start + 1,
      toTrial: bloque[bloque.length - 1]?.trialIndex || start,
      totalTrials: bloque.length,
      hits,
      misses,
      falseAlarms,
      correctRejections,
      meanReactionTimeMs: redondear(promedio(rts), 1),
      reactionTimeVariabilityMs: redondear(desviacion(rts), 1)
    });
  }
  return bloques;
}

export function describirTendenciaBloques(bloques = []) {
  if (bloques.length < 2) return "Sin bloques suficientes para describir cambio temporal.";
  const primero = bloques[0];
  const ultimo = bloques[bloques.length - 1];
  const precisionPrimera = tasa(primero.hits + primero.correctRejections, primero.totalTrials);
  const precisionUltima = tasa(ultimo.hits + ultimo.correctRejections, ultimo.totalTrials);
  const delta = precisionUltima - precisionPrimera;
  if (delta <= -0.1) return "Se registro menor precision en el ultimo bloque.";
  if (delta >= 0.1) return "Se registro mayor precision en el ultimo bloque.";
  if (ultimo.reactionTimeVariabilityMs > primero.reactionTimeVariabilityMs + 80) return "El tiempo de reaccion mostro mayor variabilidad al final.";
  return "El rendimiento permanecio relativamente estable durante la sesion.";
}

export function ensayosCptACsv(ensayos = []) {
  const columnas = ["trialIndex", "stimulus", "isTarget", "responded", "responseType", "reactionTimeMs", "visualNoiseLevel", "visualNoiseSeed", "presentedAt", "responseAt", "presentationDelayMs", "validForMetrics"];
  const filas = ensayos.map((ensayo) => columnas.map((columna) => csvValor(ensayo[columna])).join(","));
  return [columnas.join(","), ...filas].join("\n");
}

function limitar(v, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

function limitarCerosConsecutivos(lista, maxConsecutivos, rng) {
  let consecutivos = 0;
  for (let i = 0; i < lista.length; i += 1) {
    consecutivos = lista[i] === 0 ? consecutivos + 1 : 0;
    if (consecutivos > maxConsecutivos) {
      const j = lista.findIndex((valor, index) => index > i && valor !== 0);
      if (j > i) {
        [lista[i], lista[j]] = [lista[j], lista[i]];
      } else {
        const k = Math.max(0, Math.floor(rng() * i));
        lista[i] = 1 + Math.floor(rng() * 9);
        lista[k] = 0;
      }
      consecutivos = 0;
    }
  }
}

function tasa(numerador, denominador) {
  return denominador ? numerador / denominador : 0;
}

function promedio(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function mediana(arr) {
  if (!arr.length) return 0;
  const ordenados = arr.slice().sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2;
}

function desviacion(arr) {
  if (!arr.length) return 0;
  const avg = promedio(arr);
  return Math.sqrt(promedio(arr.map((v) => (v - avg) ** 2)));
}

function redondear(valor, decimales = 2) {
  if (!Number.isFinite(valor)) return 0;
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

function calcularDPrime(hitRate, falseAlarmRate, totalTargets, totalNonTargets) {
  const h = corregirTasaExtrema(hitRate, totalTargets);
  const fa = corregirTasaExtrema(falseAlarmRate, totalNonTargets);
  const zh = normalInv(h);
  const zfa = normalInv(fa);
  return {
    dPrime: redondear(zh - zfa, 3),
    criterion: redondear(-0.5 * (zh + zfa), 3)
  };
}

function corregirTasaExtrema(valor, total) {
  if (!total) return 0.5;
  if (valor <= 0) return 0.5 / total;
  if (valor >= 1) return 1 - (0.5 / total);
  return valor;
}

function normalInv(p) {
  const a1 = -39.69683028665376;
  const a2 = 220.9460984245205;
  const a3 = -275.9285104469687;
  const a4 = 138.357751867269;
  const a5 = -30.66479806614716;
  const a6 = 2.506628277459239;
  const b1 = -54.47609879822406;
  const b2 = 161.5858368580409;
  const b3 = -155.6989798598866;
  const b4 = 66.80131188771972;
  const b5 = -13.28068155288572;
  const c1 = -0.007784894002430293;
  const c2 = -0.3223964580411365;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;
  const d1 = 0.007784695709041462;
  const d2 = 0.3224671290700398;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  let r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
}

function csvValor(valor) {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor).replace(/"/g, '""');
  return /[",\n]/.test(texto) ? `"${texto}"` : texto;
}
