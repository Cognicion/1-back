import test from "node:test";
import assert from "node:assert/strict";

import {
  construirDatosAutomaticos,
  construirTextoDeteccionNota,
  contieneDeteccion,
  detectarDatosHistoria
} from "../js/services/historiaClinicaDeteccion.js";
import { formatearFechaDatoDetectado } from "../js/components/datosDetectadosHistoria.js";

test("detecta campos estructurados permitidos y omite identidad directa", () => {
  const detecciones = detectarDatosHistoria([{
    tipo: "paciente",
    id: "paciente",
    textoDeteccion: "",
    campos: [
      { ruta: "ocupacion", texto: "Docente" },
      { ruta: "datosInstitucionales.sexo", texto: "Femenino" },
      { ruta: "nombre", texto: "Persona identificable" },
      { ruta: "curp", texto: "CURP-identificable" }
    ]
  }]);

  assert.deepEqual(detecciones.map((item) => item.clave).sort(), ["ocupacion", "sexo"]);
  assert.equal(JSON.stringify(detecciones).includes("Persona identificable"), false);
  assert.equal(JSON.stringify(detecciones).includes("CURP-identificable"), false);
});

test("organiza encabezados narrativos en el apartado correspondiente", () => {
  const detecciones = detectarDatosHistoria([{
    tipo: "nota",
    id: "nota-1",
    fecha: "2026-08-20",
    texto: "Padecimiento actual: Insomnio de tres semanas.\nAntecedentes heredofamiliares: Madre con diabetes.\nPlan terapéutico: seguimiento en una semana.",
    campos: []
  }]);

  const porClave = Object.fromEntries(detecciones.map((item) => [item.clave, item]));
  assert.equal(porClave.padecimientoActual.destino.campoId, "padecimientoActual");
  assert.equal(porClave.ahf.destino.seccionId, "antecedentes");
  assert.equal(porClave.plan.destino.campoId, "seguimiento");
});

test("incluye secciones canónicas de una nota en los candidatos de historia clínica", () => {
  const nota = {
    id: "nota-canonica",
    fechaNotaInput: "2026-09-02",
    subjetivo: "Refiere insomnio de tres semanas y ánimo bajo.",
    objetivo: "Afecto ansioso; sin alteraciones de sensopercepción.",
    analisis: "El cuadro requiere vigilancia clínica y seguimiento cercano.",
    diagnosticos: [{ codigo: "F33.2", nombre: "Trastorno depresivo recurrente" }],
    tratamiento: "Fluoxetina cápsula de 20 mg por vía oral cada 24 horas.",
    plan: "Revisión en una semana.",
    observacionFray: {
      exploracionFisicaNeurologica: "Sin hallazgos agudos referidos.",
      pronostico: "Reservado para la evolución."
    }
  };
  const fuente = {
    tipo: "nota",
    id: nota.id,
    fecha: nota.fechaNotaInput,
    textoDeteccion: construirTextoDeteccionNota(nota),
    campos: []
  };
  const detecciones = detectarDatosHistoria([fuente]);
  const porClave = new Map(detecciones.map((item) => [item.clave, item]));

  assert.match(fuente.textoDeteccion, /^Padecimiento actual:/m);
  assert.equal(porClave.get("padecimientoActual").destino.campoId, "padecimientoActual");
  assert.equal(porClave.get("exploracionMental").destino.campoId, "exploracionMental");
  assert.equal(porClave.get("diagnosticoClinico").destino.campoId, "diagnosticoClinico");
  assert.equal(porClave.get("codigoDiagnostico").valor, "F33.2");
  assert.equal(porClave.get("tratamientoFarmacologico").destino.campoId, "tratamientoFarmacologico");
  assert.equal(porClave.get("plan").destino.campoId, "seguimiento");
  assert.equal(porClave.get("analisisClinico").destino.tipo, "manual");
  assert.equal(porClave.get("exploracionFisica").destino.tipo, "manual");
  assert.equal(porClave.get("pronostico").destino.campoId, "seguimiento");
  assert.ok(detecciones.every((deteccion) => deteccion.fuentes.some((origen) => origen.id === "nota-canonica")));
});

test("usa la edición vigente de la nota y no reintroduce el texto reemplazado", () => {
  const textoDeteccion = construirTextoDeteccionNota({
    subjetivo: "Texto inicial que ya no es vigente.",
    notaEditada: {
      subjetivo: "Texto corregido vigente para la evolución clínica.",
      plan: "Seguimiento mensual."
    }
  });

  assert.match(textoDeteccion, /Texto corregido vigente/);
  assert.doesNotMatch(textoDeteccion, /Texto inicial/);
  assert.match(textoDeteccion, /Plan terapéutico: Seguimiento mensual/);
});

test("no vuelve a presentar la propia historia guardada como hallazgo", () => {
  const detecciones = detectarDatosHistoria([{
    tipo: "historia_clinica",
    id: "historiaInicial",
    texto: "Diagnóstico: dato ya guardado",
    campos: [{ ruta: "diagnosticoClinico", texto: "dato ya guardado" }]
  }]);
  assert.deepEqual(detecciones, []);
});

test("deduplica el mismo dato y conserva sus fuentes", () => {
  const fuentes = ["nota-1", "nota-2"].map((id) => ({
    tipo: "nota",
    id,
    texto: "Antecedentes personales patológicos: Hipertensión arterial.",
    campos: []
  }));
  const detecciones = detectarDatosHistoria(fuentes);
  assert.equal(detecciones.length, 1);
  assert.equal(detecciones[0].fuentes.length, 2);
});

test("construye el mismo borrador que consume la pestaña", () => {
  const detecciones = detectarDatosHistoria([{
    tipo: "nota",
    id: "nota-1",
    texto: "Motivo de consulta: ansiedad intensa.\nIndicaciones: revisión en siete días.",
    campos: []
  }]);
  const datos = construirDatosAutomaticos(detecciones);
  assert.equal(datos.padecimientoActual, "Motivo de consulta o ingreso: ansiedad intensa.");
  assert.equal(datos.seguimiento, "Indicaciones: revisión en siete días.");
  assert.equal(contieneDeteccion(datos.padecimientoActual, detecciones[0]), true);
});

test("mantiene visibles los hallazgos sin campo compatible sin incorporarlos", () => {
  const [deteccion] = detectarDatosHistoria([{
    tipo: "nota",
    id: "nota-1",
    texto: "Exploración física: sin hallazgos agudos.",
    campos: []
  }]);
  assert.equal(deteccion.clave, "exploracionFisica");
  assert.equal(deteccion.destino.tipo, "manual");
  assert.deepEqual(construirDatosAutomaticos([deteccion]), {});
});

test("muestra las fechas clínicas sin desplazarlas por la zona horaria", () => {
  assert.match(formatearFechaDatoDetectado("2026-08-20"), /20.*ago.*2026/i);
});
