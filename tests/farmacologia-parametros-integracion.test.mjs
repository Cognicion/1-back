import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CATALOGO_DIAGNOSTICOS } from "../js/data/catalogoDiagnosticos.js";
import { COBERTURA_FARMACOLOGICA, obtenerMedicamentoPorId } from "../js/data/catalogoFarmacologicoUnificado.js";
import { detectarAlertasClinicasMedicamentos } from "../js/data/interaccionesFarmacologicas.js";
import {
  evaluarMedicamentosPaciente,
  normalizarMedicamentoClinico
} from "../js/services/motorClinicoMedicamentos.js";

const evaluar = (paciente, medicamentos) => evaluarMedicamentosPaciente({ paciente, medicamentos });
const porTitulo = (resultado, patron) => resultado.alertas.find((alerta) => patron.test(alerta.titulo || ""));
const raiz = new URL("../", import.meta.url);
const leer = (ruta) => readFile(new URL(ruta, raiz), "utf8");

test("A00.1 + furosemida produce una precaución alta, trazable y no una contraindicación absoluta", () => {
  const resultado = evaluar(
    { diagnosticos: [{ codigo: "A00.1", nombre: "Cólera debido a Vibrio cholerae O1, biotipo El Tor" }] },
    [{ medicamento: "Furosemida 40 mg" }],
  );
  const alerta = porTitulo(resultado, /Cólera y diurético/i);

  assert.ok(alerta);
  assert.equal(alerta.severidad, "alta");
  assert.equal(alerta.tipo, "precaucion_contextual");
  assert.match(`${alerta.efecto} ${alerta.recomendacion}`, /deshidrat|hidroelectrol|creatinina|eGFR/i);
  assert.ok(alerta.fuentes.some((fuente) => /cdc/i.test(fuente)));
  assert.ok(alerta.fuentes.some((fuente) => /dailymed/i.test(fuente)));
  assert.equal(resultado.cobertura.paresMedicamentoDiagnosticoSinRegla, 0);
  assert.equal(resultado.indicador.estado, "alto");
  assert.equal(resultado.alertas.some((item) => item.tipo === "contraindicacion"), false);
});

test("un diagnóstico CIE escrito como texto conserva el código y activa la misma regla", () => {
  const resultado = evaluar(
    { diagnosticos: "A00.1 - Cólera debido a Vibrio cholerae O1, biotipo El Tor" },
    [{ medicamento: "Furosemida" }],
  );

  assert.equal(resultado.diagnosticosEvaluados[0]?.codigo, "A00.1");
  assert.ok(porTitulo(resultado, /Cólera y diurético/i));
});

test("un antecedente remoto de cólera no se interpreta como pérdida gastrointestinal activa", () => {
  const resultado = evaluar(
    { diagnosticos: [{ codigo: "A00.1", nombre: "Cólera previa", estado: "antecedente" }] },
    [{ medicamento: "Furosemida" }],
  );

  assert.equal(porTitulo(resultado, /Cólera y diurético/i), undefined);
});

test("la alerta de clase para otro diurético declara pendiente la fuente específica por molécula", () => {
  const resultado = evaluar(
    { diagnosticos: [{ codigo: "A00.1", nombre: "Cólera activa" }] },
    [{ medicamento: "Hidroclorotiazida" }],
  );
  const alerta = porTitulo(resultado, /Cólera y diurético/i);

  assert.ok(alerta);
  assert.match(alerta.confianza, /molécula/i);
  assert.ok(alerta.fuentes.some((fuente) => /Fuente específica pendiente/i.test(fuente)));
});

test("el catálogo CIE enlaza todas las subcategorías de cólera con la regla diurética", () => {
  for (const codigo of ["A00.0", "A00.1", "A00.9"]) {
    const diagnostico = CATALOGO_DIAGNOSTICOS.find((item) => item.sistemas?.cie10?.codigo === codigo);
    assert.ok(diagnostico, codigo);
    assert.equal(diagnostico.farmacologia?.estadoCobertura, "reglas_especificas_disponibles");
    assert.ok(diagnostico.farmacologia?.categoriasRiesgo?.includes("perdidas_gastrointestinales"));
    assert.ok(diagnostico.farmacologia?.reglas?.some((regla) => regla.id === "diuretico_colera_perdidas"));
  }
});

test("los laboratorios estructurados alimentan función renal y electrolitos", () => {
  const resultado = evaluar(
    {
      laboratorios: [
        { analito: "Creatinina", valor: 2.1, unidad: "mg/dL", rangoReferencia: "0.6 - 1.3", fecha: "2026-09-04" },
        { analito: "Potasio", valor: 3.1, unidad: "mmol/L", rangoReferencia: "3.5 - 5.1", fecha: "2026-09-04" },
      ],
    },
    [{ medicamento: "Furosemida" }],
  );

  assert.equal(resultado.parametrosClinicos.porId.creatinina.estado, "alto");
  assert.equal(resultado.parametrosClinicos.porId.potasio.estado, "bajo");
  assert.ok(porTitulo(resultado, /Función renal reducida/i));
  assert.ok(porTitulo(resultado, /Potasio bajo/i));
});

test("creatinina aislada sin rango ni eGFR se marca como dato insuficiente, no como daño renal confirmado", () => {
  const resultado = evaluar(
    { creatinina: { valor: 2.1, unidad: "mg/dL" } },
    [{ medicamento: "Gabapentina 300 mg" }],
  );
  const alerta = porTitulo(resultado, /Creatinina sin eGFR\/rango/i);

  assert.ok(alerta);
  assert.equal(alerta.severidad, "baja");
  assert.match(alerta.efecto, /no debe inferirse automáticamente/i);
});

test("eGFR estructurada activa revisión renal y expone la categoría KDIGO", () => {
  const resultado = evaluar(
    { laboratorios: [{ analito: "eGFR", valor: 42, unidad: "mL/min/1.73 m²" }] },
    [{ medicamento: "Gabapentina 300 mg" }],
  );

  assert.equal(resultado.parametrosClinicos.categorias.eGFR.id, "G3b");
  assert.ok(porTitulo(resultado, /Función renal reducida/i));
});

test("albúmina baja solo activa la regla específica de fenitoína cuando el rango la sustenta", () => {
  const resultado = evaluar(
    { parametrosClinicos: { valores: { albumina: { valor: 2.7, unidad: "g/dL", rangoReferencia: "3.5 - 5.0" } } } },
    [{ medicamento: "Fenitoína 100 mg" }],
  );
  const alerta = porTitulo(resultado, /Fenitoína con albúmina baja/i);

  assert.ok(alerta);
  assert.equal(alerta.severidad, "alta");
  assert.ok(alerta.fuentes.some((fuente) => /fda/i.test(fuente)));
  assert.equal(resultado.cobertura.paresMedicamentoParametroConRegla, 1);
});

test("un parámetro anormal sin regla para el medicamento queda como cobertura incompleta", () => {
  const resultado = evaluar(
    { parametrosClinicos: { valores: { albumina: { valor: 2.7, unidad: "g/dL", rangoReferencia: "3.5 - 5.0" } } } },
    [{ medicamento: "Olanzapina 10 mg" }],
  );

  assert.equal(resultado.cobertura.parametrosClinicosRelevantes, 1);
  assert.equal(resultado.cobertura.paresMedicamentoParametroSinRegla, 1);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
  assert.equal(porTitulo(resultado, /Fenitoína con albúmina baja/i), undefined);
});

test("una inconsistencia de proteínas sin rangos no produce un indicador verde", () => {
  const resultado = evaluar(
    {
      parametrosClinicos: {
        valores: {
          proteinasTotales: { valor: 3, unidad: "g/dL" },
          albumina: { valor: 4, unidad: "g/dL" },
        },
      },
    },
    [{ medicamento: "Olanzapina" }],
  );

  assert.ok(resultado.cobertura.hallazgosParametrosNoInterpretables >= 1);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("una eGFR con unidad no indexada no activa revisión renal", () => {
  const resultado = evaluar(
    { laboratorios: [{ analito: "eGFR", resultado: "42 mL/min" }] },
    [{ medicamento: "Gabapentina 300 mg" }],
  );

  assert.equal(resultado.parametrosClinicos.valoresCanonicos.eGFR, null);
  assert.equal(porTitulo(resultado, /función renal reducida/i), undefined);
  assert.ok(resultado.parametrosClinicos.hallazgos.some((item) => item.id === "parametro_egfr_unidad_no_compatible"));
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("la cobertura conserva el estado de datos insuficientes a través del adaptador legacy", () => {
  const resultado = detectarAlertasClinicasMedicamentos(
    [{ medicamento: "Paracetamol" }, { medicamento: "Pantoprazol" }],
    {},
  );

  assert.equal(resultado.alertas.filter((alerta) => alerta.tipo?.includes("interaccion")).length, 0);
  assert.equal(resultado.cobertura.paresMedicamentoMedicamentoSinRegla, 1);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("un diagnóstico sin categoría farmacológica queda explícitamente fuera de cobertura", () => {
  const resultado = evaluar(
    { diagnosticos: [{ codigo: "Z99.9", nombre: "Dependencia de dispositivo, no especificada" }] },
    [{ medicamento: "Furosemida" }],
  );

  assert.equal(resultado.cobertura.diagnosticosSinCategoriaFarmacologica, 1);
  assert.equal(resultado.cobertura.paresMedicamentoDiagnosticoSinRegla, 1);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("la normalización canónica no cuenta escitalopram ni ácido acetilsalicílico dos veces", () => {
  const escitalopram = normalizarMedicamentoClinico("Escitalopram 10 mg");
  const acidoAcetilsalicilico = normalizarMedicamentoClinico("Aspirina 100 mg");

  assert.deepEqual(escitalopram.ingredienteIds, ["escitalopram"]);
  assert.deepEqual(escitalopram.riesgos, { sangrado: 1, qt: 1 });
  assert.deepEqual(acidoAcetilsalicilico.ingredienteIds, ["acido_acetilsalicilico"]);
  assert.deepEqual(acidoAcetilsalicilico.riesgos, { sangrado: 2, renal: 1 });

  for (const [nombre, id] of [
    ["Apomorfina", "apomorfina"],
    ["Betametasona", "betametasona"],
    ["Desvenlafaxina", "desvenlafaxina"],
    ["Eritromicina", "eritromicina"],
    ["Fosinopril", "fosinopril"],
    ["Lansoprazol", "lansoprazol"],
    ["Loxapina", "loxapina"],
    ["Pentamidina", "pentamidina"]
  ]) {
    assert.deepEqual(normalizarMedicamentoClinico(nombre).ingredienteIds, [id], nombre);
  }

  const arni = normalizarMedicamentoClinico("Sacubitrilo/valsartán");
  assert.ok(arni.ingredienteIds.includes("sacubitrilo_valsartan"));
  assert.ok(arni.ingredienteIds.includes("valsartan"));
});

test("las presentaciones IM de olanzapina y ziprasidona conservan su vía", () => {
  for (const [id, dosis] of [["olanzapina", "10 mg"], ["ziprasidona", "20 mg"]]) {
    const presentacion = obtenerMedicamentoPorId(id).presentaciones.find((item) =>
      /frasco ampula IM/i.test(item.texto) && item.concentracion === dosis
    );
    assert.ok(presentacion, id);
    assert.equal(presentacion.via, "intramuscular", id);
  }
});

test("la cobertura distingue fuente verificada, parcial, pendiente y completitud real", () => {
  assert.equal(COBERTURA_FARMACOLOGICA.totalNormalizados, 374);
  assert.equal(COBERTURA_FARMACOLOGICA.conFuenteVerificada, 72);
  assert.equal(COBERTURA_FARMACOLOGICA.fuenteRegulatoriaParcial, 84);
  assert.equal(COBERTURA_FARMACOLOGICA.fuentePendienteEstricta, 218);
  assert.equal(COBERTURA_FARMACOLOGICA.fuentePendiente, 302);
  assert.deepEqual(COBERTURA_FARMACOLOGICA.idsCompletos, ["losartan"]);
});

test("las combinaciones conservan identidad y componentes para alergias y reglas", () => {
  const combinacion = normalizarMedicamentoClinico("Amoxicilina/clavulanato");
  const evaluacion = evaluar(
    { alergias: "Alergia a amoxicilina" },
    [{ medicamento: "Amoxicilina/clavulanato" }],
  );

  assert.ok(combinacion.ingredienteIds.includes("amoxicilina_clavulanato"));
  assert.ok(combinacion.ingredienteIds.includes("amoxicilina"));
  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "contraindicacion_alergia"));

  const arni = evaluar({}, [{ medicamento: "Sacubitrilo/valsartán" }]);
  assert.equal(arni.cobertura.fuenteVerificada, 0);
  assert.equal(arni.cobertura.fuentePendiente, 1);
});

test("negaciones parciales de alergia no ocultan una alergia positiva distinta", () => {
  const resultado = evaluar(
    { alergias: "Sin alergia a penicilina; alergia a furosemida; sin alergias adicionales" },
    [{ medicamento: "Furosemida" }],
  );

  assert.ok(resultado.alertas.some((alerta) => alerta.tipo === "contraindicacion_alergia"));
});

test("embarazo negado y diagnóstico en remisión no se convierten en condiciones activas", () => {
  const noEmbarazo = evaluar(
    { embarazo: "No" },
    [{ medicamento: "Valproato" }],
  );
  const hipertensionEnRemision = evaluar(
    { diagnosticos: [{ codigo: "I10", nombre: "Hipertensión", estado: "remisión" }] },
    [{ medicamento: "Atomoxetina" }],
  );

  assert.equal(noEmbarazo.alertas.some((alerta) => /embarazo/i.test(alerta.titulo)), false);
  assert.equal(hipertensionEnRemision.alertas.some((alerta) => /hipertensión/i.test(alerta.titulo)), false);
});

test("valproato en embarazo se clasifica por contexto y no como contraindicación absoluta universal", () => {
  const resultado = evaluar(
    { embarazo: true },
    [{ medicamento: "Valproato" }],
  );
  const alerta = porTitulo(resultado, /Valproato en embarazo/i);

  assert.ok(alerta);
  assert.equal(alerta.severidad, "alta");
  assert.equal(alerta.tipo, "precaucion_contextual");
  assert.match(alerta.efecto, /epilepsia|bipolar|migraña/i);
  assert.match(alerta.recomendacion, /no suspender bruscamente|migraña/i);
  assert.ok(alerta.fuentes.some((fuente) => /dailymed/i.test(fuente)));
  assert.equal(resultado.alertas.some((item) => item.tipo === "contraindicacion" && /valproato/i.test(item.titulo)), false);
});

test("un diurético sin resultados de vigilancia declara los parámetros esperados ausentes", () => {
  const resultado = evaluar({}, [{ medicamento: "Furosemida" }]);
  const ausentes = resultado.cobertura.parametrosEsperadosAusentes || [];

  assert.deepEqual(ausentes.map((item) => item.id).sort(), ["funcion_renal", "potasio", "sodio"]);
  assert.equal(resultado.cobertura.cantidadParametrosEsperadosAusentes, 3);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("un resultado preliminar activa la alerta, pero reduce confianza y evita una conclusión definitiva", () => {
  const resultado = evaluar(
    {
      laboratorios: [{
        analito: "Potasio",
        valor: 3.1,
        unidad: "mmol/L",
        rangoReferencia: "3.5 - 5.1",
        estadoResultado: "preliminar"
      }]
    },
    [{ medicamento: "Furosemida" }],
  );
  const alerta = porTitulo(resultado, /Potasio bajo/i);

  assert.ok(alerta);
  assert.match(alerta.titulo, /resultado preliminar/i);
  assert.match(alerta.confianza, /baja/i);
  assert.match(alerta.recomendacion, /confirm/i);
  assert.ok(resultado.parametrosClinicos.hallazgos.some((item) => item.estado === "dato_preliminar"));
  assert.ok(resultado.cobertura.hallazgosParametrosNoInterpretables >= 1);
});

test("la regla de sodio no se extiende a todos los serotoninérgicos sin sustento específico", () => {
  const resultado = evaluar(
    { laboratorios: [{ analito: "Sodio", valor: 128, unidad: "mmol/L", rangoReferencia: "135 - 145" }] },
    [{ medicamento: "Sumatriptán" }],
  );

  assert.equal(porTitulo(resultado, /Sodio bajo/i), undefined);
  assert.equal(resultado.cobertura.paresMedicamentoParametroSinRegla, 1);
});

test("diagnósticos repetidos por código se concilian sin duplicar el prefijo", () => {
  const resultado = evaluar(
    {
      diagnosticos: [{ codigo: "I10", nombre: "Hipertensión", estado: "confirmado" }],
      comorbilidades: [{ codigo: "I10", texto: "I10 - Hipertensión arterial", estado: "confirmado" }]
    },
    [{ medicamento: "Atomoxetina" }],
  );

  assert.equal(resultado.diagnosticosEvaluados.filter((item) => item.codigo === "I10").length, 1);
  assert.equal(resultado.diagnosticosEvaluados[0].texto.startsWith("I10 - I10"), false);
});

test("prescripciones distintas del mismo principio se conservan sin duplicar el análisis", () => {
  const resultado = evaluar(
    {},
    ["Olanzapina 5 mg", "Olanzapina 10 mg", "Olanzapina 5 mg"],
  );

  assert.equal(resultado.medicamentosNormalizados.length, 2);
  assert.equal(resultado.principiosActivosNormalizados.length, 1);
  assert.equal(resultado.cobertura.prescripcionesDistintas, 2);
  assert.ok(resultado.alertas.some((alerta) => alerta.id.startsWith("duplicidad_exacta:")));
  assert.ok(resultado.alertas.some((alerta) => alerta.id.startsWith("duplicidad:")));
});

test("reglas equivalentes del mismo riesgo se consolidan por par y categoría", () => {
  const litioDiuretico = evaluar({}, ["Litio", "Furosemida"]);
  const aasIsrs = evaluar({}, ["Ácido acetilsalicílico", "Sertralina"]);

  assert.equal(litioDiuretico.alertas.filter((alerta) => alerta.titulo === "Litio + diurético").length, 1);
  assert.equal(aasIsrs.alertas.filter((alerta) => alerta.categoria === "hemorragica" && alerta.tipo.includes("interaccion")).length, 1);
});

test("combinaciones contraindicadas con fuente se separan de las interacciones generales", () => {
  const resultado = evaluar({}, ["Enalapril", "Sacubitrilo/valsartán"]);
  const absoluta = resultado.alertas.find((alerta) => /combinación contraindicada/i.test(alerta.titulo));

  assert.ok(absoluta);
  assert.equal(absoluta.tipo, "contraindicacion_absoluta_combinacion");
  assert.ok(absoluta.fuentes.length > 0);
});

test("un medicamento canónico sin regla directa conserva identidad y declara cobertura incompleta", () => {
  const resultado = evaluar({}, [{ medicamento: "Apomorfina" }]);

  assert.deepEqual(resultado.medicamentosNormalizados[0].ingredienteIds, ["apomorfina"]);
  assert.equal(resultado.cobertura.sinReglaIngrediente, 1);
  assert.equal(resultado.indicador.estado, "datos_insuficientes");
});

test("SOFIA y ECG consumen el mismo expediente, parámetros y cobertura del motor", async () => {
  const [sofiaClinica, sofia, ecg] = await Promise.all([
    leer("js/services/sofiaClinica.js"),
    leer("js/sofia.js"),
    leer("js/services/sofiaElectrocardiograma.js")
  ]);

  assert.match(sofiaClinica, /construirContextoFarmacologicoExpediente\(expediente\)/);
  assert.match(sofiaClinica, /paresMedicamentoParametroSinRegla/);
  assert.match(sofiaClinica, /hallazgosParametrosNoInterpretables/);
  assert.match(sofiaClinica, /fuentesContextoFarmacologicoNoDisponibles/);
  assert.match(sofiaClinica, /cantidadParametrosEsperadosAusentes/);
  assert.match(sofiaClinica, /cobertura_farmacologica_incompleta/);
  assert.match(sofia, /clinicalParameters:/);
  assert.match(sofia, /derivedClinicalParameters:/);
  assert.match(sofia, /clinicalParameterFindings:/);
  assert.match(ecg, /expediente\.laboratorios/);
  assert.match(ecg, /expediente\.estudios/);
});
