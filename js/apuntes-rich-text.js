const ETIQUETAS_PERMITIDAS = new Set(["B", "STRONG", "BR", "DIV", "P", "SPAN", "FONT"]);
const ETIQUETAS_DESCARTADAS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"]);

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
  if (color) limpio.style.color = color;
  if (fondo) limpio.style.backgroundColor = fondo;
  nodo.childNodes.forEach((hijo) => limpio.appendChild(limpiarNodoRico(hijo, documento)));
  return limpio;
}

export function colorCSSSeguro(valor) {
  const candidato = String(valor || "").trim();
  if (!candidato || candidato.length > 64) return "";
  const formatoSeguro = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{1,20})$/i;
  return formatoSeguro.test(candidato) ? candidato : "";
}
