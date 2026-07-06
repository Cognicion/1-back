import { auth, db, functions } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const estadoAcceso = document.getElementById("estadoAcceso");
const chatBox = document.getElementById("chatBox");
const formSofia = document.getElementById("formSofia");
const mensajeSofia = document.getElementById("mensajeSofia");
const botonEnviar = formSofia.querySelector("button");

let usuarioActual = null;
let enviandoMensaje = false;

function agregarMensaje(texto, tipo, claseExtra = "") {
  const div = document.createElement("div");
  div.className = `msg ${tipo} ${claseExtra}`.trim();
  div.textContent = texto;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function bloquearAcceso(mensaje) {
  estadoAcceso.textContent = mensaje;
  formSofia.style.display = "none";
}

function activarCarga() {
  enviandoMensaje = true;
  mensajeSofia.disabled = true;

  if (botonEnviar) {
    botonEnviar.disabled = true;
    botonEnviar.textContent = "Pensando...";
  }
}

function desactivarCarga() {
  enviandoMensaje = false;
  mensajeSofia.disabled = false;

  if (botonEnviar) {
    botonEnviar.disabled = false;
    botonEnviar.textContent = "Enviar";
  }

  mensajeSofia.focus();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  usuarioActual = user;

  try {
    const refUsuario = doc(db, "usuarios", user.uid);
    const snapUsuario = await getDoc(refUsuario);

    if (!snapUsuario.exists()) {
      bloquearAcceso("Acceso restringido. Perfil no encontrado.");
      return;
    }

    const datos = snapUsuario.data();

    if (datos.rol !== "admin") {
      bloquearAcceso("Acceso restringido. Proyecto interno de investigación.");
      return;
    }

    estadoAcceso.textContent = "Acceso concedido. Modo experimental Alpha 0.1.";
  } catch (error) {
    console.error(error);
    bloquearAcceso("No se pudo verificar el acceso. Intenta iniciar sesión nuevamente.");
  }
});

formSofia.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (enviandoMensaje) return;

  const mensaje = mensajeSofia.value.trim();

  if (!mensaje || !usuarioActual) {
    mensajeSofia.focus();
    return;
  }

  agregarMensaje(mensaje, "user");
  mensajeSofia.value = "";

  const mensajePensando = agregarMensaje(
    "Sofía está pensando...",
    "sofia",
    "mensaje-pensando"
  );

  activarCarga();

  try {
    const chatSofia = httpsCallable(functions, "chatSofia");

    const resultado = await chatSofia({ mensaje });

    const respuesta = resultado?.data?.respuesta || "Sofía respondió, pero no llegó texto interpretable.";

    mensajePensando.className = "msg sofia";
    mensajePensando.textContent = respuesta;
  } catch (error) {
    console.error(error);

    mensajePensando.className = "msg sofia mensaje-error";
    mensajePensando.textContent =
      "Sofía tuvo un problema para responder. Intenta de nuevo en unos segundos.";
  } finally {
    desactivarCarga();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});