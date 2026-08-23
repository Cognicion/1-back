import test from "node:test";
import assert from "node:assert/strict";

import {
  buscarApuntesProyectados,
  construirBreadcrumbsCarpetasApuntes,
  construirIndiceCarpetasApuntes,
  listarContenidoCarpetaApuntes
} from "../js/notes-cloud-projection-core.js";

function carpeta(id, nombre, carpetaPadreId = null) {
  return { id, nombre, carpetaPadreId, sourceType: "noteFolder", type: "folder" };
}

function nota(id, name, noteFolderId = null) {
  return {
    id,
    name,
    noteFolderId,
    sourceType: "note",
    type: "note",
    searchText: name,
    quotaBytes: 0,
    countsTowardCloudQuota: false
  };
}

const carpetas = [
  carpeta("a", "Carpeta A"),
  carpeta("a1", "Subcarpeta A1", "a"),
  carpeta("b", "Carpeta B"),
  carpeta("vacia", "Carpeta vacía"),
  carpeta("huerfana", "Carpeta huérfana", "eliminada")
];

const apuntes = [
  nota("n1", "Nota 1", "a1"),
  nota("n2", "Nota 2", "a"),
  nota("n3", "Nota 3", "b"),
  nota("raiz", "Nota raíz"),
  nota("referencia-rota", "Nota con carpeta inexistente", "eliminada")
];

test("la proyección respeta raíz, subcarpetas y apuntes de cada carpeta", () => {
  const indice = construirIndiceCarpetasApuntes({ carpetas, apuntes });

  assert.deepEqual(
    listarContenidoCarpetaApuntes(indice).map(({ id }) => id),
    ["a", "b", "huerfana", "vacia", "raiz", "referencia-rota"]
  );
  assert.deepEqual(
    listarContenidoCarpetaApuntes(indice, "a").map(({ id }) => id),
    ["a1", "n2"]
  );
  assert.deepEqual(
    listarContenidoCarpetaApuntes(indice, "a1").map(({ id }) => id),
    ["n1"]
  );
  assert.deepEqual(listarContenidoCarpetaApuntes(indice, "vacia"), []);
  assert.equal(indice.diagnostics.orphanFolders, 1);
  assert.equal(indice.diagnostics.orphanNotes, 1);
});

test("el breadcrumb utiliza la jerarquía real de carpetaPadreId", () => {
  const indice = construirIndiceCarpetasApuntes({ carpetas, apuntes });
  assert.deepEqual(
    construirBreadcrumbsCarpetasApuntes(indice, "a1").map(({ id, name }) => ({ id, name })),
    [
      { id: null, name: "Mis apuntes" },
      { id: "a", name: "Carpeta A" },
      { id: "a1", name: "Subcarpeta A1" }
    ]
  );
});

test("la búsqueda es global y encuentra notas dentro de subcarpetas", () => {
  const indice = construirIndiceCarpetasApuntes({ carpetas, apuntes });
  assert.deepEqual(buscarApuntesProyectados(indice, "nota 1").map(({ id }) => id), ["n1"]);
  assert.deepEqual(buscarApuntesProyectados(indice, "carpeta inexistente").map(({ id }) => id), ["referencia-rota"]);
});

test("funciona sin carpetas y mantiene los apuntes en raíz", () => {
  const indice = construirIndiceCarpetasApuntes({ carpetas: [], apuntes: [nota("uno", "Uno"), nota("dos", "Dos", "no-existe")] });
  assert.deepEqual(listarContenidoCarpetaApuntes(indice).map(({ id }) => id), ["uno", "dos"]);
  assert.equal(indice.diagnostics.orphanNotes, 1);
});

test("indexa cientos de apuntes una sola vez sin perder asociaciones", () => {
  const muchos = Array.from({ length: 600 }, (_, index) => nota(`n-${index}`, `Nota ${index}`, index % 2 ? "a" : "a1"));
  const indice = construirIndiceCarpetasApuntes({ carpetas, apuntes: muchos });
  assert.equal(indice.notesByFolder.get("a").length, 300);
  assert.equal(indice.notesByFolder.get("a1").length, 300);
  assert.equal(buscarApuntesProyectados(indice, "Nota 599")[0]?.id, "n-599");
});

test("una jerarquía cíclica no bloquea el render y se degrada a raíz", () => {
  const indice = construirIndiceCarpetasApuntes({
    carpetas: [carpeta("c1", "Ciclo 1", "c2"), carpeta("c2", "Ciclo 2", "c1")],
    apuntes: [nota("nc", "Nota ciclo", "c1")]
  });
  assert.equal(indice.diagnostics.cycleFolders, 2);
  assert.deepEqual(listarContenidoCarpetaApuntes(indice).map(({ id }) => id), ["c1", "c2"]);
  assert.deepEqual(listarContenidoCarpetaApuntes(indice, "c1").map(({ id }) => id), ["nc"]);
});
