import {
  BENZODIACEPINAS,
  FUENTES_BENZODIACEPINAS,
  calcularDiazepamEquivalente,
  calcularDosisTotalDiaria,
  compararVidaMedia,
  convertirBenzodiacepina,
  formatearDosis,
  normalizarNumero,
  obtenerBenzodiacepinaPorId,
  validarDatosConversion,
  validarDatosFarmacologicos
} from "./data/benzodiacepinas.js";

const estado = {
  historial: [],
  ultimoResultado: null
};

const $ = (id) => document.getElementById(id);

const elementos = {
  origen: $("origenBenzo"),
  destino: $("destinoBenzo"),
  dosis: $("dosisActual"),
  frecuencia: $("frecuenciaActual"),
  tomas: $("tomasPersonalizadas"),
  grupoTomas: $("grupoTomas"),
  frecuenciaDestino: $("frecuenciaDestino"),
  tomasDestino: $("tomasDestino"),
  grupoTomasDestino: $("grupoTomasDestino"),
  dosisDiariaVisible: $("dosisDiariaVisible"),
  infoOrigen: $("infoOrigen"),
  infoDestino: $("infoDestino"),
  resultado: $("resultadoConversion"),
  mensajes: $("mensajesValidacion"),
  comparador: $("comparadorVidaMedia"),
  historial: $("historialConversiones"),
  limpiarHistorial: $("limpiarHistorial"),
  buscarTabla: $("buscarTabla"),
  filtroAccion: $("filtroAccion"),
  ordenTabla: $("ordenTabla"),
  colFuentes: $("colFuentes"),
  tablaBody: document.querySelector("#tablaBenzodiacepinas tbody")
};

function inicializarCalculadora() {
  const erroresDatos = validarDatosFarmacologicos();
  poblarSelectores();
  elementos.origen.value = "lorazepam";
  elementos.destino.value = "diazepam";
  elementos.dosis.value = "1";
  vincularEventos();
  renderizarTabla();
  recalcular();
  if (erroresDatos.length) {
    renderizarMensajes({ errores: ["Hay inconsistencias en el catalogo farmacologico."], advertencias: erroresDatos });
  }
}

function poblarSelectores() {
  const opciones = BENZODIACEPINAS
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((medicamento) => `<option value="${medicamento.id}">${medicamento.nombre}</option>`)
    .join("");
  elementos.origen.innerHTML = `<option value="">Seleccionar</option>${opciones}`;
  elementos.destino.innerHTML = `<option value="">Seleccionar</option>${opciones}`;
}

function vincularEventos() {
  [elementos.origen, elementos.destino, elementos.dosis, elementos.frecuencia, elementos.tomas, elementos.frecuenciaDestino, elementos.tomasDestino].forEach((elemento) => {
    elemento.addEventListener("input", recalcular);
    elemento.addEventListener("change", recalcular);
  });
  [elementos.buscarTabla, elementos.filtroAccion, elementos.ordenTabla, elementos.colFuentes].forEach((elemento) => {
    elemento.addEventListener("input", renderizarTabla);
    elemento.addEventListener("change", renderizarTabla);
  });
  elementos.limpiarHistorial.addEventListener("click", () => {
    estado.historial = [];
    renderizarHistorial();
  });
}

function obtenerDatosFormulario() {
  const dosis = normalizarNumero(elementos.dosis.value);
  const dosisDiaria = calcularDosisTotalDiaria(dosis, elementos.frecuencia.value, elementos.tomas.value);
  return {
    origenId: elementos.origen.value,
    destinoId: elementos.destino.value,
    dosis,
    dosisDiaria,
    frecuencia: elementos.frecuencia.value,
    tomas: normalizarNumero(elementos.tomas.value)
  };
}

function recalcular() {
  elementos.grupoTomas.classList.toggle("oculto", elementos.frecuencia.value !== "personalizada");
  elementos.grupoTomasDestino.classList.toggle("oculto", elementos.frecuenciaDestino.value !== "personalizada");
  const datos = obtenerDatosFormulario();
  elementos.dosisDiariaVisible.textContent = Number.isFinite(datos.dosisDiaria) ? `${formatearDosis(datos.dosisDiaria)} mg/dia` : "-- mg/dia";
  renderizarInfoMedicamento(elementos.infoOrigen, obtenerBenzodiacepinaPorId(datos.origenId));
  renderizarInfoMedicamento(elementos.infoDestino, obtenerBenzodiacepinaPorId(datos.destinoId));
  const validacion = validarDatosConversion(datos);
  renderizarMensajes(validacion);
  if (!validacion.valido) {
    estado.ultimoResultado = null;
    elementos.resultado.innerHTML = "<span>Resultado aproximado</span><strong>Completa los datos para calcular.</strong>";
    elementos.comparador.innerHTML = "";
    return;
  }
  const resultado = convertirBenzodiacepina(datos.origenId, datos.dosisDiaria, datos.destinoId);
  if (!resultado) return;
  estado.ultimoResultado = resultado;
  renderizarResultadoConversion(resultado);
  renderizarComparadorVidaMedia(resultado);
  agregarAlHistorial(resultado);
}

function renderizarInfoMedicamento(contenedor, medicamento) {
  if (!medicamento) {
    contenedor.innerHTML = "<p class='muted'>Selecciona un medicamento para ver informacion farmacologica.</p>";
    return;
  }
  const fuentes = medicamento.fuentes.map((id) => FUENTES_BENZODIACEPINAS[id]?.nombre || id).join("; ");
  contenedor.innerHTML = `
    <dl>
      <div><dt>Vida media</dt><dd>${medicamento.vidaMediaTexto}</dd></div>
      <div><dt>Duracion</dt><dd>${medicamento.duracionAccion}</dd></div>
      <div><dt>Metabolitos activos</dt><dd>${medicamento.metabolitosActivos ? "Si" : "No"}</dd></div>
      <div><dt>Equivalencia ref.</dt><dd>${medicamento.dosisReferenciaTexto || `${formatearDosis(medicamento.dosisReferenciaMg)} mg`} ≈ ${formatearDosis(medicamento.equivalenciaDiazepamMg)} mg diazepam</dd></div>
    </dl>
    <p>${medicamento.observaciones[medicamento.observaciones.length - 1]}</p>
    <small>Fuente: ${fuentes}. Revision local: ${medicamento.fechaRevision}</small>
  `;
}

export function renderizarResultadoConversion(resultado) {
  const tomasDestino = calcularTomasDestino();
  const dosisPorToma = tomasDestino > 0 ? resultado.dosisDiariaDestino / tomasDestino : resultado.dosisDiariaDestino;
  const redondeado = redondearVisible(resultado.dosisDiariaDestino);
  elementos.resultado.innerHTML = `
    <span>${resultado.origen.nombre} ${formatearDosis(resultado.dosisDiariaOrigen)} mg/dia → ${resultado.destino.nombre}</span>
    <strong>${formatearDosis(resultado.dosisDiariaDestino)} mg/dia</strong>
    <p>Redondeo visual: <b>${formatearDosis(redondeado)} mg/dia</b>. Desglose matematico: ${formatearDosis(dosisPorToma)} mg por toma si se usan ${tomasDestino} toma(s)/dia.</p>
    <p>Equivalente diazepam: ${formatearDosis(resultado.diazepamEquivalente)} mg/dia.</p>
    <p>${resultado.relacion}</p>
    <small>El redondeo no considera presentaciones comerciales ni indica partir tabletas.</small>
  `;
}

function calcularTomasDestino() {
  return calcularDosisTotalDiaria(1, elementos.frecuenciaDestino.value, elementos.tomasDestino.value) || 1;
}

function redondearVisible(valor) {
  if (!Number.isFinite(valor)) return NaN;
  if (valor < 1) return Math.round(valor * 100) / 100;
  if (valor < 10) return Math.round(valor * 10) / 10;
  return Math.round(valor);
}

function renderizarMensajes(validacion) {
  const partes = [];
  validacion.errores?.forEach((mensaje) => partes.push(`<div class="mensaje error">${mensaje}</div>`));
  validacion.advertencias?.forEach((mensaje) => partes.push(`<div class="mensaje advertencia">${mensaje}</div>`));
  elementos.mensajes.innerHTML = partes.join("");
}

function renderizarComparadorVidaMedia(resultado) {
  const comparacion = resultado.comparacionVidaMedia || compararVidaMedia(resultado.origen.id, resultado.destino.id);
  if (!comparacion) return;
  const maximo = Math.max(comparacion.origen.max, comparacion.destino.max, 1);
  const barra = (item, nombre, clase) => {
    const inicio = Math.max(0, item.min / maximo * 100);
    const ancho = Math.max(3, (item.max - item.min) / maximo * 100);
    return `<div class="vida-row"><span>${nombre}</span><div class="vida-track"><i class="${clase}" style="left:${inicio}%;width:${ancho}%"></i></div><em>${item.texto}</em></div>`;
  };
  elementos.comparador.innerHTML = `
    <h3>Comparador visual de vida media</h3>
    ${barra(comparacion.origen, resultado.origen.nombre, "origen")}
    ${barra(comparacion.destino, resultado.destino.nombre, "destino")}
    <p>${comparacion.texto}</p>
  `;
}

function agregarAlHistorial(resultado) {
  const resumen = `${resultado.origen.nombre} ${formatearDosis(resultado.dosisDiariaOrigen)} mg/dia → ${resultado.destino.nombre} ${formatearDosis(resultado.dosisDiariaDestino)} mg/dia aprox.`;
  if (estado.historial[0] === resumen) return;
  estado.historial.unshift(resumen);
  estado.historial = estado.historial.slice(0, 8);
  renderizarHistorial();
}

function renderizarHistorial() {
  if (!estado.historial.length) {
    elementos.historial.className = "historial-vacio";
    elementos.historial.textContent = "Aun no hay conversiones en esta sesion.";
    return;
  }
  elementos.historial.className = "historial-lista";
  elementos.historial.innerHTML = estado.historial.map((item) => `<div>${item}</div>`).join("");
}

function renderizarTabla() {
  const busqueda = elementos.buscarTabla.value.trim().toLowerCase();
  const filtro = elementos.filtroAccion.value;
  const orden = elementos.ordenTabla.value;
  const mostrarFuentes = elementos.colFuentes.checked;
  document.querySelectorAll(".col-fuentes").forEach((celda) => celda.classList.toggle("oculta", !mostrarFuentes));
  let lista = BENZODIACEPINAS.filter((medicamento) => medicamento.nombre.toLowerCase().includes(busqueda));
  if (filtro !== "todas") lista = lista.filter((medicamento) => medicamento.duracionAccion === filtro || medicamento.duracionAccion.includes(filtro));
  lista.sort((a, b) => {
    if (orden === "vida") return ((a.vidaMediaMinHoras + a.vidaMediaMaxHoras) / 2) - ((b.vidaMediaMinHoras + b.vidaMediaMaxHoras) / 2);
    if (orden === "accion") return a.duracionAccion.localeCompare(b.duracionAccion, "es");
    return a.nombre.localeCompare(b.nombre, "es");
  });
  elementos.tablaBody.innerHTML = lista.map((medicamento) => {
    const fuentes = medicamento.fuentes.map((id) => FUENTES_BENZODIACEPINAS[id]?.nombre || id).join("; ");
    return `<tr><td>${medicamento.nombre}</td><td>${medicamento.dosisReferenciaTexto || `${formatearDosis(medicamento.dosisReferenciaMg)} mg`}</td><td>${formatearDosis(medicamento.equivalenciaDiazepamMg)} mg</td><td>${medicamento.vidaMediaTexto}</td><td>${medicamento.duracionAccion}</td><td>${medicamento.metabolitosActivos ? "Si" : "No"}</td><td class="col-fuentes ${mostrarFuentes ? "" : "oculta"}">${fuentes}</td><td>${medicamento.fechaRevision}</td></tr>`;
  }).join("");
}

inicializarCalculadora();