import { auth, db } from "../firebase.js";
import {
  actualizarApunteConRevision,
  eliminarApunteConRevision,
  esConflictoApunte,
  esErrorConexionApunte
} from "../services/apuntesMedicoPersistence.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  deleteField,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let apuntesMedicoCache = [];
let guardandoApunteMedicoPaciente = false;
let cambiosApunteMedicoPaciente = false;
let focoAntesPanelApuntes = null;

function ponerPanelApuntesOcupado(ocupado) {
  guardandoApunteMedicoPaciente = ocupado;
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  panel?.setAttribute("aria-busy", String(ocupado));
  panel?.querySelectorAll("button, input, textarea").forEach((control) => {
    if (ocupado) {
      control.dataset.apuntesDisabledPrevio = String(control.disabled);
      control.disabled = true;
    } else if (control.dataset.apuntesDisabledPrevio !== undefined) {
      control.disabled = control.dataset.apuntesDisabledPrevio === "true";
      delete control.dataset.apuntesDisabledPrevio;
    }
  });
  const lista = document.getElementById("listaApuntesMedicoPaciente");
  if (lista) lista.inert = ocupado;
}

function referenciaApuntesMedico() {
  const uidMedico = auth.currentUser?.uid;
  return uidMedico ? collection(db, "usuarios", uidMedico, "apuntesMedico") : null;
}

function valorApunte(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function ponerValorApunte(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function contenidoApunte() {
  return document.getElementById("apunteMedicoPacienteContenido")?.value ?? "";
}

function ponerEstadoApuntes(texto) {
  const estado = document.getElementById("estadoApuntesMedicoPaciente");
  if (estado) estado.textContent = texto;
}

function obtenerTituloVisibleApunte(apunte) {
  const titulo = typeof apunte?.titulo === "string"
    ? apunte.titulo.replace(/\s+/g, " ").trim()
    : "";
  return titulo || "Sin título";
}

async function cargarApuntesMedico() {
  const lista = document.getElementById("listaApuntesMedicoPaciente");
  const ref = referenciaApuntesMedico();
  if (!lista || !ref) return;

  lista.textContent = "Cargando apuntes...";
  const snap = await getDocs(query(ref, orderBy("fechaActualizacion", "desc")));
  apuntesMedicoCache = snap.docs.map((docApunte) => ({
    id: docApunte.id,
    ...docApunte.data()
  }));

  const idActual = valorApunte("apunteMedicoPacienteId");
  renderizarListaApuntes();
  if (apuntesMedicoCache.some((apunte) => apunte.id === idActual)) {
    seleccionarApunteMedico(idActual, { omitirConfirmacion: true });
  } else if (apuntesMedicoCache.length) {
    seleccionarApunteMedico(apuntesMedicoCache[0].id, { omitirConfirmacion: true });
  } else if (!apuntesMedicoCache.length) {
    nuevoApunteMedicoPacienteInterno();
  }
  ponerEstadoApuntes(apuntesMedicoCache.length ? "Guardado" : "Sin apuntes");
}

function renderizarListaApuntes() {
  const lista = document.getElementById("listaApuntesMedicoPaciente");
  const busqueda = valorApunte("buscadorApuntesPaciente").toLowerCase();
  const activo = valorApunte("apunteMedicoPacienteId");
  if (!lista) return;

  const filtrados = apuntesMedicoCache.filter((apunte) => {
    const titulo = String(apunte.titulo || "").toLowerCase();
    const contenido = String(apunte.contenido || "").toLowerCase();
    return !busqueda || titulo.includes(busqueda) || contenido.includes(busqueda);
  });

  if (!filtrados.length) {
    const vacio = document.createElement("p");
    vacio.className = "apuntes-vacio-paciente";
    vacio.textContent = "No se encontraron apuntes.";
    lista.replaceChildren(vacio);
    return;
  }

  const fragmento = document.createDocumentFragment();
  filtrados.forEach((apunte) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `apunte-paciente-item ${apunte.id === activo ? "activo" : ""}`;
    boton.dataset.apuntePaciente = apunte.id;
    if (apunte.id === activo) boton.setAttribute("aria-current", "true");
    boton.title = obtenerTituloVisibleApunte(apunte);
    boton.addEventListener("click", () => {
      if (!guardandoApunteMedicoPaciente) seleccionarApunteMedico(apunte.id);
    });

    const titulo = document.createElement("span");
    titulo.className = "apunte-paciente-item__titulo";
    titulo.textContent = obtenerTituloVisibleApunte(apunte);
    boton.appendChild(titulo);
    fragmento.appendChild(boton);
  });
  lista.replaceChildren(fragmento);
}

function seleccionarApunteMedico(id, { omitirConfirmacion = false } = {}) {
  const apunte = apuntesMedicoCache.find((item) => item.id === id);
  if (!apunte) return;
  if (!omitirConfirmacion && valorApunte("apunteMedicoPacienteId") === id) return;
  if (!omitirConfirmacion && !confirmarDescartarCambiosPanel()) return;

  ponerValorApunte("apunteMedicoPacienteId", apunte.id);
  ponerValorApunte("apunteMedicoPacienteTitulo", apunte.titulo || "");
  ponerValorApunte("apunteMedicoPacienteContenido", apunte.contenido || "");
  cambiosApunteMedicoPaciente = false;
  ponerEstadoApuntes("Guardado");
  renderizarListaApuntes();
}

function nuevoApunteMedicoPacienteInterno() {
  ponerValorApunte("apunteMedicoPacienteId", "");
  ponerValorApunte("apunteMedicoPacienteTitulo", "");
  ponerValorApunte("apunteMedicoPacienteContenido", "");
  cambiosApunteMedicoPaciente = false;
  ponerEstadoApuntes("Nuevo apunte");
  renderizarListaApuntes();
}

window.nuevoApunteMedicoPaciente = function() {
  if (guardandoApunteMedicoPaciente) return;
  if (!confirmarDescartarCambiosPanel()) return;
  nuevoApunteMedicoPacienteInterno();
};

function confirmarDescartarCambiosPanel() {
  return !cambiosApunteMedicoPaciente
    || confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?");
}

function marcarCambiosPanel() {
  cambiosApunteMedicoPaciente = true;
  ponerEstadoApuntes("Cambios sin guardar");
}

window.guardarApunteMedicoPaciente = async function() {
  if (guardandoApunteMedicoPaciente) return;
  const ref = referenciaApuntesMedico();
  const id = valorApunte("apunteMedicoPacienteId");
  const titulo = valorApunte("apunteMedicoPacienteTitulo") || "Apunte sin titulo";
  const contenido = contenidoApunte();
  if (!ref) return;
  if (!contenido.trim()) {
    alert("Escribe el contenido del apunte.");
    return;
  }

  const original = apuntesMedicoCache.find((item) => item.id === id);
  const contenidoCambio = !original || contenido !== String(original.contenido ?? "");
  if (
    id
    && contenidoCambio
    && original?.contenidoHtml
    && !confirm("Este panel usa texto simple. Al cambiar el contenido se quitará su formato de negrita y color. ¿Continuar?")
  ) return;

  ponerEstadoApuntes("Guardando...");
  ponerPanelApuntesOcupado(true);
  const fechaActualizacion = new Date().toISOString();
  let escrituraCompletada = false;
  const payload = {
    titulo,
    fechaActualizacion,
    fechaActualizacionServidor: serverTimestamp()
  };
  if (!id || contenidoCambio) payload.contenido = contenido;

  try {
    let idGuardado = id;
    if (id) {
      if (contenidoCambio) {
        payload.contenidoHtml = deleteField();
        payload.contenidoHtmlActualizado = deleteField();
      } else if (
        original?.contenidoHtml
        && original.contenidoHtmlActualizado === original.fechaActualizacion
      ) {
        payload.contenidoHtmlActualizado = fechaActualizacion;
      }
      await actualizarApunteConRevision({
        db,
        referencia: doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id),
        payload,
        fechaEsperada: original?.fechaActualizacion
      });
    } else {
      const nuevo = await addDoc(ref, { ...payload, fechaCreacion: fechaActualizacion });
      ponerValorApunte("apunteMedicoPacienteId", nuevo.id);
      idGuardado = nuevo.id;
    }
    actualizarCacheApuntePanel({ id: idGuardado, titulo, contenido, contenidoCambio, original, fechaActualizacion });
    escrituraCompletada = true;
    cambiosApunteMedicoPaciente = false;
    await cargarApuntesMedico();
    ponerEstadoApuntes("Guardado");
  } catch (error) {
    console.error("[APUNTES] No se pudo guardar desde el panel flotante", error);
    if (escrituraCompletada) {
      renderizarListaApuntes();
      ponerEstadoApuntes("Guardado; no se pudo actualizar la lista.");
    } else {
      ponerEstadoApuntes(esConflictoApunte(error)
        ? "El apunte cambió en otra ventana. Vuelve a abrirlo."
        : esErrorConexionApunte(error)
          ? "Necesitas conexión para actualizar este apunte."
          : "No se pudo guardar. Inténtalo de nuevo.");
    }
  } finally {
    ponerPanelApuntesOcupado(false);
  }
};

function actualizarCacheApuntePanel({ id, titulo, contenido, contenidoCambio, original, fechaActualizacion }) {
  const actualizado = {
    ...(original || {}),
    id,
    titulo,
    fechaActualizacion,
    fechaCreacion: original?.fechaCreacion || fechaActualizacion
  };
  if (!original || contenidoCambio) actualizado.contenido = contenido;
  if (contenidoCambio) {
    delete actualizado.contenidoHtml;
    delete actualizado.contenidoHtmlActualizado;
  } else if (original?.contenidoHtml && original.contenidoHtmlActualizado === original.fechaActualizacion) {
    actualizado.contenidoHtmlActualizado = fechaActualizacion;
  }
  apuntesMedicoCache = [actualizado, ...apuntesMedicoCache.filter((apunte) => apunte.id !== id)];
}

window.eliminarApunteMedicoPaciente = async function() {
  if (guardandoApunteMedicoPaciente) return;
  const id = valorApunte("apunteMedicoPacienteId");
  if (!id) {
    window.nuevoApunteMedicoPaciente();
    return;
  }
  if (!confirm("Eliminar este apunte?")) return;

  ponerPanelApuntesOcupado(true);
  let eliminacionCompletada = false;
  try {
    const original = apuntesMedicoCache.find((apunte) => apunte.id === id);
    await eliminarApunteConRevision({
      db,
      referencia: doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id),
      fechaEsperada: original?.fechaActualizacion
    });
    eliminacionCompletada = true;
    cambiosApunteMedicoPaciente = false;
    apuntesMedicoCache = apuntesMedicoCache.filter((apunte) => apunte.id !== id);
    nuevoApunteMedicoPacienteInterno();
    await cargarApuntesMedico();
  } catch (error) {
    console.error("[APUNTES] No se pudo eliminar desde el panel flotante", error);
    if (eliminacionCompletada) {
      renderizarListaApuntes();
      ponerEstadoApuntes("Eliminado; no se pudo actualizar la lista.");
    } else {
      ponerEstadoApuntes(esConflictoApunte(error)
        ? "El apunte cambió en otra ventana. Vuelve a abrirlo antes de eliminar."
        : esErrorConexionApunte(error)
          ? "Necesitas conexión para eliminar este apunte."
          : "No se pudo eliminar. Inténtalo de nuevo.");
    }
  } finally {
    ponerPanelApuntesOcupado(false);
  }
};

window.abrirApuntesMedicoPaciente = async function() {
  if (guardandoApunteMedicoPaciente) return;
  focoAntesPanelApuntes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ["fondoApuntesMedicoPaciente", "panelApuntesMedicoPaciente"].forEach((id) => {
    const elemento = document.getElementById(id);
    if (elemento && elemento.parentElement !== document.body) document.body.appendChild(elemento);
  });

  document.getElementById("fondoApuntesMedicoPaciente")?.classList.remove("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  ponerPanelApuntesOcupado(true);
  try {
    await cargarApuntesMedico();
  } catch (error) {
    console.error("[APUNTES] No se pudieron cargar desde el panel flotante", error);
    ponerEstadoApuntes("No se pudieron cargar los apuntes.");
  } finally {
    ponerPanelApuntesOcupado(false);
    document.getElementById("buscadorApuntesPaciente")?.focus();
  }
};

window.cerrarApuntesMedicoPaciente = function() {
  if (guardandoApunteMedicoPaciente) return;
  if (!confirmarDescartarCambiosPanel()) return;
  cambiosApunteMedicoPaciente = false;
  document.getElementById("fondoApuntesMedicoPaciente")?.classList.add("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");
  focoAntesPanelApuntes?.focus?.({ preventScroll: true });
  focoAntesPanelApuntes = null;
};

document.getElementById("buscadorApuntesPaciente")?.addEventListener("input", renderizarListaApuntes);
document.getElementById("apunteMedicoPacienteTitulo")?.addEventListener("input", marcarCambiosPanel);
document.getElementById("apunteMedicoPacienteContenido")?.addEventListener("input", marcarCambiosPanel);
window.addEventListener("beforeunload", (evento) => {
  if (!cambiosApunteMedicoPaciente) return;
  evento.preventDefault();
  evento.returnValue = "";
});
document.addEventListener("keydown", (evento) => {
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  if (!panel?.classList.contains("abierto")) return;
  if (evento.key === "Escape") {
    window.cerrarApuntesMedicoPaciente();
    return;
  }
  if (evento.key !== "Tab") return;

  const enfocables = [...panel.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((elemento) => elemento.getClientRects().length > 0);
  if (!enfocables.length) return;
  const primero = enfocables[0];
  const ultimo = enfocables.at(-1);
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
});
