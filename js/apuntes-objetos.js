const VERSION_OBJETOS = 1;
const AJUSTES_VALIDOS = new Set(["delante", "detras", "cuadrado"]);
const TIPOS_VALIDOS = new Set(["texto", "flecha"]);

function idObjeto() {
  return globalThis.crypto?.randomUUID?.() || `objeto-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numeroSeguro(valor, predeterminado, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return predeterminado;
  return Math.min(maximo, Math.max(minimo, numero));
}

function textoSeguro(valor, maximo = 600) {
  return String(valor || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, maximo);
}

function colorSeguro(valor, predeterminado = "#f6e8d5") {
  return /^#[0-9a-f]{6}$/i.test(String(valor || "")) ? String(valor).toLowerCase() : predeterminado;
}

export function normalizarObjetoApunte(objeto = {}) {
  const tipo = TIPOS_VALIDOS.has(objeto.tipo) ? objeto.tipo : "texto";
  const ajuste = AJUSTES_VALIDOS.has(objeto.ajuste) ? objeto.ajuste : "delante";
  const anchoPredeterminado = tipo === "flecha" ? 26 : 26;
  const altoPredeterminado = tipo === "flecha" ? 9 : 12;
  return Object.freeze({
    id: textoSeguro(objeto.id, 100) || idObjeto(),
    tipo,
    ajuste,
    x: numeroSeguro(objeto.x, 12, 0, 92),
    y: numeroSeguro(objeto.y, 12, 0, 94),
    ancho: numeroSeguro(objeto.ancho, anchoPredeterminado, tipo === "flecha" ? 12 : 14, 92),
    alto: numeroSeguro(objeto.alto, altoPredeterminado, tipo === "flecha" ? 5 : 8, 70),
    texto: tipo === "texto" ? textoSeguro(objeto.texto || "Escribe aquí") : "",
    color: colorSeguro(objeto.color, tipo === "flecha" ? "#f6c85f" : "#f6e8d5")
  });
}

export function normalizarObjetosApunte(valor) {
  const objetos = Array.isArray(valor) ? valor : valor?.objetos;
  if (!Array.isArray(objetos)) return [];
  const ids = new Set();
  return objetos.map(normalizarObjetoApunte).filter((objeto) => {
    if (ids.has(objeto.id)) return false;
    ids.add(objeto.id);
    return true;
  });
}

export function serializarObjetosApunte(objetos = []) {
  return Object.freeze({
    version: VERSION_OBJETOS,
    objetos: normalizarObjetosApunte(objetos).map((objeto) => ({ ...objeto }))
  });
}

export function textoObjetosApunte(objetos = []) {
  return normalizarObjetosApunte(objetos)
    .filter((objeto) => objeto.tipo === "texto" && objeto.texto.trim())
    .map((objeto) => objeto.texto.trim())
    .join("\n");
}

function etiquetaObjeto(objeto, indice) {
  const tipo = objeto.tipo === "flecha" ? "Flecha" : "Cuadro de texto";
  const detalle = objeto.tipo === "texto" ? `: ${objeto.texto.slice(0, 34)}` : "";
  return `${tipo} ${indice + 1}${detalle}`;
}

function crearElementoObjeto(controlador, objeto, indice) {
  const elemento = document.createElement("article");
  elemento.className = `objeto-apunte objeto-apunte--${objeto.tipo} objeto-apunte--${objeto.ajuste}`;
  elemento.dataset.objetoId = objeto.id;
  elemento.tabIndex = 0;
  elemento.setAttribute("role", "group");
  elemento.setAttribute("aria-label", etiquetaObjeto(objeto, indice));
  elemento.style.setProperty("--objeto-x", `${objeto.x}%`);
  elemento.style.setProperty("--objeto-y", `${objeto.y}%`);
  elemento.style.setProperty("--objeto-ancho", `${objeto.ancho}%`);
  elemento.style.setProperty("--objeto-alto", `${objeto.alto}%`);
  elemento.style.setProperty("--objeto-color", objeto.color);
  if (controlador.idSeleccionado === objeto.id) elemento.dataset.seleccionado = "true";

  const mango = document.createElement("button");
  mango.type = "button";
  mango.className = "objeto-apunte__mango";
  mango.dataset.accionObjeto = "mover";
  mango.setAttribute("aria-label", `Mover ${etiquetaObjeto(objeto, indice)}`);
  mango.title = "Arrastrar para mover";
  mango.textContent = "⠿";
  elemento.append(mango);

  if (objeto.tipo === "texto") {
    const contenido = document.createElement("div");
    contenido.className = "objeto-apunte__texto";
    contenido.contentEditable = "true";
    contenido.spellcheck = true;
    contenido.dataset.accionObjeto = "editar";
    contenido.textContent = objeto.texto;
    contenido.setAttribute("aria-label", `Texto de ${etiquetaObjeto(objeto, indice)}`);
    contenido.addEventListener("input", () => controlador.actualizar(objeto.id, { texto: contenido.innerText }, { renderizar: false }));
    contenido.addEventListener("focus", () => controlador.seleccionar(objeto.id));
    elemento.append(contenido);
  } else {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const idPunta = `punta-flecha-${objeto.id.replace(/[^a-z0-9_-]/gi, "") || indice}`;
    svg.setAttribute("viewBox", "0 0 100 40");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `<defs><marker id="${idPunta}" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L9,4 L0,8 Z"></path></marker></defs><path d="M5 20 H91" marker-end="url(#${idPunta})"></path>`;
    elemento.append(svg);
  }

  const redimensionar = document.createElement("button");
  redimensionar.type = "button";
  redimensionar.className = "objeto-apunte__redimensionar";
  redimensionar.dataset.accionObjeto = "redimensionar";
  redimensionar.setAttribute("aria-label", `Cambiar tamaño de ${etiquetaObjeto(objeto, indice)}`);
  redimensionar.title = "Arrastrar para cambiar tamaño";
  elemento.append(redimensionar);

  elemento.addEventListener("pointerdown", (evento) => {
    if (evento.target.closest("[data-accion-objeto='editar']")) return;
    controlador.seleccionar(objeto.id);
    const accion = evento.target.closest("[data-accion-objeto]")?.dataset.accionObjeto;
    if (accion === "mover" || accion === "redimensionar" || objeto.tipo === "flecha") {
      controlador.iniciarArrastre(evento, objeto.id, accion === "redimensionar" ? "redimensionar" : "mover");
    }
  });
  elemento.addEventListener("focus", () => controlador.seleccionar(objeto.id));
  elemento.addEventListener("keydown", (evento) => controlador.gestionarTecladoObjeto(evento, objeto.id));
  return elemento;
}

export function inicializarObjetosApunte({ lienzo, capaDelante, capaDetras, alCambiar = () => {}, alSeleccionar = () => {} } = {}) {
  if (!lienzo || !capaDelante || !capaDetras) return null;
  const controlador = {
    objetos: [],
    idSeleccionado: "",
    arrastre: null,
    alCambiar,
    alSeleccionar,
    obtenerSeleccionado() {
      return this.objetos.find((objeto) => objeto.id === this.idSeleccionado) || null;
    },
    notificar() {
      this.alCambiar(serializarObjetosApunte(this.objetos), this.obtenerSeleccionado());
    },
    renderizar({ notificar = false } = {}) {
      capaDelante.replaceChildren();
      capaDetras.replaceChildren();
      this.objetos.forEach((objeto, indice) => {
        const elemento = crearElementoObjeto(this, objeto, indice);
        const vaDetras = objeto.ajuste === "detras" && this.idSeleccionado !== objeto.id;
        (vaDetras ? capaDetras : capaDelante).append(elemento);
      });
      if (notificar) this.notificar();
    },
    cargar(valor) {
      this.objetos = normalizarObjetosApunte(valor);
      this.idSeleccionado = "";
      this.renderizar();
    },
    serializar() {
      return serializarObjetosApunte(this.objetos);
    },
    agregar(tipo) {
      const desplazamiento = Math.min(this.objetos.length * 3, 36);
      const objeto = normalizarObjetoApunte({
        tipo,
        x: 10 + desplazamiento,
        y: 12 + desplazamiento,
        ancho: tipo === "flecha" ? 30 : 28,
        alto: tipo === "flecha" ? 8 : 13,
        texto: tipo === "texto" ? "Escribe aquí" : "",
        color: tipo === "flecha" ? "#f6c85f" : "#f6e8d5"
      });
      this.objetos = [...this.objetos, objeto];
      this.idSeleccionado = objeto.id;
      this.renderizar({ notificar: true });
      return objeto;
    },
    seleccionar(id) {
      if (!this.objetos.some((objeto) => objeto.id === id) || this.idSeleccionado === id) return;
      this.idSeleccionado = id;
      this.renderizar();
      this.alSeleccionar(this.obtenerSeleccionado());
    },
    actualizar(id, cambios = {}, { renderizar = true } = {}) {
      const indice = this.objetos.findIndex((objeto) => objeto.id === id);
      if (indice < 0) return;
      const anterior = this.objetos[indice];
      const actualizado = normalizarObjetoApunte({ ...anterior, ...cambios, id });
      this.objetos = this.objetos.map((objeto, posicion) => posicion === indice ? actualizado : objeto);
      if (renderizar) this.renderizar();
      this.notificar();
    },
    eliminarSeleccionado() {
      if (!this.idSeleccionado) return false;
      this.objetos = this.objetos.filter((objeto) => objeto.id !== this.idSeleccionado);
      this.idSeleccionado = "";
      this.renderizar({ notificar: true });
      return true;
    },
    iniciarArrastre(evento, id, modo) {
      if (evento.button !== 0) return;
      const objeto = this.objetos.find((item) => item.id === id);
      if (!objeto) return;
      evento.preventDefault();
      const rect = lienzo.getBoundingClientRect();
      this.arrastre = { id, modo, inicioX: evento.clientX, inicioY: evento.clientY, rect, objeto };
      documentoActivo().addEventListener("pointermove", mover);
      documentoActivo().addEventListener("pointerup", terminar, { once: true });
    },
    gestionarTecladoObjeto(evento, id) {
      if (evento.target.closest("[contenteditable='true']")) return;
      if (evento.key === "Delete" || evento.key === "Backspace") {
        evento.preventDefault();
        this.seleccionar(id);
        this.eliminarSeleccionado();
        return;
      }
      const paso = evento.shiftKey ? 3 : 1;
      const movimientos = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
      if (!movimientos[evento.key]) return;
      evento.preventDefault();
      const objeto = this.objetos.find((item) => item.id === id);
      this.actualizar(id, { x: objeto.x + movimientos[evento.key][0], y: objeto.y + movimientos[evento.key][1] });
    },
    destruir() {
      documentoActivo().removeEventListener("pointermove", mover);
      documentoActivo().removeEventListener("pointerup", terminar);
      capaDelante.replaceChildren();
      capaDetras.replaceChildren();
    }
  };

  const documentoActivo = () => lienzo.ownerDocument || document;
  const mover = (evento) => {
    const estado = controlador.arrastre;
    if (!estado) return;
    const dx = ((evento.clientX - estado.inicioX) / Math.max(1, estado.rect.width)) * 100;
    const dy = ((evento.clientY - estado.inicioY) / Math.max(1, estado.rect.height)) * 100;
    if (estado.modo === "redimensionar") {
      controlador.actualizar(estado.id, { ancho: estado.objeto.ancho + dx, alto: estado.objeto.alto + dy });
    } else {
      controlador.actualizar(estado.id, { x: estado.objeto.x + dx, y: estado.objeto.y + dy });
    }
  };
  const terminar = () => {
    controlador.arrastre = null;
    documentoActivo().removeEventListener("pointermove", mover);
  };
  controlador.renderizar();
  return controlador;
}
