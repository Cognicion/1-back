import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario
} from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

iniciarMonitoreoSesion("Dashboard");

const frasesClinicas = [
  "La evidencia guia mejores decisiones clinicas.",
  "Cada paciente requiere una mirada integral.",
  "Los datos clinicos tambien deben servir al cuidado humano.",
  "La precision medica empieza con informacion clara.",
  "El seguimiento transforma datos en cuidado."
];

function mostrarFraseClinicaAleatoria() {
  const frase = document.getElementById("fraseClinica");
  if (!frase) return;
  const indice = Math.floor(Math.random() * frasesClinicas.length);
  frase.innerText = frasesClinicas[indice];
}

mostrarFraseClinicaAleatoria();

window.mostrarProximamente = function(titulo = "Proximamente", descripcion = "Estamos desarrollando este modulo.") {
  const overlay = document.getElementById("proximamenteOverlay");
  const tituloElemento = document.getElementById("proximamenteTitulo");
  const descripcionElemento = document.getElementById("proximamenteDescripcion");

  if (tituloElemento) tituloElemento.textContent = titulo;
  if (descripcionElemento) descripcionElemento.textContent = descripcion;
  overlay?.classList.add("abierto");
  overlay?.setAttribute("aria-hidden", "false");
};

window.cerrarProximamente = function() {
  const overlay = document.getElementById("proximamenteOverlay");
  overlay?.classList.remove("abierto");
  overlay?.setAttribute("aria-hidden", "true");
};

document.getElementById("proximamenteOverlay")?.addEventListener("click", (evento) => {
  if (evento.target.id === "proximamenteOverlay") {
    window.cerrarProximamente();
  }
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") window.cerrarProximamente();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const datos = await obtenerUsuario(user.uid);
  const rolUsuario = String(datos?.rol || "").toLowerCase().trim();

  if (datos) {
    document.getElementById("bienvenida").innerText =
      "Bienvenido, " + datos.nombre;
  } else {
    document.getElementById("bienvenida").innerText =
      "Bienvenido";
  }

  await cargarAvisosDashboard(rolUsuario, user.uid);
});

window.cerrarSesion = async function() {
  const user = auth.currentUser;
  const datos = user ? await obtenerUsuario(user.uid) : null;
  if (user) {
    await registrarEventoAuditoria({
      accion: "cierre_sesion",
      modulo: "Dashboard",
      descripcion: "El usuario cerro sesion explicitamente desde dashboard.",
      usuarioUid: user.uid,
      usuarioNombre: datos?.nombre || user.email || "",
      usuarioRol: datos?.rol || "",
      exito: true
    });
  }
  await signOut(auth);
  window.location.href = "login.html";
};

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function avisoVisibleParaUsuario(aviso = {}, rol = "", uid = "") {
  const rolNormalizado = String(rol || "").toLowerCase().trim();
  const tipo = String(aviso.destinatarioTipo || aviso.destinatarioRol || aviso.rolDestino || "todos").toLowerCase().trim();
  const uidDestino = aviso.destinatarioUid || aviso.uidDestino || aviso.usuarioDestinoUid || "";

  if (rolNormalizado === "admin") return true;
  if (tipo === "usuario") return uidDestino === uid;
  if (["todos", "todos_los_usuarios", "global"].includes(tipo)) return true;
  if (["personal_salud", "medicos_psicologos", "medico_psicologo"].includes(tipo)) return ["medico", "psicologo"].includes(rolNormalizado);
  if (tipo === "medicos") return rolNormalizado === "medico";
  if (tipo === "psicologos") return rolNormalizado === "psicologo";
  if (tipo === "pacientes") return rolNormalizado === "paciente";
  return tipo === rolNormalizado;
}

function textoDestinatarioAvisoDashboard(aviso = {}) {
  if (aviso.destinatarioTipo === "usuario" || aviso.destinatarioRol === "usuario") return "personal";
  const destino = aviso.destinatarioTipo || aviso.destinatarioRol || "todos";
  const mapa = {
    todos: "todos",
    paciente: "pacientes",
    medico: "medicos",
    psicologo: "psicologos",
    personal_salud: "medicos y psicologos"
  };
  return mapa[destino] || destino;
}

async function cargarAvisosDashboard(rolUsuario, uidUsuario) {
  const contenedor = document.getElementById("listaAvisosDashboard");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando avisos...</p>";

  try {
    const qAvisos = query(collection(db, "avisosGlobales"), orderBy("creadoEn", "desc"), limit(30));
    const snap = await getDocs(qAvisos);
    const avisos = snap.docs
      .map((docAviso) => ({ id: docAviso.id, ...docAviso.data() }))
      .filter((aviso) => aviso.activo !== false && avisoVisibleParaUsuario(aviso, rolUsuario, uidUsuario))
      .slice(0, 6);

    if (!avisos.length) {
      contenedor.innerHTML = `<article class="aviso-dashboard-item"><strong>Sin avisos nuevos</strong><p>Cuando haya comunicados o notificaciones relevantes apareceran aqui.</p></article>`;
      return;
    }

    contenedor.innerHTML = avisos.map((aviso) => `
      <article class="aviso-dashboard-item">
        <strong>${escaparHTML(aviso.titulo || "Aviso")}</strong>
        <p>${escaparHTML(aviso.mensaje || aviso.descripcion || "")}</p>
        <span class="aviso-dashboard-meta">${escaparHTML(textoDestinatarioAvisoDashboard(aviso))} Â· ${escaparHTML(aviso.creadoEn || "")}</span>
      </article>
    `).join("");
  } catch (error) {
    console.error("Error al cargar avisos:", error);
    contenedor.innerHTML = `<article class="aviso-dashboard-item"><strong>Avisos no disponibles</strong><p>No se pudieron cargar los avisos por el momento.</p></article>`;
  }
}


