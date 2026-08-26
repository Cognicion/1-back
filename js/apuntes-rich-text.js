const ETIQUETAS_PERMITIDAS = new Set(["B", "STRONG", "BR", "DIV", "P", "SPAN", "FONT", "UL", "OL", "LI"]);
const ETIQUETAS_DESCARTADAS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"]);
const FAMILIAS_FUENTE_PERMITIDAS = new Map([
  ["aptos", "Aptos"],
  ["arial", "Arial"],
  ["calibri", "Calibri"],
  ["courier new", "Courier New"],
  ["georgia", "Georgia"],
  ["tahoma", "Tahoma"],
  ["times new roman", "Times New Roman"],
  ["trebuchet ms", "Trebuchet MS"],
  ["verdana", "Verdana"]
]);

export function sanitizarHTMLRico(html, documento = document) {
  const plantilla = documento.createElement("template");
  plantilla.innerHTML = String(html || "");
  const salida = documento.createElement("div");
  plantilla.content.childNodes.forEach((nodo) => salida.appendChild(limpiarNodoRico(nodo, documento)));
  return salida.innerHTML;
}

function limpiarNodoRico(nodo, documento) {
  const tipos = documento.defaultView?.Node || globalThis.Node;
  if (nodo.nodeType === tipos.TEXT_NODE) return documento.createTextNode(nodo.textContent || "");
  if (nodo.nodeType !== tipos.ELEMENT_NODE) return documento.createDocumentFragment();

  const etiqueta = nodo.tagName.toUpperCase();
  if (ETIQUETAS_DESCARTADAS.has(etiqueta)) return documento.createDocumentFragment();

  if (!ETIQUETAS_PERMITIDAS.has(etiqueta)) {
    const fragmento = documento.createDocumentFragment();
    nodo.childNodes.forEach((hijo) => fragmento.appendChild(limpiarNodoRico(hijo, documento)));
    return fragmento;
  }

  const etiquetaSalida = etiqueta === "FONT" ? "span" : etiqueta.toLowerCase();
  const limpio = documento.createElement(etiquetaSalida);
  const color = colorCSSSeguro(nodo.getAttribute("color") || nodo.style?.color);
  const fondo = colorCSSSeguro(nodo.style?.backgroundColor || nodo.getAttribute("bgcolor"));
  const interlineado = interlineadoSeguro(nodo.style?.lineHeight);
  const tamanoFuentePt = tamanoFuentePtSeguro(nodo.dataset?.tamanoFuentePt);
  const familiaFuente = familiaFuenteSegura(nodo.getAttribute("face") || nodo.style?.fontFamily);
  if (color) limpio.style.color = color;
  if (fondo) limpio.style.backgroundColor = fondo;
  if (interlineado) limpio.style.lineHeight = interlineado;
  if (familiaFuente) limpio.style.fontFamily = familiaFuente;
  if (tamanoFuentePt) {
    limpio.classList.add("tamano-fuente-apunte");
    limpio.dataset.tamanoFuentePt = tamanoFuentePt;
    limpio.style.fontSize = `${tamanoFuentePt}pt`;
  }
  if (etiqueta === "SPAN" && /^marcador-[a-z0-9-]{8,80}$/i.test(nodo.dataset?.marcadorId || "")) {
    limpio.classList.add("marcador-apunte");
    limpio.dataset.marcadorId = nodo.dataset.marcadorId;
    const colorMarcador = colorCSSSeguro(nodo.dataset.marcadorColor);
    if (colorMarcador) limpio.dataset.marcadorColor = colorMarcador;
    const comentarioMarcador = comentarioMarcadorSeguro(nodo.dataset?.marcadorComentario);
    if (comentarioMarcador) limpio.dataset.marcadorComentario = comentarioMarcador;
  }
  if (etiqueta === "OL") {
    const tipoLista = nodo.getAttribute("type");
    if (["1", "a", "A", "i", "I"].includes(tipoLista)) limpio.setAttribute("type", tipoLista);
  }
  nodo.childNodes.forEach((hijo) => limpio.appendChild(limpiarNodoRico(hijo, documento)));
  return limpio;
}

export function comentarioMarcadorSeguro(valor) {
  return String(valor || "").replace(/\r\n?/g, "\n").trim().slice(0, 500);
}

function interlineadoSeguro(valor) {
  const candidato = String(valor || "").trim();
  if (!/^(?:1|1\.15|1\.5|2|2\.5|3)$/.test(candidato)) return "";
  return candidato;
}

export function tamanoFuentePtSeguro(valor) {
  const candidato = Number(valor);
  if (!Number.isFinite(candidato) || candidato < 6 || candidato > 96) return "";
  return String(Math.round(candidato * 10) / 10);
}

export function familiaFuenteSegura(valor) {
  const primeraFamilia = String(valor || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
  if (!primeraFamilia || primeraFamilia.length > 40) return "";
  return FAMILIAS_FUENTE_PERMITIDAS.get(primeraFamilia.toLocaleLowerCase("es-MX")) || "";
}

export function colorCSSSeguro(valor) {
  const candidato = String(valor || "").trim();
  if (!candidato || candidato.length > 64) return "";
  const formatoSeguro = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{1,20})$/i;
  return formatoSeguro.test(candidato) ? candidato : "";
}
