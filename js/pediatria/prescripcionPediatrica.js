import { CATALOGO_MEDICAMENTOS_PEDIATRICOS } from "./catalogoMedicamentosPediatricos.js";
import { numero, superficieCorporal } from "./formulas.js";

export const MODOS_DOSIFICACION_PEDIATRICA = [
  { id: "mg_kg_dosis", label: "mg/kg/dosis" },
  { id: "mg_kg_dia", label: "mg/kg/día" },
  { id: "mg_m2_dosis", label: "mg/m²/dosis" },
  { id: "mg_m2_dia", label: "mg/m²/día" },
  { id: "mg_dosis_manual", label: "mg por dosis manual" },
  { id: "mg_dia_manual", label: "dosis total diaria manual" }
];

const EQUIVALENCIAS_INTERVALO = {
  24: 1,
  12: 2,
  8: 3,
  6: 4,
  4: 6
};

export function searchPediatricMedication(query, catalog = CATALOGO_MEDICAMENTOS_PEDIATRICOS) {
  const q = normalizar(query);
  if (!q) return catalog;
  return catalog.filter((med) => {
    const texto = [
      med.genericName,
      med.drugClass,
      med.mechanism,
      ...(med.synonyms || []),
      ...(med.indications || []).map((ind) => ind.name),
      ...(med.presentations || []).flatMap((presentation) => presentation.brands || [])
    ].flat().join(" ");
    return normalizar(texto).includes(q);
  });
}

export function loadMedicationInformation(medicationId, catalog = CATALOGO_MEDICAMENTOS_PEDIATRICOS) {
  return catalog.find((med) => med.medicationId === medicationId) || null;
}

export function loadUsualPediatricDoses(medicationId, indicationId) {
  const med = loadMedicationInformation(medicationId);
  const indication = med?.indications?.find((item) => item.indicationId === indicationId) || med?.indications?.[0];
  return indication?.dosingSchemes || [];
}

export function selectDosingScheme(medicationId, indicationId, schemeIndex = 0) {
  const schemes = loadUsualPediatricDoses(medicationId, indicationId);
  return schemes[Number(schemeIndex)] || schemes[0] || null;
}

export function calculateDoseByWeight({ pesoKg, value, administrationsPerDay = 1, mode }) {
  const peso = numero(pesoKg);
  const dose = numero(value);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  if (!peso || !dose) return null;
  if (mode === "mg_kg_dia") {
    const totalDailyDoseMg = dose * peso;
    return { calculatedDoseMg: totalDailyDoseMg / tomas, totalDailyDoseMg };
  }
  return { calculatedDoseMg: dose * peso, totalDailyDoseMg: dose * peso * tomas };
}

export function calculateDoseByBsa({ pesoKg, tallaCm, value, administrationsPerDay = 1, mode }) {
  const bsa = superficieCorporal(pesoKg, tallaCm)?.mosteller;
  const dose = numero(value);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  if (!bsa || !dose) return null;
  if (mode === "mg_m2_dia") {
    const totalDailyDoseMg = dose * bsa;
    return { calculatedDoseMg: totalDailyDoseMg / tomas, totalDailyDoseMg, bsa };
  }
  return { calculatedDoseMg: dose * bsa, totalDailyDoseMg: dose * bsa * tomas, bsa };
}

export function calculateDoseFromDailyTotal({ totalDailyDoseMg, administrationsPerDay }) {
  const total = numero(totalDailyDoseMg);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  if (!total) return null;
  return { calculatedDoseMg: total / tomas, totalDailyDoseMg: total };
}

export function applyManualDoseOverride({ finalDoseMg, administrationsPerDay }) {
  const dose = numero(finalDoseMg);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  if (!dose) return null;
  return { calculatedDoseMg: dose, totalDailyDoseMg: dose * tomas, manualDoseOverride: true };
}

export function calculateAdministrationsPerDay({ administrationsPerDay, intervalHours }) {
  const tomas = numero(administrationsPerDay);
  if (tomas) return tomas;
  const intervalo = numero(intervalHours);
  return intervalo ? (EQUIVALENCIAS_INTERVALO[intervalo] || 24 / intervalo) : 1;
}

export function synchronizeFrequencyAndInterval({ administrationsPerDay, intervalHours, changed }) {
  const tomas = numero(administrationsPerDay);
  const intervalo = numero(intervalHours);
  if (changed === "interval" && intervalo && EQUIVALENCIAS_INTERVALO[intervalo]) {
    return { administrationsPerDay: EQUIVALENCIAS_INTERVALO[intervalo], intervalHours: intervalo };
  }
  if (changed === "administrations" && tomas) {
    const exact = Object.entries(EQUIVALENCIAS_INTERVALO).find(([, value]) => value === tomas);
    return { administrationsPerDay: tomas, intervalHours: exact ? Number(exact[0]) : intervalHours };
  }
  return { administrationsPerDay: tomas || "", intervalHours: intervalo || "" };
}

export function loadMedicationPresentations(medicationId, { route = "", edadAnos = null } = {}) {
  const med = loadMedicationInformation(medicationId);
  return (med?.presentations || []).filter((presentation) => {
    if (presentation.active === false) return false;
    if (route && !(presentation.routes || []).includes(route)) return false;
    return edadAnos === null || edadAnos === undefined || true;
  });
}

export function loadBrandsForPresentation(medicationId, presentationId) {
  const presentation = loadMedicationPresentations(medicationId).find((item) => item.presentationId === presentationId);
  return ["Genérico", ...(presentation?.brands || [])].filter((brand, index, arr) => arr.indexOf(brand) === index);
}

export function parseManualPresentation(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(",", ".");
  const mgMl = lower.match(/([\d.]+)\s*mg\s*(?:\/|por|en)\s*([\d.]+)\s*m?l/);
  if (mgMl) {
    const amountMg = Number(mgMl[1]);
    const volumeMl = Number(mgMl[2]);
    if (amountMg > 0 && volumeMl > 0) {
      return { form: inferForm(lower), amountMg, volumeMl, concentrationMgPerMl: amountMg / volumeMl, unitStrength: raw, manual: true };
    }
  }
  const unit = lower.match(/([\d.]+)\s*mg\s*(?:por|\/)?\s*(tableta|tab|capsula|cápsula|ampolla|supositorio|gotero)/);
  if (unit) {
    return {
      form: normalizarForma(unit[2]),
      amountMg: Number(unit[1]),
      unitStrength: raw,
      concentrationMgPerMl: null,
      divisible: ["tableta", "tab"].includes(unit[2]),
      manual: true
    };
  }
  const direct = lower.match(/([\d.]+)\s*mg\s*\/\s*ml/);
  if (direct) {
    const concentrationMgPerMl = Number(direct[1]);
    return { form: inferForm(lower), amountMg: concentrationMgPerMl, volumeMl: 1, concentrationMgPerMl, unitStrength: raw, manual: true };
  }
  return null;
}

export function calculateLiquidVolume({ finalDoseMg, presentation }) {
  const dose = numero(finalDoseMg);
  const concentration = numero(presentation?.concentrationMgPerMl);
  if (!dose || !concentration) return null;
  const exactMl = dose / concentration;
  return {
    exactMl,
    roundedMl: redondearDispositivo(exactMl),
    roundingRule: "Redondeo educativo a 0.1 mL para jeringa oral; ajustar a dispositivo real."
  };
}

export function calculateSolidUnits({ finalDoseMg, presentation }) {
  const dose = numero(finalDoseMg);
  const strength = numero(presentation?.amountMg);
  if (!dose || !strength || presentation?.volumeMl) return null;
  const units = dose / strength;
  return { exactUnits: units, roundedUnits: Math.round(units * 4) / 4 };
}

export function validateTabletSplitting({ unitsPerDose, presentation }) {
  if (!presentation || presentation.volumeMl) return { ok: true };
  const units = numero(unitsPerDose?.exactUnits ?? unitsPerDose);
  if (!units) return { ok: false, message: "No se pudo calcular unidades por toma." };
  const isFraction = Math.abs(units - Math.round(units)) > 0.001;
  if (isFraction && presentation.divisible === false) {
    return { ok: false, message: "No se recomienda dividir esta presentación. Selecciona otra concentración." };
  }
  return { ok: true };
}

export function calculateTotalDailyDose({ finalDoseMg, administrationsPerDay }) {
  const dose = numero(finalDoseMg);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  return dose ? dose * tomas : null;
}

export function compareDoseWithUsualRange({ finalDoseMg, pesoKg, scheme, administrationsPerDay }) {
  const dose = numero(finalDoseMg);
  const peso = numero(pesoKg);
  if (!dose || !peso || !scheme) return null;
  const equivalentMgKgDose = dose / peso;
  const equivalentMgKgDay = equivalentMgKgDose * (numero(administrationsPerDay) || 1);
  const warnings = [];
  if (scheme.unit === "mg/kg/dosis") {
    if (equivalentMgKgDose < scheme.minimum) warnings.push("La dosis seleccionada está por debajo del rango pediátrico habitual registrado.");
    if (equivalentMgKgDose > scheme.maximum) warnings.push("La dosis seleccionada está por encima del rango pediátrico habitual registrado.");
  }
  if (scheme.unit === "mg/kg/día") {
    if (equivalentMgKgDay < scheme.minimum) warnings.push("La dosis diaria seleccionada está por debajo del rango pediátrico habitual registrado.");
    if (equivalentMgKgDay > scheme.maximum) warnings.push("La dosis diaria seleccionada está por encima del rango pediátrico habitual registrado.");
  }
  return { equivalentMgKgDose, equivalentMgKgDay, warnings };
}

export function validatePediatricPrescription(prescription) {
  const errors = [];
  const warnings = [...(prescription.warnings || [])];
  if (!prescription.patientId && !prescription.temporal) errors.push("Selecciona un paciente o usa evaluación temporal.");
  if (!numero(prescription.weightKg)) errors.push("Registra peso actual mayor a cero.");
  if (!prescription.weightConfirmed) errors.push("Confirma que el peso es actual.");
  if (!prescription.medicationId) errors.push("Selecciona medicamento.");
  if (!prescription.indication) errors.push("Selecciona indicación.");
  if (!numero(prescription.finalDoseMg)) errors.push("Define dosis final por toma.");
  if (!prescription.presentation && !prescription.manualPresentation) errors.push("Selecciona o captura una presentación.");
  if (numero(prescription.finalDoseMg) < 0) errors.push("La dosis no puede ser negativa.");
  if (prescription.presentation?.concentrationMgPerMl === 0) errors.push("La concentración no puede ser cero.");
  const split = validateTabletSplitting({ unitsPerDose: prescription.unitsPerDose, presentation: prescription.presentation });
  if (!split.ok) errors.push(split.message);
  if (prescription.allergies && normalizar(prescription.allergies).includes(normalizar(prescription.genericName).split(" ")[0])) {
    errors.push("Alergia grave potencial al medicamento seleccionado. Requiere anulación clínica documentada.");
  }
  if (prescription.comparison?.warnings?.length) warnings.push(...prescription.comparison.warnings);
  if (prescription.totalDailyDoseMg && prescription.maximumDailyDose && prescription.totalDailyDoseMg > prescription.maximumDailyDose) {
    warnings.push("La dosis diaria total supera el máximo diario configurado.");
  }
  if (prescription.finalDoseMg && prescription.maximumDosePerAdministration && prescription.finalDoseMg > prescription.maximumDosePerAdministration) {
    warnings.push("La dosis por toma supera el máximo por administración configurado.");
  }
  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}

export function formatPediatricPrescription(prescription) {
  if (!prescription?.genericName) return "";
  const unitsText = prescription.liquidVolume
    ? `${formatNumber(prescription.liquidVolume.roundedMl)} mL por toma`
    : prescription.unitsPerDose
      ? `${formatNumber(prescription.unitsPerDose.roundedUnits)} ${unidadSolida(prescription.presentation?.form)} por toma`
      : `${formatNumber(prescription.finalDoseMg)} mg por toma`;
  const marca = prescription.brandName && prescription.brandName !== "Genérico" ? ` Marca: ${prescription.brandName}.` : "";
  const horarios = prescription.customSchedule?.length ? ` Horarios: ${prescription.customSchedule.join(", ")}.` : "";
  const prn = prescription.isPrn ? ` PRN: ${prescription.prnReason || "según necesidad"}.` : "";
  return `${prescription.genericName}, ${prescription.presentationLabel || "presentación seleccionada"}.${marca} Administrar ${unitsText} (${formatNumber(prescription.finalDoseMg)} mg) vía ${prescription.route || "oral"}, ${frecuenciaTexto(prescription)}.${horarios}${prn}`;
}

export function buildPediatricPrescription(input) {
  const med = loadMedicationInformation(input.medicationId);
  const indication = med?.indications?.find((item) => item.indicationId === input.indicationId) || med?.indications?.[0];
  const scheme = selectDosingScheme(input.medicationId, indication?.indicationId, input.schemeIndex);
  const administrationsPerDay = calculateAdministrationsPerDay(input);
  const mode = input.dosingMode || scheme?.type || "mg_kg_dosis";
  const schemeValue = numero(input.doseValue) ?? scheme?.usual ?? scheme?.maximum;
  let doseResult = null;
  if (mode === "mg_kg_dosis" || mode === "mg_kg_dia") {
    doseResult = calculateDoseByWeight({ pesoKg: input.weightKg, value: schemeValue, administrationsPerDay, mode });
  } else if (mode === "mg_m2_dosis" || mode === "mg_m2_dia") {
    doseResult = calculateDoseByBsa({ pesoKg: input.weightKg, tallaCm: input.heightCm, value: schemeValue, administrationsPerDay, mode });
  } else if (mode === "mg_dia_manual") {
    doseResult = calculateDoseFromDailyTotal({ totalDailyDoseMg: input.manualDailyDoseMg, administrationsPerDay });
  } else {
    doseResult = applyManualDoseOverride({ finalDoseMg: input.manualDoseMg || input.finalDoseMg, administrationsPerDay });
  }
  const calculatedDoseMg = doseResult?.calculatedDoseMg || null;
  const finalDoseMg = numero(input.finalDoseMg) || calculatedDoseMg;
  const totalDailyDoseMg = calculateTotalDailyDose({ finalDoseMg, administrationsPerDay });
  const presentations = loadMedicationPresentations(input.medicationId, { route: input.route || scheme?.routes?.[0] || "" });
  const catalogPresentation = presentations.find((item) => item.presentationId === input.presentationId) || presentations[0] || null;
  const manualPresentation = input.manualPresentationText ? parseManualPresentation(input.manualPresentationText) : null;
  const presentation = manualPresentation || catalogPresentation;
  const liquidVolume = presentation?.concentrationMgPerMl ? calculateLiquidVolume({ finalDoseMg, presentation }) : null;
  const unitsPerDose = !liquidVolume ? calculateSolidUnits({ finalDoseMg, presentation }) : null;
  const comparison = compareDoseWithUsualRange({ finalDoseMg, pesoKg: input.weightKg, scheme, administrationsPerDay });
  const brandName = input.brandMode === "manual" ? input.manualBrandName : (input.brandName || "Genérico");
  const maximumDailyOptions = [
    scheme?.maxPerDay,
    scheme?.maxMgKgDay && numero(input.weightKg) ? scheme.maxMgKgDay * numero(input.weightKg) : null
  ].filter(Boolean);
  const prescription = {
    patientId: input.patientId || "",
    temporal: Boolean(input.temporal),
    medicationId: med?.medicationId || "",
    genericName: med?.genericName || "",
    brandName,
    indication: indication?.name || "",
    indicationId: indication?.indicationId || "",
    dosingMode: mode,
    weightKg: numero(input.weightKg),
    weightDate: input.weightDate || "",
    weightConfirmed: Boolean(input.weightConfirmed),
    dosePerKg: mode.includes("kg") ? schemeValue : null,
    calculatedDoseMg,
    finalDoseMg,
    totalDailyDoseMg,
    administrationsPerDay,
    intervalHours: numero(input.intervalHours),
    customSchedule: parseSchedule(input.customSchedule),
    route: input.route || scheme?.routes?.[0] || presentation?.routes?.[0] || "oral",
    presentationId: presentation?.presentationId || "manual",
    presentation,
    manualPresentation,
    presentationLabel: presentation?.unitStrength || input.manualPresentationText || "",
    pharmaceuticalForm: presentation?.form || "",
    amountMg: presentation?.amountMg || null,
    volumeMl: presentation?.volumeMl || null,
    concentrationMgPerMl: presentation?.concentrationMgPerMl || null,
    liquidVolume,
    unitsPerDose,
    duration: input.duration || "",
    durationUnit: input.durationUnit || "días",
    isPrn: Boolean(input.isPrn),
    prnReason: input.prnReason || "",
    maxPrnDosesPerDay: numero(input.maxPrnDosesPerDay),
    maximumDosePerAdministration: scheme?.maxPerDose || null,
    maximumDailyDose: maximumDailyOptions.length ? Math.min(...maximumDailyOptions) : null,
    manualDoseOverride: Boolean(input.manualDoseOverride || mode.includes("manual") || (numero(input.finalDoseMg) && calculatedDoseMg && Math.abs(numero(input.finalDoseMg) - calculatedDoseMg) > 0.01)),
    allergies: input.allergies || "",
    comparison,
    source: scheme?.source || med?.sources?.[0] || "",
    medicationInfo: med
  };
  const validation = validatePediatricPrescription(prescription);
  return {
    ...prescription,
    warnings: validation.warnings,
    errors: validation.errors,
    valid: validation.valid,
    instructionText: formatPediatricPrescription(prescription)
  };
}

export async function savePediatricPrescription({ db, addDoc, collection, serverTimestamp, patientId, prescription, createdBy }) {
  const payload = {
    ...prescription,
    patientId,
    createdBy,
    createdAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    updatedAt: serverTimestamp ? serverTimestamp() : new Date().toISOString()
  };
  return addDoc(collection(db, "usuarios", patientId, "prescripcionesPediatricas"), payload);
}

function parseSchedule(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function frecuenciaTexto(p) {
  if (p.intervalHours) return `cada ${formatNumber(p.intervalHours)} horas`;
  return `${formatNumber(p.administrationsPerDay)} ${p.administrationsPerDay === 1 ? "vez" : "veces"} al día`;
}

function unidadSolida(form = "") {
  if (normalizar(form).includes("caps")) return "cápsula(s)";
  if (normalizar(form).includes("supos")) return "supositorio(s)";
  if (normalizar(form).includes("amp")) return "ampolla(s)";
  return "tableta(s)";
}

function redondearDispositivo(value) {
  return Math.round(value * 10) / 10;
}

function inferForm(text) {
  if (text.includes("gota")) return "gotas";
  if (text.includes("susp")) return "suspensión";
  if (text.includes("sol")) return "solución";
  if (text.includes("amp")) return "ampolla";
  return "líquido";
}

function normalizarForma(value) {
  const text = normalizar(value);
  if (text.includes("cap")) return "cápsula";
  if (text.includes("tab")) return "tableta";
  return value;
}

function normalizar(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatNumber(value) {
  const n = numero(value);
  if (n === null) return "-";
  return String(Math.round(n * 100) / 100);
}
