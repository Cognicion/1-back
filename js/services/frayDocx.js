const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xml(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function limpiarTextoEnriquecido(valor = "") {
  const texto = String(valor || "");
  if (!/[<>]/.test(texto)) return texto.replace(/\r\n?/g, "\n");
  if (typeof DOMParser === "undefined") {
    return texto
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
  const documento = new DOMParser().parseFromString(`<body>${texto}</body>`, "text/html");
  documento.querySelectorAll("br").forEach((nodo) => nodo.replaceWith("\n"));
  documento.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6").forEach((nodo) => nodo.append("\n"));
  return (documento.body.textContent || "").replace(/\r\n?/g, "\n");
}

function run(texto, opciones = {}) {
  const propiedades = [
    opciones.bold ? "<w:b/>" : "",
    opciones.italic ? "<w:i/>" : "",
    opciones.size ? `<w:sz w:val="${opciones.size}"/><w:szCs w:val="${opciones.size}"/>` : ""
  ].join("");
  return `<w:r>${propiedades ? `<w:rPr>${propiedades}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(texto)}</w:t></w:r>`;
}

function runsDesdeNodo(nodo, estilos = {}) {
  if (nodo.nodeType === 3) return run(nodo.nodeValue || "", estilos);
  if (nodo.nodeType !== 1) return "";
  const etiqueta = nodo.tagName.toLowerCase();
  if (etiqueta === "br") return "<w:br/>";
  const siguientes = {
    ...estilos,
    bold: estilos.bold || etiqueta === "strong" || etiqueta === "b",
    italic: estilos.italic || etiqueta === "em" || etiqueta === "i"
  };
  return [...nodo.childNodes].map((hijo) => runsDesdeNodo(hijo, siguientes)).join("");
}

function parrafosHtml(valor) {
  if (typeof DOMParser === "undefined" || !/<[a-z][\s\S]*>/i.test(valor)) return "";
  const documento = new DOMParser().parseFromString(`<body>${valor}</body>`, "text/html");
  const bloques = [];
  const agregar = (nodo, opciones = {}) => {
    const contenido = runsDesdeNodo(nodo);
    if (!contenido && !nodo.textContent?.trim()) return;
    const propiedades = [
      opciones.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "",
      '<w:spacing w:before="0" w:after="100" w:line="276" w:lineRule="auto"/>'
    ].join("");
    bloques.push(`<w:p><w:pPr>${propiedades}</w:pPr>${contenido || run("")}</w:p>`);
  };
  [...documento.body.childNodes].forEach((nodo) => {
    if (nodo.nodeType === 3) {
      if (nodo.nodeValue?.trim()) agregar(nodo);
      return;
    }
    const etiqueta = nodo.tagName?.toLowerCase();
    if (etiqueta === "ul" || etiqueta === "ol") {
      [...nodo.children].forEach((item) => agregar(item, { bullet: true }));
    } else {
      agregar(nodo, { bullet: etiqueta === "li" });
    }
  });
  return bloques.join("");
}

function parrafo(texto = "", opciones = {}) {
  const limpio = limpiarTextoEnriquecido(texto).trimEnd();
  const lineas = limpio.split("\n");
  const contenido = lineas.map((linea, indice) => `${indice ? "<w:br/>" : ""}${run(linea, opciones)}`).join("");
  const propiedades = [
    opciones.style ? `<w:pStyle w:val="${opciones.style}"/>` : "",
    opciones.align ? `<w:jc w:val="${opciones.align}"/>` : "",
    opciones.keepNext ? "<w:keepNext/>" : "",
    opciones.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "",
    '<w:spacing w:before="0" w:after="100" w:line="276" w:lineRule="auto"/>'
  ].join("");
  return `<w:p><w:pPr>${propiedades}</w:pPr>${contenido || run("")}</w:p>`;
}

function parrafosContenido(valor = "") {
  const enriquecido = parrafosHtml(String(valor || ""));
  if (enriquecido) return enriquecido;
  const limpio = limpiarTextoEnriquecido(valor).replace(/\n{3,}/g, "\n\n").trim();
  if (!limpio) return parrafo("Sin información registrada.", { style: "Empty" });
  return limpio.split(/\n\s*\n/).map((bloque) => {
    const lineas = bloque.split("\n");
    if (lineas.every((linea) => /^\s*[-*•]\s+/.test(linea))) {
      return lineas.map((linea) => parrafo(linea.replace(/^\s*[-*•]\s+/, ""), { bullet: true })).join("");
    }
    return parrafo(bloque);
  }).join("");
}

function celda(contenido, ancho = 0, opciones = {}) {
  return `<w:tc><w:tcPr>${ancho ? `<w:tcW w:w="${ancho}" w:type="dxa"/>` : ""}${opciones.sinBorde ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : ""}</w:tcPr>${contenido}</w:tc>`;
}

function tabla(filas, anchos = []) {
  const bordes = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="777777"/><w:left w:val="single" w:sz="4" w:color="777777"/><w:bottom w:val="single" w:sz="4" w:color="777777"/><w:right w:val="single" w:sz="4" w:color="777777"/><w:insideH w:val="single" w:sz="4" w:color="AAAAAA"/><w:insideV w:val="single" w:sz="4" w:color="AAAAAA"/></w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${bordes}</w:tblPr>${filas.map((fila) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${fila.map((contenido, indice) => celda(contenido, anchos[indice] || 0)).join("")}</w:tr>`).join("")}</w:tbl>`;
}

function imagenInline(relId, nombre, cx, cy) {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${relId === "rIdLogo1" ? 1 : 2}" name="${xml(nombre)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${xml(nombre)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function encabezadoInstitucional(datos, imagenes) {
  const izquierda = imagenes[0] ? imagenInline("rIdLogo1", "Logotipo Salud", 1500000, 500000) : parrafo("");
  const derecha = imagenes[1] ? imagenInline("rIdLogo2", "Logotipo Fray", 650000, 650000) : parrafo("");
  const centro = [
    parrafo(datos.institucionSuperior || "SECRETARÍA DE SALUD", { bold: true, align: "center", size: 18 }),
    parrafo(datos.institucionIntermedia || "COMISIÓN NACIONAL DE SALUD MENTAL Y ADICCIONES", { bold: true, align: "center", size: 17 }),
    parrafo(datos.institucion || 'HOSPITAL PSIQUIÁTRICO "FRAY BERNARDINO ÁLVAREZ"', { bold: true, align: "center", size: 18 })
  ].join("");
  return tabla([[izquierda, centro, derecha]], [1900, 6100, 1400]);
}

function tablaIdentificacion(datos) {
  const paciente = datos.paciente || {};
  const pares = [
    ["Paciente", paciente.nombre], ["Expediente", paciente.expediente],
    ["Fecha de nacimiento", paciente.fechaNacimiento], ["Edad", paciente.edad],
    ["Sexo", paciente.sexo], ["Cama", paciente.cama],
    ["Servicio", datos.servicio], ["Fecha y hora", datos.fechaHora],
    ["Médico responsable", datos.medico?.nombre], ["Estado", datos.estadoNota]
  ].filter(([, valor]) => String(valor ?? "").trim());
  const filas = [];
  for (let i = 0; i < pares.length; i += 2) {
    const izquierda = pares[i];
    const derecha = pares[i + 1];
    filas.push([
      parrafo(izquierda[0], { bold: true }), parrafo(izquierda[1]),
      derecha ? parrafo(derecha[0], { bold: true }) : parrafo(""),
      derecha ? parrafo(derecha[1]) : parrafo("")
    ]);
  }
  return tabla(filas, [1600, 3000, 1600, 3000]);
}

function contenidoDocumento(datos, imagenes) {
  const partes = [
    encabezadoInstitucional(datos, imagenes),
    parrafo(datos.titulo || "NOTA CLÍNICA", { style: "Title", align: "center", keepNext: true }),
    tablaIdentificacion(datos)
  ];

  (datos.secciones || []).forEach((seccion) => {
    if (!String(seccion?.contenido || "").trim()) return;
    partes.push(parrafo(seccion.titulo || "SECCIÓN", { style: "Heading1", keepNext: true }));
    partes.push(parrafosContenido(seccion.contenido));
  });

  if (datos.diagnosticos?.length) {
    partes.push(parrafo("DIAGNÓSTICOS", { style: "Heading1", keepNext: true }));
    partes.push(tabla([
      [parrafo("Código", { bold: true }), parrafo("Diagnóstico", { bold: true })],
      ...datos.diagnosticos.map((dx) => [parrafo(dx.codigo || ""), parrafo(dx.diagnostico || dx.nombre || dx.texto || "")])
    ], [1800, 7400]));
  }

  const firmas = (datos.firmas || []).filter((firma) => firma?.nombre || firma?.cedula || firma?.cargo);
  if (firmas.length) {
    partes.push(parrafo("NOMBRE, FIRMA Y CÉDULA PROFESIONAL", { style: "Heading1", keepNext: true }));
    partes.push(tabla([firmas.map((firma) => parrafo([firma.nombre, firma.cargo, firma.especialidad, firma.cedula ? `Céd. Prof. ${firma.cedula}` : ""].filter(Boolean).join("\n"), { align: "center" }))]));
  }

  partes.push(`<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>`);
  return partes.join("");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(buffer, offset, valor) { buffer[offset] = valor & 255; buffer[offset + 1] = (valor >>> 8) & 255; }
function u32(buffer, offset, valor) { u16(buffer, offset, valor); u16(buffer, offset + 2, valor >>> 16); }

function zipSinCompresion(archivos) {
  const encoder = new TextEncoder();
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const archivo of archivos) {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = typeof archivo.contenido === "string" ? encoder.encode(archivo.contenido) : archivo.contenido;
    const crc = crc32(contenido);
    const local = new Uint8Array(30 + nombre.length);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u32(local, 14, crc); u32(local, 18, contenido.length); u32(local, 22, contenido.length); u16(local, 26, nombre.length); local.set(nombre, 30);
    const central = new Uint8Array(46 + nombre.length);
    u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20); u32(central, 16, crc); u32(central, 20, contenido.length); u32(central, 24, contenido.length); u16(central, 28, nombre.length); u32(central, 42, offset); central.set(nombre, 46);
    locales.push(local, contenido); centrales.push(central); offset += local.length + contenido.length;
  }
  const inicioCentral = offset;
  centrales.forEach((central) => { offset += central.length; });
  const fin = new Uint8Array(22);
  u32(fin, 0, 0x06054b50); u16(fin, 8, archivos.length); u16(fin, 10, archivos.length); u32(fin, 12, offset - inicioCentral); u32(fin, 16, inicioCentral);
  const partes = [...locales, ...centrales, fin];
  const total = partes.reduce((suma, parte) => suma + parte.length, 0);
  const salida = new Uint8Array(total);
  let posicion = 0;
  partes.forEach((parte) => { salida.set(parte, posicion); posicion += parte.length; });
  return salida;
}

export function crearDocumentoWordFray(datos, imagenes = []) {
  const logos = imagenes.filter((imagen) => imagen?.bytes instanceof Uint8Array).slice(0, 2);
  const relacionesImagen = logos.map((imagen, indice) => `<Relationship Id="rIdLogo${indice + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo${indice + 1}.${imagen.extension || "png"}"/>`).join("");
  const extensionesImagen = [...new Set(logos.map((imagen) => imagen.extension || "png"))]
    .map((extension) => `<Default Extension="${xml(extension)}" ContentType="image/${extension === "jpg" ? "jpeg" : xml(extension)}"/>`).join("");
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${contenidoDocumento(datos, logos)}</w:body></w:document>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Empty"><w:name w:val="Empty"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="777777"/></w:rPr></w:style></w:styles>`;
  const numeracion = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Página </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t> de </w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  const archivos = [
    { nombre: "[Content_Types].xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${extensionesImagen}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
    { nombre: "_rels/.rels", contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { nombre: "word/document.xml", contenido: documento },
    { nombre: "word/styles.xml", contenido: estilos },
    { nombre: "word/numbering.xml", contenido: numeracion },
    { nombre: "word/footer1.xml", contenido: footer },
    { nombre: "word/_rels/document.xml.rels", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${relacionesImagen}</Relationships>` },
    ...logos.map((imagen, indice) => ({ nombre: `word/media/logo${indice + 1}.${imagen.extension || "png"}`, contenido: imagen.bytes }))
  ];
  return new Blob([zipSinCompresion(archivos)], { type: MIME_DOCX });
}

export function nombreSeguroNotaWord({ tipoNota = "Nota", apellidoPaciente = "Paciente", fecha = "" } = {}) {
  const seguro = (valor, alternativo) => String(valor || alternativo)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\s+/g, "_").slice(0, 80) || alternativo;
  const fechaSegura = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10);
  return `Nota_${seguro(tipoNota, "Clinica")}_${seguro(apellidoPaciente, "Paciente")}_${fechaSegura}.docx`;
}
