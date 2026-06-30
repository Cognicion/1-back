import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (user.uid !== ADMIN_UID) {
    alert("Acceso restringido al administrador.");
    window.location.href = "dashboard.html";
    return;
  }

  document.body.classList.remove("bloqueado");

  await cargarResumen();
  await cargarAuditoria();
});

async function cargarResumen() {
  const snapUsuarios = await getDocs(collection(db, "usuarios"));
  const snapAuditoria = await getDocs(collection(db, "auditoria"));

  let totalUsuarios = 0;
  let totalPacientes = 0;
  let totalMedicos = 0;

  snapUsuarios.forEach((doc) => {
    totalUsuarios++;

    const datos = doc.data();

    if (datos.rol === "paciente") {
      totalPacientes++;
    }

    if (datos.rol === "medico") {
      totalMedicos++;
    }
  });

  document.getElementById("totalUsuarios").textContent = totalUsuarios;
  document.getElementById("totalPacientes").textContent = totalPacientes;
  document.getElementById("totalMedicos").textContent = totalMedicos;
  document.getElementById("totalAuditoria").textContent = snapAuditoria.size;
}

async function cargarAuditoria() {
  const tabla = document.getElementById("tablaAuditoria");
  tabla.innerHTML = "";

  const qAuditoria = query(
    collection(db, "auditoria"),
    orderBy("fecha", "desc"),
    limit(50)
  );

  const snap = await getDocs(qAuditoria);

  if (snap.empty) {
    tabla.innerHTML = `
      <tr>
        <td colspan="7">No hay eventos de auditoría.</td>
      </tr>
    `;
    return;
  }

  snap.forEach((doc) => {
    const evento = doc.data();

    const fecha = evento.fechaTexto
      ? new Date(evento.fechaTexto).toLocaleString("es-MX")
      : "Sin fecha";

    const resultado = evento.exito
      ? `<span class="ok">Correcto</span>`
      : `<span class="error">Error</span>`;

    tabla.innerHTML += `
      <tr>
        <td>${fecha}</td>
        <td>${evento.usuarioNombre || "—"}</td>
        <td>${evento.usuarioRol || "—"}</td>
        <td>${evento.modulo || "—"}</td>
        <td>${evento.accion || "—"}</td>
        <td>${evento.pacienteNombre || "—"}</td>
        <td>${resultado}</td>
      </tr>
    `;
  });
}