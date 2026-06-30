import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let usuarioActual = null;

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    usuarioActual = user;

    const refUsuario = doc(db, "usuarios", user.uid);
    const snapUsuario = await getDoc(refUsuario);

    if (!snapUsuario.exists()) {
      alert("No se encontró tu perfil.");
      window.location.href = "dashboard.html";
      return;
    }

    const datos = snapUsuario.data();

    if (datos.rol !== "paciente") {
      alert("Este módulo es solo para pacientes.");
      window.location.href = "dashboard.html";
      return;
    }

    document.body.classList.remove("bloqueado");
    console.log("Mi Salud cargó correctamente");

    await cargarMiSalud(user.uid, datos);

    const botonGuardar = document.getElementById("guardarRegistro");
    if (botonGuardar) {
      botonGuardar.addEventListener("click", guardarRegistroDiario);
    }

  } catch (error) {
    console.error("Error al cargar Mi Salud:", error);
    alert("Ocurrió un error al cargar Mi Salud.");
  }
});

async function cargarMiSalud(uid, datosUsuario) {
  ponerTexto(
    "nombrePaciente",
    datosUsuario.nombre || datosUsuario.email || "paciente"
  );

  ponerTexto(
    "resumenSalud",
    "Aquí podrás revisar tu tratamiento, metas, citas y registrar cómo te sientes día a día."
  );

  await cargarTratamiento(uid);
  await cargarMetas(uid);
  await cargarProximaCita(uid);
}

async function cargarTratamiento(uid) {
  const lista = document.getElementById("listaTratamiento");
  if (!lista) return;

  lista.innerHTML = "";

  try {
    const ref = doc(db, "pacientes", uid, "miSalud", "tratamiento");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      lista.innerHTML = "<li>Sin tratamiento registrado.</li>";
      return;
    }

    const medicamentos = snap.data().medicamentos || [];

    if (medicamentos.length === 0) {
      lista.innerHTML = "<li>Sin tratamiento registrado.</li>";
      return;
    }

    medicamentos.forEach((med) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${med.nombre || "Medicamento"}</strong> — ${med.dosis || "Sin dosis registrada"}`;
      lista.appendChild(li);
    });

  } catch (error) {
    console.error("Error al cargar tratamiento:", error);
    lista.innerHTML = "<li>No se pudo cargar el tratamiento.</li>";
  }
}

async function cargarMetas(uid) {
  const lista = document.getElementById("listaMetas");
  if (!lista) return;

  lista.innerHTML = "";

  try {
    const ref = doc(db, "pacientes", uid, "miSalud", "metas");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      lista.innerHTML = "<li>Sin metas asignadas.</li>";
      return;
    }

    const metas = snap.data().metas || [];

    if (metas.length === 0) {
      lista.innerHTML = "<li>Sin metas asignadas.</li>";
      return;
    }

    metas.forEach((meta) => {
      const li = document.createElement("li");
      li.textContent = meta;
      lista.appendChild(li);
    });

  } catch (error) {
    console.error("Error al cargar metas:", error);
    lista.innerHTML = "<li>No se pudieron cargar las metas.</li>";
  }
}

async function cargarProximaCita(uid) {
  try {
    const ref = doc(db, "pacientes", uid, "miSalud", "agenda");
    const snap = await getDoc(ref);

    if (!snap.exists() || !snap.data().proximaCita) {
      ponerTexto("proximaCita", "Sin cita registrada.");
      return;
    }

    ponerTexto("proximaCita", snap.data().proximaCita);

  } catch (error) {
    console.error("Error al cargar próxima cita:", error);
    ponerTexto("proximaCita", "No se pudo cargar la próxima cita.");
  }
}

async function guardarRegistroDiario() {
  const animo = obtenerValor("animo");
  const ansiedad = obtenerValor("ansiedad");
  const sueno = obtenerValor("sueno");
  const comentario = obtenerValor("comentario").trim();

  if (!animo && !ansiedad && !sueno && !comentario) {
    alert("Agrega al menos un dato para guardar tu registro.");
    return;
  }

  try {
    const ref = collection(
      db,
      "pacientes",
      usuarioActual.uid,
      "registrosDiarios"
    );

    await addDoc(ref, {
      animo,
      ansiedad: ansiedad ? Number(ansiedad) : null,
      sueno: sueno ? Number(sueno) : null,
      comentario,
      creadoEn: serverTimestamp()
    });

    alert("Registro guardado correctamente.");

    limpiarCampo("animo");
    limpiarCampo("ansiedad");
    limpiarCampo("sueno");
    limpiarCampo("comentario");

  } catch (error) {
    console.error("Error al guardar registro:", error);
    alert("No se pudo guardar el registro.");
  }
}

function ponerTexto(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) {
    elemento.textContent = texto;
  }
}

function obtenerValor(id) {
  const elemento = document.getElementById(id);
  return elemento ? elemento.value : "";
}

function limpiarCampo(id) {
  const elemento = document.getElementById(id);
  if (elemento) {
    elemento.value = "";
  }
}