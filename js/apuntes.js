import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { sanitizarHTMLRico } from "./apuntes-rich-text.js?v=20260822-apuntes-interlineado-v1";
import { inicializarSidebarApuntes } from "./apuntes-sidebar.js";
import { inicializarObjetosApunte, textoObjetosApunte } from "./apuntes-objetos.js?v=20260822-apuntes-objetos-estilo-anclas-v1";
import { descargarApuntePdf, descargarApunteWord } from "./apuntes-export.js";
import {
  DISPOSICION_HOJA_PREDETERMINADA,
  etiquetaDisposicionHoja,
  normalizarDisposicionHoja,
  obtenerMedidasHoja
} from "./apuntes-page-layout.js";
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
let disposicionHojaActual = normalizarDisposicionHoja(DISPOSICION_HOJA_PREDETERMINADA);
let frameVistaHoja = 0;
let temporizadorVistaHoja = 0;
let claveVistaHoja = "";
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
    // Evita mostrar primero la hoja predeterminada y después la disposición
    // guardada (un salto especialmente visible cuando la nota usa 400 %).
    document.body.classList.remove("bloqueado");
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
  inicializarDisposicionHojaUI();
  inicializarObjetosApunteUI();

  buscador?.addEventListener("input", renderizarLista);
  document.getElementById("nuevoApunte")?.addEventListener("click", () => {
    if (guardandoApunte || eliminandoApunte) return;
    if (!confirmarDescartarCambios()) return;
    nuevoApunte(obtenerCarpetaActual());
  });
  document.getElementById("nuevaCarpeta")?.addEventListener("click", () => abrirDialogoCarpeta());
  document.getElementById("guardarApunte")?.addEventListener("click", guardarApunte);
  document.getElementById("guardarRapidoApunte")?.addEventListener("click", guardarApunte);
  document.getElementById("guardarApunteArchivo")?.addEventListener("click", () => {
    cerrarMenuExportacion();
    void guardarApunte();
  });
  document.getElementById("eliminarApunte")?.addEventListener("click", eliminarApunte);
  document.getElementById("eliminarApunteArchivo")?.addEventListener("click", () => {
    cerrarMenuExportacion();
    void eliminarApunte();
  });
  document.getElementById("apunteTitulo")?.addEventListener("input", marcarCambios);
  ["apunteCarpeta", "apunteCarpetaArchivo"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (evento) => {
      establecerCarpetaActual(evento.target.value);
      marcarCambios();
    });
  });
  editor?.addEventListener("input", marcarCambios);
  editor?.addEventListener("blur", normalizarEditorVacio);
  editor?.addEventListener("keydown", gestionarAtajosEditor);
  editor?.addEventListener("paste", pegarComoTextoSeguro);
  lista?.addEventListener("click", gestionarClickLista);

  document.getElementById("formatoNegrita")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("formatoNegrita")?.addEventListener("click", () => ejecutarFormato("bold"));
  document.querySelectorAll("[data-editor-command]").forEach((boton) => {
    boton.addEventListener("pointerdown", conservarFocoEditor);
    boton.addEventListener("click", () => {
      const comando = boton.dataset.editorCommand;
      const valor = boton.dataset.editorValue || null;
      if (comando === "paste") {
        navigator.clipboard?.readText?.().then((texto) => {
          if (!texto) return;
          restaurarSeleccionEditor();
          document.execCommand("insertText", false, texto);
          marcarCambios();
        }).catch(() => {});
        return;
      }
      ejecutarFormato(comando, valor);
      cerrarMenusFormatoCompacto();
    });
  });
  document.querySelectorAll("[data-menu-formato-toggle]").forEach((boton) => {
    boton.addEventListener("pointerdown", conservarFocoEditor);
    boton.addEventListener("click", () => alternarMenuFormatoCompacto(boton.dataset.menuFormatoToggle));
  });
  document.addEventListener("pointerdown", (evento) => {
    if (evento.target instanceof Element && evento.target.closest(".grupo-formato-desplegable")) return;
    cerrarMenusFormatoCompacto();
  });
  document.getElementById("quitarFormato")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("quitarFormato")?.addEventListener("click", () => ejecutarFormato("removeFormat"));
  document.getElementById("quitarResaltado")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("quitarResaltado")?.addEventListener("click", quitarResaltadoSeleccion);
  document.getElementById("listaPuntos")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaPuntos")?.addEventListener("click", () => { ejecutarLista("puntos"); cerrarMenusFormatoCompacto(); });
  document.getElementById("listaNumeros")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaNumeros")?.addEventListener("click", () => { ejecutarLista("numeros"); cerrarMenusFormatoCompacto(); });
  document.getElementById("listaLetras")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("listaLetras")?.addEventListener("click", () => { ejecutarLista("letras"); cerrarMenusFormatoCompacto(); });
  document.getElementById("aumentarSublista")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("aumentarSublista")?.addEventListener("click", () => { ejecutarFormato("indent"); cerrarMenusFormatoCompacto(); });
  document.getElementById("reducirSublista")?.addEventListener("pointerdown", conservarFocoEditor);
  document.getElementById("reducirSublista")?.addEventListener("click", () => { ejecutarFormato("outdent"); cerrarMenusFormatoCompacto(); });
  document.getElementById("abrirInsertarApunte")?.addEventListener("click", alternarMenuInsertar);
  document.getElementById("insertarCuadroTexto")?.addEventListener("click", () => insertarObjetoApunte("texto"));
  document.getElementById("insertarFlecha")?.addEventListener("click", () => insertarObjetoApunte("flecha"));
  document.getElementById("abrirPropiedadesObjeto")?.addEventListener("click", alternarPropiedadesObjeto);
  document.getElementById("cerrarPropiedadesObjeto")?.addEventListener("click", cerrarPropiedadesObjeto);
  document.getElementById("selectorObjeto")?.addEventListener("change", seleccionarObjetoDesdePanel);
  document.getElementById("ajusteObjeto")?.addEventListener("change", actualizarAjusteObjeto);
  document.getElementById("colorObjeto")?.addEventListener("change", actualizarColorObjeto);
  ["fondoObjeto", "colorFondoObjeto", "contornoObjeto", "grosorContornoObjeto"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", actualizarEstiloObjeto);
  });
  document.getElementById("eliminarObjeto")?.addEventListener("click", eliminarObjetoSeleccionado);
  document.getElementById("menuContextualObjeto")?.addEventListener("click", gestionarMenuContextualObjeto);
  document.getElementById("menuContextualObjeto")?.addEventListener("change", gestionarMenuContextualObjeto);
  document.getElementById("interlineadoApunte")?.addEventListener("change", (evento) => aplicarInterlineado(evento.target.value));
  document.getElementById("abrirArchivoApunte")?.addEventListener("click", alternarMenuExportacion);
  document.getElementById("descargarApunteWord")?.addEventListener("click", () => exportarApunte("word"));
  document.getElementById("descargarApuntePdf")?.addEventListener("click", () => exportarApunte("pdf"));
  document.getElementById("alternarTituloApunte")?.addEventListener("click", () => alternarSeccionEditor("titulo"));
  document.getElementById("alternarBarraFormato")?.addEventListener("click", () => alternarSeccionEditor("formato"));
  document.getElementById("abrirDisposicionHoja")?.addEventListener("click", alternarDisposicionHoja);
  document.getElementById("cerrarDisposicionHoja")?.addEventListener("click", () => cerrarDisposicionHoja({ devolverFoco: true }));
  document.getElementById("formatoHoja")?.addEventListener("change", aplicarDisposicionDesdeControles);
  document.getElementById("orientacionHoja")?.addEventListener("change", aplicarDisposicionDesdeControles);
  document.getElementById("tamanoFuenteHoja")?.addEventListener("change", aplicarDisposicionDesdeControles);
  document.getElementById("tamanoFuenteRapido")?.addEventListener("change", (evento) => {
    aplicarDisposicionHoja({ ...disposicionHojaActual, tamanioFuente: evento.target.value });
  });
  ["margenSuperiorHoja", "margenDerechoHoja", "margenInferiorHoja", "margenIzquierdoHoja"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", aplicarDisposicionDesdeControles);
  });
  document.getElementById("zoomHojaMenos")?.addEventListener("click", () => cambiarZoomHoja(-25));
  document.getElementById("zoomHojaMas")?.addEventListener("click", () => cambiarZoomHoja(25));
  document.getElementById("zoomHojaMenosVista")?.addEventListener("click", () => cambiarZoomHoja(-25));
  document.getElementById("zoomHojaMasVista")?.addEventListener("click", () => cambiarZoomHoja(25));
  document.getElementById("zoomHojaBarra")?.addEventListener("input", (evento) => {
    aplicarDisposicionHoja({ ...disposicionHojaActual, zoom: evento.target.value });
  });
  document.getElementById("zoomHojaBarraPie")?.addEventListener("input", (evento) => {
    aplicarDisposicionHoja({ ...disposicionHojaActual, zoom: evento.target.value });
  });
  document.getElementById("lienzoApunte")?.addEventListener("wheel", manejarZoomHojaConRueda, { passive: false });
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
  const selectores = [...document.querySelectorAll("#apunteCarpeta, #apunteCarpetaArchivo")];
  if (!selectores.length) return;
  const valorActual = selectores.find((selector) => selector.value)?.value || "";
  const carpetasPlanas = aplanarCarpetasJerarquicas(carpetas);
  const opciones = [
    '<option value="">Sin carpeta</option>',
    ...carpetasPlanas.map((carpeta) => (
      `<option value="${escaparHTML(carpeta.id)}">${"— ".repeat(carpeta.profundidad)}${escaparHTML(carpeta.nombre)}</option>`
    ))
  ].join("");
  const carpetaId = carpetas.some((carpeta) => carpeta.id === valorActual)
    ? valorActual : ETIQUETA_CARPETA_SIN_ASIGNAR;
  selectores.forEach((selector) => {
    selector.innerHTML = opciones;
    selector.value = carpetaId;
  });
}

function establecerCarpetaActual(carpetaId = ETIQUETA_CARPETA_SIN_ASIGNAR) {
  const valor = carpetas.some((carpeta) => carpeta.id === carpetaId)
    ? carpetaId : ETIQUETA_CARPETA_SIN_ASIGNAR;
  document.querySelectorAll("#apunteCarpeta, #apunteCarpetaArchivo").forEach((selector) => {
    selector.value = valor;
  });
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

  const carpetaValida = carpetas.some((carpeta) => carpeta.id === apunte.carpetaId);
  establecerCarpetaActual(carpetaValida ? apunte.carpetaId : ETIQUETA_CARPETA_SIN_ASIGNAR);

  const editor = obtenerEditor();
  const htmlEstaVigente = apunte.contenidoHtml
    && apunte.contenidoHtmlActualizado
    && apunte.contenidoHtmlActualizado === apunte.fechaActualizacion;
  if (editor) {
    if (htmlEstaVigente) editor.innerHTML = sanitizarHTMLRico(apunte.contenidoHtml);
    else editor.textContent = apunte.contenido || "";
  }
  aplicarFondoApunte(apunte.fondoLienzo, { marcar: false });
  aplicarDisposicionHoja(apunte.disposicionHoja, { marcar: false });

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
  establecerCarpetaActual(carpetaValida);

  const editor = obtenerEditor();
  if (editor) editor.innerHTML = "";
  aplicarFondoApunte("", { marcar: false });
  aplicarDisposicionHoja(DISPOSICION_HOJA_PREDETERMINADA, { marcar: false });
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
    disposicionHoja: disposicionHojaActual,
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
    document.getElementById("guardarRapidoApunte"),
    document.getElementById("abrirArchivoApunte"),
    ...document.querySelectorAll(".barra-formato button, .barra-formato input, .barra-formato select, .cinta-formato-contenedor > button, .menu-insertar button, .panel-objeto button, .panel-objeto input, .panel-objeto select, .panel-disposicion-hoja button, .panel-disposicion-hoja input, .panel-disposicion-hoja select, .menu-archivo button, .menu-archivo select")
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
  const nueva = document.getElementById("nuevaCarpeta");
  document.querySelectorAll("#apunteCarpeta, #apunteCarpetaArchivo").forEach((selector) => { selector.disabled = deshabilitadas; });
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
    lienzo: document.getElementById("hojaApunte"),
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
  const fondo = document.getElementById("fondoObjeto");
  const colorFondo = document.getElementById("colorFondoObjeto");
  const contorno = document.getElementById("contornoObjeto");
  const grosor = document.getElementById("grosorContornoObjeto");
  const soloCuadro = document.querySelectorAll("[data-solo-cuadro]");
  const esCuadro = seleccion?.tipo === "texto";
  soloCuadro.forEach((elemento) => { elemento.hidden = !esCuadro; });
  if (fondo) { fondo.value = seleccion?.fondo || "color"; fondo.disabled = !esCuadro; }
  if (colorFondo) { colorFondo.value = seleccion?.colorFondo || "#101814"; colorFondo.disabled = !esCuadro; }
  if (contorno) { contorno.value = seleccion?.contorno || "linea"; contorno.disabled = !esCuadro; }
  if (grosor) { grosor.value = String(seleccion?.grosorContorno ?? 1); grosor.disabled = !esCuadro; }
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
  cerrarDisposicionHoja();
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

function actualizarEstiloObjeto() {
  const objeto = objetosApunteController?.obtenerSeleccionado?.();
  if (!objeto || objeto.tipo !== "texto") return;
  objetosApunteController.actualizar(objeto.id, {
    fondo: document.getElementById("fondoObjeto")?.value || "color",
    colorFondo: document.getElementById("colorFondoObjeto")?.value || "#101814",
    contorno: document.getElementById("contornoObjeto")?.value || "linea",
    grosorContorno: document.getElementById("grosorContornoObjeto")?.value || 1
  });
}

function gestionarMenuContextualObjeto(evento) {
  const control = evento.target instanceof Element ? evento.target.closest("[data-accion-menu-objeto]") : null;
  const accion = control?.dataset.accionMenuObjeto;
  const objeto = objetosApunteController?.obtenerSeleccionado?.();
  if (!accion || !objeto || objeto.tipo !== "texto") return;
  if (accion === "abrir-fondo" || accion === "abrir-contorno") {
    evento.preventDefault();
    evento.stopPropagation();
    const tipo = accion === "abrir-fondo" ? "fondo" : "contorno";
    const submenu = document.querySelector(`[data-submenu-objeto="${tipo}"]`);
    const abrir = Boolean(submenu?.hidden);
    document.querySelectorAll(".menu-contextual-objeto__submenu").forEach((item) => { item.hidden = true; });
    document.querySelectorAll(".menu-contextual-objeto > [data-accion-menu-objeto^='abrir-']").forEach((item) => item.setAttribute("aria-expanded", "false"));
    if (submenu) submenu.hidden = !abrir;
    control.setAttribute("aria-expanded", String(abrir));
    if (tipo === "fondo" && abrir) renderizarPaletaObjeto();
    return;
  }
  if (accion === "fondo-color") {
    evento.preventDefault();
    evento.stopPropagation();
    renderizarPaletaObjeto();
    const paleta = document.querySelector('[data-paleta-objeto="fondo"]');
    if (paleta) paleta.hidden = false;
    return;
  }
  if (accion === "color-aplicar") {
    const color = normalizarColorHex(control.dataset.color || "");
    if (!color) return;
    evento.preventDefault();
    evento.stopPropagation();
    objetosApunteController.actualizar(objeto.id, { fondo: "color", colorFondo: color });
    coloresRecientes = registrarColorReciente(coloresRecientes, color);
    guardarColoresRecientes();
    document.querySelectorAll(".menu-contextual-objeto__submenu").forEach((item) => { item.hidden = true; });
    document.querySelectorAll(".menu-contextual-objeto > [data-accion-menu-objeto^='abrir-']").forEach((item) => item.setAttribute("aria-expanded", "false"));
    actualizarPanelObjetos();
    return;
  }
  const cambios = {
    "fondo-color": { fondo: "color" },
    "fondo-sin": { fondo: "sin-fondo" },
    "contorno-linea": { contorno: "linea" },
    "contorno-punteado": { contorno: "punteado" },
    "contorno-sin": { contorno: "sin-contorno" },
    grosor: { grosorContorno: control.value }
  }[accion];
  if (!cambios) return;
  evento.stopPropagation();
  objetosApunteController.actualizar(objeto.id, cambios);
  actualizarPanelObjetos();
}

function renderizarPaletaObjeto() {
  const destino = document.querySelector('[data-paleta-objeto="fondo"]');
  if (!destino) return;
  destino.replaceChildren();
  const colores = normalizarColoresRecientes(coloresRecientes).concat(COLORES_PREDEFINIDOS.fondo);
  [...new Set(colores)].forEach((color) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.accionMenuObjeto = "color-aplicar";
    boton.dataset.color = color;
    boton.title = color;
    boton.setAttribute("aria-label", `Fondo ${color}`);
    boton.style.setProperty("--color-muestra", color);
    destino.append(boton);
  });
}

function aplicarInterlineado(valor) {
  const numero = Math.min(3, Math.max(1, Number(valor) || 1.5));
  if (!restaurarSeleccionEditor()) return;
  const seleccion = window.getSelection();
  const editor = obtenerEditor();
  const bloques = new Set();
  if (seleccion?.rangeCount && editor) {
    const rango = seleccion.getRangeAt(0);
    editor.querySelectorAll("p, div, li").forEach((bloque) => {
      if (rango.intersectsNode(bloque)) bloques.add(bloque);
    });
  }
  if (!bloques.size && editor) bloques.add(editor);
  bloques.forEach((bloque) => { bloque.style.lineHeight = String(numero); });
  marcarCambios();
  guardarSeleccionEditor();
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
    objetos: objetosDisponibles(),
    disposicionHoja: disposicionHojaActual
  };
}

function alternarMenuExportacion() {
  const menu = document.getElementById("menuArchivoApunte");
  const boton = document.getElementById("abrirArchivoApunte");
  if (!menu || !boton || boton.disabled) return;
  const estabaAbierto = !menu.hidden;
  cerrarPaletasColor();
  cerrarPropiedadesObjeto();
  cerrarMenuInsertar();
  cerrarDisposicionHoja();
  menu.hidden = estabaAbierto;
  boton.setAttribute("aria-expanded", String(!estabaAbierto));
}

function cerrarMenuExportacion({ devolverFoco = false } = {}) {
  const menu = document.getElementById("menuArchivoApunte");
  const boton = document.getElementById("abrirArchivoApunte");
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
  cerrarDisposicionHoja();
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

function cerrarMenusFormatoCompacto(excepto = "") {
  document.querySelectorAll("[data-menu-formato]").forEach((menu) => {
    if (menu.dataset.menuFormato === excepto) return;
    menu.hidden = true;
  });
  document.querySelectorAll("[data-menu-formato-toggle]").forEach((boton) => {
    if (boton.dataset.menuFormatoToggle === excepto) return;
    boton.setAttribute("aria-expanded", "false");
  });
}

function alternarMenuFormatoCompacto(tipo) {
  const menu = document.querySelector(`[data-menu-formato="${tipo}"]`);
  const boton = document.querySelector(`[data-menu-formato-toggle="${tipo}"]`);
  if (!menu || !boton) return;
  const abrir = menu.hidden;
  cerrarMenusFormatoCompacto();
  if (abrir) {
    const rect = boton.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 188)}px`;
    menu.style.top = `${rect.bottom + 5}px`;
  }
  menu.hidden = !abrir;
  boton.setAttribute("aria-expanded", String(abrir));
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
  return document.getElementById("apunteCarpetaArchivo")?.value
    || document.getElementById("apunteCarpeta")?.value
    || "";
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
  const hoja = document.getElementById("hojaApunte");
  fondoApunteActual = fondo;
  if (hoja) {
    if (fondo) {
      hoja.style.setProperty("--apunte-fondo", fondo);
      hoja.style.setProperty("--apunte-texto", colorTextoAutomatico(fondo));
    } else {
      hoja.style.removeProperty("--apunte-fondo");
      hoja.style.removeProperty("--apunte-texto");
    }
  }
  const control = document.getElementById("colorFondoApunte");
  if (control && fondo) control.value = fondo;
  actualizarMuestraFondoApunte();
  if (marcar) marcarCambios();
}

function inicializarDisposicionHojaUI() {
  const shell = document.querySelector(".apuntes-shell");
  // No se observa el lienzo: sus scrollbars forman parte del resultado del zoom y
  // observarlas puede crear un ciclo de tamaño en Windows. Solo reaccionamos a
  // cambios externos de geometría y a los controles que realmente alteran el área.
  window.addEventListener("resize", programarActualizacionVistaHojaEstable, { passive: true });
  if (shell) {
    shell.addEventListener("apuntes:sidebar", () => {
      programarActualizacionVistaHoja({ forzar: true });
    });
  }
  aplicarDisposicionHoja(DISPOSICION_HOJA_PREDETERMINADA, { marcar: false });
}

function programarActualizacionVistaHojaEstable() {
  window.clearTimeout(temporizadorVistaHoja);
  temporizadorVistaHoja = window.setTimeout(() => {
    temporizadorVistaHoja = 0;
    programarActualizacionVistaHoja({ forzar: true });
  }, 120);
}

function programarActualizacionVistaHoja({ forzar = false } = {}) {
  if (forzar) claveVistaHoja = "";
  if (frameVistaHoja) window.cancelAnimationFrame(frameVistaHoja);
  frameVistaHoja = window.requestAnimationFrame(() => {
    frameVistaHoja = 0;
    actualizarVistaHoja();
  });
}

function disposicionDesdeControles() {
  return {
    formato: document.getElementById("formatoHoja")?.value,
    orientacion: document.getElementById("orientacionHoja")?.value,
    tamanioFuente: document.getElementById("tamanoFuenteHoja")?.value,
    zoom: disposicionHojaActual.zoom,
    margenes: {
      superior: document.getElementById("margenSuperiorHoja")?.value,
      derecho: document.getElementById("margenDerechoHoja")?.value,
      inferior: document.getElementById("margenInferiorHoja")?.value,
      izquierdo: document.getElementById("margenIzquierdoHoja")?.value
    }
  };
}

function actualizarControlesDisposicionHoja() {
  const disposicion = disposicionHojaActual;
  const margenes = disposicion.margenes;
  const controles = {
    formatoHoja: disposicion.formato,
    orientacionHoja: disposicion.orientacion,
    tamanoFuenteHoja: String(disposicion.tamanioFuente),
    tamanoFuenteRapido: String(disposicion.tamanioFuente),
    margenSuperiorHoja: String(margenes.superior),
    margenDerechoHoja: String(margenes.derecho),
    margenInferiorHoja: String(margenes.inferior),
    margenIzquierdoHoja: String(margenes.izquierdo)
  };
  Object.entries(controles).forEach(([id, valor]) => {
    const control = document.getElementById(id);
    if (control) control.value = valor;
  });
  const zoom = document.getElementById("zoomHojaValor");
  if (zoom) zoom.textContent = `${disposicion.zoom}%`;
  const barraZoom = document.getElementById("zoomHojaBarra");
  const barraZoomPie = document.getElementById("zoomHojaBarraPie");
  const etiquetaZoomPie = document.getElementById("zoomHojaEtiquetaPie");
  if (barraZoom) barraZoom.value = String(disposicion.zoom);
  if (barraZoomPie) barraZoomPie.value = String(disposicion.zoom);
  if (etiquetaZoomPie) etiquetaZoomPie.textContent = `${disposicion.zoom}%`;
  document.getElementById("lienzoApunte")?.classList.toggle("lienzo-apunte--zoom-alto", disposicion.zoom > 100);
  const etiqueta = etiquetaDisposicionHoja(disposicion);
  const medidas = document.getElementById("medidasHoja");
  if (medidas) medidas.textContent = etiqueta;
}

function actualizarVistaHoja() {
  const visor = document.getElementById("lienzoApunte");
  const hoja = document.getElementById("hojaApunte");
  if (!visor || !hoja) return;
  const medidas = obtenerMedidasHoja(disposicionHojaActual);
  const cajaVisor = visor.getBoundingClientRect();
  // El borde exterior permanece fijo aunque aparezcan ambas barras al usar zoom alto.
  const anchoDisponible = Math.max(240, cajaVisor.width - 48);
  const altoDisponible = Math.max(320, cajaVisor.height - 48);
  const escalaBase = Math.min(anchoDisponible / medidas.anchoMm, altoDisponible / medidas.altoMm);
  const escala = escalaBase * (disposicionHojaActual.zoom / 100);
  const margenes = disposicionHojaActual.margenes;
  const valoresVista = {
    ancho: Math.round(medidas.anchoMm * escala),
    alto: Math.round(medidas.altoMm * escala),
    margenSuperior: Math.round(margenes.superior * escala),
    margenDerecho: Math.round(margenes.derecho * escala),
    margenInferior: Math.round(margenes.inferior * escala),
    margenIzquierdo: Math.round(margenes.izquierdo * escala),
    factorZoom: disposicionHojaActual.zoom / 100,
    escalaVisual: Number(escala.toFixed(5)),
    tamanioFuente: Number((disposicionHojaActual.tamanioFuente * 25.4 * escala / 72).toFixed(2))
  };
  const nuevaClaveVista = Object.values(valoresVista).join("|");
  if (nuevaClaveVista === claveVistaHoja) return;
  claveVistaHoja = nuevaClaveVista;
  hoja.style.setProperty("--hoja-ancho", `${valoresVista.ancho}px`);
  hoja.style.setProperty("--hoja-alto", `${valoresVista.alto}px`);
  hoja.style.setProperty("--margen-superior", `${valoresVista.margenSuperior}px`);
  hoja.style.setProperty("--margen-derecho", `${valoresVista.margenDerecho}px`);
  hoja.style.setProperty("--margen-inferior", `${valoresVista.margenInferior}px`);
  hoja.style.setProperty("--margen-izquierdo", `${valoresVista.margenIzquierdo}px`);
  // 1 pt = 1/72 de pulgada: la fuente se calcula con la misma escala física que la hoja.
  // Así su proporción no cambia cuando el usuario acerca o aleja la vista.
  hoja.style.setProperty("--apunte-factor-zoom", String(valoresVista.factorZoom));
  hoja.style.setProperty("--apunte-escala-visual", String(valoresVista.escalaVisual));
  hoja.style.setProperty("--apunte-tamano-fuente", `${valoresVista.tamanioFuente}px`);
}

function aplicarDisposicionHoja(valor, { marcar = true } = {}) {
  disposicionHojaActual = normalizarDisposicionHoja(valor);
  actualizarControlesDisposicionHoja();
  programarActualizacionVistaHoja({ forzar: true });
  if (marcar) marcarCambios();
}

function aplicarDisposicionDesdeControles() {
  aplicarDisposicionHoja(disposicionDesdeControles());
}

function cambiarZoomHoja(delta) {
  aplicarDisposicionHoja({ ...disposicionHojaActual, zoom: disposicionHojaActual.zoom + delta });
}

function manejarZoomHojaConRueda(evento) {
  if (!evento.ctrlKey) return;
  evento.preventDefault();
  cambiarZoomHoja(evento.deltaY < 0 ? 25 : -25);
}

function abrirDisposicionHoja() {
  const panel = document.getElementById("panelDisposicionHoja");
  const boton = document.getElementById("abrirDisposicionHoja");
  if (!panel || !boton || boton.disabled) return;
  cerrarPaletasColor();
  cerrarMenuContextualTexto();
  cerrarMenuInsertar();
  cerrarPropiedadesObjeto();
  cerrarMenuExportacion();
  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  programarActualizacionVistaHoja({ forzar: true });
}

function cerrarDisposicionHoja({ devolverFoco = false } = {}) {
  const panel = document.getElementById("panelDisposicionHoja");
  const boton = document.getElementById("abrirDisposicionHoja");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function alternarDisposicionHoja() {
  const panel = document.getElementById("panelDisposicionHoja");
  if (!panel || document.getElementById("abrirDisposicionHoja")?.disabled) return;
  if (panel.hidden) abrirDisposicionHoja();
  else cerrarDisposicionHoja();
}

function alternarSeccionEditor(seccion) {
  const configuracion = seccion === "titulo"
    ? { contenidoId: "camposCabeceraApunte", botonId: "alternarTituloApunte", mostrar: "Mostrar título", ocultar: "Ocultar título" }
    : { contenidoId: "barraFormatoApunte", botonId: "alternarBarraFormato", mostrar: "Expandir cinta", ocultar: "Contraer cinta" };
  const contenido = document.getElementById(configuracion.contenidoId);
  const boton = document.getElementById(configuracion.botonId);
  if (!contenido || !boton) return;
  contenido.hidden = !contenido.hidden;
  const expandido = !contenido.hidden;
  boton.setAttribute("aria-expanded", String(expandido));
  boton.setAttribute("aria-label", expandido ? configuracion.ocultar : configuracion.mostrar);
  boton.title = expandido ? configuracion.ocultar : configuracion.mostrar;
  const icono = boton.querySelector("[aria-hidden='true']");
  if (icono) {
    const letra = icono.dataset.collapseLetter || "";
    icono.innerHTML = `${expandido ? "↑" : "↓"}${letra ? `<sub>${letra}</sub>` : ""}`;
  }
  if (seccion === "formato") {
    contenido.parentElement?.classList.toggle("cinta-formato-contenedor--colapsada", !expandido);
  }
  if (!expandido && seccion === "formato") {
    cerrarPaletasColor();
    cerrarMenuContextualTexto();
    cerrarMenusFormatoCompacto();
  }
  programarActualizacionVistaHoja({ forzar: true });
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
  cerrarDisposicionHoja();
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
  cerrarDisposicionHoja();
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
  if (destino instanceof Element && destino.closest(".selector-color, .paleta-color, .menu-contextual-texto, .menu-insertar, .panel-objeto, .panel-disposicion-hoja, .menu-archivo, #abrirInsertarApunte, #abrirPropiedadesObjeto, #abrirDisposicionHoja, #abrirArchivoApunte")) return;
  cerrarPaletasColor();
  cerrarMenuContextualTexto();
  cerrarMenuInsertar();
  cerrarPropiedadesObjeto();
  cerrarDisposicionHoja();
  cerrarMenuExportacion();
}

function cerrarPaletasConEscape(evento) {
  const hayPanelAbierto = Object.values(CONFIGURACION_COLORES).some((configuracion) => !document.getElementById(configuracion.panelId)?.hidden)
    || !document.getElementById("paletaFondoApunte")?.hidden
    || !document.getElementById("menuContextualTexto")?.hidden
    || !document.getElementById("propiedadesObjeto")?.hidden
    || !document.getElementById("panelDisposicionHoja")?.hidden
    || !document.getElementById("menuInsertarApunte")?.hidden
    || !document.getElementById("menuArchivoApunte")?.hidden;
  if (evento.key !== "Escape" || !hayPanelAbierto) return;
  evento.preventDefault();
  cerrarPaletasColor({ devolverFoco: true });
  cerrarMenuContextualTexto({ devolverFoco: true });
  cerrarMenuInsertar({ devolverFoco: true });
  cerrarPropiedadesObjeto({ devolverFoco: true });
  cerrarDisposicionHoja({ devolverFoco: true });
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
  const ancho = menu.offsetWidth || 176;
  const alto = menu.offsetHeight || 320;
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
