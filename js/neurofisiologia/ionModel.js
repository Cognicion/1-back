export const CONSTANTES_FISIOLOGICAS = {
  R: 8.314462618,
  F: 96485.33212,
  celsiusBase: 37,
  kelvinOffset: 273.15
};

export const IONES = {
  na: { id: "na", etiqueta: "Na+", z: 1, color: "#fb923c" },
  k: { id: "k", etiqueta: "K+", z: 1, color: "#34d399" },
  cl: { id: "cl", etiqueta: "Cl-", z: -1, color: "#a78bfa" },
  ca: { id: "ca", etiqueta: "Ca2+", z: 2, color: "#facc15" }
};

export const ESTADO_MEMBRANA_BASE = {
  temperaturaC: 37,
  concentraciones: {
    na: { intra: 12, extra: 145 },
    k: { intra: 140, extra: 4 },
    cl: { intra: 4, extra: 110 },
    ca: { intra: 0.0001, extra: 1.2 }
  },
  permeabilidades: { na: 0.04, k: 1, cl: 0.45, ca: 0.0001 },
  bombaNaK: 1
};

export const PRESETS_MEMBRANA = {
  fisiologica: { nombre: "Neurona fisiologica", cambios: {} },
  hiponatremia: { nombre: "Hiponatremia extracelular", cambios: { concentraciones: { na: { extra: 125 } } } },
  hipernatremia: { nombre: "Hipernatremia extracelular", cambios: { concentraciones: { na: { extra: 165 } } } },
  hipopotasemia: { nombre: "Hipopotasemia", cambios: { concentraciones: { k: { extra: 2.5 } } } },
  hiperpotasemia: { nombre: "Hiperpotasemia", cambios: { concentraciones: { k: { extra: 8 } } } },
  bloqueoNa: { nombre: "Bloqueo de canales de Na+", cambios: { permeabilidades: { na: 0.002 } } },
  bloqueoK: { nombre: "Bloqueo de canales de K+", cambios: { permeabilidades: { k: 0.12 } } },
  bombaInhibida: { nombre: "Inhibicion de bomba Na+/K+", cambios: { bombaNaK: 0.1 } },
  permeableK: { nombre: "Membrana principalmente permeable a K+", cambios: { permeabilidades: { na: 0.005, k: 1.8, cl: 0.08 } } }
};

export function clonarEstadoMembrana(estado = ESTADO_MEMBRANA_BASE) {
  return JSON.parse(JSON.stringify(estado));
}

export function aplicarPresetMembrana(idPreset) {
  const estado = clonarEstadoMembrana();
  const preset = PRESETS_MEMBRANA[idPreset] || PRESETS_MEMBRANA.fisiologica;
  fusionarParcial(estado, preset.cambios || {});
  return estado;
}

function fusionarParcial(destino, cambios) {
  Object.entries(cambios).forEach(([clave, valor]) => {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      destino[clave] ||= {};
      fusionarParcial(destino[clave], valor);
    } else {
      destino[clave] = valor;
    }
  });
}

export function validarEstadoMembrana(estado) {
  const errores = [];
  const advertencias = [];
  Object.entries(estado.concentraciones || {}).forEach(([ion, valores]) => {
    if (!(valores.intra > 0) || !(valores.extra > 0)) errores.push(`${IONES[ion]?.etiqueta || ion}: concentraciones deben ser mayores que cero.`);
  });
  Object.entries(estado.permeabilidades || {}).forEach(([ion, valor]) => {
    if (valor < 0 || !Number.isFinite(Number(valor))) errores.push(`${IONES[ion]?.etiqueta || ion}: permeabilidad invalida.`);
    if (valor > 5) advertencias.push(`${IONES[ion]?.etiqueta || ion}: permeabilidad experimental alta.`);
  });
  if (estado.temperaturaC < 0 || estado.temperaturaC > 45) advertencias.push("Temperatura fuera del rango fisiologico habitual.");
  if (estado.bombaNaK < 0 || estado.bombaNaK > 1.5) advertencias.push("Actividad de bomba Na/K experimental.");
  return { valido: errores.length === 0, errores, advertencias };
}

export function calcularNernst({ intra, extra, z, temperaturaC = 37 }) {
  const ci = Number(intra);
  const co = Number(extra);
  const valencia = Number(z);
  if (!(ci > 0) || !(co > 0) || !valencia) return NaN;
  const T = temperaturaC + CONSTANTES_FISIOLOGICAS.kelvinOffset;
  return (CONSTANTES_FISIOLOGICAS.R * T / (valencia * CONSTANTES_FISIOLOGICAS.F)) * Math.log(co / ci) * 1000;
}

export function calcularPotencialesEquilibrio(estado) {
  return Object.fromEntries(Object.entries(IONES).map(([id, ion]) => {
    const c = estado.concentraciones[id];
    return [id, calcularNernst({ intra: c.intra, extra: c.extra, z: ion.z, temperaturaC: estado.temperaturaC })];
  }));
}

export function calcularGHK(estado) {
  const c = estado.concentraciones;
  const p = estado.permeabilidades;
  const T = estado.temperaturaC + CONSTANTES_FISIOLOGICAS.kelvinOffset;
  const numerador = (p.k * c.k.extra) + (p.na * c.na.extra) + (p.cl * c.cl.intra);
  const denominador = (p.k * c.k.intra) + (p.na * c.na.intra) + (p.cl * c.cl.extra);
  if (!(numerador > 0) || !(denominador > 0)) return NaN;
  const bombaOffset = -4 * Number(estado.bombaNaK || 0);
  return (CONSTANTES_FISIOLOGICAS.R * T / CONSTANTES_FISIOLOGICAS.F) * Math.log(numerador / denominador) * 1000 + bombaOffset;
}

export function estimarFlujoIon(estado, ionId) {
  const potenciales = calcularPotencialesEquilibrio(estado);
  const vm = calcularGHK(estado);
  const permeabilidad = Number(estado.permeabilidades[ionId] || 0);
  const fuerza = vm - potenciales[ionId];
  const flujo = -permeabilidad * fuerza;
  return {
    ion: ionId,
    flujo,
    direccion: Math.abs(flujo) < 0.1 ? "equilibrio" : flujo > 0 ? "hacia el interior" : "hacia el exterior",
    gradienteQuimico: estado.concentraciones[ionId].extra > estado.concentraciones[ionId].intra ? "entra por gradiente quimico" : "sale por gradiente quimico",
    gradienteElectrico: IONES[ionId].z > 0 ? (vm < 0 ? "entra por gradiente electrico" : "sale por gradiente electrico") : (vm < 0 ? "sale por gradiente electrico" : "entra por gradiente electrico")
  };
}

export function construirTablaIonica(estado) {
  const potenciales = calcularPotencialesEquilibrio(estado);
  return Object.keys(IONES).map((ionId) => ({
    ion: IONES[ionId],
    intra: estado.concentraciones[ionId].intra,
    extra: estado.concentraciones[ionId].extra,
    permeabilidad: estado.permeabilidades[ionId],
    potencial: potenciales[ionId],
    flujo: estimarFlujoIon(estado, ionId)
  }));
}

export function sustituirEcuacionNernst(estado, ionId) {
  const ion = IONES[ionId];
  const c = estado.concentraciones[ionId];
  const valor = calcularNernst({ intra: c.intra, extra: c.extra, z: ion.z, temperaturaC: estado.temperaturaC });
  return `E${ion.etiqueta} = (RT / zF) ln([${ion.etiqueta}]o / [${ion.etiqueta}]i) = ${valor.toFixed(1)} mV`;
}

export function sustituirEcuacionGHK(estado) {
  const vm = calcularGHK(estado);
  return `Vm = (RT/F) ln((PK[K]o + PNa[Na]o + PCl[Cl]i) / (PK[K]i + PNa[Na]i + PCl[Cl]o)) = ${vm.toFixed(1)} mV`;
}