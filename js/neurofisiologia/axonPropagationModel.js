import { simularPotencialAccion } from "./actionPotentialModel.js";

export const PARAMETROS_AXON_BASE = {
  longitudMm: 80,
  diametroUm: 2,
  mielina: true,
  grosorMielina: 0.8,
  distanciaNodosMm: 8,
  temperaturaC: 37,
  resistenciaAxial: 1,
  capacitancia: 1,
  densidadNa: 1,
  densidadK: 1,
  bloqueoCanales: 0,
  desmielinizacion: { activa: false, inicioMm: 35, longitudMm: 15, severidad: 0.55 },
  estimulacion: "izquierda",
  bidireccional: false,
  electrodos: [15, 40, 65]
};

export function calcularVelocidadConduccion(params = PARAMETROS_AXON_BASE) {
  const p = { ...PARAMETROS_AXON_BASE, ...params, desmielinizacion: { ...PARAMETROS_AXON_BASE.desmielinizacion, ...(params.desmielinizacion || {}) } };
  const factorMielina = p.mielina ? 7.5 * (0.55 + p.grosorMielina) : 1;
  const factorDiametro = Math.sqrt(Math.max(0.1, p.diametroUm));
  const factorTemp = Math.max(0.25, 1 + (p.temperaturaC - 37) * 0.035);
  const factorBloqueo = Math.max(0.08, 1 - p.bloqueoCanales);
  const factorDesmielina = p.desmielinizacion.activa ? Math.max(0.08, 1 - p.desmielinizacion.severidad * 0.75) : 1;
  const velocidad = 0.35 * factorMielina * factorDiametro * factorTemp * factorBloqueo * factorDesmielina / Math.max(0.25, p.resistenciaAxial * p.capacitancia);
  return Math.max(0.05, velocidad);
}

export function simularPropagacionAxonal(params = {}) {
  const p = { ...PARAMETROS_AXON_BASE, ...params, desmielinizacion: { ...PARAMETROS_AXON_BASE.desmielinizacion, ...(params.desmielinizacion || {}) } };
  const velocidadMms = calcularVelocidadConduccion(p);
  const ap = simularPotencialAccion({ duracionMs: 45, gNa: 120 * p.densidadNa * (1 - p.bloqueoCanales), gK: 36 * p.densidadK, estimulo: { inicio: 2, duracion: 1, intensidad: 14 } });
  const distanciaTotal = p.longitudMm;
  const tiempoTotalMs = distanciaTotal / velocidadMms;
  const electrodos = p.electrodos.map((posicion) => {
    const distancia = p.estimulacion === "derecha" ? Math.abs(p.longitudMm - posicion) : p.estimulacion === "centro" ? Math.abs(p.longitudMm / 2 - posicion) : posicion;
    const retraso = distancia / velocidadMms;
    const amplitud = amplitudEnPosicion(p, posicion);
    return { posicion, retraso, amplitud, traza: desplazarTraza(ap.trazas, retraso, amplitud) };
  });
  return { parametros: p, velocidadMms, tiempoTotalMs, electrodos, apBase: ap, seguridadConduccion: calcularSeguridad(p) };
}

function amplitudEnPosicion(p, posicion) {
  if (!p.desmielinizacion.activa) return 1;
  const inicio = p.desmielinizacion.inicioMm;
  const fin = inicio + p.desmielinizacion.longitudMm;
  if (posicion < inicio) return 1;
  if (posicion <= fin) return Math.max(0.25, 1 - p.desmielinizacion.severidad);
  return Math.max(0.15, 1 - p.desmielinizacion.severidad * 0.45);
}

function desplazarTraza(trazas, retraso, amplitud) {
  return trazas.map((p) => ({ t: p.t + retraso, Vm: -65 + (p.Vm + 65) * amplitud }));
}

function calcularSeguridad(p) {
  let seguridad = 1 - p.bloqueoCanales * 0.55;
  if (p.desmielinizacion.activa) seguridad -= p.desmielinizacion.severidad * 0.45;
  if (!p.mielina) seguridad -= 0.08;
  return Math.max(0, Math.min(1, seguridad));
}