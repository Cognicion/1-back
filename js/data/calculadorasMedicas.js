const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const n = (inputs, key) => {
  const value = Number(inputs[key]);
  return Number.isFinite(value) ? value : null;
};

const yes = (inputs, key) => Boolean(inputs[key]);

const required = (inputs, keys) => keys.filter((key) => inputs[key] === "" || inputs[key] === null || inputs[key] === undefined);

const result = ({ value, unit = "", category = "", interpretation = "", details = {}, warnings = [], missingData = [] }) => ({
  value,
  unit,
  category,
  interpretation,
  details,
  warnings,
  missingData
});

const textInput = (id, label, unit = "", help = "", options = {}) => ({ id, label, unit, help, type: "text", ...options });
const numberInput = (id, label, unit = "", help = "", options = {}) => ({ id, label, unit, help, type: "number", step: "any", ...options });
const selectInput = (id, label, options, help = "") => ({ id, label, type: "select", options, help });
const checkInput = (id, label, points = 1, help = "") => ({ id, label, type: "checkbox", points, help });

const sexoOptions = [
  { value: "femenino", label: "Femenino" },
  { value: "masculino", label: "Masculino" }
];

const categorias = {
  antropometria: "Antropometría y signos vitales",
  renal: "Función renal",
  electrolitos: "Electrolitos y metabolismo",
  cardiovascular: "Cardiovascular",
  neumologia: "Neumología",
  urgencias: "Urgencias",
  critico: "Sepsis y cuidados críticos",
  gastro: "Gastroenterología y hepatología",
  infectologia: "Infectología"
};

const bibliography = {
  mosteller: [{ title: "Simplified calculation of body-surface area.", authors: "Mosteller RD", journal: "N Engl J Med", year: "1987" }],
  ckdEpi2021: [{ title: "New Creatinine- and Cystatin C-Based Equations to Estimate GFR without Race.", authors: "Inker LA et al.", journal: "N Engl J Med", year: "2021" }],
  cockcroft: [{ title: "Prediction of creatinine clearance from serum creatinine.", authors: "Cockcroft DW, Gault MH", journal: "Nephron", year: "1976" }],
  meld3: [{ title: "MELD 3.0: The Model for End-stage Liver Disease Updated for the Modern Era.", authors: "Kim WR et al.", journal: "Gastroenterology", year: "2021" }],
  light: [{ title: "Pleural effusions: the diagnostic separation of transudates and exudates.", authors: "Light RW et al.", journal: "Ann Intern Med", year: "1972" }]
};

function categoryCKD(value) {
  if (value >= 90) return "G1";
  if (value >= 60) return "G2";
  if (value >= 45) return "G3a";
  if (value >= 30) return "G3b";
  if (value >= 15) return "G4";
  return "G5";
}

function sofaPoints(value, ranges) {
  for (const range of ranges) {
    if (range.test(value)) return range.points;
  }
  return 0;
}

export const CATEGORIAS_CALCULADORAS_MEDICAS = Object.entries(categorias).map(([id, nombre]) => ({ id, nombre }));

export const CALCULADORAS_MEDICAS = [
  {
    id: "imc",
    name: "Índice de masa corporal",
    abbreviation: "IMC",
    category: "antropometria",
    type: "Fórmula",
    specialties: ["medicina-general", "medicina-interna", "nutrición"],
    aliases: ["bmi", "peso", "talla", "obesidad"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Clasifica el peso relativo a la talla en adultos.",
    patientFields: ["peso", "talla"],
    inputs: [
      numberInput("peso", "Peso", "kg", "Peso actual del paciente."),
      numberInput("talla", "Talla", "m", "Talla en metros. Ejemplo: 1.70.")
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["peso", "talla"]);
      if (missingData.length) return result({ value: null, missingData });
      const peso = n(inputs, "peso");
      const talla = n(inputs, "talla");
      if (peso <= 0 || talla <= 0) return result({ value: null, warnings: ["Peso y talla deben ser mayores a cero."] });
      const imc = peso / (talla ** 2);
      const category = imc < 18.5 ? "Bajo peso" : imc < 25 ? "Normopeso" : imc < 30 ? "Sobrepeso" : imc < 35 ? "Obesidad I" : imc < 40 ? "Obesidad II" : "Obesidad III";
      return result({ value: round(imc, 1), unit: "kg/m²", category, interpretation: "Debe interpretarse junto con composición corporal, edad, sexo y contexto clínico." });
    },
    bibliography: []
  },
  {
    id: "superficie-corporal",
    name: "Superficie corporal",
    abbreviation: "SC",
    category: "antropometria",
    type: "Fórmula",
    specialties: ["medicina-general", "medicina-interna", "oncología"],
    aliases: ["bsa", "mosteller", "superficie"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Calcula superficie corporal con fórmula de Mosteller.",
    patientFields: ["peso", "talla"],
    inputs: [
      numberInput("peso", "Peso", "kg", "Peso actual."),
      numberInput("tallaCm", "Talla", "cm", "Talla en centímetros.")
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["peso", "tallaCm"]);
      if (missingData.length) return result({ value: null, missingData });
      const bsa = Math.sqrt((n(inputs, "peso") * n(inputs, "tallaCm")) / 3600);
      return result({ value: round(bsa, 2), unit: "m²", category: "Mosteller", interpretation: "Útil para dosificación o normalización de variables cuando el protocolo lo especifique.", details: { formula: "SC = √((talla cm × peso kg) / 3600)" } });
    },
    bibliography: bibliography.mosteller
  },
  {
    id: "presion-arterial-media",
    name: "Presión arterial media",
    abbreviation: "PAM",
    category: "antropometria",
    type: "Fórmula",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["map", "pam", "presión"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Estima la presión de perfusión media.",
    inputs: [numberInput("pas", "Presión sistólica", "mmHg"), numberInput("pad", "Presión diastólica", "mmHg")],
    calculate(inputs) {
      const missingData = required(inputs, ["pas", "pad"]);
      if (missingData.length) return result({ value: null, missingData });
      const pam = (n(inputs, "pas") + 2 * n(inputs, "pad")) / 3;
      return result({ value: round(pam, 1), unit: "mmHg", category: pam < 65 ? "Baja" : "Sin categoría automática", interpretation: "La PAM debe contextualizarse según perfusión, comorbilidades y objetivos clínicos." });
    },
    bibliography: []
  },
  {
    id: "indice-choque",
    name: "Índice de choque",
    abbreviation: "SI",
    category: "antropometria",
    type: "Índice",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["shock index", "choque", "frecuencia cardiaca"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Relación frecuencia cardiaca / presión sistólica.",
    inputs: [numberInput("fc", "Frecuencia cardiaca", "lpm"), numberInput("pas", "Presión sistólica", "mmHg")],
    calculate(inputs) {
      const missingData = required(inputs, ["fc", "pas"]);
      if (missingData.length) return result({ value: null, missingData });
      const si = n(inputs, "fc") / n(inputs, "pas");
      const category = si >= 0.9 ? "Elevado" : "No elevado";
      return result({ value: round(si, 2), unit: "", category, interpretation: "Un valor elevado puede asociarse con inestabilidad hemodinámica, sin sustituir la valoración clínica." });
    },
    bibliography: []
  },
  {
    id: "ckd-epi-2021",
    name: "TFG estimada CKD-EPI 2021",
    abbreviation: "CKD-EPI 2021",
    category: "renal",
    type: "Fórmula",
    specialties: ["medicina-interna", "nefrología", "medicina-general"],
    aliases: ["egfr", "tfg", "riñón", "creatinina"],
    version: "2021-creatinina",
    status: "active",
    duration: "2 min",
    description: "Estima TFG sin coeficiente racial usando creatinina estandarizada.",
    inputs: [
      numberInput("creatinina", "Creatinina sérica", "mg/dL", "Requiere creatinina estandarizada."),
      numberInput("edad", "Edad", "años"),
      selectInput("sexo", "Sexo biológico", sexoOptions)
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["creatinina", "edad", "sexo"]);
      if (missingData.length) return result({ value: null, missingData });
      const scr = n(inputs, "creatinina");
      const edad = n(inputs, "edad");
      const femenino = inputs.sexo === "femenino";
      const k = femenino ? 0.7 : 0.9;
      const a = femenino ? -0.241 : -0.302;
      const egfr = 142 * (Math.min(scr / k, 1) ** a) * (Math.max(scr / k, 1) ** -1.2) * (0.9938 ** edad) * (femenino ? 1.012 : 1);
      const value = round(egfr, 1);
      return result({ value, unit: "mL/min/1.73 m²", category: categoryCKD(value), interpretation: "No diagnostica enfermedad renal crónica por sí sola; requiere persistencia y contexto clínico.", warnings: ["No usar coeficiente racial."] });
    },
    bibliography: bibliography.ckdEpi2021
  },
  {
    id: "cockcroft-gault",
    name: "Cockcroft-Gault",
    abbreviation: "CrCl",
    category: "renal",
    type: "Fórmula",
    specialties: ["medicina-interna", "nefrología", "farmacología"],
    aliases: ["depuración", "creatinina", "riñón", "dosis"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Estima depuración de creatinina en mL/min.",
    inputs: [
      numberInput("edad", "Edad", "años"),
      numberInput("peso", "Peso usado", "kg", "Seleccione explícitamente si es actual, ideal o ajustado."),
      selectInput("tipoPeso", "Tipo de peso", [{ value: "actual", label: "Actual" }, { value: "ideal", label: "Ideal" }, { value: "ajustado", label: "Ajustado" }]),
      numberInput("creatinina", "Creatinina sérica", "mg/dL"),
      selectInput("sexo", "Sexo biológico", sexoOptions)
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["edad", "peso", "creatinina", "sexo"]);
      if (missingData.length) return result({ value: null, missingData });
      let crcl = ((140 - n(inputs, "edad")) * n(inputs, "peso")) / (72 * n(inputs, "creatinina"));
      if (inputs.sexo === "femenino") crcl *= 0.85;
      return result({ value: round(crcl, 1), unit: "mL/min", category: `Peso ${inputs.tipoPeso || "no especificado"}`, interpretation: "No es intercambiable automáticamente con eGFR normalizado a 1.73 m².", details: { formula: "CrCl = ((140 - edad) × peso) / (72 × Cr), ×0.85 si femenino" } });
    },
    bibliography: bibliography.cockcroft
  },
  {
    id: "sodio-corregido",
    name: "Sodio corregido por hiperglucemia",
    abbreviation: "Na corregido",
    category: "electrolitos",
    type: "Fórmula",
    specialties: ["urgencias", "medicina-interna", "endocrinología"],
    aliases: ["sodio", "hiperglucemia", "glucosa", "diabetes"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Corrige sodio por glucosa elevada.",
    inputs: [
      numberInput("sodio", "Sodio medido", "mEq/L"),
      numberInput("glucosa", "Glucosa", "mg/dL"),
      selectInput("factor", "Factor de corrección", [{ value: "1.6", label: "1.6 mEq/L por cada 100 mg/dL" }, { value: "2.4", label: "2.4 mEq/L por cada 100 mg/dL" }])
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["sodio", "glucosa", "factor"]);
      if (missingData.length) return result({ value: null, missingData });
      const corrected = n(inputs, "sodio") + Number(inputs.factor) * ((n(inputs, "glucosa") - 100) / 100);
      return result({ value: round(corrected, 1), unit: "mEq/L", category: `Factor ${inputs.factor}`, interpretation: "Corrección de apoyo; debe verificarse con estado osmolar y contexto clínico." });
    },
    bibliography: []
  },
  {
    id: "calcio-corregido",
    name: "Calcio corregido por albúmina",
    abbreviation: "Ca corregido",
    category: "electrolitos",
    type: "Fórmula",
    specialties: ["medicina-interna", "urgencias"],
    aliases: ["calcio", "albúmina", "hipocalcemia"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Estima calcio total corregido por albúmina.",
    inputs: [numberInput("calcio", "Calcio total", "mg/dL"), numberInput("albumina", "Albúmina", "g/dL")],
    calculate(inputs) {
      const missingData = required(inputs, ["calcio", "albumina"]);
      if (missingData.length) return result({ value: null, missingData });
      const corrected = n(inputs, "calcio") + 0.8 * (4 - n(inputs, "albumina"));
      return result({ value: round(corrected, 2), unit: "mg/dL", category: "Corregido", interpretation: "Tiene limitaciones; considerar calcio ionizado cuando sea clínicamente relevante." });
    },
    bibliography: []
  },
  {
    id: "anion-gap",
    name: "Anión gap",
    abbreviation: "AG",
    category: "electrolitos",
    type: "Fórmula",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["anion gap", "ácido base", "bicarbonato"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Calcula brecha aniónica con opción de incluir potasio.",
    inputs: [
      numberInput("sodio", "Sodio", "mEq/L"),
      numberInput("cloro", "Cloro", "mEq/L"),
      numberInput("bicarbonato", "Bicarbonato", "mEq/L"),
      numberInput("potasio", "Potasio", "mEq/L", "Opcional si decide incluirlo.", { required: false }),
      checkInput("incluirPotasio", "Incluir potasio en la fórmula")
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["sodio", "cloro", "bicarbonato"]);
      if (missingData.length) return result({ value: null, missingData });
      const ag = n(inputs, "sodio") + (yes(inputs, "incluirPotasio") ? (n(inputs, "potasio") || 0) : 0) - (n(inputs, "cloro") + n(inputs, "bicarbonato"));
      return result({ value: round(ag, 1), unit: "mEq/L", category: ag > (yes(inputs, "incluirPotasio") ? 16 : 12) ? "Elevado" : "No elevado", interpretation: "Apoyo para evaluar trastornos ácido-base; interpretar con gasometría, albúmina y clínica." });
    },
    bibliography: []
  },
  {
    id: "osmolaridad-calculada",
    name: "Osmolaridad plasmática calculada",
    abbreviation: "Osm calc",
    category: "electrolitos",
    type: "Fórmula",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["osmolaridad", "brecha osmolar", "sodio", "glucosa", "bun"],
    version: "1.0.0",
    status: "active",
    duration: "1 min",
    description: "Calcula osmolaridad con Na, glucosa y BUN.",
    inputs: [numberInput("sodio", "Sodio", "mEq/L"), numberInput("glucosa", "Glucosa", "mg/dL"), numberInput("bun", "BUN", "mg/dL")],
    calculate(inputs) {
      const missingData = required(inputs, ["sodio", "glucosa", "bun"]);
      if (missingData.length) return result({ value: null, missingData });
      const osm = 2 * n(inputs, "sodio") + n(inputs, "glucosa") / 18 + n(inputs, "bun") / 2.8;
      return result({ value: round(osm, 1), unit: "mOsm/kg", category: "Calculada", interpretation: "Puede compararse con osmolaridad medida para estimar brecha osmolar." });
    },
    bibliography: []
  },
  {
    id: "qt-corregido",
    name: "QT corregido",
    abbreviation: "QTc",
    category: "cardiovascular",
    type: "Fórmula",
    specialties: ["cardiología", "urgencias", "psiquiatría"],
    aliases: ["qtc", "qt", "bazett", "fridericia", "framingham", "hodges"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Calcula QTc con Bazett, Fridericia, Framingham y Hodges.",
    inputs: [numberInput("qt", "QT medido", "ms"), numberInput("fc", "Frecuencia cardiaca", "lpm")],
    calculate(inputs) {
      const missingData = required(inputs, ["qt", "fc"]);
      if (missingData.length) return result({ value: null, missingData });
      const qt = n(inputs, "qt");
      const fc = n(inputs, "fc");
      const rr = 60 / fc;
      const bazett = qt / Math.sqrt(rr);
      const fridericia = qt / Math.cbrt(rr);
      const framingham = qt + 154 * (1 - rr);
      const hodges = qt + 1.75 * (fc - 60);
      return result({
        value: round(fridericia, 0),
        unit: "ms",
        category: "QTc Fridericia principal",
        interpretation: "Bazett puede sobre/subcorregir con frecuencias extremas; revise todos los métodos.",
        details: { Bazett: round(bazett, 0), Fridericia: round(fridericia, 0), Framingham: round(framingham, 0), Hodges: round(hodges, 0) }
      });
    },
    bibliography: []
  },
  {
    id: "cha2ds2-vasc",
    name: "CHA₂DS₂-VASc",
    abbreviation: "CHA₂DS₂-VASc",
    category: "cardiovascular",
    type: "Escala",
    specialties: ["cardiología", "medicina-interna"],
    aliases: ["fibrilación auricular", "ictus", "anticoagulación"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Estratificación de riesgo embólico en fibrilación auricular.",
    inputs: [
      checkInput("chf", "Insuficiencia cardiaca", 1),
      checkInput("hta", "Hipertensión", 1),
      checkInput("edad75", "Edad ≥75 años", 2),
      checkInput("dm", "Diabetes mellitus", 1),
      checkInput("stroke", "EVC/AIT/tromboembolismo previo", 2),
      checkInput("vascular", "Enfermedad vascular", 1),
      checkInput("edad65", "Edad 65-74 años", 1),
      checkInput("sexoF", "Sexo femenino", 1)
    ],
    calculate(inputs, calc) {
      const score = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? item.points : 0), 0);
      const category = score === 0 ? "Bajo" : score === 1 ? "Intermedio" : "Mayor";
      return result({ value: score, unit: "puntos", category, interpretation: "Apoya la estimación de riesgo; decisiones de anticoagulación requieren valoración individual." });
    },
    bibliography: []
  },
  {
    id: "has-bled",
    name: "HAS-BLED",
    abbreviation: "HAS-BLED",
    category: "cardiovascular",
    type: "Escala",
    specialties: ["cardiología", "medicina-interna"],
    aliases: ["sangrado", "anticoagulación", "fibrilación auricular"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Riesgo de sangrado en pacientes anticoagulados.",
    inputs: [
      checkInput("hta", "Hipertensión no controlada", 1),
      checkInput("renal", "Función renal anormal", 1),
      checkInput("hepatico", "Función hepática anormal", 1),
      checkInput("stroke", "EVC previo", 1),
      checkInput("bleeding", "Sangrado previo o predisposición", 1),
      checkInput("inr", "INR lábil", 1),
      checkInput("edad", "Edad >65 años", 1),
      checkInput("farmacos", "Fármacos que predisponen a sangrado", 1),
      checkInput("alcohol", "Alcohol", 1)
    ],
    calculate(inputs, calc) {
      const score = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? item.points : 0), 0);
      return result({ value: score, unit: "puntos", category: score >= 3 ? "Alto riesgo" : "Menor riesgo", interpretation: "Identifica factores modificables de sangrado; no debe usarse aisladamente para negar anticoagulación." });
    },
    bibliography: []
  },
  {
    id: "wells-tep",
    name: "Wells para tromboembolia pulmonar",
    abbreviation: "Wells TEP",
    category: "cardiovascular",
    type: "Regla de decisión clínica",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["tep", "embolia pulmonar", "wells", "tromboembolia"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Probabilidad clínica preprueba para TEP.",
    inputs: [
      checkInput("dvt", "Signos clínicos de TVP", 3),
      checkInput("likely", "TEP es el diagnóstico más probable", 3),
      checkInput("hr", "FC >100 lpm", 1.5),
      checkInput("immobil", "Inmovilización/cirugía reciente", 1.5),
      checkInput("prev", "TVP/TEP previo", 1.5),
      checkInput("hemoptysis", "Hemoptisis", 1),
      checkInput("cancer", "Cáncer activo", 1)
    ],
    calculate(inputs, calc) {
      const score = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? item.points : 0), 0);
      const category = score > 6 ? "Alta" : score >= 2 ? "Moderada" : "Baja";
      return result({ value: round(score, 1), unit: "puntos", category, interpretation: "Debe integrarse con probabilidad clínica, dímero D, imagen y protocolos locales." });
    },
    bibliography: []
  },
  {
    id: "perc",
    name: "PERC",
    abbreviation: "PERC",
    category: "cardiovascular",
    type: "Regla de decisión clínica",
    specialties: ["urgencias"],
    aliases: ["tep", "embolismo", "perc"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Regla para pacientes de muy baja probabilidad de TEP.",
    inputs: [
      checkInput("edad", "Edad ≥50 años", 1),
      checkInput("fc", "FC ≥100 lpm", 1),
      checkInput("sat", "SatO₂ <95%", 1),
      checkInput("hemoptysis", "Hemoptisis", 1),
      checkInput("estrogenos", "Uso de estrógenos", 1),
      checkInput("prev", "TVP/TEP previo", 1),
      checkInput("surgery", "Cirugía/trauma reciente", 1),
      checkInput("unilateral", "Edema unilateral de pierna", 1)
    ],
    calculate(inputs, calc) {
      const positives = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? 1 : 0), 0);
      return result({ value: positives, unit: "criterios positivos", category: positives === 0 ? "PERC negativo" : "PERC positivo", interpretation: "Solo aplica en pacientes con baja sospecha clínica preprueba; no descarta TEP fuera de ese contexto." });
    },
    bibliography: []
  },
  {
    id: "curb-65",
    name: "CURB-65",
    abbreviation: "CURB-65",
    category: "neumologia",
    type: "Escala",
    specialties: ["urgencias", "medicina-interna"],
    aliases: ["neumonía", "pneumonia", "curb"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Gravedad de neumonía adquirida en la comunidad.",
    inputs: [
      checkInput("confusion", "Confusión", 1),
      checkInput("urea", "Urea >7 mmol/L o BUN elevado equivalente", 1),
      checkInput("rr", "FR ≥30 rpm", 1),
      checkInput("bp", "PAS <90 o PAD ≤60 mmHg", 1),
      checkInput("age", "Edad ≥65 años", 1)
    ],
    calculate(inputs, calc) {
      const score = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? 1 : 0), 0);
      const category = score <= 1 ? "Bajo" : score === 2 ? "Intermedio" : "Alto";
      return result({ value: score, unit: "puntos", category, interpretation: "Apoya sitio de atención y gravedad; no sustituye saturación, comorbilidades ni juicio clínico." });
    },
    bibliography: []
  },
  {
    id: "glasgow",
    name: "Glasgow Coma Scale",
    abbreviation: "GCS",
    category: "urgencias",
    type: "Escala",
    specialties: ["urgencias", "neurología", "cuidados-críticos"],
    aliases: ["glasgow", "coma", "neurología"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Escala de respuesta ocular, verbal y motora.",
    inputs: [
      selectInput("ocular", "Respuesta ocular", [{ value: "4", label: "Espontánea (4)" }, { value: "3", label: "A la voz (3)" }, { value: "2", label: "Al dolor (2)" }, { value: "1", label: "Ninguna (1)" }, { value: "NA", label: "No evaluable" }]),
      selectInput("verbal", "Respuesta verbal", [{ value: "5", label: "Orientada (5)" }, { value: "4", label: "Confusa (4)" }, { value: "3", label: "Palabras inapropiadas (3)" }, { value: "2", label: "Sonidos incomprensibles (2)" }, { value: "1", label: "Ninguna (1)" }, { value: "NA", label: "No evaluable" }]),
      selectInput("motora", "Respuesta motora", [{ value: "6", label: "Obedece órdenes (6)" }, { value: "5", label: "Localiza dolor (5)" }, { value: "4", label: "Retira al dolor (4)" }, { value: "3", label: "Flexión anormal (3)" }, { value: "2", label: "Extensión (2)" }, { value: "1", label: "Ninguna (1)" }, { value: "NA", label: "No evaluable" }])
    ],
    calculate(inputs) {
      const values = ["ocular", "verbal", "motora"].map((key) => inputs[key]);
      if (values.some((value) => !value)) return result({ value: null, missingData: ["ocular", "verbal", "motora"].filter((key) => !inputs[key]) });
      if (values.includes("NA")) return result({ value: "Parcial", unit: "", category: "Componente no evaluable", interpretation: "No asignar puntaje normal a componentes no evaluables.", details: inputs });
      const score = values.reduce((sum, value) => sum + Number(value), 0);
      const category = score <= 8 ? "Severo" : score <= 12 ? "Moderado" : "Leve";
      return result({ value: score, unit: "puntos", category, interpretation: "Interpretar según sedación, intubación, intoxicación y contexto neurológico." });
    },
    bibliography: []
  },
  {
    id: "qsofa",
    name: "qSOFA",
    abbreviation: "qSOFA",
    category: "critico",
    type: "Escala",
    specialties: ["urgencias", "medicina-interna", "cuidados-críticos"],
    aliases: ["sepsis", "infección", "qsofa"],
    version: "Sepsis-3",
    status: "active",
    duration: "1 min",
    description: "Identifica pacientes con infección y mayor riesgo de mal desenlace.",
    inputs: [checkInput("fr", "FR ≥22 rpm", 1), checkInput("mental", "Alteración del estado mental", 1), checkInput("pas", "PAS ≤100 mmHg", 1)],
    calculate(inputs, calc) {
      const score = calc.inputs.reduce((sum, item) => sum + (yes(inputs, item.id) ? 1 : 0), 0);
      return result({ value: score, unit: "puntos", category: score >= 2 ? "Mayor riesgo" : "Menor riesgo", interpretation: "No sustituye evaluación completa de sepsis ni SOFA cuando esté disponible." });
    },
    bibliography: []
  },
  {
    id: "sofa",
    name: "SOFA",
    abbreviation: "SOFA",
    category: "critico",
    type: "Escala",
    specialties: ["cuidados-críticos", "urgencias", "medicina-interna"],
    aliases: ["sepsis", "organ failure", "crítico"],
    version: "1.0.0",
    status: "active",
    duration: "4 min",
    description: "Evaluación secuencial de falla orgánica.",
    inputs: [
      numberInput("pafi", "PaO₂/FiO₂", "mmHg"),
      numberInput("plaquetas", "Plaquetas", "×10³/µL"),
      numberInput("bilirrubina", "Bilirrubina", "mg/dL"),
      selectInput("hemo", "Cardiovascular", [{ value: "0", label: "PAM ≥70 sin vasopresores (0)" }, { value: "1", label: "PAM <70 (1)" }, { value: "2", label: "Dopamina ≤5 o dobutamina (2)" }, { value: "3", label: "Dopamina >5 o norepinefrina ≤0.1 (3)" }, { value: "4", label: "Dopamina >15 o norepinefrina >0.1 (4)" }]),
      numberInput("gcs", "Glasgow", "puntos"),
      numberInput("creatinina", "Creatinina", "mg/dL")
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["pafi", "plaquetas", "bilirrubina", "hemo", "gcs", "creatinina"]);
      if (missingData.length) return result({ value: null, missingData });
      const resp = sofaPoints(n(inputs, "pafi"), [{ points: 4, test: (v) => v < 100 }, { points: 3, test: (v) => v < 200 }, { points: 2, test: (v) => v < 300 }, { points: 1, test: (v) => v < 400 }]);
      const coag = sofaPoints(n(inputs, "plaquetas"), [{ points: 4, test: (v) => v < 20 }, { points: 3, test: (v) => v < 50 }, { points: 2, test: (v) => v < 100 }, { points: 1, test: (v) => v < 150 }]);
      const liver = sofaPoints(n(inputs, "bilirrubina"), [{ points: 4, test: (v) => v >= 12 }, { points: 3, test: (v) => v >= 6 }, { points: 2, test: (v) => v >= 2 }, { points: 1, test: (v) => v >= 1.2 }]);
      const cns = sofaPoints(n(inputs, "gcs"), [{ points: 4, test: (v) => v < 6 }, { points: 3, test: (v) => v <= 9 }, { points: 2, test: (v) => v <= 12 }, { points: 1, test: (v) => v <= 14 }]);
      const renal = sofaPoints(n(inputs, "creatinina"), [{ points: 4, test: (v) => v >= 5 }, { points: 3, test: (v) => v >= 3.5 }, { points: 2, test: (v) => v >= 2 }, { points: 1, test: (v) => v >= 1.2 }]);
      const hemo = Number(inputs.hemo);
      const score = resp + coag + liver + hemo + cns + renal;
      return result({ value: score, unit: "puntos", category: score >= 2 ? "Disfunción orgánica relevante" : "Bajo en esta captura", interpretation: "La tendencia temporal suele ser más informativa que un valor aislado.", details: { respiratorio: resp, coagulación: coag, hígado: liver, cardiovascular: hemo, neurológico: cns, renal } });
    },
    bibliography: []
  },
  {
    id: "child-pugh",
    name: "Child-Pugh",
    abbreviation: "Child-Pugh",
    category: "gastro",
    type: "Clasificación",
    specialties: ["gastroenterología", "medicina-interna"],
    aliases: ["cirrosis", "hepatología", "ascitis", "encefalopatía"],
    version: "1.0.0",
    status: "active",
    duration: "3 min",
    description: "Clasificación de severidad de cirrosis.",
    inputs: [
      selectInput("encefalopatia", "Encefalopatía", [{ value: "1", label: "No (1)" }, { value: "2", label: "Grado I-II (2)" }, { value: "3", label: "Grado III-IV (3)" }]),
      selectInput("ascitis", "Ascitis", [{ value: "1", label: "No (1)" }, { value: "2", label: "Leve/moderada (2)" }, { value: "3", label: "Severa/refractaria (3)" }]),
      selectInput("bilirrubina", "Bilirrubina", [{ value: "1", label: "<2 mg/dL (1)" }, { value: "2", label: "2-3 mg/dL (2)" }, { value: "3", label: ">3 mg/dL (3)" }]),
      selectInput("albumina", "Albúmina", [{ value: "1", label: ">3.5 g/dL (1)" }, { value: "2", label: "2.8-3.5 g/dL (2)" }, { value: "3", label: "<2.8 g/dL (3)" }]),
      selectInput("inr", "INR / TP", [{ value: "1", label: "INR <1.7 (1)" }, { value: "2", label: "INR 1.7-2.3 (2)" }, { value: "3", label: "INR >2.3 (3)" }])
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["encefalopatia", "ascitis", "bilirrubina", "albumina", "inr"]);
      if (missingData.length) return result({ value: null, missingData });
      const score = ["encefalopatia", "ascitis", "bilirrubina", "albumina", "inr"].reduce((sum, key) => sum + Number(inputs[key]), 0);
      const category = score <= 6 ? "Clase A" : score <= 9 ? "Clase B" : "Clase C";
      return result({ value: score, unit: "puntos", category, interpretation: "Clasificación pronóstica; interpretar junto con etiología, descompensaciones y estado clínico." });
    },
    bibliography: []
  },
  {
    id: "meld-3",
    name: "MELD 3.0",
    abbreviation: "MELD 3.0",
    category: "gastro",
    type: "Riesgo pronóstico",
    specialties: ["hepatología", "medicina-interna"],
    aliases: ["meld", "cirrosis", "trasplante", "hígado"],
    version: "MELD 3.0 educativa",
    status: "active",
    duration: "3 min",
    description: "Modelo actualizado de enfermedad hepática terminal.",
    inputs: [
      numberInput("bilirrubina", "Bilirrubina", "mg/dL"),
      numberInput("inr", "INR", ""),
      numberInput("creatinina", "Creatinina", "mg/dL"),
      numberInput("sodio", "Sodio", "mEq/L"),
      numberInput("albumina", "Albúmina", "g/dL"),
      selectInput("sexo", "Sexo biológico", sexoOptions)
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["bilirrubina", "inr", "creatinina", "sodio", "albumina", "sexo"]);
      if (missingData.length) return result({ value: null, missingData });
      const bili = Math.max(n(inputs, "bilirrubina"), 1);
      const inr = Math.max(n(inputs, "inr"), 1);
      const cr = Math.min(Math.max(n(inputs, "creatinina"), 1), 3);
      const na = Math.min(Math.max(n(inputs, "sodio"), 125), 137);
      const alb = Math.min(Math.max(n(inputs, "albumina"), 1.5), 3.5);
      const female = inputs.sexo === "femenino" ? 1 : 0;
      const meld = 1.33 * female + 4.56 * Math.log(bili) + 0.82 * (137 - na) - 0.24 * (137 - na) * Math.log(bili) + 9.09 * Math.log(inr) + 11.14 * Math.log(cr) + 1.85 * (3.5 - alb) - 1.83 * (3.5 - alb) * Math.log(cr) + 6;
      return result({ value: round(meld, 0), unit: "puntos", category: "MELD 3.0", interpretation: "Usar según protocolos vigentes; redondeos y límites aplicados deben revisarse para decisiones formales.", warnings: ["Implementación educativa con límites habituales; verificar contra calculadora institucional antes de decisiones de trasplante."] });
    },
    bibliography: bibliography.meld3
  },
  {
    id: "fib-4",
    name: "FIB-4",
    abbreviation: "FIB-4",
    category: "gastro",
    type: "Índice",
    specialties: ["gastroenterología", "medicina-interna"],
    aliases: ["fibrosis", "hígado", "ast", "alt", "plaquetas"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Índice no invasivo de fibrosis hepática.",
    inputs: [numberInput("edad", "Edad", "años"), numberInput("ast", "AST", "U/L"), numberInput("alt", "ALT", "U/L"), numberInput("plaquetas", "Plaquetas", "×10³/µL")],
    calculate(inputs) {
      const missingData = required(inputs, ["edad", "ast", "alt", "plaquetas"]);
      if (missingData.length) return result({ value: null, missingData });
      const fib4 = (n(inputs, "edad") * n(inputs, "ast")) / (n(inputs, "plaquetas") * Math.sqrt(n(inputs, "alt")));
      const category = fib4 < 1.3 ? "Bajo" : fib4 > 2.67 ? "Alto" : "Indeterminado";
      return result({ value: round(fib4, 2), unit: "", category, interpretation: "Puntos de corte pueden variar por edad, etiología y guía clínica." });
    },
    bibliography: []
  },
  {
    id: "glasgow-blatchford",
    name: "Glasgow-Blatchford",
    abbreviation: "GBS",
    category: "gastro",
    type: "Riesgo pronóstico",
    specialties: ["urgencias", "gastroenterología"],
    aliases: ["sangrado digestivo", "hemorragia", "melena", "blatchford"],
    version: "1.0.0",
    status: "active",
    duration: "3 min",
    description: "Riesgo en hemorragia digestiva alta antes de endoscopia.",
    inputs: [
      numberInput("bun", "BUN", "mg/dL"),
      numberInput("hb", "Hemoglobina", "g/dL"),
      selectInput("sexo", "Sexo biológico", sexoOptions),
      numberInput("pas", "Presión sistólica", "mmHg"),
      numberInput("pulso", "Pulso", "lpm"),
      checkInput("melena", "Melena", 1),
      checkInput("syncope", "Síncope", 2),
      checkInput("hepatic", "Enfermedad hepática", 2),
      checkInput("heart", "Insuficiencia cardiaca", 2)
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["bun", "hb", "sexo", "pas", "pulso"]);
      if (missingData.length) return result({ value: null, missingData });
      const bunMmol = n(inputs, "bun") / 2.8;
      let score = 0;
      if (bunMmol >= 25) score += 6; else if (bunMmol >= 10) score += 4; else if (bunMmol >= 8) score += 3; else if (bunMmol >= 6.5) score += 2;
      const hb = n(inputs, "hb");
      if (inputs.sexo === "masculino") {
        if (hb < 10) score += 6; else if (hb < 12) score += 3; else if (hb < 13) score += 1;
      } else if (hb < 10) score += 6; else if (hb < 12) score += 1;
      const pas = n(inputs, "pas");
      if (pas < 90) score += 3; else if (pas < 100) score += 2; else if (pas < 110) score += 1;
      if (n(inputs, "pulso") >= 100) score += 1;
      ["melena", "syncope", "hepatic", "heart"].forEach((key) => { if (yes(inputs, key)) score += key === "melena" ? 1 : 2; });
      return result({ value: score, unit: "puntos", category: score === 0 ? "Muy bajo" : "Riesgo no bajo", interpretation: "Apoya estratificación inicial; no sustituye evaluación hemodinámica ni endoscópica." });
    },
    bibliography: []
  },
  {
    id: "centor-mcisaac",
    name: "Centor modificado / McIsaac",
    abbreviation: "McIsaac",
    category: "infectologia",
    type: "Regla de decisión clínica",
    specialties: ["medicina-general", "urgencias", "infectología"],
    aliases: ["faringitis", "estreptococo", "garganta", "centor"],
    version: "1.0.0",
    status: "active",
    duration: "2 min",
    description: "Apoyo para probabilidad de faringitis estreptocócica.",
    inputs: [
      checkInput("fiebre", "Fiebre", 1),
      checkInput("tosAusente", "Ausencia de tos", 1),
      checkInput("adenopatia", "Adenopatía cervical anterior dolorosa", 1),
      checkInput("exudado", "Exudado/amígdalas inflamadas", 1),
      selectInput("edad", "Edad", [{ value: "1", label: "3-14 años (+1)" }, { value: "0", label: "15-44 años (0)" }, { value: "-1", label: "≥45 años (-1)" }])
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["edad"]);
      if (missingData.length) return result({ value: null, missingData });
      const score = Number(inputs.edad) + ["fiebre", "tosAusente", "adenopatia", "exudado"].reduce((sum, key) => sum + (yes(inputs, key) ? 1 : 0), 0);
      const category = score <= 0 ? "Muy baja" : score <= 2 ? "Baja/intermedia" : "Mayor";
      return result({ value: score, unit: "puntos", category, interpretation: "Debe integrarse con disponibilidad de prueba rápida/cultivo y epidemiología local." });
    },
    bibliography: []
  },
  {
    id: "criterios-light",
    name: "Criterios de Light",
    abbreviation: "Light",
    category: "infectologia",
    type: "Criterios diagnósticos",
    specialties: ["medicina-interna", "neumología", "infectología"],
    aliases: ["derrame pleural", "exudado", "trasudado", "ldh", "proteínas"],
    version: "1.0.0",
    status: "active",
    duration: "3 min",
    description: "Clasifica derrame pleural como exudado si cumple criterios.",
    inputs: [
      numberInput("proteinaPleural", "Proteína pleural", "g/dL"),
      numberInput("proteinaSerica", "Proteína sérica", "g/dL"),
      numberInput("ldhPleural", "LDH pleural", "U/L"),
      numberInput("ldhSerica", "LDH sérica", "U/L"),
      numberInput("ldhLsn", "Límite superior normal LDH sérica", "U/L")
    ],
    calculate(inputs) {
      const missingData = required(inputs, ["proteinaPleural", "proteinaSerica", "ldhPleural", "ldhSerica", "ldhLsn"]);
      if (missingData.length) return result({ value: null, missingData });
      const c1 = n(inputs, "proteinaPleural") / n(inputs, "proteinaSerica") > 0.5;
      const c2 = n(inputs, "ldhPleural") / n(inputs, "ldhSerica") > 0.6;
      const c3 = n(inputs, "ldhPleural") > (2 / 3) * n(inputs, "ldhLsn");
      const fulfilled = [c1, c2, c3].filter(Boolean).length;
      return result({ value: fulfilled, unit: "criterios", category: fulfilled > 0 ? "Exudado por Light" : "No cumple exudado por Light", interpretation: "Los criterios favorecen sensibilidad para exudado; considerar contexto clínico y diuréticos.", details: { "Proteína pleural/sérica >0.5": c1, "LDH pleural/sérica >0.6": c2, "LDH pleural >2/3 LSN": c3 } });
    },
    bibliography: bibliography.light
  }
];

export function obtenerCalculadoraMedica(id) {
  return CALCULADORAS_MEDICAS.find((calculator) => calculator.id === id) || CALCULADORAS_MEDICAS[0];
}

export function ejecutarCalculadoraMedica(id, inputs) {
  const calculator = obtenerCalculadoraMedica(id);
  return calculator.calculate(inputs, calculator);
}

