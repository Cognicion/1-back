import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let uidMedico = "";
let apuntes = [];

iniciarMonitoreoSesion("Mis apuntes");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uidMedico = user.uid;
  document.body.classList.remove("bloqueado");
  await cargarApuntes();

  document.getElementById("buscadorApuntes")?.addEventListener("input", renderizarLista);
  document.getElementById("nuevoApunte")?.addEventListener("click", nuevoApunte);
  document.getElementById("guardarApunte")?.addEventListener("click", guardarApunte);
  document.getElementById("eliminarApunte")?.addEventListener("click", eliminarApunte);
  document.getElementById("apunteTitulo")?.addEventListener("input", marcarCambios);
  document.getElementById("apunteContenido")?.addEventListener("input", marcarCambios);
});

function refApuntes() {
  return collection(db, "usuarios", uidMedico, "apuntesMedico");
}

async function cargarApuntes() {
  const snap = await getDocs(query(refApuntes(), orderBy("fechaActualizacion", "desc")));
  apuntes = snap.docs.map((docApunte) => ({ id: docApunte.id, ...docApunte.data() }));
  renderizarLista();

  if (apuntes.length) {
    seleccionarApunte(apuntes[0].id);
  } else {
    nuevoApunte();
  }
}

function renderizarLista() {
  const lista = document.getElementById("listaApuntes");
  const busqueda = (document.getElementById("buscadorApuntes")?.value || "").trim().toLowerCase();
  const activo = document.getElementById("apunteId")?.value;
  if (!lista) return;

  const filtrados = apuntes.filter((apunte) => {
    const titulo = (apunte.titulo || "").toLowerCase();
    const contenido = (apunte.contenido || "").toLowerCase();
    return !busqueda || titulo.includes(busqueda) || contenido.includes(busqueda);
  });

  if (!filtrados.length) {
    lista.innerHTML = `<p class="vacio">No se encontraron apuntes.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map((apunte) => `
    <button type="button" class="apunte-item ${apunte.id === activo ? "activo" : ""}" data-id="${apunte.id}">
      <strong>${escaparHTML(apunte.titulo || "Sin titulo")}</strong>
      <span>${escaparHTML((apunte.contenido || "").slice(0, 120))}</span>
    </button>
  `).join("");

  lista.querySelectorAll("[data-id]").forEach((boton) => {
    boton.addEventListener("click", () => seleccionarApunte(boton.dataset.id));
  });
}

function seleccionarApunte(id) {
  const apunte = apuntes.find((item) => item.id === id);
  if (!apunte) return;

  document.getElementById("apunteId").value = apunte.id;
  document.getElementById("apunteTitulo").value = apunte.titulo || "";
  document.getElementById("apunteContenido").value = apunte.contenido || "";
  ponerEstado("Guardado");
  renderizarLista();
}

function nuevoApunte() {
  document.getElementById("apunteId").value = "";
  document.getElementById("apunteTitulo").value = "";
  document.getElementById("apunteContenido").value = "";
  ponerEstado("Nuevo apunte");
  renderizarLista();
  document.getElementById("apunteTitulo")?.focus();
}

async function guardarApunte() {
  const id = document.getElementById("apunteId").value;
  const titulo = document.getElementById("apunteTitulo").value.trim() || "Sin titulo";
  const contenido = document.getElementById("apunteContenido").value;

  ponerEstado("Guardando...");

  const payload = {
    titulo,
    contenido,
    fechaActualizacion: new Date().toISOString(),
    fechaActualizacionServidor: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidMedico, "apuntesMedico", id), payload);
  } else {
    await addDoc(refApuntes(), {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
  }

  await cargarApuntes();
  ponerEstado("Guardado");
}

async function eliminarApunte() {
  const id = document.getElementById("apunteId").value;
  if (!id) {
    nuevoApunte();
    return;
  }

  if (!confirm("Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", uidMedico, "apuntesMedico", id));
  await cargarApuntes();
}

function marcarCambios() {
  ponerEstado("Cambios sin guardar");
}

function ponerEstado(texto) {
  const estado = document.getElementById("estadoApuntes");
  if (estado) estado.textContent = texto;
}

function escaparHTML(valor) {
  return String(valor ? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
