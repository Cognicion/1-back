import { CATALOGO_MEDICAMENTOS_PEDIATRICOS } from "./catalogoMedicamentosPediatricos.js";
import { MEDICAMENTOS_MAESTROS, normalizarNombreMedicamento, textoMedicamentoParaBusqueda } from "../data/medicamentos.js";
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

export function normalizeSearchText(value = "") {
  return normalizarNombreMedicamento(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function crearIdMedicamento(nombre = "") {
  return normalizeSearchText(nombre).replace(/\s+/g, "_") || `med_${Date.now()}`;
}

function normalizarPresentacionesMaestras(medicamento) {
  const presentaciones = Array.isArray(medicamento.presentaciones) ? medicamento.presentaciones : [];
  return presentaciones.map((presentacion, index) => {
    const texto = typeof presentacion === "string" ? presentacion : presentacion?.texto || "";
    return {
      presentationId: `${crearIdMedicamento(medicamento.nombre || medicamento.genericName)}_${index}`,
      form: inferForm(texto),
      unitStrength: texto || "Presentación no especificada",
      amountMg: extraerMg(texto),
      volumeMl: extraerMl(texto),
      concentrationMgPerMl: extraerConcentracionMgMl(texto),
      routes: [presentacion?.via || "oral"].filter(Boolean),
      brands: medicamento.brandNames || [],
      active: true,
      source: "Catálogo maestro de COGNICIÓN"
    };
  });
}

function normalizarMedicamentoMaestro(medicamento) {
  const nombre = medicamento.genericName || medicamento.nombre || "";
  const medicationId = crearIdMedicamento(nombre);
  return {
    medicationId,
    genericName: nombre,
    synonyms: medicamento.synonyms || [],
    drugClass: medicamento.clase || medicamento.therapeuticClasses?.[0] || "",
    mechanism: medicamento.notas || "",
    routes: ["oral"],
    indications: [],
    presentations: normalizarPresentacionesMaestras(medicamento),
    contraindications: medicamento.contraindications || medicamento.contraindicaciones || [],
    precautions: medicamento.precautions || medicamento.precauciones || [],
    interactions: medicamento.interactions || medicamento.interacciones || [],
    adverseEffects: medicamento.adverseEffects || [],
    sources: ["Catálogo maestro de COGNICIÓN"],
    pediatricStatus: "missing",
    masterMedication: medicamento
  };
}

export function normalizeCommercialPresentation(presentation = {}) {
  const activeIngredientUnit = presentation.activeIngredientUnit || (presentation.amountMg ? "mg" : "");
  const referenceVolumeUnit = presentation.referenceVolumeUnit || (presentation.volumeMl ? "mL" : "");
  const amountMg = presentation.activeIngredientAmount && activeIngredientUnit
    ? convertirAMg(presentation.activeIngredientAmount, activeIngredientUnit)
    : numero(presentation.amountMg);
  const referenceVolume = numero(presentation.referenceVolume ?? presentation.volumeMl);
  const concentrationMgPerMl = numero(presentation.concentrationMgPerMl)
    ?? (amountMg && referenceVolume && referenceVolumeUnit.toLowerCase() === "ml" ? amountMg / referenceVolume : null);
  const pharmaceuticalForm = presentation.pharmaceuticalForm || presentation.form || inferForm(presentation.unitStrength || presentation.commercialStrength || "");
  return {
    ...presentation,
    pharmaceuticalForm,
    form: pharmaceuticalForm,
    amountMg,
    volumeMl: referenceVolumeUnit.toLowerCase() === "ml" ? referenceVolume : presentation.volumeMl,
    concentrationMgPerMl,
    routes: presentation.routes || presentation.route || ["oral"],
    brands: presentation.brands || [presentation.brandName || "Genérico"].filter(Boolean),
    brandName: presentation.brandName || presentation.brands?.[0] || "Genérico",
    commercialStrength: presentation.commercialStrength || presentation.unitStrength || "",
    unitStrength: presentation.unitStrength || presentation.commercialStrength || "",
    packageLabel: presentation.packageLabel || formatearEnvase(presentation)
  };
}

export function formatPresentationOption(presentation = {}) {
  const p = normalizeCommercialPresentation(presentation);
  const nombre = p.commercialName || `${p.brandName || "Genérico"} ${p.pharmaceuticalForm || "presentación"}`;
  const fuerza = p.commercialStrength || p.unitStrength || "concentración no especificada";
  const normalizada = p.concentrationMgPerMl ? `${formatNumber(p.concentrationMgPerMl)} mg/mL` : "";
  const envase = p.packageLabel || formatearEnvase(p);
  return [nombre, [fuerza, normalizada, envase].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
}

export function validatePresentationConsistency(presentation = {}) {
  const p = normalizeCommercialPresentation(presentation);
  const issues = [];
  const form = normalizar(p.pharmaceuticalForm || p.form || "");
  const strength = normalizar([p.commercialStrength, p.unitStrength].filter(Boolean).join(" "));
  const isLiquid = ["jarabe", "suspension", "solucion", "gotas"].some((item) => form.includes(item));
  const isSolid = ["tableta", "capsula"].some((item) => form.includes(item));
  if (isLiquid && !p.concentrationMgPerMl) {
    issues.push("La presentación líquida no tiene concentración normalizada.");
  }
  if (isLiquid && /\b(tableta|tabletas|capsula|capsulas)\b/.test(strength)) {
    issues.push("La presentación líquida tiene una descripción incompatible con tabletas o cápsulas.");
  }
  if (isSolid && p.concentrationMgPerMl) {
    issues.push("La presentación sólida no debe expresarse como mg/mL.");
  }
  if (isSolid && (strength.includes("mg/ml") || strength.includes("mg / ml") || strength.includes("mg/5 ml") || p.volumeMl)) {
    issues.push("La presentación sólida tiene concentración o volumen de una forma líquida.");
  }
  if (form.includes("suspension") && !p.volumeMl && !p.referenceVolume) {
    issues.push("La suspensión requiere volumen de referencia.");
  }
  if (form.includes("gotas") && !p.concentrationMgPerMl) {
    issues.push("Las gotas requieren equivalencia de concentración.");
  }
  if (form.includes("capsula") && p.divisible === true) {
    issues.push("No marcar cápsula como divisible sin validación específica.");
  }
  return { ok: issues.length === 0, issues };
}

function unirCatalogoPediatricoYMaestro() {
  const indice = new Map();
  CATALOGO_MEDICAMENTOS_PEDIATRICOS.forEach((medicamento) => {
    indice.set(normalizeSearchText(medicamento.genericName), {
      ...medicamento,
      pediatricStatus: medicamento.indications?.some((ind) => ind.dosingSchemes?.length) ? "validated" : "partial"
    });
  });
  MEDICAMENTOS_MAESTROS.forEach((medicamento) => {
    const normalizado = normalizeSearchText(medicamento.genericName || medicamento.nombre);
    const claveCompatible = Array.from(indice.keys()).find((key) => key === normalizado || key.includes(normalizado) || normalizado.includes(key));
    const maestro = normalizarMedicamentoMaestro(medicamento);
    if (claveCompatible) {
      const existente = indice.get(claveCompatible);
      indice.set(claveCompatible, {
        ...existente,
        presentations: [...(existente.presentations || []), ...(maestro.presentations || [])],
        synonyms: Array.from(new Set([...(existente.synonyms || []), ...(maestro.synonyms || []), medicamento.nombre, medicamento.genericName].filter(Boolean))),
        contraindications: Array.from(new Set([...(existente.contraindications || []), ...(maestro.contraindications || [])])),
        interactions: Array.from(new Set([...(existente.interactions || []), ...(maestro.interactions || [])])),
        masterMedication: medicamento
      });
    } else {
      indice.set(normalizado, maestro);
    }
  });
  return Array.from(indice.values()).sort((a, b) => a.genericName.localeCompare(b.genericName, "es"));
}

export const CATALOGO_FARMACOLOGICO_PEDIATRIA = unirCatalogoPediatricoYMaestro();

export function estadoPediatricoMedicamento(medicamento) {
  if (medicamento?.pediatricStatus === "validated") return "Dosis pediátrica validada";
  if (medicamento?.pediatricStatus === "partial") return "Información pediátrica parcial";
  return "Sin dosis pediátrica cargada";
}

export function searchPediatricMedication(query, catalog = CATALOGO_FARMACOLOGICO_PEDIATRIA) {
  const q = normalizeSearchText(query);
  if (!q) return catalog;
  return catalog
    .map((med) => {
      const nombre = normalizeSearchText(med.genericName);
      const marcas = normalizeSearchText((med.presentations || []).flatMap((presentation) => presentation.brands || []).join(" "));
      const sinonimos = normalizeSearchText((med.synonyms || []).join(" "));
      let score = 0;
      if (nombre === q) score += 120;
      else if (nombre.startsWith(q)) score += 90;
      else if (nombre.includes(q)) score += 70;
      if (marcas.split(" ").some((brand) => brand === q)) score += 80;
      else if (marcas.includes(q)) score += 55;
      if (sinonimos.includes(q)) score += 45;
      if (normalizeSearchText(med.drugClass).includes(q)) score += 28;
      const texto = [
        med.genericName,
        med.drugClass,
        med.mechanism,
      estadoPediatricoMedicamento(med),
      med.masterMedication ? textoMedicamentoParaBusqueda(med.masterMedication) : "",
      ...(med.synonyms || []),
        ...(med.indications || []).map((ind) => ind.name),
        ...(med.presentations || []).flatMap((presentation) => presentation.brands || [])
      ].flat().join(" ");
      if (normalizeSearchText(texto).includes(q)) score += 12;
      if (score > 0 && estadoPediatricoMedicamento(med).includes("validada")) score += 4;
      return { med, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.med.genericName.localeCompare(b.med.genericName, "es"))
    .map((item) => item.med);
}

export function loadMedicationInformation(medicationId, catalog = CATALOGO_FARMACOLOGICO_PEDIATRIA) {
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
  return (med?.presentations || []).map(normalizeCommercialPresentation).filter((presentation) => {
    if (presentation.active === false) return false;
    if (route && !(presentation.routes || []).includes(route)) return false;
    return edadAnos === null || edadAnos === undefined || true;
  });
}

export function loadBrandsForMedication(medicationId) {
  const med = loadMedicationInformation(medicationId);
  const brands = (med?.presentations || [])
    .map(normalizeCommercialPresentation)
    .filter((presentation) => presentation.active !== false)
    .map((presentation) => presentation.brandName || presentation.brands?.[0] || "Genérico")
    .filter(Boolean);
  return Array.from(new Set(brands)).sort((a, b) => a.localeCompare(b, "es"));
}

export function loadBrandsForPresentation(medicationId, presentationId) {
  const presentation = loadMedicationPresentations(medicationId).find((item) => item.presentationId === presentationId);
  return [presentation?.brandName, ...(presentation?.brands || []), ...loadBrandsForMedication(medicationId)]
    .filter(Boolean)
    .filter((brand, index, arr) => arr.indexOf(brand) === index);
}

export function loadPresentationsForBrand(medicationId, brandName = "", options = {}) {
  const normalizedBrand = normalizeSearchText(brandName || "");
  return loadMedicationPresentations(medicationId, options).filter((presentation) => {
    if (!normalizedBrand || normalizedBrand === "manual") return true;
    const brands = [presentation.brandName, ...(presentation.brands || [])].filter(Boolean).map(normalizeSearchText);
    return brands.includes(normalizedBrand);
  });
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

export function buildManualCommercialPresentation(input = {}) {
  const activeIngredientAmount = numero(input.activeIngredientAmount ?? input.manualActiveIngredientAmount);
  const referenceVolume = numero(input.referenceVolume ?? input.manualReferenceVolume);
  const activeIngredientUnit = input.activeIngredientUnit || input.manualActiveIngredientUnit || "mg";
  const referenceVolumeUnit = input.referenceVolumeUnit || input.manualReferenceVolumeUnit || "mL";
  const amountMg = activeIngredientAmount ? convertirAMg(activeIngredientAmount, activeIngredientUnit) : null;
  const concentrationMgPerMl = amountMg && referenceVolume && referenceVolumeUnit.toLowerCase() === "ml"
    ? amountMg / referenceVolume
    : null;
  return normalizeCommercialPresentation({
    presentationId: "manual",
    medicationId: input.medicationId || "",
    genericName: input.genericName || "",
    brandName: input.brandName || input.manualBrandName || "Marca manual",
    country: input.country || "México",
    pharmaceuticalForm: input.pharmaceuticalForm || input.manualPharmaceuticalForm || input.form || "otra",
    commercialName: input.commercialName || input.manualCommercialName || input.brandName || "Presentación manual",
    activeIngredientAmount,
    activeIngredientUnit,
    referenceVolume,
    referenceVolumeUnit,
    amountMg,
    volumeMl: referenceVolumeUnit.toLowerCase() === "ml" ? referenceVolume : null,
    concentrationMgPerMl,
    commercialStrength: input.commercialStrength || formatearFuerzaComercial({ activeIngredientAmount, activeIngredientUnit, referenceVolume, referenceVolumeUnit }),
    unitStrength: input.commercialStrength || formatearFuerzaComercial({ activeIngredientAmount, activeIngredientUnit, referenceVolume, referenceVolumeUnit }),
    packageContent: numero(input.packageContent ?? input.manualPackageContent),
    packageUnit: input.packageUnit || input.manualPackageUnit || "",
    routes: [input.route || "oral"],
    route: [input.route || "oral"],
    source: "Captura manual para la orden actual",
    sourceType: "manual_no_validado",
    active: true,
    manual: true
  });
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

export function calculatePackagingNeed({ volumePerDoseMl, administrationsPerDay, durationValue, durationUnit, packageContent }) {
  const volumen = numero(volumePerDoseMl);
  const tomas = Math.max(1, numero(administrationsPerDay) || 1);
  const duracion = numero(durationValue);
  const contenido = numero(packageContent);
  if (!volumen || !duracion || !contenido) return null;
  const factorDias = durationUnit === "horas" ? duracion / 24
    : durationUnit === "semanas" ? duracion * 7
      : durationUnit === "meses" ? duracion * 30
        : durationUnit === "dosis_unica" ? 1 / tomas
          : duracion;
  const totalVolumeMl = volumen * tomas * factorDias;
  const packagesNeeded = Math.ceil(totalVolumeMl / contenido);
  return {
    totalVolumeMl,
    packagesNeeded,
    leftoverMl: (packagesNeeded * contenido) - totalVolumeMl
  };
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
  const marca = prescription.brandName && prescription.brandName !== "Genérico" ? `marca ${prescription.brandName}, ` : "";
  const horarios = prescription.customSchedule?.length ? ` Horarios: ${prescription.customSchedule.join(", ")}.` : "";
  const prn = prescription.isPrn ? ` PRN: ${prescription.prnReason || "según necesidad"}.` : "";
  const duracion = durationText(prescription);
  return `${prescription.genericName}, ${marca}${prescription.presentationLabel || "presentación seleccionada"}. Administrar ${unitsText}, equivalentes a ${formatNumber(prescription.finalDoseMg)} mg, por vía ${prescription.route || "oral"} ${frecuenciaTexto(prescription)}${duracion}.${horarios}${prn}`;
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
  const presentations = loadPresentationsForBrand(input.medicationId, input.brandName, { route: input.route || scheme?.routes?.[0] || "" });
  const catalogPresentation = presentations.find((item) => item.presentationId === input.presentationId) || presentations[0] || null;
  const manualStructured = input.presentationId === "manual" && (input.manualActiveIngredientAmount || input.manualPresentationText)
    ? buildManualCommercialPresentation({
      medicationId: input.medicationId,
      genericName: med?.genericName || "",
      brandName: input.manualBrandName || input.brandName,
      pharmaceuticalForm: input.manualPharmaceuticalForm,
      activeIngredientAmount: input.manualActiveIngredientAmount,
      activeIngredientUnit: input.manualActiveIngredientUnit,
      referenceVolume: input.manualReferenceVolume,
      referenceVolumeUnit: input.manualReferenceVolumeUnit,
      packageContent: input.manualPackageContent,
      packageUnit: input.manualPackageUnit,
      commercialStrength: input.manualPresentationText,
      route: input.route || "oral"
    })
    : null;
  const manualPresentation = manualStructured || (input.manualPresentationText ? parseManualPresentation(input.manualPresentationText) : null);
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
    brandName: presentation?.brandName || brandName,
    commercialPresentationName: presentation?.commercialName || "",
    commercialStrength: presentation?.commercialStrength || presentation?.unitStrength || "",
    packageContent: presentation?.packageContent || null,
    packageUnit: presentation?.packageUnit || "",
    indication: indication?.name || input.indication || "Indicación no especificada",
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
    presentationLabel: formatPresentationLabel(presentation) || input.manualPresentationText || "",
    pharmaceuticalForm: presentation?.form || "",
    amountMg: presentation?.amountMg || null,
    volumeMl: presentation?.volumeMl || null,
    concentrationMgPerMl: presentation?.concentrationMgPerMl || null,
    liquidVolume,
    unitsPerDose,
    duration: input.duration || "",
    durationValue: input.durationValue ?? input.duration ?? "",
    durationUnit: input.durationUnit || "días",
    durationManualText: input.durationManualText || "",
    isContinuous: input.durationUnit === "continuo" || Boolean(input.isContinuous),
    isSingleDose: input.durationUnit === "dosis_unica" || Boolean(input.isSingleDose),
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
  prescription.packagingNeed = liquidVolume ? calculatePackagingNeed({
    volumePerDoseMl: liquidVolume.roundedMl,
    administrationsPerDay,
    durationValue: prescription.durationValue,
    durationUnit: prescription.durationUnit,
    packageContent: prescription.packageContent
  }) : null;
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

export function durationText(p = {}) {
  if (p.isSingleDose || p.durationUnit === "dosis_unica") return " en dosis única";
  if (p.isContinuous || p.durationUnit === "continuo") return " de forma continua hasta nueva indicación";
  if (p.durationUnit === "hasta_nueva_indicacion") return " hasta nueva indicación";
  if (p.durationUnit === "personalizado") return p.durationManualText ? ` ${p.durationManualText}` : "";
  const value = p.durationValue ?? p.duration;
  if (!value) return "";
  const unit = p.durationUnit === "dias" ? "días" : (p.durationUnit || "días");
  return ` durante ${value} ${unit}`;
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

function extraerMg(text = "") {
  const match = String(text).replace(",", ".").match(/([\d.]+)\s*mg/i);
  return match ? Number(match[1]) : null;
}

function extraerMl(text = "") {
  const match = String(text).replace(",", ".").match(/\/\s*([\d.]+)\s*m?l/i);
  return match ? Number(match[1]) : null;
}

function extraerConcentracionMgMl(text = "") {
  const mg = extraerMg(text);
  const ml = extraerMl(text);
  return mg && ml ? mg / ml : null;
}

function convertirAMg(value, unit = "mg") {
  const n = numero(value);
  if (!n) return null;
  const u = normalizar(unit);
  if (u === "g" || u.includes("gramo")) return n * 1000;
  if (u.includes("mcg") || u.includes("micro")) return n / 1000;
  return n;
}

function formatearFuerzaComercial({ activeIngredientAmount, activeIngredientUnit, referenceVolume, referenceVolumeUnit }) {
  if (!activeIngredientAmount || !activeIngredientUnit) return "";
  if (!referenceVolume || !referenceVolumeUnit) return `${activeIngredientAmount} ${activeIngredientUnit}`;
  return `${activeIngredientAmount} ${activeIngredientUnit}/${referenceVolume} ${referenceVolumeUnit}`;
}

function formatearEnvase(presentation = {}) {
  const content = presentation.packageContent;
  const unit = presentation.packageUnit;
  return content && unit ? `frasco ${content} ${unit}` : "";
}

function formatPresentationLabel(presentation = {}) {
  if (!presentation) return "";
  const p = normalizeCommercialPresentation(presentation);
  const name = p.commercialName || p.pharmaceuticalForm || "presentación";
  const strength = p.commercialStrength || p.unitStrength || "";
  const packageLabel = p.packageLabel || formatearEnvase(p);
  return [name, strength, packageLabel].filter(Boolean).join(", ");
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
