export const REGISTRO_ECUACIONES_NEURO = [
  {
    id: "nernst",
    nombre: "Potencial de equilibrio de Nernst",
    categoria: "membrana",
    formulaTexto: "Eion = (RT / zF) ln([ion]o / [ion]i)",
    descripcion: "Calcula el potencial de equilibrio de un ion segun concentraciones, valencia y temperatura.",
    variables: ["R", "T", "z", "F", "extra", "intra"],
    calcular: ({ estado, ion = "k" }) => estado.equilibrio?.[ion] ? NaN,
    sustitucion: ({ estado, ion = "k" }) => {
      const c = estado.membrana.concentraciones[ion];
      const e = estado.equilibrio[ion];
      return `E${ion.toUpperCase()} = (RT / zF) ln(${c.extra} / ${c.intra}) = ${formato(e)} mV`;
    },
    interpretar: ({ estado, ion = "k" }) => `El gradiente de ${ion.toUpperCase()} empuja el Vm hacia ${formato(estado.equilibrio[ion])} mV.`
  },
  {
    id: "ghk",
    nombre: "Goldman-Hodgkin-Katz reducido",
    categoria: "membrana",
    formulaTexto: "Vm = (RT/F) ln((PK[K]o + PNa[Na]o + PCl[Cl]i) / (PK[K]i + PNa[Na]i + PCl[Cl]o)) + offset bomba",
    descripcion: "Estimacion educativa del potencial de membrana ponderando permeabilidades. Para Cl- se invierten concentraciones por ser anion.",
    variables: ["PK", "PNa", "PCl", "K", "Na", "Cl", "T"],
    calcular: ({ estado }) => estado.vmReposo,
    sustitucion: ({ estado }) => `Vm_GHK = ${formato(estado.vmReposo)} mV con PNa=${formato(estado.membrana.permeabilidades.na, 3)}, PK=${formato(estado.membrana.permeabilidades.k, 3)}, PCl=${formato(estado.membrana.permeabilidades.cl, 3)}`,
    interpretar: ({ estado }) => `El Vm de reposo integrado se mantiene alrededor de ${formato(estado.vmReposo)} mV antes del estimulo.`
  },
  {
    id: "hh_membrana",
    nombre: "Ecuacion de membrana HH reducida",
    categoria: "potencial de accion",
    formulaTexto: "dVm/dt = (Iext - INa - IK - IL) / Cm",
    descripcion: "Es la misma relacion usada por actionPotentialModel.js para actualizar Vm en el potencial de accion.",
    variables: ["Iext", "INa", "IK", "IL", "Cm"],
    calcular: ({ estado }) => estado.dVmDt,
    sustitucion: ({ estado }) => `dVm/dt = (${formato(estado.Iext)} - ${formato(estado.INa)} - ${formato(estado.IK)} - ${formato(estado.IL)}) / ${formato(estado.Cm)} = ${formato(estado.dVmDt)} mV/ms`,
    interpretar: ({ estado }) => estado.dVmDt > 0 ? "La suma de corrientes favorece despolarizacion." : "La suma de corrientes favorece repolarizacion o reposo."
  },
  {
    id: "corriente_na",
    nombre: "Corriente de sodio HH",
    categoria: "canales",
    formulaTexto: "INa = gNa * m^3 * h * (Vm - ENa)",
    descripcion: "Corriente de Na+ dependiente de activacion m e inactivacion h.",
    variables: ["gNa", "m", "h", "Vm", "ENa"],
    calcular: ({ estado }) => estado.INa,
    sustitucion: ({ estado }) => `INa = ${formato(estado.gNa)} * ${formato(estado.m, 3)}^3 * ${formato(estado.h, 3)} * (${formato(estado.Vm)} - ${formato(estado.ENa)}) = ${formato(estado.INa)} uA/cm2`,
    interpretar: ({ estado }) => estado.INa < 0 ? "Corriente entrante de Na+ asociada a despolarizacion." : "La fuerza impulsora de Na+ es baja o saliente en este instante."
  },
  {
    id: "corriente_k",
    nombre: "Corriente de potasio HH",
    categoria: "canales",
    formulaTexto: "IK = gK * n^4 * (Vm - EK)",
    descripcion: "Corriente de K+ dependiente de activacion lenta n.",
    variables: ["gK", "n", "Vm", "EK"],
    calcular: ({ estado }) => estado.IK,
    sustitucion: ({ estado }) => `IK = ${formato(estado.gK)} * ${formato(estado.n, 3)}^4 * (${formato(estado.Vm)} - ${formato(estado.EK)}) = ${formato(estado.IK)} uA/cm2`,
    interpretar: ({ estado }) => estado.IK > 0 ? "Corriente saliente de K+ que contribuye a repolarizacion." : "El K+ no domina la repolarizacion en este instante."
  },
  {
    id: "velocidad_conduccion",
    nombre: "Velocidad de conduccion educativa",
    categoria: "axon",
    formulaTexto: "v = 0.35 * factorMielina * sqrt(diametro) * factorTemperatura * factorBloqueo * factorDesmielina / (resistenciaAxial * capacitancia)",
    descripcion: "Aproximacion empirica usada por axonPropagationModel.js, no una prediccion clinica.",
    variables: ["mielina", "diametro", "temperatura", "bloqueo", "desmielinizacion"],
    calcular: ({ estado }) => estado.velocidadMms,
    sustitucion: ({ estado }) => `v = ${formato(estado.velocidadMms, 3)} mm/ms con diametro=${formato(estado.axon.diametroUm, 2)} um, mielina=${estado.axon.mielina ? "si" : "no"}`,
    interpretar: ({ estado }) => estado.axon.mielina ? "La mielina aumenta la velocidad al reducir capacitancia efectiva." : "La conduccion continua es mas lenta que la saltatoria."
  },
  {
    id: "liberacion_vesicular",
    nombre: "Probabilidad de liberacion dependiente de Ca2+",
    categoria: "sinapsis",
    formulaTexto: "Prelease = basal * Ca^n / (Kd^n + Ca^n)",
    descripcion: "Modelo educativo de Hill para representar cooperatividad del Ca2+ presinaptico.",
    variables: ["Ca", "Kd", "n", "basal"],
    calcular: ({ estado }) => estado.sinapsis.probabilidadLiberacion,
    sustitucion: ({ estado }) => `Prelease = ${formato(estado.sinapsis.basalLiberacion, 2)} * ${formato(estado.sinapsis.caLocal, 3)}^4 / (${formato(estado.sinapsis.kdCa, 2)}^4 + ${formato(estado.sinapsis.caLocal, 3)}^4) = ${formato(estado.sinapsis.probabilidadLiberacion, 3)}`,
    interpretar: ({ estado }) => `La entrada local de Ca2+ produce liberacion esperada de ${formato(estado.sinapsis.vesiculasLiberadas, 2)} vesiculas.`
  },
  {
    id: "ocupacion_receptores",
    nombre: "Cinetica de receptores postsinapticos",
    categoria: "sinapsis",
    formulaTexto: "dB/dt = kon * [NT] * (1 - B) - koff * B",
    descripcion: "Ocupacion simplificada de receptores por neurotransmisor.",
    variables: ["kon", "NT", "B", "koff"],
    calcular: ({ estado }) => estado.sinapsis.dOcupacion,
    sustitucion: ({ estado }) => `dB/dt = ${formato(estado.sinapsis.kon, 2)} * ${formato(estado.sinapsis.nt, 3)} * (1 - ${formato(estado.sinapsis.ocupacion, 3)}) - ${formato(estado.sinapsis.koff, 2)} * ${formato(estado.sinapsis.ocupacion, 3)} = ${formato(estado.sinapsis.dOcupacion, 3)}`,
    interpretar: ({ estado }) => `Ocupacion actual: ${formato(estado.sinapsis.ocupacion * 100, 1)}%.`
  },
  {
    id: "recaptura_degradacion",
    nombre: "Recaptura y degradacion de neurotransmisor",
    categoria: "sinapsis",
    formulaTexto: "d[NT]/dt = liberacion - Vmax*[NT]/(Km+[NT]) - degradacion*[NT] - difusion*[NT]",
    descripcion: "Balance simplificado entre liberacion, recaptura saturable, degradacion y difusion.",
    variables: ["liberacion", "Vmax", "Km", "degradacion", "difusion"],
    calcular: ({ estado }) => estado.sinapsis.dNt,
    sustitucion: ({ estado }) => `dNT/dt = ${formato(estado.sinapsis.liberacionNt, 3)} - ${formato(estado.sinapsis.recapturaActual, 3)} - ${formato(estado.sinapsis.degradacionActual, 3)} - ${formato(estado.sinapsis.difusionActual, 3)} = ${formato(estado.sinapsis.dNt, 3)}`,
    interpretar: ({ estado }) => estado.sinapsis.dNt > 0 ? "La concentracion sinaptica aumenta transitoriamente." : "Recaptura, degradacion y difusion reducen el neurotransmisor."
  },
  {
    id: "farmacos",
    nombre: "Modificacion farmacologica efectiva",
    categoria: "farmacologia",
    formulaTexto: "parametroEfectivo = parametroBase * (1 - bloqueo) * moduladores",
    descripcion: "Representacion educativa de como los farmacos activos modifican parametros del mismo modelo.",
    variables: ["bloqueoNa", "bloqueoK", "bloqueoCa", "gaba", "liberacion"],
    calcular: ({ estado }) => estado.farmacos.efectos.bloqueoNa + estado.farmacos.efectos.bloqueoK + estado.farmacos.efectos.bloqueoCa,
    sustitucion: ({ estado }) => `gNa efectiva=${formato(estado.gNa)}; gK efectiva=${formato(estado.gK)}; gCa presinaptica=${formato(1 - estado.farmacos.efectos.bloqueoCa, 2)}x; GABA=${formato(1 + estado.farmacos.efectos.gaba, 2)}x`,
    interpretar: ({ estado }) => estado.farmacos.activos.length ? `Farmacos activos: ${estado.farmacos.activos.map((f) => f.nombre).join(", ")}.` : "Sin farmacos activos."
  }
];

export function obtenerEcuacion(id) {
  return REGISTRO_ECUACIONES_NEURO.find((eq) => eq.id === id) || REGISTRO_ECUACIONES_NEURO[0];
}

export function formato(valor, decimales = 2) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "--";
  return numero.toFixed(decimales).replace(/\.00$/, "");
}

export function evaluarEcuacion(id, estado, contexto = {}) {
  const ecuacion = obtenerEcuacion(id);
  const args = { estado, ...contexto };
  return {
    id: ecuacion.id,
    nombre: ecuacion.nombre,
    categoria: ecuacion.categoria,
    formulaTexto: ecuacion.formulaTexto,
    descripcion: ecuacion.descripcion,
    resultado: ecuacion.calcular(args),
    sustitucion: ecuacion.sustitucion(args),
    interpretacion: ecuacion.interpretar(args)
  };
}
