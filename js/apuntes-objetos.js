const VERSION_OBJETOS = 1;
const AJUSTES_VALIDOS = new Set(["delante", "detras", "cuadrado"]);
const TIPOS_VALIDOS = new Set(["texto", "flecha"]);
const DIRECCIONES_REDIMENSION = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const LADOS_ANCLA = new Set(["izquierda", "derecha", "arriba", "abajo"]);
const DISTANCIA_IMAN_PORCENTAJE = 2.5;
const FONDOS_TEXTO_VALIDOS = new Set(["color", "sin-fondo"]);
const CONTORNOS_TEXTO_VALIDOS = new Set(["linea", "punteado", "sin-contorno"]);

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

function anclaSegura(valor) {
  if (!valor || typeof valor !== "object") return null;
  const objetoId = textoSeguro(valor.objetoId, 100);
  if (!objetoId || !LADOS_ANCLA.has(valor.lado)) return null;
  return Object.freeze({
    objetoId,
    lado: valor.lado,
    proporcion: numeroSeguro(valor.proporcion, 0.5, 0, 1)
  });
}

function puntoAncla(objeto, ancla) {
  if (!objeto || objeto.tipo !== "texto" || !ancla) return null;
  if (ancla.lado === "izquierda") return { x: objeto.x, y: objeto.y + (objeto.alto * ancla.proporcion) };
  if (ancla.lado === "derecha") return { x: objeto.x + objeto.ancho, y: objeto.y + (objeto.alto * ancla.proporcion) };
  if (ancla.lado === "arriba") return { x: objeto.x + (objeto.ancho * ancla.proporcion), y: objeto.y };
  return { x: objeto.x + (objeto.ancho * ancla.proporcion), y: objeto.y + objeto.alto };
}

function anclaMasCercana(punto, objetos, excluirId = "") {
  let mejor = null;
  objetos.filter((objeto) => objeto.tipo === "texto" && objeto.id !== excluirId).forEach((objeto) => {
    const candidatos = [
      { lado: "izquierda", x: objeto.x, y: Math.min(Math.max(punto.y, objeto.y), objeto.y + objeto.alto) },
      { lado: "derecha", x: objeto.x + objeto.ancho, y: Math.min(Math.max(punto.y, objeto.y), objeto.y + objeto.alto) },
      { lado: "arriba", x: Math.min(Math.max(punto.x, objeto.x), objeto.x + objeto.ancho), y: objeto.y },
      { lado: "abajo", x: Math.min(Math.max(punto.x, objeto.x), objeto.x + objeto.ancho), y: objeto.y + objeto.alto }
    ];
    candidatos.forEach((candidato) => {
      const distancia = Math.hypot(punto.x - candidato.x, punto.y - candidato.y);
      if (distancia > DISTANCIA_IMAN_PORCENTAJE || (mejor && distancia >= mejor.distancia)) return;
      const proporcion = ["izquierda", "derecha"].includes(candidato.lado)
        ? (candidato.y - objeto.y) / Math.max(0.001, objeto.alto)
        : (candidato.x - objeto.x) / Math.max(0.001, objeto.ancho);
      mejor = {
        distancia,
        punto: { x: candidato.x, y: candidato.y },
        ancla: { objetoId: objeto.id, lado: candidato.lado, proporcion }
      };
    });
  });
  return mejor;
}

export function normalizarObjetoApunte(objeto = {}) {
  const tipo = TIPOS_VALIDOS.has(objeto.tipo) ? objeto.tipo : "texto";
  const ajuste = AJUSTES_VALIDOS.has(objeto.ajuste) ? objeto.ajuste : "delante";
  const anchoPredeterminado = tipo === "flecha" ? 26 : 26;
  const altoPredeterminado = tipo === "flecha" ? 9 : 12;
  const base = {
    id: textoSeguro(objeto.id, 100) || idObjeto(),
    tipo,
    ajuste,
    x: numeroSeguro(objeto.x, 12, 0, 92),
    y: numeroSeguro(objeto.y, 12, 0, 94),
    ancho: numeroSeguro(objeto.ancho, anchoPredeterminado, tipo === "flecha" ? 12 : 14, 92),
    alto: numeroSeguro(objeto.alto, altoPredeterminado, tipo === "flecha" ? 5 : 8, 70),
    texto: tipo === "texto" ? textoSeguro(objeto.texto || "Escribe aquí") : "",
    color: colorSeguro(objeto.color, tipo === "flecha" ? "#f6c85f" : "#f6e8d5"),
    fondo: tipo === "texto" && FONDOS_TEXTO_VALIDOS.has(objeto.fondo) ? objeto.fondo : "color",
    colorFondo: colorSeguro(objeto.colorFondo, "#101814"),
    contorno: tipo === "texto" && CONTORNOS_TEXTO_VALIDOS.has(objeto.contorno) ? objeto.contorno : "linea",
    grosorContorno: numeroSeguro(objeto.grosorContorno, 1, 0, 8)
  };
  if (tipo !== "flecha") return Object.freeze(base);
  return Object.freeze({
    ...base,
    inicioX: numeroSeguro(objeto.inicioX, base.x, 0, 100),
    inicioY: numeroSeguro(objeto.inicioY, base.y + (base.alto / 2), 0, 100),
    finX: numeroSeguro(objeto.finX, base.x + base.ancho, 0, 100),
    finY: numeroSeguro(objeto.finY, base.y + (base.alto / 2), 0, 100),
    anclaInicio: anclaSegura(objeto.anclaInicio),
    anclaFin: anclaSegura(objeto.anclaFin)
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

function crearBotonMover(objeto, indice) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "objeto-apunte__mover";
  boton.dataset.accionObjeto = "mover";
  boton.setAttribute("aria-label", `Mover ${etiquetaObjeto(objeto, indice)}`);
  boton.title = "Arrastrar para mover";
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"></path></svg>';
  return boton;
}

function crearTiradoresRedimension(objeto, indice) {
  const fragmento = document.createDocumentFragment();
  DIRECCIONES_REDIMENSION.forEach((direccion) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `objeto-apunte__redimensionar objeto-apunte__redimensionar--${direccion}`;
    boton.dataset.accionObjeto = "redimensionar";
    boton.dataset.direccion = direccion;
    boton.setAttribute("aria-label", `Cambiar tamaño de ${etiquetaObjeto(objeto, indice)} desde ${direccion}`);
    boton.title = "Arrastrar para cambiar tamaño";
    fragmento.append(boton);
  });
  return fragmento;
}

function crearControlFlecha(objeto, indice, tipo) {
  const esInicio = tipo === "inicio";
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = `objeto-apunte__control-flecha objeto-apunte__control-flecha--${tipo}`;
  boton.dataset.accionObjeto = esInicio || tipo === "fin" ? "extremo-flecha" : "mover-flecha";
  if (esInicio || tipo === "fin") {
    boton.dataset.extremo = tipo;
    boton.style.setProperty("--flecha-x", `${esInicio ? objeto.inicioX : objeto.finX}%`);
    boton.style.setProperty("--flecha-y", `${esInicio ? objeto.inicioY : objeto.finY}%`);
    boton.setAttribute("aria-label", `Mover extremo ${esInicio ? "inicial" : "final"} de ${etiquetaObjeto(objeto, indice)}`);
    boton.title = "Arrastra hacia un cuadro para conectarlo";
  } else {
    boton.style.setProperty("--flecha-x", `${(objeto.inicioX + objeto.finX) / 2}%`);
    boton.style.setProperty("--flecha-y", `${(objeto.inicioY + objeto.finY) / 2}%`);
    boton.setAttribute("aria-label", `Mover ${etiquetaObjeto(objeto, indice)}`);
    boton.title = "Arrastra para mover; usa los extremos para girar o conectar";
  }
  return boton;
}

function limitesObjeto(objeto) {
  return {
    anchoMinimo: objeto.tipo === "flecha" ? 12 : 14,
    altoMinimo: objeto.tipo === "flecha" ? 5 : 8,
    anchoMaximo: 92,
    altoMaximo: 70
  };
}

function redimensionarObjeto(objeto, direccion, deltaX, deltaY) {
  const limites = limitesObjeto(objeto);
  let izquierda = objeto.x;
  let arriba = objeto.y;
  let derecha = objeto.x + objeto.ancho;
  let abajo = objeto.y + objeto.alto;

  if (direccion.includes("e")) derecha = Math.min(100, Math.max(izquierda + limites.anchoMinimo, Math.min(izquierda + limites.anchoMaximo, derecha + deltaX)));
  if (direccion.includes("w")) izquierda = Math.max(0, Math.min(derecha - limites.anchoMinimo, Math.max(derecha - limites.anchoMaximo, izquierda + deltaX)));
  if (direccion.includes("s")) abajo = Math.min(100, Math.max(arriba + limites.altoMinimo, Math.min(arriba + limites.altoMaximo, abajo + deltaY)));
  if (direccion.includes("n")) arriba = Math.max(0, Math.min(abajo - limites.altoMinimo, Math.max(abajo - limites.altoMaximo, arriba + deltaY)));

  return { x: izquierda, y: arriba, ancho: derecha - izquierda, alto: abajo - arriba };
}

function trazoFlecha(objeto) {
  const inicioX = Number(objeto.inicioX);
  const inicioY = Number(objeto.inicioY);
  const finX = Number(objeto.finX);
  const finY = Number(objeto.finY);
  const deltaX = finX - inicioX;
  const deltaY = finY - inicioY;
  const longitud = Math.hypot(deltaX, deltaY);
  if (longitud < 0.01) return `M${inicioX} ${inicioY} L${finX} ${finY}`;

  // La punta se dibuja con dos segmentos cortos en el mismo path: es una flecha
  // discreta, proporcional a la línea y no depende del escalado de <marker>.
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
  return `M${inicioX} ${inicioY} L${finX} ${finY} M${izquierdaX} ${izquierdaY} L${finX} ${finY} L${derechaX} ${derechaY}`;
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
  if (objeto.tipo === "texto") {
    elemento.style.setProperty("--objeto-fondo", objeto.fondo === "sin-fondo" ? "transparent" : objeto.colorFondo);
    elemento.style.setProperty("--objeto-contorno", objeto.contorno === "sin-contorno" ? "transparent" : objeto.color);
    elemento.style.setProperty("--objeto-contorno-estilo", objeto.contorno === "punteado" ? "dotted" : "solid");
    elemento.style.setProperty("--objeto-contorno-grosor", `${objeto.grosorContorno}px`);
  }
  if (controlador.idSeleccionado === objeto.id) elemento.dataset.seleccionado = "true";

  if (objeto.tipo === "texto") {
    const contenido = document.createElement("div");
    contenido.className = "objeto-apunte__texto";
    contenido.contentEditable = "true";
    contenido.spellcheck = true;
    contenido.dataset.accionObjeto = "editar";
    contenido.textContent = objeto.texto;
    contenido.setAttribute("aria-label", `Texto de ${etiquetaObjeto(objeto, indice)}`);
    contenido.addEventListener("input", () => controlador.actualizar(objeto.id, { texto: contenido.innerText }, { renderizar: false }));
    contenido.addEventListener("focus", () => {
      if (controlador.idSeleccionado === objeto.id) return;
      controlador.seleccionar(objeto.id);
      requestAnimationFrame(() => {
        [...lienzo.querySelectorAll("[data-objeto-id]")]
          .find((item) => item.dataset.objetoId === objeto.id)
          ?.querySelector(".objeto-apunte__texto")?.focus({ preventScroll: true });
      });
    });
    elemento.append(contenido);
  } else {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `<path d="${trazoFlecha(objeto)}"></path>`;
    elemento.append(svg);
  }

  if (controlador.idSeleccionado === objeto.id) {
    if (objeto.tipo === "flecha") {
      elemento.append(
        crearControlFlecha(objeto, indice, "inicio"),
        crearControlFlecha(objeto, indice, "mover"),
        crearControlFlecha(objeto, indice, "fin")
      );
    } else {
      elemento.append(crearBotonMover(objeto, indice), crearTiradoresRedimension(objeto, indice));
    }
  }

  if (objeto.tipo === "texto" && controlador.arrastre?.modo === "extremo-flecha") {
    ["izquierda", "derecha", "arriba", "abajo"].forEach((lado) => {
      const punto = document.createElement("span");
      punto.className = `objeto-apunte__punto-ancla objeto-apunte__punto-ancla--${lado}`;
      punto.setAttribute("aria-hidden", "true");
      elemento.append(punto);
    });
  }

  elemento.querySelectorAll("[data-accion-objeto]").forEach((control) => {
    if (control.dataset.accionObjeto === "editar") return;
    control.addEventListener("pointerdown", (evento) => {
      if (evento.button !== 0) return;
      evento.preventDefault();
      evento.stopPropagation();
      const accion = control.dataset.accionObjeto;
      const modo = accion === "redimensionar"
        ? "redimensionar"
        : accion === "extremo-flecha"
          ? "extremo-flecha"
          : accion === "mover-flecha" ? "mover-flecha" : "mover";
      controlador.iniciarArrastre(evento, objeto.id, modo, control.dataset.direccion, control.dataset.extremo);
    });
  });

  elemento.addEventListener("pointerdown", (evento) => {
    if (evento.target.closest("[data-accion-objeto='editar']")) return;
    if (evento.target.closest("[data-accion-objeto]")) return;
    controlador.seleccionar(objeto.id);
    [...lienzo.querySelectorAll("[data-objeto-id]")].find((item) => item.dataset.objetoId === objeto.id)?.focus({ preventScroll: true });
    if (objeto.tipo === "flecha") controlador.iniciarArrastre(evento, objeto.id, "mover-flecha");
  });
  elemento.addEventListener("contextmenu", (evento) => {
    evento.preventDefault();
    controlador.seleccionar(objeto.id);
    controlador.abrirMenuContextual(evento, objeto.id);
  });
  elemento.addEventListener("focus", () => controlador.seleccionar(objeto.id));
  elemento.addEventListener("keydown", (evento) => controlador.gestionarTecladoObjeto(evento, objeto.id));
  return elemento;
}

export function inicializarObjetosApunte({ lienzo, capaDelante, capaDetras, menuContextual, alCambiar = () => {}, alSeleccionar = () => {} } = {}) {
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
      this.cerrarMenuContextual();
      this.renderizar();
    },
    serializar() {
      return serializarObjetosApunte(this.objetos);
    },
    cerrarMenuContextual() {
      if (!menuContextual) return;
      menuContextual.hidden = true;
      menuContextual.dataset.objetoId = "";
    },
    abrirMenuContextual(evento, id) {
      if (!menuContextual || !this.objetos.some((objeto) => objeto.id === id)) return;
      const rect = lienzo.getBoundingClientRect();
      const ancho = menuContextual.offsetWidth || 130;
      const alto = menuContextual.offsetHeight || 36;
      const izquierda = Math.min(Math.max(8, evento.clientX - rect.left), Math.max(8, rect.width - ancho - 8));
      const arriba = Math.min(Math.max(8, evento.clientY - rect.top), Math.max(8, rect.height - alto - 8));
      menuContextual.style.left = `${Math.round(izquierda)}px`;
      menuContextual.style.top = `${Math.round(arriba)}px`;
      menuContextual.dataset.objetoId = id;
      menuContextual.hidden = false;
      menuContextual.querySelector("button")?.focus({ preventScroll: true });
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
      this.cerrarMenuContextual();
      this.renderizar();
      this.alSeleccionar(this.obtenerSeleccionado());
    },
    actualizar(id, cambios = {}, { renderizar = true } = {}) {
      const indice = this.objetos.findIndex((objeto) => objeto.id === id);
      if (indice < 0) return;
      const anterior = this.objetos[indice];
      const actualizado = normalizarObjetoApunte({ ...anterior, ...cambios, id });
      this.objetos = this.objetos.map((objeto, posicion) => posicion === indice ? actualizado : objeto);
      if (actualizado.tipo === "texto" && ["x", "y", "ancho", "alto"].some((campo) => campo in cambios)) {
        this.sincronizarFlechasAncladas(actualizado.id);
      }
      if (renderizar) this.renderizar();
      this.notificar();
    },
    sincronizarFlechasAncladas(idCuadro) {
      const cuadro = this.objetos.find((objeto) => objeto.id === idCuadro && objeto.tipo === "texto");
      if (!cuadro) return;
      this.objetos = this.objetos.map((objeto) => {
        if (objeto.tipo !== "flecha") return objeto;
        const inicio = objeto.anclaInicio?.objetoId === cuadro.id ? puntoAncla(cuadro, objeto.anclaInicio) : null;
        const fin = objeto.anclaFin?.objetoId === cuadro.id ? puntoAncla(cuadro, objeto.anclaFin) : null;
        if (!inicio && !fin) return objeto;
        return normalizarObjetoApunte({
          ...objeto,
          ...(inicio ? { inicioX: inicio.x, inicioY: inicio.y } : {}),
          ...(fin ? { finX: fin.x, finY: fin.y } : {})
        });
      });
    },
    eliminarSeleccionado() {
      if (!this.idSeleccionado) return false;
      const idEliminado = this.idSeleccionado;
      this.objetos = this.objetos
        .filter((objeto) => objeto.id !== idEliminado)
        .map((objeto) => objeto.tipo !== "flecha" ? objeto : normalizarObjetoApunte({
          ...objeto,
          ...(objeto.anclaInicio?.objetoId === idEliminado ? { anclaInicio: null } : {}),
          ...(objeto.anclaFin?.objetoId === idEliminado ? { anclaFin: null } : {})
        }));
      this.idSeleccionado = "";
      this.cerrarMenuContextual();
      this.renderizar({ notificar: true });
      return true;
    },
    iniciarArrastre(evento, id, modo, direccion = "se", extremo = "") {
      if (evento.button !== 0) return;
      const objeto = this.objetos.find((item) => item.id === id);
      if (!objeto) return;
      evento.preventDefault();
      const rect = lienzo.getBoundingClientRect();
      const capturador = evento.currentTarget instanceof Element ? evento.currentTarget : null;
      try {
        capturador?.setPointerCapture?.(evento.pointerId);
      } catch {
        // Algunos navegadores no permiten capturar un puntero ya liberado; el
        // listener de documento mantiene el arrastre como respaldo.
      }
      this.arrastre = {
        id,
        modo,
        direccion,
        extremo,
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        rect,
        objeto,
        capturador,
        pointerId: evento.pointerId
      };
      this.renderizar();
      documentoActivo().addEventListener("pointermove", mover);
      documentoActivo().addEventListener("pointerup", terminar);
      documentoActivo().addEventListener("pointercancel", terminar);
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
      if (objeto.tipo === "flecha") {
        const [dx, dy] = movimientos[evento.key];
        const limitar = (valor) => Math.min(100, Math.max(0, valor));
        this.actualizar(id, {
          inicioX: limitar(objeto.inicioX + dx),
          inicioY: limitar(objeto.inicioY + dy),
          finX: limitar(objeto.finX + dx),
          finY: limitar(objeto.finY + dy),
          anclaInicio: null,
          anclaFin: null
        });
        return;
      }
      this.actualizar(id, { x: objeto.x + movimientos[evento.key][0], y: objeto.y + movimientos[evento.key][1] });
    },
    destruir() {
      documentoActivo().removeEventListener("pointermove", mover);
      documentoActivo().removeEventListener("pointerup", terminar);
      documentoActivo().removeEventListener("pointercancel", terminar);
      documentoActivo().removeEventListener("pointerdown", cerrarMenuAlPulsarFuera);
      menuContextual?.removeEventListener("click", gestionarMenuContextual);
      capaDelante.replaceChildren();
      capaDetras.replaceChildren();
      this.cerrarMenuContextual();
    }
  };

  const documentoActivo = () => lienzo.ownerDocument || document;
  const cerrarMenuAlPulsarFuera = (evento) => {
    if (!menuContextual || menuContextual.hidden) return;
    if (evento.target instanceof Element && evento.target.closest("#menuContextualObjeto")) return;
    controlador.cerrarMenuContextual();
  };
  const gestionarMenuContextual = (evento) => {
    const boton = evento.target instanceof Element ? evento.target.closest("[data-accion-menu-objeto]") : null;
    if (boton?.dataset.accionMenuObjeto !== "eliminar") return;
    evento.preventDefault();
    controlador.eliminarSeleccionado();
  };
  const mover = (evento) => {
    const estado = controlador.arrastre;
    if (!estado) return;
    const dx = ((evento.clientX - estado.inicioX) / Math.max(1, estado.rect.width)) * 100;
    const dy = ((evento.clientY - estado.inicioY) / Math.max(1, estado.rect.height)) * 100;
    if (estado.modo === "extremo-flecha") {
      const puntoLibre = {
        x: Math.min(100, Math.max(0, (evento.clientX - estado.rect.left) / Math.max(1, estado.rect.width) * 100)),
        y: Math.min(100, Math.max(0, (evento.clientY - estado.rect.top) / Math.max(1, estado.rect.height) * 100))
      };
      const conexion = anclaMasCercana(puntoLibre, controlador.objetos, estado.id);
      const punto = conexion?.punto || puntoLibre;
      controlador.actualizar(estado.id, estado.extremo === "inicio"
        ? { inicioX: punto.x, inicioY: punto.y, anclaInicio: conexion?.ancla || null }
        : { finX: punto.x, finY: punto.y, anclaFin: conexion?.ancla || null });
    } else if (estado.modo === "mover-flecha") {
      const limitar = (valor) => Math.min(100, Math.max(0, valor));
      controlador.actualizar(estado.id, {
        inicioX: limitar(estado.objeto.inicioX + dx),
        inicioY: limitar(estado.objeto.inicioY + dy),
        finX: limitar(estado.objeto.finX + dx),
        finY: limitar(estado.objeto.finY + dy),
        anclaInicio: null,
        anclaFin: null
      });
    } else if (estado.modo === "redimensionar") {
      controlador.actualizar(estado.id, redimensionarObjeto(estado.objeto, estado.direccion, dx, dy));
    } else {
      controlador.actualizar(estado.id, {
        x: Math.min(Math.max(0, estado.objeto.x + dx), 100 - estado.objeto.ancho),
        y: Math.min(Math.max(0, estado.objeto.y + dy), 100 - estado.objeto.alto)
      });
    }
  };
  const terminar = () => {
    const estado = controlador.arrastre;
    try {
      if (estado?.capturador?.hasPointerCapture?.(estado.pointerId)) estado.capturador.releasePointerCapture(estado.pointerId);
    } catch {
      // El elemento puede haberse reemplazado durante el renderizado del arrastre.
    }
    controlador.arrastre = null;
    controlador.renderizar();
    documentoActivo().removeEventListener("pointermove", mover);
    documentoActivo().removeEventListener("pointerup", terminar);
    documentoActivo().removeEventListener("pointercancel", terminar);
  };
  documentoActivo().addEventListener("pointerdown", cerrarMenuAlPulsarFuera);
  menuContextual?.addEventListener("click", gestionarMenuContextual);
  controlador.renderizar();
  return controlador;
}
