export function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizarPesoKg(valor) {
  const peso = numero(valor);
  return peso && peso > 0 ? peso : null;
}

export function normalizarConcentracionMgMl(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const relacion = texto.match(/([\d.]+)\s*mg\s*(?:\/|por|en)\s*([\d.]+)\s*m?l/);
  if (relacion) {
    const mg = Number(relacion[1]);
    const ml = Number(relacion[2]);
    return mg > 0 && ml > 0 ? mg / ml : null;
  }
  const directa = numero(texto);
  return directa && directa > 0 ? directa : null;
}

export function analizarTalla(valor) {
  const base = {
    valorOriginal: valor ?? "",
    valorCm: null,
    valorM: null,
    unidadEntrada: "",
    valido: false,
    error: "",
    advertencias: []
  };
  if (valor === null || valor === undefined || valor === "") {
    return { ...base, error: "Registra talla o longitud." };
  }
  const texto = String(valor).trim().toLowerCase();
  const talla = numero(texto);
  if (!talla || talla <= 0) {
    return { ...base, error: "La talla debe ser mayor a cero." };
  }
  const tieneCm = /\bcm\b|cent/i.test(texto);
  const tieneM = /\bm\b|metro/i.test(texto) && !tieneCm;
  let valorCm = talla;
  let unidadEntrada = "cm";

  if (tieneCm) {
    unidadEntrada = "cm";
    valorCm = talla;
  } else if (tieneM) {
    unidadEntrada = "m";
    valorCm = talla * 100;
  } else if (talla <= 3) {
    unidadEntrada = "m inferido";
    valorCm = talla * 100;
    base.advertencias.push("Se interpreto como metros por ser menor o igual a 3.");
  }

  if (tieneCm && talla < 30) {
    return {
      ...base,
      unidadEntrada,
      error: "Talla en centimetros improbable. Si escribiste 1.50, se interpreta mejor como 1.50 m."
    };
  }
  if (valorCm < 30 || valorCm > 230) {
    return {
      ...base,
      unidadEntrada,
      error: "Talla fuera de rango pediatrico esperado. Verifica unidad y dato."
    };
  }

  return {
    ...base,
    valorCm,
    valorM: valorCm / 100,
    unidadEntrada,
    valido: true,
    advertencias: base.advertencias
  };
}

export function normalizarTallaCm(valor) {
  const analisis = analizarTalla(valor);
  return analisis.valido ? analisis.valorCm : null;
}

export function calcularIMC(pesoKg, tallaCm) {
  const peso = normalizarPesoKg(pesoKg);
  const talla = normalizarTallaCm(tallaCm);
  if (!peso || !talla) return null;
  const metros = talla / 100;
  if (metros <= 0) return null;
  return peso / (metros * metros);
}

export function superficieCorporal(pesoKg, tallaCm) {
  const peso = normalizarPesoKg(pesoKg);
  const talla = normalizarTallaCm(tallaCm);
  if (!peso || !talla) return null;
  return {
    mosteller: Math.sqrt((peso * talla) / 3600),
    haycock: 0.024265 * Math.pow(peso, 0.5378) * Math.pow(talla, 0.3964),
    dubois: 0.007184 * Math.pow(peso, 0.425) * Math.pow(talla, 0.725),
    gehanGeorge: 0.0235 * Math.pow(peso, 0.51456) * Math.pow(talla, 0.42246)
  };
}

export function mantenimientoHollidaySegar(pesoKg) {
  const peso = normalizarPesoKg(pesoKg);
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

export function mantenimientoHollidaySegarDetalle(pesoKg) {
  const peso = normalizarPesoKg(pesoKg);
  const mantenimiento = mantenimientoHollidaySegar(peso);
  if (!peso || !mantenimiento) return null;
  const tramos = [
    {
      etiqueta: "Primeros 10 kg",
      pesoKg: Math.min(peso, 10),
      factor: 100,
      subtotal: Math.min(peso, 10) * 100
    },
    {
      etiqueta: "Siguientes 10 kg",
      pesoKg: Math.max(0, Math.min(peso - 10, 10)),
      factor: 50,
      subtotal: Math.max(0, Math.min(peso - 10, 10)) * 50
    },
    {
      etiqueta: "Peso >20 kg",
      pesoKg: Math.max(0, peso - 20),
      factor: 20,
      subtotal: Math.max(0, peso - 20) * 20
    }
  ];
  return {
    ...mantenimiento,
    pesoKg: peso,
    tramos: tramos.filter((tramo) => tramo.pesoKg > 0),
    formulaTexto: tramos
      .filter((tramo) => tramo.pesoKg > 0)
      .map((tramo) => `${tramo.pesoKg.toFixed(tramo.pesoKg % 1 ? 1 : 0)} kg x ${tramo.factor}`)
      .join(" + ")
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
