import assert from "node:assert/strict";
import test from "node:test";
import { crearDocxApunte, construirHtmlApunteExportable } from "../apuntes-export.js";

test("construye una vista exportable sin interpolar título ni texto de objetos como HTML", () => {
  const html = construirHtmlApunteExportable({
    titulo: '<script>alert("x")</script> Guardia',
    contenidoHtml: "<p>Contenido <strong>con formato</strong></p>",
    objetos: [
      { id: "texto-1", tipo: "texto", ajuste: "cuadrado", texto: "Cuadro <seguro>", color: "#123456" },
      { id: "flecha-1", tipo: "flecha", ajuste: "detras", color: "#abcdef" }
    ]
  });

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; Guardia/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Cuadro &lt;seguro&gt;/);
  assert.match(html, /objeto-exportable--cuadrado/);
  assert.match(html, /punta-export-flecha-1/);
  assert.match(html, /z-index:1;opacity:\.7/);
});

test("crea un DOCX válido con el documento y la alternativa HTML", async () => {
  const blob = crearDocxApunte({
    titulo: "Apunte de prueba",
    contenidoHtml: "<p>Contenido de prueba</p>",
    objetos: [{ id: "uno", tipo: "texto", texto: "Cuadro" }]
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const texto = new TextDecoder().decode(bytes);

  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(texto, /word\/document\.xml/);
  assert.match(texto, /word\/afchunk\.html/);
  assert.match(texto, /Apunte de prueba/);
});
