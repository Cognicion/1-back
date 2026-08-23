import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { sanitizarHTMLRico } from "./apuntes-rich-text.js?v=20260822-apuntes-subcarpetas-listas-v1";
import { inicializarSidebarApuntes } from "./apuntes-sidebar.js";
import { inicializarObjetosApunte, textoObjetosApunte } from "./apuntes-objetos.js";
import { descargarApuntePdf, descargarApunteWord } from "./apuntes-export.js";
import {
  normalizarColorHex,
  normalizarColoresRecientes,
  registrarColorReciente
} from "./apuntes-color-history.js";
import {
  actualizarApunteConRevision,
  eliminarApunteConRevision,
  esConflictoApunte,
  esErrorConexionApunte
} from "./services/apuntesMedicoPersistence.js";
import {
  aplanarCarpetasJerarquicas,
  crearVistaPreviaApunte,
  escaparHTML,
  filtrarApuntes,
  jerarquizarCarpetas,
  nombreCarpetaDisponible,
  normalizarCarpetaPadreId,
  normalizarTexto,
  obtenerTituloVisibleApunte,
  ordenarCarpetas,
  SIN_CARPETA
} from "./apuntes-core.js?v=20260822-apuntes-subcarpetas-listas-v1";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ETIQUETAS_DESCARTAR = "Tienes cambios sin guardar. ¿Quieres descartarlos?";
const ETIQUETA_ERROR = "No se pudo completar la acción. Inténtalo de nuevo.";
const ETIQUETA_CARPETA_SIN_ASIGNAR = "";
const TAMANO_LOTE = 450;
const COLORES_PREDEFINIDOS = Object.freeze({
  texto: ["#f8fafc", "#fecaca", "#fdba74", "#fde68a", "#bef264", "#5eead4", "#7dd3fc", "#a5b4fc", "#d8b4fe", "#f9a8d4"],
  fondo: ["#fef08a", "#fde68a", "#fdba74", "#fca5a5", "#f9a8d4", "#d8b4fe", "#a5b4fc", "#7dd3fc", "#99f6e4", "#bef264"]
});
const CONFIGURACION_COLORES = Object.freeze({
  texto: Object.freeze({
    botonId: "abrirColorTexto",
    panelId: "paletaColorTexto",
    controlId: "colorTexto",
    recientesId: "coloresRecientesTexto",
    muestraSelector: ".control-color__muestra--texto",
    comando: "foreColor",
    propiedadMuestra: "color",
    etiqueta: "Color de texto"
  }),
  fondo: Object.freeze({
    botonId: "abrirColorFondoTexto",
    panelId: "paletaColorFondoTexto",
    controlId: "colorFondoTexto",
    recientesId: "coloresRecientesFondoTexto",
    muestraSelector: ".control-color__muestra--fondo",
    comando: "hiliteColor",
    propiedadMuestra: "backgroundColor",
    etiqueta: "Color para resaltar"
  })
});

let uidMedico = "";
let apuntes = [];
let carpetas = [];
let carpetasCerradas = new Set();
let seleccionEditor = null;
let hayCambiosSinGuardar = false;
let interfazInicializada = false;
let idCarpetaEdicion = "";
let guardandoApunte = false;
let eliminandoApunte = false;
let eliminandoCarpeta = false;
let fondoApunteActual = "";
let carpetasDisponibles = true;
let coloresRecientes = [];
let objetosApunteController = null;
const parametrosEntradaApuntes = new URLSearchParams(window.location.search);
const apunteSolicitado = String(parametrosEntradaApuntes.get("apunte") || "").trim().slice(0, 160);
const crearApunteSolicitado = parametrosEntradaApuntes.get("nuevo") === "1";
const entradaDesdeMiNube = parametrosEntradaApuntes.get("origen") === "mi-nube";

iniciarMonitoreoSesion("Mis apuntes");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uidMedico = user.uid;
  recuperarEstadoCarpetas();
  recuperarColoresRecientes();
  inicializarInterfaz();
  prepararRegresoAMiNube();
  document.body.classList.remove("bloqueado");
  ponerEdicionOcupada(true);

  try {
    await cargarDatos({
      seleccionarId: crearApunteSolicitado ? "" : apunteSolicitado,
      crearNuevo: crearApunteSolicitado
    });
  } catch (error) {
    console.error("[APUNTES] No se pudieron cargar los apuntes", error);
    ponerEstado("No se pudieron cargar los apuntes", true);
    const lista = document.getElementById("listaApuntes");
    if (lista) lista.innerHTML = '<p class="vacio">No fue posible cargar tus apuntes.</p>';
  } finally {
    ponerEdicionOcupada(false);
  }
});

function inicializarInterfaz() {
  if (interfazInicializada) return;
  interfazInicializada = true;

  const buscador = document.getElementById("buscadorApuntes");
  const lista = document.getElementById("listaApuntes");
  const editor = obtenerEditor();

  inicializarSidebarApuntes({
    uid: uidMedico,
    shell: document.querySelector(".apuntes-shell"),
    sidebar: document.getElementById("sidebarApuntes"),
    boton: document.getElementById("alternarSidebarApuntes")
  });

  inicializarSelectorColores();
  inicializarObjetosApunteUI();

  buscador?.addEventListener("input", renderizarLista);
  document.getElementById("nuevoApunte")?.addEventListener("click", () => {
    if (guardandoApunte || eliminandoApunte) return;
    if (!confirmarDescartarCambios()) return;
    nuevoApunte(obtenerCarpetaActual());
  });
  document.getElementById("nuevaCarpeta")?.addEventListener("click", () => abrirDialogoCarpeta());
  document.getElementById("guardarApunte")?.addEventListener("click", guardarApunte);
  document.getElementById("eliminarApunte")?.addEventListener("click", eliminarApunte);
  document.getElementById("apunteTitulo")?.addEventListener("input", marcarCambios);
  document.getElementById("apunteCarpeta")?.addEventListener("change", marcarCambios);
  editor?.addEventListener("input", marcarCambios);
  editor?.addEventListener("blur", normalizarEditorVacio);
  editor?.addEventListener("keydown", gestionarAtajosEditor);
  editor?.addEventListener("paste", pegarComoTextoSeguro);
  lista?.addEventListener("click", gestionarClickLista);

  document.getElementById("formatoNegrita")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("formatoNegrita")?.addEventListener("click", () => ejecutarFormato("bold"));
  document.getElementById("quitarFormato")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("quitarFormato")?.addEventListener("click", () => ejecutarFormato("removeFormat"));
  document.getElementById("quitarResaltado")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("quitarResaltado")?.addEventListener("click", quitarResaltadoSeleccion);
  document.getElementById("listaPuntos")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaPuntos")?.addEventListener("click", () => ejecutarLista("puntos"));
  document.getElementById("listaNumeros")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaNumeros")?.addEventListener("click", () => ejecutarLista("numeros"));
  document.getElementById("listaLetras")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaLetras")?.addEventListener("click", () => ejecutarLista("letras"));
  document.getElementById("aumentarSublista")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("aumentarSublista")?.addEventListener("click", () => ejecutarFormato("indent"));
  document.getElementById("reducirSublista")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("reducirSublista")?.addEventListener("click", () => ejecutarFormato("outdent"));
  document.getElementById("abrirInsertarApunte")?.addEventListener("click", alternarMenuInsertar);
  document.getElementById("insertarCuadroTexto")?.addEventListener("click", () => insertarObjetoApunte("texto"));
  document.getElementById("insertarFlecha")?.addEventListener("click", () => insertarObjetoApunte("flecha"));
  document.getElementById("abrirPropiedadesObjeto")?.addEventListener("click", alternarPropiedadesObjeto);
  document.getElementById("cerrarPropiedadesObjeto")?.addEventListener("click", cerrarPropiedadesObjeto);
  document.getElementById("selectorObjeto")?.addEventListener("change", seleccionarObjetoDesdePanel);
  document.getElementById("ajusteObjeto")?.addEventListener("change", actualizarAjusteObjeto);
  document.getElementById("colorObjeto")?.addEventListener("change", actualizarColorObjeto);
  document.getElementById("eliminarObjeto")?.addEventListener("click", eliminarObjetoSeleccionado);
  document.getElementById("abrirExportacionApunte")?.addEventListener("click", alternarMenuExportacion);
  document.getElementById("descargarApunteWord")?.addEventListener("click", () => exportarApunte("word"));
  document.getElementById("descargarApuntePdf")?.addEventListener("click", () => exportarApunte("pdf"));
  document.getElementById("alternarTituloApunte")?.addEventListener("click", () => alternarSeccionEditor("titulo"));
  document.getElementById("alternarBarraFormato")?.addEventListener("click", () => alternarSeccionEditor("formato"));
  editor?.addEventListener("contextmenu", abrirMenuContextualTexto);
  document.getElementById("menuContextualTexto")?.addEventListener("click", ejecutarAccionMenuContextualTexto);
  document.getElementById("menuContextualTexto")?.addEventListener("pointerdown", conservarFocoEditor);
  document.addEventListener("selectionchange", guardarSeleccionEditor);

  document.getElementById("formularioCarpeta")?.addEventListener("submit", guardarCarpeta);
  document.getElementById("cancelarCarpeta")?.addEventListener("click", cerrarDialogoCarpeta);
  document.getElementById("dialogoCarpeta")?.addEventListener("cancel", limpiarDialogoCarpeta);

  window.addEventListener("beforeunload", (evento) => {
    if (!hayCambiosSinGuardar) return;
    evento.preventDefault();
    evento.returnValue = "";
  });
}

function refApuntes() {
  return collection(db, "usuarios", uidMedico, "apuntesMedico");
}

function refCarpetas() {
  return collection(db, "usuarios", uidMedico, "carpetasApuntes");
}

async function cargarDatos({ seleccionarId = "", crearNuevo = false } = {}) {
  const idActual = seleccionarId || document.getElementById("apunteId")?.value || "";
  const [resultadoApuntes, resultadoCarpetas] = await Promise.allSettled([
    getDocs(query(refApuntes(), orderBy("fechaActualizacion", "desc"))),
    getDocs(refCarpetas())
  ]);

  if (resultadoApuntes.status === "rejected") throw resultadoApuntes.reason;
  const snapApuntes = resultadoApuntes.value;
  carpetasDisponibles = resultadoCarpetas.status === "fulfilled";
  if (!carpetasDisponibles) {
    console.warn("[APUNTES] Las carpetas no están disponibles; se muestran los apuntes sin agrupar.", resultadoCarpetas.reason);
  }

  apuntes = snapApuntes.docs.map((docApunte) => ({ id: docApunte.id, ...docApunte.data() }));
  carpetas = ordenarCarpetas((resultadoCarpetas.status === "fulfilled" ? resultadoCarpetas.value.docs : []).map((docCarpeta) => ({
    id: docCarpeta.id,
    ...docCarpeta.data()
  })));

  renderizarSelectorCarpetas();

  if (crearNuevo) {
    nuevoApunte(ETIQUETA_CARPETA_SIN_ASIGNAR);
    actualizarDisponibilidadCarpetas();
    if (!carpetasDisponibles) ponerEstado("Nuevo apunte · Carpetas no disponibles", true);
    return;
  }

  const idSeleccionable = apuntes.some((apunte) => apunte.id === idActual)
    ? idActual
    : apuntes[0]?.id;

  if (idSeleccionable) {
    seleccionarApunte(idSeleccionable, { omitirConfirmacion: true });
  } else {
    nuevoApunte(ETIQUETA_CARPETA_SIN_ASIGNAR);
  }
  actualizarDisponibilidadCarpetas();
  if (!carpetasDisponibles) ponerEstado("Guardado · Carpetas no disponibles", true);
}

function prepararRegresoAMiNube() {
  if (!entradaDesdeMiNube || document.querySelector("[data-volver-mi-nube]")) return;
  const navegacion = document.querySelector("header.topbar-apuntes nav, .global-header-actions");
  if (!navegacion) return;
  const enlace = document.createElement("a");
  enlace.href = "mi-nube.html?filtro=notes";
  enlace.className = "topbar-apuntes__enlace";
  enlace.dataset.volverMiNube = "true";
  enlace.textContent = "Volver a Mi nube";
  navegacion.prepend(enlace);
}

async function cargarCarpetas() {
  const snap = await getDocs(refCarpetas());
  carpetasDisponibles = true;
  carpetas = ordenarCarpetas(snap.docs.map((docCarpeta) => ({ id: docCarpeta.id, ...docCarpeta.data() })));
  renderizarSelectorCarpetas();
  renderizarLista();
  actualizarDisponibilidadCarpetas();
}

function renderizarSelectorCarpetas() {
  const selector = document.getElementById("apunteCarpeta");
  if (!selector) return;

  const valorActual = selector.value;
  const carpetasPlanas = aplanarCarpetasJerarquicas(carpetas);
  selector.innerHTML = [
    '<option value="">Sin carpeta</option>',
    ...carpetasPlanas.map((carpeta) => (
      `<option value="${escaparHTML(carpeta.id)}">${"— ".repeat(carpeta.profundidad)}${escaparHTML(carpeta.nombre)}</option>`
    ))
  ].join("");

  selector.value = carpetas.some((carpeta) => carpeta.id === valorActual)
    ? valorActual
    : ETIQUETA_CARPETA_SIN_ASIGNAR;
}

function renderizarLista() {
  const lista = document.getElementById("listaApuntes");
  const contador = document.getElementById("contadorApuntes");
  const busqueda = document.getElementById("buscadorApuntes")?.value || "";
  const activo = document.getElementById("apunteId")?.value || "";
  if (!lista) return;

  const filtrados = filtrarApuntes(apuntes, busqueda);
  const hayBusqueda = Boolean(normalizarTexto(busqueda));
  const arbol = jerarquizarCarpetas(carpetas);
  const hayResultadosEnRama = (carpeta) => (
    filtrados.some((apunte) => apunte.carpetaId === carpeta.id)
    || (carpeta.hijas || []).some(hayResultadosEnRama)
  );
  const carpetasVisibles = hayBusqueda ? arbol.filter(hayResultadosEnRama) : arbol;
  const sinCarpeta = filtrados.filter((apunte) => !apunte.carpetaId || !carpetas.some((carpeta) => carpeta.id === apunte.carpetaId));

  if (contador) {
    contador.textContent = hayBusqueda
      ? `${filtrados.length} de ${apuntes.length}`
      : `${apuntes.length}`;
  }

  if (!carpetasVisibles.length && !sinCarpeta.length) {
    lista.innerHTML = '<p class="vacio">No se encontraron apuntes.</p>';
    return;
  }

  const carpetasHtml = carpetasVisibles.map((carpeta, indice) => (
    renderizarCarpeta(carpeta, `carpeta-${indice}`, activo, filtrados, hayBusqueda)
  )).join("");
  lista.innerHTML = `${carpetasHtml}${renderizarGrupoSinCarpeta(sinCarpeta, activo, hayBusqueda)}`;
}

function contarApuntesEnRama(carpeta, filtrados) {
  return filtrados.filter((apunte) => apunte.carpetaId === carpeta.id).length
    + (carpeta.hijas || []).reduce((total, hija) => total + contarApuntesEnRama(hija, filtrados), 0);
}

function renderizarCarpeta(carpeta, identificador, activo, filtrados, forzarAbierto, profundidad = 0) {
  const idSeguro = escaparHTML(carpeta.id);
  const contenidoId = `carpeta-contenido-${identificador}`;
  const estaAbierta = forzarAbierto || !carpetasCerradas.has(carpeta.id);
  const apuntesDirectos = filtrados.filter((apunte) => apunte.carpetaId === carpeta.id);
  const hijasVisibles = forzarAbierto
    ? (carpeta.hijas || []).filter((hija) => contarApuntesEnRama(hija, filtrados) > 0)
    : (carpeta.hijas || []);
  const cantidad = contarApuntesEnRama(carpeta, filtrados);
  const acciones = [
    `<button type="button" class="carpeta-accion" data-accion="nuevo-en-carpeta" data-carpeta-id="${idSeguro}" title="Nuevo apunte en ${escaparHTML(carpeta.nombre)}" aria-label="Nuevo apunte en ${escaparHTML(carpeta.nombre)}">＋</button>`,
    `<button type="button" class="carpeta-accion" data-accion="nueva-subcarpeta" data-carpeta-id="${idSeguro}" title="Nueva subcarpeta" aria-label="Crear una subcarpeta dentro de ${escaparHTML(carpeta.nombre)}">⊞</button>`,
    `<button type="button" class="carpeta-accion" data-accion="renombrar-carpeta" data-carpeta-id="${idSeguro}" title="Renombrar o mover carpeta" aria-label="Renombrar o mover ${escaparHTML(carpeta.nombre)}">✎</button>`,
    `<button type="button" class="carpeta-accion" data-accion="eliminar-carpeta" data-carpeta-id="${idSeguro}" title="Eliminar carpeta" aria-label="Eliminar ${escaparHTML(carpeta.nombre)}">×</button>`
  ].join("");
  const contenidoDirecto = apuntesDirectos.map((apunte) => renderizarApunte(apunte, activo)).join("");
  const hijas = hijasVisibles.map((hija, indice) => (
    renderizarCarpeta(hija, `${identificador}-${indice}`, activo, filtrados, forzarAbierto, profundidad + 1)
  )).join("");
  const vacia = !contenidoDirecto && !hijas ? '<p class="carpeta-vacia">Carpeta vacía</p>' : "";

  return `
    <section class="carpeta-apuntes" data-grupo-id="${idSeguro}" style="--carpeta-profundidad:${profundidad}">
      <div class="carpeta-cabecera">
        <button type="button" class="carpeta-toggle" data-accion="alternar-carpeta" data-carpeta-id="${idSeguro}" aria-expanded="${estaAbierta}" aria-controls="${contenidoId}">
          <span class="carpeta-toggle__flecha" aria-hidden="true">›</span>
          <span class="carpeta-toggle__icono" aria-hidden="true"></span>
          <span class="carpeta-toggle__nombre">${escaparHTML(carpeta.nombre)}</span>
          <span class="carpeta-toggle__cantidad">${cantidad}</span>
        </button>
        <div class="carpeta-acciones">${acciones}</div>
      </div>
      <div id="${contenidoId}" class="carpeta-contenido" ${estaAbierta ? "" : "hidden"}>${contenidoDirecto}${hijas}${vacia}</div>
    </section>
  `;
}

function renderizarGrupoSinCarpeta(apuntesSinCarpeta, activo, forzarAbierto) {
  if (!apuntesSinCarpeta.length && forzarAbierto) return "";
  const contenidoId = "carpeta-contenido-sin-carpeta";
  const estaAbierta = forzarAbierto || !carpetasCerradas.has(SIN_CARPETA);
  return `
    <section class="carpeta-apuntes" data-grupo-id="${SIN_CARPETA}">
      <div class="carpeta-cabecera">
        <button type="button" class="carpeta-toggle" data-accion="alternar-carpeta" data-carpeta-id="${SIN_CARPETA}" aria-expanded="${estaAbierta}" aria-controls="${contenidoId}">
          <span class="carpeta-toggle__flecha" aria-hidden="true">›</span>
          <span class="carpeta-toggle__icono" aria-hidden="true"></span>
          <span class="carpeta-toggle__nombre">Sin carpeta</span>
          <span class="carpeta-toggle__cantidad">${apuntesSinCarpeta.length}</span>
        </button>
        <div class="carpeta-acciones"><button type="button" class="carpeta-accion" data-accion="nuevo-en-carpeta" data-carpeta-id="" title="Nuevo apunte sin carpeta" aria-label="Nuevo apunte sin carpeta">＋</button></div>
      </div>
      <div id="${contenidoId}" class="carpeta-contenido" ${estaAbierta ? "" : "hidden"}>${apuntesSinCarpeta.map((apunte) => renderizarApunte(apunte, activo)).join("") || '<p class="carpeta-vacia">Carpeta vacía</p>'}</div>
    </section>
  `;
}

function renderizarApunte(apunte, activo) {
  const estaActivo = apunte.id === activo;
  return `
    <button
      type="button"
      class="apunte-item ${estaActivo ? "activo" : ""}"
      data-accion="seleccionar-apunte"
      data-id="${escaparHTML(apunte.id)}"
      ${estaActivo ? 'aria-current="true"' : ""}
      title="${escaparHTML(obtenerTituloVisibleApunte(apunte.titulo))}"
    >
      <strong class="apunte-item__titulo">${escaparHTML(obtenerTituloVisibleApunte(apunte.titulo))}</strong>
      <span class="apunte-item__preview">${escaparHTML(crearVistaPreviaApunte(apunte.contenido, 120))}</span>
    </button>
  `;
}

function gestionarClickLista(evento) {
  if (guardandoApunte || eliminandoApunte || eliminandoCarpeta) return;
  const boton = evento.target.closest("button[data-accion]");
  if (!boton) return;

  const accion = boton.dataset.accion;
  const carpetaId = boton.dataset.carpetaId || "";

  if (accion === "alternar-carpeta") {
    alternarCarpeta(carpetaId || SIN_CARPETA);
    return;
  }

  if (accion === "seleccionar-apunte") {
    seleccionarApunte(boton.dataset.id, { restaurarFoco: true });
    return;
  }

  if (accion === "nuevo-en-carpeta") {
    if (!confirmarDescartarCambios()) return;
    nuevoApunte(carpetaId);
    return;
  }

  if (accion === "nueva-subcarpeta") {
    abrirDialogoCarpeta("", carpetaId);
    return;
  }

  if (accion === "renombrar-carpeta") {
    abrirDialogoCarpeta(carpetaId);
    return;
  }

  if (accion === "eliminar-carpeta") {
    void eliminarCarpeta(carpetaId);
  }
}

function alternarCarpeta(id) {
  if (carpetasCerradas.has(id)) carpetasCerradas.delete(id);
  else carpetasCerradas.add(id);
  guardarEstadoCarpetas();
  renderizarLista();
  restaurarFocoLista("alternar-carpeta", id);
}

function seleccionarApunte(id, { omitirConfirmacion = false, restaurarFoco = false } = {}) {
  const apunte = apuntes.find((item) => item.id === id);
  if (!apunte) return;
  const idActual = document.getElementById("apunteId")?.value || "";
  if (!omitirConfirmacion && idActual === id) return;
  if (!omitirConfirmacion && !confirmarDescartarCambios()) return;

  document.getElementById("apunteId").value = apunte.id;
  document.getElementById("apunteTitulo").value = apunte.titulo || "";

  const selector = document.getElementById("apunteCarpeta");
  const carpetaValida = carpetas.some((carpeta) => carpeta.id === apunte.carpetaId);
  if (selector) selector.value = carpetaValida ? apunte.carpetaId : ETIQUETA_CARPETA_SIN_ASIGNAR;

  const editor = obtenerEditor();
  const htmlEstaVigente = apunte.contenidoHtml
    && apunte.contenidoHtmlActualizado
    && apunte.contenidoHtmlActualizado === apunte.fechaActualizacion;
  if (editor) {
    if (htmlEstaVigente) editor.innerHTML = sanitizarHTMLRico(apunte.contenidoHtml);
    else editor.textContent = apunte.contenido || "";
  }
  aplicarFondoApunte(apunte.fondoLienzo, { marcar: false });

  const objetosVigentes = apunte.objetosLienzo
    && apunte.objetosLienzoActualizado
    && apunte.objetosLienzoActualizado === apunte.fechaActualizacion;
  objetosApunteController?.cargar(objetosVigentes ? apunte.objetosLienzo : []);

  const grupoId = carpetaValida ? apunte.carpetaId : SIN_CARPETA;
  carpetasCerradas.delete(grupoId);
  guardarEstadoCarpetas();
  hayCambiosSinGuardar = false;
  seleccionEditor = null;
  ponerEstado("Guardado");
  renderizarLista();
  if (restaurarFoco) restaurarFocoLista("seleccionar-apunte", id);
  actualizarEstadoFormato();
}

function restaurarFocoLista(accion, id) {
  requestAnimationFrame(() => {
    const botones = document.querySelectorAll(`#listaApuntes button[data-accion="${accion}"]`);
    const destino = [...botones].find((boton) => (
      accion === "seleccionar-apunte" ? boton.dataset.id === id : boton.dataset.carpetaId === id
    ));
    destino?.focus({ preventScroll: true });
  });
}

function nuevoApunte(carpetaId = ETIQUETA_CARPETA_SIN_ASIGNAR) {
  const carpetaValida = carpetas.some((carpeta) => carpeta.id === carpetaId) ? carpetaId : "";
  document.getElementById("apunteId").value = "";
  document.getElementById("apunteTitulo").value = "";
  document.getElementById("apunteCarpeta").value = carpetaValida;

  const editor = obtenerEditor();
  if (editor) editor.innerHTML = "";
  aplicarFondoApunte("", { marcar: false });
  objetosApunteController?.cargar([]);

  carpetasCerradas.delete(carpetaValida || SIN_CARPETA);
  guardarEstadoCarpetas();
  hayCambiosSinGuardar = false;
  seleccionEditor = null;
  ponerEstado("Nuevo apunte");
  renderizarLista();
  actualizarEstadoFormato();
  document.getElementById("apunteTitulo")?.focus();
}

async function guardarApunte() {
  if (guardandoApunte || eliminandoApunte || eliminandoCarpeta) return;
  guardandoApunte = true;
  const boton = document.getElementById("guardarApunte");
  const id = document.getElementById("apunteId").value;
  const titulo = document.getElementById("apunteTitulo").value.trim() || "Sin título";
  const contenido = obtenerContenidoPlano();
  const contenidoHtml = contenido ? sanitizarHTMLRico(obtenerEditor()?.innerHTML || "") : "";
  const objetosLienzo = objetosApunteController?.serializar() || { version: 1, objetos: [] };
  const original = apuntes.find((apunte) => apunte.id === id);
  const carpetaId = carpetasDisponibles
    ? obtenerCarpetaActual() || null
    : original?.carpetaId || null;
  const fechaActualizacion = new Date().toISOString();
  let escrituraCompletada = false;

  ponerBotonOcupado(boton, true, "Guardando...");
  ponerEdicionOcupada(true);
  ponerEstado("Guardando...");

  const payload = {
    titulo,
    contenido,
    contenidoHtml,
    contenidoHtmlActualizado: fechaActualizacion,
    objetosLienzo,
    objetosLienzoActualizado: fechaActualizacion,
    fondoLienzo: fondoApunteActual || null,
    carpetaId,
    fechaActualizacion,
    fechaActualizacionServidor: serverTimestamp()
  };

  try {
    let idGuardado = id;
    if (id) {
      await actualizarApunteConRevision({
        db,
        referencia: doc(db, "usuarios", uidMedico, "apuntesMedico", id),
        payload,
        fechaEsperada: original?.fechaActualizacion
      });
    } else {
      const creado = await addDoc(refApuntes(), {
        ...payload,
        fechaCreacion: fechaActualizacion
      });
      idGuardado = creado.id;
      document.getElementById("apunteId").value = creado.id;
    }

    actualizarCacheApunteGuardado(idGuardado, original, payload, fechaActualizacion);
    escrituraCompletada = true;
    hayCambiosSinGuardar = false;
    await cargarDatos({ seleccionarId: idGuardado });
    ponerEstado("Guardado");
  } catch (error) {
    console.error("[APUNTES] No se pudo guardar el apunte", error);
    if (escrituraCompletada) {
      renderizarLista();
      ponerEstado("Guardado; no se pudo actualizar la lista.", true);
    } else if (esConflictoApunte(error)) {
      ponerEstado("El apunte cambió en otra ventana. Copia tus cambios y vuelve a abrirlo.", true);
    } else if (esErrorConexionApunte(error)) {
      ponerEstado("Necesitas conexión para actualizar este apunte.", true);
    } else {
      ponerEstado(ETIQUETA_ERROR, true);
    }
  } finally {
    ponerBotonOcupado(boton, false);
    ponerEdicionOcupada(false);
    guardandoApunte = false;
  }
}

function actualizarCacheApunteGuardado(id, original, payload, fechaCreacion) {
  const { fechaActualizacionServidor: _marcaServidor, ...datosLocales } = payload;
  const actualizado = {
    ...(original || {}),
    ...datosLocales,
    id,
    fechaCreacion: original?.fechaCreacion || fechaCreacion
  };
  const indice = apuntes.findIndex((apunte) => apunte.id === id);
  if (indice >= 0) apuntes[indice] = actualizado;
  else apuntes.unshift(actualizado);
}

async function eliminarApunte() {
  if (eliminandoApunte || guardandoApunte || eliminandoCarpeta) return;
  const id = document.getElementById("apunteId").value;
  if (!id) {
    nuevoApunte(obtenerCarpetaActual());
    return;
  }

  if (!window.confirm("¿Eliminar este apunte? Esta acción no se puede deshacer.")) return;

  eliminandoApunte = true;
  let eliminacionCompletada = false;
  const boton = document.getElementById("eliminarApunte");
  ponerBotonOcupado(boton, true, "Eliminando...");
  ponerEdicionOcupada(true);
  ponerEstado("Eliminando...");
  try {
    const original = apuntes.find((apunte) => apunte.id === id);
    await eliminarApunteConRevision({
      db,
      referencia: doc(db, "usuarios", uidMedico, "apuntesMedico", id),
      fechaEsperada: original?.fechaActualizacion
    });
    eliminacionCompletada = true;
    apuntes = apuntes.filter((apunte) => apunte.id !== id);
    hayCambiosSinGuardar = false;
    await cargarDatos();
  } catch (error) {
    console.error("[APUNTES] No se pudo eliminar el apunte", error);
    if (eliminacionCompletada) {
      if (apuntes[0]) seleccionarApunte(apuntes[0].id, { omitirConfirmacion: true });
      else nuevoApunte();
      ponerEstado("Eliminado; no se pudo actualizar la lista.", true);
    } else {
      ponerEstado(esConflictoApunte(error)
        ? "El apunte cambió en otra ventana. Vuelve a abrirlo antes de eliminar."
        : esErrorConexionApunte(error)
          ? "Necesitas conexión para eliminar este apunte."
          : ETIQUETA_ERROR, true);
    }
  } finally {
    ponerBotonOcupado(boton, false);
    eliminandoApunte = false;
    ponerEdicionOcupada(false);
  }
}

function abrirDialogoCarpeta(carpetaId = "", padrePreseleccionado = "") {
  const dialogo = document.getElementById("dialogoCarpeta");
  const carpeta = carpetas.find((item) => item.id === carpetaId);
  idCarpetaEdicion = carpeta?.id || "";
  const padreActual = carpeta
    ? normalizarCarpetaPadreId(carpeta.carpetaPadreId, carpetas, carpeta.id)
    : normalizarCarpetaPadreId(padrePreseleccionado, carpetas);
  document.getElementById("tituloDialogoCarpeta").textContent = carpeta ? "Renombrar carpeta" : "Nueva carpeta";
  document.getElementById("guardarCarpeta").textContent = carpeta ? "Guardar cambios" : "Guardar carpeta";
  document.getElementById("nombreCarpeta").value = carpeta?.nombre || "";
  renderizarSelectorPadreCarpeta(padreActual, carpeta?.id || "");
  document.getElementById("errorCarpeta").textContent = "";

  if (typeof dialogo?.showModal === "function") dialogo.showModal();
  else dialogo?.setAttribute("open", "");
  requestAnimationFrame(() => document.getElementById("nombreCarpeta")?.focus());
}

function renderizarSelectorPadreCarpeta(padreSeleccionado = "", idExcluido = "") {
  const selector = document.getElementById("carpetaPadre");
  if (!selector) return;
  const opciones = aplanarCarpetasJerarquicas(carpetas).filter((carpeta) => (
    carpeta.id !== idExcluido
    && normalizarCarpetaPadreId(carpeta.id, carpetas, idExcluido) === carpeta.id
  ));
  selector.innerHTML = [
    '<option value="">Carpeta raíz</option>',
    ...opciones.map((carpeta) => (
      `<option value="${escaparHTML(carpeta.id)}">${"— ".repeat(carpeta.profundidad)}${escaparHTML(carpeta.nombre)}</option>`
    ))
  ].join("");
  selector.value = opciones.some((carpeta) => carpeta.id === padreSeleccionado) ? padreSeleccionado : "";
}

function cerrarDialogoCarpeta() {
  const dialogo = document.getElementById("dialogoCarpeta");
  if (typeof dialogo?.close === "function") dialogo.close();
  else dialogo?.removeAttribute("open");
  limpiarDialogoCarpeta();
}

function limpiarDialogoCarpeta() {
  idCarpetaEdicion = "";
  const error = document.getElementById("errorCarpeta");
  if (error) error.textContent = "";
}

async function guardarCarpeta(evento) {
  evento.preventDefault();
  const nombre = normalizarTexto(document.getElementById("nombreCarpeta")?.value);
  const padreSolicitado = document.getElementById("carpetaPadre")?.value || "";
  const carpetaPadreId = normalizarCarpetaPadreId(padreSolicitado, carpetas, idCarpetaEdicion);
  const error = document.getElementById("errorCarpeta");
  const boton = document.getElementById("guardarCarpeta");

  if (!nombre) {
    error.textContent = "Escribe un nombre para la carpeta.";
    return;
  }
  if (padreSolicitado && !carpetaPadreId) {
    error.textContent = "No puedes colocar una carpeta dentro de sí misma o de una subcarpeta.";
    return;
  }
  if (!nombreCarpetaDisponible(nombre, carpetas, idCarpetaEdicion, carpetaPadreId)) {
    error.textContent = "Ya existe una carpeta con ese nombre en esta ubicación.";
    return;
  }

  ponerBotonOcupado(boton, true, "Guardando...");
  error.textContent = "";
  try {
    if (idCarpetaEdicion) {
      await updateDoc(doc(db, "usuarios", uidMedico, "carpetasApuntes", idCarpetaEdicion), {
        nombre,
        carpetaPadreId: carpetaPadreId || null,
        fechaActualizacion: new Date().toISOString(),
        fechaActualizacionServidor: serverTimestamp()
      });
    } else {
      const creada = await addDoc(refCarpetas(), {
        nombre,
        carpetaPadreId: carpetaPadreId || null,
        fechaCreacion: new Date().toISOString(),
        fechaActualizacionServidor: serverTimestamp()
      });
      carpetasCerradas.delete(creada.id);
    }
    cerrarDialogoCarpeta();
    await cargarCarpetas();
  } catch (err) {
    console.error("[APUNTES] No se pudo guardar la carpeta", err);
    error.textContent = ETIQUETA_ERROR;
  } finally {
    ponerBotonOcupado(boton, false);
  }
}

async function eliminarCarpeta(carpetaId) {
  const carpeta = carpetas.find((item) => item.id === carpetaId);
  if (!carpeta) return;
  const cantidadLocal = apuntes.filter((apunte) => apunte.carpetaId === carpetaId).length;
  const cantidadHijas = carpetas.filter((item) => item.carpetaPadreId === carpetaId).length;
  const padreDestino = normalizarCarpetaPadreId(carpeta.carpetaPadreId, carpetas, carpeta.id) || null;
  const destino = padreDestino ? "su carpeta superior" : "la raíz";
  const detalle = [
    cantidadLocal ? ` Sus ${cantidadLocal} apuntes pasarán a ${destino}.` : "",
    cantidadHijas ? ` Sus ${cantidadHijas} subcarpetas se moverán a ${destino}.` : ""
  ].join("");
  if (!window.confirm(`¿Eliminar la carpeta “${carpeta.nombre}”?${detalle}`)) return;
  if (!confirmarDescartarCambios()) return;

  eliminandoCarpeta = true;
  ponerEdicionOcupada(true);
  ponerEstado("Eliminando carpeta...");
  try {
    while (true) {
      const [snapActual, snapHijas] = await Promise.all([
        getDocs(query(refApuntes(), where("carpetaId", "==", carpetaId))),
        getDocs(query(refCarpetas(), where("carpetaPadreId", "==", carpetaId)))
      ]);
      const movimientos = [
        ...snapActual.docs.map((apunte) => ({ tipo: "apunte", referencia: apunte.ref })),
        ...snapHijas.docs.map((hija) => ({ tipo: "carpeta", referencia: hija.ref }))
      ].slice(0, TAMANO_LOTE);
      const finalizar = movimientos.length === snapActual.docs.length + snapHijas.docs.length;
      const referenciaCarpeta = doc(db, "usuarios", uidMedico, "carpetasApuntes", carpetaId);

      await runTransaction(db, async (transaccion) => {
        const referencias = finalizar
          ? [...movimientos.map((movimiento) => movimiento.referencia), referenciaCarpeta]
          : movimientos.map((movimiento) => movimiento.referencia);
        const lecturas = await Promise.all(referencias.map((referencia) => transaccion.get(referencia)));
        const fechaMovimiento = new Date().toISOString();

        lecturas.slice(0, movimientos.length).forEach((documentoActual, indice) => {
          if (!documentoActual.exists()) return;
          const datos = documentoActual.data();
          if (movimientos[indice].tipo === "carpeta") {
            if (datos.carpetaPadreId === carpetaId) {
              transaccion.update(documentoActual.ref, {
                carpetaPadreId: padreDestino,
                fechaActualizacion: fechaMovimiento,
                fechaActualizacionServidor: serverTimestamp()
              });
            }
            return;
          }
          if (datos.carpetaId !== carpetaId) return;
          const cambios = {
            carpetaId: padreDestino,
            fechaActualizacion: fechaMovimiento,
            fechaActualizacionServidor: serverTimestamp()
          };
          if (datos.contenidoHtml && datos.contenidoHtmlActualizado === datos.fechaActualizacion) cambios.contenidoHtmlActualizado = fechaMovimiento;
          if (datos.objetosLienzo && datos.objetosLienzoActualizado === datos.fechaActualizacion) cambios.objetosLienzoActualizado = fechaMovimiento;
          transaccion.update(documentoActual.ref, cambios);
        });

        const carpetaActual = finalizar ? lecturas.at(-1) : null;
        if (carpetaActual?.exists()) transaccion.delete(referenciaCarpeta);
      });
      if (finalizar) break;
    }

    carpetasCerradas.delete(carpetaId);
    guardarEstadoCarpetas();
    hayCambiosSinGuardar = false;
    await cargarDatos({ seleccionarId: document.getElementById("apunteId")?.value || "" });
  } catch (error) {
    console.error("[APUNTES] No se pudo eliminar la carpeta", error);
    ponerEstado(ETIQUETA_ERROR, true);
  } finally {
    eliminandoCarpeta = false;
    ponerEdicionOcupada(false);
  }
}

function marcarCambios() {
  hayCambiosSinGuardar = true;
  ponerEstado("Cambios sin guardar");
}

function confirmarDescartarCambios() {
  return !hayCambiosSinGuardar || window.confirm(ETIQUETAS_DESCARTAR);
}

function ponerEstado(texto, esError = false) {
  const estado = document.getElementById("estadoApuntes");
  if (!estado) return;
  estado.textContent = texto;
  estado.dataset.error = esError ? "true" : "false";
}

function ponerBotonOcupado(boton, ocupado, etiquetaTemporal = "") {
  if (!boton) return;
  if (ocupado) {
    boton.dataset.etiquetaOriginal = boton.textContent;
    boton.textContent = etiquetaTemporal || boton.textContent;
  } else if (boton.dataset.etiquetaOriginal) {
    boton.textContent = boton.dataset.etiquetaOriginal;
    delete boton.dataset.etiquetaOriginal;
  }
  boton.disabled = ocupado;
}

function ponerEdicionOcupada(ocupada) {
  const editor = obtenerEditor();
  const lienzo = document.getElementById("lienzoApunte");
  const panel = document.querySelector(".apuntes-editor");
  const lista = document.getElementById("listaApuntes");
  const controles = [
    document.getElementById("apunteTitulo"),
    document.getElementById("guardarApunte"),
    document.getElementById("eliminarApunte"),
    document.getElementById("nuevoApunte"),
    ...document.querySelectorAll(".barra-formato button, .barra-formato input, .menu-insertar button, .panel-objeto button, .panel-objeto input, .panel-objeto select, .menu-exportacion button")
  ].filter(Boolean);

  controles.forEach((control) => { control.disabled = ocupada; });
  if (ocupada) cerrarPaletasColor();
  actualizarDisponibilidadCarpetas(ocupada);
  if (editor) editor.contentEditable = String(!ocupada);
  if (lienzo) lienzo.inert = ocupada;
  if (lista) lista.inert = ocupada;
  panel?.setAttribute("aria-busy", String(ocupada));
}

function actualizarDisponibilidadCarpetas(interfazOcupada = false) {
  const deshabilitadas = interfazOcupada || !carpetasDisponibles;
  const selector = document.getElementById("apunteCarpeta");
  const nueva = document.getElementById("nuevaCarpeta");
  if (selector) selector.disabled = deshabilitadas;
  if (nueva) {
    nueva.disabled = deshabilitadas;
    nueva.title = carpetasDisponibles ? "Crear carpeta" : "Las carpetas no están disponibles";
  }
}

function obtenerEditor() {
  return document.getElementById("apunteContenido");
}

function inicializarObjetosApunteUI() {
  objetosApunteController = inicializarObjetosApunte({
    lienzo: document.getElementById("lienzoApunte"),
    capaDelante: document.getElementById("objetosApunteDelante"),
    capaDetras: document.getElementById("objetosApunteDetras"),
    menuContextual: document.getElementById("menuContextualObjeto"),
    alCambiar: () => {
      actualizarPanelObjetos();
      marcarCambios();
    },
    alSeleccionar: () => actualizarPanelObjetos()
  });
  actualizarPanelObjetos();
}

function insertarObjetoApunte(tipo) {
  if (guardandoApunte || eliminandoApunte || eliminandoCarpeta || !objetosApunteController) return;
  cerrarMenuInsertar();
  cerrarMenuExportacion();
  cerrarPaletasColor();
  const objeto = objetosApunteController.agregar(tipo);
  actualizarPanelObjetos();
  requestAnimationFrame(() => {
    if (tipo !== "texto") return;
    [...document.querySelectorAll("[data-objeto-id]")]
      .find((elemento) => elemento.dataset.objetoId === objeto.id)
      ?.querySelector(".objeto-apunte__texto")?.focus();
  });
}

function objetosDisponibles() {
  return objetosApunteController?.serializar?.().objetos || [];
}

function actualizarPanelObjetos() {
  const selector = document.getElementById("selectorObjeto");
  const ajuste = document.getElementById("ajusteObjeto");
  const color = document.getElementById("colorObjeto");
  const eliminar = document.getElementById("eliminarObjeto");
  const ayuda = document.getElementById("ayudaObjeto");
  const seleccion = objetosApunteController?.obtenerSeleccionado?.() || null;
  const objetos = objetosDisponibles();
  if (selector) {
    selector.replaceChildren(...objetos.map((objeto, indice) => {
      const opcion = document.createElement("option");
      opcion.value = objeto.id;
      opcion.textContent = `${objeto.tipo === "flecha" ? "Flecha" : "Cuadro de texto"} ${indice + 1}`;
      return opcion;
    }));
    selector.value = seleccion?.id || "";
    selector.disabled = !objetos.length;
  }
  if (ajuste) {
    ajuste.value = seleccion?.ajuste || "delante";
    ajuste.disabled = !seleccion;
  }
  if (color) {
    color.value = seleccion?.color || "#f6e8d5";
    color.disabled = !seleccion;
  }
  if (eliminar) eliminar.disabled = !seleccion;
  if (ayuda) {
    ayuda.textContent = seleccion
      ? seleccion.tipo === "flecha"
        ? "Arrastra un extremo hacia un cuadro para conectarlo. El punto central mueve la flecha y los extremos la giran."
        : "Usa la cruz sobre el objeto para moverlo; arrastra sus aristas o vértices para cambiar el tamaño."
      : objetos.length
        ? "Selecciona un objeto de la lista para ajustar su capa y color."
        : "Inserta un cuadro o una flecha para empezar.";
  }
}

function abrirPropiedadesObjeto() {
  const panel = document.getElementById("propiedadesObjeto");
  const boton = document.getElementById("abrirPropiedadesObjeto");
  if (!panel || !boton) return;
  cerrarMenuInsertar();
  cerrarMenuExportacion();
  cerrarPaletasColor();
  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  actualizarPanelObjetos();
}

function cerrarPropiedadesObjeto({ devolverFoco = false } = {}) {
  const panel = document.getElementById("propiedadesObjeto");
  const boton = document.getElementById("abrirPropiedadesObjeto");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function alternarPropiedadesObjeto() {
  const panel = document.getElementById("propiedadesObjeto");
  if (!panel || document.getElementById("abrirPropiedadesObjeto")?.disabled) return;
  if (panel.hidden) abrirPropiedadesObjeto();
  else cerrarPropiedadesObjeto();
}

function seleccionarObjetoDesdePanel(evento) {
  objetosApunteController?.seleccionar(evento.target.value);
}

function actualizarAjusteObjeto(evento) {
  const objeto = objetosApunteController?.obtenerSeleccionado?.();
  if (objeto) objetosApunteController.actualizar(objeto.id, { ajuste: evento.target.value });
}

function actualizarColorObjeto(evento) {
  const objeto = objetosApunteController?.obtenerSeleccionado?.();
  if (objeto) objetosApunteController.actualizar(objeto.id, { color: evento.target.value });
}

function eliminarObjetoSeleccionado() {
  if (!objetosApunteController?.obtenerSeleccionado?.()) return;
  if (!window.confirm("¿Eliminar el objeto seleccionado?")) return;
  objetosApunteController.eliminarSeleccionado();
}

function modeloExportacionApunte() {
  return {
    titulo: document.getElementById("apunteTitulo")?.value.trim() || "Apunte",
    contenidoHtml: sanitizarHTMLRico(obtenerEditor()?.innerHTML || ""),
    objetos: objetosDisponibles()
  };
}

function alternarMenuExportacion() {
  const menu = document.getElementById("menuExportacionApunte");
  const boton = document.getElementById("abrirExportacionApunte");
  if (!menu || !boton || boton.disabled) return;
  const estabaAbierto = !menu.hidden;
  cerrarPaletasColor();
  cerrarPropiedadesObjeto();
  cerrarMenuInsertar();
  menu.hidden = estabaAbierto;
  boton.setAttribute("aria-expanded", String(!estabaAbierto));
}

function cerrarMenuExportacion({ devolverFoco = false } = {}) {
  const menu = document.getElementById("menuExportacionApunte");
  const boton = document.getElementById("abrirExportacionApunte");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function abrirMenuInsertar() {
  const menu = document.getElementById("menuInsertarApunte");
  const boton = document.getElementById("abrirInsertarApunte");
  if (!menu || !boton) return;
  cerrarPaletasColor();
  cerrarPropiedadesObjeto();
  cerrarMenuExportacion();
  menu.hidden = false;
  boton.setAttribute("aria-expanded", "true");
}

function cerrarMenuInsertar({ devolverFoco = false } = {}) {
  const menu = document.getElementById("menuInsertarApunte");
  const boton = document.getElementById("abrirInsertarApunte");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function alternarMenuInsertar() {
  const menu = document.getElementById("menuInsertarApunte");
  const boton = document.getElementById("abrirInsertarApunte");
  if (!menu || !boton || boton.disabled) return;
  if (menu.hidden) abrirMenuInsertar();
  else cerrarMenuInsertar();
}

async function exportarApunte(formato) {
  if (guardandoApunte || eliminandoApunte) return;
  const datos = modeloExportacionApunte();
  const boton = document.getElementById(formato === "pdf" ? "descargarApuntePdf" : "descargarApunteWord");
  try {
    ponerBotonOcupado(boton, true, "Preparando...");
    if (formato === "pdf") await descargarApuntePdf(datos);
    else descargarApunteWord(datos);
    ponerEstado(`Descarga ${formato.toUpperCase()} iniciada`);
    cerrarMenuExportacion();
  } catch (error) {
    console.error("[APUNTES] No se pudo exportar el apunte", error);
    ponerEstado(`No se pudo crear el archivo ${formato.toUpperCase()}.`, true);
  } finally {
    ponerBotonOcupado(boton, false);
  }
}

function obtenerCarpetaActual() {
  return document.getElementById("apunteCarpeta")?.value || "";
}

function obtenerContenidoPlano() {
  const textoPrincipal = (obtenerEditor()?.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
  const textoObjetos = textoObjetosApunte(objetosApunteController?.serializar?.().objetos || []);
  return [textoPrincipal, textoObjetos].filter(Boolean).join(textoPrincipal && textoObjetos ? "\n\n" : "").trimEnd();
}

function normalizarEditorVacio() {
  const editor = obtenerEditor();
  if (editor && !obtenerContenidoPlano()) editor.innerHTML = "";
}

function guardarSeleccionEditor() {
  const editor = obtenerEditor();
  const seleccion = window.getSelection();
  if (!editor || !seleccion?.rangeCount) return;

  const rango = seleccion.getRangeAt(0);
  if (editor.contains(rango.commonAncestorContainer)) {
    seleccionEditor = rango.cloneRange();
    actualizarEstadoFormato();
  }
}

function restaurarSeleccionEditor() {
  const editor = obtenerEditor();
  if (!editor) return false;
  editor.focus();

  if (!seleccionEditor || !editor.contains(seleccionEditor.commonAncestorContainer)) return true;
  const seleccion = window.getSelection();
  seleccion.removeAllRanges();
  seleccion.addRange(seleccionEditor);
  return true;
}

function conservarFocoEditor(evento) {
  evento.preventDefault();
}

function ejecutarFormato(comando, valor = null) {
  if (!restaurarSeleccionEditor()) return false;
  let aplicado = false;
  try {
    aplicado = document.execCommand(comando, false, valor);
    if (!aplicado && comando === "hiliteColor") {
      aplicado = document.execCommand("backColor", false, valor);
    }
    if (aplicado) marcarCambios();
  } catch (error) {
    console.warn(`[APUNTES] El formato ${comando} no está disponible`, error);
  }
  guardarSeleccionEditor();
  actualizarEstadoFormato();
  return aplicado;
}

function quitarResaltadoSeleccion() {
  return ejecutarFormato("hiliteColor", "transparent");
}

function colorTextoAutomatico(fondo) {
  const color = normalizarColorHex(fondo);
  if (!color) return "";
  const componentes = [1, 3, 5].map((indice) => Number.parseInt(color.slice(indice, indice + 2), 16) / 255);
  const [rojo, verde, azul] = componentes.map((componente) => componente <= 0.04045
    ? componente / 12.92
    : ((componente + 0.055) / 1.055) ** 2.4);
  const luminancia = (0.2126 * rojo) + (0.7152 * verde) + (0.0722 * azul);
  return luminancia > 0.4 ? "#111827" : "#f8fafc";
}

function actualizarMuestraFondoApunte() {
  const muestra = document.querySelector(".control-color__muestra--lienzo");
  if (!muestra) return;
  muestra.style.backgroundColor = fondoApunteActual || "var(--apuntes-superficie-suave)";
}

function aplicarFondoApunte(color, { marcar = true } = {}) {
  const fondo = normalizarColorHex(color);
  const lienzo = document.getElementById("lienzoApunte");
  fondoApunteActual = fondo;
  if (lienzo) {
    if (fondo) {
      lienzo.style.setProperty("--apunte-fondo", fondo);
      lienzo.style.setProperty("--apunte-texto", colorTextoAutomatico(fondo));
    } else {
      lienzo.style.removeProperty("--apunte-fondo");
      lienzo.style.removeProperty("--apunte-texto");
    }
  }
  const control = document.getElementById("colorFondoApunte");
  if (control && fondo) control.value = fondo;
  actualizarMuestraFondoApunte();
  if (marcar) marcarCambios();
}

function alternarSeccionEditor(seccion) {
  const configuracion = seccion === "titulo"
    ? { contenidoId: "camposCabeceraApunte", botonId: "alternarTituloApunte", mostrar: "Mostrar título y carpeta", ocultar: "Ocultar título y carpeta" }
    : { contenidoId: "barraFormatoApunte", botonId: "alternarBarraFormato", mostrar: "Mostrar barra de opciones", ocultar: "Ocultar barra de opciones" };
  const contenido = document.getElementById(configuracion.contenidoId);
  const boton = document.getElementById(configuracion.botonId);
  if (!contenido || !boton) return;
  contenido.hidden = !contenido.hidden;
  const expandido = !contenido.hidden;
  boton.setAttribute("aria-expanded", String(expandido));
  boton.setAttribute("aria-label", expandido ? configuracion.ocultar : configuracion.mostrar);
  boton.title = expandido ? configuracion.ocultar : configuracion.mostrar;
  if (!expandido && seccion === "formato") {
    cerrarPaletasColor();
    cerrarMenuContextualTexto();
  }
}

function obtenerListaSeleccionada() {
  const seleccion = window.getSelection();
  if (!seleccion?.rangeCount) return null;
  const nodo = seleccion.getRangeAt(0).commonAncestorContainer;
  const elemento = nodo.nodeType === Node.ELEMENT_NODE ? nodo : nodo.parentElement;
  return elemento?.closest?.("ol, ul") || null;
}

function ejecutarLista(tipo) {
  const comando = tipo === "puntos" ? "insertUnorderedList" : "insertOrderedList";
  if (!ejecutarFormato(comando)) return;
  if (tipo !== "letras") return;
  const lista = obtenerListaSeleccionada();
  if (lista?.tagName === "OL") {
    lista.setAttribute("type", "a");
    marcarCambios();
  }
}

function inicializarSelectorColores() {
  const temaClaro = document.documentElement.dataset.theme === "light";
  const colorTexto = document.getElementById("colorTexto");
  const colorFondo = document.getElementById("colorFondoTexto");
  if (colorTexto) colorTexto.value = temaClaro ? "#17211b" : "#f6e8d5";
  if (colorFondo) colorFondo.value = temaClaro ? "#fff0a6" : "#7a4d16";

  Object.entries(CONFIGURACION_COLORES).forEach(([tipo, configuracion]) => {
    const boton = document.getElementById(configuracion.botonId);
    const panel = document.getElementById(configuracion.panelId);
    const control = document.getElementById(configuracion.controlId);

    actualizarMuestraColor(tipo, control?.value || "");
    renderizarCuadriculaColores(
      panel?.querySelector(`[data-colores-predefinidos="${tipo}"]`),
      COLORES_PREDEFINIDOS[tipo],
      tipo,
      "sugerido"
    );

    boton?.addEventListener("pointerdown", conservarFocoEditor);
    boton?.addEventListener("click", (evento) => {
      evento.stopPropagation();
      alternarPaletaColor(tipo);
    });

    panel?.addEventListener("pointerdown", (evento) => {
      if (evento.target instanceof Element && evento.target.closest("button[data-color]")) {
        evento.preventDefault();
      }
    });
    panel?.addEventListener("click", (evento) => {
      const botonColor = evento.target instanceof Element ? evento.target.closest("button[data-color]") : null;
      if (!botonColor) return;
      evento.preventDefault();
      evento.stopPropagation();
      aplicarColor(tipo, botonColor.dataset.color || "");
    });

    control?.addEventListener("input", () => actualizarMuestraColor(tipo, control.value));
    control?.addEventListener("change", () => aplicarColor(tipo, control.value));
  });

  const botonFondoApunte = document.getElementById("abrirFondoApunte");
  const paletaFondoApunte = document.getElementById("paletaFondoApunte");
  const controlFondoApunte = document.getElementById("colorFondoApunte");
  botonFondoApunte?.addEventListener("pointerdown", conservarFocoEditor);
  botonFondoApunte?.addEventListener("click", alternarPaletaFondoApunte);
  paletaFondoApunte?.addEventListener("pointerdown", (evento) => {
    if (evento.target instanceof Element && evento.target.closest("button[data-fondo-apunte]")) evento.preventDefault();
  });
  paletaFondoApunte?.addEventListener("click", (evento) => {
    const boton = evento.target instanceof Element ? evento.target.closest("button[data-fondo-apunte]") : null;
    if (!boton) return;
    evento.preventDefault();
    aplicarFondoApunte(boton.dataset.fondoApunte || "");
    cerrarPaletaFondoApunte();
  });
  controlFondoApunte?.addEventListener("change", () => {
    aplicarFondoApunte(controlFondoApunte.value);
    cerrarPaletaFondoApunte();
  });
  document.getElementById("restablecerFondoApunte")?.addEventListener("click", () => {
    aplicarFondoApunte("");
    cerrarPaletaFondoApunte();
  });
  actualizarMuestraFondoApunte();

  renderizarColoresRecientes();
  document.addEventListener("click", cerrarPaletasAlHacerClickFuera);
  document.addEventListener("keydown", cerrarPaletasConEscape);
}

function alternarPaletaFondoApunte() {
  const panel = document.getElementById("paletaFondoApunte");
  const boton = document.getElementById("abrirFondoApunte");
  if (!panel || !boton || boton.disabled) return;
  const estabaAbierta = !panel.hidden;
  cerrarPaletasColor();
  cerrarMenuContextualTexto();
  if (estabaAbierta) return;
  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  posicionarPaletaColor(panel, boton);
}

function cerrarPaletaFondoApunte({ devolverFoco = false } = {}) {
  const panel = document.getElementById("paletaFondoApunte");
  const boton = document.getElementById("abrirFondoApunte");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function alternarPaletaColor(tipo) {
  const configuracion = CONFIGURACION_COLORES[tipo];
  const boton = document.getElementById(configuracion?.botonId);
  const panel = document.getElementById(configuracion?.panelId);
  if (!configuracion || !boton || !panel || boton.disabled) return;

  const estabaAbierta = !panel.hidden;
  cerrarPaletasColor();
  cerrarPaletaFondoApunte();
  if (estabaAbierta) return;

  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  posicionarPaletaColor(panel, boton);
}

function posicionarPaletaColor(panel, boton) {
  const editor = document.querySelector(".apuntes-editor");
  if (!editor) return;

  const rectEditor = editor.getBoundingClientRect();
  const rectBoton = boton.getBoundingClientRect();
  const anchoPanel = panel.getBoundingClientRect().width;
  const margen = 10;
  const izquierdaIdeal = rectBoton.left - rectEditor.left;
  const izquierdaMaxima = Math.max(margen, rectEditor.width - anchoPanel - margen);
  const izquierda = Math.min(Math.max(izquierdaIdeal, margen), izquierdaMaxima);

  panel.style.left = `${Math.round(izquierda)}px`;
  panel.style.top = `${Math.round(rectBoton.bottom - rectEditor.top + 8)}px`;
}

function cerrarPaletasColor({ devolverFoco = false } = {}) {
  Object.values(CONFIGURACION_COLORES).forEach((configuracion) => {
    const boton = document.getElementById(configuracion.botonId);
    const panel = document.getElementById(configuracion.panelId);
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    boton?.setAttribute("aria-expanded", "false");
    if (devolverFoco) boton?.focus();
  });
  cerrarPaletaFondoApunte({ devolverFoco });
}

function cerrarPaletasAlHacerClickFuera(evento) {
  const destino = evento.target;
  if (destino instanceof Element && destino.closest(".selector-color, .paleta-color, .menu-contextual-texto, .menu-insertar, .panel-objeto, .menu-exportacion, #abrirInsertarApunte, #abrirPropiedadesObjeto, #abrirExportacionApunte")) return;
  cerrarPaletasColor();
  cerrarMenuContextualTexto();
  cerrarMenuInsertar();
  cerrarPropiedadesObjeto();
  cerrarMenuExportacion();
}

function cerrarPaletasConEscape(evento) {
  const hayPanelAbierto = Object.values(CONFIGURACION_COLORES).some((configuracion) => !document.getElementById(configuracion.panelId)?.hidden)
    || !document.getElementById("paletaFondoApunte")?.hidden
    || !document.getElementById("menuContextualTexto")?.hidden
    || !document.getElementById("propiedadesObjeto")?.hidden
    || !document.getElementById("menuInsertarApunte")?.hidden
    || !document.getElementById("menuExportacionApunte")?.hidden;
  if (evento.key !== "Escape" || !hayPanelAbierto) return;
  evento.preventDefault();
  cerrarPaletasColor({ devolverFoco: true });
  cerrarMenuContextualTexto({ devolverFoco: true });
  cerrarMenuInsertar({ devolverFoco: true });
  cerrarPropiedadesObjeto({ devolverFoco: true });
  cerrarMenuExportacion({ devolverFoco: true });
}

function abrirMenuContextualTexto(evento) {
  const editor = obtenerEditor();
  const menu = document.getElementById("menuContextualTexto");
  const contenedor = document.querySelector(".apuntes-editor");
  if (!editor || !menu || !contenedor || guardandoApunte || eliminandoApunte) return;
  evento.preventDefault();
  guardarSeleccionEditor();
  cerrarPaletasColor();
  cerrarMenuInsertar();
  cerrarPropiedadesObjeto();
  cerrarMenuExportacion();

  const rectContenedor = contenedor.getBoundingClientRect();
  const ancho = menu.offsetWidth || 238;
  const alto = menu.offsetHeight || 170;
  const izquierda = Math.min(Math.max(8, evento.clientX - rectContenedor.left), Math.max(8, rectContenedor.width - ancho - 8));
  const arriba = Math.min(Math.max(8, evento.clientY - rectContenedor.top), Math.max(8, rectContenedor.height - alto - 8));
  menu.style.left = `${Math.round(izquierda)}px`;
  menu.style.top = `${Math.round(arriba)}px`;
  menu.hidden = false;
}

function cerrarMenuContextualTexto({ devolverFoco = false } = {}) {
  const menu = document.getElementById("menuContextualTexto");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (devolverFoco) restaurarSeleccionEditor();
}

function ejecutarAccionMenuContextualTexto(evento) {
  const boton = evento.target instanceof Element ? evento.target.closest("button[data-accion-texto]") : null;
  const accion = boton?.dataset.accionTexto;
  if (!accion) return;
  evento.preventDefault();
  cerrarMenuContextualTexto();
  if (accion === "texto") return alternarPaletaColor("texto");
  if (accion === "resaltar") return alternarPaletaColor("fondo");
  if (accion === "fondo-apunte") return alternarPaletaFondoApunte();
  if (accion === "bold") return ejecutarFormato("bold");
  if (accion === "quitar-resaltado") return quitarResaltadoSeleccion();
  if (accion === "limpiar") return ejecutarFormato("removeFormat");
  if (accion === "sublista") return ejecutarFormato("indent");
  if (accion === "reducir-sublista") return ejecutarFormato("outdent");
  return ejecutarLista(accion);
}

function aplicarColor(tipo, color) {
  const configuracion = CONFIGURACION_COLORES[tipo];
  const colorSeguro = normalizarColorHex(color);
  if (!configuracion || !colorSeguro) return false;

  const control = document.getElementById(configuracion.controlId);
  if (control) control.value = colorSeguro;
  actualizarMuestraColor(tipo, colorSeguro);
  const aplicado = ejecutarFormato(configuracion.comando, colorSeguro);

  coloresRecientes = registrarColorReciente(coloresRecientes, colorSeguro);
  guardarColoresRecientes();
  renderizarCuadriculaColores(
    document.getElementById(configuracion.panelId)?.querySelector(`[data-colores-predefinidos="${tipo}"]`),
    COLORES_PREDEFINIDOS[tipo],
    tipo,
    "sugerido"
  );
  renderizarColoresRecientes();
  cerrarPaletasColor();
  return aplicado;
}

function actualizarMuestraColor(tipo, color) {
  const configuracion = CONFIGURACION_COLORES[tipo];
  const colorSeguro = normalizarColorHex(color);
  if (!configuracion || !colorSeguro) return;

  const muestra = document.querySelector(configuracion.muestraSelector);
  const boton = document.getElementById(configuracion.botonId);
  if (muestra) muestra.style[configuracion.propiedadMuestra] = colorSeguro;
  if (boton) {
    boton.style.setProperty("--color-activo", colorSeguro);
    boton.setAttribute("aria-label", `${configuracion.etiqueta}: ${colorSeguro}. Abrir paleta de colores`);
  }
}

function renderizarColoresRecientes() {
  Object.entries(CONFIGURACION_COLORES).forEach(([tipo, configuracion]) => {
    renderizarCuadriculaColores(
      document.getElementById(configuracion.recientesId),
      coloresRecientes,
      tipo,
      "reciente"
    );
  });
}

function renderizarCuadriculaColores(destino, colores, tipo, origen) {
  if (!destino) return;
  destino.replaceChildren();

  const lista = origen === "reciente"
    ? normalizarColoresRecientes(colores)
    : [...new Set((Array.isArray(colores) ? colores : []).map(normalizarColorHex).filter(Boolean))];
  if (!lista.length) {
    const vacio = document.createElement("span");
    vacio.className = "paleta-color__sin-recientes";
    vacio.textContent = origen === "reciente" ? "Aún no has usado colores." : "Sin colores disponibles.";
    destino.append(vacio);
    return;
  }

  const colorActual = normalizarColorHex(document.getElementById(CONFIGURACION_COLORES[tipo].controlId)?.value || "");
  lista.forEach((color) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "opcion-color";
    boton.dataset.color = color;
    boton.dataset.tipoColor = tipo;
    boton.style.setProperty("--color-muestra", color);
    boton.setAttribute("aria-label", `Aplicar ${color} como ${CONFIGURACION_COLORES[tipo].etiqueta.toLowerCase()}`);
    boton.setAttribute("aria-pressed", String(color === colorActual));
    boton.title = color;
    destino.append(boton);
  });
}

function claveColoresRecientes() {
  return `cognicion:apuntes:colores-recientes:${uidMedico}`;
}

function recuperarColoresRecientes() {
  try {
    coloresRecientes = normalizarColoresRecientes(JSON.parse(localStorage.getItem(claveColoresRecientes()) || "[]"));
  } catch (_) {
    coloresRecientes = [];
  }
}

function guardarColoresRecientes() {
  try {
    localStorage.setItem(claveColoresRecientes(), JSON.stringify(coloresRecientes));
  } catch (_) {
    // La paleta sigue funcionando aunque el navegador no permita almacenamiento local.
  }
}

function actualizarEstadoFormato() {
  const negrita = document.getElementById("formatoNegrita");
  if (!negrita) return;
  try {
    negrita.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
  } catch (_) {
    negrita.setAttribute("aria-pressed", "false");
  }
}

function gestionarAtajosEditor(evento) {
  const tecla = evento.key.toLocaleLowerCase("es");
  if (tecla === "tab" && obtenerListaSeleccionada()) {
    evento.preventDefault();
    ejecutarFormato(evento.shiftKey ? "outdent" : "indent");
    return;
  }
  if ((evento.ctrlKey || evento.metaKey) && tecla === "b") {
    evento.preventDefault();
    guardarSeleccionEditor();
    ejecutarFormato("bold");
  }
  if ((evento.ctrlKey || evento.metaKey) && tecla === "s") {
    evento.preventDefault();
    void guardarApunte();
  }
}

function pegarComoTextoSeguro(evento) {
  const texto = evento.clipboardData?.getData("text/plain");
  if (texto === undefined) return;
  evento.preventDefault();
  document.execCommand("insertText", false, texto);
}

function claveEstadoCarpetas() {
  return `cognicion:apuntes:carpetas-cerradas:${uidMedico}`;
}

function recuperarEstadoCarpetas() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(claveEstadoCarpetas()) || "[]");
    carpetasCerradas = new Set(Array.isArray(guardadas) ? guardadas.map(String) : []);
  } catch (_) {
    carpetasCerradas = new Set();
  }
}

function guardarEstadoCarpetas() {
  try {
    localStorage.setItem(claveEstadoCarpetas(), JSON.stringify([...carpetasCerradas]));
  } catch (_) {
    // La interfaz sigue funcionando aunque el almacenamiento local esté deshabilitado.
  }
}
