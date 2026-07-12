import { aplicarPresetMembrana, calcularGHK, calcularPotencialesEquilibrio } from "./ionModel.js";
import { corrienteExterna, estadoCanales, estadoInicialHH, fasePotencial, limitar, PARAMETROS_HH_BASE } from "./actionPotentialModel.js";
import { calcularVelocidadConduccion, PARAMETROS_AXON_BASE } from "./axonPropagationModel.js";
import { obtenerFarmaco, resumirEfectosFarmacos } from "./drugRegistry.js";

function alphaN(v) { return evitarDivision(0.01 * (v + 55), 1 - Math.exp(-(v + 55) / 10)); }
function betaN(v) { return 0.125 * Math.exp(-(v + 65) / 80); }
function alphaM(v) { return evitarDivision(0.1 * (v + 40), 1 - Math.exp(-(v + 40) / 10)); }
function betaM(v) { return 4 * Math.exp(-(v + 65) / 18); }
function alphaH(v) { return 0.07 * Math.exp(-(v + 65) / 20); }
function betaH(v) { return 1 / (1 + Math.exp(-(v + 35) / 10)); }
function evitarDivision(num, den) { return Math.abs(den) < 1e-7 ? num / 1e-7 : num / den; }

const TIPOS_SINAPSIS = {
  glutamato: { nombre: "Glutamatergica", nt: "Glutamato", receptor: "AMPA/NMDA", signo: 1, kon: 1.2, koff: 0.28, ePost: 0, color: "#38bdf8" },
  gaba: { nombre: "GABAergica", nt: "GABA", receptor: "GABA-A", signo: -1, kon: 1.05, koff: 0.22, ePost: -72, color: "#a78bfa" },
  dopamina: { nombre: "Dopaminergica", nt: "Dopamina", receptor: "Metabotropico", signo: 0.35, kon: 0.42, koff: 0.12, ePost: -55, color: "#facc15" },
  serotonina: { nombre: "Serotoninergica", nt: "Serotonina", receptor: "Metabotropico", signo: 0.22, kon: 0.36, koff: 0.11, ePost: -58, color: "#fb7185" },
  noradrenalina: { nombre: "Noradrenergica", nt: "Noradrenalina", receptor: "Metabotropico", signo: 0.3, kon: 0.38, koff: 0.1, ePost: -55, color: "#34d399" }
};

export function crearEstadoNeuronaIntegrada() {
  const membrana = aplicarPresetMembrana("fisiologica");
  const vmReposo = calcularGHK(membrana);
  const hh = estadoInicialHH(-65);
  return {
    tiempo: 0,
    dt: 0.025,
    relojVisual: 0,
    pausado: true,
    estimuloManual: 0,
    controles: { frecuenciaHz: 8, intensidad: 14 },
    membrana,
    equilibrio: calcularPotencialesEquilibrio(membrana),
    vmReposo,
    hh,
    Vm: hh.Vm,
    previoVm: hh.Vm,
    fase: "Reposo / subumbral",
    canales: estadoCanales(hh.m, hh.h, hh.n, hh.Vm),
    Cm: PARAMETROS_HH_BASE.Cm,
    gNa: PARAMETROS_HH_BASE.gNa,
    gK: PARAMETROS_HH_BASE.gK,
    gL: PARAMETROS_HH_BASE.gL,
    ENa: PARAMETROS_HH_BASE.ENa,
    EK: PARAMETROS_HH_BASE.EK,
    EL: PARAMETROS_HH_BASE.EL,
    INa: 0,
    IK: 0,
    IL: 0,
    Iext: 0,
    dVmDt: 0,
    axon: { ...PARAMETROS_AXON_BASE },
    velocidadMms: calcularVelocidadConduccion(PARAMETROS_AXON_BASE),
    posicionOnda: 0,
    terminalActiva: false,
    sinapsis: crearSinapsisBase(),
    farmacos: { activos: [], efectos: resumirEfectosFarmacos([]) },
    eventos: [],
    historia: [],
    ecuacionActiva: "ghk"
  };
}

function crearSinapsisBase() {
  const tipo = TIPOS_SINAPSIS.glutamato;
  return {
    tipoId: "glutamato",
    tipo,
    vesiculasVisuales: 24,
    vesiculasReserva: 24,
    vesiculasListas: 8,
    vesiculasMovilizadas: 0,
    vesiculasFusionadas: 0,
    vesiculasReciclaje: 0,
    basalLiberacion: 0.45,
    caLocal: 0.05,
    kdCa: 0.35,
    probabilidadLiberacion: 0,
    vesiculasLiberadas: 0,
    nt: 0,
    liberacionNt: 0,
    recaptura: 0.55,
    degradacion: 0.18,
    difusion: 0.08,
    recapturaActual: 0,
    degradacionActual: 0,
    difusionActual: 0,
    dNt: 0,
    ocupacion: 0,
    dOcupacion: 0,
    kon: tipo.kon,
    koff: tipo.koff,
    sensibilidad: 1,
    potencialPost: -65,
    corrientePost: 0
  };
}

export function actualizarParametrosIntegrados(estado, cambios = {}) {
  if (cambios.frecuenciaHz !== undefined) estado.controles.frecuenciaHz = Number(cambios.frecuenciaHz);
  if (cambios.intensidad !== undefined) estado.controles.intensidad = Number(cambios.intensidad);
  if (cambios.tipoAxon !== undefined) estado.axon.mielina = cambios.tipoAxon === "mielinizado";
  if (cambios.diametroUm !== undefined) estado.axon.diametroUm = Number(cambios.diametroUm);
  if (cambios.temperaturaC !== undefined) {
    estado.axon.temperaturaC = Number(cambios.temperaturaC);
    estado.membrana.temperaturaC = Number(cambios.temperaturaC);
  }
  if (cambios.desmielinizacion !== undefined) estado.axon.desmielinizacion.activa = Boolean(cambios.desmielinizacion);
  if (cambios.tipoSinapsis !== undefined && TIPOS_SINAPSIS[cambios.tipoSinapsis]) {
    const actual = estado.sinapsis;
    const tipo = TIPOS_SINAPSIS[cambios.tipoSinapsis];
    estado.sinapsis = { ...actual, tipoId: cambios.tipoSinapsis, tipo, kon: tipo.kon, koff: tipo.koff };
  }
  ["vesiculasVisuales", "basalLiberacion", "recaptura", "degradacion", "sensibilidad"].forEach((clave) => {
    if (cambios[clave] !== undefined) estado.sinapsis[clave] = Number(cambios[clave]);
  });
  estado.equilibrio = calcularPotencialesEquilibrio(estado.membrana);
  estado.vmReposo = calcularGHK(estado.membrana);
  estado.velocidadMms = calcularVelocidadConduccion(estado.axon);
  return estado;
}

export function aplicarFarmacoIntegrado(estado, id, intensidad = 0.5) {
  const farmaco = obtenerFarmaco(id);
  if (!farmaco) return estado;
  estado.farmacos.activos = estado.farmacos.activos.filter((f) => f.id !== id);
  estado.farmacos.activos.push({ id, nombre: farmaco.nombre, intensidad: Number(intensidad), descripcion: farmaco.descripcion });
  estado.eventos.unshift({ tiempo: estado.tiempo, texto: `${farmaco.nombre}: ${farmaco.descripcion}` });
  return estado;
}

export function limpiarFarmacosIntegrados(estado) {
  estado.farmacos.activos = [];
  estado.farmacos.efectos = resumirEfectosFarmacos([]);
  estado.eventos.unshift({ tiempo: estado.tiempo, texto: "Farmacos retirados del modelo." });
  return estado;
}

export function estimularNeuronaIntegrada(estado, intensidad = null, opciones = {}) {
  const intensidadPulso = Number(intensidad ?? estado.controles.intensidad ?? 12);
  if (opciones.unico) {
    const duracion = Number(opciones.duracionMs ?? 1.2);
    estado.pulsoUnico = { restanteMs: Math.max(0.1, duracion), intensidad: intensidadPulso };
    estado.soloPulsoUnico = true;
    estado.suspenderTrenHasta = estado.tiempo + Math.max(20, duracion + 12);
    estado.eventos.unshift({ tiempo: estado.tiempo, texto: `Estimulo aplicado: ${intensidadPulso.toFixed(1)} uA/cm2 durante ${duracion.toFixed(1)} ms.` });
    return estado;
  }
  estado.estimuloManual += intensidadPulso;
  estado.eventos.unshift({ tiempo: estado.tiempo, texto: "Estimulo somatico aplicado." });
  return estado;
}

export function avanzarNeuronaIntegrada(estado, dtMs = 0.08) {
  const pasos = Math.max(1, Math.floor(dtMs / estado.dt));
  for (let i = 0; i < pasos; i += 1) pasoFisiologico(estado, estado.dt);
  recortarHistoria(estado);
  return estado;
}

function pasoFisiologico(estado, dt) {
  estado.tiempo += dt;
  estado.relojVisual += dt;
  estado.farmacos.efectos = resumirEfectosFarmacos(estado.farmacos.activos, estado.tiempo);
  const efectos = estado.farmacos.efectos;
  const periodoMs = 1000 / Math.max(0.1, estado.controles.frecuenciaHz);
  const fasePeriodo = estado.tiempo % periodoMs;
  const trenSuspendido = estado.soloPulsoUnico || (estado.suspenderTrenHasta && estado.tiempo < estado.suspenderTrenHasta);
  const tren = !trenSuspendido && fasePeriodo < 1.2 ? estado.controles.intensidad : 0;
  let manual = estado.estimuloManual;
  if (estado.pulsoUnico?.restanteMs > 0) {
    manual += estado.pulsoUnico.intensidad;
    estado.pulsoUnico.restanteMs = Math.max(0, estado.pulsoUnico.restanteMs - dt);
  }
  estado.estimuloManual = Math.max(0, estado.estimuloManual - dt * 90);
  const usoNa = efectos.usoNa * Math.min(1, estado.controles.frecuenciaHz / 20);
  estado.gNa = PARAMETROS_HH_BASE.gNa * Math.max(0.02, 1 - efectos.bloqueoNa - usoNa);
  estado.gK = PARAMETROS_HH_BASE.gK * Math.max(0.02, 1 - efectos.bloqueoK);
  estado.ENa = estado.equilibrio.na;
  estado.EK = estado.equilibrio.k;
  estado.Iext = tren + manual + (efectos.excitabilidad * 8) - efectos.umbral;
  const hh = estado.hh;
  const gNaT = estado.gNa * Math.pow(hh.m, 3) * hh.h;
  const gKT = estado.gK * Math.pow(hh.n, 4);
  estado.INa = gNaT * (hh.Vm - estado.ENa);
  estado.IK = gKT * (hh.Vm - estado.EK);
  estado.IL = estado.gL * (hh.Vm - estado.EL);
  estado.dVmDt = (estado.Iext - estado.INa - estado.IK - estado.IL) / estado.Cm;
  const dm = alphaM(hh.Vm) * (1 - hh.m) - betaM(hh.Vm) * hh.m;
  const dh = alphaH(hh.Vm) * (1 - hh.h) - betaH(hh.Vm) * hh.h;
  const dn = alphaN(hh.Vm) * (1 - hh.n) - betaN(hh.Vm) * hh.n;
  estado.previoVm = hh.Vm;
  estado.hh = {
    Vm: limitar(hh.Vm + dt * estado.dVmDt, -120, 80),
    m: limitar(hh.m + dt * dm, 0, 1),
    h: limitar(hh.h + dt * dh, 0, 1),
    n: limitar(hh.n + dt * dn, 0, 1)
  };
  estado.Vm = estado.hh.Vm;
  estado.m = estado.hh.m;
  estado.h = estado.hh.h;
  estado.n = estado.hh.n;
  estado.fase = fasePotencial(estado.Vm, estado.previoVm);
  estado.canales = estadoCanales(estado.m, estado.h, estado.n, estado.Vm);
  actualizarAxonYSinapsis(estado, dt);
  estado.ecuacionActiva = seleccionarEcuacionActiva(estado);
  estado.historia.push({
    t: estado.tiempo,
    Vm: estado.Vm,
    INa: estado.INa,
    IK: estado.IK,
    ICa: estado.sinapsis.caLocal,
    NT: estado.sinapsis.nt,
    Post: estado.sinapsis.potencialPost,
    Prelease: estado.sinapsis.probabilidadLiberacion,
    receptor: estado.sinapsis.ocupacion,
    posicion: estado.posicionOnda,
    farmaco: estado.farmacos.activos.length ? 1 : 0
  });
}

function actualizarAxonYSinapsis(estado, dt) {
  const apActivo = estado.Vm > -20;
  if (apActivo && estado.previoVm <= -20) {
    estado.posicionOnda = 0.01;
    estado.eventos.unshift({ tiempo: estado.tiempo, texto: "Potencial de accion iniciado en segmento inicial." });
  }
  if (estado.posicionOnda > 0) {
    estado.posicionOnda += estado.velocidadMms * dt / Math.max(20, estado.axon.longitudMm);
    if (estado.posicionOnda >= 1) {
      estado.terminalActiva = true;
      estado.posicionOnda = 0;
      estado.eventos.unshift({ tiempo: estado.tiempo, texto: "El potencial alcanzo la terminal presinaptica." });
    }
  }
  const s = estado.sinapsis;
  const efectos = estado.farmacos.efectos;
  const caEntrada = estado.terminalActiva ? 1.2 * Math.max(0.02, 1 - efectos.bloqueoCa) : 0;
  s.caLocal += dt * (caEntrada - s.caLocal * 0.45);
  s.caLocal = limitar(s.caLocal, 0.02, 3.5);
  const caPow = Math.pow(s.caLocal, 4);
  const kdPow = Math.pow(s.kdCa, 4);
  const sv2a = Math.max(0.1, 1 - efectos.sv2a);
  const liberacionFarmaco = Math.max(0.05, 1 + efectos.liberacion);
  s.probabilidadLiberacion = limitar(s.basalLiberacion * caPow / (kdPow + caPow) * sv2a * liberacionFarmaco, 0, 1);
  s.vesiculasLiberadas = estado.terminalActiva ? s.probabilidadLiberacion * Math.min(s.vesiculasListas, s.vesiculasVisuales / 4) : 0;
  s.liberacionNt = s.vesiculasLiberadas * 0.16;
  s.vesiculasListas = limitar(s.vesiculasListas - s.vesiculasLiberadas * dt + dt * 0.18 * (s.vesiculasVisuales / 3 - s.vesiculasListas), 0, s.vesiculasVisuales);
  s.vesiculasFusionadas = s.vesiculasLiberadas;
  s.vesiculasReciclaje = limitar(s.vesiculasReciclaje + s.vesiculasLiberadas * dt - s.vesiculasReciclaje * dt * 0.08, 0, s.vesiculasVisuales);
  s.recapturaActual = s.recaptura * s.nt / (0.35 + s.nt);
  s.degradacionActual = s.degradacion * s.nt;
  s.difusionActual = s.difusion * s.nt;
  s.dNt = s.liberacionNt - s.recapturaActual - s.degradacionActual - s.difusionActual;
  s.nt = limitar(s.nt + dt * s.dNt, 0, 8);
  const gabaFactor = s.tipoId === "gaba" ? Math.max(0.05, 1 + efectos.gaba) : 1;
  const ampaFactor = s.tipoId === "glutamato" ? Math.max(0.05, 1 + efectos.ampa) : 1;
  const nmdaFactor = s.tipoId === "glutamato" ? Math.max(0.05, 1 + efectos.nmda) : 1;
  const moduladorReceptor = s.tipoId === "glutamato" ? (0.7 * ampaFactor + 0.3 * nmdaFactor) : gabaFactor;
  s.dOcupacion = s.kon * s.nt * (1 - s.ocupacion) * moduladorReceptor - s.koff * s.ocupacion;
  s.ocupacion = limitar(s.ocupacion + dt * s.dOcupacion, 0, 1);
  const signo = s.tipo.signo;
  s.corrientePost = signo * s.ocupacion * s.sensibilidad * 18;
  if (s.tipoId === "gaba") {
    const fuerzaCl = s.potencialPost - s.tipo.ePost;
    s.corrientePost = -Math.sign(fuerzaCl || 1) * Math.abs(s.ocupacion * s.sensibilidad * 10 * gabaFactor);
  }
  s.potencialPost = limitar(s.potencialPost + dt * ((-65 - s.potencialPost) / 18 + s.corrientePost), -90, 20);
  estado.terminalActiva = false;
}

function seleccionarEcuacionActiva(estado) {
  if (estado.farmacos.activos.length) return "farmacos";
  if (estado.sinapsis.nt > 0.08) return estado.sinapsis.ocupacion > 0.05 ? "ocupacion_receptores" : "recaptura_degradacion";
  if (estado.sinapsis.caLocal > 0.15) return "liberacion_vesicular";
  if (estado.posicionOnda > 0) return "velocidad_conduccion";
  if (estado.Vm > -55) return estado.fase === "Repolarizacion" ? "corriente_k" : "corriente_na";
  return "ghk";
}

function recortarHistoria(estado) {
  if (estado.historia.length > 1200) estado.historia.splice(0, estado.historia.length - 1200);
  if (estado.eventos.length > 8) estado.eventos.splice(8);
}

export function obtenerVariablesIntegradas(estado) {
  const rango = (valor, min, max) => valor < min || valor > max ? "fuera de rango" : "fisiologico";
  return [
    ["Potencial de membrana", "Vm", estado.Vm, "mV", "-70 a -55", rango(estado.Vm, -90, 40)],
    ["Potencial de Na+", "ENa", estado.ENa, "mV", "+50 a +70", rango(estado.ENa, 40, 80)],
    ["Potencial de K+", "EK", estado.EK, "mV", "-100 a -75", rango(estado.EK, -110, -65)],
    ["Activacion Na+", "m", estado.m, "0-1", "0 a 1", estado.m > 0.55 ? "alta" : "moderada"],
    ["Inactivacion Na+", "h", estado.h, "0-1", "0 a 1", estado.h < 0.25 ? "baja" : "fisiologico"],
    ["Activacion K+", "n", estado.n, "0-1", "0 a 1", estado.n > 0.55 ? "alta" : "moderada"],
    ["Corriente Na+", "INa", estado.INa, "uA/cm2", "variable", estado.INa < 0 ? "entrante" : "saliente"],
    ["Corriente K+", "IK", estado.IK, "uA/cm2", "variable", estado.IK > 0 ? "saliente" : "entrante"],
    ["Ca2+ presinaptico", "Ca", estado.sinapsis.caLocal, "relativo", "0.02-3.5", estado.sinapsis.caLocal > 0.7 ? "elevado" : "fisiologico"],
    ["Neurotransmisor", "NT", estado.sinapsis.nt, "relativo", "0-8", estado.sinapsis.nt > 1 ? "experimental" : "fisiologico"],
    ["Ocupacion receptores", "B", estado.sinapsis.ocupacion, "0-1", "0 a 1", estado.sinapsis.ocupacion > 0.5 ? "alta" : "moderada"],
    ["Velocidad conduccion", "v", estado.velocidadMms, "mm/ms", "modelo", estado.axon.mielina ? "saltatoria" : "continua"]
  ];
}

export function explicarEstadoIntegrado(estado) {
  const pasos = [];
  pasos.push(`Fase actual: ${estado.fase}.`);
  if (estado.Iext > 0) pasos.push("El estimulo externo aumenta Iext y modifica dVm/dt.");
  if (estado.Vm > -55) pasos.push("Vm supera el rango subumbral; m aumenta y la conductancia de Na+ se eleva.");
  if (estado.canales.sodio === "Inactivado") pasos.push("La compuerta h disminuye: el canal de Na+ entra en inactivacion.");
  if (estado.canales.potasio.includes("Ab")) pasos.push("La variable n favorece apertura de K+ y repolarizacion.");
  if (estado.posicionOnda > 0) pasos.push("La onda de despolarizacion avanza por el axon con la velocidad calculada.");
  if (estado.sinapsis.caLocal > 0.2) pasos.push("La llegada terminal abre Ca2+ presinaptico y aumenta la probabilidad de liberacion vesicular.");
  if (estado.sinapsis.nt > 0.05) pasos.push("El neurotransmisor se libera, difunde, se une a receptores y comienza recaptura/degradacion.");
  if (estado.farmacos.activos.length) pasos.push("Los farmacos activos modifican parametros efectivos; el panel de ecuaciones muestra el antes/despues educativo.");
  return pasos.length ? pasos : ["Modelo en reposo: predominan GHK, canales de fuga y gradientes mantenidos por bombas." ];
}
