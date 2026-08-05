const FIRMA_LOCAL_ZIP = 0x04034b50;
const FIRMA_CENTRAL_ZIP = 0x02014b50;
const FIRMA_EOCD_ZIP = 0x06054b50;
const DECODER = new TextDecoder("utf-8");

function uint32(view, offset) {
  return view.getUint32(offset, true);
}

function uint16(view, offset) {
  return view.getUint16(offset, true);
}

async function inflarDeflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Este navegador no soporta descompresion local de DOCX.");
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}

async function descomprimirEntrada(bytes, metodo) {
  if (metodo === 0) return bytes;
  if (metodo === 8) return inflarDeflateRaw(bytes);
  throw new Error(`Metodo de compresion DOCX no soportado: ${metodo}.`);
}

function encontrarEOCD(view) {
  const inicio = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= inicio; offset -= 1) {
    if (uint32(view, offset) === FIRMA_EOCD_ZIP) return offset;
  }
  return -1;
}

async function leerEntradasZipDesdeCentral(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const entradas = new Map();
  const eocd = encontrarEOCD(view);
  if (eocd < 0) throw new Error("No se encontro el directorio central del DOCX.");

  const total = uint16(view, eocd + 10);
  let offset = uint32(view, eocd + 16);

  for (let index = 0; index < total; index += 1) {
    if (uint32(view, offset) !== FIRMA_CENTRAL_ZIP) break;
    const metodo = uint16(view, offset + 10);
    const comprimido = uint32(view, offset + 20);
    const nombreLen = uint16(view, offset + 28);
    const extraLen = uint16(view, offset + 30);
    const comentarioLen = uint16(view, offset + 32);
    const localOffset = uint32(view, offset + 42);
    const nombreInicio = offset + 46;
    const nombre = DECODER.decode(bytes.slice(nombreInicio, nombreInicio + nombreLen));

    if (uint32(view, localOffset) === FIRMA_LOCAL_ZIP) {
      const localNombreLen = uint16(view, localOffset + 26);
      const localExtraLen = uint16(view, localOffset + 28);
      const datosInicio = localOffset + 30 + localNombreLen + localExtraLen;
      const datosComprimidos = bytes.slice(datosInicio, datosInicio + comprimido);
      entradas.set(nombre, await descomprimirEntrada(datosComprimidos, metodo));
    }

    offset = nombreInicio + nombreLen + extraLen + comentarioLen;
  }

  return entradas;
}

async function leerEntradasZipLocal(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const entradas = new Map();
  let offset = 0;

  while (offset + 30 < bytes.length) {
    if (uint32(view, offset) !== FIRMA_LOCAL_ZIP) {
      offset += 1;
      continue;
    }

    const flags = uint16(view, offset + 6);
    const metodo = uint16(view, offset + 8);
    const comprimido = uint32(view, offset + 18);
    const nombreLen = uint16(view, offset + 26);
    const extraLen = uint16(view, offset + 28);
    const nombreInicio = offset + 30;
    const nombre = DECODER.decode(bytes.slice(nombreInicio, nombreInicio + nombreLen));
    const datosInicio = nombreInicio + nombreLen + extraLen;

    if ((flags & 0x08) !== 0 || !comprimido) {
      offset = datosInicio;
      continue;
    }

    const datosComprimidos = bytes.slice(datosInicio, datosInicio + comprimido);
    entradas.set(nombre, await descomprimirEntrada(datosComprimidos, metodo));
    offset = datosInicio + comprimido;
  }

  return entradas;
}

async function leerEntradasZip(arrayBuffer) {
  try {
    const entradas = await leerEntradasZipDesdeCentral(arrayBuffer);
    if (entradas.size) return entradas;
  } catch (error) {
    console.warn("No se pudo leer el directorio central del DOCX; se intentara lectura local.", error);
  }
  return leerEntradasZipLocal(arrayBuffer);
}

function parseXml(xmlTexto) {
  return new DOMParser().parseFromString(xmlTexto, "application/xml");
}

function runsDeNodo(nodo) {
  const partes = [];
  nodo.querySelectorAll("*").forEach((item) => {
    if (item.localName === "t") partes.push(item.textContent || "");
    if (item.localName === "tab") partes.push("\t");
    if (item.localName === "br") partes.push("\n");
  });
  return partes;
}

function reconstruirTextoRuns(runs = []) {
  return runs.join("").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function textoDeNodo(nodo) {
  const paragraphs = [...nodo.children].filter((child) => child.localName === "p");
  if (paragraphs.length > 1) {
    return paragraphs
      .map((paragraph) => reconstruirTextoRuns(runsDeNodo(paragraph)))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return reconstruirTextoRuns(runsDeNodo(nodo));
}

function extraerTabla(tabla) {
  const rows = [...tabla.children]
    .filter((nodo) => nodo.localName === "tr")
    .map((fila) => [...fila.children]
      .filter((nodo) => nodo.localName === "tc")
      .map((celda) => textoDeNodo(celda)));

  const header = rows[0]?.map((value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) || [];
  if (!header.some((value) => /diagnostico/.test(value)) || !header.some((value) => /cie[- ]?10/.test(value))) return rows;

  const codePattern = /[A-Z]\d{2,3}(?:\.\d{1,2})?/gi;
  const expanded = [rows[0]];
  rows.slice(1).forEach((row) => {
    const names = String(row[0] || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const codeGroups = String(row[1] || "").split(/\r?\n/).map((value) => [...value.matchAll(codePattern)].map((match) => match[0].toUpperCase())).filter((group) => group.length);
    if (!names.length || !codeGroups.length || names.length < codeGroups.length) {
      expanded.push(row);
      return;
    }

    let groupIndex = 0;
    let carry = [];
    names.forEach((name, nameIndex) => {
      const group = carry.length ? carry.splice(0) : (codeGroups[groupIndex++] || []);
      const namesRemaining = names.length - nameIndex - 1;
      const groupsRemaining = codeGroups.length - groupIndex;
      const spillCount = namesRemaining === 0
        ? group.length
        : Math.max(1, group.length - Math.max(1, namesRemaining - groupsRemaining));
      const assigned = group.slice(0, spillCount || group.length);
      carry = group.slice(assigned.length);
      expanded.push([name, assigned.join(", ")]);
    });
  });
  return expanded;
}

function bloqueDesdeNodo(nodo, origen) {
  if (nodo.localName === "p") {
    const rawRuns = runsDeNodo(nodo);
    const texto = reconstruirTextoRuns(rawRuns);
    return texto ? { tipo: "paragraph", texto, rawRuns, origen } : null;
  }
  if (nodo.localName === "tbl") {
    const filas = extraerTabla(nodo);
    return filas.length ? { tipo: "table", filas, origen } : null;
  }
  return null;
}

function extraerBloquesXml(xmlTexto, origen) {
  const doc = parseXml(xmlTexto);
  const body = doc.querySelector("body") || doc.documentElement;
  const bloques = [];

  [...body.children].forEach((nodo) => {
    const bloque = bloqueDesdeNodo(nodo, origen);
    if (bloque) bloques.push(bloque);
  });

  return bloques;
}

function ordenarPartesDocx(nombre) {
  if (nombre === "word/document.xml") return 0;
  if (/word\/header\d*\.xml$/i.test(nombre)) return 1;
  if (/word\/footer\d*\.xml$/i.test(nombre)) return 2;
  return 9;
}

export async function extraerDocx(file) {
  const entradas = await leerEntradasZip(await file.arrayBuffer());
  const partes = [...entradas.keys()]
    .filter((nombre) => nombre === "word/document.xml" || /word\/(?:header|footer)\d*\.xml$/i.test(nombre))
    .sort((a, b) => ordenarPartesDocx(a) - ordenarPartesDocx(b) || a.localeCompare(b));

  if (!partes.includes("word/document.xml")) {
    throw new Error("El DOCX no contiene word/document.xml.");
  }

  const bloques = partes.flatMap((nombre) => {
    const origen = nombre.includes("/header") ? "header" : nombre.includes("/footer") ? "footer" : "body";
    return extraerBloquesXml(DECODER.decode(entradas.get(nombre)), origen);
  });

  const textoPlano = bloques.map((bloque) => {
    if (bloque.tipo === "paragraph") return bloque.texto;
    return bloque.filas.map((fila) => fila.join(" | ")).join("\n");
  }).filter(Boolean).join("\n");

  return { bloques, textoPlano, partes };
}
