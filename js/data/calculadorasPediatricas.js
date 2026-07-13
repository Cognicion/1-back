export const CATEGORIAS_CALCULADORAS_PEDIATRICAS = [
  { id: "crecimiento", nombre: "Crecimiento y nutricion" },
  { id: "liquidos", nombre: "Liquidos y electrolitos" },
  { id: "urgencias", nombre: "Urgencias pediatricas" },
  { id: "neonatos", nombre: "Neonatologia" },
  { id: "renal", nombre: "Renal y metabolismo" },
  { id: "respiratorio", nombre: "Respiratorio" },
  { id: "cardio", nombre: "Cardiologia" },
  { id: "escalas", nombre: "Escalas clinicas" }
];

export function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function redondear(valor, decimales = 2) {
  const n = numero(valor);
  if (n === null) return null;
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const abs = Math.abs(x);
  const t = 1 / (1 + p * abs);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
  return sign * y;
}

export function percentilDesdeZ(z) {
  const n = numero(z);
  if (n === null) return null;
  return clamp(0.5 * (1 + erf(n / Math.SQRT2)) * 100, 0.01, 99.99);
}

export function zDesdeLMS(valor, l, m, s) {
  const x = numero(valor);
  const L = numero(l);
  const M = numero(m);
  const S = numero(s);
  if ([x, L, M, S].some((item) => item === null) || x <= 0 || M <= 0 || S <= 0) return null;
  if (Math.abs(L) < 0.0001) return Math.log(x / M) / S;
  return ((x / M) ** L - 1) / (L * S);
}

function imc({ peso, tallaCm }) {
  const p = numero(peso);
  const t = numero(tallaCm);
  if (!p || !t) return null;
  const m = t > 3 ? t / 100 : t;
  return p / (m * m);
}

function superficieCorporal({ peso, tallaCm }) {
  const p = numero(peso);
  const t = numero(tallaCm);
  if (!p || !t) return null;
  return Math.sqrt((p * t) / 3600);
}

function hollidaySegar({ peso }) {
  const p = numero(peso);
  if (!p) return null;
  let mlDia = 0;
  if (p <= 10) mlDia = p * 100;
  else if (p <= 20) mlDia = 1000 + (p - 10) * 50;
  else mlDia = 1500 + (p - 20) * 20;
  return { mlDia, mlHora: mlDia / 24 };
}

function regla421({ peso }) {
  const p = numero(peso);
  if (!p) return null;
  if (p <= 10) return p * 4;
  if (p <= 20) return 40 + (p - 10) * 2;
  return 60 + (p - 20);
}

function deficitLiquidos({ peso, deshidratacion }) {
  const p = numero(peso);
  const d = numero(deshidratacion);
  if (!p || d === null) return null;
  return p * d * 10;
}

function sodioCorregido({ sodio, glucosa }) {
  const na = numero(sodio);
  const glu = numero(glucosa);
  if (na === null || glu === null) return null;
  return na + 1.6 * ((glu - 100) / 100);
}

function anionGap({ sodio, cloro, bicarbonato }) {
  const na = numero(sodio);
  const cl = numero(cloro);
  const hco3 = numero(bicarbonato);
  if ([na, cl, hco3].some((item) => item === null)) return null;
  return na - (cl + hco3);
}

function osmolaridad({ sodio, glucosa, bun }) {
  const na = numero(sodio);
  const glu = numero(glucosa);
  const b = numero(bun);
  if ([na, glu, b].some((item) => item === null)) return null;
  return 2 * na + glu / 18 + b / 2.8;
}

function egfrSchwartz({ tallaCm, creatinina, k = 0.413 }) {
  const t = numero(tallaCm);
  const cr = numero(creatinina);
  const constante = numero(k) ?? 0.413;
  if (!t || !cr) return null;
  return (constante * t) / cr;
}

function fena({ naU, naP, crU, crP }) {
  const nu = numero(naU);
  const np = numero(naP);
  const cu = numero(crU);
  const cp = numero(crP);
  if ([nu, np, cu, cp].some((item) => item === null) || np === 0 || cu === 0) return null;
  return (nu * cp) / (np * cu) * 100;
}

function aguaLibre({ peso, sodioActual, sodioMeta = 145 }) {
  const p = numero(peso);
  const na = numero(sodioActual);
  const meta = numero(sodioMeta) || 145;
  if (!p || !na || !meta) return null;
  return 0.6 * p * ((na / meta) - 1);
}

function tuboEndotraqueal({ edadAnos }) {
  const edad = numero(edadAnos);
  if (edad === null) return null;
  const cuffed = edad < 1 ? 3.5 : 3.5 + edad / 4;
  const uncuffed = edad < 1 ? 4 : 4 + edad / 4;
  return { cuffed, uncuffed, profundidadCm: edad < 1 ? 10 : 12 + edad / 2 };
}

function dosisAdrenalinaParo({ peso }) {
  const p = numero(peso);
  if (!p) return null;
  return { mg: p * 0.01, mlDe1mg10ml: p * 0.1 };
}

function boloCristaloide({ peso, mlKg = 20 }) {
  const p = numero(peso);
  const ml = numero(mlKg) || 20;
  if (!p) return null;
  return p * ml;
}

function gir({ glucosaPorcentaje, velocidadMlHora, peso }) {
  const g = numero(glucosaPorcentaje);
  const v = numero(velocidadMlHora);
  const p = numero(peso);
  if (!g || !v || !p) return null;
  return (g * v) / (6 * p);
}

function apgar({ color, frecuencia, reflejos, tono, respiracion }) {
  const valores = [color, frecuencia, reflejos, tono, respiracion].map(numero);
  if (valores.some((item) => item === null)) return null;
  return valores.reduce((a, b) => a + b, 0);
}

function qtCorregido({ qtMs, rrSeg }) {
  const qt = numero(qtMs);
  const rr = numero(rrSeg);
  if (!qt || !rr) return null;
  return { bazett: qt / Math.sqrt(rr), fridericia: qt / Math.cbrt(rr) };
}

function presionMedia({ sistolica, diastolica }) {
  const s = numero(sistolica);
  const d = numero(diastolica);
  if (s === null || d === null) return null;
  return d + (s - d) / 3;
}

function pafio({ pao2, fio2 }) {
  const pa = numero(pao2);
  const fi = numero(fio2);
  if (!pa || !fi) return null;
  return pa / (fi > 1 ? fi / 100 : fi);
}

function indiceOxigenacion({ fio2, presionMediaViaAerea, pao2 }) {
  const fi = numero(fio2);
  const paw = numero(presionMediaViaAerea);
  const pa = numero(pao2);
  if (!fi || !paw || !pa) return null;
  const fraccion = fi > 1 ? fi / 100 : fi;
  return (fraccion * paw * 100) / pa;
}

function aaGradiente({ fio2, paco2, pao2, presionBarometrica = 760, vaporAgua = 47, cocienteRespiratorio = 0.8 }) {
  const fi = numero(fio2);
  const co2 = numero(paco2);
  const o2 = numero(pao2);
  const pb = numero(presionBarometrica) || 760;
  const vh2o = numero(vaporAgua) || 47;
  const rq = numero(cocienteRespiratorio) || 0.8;
  if (!fi || !co2 || !o2) return null;
  const fraccion = fi > 1 ? fi / 100 : fi;
  const pAO2 = fraccion * (pb - vh2o) - co2 / rq;
  return { pAO2, gradiente: pAO2 - o2 };
}

function peldSimplificado({ bilirrubina, inr, albumina, edadMeses, retrasoCrecimiento }) {
  const bili = numero(bilirrubina);
  const i = numero(inr);
  const alb = numero(albumina);
  const meses = numero(edadMeses);
  const fallo = numero(retrasoCrecimiento) || 0;
  if (!bili || !i || !alb || meses === null) return null;
  const edadFactor = meses < 12 ? 1 : 0;
  return 0.480 * Math.log(bili) + 1.857 * Math.log(i) - 0.687 * Math.log(alb) + 0.436 * edadFactor + 0.667 * fallo;
}

function lmsCalculator({ valor, l, m, s }) {
  const z = zDesdeLMS(valor, l, m, s);
  if (z === null) return null;
  return { z, percentil: percentilDesdeZ(z) };
}

export const CALCULADORAS_PEDIATRICAS = [
  {
    id: "imc_pediatrico",
    categoria: "crecimiento",
    nombre: "IMC pediatrico",
    descripcion: "Calcula IMC a partir de peso y talla. La interpretacion pediatrica requiere edad, sexo y percentiles oficiales.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "tallaCm", label: "Talla", unidad: "cm" }
    ],
    calcular: (v) => ({ imc: imc(v) }),
    interpretar: (r) => r?.imc ? `IMC ${redondear(r.imc, 2)} kg/m2. Interpretar con tablas por edad y sexo.` : "Completa peso y talla."
  },
  {
    id: "superficie_corporal",
    categoria: "crecimiento",
    nombre: "Superficie corporal Mosteller",
    descripcion: "Apoyo para dosificacion por m2 y evaluacion nutricional.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "tallaCm", label: "Talla", unidad: "cm" }
    ],
    calcular: (v) => ({ sc: superficieCorporal(v) }),
    interpretar: (r) => r?.sc ? `SC ${redondear(r.sc, 2)} m2.` : "Completa peso y talla."
  },
  {
    id: "percentil_lms",
    categoria: "crecimiento",
    nombre: "Percentil y z-score LMS",
    descripcion: "Calcula z-score y percentil con parametros L, M y S oficiales del indicador elegido.",
    grafica: "percentil",
    inputs: [
      { id: "valor", label: "Valor observado" },
      { id: "l", label: "L" },
      { id: "m", label: "M" },
      { id: "s", label: "S" }
    ],
    calcular: lmsCalculator,
    interpretar: (r) => r ? `Z ${redondear(r.z, 2)}. Percentil aproximado ${redondear(r.percentil, 1)}.` : "Ingresa valor y parametros LMS oficiales."
  },
  {
    id: "peso_ideal_imc",
    categoria: "crecimiento",
    nombre: "Peso para IMC objetivo",
    descripcion: "Calcula el peso esperado para una talla e IMC objetivo.",
    inputs: [
      { id: "tallaCm", label: "Talla", unidad: "cm" },
      { id: "imcObjetivo", label: "IMC objetivo" }
    ],
    calcular: ({ tallaCm, imcObjetivo }) => {
      const t = numero(tallaCm);
      const imcObj = numero(imcObjetivo);
      if (!t || !imcObj) return null;
      const m = t > 3 ? t / 100 : t;
      return { pesoObjetivo: imcObj * m * m };
    },
    interpretar: (r) => r ? `Peso correspondiente: ${redondear(r.pesoObjetivo, 2)} kg.` : "Completa talla e IMC objetivo."
  },
  {
    id: "requerimiento_energetico",
    categoria: "crecimiento",
    nombre: "Requerimiento energetico rapido",
    descripcion: "Estimacion educativa por kcal/kg/dia segun objetivo clinico.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "kcalKgDia", label: "Objetivo", unidad: "kcal/kg/dia", default: 80 }
    ],
    calcular: ({ peso, kcalKgDia }) => {
      const p = numero(peso);
      const k = numero(kcalKgDia);
      if (!p || !k) return null;
      return { kcalDia: p * k };
    },
    interpretar: (r) => r ? `Aporte estimado: ${redondear(r.kcalDia, 0)} kcal/dia.` : "Completa peso y objetivo kcal/kg/dia."
  },
  {
    id: "holliday_segar",
    categoria: "liquidos",
    nombre: "Liquidos de mantenimiento Holliday-Segar",
    descripcion: "Calcula mantenimiento diario y horario por peso.",
    inputs: [{ id: "peso", label: "Peso", unidad: "kg" }],
    calcular: (v) => hollidaySegar(v),
    interpretar: (r) => r ? `${redondear(r.mlDia, 0)} mL/dia; ${redondear(r.mlHora, 1)} mL/h.` : "Ingresa peso."
  },
  {
    id: "regla_421",
    categoria: "liquidos",
    nombre: "Regla 4-2-1",
    descripcion: "Calcula mL/h de mantenimiento por regla 4-2-1.",
    inputs: [{ id: "peso", label: "Peso", unidad: "kg" }],
    calcular: (v) => ({ mlHora: regla421(v) }),
    interpretar: (r) => r?.mlHora ? `${redondear(r.mlHora, 1)} mL/h.` : "Ingresa peso."
  },
  {
    id: "deficit_deshidratacion",
    categoria: "liquidos",
    nombre: "Deficit por deshidratacion",
    descripcion: "Estimacion de deficit en mL con porcentaje clinico de deshidratacion.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "deshidratacion", label: "Deshidratacion", unidad: "%", default: 5 }
    ],
    calcular: (v) => ({ deficitMl: deficitLiquidos(v) }),
    interpretar: (r) => r?.deficitMl ? `Deficit estimado ${redondear(r.deficitMl, 0)} mL.` : "Completa peso y porcentaje."
  },
  {
    id: "sodio_corregido",
    categoria: "liquidos",
    nombre: "Sodio corregido por glucosa",
    descripcion: "Corrige sodio en hiperglucemia usando factor clasico 1.6 mEq/L por cada 100 mg/dL.",
    inputs: [
      { id: "sodio", label: "Na medido", unidad: "mEq/L" },
      { id: "glucosa", label: "Glucosa", unidad: "mg/dL" }
    ],
    calcular: (v) => ({ sodioCorregido: sodioCorregido(v) }),
    interpretar: (r) => r?.sodioCorregido ? `Na corregido ${redondear(r.sodioCorregido, 1)} mEq/L.` : "Completa sodio y glucosa."
  },
  {
    id: "anion_gap",
    categoria: "liquidos",
    nombre: "Anion gap",
    descripcion: "Calcula Na - (Cl + HCO3).",
    inputs: [
      { id: "sodio", label: "Na", unidad: "mEq/L" },
      { id: "cloro", label: "Cl", unidad: "mEq/L" },
      { id: "bicarbonato", label: "HCO3", unidad: "mEq/L" }
    ],
    calcular: (v) => ({ anionGap: anionGap(v) }),
    interpretar: (r) => r?.anionGap !== undefined ? `Anion gap ${redondear(r.anionGap, 1)} mEq/L.` : "Completa electrolitos."
  },
  {
    id: "osmolaridad",
    categoria: "liquidos",
    nombre: "Osmolaridad calculada",
    descripcion: "Formula: 2Na + glucosa/18 + BUN/2.8.",
    inputs: [
      { id: "sodio", label: "Na", unidad: "mEq/L" },
      { id: "glucosa", label: "Glucosa", unidad: "mg/dL" },
      { id: "bun", label: "BUN", unidad: "mg/dL" }
    ],
    calcular: (v) => ({ osm: osmolaridad(v) }),
    interpretar: (r) => r?.osm ? `Osmolaridad calculada ${redondear(r.osm, 1)} mOsm/kg.` : "Completa Na, glucosa y BUN."
  },
  {
    id: "agua_libre",
    categoria: "liquidos",
    nombre: "Deficit de agua libre",
    descripcion: "Estimacion para hipernatremia. Requiere correccion lenta y juicio clinico.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "sodioActual", label: "Na actual", unidad: "mEq/L" },
      { id: "sodioMeta", label: "Na meta", unidad: "mEq/L", default: 145 }
    ],
    calcular: (v) => ({ litros: aguaLibre(v) }),
    interpretar: (r) => r?.litros !== null && r?.litros !== undefined ? `Deficit aproximado ${redondear(r.litros, 2)} L.` : "Completa peso y sodio."
  },
  {
    id: "egfr_schwartz",
    categoria: "renal",
    nombre: "eGFR Schwartz bedside",
    descripcion: "Estimacion de filtrado glomerular pediatrico: k x talla / creatinina.",
    inputs: [
      { id: "tallaCm", label: "Talla", unidad: "cm" },
      { id: "creatinina", label: "Creatinina", unidad: "mg/dL" },
      { id: "k", label: "Constante k", default: 0.413 }
    ],
    calcular: (v) => ({ egfr: egfrSchwartz(v) }),
    interpretar: (r) => r?.egfr ? `eGFR ${redondear(r.egfr, 1)} mL/min/1.73m2.` : "Completa talla y creatinina."
  },
  {
    id: "fena",
    categoria: "renal",
    nombre: "Fraccion excretada de sodio",
    descripcion: "FE Na = (NaU x CrP)/(NaP x CrU) x 100.",
    inputs: [
      { id: "naU", label: "Na urinario" },
      { id: "naP", label: "Na plasmatico" },
      { id: "crU", label: "Creatinina urinaria" },
      { id: "crP", label: "Creatinina plasmatica" }
    ],
    calcular: (v) => ({ fena: fena(v) }),
    interpretar: (r) => r?.fena !== null && r?.fena !== undefined ? `FE Na ${redondear(r.fena, 2)}%.` : "Completa parametros urinarios y plasmaticos."
  },
  {
    id: "tubo_endotraqueal",
    categoria: "urgencias",
    nombre: "Tubo endotraqueal y profundidad",
    descripcion: "Estimacion por edad. No sustituye confirmacion clinica, capnografia e imagen cuando aplique.",
    inputs: [{ id: "edadAnos", label: "Edad", unidad: "anos" }],
    calcular: tuboEndotraqueal,
    interpretar: (r) => r ? `Con cuff: ${redondear(r.cuffed, 1)} mm. Sin cuff: ${redondear(r.uncuffed, 1)} mm. Profundidad aprox.: ${redondear(r.profundidadCm, 1)} cm.` : "Completa edad."
  },
  {
    id: "adrenalina_paro",
    categoria: "urgencias",
    nombre: "Adrenalina en paro",
    descripcion: "Dosis educativa 0.01 mg/kg IV/IO de solucion 0.1 mg/mL.",
    inputs: [{ id: "peso", label: "Peso", unidad: "kg" }],
    calcular: dosisAdrenalinaParo,
    interpretar: (r) => r ? `${redondear(r.mg, 2)} mg = ${redondear(r.mlDe1mg10ml, 2)} mL de solucion 0.1 mg/mL.` : "Ingresa peso."
  },
  {
    id: "bolo_cristaloide",
    categoria: "urgencias",
    nombre: "Bolo de cristaloide",
    descripcion: "Calcula volumen por mL/kg.",
    inputs: [
      { id: "peso", label: "Peso", unidad: "kg" },
      { id: "mlKg", label: "mL/kg", default: 20 }
    ],
    calcular: (v) => ({ volumenMl: boloCristaloide(v) }),
    interpretar: (r) => r?.volumenMl ? `Volumen ${redondear(r.volumenMl, 0)} mL.` : "Completa peso y mL/kg."
  },
  {
    id: "gir",
    categoria: "neonatos",
    nombre: "Glucose infusion rate (GIR)",
    descripcion: "Calcula mg/kg/min a partir de dextrosa %, velocidad y peso.",
    inputs: [
      { id: "glucosaPorcentaje", label: "Dextrosa", unidad: "%", default: 10 },
      { id: "velocidadMlHora", label: "Velocidad", unidad: "mL/h" },
      { id: "peso", label: "Peso", unidad: "kg" }
    ],
    calcular: (v) => ({ gir: gir(v) }),
    interpretar: (r) => r?.gir ? `GIR ${redondear(r.gir, 2)} mg/kg/min.` : "Completa dextrosa, velocidad y peso."
  },
  {
    id: "apgar",
    categoria: "neonatos",
    nombre: "Apgar",
    descripcion: "Suma de cinco dominios, cada uno de 0 a 2.",
    inputs: [
      { id: "color", label: "Color", tipo: "select", opciones: [0, 1, 2] },
      { id: "frecuencia", label: "Frecuencia cardiaca", tipo: "select", opciones: [0, 1, 2] },
      { id: "reflejos", label: "Irritabilidad refleja", tipo: "select", opciones: [0, 1, 2] },
      { id: "tono", label: "Tono muscular", tipo: "select", opciones: [0, 1, 2] },
      { id: "respiracion", label: "Respiracion", tipo: "select", opciones: [0, 1, 2] }
    ],
    calcular: (v) => ({ apgar: apgar(v) }),
    interpretar: (r) => r?.apgar !== null && r?.apgar !== undefined ? `Apgar total ${r.apgar}/10.` : "Completa los cinco dominios."
  },
  {
    id: "qt_corregido",
    categoria: "cardio",
    nombre: "QT corregido",
    descripcion: "Calcula QTc por Bazett y Fridericia.",
    inputs: [
      { id: "qtMs", label: "QT", unidad: "ms" },
      { id: "rrSeg", label: "RR", unidad: "seg" }
    ],
    calcular: qtCorregido,
    interpretar: (r) => r ? `QTc Bazett ${redondear(r.bazett, 0)} ms. QTc Fridericia ${redondear(r.fridericia, 0)} ms.` : "Completa QT y RR."
  },
  {
    id: "pam",
    categoria: "cardio",
    nombre: "Presion arterial media",
    descripcion: "PAM = diastolica + 1/3 de presion de pulso.",
    inputs: [
      { id: "sistolica", label: "Sistolica", unidad: "mmHg" },
      { id: "diastolica", label: "Diastolica", unidad: "mmHg" }
    ],
    calcular: (v) => ({ pam: presionMedia(v) }),
    interpretar: (r) => r?.pam ? `PAM ${redondear(r.pam, 1)} mmHg.` : "Completa presiones."
  },
  {
    id: "pafio",
    categoria: "respiratorio",
    nombre: "Relacion PaO2/FiO2",
    descripcion: "Calcula P/F. FiO2 puede ingresarse como 0.21 o 21.",
    inputs: [
      { id: "pao2", label: "PaO2", unidad: "mmHg" },
      { id: "fio2", label: "FiO2", default: 21 }
    ],
    calcular: (v) => ({ pf: pafio(v) }),
    interpretar: (r) => r?.pf ? `P/F ${redondear(r.pf, 0)}.` : "Completa PaO2 y FiO2."
  },
  {
    id: "indice_oxigenacion",
    categoria: "respiratorio",
    nombre: "Indice de oxigenacion",
    descripcion: "OI = FiO2 x Paw x 100 / PaO2.",
    inputs: [
      { id: "fio2", label: "FiO2", default: 21 },
      { id: "presionMediaViaAerea", label: "Paw media", unidad: "cmH2O" },
      { id: "pao2", label: "PaO2", unidad: "mmHg" }
    ],
    calcular: (v) => ({ oi: indiceOxigenacion(v) }),
    interpretar: (r) => r?.oi ? `Indice de oxigenacion ${redondear(r.oi, 2)}.` : "Completa FiO2, Paw y PaO2."
  },
  {
    id: "aa_gradiente",
    categoria: "respiratorio",
    nombre: "Gradiente alveolo-arterial",
    descripcion: "Ecuacion alveolar simplificada para O2.",
    inputs: [
      { id: "fio2", label: "FiO2", default: 21 },
      { id: "paco2", label: "PaCO2", unidad: "mmHg" },
      { id: "pao2", label: "PaO2", unidad: "mmHg" },
      { id: "presionBarometrica", label: "Presion barometrica", default: 760 }
    ],
    calcular: aaGradiente,
    interpretar: (r) => r ? `PAO2 ${redondear(r.pAO2, 1)} mmHg. Gradiente A-a ${redondear(r.gradiente, 1)} mmHg.` : "Completa gases y FiO2."
  },
  {
    id: "peld_simplificado",
    categoria: "escalas",
    nombre: "PELD educativo simplificado",
    descripcion: "Calcula componentes principales de PELD como apoyo educativo; validar con calculadora oficial para decisiones clinicas.",
    inputs: [
      { id: "bilirrubina", label: "Bilirrubina", unidad: "mg/dL" },
      { id: "inr", label: "INR" },
      { id: "albumina", label: "Albumina", unidad: "g/dL" },
      { id: "edadMeses", label: "Edad", unidad: "meses" },
      { id: "retrasoCrecimiento", label: "Retraso crecimiento 0/1", default: 0 }
    ],
    calcular: (v) => ({ peld: peldSimplificado(v) }),
    interpretar: (r) => r?.peld !== null && r?.peld !== undefined ? `Puntaje educativo ${redondear(r.peld, 3)} antes de escalamiento oficial.` : "Completa los campos."
  }
];
