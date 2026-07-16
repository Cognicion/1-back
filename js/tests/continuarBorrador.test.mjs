import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [modulo, servicio, html] = await Promise.all([
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../services/notas.js", import.meta.url), "utf8"),
  readFile(new URL("../../nota.html", import.meta.url), "utf8")
]);

const inicioContinuar = modulo.indexOf("window.continuarBorradorDesdeHistorial");
const finContinuar = modulo.indexOf("function cargarDatosNotaComoBorrador", inicioContinuar);
assert.ok(inicioContinuar >= 0 && finContinuar > inicioContinuar, "debe existir el flujo Continuar borrador");
const flujoContinuar = modulo.slice(inicioContinuar, finContinuar);

assert.match(flujoContinuar, /estadoPersistidoNota\(datos\) !== "borrador"/);
assert.match(flujoContinuar, /notaEditandoId = notaId/);
assert.match(flujoContinuar, /edicionVersionadaActiva = false/);
assert.match(flujoContinuar, /modoEdicionNota = "continuar-borrador"/);
assert.match(flujoContinuar, /llenarFormularioNota\(datosVigentesNota\(datos\)\)/);
assert.doesNotMatch(flujoContinuar, /actualizarNota|guardarNota\(|arrayUnion/);

const inicioEstados = modulo.indexOf("const ESTADOS_BORRADOR_NOTA");
const finEstados = modulo.indexOf("function fechaNotaHistorial", inicioEstados);
const contextoEstados = {};
vm.runInNewContext(`${modulo.slice(inicioEstados, finEstados)}
  globalThis.estadoPersistidoNotaPrueba = estadoPersistidoNota;
  globalThis.datosVigentesNotaPrueba = datosVigentesNota;`, contextoEstados);
const estadoPersistidoNota = contextoEstados.estadoPersistidoNotaPrueba;
const datosVigentesNota = contextoEstados.datosVigentesNotaPrueba;

assert.equal(estadoPersistidoNota({ estadoNota: "Borrador", esBorrador: true }), "borrador");
assert.equal(estadoPersistidoNota({ estado: "draft" }), "borrador");
assert.equal(estadoPersistidoNota({ estadoNota: "firmada", bloqueada: true }), "definitiva");
assert.equal(
  estadoPersistidoNota({ estadoNota: "definitiva", notaEditada: { estadoNota: "borrador" } }),
  "definitiva",
  "una correccion pendiente no debe convertir la nota original definitiva en borrador normal"
);
const borradorLegacy = {
  estadoNota: "borrador",
  fechaUltimaModificacion: "2026-07-15T10:00:00.000Z",
  subjetivo: "raiz anterior",
  notaEditada: { fechaEdicion: "2026-07-16T10:00:00.000Z", subjetivo: "contenido mas reciente" }
};
assert.equal(datosVigentesNota(borradorLegacy).subjetivo, "contenido mas reciente");
assert.equal(
  datosVigentesNota({ ...borradorLegacy, fechaUltimaModificacion: "2026-07-17T10:00:00.000Z", subjetivo: "raiz actualizada" }).subjetivo,
  "raiz actualizada"
);

const inicioAcciones = modulo.indexOf("const accionesNota = estadoNota === \"borrador\"");
const finAcciones = modulo.indexOf("let diagnosticosTexto", inicioAcciones);
assert.ok(inicioAcciones >= 0 && finAcciones > inicioAcciones, "las acciones deben depender del estado persistido");
const acciones = modulo.slice(inicioAcciones, finAcciones);
const ramas = acciones.split("` : `");
assert.equal(ramas.length, 2, "debe haber una rama para borrador y otra para definitiva");
assert.match(ramas[0], /Continuar borrador/);
assert.match(ramas[0], /Usar como borrador \(nueva nota\)/);
assert.doesNotMatch(ramas[0], /Editar esta nota/);
assert.doesNotMatch(ramas[1], /Continuar borrador/);
assert.match(ramas[1], /Editar esta nota/);

assert.match(modulo, /modoEdicionNota === "editar-definitiva" && edicionVersionadaActiva && notaEditandoId/);
assert.match(modulo, /guardarBorradorNotaClinica\(uidPaciente, notaEditandoId, notaPayload\)/);
assert.match(modulo, /modoEdicionNota = null;[\s\S]{0,120}estadoNotaActual = "nueva"/);
assert.match(servicio, /estadoPersistidoNota\(nota\) === "borrador"/);
assert.match(servicio, /Los borradores deben actualizarse sobre el mismo documento sin crear historial/);
assert.match(servicio, /transaction\.set\(referencia,[\s\S]*?fechaUltimaModificacion:[\s\S]*?actual\.exists\(\)[\s\S]*?fechaCreacion/);
assert.doesNotMatch(
  servicio.slice(servicio.indexOf("export async function guardarBorradorNotaClinica"), servicio.indexOf("export async function finalizarNotaClinica")),
  /arrayUnion|ediciones|notaEditada/
);
assert.match(html, /js\/nota\.js\?v=20260716-5/);

console.log("continuarBorrador: ok");
