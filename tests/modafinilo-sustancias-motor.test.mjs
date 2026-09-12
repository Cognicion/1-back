import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CATALOGO_SUSTANCIAS } from "../js/data/catalogoSustancias.js";
import {
  CATALOGO_FARMACOLOGICO_MAESTRO,
  medicamentoPorTexto,
  resolverMedicamentoCanonico
} from "../js/data/catalogoFarmacologicoUnificado.js";
import {
  detectarInteraccionesPorCitocromos,
  obtenerRelacionesCitocromoPorMedicamento
} from "../js/data/citocromosFarmacologicos.js";
import {
  evaluarMedicamentosPaciente,
  extraerSustanciasActivasPaciente
} from "../js/services/motorClinicoMedicamentos.js";
import {
  analizarInteraccionesPublicas,
  buscarMedicamentosParaConsulta,
  crearSeleccionMedicamento
} from "../js/services/interaccionesPublicas.js";

function titulos(resultado) {
  return resultado.alertas.map((alerta) => alerta.titulo);
}

test("modafinilo vive en el catálogo maestro con identidad, presentaciones y ficha farmacológica", () => {
  const modafinilo = medicamentoPorTexto("Provigil 200 mg");
  assert.equal(modafinilo?.id, "modafinilo");
  assert.deepEqual(modafinilo.presentaciones.map((item) => item.texto), ["tableta de 100 mg", "tableta de 200 mg"]);
  assert.equal(resolverMedicamentoCanonico("Modafinilo tableta 100 mg")?.clinicalMedicationId, "modafinilo");
  assert.match(modafinilo.vidaMedia, /15 horas/i);
  assert.match(modafinilo.metabolismo, /hepático|hepatico/i);
  assert.ok(modafinilo.cyp.some((item) => /CYP2C19/i.test(item)));
  assert.ok(modafinilo.cyp.some((item) => /CYP3A4/i.test(item)));
  assert.ok(modafinilo.indications.length >= 3);
  assert.ok(modafinilo.contraindications.length);
  assert.ok(modafinilo.precautions.length);
  assert.ok(modafinilo.adverseEffects.length);
  assert.ok(modafinilo.monitoring.length);
  assert.equal(modafinilo.estadoFuente, "verificada_local");
});

test("el puente CYP reconoce inhibición 2C19 e inducción/sustrato 3A4 de modafinilo", () => {
  const relaciones = obtenerRelacionesCitocromoPorMedicamento("modafinilo");
  assert.ok(relaciones.some((item) => item.citocromoId === "CYP2C19" && item.rol === "inhibidor"));
  assert.ok(relaciones.some((item) => item.citocromoId === "CYP3A4" && item.rol === "inductor"));
  assert.ok(relaciones.some((item) => item.citocromoId === "CYP3A4" && item.rol === "sustrato"));
  assert.ok(detectarInteraccionesPorCitocromos(["modafinilo", "diazepam"]).some((item) => item.citocromoId === "CYP2C19"));
  assert.ok(detectarInteraccionesPorCitocromos(["modafinilo", "quetiapina"]).some((item) => item.citocromoId === "CYP3A4"));
});

test("modafinilo participa en reglas exactas y de clase del mismo motor", () => {
  assert.ok(titulos(evaluarMedicamentosPaciente({ medicamentos: ["Modafinilo", "Warfarina"] })).some((titulo) => /warfarina/i.test(titulo)));
  assert.ok(titulos(evaluarMedicamentosPaciente({ medicamentos: ["Modafinilo", "Fenelzina"] })).some((titulo) => /IMAO/i.test(titulo)));
  assert.ok(titulos(evaluarMedicamentosPaciente({ medicamentos: ["Modafinilo", "Quetiapina"] })).some((titulo) => /CYP3A4/i.test(titulo)));
});

test("el buscador y analizador público consumen modafinilo y sustancias desde el catálogo maestro", () => {
  const modafinilo = buscarMedicamentosParaConsulta("Provigil 200 mg")[0];
  const cannabis = buscarMedicamentosParaConsulta("Cannabis")[0];
  const clonazepam = buscarMedicamentosParaConsulta("Clonazepam")[0];
  assert.equal(modafinilo?.medicamento.id, "modafinilo");
  assert.equal(cannabis?.medicamento.id, "cannabis");
  const alertas = analizarInteraccionesPublicas([
    crearSeleccionMedicamento(cannabis.medicamento),
    crearSeleccionMedicamento(clonazepam.medicamento)
  ]);
  assert.ok(alertas.some((alerta) => /Cannabinoide/i.test(alerta.titulo)));
});

test("las 87 opciones de historia clínica resuelven al catálogo farmacológico único", () => {
  const noResueltas = CATALOGO_SUSTANCIAS.filter((sustancia) =>
    !resolverMedicamentoCanonico({ sustanciaId: sustancia.id, originalText: sustancia.nombre })
  );
  assert.deepEqual(noResueltas, []);
  assert.equal(resolverMedicamentoCanonico({ sustanciaId: "opio", originalText: "Opio" })?.clinicalMedicationId, "opio");
  assert.equal(resolverMedicamentoCanonico({ sustanciaId: "benzodiacepinas", originalText: "Benzodiacepinas" })?.clinicalMedicationId, "benzodiacepinas_clase");
  assert.equal(resolverMedicamentoCanonico({ sustanciaId: "anticolinergicos", originalText: "Anticolinérgicos" })?.clinicalMedicationId, "anticolinergicos_recreativos");
  assert.equal(resolverMedicamentoCanonico({ sustanciaId: "crack", originalText: "Crack" })?.clinicalMedicationId, "cocaina");
  assert.equal(resolverMedicamentoCanonico({ sustanciaId: "vapeadores-nicotina", originalText: "Vapeadores con nicotina" })?.clinicalMedicationId, "nicotina");
});

test("los perfiles añadidos como sustancias no contienen una pauta terapéutica", () => {
  const perfiles = CATALOGO_FARMACOLOGICO_MAESTRO.filter((item) => item.esSustanciaPsicoactiva === true);
  assert.ok(perfiles.length >= 35);
  perfiles.forEach((perfil) => {
    assert.deepEqual(perfil.dosisHabituales, [], `${perfil.id} no debe declarar dosis rápidas`);
    assert.deepEqual(perfil.frecuenciasSugeridas, [], `${perfil.id} no debe declarar frecuencias terapéuticas`);
    assert.deepEqual(perfil.datosClinicos.dosisAdulto, [], `${perfil.id} no debe declarar dosis de adulto`);
    assert.deepEqual(perfil.datosClinicos.dosisPediatrica, [], `${perfil.id} no debe declarar dosis pediátrica`);
    assert.match(perfil.dosisHabitual, /No aplica/i);
    assert.equal(perfil.presentaciones.length, 1);
    assert.equal(perfil.presentaciones[0].concentracion, "no aplica");
    assert.ok(perfil.referencias.length);
    assert.ok(perfil.farmacocinetica.mecanismoAccion);
    assert.ok(perfil.datosClinicos.precauciones.length);
    assert.ok(perfil.efectosAdversos.length);
    assert.ok(perfil.datosClinicos.monitorizacion.length);
    assert.ok(perfil.interacciones.length);
    assert.ok(perfil.relacionDiagnosticos.length);
  });
});

test("las exposiciones actuales entran al motor y las históricas permanecen fuera", () => {
  const paciente = {
    sustancias: {
      seleccionadas: [
        { sustanciaId: "heroina", ultimoConsumo: { consumoActual: true } },
        { sustanciaId: "cocaina", ultimoConsumo: { consumoActual: true } },
        { sustanciaId: "cannabis", ultimoConsumo: { consumoActual: false } }
      ]
    }
  };
  const activas = extraerSustanciasActivasPaciente(paciente);
  assert.deepEqual(activas.map((item) => item.clinicalMedicationId).sort(), ["cocaina", "heroina"]);
  const resultado = evaluarMedicamentosPaciente({ paciente, medicamentos: ["Clonazepam", "Bupropion"] });
  assert.ok(titulos(resultado).some((titulo) => /Opioide \+ benzodiacepina/i.test(titulo)));
  assert.ok(titulos(resultado).some((titulo) => /Bupropión \+ estimulante/i.test(titulo)));
  assert.ok(!resultado.principiosActivosNormalizados.some((item) => item.clinicalMedicationId === "cannabis"));
});

test("las clases de sustancias activan interacciones serotoninérgicas y depresoras", () => {
  const serotoninergica = evaluarMedicamentosPaciente({ medicamentos: ["MDMA", "Escitalopram"] });
  assert.ok(serotoninergica.alertas.some((alerta) => alerta.categoria === "serotoninergica"));
  const depresora = evaluarMedicamentosPaciente({ medicamentos: ["Heroína", "Clonazepam"] });
  assert.ok(depresora.alertas.some((alerta) => /respir|depresor|opioide/i.test(`${alerta.titulo} ${alerta.categoria}`)));
  const cannabinoide = evaluarMedicamentosPaciente({ medicamentos: ["Cannabis", "Clonazepam"] });
  assert.ok(cannabinoide.alertas.some((alerta) => /Cannabinoide/i.test(alerta.titulo)));
});

test("las sustancias participan en alertas medicamento-diagnóstico", () => {
  const respiratoria = evaluarMedicamentosPaciente({
    paciente: { diagnosticos: [{ nombre: "Insuficiencia respiratoria", estado: "confirmado" }] },
    medicamentos: ["Heroína"]
  });
  assert.ok(respiratoria.alertas.some((alerta) => /Depresor del SNC en insuficiencia respiratoria/i.test(alerta.titulo)));
  const convulsiva = evaluarMedicamentosPaciente({
    paciente: { diagnosticos: [{ nombre: "Epilepsia", estado: "confirmado" }] },
    medicamentos: ["Cocaína"]
  });
  assert.ok(convulsiva.alertas.some((alerta) => /Estimulante en epilepsia/i.test(alerta.titulo)));
});

test("la selección reportada del laboratorio ya no produce cero alertas", () => {
  const resultado = evaluarMedicamentosPaciente({
    medicamentos: [
      "Concerta (Metilfenidato)",
      "Bupropion, tabletas de liberacion prolongada de 150 mg",
      "Losartan",
      "Furosemida",
      "Amlodipino",
      "Escitalopram",
      "Clonazepam"
    ]
  });
  assert.ok(resultado.alertas.length >= 2);
  assert.ok(titulos(resultado).some((titulo) => /Bupropión \+ estimulante/i.test(titulo)));
  assert.ok(titulos(resultado).some((titulo) => /ISRS \+ diurético/i.test(titulo)));
});

test("el laboratorio muestra propiedades disponibles aun con fuente parcial y oculta dosis terapéutica en exposiciones", () => {
  const laboratorio = fs.readFileSync(new URL("../js/laboratorio-farmacologia.js", import.meta.url), "utf8");
  assert.match(laboratorio, /Ficha parcial: los datos no documentados permanecen marcados como pendientes/);
  assert.match(laboratorio, /No se registra dosis terapéutica; se analiza como exposición o consumo activo/);
  assert.doesNotMatch(laboratorio, /if \(ficha\.estadoFuente !== "verificada_local"\) \{[\s\S]{0,1200}Propiedades clínicas restantes/);
});
