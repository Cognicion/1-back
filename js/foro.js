import { auth, db } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

iniciarMonitoreoSesion("Foro");

const SALAS = [
  { id: "pacientes", titulo: "Foro de pacientes", descripcion: "Espacio de comunidad y apoyo general para pacientes." },
  { id: "personal_salud", titulo: "Foro de personal de salud", descripcion: "Comunicacion entre medicos, psicologos y administradores." },
  { id: "mixto", titulo: "Foro mixto", descripcion: "Espacio compartido entre pacientes y personal de salud." }
];

let usuarioActual = null;
let datosUsuario = null;
let salaActual = "mixto";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  usuarioActual = user;
  datosUsuario = await obtenerUsuario(user.uid) || {};
  const salas = salasPermitidas();
  salaActual = salas[0]?.id || "mixto";
  renderizarTabsForo();
  await cargarSalaForo(salaActual);
});

document.getElementById("formForoMensaje")?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  await publicarMensajeForo();
});

function salasPermitidas() {
  const rol = datosUsuario?.rol || "paciente";
  if (rol === "paciente") return SALAS.filter((sala) => sala.id !== "personal_salud");
  return SALAS;
}

function renderizarTabsForo() {
  const contenedor = document.getElementById("selectorForos");
  if (!contenedor) return;
  contenedor.innerHTML = salasPermitidas().map((sala) => `
    <button type="button" class="foro-tab ${sala.id === salaActual ? "activa" : ""}" data-sala-foro="${sala.id}">${sala.titulo}</button>
  `).join("");
  contenedor.querySelectorAll("[data-sala-foro]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      salaActual = boton.dataset.salaForo;
      renderizarTabsForo();
      await cargarSalaForo(salaActual);
    });
  });
}

async function cargarSalaForo(idSala) {
  const sala = SALAS.find((item) => item.id === idSala) || SALAS[0];
  document.getElementById("foroSalaTitulo").textContent = sala.titulo;
  document.getElementById("foroSalaDescripcion").textContent = sala.descripcion;
  document.getElementById("foroSalaBadge").textContent = `Sala ${sala.id.replace("_", " ")}`;

  const lista = document.getElementById("listaMensajesForo");
  if (lista) lista.innerHTML = "Cargando mensajes...";
  const qMensajes = query(collection(db, "foros", idSala, "mensajes"), orderBy("fechaISO", "desc"), limit(60));
  const snap = await getDocs(qMensajes);
  const mensajes = snap.docs.map((docMensaje) => ({ id: docMensaje.id, ...docMensaje.data() }));

  if (!mensajes.length) {
    lista.innerHTML = `<article class="foro-mensaje"><strong>Sin mensajes todavia</strong><p>Se el primero en iniciar la conversacion en esta sala.</p></article>`;
    return;
  }

  lista.innerHTML = mensajes.map((mensaje) => `
    <article class="foro-mensaje">
      <strong>${escaparHTML(mensaje.titulo || "Mensaje")}</strong>
      <span>${escaparHTML(mensaje.autorNombre || "Usuario")} · ${escaparHTML(mensaje.autorRol || "")} · ${escaparHTML(mensaje.fechaISO || "")}</span>
      <p>${escaparHTML(mensaje.texto || "")}</p>
    </article>
  `).join("");
}

async function publicarMensajeForo() {
  const titulo = document.getElementById("foroTituloMensaje")?.value.trim() || "";
  const texto = document.getElementById("foroTextoMensaje")?.value.trim() || "";
  if (!titulo || !texto) {
    alert("Escribe titulo y mensaje.");
    return;
  }

  await addDoc(collection(db, "foros", salaActual, "mensajes"), {
    titulo,
    texto,
    sala: salaActual,
    autorUid: usuarioActual?.uid || "",
    autorNombre: datosUsuario?.nombre || usuarioActual?.email || "Usuario",
    autorRol: datosUsuario?.rol || "paciente",
    fechaISO: new Date().toISOString()
  });

  document.getElementById("foroTituloMensaje").value = "";
  document.getElementById("foroTextoMensaje").value = "";
  await cargarSalaForo(salaActual);
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
