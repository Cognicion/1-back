import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  agruparEventosPorFecha,
  calcularPosiciones,
  generarMarcasTemporales,
  normalizarEvento,
  ordenarEventosPorFecha,
  obtenerNombreCategoriaEvento,
  obtenerEtiquetaOrigenEvento,
  formatearOrigenEvento,
  formatearImportanciaEvento,
  seleccionarIntervaloTemporal,
  agruparEventosParaEscalaVisible,
  calcularTamanoGrupo,
  obtenerTamanoMarcadorPorImportancia,
  ESPACIO_ENTRE_MARCADORES_PX
} from "../lineaTiempo/lineaTiempoUtils.js";

function evento(id, fecha) {
  return normalizarEvento(id, { titulo: id, fechaEvento: fecha, tipo: "consulta" });
}

test("La línea de tiempo ordena del evento más antiguo al más reciente", () => {
  const eventos = ordenarEventosPorFecha([evento("b", "2025-07-01"), evento("a", "2020-01-01")]);
  assert.deepEqual(eventos.map((item) => item.id), ["a", "b"]);
});

test("Las posiciones respetan la distancia temporal y un evento único queda centrado", () => {
  const eventos = ordenarEventosPorFecha([evento("a", "2020-01-01"), evento("b", "2020-02-01"), evento("c", "2025-07-01")]);
  const rango = { minimo: eventos[0].fechaEvento, maximo: eventos.at(-1).fechaEvento, duracion: eventos.at(-1).fechaEvento - eventos[0].fechaEvento };
  const posiciones = calcularPosiciones(eventos, rango).map((item) => item.posicion);
  assert.ok(posiciones[0] < posiciones[1]);
  assert.ok(posiciones[1] < posiciones[2]);
  assert.ok(posiciones[2] - posiciones[1] > posiciones[1] - posiciones[0]);
  assert.equal(calcularPosiciones([eventos[0]], { minimo: eventos[0].fechaEvento, maximo: eventos[0].fechaEvento, duracion: 0 })[0].posicion, .5);
});

test("Los eventos de la misma fecha se agrupan sin perder eventos", () => {
  const eventos = [evento("a", "2026-07-15T10:00:00"), evento("b", "2026-07-15T18:00:00"), evento("c", "2026-07-16T12:00:00")];
  const grupos = agruparEventosPorFecha(eventos);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].items.length, 2);
  assert.equal(grupos.flatMap((grupo) => grupo.items).length, 3);
});

test("Los extremos temporales coinciden con los eventos más antiguo y reciente", () => {
  const eventos = ordenarEventosPorFecha([evento("nuevo", "2025-03-01"), evento("antiguo", "1996-11-25")]);
  const rango = { minimo: eventos[0].fechaEvento, maximo: eventos[1].fechaEvento, duracion: eventos[1].fechaEvento - eventos[0].fechaEvento };
  assert.deepEqual(calcularPosiciones(eventos, rango).map((item) => item.posicion), [0, 1]);
  const marcas = generarMarcasTemporales(rango);
  assert.equal(marcas[0].posicion, 0);
  assert.equal(marcas.at(-1).posicion, 1);
  assert.ok(marcas.every((marca) => marca.fecha >= rango.minimo && marca.fecha <= rango.maximo));
});

test("La página general del expediente solo navega a la función y no importa su módulo", () => {
  const root = resolve(process.cwd());
  const paciente = readFileSync(resolve(root, "js/paciente.js"), "utf8");
  const medico = readFileSync(resolve(root, "js/medico.js"), "utf8");
  assert.equal(paciente.includes("import(\"./lineaTiempo/lineaTiempoPaciente.js\")"), false);
  assert.equal(medico.includes("lineaTiempoPaciente.js"), false);
});

test("El detalle conserva cada dato clínico en su fuente semántica", () => {
  const categorias = [{ id: "academico", nombre: "Académico" }];
  const actual = { categoriaId: "academico", categoriaNombre: "", categoria: "", origen: "manual", importancia: "alta" };
  const legado = { categoria: "Académico", origen: "automatico", importancia: "media" };
  assert.equal(obtenerNombreCategoriaEvento(actual, categorias), "Académico");
  assert.equal(obtenerNombreCategoriaEvento(legado, categorias), "Académico");
  assert.equal(obtenerNombreCategoriaEvento({}, categorias), "Sin categoría");
  assert.equal(formatearOrigenEvento(actual.origen), "Manual");
  assert.equal(formatearOrigenEvento(legado.origen), "Automático");
  assert.equal(formatearImportanciaEvento(actual.importancia), "Alta");
});

test("El origen detectado se etiqueta solo para eventos vinculados a detecciones", () => {
  const detectado = normalizarEvento("detectado", {
    titulo: "Evento detectado",
    fechaEvento: "2026-05-20",
    origen: "detectado",
    detectedEventId: "nota-123",
    sourceLabel: "nota_evolucion",
    sourceDate: "2026-05-20"
  });
  const manual = normalizarEvento("manual", {
    titulo: "Evento manual",
    fechaEvento: "2026-05-20",
    origen: "manual"
  });
  const etiquetaObjeto = normalizarEvento("objeto", {
    titulo: "Evento detectado",
    fechaEvento: "2026-05-20",
    origen: "detectado",
    detectedEventId: "nota-456",
    sourceLabel: { etiqueta: "Historia clinica" }
  });

  assert.equal(obtenerEtiquetaOrigenEvento(detectado), "Detectado en: Nota de evolucion del 20 may 2026");
  assert.equal(obtenerEtiquetaOrigenEvento(manual), "");
  assert.equal(obtenerEtiquetaOrigenEvento(etiquetaObjeto), "Detectado en: Historia clinica");
});

test("Las marcas temporales seleccionan intervalos regulares según el rango visible", () => {
  const inicio = new Date(1996, 10, 25).getTime();
  const fin = new Date(2026, 5, 1).getTime();
  assert.equal(seleccionarIntervaloTemporal(inicio, fin, 1000), "5-anios");
  const marcas = generarMarcasTemporales({ minimo: new Date(inicio), maximo: new Date(fin), duracion: fin - inicio }, 1000);
  const internas = marcas.slice(1, -1).map((marca) => marca.fecha.getFullYear());
  assert.deepEqual(internas, [2000, 2005, 2010, 2015, 2020]);
});

test("La etiqueta final exacta reserva su extremo y no se duplica", () => {
  const inicio = new Date(1996, 10, 25).getTime();
  const fin = new Date(2026, 2, 1).getTime();
  const rango = { minimo: new Date(inicio), maximo: new Date(fin), duracion: fin - inicio };
  const marcas = generarMarcasTemporales(rango, 900);
  const finales = marcas.filter((marca) => marca.fecha.getTime() === fin);
  const intermediaCercanaAlFinal = marcas.find((marca) => !marca.esExtremo && 900 - marca.posicion * 900 < 90);

  assert.equal(finales.length, 1);
  assert.equal(finales[0].tipo, "extremo-final");
  assert.equal(intermediaCercanaAlFinal, undefined);
});

test("La vista lejana agrupa eventos del mismo año sin alterar sus documentos", () => {
  const eventos = [
    evento("a", "2022-01-02"), evento("b", "2022-05-03"), evento("c", "2023-01-01")
  ];
  const inicio = new Date(1996, 0, 1).getTime();
  const fin = new Date(2026, 0, 1).getTime();
  const elementos = agruparEventosParaEscalaVisible({ eventos, rangoVisibleInicioMs: inicio, rangoVisibleFinMs: fin, anchoDisponiblePx: 1400, zoom: 1 });
  assert.equal(elementos.length, 2);
  assert.equal(elementos[0].tipo, "grupo");
  assert.equal(elementos[0].items.length, 2);
  assert.equal(eventos.length, 3);
});

test("Los marcadores usan un diametro visual segun importancia y cantidad agrupada", () => {
  assert.equal(obtenerTamanoMarcadorPorImportancia("baja"), 18);
  assert.equal(obtenerTamanoMarcadorPorImportancia("media"), 24);
  assert.equal(obtenerTamanoMarcadorPorImportancia("alta"), 32);
  assert.equal(calcularTamanoGrupo(2), 31);
  assert.ok(calcularTamanoGrupo(20) <= 42);
  assert.equal(ESPACIO_ENTRE_MARCADORES_PX, 8);
});

test("Los eventos cercanos se agrupan cuando sus radios reales no caben", () => {
  const eventos = [
    normalizarEvento("a", { titulo: "A", fechaEvento: "2026-01-01", importancia: "alta" }),
    normalizarEvento("b", { titulo: "B", fechaEvento: "2026-01-03", importancia: "alta" })
  ];
  const inicio = new Date(2026, 0, 1).getTime();
  const fin = new Date(2026, 0, 10).getTime();
  const elementos = agruparEventosParaEscalaVisible({ eventos, rangoVisibleInicioMs: inicio, rangoVisibleFinMs: fin, anchoDisponiblePx: 120, zoom: 1 });
  assert.equal(elementos.length, 1);
  assert.equal(elementos[0].tipo, "grupo");
  assert.deepEqual(elementos[0].items.map((item) => item.id), ["a", "b"]);
});
