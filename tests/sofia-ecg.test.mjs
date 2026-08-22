import assert from "node:assert/strict";
import test from "node:test";
import { buildPatientEcgInterpretation, extractElectrocardiograms } from "../js/clinical/ecg/ecgInterpretationCore.js";
import { calculateCorrectedQt } from "../js/clinical/ecg/qtcCalculator.js";
import { CALCULADORAS_MEDICAS } from "../js/data/calculadorasMedicas.js";
import { interpretPatientElectrocardiogram } from "../js/services/sofiaElectrocardiograma.js";

test("calcula QTc con una única implementación trazable", () => {
  const result = calculateCorrectedQt({ qtMs: 400, heartRate: 60 });
  assert.equal(result.calculable, true);
  assert.equal(result.primaryMethod, "fridericia");
  assert.equal(result.values.bazettMs, 400);
  assert.equal(result.values.fridericiaMs, 400);
  assert.equal(result.values.framinghamMs, 400);
  assert.equal(result.values.hodgesMs, 400);
  assert.equal(calculateCorrectedQt({ qtMs: 0, heartRate: 60 }).calculable, false);
  assert.equal(calculateCorrectedQt({ qtMs: 400, heartRate: 0 }).calculable, false);
});

test("la calculadora médica de QTc conserva su API y reutiliza el cálculo central", () => {
  const calculator = CALCULADORAS_MEDICAS.find((item) => item.id === "qt-corregido");
  const result = calculator.calculate({ qt: 400, fc: 60 });

  assert.equal(result.value, 400);
  assert.equal(result.category, "QTc Fridericia principal");
  assert.deepEqual(result.details, { Bazett: 400, Fridericia: 400, Framingham: 400, Hodges: 400 });
});

test("extrae únicamente estudios identificados como ECG", () => {
  const studies = extractElectrocardiograms([
    { nombre: "Radiografía", resultado: "Sin cambios" },
    { nombre: "Electrocardiograma", fecha: "2026-08-20", resultado: "Ritmo sinusal. FC 72 lpm. PR 160 ms. QRS 94 ms. QT 390 ms. QTc 420 ms." }
  ]);
  assert.equal(studies.length, 1);
  assert.equal(studies[0].measurements.heartRate.value, 72);
  assert.equal(studies[0].measurements.prMs.value, 160);
  assert.equal(studies[0].measurements.qrsMs.value, 94);
  assert.equal(studies[0].measurements.qtMs.value, 390);
  assert.equal(studies[0].measurements.qtcMs.value, 420);
  assert.match(studies[0].rhythm.value, /sinusal/i);
});

test("integra ECG, diagnóstico, laboratorio y señales del motor farmacológico sin atribuir causalidad", () => {
  const result = buildPatientEcgInterpretation({
    expediente: {
      paciente: { nombre: "Identidad que no debe salir", edad: 67, sexo: "femenino" },
      estudios: [{
        id: "ecg-private-id",
        nombre: "Electrocardiograma de Identidad que no debe salir",
        fecha: "2026-08-20",
        frecuenciaCardiaca: 80,
        intervaloPR: 180,
        qrs: 100,
        qt: 450,
        qtc: 510,
        resultado: "Ritmo sinusal. Paciente: Identidad que no debe salir."
      }],
      laboratorios: [{ analito: "Potasio", valor: 3.2, unidad: "mmol/L", rangoReferencia: "3.5 - 5.1", fecha: "2026-08-20" }]
    },
    diagnoses: [{ texto: "Insuficiencia cardiaca", estado: "confirmado" }],
    medicationAssessment: {
      medicamentosNormalizados: [{ textoOriginal: "Medicamento documentado", nombresIngredientes: ["Medicamento documentado"], riesgos: { qt: 2 } }],
      alertas: [{ titulo: "Combinación con riesgo de QT", severidad: "alta", medicamentos: ["Medicamento documentado"], efecto: "Puede sumar prolongación QT.", recomendacion: "Revisar ECG y electrolitos.", fuentes: ["Fuente farmacológica local"] }],
      cobertura: { total: 1, fuenteVerificada: 1, fuentePendiente: 0, sinReglaIngrediente: 0 }
    }
  });

  assert.equal(result.status, "available");
  assert.equal(result.dataQuality.waveformAvailable, false);
  assert.ok(result.measurements.some((item) => item.key === "qtcMs" && item.value === 510));
  assert.ok(result.measurements.some((item) => item.key === "qtcFridericiaCalculated"));
  assert.ok(result.findings.some((item) => item.id === "qtc-500" && item.level === "prioritario"));
  assert.equal(result.context.diagnoses[0].category, "Enfermedad cardiaca");
  assert.deepEqual(result.context.medications.medications[0].possibleEffects, ["Repolarización / QT"]);
  assert.equal(result.context.laboratories[0].status, "low");
  assert.equal(result.clinicalWritesPerformed, false);
  assert.equal(result.directIdentifiersIncluded, false);
  assert.ok(!JSON.stringify(result).includes("Identidad que no debe salir"));
  assert.ok(!JSON.stringify(result).includes("ecg-private-id"));
});

test("usa los límites superiores AHA/ACCF del percentil 99 sin mezclar umbrales", () => {
  const belowMaleLimit = buildPatientEcgInterpretation({
    expediente: {
      paciente: { edad: 40, sexo: "masculino" },
      estudios: [{ nombre: "ECG", qtc: 460, resultado: "Ritmo sinusal. QTc 460 ms." }]
    }
  });
  assert.ok(!belowMaleLimit.findings.some((item) => item.id === "qtc-prolonged"));

  const atFemaleLimit = buildPatientEcgInterpretation({
    expediente: {
      paciente: { edad: 40, sexo: "femenino" },
      estudios: [{ nombre: "ECG", qtc: 480, resultado: "Ritmo sinusal. QTc 480 ms." }]
    }
  });
  assert.ok(atFemaleLimit.findings.some((item) => item.id === "qtc-prolonged"));
});

test("el adaptador reutiliza diagnósticos y el motor farmacológico unificado", () => {
  const result = interpretPatientElectrocardiogram({
    paciente: { edad: 40, sexo: "femenino", diagnostico: { codigo: "I10" } },
    estudios: [{ nombre: "ECG", resultado: "Ritmo sinusal. FC 70 lpm. QT 400 ms." }],
    tratamientos: [{ medicamento: "Olanzapina 10 mg", estado: "activo" }],
    laboratorios: []
  });

  assert.equal(result.qtcCalculation.primaryValueMs, 421);
  assert.ok(result.context.diagnoses.some((item) => item.category === "Contexto cardiovascular"));
  assert.ok(result.context.medications.medications.some((item) => item.medication === "Olanzapina"));
  assert.ok(result.context.medications.alerts.length > 0);
});

test("no calcula QTc desde un solo RR si el ritmo está documentado como irregular", () => {
  const result = buildPatientEcgInterpretation({
    expediente: {
      paciente: { edad: 50, sexo: "masculino" },
      estudios: [{ nombre: "ECG", fecha: "2026-08-20", resultado: "Fibrilación auricular. FC 90 lpm. QT 410 ms." }]
    }
  });
  assert.equal(result.qtcCalculation, null);
  assert.ok(result.findings.some((item) => item.id === "irregular-rhythm"));
  assert.ok(result.limitations.some((item) => /único RR/i.test(item)));
  assert.ok(!result.measurements.some((item) => item.key === "qtcFridericiaCalculated"));
});

test("dato desconocido no se convierte en normal y no aplica referencias adultas a pediatría", () => {
  const pediatric = buildPatientEcgInterpretation({
    expediente: {
      paciente: { edad: 12, sexo: "femenino" },
      estudios: [{ nombre: "EKG", qtc: 480, resultado: "QTc 480 ms." }]
    }
  });
  assert.ok(pediatric.findings.some((item) => item.id === "adult-reference-not-applied"));
  assert.ok(!pediatric.findings.some((item) => item.id === "qtc-prolonged"));

  const missing = buildPatientEcgInterpretation({ expediente: { paciente: {}, estudios: [] } });
  assert.equal(missing.status, "ecg_not_found");
  assert.equal(missing.measurements.length, 0);
  assert.deepEqual(missing.missingData, ["Electrocardiograma identificado con informe o mediciones estructuradas."]);
  assert.equal(missing.dataQuality.unknownIsNotNormal, true);
});
