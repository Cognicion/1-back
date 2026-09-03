import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("historia incluye una única pestaña y contenedor de Datos detectados", async () => {
  const html = await leer("historia.html");
  assert.equal((html.match(/data-seccion="detectados"/g) || []).length, 1);
  assert.equal((html.match(/id="datosDetectadosHistoria"/g) || []).length, 1);
  assert.match(html, /Datos detectados/);
  assert.match(html, /css\/historia\.css\?v=20260902-note-history-extraction-v1/);
  assert.match(html, /js\/historia\.js\?v=20260902-note-history-extraction-v1/);
});

test("el aviso diferencia fuentes analizadas de datos realmente detectados", async () => {
  const codigo = await leer("js/historia.js");
  assert.match(codigo, /automatico\.detecciones\?\.length/);
  assert.match(codigo, /fuentes clínicas y se detectaron/);
  assert.doesNotMatch(codigo, /Historia prellenada con \$\{totalFuentes\}/);
});

test("la pestaña y el prellenado consumen el mismo resultado automático", async () => {
  const controlador = await leer("js/historia.js");
  const servicio = await leer("js/services/historiaClinicaAutomatica.js");
  assert.match(controlador, /combinarHistoriaAutomatica\(datos, automatico\)/);
  assert.match(controlador, /gestorDatosDetectados\?\.cargar\(automatico\.detecciones/);
  assert.match(servicio, /datos: construirDatosAutomaticos\(detecciones\)/);
  assert.match(servicio, /detecciones,/);
});

test("las secciones canónicas de notas se transforman antes de detectar datos", async () => {
  const servicio = await leer("js/services/historiaClinicaAutomatica.js");
  const detector = await leer("js/services/historiaClinicaDeteccion.js");
  assert.match(servicio, /construirTextoDeteccionNota\(nota\)/);
  assert.match(servicio, /construirFuentesHistoria/);
  assert.match(detector, /export function construirTextoDeteccionNota/);
});

test("los candidatos no se guardan automáticamente ni usan almacenamiento local", async () => {
  const componente = await leer("js/components/datosDetectadosHistoria.js");
  const controlador = await leer("js/historia.js");
  assert.doesNotMatch(`${componente}\n${controlador}`, /localStorage|sessionStorage|indexedDB/i);
  assert.match(componente, /Nada se guarda hasta pulsar “Guardar historia”/);
  assert.doesNotMatch(componente, /guardarHistoriaClinica|setDoc|updateDoc/);
});

test("el contenido clínico se renderiza como texto y no como HTML", async () => {
  const componente = await leer("js/components/datosDetectadosHistoria.js");
  assert.match(componente, /valor\.textContent = deteccion\.valor/);
  assert.doesNotMatch(componente, /innerHTML/);
});
