import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { registrarEventoAuditoria, resumenError } from "./services/auditoria.js";
import {
  actualizarEstadoReporteUsuario,
  listarReportesUsuarios
} from "./services/reportes.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const LIMITE_EVENTOS = 250;
const ACCIONES_AUDITORIA_OCULTAS = new Set([
  "abrir_modulo",
  "pagina_oculta",
  "pagina_visible"
]);

let eventosAuditoria = [];
let pacientesAdmin = [];
let usuariosAdmin = [];
let reportesUsuariosAdmin = [];
let codigosMedicoAdmin = [];
let avisosGlobalesAdmin = [];
let notasPorPaciente = {};
let adminActual = null;

const SUBCOLECCIONES_USUARIO_PACIENTE = [
  "notasMedicas",
  "notasRapidas",
  "tratamientos",
  "estudios",
  "permisosMedicos",
  "resultadosEscalas",
  "metasTerapeuticas"
];

const SUBCOLECCIONES_LEGACY_PACIENTE = [
  "registrosDiarios"
];

const DOCUMENTOS_LEGACY_PACIENTE = [
  ["miSalud", "metas"],
  ["miSalud", "agenda"]
];

const SUBCOLECCIONES_USUARIO_MEDICO = [
  "agenda",
  "borradoresMedico"
];

iniciarMonitoreoSesion("Panel administracion");

function eventoAuditoriaVisible(evento = {}) {
  return !ACCIONES_AUDITORIA_OCULTAS.has(evento.accion);
}

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

  adminActual = user;
  document.body.classList.remove("bloqueado");
  configurarFiltros();
  await cargarResumen();
  await cargarCodigosMedicoAdmin();
  await cargarUsuariosAdmin();
  await cargarPacientesAdmin();
  await cargarReportesUsuariosAdmin();
  await cargarAvisosAdmin();
  await cargarAuditoria();
});

function configurarFiltros() {
  configurarNavegacionCentroControl();

  ["filtroAuditoria", "filtroRol", "filtroModulo", "filtroResultado"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarAuditoria);
    document.getElementById(id)?.addEventListener("change", renderizarAuditoria);
  });

  document.getElementById("btnActualizarAuditoria")?.addEventListener("click", async () => {
   try {
      await cargarResumen();
    } catch (error) {
      console.error("Error en cargarResumen:", error);
}
    await cargarUsuariosAdmin();
    await cargarCodigosMedicoAdmin();
    await cargarPacientesAdmin();
    await cargarReportesUsuariosAdmin();
    await cargarAvisosAdmin();
    await cargarAuditoria();
  });

  ["filtroUsuariosAdmin", "filtroUsuariosRol"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarUsuariosAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarUsuariosAdmin);
  });

  document.getElementById("btnActualizarUsuariosAdmin")?.addEventListener("click", cargarUsuariosAdmin);
  document.getElementById("btnActualizarUsuariosRecientesAdmin")?.addEventListener("click", cargarUsuariosAdmin);

  ["filtroPacientesAdmin", "filtroPacientesEstado"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarPacientesAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarPacientesAdmin);
  });

  document.getElementById("btnActualizarPacientesAdmin")?.addEventListener("click", cargarPacientesAdmin);

  ["filtroReportesAdmin", "filtroReportesEstado", "filtroReportesTipo"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarReportesUsuariosAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarReportesUsuariosAdmin);
  });

  document.getElementById("btnActualizarReportesAdmin")?.addEventListener("click", cargarReportesUsuariosAdmin);

  document.getElementById("btnPublicarAvisoAdmin")?.addEventListener("click", publicarAvisoAdmin);
  document.getElementById("btnActualizarAvisosAdmin")?.addEventListener("click", cargarAvisosAdmin);

  document.getElementById("btnGenerarCodigoMedico")?.addEventListener("click", generarCodigoMedicoAdmin);
  document.getElementById("btnActualizarCodigosMedico")?.addEventListener("click", cargarCodigosMedicoAdmin);
}

async function publicarAvisoAdmin() {
  const titulo = document.getElementById("avisoAdminTitulo")?.value.trim() || "";
  const mensaje = document.getElementById("avisoAdminMensaje")?.value.trim() || "";
  const destinatarioTipo = document.getElementById("avisoAdminDestino")?.value || "todos";
  const destinatarioUid = document.getElementById("avisoAdminUsuario")?.value || "";
  const usuarioDestino = usuariosAdmin.find((usuario) => usuario.id === destinatarioUid);

  if (!titulo || !mensaje) {
    alert("Escribe titulo y mensaje del aviso.");
    return;
  }

  if (destinatarioTipo === "usuario" && !usuarioDestino) {
    alert("Selecciona el usuario destinatario.");
    return;
  }

  const idAviso = `aviso_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ahora = new Date().toISOString();
  const destinatarioRol = destinatarioTipo === "usuario" ? "usuario" : destinatarioTipo;

  await setDoc(doc(db, "avisosGlobales", idAviso), {
    idAviso,
    titulo,
    mensaje,
    destinatarioTipo,
    destinatarioRol,
    destinatarioUid: destinatarioTipo === "usuario" ? destinatarioUid : "",
    destinatarioNombre: destinatarioTipo === "usuario" ? (usuarioDestino.nombre || usuarioDestino.email || destinatarioUid) : "",
    destinatarioRolUsuario: destinatarioTipo === "usuario" ? (usuarioDestino.rol || "") : "",
    activo: true,
    creadoPorUid: adminActual?.uid || "",
    creadoPorEmail: adminActual?.email || "",
    creadoEn: ahora,
    actualizadoEn: ahora
  });

  document.getElementById("avisoAdminTitulo").value = "";
  document.getElementById("avisoAdminMensaje").value = "";

  await registrarAuditoriaAdmin("publicar_aviso_global", "El administrador publico un aviso global.", {
    detalles: { idAviso, destinatarioRol, destinatarioTipo, destinatarioUid, titulo }
  });
  await cargarAvisosAdmin();
}

async function cargarAvisosAdmin() {
  const contenedor = document.getElementById("listaAvisosAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando avisos...</p>";

  try {
    const qAvisos = query(collection(db, "avisosGlobales"), orderBy("creadoEn", "desc"), limit(80));
    const snap = await getDocs(qAvisos);
    avisosGlobalesAdmin = snap.docs.map((docAviso) => ({ id: docAviso.id, ...docAviso.data() }));
    renderizarAvisosAdmin();
  } catch (error) {
    console.error("Error al cargar avisos:", error);
    if (contenedor) contenedor.innerHTML = "<p>No se pudieron cargar los avisos.</p>";
  }
}

function textoDestinatarioAviso(aviso = {}) {
  if (aviso.destinatarioTipo === "usuario" || aviso.destinatarioRol === "usuario") {
    return `Usuario: ${aviso.destinatarioNombre || aviso.destinatarioUid || "sin seleccionar"}`;
  }
  const mapa = {
    todos: "Todos los usuarios",
    paciente: "Todos los pacientes",
    medico: "Todos los medicos",
    psicologo: "Todos los psicologos",
    personal_salud: "Todos los medicos y psicologos",
    admin: "Admin"
  };
  return mapa[aviso.destinatarioRol || aviso.destinatarioTipo] || "Todos los usuarios";
}

function renderizarAvisosAdmin() {
  const contenedor = document.getElementById("listaAvisosAdmin");
  if (!contenedor) return;

  if (!avisosGlobalesAdmin.length) {
    contenedor.innerHTML = "<p>No hay avisos publicados.</p>";
    return;
  }

  contenedor.innerHTML = avisosGlobalesAdmin.map((aviso) => `
    <article class="reporte-admin-card">
      <div class="reporte-admin-top">
        <div>
          <strong>${escaparHTML(aviso.titulo || "Aviso")}</strong>
          <span>${escaparHTML(textoDestinatarioAviso(aviso))} · ${escaparHTML(aviso.creadoEn || "")}</span>
        </div>
        <span class="estado-reporte ${aviso.activo === false ? "cerrado" : "nuevo"}">${aviso.activo === false ? "Oculto" : "Activo"}</span>
      </div>
      <p>${escaparHTML(aviso.mensaje || "")}</p>
      <div class="acciones-reporte-admin">
        <button type="button" data-toggle-aviso-admin="${escaparHTML(aviso.id)}" data-activo="${aviso.activo === false ? "true" : "false"}">
          ${aviso.activo === false ? "Reactivar" : "Ocultar"}
        </button>
      </div>
    </article>
  `).join("");

  contenedor.querySelectorAll("[data-toggle-aviso-admin]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      await updateDoc(doc(db, "avisosGlobales", boton.dataset.toggleAvisoAdmin), {
        activo: boton.dataset.activo === "true",
        actualizadoEn: new Date().toISOString(),
        actualizadoPorUid: adminActual?.uid || ""
      });
      await cargarAvisosAdmin();
    });
  });
}
function configurarNavegacionCentroControl() {
  document.querySelectorAll("[data-admin-section]").forEach((boton) => {
    boton.addEventListener("click", () => mostrarSeccionAdmin(boton.dataset.adminSection));
  });
  mostrarSeccionAdmin("seccionUsuariosRecientes");
}

function mostrarSeccionAdmin(idSeccion) {
  document.querySelectorAll(".admin-section").forEach((seccion) => {
    seccion.style.display = seccion.id === idSeccion ? "block" : "none";
  });
  document.querySelectorAll("[data-admin-section]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.adminSection === idSeccion);
  });
}

function actualizarCampoUsuarioAviso() {
  const destino = document.getElementById("avisoAdminDestino")?.value || "todos";
  const campo = document.getElementById("campoAvisoUsuarioAdmin");
  if (campo) campo.style.display = destino === "usuario" ? "grid" : "none";
}
function generarCodigoAutorizacionMedico() {
  const segmentos = [];
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const valores = new Uint32Array(12);
  crypto.getRandomValues(valores);

  for (let i = 0; i < 3; i++) {
    let segmento = "";
    for (let j = 0; j < 4; j++) {
      segmento += alfabeto[valores[i * 4 + j] % alfabeto.length];
    }
    segmentos.push(segmento);
  }

  return segmentos.join("-");
}

async function generarCodigoMedicoAdmin() {
  const salida = document.getElementById("codigoMedicoGenerado");
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const codigo = generarCodigoAutorizacionMedico();

  try {
    await setDoc(doc(db, "codigosAutorizacionMedico", codigo), {
      codigo,
      tipo: "medico",
      usado: false,
      creadoEn: ahora.toISOString(),
      expiraEn: expira.toISOString(),
      creadoPorUid: adminActual?.uid || "",
      creadoPorEmail: adminActual?.email || ""
    });

    if (salida) {
      salida.textContent = codigo;
      salida.classList.add("activo");
    }

    await registrarAuditoriaAdmin("generar_codigo_autorizacion_medico", "El administrador genero un codigo de autorizacion para medico.", {
      detalles: { codigo, expiraEn: expira.toISOString() }
    });

    await cargarCodigosMedicoAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_generar_codigo_autorizacion_medico", "Error al generar codigo de autorizacion para medico.", {
      exito: false,
      detalles: { error: resumenError(error) }
    });
    alert("No se pudo generar el codigo: " + error.message);
  }
}

async function cargarCodigosMedicoAdmin() {
  const contenedor = document.getElementById("listaCodigosMedicoAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando codigos...</p>";

  const qCodigos = query(
    collection(db, "codigosAutorizacionMedico"),
    orderBy("creadoEn", "desc"),
    limit(40)
  );

  const snap = await getDocs(qCodigos);
  codigosMedicoAdmin = snap.docs.map((docCodigo) => ({
    id: docCodigo.id,
    ...docCodigo.data()
  }));

  renderizarCodigosMedicoAdmin();
}

function estadoCodigoMedico(codigo = {}) {
  if (codigo.usado) return { texto: "Usado", clase: "usado" };
  const expira = codigo.expiraEn ? new Date(codigo.expiraEn) : null;
  if (!expira || Number.isNaN(expira.getTime())) return { texto: "Sin expiracion", clase: "expirado" };
  if (expira.getTime() < Date.now()) return { texto: "Expirado", clase: "expirado" };
  return { texto: "Vigente", clase: "vigente" };
}

function formatearFechaAdmin(valor) {
  if (!valor) return "Sin fecha";
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function renderizarCodigosMedicoAdmin() {
  const contenedor = document.getElementById("listaCodigosMedicoAdmin");
  if (!contenedor) return;

  if (!codigosMedicoAdmin.length) {
    contenedor.innerHTML = "<p>No hay codigos generados todavia.</p>";
    return;
  }

  contenedor.innerHTML = codigosMedicoAdmin.map((codigo) => {
    const estado = estadoCodigoMedico(codigo);
    return `
      <article class="codigo-medico-card">
        <div>
          <strong>${escaparHTML(codigo.codigo || codigo.id)}</strong>
          <small>Creado: ${escaparHTML(formatearFechaAdmin(codigo.creadoEn))}</small>
          <small>Expira: ${escaparHTML(formatearFechaAdmin(codigo.expiraEn))}</small>
        </div>
        <div>
          <span class="estado-codigo ${estado.clase}">${estado.texto}</span>
          ${codigo.usadoPorEmail ? `<small>Usado por: ${escaparHTML(codigo.usadoPorEmail)}</small>` : ""}
          ${codigo.usadoEn ? `<small>Uso: ${escaparHTML(formatearFechaAdmin(codigo.usadoEn))}</small>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function cargarResumen() {
  const snapUsuarios = await getDocs(collection(db, "usuarios"));
  const snapAuditoria = await getDocs(collection(db, "auditoria"));

  let totalUsuarios = 0;
  let totalPacientes = 0;
  let totalMedicos = 0;
  let totalPsicologos = 0;
  let totalInactividad = 0;
  let totalAuditoriaVisible = 0;

  snapUsuarios.forEach((docUsuario) => {
    totalUsuarios++;
    const datos = docUsuario.data();
    if (datos.rol === "paciente") totalPacientes++;
    if (datos.rol === "medico") totalMedicos++;
    if (datos.rol === "psicologo") totalPsicologos++;
  });

  snapAuditoria.forEach((docEvento) => {
    const evento = docEvento.data();
    if (!eventoAuditoriaVisible(evento)) return;
    totalAuditoriaVisible++;
    if (evento.accion === "sesion_inactiva") totalInactividad++;
  });

  ponerTexto("totalUsuarios", totalUsuarios);
  ponerTexto("totalPacientes", totalPacientes);
  ponerTexto("totalMedicos", totalMedicos);
  ponerTexto("totalPsicologos", totalPsicologos);
  ponerTexto("totalAuditoria", totalAuditoriaVisible);
  ponerTexto("totalInactividad", totalInactividad);
}

async function cargarUsuariosAdmin() {
  const contenedor = document.getElementById("listaUsuariosAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando usuarios...</p>";

  const snap = await getDocs(collection(db, "usuarios"));
  usuariosAdmin = snap.docs
    .map((docUsuario) => ({
      id: docUsuario.id,
      ...docUsuario.data()
    }))
    .sort((a, b) => (a.nombre || a.email || "").localeCompare(b.nombre || b.email || ""));

  renderizarUsuariosAdmin();
  renderizarUsuariosRecientesAdmin();
  poblarUsuariosAvisosAdmin();
  actualizarCampoUsuarioAviso();
}

function fechaUsuarioRegistro(usuario = {}) {
  const valor = usuario.creadoEn || usuario.createdAt || usuario.fechaRegistro || usuario.registradoEn || usuario.fechaCreacion || "";
  if (valor?.toDate) return valor.toDate();
  if (typeof valor === "object" && typeof valor.seconds === "number") return new Date(valor.seconds * 1000);
  const fecha = valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
}

function textoFechaUsuarioRegistro(usuario = {}) {
  const fecha = fechaUsuarioRegistro(usuario);
  return fecha ? fecha.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false }) : "Sin fecha registrada";
}

function renderizarUsuariosRecientesAdmin() {
  const contenedor = document.getElementById("listaUsuariosRecientesAdmin");
  if (!contenedor) return;
  const recientes = [...usuariosAdmin]
    .sort((a, b) => (fechaUsuarioRegistro(b)?.getTime() || 0) - (fechaUsuarioRegistro(a)?.getTime() || 0))
    .slice(0, 12);

  if (!recientes.length) {
    contenedor.innerHTML = "<p>No hay usuarios registrados.</p>";
    return;
  }

  contenedor.innerHTML = recientes.map((usuario) => `
    <article class="usuario-reciente-card">
      <div>
        <strong>${escaparHTML(usuario.nombre || usuario.email || "Sin nombre")}</strong>
        <span>${escaparHTML(usuario.email || "Sin correo")} · ${escaparHTML(usuario.rol || "sin rol")}</span>
      </div>
      <small>${escaparHTML(textoFechaUsuarioRegistro(usuario))}</small>
    </article>
  `).join("");
}

function poblarUsuariosAvisosAdmin() {
  const selector = document.getElementById("avisoAdminUsuario");
  if (!selector) return;
  const usuarios = [...usuariosAdmin].sort((a, b) => (a.nombre || a.email || "").localeCompare(b.nombre || b.email || ""));
  selector.innerHTML = `<option value="">Seleccionar usuario...</option>` + usuarios.map((usuario) => `
    <option value="${escaparHTML(usuario.id)}">${escaparHTML(usuario.nombre || usuario.email || usuario.id)} · ${escaparHTML(usuario.rol || "sin rol")}</option>
  `).join("");
}
function renderizarUsuariosAdmin() {
  const contenedor = document.getElementById("listaUsuariosAdmin");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroUsuariosAdmin")?.value || "");
  const rol = document.getElementById("filtroUsuariosRol")?.value || "";

  const usuarios = usuariosAdmin.filter((usuario) => {
    const coincideTexto = !texto || normalizar([
      usuario.nombre,
      usuario.email,
      usuario.id,
      usuario.rol
    ].join(" ")).includes(texto);

    const coincideRol = !rol || usuario.rol === rol;
    return coincideTexto && coincideRol;
  });

  actualizarResumenUsuariosVista(usuarios);

  if (!usuarios.length) {
    contenedor.innerHTML = "<p>No hay usuarios con esos filtros.</p>";
    return;
  }

  contenedor.innerHTML = usuarios.map((usuario) => {
    const esAdminActual = usuario.id === ADMIN_UID;
    const rolActual = usuario.rol || "sin_rol";

    return `
      <article class="usuario-admin-card">
        <div>
          <h3>${escaparHTML(usuario.nombre || usuario.email || "Usuario sin nombre")}</h3>
          <p>${escaparHTML(usuario.email || "Sin correo")}</p>
          <small>UID: ${escaparHTML(usuario.id)}</small>
          <div class="usuario-admin-meta">
            <span class="rol-${escaparHTML(rolActual)}">${escaparHTML(etiquetaRolUsuario(rolActual))}</span>
            <span>Registro: ${escaparHTML(fechaUsuarioAdmin(usuario))}</span>
            <span>Unidad: ${escaparHTML(usuario.unidad || usuario.institucion || "Sin unidad")}</span>
          </div>
        </div>

        <div class="usuario-admin-rol">
          <label for="rol-${escaparHTML(usuario.id)}">Rol</label>
          <select id="rol-${escaparHTML(usuario.id)}" ${esAdminActual ? "disabled" : ""}>
            ${opcionRol("paciente", rolActual)}
            ${opcionRol("medico", rolActual)}
            ${opcionRol("psicologo", rolActual)}
            ${opcionRol("admin", rolActual)}
          </select>
          ${esAdminActual ? "<small>Administrador principal protegido.</small>" : ""}
        </div>

        <div class="paciente-admin-acciones">
          <button type="button" ${esAdminActual ? "disabled" : ""} onclick="cambiarRolUsuarioAdmin('${usuario.id}')">
            Cambiar rol
          </button>
          <button type="button" class="boton-peligro" ${esAdminActual ? "disabled" : ""} onclick="eliminarUsuarioAdmin('${usuario.id}')">
            Eliminar usuario
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function actualizarResumenUsuariosVista(usuarios = []) {
  ponerTexto("usuariosVistaTotal", usuarios.length);
  ponerTexto("usuariosVistaPacientes", usuarios.filter((usuario) => usuario.rol === "paciente").length);
  ponerTexto("usuariosVistaMedicos", usuarios.filter((usuario) => usuario.rol === "medico").length);
  ponerTexto("usuariosVistaPsicologos", usuarios.filter((usuario) => usuario.rol === "psicologo").length);
  ponerTexto("usuariosVistaAdmin", usuarios.filter((usuario) => usuario.rol === "admin").length);
}

function etiquetaRolUsuario(rol = "") {
  const etiquetas = {
    paciente: "Paciente",
    medico: "Medico",
    psicologo: "Psicologo",
    admin: "Admin",
    sin_rol: "Sin rol"
  };
  return etiquetas[rol] || rol || "Sin rol";
}

function fechaUsuarioAdmin(usuario = {}) {
  const valor = usuario.createdAt ||
    usuario.creadoEn ||
    usuario.fechaRegistro ||
    usuario.fechaCreacion ||
    usuario.fechaAlta ||
    usuario.registradoEn ||
    "";
  if (!valor) return "Sin fecha";
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function opcionRol(rol, rolActual) {
  return `<option value="${rol}" ${rolActual === rol ? "selected" : ""}>${rol}</option>`;
}

window.cambiarRolUsuarioAdmin = async function(uidUsuario) {
  const usuario = usuariosAdmin.find((item) => item.id === uidUsuario);
  if (!usuario || uidUsuario === ADMIN_UID) return;

  const selector = document.getElementById(`rol-${uidUsuario}`);
  const nuevoRol = selector?.value || "";
  const rolAnterior = usuario.rol || "";

  if (!nuevoRol || nuevoRol === rolAnterior) return;

  const confirmar = confirm(`Cambiar rol de ${usuario.nombre || usuario.email || uidUsuario} de ${rolAnterior || "sin rol"} a ${nuevoRol}?`);
  if (!confirmar) {
    if (selector) selector.value = rolAnterior;
    return;
  }

  try {
    await updateDoc(doc(db, "usuarios", uidUsuario), {
      rol: nuevoRol,
      fechaCambioRolAdmin: new Date().toISOString(),
      cambiadoPorAdminUid: adminActual?.uid || ""
    });

    await registrarAuditoriaAdmin("cambiar_rol_usuario_admin", "El administrador cambio el rol de un usuario.", {
      pacienteUid: nuevoRol === "paciente" || rolAnterior === "paciente" ? uidUsuario : "",
      pacienteNombre: usuario.nombre || "",
      detalles: { uidUsuario, rolAnterior, nuevoRol }
    });

    await cargarResumen();
    await cargarUsuariosAdmin();
    await cargarPacientesAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_cambiar_rol_usuario_admin", "Error al cambiar rol desde admin.", {
      exito: false,
      detalles: { uidUsuario, rolAnterior, nuevoRol, error: resumenError(error) }
    });
    alert("No se pudo cambiar el rol: " + error.message);
  }
};

window.eliminarUsuarioAdmin = async function(uidUsuario) {
  const usuario = usuariosAdmin.find((item) => item.id === uidUsuario);
  if (!usuario || uidUsuario === ADMIN_UID) return;

  const nombre = usuario.nombre || usuario.email || uidUsuario;
  const confirmar = confirm(`Eliminar usuario ${nombre}? Si es paciente, tambien se eliminaran sus datos clinicos conocidos.`);
  if (!confirmar) return;

  const confirmarTexto = prompt("Escribe ELIMINAR para confirmar la eliminacion del usuario:");
  if (confirmarTexto !== "ELIMINAR") return;

  try {
    const resumenEliminacion = await eliminarUsuarioConDatos(uidUsuario, usuario);
    await registrarAuditoriaAdmin("eliminar_usuario_admin", "El administrador elimino un usuario.", {
      pacienteUid: usuario.rol === "paciente" ? uidUsuario : "",
      pacienteNombre: usuario.rol === "paciente" ? usuario.nombre || "" : "",
      detalles: {
        uidUsuario,
        rol: usuario.rol || "",
        ...resumenEliminacion
      }
    });

    delete notasPorPaciente[uidUsuario];
    await cargarResumen();
    await cargarUsuariosAdmin();
    await cargarPacientesAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_eliminar_usuario_admin", "Error al eliminar usuario desde admin.", {
      exito: false,
      pacienteUid: usuario.rol === "paciente" ? uidUsuario : "",
      pacienteNombre: usuario.rol === "paciente" ? usuario.nombre || "" : "",
      detalles: { uidUsuario, rol: usuario.rol || "", error: resumenError(error) }
    });
    alert("No se pudo eliminar el usuario: " + error.message);
  }
};

async function eliminarUsuarioConDatos(uidUsuario, usuario = {}) {
  if (usuario.rol === "paciente") {
    return await eliminarPacienteConSubcolecciones(uidUsuario);
  }

  const resumen = {};

  if (usuario.rol === "medico" || usuario.rol === "psicologo") {
    for (const nombreColeccion of SUBCOLECCIONES_USUARIO_MEDICO) {
      resumen[nombreColeccion] = await eliminarDocumentosColeccion(
        collection(db, "usuarios", uidUsuario, nombreColeccion)
      );
    }
  }

  await deleteDoc(doc(db, "usuarios", uidUsuario));
  resumen.usuario = "eliminado";
  resumen.auth = "perfil_firestore_eliminado_no_cuenta_auth";
  return resumen;
}

async function cargarPacientesAdmin() {
  const contenedor = document.getElementById("listaPacientesAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando pacientes...</p>";

  const qPacientes = query(
    collection(db, "usuarios"),
    where("rol", "==", "paciente")
  );

  const snap = await getDocs(qPacientes);
  pacientesAdmin = snap.docs
    .map((docPaciente) => ({
      id: docPaciente.id,
      ...docPaciente.data()
    }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  renderizarPacientesAdmin();
}

function renderizarPacientesAdmin() {
  const contenedor = document.getElementById("listaPacientesAdmin");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroPacientesAdmin")?.value || "");
  const estado = document.getElementById("filtroPacientesEstado")?.value || "";

  const pacientes = pacientesAdmin.filter((paciente) => {
    const estadoPaciente = paciente.estado || "activo";
    const diagnostico = diagnosticoTexto(paciente);
    const coincideTexto = !texto || normalizar([
      paciente.nombre,
      paciente.email,
      paciente.medicoTratante,
      paciente.medicoTratanteUid,
      diagnostico,
      paciente.expediente,
      paciente.numeroExpediente
    ].join(" ")).includes(texto);

    const coincideEstado = !estado || estadoPaciente === estado;
    return coincideTexto && coincideEstado;
  });

  if (!pacientes.length) {
    contenedor.innerHTML = "<p>No hay pacientes con esos filtros.</p>";
    return;
  }

  contenedor.innerHTML = pacientes.map((paciente) => {
    const notas = notasPorPaciente[paciente.id] || [];
    const notasHtml = notasPorPaciente[paciente.id]
      ? renderizarNotasPacienteAdmin(paciente.id, notas)
      : "<p class=\"admin-muted\">Notas no cargadas.</p>";

    return `
      <article class="paciente-admin-card">
        <div class="paciente-admin-resumen">
          <div>
            <h3>${escaparHTML(paciente.nombre || "Paciente sin nombre")}</h3>
            <p>${escaparHTML(paciente.email || "Sin correo")}</p>
            <small>ID: ${escaparHTML(paciente.id)}</small>
          </div>
          <div class="paciente-admin-meta">
            <span>${escaparHTML(paciente.estado || "activo")}</span>
            <span>${escaparHTML(diagnosticoTexto(paciente) || "Sin diagnostico")}</span>
            <span>Medico: ${escaparHTML(paciente.medicoTratante || paciente.medicoTratanteUid || "Sin registro")}</span>
          </div>
          <div class="paciente-admin-acciones">
            <button type="button" onclick="cargarNotasPacienteAdmin('${paciente.id}')">
              ${notasPorPaciente[paciente.id] ? "Actualizar notas" : "Ver notas"}
            </button>
            <button type="button" class="boton-peligro" onclick="eliminarPacienteAdmin('${paciente.id}')">
              Eliminar paciente
            </button>
          </div>
        </div>
        <div class="notas-admin-lista">
          ${notasHtml}
        </div>
      </article>
    `;
  }).join("");
}

function renderizarNotasPacienteAdmin(uidPaciente, notas) {
  if (!notas.length) {
    return "<p class=\"admin-muted\">Este paciente no tiene notas medicas.</p>";
  }

  return notas.map((nota) => {
    const fecha = nota.fecha ? new Date(nota.fecha).toLocaleString("es-MX") : "Sin fecha";
    const contenido = nota.notaEditada || nota;
    const resumen = contenido.notaRapida ||
      contenido.subjetivo ||
      contenido.objetivo ||
      contenido.analisis ||
      contenido.plan ||
      "Sin contenido visible";

    return `
      <div class="nota-admin-item">
        <div>
          <strong>${escaparHTML(fecha)}</strong>
          <small>${escaparHTML(nota.autor || "Sin autor")} - ${escaparHTML(nota.tipoNota || "completa")}</small>
          <p>${escaparHTML(resumen).slice(0, 420)}</p>
        </div>
        <button type="button" class="boton-peligro" onclick="eliminarNotaPacienteAdmin('${uidPaciente}', '${nota.id}')">
          Eliminar nota
        </button>
      </div>
    `;
  }).join("");
}

window.cargarNotasPacienteAdmin = async function(uidPaciente) {
  const qNotas = query(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    orderBy("fecha", "desc")
  );

  const snap = await getDocs(qNotas);
  notasPorPaciente[uidPaciente] = snap.docs.map((docNota) => ({
    id: docNota.id,
    ...docNota.data()
  }));

  renderizarPacientesAdmin();
};

window.eliminarNotaPacienteAdmin = async function(uidPaciente, notaId) {
  const paciente = pacientesAdmin.find((p) => p.id === uidPaciente);
  const confirmar = confirm(`Eliminar esta nota de ${paciente?.nombre || "este paciente"}? Esta accion no se puede deshacer.`);
  if (!confirmar) return;

  try {
    await deleteDoc(doc(db, "usuarios", uidPaciente, "notasMedicas", notaId));
    await registrarAuditoriaAdmin("eliminar_nota_medica_admin", "El administrador elimino una nota medica.", {
      pacienteUid: uidPaciente,
      pacienteNombre: paciente?.nombre || "",
      detalles: { notaId }
    });
    await window.cargarNotasPacienteAdmin(uidPaciente);
    await cargarResumen();
  } catch (error) {
    await registrarAuditoriaAdmin("error_eliminar_nota_medica_admin", "Error al eliminar nota medica desde admin.", {
      pacienteUid: uidPaciente,
      pacienteNombre: paciente?.nombre || "",
      exito: false,
      detalles: { notaId, error: resumenError(error) }
    });
    alert("No se pudo eliminar la nota: " + error.message);
  }
};

window.eliminarPacienteAdmin = async function(uidPaciente) {
  const paciente = pacientesAdmin.find((p) => p.id === uidPaciente);
  const nombre = paciente?.nombre || "este paciente";
  const confirmar = confirm(`Eliminar permanentemente a ${nombre} y sus documentos clinicos conocidos?`);
  if (!confirmar) return;

  const confirmarTexto = prompt("Escribe ELIMINAR para confirmar la eliminacion permanente del paciente:");
  if (confirmarTexto !== "ELIMINAR") return;

  try {
    const resumenEliminacion = await eliminarPacienteConSubcolecciones(uidPaciente);
    await registrarAuditoriaAdmin("eliminar_paciente_admin", "El administrador elimino un paciente.", {
      pacienteUid: uidPaciente,
      pacienteNombre: paciente?.nombre || "",
      detalles: resumenEliminacion
    });

    delete notasPorPaciente[uidPaciente];
    await cargarResumen();
    await cargarUsuariosAdmin();
    await cargarPacientesAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_eliminar_paciente_admin", "Error al eliminar paciente desde admin.", {
      pacienteUid: uidPaciente,
      pacienteNombre: paciente?.nombre || "",
      exito: false,
      detalles: { error: resumenError(error) }
    });
    alert("No se pudo eliminar el paciente: " + error.message);
  }
};

async function eliminarPacienteConSubcolecciones(uidPaciente) {
  const resumen = {};

  for (const nombreColeccion of SUBCOLECCIONES_USUARIO_PACIENTE) {
    resumen[nombreColeccion] = await eliminarDocumentosColeccion(
      collection(db, "usuarios", uidPaciente, nombreColeccion)
    );
  }

  for (const nombreColeccion of SUBCOLECCIONES_LEGACY_PACIENTE) {
    resumen[`pacientes/${nombreColeccion}`] = await eliminarDocumentosColeccion(
      collection(db, "pacientes", uidPaciente, nombreColeccion)
    );
  }

  for (const ruta of DOCUMENTOS_LEGACY_PACIENTE) {
    await deleteDoc(doc(db, "pacientes", uidPaciente, ...ruta));
    resumen[`pacientes/${ruta.join("/")}`] = "eliminado_si_existia";
  }

  await deleteDoc(doc(db, "pacientes", uidPaciente));
  await deleteDoc(doc(db, "usuarios", uidPaciente));
  resumen.usuario = "eliminado";
  return resumen;
}

async function eliminarDocumentosColeccion(refColeccion) {
  const snap = await getDocs(refColeccion);
  await Promise.all(snap.docs.map((documento) => deleteDoc(documento.ref)));
  return snap.size;
}

async function registrarAuditoriaAdmin(accion, descripcion, opciones = {}) {
  await registrarEventoAuditoria({
    accion,
    modulo: "Panel administracion",
    descripcion,
    usuarioUid: adminActual?.uid || "",
    usuarioNombre: adminActual?.email || "Administrador",
    usuarioRol: "admin",
    pacienteUid: opciones.pacienteUid || "",
    pacienteNombre: opciones.pacienteNombre || "",
    exito: opciones.exito !== false,
    detalles: opciones.detalles || {}
  });
}

async function cargarReportesUsuariosAdmin() {
  const contenedor = document.getElementById("listaReportesAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando reportes...</p>";

  try {
    reportesUsuariosAdmin = await listarReportesUsuarios();
    renderizarReportesUsuariosAdmin();
  } catch (error) {
    if (contenedor) {
      contenedor.innerHTML = `<p class="admin-muted">No se pudieron cargar los reportes: ${escaparHTML(error.message)}</p>`;
    }
  }
}

function renderizarReportesUsuariosAdmin() {
  const contenedor = document.getElementById("listaReportesAdmin");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroReportesAdmin")?.value || "");
  const estado = document.getElementById("filtroReportesEstado")?.value || "";
  const tipo = document.getElementById("filtroReportesTipo")?.value || "";

  const reportes = reportesUsuariosAdmin.filter((reporte) => {
    const coincideTexto = !texto || normalizar([
      reporte.titulo,
      reporte.mensaje,
      reporte.usuarioEmail,
      reporte.usuarioNombre,
      reporte.usuarioUid,
      reporte.pagina,
      reporte.url
    ].join(" ")).includes(texto);

    const coincideEstado = !estado || (reporte.estado || "nuevo") === estado;
    const coincideTipo = !tipo || reporte.tipo === tipo;
    return coincideTexto && coincideEstado && coincideTipo;
  });

  if (!reportes.length) {
    contenedor.innerHTML = "<p class=\"admin-muted\">No hay reportes con esos filtros.</p>";
    return;
  }

  contenedor.innerHTML = reportes.map((reporte) => {
    const fecha = reporte.fechaCreacion?.toDate
      ? reporte.fechaCreacion.toDate().toLocaleString("es-MX")
      : reporte.fechaISO
        ? new Date(reporte.fechaISO).toLocaleString("es-MX")
        : "Sin fecha";

    const usuario = reporte.usuarioNombre || reporte.usuarioEmail || reporte.usuarioUid || "Usuario no identificado";
    const estadoReporte = reporte.estado || "nuevo";

    return `
      <article class="reporte-admin-card">
        <div class="reporte-admin-top">
          <span class="reporte-admin-tipo">${escaparHTML(etiquetaTipoReporte(reporte.tipo))}</span>
          <span class="reporte-admin-estado estado-${escaparHTML(estadoReporte)}">${escaparHTML(estadoReporte)}</span>
        </div>
        <h3>${escaparHTML(reporte.titulo || "Sin titulo")}</h3>
        <p>${escaparHTML(reporte.mensaje || "Sin descripcion")}</p>
        <div class="reporte-admin-meta">
          <span>${escaparHTML(fecha)}</span>
          <span>${escaparHTML(usuario)}</span>
          <span>${escaparHTML(reporte.pagina || "Sin pagina")}</span>
        </div>
        <div class="reporte-admin-acciones">
          <select id="estado-reporte-${escaparHTML(reporte.id)}">
            ${opcionEstadoReporte("nuevo", estadoReporte)}
            ${opcionEstadoReporte("en_revision", estadoReporte)}
            ${opcionEstadoReporte("resuelto", estadoReporte)}
          </select>
          <button type="button" onclick="cambiarEstadoReporteAdmin('${reporte.id}')">Actualizar estado</button>
        </div>
      </article>
    `;
  }).join("");
}

function etiquetaTipoReporte(tipo) {
  const etiquetas = {
    problema: "Problema",
    sugerencia: "Sugerencia",
    peticion_personal: "Peticion personal",
    nueva_funcionalidad: "Nueva funcionalidad"
  };

  return etiquetas[tipo] || "Reporte";
}

function opcionEstadoReporte(valor, actual) {
  return `<option value="${valor}" ${valor === actual ? "selected" : ""}>${valor}</option>`;
}

window.cambiarEstadoReporteAdmin = async function(reporteId) {
  const selector = document.getElementById(`estado-reporte-${reporteId}`);
  const estado = selector?.value || "nuevo";

  try {
    await actualizarEstadoReporteUsuario(reporteId, estado);
    await cargarReportesUsuariosAdmin();
  } catch (error) {
    alert("No se pudo actualizar el reporte: " + error.message);
  }
};

async function cargarAuditoria() {
  const qAuditoria = query(
    collection(db, "auditoria"),
    orderBy("fecha", "desc"),
    limit(LIMITE_EVENTOS)
  );

  const snap = await getDocs(qAuditoria);
  eventosAuditoria = snap.docs
    .map((docEvento) => ({
      id: docEvento.id,
      ...docEvento.data()
    }))
    .filter(eventoAuditoriaVisible);

  llenarFiltroModulos();
  renderizarAuditoria();
}

function llenarFiltroModulos() {
  const filtroModulo = document.getElementById("filtroModulo");
  if (!filtroModulo) return;

  const valorActual = filtroModulo.value;
  const modulos = [...new Set(eventosAuditoria.map((e) => e.modulo).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  filtroModulo.innerHTML = "<option value=\"\">Todos los modulos</option>";
  modulos.forEach((modulo) => {
    const option = document.createElement("option");
    option.value = modulo;
    option.textContent = modulo;
    filtroModulo.appendChild(option);
  });

  filtroModulo.value = modulos.includes(valorActual) ? valorActual : "";
}

function renderizarAuditoria() {
  const tabla = document.getElementById("tablaAuditoria");
  if (!tabla) return;

  const texto = normalizar(document.getElementById("filtroAuditoria")?.value || "");
  const rol = document.getElementById("filtroRol")?.value || "";
  const modulo = document.getElementById("filtroModulo")?.value || "";
  const resultado = document.getElementById("filtroResultado")?.value || "";

  const eventos = eventosAuditoria.filter((evento) => {
    const coincideTexto = !texto || normalizar([
      evento.usuarioNombre,
      evento.usuarioUid,
      evento.usuarioRol,
      evento.modulo,
      evento.accion,
      evento.descripcion,
      evento.pacienteNombre,
      evento.pacienteUid
    ].join(" ")).includes(texto);

    const coincideRol = !rol || evento.usuarioRol === rol;
    const coincideModulo = !modulo || evento.modulo === modulo;
    const coincideResultado = !resultado || String(Boolean(evento.exito)) === resultado;

    return coincideTexto && coincideRol && coincideModulo && coincideResultado;
  });

  if (!eventos.length) {
    tabla.innerHTML = "<tr><td colspan=\"8\">No hay eventos con esos filtros.</td></tr>";
    return;
  }

  tabla.innerHTML = eventos.map((evento) => {
    const fecha = evento.fechaTexto
      ? new Date(evento.fechaTexto).toLocaleString("es-MX")
      : "Sin fecha";

    const resultadoHTML = evento.exito
      ? "<span class=\"ok\">Correcto</span>"
      : "<span class=\"error\">Error</span>";

    return `
      <tr>
        <td>${escaparHTML(fecha)}</td>
        <td>
          <strong>${escaparHTML(evento.usuarioNombre || "-")}</strong>
          <small>${escaparHTML(evento.usuarioUid || "")}</small>
        </td>
        <td>${escaparHTML(evento.usuarioRol || "-")}</td>
        <td>${escaparHTML(evento.modulo || "-")}</td>
        <td>
          <strong>${escaparHTML(evento.accion || "-")}</strong>
          <small>${escaparHTML(evento.descripcion || "")}</small>
        </td>
        <td>
          ${escaparHTML(evento.pacienteNombre || "-")}
          <small>${escaparHTML(evento.pacienteUid || "")}</small>
        </td>
        <td>${resultadoHTML}</td>
        <td>
          <details>
            <summary>Ver</summary>
            <pre>${escaparHTML(JSON.stringify(evento.detalles || {}, null, 2))}</pre>
          </details>
        </td>
      </tr>
    `;
  }).join("");
}

function ponerTexto(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = texto;
}

function normalizar(valor) {
  return String(valor).trim().toLowerCase();
}

function diagnosticoTexto(paciente = {}) {
  const diagnostico = paciente.diagnostico ||
    (Array.isArray(paciente.historialDiagnosticos)
      ? paciente.historialDiagnosticos[paciente.historialDiagnosticos.length - 1]
      : "");

  if (!diagnostico) return "";
  if (typeof diagnostico === "string") return diagnostico;

  return [
    diagnostico.codigo,
    diagnostico.nombre || diagnostico.texto || diagnostico.descripcion
  ].filter(Boolean).join(" - ");
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


