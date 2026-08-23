import { normalizarObjetosApunte } from "./apuntes-objetos.js";
import { normalizarDisposicionHoja, obtenerMedidasHoja } from "./apuntes-page-layout.js";

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let dependenciasPdf = null;

function escaparHTML(valor = "") {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nombreSeguro(nombre = "Apunte") {
  const limpio = String(nombre || "Apunte").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 72);
  return limpio || "Apunte";
}

function trazoFlechaExportable(objeto) {
  const inicioX = Number(objeto.inicioX);
  const inicioY = Number(objeto.inicioY);
  const finX = Number(objeto.finX);
  const finY = Number(objeto.finY);
  const deltaX = finX - inicioX;
  const deltaY = finY - inicioY;
  const longitud = Math.hypot(deltaX, deltaY);
  if (longitud < 0.01) return `M${inicioX.toFixed(3)} ${inicioY.toFixed(3)} L${finX.toFixed(3)} ${finY.toFixed(3)}`;
  const tamanioPunta = Math.min(2.4, Math.max(1.25, longitud * 0.08));
  const semiancho = tamanioPunta * 0.55;
  const unidadX = deltaX / longitud;
  const unidadY = deltaY / longitud;
  const baseX = finX - (unidadX * tamanioPunta);
  const baseY = finY - (unidadY * tamanioPunta);
  const izquierdaX = baseX - (unidadY * semiancho);
  const izquierdaY = baseY + (unidadX * semiancho);
  const derechaX = baseX + (unidadY * semiancho);
  const derechaY = baseY - (unidadX * semiancho);
  return `M${inicioX.toFixed(3)} ${inicioY.toFixed(3)} L${finX.toFixed(3)} ${finY.toFixed(3)} M${izquierdaX.toFixed(3)} ${izquierdaY.toFixed(3)} L${finX.toFixed(3)} ${finY.toFixed(3)} L${derechaX.toFixed(3)} ${derechaY.toFixed(3)}`;
}

function objetoHtml(objeto) {
  const base = `left:${objeto.x}%;top:${objeto.y}%;width:${objeto.ancho}%;height:${objeto.alto}%;`;
  const orden = objeto.ajuste === "detras" ? "z-index:1;opacity:.7;" : "z-index:3;";
  if (objeto.tipo === "flecha") {
    return `<div class="objeto-exportable objeto-exportable--flecha" style="left:0;top:0;width:100%;height:100%;${orden}color:${escaparHTML(objeto.color)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${trazoFlechaExportable(objeto)}" stroke="currentColor" stroke-width=".5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>`;
  }
  const claseAjuste = objeto.ajuste === "cuadrado" ? " objeto-exportable--cuadrado" : "";
  return `<div class="objeto-exportable objeto-exportable--texto${claseAjuste}" style="${base}${orden}color:${escaparHTML(objeto.color)}">${escaparHTML(objeto.texto).replace(/\n/g, "<br>")}</div>`;
}

export function construirHtmlApunteExportable({ titulo = "Sin título", contenidoHtml = "", objetos = [], disposicionHoja = {} } = {}) {
  const objetosNormalizados = normalizarObjetosApunte(objetos);
  const disposicion = normalizarDisposicionHoja(disposicionHoja);
  const medidas = obtenerMedidasHoja(disposicion);
  const margenes = disposicion.margenes;
  const altoContenido = Math.max(80, medidas.altoMm - margenes.superior - margenes.inferior);
  const tamanioFuentePt = (disposicion.tamanioFuente * 0.75).toFixed(2);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    @page { size: ${medidas.anchoMm}mm ${medidas.altoMm}mm; margin: ${margenes.superior}mm ${margenes.derecho}mm ${margenes.inferior}mm ${margenes.izquierdo}mm; }
    body { margin:0; color:#121417; background:#fff; font:${tamanioFuentePt}pt/1.52 Arial, sans-serif; }
    .apunte-exportable { position:relative; min-height:${altoContenido}mm; box-sizing:border-box; padding:0; }
    h1 { margin:0 0 10mm; color:#631b2a; font:700 19pt/1.2 Georgia, serif; }
    .apunte-exportable__contenido { position:relative; z-index:2; min-height:${Math.max(60, altoContenido - 22)}mm; white-space:pre-wrap; overflow-wrap:anywhere; }
    .apunte-exportable__contenido p, .apunte-exportable__contenido div { margin:0 0 5pt; }
    .objeto-exportable { position:absolute; box-sizing:border-box; overflow:hidden; }
    .objeto-exportable--texto { padding:7pt 9pt; border:1pt solid currentColor; border-radius:3pt; background:rgba(255,255,255,.78); white-space:pre-wrap; }
    .objeto-exportable--cuadrado { border-radius:0; background:#fff; }
    .objeto-exportable--flecha svg { display:block; width:100%; height:100%; overflow:visible; }
  </style></head><body><article class="apunte-exportable"><h1>${escaparHTML(titulo)}</h1><div class="apunte-exportable__contenido">${contenidoHtml || "<p>Sin contenido.</p>"}</div>${objetosNormalizados.map(objetoHtml).join("")}</article></body></html>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(buffer, offset, value) { buffer[offset] = value & 255; buffer[offset + 1] = (value >>> 8) & 255; }
function u32(buffer, offset, value) { u16(buffer, offset, value); u16(buffer, offset + 2, value >>> 16); }

function zipSinCompresion(archivos = []) {
  const encoder = new TextEncoder();
  const partes = [];
  const centrales = [];
  let offset = 0;
  for (const archivo of archivos) {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = archivo.contenido instanceof Uint8Array ? archivo.contenido : encoder.encode(archivo.contenido);
    const crc = crc32(contenido);
    const local = new Uint8Array(30 + nombre.length);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0); u16(local, 8, 0);
    u16(local, 10, 0); u16(local, 12, 0); u32(local, 14, crc); u32(local, 18, contenido.length); u32(local, 22, contenido.length);
    u16(local, 26, nombre.length); u16(local, 28, 0); local.set(nombre, 30);
    partes.push(local, contenido);
    const central = new Uint8Array(46 + nombre.length);
    u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20); u16(central, 8, 0); u16(central, 10, 0);
    u16(central, 12, 0); u16(central, 14, 0); u32(central, 16, crc); u32(central, 20, contenido.length); u32(central, 24, contenido.length);
    u16(central, 28, nombre.length); u16(central, 30, 0); u16(central, 32, 0); u16(central, 34, 0); u16(central, 36, 0); u32(central, 38, 0); u32(central, 42, offset); central.set(nombre, 46);
    centrales.push(central);
    offset += local.length + contenido.length;
  }
  const inicioCentral = offset;
  centrales.forEach((central) => { partes.push(central); offset += central.length; });
  const fin = new Uint8Array(22);
  u32(fin, 0, 0x06054b50); u16(fin, 4, 0); u16(fin, 6, 0); u16(fin, 8, archivos.length); u16(fin, 10, archivos.length);
  u32(fin, 12, offset - inicioCentral); u32(fin, 16, inicioCentral); u16(fin, 20, 0); partes.push(fin); offset += fin.length;
  const resultado = new Uint8Array(offset); let cursor = 0;
  partes.forEach((parte) => { resultado.set(parte, cursor); cursor += parte.length; });
  return resultado;
}

export function crearDocxApunte(datos = {}) {
  const html = construirHtmlApunteExportable(datos);
  const documento = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:altChunk r:id="htmlChunk"/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
  return new Blob([zipSinCompresion([
    { nombre: "[Content_Types].xml", contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="html" ContentType="text/html"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { nombre: "_rels/.rels", contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { nombre: "word/document.xml", contenido: documento },
    { nombre: "word/_rels/document.xml.rels", contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/></Relationships>' },
    { nombre: "word/afchunk.html", contenido: `\ufeff${html}` }
  ])], { type: MIME_DOCX });
}

function descargarBlob(blob, nombre) {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(blob);
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function descargarApunteWord(datos = {}) {
  descargarBlob(crearDocxApunte(datos), `${nombreSeguro(datos.titulo)}.docx`);
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const existente = [...document.scripts].find((script) => script.src === src);
    if (existente) {
      const disponible = src.includes("html2canvas") ? window.html2canvas : window.jspdf?.jsPDF;
      if (disponible) {
        resolve();
        return;
      }
      existente.addEventListener("load", resolve, { once: true });
      existente.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`No se pudo cargar ${src}`)); document.head.append(script);
  });
}

async function cargarDependenciasPdf() {
  if (dependenciasPdf) return dependenciasPdf;
  await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error("No se pudieron cargar las dependencias para PDF.");
  dependenciasPdf = { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
  return dependenciasPdf;
}

export async function descargarApuntePdf(datos = {}) {
  const { html2canvas, jsPDF } = await cargarDependenciasPdf();
  const contenedor = document.createElement("div");
  const disposicion = normalizarDisposicionHoja(datos.disposicionHoja);
  const medidas = obtenerMedidasHoja(disposicion);
  const exportable = construirHtmlApunteExportable(datos);
  const estilos = exportable.match(/<style>([\s\S]*?)<\/style>/i)?.[0] || "";
  const contenido = exportable.replace(/^[\s\S]*?<body>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  contenedor.className = "apunte-exportacion-temporal";
  contenedor.style.width = `${Math.round((medidas.anchoMm / 25.4) * 96)}px`;
  contenedor.style.minHeight = `${Math.round((medidas.altoMm / 25.4) * 96)}px`;
  contenedor.innerHTML = `${estilos}${contenido}`;
  document.body.append(contenedor);
  try {
    const pdf = new jsPDF({
      unit: "mm",
      format: [medidas.anchoMm, medidas.altoMm],
      orientation: medidas.anchoMm > medidas.altoMm ? "landscape" : "portrait"
    });
    await pdf.html(contenedor, {
      margin: [
        disposicion.margenes.superior,
        disposicion.margenes.derecho,
        disposicion.margenes.inferior,
        disposicion.margenes.izquierdo
      ],
      autoPaging: "text",
      html2canvas: { html2canvas, scale: 1.2, backgroundColor: "#ffffff", useCORS: true, logging: false }
    });
    pdf.save(`${nombreSeguro(datos.titulo)}.pdf`);
  } finally {
    contenedor.remove();
  }
}
