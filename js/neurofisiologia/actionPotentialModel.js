function alphaN(v) { return evitarDivision(0.01 * (v + 55), 1 - Math.exp(-(v + 55) / 10)); }
function betaN(v) { return 0.125 * Math.exp(-(v + 65) / 80); }
function alphaM(v) { return evitarDivision(0.1 * (v + 40), 1 - Math.exp(-(v + 40) / 10)); }
function betaM(v) { return 4 * Math.exp(-(v + 65) / 18); }
function alphaH(v) { return 0.07 * Math.exp(-(v + 65) / 20); }
function betaH(v) { return 1 / (1 + Math.exp(-(v + 35) / 10)); }
function evitarDivision(num, den) { return Math.abs(den) < 1e-7 ? num / 1e-7 : num / den; }

export const PARAMETROS_HH_BASE = {
  dt: 0.025,
  duracionMs: 60,
  Cm: 1,
  gNa: 120,
  gK: 36,
  gL: 0.3,
  ENa: 50,
  EK: -77,
  EL: -54.4,
  estimulo: { inicio: 5, duracion: 1, intensidad: 12 },
  segundoEstimulo: { activo: false, separacion: 8, intensidad: 12, duracion: 1 }
};

export function estadoInicialHH(vm = -65) {
  return {
    Vm: vm,
    m: alphaM(vm) / (alphaM(vm) + betaM(vm)),
    h: alphaH(vm) / (alphaH(vm) + betaH(vm)),
    n: alphaN(vm) / (alphaN(vm) + betaN(vm))
  };
}

export function fasePotencial(vm, previoVm = vm) {
  if (vm < -75) return "Hiperpolarizacion";
  if (vm < -55) return "Reposo / subumbral";
  if (vm >= -55 && previoVm <= vm && vm < 20) return "Despolarizacion";
  if (vm >= 20) return "Pico";
  if (previoVm > vm && vm > -75) return "Repolarizacion";
  return "Retorno al reposo";
}

export function estadoCanales(m, h, n, vm) {
  return {
    sodio: h < 0.2 ? "Inactivado" : m > 0.45 ? "Abierto" : "Cerrado disponible",
    potasio: n > 0.55 ? "Abierto" : n > 0.38 ? "Abriendose" : vm < -70 ? "Cerrandose" : "Cerrado"
  };
}

export function corrienteExterna(t, parametros) {
  const e = parametros.estimulo;
  let corriente = t >= e.inicio && t <= e.inicio + e.duracion ? e.intensidad : 0;
  if (parametros.segundoEstimulo?.activo) {
    const inicio2 = e.inicio + parametros.segundoEstimulo.separacion;
    if (t >= inicio2 && t <= inicio2 + parametros.segundoEstimulo.duracion) corriente += parametros.segundoEstimulo.intensidad;
  }
  return corriente;
}

export function simularPotencialAccion(opciones = {}) {
  const parametros = { ...PARAMETROS_HH_BASE, ...opciones, estimulo: { ...PARAMETROS_HH_BASE.estimulo, ...(opciones.estimulo || {}) }, segundoEstimulo: { ...PARAMETROS_HH_BASE.segundoEstimulo, ...(opciones.segundoEstimulo || {}) } };
  const dt = Math.max(0.005, Math.min(0.2, parametros.dt));
  const pasos = Math.floor(parametros.duracionMs / dt);
  let estado = estadoInicialHH(-65);
  const trazas = [];
  let previoVm = estado.Vm;
  for (let i = 0; i <= pasos; i += 1) {
    const t = i * dt;
    const gNaT = parametros.gNa * Math.pow(estado.m, 3) * estado.h;
    const gKT = parametros.gK * Math.pow(estado.n, 4);
    const INa = gNaT * (estado.Vm - parametros.ENa);
    const IK = gKT * (estado.Vm - parametros.EK);
    const IL = parametros.gL * (estado.Vm - parametros.EL);
    const Iext = corrienteExterna(t, parametros);
    const dV = (Iext - INa - IK - IL) / parametros.Cm;
    const dm = alphaM(estado.Vm) * (1 - estado.m) - betaM(estado.Vm) * estado.m;
    const dh = alphaH(estado.Vm) * (1 - estado.h) - betaH(estado.Vm) * estado.h;
    const dn = alphaN(estado.Vm) * (1 - estado.n) - betaN(estado.Vm) * estado.n;
    trazas.push({ t, Vm: estado.Vm, INa, IK, gNa: gNaT, gK: gKT, Iext, m: estado.m, h: estado.h, n: estado.n, fase: fasePotencial(estado.Vm, previoVm), canales: estadoCanales(estado.m, estado.h, estado.n, estado.Vm) });
    previoVm = estado.Vm;
    estado = {
      Vm: limitar(estado.Vm + dt * dV, -120, 80),
      m: limitar(estado.m + dt * dm, 0, 1),
      h: limitar(estado.h + dt * dh, 0, 1),
      n: limitar(estado.n + dt * dn, 0, 1)
    };
  }
  return { parametros, trazas, resumen: resumirPotencial(trazas, parametros) };
}

export function resumirPotencial(trazas, parametros) {
  const pico = trazas.reduce((max, p) => p.Vm > max.Vm ? p : max, trazas[0]);
  const reposo = trazas[0]?.Vm ? -65;
  const superoUmbral = trazas.some((p) => p.Vm > -20);
  const absoluto = trazas.filter((p) => p.h < 0.2).map((p) => p.t);
  const relativo = trazas.filter((p) => p.Vm < -72 || (p.h >= 0.2 && p.h < 0.55)).map((p) => p.t);
  return {
    reposo,
    pico: pico.Vm,
    tiempoPico: pico.t,
    superoUmbral,
    refractarioAbsoluto: absoluto.length ? [Math.min(...absoluto), Math.max(...absoluto)] : null,
    refractarioRelativo: relativo.length ? [Math.min(...relativo), Math.max(...relativo)] : null,
    mensaje: superoUmbral ? "El estimulo supero el umbral y genero un potencial de accion." : "Estimulo subumbral: no se genero potencial de accion completo."
  };
}

export function limitar(valor, min, max) {
  if (!Number.isFinite(valor)) return min;
  return Math.min(max, Math.max(min, valor));
}