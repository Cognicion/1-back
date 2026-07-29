import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let apuntesMedicoCache = [];

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

  renderizarListaApuntes();
  if (apuntesMedicoCache.length && !valorApunte("apunteMedicoPacienteId")) {
    seleccionarApunteMedico(apuntesMedicoCache[0].id);
  } else if (!apuntesMedicoCache.length) {
    window.nuevoApunteMedicoPaciente();
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
    boton.setAttribute("aria-selected", apunte.id === activo ? "true" : "false");
    boton.title = obtenerTituloVisibleApunte(apunte);
    boton.addEventListener("click", () => seleccionarApunteMedico(apunte.id));

    const titulo = document.createElement("span");
    titulo.className = "apunte-paciente-item__titulo";
    titulo.textContent = obtenerTituloVisibleApunte(apunte);
    boton.appendChild(titulo);
    fragmento.appendChild(boton);
  });
  lista.replaceChildren(fragmento);
}

function seleccionarApunteMedico(id) {
  const apunte = apuntesMedicoCache.find((item) => item.id === id);
  if (!apunte) return;

  ponerValorApunte("apunteMedicoPacienteId", apunte.id);
  ponerValorApunte("apunteMedicoPacienteTitulo", apunte.titulo || "");
  ponerValorApunte("apunteMedicoPacienteContenido", apunte.contenido || "");
  ponerEstadoApuntes("Guardado");
  renderizarListaApuntes();
}

window.nuevoApunteMedicoPaciente = function() {
  ponerValorApunte("apunteMedicoPacienteId", "");
  ponerValorApunte("apunteMedicoPacienteTitulo", "");
  ponerValorApunte("apunteMedicoPacienteContenido", "");
  ponerEstadoApuntes("Nuevo apunte");
  renderizarListaApuntes();
};

window.guardarApunteMedicoPaciente = async function() {
  const ref = referenciaApuntesMedico();
  const id = valorApunte("apunteMedicoPacienteId");
  const titulo = valorApunte("apunteMedicoPacienteTitulo") || "Apunte sin titulo";
  const contenido = valorApunte("apunteMedicoPacienteContenido");
  if (!ref) return;
  if (!contenido) {
    alert("Escribe el contenido del apunte.");
    return;
  }

  ponerEstadoApuntes("Guardando...");
  const payload = { titulo, contenido, fechaActualizacion: new Date().toISOString() };
  if (id) {
    await updateDoc(doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id), payload);
  } else {
    const nuevo = await addDoc(ref, { ...payload, fechaCreacion: new Date().toISOString() });
    ponerValorApunte("apunteMedicoPacienteId", nuevo.id);
  }
  await cargarApuntesMedico();
  ponerEstadoApuntes("Guardado");
};

window.eliminarApunteMedicoPaciente = async function() {
  const id = valorApunte("apunteMedicoPacienteId");
  if (!id) {
    window.nuevoApunteMedicoPaciente();
    return;
  }
  if (!confirm("Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", auth.currentUser.uid, "apuntesMedico", id));
  window.nuevoApunteMedicoPaciente();
  await cargarApuntesMedico();
};

window.abrirApuntesMedicoPaciente = async function() {
  ["fondoApuntesMedicoPaciente", "panelApuntesMedicoPaciente"].forEach((id) => {
    const elemento = document.getElementById(id);
    if (elemento && elemento.parentElement !== document.body) document.body.appendChild(elemento);
  });

  document.getElementById("fondoApuntesMedicoPaciente")?.classList.remove("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  document.getElementById("buscadorApuntesPaciente")?.focus();
  await cargarApuntesMedico();
};

window.cerrarApuntesMedicoPaciente = function() {
  document.getElementById("fondoApuntesMedicoPaciente")?.classList.add("oculto");
  const panel = document.getElementById("panelApuntesMedicoPaciente");
  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");
};

document.getElementById("fondoApuntesMedicoPaciente")?.addEventListener("click", window.cerrarApuntesMedicoPaciente);
document.querySelector("#panelApuntesMedicoPaciente .boton-cerrar-panel")?.addEventListener("click", window.cerrarApuntesMedicoPaciente);
document.getElementById("buscadorApuntesPaciente")?.addEventListener("input", renderizarListaApuntes);
document.getElementById("apunteMedicoPacienteTitulo")?.addEventListener("input", () => ponerEstadoApuntes("Cambios sin guardar"));
document.getElementById("apunteMedicoPacienteContenido")?.addEventListener("input", () => ponerEstadoApuntes("Cambios sin guardar"));
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && document.getElementById("panelApuntesMedicoPaciente")?.classList.contains("abierto")) {
    window.cerrarApuntesMedicoPaciente();
  }
});
