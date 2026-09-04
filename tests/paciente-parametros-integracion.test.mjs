import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raiz = new URL("../", import.meta.url);
const leer = (ruta) => readFile(new URL(ruta, raiz), "utf8");

test("el expediente expone Parámetros como sección navegable", async () => {
  const html = await leer("paciente.html");
  assert.match(html, /onclick="mostrarParametrosPaciente\(\)">Parámetros<\/button>/);
  assert.match(html, /id="seccionParametrosPaciente"/);
  assert.match(html, /id="formParametrosPaciente"/);
  assert.match(html, /id="parametrosPacienteDerivados"/);
  assert.match(html, /id="parametrosPacienteClasificacion"/);
});

test("el formulario se genera desde las definiciones compartidas y conserva trazabilidad", async () => {
  const js = await leer("js/paciente.js");
  assert.match(js, /GRUPOS_PARAMETROS_CLINICOS\.map/);
  assert.match(js, /DEFINICIONES_PARAMETROS_CLINICOS\.filter/);
  for (const propiedad of [
    "rangoReferencia",
    "fecha",
    "muestra",
    "metodo",
    "formula",
    "versionFormula",
    "estadoResultado",
    "derivado"
  ]) {
    assert.match(js, new RegExp(`data-parametro-campo=\\"${propiedad}\\"`));
  }
});

test("la persistencia usa solo el bloque anidado, versionado y no guarda derivados calculados", async () => {
  const js = await leer("js/paciente.js");
  assert.match(js, /construirRegistroParametrosClinicos\(\{ \[definicion\.id\]: entrada \}/);
  assert.match(js, /await actualizarUsuario\(uidPaciente, \{ parametrosClinicos \}\)/);
  assert.match(js, /const \{ derivados: _derivadosObsoletos/);
  assert.match(js, /no se almacena como resultado medido/);
  assert.doesNotMatch(js, /actualizarUsuario\(uidPaciente, \{\s*creatinina\s*:/);
});

test("los consumidores farmacológicos del expediente reciben estudios y parámetros", async () => {
  const js = await leer("js/paciente.js");
  assert.match(js, /parametrosClinicosResueltos: resolverParametrosClinicosPaciente\(contexto\)/);
  assert.match(js, /estudiosCachePatientId === patientId \? estudiosCache : \[\]/);
  assert.match(js, /laboratoriosFarmacologicosCachePatientId === patientId/);
  assert.match(js, /laboratorios: \[\.\.\.estudiosPacienteActual, \.\.\.laboratoriosPacienteActual, \.\.\.laboratoriosExistentes\]/);
  assert.match(js, /leerLaboratoriosFarmacologicosDesdeRaiz\(patientId, "usuarios"\)/);
  assert.match(js, /leerLaboratoriosFarmacologicosDesdeRaiz\(patientId, "pacientes"\)/);
  assert.match(js, /async function asegurarEstudiosFarmacologicosPaciente/);
  assert.match(js, /leerEstudiosFarmacologicosDesdeRaiz\(patientId, "pacientes"\)/);
  assert.match(js, /estudiosFarmacologicosAdicionalesCache/);
  assert.match(js, /fuentesContextoFarmacologicoNoDisponibles/);
  assert.match(js, /window\.mostrarParametrosPaciente = async function/);
  const usos = js.match(/detectarAlertasClinicasMedicamentos\([\s\S]{0,180}?construirContextoFarmacologicoPaciente/g) || [];
  assert.ok(usos.length >= 3, `se esperaban al menos 3 consumidores con contexto completo; se encontraron ${usos.length}`);
});

test("cobertura incompleta no se representa como indicador verde ni como cero concluyente", async () => {
  const js = await leer("js/paciente.js");
  assert.match(js, /evaluacion\.indicador\?\.estado === "datos_insuficientes"/);
  assert.match(js, /cobertura\.cantidadParametrosEsperadosAusentes/);
  assert.match(js, /cobertura\.fuentesContextoNoDisponibles/);
  assert.match(js, /Sin regla cargada para parte de la selección/);
  assert.match(js, /No se muestra un cero concluyente/);
});

test("la interfaz distingue resultados medidos, derivados y estados fuera de rango", async () => {
  const css = await leer("css/paciente-laboratorio.css");
  assert.match(css, /\.parametro-paciente-badge-derivado/);
  assert.match(css, /\.parametros-paciente-lista-revision \.estado-bajo/);
  assert.match(css, /\.parametros-paciente-lista-revision \.estado-alto/);
  assert.match(css, /\.parametro-paciente-trazabilidad/);
});
