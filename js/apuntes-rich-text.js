const ETIQUETAS_PERMITIDAS = new Set(["B", "STRONG", "BR", "DIV", "P", "SPAN", "FONT", "UL", "OL", "LI"]);
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
  const interlineado = interlineadoSeguro(nodo.style?.lineHeight);
  if (color) limpio.style.color = color;
  if (fondo) limpio.style.backgroundColor = fondo;
  if (interlineado) limpio.style.lineHeight = interlineado;
  if (etiqueta === "SPAN" && /^marcador-[a-z0-9-]{8,80}$/i.test(nodo.dataset?.marcadorId || "")) {
    limpio.className = "marcador-apunte";
    limpio.dataset.marcadorId = nodo.dataset.marcadorId;
    const colorMarcador = colorCSSSeguro(nodo.dataset.marcadorColor);
    if (colorMarcador) limpio.dataset.marcadorColor = colorMarcador;
    limpio.setAttribute("tabindex", "0");
    limpio.setAttribute("role", "button");
  }
  if (etiqueta === "OL") {
    const tipoLista = nodo.getAttribute("type");
    if (["1", "a", "A"].includes(tipoLista)) limpio.setAttribute("type", tipoLista);
  }
  nodo.childNodes.forEach((hijo) => limpio.appendChild(limpiarNodoRico(hijo, documento)));
  return limpio;
}

function interlineadoSeguro(valor) {
  const candidato = String(valor || "").trim();
  if (!/^(?:1|1\.15|1\.5|2|2\.5|3)$/.test(candidato)) return "";
  return candidato;
}

export function colorCSSSeguro(valor) {
  const candidato = String(valor || "").trim();
  if (!candidato || candidato.length > 64) return "";
  const formatoSeguro = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{1,20})$/i;
  return formatoSeguro.test(candidato) ? candidato : "";
}
