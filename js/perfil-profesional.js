import { auth } from "./firebase.js";
import { actualizarUsuario, obtenerUsuario } from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let medicoUid = null;
let rolPerfilActual = "";

iniciarMonitoreoSesion("Perfil profesional");

const campos = {
  nombre: document.getElementById("nombrePerfil"),
  foto: document.getElementById("fotoPerfil"),
  especialidad: document.getElementById("especialidadPerfil"),
  institucion: document.getElementById("institucionPerfil"),
  cedula: document.getElementById("cedulaPerfil"),
  cedulaEspecialidad: document.getElementById("cedulaEspecialidadPerfil"),
  telefono: document.getElementById("telefonoPerfil"),
  correo: document.getElementById("correoPerfil"),
  descripcion: document.getElementById("descripcionPerfil")
};

function normalizarRolPerfil(rol = "") {
  return String(rol || "").toLowerCase().trim();
}

function usuarioPuedeUsarPerfilProfesional(rol = "") {
  const normalizado = normalizarRolPerfil(rol);
  return ["admin", "administrador"].includes(normalizado) || usuarioEsPersonalClinico(normalizado);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || !usuarioPuedeUsarPerfilProfesional(usuario.rol)) {
    alert("Perfil profesional disponible solo para personal clinico.");
    window.location.href = "dashboard.html";
    return;
  }

  medicoUid = user.uid;
  rolPerfilActual = normalizarRolPerfil(usuario.rol);
  llenarFormulario(usuario);
  renderPreview();
  document.body.classList.remove("bloqueado");
});

document.getElementById("formPerfil").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!medicoUid) return;

  await actualizarUsuario(medicoUid, {
    nombre: campos.nombre.value.trim(),
    fotoProfesional: campos.foto.value.trim(),
    especialidad: campos.especialidad.value.trim(),
    institucion: campos.institucion.value.trim(),
    cedulaProfesional: campos.cedula.value.trim(),
    cedulaEspecialidad: campos.cedulaEspecialidad.value.trim(),
    contactoTelefono: campos.telefono.value.trim(),
    contactoCorreo: campos.correo.value.trim(),
    descripcionProfesional: campos.descripcion.value.trim(),
    perfilProfesionalActualizado: new Date().toISOString()
  });

  const medico = await obtenerUsuario(medicoUid);
  await registrarEventoAuditoria({
    accion: "editar_perfil_profesional",
    modulo: "Perfil profesional",
    descripcion: "El usuario actualizo su perfil profesional.",
    usuarioUid: medicoUid,
    usuarioNombre: medico?.nombre || "",
    usuarioRol: medico?.rol || rolPerfilActual || "medico",
    exito: true,
    detalles: {
      especialidad: campos.especialidad.value.trim(),
      institucion: campos.institucion.value.trim(),
      tieneFoto: Boolean(campos.foto.value.trim())
    }
  });

  alert("Perfil profesional guardado.");
  renderPreview();
});

Object.values(campos).forEach((input) => {
  input.addEventListener("input", renderPreview);
});

function llenarFormulario(usuario) {
  campos.nombre.value = usuario.nombre || "";
  campos.foto.value = usuario.fotoProfesional || "";
  campos.especialidad.value = usuario.especialidad || "";
  campos.institucion.value = usuario.institucion || usuario.unidad || "";
  campos.cedula.value = usuario.cedulaProfesional || "";
  campos.cedulaEspecialidad.value = usuario.cedulaEspecialidad || "";
  campos.telefono.value = usuario.contactoTelefono || usuario.telefono || "";
  campos.correo.value = usuario.contactoCorreo || usuario.email || "";
  campos.descripcion.value = usuario.descripcionProfesional || "";
}

function renderPreview() {
  document.getElementById("nombrePreview").textContent = campos.nombre.value || "Nombre profesional";
  document.getElementById("especialidadPreview").textContent = campos.especialidad.value || "Especialidad";
  document.getElementById("institucionPreview").textContent = campos.institucion.value || "---";
  document.getElementById("cedulaPreview").textContent = [campos.cedula.value, campos.cedulaEspecialidad.value].filter(Boolean).join(" / ") || "---";
  document.getElementById("contactoPreview").textContent = [campos.telefono.value, campos.correo.value].filter(Boolean).join(" · ") || "---";
  document.getElementById("descripcionPreview").textContent = campos.descripcion.value || "";

  const foto = document.getElementById("fotoPreview");
  if (campos.foto.value.trim()) {
    foto.innerHTML = `<img src="${escaparAtributo(campos.foto.value.trim())}" alt="Fotografia profesional">`;
  } else {
    foto.textContent = iniciales(campos.nombre.value);
  }
}

function iniciales(nombre) {
  return (nombre || "DR")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function escaparAtributo(valor) {
  return String(valor).replace(/"/g, "&quot;");
}
