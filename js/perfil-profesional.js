import { auth } from "./firebase.js";
import { actualizarUsuario, obtenerUsuario } from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { renderizarFotoPerfil, subirFotoPerfil } from "./services/profilePhotoService.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let medicoUid = null;
let rolPerfilActual = "";
let subiendoFoto = false;

iniciarMonitoreoSesion("Perfil profesional");

const campos = {
  nombre: document.getElementById("nombrePerfil"),
  foto: document.getElementById("fotoPerfil"),
  especialidad: document.getElementById("especialidadPerfil"),
  institucion: document.getElementById("institucionPerfil"),
  direccionConsultorio: document.getElementById("direccionConsultorioPerfil"),
  mostrarDireccionConsultorioReceta: document.getElementById("mostrarDireccionConsultorioRecetaPerfil"),
  cedula: document.getElementById("cedulaPerfil"),
  cedulaEspecialidad: document.getElementById("cedulaEspecialidadPerfil"),
  telefono: document.getElementById("telefonoPerfil"),
  correo: document.getElementById("correoPerfil"),
  descripcion: document.getElementById("descripcionPerfil")
};
const archivoFotoPerfil = document.getElementById("archivoFotoPerfil");
const estadoFotoPerfil = document.getElementById("estadoFotoPerfil");

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
  archivoFotoPerfil.disabled = false;
  document.body.classList.remove("bloqueado");
});

archivoFotoPerfil.addEventListener("change", async () => {
  const file = archivoFotoPerfil.files?.[0];
  if (!file || !medicoUid || subiendoFoto) return;

  subiendoFoto = true;
  archivoFotoPerfil.disabled = true;
  estadoFotoPerfil.textContent = "Subiendo fotografía...";
  try {
    const resultado = await subirFotoPerfil(medicoUid, file, {
      onProgress: (porcentaje) => {
        estadoFotoPerfil.textContent = porcentaje > 0
          ? `Subiendo fotografía... ${porcentaje}%`
          : "Preparando fotografía...";
      }
    });
    campos.foto.value = resultado.url;
    renderPreview();
    estadoFotoPerfil.textContent = "Fotografía actualizada.";

    registrarEventoAuditoria({
      accion: "actualizar_foto_perfil",
      modulo: "Perfil profesional",
      descripcion: "El usuario actualizó su fotografía de perfil.",
      usuarioUid: medicoUid,
      usuarioRol: rolPerfilActual || "medico",
      exito: true,
      detalles: { storagePath: resultado.storagePath }
    }).catch((error) => {
      console.warn("No se pudo registrar la auditoría de la fotografía.", error?.code || error?.name || "error");
    });
  } catch (error) {
    console.error("No se pudo actualizar la fotografía de perfil.", error);
    estadoFotoPerfil.textContent = error?.message || "No se pudo subir la fotografía. Intenta nuevamente.";
  } finally {
    subiendoFoto = false;
    archivoFotoPerfil.disabled = false;
    archivoFotoPerfil.value = "";
  }
});

document.getElementById("formPerfil").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!medicoUid) return;

  await actualizarUsuario(medicoUid, {
    nombre: campos.nombre.value.trim(),
    fotoProfesional: campos.foto.value.trim(),
    especialidad: campos.especialidad.value.trim(),
    institucion: campos.institucion.value.trim(),
    direccionConsultorio: campos.direccionConsultorio.value.trim(),
    mostrarDireccionConsultorioReceta: campos.mostrarDireccionConsultorioReceta.checked,
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
      tieneDireccionConsultorio: Boolean(campos.direccionConsultorio.value.trim()),
      muestraDireccionConsultorioReceta: campos.mostrarDireccionConsultorioReceta.checked,
      tieneFoto: Boolean(campos.foto.value.trim())
    }
  });

  alert("Perfil profesional guardado.");
  renderPreview();
});

Object.values(campos).forEach((input) => {
  input.addEventListener(input.type === "checkbox" ? "change" : "input", renderPreview);
});

function llenarFormulario(usuario) {
  campos.nombre.value = usuario.nombre || "";
  campos.foto.value = usuario.fotoProfesional || "";
  campos.especialidad.value = usuario.especialidad || "";
  campos.institucion.value = usuario.institucion || usuario.unidad || "";
  campos.direccionConsultorio.value = usuario.direccionConsultorio || "";
  campos.mostrarDireccionConsultorioReceta.checked = usuario.mostrarDireccionConsultorioReceta === true;
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
  document.getElementById("direccionConsultorioPreview").textContent = campos.direccionConsultorio.value || "---";
  document.getElementById("visibilidadDireccionConsultorioPreview").textContent = campos.mostrarDireccionConsultorioReceta.checked
    ? "Visible en recetas"
    : "Oculta en recetas";
  document.getElementById("cedulaPreview").textContent = [campos.cedula.value, campos.cedulaEspecialidad.value].filter(Boolean).join(" / ") || "---";
  document.getElementById("contactoPreview").textContent = [campos.telefono.value, campos.correo.value].filter(Boolean).join(" · ") || "---";
  document.getElementById("descripcionPreview").textContent = campos.descripcion.value || "";

  const datosFoto = {
    url: campos.foto.value.trim(),
    nombre: campos.nombre.value,
    alt: "Fotografía profesional"
  };
  renderizarFotoPerfil(document.getElementById("fotoPreview"), datosFoto);
  renderizarFotoPerfil(document.getElementById("fotoPerfilEditor"), datosFoto);
}
