import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGO_FARMACOLOGICO_MAESTRO,
  CATALOGO_FARMACOLOGICO_OFICIAL,
  buscarMedicamentos,
  medicamentoPorTexto
} from "../js/data/catalogoFarmacologicoUnificado.js";
import {
  evaluarInteraccionesClinicas,
  normalizarMedicamentoClinico
} from "../js/services/motorClinicoMedicamentos.js";

const IECA_ATC_C09AA = [
  "captopril",
  "enalapril",
  "lisinopril",
  "perindopril",
  "ramipril",
  "quinapril",
  "benazepril",
  "cilazapril",
  "fosinopril",
  "trandolapril",
  "spirapril",
  "delapril",
  "moexipril",
  "temocapril",
  "zofenopril",
  "imidapril"
];

const REGLAS_IECA_ESENCIALES = [
  "sraa_aine_riesgo_renal",
  "bloqueo_dual_sraa_ieca_ara2",
  "bloqueo_dual_sraa_ieca_renina",
  "litio_ieca_ara",
  "espironolactona_ieca_ara",
  "ieca_ieca_duplicidad",
  "ieca_neprilisina_angioedema",
  "ieca_diuretico_hipotension",
  "ieca_heparina_hiperpotasemia",
  "ieca_dpp4_angioedema",
  "ieca_antidiabetico_hipoglucemia"
];

function alertasDe(...nombres) {
  return evaluarInteraccionesClinicas(nombres.map(normalizarMedicamentoClinico));
}

function tieneRegla(alertas, idRegla) {
  return alertas.some((alerta) => String(alerta.idRegla || alerta.id || "").startsWith(`${idRegla}:`));
}

test("el catálogo maestro cubre los 16 IECA simples de ATC C09AA sin identidades duplicadas", () => {
  const ieca = CATALOGO_FARMACOLOGICO_MAESTRO.filter((medicamento) =>
    (medicamento.clases || []).some((clase) => String(clase).toLowerCase() === "ieca")
  );
  assert.deepEqual(ieca.map((medicamento) => medicamento.id).sort(), [...IECA_ATC_C09AA].sort());
  assert.equal(new Set(ieca.map((medicamento) => medicamento.id)).size, IECA_ATC_C09AA.length);
});

test("cada IECA conserva presentaciones y propiedades farmacológicas/diagnósticas completas", () => {
  for (const id of IECA_ATC_C09AA) {
    const medicamento = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === id);
    assert.ok(medicamento, `Falta ${id}`);
    assert.equal(medicamento.principioActivo, id, `${id}: identidad clínica incorrecta`);
    assert.ok(medicamento.presentaciones.length > 0, `${id}: sin presentaciones`);
    assert.equal(new Set(medicamento.presentaciones.map((item) => item.id)).size, medicamento.presentaciones.length, `${id}: presentaciones duplicadas`);
    assert.ok(medicamento.presentaciones.every((item) => item.texto && item.forma && item.concentracion && item.via), `${id}: presentación incompleta`);
    assert.ok(medicamento.datosClinicos.indicaciones.length > 0, `${id}: sin indicaciones`);
    assert.ok(medicamento.datosClinicos.contraindicaciones.length > 0, `${id}: sin contraindicaciones`);
    assert.ok(medicamento.datosClinicos.precauciones.length > 0, `${id}: sin precauciones`);
    assert.ok(medicamento.datosClinicos.monitorizacion.length > 0, `${id}: sin monitorización`);
    assert.ok(medicamento.datosClinicos.embarazo, `${id}: embarazo no documentado`);
    assert.ok(medicamento.datosClinicos.lactancia, `${id}: lactancia no documentada`);
    assert.ok(medicamento.farmacocinetica.mecanismoAccion, `${id}: sin mecanismo`);
    assert.ok(medicamento.farmacocinetica.vidaMedia, `${id}: sin vida media/consideración cinética`);
    assert.ok(medicamento.farmacocinetica.metabolismo, `${id}: sin metabolismo`);
    assert.ok(medicamento.farmacocinetica.eliminacion, `${id}: sin eliminación`);
    assert.ok(medicamento.efectosAdversos.length > 0, `${id}: sin efectos adversos`);
    assert.ok(medicamento.interacciones.length >= 10, `${id}: interacciones insuficientes`);
    assert.ok(medicamento.relacionDiagnosticos.length >= 6, `${id}: relaciones diagnósticas insuficientes`);
    assert.ok(medicamento.referencias.length >= 3, `${id}: sin fuentes suficientes`);
    assert.equal(medicamento.fuenteClinica.estado, "verificada_local", `${id}: fuente sin verificar`);
  }
});

test("todas las reglas IECA se materializan recíprocamente en cada principio activo", () => {
  for (const id of IECA_ATC_C09AA) {
    const medicamento = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === id);
    const reglas = new Set(medicamento.interaccionesRelacionadas.map((item) => item.idRegla));
    for (const idRegla of REGLAS_IECA_ESENCIALES) {
      assert.ok(reglas.has(idRegla), `${id}: falta ${idRegla}`);
    }
  }

  const aliskiren = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === "aliskiren");
  const reglaAliskiren = aliskiren.interaccionesRelacionadas.find((item) => item.idRegla === "bloqueo_dual_sraa_ieca_renina");
  assert.deepEqual([...reglaAliskiren.contraparteIds].sort(), [...IECA_ATC_C09AA].sort());

  for (const id of ["sacubitrilo_valsartan", "eplerenona", "heparina", "sitagliptina"]) {
    const medicamento = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === id);
    assert.ok(medicamento.interaccionesRelacionadas.some((item) => item.contraparteIds.some((contraparte) => IECA_ATC_C09AA.includes(contraparte))), `${id}: sin relación recíproca con IECA`);
  }
});

test("presentaciones y marcas resuelven a una sola identidad clínica IECA", () => {
  assert.equal(medicamentoPorTexto("Perindopril arginina tabletas 5 mg")?.id, "perindopril");
  assert.equal(medicamentoPorTexto("Ramipril cápsulas 2.5 mg")?.id, "ramipril");
  assert.equal(medicamentoPorTexto("Zofenopril tabletas 30 mg")?.id, "zofenopril");
  assert.equal(medicamentoPorTexto("Entresto")?.id, "sacubitrilo_valsartan");
  assert.ok(buscarMedicamentos("temocapril 4 mg", { strict: true }).some((item) => item.id === "temocapril"));

  const idsOficiales = CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => medicamento.id);
  assert.equal(idsOficiales.filter((id) => id === "captopril").length, 1);
  assert.ok(!idsOficiales.some((id) => /-p\d+$/.test(id)), "una presentación no debe ser identidad clínica");
});

test("el motor clínico detecta combinaciones IECA prioritarias", () => {
  assert.ok(tieneRegla(alertasDe("Perindopril", "Losartán"), "bloqueo_dual_sraa_ieca_ara2"));
  assert.ok(tieneRegla(alertasDe("Ramipril", "Aliskiren"), "bloqueo_dual_sraa_ieca_renina"));
  assert.ok(tieneRegla(alertasDe("Enalapril", "Entresto"), "ieca_neprilisina_angioedema"));
  assert.ok(tieneRegla(alertasDe("Lisinopril", "Eplerenona"), "espironolactona_ieca_ara"));
  assert.ok(tieneRegla(alertasDe("Captopril", "Ibuprofeno"), "sraa_aine_riesgo_renal"));
  assert.ok(tieneRegla(alertasDe("Quinapril", "Litio"), "litio_ieca_ara"));
  assert.ok(tieneRegla(alertasDe("Benazepril", "Hidroclorotiazida"), "ieca_diuretico_hipotension"));
  assert.ok(tieneRegla(alertasDe("Trandolapril", "Sitagliptina"), "ieca_dpp4_angioedema"));
  assert.ok(tieneRegla(alertasDe("Captopril", "Lisinopril"), "ieca_ieca_duplicidad"));
});

test("el catálogo no contiene presentaciones comodín ni referencias clínicas huérfanas tras ampliar IECA", () => {
  assert.ok(CATALOGO_FARMACOLOGICO_MAESTRO.every((medicamento) => medicamento.presentaciones.length > 0));
  assert.ok(CATALOGO_FARMACOLOGICO_MAESTRO.every((medicamento) => medicamento.presentaciones.every((item) => !/según disponibilidad|no especificada/i.test(item.texto))));
  const ids = new Set(CATALOGO_FARMACOLOGICO_MAESTRO.map((medicamento) => medicamento.id));
  for (const id of IECA_ATC_C09AA) {
    const medicamento = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === id);
    for (const relacion of medicamento.interaccionesRelacionadas) {
      assert.ok(relacion.contraparteIds.every((contraparte) => ids.has(contraparte)), `${id}/${relacion.idRegla}: contraparte huérfana`);
    }
  }
});
