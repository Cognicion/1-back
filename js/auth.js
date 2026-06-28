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
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";

  } catch(error) {
    alert(error.message);
  }
};

window.cerrarSesion = async function() {
  await signOut(auth);
  window.location.href = "login.html";
};

window.recuperarPassword = async function() {

  const email = document.getElementById("email").value.trim();

  if (!email) {
    alert("Ingresa tu correo electrónico.");
    return;
  }

  try {

    await sendPasswordResetEmail(auth, email);

    alert("Se envió un enlace para restablecer tu contraseña a tu correo electrónico.");

    window.location.href = "login.html";

  } catch(error) {

    console.error(error);

    if (error.code === "auth/user-not-found") {

      alert("No existe una cuenta registrada con ese correo.");

    } else if (error.code === "auth/invalid-email") {

      alert("El correo electrónico no es válido.");

    } else {

      alert("No fue posible enviar el correo de recuperación.");
    }

  }

};
