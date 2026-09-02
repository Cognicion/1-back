export function finiteNumbers(values = []) {
  return values
    .filter((value) => value !== null && value !== undefined && value !== "" && typeof value !== "boolean")
    .map(Number)
    .filter(Number.isFinite);
}

export function sum(values = []) {
  return finiteNumbers(values).reduce((total, value) => total + value, 0);
}

export function mean(values = []) {
  const numbers = finiteNumbers(values);
  return numbers.length ? sum(numbers) / numbers.length : null;
}

export function median(values = []) {
  const numbers = finiteNumbers(values).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function standardDeviation(values = [], sample = false) {
  const numbers = finiteNumbers(values);
  const denominator = sample ? numbers.length - 1 : numbers.length;
  if (!numbers.length || denominator <= 0) return null;
  const average = mean(numbers);
  return Math.sqrt(numbers.reduce((total, value) => total + ((value - average) ** 2), 0) / denominator);
}

export function coefficientOfVariation(values = []) {
  const average = mean(values);
  const deviation = standardDeviation(values);
  if (!Number.isFinite(average) || average === 0 || !Number.isFinite(deviation)) return null;
  return deviation / Math.abs(average);
}

export function quantile(values = [], probability = 0.5) {
  const numbers = finiteNumbers(values).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const p = clamp(Number(probability), 0, 1);
  const index = (numbers.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return numbers[lower];
  return numbers[lower] + ((numbers[upper] - numbers[lower]) * (index - lower));
}

export function rate(numerator, denominator) {
  if ([numerator, denominator].some((value) => value === null || value === undefined || value === "" || typeof value === "boolean")) return null;
  const n = Number(numerator);
  const d = Number(denominator);
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null;
}

export function round(value, decimals = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value, minimum, maximum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return minimum;
  return Math.min(maximum, Math.max(minimum, numericValue));
}

export function percentChange(current, baseline) {
  if ([current, baseline].some((value) => value === null || value === undefined || value === "" || typeof value === "boolean")) return null;
  const currentValue = Number(current);
  const baselineValue = Number(baseline);
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || baselineValue === 0) return null;
  return ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100;
}

export function logLinearRate(successes, total) {
  if ([successes, total].some((value) => value === null || value === undefined || value === "" || typeof value === "boolean")) return null;
  const count = Number(successes);
  const denominator = Number(total);
  if (!Number.isFinite(count) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (count + 0.5) / (denominator + 1);
}

// Aproximación de Acklam para la inversa de la distribución normal estándar.
export function inverseStandardNormal(probability) {
  const p = Number(probability);
  if (!(p > 0 && p < 1)) return null;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function createSeededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleSeeded(values = [], seed = 1) {
  const output = [...values];
  const random = createSeededRandom(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}
