import { auth, db } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { MEDICAMENTOS } from "./data/medicamentos.js";
import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "./data/escalasPsiquiatricas.js";
import {
  ESCALAS_COGNITIVAS,
  calcularPuntajeEscalaCognitiva,
  interpretarEscalaCognitiva,
  obtenerPuntajesDominioCognitivo
} from "./data/escalasCognitivas.js";
import {
  PRUEBAS_INTERACTIVAS,
  calcularPuntajePruebaInteractiva,
  interpretarPruebaInteractiva,
  obtenerPruebaInteractiva,
  puntajesDominioPruebaInteractiva
} from "./data/pruebasInteractivas.js";
import { generarNotaAutomatica } from "./services/notaAutomatica.js";
import {
  calcularPuntajeEscala,
  crearResumenEscala,
  formatearFechaEscala,
  guardarEscalaAplicada,
  listarEscalasAplicadas,
  obtenerOpcionesItemEscala,
  textoItemEscala
} from "./services/escalas.js";
import {
  aplicarPermisosFormatosSelect,
  obtenerPermisosFormatosUsuario,
  usuarioPuedeUsarFormato
} from "./services/formatosInstitucionales.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  listarPacientes,
  actualizarUsuario,
  medicoPuedeVer
} from "./services/usuarios.js";

import {
  guardarNota,
  obtenerHistorialNotas,
  actualizarNota
} from "./services/notas.js";

import {
  obtenerHistoriaClinica
} from "./services/historias.js";

let uidPacienteActual = null;
let diagnosticosSeleccionados = [];
let notaEditandoId = null;
let notasHistorial = {};
let notasHistorialOrdenadas = [];
let historiaClinicaActual = {};
let pacienteActualDatos = {};
let uidMedicoActual = "";
let rolUsuarioActual = "";
let permisosFormatosActual = {};
let apuntesMedicoCache = [];
let notasFlotantesPacienteCache = [];
let catalogoMedicosFirmasCache = [];
let diagnosticosAutomaticosSugeridos = [];
let escalasPreviasNotaCache = [];
let escalasAplicadasPendientesNota = [];

const IDS_PRUEBAS_INTERACTIVAS = new Set(PRUEBAS_INTERACTIVAS.map((escala) => escala.id));
const ESCALAS_NOTA = [
  ...ESCALAS_PSIQUIATRICAS
    .filter((escala) => !IDS_PRUEBAS_INTERACTIVAS.has(escala.id))
    .map((escala) => ({ ...escala, tipoEscala: "psiquiatrica", interactiva: false })),
  ...ESCALAS_COGNITIVAS
    .filter((escala) => !IDS_PRUEBAS_INTERACTIVAS.has(escala.id))
    .map((escala) => ({ ...escala, interactiva: false })),
  ...PRUEBAS_INTERACTIVAS.map((escala) => ({
    ...escala,
    tipoEscala: escala.tipoEscala || "cognitiva",
    items: escala.reactivos || escala.items || [],
    interactiva: true
  }))
];
let modoEscalaNota = "interactiva";

iniciarMonitoreoSesion("Nota medica");

const CLAVE_ALTURAS_NOTA = "cognicion_nota_alturas_secciones";
const camposNotaRedimensionables = [
  "tratamiento",
  "notaRapida",
  "subjetivo",
  "obsExploracionFisicaNeurologica",
  "objetivo",
  "obsResultadosEstudios",
  "analisis",
  "plan",
  "obsPronostico"
];

function cargarAlturasNota() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALTURAS_NOTA);
    const datos = guardado ? JSON.parse(guardado) : {};
    return datos && typeof datos === "object" ? datos : {};
  } catch (error) {
    console.warn("No se pudieron cargar las alturas de la nota", error);
    return {};
  }
}

function guardarAlturaNota(clave, altura) {
  const alturas = cargarAlturasNota();
  alturas[clave] = Math.max(80, Math.round(altura));
  localStorage.setItem(CLAVE_ALTURAS_NOTA, JSON.stringify(alturas));
}

function guardarEstadoSeccionNota(clave, cambios = {}) {
  const alturas = cargarAlturasNota();
  alturas[clave] = {
    ...(typeof alturas[clave] === "object" ? alturas[clave] : { altura: alturas[clave] }),
    ...cambios
  };
  localStorage.setItem(CLAVE_ALTURAS_NOTA, JSON.stringify(alturas));
}

function alturaGuardadaSeccion(valor) {
  if (typeof valor === "number") return valor;
  if (valor && typeof valor === "object") return valor.altura;
  return null;
}

function estaContraidaSeccion(valor) {
  return Boolean(valor && typeof valor === "object" && valor.contraida);
}

function aplicarAlturaSeccionNota(clave, objetivo, altura, minimo = 80) {
  const alto = Math.max(minimo, Math.round(altura));
  objetivo.style.height = `${alto}px`;
  guardarEstadoSeccionNota(clave, { altura: alto, contraida: false });
  objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable")?.classList.remove("seccion-contraida");
}

function alternarContraerSeccionNota(clave, objetivo, minimo = 80) {
  const contenedor = objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable");
  const contraida = !contenedor?.classList.contains("seccion-contraida");
  if (contraida) {
    guardarEstadoSeccionNota(clave, {
      altura: Math.max(minimo, Math.round(objetivo.getBoundingClientRect().height)),
      contraida: true
    });
    objetivo.style.height = `${minimo}px`;
    contenedor?.classList.add("seccion-contraida");
    return;
  }

  const estado = cargarAlturasNota()[clave];
  aplicarAlturaSeccionNota(clave, objetivo, alturaGuardadaSeccion(estado) || 130, minimo);
}

function crearControlesTactilesSeccion(clave, objetivo, minimo = 80, alturaBase = 130) {
  const controles = document.createElement("div");
  controles.className = "controles-tamano-nota";
  controles.innerHTML = `
    <button type="button" data-accion="menos" title="Hacer mas pequeno">-</button>
    <button type="button" data-accion="mas" title="Hacer mas grande">+</button>
    <button type="button" data-accion="contraer" title="Contraer o expandir">Contraer</button>
    <button type="button" data-accion="reiniciar" title="Restablecer tamano">Reiniciar</button>
  `;

  controles.addEventListener("click", (evento) => {
    const boton = evento.target.closest("button");
    if (!boton) return;
    const actual = objetivo.getBoundingClientRect().height;
    const accion = boton.dataset.accion;

    if (accion === "menos") aplicarAlturaSeccionNota(clave, objetivo, actual - 48, minimo);
    if (accion === "mas") aplicarAlturaSeccionNota(clave, objetivo, actual + 48, minimo);
    if (accion === "contraer") alternarContraerSeccionNota(clave, objetivo, minimo);
    if (accion === "reiniciar") aplicarAlturaSeccionNota(clave, objetivo, alturaBase, minimo);
  });

  return controles;
}

function crearSeparadorVertical(clave, objetivo, minimo = 80) {
  const separador = document.createElement("div");
  separador.className = "separador-vertical-nota";
  separador.setAttribute("role", "separator");
  separador.setAttribute("aria-orientation", "horizontal");
  separador.title = "Arrastrar para ajustar altura";

  separador.addEventListener("pointerdown", (evento) => {
    evento.preventDefault();
    const inicioY = evento.clientY;
    const altoInicial = objetivo.getBoundingClientRect().height;
    separador.setPointerCapture(evento.pointerId);
    document.body.classList.add("ajustando-seccion-nota");

    const mover = (movimiento) => {
      const nuevoAlto = Math.max(minimo, altoInicial + movimiento.clientY - inicioY);
      objetivo.style.height = `${nuevoAlto}px`;
      objetivo.closest(".seccion-nota-redimensionable, .panel-nota-redimensionable")?.classList.remove("seccion-contraida");
    };

    const terminar = (final) => {
      guardarEstadoSeccionNota(clave, {
        altura: objetivo.getBoundingClientRect().height,
        contraida: false
      });
      document.body.classList.remove("ajustando-seccion-nota");
      separador.releasePointerCapture(final.pointerId);
      separador.removeEventListener("pointermove", mover);
      separador.removeEventListener("pointerup", terminar);
      separador.removeEventListener("pointercancel", terminar);
    };

    separador.addEventListener("pointermove", mover);
    separador.addEventListener("pointerup", terminar);
    separador.addEventListener("pointercancel", terminar);
  });

  return separador;
}

function envolverCampoRedimensionable(campo, clave, alturaGuardada) {
  if (!campo || campo.closest(".seccion-nota-redimensionable")) return;

  const etiqueta = campo.previousElementSibling?.tagName === "LABEL"
    ? campo.previousElementSibling
    : null;
  const seccion = document.createElement("section");
  seccion.className = "seccion-nota-redimensionable";
  seccion.dataset.seccionNota = clave;

  const referencia = etiqueta || campo;
  referencia.parentNode.insertBefore(seccion, referencia);
  if (etiqueta) seccion.appendChild(etiqueta);
  seccion.appendChild(crearControlesTactilesSeccion(clave, campo, 80, 130));
  seccion.appendChild(campo);

  const altura = alturaGuardadaSeccion(alturaGuardada);
  if (altura) campo.style.height = `${altura}px`;
  if (estaContraidaSeccion(alturaGuardada)) {
    seccion.classList.add("seccion-contraida");
    campo.style.height = "80px";
  }
  seccion.appendChild(crearSeparadorVertical(clave, campo, 80));
}

function prepararPanelRedimensionable(panel, clave, alturaGuardada) {
  if (!panel || panel.dataset.redimensionNota === "true") return;
  panel.dataset.redimensionNota = "true";
  panel.classList.add("panel-nota-redimensionable");

  panel.appendChild(crearControlesTactilesSeccion(clave, panel, 110, 180));
  const altura = alturaGuardadaSeccion(alturaGuardada);
  if (altura) panel.style.height = `${altura}px`;
  if (estaContraidaSeccion(alturaGuardada)) {
    panel.classList.add("seccion-contraida");
    panel.style.height = "110px";
  }
  panel.appendChild(crearSeparadorVertical(clave, panel, 110));
}

function configurarSeccionesRedimensionablesNota() {
  const alturas = cargarAlturasNota();

  camposNotaRedimensionables.forEach((id) => {
    envolverCampoRedimensionable(
      document.getElementById(id),
      `campo:${id}`,
      alturas[`campo:${id}`]
    );
  });

  document.querySelectorAll("#bloqueObservacionFray > .observacion-seccion, #bloqueObservacionFray > details.observacion-seccion")
    .forEach((panel, index) => prepararPanelRedimensionable(panel, `observacion:${index}`, alturas[`observacion:${index}`]));

  prepararPanelRedimensionable(
    document.querySelector("#bloqueNotaCompleta .tabla-diagnosticos"),
    "panel:diagnosticos-cie10",
    alturas["panel:diagnosticos-cie10"]
  );
}

const buscadorDiagnostico = document.getElementById("buscadorDiagnostico");
const resultadosCIE10 = document.getElementById("resultadosCIE10");
const cie10Codigo = document.getElementById("cie10Codigo");
const cie10Nombre = document.getElementById("cie10Nombre");
const buscadorCIE10 = document.getElementById("buscadorCIE10");
const buscadorCIE11 = document.getElementById("buscadorCIE11");
const resultadosCIE10Lista = document.getElementById("resultadosCIE10Lista");
const resultadosCIE11Lista = document.getElementById("resultadosCIE11Lista");
const diagnosticoCatalogoVisible = document.getElementById("diagnosticoCatalogoVisible");
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";
let catalogoManualDiagnosticos = cargarCatalogoManualDiagnosticos();

function cargarCatalogoManualDiagnosticos() {
  try {
    const guardado = localStorage.getItem(CLAVE_CATALOGO_MANUAL);
    const datos = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo manual de diagnosticos", error);
    return [];
  }
}

function guardarCatalogoManualDiagnosticos() {
  localStorage.setItem(CLAVE_CATALOGO_MANUAL, JSON.stringify(catalogoManualDiagnosticos));
}

function catalogoManualPorTipo(nombreCatalogo) {
  return catalogoManualDiagnosticos.filter((dx) => dx.catalogo === nombreCatalogo);
}

function catalogoDiagnosticosCombinado() {
  return [
    ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
    ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" })),
    ...catalogoManualDiagnosticos
  ];
}

function configurarBuscadorCatalogo(input, contenedor, catalogo, nombreCatalogo) {
  if (!input || !contenedor) return;

  input.addEventListener("input", () => {
    const texto = input.value.toLowerCase().trim();
    contenedor.innerHTML = "";

    if (texto.length < 2) return;

    [...catalogo, ...catalogoManualPorTipo(nombreCatalogo)]
      .filter((dx) =>
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      )
      .slice(0, 10)
      .forEach((dx) => {
        const item = document.createElement("div");
        item.classList.add("resultado-cie10");
        const etiquetaManual = dx.agregadoManual
          ? `<em class="diagnostico-manual-badge">Agregado manualmente</em>`
          : "";
        item.innerHTML = `<strong>${dx.codigo}</strong> <span>${nombreCatalogo}</span> ${etiquetaManual} - ${dx.nombre}`;
        item.addEventListener("click", () => {
          agregarDiagnostico({ ...dx, catalogo: nombreCatalogo });
          input.value = "";
          contenedor.innerHTML = "";
        });
        contenedor.appendChild(item);
      });
  });
}

configurarBuscadorCatalogo(buscadorCIE10, resultadosCIE10Lista, CIE10, "CIE-10");
configurarBuscadorCatalogo(buscadorCIE11, resultadosCIE11Lista, CIE11, "CIE-11");

if (buscadorDiagnostico && resultadosCIE10 && cie10Codigo && cie10Nombre) {
  buscadorDiagnostico.addEventListener("input", () => {
    const texto = buscadorDiagnostico.value.toLowerCase().trim();

    resultadosCIE10.innerHTML = "";

    if (texto.length < 2) return;

    const resultados = catalogoDiagnosticosCombinado().filter((dx) => {
      return (
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      );
    }).slice(0, 10);

    resultados.forEach((dx) => {
      const item = document.createElement("div");
      item.classList.add("resultado-cie10");
      const etiquetaManual = dx.agregadoManual
        ? `<em class="diagnostico-manual-badge">Agregado manualmente</em>`
        : "";

      item.innerHTML = `
        <strong>${dx.codigo}</strong> <span>${dx.catalogo}</span> ${etiquetaManual} - ${dx.nombre}
      `;

      item.addEventListener("click", () => {
        agregarDiagnostico(dx);
        buscadorDiagnostico.value = "";
        resultadosCIE10.innerHTML = "";
      });

      resultadosCIE10.appendChild(item);
    });
  });
}

const buscadorMedicamento = document.getElementById("buscadorMedicamento");
const resultadosMedicamentos = document.getElementById("resultadosMedicamentos");

if (buscadorMedicamento && resultadosMedicamentos) {
  buscadorMedicamento.addEventListener("input", () => {
    const texto = buscadorMedicamento.value.toLowerCase().trim();
    resultadosMedicamentos.innerHTML = "";

    if (texto.length < 2) return;

    MEDICAMENTOS.filter((med) =>
      med.nombre.toLowerCase().includes(texto) ||
      med.clase.toLowerCase().includes(texto)
    ).slice(0, 10).forEach((med) => {
      const item = document.createElement("div");
      item.className = "resultado-cie10";
      item.innerHTML = `<strong>${med.nombre}</strong> - ${med.clase}<br><small>${med.dosisHabitual} | ${med.notas}</small>`;
      item.addEventListener("click", () => {
        const tratamiento = document.getElementById("tratamiento");
        const textoMed = `${med.nombre} (${med.clase}) - ${med.dosisHabitual}. ${med.notas}`;
        tratamiento.value = tratamiento.value
          ? `${tratamiento.value}\n${textoMed}`
          : textoMed;
        buscadorMedicamento.value = "";
        resultadosMedicamentos.innerHTML = "";
      });
      resultadosMedicamentos.appendChild(item);
    });
  });

  sincronizarDiagnosticosObservacion();
}

function configurarPanelEscalaNota() {
  const selector = document.getElementById("selectorEscalaNota");
  const botonGuardar = document.getElementById("guardarEscalaNota");
  const botonPrevias = document.getElementById("abrirEscalasPreviasNota");
  const botonCerrarPrevias = document.getElementById("cerrarEscalasPreviasNota");
  const buscadorPrevias = document.getElementById("buscarEscalasPreviasNota");
  const filtroPrevias = document.getElementById("filtrarEscalasPreviasNota");

  if (!selector) return;

  const escalasClinicasNota = ESCALAS_NOTA.filter((escala) => !esEscalaCognitivaNota(escala));
  const escalasCognitivasNota = ESCALAS_NOTA.filter((escala) => esEscalaCognitivaNota(escala));
  selector.innerHTML = `
    <optgroup label="Escalas clinicas">
      ${escalasClinicasNota.map((escala) => `<option value="${escala.id}">${escala.nombre} - ${escala.area || escala.subtitulo || "Clinica"}</option>`).join("")}
    </optgroup>
    <optgroup label="Escalas y tamizajes cognitivos">
      ${escalasCognitivasNota.map((escala) => `<option value="${escala.id}">${escala.nombre} - ${escala.subtitulo || escala.area || "Cognitiva"}</option>`).join("")}
    </optgroup>
  `;

  selector.addEventListener("change", () => {
    const escala = escalaNotaActual();
    modoEscalaNota = escala?.interactiva ? "interactiva" : "manual";
    renderizarEscalaNotaSeleccionada();
  });
  document.querySelectorAll("[data-modo-escala-nota]").forEach((boton) => {
    boton.addEventListener("click", () => cambiarModoEscalaNota(boton.dataset.modoEscalaNota));
  });
  botonGuardar?.addEventListener("click", guardarEscalaDesdeNota);
  botonPrevias?.addEventListener("click", abrirPanelEscalasPreviasNota);
  botonCerrarPrevias?.addEventListener("click", cerrarPanelEscalasPreviasNota);
  buscadorPrevias?.addEventListener("input", renderizarEscalasPreviasNota);
  filtroPrevias?.addEventListener("change", renderizarEscalasPreviasNota);
  renderizarEscalaNotaSeleccionada();
}

function escalaNotaActual() {
  const id = document.getElementById("selectorEscalaNota")?.value;
  return ESCALAS_NOTA.find((escala) => escala.id === id) || ESCALAS_NOTA[0];
}

function esEscalaCognitivaNota(escala = {}) {
  return escala.tipoEscala === "cognitiva" || escala.area === "Cognitiva" || Boolean(escala.dominiosEvaluados?.length);
}

function cambiarModoEscalaNota(modo) {
  const escala = escalaNotaActual();
  if (modo === "interactiva" && !escala?.interactiva) {
    alert("Esta escala solo permite captura estructurada por ahora.");
    return;
  }
  modoEscalaNota = modo === "manual" ? "manual" : "interactiva";
  renderizarEscalaNotaSeleccionada();
}

function actualizarModoEscalaNota() {
  const escala = escalaNotaActual();
  if (!escala?.interactiva) modoEscalaNota = "manual";
  document.querySelectorAll("[data-modo-escala-nota]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.modoEscalaNota === modoEscalaNota);
  });
  document.getElementById("modoAplicarEscalaNota")?.toggleAttribute("disabled", !escala?.interactiva);
}

function itemsEscalaNota(escala = {}) {
  return modoEscalaNota === "interactiva" ? escala.reactivos || escala.items || [] : escala.items || escala.reactivos || [];
}

function renderizarEscalaNotaSeleccionada() {
  const escala = escalaNotaActual();
  const descripcion = document.getElementById("descripcionEscalaNota");
  const items = document.getElementById("itemsEscalaNota");
  if (!escala || !descripcion || !items) return;
  actualizarModoEscalaNota();

  const intro = escala.introduccion || escala.instrucciones
    ? `<p>${escaparHTML(escala.introduccion || escala.instrucciones)}</p>`
    : "";
  const pasos = escala.pasos?.length
    ? `<div class="guia-escala-nota"><strong>Guia de aplicacion</strong><ol>${escala.pasos.map((paso) => `<li>${escaparHTML(paso)}</li>`).join("")}</ol></div>`
    : "";
  const temporizador = escala.duracionSegundos
    ? `<div class="temporizador-escala-nota"><span data-tiempo-escala-nota>${escala.duracionSegundos}</span>s <button type="button" data-iniciar-temporizador-escala-nota>Iniciar temporizador</button></div>`
    : "";
  const estimulo = escala.estimulo ? `<p class="estimulo-escala-nota">${escaparHTML(escala.estimulo)}</p>` : "";
  const limitaciones = escala.limitaciones
    ? `<p class="advertencia-escala-nota">${escaparHTML(escala.limitaciones)}</p>`
    : "";
  const oficial = escala.requiereInstrumentoOficial
    ? `<p class="advertencia-escala-nota">Este instrumento requiere material oficial o aplicacion clinica supervisada. Cognicion guia la aplicacion/captura sin reproducir contenido protegido.</p>`
    : "";
  const consideraciones = Array.isArray(escala.consideraciones) && escala.consideraciones.length
    ? `<div class="consideraciones-escala-nota"><strong>Consideraciones clinicas</strong><ul>${escala.consideraciones.map((item) => `<li>${escaparHTML(item)}</li>`).join("")}</ul></div>`
    : "";

  descripcion.innerHTML = `
    <strong>${escaparHTML(escala.nombre)}</strong> - ${escaparHTML(escala.subtitulo || escala.area || "")}
    <br>${escaparHTML(escala.descripcion || "")}
    <br><small>Modo: ${modoEscalaNota === "manual" ? "Capturar resultado previo" : "Aplicar prueba ahora"}. Rango: ${escaparHTML(escala.rango || "")}. Resultado integrado al expediente.</small>
    ${intro}
    ${oficial}
    ${limitaciones}
    ${pasos}
    ${estimulo}
    ${temporizador}
    ${consideraciones}
  `;
  window.setTimeout(configurarTemporizadorEscalaNota, 0);

  const reactivos = itemsEscalaNota(escala);
  items.innerHTML = reactivos.map((item, index) => {
    if (item.tipo === "numero") {
      return `
        <div class="item-escala-nota">
          <label>${index + 1}. ${escaparHTML(textoItemEscala(item))}
            <input data-item-escala-nota="${index}" type="number" min="${item.min ?? 0}" max="${item.max ?? ""}" step="${item.step || 1}" placeholder="${item.min ?? 0}-${item.max ?? ""}">
          </label>
          <small>${escaparHTML(item.dominio || "")}${item.max !== undefined ? ` - Maximo ${escaparHTML(item.max)}` : ""}${item.ayuda ? ` - ${escaparHTML(item.ayuda)}` : ""}</small>
        </div>
      `;
    }

    const opciones = obtenerOpcionesEscalaNota(escala, item);
    return `
      <div class="item-escala-nota">
        <label>${index + 1}. ${escaparHTML(textoItemEscala(item))}
          <select data-item-escala-nota="${index}">
            <option value="">Seleccionar</option>
            ${opciones.map((opcion) => `<option value="${escaparHTML(opcion.valor)}">${escaparHTML(opcion.texto)}${opcion.texto.includes("(") ? "" : ` (${escaparHTML(opcion.valor)})`}</option>`).join("")}
          </select>
        </label>
        <small>${escaparHTML(item.dominio || "")}</small>
      </div>
    `;
  }).join("");
}

function obtenerOpcionesEscalaNota(escala, item) {
  if (Array.isArray(item.opciones) && item.opciones.length) {
    return item.opciones.map((opcion, opcionIndex) => {
      if (typeof opcion === "object") return { texto: opcion.texto ?? String(opcion.valor ?? opcionIndex), valor: Number(opcion.valor ?? opcionIndex) };
      return { texto: String(opcion), valor: Number(item.valores?.[opcionIndex] ?? opcionIndex) };
    });
  }
  return obtenerOpcionesItemEscala(escala, item);
}

function configurarTemporizadorEscalaNota() {
  const boton = document.querySelector("[data-iniciar-temporizador-escala-nota]");
  const etiqueta = document.querySelector("[data-tiempo-escala-nota]");
  if (!boton || !etiqueta || boton.dataset.configurado === "1") return;
  boton.dataset.configurado = "1";
  boton.addEventListener("click", () => {
    let restante = Number(etiqueta.textContent || 0);
    boton.disabled = true;
    const intervalo = window.setInterval(() => {
      restante -= 1;
      etiqueta.textContent = String(Math.max(0, restante));
      if (restante <= 0) {
        window.clearInterval(intervalo);
        boton.disabled = false;
        boton.textContent = "Reiniciar temporizador";
      }
    }, 1000);
  });
}

async function guardarEscalaDesdeNota() {
  const selectorPaciente = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selectorPaciente?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente antes de guardar la escala.");
    return;
  }

  const escala = escalaNotaActual();
  if (!escala) return;

  const reactivos = itemsEscalaNota(escala);
  const controles = [...document.querySelectorAll("[data-item-escala-nota]")];
  const respuestas = controles.map((control, index) => {
    const item = reactivos[index];
    const valor = control.value === "" ? null : Number(control.value);
    const respuesta = control.tagName === "SELECT"
      ? control.options[control.selectedIndex]?.textContent || ""
      : control.value;

    return {
      item: textoItemEscala(item),
      dominio: item?.dominio || "",
      valor,
      respuesta
    };
  });

  if (respuestas.some((respuesta) => respuesta.valor === null)) {
    alert("Responde todos los reactivos de la escala.");
    return;
  }

  const esInteractiva = modoEscalaNota === "interactiva" && Boolean(obtenerPruebaInteractiva(escala.id));
  const esCognitiva = esEscalaCognitivaNota(escala);
  const fueraDeRango = respuestas.some((respuesta, index) => {
    const item = reactivos[index] || {};
    if (item.tipo !== "numero") return false;
    if (item.min !== undefined && respuesta.valor < item.min) return true;
    if (item.max !== undefined && respuesta.valor > item.max) return true;
    return false;
  });

  if (fueraDeRango) {
    alert("Revisa los puntajes: hay valores fuera del rango permitido para la escala.");
    return;
  }

  const puntaje = esInteractiva
    ? calcularPuntajePruebaInteractiva(escala, respuestas)
    : esCognitiva
      ? calcularPuntajeEscalaCognitiva(escala, respuestas)
      : calcularPuntajeEscala(respuestas);
  const interpretacion = esInteractiva
    ? interpretarPruebaInteractiva(escala, puntaje)
    : esCognitiva
      ? interpretarEscalaCognitiva(escala, puntaje, respuestas)
      : interpretarEscala(escala, puntaje);
  const puntajesPorDominio = esInteractiva
    ? puntajesDominioPruebaInteractiva(respuestas)
    : esCognitiva
      ? obtenerPuntajesDominioCognitivo(respuestas)
      : {};
  const usuario = auth.currentUser;
  const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
  const pacienteActual = await obtenerUsuario(uidPaciente);
  const observaciones = document.getElementById("observacionesEscalaNota")?.value?.trim() || "";
  const idEscalaAplicada = doc(collection(db, "usuarios", uidPaciente, "escalasAplicadas")).id;
  const fechaAplicacion = new Date().toISOString();

  await guardarEscalaAplicada(uidPaciente, {
    idEscalaAplicada,
    escalaId: escala.id,
    uidMedico: usuario?.uid || "",
    uidProfesional: usuario?.uid || "",
    rolProfesional: medicoActual?.rol || "",
    nombrePaciente: pacienteActual?.nombre || "",
    nombreEscala: escala.nombre,
    tipoEscala: esCognitiva ? "cognitiva" : escala.tipoEscala || escala.area,
    fechaAplicacion,
    origen: "nota_clinica",
    modoAplicacion: esInteractiva ? "aplicacion_interactiva" : "captura_resultado_previo",
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo ?? "",
    dominiosEvaluados: escala.dominiosEvaluados || [],
    puntajesPorDominio,
    rango: escala.rango,
    interpretacion,
    respuestasPorItem: respuestas,
    observaciones,
    observacionesClinicas: observaciones,
    observacionesOpcionales: observaciones,
    recomendaciones: esCognitiva ? generarRecomendacionesCognitivas(puntajesPorDominio, escala) : "",
    idNota: notaEditandoId || "",
    medicoNombre: medicoActual?.nombre || usuario?.email || "",
    aplicadoPorMedico: true,
    visiblePaciente: false,
    visibilidadPaciente: false,
    visibleDesdePaciente: false,
  });

  if (!notaEditandoId) {
    escalasAplicadasPendientesNota.push(idEscalaAplicada);
  }

  insertarResumenEscalaEnNota(crearResumenEscala({
    idEscalaAplicada,
    nombreEscala: escala.nombre,
    fechaAplicacion,
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo ?? "",
    interpretacion,
    observaciones
  }), idEscalaAplicada);

  await registrarEventoAuditoria({
    accion: "guardar_escala_desde_nota",
    modulo: "Nota medica",
    descripcion: "El medico aplico una escala clinica desde la nota.",
    usuarioUid: usuario?.uid || "",
    usuarioNombre: medicoActual?.nombre || usuario?.email || "",
    usuarioRol: medicoActual?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: pacienteActual?.nombre || "",
    exito: true,
    detalles: {
      escalaId: escala.id,
      escalaNombre: escala.nombre,
      puntaje,
      interpretacion
    }
  });

  alert(`Escala guardada: ${escala.nombre} = ${puntaje} (${interpretacion})`);
  renderizarEscalaNotaSeleccionada();
  const observacionesCampo = document.getElementById("observacionesEscalaNota");
  if (observacionesCampo) observacionesCampo.value = "";
}

function generarRecomendacionesCognitivas(puntajesPorDominio = {}, escala = {}) {
  const respuestas = [];
  const dominios = Object.keys(puntajesPorDominio);

  if (dominios.some((dominio) => /atencion/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de atencion sostenida/selectiva y velocidad de respuesta.");
  }
  if (dominios.some((dominio) => /memoria|recuerdo/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de memoria de trabajo, aprendizaje verbal y evocacion.");
  }
  if (dominios.some((dominio) => /ejecutiv|flexibilidad|inhib/i.test(dominio))) {
    respuestas.push("Considerar tareas de planificacion, flexibilidad cognitiva e inhibicion.");
  }
  if (dominios.some((dominio) => /visuo|reloj|espacial/i.test(dominio))) {
    respuestas.push("Considerar tareas visuoespaciales, copia, rutas visuales y organizacion perceptual.");
  }
  if (dominios.some((dominio) => /lenguaje|fluencia/i.test(dominio))) {
    respuestas.push("Considerar ejercicios de fluidez verbal, denominacion y acceso lexico.");
  }

  respuestas.push(`Recomendacion orientativa basada en ${escala.nombre || "tamizaje cognitivo"}; integrar con entrevista y valoracion clinica.`);
  return respuestas.join(" ");
}

function insertarResumenEscalaEnNota(resumen, idEscalaAplicada = "") {
  const campoAnalisis = document.getElementById("analisis");
  if (!campoAnalisis || !resumen) return;

  if (campoAnalisis.value.includes(resumen)) return;

  campoAnalisis.value = [campoAnalisis.value.trim(), resumen].filter(Boolean).join("\n\n");
}

async function vincularEscalasPendientesANota(uidPaciente, idNota) {
  if (!uidPaciente || !idNota || !escalasAplicadasPendientesNota.length) return;

  const idsUnicos = [...new Set(escalasAplicadasPendientesNota)];
  await Promise.all(idsUnicos.flatMap((idEscalaAplicada) => [
    setDoc(doc(db, "usuarios", uidPaciente, "escalasAplicadas", idEscalaAplicada), { idNota }, { merge: true }),
    setDoc(doc(db, "usuarios", uidPaciente, "resultadosEscalas", idEscalaAplicada), { idNota }, { merge: true })
  ]));

  escalasAplicadasPendientesNota = [];
}

async function abrirPanelEscalasPreviasNota() {
  const selectorPaciente = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selectorPaciente?.value;
  const panel = document.getElementById("panelEscalasPreviasNota");
  const lista = document.getElementById("listaEscalasPreviasNota");
  if (!panel || !lista) return;

  panel.classList.add("abierto");
  panel.setAttribute("aria-hidden", "false");
  lista.textContent = "Cargando escalas previas...";

  if (!uidPaciente) {
    lista.textContent = "Selecciona un paciente para consultar escalas previas.";
    return;
  }

  escalasPreviasNotaCache = await listarEscalasAplicadas(uidPaciente, 80);
  poblarFiltroEscalasPreviasNota();
  renderizarEscalasPreviasNota();
}

function cerrarPanelEscalasPreviasNota() {
  const panel = document.getElementById("panelEscalasPreviasNota");
  if (!panel) return;
  panel.classList.remove("abierto");
  panel.setAttribute("aria-hidden", "true");
}

function poblarFiltroEscalasPreviasNota() {
  const filtro = document.getElementById("filtrarEscalasPreviasNota");
  if (!filtro) return;
  const valorActual = filtro.value;
  const tipos = [...new Set(escalasPreviasNotaCache.map((escala) => escala.tipoEscala).filter(Boolean))].sort();
  filtro.innerHTML = `<option value="">Todas las areas</option>${tipos.map((tipo) => `<option value="${escaparHTML(tipo)}">${escaparHTML(tipo)}</option>`).join("")}`;
  filtro.value = tipos.includes(valorActual) ? valorActual : "";
}

function renderizarEscalasPreviasNota() {
  const lista = document.getElementById("listaEscalasPreviasNota");
  if (!lista) return;

  const texto = (document.getElementById("buscarEscalasPreviasNota")?.value || "").trim().toLowerCase();
  const tipo = document.getElementById("filtrarEscalasPreviasNota")?.value || "";
  const escalas = escalasPreviasNotaCache.filter((escala) => {
    const coincideTexto = !texto || (escala.nombreEscala || "").toLowerCase().includes(texto);
    const coincideTipo = !tipo || escala.tipoEscala === tipo;
    return coincideTexto && coincideTipo;
  });

  if (!escalas.length) {
    lista.textContent = "No hay escalas para mostrar con esos filtros.";
    return;
  }

  lista.innerHTML = escalas.map((escala) => renderizarTarjetaEscalaPreviaNota(escala)).join("");
  lista.querySelectorAll("[data-copiar-escala-previa]").forEach((boton) => {
    boton.addEventListener("click", () => copiarResumenEscalaPrevia(boton.dataset.copiarEscalaPrevia));
  });
  lista.querySelectorAll("[data-insertar-escala-previa]").forEach((boton) => {
    boton.addEventListener("click", () => insertarEscalaPreviaEnNota(boton.dataset.insertarEscalaPrevia));
  });
}

function renderizarTarjetaEscalaPreviaNota(escala) {
  const respuestas = (escala.respuestasPorItem || []).map((respuesta) => `
    <li><strong>${escaparHTML(respuesta.item || "")}</strong><span>${escaparHTML(respuesta.respuesta || "")} (${respuesta.valor ?? ""}) ${respuesta.dominio ? `· ${escaparHTML(respuesta.dominio)}` : ""}</span></li>
  `).join("");
  const puntajesDominio = escala.puntajesPorDominio && Object.keys(escala.puntajesPorDominio).length
    ? `<p><strong>Puntajes por dominio:</strong> ${escaparHTML(Object.entries(escala.puntajesPorDominio).map(([dominio, valor]) => `${dominio}: ${valor}`).join(" · "))}</p>`
    : "";
  const maximo = escala.puntajeMaximo ? `/${escaparHTML(escala.puntajeMaximo)}` : "";

  return `
    <details class="escala-previa-card">
      <summary>
        <span>${escaparHTML(formatearFechaEscala(escala.fechaAplicacion))}</span>
        <strong>${escaparHTML(escala.nombreEscala)}</strong>
        <em>${escaparHTML(String(escala.puntajeTotal))}${maximo} - ${escaparHTML(escala.interpretacion || "")}</em>
      </summary>
      <div class="escala-previa-detalle">
        <p><strong>Origen:</strong> ${escaparHTML(escala.origen || "")}</p>
        <p><strong>Medico:</strong> ${escaparHTML(escala.medicoNombre || escala.uidMedico || "Sin registro")}</p>
        <p><strong>Fecha y hora:</strong> ${escaparHTML(formatearFechaEscala(escala.fechaAplicacion, true))}</p>
        ${puntajesDominio}
        <ul>${respuestas || "<li>Sin respuestas registradas.</li>"}</ul>
        <p><strong>Observaciones:</strong> ${escaparHTML(escala.observaciones || "Sin observaciones")}</p>
        ${escala.recomendaciones ? `<p><strong>Recomendaciones:</strong> ${escaparHTML(escala.recomendaciones)}</p>` : ""}
        <div class="acciones-escala-previa">
          <button type="button" data-copiar-escala-previa="${escaparHTML(escala.idEscalaAplicada)}">Copiar resumen</button>
          <button type="button" data-insertar-escala-previa="${escaparHTML(escala.idEscalaAplicada)}">Insertar en nota</button>
        </div>
      </div>
    </details>
  `;
}

async function copiarResumenEscalaPrevia(idEscalaAplicada) {
  const escala = escalasPreviasNotaCache.find((item) => item.idEscalaAplicada === idEscalaAplicada);
  if (!escala) return;
  await navigator.clipboard?.writeText(crearResumenEscala(escala));
  alert("Resumen copiado al portapapeles.");
}

function insertarEscalaPreviaEnNota(idEscalaAplicada) {
  const escala = escalasPreviasNotaCache.find((item) => item.idEscalaAplicada === idEscalaAplicada);
  if (!escala) return;
  insertarResumenEscalaEnNota(crearResumenEscala(escala), `previa-${idEscalaAplicada}`);
}

configurarPanelEscalaNota();
configurarSeccionesRedimensionablesNota();

const ESTADOS_DIAGNOSTICO_NOTA = [
  "",
  "Se agrega",
  "Se descarta",
  "Probable",
  "A descartar",
  "Confirmado",
  "En seguimiento",
  "Antecedente",
  "Remisión",
  "Diferencial"
];

function estadoDiagnosticoNotaValido(estado) {
  return ESTADOS_DIAGNOSTICO_NOTA.includes(estado) ? estado : ESTADOS_DIAGNOSTICO_NOTA[0];
}

function crearIdDiagnosticoNota(dx, index = 0) {
  if (dx?.id) return dx.id;
  const base = [dx?.catalogo, dx?.codigo, dx?.nombre || dx?.texto, index]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `diagnostico-${index}`;
}

function normalizarDiagnosticoNota(dx = {}, index = 0) {
  if (typeof dx === "string") {
    const base = {
      codigo: "",
      nombre: dx,
      catalogo: "CIE-10",
      texto: dx,
      fechaSeleccion: new Date().toISOString(),
      estado: ESTADOS_DIAGNOSTICO_NOTA[0],
      orden: index
    };
    return { ...base, id: crearIdDiagnosticoNota(base, index) };
  }

  const nombre = dx.nombre || dx.texto || dx.descripcion || "";
  const normalizado = {
    ...dx,
    id: dx.id || "",
    codigo: dx.codigo || "",
    nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: dx.texto || `${dx.codigo || ""}${dx.codigo && nombre ? " - " : ""}${nombre}`.trim() || nombre,
    fechaSeleccion: dx.fechaSeleccion || new Date().toISOString(),
    estado: estadoDiagnosticoNotaValido(dx.estado),
    orden: Number.isFinite(Number(dx.orden)) ? Number(dx.orden) : index
  };
  normalizado.id = crearIdDiagnosticoNota(normalizado, index);
  return normalizado;
}

function normalizarDiagnosticosNota(lista = []) {
  return lista
    .map((dx, index) => normalizarDiagnosticoNota(dx, index))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((dx, index) => ({ ...dx, orden: index }));
}

function textoDiagnosticoConEstado(dx) {
  const base = dx?.texto || `${dx?.codigo || ""}${dx?.codigo && dx?.nombre ? " - " : ""}${dx?.nombre || ""}`.trim();
  const estado = dx?.estado ? ` — ${dx.estado}` : "";
  return `${base}${estado}`.trim();
}

function opcionesEstadoDiagnosticoNota(estadoActual = ESTADOS_DIAGNOSTICO_NOTA[0]) {
  return ESTADOS_DIAGNOSTICO_NOTA.map((estado) => `
    <option value="${escaparHTML(estado)}" ${estado === estadoActual ? "selected" : ""}>${escaparHTML(estado)}</option>
  `).join("");
}
function agregarDiagnostico(dx) {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  const yaExiste = diagnosticosSeleccionados.some(
    (item) =>
      item.codigo === dx.codigo &&
      (item.catalogo || "CIE-10") === (dx.catalogo || "CIE-10")
  );

  if (yaExiste) {
    alert("Este diagnóstico ya está seleccionado");
    return;
  }

  const nuevoDiagnostico = normalizarDiagnosticoNota({
    codigo: dx.codigo,
    nombre: dx.nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: `${dx.codigo} - ${dx.nombre}`,
    fechaSeleccion: new Date().toISOString()
  }, diagnosticosSeleccionados.length);

  diagnosticosSeleccionados.push(nuevoDiagnostico);
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);

  cie10Codigo.value = dx.codigo;
  cie10Nombre.value = dx.nombre;

  renderizarDiagnosticosSeleccionados();
}

function anexarTextoGenerado(id, texto, titulo = "Sugerencia automatica") {
  const campo = document.getElementById(id);
  const limpio = String(texto || "").trim();
  if (!campo || !limpio) return;

  const encabezado = `--- ${titulo} ---`;
  const patron = new RegExp(`\\n?\\n?--- ${titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ---[\\s\\S]*?(?=\\n\\n--- |$)`, "g");
  const previo = campo.value.replace(patron, "").trim();
  campo.value = previo
    ? `${previo}\n\n${encabezado}\n${limpio}`
    : limpio;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

function textoRiesgosAutomaticos(riesgos = []) {
  if (!riesgos.length) return "";
  return riesgos.map((riesgo) =>
    `${riesgo.tipo} (${riesgo.severidad}): ${riesgo.marcadores.join(", ")}`
  ).join("\n");
}

function renderizarDiagnosticosAutomaticos() {
  const panel = document.getElementById("panelNotaAutomatica");
  const contenedor = document.getElementById("diagnosticosNotaAutomatica");
  const riesgos = document.getElementById("riesgosNotaAutomatica");
  if (!panel || !contenedor || !riesgos) return;

  panel.classList.remove("oculto");

  riesgos.innerHTML = diagnosticosAutomaticosSugeridos.riesgos?.length
    ? `
      <strong>Riesgos detectados</strong>
      ${diagnosticosAutomaticosSugeridos.riesgos.map((riesgo) => `
        <p>${escaparHTML(riesgo.tipo)} · ${escaparHTML(riesgo.severidad)} · ${escaparHTML(riesgo.marcadores.join(", "))}</p>
      `).join("")}
    `
    : "<p>No se detectaron datos de alarma directos por reglas. Esto no sustituye la exploracion clinica.</p>";

  const sugeridos = diagnosticosAutomaticosSugeridos.diagnosticos || [];
  contenedor.innerHTML = sugeridos.length
    ? sugeridos.map((dx, index) => `
      <article class="diagnostico-automatico-card">
        <div>
          <span class="badge-sugerido">${escaparHTML(dx.certeza || "sugerido")}</span>
          <strong>${escaparHTML(dx.codigo || "")}</strong>
        </div>
        <label>Codigo
          <input value="${escaparHTML(dx.codigo || "")}" data-dx-auto="${index}" data-campo-auto="codigo">
        </label>
        <label>Diagnostico
          <input value="${escaparHTML(dx.nombre || "")}" data-dx-auto="${index}" data-campo-auto="nombre">
        </label>
        <label>Motivo de sugerencia
          <textarea data-dx-auto="${index}" data-campo-auto="razon">${escaparHTML(dx.razon || "")}</textarea>
        </label>
        <div class="diagnostico-automatico-acciones">
          <button type="button" class="boton-secundario" data-aceptar-dx-auto="${index}">Aceptar</button>
          <button type="button" class="boton-secundario boton-peligro-suave" data-eliminar-dx-auto="${index}">Eliminar</button>
        </div>
      </article>
    `).join("")
    : "<p>No se generaron diagnosticos CIE-10 sugeridos con las reglas actuales.</p>";

  contenedor.querySelectorAll("[data-dx-auto]").forEach((campo) => {
    campo.addEventListener("input", () => {
      const index = Number(campo.dataset.dxAuto);
      const nombreCampo = campo.dataset.campoAuto;
      if (!diagnosticosAutomaticosSugeridos.diagnosticos?.[index]) return;
      diagnosticosAutomaticosSugeridos.diagnosticos[index][nombreCampo] = campo.value;
      const dx = diagnosticosAutomaticosSugeridos.diagnosticos[index];
      dx.texto = `${dx.codigo || ""}${dx.codigo && dx.nombre ? " - " : ""}${dx.nombre || ""}`.trim();
    });
  });

  contenedor.querySelectorAll("[data-aceptar-dx-auto]").forEach((boton) => {
    boton.addEventListener("click", () => aceptarDiagnosticoAutomatico(Number(boton.dataset.aceptarDxAuto)));
  });

  contenedor.querySelectorAll("[data-eliminar-dx-auto]").forEach((boton) => {
    boton.addEventListener("click", () => {
      diagnosticosAutomaticosSugeridos.diagnosticos.splice(Number(boton.dataset.eliminarDxAuto), 1);
      renderizarDiagnosticosAutomaticos();
    });
  });
}

function aceptarDiagnosticoAutomatico(index) {
  const dx = diagnosticosAutomaticosSugeridos.diagnosticos?.[index];
  if (!dx) return;

  const yaExiste = diagnosticosSeleccionados.some((item) =>
    item.codigo === dx.codigo && (item.catalogo || "CIE-10") === "CIE-10"
  );

  if (!yaExiste) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
    diagnosticosSeleccionados.push(normalizarDiagnosticoNota({
      codigo: dx.codigo || "",
      nombre: dx.nombre || "",
      catalogo: "CIE-10",
      texto: dx.texto || `${dx.codigo || ""}${dx.codigo && dx.nombre ? " - " : ""}${dx.nombre || ""}`.trim(),
      estado: dx.estado || "Probable",
      sugerido: true,
      certeza: dx.certeza || "sugerido",
      razon: dx.razon || "",
      fechaSeleccion: new Date().toISOString()
    }, diagnosticosSeleccionados.length));
  }

  diagnosticosAutomaticosSugeridos.diagnosticos.splice(index, 1);
  renderizarDiagnosticosSeleccionados();
  renderizarDiagnosticosAutomaticos();
}

function aceptarTodosDiagnosticosAutomaticos() {
  const total = diagnosticosAutomaticosSugeridos.diagnosticos?.length || 0;
  for (let i = total - 1; i >= 0; i -= 1) aceptarDiagnosticoAutomatico(i);
}

function obtenerIdentificacionPaciente() {
  const institucional = pacienteActualDatos?.datosInstitucionales || {};
  const historia = historiaClinicaActual || {};
  const fechaNacimiento =
    pacienteActualDatos?.fechaNacimiento ||
    institucional.fechaNacimiento ||
    pacienteActualDatos?.fecha_nacimiento ||
    pacienteActualDatos?.fechaDeNacimiento ||
    pacienteActualDatos?.fechaNac ||
    pacienteActualDatos?.nacimiento ||
    "";
  const edadCalculada = calcularEdadDesdeFecha(fechaNacimiento);

  return {
    nombreCompleto: pacienteActualDatos?.nombreCompleto || pacienteActualDatos?.nombre || institucional.nombrePaciente || "",
    sexo: pacienteActualDatos?.sexo || institucional.sexo || historia.sexo || "",
    fechaNacimiento,
    edad: edadCalculada ? Number(edadCalculada) : null,
    escolaridad: pacienteActualDatos?.escolaridad || historia.escolaridad || institucional.escolaridad || "",
    estadoCivil: pacienteActualDatos?.estadoCivil || historia.estadoCivil || institucional.estadoCivil || "",
    ocupacion: pacienteActualDatos?.ocupacion || historia.ocupacion || institucional.ocupacion || "",
    religion: pacienteActualDatos?.religion || historia.religion || institucional.religion || "",
    medicoTratante: pacienteActualDatos?.medicoTratante || institucional.medicoTratante || historia.medicoTratante || ""
  };
}

function aplicarNotaAutomatica() {
  const texto = document.getElementById("textoDictadoClinico")?.value.trim() || "";
  if (!texto) {
    alert("Primero dicta o escribe texto en el area de dictado clinico.");
    return;
  }

  const confirmado = confirm("La nota automatica es solo una sugerencia por reglas locales. Revise y corrija todo antes de guardar.");
  if (!confirmado) return;

  const generada = generarNotaAutomatica(texto, obtenerIdentificacionPaciente());
  anexarTextoGenerado("subjetivo", generada.padecimientoActual, "Padecimiento actual sugerido");
  anexarTextoGenerado("objetivo", generada.exploracionMental, "Exploracion mental sugerida");
  anexarTextoGenerado("plan", generada.planSugerido, "Plan terapeutico sugerido");

  const riesgos = textoRiesgosAutomaticos(generada.riesgosDetectados);
  const analisisAutomatico = [
    `Comentario clinico:\n${generada.comentarioClinico || ""}`,
    `Impresion diagnostica sugerida:\n${generada.impresionDiagnostica || ""}`,
    riesgos ? `Riesgo sugerido:\n${riesgos}` : ""
  ].filter((bloque) => bloque.trim()).join("\n\n");
  anexarTextoGenerado("analisis", analisisAutomatico, "Analisis automatico sugerido");

  diagnosticosAutomaticosSugeridos = {
    diagnosticos: generada.cie10Sugeridos || [],
    riesgos: generada.riesgosDetectados || []
  };
  renderizarDiagnosticosAutomaticos();
}

function renderizarDiagnosticosSeleccionados() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  sincronizarDiagnosticosObservacion();

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML = `
      <p style="color:#999;">No hay diagnósticos seleccionados</p>
    `;
    return;
  }

  ["CIE-10", "CIE-11"].forEach((catalogo) => {
    const diagnosticos = diagnosticosSeleccionados
      .map((dx, index) => ({ ...dx, index }))
      .filter((dx) => (dx.catalogo || "CIE-10") === catalogo);

    if (diagnosticos.length === 0) return;

    contenedor.innerHTML += `<h4 class="diagnostico-catalogo-titulo">${catalogo}</h4>`;

    diagnosticos.forEach((dx) => {
      contenedor.innerHTML += `
        <div class="diagnostico-item">
          <span>${dx.texto}</span>

          <button type="button" onclick="eliminarDiagnostico(${dx.index})">
            Eliminar diagnóstico
          </button>
        </div>
      `;
    });
  });
}

function renderizarDiagnosticosSeleccionadosEditable() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);

  contenedor.innerHTML = `
    <div class="diagnostico-manual-nota">
      <div>
        <strong>Diagnostico manual</strong>
        <small>Agrega un diagnostico sin buscarlo en catalogo, o usa esta area para un especificador clinico.</small>
      </div>
      <button type="button" class="boton-secundario" onclick="agregarDiagnosticoManualNota()">
        Agregar diagnostico manual
      </button>
    </div>
  `;
  sincronizarDiagnosticosObservacion();

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML += `<p style="color:#999;">No hay diagnosticos seleccionados</p>`;
    return;
  }

  contenedor.innerHTML += `
    <div class="diagnosticos-editables-tabla">
      <div class="diagnosticos-editables-head">
        <span>Codigo</span>
        <span>Diagnostico</span>
        <span>Estado</span>
        <span>Catalogo</span>
        <span>Orden</span>
        <span>Catalogo local</span>
        <span></span>
      </div>
      ${diagnosticosSeleccionados.map((dx, index) => `
        <div class="diagnosticos-editables-row">
          <input
            value="${escaparHTML(dx.codigo || "")}"
            data-dx-index="${index}"
            data-dx-campo="codigo"
            oninput="actualizarDiagnosticoSeleccionado(this)"
            placeholder="Codigo"
          >
          <input
            value="${escaparHTML(dx.nombre || dx.texto || "")}"
            data-dx-index="${index}"
            data-dx-campo="nombre"
            oninput="actualizarDiagnosticoSeleccionado(this)"
            placeholder="Nombre del diagnostico"
          >
          <select data-dx-index="${index}" data-dx-campo="estado" onchange="actualizarDiagnosticoSeleccionado(this)">
            ${opcionesEstadoDiagnosticoNota(dx.estado)}
          </select>
          <select data-dx-index="${index}" data-dx-campo="catalogo" onchange="actualizarDiagnosticoSeleccionado(this)">
            <option value="CIE-10" ${(dx.catalogo || "CIE-10") === "CIE-10" ? "selected" : ""}>CIE-10</option>
            <option value="CIE-11" ${(dx.catalogo || "CIE-10") === "CIE-11" ? "selected" : ""}>CIE-11</option>
            <option value="Manual" ${(dx.catalogo || "CIE-10") === "Manual" ? "selected" : ""}>Manual</option>
          </select>
          <div class="diagnostico-orden-nota">
            <button type="button" onclick="moverDiagnosticoSeleccionado(${index}, -1)" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" onclick="moverDiagnosticoSeleccionado(${index}, 1)" ${index === diagnosticosSeleccionados.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <button type="button" class="boton-catalogo-manual" onclick="incluirDiagnosticoManualEnCatalogo(${index})">
            Incluir
          </button>
          <button type="button" onclick="eliminarDiagnostico(${index})">
            Eliminar
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

renderizarDiagnosticosSeleccionados = renderizarDiagnosticosSeleccionadosEditable;

document.getElementById("btnGenerarNotaAutomatica")?.addEventListener("click", aplicarNotaAutomatica);
document.getElementById("btnAceptarTodosDxAutomaticos")?.addEventListener("click", aceptarTodosDiagnosticosAutomaticos);

window.actualizarDiagnosticoSeleccionado = function(campo) {
  const index = Number(campo.dataset.dxIndex);
  const nombreCampo = campo.dataset.dxCampo;

  if (!Number.isInteger(index) || !nombreCampo || !diagnosticosSeleccionados[index]) return;

  diagnosticosSeleccionados[index] = {
    ...diagnosticosSeleccionados[index],
    [nombreCampo]: campo.value,
    editadoManual: true,
    fechaEdicionManual: new Date().toISOString()
  };

  if (nombreCampo === "codigo" || nombreCampo === "nombre") {
    const dx = diagnosticosSeleccionados[index];
    diagnosticosSeleccionados[index].texto = `${dx.codigo || ""}${dx.codigo && dx.nombre ? " - " : ""}${dx.nombre || ""}`.trim();
  }

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  sincronizarDiagnosticosObservacion();
};

window.agregarDiagnosticoManualNota = function() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  diagnosticosSeleccionados.push(normalizarDiagnosticoNota({
    codigo: "",
    nombre: "Diagnostico manual",
    catalogo: "Manual",
    texto: "Diagnostico manual",
    manual: true,
    fechaSeleccion: new Date().toISOString()
  }, diagnosticosSeleccionados.length));

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  renderizarDiagnosticosSeleccionados();
};

window.moverDiagnosticoSeleccionado = function(index, direccion) {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  const destino = index + direccion;

  if (!diagnosticosSeleccionados[index] || destino < 0 || destino >= diagnosticosSeleccionados.length) return;

  [diagnosticosSeleccionados[index], diagnosticosSeleccionados[destino]] = [diagnosticosSeleccionados[destino], diagnosticosSeleccionados[index]];
  diagnosticosSeleccionados = diagnosticosSeleccionados.map((dx, orden) => ({ ...dx, orden }));
  renderizarDiagnosticosSeleccionados();
};
window.incluirDiagnosticoManualEnCatalogo = function(index) {
  const dx = diagnosticosSeleccionados[index];
  if (!dx) return;

  const catalogo = dx.catalogo || "Manual";
  const codigo = (dx.codigo || "").trim();
  const nombre = (dx.nombre || dx.texto || "").trim();

  if (!codigo || !nombre) {
    alert("Escribe codigo y nombre antes de incluir el diagnostico en un catalogo.");
    return;
  }

  if (!["CIE-10", "CIE-11"].includes(catalogo)) {
    alert("Elige CIE-10 o CIE-11 en la columna Catalogo antes de incluirlo.");
    return;
  }

  const existeEnBase = catalogoDiagnosticosCombinado().some((item) =>
    item.codigo.toLowerCase() === codigo.toLowerCase() &&
    (item.catalogo || "CIE-10") === catalogo
  );

  if (existeEnBase) {
    alert("Ese codigo ya existe en el catalogo seleccionado.");
    return;
  }

  catalogoManualDiagnosticos.push({
    codigo,
    nombre,
    catalogo,
    texto: `${codigo} - ${nombre}`,
    agregadoManual: true,
    fechaAgregado: new Date().toISOString()
  });
  guardarCatalogoManualDiagnosticos();

  diagnosticosSeleccionados[index] = {
    ...dx,
    codigo,
    nombre,
    catalogo,
    texto: `${codigo} - ${nombre}`,
    incluidoEnCatalogo: true
  };

  alert(`Diagnostico incluido en ${catalogo}.`);
  renderizarDiagnosticosSeleccionados();
};

window.eliminarDiagnostico = function(index) {
  const confirmar = confirm("¿Eliminar diagnóstico?");

  if (!confirmar) return;

  diagnosticosSeleccionados.splice(index, 1);

  renderizarDiagnosticosSeleccionados();
};

function diagnosticoActual() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  if (diagnosticosSeleccionados.length === 0) return null;

  return diagnosticosSeleccionados[0];
}

function textoDiagnosticos() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  if (diagnosticosSeleccionados.length === 0) return "";

  return diagnosticosSeleccionados
    .map(textoDiagnosticoConEstado)
    .join("\n");
}

function calcularEdadDesdeFecha(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? String(edad) : "";
}

function normalizarFechaIngresoNota(valor = "") {
  if (!valor) return "";
  if (typeof valor.toDate === "function") {
    const fecha = valor.toDate();
    return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(0, 16);
  }
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? "" : valor.toISOString().slice(0, 16);
  }

  const limpio = String(valor).trim();

  if (!limpio) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return `${limpio}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(limpio)) return limpio.slice(0, 16);

  const partes = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (partes) {
    const [, dia, mes, anio, hora = "00", minuto = "00"] = partes;
    return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`;
  }

  return limpio;
}

function parsearFechaIngresoNota(valor = "") {
  const normalizada = normalizarFechaIngresoNota(valor);
  if (!normalizada) return null;

  const fecha = normalizada.includes("T")
    ? new Date(normalizada)
    : new Date(`${normalizada}T00:00`);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function calcularEstanciaDesdeIngresoNota(fechaIngreso = "") {
  const ingreso = parsearFechaIngresoNota(fechaIngreso);
  if (!ingreso) return "";

  const diferencia = Date.now() - ingreso.getTime();
  if (diferencia < 0) return "";

  const horasTotales = Math.floor(diferencia / (1000 * 60 * 60));
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;

  if (dias > 0 && horas > 0) return `${dias} d ${horas} h`;
  if (dias > 0) return `${dias} d`;
  return `${horas} h`;
}

const tipoNota = document.getElementById("tipoNota");
const bloqueNotaRapida = document.getElementById("bloqueNotaRapida");
const bloqueNotaCompleta = document.getElementById("bloqueNotaCompleta");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const formatoNota = document.getElementById("formatoNota");
const bloqueObservacionFray = document.getElementById("bloqueObservacionFray");
const btnSincronizarDxObs = document.getElementById("btnSincronizarDxObs");

const camposObservacionFray = {
  tipoNota: "obsTipoNota",
  fechaNota: "obsFechaNota",
  horaNota: "obsHoraNota",
  presionArterial: "obsPresionArterial",
  temperatura: "obsTemperatura",
  frecuenciaCardiaca: "obsFrecuenciaCardiaca",
  frecuenciaRespiratoria: "obsFrecuenciaRespiratoria",
  saturacionO2: "obsSaturacionO2",
  peso: "obsPeso",
  talla: "obsTalla",
  imc: "obsIMC",
  exploracionFisicaNeurologica: "obsExploracionFisicaNeurologica",
  resultadosEstudios: "obsResultadosEstudios",
  pronostico: "obsPronostico",
  destino: "obsDestino",
  firma1Nombre: "obsFirma1Nombre",
  firma1Cargo: "obsFirma1Cargo",
  firma1Cedula: "obsFirma1Cedula",
  firma2Nombre: "obsFirma2Nombre",
  firma2Cargo: "obsFirma2Cargo",
  firma2Cedula: "obsFirma2Cedula",
  firma3Nombre: "obsFirma3Nombre",
  firma3Cargo: "obsFirma3Cargo",
  firma3Cedula: "obsFirma3Cedula"
};

function sincronizarTipoNota() {
  const esRapida = tipoNota?.value === "rapida";
  bloqueNotaRapida?.classList.toggle("oculto", !esRapida);
  bloqueNotaCompleta?.classList.toggle("oculto", esRapida);
}

tipoNota?.addEventListener("change", sincronizarTipoNota);
sincronizarTipoNota();

function valorCampo(id) {
  return document.getElementById(id)?.value || "";
}

function asignarValor(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function referenciaCatalogoMedicosFirmas() {
  if (!uidMedicoActual) return null;
  return collection(db, "usuarios", uidMedicoActual, "catalogoMedicosFirmas");
}

function renderizarCatalogoMedicosFirmas() {
  const datalist = document.getElementById("catalogoMedicosFirmas");
  if (!datalist) return;

  datalist.innerHTML = catalogoMedicosFirmasCache
    .map((medico) => {
      const detalle = [medico.cargo, medico.cedula ? `Ced. ${medico.cedula}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<option value="${escaparHTML(medico.nombre || "")}" label="${escaparHTML(detalle)}"></option>`;
    })
    .join("");
}

async function cargarCatalogoMedicosFirmas() {
  const ref = referenciaCatalogoMedicosFirmas();
  if (!ref) return;

  const qCatalogo = query(ref, orderBy("nombre"));
  const snap = await getDocs(qCatalogo);
  catalogoMedicosFirmasCache = snap.docs.map((docMedico) => ({
    id: docMedico.id,
    ...docMedico.data()
  }));

  renderizarCatalogoMedicosFirmas();
}

function buscarMedicoFirmaPorNombre(nombre) {
  const clave = normalizarTextoBusqueda(nombre);
  if (!clave) return null;
  return catalogoMedicosFirmasCache.find((medico) => normalizarTextoBusqueda(medico.nombre) === clave) || null;
}

function aplicarMedicoFirma(numeroFirma, medico) {
  if (!medico) return;
  asignarValor(`obsFirma${numeroFirma}Nombre`, medico.nombre || "");
  asignarValor(`obsFirma${numeroFirma}Cargo`, medico.cargo || "");
  asignarValor(`obsFirma${numeroFirma}Cedula`, medico.cedula || "");
}

function configurarCatalogoMedicosFirmas() {
  document.querySelectorAll("[data-firma-nombre]").forEach((campo) => {
    campo.addEventListener("change", () => {
      const numeroFirma = campo.dataset.firmaNombre;
      const medico = buscarMedicoFirmaPorNombre(campo.value);
      if (medico) aplicarMedicoFirma(numeroFirma, medico);
    });
  });

  document.querySelectorAll("[data-guardar-medico-firma]").forEach((boton) => {
    boton.addEventListener("click", () => guardarMedicoFirmaDesdeCampo(boton.dataset.guardarMedicoFirma));
  });
}

async function guardarMedicoFirmaDesdeCampo(numeroFirma) {
  const nombre = valorCampo(`obsFirma${numeroFirma}Nombre`).trim();
  const cargo = valorCampo(`obsFirma${numeroFirma}Cargo`).trim();
  const cedula = valorCampo(`obsFirma${numeroFirma}Cedula`).trim();
  const ref = referenciaCatalogoMedicosFirmas();

  if (!ref) {
    alert("No se pudo identificar al medico para guardar el catalogo.");
    return;
  }

  if (!nombre) {
    alert("Escribe el nombre del medico antes de agregarlo al catalogo.");
    return;
  }

  const existente = buscarMedicoFirmaPorNombre(nombre);
  const payload = {
    nombre,
    cargo,
    cedula,
    actualizadoEn: serverTimestamp()
  };

  if (existente?.id) {
    const confirmar = confirm("Este medico ya existe en el catalogo. ¿Deseas actualizar cargo y cedula?");
    if (!confirmar) return;
    await updateDoc(doc(db, "usuarios", uidMedicoActual, "catalogoMedicosFirmas", existente.id), payload);
  } else {
    await addDoc(ref, {
      ...payload,
      creadoEn: serverTimestamp()
    });
  }

  await cargarCatalogoMedicosFirmas();
  alert("Medico agregado al catalogo de firmas.");
}

function numeroClinico(valor) {
  const limpio = String(valor || "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

function calcularIMCNota() {
  const peso = numeroClinico(valorCampo("obsPeso"));
  const talla = numeroClinico(valorCampo("obsTalla"));
  const campoIMC = document.getElementById("obsIMC");

  if (!campoIMC) return "";

  if (!peso || !talla || talla <= 0) {
    campoIMC.value = "";
    return "";
  }

  const imc = peso / (talla * talla);
  const imcTexto = imc.toFixed(2);
  campoIMC.value = imcTexto;
  return imcTexto;
}

["obsPeso", "obsTalla"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", calcularIMCNota);
});


function puedeUsarFormatoNota(valor = formatoNota?.value || "") {
  return usuarioPuedeUsarFormato(valor, permisosFormatosActual, rolUsuarioActual);
}

function aplicarPermisosFormatoNota() {
  aplicarPermisosFormatosSelect(formatoNota, permisosFormatosActual, {
    rol: rolUsuarioActual,
    fallback: "cognicion",
    fallbackLabel: "PDF Cognicion"
  });
}
function esFormatoFray() {
  return formatoNota?.value?.startsWith("fray_observacion") || false;
}

function sincronizarFormatoNota() {
  aplicarPermisosFormatoNota();
  if (formatoNota && !puedeUsarFormatoNota(formatoNota.value)) {
    formatoNota.value = "cognicion";
  }
  bloqueObservacionFray?.classList.remove("oculto");

  if (formatoNota?.value?.startsWith("fray_observacion")) {
    const tipoInstitucional = formatoNota.value.includes("envio_piso")
      ? "envio_piso"
      : formatoNota.value.includes("evolucion")
        ? "evolucion"
        : "ingreso";
    asignarValor("obsTipoNota", tipoInstitucional);

    if (tipoInstitucional === "envio_piso" && !valorCampo("obsDestino")) {
      asignarValor("obsDestino", "Se envia a piso de hospitalizacion continua");
    }
  }

  if (!valorCampo("obsFechaNota")) asignarValor("obsFechaNota", new Date().toISOString().slice(0, 10));
  if (!valorCampo("obsHoraNota")) {
    const ahora = new Date();
    asignarValor("obsHoraNota", `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`);
  }
  sincronizarDiagnosticosObservacion();
}

formatoNota?.addEventListener("change", sincronizarFormatoNota);
btnSincronizarDxObs?.addEventListener("click", sincronizarDiagnosticosObservacion);

function diagnosticosCIE10Observacion() {
  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  return diagnosticosSeleccionados
    .filter((dx) => (dx.catalogo || "CIE-10") === "CIE-10")
    .map((dx) => ({
      codigo: dx.codigo || "",
      diagnostico: `${dx.nombre || dx.texto || ""}${dx.estado ? ` — ${dx.estado}` : ""}`.trim(),
      texto: textoDiagnosticoConEstado(dx)
    }));
}

function sincronizarDiagnosticosObservacion() {
  const contenedor = document.getElementById("obsDiagnosticosLista");
  if (!contenedor) return;

  const diagnosticos = diagnosticosCIE10Observacion();

  if (diagnosticos.length === 0) {
    contenedor.innerHTML = "<p>Sin diagnosticos CIE-10 sincronizados.</p>";
    return;
  }

  contenedor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Codigo</th>
          <th>Diagnostico</th>
        </tr>
      </thead>
      <tbody>
        ${diagnosticos.map((dx) => `
          <tr>
            <td>${escaparHTML(dx.codigo)}</td>
            <td>${escaparHTML(dx.diagnostico)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function leerFormularioObservacionFray() {
  calcularIMCNota();
  const datos = Object.entries(camposObservacionFray).reduce((salida, [clave, id]) => {
    salida[clave] = valorCampo(id);
    return salida;
  }, {});
  const administrativos = datosInstitucionalesPaciente(pacienteActualDatos || {});

  return {
    nombrePaciente: administrativos.nombrePaciente,
    servicio: administrativos.servicioInstitucional || "Observacion",
    cama: administrativos.cama,
    expediente: administrativos.expediente,
    fechaNacimiento: administrativos.fechaNacimiento,
    edad: administrativos.edad,
    sexo: administrativos.sexo,
    genero: administrativos.genero,
    alergias: administrativos.alergias,
    diasEstancia: administrativos.diasEstancia || "",
    ...datos,
    motivoAtencion: valorCampo("subjetivo"),
    examenMental: valorCampo("objetivo"),
    planTerapeutico: valorCampo("plan"),
    comentarioAnalisis: valorCampo("analisis"),
    diagnosticosCIE10: diagnosticosCIE10Observacion(),
    preparadoParaWord: true,
    plantillaSugerida: datos.tipoNota === "envio_piso"
      ? "fray_observacion_envio_piso"
      : datos.tipoNota === "evolucion"
        ? "fray_observacion_evolucion"
        : "fray_observacion_ingreso"
  };
}

function llenarFormularioObservacionFray(datos = {}) {
  const datosCompatibles = {
    ...datos,
    firma1Nombre: datos.firma1Nombre || datos.medicoAdscrito || "",
    firma1Cargo: datos.firma1Cargo || (datos.medicoAdscrito ? "Medico adscrito" : ""),
    firma1Cedula: datos.firma1Cedula || datos.cedulaAdscrito || "",
    firma2Nombre: datos.firma2Nombre || datos.medicoR3 || "",
    firma2Cargo: datos.firma2Cargo || (datos.medicoR3 ? "Medico residente de 3er ano" : ""),
    firma2Cedula: datos.firma2Cedula || datos.cedulaR3 || "",
    firma3Nombre: datos.firma3Nombre || datos.medicoR2 || "",
    firma3Cargo: datos.firma3Cargo || (datos.medicoR2 ? "Medico residente de 2o ano" : ""),
    firma3Cedula: datos.firma3Cedula || datos.cedulaR2 || ""
  };

  Object.entries(camposObservacionFray).forEach(([clave, id]) => {
    asignarValor(id, datosCompatibles[clave] || "");
  });
  calcularIMCNota();
  sincronizarDiagnosticosObservacion();
}

function datosInstitucionalesPaciente(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  const fray = paciente.frayObservacion || {};
  const fechaNacimiento =
    paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    "";
  const fechaIngreso =
    paciente.fechaIngreso ||
    institucional.fechaIngreso ||
    paciente.fecha_ingreso ||
    paciente.ingreso ||
    "";
  const diasEstancia =
    paciente.diasEstancia ||
    institucional.diasEstancia ||
    calcularEstanciaDesdeIngresoNota(fechaIngreso);

  return {
    nombrePaciente: paciente.nombre || institucional.nombrePaciente || "",
    tipoPaciente: paciente.tipoPaciente || institucional.tipoPaciente || "privada",
    institucionPaciente: paciente.institucionPaciente || paciente.institucion || institucional.institucionPaciente || "",
    servicioInstitucional: paciente.servicioInstitucional || paciente.servicio || institucional.servicioInstitucional || "",
    cama: paciente.cama || institucional.cama || "",
    expediente: paciente.expediente || paciente.numeroExpediente || institucional.expediente || "",
    fechaNacimiento,
    edad: calcularEdadDesdeFecha(fechaNacimiento) || "",
    sexo: paciente.sexo || institucional.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || institucional.genero || "",
    alergias: paciente.alergias || institucional.alergias || "",
    fechaIngreso,
    diasEstancia,
    firma1Nombre: fray.firma1Nombre || fray.medicoAdscrito || paciente.medicoTratante || "",
    firma1Cargo: fray.firma1Cargo || (fray.medicoAdscrito || paciente.medicoTratante ? "Medico adscrito" : ""),
    firma1Cedula: fray.firma1Cedula || fray.cedulaAdscrito || "",
    firma2Nombre: fray.firma2Nombre || fray.medicoR3 || "",
    firma2Cargo: fray.firma2Cargo || (fray.medicoR3 ? "Medico residente de 3er ano" : ""),
    firma2Cedula: fray.firma2Cedula || fray.cedulaR3 || "",
    firma3Nombre: fray.firma3Nombre || fray.medicoR2 || "",
    firma3Cargo: fray.firma3Cargo || (fray.medicoR2 ? "Medico residente de 2o ano" : ""),
    firma3Cedula: fray.firma3Cedula || fray.cedulaR2 || ""
  };
}

function aplicarDatosInstitucionalesPaciente(paciente = {}) {
  const datos = datosInstitucionalesPaciente(paciente);

  if (!valorCampo("obsPeso")) asignarValor("obsPeso", paciente.peso || paciente.signosVitales?.peso || paciente.datosInstitucionales?.peso || "");
  if (!valorCampo("obsTalla")) asignarValor("obsTalla", paciente.talla || paciente.signosVitales?.talla || paciente.datosInstitucionales?.talla || "");
  calcularIMCNota();
  if (!valorCampo("obsFirma1Nombre")) asignarValor("obsFirma1Nombre", datos.firma1Nombre);
  if (!valorCampo("obsFirma1Cargo")) asignarValor("obsFirma1Cargo", datos.firma1Cargo);
  if (!valorCampo("obsFirma1Cedula")) asignarValor("obsFirma1Cedula", datos.firma1Cedula);
  if (!valorCampo("obsFirma2Nombre")) asignarValor("obsFirma2Nombre", datos.firma2Nombre);
  if (!valorCampo("obsFirma2Cargo")) asignarValor("obsFirma2Cargo", datos.firma2Cargo);
  if (!valorCampo("obsFirma2Cedula")) asignarValor("obsFirma2Cedula", datos.firma2Cedula);
  if (!valorCampo("obsFirma3Nombre")) asignarValor("obsFirma3Nombre", datos.firma3Nombre);
  if (!valorCampo("obsFirma3Cargo")) asignarValor("obsFirma3Cargo", datos.firma3Cargo);
  if (!valorCampo("obsFirma3Cedula")) asignarValor("obsFirma3Cedula", datos.firma3Cedula);
}

function aplicarHistoriaClinicaObservacion(historia = {}) {
  if (!valorCampo("subjetivo")) asignarValor("subjetivo", historia.padecimientoActual || "");
  if (!valorCampo("objetivo")) {
    const examenMental = [
      historia.apariencia ? `Apariencia y conducta: ${historia.apariencia}` : "",
      historia.lenguaje ? `Lenguaje: ${historia.lenguaje}` : "",
      historia.afecto ? `Estado de animo y afecto: ${historia.afecto}` : "",
      historia.pensamiento ? `Pensamiento: ${historia.pensamiento}` : "",
      historia.sensopercepcion ? `Sensopercepcion: ${historia.sensopercepcion}` : "",
      historia.cognicion ? `Funciones cognitivas: ${historia.cognicion}` : "",
      historia.juicio ? `Juicio e insight: ${historia.juicio}` : ""
    ].filter(Boolean).join("\n");
    asignarValor("objetivo", examenMental);
  }
  if (!valorCampo("plan")) {
    asignarValor("plan", [
      historia.tratamientoFarmacologico,
      historia.psicoterapia,
      historia.seguimiento
    ].filter(Boolean).join("\n"));
  }
  if (!valorCampo("analisis")) asignarValor("analisis", historia.diagnosticoClinico || "");
}

function datosPersistentesDesdeObservacion(observacion = {}) {
  return {
    frayObservacion: {
      firma1Nombre: observacion.firma1Nombre || "",
      firma1Cargo: observacion.firma1Cargo || "",
      firma1Cedula: observacion.firma1Cedula || "",
      firma2Nombre: observacion.firma2Nombre || "",
      firma2Cargo: observacion.firma2Cargo || "",
      firma2Cedula: observacion.firma2Cedula || "",
      firma3Nombre: observacion.firma3Nombre || "",
      firma3Cargo: observacion.firma3Cargo || "",
      firma3Cedula: observacion.firma3Cedula || ""
    }
  };
}

function leerFormularioNota() {
  const formato = formatoNota?.value || "cognicion";
  const observacionFray = esFormatoFray()
    ? leerFormularioObservacionFray()
    : leerFormularioObservacionFray();

  return {
    formatoNota: formato,
    formatoInstitucional: esFormatoFray() ? "fray_bernardino_observacion" : "",
    exportacionWord: {
      habilitada: esFormatoFray(),
      formato,
      plantillaSugerida: observacionFray.plantillaSugerida || "",
      fuenteDatos: "observacionFray"
    },
    observacionFray,
    tipoNota: tipoNota?.value || "completa",
    notaRapida: document.getElementById("notaRapida")?.value || "",
    subjetivo: document.getElementById("subjetivo").value,
    objetivo: document.getElementById("objetivo").value,
    analisis: document.getElementById("analisis").value,
    plan: document.getElementById("plan").value
  };
}

function llenarFormularioNota(datos) {
  if (formatoNota) formatoNota.value = datos.formatoNota || "cognicion";
  if (tipoNota) tipoNota.value = datos.tipoNota || (datos.notaRapida ? "rapida" : "completa");
  document.getElementById("notaRapida").value = datos.notaRapida || "";
  document.getElementById("subjetivo").value = datos.subjetivo || "";
  document.getElementById("objetivo").value = datos.objetivo || "";
  document.getElementById("analisis").value = datos.analisis || "";
  document.getElementById("plan").value = datos.plan || "";
  llenarFormularioObservacionFray(datos.observacionFray || {});
  sincronizarTipoNota();
  sincronizarFormatoNota();
}

function limpiarFormularioNota() {
  notaEditandoId = null;
  escalasAplicadasPendientesNota = [];
  llenarFormularioNota({ tipoNota: "completa" });
  btnCancelarEdicion?.classList.add("oculto");
}

window.cancelarEdicionNota = function() {
  limpiarFormularioNota();
};

function referenciaApuntesMedico() {
  if (!uidMedicoActual) return null;
  return collection(db, "usuarios", uidMedicoActual, "apuntesMedico");
}

async function migrarBorradorLegacySiExiste() {
  if (!uidMedicoActual) return;

  const refLegacy = doc(db, "usuarios", uidMedicoActual, "borradoresMedico", "notasGenerales");
  const snapLegacy = await getDoc(refLegacy);

  if (!snapLegacy.exists() || !snapLegacy.data().contenido) return;

  const refApuntes = referenciaApuntesMedico();
  if (!refApuntes) return;

  await addDoc(refApuntes, {
    titulo: "Borrador general",
    contenido: snapLegacy.data().contenido || "",
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    migradoDesdeBorrador: true
  });

  await deleteDoc(refLegacy);
}

async function cargarBorradoresMedico() {
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!ref) return;
  if (estado) estado.textContent = "Cargando...";

  await migrarBorradorLegacySiExiste();

  const qApuntes = query(ref, orderBy("fechaActualizacion", "desc"));
  const snap = await getDocs(qApuntes);

  apuntesMedicoCache = snap.docs.map((docApunte) => ({
    id: docApunte.id,
    ...docApunte.data()
  }));

  renderizarListaApuntes();

  if (apuntesMedicoCache.length > 0) {
    seleccionarApunteMedico(apuntesMedicoCache[0].id);
  } else {
    nuevoApunteMedico();
  }

  if (estado) estado.textContent = apuntesMedicoCache.length ? "Guardado" : "Sin apuntes";
}

window.abrirBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  fondo?.classList.remove("oculto");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  document.getElementById("buscadorApuntesMedico")?.focus();
};

window.cerrarBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!panel?.classList.contains("abierto")) {
      fondo?.classList.add("oculto");
    }
  }, 220);
};

async function cargarNotasFlotantesParaNota() {
  const contenedor = document.getElementById("listaNotasFlotantesNota");
  const uidPaciente = uidPacienteActual || document.getElementById("uidPaciente")?.value;

  if (!contenedor) return;

  if (!uidPaciente) {
    contenedor.textContent = "Selecciona un paciente para cargar sus notas flotantes.";
    notasFlotantesPacienteCache = [];
    renderizarNotasFlotantesCostado();
    return;
  }

  contenedor.textContent = "Cargando notas flotantes...";
  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));
  notasFlotantesPacienteCache = snap.docs.map((docNota) => ({
    id: docNota.id,
    ...docNota.data()
  }));

  renderizarNotasFlotantesEnNota();
  renderizarNotasFlotantesCostado();
}

function renderizarNotasFlotantesEnNota() {
  const contenedor = document.getElementById("listaNotasFlotantesNota");
  const activa = document.getElementById("notaFlotanteNotaId")?.value || "";
  if (!contenedor) return;

  if (!notasFlotantesPacienteCache.length) {
    contenedor.innerHTML = `<p class="apuntes-vacio">Este paciente no tiene notas flotantes.</p>`;
    return;
  }

  contenedor.innerHTML = notasFlotantesPacienteCache.map((nota) => {
    return `
      <details class="nota-flotante-nota ${nota.id === activa ? "activa" : ""}"${nota.contraida ? "" : " open"}>
        <summary>${escaparHTML(nota.titulo || "Nota flotante")}</summary>
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <div class="acciones-nota-flotante-nota">
          <button type="button" class="boton-secundario" onclick="seleccionarNotaFlotanteDesdeNota('${nota.id}')">
            Editar
          </button>
          <button type="button" class="boton-secundario" onclick="alternarNotaFlotanteDesdeNota('${nota.id}')">
            ${nota.contraida ? "Mostrar" : "Contraer"}
          </button>
        </div>
      </details>
    `;
  }).join("");
}

function renderizarNotasFlotantesCostado() {
  const costado = document.getElementById("notasFlotantesCostado");
  if (!costado) return;

  const visibles = notasFlotantesPacienteCache.filter((nota) => nota.texto || nota.titulo);

  if (!visibles.length) {
    costado.innerHTML = "";
    costado.classList.remove("con-notas");
    return;
  }

  costado.classList.add("con-notas");
  costado.innerHTML = visibles.map((nota) => `
    <article class="nota-flotante-costado ${nota.contraida ? "contraida" : "abierta"}">
      <button type="button" class="nota-flotante-costado-header" onclick="alternarNotaFlotanteDesdeNota('${nota.id}')">
        <span>${escaparHTML(nota.titulo || "Nota flotante")}</span>
        <small>${nota.contraida ? "Mostrar" : "Contraer"}</small>
      </button>
      <div class="nota-flotante-costado-cuerpo">
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <button type="button" class="boton-secundario" onclick="abrirNotasFlotantesPaciente(); seleccionarNotaFlotanteDesdeNota('${nota.id}')">
          Editar
        </button>
      </div>
    </article>
  `).join("");
}

window.alternarNotaFlotanteDesdeNota = async function(id) {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const nota = notasFlotantesPacienteCache.find((item) => item.id === id);

  if (!uidPaciente || !nota) return;

  const contraida = !nota.contraida;
  nota.contraida = contraida;

  await updateDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id), {
    contraida,
    fechaActualizacion: new Date().toISOString()
  });

  const idActivo = document.getElementById("notaFlotanteNotaId")?.value;
  if (idActivo === id) {
    const selector = document.getElementById("notaFlotanteNotaContraida");
    if (selector) selector.value = contraida ? "true" : "false";
  }

  renderizarNotasFlotantesEnNota();
  renderizarNotasFlotantesCostado();
};

function uidPacienteParaNotaFlotante() {
  return uidPacienteActual || document.getElementById("uidPaciente")?.value || "";
}

window.nuevaNotaFlotanteDesdeNota = function() {
  ["notaFlotanteNotaId", "notaFlotanteNotaTitulo", "notaFlotanteNotaTexto"].forEach((id) => {
    const campo = document.getElementById(id);
    if (campo) campo.value = "";
  });
  const contraida = document.getElementById("notaFlotanteNotaContraida");
  if (contraida) contraida.value = "false";
  const estado = document.getElementById("estadoNotasFlotantesNota");
  if (estado) estado.textContent = "Nueva nota";
  renderizarNotasFlotantesEnNota();
};

window.seleccionarNotaFlotanteDesdeNota = function(id) {
  const nota = notasFlotantesPacienteCache.find((item) => item.id === id);
  if (!nota) return;

  document.getElementById("notaFlotanteNotaId").value = nota.id;
  document.getElementById("notaFlotanteNotaTitulo").value = nota.titulo || "";
  document.getElementById("notaFlotanteNotaTexto").value = nota.texto || "";
  document.getElementById("notaFlotanteNotaContraida").value = nota.contraida ? "true" : "false";
  const estado = document.getElementById("estadoNotasFlotantesNota");
  if (estado) estado.textContent = "Editando";
  renderizarNotasFlotantesEnNota();
};

window.guardarNotaFlotanteDesdeNota = async function() {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const id = document.getElementById("notaFlotanteNotaId")?.value || "";
  const titulo = document.getElementById("notaFlotanteNotaTitulo")?.value.trim() || "Nota flotante";
  const texto = document.getElementById("notaFlotanteNotaTexto")?.value.trim() || "";
  const contraida = document.getElementById("notaFlotanteNotaContraida")?.value === "true";
  const estado = document.getElementById("estadoNotasFlotantesNota");

  if (!uidPaciente) {
    alert("Selecciona un paciente para guardar una nota flotante.");
    return;
  }

  if (!texto) {
    alert("Escribe el contenido de la nota flotante.");
    return;
  }

  if (estado) estado.textContent = "Guardando...";

  const payload = {
    titulo,
    texto,
    contraida,
    medicoUid: auth.currentUser?.uid || "",
    fechaActualizacion: new Date().toISOString()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id), payload);
  } else {
    const nueva = await addDoc(collection(db, "usuarios", uidPaciente, "notasFlotantes"), {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
    document.getElementById("notaFlotanteNotaId").value = nueva.id;
  }

  if (estado) estado.textContent = "Guardado";
  await cargarNotasFlotantesParaNota();
};

window.eliminarNotaFlotanteDesdeNota = async function() {
  const uidPaciente = uidPacienteParaNotaFlotante();
  const id = document.getElementById("notaFlotanteNotaId")?.value || "";

  if (!uidPaciente || !id) {
    alert("Selecciona una nota flotante para eliminar.");
    return;
  }

  if (!confirm("Eliminar esta nota flotante?")) return;

  await deleteDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id));
  window.nuevaNotaFlotanteDesdeNota();
  await cargarNotasFlotantesParaNota();
};

window.abrirNotasFlotantesPaciente = async function() {
  const fondo = document.getElementById("fondoNotasFlotantesPaciente");
  const panel = document.getElementById("panelNotasFlotantesPaciente");

  fondo?.classList.remove("oculto");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  await cargarNotasFlotantesParaNota();
};

window.cerrarNotasFlotantesPaciente = function() {
  const fondo = document.getElementById("fondoNotasFlotantesPaciente");
  const panel = document.getElementById("panelNotasFlotantesPaciente");

  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!panel?.classList.contains("abierto")) {
      fondo?.classList.add("oculto");
    }
  }, 220);
};

window.guardarBorradoresMedico = async function() {
  const texto = document.getElementById("borradoresMedicoTexto");
  const titulo = document.getElementById("apunteMedicoTitulo");
  const id = document.getElementById("apunteMedicoId")?.value;
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!texto || !ref) {
    alert("No se pudo identificar al medico para guardar el apunte.");
    return;
  }

  if (estado) estado.textContent = "Guardando...";

  const payload = {
    titulo: titulo?.value.trim() || "Sin titulo",
    contenido: texto.value,
    fechaActualizacion: new Date().toISOString(),
    fechaActualizacionServidor: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id), payload);
  } else {
    const nuevo = await addDoc(ref, {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
    document.getElementById("apunteMedicoId").value = nuevo.id;
  }

  if (estado) estado.textContent = "Guardado";
  await cargarBorradoresMedico();
};

window.nuevoApunteMedico = function() {
  document.getElementById("apunteMedicoId").value = "";
  document.getElementById("apunteMedicoTitulo").value = "";
  document.getElementById("borradoresMedicoTexto").value = "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Nuevo apunte";
  document.getElementById("apunteMedicoTitulo")?.focus();
};

window.seleccionarApunteMedico = function(id) {
  const apunte = apuntesMedicoCache.find((item) => item.id === id);
  if (!apunte) return;

  document.getElementById("apunteMedicoId").value = apunte.id;
  document.getElementById("apunteMedicoTitulo").value = apunte.titulo || "";
  document.getElementById("borradoresMedicoTexto").value = apunte.contenido || "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Guardado";
  renderizarListaApuntes();
};

window.eliminarApunteMedicoActual = async function() {
  const id = document.getElementById("apunteMedicoId")?.value;
  if (!id) {
    nuevoApunteMedico();
    return;
  }

  if (!confirm("Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id));
  await cargarBorradoresMedico();
};

function renderizarListaApuntes() {
  const lista = document.getElementById("listaApuntesMedico");
  const buscador = document.getElementById("buscadorApuntesMedico");
  const activo = document.getElementById("apunteMedicoId")?.value;
  if (!lista) return;

  const textoBusqueda = (buscador?.value || "").trim().toLowerCase();
  const filtrados = apuntesMedicoCache.filter((apunte) => {
    const titulo = (apunte.titulo || "").toLowerCase();
    const contenido = (apunte.contenido || "").toLowerCase();
    return !textoBusqueda || titulo.includes(textoBusqueda) || contenido.includes(textoBusqueda);
  });

  if (!filtrados.length) {
    lista.innerHTML = `<p class="apuntes-vacio">No se encontraron apuntes.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map((apunte) => `
    <button
      type="button"
      class="apunte-lista-item ${apunte.id === activo ? "activo" : ""}"
      onclick="seleccionarApunteMedico('${apunte.id}')"
    >
      <strong>${escaparHTML(apunte.titulo || "Sin titulo")}</strong>
      <span>${escaparHTML((apunte.contenido || "").slice(0, 90))}</span>
    </button>
  `).join("");
}

function bloqueContenidoNota(datos, titulo) {
  const esRapida = datos.tipoNota === "rapida" || datos.notaRapida;
  return `
    <div class="version-nota">
      <h4>${titulo}</h4>
      ${esRapida ? `<p><b>Nota rapida:</b><br>${escaparHTML(datos.notaRapida || "")}</p>` : `
        <p><b>Subjetivo:</b><br>${escaparHTML(datos.subjetivo || "")}</p>
        <p><b>Objetivo:</b><br>${escaparHTML(datos.objetivo || "")}</p>
        <p><b>Analisis:</b><br>${escaparHTML(datos.analisis || "")}</p>
        <p><b>Plan:</b><br>${escaparHTML(datos.plan || "")}</p>
      `}
    </div>
  `;
}

window.editarNotaDesdeHistorial = function(notaId) {
  const datos = notasHistorial[notaId];
  if (!datos) return;
  notaEditandoId = notaId;
  escalasAplicadasPendientesNota = [];
  llenarFormularioNota(datos.notaEditada || datos);
  btnCancelarEdicion?.classList.remove("oculto");
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

function cargarDatosNotaComoBorrador(notaId, opciones = {}) {
  const datosNota = notasHistorial[notaId];

  if (!datosNota) {
    alert("No se encontro la nota seleccionada.");
    return;
  }

  const datos = datosNota.notaEditada || datosNota;
  const formatoActual = formatoNota?.value || "cognicion";
  llenarFormularioNota({
    ...datos,
    formatoNota: opciones.mantenerFormatoActual
      ? formatoActual
      : datos.formatoNota || formatoActual
  });

  notaEditandoId = null;
  btnCancelarEdicion?.classList.add("oculto");
  sincronizarFormatoNota();
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

window.cargarNotaComoBorrador = function(notaId) {
  cargarDatosNotaComoBorrador(notaId);
  alert("Nota cargada como borrador. Al guardar se creara una nota nueva.");
};

window.cargarNotaPreviaEnFormulario = function() {
  const previa = notasHistorialOrdenadas.find((nota) => nota?.datos);

  if (!previa) {
    alert("No hay una nota previa para cargar.");
    return;
  }

  cargarDatosNotaComoBorrador(previa.id, { mantenerFormatoActual: true });
  alert("Datos de la nota previa cargados. Se guardara como una nota nueva.");
};

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function usuarioActualPuedeAccederPaciente(uidPaciente) {
  const usuarioAuth = auth.currentUser;
  if (!usuarioAuth || !uidPaciente) return false;

  const perfilUsuario = await obtenerUsuario(usuarioAuth.uid);
  if (perfilUsuario?.rol === "admin") return true;
  if (!["medico", "psicologo"].includes(perfilUsuario?.rol)) return false;

  return await medicoPuedeVer(usuarioAuth.uid, uidPaciente);
}
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || !["medico", "psicologo", "admin"].includes(usuario.rol)) {
  alert("Acceso restringido al personal clinico");
  window.location.href = "dashboard.html";
  return;
}

  uidMedicoActual = user.uid;
  rolUsuarioActual = usuario.rol || "";
  permisosFormatosActual = await obtenerPermisosFormatosUsuario(user.uid, usuario);
  aplicarPermisosFormatoNota();
  await cargarBorradoresMedico();
  await cargarCatalogoMedicosFirmas();
  configurarCatalogoMedicosFirmas();
  document.getElementById("borradoresMedicoTexto")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
  });
  document.getElementById("apunteMedicoTitulo")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
    renderizarListaApuntes();
  });
  document.getElementById("buscadorApuntesMedico")?.addEventListener("input", renderizarListaApuntes);

  const parametros = new URLSearchParams(window.location.search);
  uidPacienteActual = parametros.get("id");

  if (uidPacienteActual) {
    const bloqueSelector = document.getElementById("bloqueSelectorPaciente");

    if (bloqueSelector) {
      bloqueSelector.style.display = "none";
    }

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  } else {
    await cargarListaPacientes();
  }
});

async function cargarListaPacientes() {
  const selector = document.getElementById("uidPaciente");

  if (!selector) return;

  selector.innerHTML = '<option value="">Seleccionar paciente</option>';

  if (!uidMedicoActual) {
    const opcion = document.createElement("option");
    opcion.disabled = true;
    opcion.textContent = "No se pudo identificar al profesional";
    selector.appendChild(opcion);
    return;
  }

  try {
    const pacientes = await listarPacientes(uidMedicoActual);

    if (pacientes.empty || pacientes.size === 0) {
      const opcion = document.createElement("option");
      opcion.disabled = true;
      opcion.textContent = "No hay pacientes autorizados";
      selector.appendChild(opcion);
      return;
    }

    pacientes.forEach((paciente) => {
      const datos = paciente.data();
      const opcion = document.createElement("option");

      opcion.value = paciente.id;
      opcion.textContent = datos.nombre || datos.nombreCompleto || "Sin nombre";
      selector.appendChild(opcion);
    });
  } catch (error) {
    console.error("Error al cargar pacientes autorizados:", error);
    const opcion = document.createElement("option");
    opcion.disabled = true;
    opcion.textContent = "No se pudieron cargar pacientes";
    selector.appendChild(opcion);
  }

  selector.addEventListener("change", async () => {
    uidPacienteActual = selector.value;
    if (!uidPacienteActual) return;
    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  });
}

async function cargarPaciente(uidPaciente) {
  const tieneAcceso = await usuarioActualPuedeAccederPaciente(uidPaciente);

  if (!tieneAcceso) {
    alert("No tienes permiso para acceder a este paciente.");
    uidPacienteActual = null;
    window.location.href = "medico.html";
    return;
  }

  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) return;
  pacienteActualDatos = datos;

  try {
    const historiaSnap = await obtenerHistoriaClinica(uidPaciente);
    historiaClinicaActual = historiaSnap.exists() ? historiaSnap.data() : {};
  } catch (error) {
    console.warn("No se pudo cargar historia clinica para la nota:", error);
    historiaClinicaActual = {};
  }

  const tratamiento = document.getElementById("tratamiento");
  const medico = document.getElementById("medico");
  const ultimaConsulta = document.getElementById("ultimaConsulta");
  const proximaConsulta = document.getElementById("proximaConsulta");

  diagnosticosSeleccionados = [];

  if (Array.isArray(datos.historialDiagnosticos)) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota(datos.historialDiagnosticos);
  } else if (Array.isArray(datos.datosClinicosResumen?.historialDiagnosticos)) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota(datos.datosClinicosResumen.historialDiagnosticos);
  } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
    diagnosticosSeleccionados = normalizarDiagnosticosNota([datos.diagnostico]);
  } else if (typeof datos.diagnostico === "string" && datos.diagnostico.trim() !== "") {
    diagnosticosSeleccionados = normalizarDiagnosticosNota([
      {
        codigo: "",
        nombre: datos.diagnostico,
        texto: datos.diagnostico,
        fechaSeleccion: new Date().toISOString()
      }
    ]);
  }

  renderizarDiagnosticosSeleccionados();

  const dxActual = diagnosticoActual();

  if (buscadorDiagnostico) {
    buscadorDiagnostico.value = dxActual?.texto || "";
  }

  if (cie10Codigo) {
    cie10Codigo.value = dxActual?.codigo || "";
  }

  if (cie10Nombre) {
    cie10Nombre.value = dxActual?.nombre || "";
  }

  if (tratamiento) tratamiento.value = datos.tratamiento || datos.datosClinicosResumen?.tratamientoActivo || datos.datosClinicosResumen?.tratamientoHistoria || "";
  if (medico) medico.value = datos.medicoTratante || "";
  if (ultimaConsulta) ultimaConsulta.value = datos.ultimaConsulta || "";
  if (proximaConsulta) proximaConsulta.value = datos.proximaConsulta || "";
  if (diagnosticoCatalogoVisible) {
    diagnosticoCatalogoVisible.value = datos.diagnosticoCatalogoVisible || "auto";
  }

  aplicarDatosInstitucionalesPaciente(datos);
  aplicarHistoriaClinicaObservacion(historiaClinicaActual);
  cargarNotasFlotantesParaNota();

  const institucion = `${datos.institucionPaciente || datos.institucion || ""}`.toLowerCase();
  const esPacienteFray = datos.tipoPaciente === "institucion" && institucion.includes("fray");
  if (esPacienteFray && formatoNota?.value === "cognicion" && puedeUsarFormatoNota("fray_observacion_evolucion")) {
    formatoNota.value = "fray_observacion_evolucion";
  }

  sincronizarFormatoNota();
}

async function guardarNotaMedicaConEstado(estadoNota = "definitiva") {
  const selector = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selector?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const tieneAccesoPaciente = await usuarioActualPuedeAccederPaciente(uidPaciente);
  if (!tieneAccesoPaciente) {
    alert("No tienes permiso para guardar notas de este paciente.");
    return;
  }

  aplicarPermisosFormatoNota();
  if (formatoNota && !puedeUsarFormatoNota(formatoNota.value)) {
    alert("No tienes autorizacion para usar este formato institucional. Solicita acceso al administrador.");
    formatoNota.value = "cognicion";
    sincronizarFormatoNota();
    return;
  }

  const esBorrador = estadoNota === "borrador";

  diagnosticosSeleccionados = normalizarDiagnosticosNota(diagnosticosSeleccionados);
  const diagnostico = diagnosticoActual();

  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;
  const proximaConsulta = document.getElementById("proximaConsulta").value;

  const datosNotaClinica = leerFormularioNota();
  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  try {
    const datosPersistentesInstitucionales = esFormatoFray()
      ? datosPersistentesDesdeObservacion(datosNotaClinica.observacionFray)
      : {};

    await actualizarUsuario(uidPaciente, {
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      medicoTratante: medico,
      ultimaConsulta,
      proximaConsulta,
      ...datosPersistentesInstitucionales
    });

    const notaPayload = {
      autor: medico,
      estadoNota,
      esBorrador,
      fechaGuardadoBorrador: esBorrador ? new Date().toISOString() : "",
      fechaNotaDefinitiva: esBorrador ? "" : new Date().toISOString(),
      ...datosNotaClinica,
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      ultimaConsulta,
      proximaConsulta
    };

    let idNotaGuardada = notaEditandoId || "";

    if (notaEditandoId) {
      await actualizarNota(uidPaciente, notaEditandoId, {
        ...notaPayload,
        fechaEdicion: new Date().toISOString()
      });
    } else {
      idNotaGuardada = await guardarNota(uidPaciente, notaPayload);
      await vincularEscalasPendientesANota(uidPaciente, idNotaGuardada);
    }

    const usuario = auth.currentUser;
    const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
    const pacienteActual = await obtenerUsuario(uidPaciente);

    await registrarEventoAuditoria({
      accion: notaEditandoId
        ? (esBorrador ? "editar_borrador_nota_medica" : "editar_nota_medica_definitiva")
        : (esBorrador ? "crear_borrador_nota_medica" : "crear_nota_medica_definitiva"),
      modulo: "Nota medica",
      descripcion: notaEditandoId
        ? (esBorrador
          ? "El medico guardo cambios como borrador sin borrar la nota original."
          : "El medico guardo una nota definitiva sin borrar la nota original.")
        : (esBorrador
          ? "El medico guardo una nota medica como borrador."
          : "El medico creo una nota medica definitiva."),
      usuarioUid: usuario?.uid || "",
      usuarioNombre: medicoActual?.nombre || usuario?.email || medico || "",
      usuarioRol: medicoActual?.rol || "",
      pacienteUid: uidPaciente,
      pacienteNombre: pacienteActual?.nombre || "",
      exito: true,
      detalles: {
        notaId: idNotaGuardada || "",
        estadoNota,
        esBorrador,
        tipoNota: datosNotaClinica.tipoNota || "",
        formatoNota: datosNotaClinica.formatoNota || "cognicion",
        formatoInstitucional: datosNotaClinica.formatoInstitucional || "",
        diagnosticos: normalizarDiagnosticosNota(diagnosticosSeleccionados).map(textoDiagnosticoConEstado)
      }
    });

    if (esBorrador) {
      alert(notaEditandoId ? "Borrador actualizado sin borrar la nota original" : "Borrador guardado correctamente");
    } else {
      alert(notaEditandoId ? "Nota definitiva guardada sin borrar la nota original" : "Nota definitiva guardada correctamente");
    }
    limpiarFormularioNota();

    await cargarHistorial(uidPaciente);

  } catch(error) {
    alert("Error: " + error.message);
  }
}

window.guardarBorradorNota = function() {
  guardarNotaMedicaConEstado("borrador");
};

window.guardarNotaDefinitiva = function() {
  guardarNotaMedicaConEstado("definitiva");
};

window.guardarNotaMedica = function() {
  guardarNotaMedicaConEstado("definitiva");
};

async function cargarHistorial(uidPaciente) {
  const contenedor = document.getElementById("historialNotas");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  notasHistorial = {};
  notasHistorialOrdenadas = [];

  const notas = await obtenerHistorialNotas(uidPaciente);

  if (notas.empty) {
    contenedor.innerHTML = `
      <p style="color:#999">
        No hay notas registradas
      </p>
    `;
    return;
  }

  notas.forEach((nota) => {
    const datos = nota.data();
    notasHistorial[nota.id] = datos;
    notasHistorialOrdenadas.push({ id: nota.id, datos });

    const fecha = new Date(datos.fecha);

    const fechaTexto = fecha.toLocaleDateString("es-MX");

    const horaTexto = fecha.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const notaVigente = datos.notaEditada || datos;
    const estadoNota = notaVigente.estadoNota || (notaVigente.esBorrador ? "borrador" : "definitiva");
    const estadoTexto = estadoNota === "borrador" ? "Borrador" : "Definitiva";

    let diagnosticosTexto = "";

    if (Array.isArray(datos.historialDiagnosticos)) {
      diagnosticosTexto = datos.historialDiagnosticos
        .map((dx) => dx.texto || "")
        .join("<br>");
    } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
      diagnosticosTexto = datos.diagnostico.texto || "";
    } else {
      diagnosticosTexto = datos.diagnostico || "";
    }

    contenedor.innerHTML += `
      <details style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:22px;
        margin-bottom:20px;
      ">

        <summary style="
          cursor:pointer;
          font-size:18px;
          font-weight:bold;
          outline:none;
        ">
          ${fechaTexto} · ${horaTexto} · ${datos.autor || "Sin médico"} · ${estadoTexto}
        </summary>

        <div style="margin-top:20px;">

          <p><b>Diagnósticos:</b><br>
            ${diagnosticosTexto}
          </p>

          ${bloqueContenidoNota(datos, "Nota original")}

          ${datos.notaEditada ? bloqueContenidoNota(datos.notaEditada, "Version editada") : ""}

          <div class="acciones-historial-nota">
            <button type="button" class="boton-secundario" onclick="cargarNotaComoBorrador('${nota.id}')">
              Usar como borrador
            </button>

            <button type="button" class="boton-secundario" onclick="editarNotaDesdeHistorial('${nota.id}')">
              Editar esta nota
            </button>
          </div>

        </div>

      </details>
    `;
  });

  notasHistorialOrdenadas.sort((a, b) => {
    const fechaA = new Date(a.datos?.fecha || 0).getTime();
    const fechaB = new Date(b.datos?.fecha || 0).getTime();
    return fechaB - fechaA;
  });
}

window.regresarDesdeNota = function() {
  if (uidPacienteActual) {
    window.location.href = `paciente.html?id=${uidPacienteActual}`;
  } else {
    window.location.href = "medico.html";
  }
};

window.generarPDFNota = function() {
  window.print();
};

function textoWord(valor) {
  return escaparHTML(valor || "").replace(/\n/g, "<br>");
}

function fechaHoraZipNotaActual() {
  const fecha = new Date();
  return {
    horaDos: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2),
    fechaDos: ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  };
}

let tablaCrc32Nota = null;

function obtenerTablaCrc32Nota() {
  if (tablaCrc32Nota) return tablaCrc32Nota;
  tablaCrc32Nota = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tablaCrc32Nota[i] = c >>> 0;
  }
  return tablaCrc32Nota;
}

function crc32Nota(bytes) {
  const tabla = obtenerTablaCrc32Nota();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirUint16Nota(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
}

function escribirUint32Nota(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
  buffer[offset + 2] = (valor >>> 16) & 0xff;
  buffer[offset + 3] = (valor >>> 24) & 0xff;
}

function unirBytesNota(partes, total) {
  const salida = new Uint8Array(total);
  let offset = 0;
  partes.forEach((parte) => {
    salida.set(parte, offset);
    offset += parte.length;
  });
  return salida;
}

function crearZipNotaSinCompresion(archivos) {
  const encoder = new TextEncoder();
  const { horaDos, fechaDos } = fechaHoraZipNotaActual();
  const partes = [];
  const centrales = [];
  let offset = 0;

  archivos.forEach((archivo) => {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = typeof archivo.contenido === "string"
      ? encoder.encode(archivo.contenido)
      : archivo.contenido;
    const crc = crc32Nota(contenido);
    const local = new Uint8Array(30 + nombre.length);

    escribirUint32Nota(local, 0, 0x04034b50);
    escribirUint16Nota(local, 4, 20);
    escribirUint16Nota(local, 6, 0);
    escribirUint16Nota(local, 8, 0);
    escribirUint16Nota(local, 10, horaDos);
    escribirUint16Nota(local, 12, fechaDos);
    escribirUint32Nota(local, 14, crc);
    escribirUint32Nota(local, 18, contenido.length);
    escribirUint32Nota(local, 22, contenido.length);
    escribirUint16Nota(local, 26, nombre.length);
    escribirUint16Nota(local, 28, 0);
    local.set(nombre, 30);
    partes.push(local, contenido);

    const central = new Uint8Array(46 + nombre.length);
    escribirUint32Nota(central, 0, 0x02014b50);
    escribirUint16Nota(central, 4, 20);
    escribirUint16Nota(central, 6, 20);
    escribirUint16Nota(central, 8, 0);
    escribirUint16Nota(central, 10, 0);
    escribirUint16Nota(central, 12, horaDos);
    escribirUint16Nota(central, 14, fechaDos);
    escribirUint32Nota(central, 16, crc);
    escribirUint32Nota(central, 20, contenido.length);
    escribirUint32Nota(central, 24, contenido.length);
    escribirUint16Nota(central, 28, nombre.length);
    escribirUint16Nota(central, 30, 0);
    escribirUint16Nota(central, 32, 0);
    escribirUint16Nota(central, 34, 0);
    escribirUint16Nota(central, 36, 0);
    escribirUint32Nota(central, 38, 0);
    escribirUint32Nota(central, 42, offset);
    central.set(nombre, 46);
    centrales.push(central);
    offset += local.length + contenido.length;
  });

  const inicioCentral = offset;
  centrales.forEach((central) => {
    partes.push(central);
    offset += central.length;
  });

  const fin = new Uint8Array(22);
  escribirUint32Nota(fin, 0, 0x06054b50);
  escribirUint16Nota(fin, 4, 0);
  escribirUint16Nota(fin, 6, 0);
  escribirUint16Nota(fin, 8, archivos.length);
  escribirUint16Nota(fin, 10, archivos.length);
  escribirUint32Nota(fin, 12, offset - inicioCentral);
  escribirUint32Nota(fin, 16, inicioCentral);
  escribirUint16Nota(fin, 20, 0);
  partes.push(fin);
  offset += fin.length;

  return unirBytesNota(partes, offset);
}

function crearDocxNotaDesdeHtml(html) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const archivos = [
    {
      nombre: "[Content_Types].xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="html" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
    },
    {
      nombre: "_rels/.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      nombre: "word/document.xml",
      contenido: documentXml
    },
    {
      nombre: "word/_rels/document.xml.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/>
  <Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      nombre: "word/styles.xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
    </w:pPr>
  </w:style>
</w:styles>`
    },
    {
      nombre: "word/afchunk.html",
      contenido: `\ufeff${html}`
    }
  ];

  return new Blob([crearZipNotaSinCompresion(archivos)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function filaWord(etiqueta, valor) {
  return `
    <tr>
      <th>${textoWord(etiqueta)}</th>
      <td>${textoWord(valor)}</td>
    </tr>
  `;
}

function seccionWord(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    ${contenido}
  `;
}

function tablaCamposWord(filas) {
  return `<table>${filas.join("")}</table>`;
}

function nombreArchivoWordFray(datos) {
  const paciente = (datos.nombrePaciente || pacienteActualDatos.nombre || document.getElementById("uidPaciente")?.selectedOptions?.[0]?.textContent || "paciente")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
  const tipo = datos.tipoNota === "envio_piso"
    ? "envio_hospitalizacion_continua"
    : datos.tipoNota === "evolucion"
      ? "evolucion"
      : "ingreso";
  const fecha = datos.fechaNota || new Date().toISOString().slice(0, 10);
  return `Fray_Observacion_${tipo}_${paciente}_${fecha}.docx`;
}

function formatoFechaFray(fecha) {
  if (!fecha) return "";
  const partes = fecha.split("-");
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tituloNotaFray(tipo) {
  if (tipo === "envio_piso") return "NOTA DE ENVIO A HOSPITALIZACION CONTINUA";
  return tipo === "evolucion"
    ? "NOTA DE EVOLUCION AL SERVICIO DE OBSERVACION"
    : "NOTA DE INGRESO AL SERVICIO DE OBSERVACION";
}

function bloqueWordFray(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    <table class="tabla-texto">
      <tr><td>${textoWord(contenido)}</td></tr>
    </table>
  `;
}

async function recursoDataUri(ruta) {
  try {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) throw new Error("No se pudo leer el recurso");
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("No se pudo incrustar imagen en Word:", ruta, error);
    return ruta;
  }
}

async function htmlWordFrayObservacion() {
  sincronizarDiagnosticosObservacion();

  const logoSalud = await recursoDataUri("assets/fray-observacion-salud-conasama-stack.png");
  const logoFray = await recursoDataUri("assets/fray-observacion-image2.png");
  const datos = leerFormularioObservacionFray();
  const datosCognicion = leerFormularioNota();
  const diagnosticos = datos.diagnosticosCIE10.length
    ? datos.diagnosticosCIE10
    : normalizarDiagnosticosNota(diagnosticosSeleccionados).map((dx) => ({
        codigo: dx.codigo || "",
        diagnostico: `${dx.nombre || dx.texto || ""}${dx.estado ? ` — ${dx.estado}` : ""}`.trim()
      }));

  const tablaDiagnosticos = diagnosticos.length
    ? `
      <table class="tabla-diagnosticos-word">
        <thead>
          <tr><th>DIAGNOSTICO</th><th>CIE-10</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${diagnosticos.map((dx) => textoWord(dx.diagnostico)).join("<br>")}</td>
            <td>${diagnosticos.map((dx) => textoWord(dx.codigo)).join("<br>")}</td>
          </tr>
        </tbody>
      </table>
    `
    : "<p>Sin diagnosticos CIE-10 registrados.</p>";

  const exploracionFisicaNeurologica = datos.exploracionFisicaNeurologica || "";

  const vitales = `
    <table class="tabla-vitales">
      <thead>
        <tr>
          <th>Presion arterial</th>
          <th>Temperatura</th>
          <th>Frecuencia cardiaca</th>
          <th>Frecuencia respiratoria</th>
          <th>SatO2</th>
          <th>Peso</th>
          <th>Talla</th>
          <th>IMC</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${textoWord(datos.presionArterial)}</td>
          <td>${textoWord(datos.temperatura)}</td>
          <td>${textoWord(datos.frecuenciaCardiaca)}</td>
          <td>${textoWord(datos.frecuenciaRespiratoria)}</td>
          <td>${textoWord(datos.saturacionO2)}</td>
          <td>${textoWord(datos.peso)}</td>
          <td>${textoWord(datos.talla)}</td>
          <td>${textoWord(datos.imc)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const firmas = `
    <table class="tabla-firmas">
      <tr>
        <td>${textoWord(datos.firma1Nombre)}<br>${textoWord(datos.firma1Cargo)}<br>Ced. Prof. ${textoWord(datos.firma1Cedula)}</td>
        <td>${textoWord(datos.firma2Nombre)}<br>${textoWord(datos.firma2Cargo)}<br>Ced. Prof. ${textoWord(datos.firma2Cedula)}</td>
        <td>${textoWord(datos.firma3Nombre)}<br>${textoWord(datos.firma3Cargo)}<br>Ced. Prof. ${textoWord(datos.firma3Cedula)}</td>
      </tr>
    </table>
  `;

  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
          <meta charset="UTF-8">
          <title>Nota Observacion Fray Bernardino</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          
          <style>
    @page WordSection1 {
      size: 21.59cm 27.94cm;
      margin: 36.0pt 36.0pt 36.0pt 36.0pt;
    }

    div.WordSection1 {
      page: WordSection1;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 9pt;
      color: #111;
      margin: 0;
      padding: 0;
    }

        .encabezado { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 8pt; border-bottom: 1px dashed #777; }
        .encabezado td { border: none; vertical-align: middle; padding: 0 0 4pt; }
        .encabezado-logo-izq { width: 20%; text-align: left; }
        .encabezado-centro { width: 62%; text-align: center; font-weight: 700; font-size: 11pt; line-height: 1.12; text-transform: uppercase; white-space: nowrap; }
        .encabezado-logo-der { width: 14%; text-align: right; }
        .logo-salud { width: 118px; }
        .logo-fray { width: 58px; }
        h1 { text-align: center; font-size: 11.5pt; color: #7b7b7b; margin: 8pt 0 12pt; text-transform: uppercase; letter-spacing: .2pt; }
        h2 { font-size: 9.5pt; margin: 10pt 0 3pt; text-align: left; text-transform: uppercase; }
        p {
          margin: 0;
          margin-top: 0;
          margin-bottom: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
          mso-para-margin-top: 0cm;
          mso-para-margin-bottom: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
          text-align: left;
        }
        .identificacion { font-size: 8.6pt; line-height: 1.35; margin: 2pt 0 7pt; }
        .identificacion b { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 3pt 0 8pt; }
        th, td {
          border: 1px solid #222;
          padding: 4pt;
          vertical-align: top;
          text-align: left;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
        }
        .tabla-vitales { width: auto; table-layout: auto; margin: 2pt 0 6pt; }
        .tabla-vitales th,
        .tabla-vitales td {
          text-align: center;
          white-space: nowrap;
          padding: 1.4pt 3.2pt;
          margin: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-vitales th { font-size: 6.6pt; font-weight: 700; }
        .tabla-vitales td { font-size: 7.4pt; }
        .tabla-vitales th p,
        .tabla-vitales td p {
          margin: 0;
          margin-top: 0;
          margin-bottom: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          mso-para-margin: 0cm;
          mso-para-margin-top: 0cm;
          mso-para-margin-bottom: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-texto td { min-height: 42pt; line-height: 1.0; text-align: left; }
        .tabla-diagnosticos-word th { font-size: 8.5pt; text-align: left; }
        .tabla-diagnosticos-word th:first-child,
        .tabla-diagnosticos-word td:first-child { width: 86%; }
        .tabla-diagnosticos-word th:last-child,
        .tabla-diagnosticos-word td:last-child { width: 14%; }
        .pronostico-destino { margin-top: 6pt; }
        .tabla-firmas td { border: none; width: 33.33%; text-align: center; height: 48pt; vertical-align: bottom; font-size: 8.5pt; }
      </style>
    </head>
    <body>
        <div class="WordSection1">
          <table class="encabezado">
        <tr>
          <td class="encabezado-logo-izq">
            <img
              class="logo-salud"
              src="${logoSalud}"
              style="width:2.8cm;height:auto;"
              width="106"
            >
          </td>
          <td class="encabezado-centro">
            SECRETARIA DE SALUD<br>
            COMISION NACIONAL DE SALUD MENTAL Y ADICCIONES<br>
            HOSPITAL PSIQUIATRICO "FRAY BERNARDINO ALVAREZ"
          </td>
          <td class="encabezado-logo-der"><img class="logo-fray" src="${logoFray}"></td>
        </tr>
      </table>

      <h1>${tituloNotaFray(datos.tipoNota)}</h1>

      <p class="identificacion">
        <b>Nombre del paciente:</b> ${textoWord(datos.nombrePaciente || pacienteActualDatos.nombre)}
        &nbsp;&nbsp; <b>Fecha de nacimiento:</b> ${textoWord(formatoFechaFray(datos.fechaNacimiento))}
        &nbsp;&nbsp; <b>Edad:</b> ${textoWord(datos.edad)} ANOS
        &nbsp;&nbsp; <b>Cama:</b> ${textoWord(datos.cama)}
        &nbsp;&nbsp; <b>Expediente:</b> ${textoWord(datos.expediente)}
        &nbsp;&nbsp; <b>Sexo:</b> ${textoWord(datos.sexo)}
        &nbsp;&nbsp; <b>Genero:</b> ${textoWord(datos.genero)}
        &nbsp;&nbsp; <b>Servicio:</b> ${textoWord(datos.servicio || "OBSERVACION")}
        &nbsp;&nbsp; <b>Alergias:</b> ${textoWord(datos.alergias)}
        &nbsp;&nbsp; <b>Fecha:</b> ${textoWord(formatoFechaFray(datos.fechaNota))}
        &nbsp;&nbsp; <b>Hora:</b> ${textoWord(datos.horaNota)} H
        &nbsp;&nbsp; <b>Dias estancia:</b> ${textoWord(datos.diasEstancia)}
      </p>

      ${vitales}
      ${bloqueWordFray("MOTIVO DE ATENCION / ACTUALIZACION DEL CUADRO CLINICO", datos.motivoAtencion || datosCognicion.subjetivo)}
      ${bloqueWordFray("EXPLORACION FISICA Y NEUROLOGICA", exploracionFisicaNeurologica)}
      ${bloqueWordFray("EXAMEN MENTAL", datos.examenMental || datosCognicion.objetivo)}
      ${bloqueWordFray("RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNOSTICO", datos.resultadosEstudios)}
      <h2>DIAGNOSTICOS DE ACUERDO A CIE-10 (PRIMARIO Y COMORBILIDADES)</h2>
      ${tablaDiagnosticos}
      ${bloqueWordFray("PLAN TERAPEUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLOGICO)", datos.planTerapeutico || datosCognicion.plan)}
      ${bloqueWordFray("COMENTARIO Y/O ANALISIS CLINICO Y FUNDAMENTACION DIAGNOSTICA Y TERAPEUTICA", datos.comentarioAnalisis || datosCognicion.analisis)}
      <p class="pronostico-destino"><b>PRONOSTICO:</b> ${textoWord(datos.pronostico)}</p>
      <p class="pronostico-destino"><b>DESTINO:</b> ${textoWord(datos.destino)}</p>
      <h2>NOMBRE, FIRMA Y CEDULA PROFESIONAL DEL MEDICO QUE REALIZA Y SUPERVISA:</h2>
      ${firmas}
      </div>
      </body>
    </html>
  `;
}

window.descargarNotaFrayObservacion = async function() {
  const datos = leerFormularioObservacionFray();
  const html = await htmlWordFrayObservacion();
  const blob = crearDocxNotaDesdeHtml(html);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivoWordFray(datos);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
};

window.descargarNotaSeleccionada = async function() {
  if (esFormatoFray()) {
    await window.descargarNotaFrayObservacion();
    return;
  }

  window.generarPDFNota();
};
