import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { registrarEventoAuditoria, resumenError } from "./services/auditoria.js";
import { FORMATOS_INSTITUCIONALES, permisosFormatosDesdeUsuario } from "./services/formatosInstitucionales.js";
import {
  agregarContactoMensaje,
  archivarConversacionMensaje,
  eliminarConversacionMensaje,
  enviarMensajeConversacion,
  listarConversacionesMensajes,
  listarMensajesConversacion,
  marcarMensajesConversacionVistos,
  obtenerOCrearConversacion
} from "./services/mensajes.js";
import {
  actualizarEstadoReporteUsuario,
  archivarReporteUsuario,
  eliminarReporteUsuario,
  listarReportesUsuarios,
  responderReporteUsuario
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
const LIMITE_EVENTOS = 1000;
const VENTANA_USUARIO_EN_LINEA_MS = 20 * 60 * 1000;
const CLAVE_USUARIOS_AUDITORIA_OCULTOS = "cognicion_admin_auditoria_usuarios_ocultos";
const ACCIONES_AUDITORIA_OCULTAS = new Set([
  "abrir_modulo",
  "pagina_oculta",
  "pagina_visible"
]);

let eventosAuditoria = [];
let usuariosOcultosAuditoria = new Set();
let pacientesAdmin = [];
let usuariosAdmin = [];
let reportesUsuariosAdmin = [];
let codigosMedicoAdmin = [];
let avisosGlobalesAdmin = [];
let notasPorPaciente = {};
let adminActual = null;
let conversacionesAdmin = [];
let conversacionAdminActiva = null;
let mensajesAdminActivos = [];
const CLAVE_ALTURAS_RESPUESTAS_REPORTE = "cognicion_admin_alturas_respuestas_reportes";
const ESTADOS_REPORTE_ADMIN = [
  "nuevo",
  "en_revision",
  "resuelto",
  "prueba",
  "invalido",
  "duplicado",
  "descartado"
];

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
  await cargarMensajesAdmin();
  await cargarAuditoria();
});

function configurarFiltros() {
  configurarNavegacionCentroControl();
  usuariosOcultosAuditoria = cargarUsuariosOcultosAuditoria();

  ["filtroAuditoria", "filtroRol", "filtroModulo", "filtroResultado"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarAuditoria);
    document.getElementById(id)?.addEventListener("change", renderizarAuditoria);
  });

  document.getElementById("filtroUsuariosOcultosAuditoria")?.addEventListener("input", renderizarUsuariosOcultosAuditoria);
  document.getElementById("filtroSesionesAuditoria")?.addEventListener("input", renderizarSesionesAuditoria);
  document.getElementById("btnLimpiarUsuariosOcultosAuditoria")?.addEventListener("click", () => {
    usuariosOcultosAuditoria.clear();
    guardarUsuariosOcultosAuditoria();
    renderizarUsuariosOcultosAuditoria();
    renderizarAuditoria();
  });

  document.getElementById("btnActualizarAuditoria")?.addEventListener("click", async () => {
    await cargarResumen();
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
  document.getElementById("btnActualizarFormatosAdmin")?.addEventListener("click", cargarUsuariosAdmin);
  document.getElementById("btnAutorizarFrayVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin("fray", true));
  document.getElementById("btnRetirarFrayVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin("fray", false));

  ["filtroFormatosAdmin", "filtroFormatosInstitucionAdmin"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarFormatosAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarFormatosAdmin);
  });

  ["filtroPacientesAdmin", "filtroPacientesEstado"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarPacientesAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarPacientesAdmin);
  });

  document.getElementById("btnActualizarPacientesAdmin")?.addEventListener("click", cargarPacientesAdmin);

    ["filtroReportesAdmin", "filtroReportesEstado", "filtroReportesTipo", "filtroReportesArchivo"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderizarReportesUsuariosAdmin);
    document.getElementById(id)?.addEventListener("change", renderizarReportesUsuariosAdmin);
  });

  document.getElementById("btnActualizarReportesAdmin")?.addEventListener("click", cargarReportesUsuariosAdmin);

  document.getElementById("btnPublicarAvisoAdmin")?.addEventListener("click", publicarAvisoAdmin);
  document.getElementById("btnActualizarAvisosAdmin")?.addEventListener("click", cargarAvisosAdmin);
  document.getElementById("btnActualizarMensajesAdmin")?.addEventListener("click", cargarMensajesAdmin);
  document.getElementById("filtroMensajesAdmin")?.addEventListener("input", renderizarConversacionesAdmin);
  document.getElementById("btnNuevoMensajeAdmin")?.addEventListener("click", renderizarNuevoMensajeAdmin);

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
    const avisosBase = snap.docs
      .map((docAviso) => ({ id: docAviso.id, ...docAviso.data() }))
      .filter((aviso) => !aviso.eliminado);
    avisosGlobalesAdmin = await Promise.all(avisosBase.map(async (aviso) => {
      const lecturasDocumento = Object.entries(aviso.lecturasUsuarios || {}).map(([uid, lectura]) => ({
        id: uid,
        uid,
        ...(lectura || {})
      }));

      try {
        const snapLecturas = await getDocs(collection(db, "avisosGlobales", aviso.id, "lecturas"));
        const lecturasSubcoleccion = snapLecturas.docs.map((docLectura) => ({ id: docLectura.id, ...docLectura.data() }));
        const lecturasPorUid = new Map();
        [...lecturasDocumento, ...lecturasSubcoleccion].forEach((lectura) => {
          const uid = lectura.uid || lectura.id;
          if (uid) lecturasPorUid.set(uid, lectura);
        });
        return {
          ...aviso,
          lecturas: Array.from(lecturasPorUid.values())
        };
      } catch (error) {
        console.warn("No se pudieron cargar lecturas del aviso:", aviso.id, error);
        return { ...aviso, lecturas: lecturasDocumento };
      }
    }));
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
          <span>${escaparHTML(textoDestinatarioAviso(aviso))} Â· ${escaparHTML(aviso.creadoEn || "")}</span>
        </div>
        <span class="estado-reporte ${aviso.archivado ? "cerrado" : aviso.activo === false ? "cerrado" : "nuevo"}">${aviso.archivado ? "Archivado" : aviso.activo === false ? "Oculto" : "Activo"}</span>
      </div>
      <p>${escaparHTML(aviso.mensaje || "")}</p>
      <div class="lecturas-aviso-admin">
        <strong>Lecturas: ${aviso.lecturas?.length || 0}</strong>
        ${(aviso.lecturas?.length || 0) ? `
          <details>
            <summary>Ver usuarios que lo marcaron como leido</summary>
            <ul>
              ${aviso.lecturas.map((lectura) => `
                <li>${escaparHTML(lectura.nombre || lectura.email || lectura.uid || "Usuario")} Â· ${escaparHTML(lectura.rol || "sin rol")} Â· ${escaparHTML(lectura.leidoEn || "")}</li>
              `).join("")}
            </ul>
          </details>
        ` : `<span>Nadie lo ha marcado como leido todavia.</span>`}
      </div>
      <div class="acciones-reporte-admin">
        <button type="button" data-toggle-aviso-admin="${escaparHTML(aviso.id)}" data-activo="${aviso.activo === false ? "true" : "false"}">
          ${aviso.activo === false ? "Reactivar" : "Ocultar"}
        </button>
        <button type="button" data-archivar-aviso-admin="${escaparHTML(aviso.id)}" data-archivado="${aviso.archivado ? "false" : "true"}">
          ${aviso.archivado ? "Desarchivar" : "Archivar"}
        </button>
        <button type="button" class="boton-peligro" data-eliminar-aviso-admin="${escaparHTML(aviso.id)}">
          Eliminar
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

  contenedor.querySelectorAll("[data-archivar-aviso-admin]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      await updateDoc(doc(db, "avisosGlobales", boton.dataset.archivarAvisoAdmin), {
        archivado: boton.dataset.archivado === "true",
        activo: boton.dataset.archivado === "true" ? false : true,
        actualizadoEn: new Date().toISOString(),
        actualizadoPorUid: adminActual?.uid || ""
      });
      await cargarAvisosAdmin();
    });
  });

  contenedor.querySelectorAll("[data-eliminar-aviso-admin]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      if (!confirm("Eliminar este aviso enviado? Dejara de mostrarse a los usuarios.")) return;
      await updateDoc(doc(db, "avisosGlobales", boton.dataset.eliminarAvisoAdmin), {
        eliminado: true,
        activo: false,
        eliminadoEn: new Date().toISOString(),
        eliminadoPorUid: adminActual?.uid || ""
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
  renderizarUsuariosOcultosAuditoria();
  renderizarSesionesAuditoria();
  poblarUsuariosAvisosAdmin();
  poblarInstitucionesFormatosAdmin();
  renderizarFormatosAdmin();
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
        <span>${escaparHTML(usuario.email || "Sin correo")} Â· ${escaparHTML(usuario.rol || "sin rol")}</span>
      </div>
      <small>${escaparHTML(textoFechaUsuarioRegistro(usuario))}</small>
    </article>
  `).join("");
}

function cargarUsuariosOcultosAuditoria() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_USUARIOS_AUDITORIA_OCULTOS) || "[]");
    return new Set(Array.isArray(datos) ? datos.filter(Boolean) : []);
  } catch (error) {
    return new Set();
  }
}

function guardarUsuariosOcultosAuditoria() {
  localStorage.setItem(CLAVE_USUARIOS_AUDITORIA_OCULTOS, JSON.stringify([...usuariosOcultosAuditoria]));
}

function renderizarUsuariosOcultosAuditoria() {
  const contenedor = document.getElementById("listaUsuariosOcultosAuditoria");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroUsuariosOcultosAuditoria")?.value || "");
  const usuarios = usuariosAdmin.filter((usuario) => {
    if (!texto) return true;
    return normalizar([
      usuario.nombre,
      usuario.email,
      usuario.id,
      usuario.rol,
      usuario.unidad,
      usuario.institucion
    ].join(" ")).includes(texto);
  });

  if (!usuarios.length) {
    contenedor.innerHTML = "<p>No hay usuarios con esa busqueda.</p>";
    return;
  }

  contenedor.innerHTML = usuarios.map((usuario) => {
    const oculto = usuariosOcultosAuditoria.has(usuario.id);
    return `
      <label class="usuario-oculto-auditoria ${oculto ? "activo" : ""}">
        <input type="checkbox" data-usuario-auditoria-oculto="${escaparHTML(usuario.id)}" ${oculto ? "checked" : ""}>
        <span>
          <strong>${escaparHTML(usuario.nombre || usuario.email || "Usuario sin nombre")}</strong>
          <small>${escaparHTML(usuario.email || usuario.id)} Â· ${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</small>
        </span>
      </label>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-usuario-auditoria-oculto]").forEach((input) => {
    input.addEventListener("change", (evento) => {
      const uid = evento.currentTarget.dataset.usuarioAuditoriaOculto;
      if (!uid) return;
      if (evento.currentTarget.checked) {
        usuariosOcultosAuditoria.add(uid);
      } else {
        usuariosOcultosAuditoria.delete(uid);
      }
      guardarUsuariosOcultosAuditoria();
      renderizarUsuariosOcultosAuditoria();
      renderizarAuditoria();
    });
  });
}

function fechaEventoAuditoria(evento = {}) {
  const valor = evento.fechaTexto || evento.fecha || evento.createdAt || "";
  if (valor?.toDate) return valor.toDate();
  if (typeof valor === "object" && typeof valor.seconds === "number") return new Date(valor.seconds * 1000);
  const fecha = valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
}

function textoFechaCortaAdmin(fecha) {
  return fecha ? fecha.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }) : "Sin registro";
}

function resumenSesionesUsuariosAdmin() {
  const porUsuario = new Map();

  [...eventosAuditoria]
    .sort((a, b) => (fechaEventoAuditoria(b)?.getTime() || 0) - (fechaEventoAuditoria(a)?.getTime() || 0))
    .forEach((evento) => {
      const uid = evento.usuarioUid || "";
      if (!uid) return;
      const fecha = fechaEventoAuditoria(evento);
      if (!fecha) return;

      const actual = porUsuario.get(uid) || {
        ultimoEvento: null,
        ultimoInicio: null,
        ultimaDesconexion: null,
        ultimaAccion: ""
      };

      if (!actual.ultimoEvento) {
        actual.ultimoEvento = fecha;
        actual.ultimaAccion = evento.accion || "";
      }
      if (!actual.ultimoInicio && evento.accion === "inicio_sesion") actual.ultimoInicio = fecha;
      if (!actual.ultimaDesconexion && ["cierre_sesion", "sesion_inactiva"].includes(evento.accion)) {
        actual.ultimaDesconexion = fecha;
      }

      porUsuario.set(uid, actual);
    });

  const ahora = Date.now();
  return usuariosAdmin.map((usuario) => {
    const sesion = porUsuario.get(usuario.id) || {};
    const ultimoEventoMs = sesion.ultimoEvento?.getTime() || 0;
    const accionCierre = ["cierre_sesion", "sesion_inactiva"].includes(sesion.ultimaAccion || "");
    const enLinea = Boolean(ultimoEventoMs && !accionCierre && ahora - ultimoEventoMs <= VENTANA_USUARIO_EN_LINEA_MS);

    return {
      usuario,
      enLinea,
      ultimoEvento: sesion.ultimoEvento || null,
      ultimoInicio: sesion.ultimoInicio || null,
      ultimaDesconexion: sesion.ultimaDesconexion || null,
      ultimaAccion: sesion.ultimaAccion || "sin_eventos"
    };
  }).sort((a, b) => {
    if (a.enLinea !== b.enLinea) return a.enLinea ? -1 : 1;
    return (b.ultimoEvento?.getTime() || 0) - (a.ultimoEvento?.getTime() || 0);
  });
}

function renderizarSesionesAuditoria() {
  const contenedor = document.getElementById("listaSesionesAuditoria");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroSesionesAuditoria")?.value || "");
  const sesiones = resumenSesionesUsuariosAdmin().filter(({ usuario }) => {
    if (!texto) return true;
    return normalizar([
      usuario.nombre,
      usuario.email,
      usuario.id,
      usuario.rol,
      usuario.unidad,
      usuario.institucion
    ].join(" ")).includes(texto);
  });

  if (!sesiones.length) {
    contenedor.innerHTML = "<p>No hay usuarios con esa busqueda.</p>";
    return;
  }

  const enLinea = sesiones.filter((sesion) => sesion.enLinea);
  const desconectados = sesiones.filter((sesion) => !sesion.enLinea);

  const renderGrupo = (titulo, items) => `
    <div class="sesion-auditoria-grupo">
      <h4>${escaparHTML(titulo)} <span>${items.length}</span></h4>
      ${items.length ? items.map(({ usuario, enLinea, ultimoEvento, ultimoInicio, ultimaDesconexion, ultimaAccion }) => `
        <article class="sesion-usuario-card ${enLinea ? "en-linea" : "desconectado"}">
          <div>
            <strong>${escaparHTML(usuario.nombre || usuario.email || "Usuario sin nombre")}</strong>
            <small>${escaparHTML(usuario.email || usuario.id)} Â· ${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</small>
          </div>
          <div class="sesion-usuario-meta">
            <span class="${enLinea ? "ok" : "admin-muted"}">${enLinea ? "En linea" : "Desconectado"}</span>
            <span>Ultima actividad: ${escaparHTML(textoFechaCortaAdmin(ultimoEvento))}</span>
            <span>Ultimo inicio: ${escaparHTML(textoFechaCortaAdmin(ultimoInicio))}</span>
            <span>Desconexion/inactividad: ${escaparHTML(textoFechaCortaAdmin(ultimaDesconexion))}</span>
            <span>Ultima accion: ${escaparHTML(ultimaAccion)}</span>
          </div>
        </article>
      `).join("") : "<p class=\"admin-muted\">Sin usuarios en este grupo.</p>"}
    </div>
  `;

  contenedor.innerHTML = renderGrupo("En linea ahora", enLinea) + renderGrupo("Desconectados", desconectados);
}

function poblarUsuariosAvisosAdmin() {
  const selector = document.getElementById("avisoAdminUsuario");
  if (!selector) return;
  const usuarios = [...usuariosAdmin].sort((a, b) => (a.nombre || a.email || "").localeCompare(b.nombre || b.email || ""));
  selector.innerHTML = `<option value="">Seleccionar usuario...</option>` + usuarios.map((usuario) => `
    <option value="${escaparHTML(usuario.id)}">${escaparHTML(usuario.nombre || usuario.email || usuario.id)} Â· ${escaparHTML(usuario.rol || "sin rol")}</option>
  `).join("");
}
function datosAdminParaMensajes() {
  return {
    uid: adminActual?.uid || ADMIN_UID,
    nombre: adminActual?.displayName || adminActual?.email || "Administrador",
    email: adminActual?.email || "",
    rol: "admin"
  };
}

function otroParticipanteAdmin(conversacion = {}) {
  const participantes = conversacion.participantes || {};
  const adminUid = adminActual?.uid || ADMIN_UID;
  const otroUid = (conversacion.participantIds || Object.keys(participantes)).find((uid) => uid !== adminUid);
  return participantes[otroUid] || usuariosAdmin.find((usuario) => usuario.id === otroUid) || { uid: otroUid, nombre: "Usuario" };
}

function conversacionNoLeidaAdmin(conversacion = {}) {
  const adminUid = adminActual?.uid || ADMIN_UID;
  if (!adminUid || conversacion.ultimoMensajePor === adminUid) return false;
  const leidoEn = conversacion.lecturasUsuarios?.[adminUid]?.leidoEn || "";
  return !leidoEn || String(leidoEn) < String(conversacion.ultimoMensajeEn || "");
}

async function cargarMensajesAdmin() {
  const lista = document.getElementById("listaConversacionesAdmin");
  if (lista && !conversacionesAdmin.length) lista.innerHTML = "<p>Cargando conversaciones...</p>";
  if (!adminActual?.uid) return;

  try {
    conversacionesAdmin = await listarConversacionesMensajes(adminActual.uid);
    renderizarConversacionesAdmin();
  } catch (error) {
    console.error("No se pudieron cargar conversaciones de admin:", error);
    if (conversacionesAdmin.length) {
      renderizarConversacionesAdmin();
      return;
    }
    if (lista) {
      lista.innerHTML = `
        <p class="admin-muted">
          No se pudo cargar la lista completa por permisos. Usa "Nuevo mensaje" para abrir un chat directo.
        </p>
      `;
    }
  }
}

function renderizarConversacionesAdmin() {
  const lista = document.getElementById("listaConversacionesAdmin");
  if (!lista) return;

  const texto = normalizar(document.getElementById("filtroMensajesAdmin")?.value || "");
  const conversaciones = conversacionesAdmin.filter((conversacion) => {
    const otro = otroParticipanteAdmin(conversacion);
    if (!texto) return true;
    return normalizar([
      otro.nombre,
      otro.email,
      otro.rol,
      conversacion.ultimoMensaje,
      conversacion.id
    ].join(" ")).includes(texto);
  });

  if (!conversaciones.length) {
    lista.innerHTML = "<p>No hay conversaciones con esos filtros.</p>";
    return;
  }

  lista.innerHTML = conversaciones.map((conversacion) => {
    const otro = otroParticipanteAdmin(conversacion);
    const noLeida = conversacionNoLeidaAdmin(conversacion);
    return `
      <button type="button" class="mensaje-admin-conversacion ${noLeida ? "nuevo" : ""}" data-conversacion-admin="${escaparHTML(conversacion.id)}">
        <span>
          <strong>${escaparHTML(otro.nombre || otro.email || "Usuario")}</strong>
          <small>${escaparHTML(otro.email || otro.uid || otro.id || "")} - ${escaparHTML(etiquetaRolUsuario(otro.rol || "sin_rol"))}</small>
        </span>
        <span>${escaparHTML(conversacion.ultimoMensaje || "Conversacion iniciada")}</span>
        <small>${noLeida ? "Nuevo - " : ""}${escaparHTML(conversacion.ultimoMensajeEn || "")}</small>
      </button>
    `;
  }).join("");

  lista.querySelectorAll("[data-conversacion-admin]").forEach((boton) => {
    boton.addEventListener("click", () => abrirConversacionAdmin(boton.dataset.conversacionAdmin));
  });
}

function renderizarNuevoMensajeAdmin() {
  const detalle = document.getElementById("detalleConversacionAdmin");
  if (!detalle) return;
  const usuarios = [...usuariosAdmin]
    .filter((usuario) => usuario.id !== adminActual?.uid)
    .sort((a, b) => String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""), "es", { sensitivity: "base" }));

  detalle.innerHTML = `
    <div class="mensaje-admin-header">
      <div>
        <h3>Nuevo mensaje</h3>
        <p>Selecciona un usuario y escribe un mensaje directo.</p>
      </div>
    </div>
    <div class="mensaje-admin-nuevo">
      <input id="buscarNuevoMensajeAdmin" placeholder="Buscar usuario por nombre, correo o rol">
      <div id="resultadosNuevoMensajeAdmin"></div>
    </div>
  `;

  const input = document.getElementById("buscarNuevoMensajeAdmin");
  const resultados = document.getElementById("resultadosNuevoMensajeAdmin");
  const pintar = () => {
    const texto = normalizar(input?.value || "");
    const visibles = usuarios
      .filter((usuario) => !texto || normalizar(`${usuario.nombre || ""} ${usuario.email || ""} ${usuario.rol || ""}`).includes(texto))
      .slice(0, 30);
    resultados.innerHTML = visibles.length ? visibles.map((usuario) => `
      <article class="mensaje-admin-contacto">
        <div>
          <strong>${escaparHTML(usuario.nombre || usuario.email || usuario.id)}</strong>
          <small>${escaparHTML(usuario.email || "")} - ${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</small>
        </div>
        <button type="button" data-nuevo-mensaje-usuario="${escaparHTML(usuario.id)}">Abrir chat</button>
      </article>
    `).join("") : "<p class=\"admin-muted\">No se encontraron usuarios.</p>";

    resultados.querySelectorAll("[data-nuevo-mensaje-usuario]").forEach((boton) => {
      boton.addEventListener("click", () => iniciarMensajeAdminConUsuario(boton.dataset.nuevoMensajeUsuario));
    });
  };

  input?.addEventListener("input", pintar);
  pintar();
}

async function iniciarMensajeAdminConUsuario(uidUsuario = "") {
  const usuario = usuariosAdmin.find((item) => item.id === uidUsuario);
  if (!usuario || !adminActual?.uid) return;

  const contacto = {
    id: usuario.id,
    uid: usuario.id,
    nombre: usuario.nombre || usuario.email || usuario.id,
    email: usuario.email || "",
    rol: usuario.rol || ""
  };

  const detalle = document.getElementById("detalleConversacionAdmin");
  if (detalle) {
    detalle.innerHTML = `
      <div class="mensaje-admin-header">
        <div>
          <h3>Abriendo chat...</h3>
          <p>Preparando conversaciÃ³n con ${escaparHTML(contacto.nombre || contacto.email || contacto.id)}.</p>
        </div>
      </div>
    `;
  }

  try {
    await agregarContactoMensaje(adminActual.uid, contacto).catch((error) => {
      console.warn("No se pudo guardar contacto de admin:", error);
    });
    const conversacion = await obtenerOCrearConversacion(datosAdminParaMensajes(), contacto);
    conversacionesAdmin = [conversacion, ...conversacionesAdmin.filter((item) => item.id !== conversacion.id)];

    // Abrir el hilo directamente. La consulta global de conversaciones puede estar
    // limitada por reglas y no debe impedir iniciar un mensaje nuevo.
    await abrirConversacionAdmin(conversacion.id);
    cargarMensajesAdmin().catch((error) => {
      console.warn("No se pudo refrescar lista lateral de conversaciones:", error);
    });
  } catch (error) {
    console.error("No se pudo iniciar chat con usuario:", error);
    if (detalle) {
      detalle.innerHTML = `
        <div class="mensaje-admin-header">
          <div>
            <h3>No se pudo abrir el chat</h3>
            <p>${escaparHTML(error.message || "Firestore bloqueo la creaciÃ³n de la conversaciÃ³n.")}</p>
          </div>
        </div>
      `;
    }
  }
}

async function abrirConversacionAdmin(conversacionId = "") {
  const detalle = document.getElementById("detalleConversacionAdmin");
  if (!detalle || !conversacionId || !adminActual?.uid) return;

  conversacionAdminActiva = conversacionesAdmin.find((item) => item.id === conversacionId)
    || { id: conversacionId, participantes: {}, participantIds: [] };
  const otro = otroParticipanteAdmin(conversacionAdminActiva);

  try {
    await marcarMensajesConversacionVistos(conversacionId, adminActual.uid, datosAdminParaMensajes()).catch((error) => {
      console.warn("No se pudieron marcar mensajes vistos por admin:", error);
    });
    mensajesAdminActivos = await listarMensajesConversacion(conversacionId);
    await updateDoc(doc(db, "mensajesConversaciones", conversacionId), {
      [`lecturasUsuarios.${adminActual.uid}`]: {
        leidoEn: new Date().toISOString(),
        uid: adminActual.uid,
        nombre: adminActual.email || "Administrador"
      }
    }).catch((error) => console.warn("No se pudo actualizar lectura de conversacion admin:", error));
  } catch (error) {
    detalle.innerHTML = `<p class="admin-muted">No se pudo abrir la conversacion: ${escaparHTML(error.message)}</p>`;
    return;
  }

  detalle.innerHTML = `
    <div class="mensaje-admin-header">
      <div>
        <h3>${escaparHTML(otro.nombre || otro.email || "Usuario")}</h3>
        <p>${escaparHTML(otro.email || otro.uid || otro.id || "")} - ${escaparHTML(etiquetaRolUsuario(otro.rol || "sin_rol"))}</p>
      </div>
      <div class="acciones-reporte-admin">
        <button type="button" id="btnRecargarConversacionAdmin">Recargar</button>
        <button type="button" id="btnArchivarConversacionAdmin">Archivar</button>
        <button type="button" id="btnEliminarConversacionAdmin" class="boton-peligro">Eliminar</button>
      </div>
    </div>
    <div id="hiloMensajesAdmin" class="hilo-mensajes-admin">
      ${mensajesAdminActivos.length ? mensajesAdminActivos.map((mensaje) => renderMensajeAdmin(mensaje, otro.uid || otro.id)).join("") : "<p class=\"admin-muted\">Sin mensajes todavia.</p>"}
    </div>
    <form id="formMensajeAdmin" class="form-mensaje-admin">
      <textarea id="textoMensajeAdmin" placeholder="Responder al usuario..." rows="3"></textarea>
      <button type="submit">Enviar respuesta</button>
    </form>
  `;

  document.getElementById("btnRecargarConversacionAdmin")?.addEventListener("click", () => abrirConversacionAdmin(conversacionId));
  document.getElementById("btnArchivarConversacionAdmin")?.addEventListener("click", async () => {
    await archivarConversacionMensaje(conversacionId, adminActual.uid);
    conversacionesAdmin = conversacionesAdmin.filter((item) => item.id !== conversacionId);
    conversacionAdminActiva = null;
    mensajesAdminActivos = [];
    renderizarConversacionesAdmin();
    detalle.innerHTML = `<p class="admin-muted">Conversacion archivada.</p>`;
  });
  document.getElementById("btnEliminarConversacionAdmin")?.addEventListener("click", async () => {
    if (!confirm("Eliminar esta conversacion de tu bandeja de administrador?")) return;
    await eliminarConversacionMensaje(conversacionId, adminActual.uid);
    conversacionesAdmin = conversacionesAdmin.filter((item) => item.id !== conversacionId);
    conversacionAdminActiva = null;
    mensajesAdminActivos = [];
    renderizarConversacionesAdmin();
    detalle.innerHTML = `<p class="admin-muted">Conversacion eliminada de tu bandeja.</p>`;
  });
  document.getElementById("formMensajeAdmin")?.addEventListener("submit", enviarMensajeAdmin);
  const hilo = document.getElementById("hiloMensajesAdmin");
  if (hilo) hilo.scrollTop = hilo.scrollHeight;
  await cargarMensajesAdmin();
}

function renderMensajeAdmin(mensaje = {}, otroUid = "") {
  const propio = mensaje.autorUid === adminActual?.uid;
  const vistoPorOtro = propio && otroUid && mensaje.vistosPor?.[otroUid];
  return `
    <div class="mensaje-admin-burbuja ${propio ? "propio" : ""}">
      <p>${escaparHTML(mensaje.texto || "")}</p>
      <small>${escaparHTML(mensaje.autorNombre || "")} - ${escaparHTML(mensaje.fechaISO || "")}${vistoPorOtro ? " - Visto" : ""}</small>
    </div>
  `;
}

async function enviarMensajeAdmin(evento) {
  evento.preventDefault();
  const campo = document.getElementById("textoMensajeAdmin");
  const texto = campo?.value.trim() || "";
  if (!texto || !conversacionAdminActiva?.id) return;

  const boton = evento.currentTarget.querySelector("button[type='submit']");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Enviando...";
  }

  try {
    await enviarMensajeConversacion(conversacionAdminActiva.id, datosAdminParaMensajes(), texto);
    if (campo) campo.value = "";
    await abrirConversacionAdmin(conversacionAdminActiva.id);
  } catch (error) {
    alert("No se pudo enviar el mensaje: " + error.message);
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Enviar respuesta";
    }
  }
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


function institucionUsuarioFormato(usuario = {}) {
  return usuario.institucion ||
    usuario.unidad ||
    usuario.institucionPaciente ||
    usuario.servicioInstitucional ||
    "Sin institucion";
}

function poblarInstitucionesFormatosAdmin() {
  const selector = document.getElementById("filtroFormatosInstitucionAdmin");
  if (!selector) return;
  const valorActual = selector.value || "";
  const instituciones = [...new Set(usuariosAdmin.map(institucionUsuarioFormato).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  selector.innerHTML = `<option value="">Todas las instituciones</option>` + instituciones.map((institucion) => `
    <option value="${escaparHTML(institucion)}">${escaparHTML(institucion)}</option>
  `).join("");
  selector.value = instituciones.includes(valorActual) ? valorActual : "";
}

function usuariosFiltradosFormatosAdmin() {
  const texto = normalizar(document.getElementById("filtroFormatosAdmin")?.value || "");
  const institucion = document.getElementById("filtroFormatosInstitucionAdmin")?.value || "";
  return usuariosAdmin.filter((usuario) => {
    const institucionUsuario = institucionUsuarioFormato(usuario);
    const coincideInstitucion = !institucion || institucionUsuario === institucion;
    const coincideTexto = !texto || normalizar([
      usuario.nombre,
      usuario.email,
      usuario.rol,
      usuario.id,
      institucionUsuario
    ].join(" ")).includes(texto);
    return coincideInstitucion && coincideTexto;
  });
}

function renderizarFormatosAdmin() {
  const contenedor = document.getElementById("listaFormatosAdmin");
  if (!contenedor) return;

  const formatosControlables = FORMATOS_INSTITUCIONALES.filter((formato) => formato.requiereAutorizacion);
  const usuarios = usuariosFiltradosFormatosAdmin();

  if (!usuarios.length) {
    contenedor.innerHTML = "<p>No hay usuarios con esos filtros.</p>";
    return;
  }

  contenedor.innerHTML = usuarios.map((usuario) => {
    const permisos = permisosFormatosDesdeUsuario(usuario);
    const institucionTexto = institucionUsuarioFormato(usuario);
    const controles = formatosControlables.map((formato) => {
      const autorizado = usuario.rol === "admin" || permisos[formato.id] === true || permisos.todos === true;
      const protegido = usuario.rol === "admin";
      return `
        <div class="usuario-admin-meta formato-admin-control">
          <span>${escaparHTML(formato.nombre)}</span>
          <span>${autorizado ? "Autorizado" : "Sin acceso"}</span>
          <button type="button" data-toggle-formato-admin="${escaparHTML(usuario.id)}" data-formato="${escaparHTML(formato.id)}" data-valor="${autorizado ? "false" : "true"}" ${protegido ? "disabled" : ""}>
            ${autorizado ? "Retirar acceso" : "Autorizar"}
          </button>
        </div>
      `;
    }).join("");

    return `
      <article class="usuario-admin-card">
        <div>
          <h3>${escaparHTML(usuario.nombre || usuario.email || "Usuario sin nombre")}</h3>
          <p>${escaparHTML(usuario.email || "Sin correo")}</p>
          <small>UID: ${escaparHTML(usuario.id)}</small>
          <div class="usuario-admin-meta">
            <span>${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</span>
            <span>Institucion: ${escaparHTML(institucionTexto)}</span>
          </div>
        </div>
        <div class="paciente-admin-acciones">
          ${controles}
        </div>
      </article>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-toggle-formato-admin]").forEach((boton) => {
    boton.addEventListener("click", alternarFormatoUsuarioAdmin);
  });
}

async function alternarFormatoUsuarioAdmin(evento) {
  const boton = evento.currentTarget;
  const uid = boton.dataset.toggleFormatoAdmin || "";
  const formato = boton.dataset.formato || "";
  const valor = boton.dataset.valor === "true";
  const usuario = usuariosAdmin.find((item) => item.id === uid);

  if (!uid || !formato || !usuario) return;

  boton.disabled = true;
  await updateDoc(doc(db, "usuarios", uid), {
    [`permisosFormatos.${formato}`]: valor,
    formatosInstitucionalesActualizadosEn: new Date().toISOString(),
    formatosInstitucionalesActualizadoPor: adminActual?.uid || ""
  });

  await registrarAuditoriaAdmin(
    valor ? "autorizar_formato_institucional" : "retirar_formato_institucional",
    `${valor ? "Autorizo" : "Retiro"} formato ${formato} a ${usuario.email || usuario.nombre || uid}`,
    { usuarioObjetivoUid: uid }
  );
  await cargarUsuariosAdmin();
}

async function aplicarFormatoUsuariosVisiblesAdmin(formato, valor) {
  const usuarios = usuariosFiltradosFormatosAdmin().filter((usuario) => usuario.rol !== "admin");
  if (!usuarios.length) {
    alert("No hay usuarios visibles para actualizar.");
    return;
  }

  const accion = valor ? "autorizar" : "retirar";
  const confirmar = confirm(`Â¿Deseas ${accion} el formato ${formato} a ${usuarios.length} usuario(s) visibles?`);
  if (!confirmar) return;

  await Promise.all(usuarios.map((usuario) => updateDoc(doc(db, "usuarios", usuario.id), {
    [`permisosFormatos.${formato}`]: valor,
    formatosInstitucionalesActualizadosEn: new Date().toISOString(),
    formatosInstitucionalesActualizadoPor: adminActual?.uid || ""
  })));

  await registrarAuditoriaAdmin(
    valor ? "autorizar_formato_institucional_masivo" : "retirar_formato_institucional_masivo",
    `${valor ? "Autorizo" : "Retiro"} formato ${formato} a ${usuarios.length} usuario(s) visibles`,
    { totalUsuarios: usuarios.length }
  );
  await cargarUsuariosAdmin();
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
    const reportes = await listarReportesUsuarios();
    reportesUsuariosAdmin = reportes.map((reporte) => ({
      ...reporte,
      usuarioRegistrado: buscarUsuarioDeReporte(reporte)
    }));
    renderizarReportesUsuariosAdmin();
  } catch (error) {
    if (contenedor) {
      contenedor.innerHTML = `<p class="admin-muted">No se pudieron cargar los reportes: ${escaparHTML(error.message)}</p>`;
    }
  }
}

function buscarUsuarioDeReporte(reporte = {}) {
  if (reporte.usuarioUid) {
    const porUid = usuariosAdmin.find((usuario) => usuario.id === reporte.usuarioUid);
    if (porUid) return porUid;
  }

  const emailReporte = String(reporte.usuarioEmail || "").toLowerCase().trim();
  if (emailReporte) {
    const porEmail = usuariosAdmin.find((usuario) => String(usuario.email || "").toLowerCase().trim() === emailReporte);
    if (porEmail) return porEmail;
  }

  return null;
}

function datosUsuarioReporteHTML(reporte = {}) {
  const usuario = reporte.usuarioRegistrado || {};
  const nombre = usuario.nombre || reporte.usuarioNombre || "Usuario no identificado";
  const email = usuario.email || reporte.usuarioEmail || "Sin correo";
  const rol = usuario.rol || "sin rol";
  const unidad = usuario.unidad || usuario.institucion || usuario.institucionPaciente || "Sin unidad";
  const telefono = usuario.telefono || usuario.celular || "Sin telefono";
  const fechaRegistro = reporte.usuarioRegistrado
    ? textoFechaUsuarioRegistro(reporte.usuarioRegistrado)
    : "No disponible";

  return `
    <div class="reporte-usuario-detalle">
      <div>
        <strong>${escaparHTML(nombre)}</strong>
        <span>${escaparHTML(email)}</span>
      </div>
      <div class="reporte-usuario-grid">
        <span>Rol: ${escaparHTML(etiquetaRolUsuario(rol))}</span>
        <span>UID: ${escaparHTML(reporte.usuarioUid || usuario.id || "Sin UID")}</span>
        <span>Unidad: ${escaparHTML(unidad)}</span>
        <span>Telefono: ${escaparHTML(telefono)}</span>
        <span>Se unio: ${escaparHTML(fechaRegistro)}</span>
      </div>
    </div>
  `;
}

function cargarAlturasRespuestasReporte() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALTURAS_RESPUESTAS_REPORTE);
    const datos = guardado ? JSON.parse(guardado) : {};
    return datos && typeof datos === "object" ? datos : {};
  } catch (error) {
    console.warn("No se pudieron cargar las alturas de respuestas de reportes", error);
    return {};
  }
}

function guardarEstadoRespuestaReporte(reporteId, cambios = {}) {
  const alturas = cargarAlturasRespuestasReporte();
  alturas[reporteId] = {
    ...(typeof alturas[reporteId] === "object" ? alturas[reporteId] : { altura: alturas[reporteId] }),
    ...cambios
  };
  localStorage.setItem(CLAVE_ALTURAS_RESPUESTAS_REPORTE, JSON.stringify(alturas));
}

function alturaRespuestaReporteGuardada(reporteId) {
  const estado = cargarAlturasRespuestasReporte()[reporteId];
  if (typeof estado === "number") return estado;
  if (estado && typeof estado === "object") return estado.altura;
  return null;
}

function respuestaReporteContraida(reporteId) {
  const estado = cargarAlturasRespuestasReporte()[reporteId];
  return Boolean(estado && typeof estado === "object" && estado.contraida);
}

function aplicarAlturaRespuestaReporte(reporteId, altura, contraida = false) {
  const campo = document.getElementById(`respuesta-reporte-${reporteId}`);
  if (!campo) return;
  const alto = Math.max(58, Math.round(Number(altura) || 112));
  campo.style.height = `${alto}px`;
  campo.closest(".respuesta-reporte-form")?.classList.toggle("respuesta-contraida", contraida);
  guardarEstadoRespuestaReporte(reporteId, { altura: alto, contraida });
}

function configurarControlesRespuestaReporte() {
  document.querySelectorAll("[data-respuesta-reporte-accion]").forEach((boton) => {
    if (boton.dataset.respuestaBound === "1") return;
    boton.dataset.respuestaBound = "1";
    boton.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      const reporteId = boton.dataset.reporteId;
      const campo = document.getElementById(`respuesta-reporte-${reporteId}`);
      if (!campo) return;
      const actual = campo.getBoundingClientRect().height;
      const accion = boton.dataset.respuestaReporteAccion;

      if (accion === "menos") aplicarAlturaRespuestaReporte(reporteId, actual - 54, false);
      if (accion === "mas") aplicarAlturaRespuestaReporte(reporteId, actual + 54, false);
      if (accion === "reiniciar") aplicarAlturaRespuestaReporte(reporteId, 112, false);
      if (accion === "menos" || accion === "mas" || accion === "reiniciar") {
        const botonContraer = boton.parentElement?.querySelector("[data-respuesta-reporte-accion=\"contraer\"]");
        if (botonContraer) botonContraer.textContent = "Contraer";
      }
      if (accion === "contraer") {
        const contraer = !campo.closest(".respuesta-reporte-form")?.classList.contains("respuesta-contraida");
        aplicarAlturaRespuestaReporte(reporteId, contraer ? 58 : (alturaRespuestaReporteGuardada(reporteId) || 112), contraer);
        boton.textContent = contraer ? "Expandir" : "Contraer";
      }
    });
  });

  document.querySelectorAll(".respuesta-reporte-form textarea").forEach((campo) => {
    if (campo.dataset.alturaBound === "1") return;
    campo.dataset.alturaBound = "1";
    campo.addEventListener("blur", () => {
      const reporteId = campo.id.replace("respuesta-reporte-", "");
      guardarEstadoRespuestaReporte(reporteId, {
        altura: campo.getBoundingClientRect().height,
        contraida: false
      });
    });
  });
}

function renderizarReportesUsuariosAdmin() {
  const contenedor = document.getElementById("listaReportesAdmin");
  if (!contenedor) return;

  const texto = normalizar(document.getElementById("filtroReportesAdmin")?.value || "");
  const estado = document.getElementById("filtroReportesEstado")?.value || "";
  const tipo = document.getElementById("filtroReportesTipo")?.value || "";
  const filtroArchivo = document.getElementById("filtroReportesArchivo")?.value || "activos";

  const reportes = reportesUsuariosAdmin.filter((reporte) => {
    const coincideTexto = !texto || normalizar([
      reporte.titulo,
      reporte.mensaje,
      reporte.usuarioEmail,
      reporte.usuarioNombre,
      reporte.usuarioUid,
      reporte.usuarioRegistrado?.nombre,
      reporte.usuarioRegistrado?.email,
      reporte.usuarioRegistrado?.rol,
      reporte.usuarioRegistrado?.unidad,
      reporte.usuarioRegistrado?.institucion,
      reporte.pagina,
      reporte.url
    ].join(" ")).includes(texto);

    const coincideEstado = !estado || (reporte.estado || "nuevo") === estado;
    const coincideTipo = !tipo || reporte.tipo === tipo;
    const archivado = Boolean(reporte.archivado);
    const coincideArchivo = filtroArchivo === "todos"
      || (filtroArchivo === "archivados" ? archivado : !archivado);
    return coincideTexto && coincideEstado && coincideTipo && coincideArchivo;
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
    const archivado = Boolean(reporte.archivado);

    return `
      <article class="reporte-admin-card ${archivado ? "reporte-archivado" : ""}">
        <div class="reporte-admin-top">
          <span class="reporte-admin-tipo">${escaparHTML(etiquetaTipoReporte(reporte.tipo))}</span>
          <span class="reporte-admin-estado estado-${escaparHTML(estadoReporte)}">${escaparHTML(estadoReporte)}</span>
          ${archivado ? `<span class="reporte-admin-estado estado-archivado">archivado</span>` : ""}
        </div>
        <h3>${escaparHTML(reporte.titulo || "Sin titulo")}</h3>
        <p>${escaparHTML(reporte.mensaje || "Sin descripcion")}</p>
        <div class="reporte-admin-meta">
          <span>${escaparHTML(fecha)}</span>
          <span>${escaparHTML(usuario)}</span>
          <span>${escaparHTML(reporte.pagina || "Sin pagina")}</span>
        </div>
        ${datosUsuarioReporteHTML(reporte)}
        ${reporte.respuestaAdminUltima?.mensaje ? `
          <div class="respuesta-reporte-admin">
            <strong>Ultima respuesta enviada</strong>
            <p>${escaparHTML(reporte.respuestaAdminUltima.mensaje)}</p>
            <span>${escaparHTML(reporte.respuestaAdminUltima.fechaISO || "")}</span>
          </div>
        ` : ""}
        <div class="respuesta-reporte-form ${respuestaReporteContraida(reporte.id) ? "respuesta-contraida" : ""}">
          <div class="respuesta-reporte-barra">
            <label for="respuesta-reporte-${escaparHTML(reporte.id)}">Responder al usuario</label>
            <div class="respuesta-reporte-controles" aria-label="Ajustar campo de respuesta">
              <button type="button" data-reporte-id="${escaparHTML(reporte.id)}" data-respuesta-reporte-accion="menos">-</button>
              <button type="button" data-reporte-id="${escaparHTML(reporte.id)}" data-respuesta-reporte-accion="mas">+</button>
              <button type="button" data-reporte-id="${escaparHTML(reporte.id)}" data-respuesta-reporte-accion="contraer">${respuestaReporteContraida(reporte.id) ? "Expandir" : "Contraer"}</button>
              <button type="button" data-reporte-id="${escaparHTML(reporte.id)}" data-respuesta-reporte-accion="reiniciar">Reiniciar</button>
            </div>
          </div>
          <textarea id="respuesta-reporte-${escaparHTML(reporte.id)}" style="height:${respuestaReporteContraida(reporte.id) ? 58 : (alturaRespuestaReporteGuardada(reporte.id) || 112)}px" placeholder="${reporte.usuarioUid ? "Escribe una respuesta. Se enviara como notificacion personal en su Dashboard." : "Este reporte no tiene usuario vinculado; no se puede enviar notificacion personal."}" ${reporte.usuarioUid ? "" : "disabled"}></textarea>
          <div class="respuesta-reporte-ayuda">
            ${reporte.usuarioUid
              ? "Puedes enviarla como notificacion del Dashboard o como mensaje directo. En mensaje directo solo se enviara al usuario seleccionado en este reporte."
              : "Solo los reportes enviados con sesion iniciada pueden recibir respuesta directa."}
          </div>
        </div>
        <div class="reporte-admin-acciones">
          <select id="estado-reporte-${escaparHTML(reporte.id)}">
            ${ESTADOS_REPORTE_ADMIN.map((estado) => opcionEstadoReporte(estado, estadoReporte)).join("")}
          </select>
          <button type="button" onclick="cambiarEstadoReporteAdmin('${reporte.id}')">Actualizar estado</button>
          <button type="button" ${reporte.usuarioUid ? "" : "disabled"} onclick="responderReporteAdmin('${reporte.id}')">Enviar respuesta</button>
          <button type="button" ${reporte.usuarioUid ? "" : "disabled"} onclick="responderReportePorMensajeAdmin('${reporte.id}')">Responder por mensaje</button>
          <button type="button" onclick="archivarReporteAdmin('${reporte.id}', ${archivado ? "false" : "true"})">${archivado ? "Desarchivar" : "Archivar"}</button>
          <button type="button" class="boton-peligro" onclick="eliminarReporteAdmin('${reporte.id}')">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");
  configurarControlesRespuestaReporte();
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

window.archivarReporteAdmin = async function(reporteId, archivado = true) {
  const reporte = reportesUsuariosAdmin.find((item) => item.id === reporteId);
  const accion = archivado ? "archivar" : "desarchivar";

  if (!reporte) {
    alert("No se encontró el reporte seleccionado.");
    return;
  }

  try {
    await archivarReporteUsuario(reporteId, Boolean(archivado), {
      adminUid: adminActual?.uid || "",
      adminEmail: adminActual?.email || ""
    });
    await registrarAuditoriaAdmin(`${accion}_reporte_usuario`, `El administrador decidió ${accion} un reporte.`, {
      pacienteUid: reporte.usuarioUid || "",
      pacienteNombre: reporte.usuarioNombre || reporte.usuarioEmail || "",
      detalles: {
        reporteId,
        tipo: reporte.tipo || "",
        estado: reporte.estado || "nuevo"
      }
    }).catch((error) => console.warn("No se pudo registrar auditoría de archivo de reporte:", error));
    await cargarReportesUsuariosAdmin();
  } catch (error) {
    console.error(`No se pudo ${accion} el reporte:`, error);
    alert(`No se pudo ${accion} el reporte: ${error.message}`);
  }
};

window.eliminarReporteAdmin = async function(reporteId) {
  const reporte = reportesUsuariosAdmin.find((item) => item.id === reporteId);

  if (!reporte) {
    alert("No se encontró el reporte seleccionado.");
    return;
  }

  const confirmar = confirm(
    `¿Eliminar definitivamente este reporte?\n\n${reporte.titulo || etiquetaTipoReporte(reporte.tipo)}\n\nEsta acción no se puede deshacer.`
  );
  if (!confirmar) return;

  try {
    await eliminarReporteUsuario(reporteId);
    await registrarAuditoriaAdmin("eliminar_reporte_usuario", "El administrador eliminó definitivamente un reporte.", {
      pacienteUid: reporte.usuarioUid || "",
      pacienteNombre: reporte.usuarioNombre || reporte.usuarioEmail || "",
      detalles: {
        reporteId,
        tipo: reporte.tipo || "",
        estado: reporte.estado || "nuevo",
        titulo: reporte.titulo || ""
      }
    }).catch((error) => console.warn("No se pudo registrar auditoría de eliminación de reporte:", error));
    await cargarReportesUsuariosAdmin();
  } catch (error) {
    console.error("No se pudo eliminar el reporte:", error);
    alert("No se pudo eliminar el reporte: " + error.message);
  }
};

window.responderReporteAdmin = async function(reporteId) {
  const reporte = reportesUsuariosAdmin.find((item) => item.id === reporteId);
  const campo = document.getElementById(`respuesta-reporte-${reporteId}`);
  const selectorEstado = document.getElementById(`estado-reporte-${reporteId}`);
  const mensaje = campo?.value.trim() || "";

  if (!reporte) {
    alert("No se encontro el reporte seleccionado.");
    return;
  }

  if (!reporte.usuarioUid) {
    alert("Este reporte no tiene un usuario vinculado. No se puede enviar una notificacion personal.");
    return;
  }

  if (mensaje.length < 5) {
    alert("Escribe una respuesta un poco mas clara antes de enviarla.");
    campo?.focus();
    return;
  }

  const ahora = new Date().toISOString();
  const estadoSeleccionado = selectorEstado?.value || reporte.estado || "en_revision";
  const estadoFinal = estadoSeleccionado === "nuevo" ? "en_revision" : estadoSeleccionado;
  const idAviso = `respuesta_reporte_${reporteId}_${Date.now()}`;
  const tituloReporte = reporte.titulo || etiquetaTipoReporte(reporte.tipo);

  try {
    const resultadoReporte = await responderReporteUsuario(reporteId, {
      mensaje,
      estado: estadoFinal,
      idAviso,
      adminUid: adminActual?.uid || "",
      adminEmail: adminActual?.email || "",
      adminNombre: adminActual?.email || "Admin"
    });

    const resultadoAviso = await setDoc(doc(db, "avisosGlobales", idAviso), {
      idAviso,
      titulo: `Respuesta a tu reporte: ${tituloReporte}`,
      mensaje,
      destinatarioTipo: "usuario",
      destinatarioRol: "usuario",
      destinatarioUid: reporte.usuarioUid,
      destinatarioNombre: reporte.usuarioNombre || reporte.usuarioEmail || reporte.usuarioUid,
      destinatarioRolUsuario: "",
      activo: true,
      origen: "respuesta_reporte",
      reporteId,
      creadoPorUid: adminActual?.uid || "",
      creadoPorEmail: adminActual?.email || "",
      creadoEn: ahora,
      actualizadoEn: ahora
    }).then(() => ({ ok: true })).catch((error) => ({ ok: false, error }));

    await registrarAuditoriaAdmin("responder_reporte_usuario", "El administrador respondio un reporte de usuario.", {
      pacienteUid: reporte.usuarioUid,
      pacienteNombre: reporte.usuarioNombre || "",
      detalles: {
        reporteId,
        idAviso,
        estado: estadoFinal,
        tipo: reporte.tipo || "",
        avisoDashboard: resultadoAviso.ok,
        guardadoEnReporte: resultadoReporte.guardadoEnReporte,
        guardadoEnSubcoleccion: resultadoReporte.guardadoEnSubcoleccion,
        errorAviso: resultadoAviso.ok ? "" : resumenError(resultadoAviso.error)
      }
    }).catch((error) => console.warn("No se pudo registrar auditoria de respuesta a reporte:", error));

    alert(resultadoAviso.ok
      ? "Respuesta enviada. El usuario la vera en sus notificaciones."
      : "Respuesta guardada en el reporte. El aviso directo del Dashboard fue bloqueado por permisos, pero el usuario podra verla desde sus respuestas.");
    await cargarReportesUsuariosAdmin();
    if (resultadoAviso.ok) await cargarAvisosAdmin();
  } catch (error) {
    console.error("No se pudo responder el reporte:", error);
    alert("No se pudo enviar la respuesta: " + error.message);
  }
};

window.responderReportePorMensajeAdmin = async function(reporteId) {
  const reporte = reportesUsuariosAdmin.find((item) => item.id === reporteId);
  const campo = document.getElementById(`respuesta-reporte-${reporteId}`);
  const selectorEstado = document.getElementById(`estado-reporte-${reporteId}`);
  const mensaje = campo?.value.trim() || "";

  if (!reporte) {
    alert("No se encontro el reporte seleccionado.");
    return;
  }

  if (!reporte.usuarioUid) {
    alert("Este reporte no tiene un usuario vinculado. No se puede responder por mensaje.");
    return;
  }

  if (mensaje.length < 5) {
    alert("Escribe una respuesta antes de enviarla por mensaje.");
    campo?.focus();
    return;
  }

  const usuarioDestino = reporte.usuarioRegistrado || {
    id: reporte.usuarioUid,
    nombre: reporte.usuarioNombre || reporte.usuarioEmail || reporte.usuarioUid,
    email: reporte.usuarioEmail || "",
    rol: ""
  };

  if ((usuarioDestino.id || reporte.usuarioUid) !== reporte.usuarioUid) {
    alert("El contacto seleccionado no coincide con el usuario del reporte.");
    return;
  }

  const adminMensaje = {
    uid: adminActual?.uid || "",
    nombre: adminActual?.email || "Administrador",
    email: adminActual?.email || "",
    rol: "admin"
  };

  const contactoReporte = {
    id: reporte.usuarioUid,
    nombre: usuarioDestino.nombre || reporte.usuarioNombre || reporte.usuarioEmail || reporte.usuarioUid,
    email: usuarioDestino.email || reporte.usuarioEmail || "",
    rol: usuarioDestino.rol || ""
  };

  const textoMensaje = `Respuesta a tu reporte "${reporte.titulo || etiquetaTipoReporte(reporte.tipo)}":\n\n${mensaje}`;
  const estadoSeleccionado = selectorEstado?.value || reporte.estado || "en_revision";
  const estadoFinal = estadoSeleccionado === "nuevo" ? "en_revision" : estadoSeleccionado;

  try {
    const resultadoContactoAdmin = await agregarContactoMensaje(adminMensaje.uid, contactoReporte)
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error }));

    // Algunas reglas solo permiten a cada usuario editar su propia libreta de contactos.
    // La conversacion 1:1 se muestra por participantIds, asi que esta escritura reciproca
    // es conveniente pero no debe impedir que el admin responda el reporte.
    const resultadoContactoUsuario = await agregarContactoMensaje(contactoReporte.id, {
      id: adminMensaje.uid,
      nombre: adminMensaje.nombre,
      email: adminMensaje.email,
      rol: "admin"
    }).then(() => ({ ok: true })).catch((error) => ({ ok: false, error }));

    const resultadoConversacion = await obtenerOCrearConversacion(adminMensaje, contactoReporte)
      .then(async (conversacion) => {
        await enviarMensajeConversacion(conversacion.id, adminMensaje, textoMensaje);
        return { ok: true, conversacion };
      })
      .catch((error) => ({ ok: false, error }));

    const resultadoReporte = await responderReporteUsuario(reporteId, {
      mensaje,
      estado: estadoFinal,
      idAviso: resultadoConversacion.ok ? `mensaje:${resultadoConversacion.conversacion.id}` : "mensaje_bloqueado_por_permisos",
      adminUid: adminMensaje.uid,
      adminEmail: adminMensaje.email,
      adminNombre: adminMensaje.nombre
    });

    await registrarAuditoriaAdmin("responder_reporte_por_mensaje", "El administrador respondio un reporte por mensaje directo.", {
      pacienteUid: reporte.usuarioUid,
      pacienteNombre: contactoReporte.nombre || "",
      detalles: {
        reporteId,
        conversacionId: resultadoConversacion.ok ? resultadoConversacion.conversacion.id : "",
        destinatarioUid: contactoReporte.id,
        estado: estadoFinal,
        mensajeDirecto: resultadoConversacion.ok,
        contactoAdmin: resultadoContactoAdmin.ok,
        contactoUsuario: resultadoContactoUsuario.ok,
        guardadoEnReporte: resultadoReporte.guardadoEnReporte,
        guardadoEnSubcoleccion: resultadoReporte.guardadoEnSubcoleccion,
        errorMensaje: resultadoConversacion.ok ? "" : resumenError(resultadoConversacion.error)
      }
    }).catch((error) => console.warn("No se pudo registrar auditoria de respuesta por mensaje:", error));

    alert(resultadoConversacion.ok
      ? "Mensaje enviado al usuario seleccionado."
      : "La respuesta quedo guardada en el reporte, pero el mensaje directo fue bloqueado por permisos de Firestore.");
    await cargarReportesUsuariosAdmin();
  } catch (error) {
    console.error("No se pudo responder por mensaje:", error);
    alert("No se pudo enviar el mensaje: " + error.message);
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
  renderizarSesionesAuditoria();
  renderizarUsuariosOcultosAuditoria();
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
    const usuarioVisible = !evento.usuarioUid || !usuariosOcultosAuditoria.has(evento.usuarioUid);

    return usuarioVisible && coincideTexto && coincideRol && coincideModulo && coincideResultado;
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
