/**
 * Fuente unica de verdad de relaciones medicamento-citocromo.
 *
 * Los medicamentos se referencian exclusivamente por clinicalMedicationId.
 * Sus nombres, presentaciones y datos clinicos viven en
 * catalogoFarmacologicoUnificado.js y nunca se duplican aqui.
 */

export const FUENTES_CITOCROMOS = Object.freeze({
  fdaTabla: "https://www.fda.gov/drugs/drug-interactions-labeling/drug-development-and-drug-interactions-table-substrates-inhibitors-and-inducers",
  fdaGuia: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-drug-interaction-studies-cytochrome-p450-enzyme-and-transporter-mediated-drug-interactions",
  emaGuia: "https://www.ema.europa.eu/en/investigation-drug-interactions-scientific-guideline"
});

const relacion = (medicationId, rol, potencia = "no_clasificada", notas = "") =>
  Object.freeze({ medicationId, rol, potencia, notas });

const cyp = ({ id, nombre, relevanciaClinica, descripcion, relaciones = [], notas = "" }) => Object.freeze({
  id,
  nombre,
  familia: id.match(/^CYP\d+/)?.[0] || id,
  relevanciaClinica,
  descripcion,
  relaciones: Object.freeze(relaciones),
  notas,
  fuentes: Object.freeze([FUENTES_CITOCROMOS.fdaTabla, FUENTES_CITOCROMOS.fdaGuia, FUENTES_CITOCROMOS.emaGuia])
});

/**
 * Isoenzimas humanas con participacion documentada o potencialmente relevante
 * en metabolismo de medicamentos. Las siete enzimas regulatorias principales
 * (1A2, 2B6, 2C8, 2C9, 2C19, 2D6 y 3A4/5) tienen la mayor cobertura.
 */
export const CITOCROMOS_FARMACOLOGICOS = Object.freeze([
  cyp({
    id: "CYP1A1",
    nombre: "CYP1A1",
    relevanciaClinica: "limitada",
    descripcion: "Enzima extrahepatica relacionada con metabolismo de xenobioticos; su utilidad rutinaria para predecir interacciones clinicas es limitada.",
    relaciones: [
      relacion("cafeina", "sustrato", "secundario"),
      relacion("teofilina", "sustrato", "secundario"),
      relacion("rifampicina", "inductor", "no_clasificada")
    ]
  }),
  cyp({
    id: "CYP1A2",
    nombre: "CYP1A2",
    relevanciaClinica: "alta",
    descripcion: "Via clinicamente importante para cafeina, tizanidina, teofilina y varios psicofarmacos.",
    relaciones: [
      relacion("cafeina", "sustrato", "sensible"), relacion("tizanidina", "sustrato", "sensible"),
      relacion("alosetron", "sustrato"), relacion("clozapina", "sustrato"), relacion("olanzapina", "sustrato"),
      relacion("ramelteon", "sustrato"), relacion("teofilina", "sustrato", "margen_estrecho"),
      relacion("tacrina", "sustrato"), relacion("mexiletina", "sustrato", "margen_estrecho"),
      relacion("duloxetina", "sustrato"),
      relacion("fluvoxamina", "inhibidor", "fuerte"), relacion("ciprofloxacino", "inhibidor", "fuerte"),
      relacion("cimetidina", "inhibidor", "debil"),
      relacion("rifampicina", "inductor", "moderado"), relacion("fenitoina", "inductor", "moderado"),
      relacion("omeprazol", "inductor", "in_vitro")
    ]
  }),
  cyp({
    id: "CYP1B1",
    nombre: "CYP1B1",
    relevanciaClinica: "limitada",
    descripcion: "Enzima principalmente extrahepatica; participa en bioactivacion de algunos xenobioticos y antineoplasicos.",
    relaciones: [relacion("paclitaxel", "sustrato", "secundario"), relacion("tamoxifeno", "sustrato", "secundario")]
  }),
  cyp({
    id: "CYP2A6",
    nombre: "CYP2A6",
    relevanciaClinica: "moderada",
    descripcion: "Via principal del metabolismo de nicotina y participa en el metabolismo de algunos farmacos.",
    relaciones: [
      relacion("nicotina", "sustrato", "principal"), relacion("letrozol", "sustrato"),
      relacion("efavirenz", "inhibidor", "moderado"), relacion("isoniazida", "inhibidor", "moderado"),
      relacion("fenobarbital", "inductor", "no_clasificada")
    ]
  }),
  cyp({
    id: "CYP2B6",
    nombre: "CYP2B6",
    relevanciaClinica: "alta",
    descripcion: "Via relevante para bupropion, efavirenz y metadona, con induccion clinicamente significativa.",
    relaciones: [
      relacion("bupropion", "sustrato", "marcador"), relacion("efavirenz", "sustrato", "marcador"),
      relacion("metadona", "sustrato"), relacion("ketamina", "sustrato"),
      relacion("clopidogrel", "inhibidor", "debil"), relacion("sertralina", "inhibidor", "in_vitro"),
      relacion("ticlopidina", "inhibidor", "in_vitro"),
      relacion("carbamazepina", "inductor", "fuerte"), relacion("rifampicina", "inductor", "moderado"),
      relacion("fenobarbital", "inductor", "in_vitro")
    ]
  }),
  cyp({
    id: "CYP2C8",
    nombre: "CYP2C8",
    relevanciaClinica: "alta",
    descripcion: "Via importante para repaglinida y paclitaxel; gemfibrozilo es inhibidor fuerte de referencia.",
    relaciones: [
      relacion("repaglinida", "sustrato", "sensible"), relacion("paclitaxel", "sustrato", "marcador"),
      relacion("amiodarona", "sustrato"), relacion("diclofenaco", "sustrato", "secundario"),
      relacion("gemfibrozilo", "inhibidor", "fuerte"), relacion("clopidogrel", "inhibidor", "moderado"),
      relacion("montelukast", "inhibidor", "in_vitro"), relacion("fenelzina", "inhibidor", "in_vitro"),
      relacion("rifampicina", "inductor", "moderado")
    ]
  }),
  cyp({
    id: "CYP2C9",
    nombre: "CYP2C9",
    relevanciaClinica: "alta",
    descripcion: "Via de metabolismo de warfarina, fenitoina, AINE y sulfonilureas; relevante por margen terapeutico y sangrado.",
    relaciones: [
      relacion("warfarina", "sustrato", "moderadamente_sensible"), relacion("tolbutamida", "sustrato", "moderadamente_sensible"),
      relacion("fenitoina", "sustrato", "margen_estrecho"), relacion("diclofenaco", "sustrato", "marcador"),
      relacion("ibuprofeno", "sustrato"), relacion("losartan", "sustrato"),
      relacion("fluconazol", "inhibidor", "moderado"), relacion("amiodarona", "inhibidor", "moderado"),
      relacion("fluvoxamina", "inhibidor", "debil"),
      relacion("rifampicina", "inductor", "moderado"), relacion("carbamazepina", "inductor", "debil"),
      relacion("fenobarbital", "inductor", "no_clasificada")
    ]
  }),
  cyp({
    id: "CYP2C18",
    nombre: "CYP2C18",
    relevanciaClinica: "limitada",
    descripcion: "Isoenzima minoritaria de la familia 2C; pocas interacciones clinicas se atribuyen de forma aislada a esta via.",
    relaciones: [relacion("omeprazol", "sustrato", "secundario"), relacion("warfarina", "sustrato", "secundario")]
  }),
  cyp({
    id: "CYP2C19",
    nombre: "CYP2C19",
    relevanciaClinica: "alta",
    descripcion: "Via polimorfica relevante para clopidogrel, inhibidores de bomba de protones y varios psicofarmacos.",
    relaciones: [
      relacion("lansoprazol", "sustrato", "moderadamente_sensible"), relacion("omeprazol", "sustrato", "sensible"),
      relacion("clopidogrel", "profarmaco", "principal", "La inhibicion puede reducir la formacion del metabolito activo."),
      relacion("citalopram", "sustrato"), relacion("escitalopram", "sustrato"), relacion("sertralina", "sustrato"),
      relacion("fluvoxamina", "inhibidor", "fuerte"), relacion("fluoxetina", "inhibidor", "fuerte"),
      relacion("fluconazol", "inhibidor", "fuerte"), relacion("omeprazol", "inhibidor", "moderado"),
      relacion("cimetidina", "inhibidor", "moderado"), relacion("ticlopidina", "inhibidor", "in_vitro"),
      relacion("rifampicina", "inductor", "fuerte"), relacion("fenitoina", "inductor", "moderado"),
      relacion("carbamazepina", "inductor", "no_clasificada")
    ]
  }),
  cyp({
    id: "CYP2D6",
    nombre: "CYP2D6",
    relevanciaClinica: "alta",
    descripcion: "Via polimorfica central para antidepresivos, antipsicoticos, atomoxetina, betabloqueadores y algunos opioides.",
    relaciones: [
      relacion("desipramina", "sustrato", "sensible"), relacion("dextrometorfano", "sustrato", "sensible"),
      relacion("nebivolol", "sustrato", "sensible"), relacion("atomoxetina", "sustrato", "sensible"),
      relacion("metoprolol", "sustrato"), relacion("flecainida", "sustrato", "margen_estrecho"),
      relacion("aripiprazol", "sustrato"), relacion("risperidona", "sustrato"), relacion("iloperidona", "sustrato"),
      relacion("perfenazina", "sustrato"), relacion("tioridazina", "sustrato", "margen_estrecho"),
      relacion("tolterodina", "sustrato"), relacion("tramadol", "profarmaco", "principal"),
      relacion("codeina", "profarmaco", "principal"), relacion("tamoxifeno", "profarmaco", "principal"),
      relacion("fluoxetina", "inhibidor", "fuerte"), relacion("paroxetina", "inhibidor", "fuerte"),
      relacion("quinidina", "inhibidor", "fuerte"), relacion("bupropion", "inhibidor", "fuerte"),
      relacion("duloxetina", "inhibidor", "moderado"), relacion("mirabegron", "inhibidor", "moderado"),
      relacion("sertralina", "inhibidor", "debil"), relacion("fluvoxamina", "inhibidor", "debil")
    ]
  }),
  cyp({
    id: "CYP2E1",
    nombre: "CYP2E1",
    relevanciaClinica: "moderada",
    descripcion: "Participa en metabolismo de etanol, anestesicos volatiles y bioactivacion de paracetamol; relevante en exposicion cronica a alcohol.",
    relaciones: [
      relacion("alcohol", "sustrato"), relacion("paracetamol", "sustrato", "bioactivacion"),
      relacion("isoniazida", "inhibidor", "agudo"), relacion("alcohol", "inductor", "cronico"),
      relacion("isoniazida", "inductor", "cronico")
    ]
  }),
  cyp({
    id: "CYP2J2",
    nombre: "CYP2J2",
    relevanciaClinica: "emergente",
    descripcion: "Isoenzima extrahepatica con contribucion a algunos farmacos cardiovasculares y antihistaminicos; evidencia DDI clinica aun limitada.",
    relaciones: [
      relacion("rivaroxaban", "sustrato", "secundario"), relacion("apixaban", "sustrato", "secundario"),
      relacion("loratadina", "sustrato", "secundario"), relacion("amiodarona", "inhibidor", "in_vitro")
    ]
  }),
  cyp({
    id: "CYP3A4",
    nombre: "CYP3A4",
    relevanciaClinica: "muy_alta",
    descripcion: "Principal via CYP de metabolismo de numerosos medicamentos y una de las fuentes mas frecuentes de interacciones farmacocineticas.",
    relaciones: [
      relacion("midazolam", "sustrato", "sensible"), relacion("triazolam", "sustrato", "sensible"),
      relacion("alprazolam", "sustrato"), relacion("quetiapina", "sustrato"), relacion("aripiprazol", "sustrato"),
      relacion("iloperidona", "sustrato"), relacion("fentanilo", "sustrato"), relacion("oxicodona", "sustrato"),
      relacion("atorvastatina", "sustrato"), relacion("tacrolimus", "sustrato", "margen_estrecho"),
      relacion("apixaban", "sustrato"), relacion("rivaroxaban", "sustrato"), relacion("amiodarona", "sustrato"),
      relacion("claritromicina", "inhibidor", "fuerte"), relacion("itraconazol", "inhibidor", "fuerte"),
      relacion("ketoconazol", "inhibidor", "fuerte"), relacion("ritonavir", "inhibidor", "fuerte"),
      relacion("eritromicina", "inhibidor", "moderado"), relacion("fluconazol", "inhibidor", "moderado"),
      relacion("verapamilo", "inhibidor", "moderado"), relacion("diltiazem", "inhibidor", "moderado"),
      relacion("fluvoxamina", "inhibidor", "moderado"), relacion("amiodarona", "inhibidor", "moderado"),
      relacion("carbamazepina", "inductor", "fuerte"), relacion("fenitoina", "inductor", "fuerte"),
      relacion("rifampicina", "inductor", "fuerte"), relacion("fenobarbital", "inductor", "fuerte"),
      relacion("hierba_san_juan", "inductor", "fuerte")
    ]
  }),
  cyp({
    id: "CYP3A5",
    nombre: "CYP3A5",
    relevanciaClinica: "alta",
    descripcion: "Comparte numerosos sustratos y moduladores con CYP3A4; su expresion es polimorfica.",
    relaciones: [
      relacion("midazolam", "sustrato"), relacion("tacrolimus", "sustrato", "margen_estrecho"),
      relacion("fentanilo", "sustrato"), relacion("claritromicina", "inhibidor", "fuerte"),
      relacion("itraconazol", "inhibidor", "fuerte"), relacion("ketoconazol", "inhibidor", "fuerte"),
      relacion("ritonavir", "inhibidor", "fuerte"), relacion("rifampicina", "inductor", "fuerte"),
      relacion("carbamazepina", "inductor", "fuerte"), relacion("fenitoina", "inductor", "fuerte")
    ]
  }),
  cyp({
    id: "CYP3A7",
    nombre: "CYP3A7",
    relevanciaClinica: "perinatal",
    descripcion: "Isoforma predominante fetal y neonatal; su peso en interacciones del adulto suele ser bajo.",
    relaciones: [relacion("midazolam", "sustrato", "secundario"), relacion("carbamazepina", "sustrato", "secundario")]
  }),
  cyp({
    id: "CYP4F2",
    nombre: "CYP4F2",
    relevanciaClinica: "farmacogenetica",
    descripcion: "Participa en metabolismo de vitamina K y puede contribuir a variabilidad de dosis de warfarina.",
    relaciones: [relacion("warfarina", "relacion_farmacogenetica", "indirecta"), relacion("fitomenadiona", "sustrato", "endogeno")]
  })
]);

export const CITOCROMOS_POR_ID = new Map(CITOCROMOS_FARMACOLOGICOS.map((item) => [item.id, item]));

export function obtenerCitocromo(id = "") {
  return CITOCROMOS_POR_ID.get(String(id).toUpperCase()) || null;
}

export function obtenerRelacionesCitocromoPorMedicamento(medicationId = "") {
  const id = String(medicationId || "").trim().toLowerCase();
  if (!id) return [];
  return CITOCROMOS_FARMACOLOGICOS.flatMap((citocromo) =>
    citocromo.relaciones
      .filter((item) => item.medicationId === id)
      .map((item) => ({ citocromoId: citocromo.id, ...item }))
  );
}

function esModulador(rol) {
  return rol === "inhibidor" || rol === "inductor";
}

function severidadPorPotencia(potencia = "") {
  if (["fuerte", "margen_estrecho", "sensible"].includes(potencia)) return "alta";
  if (["moderado", "moderadamente_sensible", "principal"].includes(potencia)) return "moderada";
  return "informativa";
}

/**
 * Puente farmacocinetico: devuelve una sola relacion por par y citocromo.
 * No sustituye reglas exactas de ficha tecnica ni interpreta dosis, via o contexto.
 */
export function detectarInteraccionesPorCitocromos(medicationIds = []) {
  const ids = [...new Set(medicationIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean))];
  const resultados = [];
  CITOCROMOS_FARMACOLOGICOS.forEach((citocromo) => {
    const presentes = citocromo.relaciones.filter((item) => ids.includes(item.medicationId));
    presentes.filter((item) => esModulador(item.rol)).forEach((modulador) => {
      presentes.filter((item) => item.medicationId !== modulador.medicationId && ["sustrato", "profarmaco"].includes(item.rol)).forEach((afectado) => {
        const medicamentos = [modulador.medicationId, afectado.medicationId].sort();
        const inhibeProfarmaco = modulador.rol === "inhibidor" && afectado.rol === "profarmaco";
        resultados.push({
          id: `cyp:${citocromo.id.toLowerCase()}:${modulador.rol}:${medicamentos.join("+")}`,
          citocromoId: citocromo.id,
          medicamentos,
          modulador: modulador.medicationId,
          afectado: afectado.medicationId,
          tipo: modulador.rol,
          severidad: [severidadPorPotencia(modulador.potencia), severidadPorPotencia(afectado.potencia)].includes("alta") ? "alta" : "moderada",
          mecanismo: modulador.rol === "inhibidor"
            ? `Inhibicion de ${citocromo.id} con ${inhibeProfarmaco ? "menor activacion del profarmaco" : "reduccion del metabolismo del sustrato"}.`
            : `Induccion de ${citocromo.id} con aumento del metabolismo del sustrato.`,
          efectoClinico: inhibeProfarmaco
            ? "Puede reducir la formacion del metabolito activo y disminuir la respuesta terapeutica."
            : modulador.rol === "inhibidor"
              ? "Puede aumentar la exposicion y el riesgo de efectos adversos o toxicidad del sustrato."
              : "Puede reducir la exposicion y la eficacia del sustrato.",
          recomendacion: "Confirmar la interaccion en la ficha tecnica vigente, valorar alternativa y ajustar vigilancia, dosis o concentraciones cuando corresponda."
        });
      });
    });
  });
  return [...new Map(resultados.map((item) => [item.id, item])).values()];
}
