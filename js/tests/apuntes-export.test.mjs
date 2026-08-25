import assert from "node:assert/strict";
import test from "node:test";
import { crearDocxApunte, construirHtmlApunteExportable } from "../apuntes-export.js";

test("construye una vista exportable sin interpolar título ni texto de objetos como HTML", () => {
  const html = construirHtmlApunteExportable({
    titulo: '<script>alert("x")</script> Guardia',
    contenidoHtml: "<p>Contenido <strong>con formato</strong></p>",
    objetos: [
      { id: "texto-1", tipo: "texto", ajuste: "cuadrado", texto: "Cuadro <seguro>", color: "#123456" },
      { id: "flecha-1", tipo: "flecha", ajuste: "detras", color: "#abcdef", inicioX: 12, inicioY: 24, finX: 78, finY: 64 }
    ]
  });

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; Guardia/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Cuadro &lt;seguro&gt;/);
  assert.match(html, /objeto-exportable--cuadrado/);
  assert.doesNotMatch(html, /<marker|marker-end/);
  assert.match(html, /M12\.000 24\.000 L78\.000 64\.000 M/);
  assert.match(html, /z-index:1;opacity:\.7/);
});

test("exporta tamaño, márgenes y fuente de la disposición elegida", () => {
  const html = construirHtmlApunteExportable({
    disposicionHoja: {
      formato: "CARTA",
      orientacion: "horizontal",
      tamanioFuente: 16,
      margenes: { superior: 12, derecho: 14, inferior: 16, izquierdo: 18 }
    }
  });

  assert.match(html, /@page \{ size: 279\.4mm 215\.9mm; margin: 12mm 14mm 16mm 18mm; \}/);
  assert.match(html, /font:16\.00pt\/1\.52 Arial/);
});

test("la exportación conserva la jerarquía visual de las sublistas", () => {
  const html = construirHtmlApunteExportable({
    contenidoHtml: '<ol><li>Uno</li><ol type="a"><li>Dos</li></ol></ol>'
  });

  assert.match(html, /<ol type="a"><li>Dos<\/li><\/ol>/);
  assert.match(html, /ol ol\[type="a"\] > li::marker \{ content:counter\(list-item, lower-alpha\) "\) "; \}/);
  assert.match(html, /ul ul \{ list-style-type:circle; \}/);
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
