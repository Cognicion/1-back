import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EXTENSIONES_PERMITIDAS,
  MAX_STORAGE_BYTES,
  MIME_TYPES_PERMITIDOS,
  MIME_TYPES_POR_EXTENSION,
  MiNubeHierarchyError,
  MiNubeValidationError,
  calcularBytesFaltantes,
  calcularEstadoCuotaMiNube,
  clasificarElementoMiNube,
  construirBreadcrumbs,
  creariaCicloCarpetas,
  detectarCiclosCarpetas,
  escaparHtml,
  evaluarArchivoMiNube,
  filtrarElementosMiNube,
  formatearBytes,
  normalizarMimeType,
  normalizarNombreArchivoSeguro,
  normalizarNombreCarpetaSeguro,
  normalizarTextoBusqueda,
  obtenerExtensionArchivo,
  obtenerIdsDescendientes,
  ordenarElementosMiNube,
  renderizarMarkdownSeguro,
  validarArchivoMiNube,
  validarMovimientoCarpeta
} from "../js/mi-nube-core.js";

function archivo(name, type, size = 1024) {
  return { name, type, size };
}

function assertCodigoValidacion(entrada, code, opciones) {
  assert.throws(
    () => validarArchivoMiNube(entrada, opciones),
    (error) => error instanceof MiNubeValidationError && error.code === code,
    `Se esperaba ${code}`
  );
}

test("la cuota y las listas permitidas usan el contrato de Mi nube", () => {
  assert.equal(MAX_STORAGE_BYTES, 262_144_000);
  assert.deepEqual(EXTENSIONES_PERMITIDAS, [
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".txt", ".md"
  ]);
  assert.deepEqual(MIME_TYPES_PERMITIDOS, [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/markdown"
  ]);
  assert.deepEqual(MIME_TYPES_POR_EXTENSION[".jpeg"], ["image/jpeg"]);
  assert.ok(Object.isFrozen(MIME_TYPES_POR_EXTENSION));
  assert.ok(Object.isFrozen(MIME_TYPES_POR_EXTENSION[".pdf"]));
});

test("la extensión se obtiene del último segmento y se normaliza", () => {
  assert.equal(obtenerExtensionArchivo("informe.PDF"), ".pdf");
  assert.equal(obtenerExtensionArchivo("C:\\temporal\\imagen.JpEg"), ".jpeg");
  assert.equal(obtenerExtensionArchivo("../../notas.MD"), ".md");
  assert.equal(obtenerExtensionArchivo("archivo.tar.gz"), ".gz");
  assert.equal(obtenerExtensionArchivo("sin-extension"), "");
  assert.equal(obtenerExtensionArchivo("archivo."), "");
  assert.equal(obtenerExtensionArchivo(".env"), "");
  assert.equal(obtenerExtensionArchivo("archivo.💥"), "");
});

test("los nombres seguros eliminan rutas, controles y caracteres peligrosos", () => {
  assert.equal(normalizarNombreArchivoSeguro("../../privado/informe.pdf"), "informe.pdf");
  assert.equal(normalizarNombreArchivoSeguro("  mi\u0000  archivo<final>.txt  "), "mi archivo-final-.txt");
  assert.equal(normalizarNombreArchivoSeguro("foto:consulta?.png"), "foto-consulta-.png");
  assert.equal(normalizarNombreArchivoSeguro("safe\u202Etxt.pdf"), "safetxt.pdf");
  assert.equal(normalizarNombreArchivoSeguro(".."), "archivo");
  assert.equal(normalizarNombreCarpetaSeguro("  Neurociencias / 2026  "), "Neurociencias - 2026");
  assert.equal(normalizarNombreCarpetaSeguro("..."), "Nueva carpeta");

  const largo = normalizarNombreArchivoSeguro(`${"á".repeat(100)}.pdf`, { maxLength: 24 });
  assert.ok(Array.from(largo).length <= 24);
  assert.ok(largo.endsWith(".pdf"));
  assert.equal(normalizarNombreArchivoSeguro("ＡＢＣ.pdf"), "ABC.pdf");
});

test("la normalización de MIME y búsqueda es estable", () => {
  assert.equal(normalizarMimeType(" Image/JPEG ; charset=binary "), "image/jpeg");
  assert.equal(normalizarMimeType(""), "");
  assert.equal(normalizarTextoBusqueda("  Hipertensión   CARDÍACA "), "hipertension cardiaca");
  assert.equal(normalizarTextoBusqueda(null), "");
});

test("todos los pares de extensión y MIME admitidos se validan", () => {
  const casos = [
    ["foto.jpg", "image/jpeg", "image"],
    ["foto.JPEG", "image/jpeg", "image"],
    ["grafica.png", "image/png", "image"],
    ["captura.webp", "image/webp", "image"],
    ["animacion.gif", "image/gif", "image"],
    ["articulo.pdf", "application/pdf", "pdf"],
    ["registro.txt", "text/plain", "text"],
    ["README.md", "text/markdown", "text"]
  ];

  for (const [name, type, category] of casos) {
    const resultado = validarArchivoMiNube(archivo(name, type));
    assert.equal(resultado.valid, true);
    assert.equal(resultado.mimeType, type);
    assert.equal(resultado.category, category);
    assert.equal(resultado.sizeBytes, 1024);
    assert.ok(Object.isFrozen(resultado));
  }

  const conParametros = validarArchivoMiNube(archivo("nota.txt", "TEXT/PLAIN; charset=utf-8", 20));
  assert.equal(conParametros.mimeType, "text/plain");
  assert.equal(conParametros.originalName, "nota.txt");

  const conRuta = validarArchivoMiNube(archivo("../../consulta.PDF", "application/pdf", 20));
  assert.equal(conRuta.name, "consulta.PDF");
  assert.equal(conRuta.originalName, "../../consulta.PDF");
  assert.equal(conRuta.extension, ".pdf");
});

test("los ejecutables, tipos ausentes, discrepancias y tamaños inválidos se rechazan", () => {
  assertCodigoValidacion(null, "cloud-file/missing");
  assertCodigoValidacion(archivo("", "text/plain"), "cloud-file/name-required");
  assertCodigoValidacion(archivo("sin-extension", "text/plain"), "cloud-file/extension-required");

  for (const nombre of [
    "malware.exe", "paquete.zip", "paquete.rar", "app.apk", "imagen.dmg",
    "script.ps1", "script.bat", "script.sh", "script.js", "pagina.html"
  ]) {
    assertCodigoValidacion(archivo(nombre, "application/octet-stream"), "cloud-file/extension-not-allowed");
  }

  assertCodigoValidacion(archivo("nota.txt", ""), "cloud-file/mime-required");
  assertCodigoValidacion(archivo("nota.txt", "application/javascript"), "cloud-file/mime-not-allowed");
  assertCodigoValidacion(archivo("imagen.jpg", "image/png"), "cloud-file/extension-mime-mismatch");
  assertCodigoValidacion(archivo("documento.pdf.exe", "application/pdf"), "cloud-file/extension-not-allowed");
  assertCodigoValidacion(archivo("vacio.pdf", "application/pdf", 0), "cloud-file/empty");
  assertCodigoValidacion(archivo("negativo.pdf", "application/pdf", -1), "cloud-file/invalid-size");
  assertCodigoValidacion(archivo("decimal.pdf", "application/pdf", 1.5), "cloud-file/invalid-size");
  assertCodigoValidacion(archivo("desconocido.pdf", "application/pdf", Number.NaN), "cloud-file/invalid-size");
  assertCodigoValidacion(
    archivo("enorme.pdf", "application/pdf", 101),
    "cloud-file/too-large",
    { maxFileBytes: 100 }
  );
});

test("la evaluación no lanzable conserva códigos y detalles útiles", () => {
  const invalido = evaluarArchivoMiNube(archivo("imagen.jpg", "image/png", 20));
  assert.equal(invalido.valid, false);
  assert.equal(invalido.code, "cloud-file/extension-mime-mismatch");
  assert.equal(invalido.details.extension, ".jpg");
  assert.equal(invalido.details.mimeType, "image/png");
  assert.ok(Object.isFrozen(invalido));
  assert.ok(Object.isFrozen(invalido.details));

  const valido = evaluarArchivoMiNube(archivo("nota.md", "text/markdown", 20));
  assert.equal(valido.valid, true);
});

test("la clasificación distingue archivos físicos, carpetas y apuntes", () => {
  assert.equal(clasificarElementoMiNube({ type: "folder" }), "folder");
  assert.equal(clasificarElementoMiNube({ sourceType: "note" }), "note");
  assert.equal(clasificarElementoMiNube({ mimeType: "image/webp" }), "image");
  assert.equal(clasificarElementoMiNube({ extension: ".PDF" }), "pdf");
  assert.equal(clasificarElementoMiNube({ name: "nota.md" }), "text");
  assert.equal(clasificarElementoMiNube({ name: "desconocido.bin" }), "file");
});

test("los bytes se muestran con unidades binarias legibles", () => {
  assert.equal(formatearBytes(0), "0 B");
  assert.equal(formatearBytes(-10), "0 B");
  assert.equal(formatearBytes(999), "999 B");
  assert.equal(formatearBytes(1024), "1 KB");
  assert.equal(formatearBytes(1536), "1.5 KB");
  assert.equal(formatearBytes(42.7 * 1024 * 1024), "42.7 MB");
  assert.equal(formatearBytes(1.234 * 1024 * 1024, { decimals: 2 }), "1.23 MB");
  assert.equal(formatearBytes(1024 ** 3), "1 GB");
});

test("la cuota considera bytes usados y reservados sin afectar otros módulos", () => {
  const exacto = calcularEstadoCuotaMiNube({ usedBytes: 60, newFileBytes: 40, maxBytes: 100 });
  assert.equal(exacto.canUpload, true);
  assert.equal(exacto.missingBytes, 0);
  assert.equal(exacto.availableBytes, 40);
  assert.equal(exacto.percentUsed, 60);

  const carrera = calcularEstadoCuotaMiNube({
    usedBytes: 60,
    reservedBytes: 10,
    newFileBytes: 40,
    maxBytes: 100
  });
  assert.equal(carrera.canUpload, false);
  assert.equal(carrera.occupiedBytes, 70);
  assert.equal(carrera.availableBytes, 30);
  assert.equal(carrera.missingBytes, 10);
  assert.equal(carrera.percentUsed, 70);
  assert.equal(carrera.percentCommitted, 60);
  assert.ok(Object.isFrozen(carrera));

  const excedida = calcularEstadoCuotaMiNube({ usedBytes: 150, maxBytes: 100 });
  assert.equal(excedida.availableBytes, 0);
  assert.equal(excedida.percentUsed, 100);
  assert.equal(calcularBytesFaltantes(60, 40, 100, 10), 10);
  assert.equal(calcularBytesFaltantes(-2, 20, 100, -5), 0);
});

const carpetasJerarquia = Object.freeze([
  Object.freeze({ id: "articulos", type: "folder", name: "Artículos", parentFolderId: null }),
  Object.freeze({ id: "neuro", type: "folder", name: "Neurociencias", parentFolderId: "articulos" }),
  Object.freeze({ id: "memoria", type: "folder", name: "Memoria", parentFolderId: "neuro" }),
  Object.freeze({ id: "imagenes", type: "folder", name: "Imágenes", parentFolderId: "articulos" })
]);

test("los breadcrumbs respetan la jerarquía y no mutan las carpetas", () => {
  const antes = JSON.stringify(carpetasJerarquia);
  assert.deepEqual(construirBreadcrumbs(carpetasJerarquia, "memoria"), [
    { id: null, name: "Mi nube", type: "root" },
    { id: "articulos", name: "Artículos", type: "folder" },
    { id: "neuro", name: "Neurociencias", type: "folder" },
    { id: "memoria", name: "Memoria", type: "folder" }
  ]);
  assert.deepEqual(construirBreadcrumbs(carpetasJerarquia, null, { rootLabel: "Raíz" }), [
    { id: null, name: "Raíz", type: "root" }
  ]);
  assert.equal(JSON.stringify(carpetasJerarquia), antes);
});

test("los descendientes y movimientos impiden ciclos", () => {
  assert.deepEqual(obtenerIdsDescendientes(carpetasJerarquia, "articulos"), ["neuro", "imagenes", "memoria"]);
  assert.deepEqual(obtenerIdsDescendientes(carpetasJerarquia, "memoria"), []);
  assert.deepEqual(obtenerIdsDescendientes(carpetasJerarquia, "inexistente"), []);

  assert.deepEqual(
    validarMovimientoCarpeta({ carpetaId: "memoria", nuevoPadreId: null, carpetas: carpetasJerarquia }),
    { valid: true, code: "ok" }
  );
  assert.deepEqual(
    validarMovimientoCarpeta({ carpetaId: "memoria", nuevoPadreId: "imagenes", carpetas: carpetasJerarquia }),
    { valid: true, code: "ok" }
  );
  assert.equal(
    validarMovimientoCarpeta({ carpetaId: "articulos", nuevoPadreId: "memoria", carpetas: carpetasJerarquia }).code,
    "cloud-folder/descendant-parent"
  );
  assert.equal(
    validarMovimientoCarpeta({ carpetaId: "neuro", nuevoPadreId: "neuro", carpetas: carpetasJerarquia }).code,
    "cloud-folder/self-parent"
  );
  assert.equal(
    validarMovimientoCarpeta({ carpetaId: "faltante", nuevoPadreId: null, carpetas: carpetasJerarquia }).code,
    "cloud-folder/not-found"
  );
  assert.equal(
    validarMovimientoCarpeta({ carpetaId: "neuro", nuevoPadreId: "faltante", carpetas: carpetasJerarquia }).code,
    "cloud-folder/parent-not-found"
  );
  assert.equal(
    creariaCicloCarpetas({ carpetaId: "articulos", nuevoPadreId: "memoria", carpetas: carpetasJerarquia }),
    true
  );
  assert.equal(
    creariaCicloCarpetas({ carpetaId: "memoria", nuevoPadreId: null, carpetas: carpetasJerarquia }),
    false
  );
});

test("los ciclos existentes se detectan y no causan recorridos infinitos", () => {
  const ciclicas = [
    { id: "a", type: "folder", parentFolderId: "c" },
    { id: "b", type: "folder", parentFolderId: "a" },
    { id: "c", type: "folder", parentFolderId: "b" },
    { id: "self", type: "folder", parentFolderId: "self" },
    { id: "libre", type: "folder", parentFolderId: null }
  ];
  const ciclos = detectarCiclosCarpetas(ciclicas);
  assert.equal(ciclos.length, 2);
  assert.deepEqual(ciclos.map((ciclo) => [...ciclo].sort()).sort(), [["a", "b", "c"], ["self"]]);
  assert.equal(
    validarMovimientoCarpeta({ carpetaId: "libre", nuevoPadreId: "a", carpetas: ciclicas }).code,
    "cloud-folder/existing-cycle"
  );

  assert.throws(
    () => construirBreadcrumbs(ciclicas, "a"),
    (error) => error instanceof MiNubeHierarchyError && error.code === "cloud-folder/hierarchy-cycle"
  );
  assert.throws(
    () => construirBreadcrumbs(carpetasJerarquia, "faltante"),
    (error) => error instanceof MiNubeHierarchyError && error.code === "cloud-folder/not-found"
  );
});

const elementos = Object.freeze([
  Object.freeze({ id: "folder", type: "folder", name: "Artículos", parentFolderId: null, deleted: false }),
  Object.freeze({ id: "image", type: "file", sourceType: "cloud-file", name: "Cerebro.JPG", extension: ".jpg", mimeType: "image/jpeg", sizeBytes: 30, parentFolderId: null, deleted: false, updatedAt: "2026-08-20" }),
  Object.freeze({ id: "pdf", type: "file", sourceType: "cloud-file", name: "Memoria.pdf", extension: ".pdf", mimeType: "application/pdf", sizeBytes: 20, parentFolderId: null, deleted: false, updatedAt: "2026-08-22" }),
  Object.freeze({ id: "text", type: "file", sourceType: "cloud-file", name: "dopamina.md", extension: ".md", mimeType: "text/markdown", sizeBytes: 10, parentFolderId: "folder", deleted: false, updatedAt: "2026-08-21" }),
  Object.freeze({ id: "note", type: "note", sourceType: "note", name: "Cardiología práctica", searchText: "presión arterial", sizeBytes: 0, parentFolderId: null, deleted: false, updatedAt: { seconds: 1_800_000_000, nanoseconds: 0 } }),
  Object.freeze({ id: "note-folder", type: "folder", sourceType: "noteFolder", name: "Psiquiatría", sizeBytes: 0, parentFolderId: null, deleted: false }),
  Object.freeze({ id: "trash", type: "file", sourceType: "cloud-file", name: "Borrada.png", extension: ".png", mimeType: "image/png", sizeBytes: 40, parentFolderId: null, deleted: true, updatedAt: new Date("2026-08-19") })
]);

test("los filtros separan fuentes, tipos, carpetas y papelera", () => {
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { parentFolderId: null }).map(({ id }) => id),
    ["folder", "image", "pdf", "note", "note-folder"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "Archivos", parentFolderId: null }).map(({ id }) => id),
    ["folder", "image", "pdf"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "files", parentFolderId: null, includeFolders: false }).map(({ id }) => id),
    ["image", "pdf"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "Imágenes", parentFolderId: null }).map(({ id }) => id),
    ["image"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "PDF", parentFolderId: null }).map(({ id }) => id),
    ["pdf"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "Texto", parentFolderId: "folder" }).map(({ id }) => id),
    ["text"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "Mis apuntes", parentFolderId: null }).map(({ id }) => id),
    ["note", "note-folder"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { filter: "Papelera", parentFolderId: null }).map(({ id }) => id),
    ["trash"]
  );
  assert.deepEqual(
    filtrarElementosMiNube(elementos, { deleted: "all", parentFolderId: null }).map(({ id }) => id),
    ["folder", "image", "pdf", "note", "note-folder", "trash"]
  );
});

test("la búsqueda local ignora acentos y considera nombre, contenido proyectado y tipo", () => {
  assert.deepEqual(filtrarElementosMiNube(elementos, { query: "cardiologia" }).map(({ id }) => id), ["note"]);
  assert.deepEqual(filtrarElementosMiNube(elementos, { query: "PRESION" }).map(({ id }) => id), ["note"]);
  assert.deepEqual(filtrarElementosMiNube(elementos, { query: "pdf" }).map(({ id }) => id), ["pdf"]);
  assert.deepEqual(filtrarElementosMiNube(elementos, { query: "IMAGE/JPEG" }).map(({ id }) => id), ["image"]);
  assert.deepEqual(filtrarElementosMiNube(elementos, { query: "no existe" }), []);
});

test("el orden es estable, no muta la entrada y admite nombres, fecha y tamaño", () => {
  const entrada = [elementos[1], elementos[2], elementos[3], elementos[0]];
  const copia = [...entrada];
  assert.deepEqual(
    ordenarElementosMiNube(entrada, "Nombre A-Z").map(({ id }) => id),
    ["folder", "image", "text", "pdf"]
  );
  assert.deepEqual(
    ordenarElementosMiNube(entrada, "Nombre Z-A", { foldersFirst: false }).map(({ id }) => id),
    ["pdf", "text", "image", "folder"]
  );
  assert.deepEqual(
    ordenarElementosMiNube(entrada, "Mayor tamaño", { foldersFirst: false }).map(({ id }) => id),
    ["image", "pdf", "text", "folder"]
  );
  assert.deepEqual(
    ordenarElementosMiNube(entrada, "Menor tamaño", { foldersFirst: false }).map(({ id }) => id),
    ["folder", "text", "pdf", "image"]
  );
  assert.deepEqual(
    ordenarElementosMiNube([elementos[1], elementos[2], elementos[3], elementos[4]], "Más recientes", { foldersFirst: false }).map(({ id }) => id),
    ["note", "pdf", "text", "image"]
  );
  assert.deepEqual(entrada, copia);
  assert.notEqual(ordenarElementosMiNube(entrada), entrada);
});

test("el escape HTML cubre texto y atributos", () => {
  assert.equal(
    escaparHtml(`<img src="x" onerror='alert(1)'> &`),
    "&lt;img src=&quot;x&quot; onerror=&#039;alert(1)&#039;&gt; &amp;"
  );
});

test("Markdown seguro renderiza estructura básica sin ejecutar HTML", () => {
  const html = renderizarMarkdownSeguro(`# Título & más

Texto con **negritas**, *énfasis*, ~~tachado~~ y \`<tag>\`.

- Uno
- Dos

1. Primero
2. Segundo

> Una cita
> en dos líneas

---

<script>alert("x")</script><img src=x onerror=alert(1)>`);

  assert.match(html, /<h1>Título &amp; más<\/h1>/);
  assert.match(html, /<strong>negritas<\/strong>/);
  assert.match(html, /<em>énfasis<\/em>/);
  assert.match(html, /<del>tachado<\/del>/);
  assert.match(html, /<code>&lt;tag&gt;<\/code>/);
  assert.match(html, /<ul><li>Uno<\/li><li>Dos<\/li><\/ul>/);
  assert.match(html, /<ol><li>Primero<\/li><li>Segundo<\/li><\/ol>/);
  assert.match(html, /<blockquote>Una cita<br>en dos líneas<\/blockquote>/);
  assert.match(html, /<hr>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("Markdown solo crea enlaces para protocolos seguros", () => {
  const seguro = renderizarMarkdownSeguro("[Fuente](https://example.com/a?x=1&y=2)");
  assert.match(seguro, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(seguro, /target="_blank" rel="noopener noreferrer"/);

  const correo = renderizarMarkdownSeguro("[Correo](mailto:persona@example.com)");
  assert.match(correo, /href="mailto:persona@example\.com"/);

  for (const peligroso of [
    "[X](javascript:alert(1))",
    "[X](data:text/html;base64,PHNjcmlwdD4=)",
    "[X](file:///etc/passwd)",
    "[X](//evil.example/path)"
  ]) {
    const render = renderizarMarkdownSeguro(peligroso);
    assert.doesNotMatch(render, /<a\s/i);
  }

  const imagenMarkdown = renderizarMarkdownSeguro("![No cargar](https://example.com/tracker.png)");
  assert.doesNotMatch(imagenMarkdown, /<img/i);
  assert.match(imagenMarkdown, /!<a /);
});

test("los bloques de código Markdown escapan contenido y lenguaje", () => {
  const html = renderizarMarkdownSeguro(`\`\`\`js
const html = "<img onerror=alert(1)>";
\`\`\``);
  assert.match(html, /^<pre><code class="language-js">/);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/i);

  const sinCierre = renderizarMarkdownSeguro("```\n<b>texto</b>");
  assert.equal(sinCierre, "<pre><code>&lt;b&gt;texto&lt;/b&gt;</code></pre>");
  assert.equal(renderizarMarkdownSeguro(""), "");
});

test("el puente de Mis apuntes permanece de solo lectura y sin cuota", () => {
  const fuente = readFileSync(new URL("../js/services/notesCloudBridgeService.js", import.meta.url), "utf8");
  assert.match(fuente, /collection\(dbInstance,\s*"usuarios",\s*ownerId,\s*"apuntesMedico"\)/);
  assert.match(fuente, /sourceType:\s*"note"/);
  assert.match(fuente, /countsTowardCloudQuota:\s*false/);
  assert.match(fuente, /quotaBytes:\s*0/);
  assert.match(fuente, /apuntes\.html/);
  assert.match(fuente, /apunte:\s*id/);
  assert.match(fuente, /nuevo:\s*"1"/);
  assert.doesNotMatch(fuente, /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
});
