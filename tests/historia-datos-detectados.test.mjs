import test from "node:test";
import assert from "node:assert/strict";

import {
  construirDatosAutomaticos,
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
