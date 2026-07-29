function alturaInicial(estado) {
  if (typeof estado === "number") return estado;
  return estado && typeof estado === "object" ? estado.altura : null;
}

function estaContraido(estado) {
  return Boolean(estado && typeof estado === "object" && estado.contraida);
}

function persistir(guardarEstado, clave, cambios) {
  guardarEstado?.(clave, cambios);
}

function marcarCambioProgramatico(objetivo, callback) {
  objetivo.dataset.resizeInitializing = "true";
  callback();
  const liberarMarca = () => {
    delete objetivo.dataset.resizeInitializing;
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(liberarMarca));
    return;
  }
  queueMicrotask(liberarMarca);
}

function aplicarAltura({ objetivo, contenedor, clave, altura, minimo, guardarEstado }) {
  const alturaAplicada = Math.max(minimo, Math.round(altura));
  marcarCambioProgramatico(objetivo, () => {
    objetivo.style.height = `${alturaAplicada}px`;
    objetivo.dataset.manualResize = "true";
  });
  contenedor.classList.remove("seccion-contraida");
  persistir(guardarEstado, clave, { altura: objetivo.getBoundingClientRect().height, contraida: false });
}

function reiniciarAltura(item, contexto) {
  const alturaBase = Math.max(contexto.minimo, item.alturaBase || 130);
  marcarCambioProgramatico(contexto.objetivo, () => {
    delete contexto.objetivo.dataset.manualResize;
    contexto.objetivo.style.height = `${alturaBase}px`;
  });
  contexto.contenedor.classList.remove("seccion-contraida");
  persistir(contexto.guardarEstado, contexto.clave, { altura: alturaBase, contraida: false });
}

function alternarContraer({ objetivo, contenedor, clave, minimo, guardarEstado, cargarEstado }) {
  const contraer = !contenedor.classList.contains("seccion-contraida");
  if (contraer) {
    persistir(guardarEstado, clave, {
      altura: Math.max(minimo, Math.round(objetivo.getBoundingClientRect().height)),
      contraida: true
    });
    marcarCambioProgramatico(objetivo, () => {
      objetivo.style.height = `${minimo}px`;
    });
    contenedor.classList.add("seccion-contraida");
    return;
  }
  const estado = cargarEstado?.()[clave];
  aplicarAltura({ objetivo, contenedor, clave, altura: alturaInicial(estado) || 130, minimo, guardarEstado });
}

function crearControles(item, contexto) {
  const controles = document.createElement("div");
  controles.className = "controles-tamano-compartidos controles-tamano-nota";
  controles.innerHTML = `
    <button type="button" data-accion="menos" title="Hacer más pequeño">−</button>
    <button type="button" data-accion="mas" title="Hacer más grande">+</button>
    <button type="button" data-accion="contraer" title="Contraer o expandir">Contraer</button>
    <button type="button" data-accion="reiniciar" title="Restablecer tamaño">Reiniciar</button>
    ${item.accionesExtra || ""}
  `;
  controles.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button");
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === "menos") aplicarAltura({ ...contexto, altura: contexto.objetivo.getBoundingClientRect().height - 48 });
    if (accion === "mas") aplicarAltura({ ...contexto, altura: contexto.objetivo.getBoundingClientRect().height + 48 });
    if (accion === "contraer") alternarContraer(contexto);
    if (accion === "reiniciar") reiniciarAltura(item, contexto);
    contexto.onAction?.(accion, item);
  });
  return controles;
}

function crearSeparador(item, contexto) {
  const separador = document.createElement("div");
  separador.className = "separador-vertical-compartido separador-vertical-nota";
  separador.setAttribute("role", "separator");
  separador.setAttribute("aria-orientation", "horizontal");
  separador.title = "Arrastrar para ajustar altura";
  separador.addEventListener("pointerdown", (evento) => {
    evento.preventDefault();
    const inicioY = evento.clientY;
    const altoInicial = contexto.objetivo.getBoundingClientRect().height;
    const mover = (movimiento) => {
      contexto.objetivo.style.height = `${Math.max(contexto.minimo, altoInicial + movimiento.clientY - inicioY)}px`;
      contexto.objetivo.dataset.manualResize = "true";
      contexto.contenedor.classList.remove("seccion-contraida");
    };
    const terminar = (final) => {
      persistir(contexto.guardarEstado, item.clave, { altura: contexto.objetivo.getBoundingClientRect().height, contraida: false });
      separador.releasePointerCapture?.(final.pointerId);
      separador.removeEventListener("pointermove", mover);
      separador.removeEventListener("pointerup", terminar);
      separador.removeEventListener("pointercancel", terminar);
      document.body.classList.remove("ajustando-seccion-compartida");
    };
    separador.setPointerCapture?.(evento.pointerId);
    document.body.classList.add("ajustando-seccion-compartida");
    separador.addEventListener("pointermove", mover);
    separador.addEventListener("pointerup", terminar);
    separador.addEventListener("pointercancel", terminar);
  });
  return separador;
}

function observarRedimensionamientoNativo(campo, item, guardarEstado) {
  if (!campo || typeof ResizeObserver === "undefined" || campo.dataset.observadorResize === "true") return;
  campo.dataset.observadorResize = "true";
  let alturaAnterior = Math.round(campo.getBoundingClientRect().height);
  const observador = new ResizeObserver(() => {
    const alturaActual = Math.round(campo.getBoundingClientRect().height);
    if (!alturaActual || alturaActual === alturaAnterior) return;
    alturaAnterior = alturaActual;
    if (campo.dataset.resizeInitializing === "true") return;
    campo.dataset.manualResize = "true";
    persistir(guardarEstado, item.clave, { altura: alturaActual, contraida: false });
  });
  observador.observe(campo);
}

function envolverCampo(item, estado, opciones) {
  const campo = item.objetivo;
  if (!campo || (item.panel ? campo.dataset.redimensionCompartido === "true" : campo.closest(".seccion-redimensionable-compartida"))) return;
  if (item.panel) {
    campo.dataset.redimensionCompartido = "true";
    campo.classList.add("panel-nota-redimensionable");
    const contextoPanel = { objetivo: campo, contenedor: campo, clave: item.clave, minimo: item.minimo || 110, guardarEstado: opciones.guardarEstado, cargarEstado: opciones.cargarEstado, onAction: opciones.onAction };
    campo.appendChild(crearControles(item, contextoPanel));
    const alturaPanel = alturaInicial(estado);
    if (alturaPanel) campo.style.height = `${alturaPanel}px`;
    if (estaContraido(estado)) {
      campo.classList.add("seccion-contraida");
      campo.style.height = `${item.minimo || 110}px`;
    }
    campo.appendChild(crearSeparador(item, contextoPanel));
    return;
  }
  const seccion = document.createElement("section");
  seccion.className = "seccion-redimensionable-compartida";
  seccion.dataset.seccionRedimensionable = item.clave;
  const etiqueta = campo.previousElementSibling?.tagName === "LABEL" ? campo.previousElementSibling : null;
  const referencia = etiqueta || campo;
  referencia.parentNode.insertBefore(seccion, referencia);
  if (etiqueta) seccion.appendChild(etiqueta);
  const contexto = { objetivo: campo, contenedor: seccion, clave: item.clave, minimo: item.minimo || 80, guardarEstado: opciones.guardarEstado, cargarEstado: opciones.cargarEstado, onAction: opciones.onAction };
  seccion.appendChild(crearControles(item, contexto));
  seccion.appendChild(campo);
  const altura = alturaInicial(estado);
  if (altura) campo.style.height = `${altura}px`;
  if (estaContraido(estado)) {
    seccion.classList.add("seccion-contraida");
    campo.style.height = `${item.minimo || 80}px`;
  }
  seccion.appendChild(crearSeparador(item, contexto));
  observarRedimensionamientoNativo(campo, item, contexto.guardarEstado);
}

export function configurarCamposRedimensionables({ items = [], cargarEstado = () => ({}), guardarEstado = () => {}, onAction } = {}) {
  const estados = { ...(cargarEstado() || {}) };
  const leerEstado = () => estados;
  const guardarEstadoInterno = (clave, cambios) => {
    if (clave === "__leer__") return;
    estados[clave] = { ...(typeof estados[clave] === "object" ? estados[clave] : {}), ...cambios };
    guardarEstado?.(clave, cambios);
  };
  items.forEach((item) => envolverCampo(item, estados[item.clave], { cargarEstado: leerEstado, guardarEstado: guardarEstadoInterno, onAction }));
}
