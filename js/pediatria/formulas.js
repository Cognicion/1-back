export function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function calcularIMC(pesoKg, tallaCm) {
  const peso = numero(pesoKg);
  const talla = numero(tallaCm);
  if (!peso || !talla) return null;
  const metros = talla > 3 ? talla / 100 : talla;
  if (metros <= 0) return null;
  return peso / (metros * metros);
}

export function superficieCorporal(pesoKg, tallaCm) {
  const peso = numero(pesoKg);
  const talla = numero(tallaCm);
  if (!peso || !talla) return null;
  return {
    mosteller: Math.sqrt((peso * talla) / 3600),
    haycock: 0.024265 * Math.pow(peso, 0.5378) * Math.pow(talla, 0.3964),
    dubois: 0.007184 * Math.pow(peso, 0.425) * Math.pow(talla, 0.725),
    gehanGeorge: 0.0235 * Math.pow(peso, 0.51456) * Math.pow(talla, 0.42246)
  };
}

export function mantenimientoHollidaySegar(pesoKg) {
  const peso = numero(pesoKg);
  if (!peso || peso <= 0) return null;
  const primeros10 = Math.min(peso, 10) * 100;
  const segundos10 = Math.max(0, Math.min(peso - 10, 10)) * 50;
  const resto = Math.max(0, peso - 20) * 20;
  const dia = primeros10 + segundos10 + resto;
  return {
    mlDia: dia,
    mlHora: dia / 24,
    regla421: Math.min(peso, 10) * 4 + Math.max(0, Math.min(peso - 10, 10)) * 2 + Math.max(0, peso - 20)
  };
}

export function calcularDeficit(pesoKg, porcentajeDeshidratacion) {
  const peso = numero(pesoKg);
  const porcentaje = numero(porcentajeDeshidratacion);
  if (!peso || porcentaje === null) return null;
  return peso * porcentaje * 10;
}

export function calcularDiuresis(volumenMl, pesoKg, horas) {
  const volumen = numero(volumenMl);
  const peso = numero(pesoKg);
  const tiempo = numero(horas);
  if (!volumen || !peso || !tiempo) return null;
  return volumen / peso / tiempo;
}

export function corregirSodioPorGlucosa(sodio, glucosaMgDl) {
  const na = numero(sodio);
  const glu = numero(glucosaMgDl);
  if (na === null || glu === null) return null;
  return na + 1.6 * Math.max(0, (glu - 100) / 100);
}

export function calcularAnionGap(sodio, cloro, bicarbonato) {
  const na = numero(sodio);
  const cl = numero(cloro);
  const hco3 = numero(bicarbonato);
  if (na === null || cl === null || hco3 === null) return null;
  return na - (cl + hco3);
}

export function percentilDesdeLMS(valor, l, m, s) {
  const x = numero(valor);
  const L = numero(l);
  const M = numero(m);
  const S = numero(s);
  if (!x || !M || !S || L === null) return null;

  const z = L === 0
    ? Math.log(x / M) / S
    : (Math.pow(x / M, L) - 1) / (L * S);
  return { z, percentil: normalCdf(z) * 100 };
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
