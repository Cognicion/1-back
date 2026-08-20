import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { sanitizarHTMLRico } from "./apuntes-rich-text.js";
import {
  actualizarApunteConRevision,
  eliminarApunteConRevision,
  esConflictoApunte,
  esErrorConexionApunte
} from "./services/apuntesMedicoPersistence.js";
import {
  agruparApuntes,
  crearVistaPreviaApunte,
  escaparHTML,
  filtrarApuntes,
  nombreCarpetaDisponible,
  normalizarTexto,
  obtenerTituloVisibleApunte,
  ordenarCarpetas,
  SIN_CARPETA
} from "./apuntes-core.js";

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
let carpetasDisponibles = true;

iniciarMonitoreoSesion("Mis apuntes");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uidMedico = user.uid;
  document.body.classList.remove("bloqueado");
  recuperarEstadoCarpetas();
  inicializarInterfaz();
  ponerEdicionOcupada(true);

  try {
    await cargarDatos();
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

  sincronizarColoresIniciales();

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
  configurarSelectorColor("colorTexto", "foreColor", ".control-color__muestra--texto", "color");
  configurarSelectorColor("colorFondoTexto", "hiliteColor", ".control-color__muestra--fondo", "backgroundColor");
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

async function cargarDatos({ seleccionarId = "" } = {}) {
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
  selector.innerHTML = [
    '<option value="">Sin carpeta</option>',
    ...carpetas.map((carpeta) => (
      `<option value="${escaparHTML(carpeta.id)}">${escaparHTML(carpeta.nombre)}</option>`
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
  let grupos = agruparApuntes(filtrados, carpetas);
  if (hayBusqueda) grupos = grupos.filter((grupo) => grupo.apuntes.length > 0);

  if (contador) {
    contador.textContent = hayBusqueda
      ? `${filtrados.length} de ${apuntes.length}`
      : `${apuntes.length}`;
  }

  if (!grupos.length) {
    lista.innerHTML = '<p class="vacio">No se encontraron apuntes.</p>';
    return;
  }

  lista.innerHTML = grupos.map((grupo, indice) => renderizarGrupo(grupo, indice, activo, hayBusqueda)).join("");
}

function renderizarGrupo(grupo, indice, activo, forzarAbierto) {
  const idSeguro = escaparHTML(grupo.id);
  const contenidoId = `carpeta-contenido-${indice}`;
  const estaAbierta = forzarAbierto || !carpetasCerradas.has(grupo.id);
  const acciones = grupo.esSistema
    ? `<button type="button" class="carpeta-accion" data-accion="nuevo-en-carpeta" data-carpeta-id="" title="Nuevo apunte sin carpeta" aria-label="Nuevo apunte sin carpeta">＋</button>`
    : [
      `<button type="button" class="carpeta-accion" data-accion="nuevo-en-carpeta" data-carpeta-id="${idSeguro}" title="Nuevo apunte en ${escaparHTML(grupo.nombre)}" aria-label="Nuevo apunte en ${escaparHTML(grupo.nombre)}">＋</button>`,
      `<button type="button" class="carpeta-accion" data-accion="renombrar-carpeta" data-carpeta-id="${idSeguro}" title="Renombrar carpeta" aria-label="Renombrar ${escaparHTML(grupo.nombre)}">✎</button>`,
      `<button type="button" class="carpeta-accion" data-accion="eliminar-carpeta" data-carpeta-id="${idSeguro}" title="Eliminar carpeta" aria-label="Eliminar ${escaparHTML(grupo.nombre)}">×</button>`
    ].join("");

  const contenido = grupo.apuntes.length
    ? grupo.apuntes.map((apunte) => renderizarApunte(apunte, activo)).join("")
    : '<p class="carpeta-vacia">Carpeta vacía</p>';

  return `
    <section class="carpeta-apuntes" data-grupo-id="${idSeguro}">
      <div class="carpeta-cabecera">
        <button
          type="button"
          class="carpeta-toggle"
          data-accion="alternar-carpeta"
          data-carpeta-id="${idSeguro}"
          aria-expanded="${estaAbierta}"
          aria-controls="${contenidoId}"
        >
          <span class="carpeta-toggle__flecha" aria-hidden="true">›</span>
          <span class="carpeta-toggle__icono" aria-hidden="true"></span>
          <span class="carpeta-toggle__nombre">${escaparHTML(grupo.nombre)}</span>
          <span class="carpeta-toggle__cantidad">${grupo.apuntes.length}</span>
        </button>
        <div class="carpeta-acciones">${acciones}</div>
      </div>
      <div id="${contenidoId}" class="carpeta-contenido" ${estaAbierta ? "" : "hidden"}>${contenido}</div>
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

function abrirDialogoCarpeta(carpetaId = "") {
  const dialogo = document.getElementById("dialogoCarpeta");
  const carpeta = carpetas.find((item) => item.id === carpetaId);
  idCarpetaEdicion = carpeta?.id || "";
  document.getElementById("tituloDialogoCarpeta").textContent = carpeta ? "Renombrar carpeta" : "Nueva carpeta";
  document.getElementById("guardarCarpeta").textContent = carpeta ? "Guardar cambios" : "Guardar carpeta";
  document.getElementById("nombreCarpeta").value = carpeta?.nombre || "";
  document.getElementById("errorCarpeta").textContent = "";

  if (typeof dialogo?.showModal === "function") dialogo.showModal();
  else dialogo?.setAttribute("open", "");
  requestAnimationFrame(() => document.getElementById("nombreCarpeta")?.focus());
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
  const error = document.getElementById("errorCarpeta");
  const boton = document.getElementById("guardarCarpeta");

  if (!nombre) {
    error.textContent = "Escribe un nombre para la carpeta.";
    return;
  }
  if (!nombreCarpetaDisponible(nombre, carpetas, idCarpetaEdicion)) {
    error.textContent = "Ya existe una carpeta con ese nombre.";
    return;
  }

  ponerBotonOcupado(boton, true, "Guardando...");
  error.textContent = "";
  try {
    if (idCarpetaEdicion) {
      await updateDoc(doc(db, "usuarios", uidMedico, "carpetasApuntes", idCarpetaEdicion), {
        nombre,
        fechaActualizacion: new Date().toISOString(),
        fechaActualizacionServidor: serverTimestamp()
      });
    } else {
      const creada = await addDoc(refCarpetas(), {
        nombre,
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
  const detalle = cantidadLocal
    ? ` Los ${cantidadLocal} apuntes que contiene pasarán a “Sin carpeta”.`
    : "";
  if (!window.confirm(`¿Eliminar la carpeta “${carpeta.nombre}”?${detalle}`)) return;
  if (!confirmarDescartarCambios()) return;

  eliminandoCarpeta = true;
  ponerEdicionOcupada(true);
  ponerEstado("Eliminando carpeta...");
  try {
    while (true) {
      const snapActual = await getDocs(query(refApuntes(), where("carpetaId", "==", carpetaId)));
      const documentos = snapActual.docs;
      const referenciasApuntes = documentos.slice(0, TAMANO_LOTE).map((apunte) => apunte.ref);
      const finalizar = documentos.length <= TAMANO_LOTE;
      const referenciaCarpeta = doc(db, "usuarios", uidMedico, "carpetasApuntes", carpetaId);

      await runTransaction(db, async (transaccion) => {
        const referencias = finalizar
          ? [...referenciasApuntes, referenciaCarpeta]
          : referenciasApuntes;
        const lecturas = await Promise.all(referencias.map((referencia) => transaccion.get(referencia)));
        const fechaMovimiento = new Date().toISOString();

        lecturas.slice(0, referenciasApuntes.length).forEach((apunteActual) => {
          if (!apunteActual.exists()) return;
          const datos = apunteActual.data();
          if (datos.carpetaId !== carpetaId) return;
          const cambios = {
            carpetaId: null,
            fechaActualizacion: fechaMovimiento,
            fechaActualizacionServidor: serverTimestamp()
          };
          if (datos.contenidoHtml && datos.contenidoHtmlActualizado === datos.fechaActualizacion) {
            cambios.contenidoHtmlActualizado = fechaMovimiento;
          }
          transaccion.update(apunteActual.ref, cambios);
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
  const panel = document.querySelector(".apuntes-editor");
  const lista = document.getElementById("listaApuntes");
  const controles = [
    document.getElementById("apunteTitulo"),
    document.getElementById("guardarApunte"),
    document.getElementById("eliminarApunte"),
    document.getElementById("nuevoApunte"),
    ...document.querySelectorAll(".barra-formato button, .barra-formato input")
  ].filter(Boolean);

  controles.forEach((control) => { control.disabled = ocupada; });
  actualizarDisponibilidadCarpetas(ocupada);
  if (editor) editor.contentEditable = String(!ocupada);
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

function obtenerCarpetaActual() {
  return document.getElementById("apunteCarpeta")?.value || "";
}

function obtenerContenidoPlano() {
  return (obtenerEditor()?.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
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
  if (!restaurarSeleccionEditor()) return;
  try {
    let aplicado = document.execCommand(comando, false, valor);
    if (!aplicado && comando === "hiliteColor") {
      aplicado = document.execCommand("backColor", false, valor);
    }
    if (aplicado) marcarCambios();
  } catch (error) {
    console.warn(`[APUNTES] El formato ${comando} no está disponible`, error);
  }
  guardarSeleccionEditor();
  actualizarEstadoFormato();
}

function configurarSelectorColor(id, comando, selectorMuestra, propiedad) {
  const control = document.getElementById(id);
  const muestra = document.querySelector(selectorMuestra);
  control?.addEventListener("input", () => {
    if (muestra) muestra.style[propiedad] = control.value;
  });
  control?.addEventListener("change", () => ejecutarFormato(comando, control.value));
}

function sincronizarColoresIniciales() {
  const temaClaro = document.documentElement.dataset.theme === "light";
  const colorTexto = document.getElementById("colorTexto");
  const colorFondo = document.getElementById("colorFondoTexto");
  if (colorTexto) colorTexto.value = temaClaro ? "#17211b" : "#f6e8d5";
  if (colorFondo) colorFondo.value = temaClaro ? "#fff0a6" : "#7a4d16";

  const muestraTexto = document.querySelector(".control-color__muestra--texto");
  const muestraFondo = document.querySelector(".control-color__muestra--fondo");
  if (muestraTexto) muestraTexto.style.color = colorTexto?.value || "";
  if (muestraFondo) muestraFondo.style.backgroundColor = colorFondo?.value || "";
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
