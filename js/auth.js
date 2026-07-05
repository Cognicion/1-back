import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { obtenerUsuario } from "./services/usuarios.js";
import { registrarEventoAuditoria, resumenError } from "./services/auditoria.js";

window.registrarUsuario = async function() {
  const nombre = document.getElementById("nombre").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "usuarios", cred.user.uid), {
      nombre: nombre,
      email: email,
      rol: "paciente",
      fechaRegistro: new Date().toISOString()
    });

    alert("Usuario creado correctamente");
    window.location.href = "dashboard.html";

  } catch(error) {
    alert(error.message);
  }
};

window.iniciarSesion = async function() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

try {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const datos = await obtenerUsuario(cred.user.uid);

  try {
    await registrarEventoAuditoria({
      accion: "inicio_sesion",
      modulo: "Autenticacion",
      descripcion: "El usuario inicio sesion correctamente.",
      usuarioUid: cred.user.uid,
      usuarioNombre: datos?.nombre || cred.user.email || email,
      usuarioRol: datos?.rol || "",
      exito: true,
      detalles: { email }
    });
  } catch (errorAuditoria) {
    console.warn("No se pudo registrar auditoria de inicio de sesion:", errorAuditoria);
  }

  window.location.href = "dashboard.html";

} catch(error) {
  try {
    await registrarEventoAuditoria({
      accion: "inicio_sesion_fallido",
      modulo: "Autenticacion",
      descripcion: "Intento fallido de inicio de sesion.",
      usuarioUid: "",
      usuarioNombre: email,
      usuarioRol: "",
      exito: false,
      detalles: {
        email,
        error: resumenError(error)
      }
    });
  } catch (errorAuditoria) {
    console.warn("No se pudo registrar el intento fallido:", errorAuditoria);
  }

  alert(error.message);
}
};

window.cerrarSesion = async function() {
  const user = auth.currentUser;
  const datos = user ? await obtenerUsuario(user.uid) : null;

  if (user) {
    await registrarEventoAuditoria({
      accion: "cierre_sesion",
      modulo: "Autenticacion",
      descripcion: "El usuario cerro sesion explicitamente.",
      usuarioUid: user.uid,
      usuarioNombre: datos?.nombre || user.email || "",
      usuarioRol: datos?.rol || "",
      exito: true
    });
  }

  await signOut(auth);
  window.location.href = "login.html";
};

window.recuperarPassword = async function() {
  const emailInput = document.getElementById("email");

  if (!emailInput) {
    alert("No se encontró el campo de correo.");
    return;
  }

  const email = emailInput.value.trim();

  if (!email) {
    alert("Ingresa tu correo electrónico.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);

    try {
      await registrarEventoAuditoria({
        accion: "solicitar_recuperacion_password",
        modulo: "Autenticacion",
        descripcion: "Se solicito recuperacion de contrasena.",
        usuarioUid: "",
        usuarioNombre: email,
        usuarioRol: "",
        exito: true,
        detalles: { email }
      });
    } catch (errorAuditoria) {
      console.warn("No se pudo registrar auditoria de recuperacion:", errorAuditoria);
    }

    alert("Se envió un enlace para restablecer tu contraseña a tu correo electrónico.");
    window.location.href = "login.html";

  } catch (error) {
    console.error("Error al enviar correo de recuperación:", error);

    try {
      await registrarEventoAuditoria({
        accion: "recuperacion_password_fallida",
        modulo: "Autenticacion",
        descripcion: "No se pudo enviar recuperacion de contrasena.",
        usuarioUid: "",
        usuarioNombre: email,
        usuarioRol: "",
        exito: false,
        detalles: {
          email,
          error: resumenError(error)
        }
      });
    } catch (errorAuditoria) {
      console.warn("No se pudo registrar auditoria de recuperacion fallida:", errorAuditoria);
    }

    if (error.code === "auth/user-not-found") {
      alert("No existe una cuenta registrada con ese correo.");
    } else if (error.code === "auth/invalid-email") {
      alert("El correo electrónico no es válido.");
    } else if (error.code === "auth/too-many-requests") {
      alert("Demasiados intentos. Intenta más tarde.");
    } else if (error.code === "auth/network-request-failed") {
      alert("Error de conexión. Revisa tu internet.");
    } else {
      alert("No fue posible enviar el correo de recuperación.");
    }
  }
};
    