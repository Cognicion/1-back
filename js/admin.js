import { auth, db } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerStorage } from "./firebase.js";
import { obtenerFunctions } from "./firebase.js";
import { actualizarReconocimientoColaborador } from "./services/colaboradores.js";
import { TIPOS_COLABORADOR } from "./config/tiposColaborador.js";
import { registrarEventoAuditoria, resumenError } from "./services/auditoria.js";
import {
  FORMATOS_INSTITUCIONALES,
  FORMAT_PERMISSION_FRAY,
  FORMAT_PERMISSION_NAVARRO,
  permisosFormatosDesdeUsuario,
  usuarioEsActorProfesionalFormato,
  esAdministradorFormato,
  resolverPermisosEfectivosFormatos
} from "./services/formatosInstitucionales.js?v=20260719-actor-format-permissions";
import {
  obtenerNombrePacienteParaMostrar,
  textoBusquedaPaciente
} from "./utils/nombresPacientes.js";
import {
  ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL,
  ROL_ENFERMERIA_SALUD_MENTAL,
  etiquetaRolClinico,
  usuarioEsProfesionalTipoMedico
} from "./utils/roles.js";
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
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDownloadURL, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const ROLES_ADMIN_VALIDOS = new Set([
  "admin",
  "administrador",
  "superadmin",
  "adminprincipal",
  "administradorprincipal"
]);
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
let formatosManualesAdmin = [];
let paquetesFormatosAdmin = [];
let formatoVisualArrastreLogo = null;
const formatoVisualEstado = {
  logo: { x: 6, y: 4, ancho: 18, dataUrl: "" },
  secciones: []
};
let avisosGlobalesAdmin = [];
let notasPorPaciente = {};
let adminActual = null;
let adminDatosActual = null;
let conversacionesAdmin = [];
let conversacionAdminActiva = null;
let mensajesAdminActivos = [];
let patternModulePromise = null;
let patternModuleInstance = null;
let patternModuleRequestId = 0;
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

const COLECCIONES_VISTA_CORROBORACION = [
  "notasMedicas", "notasRapidas", "tratamientos", "estudios", "resultadosEscalas",
  "agenda", "archivos", "imagenes", "documentos", "permisosMedicos", "registrosDiarios"
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
console.log("[ADMIN] HTML cargado; esperando autenticación");

function actualizarEstadoArranque(mensaje, error = false) {
  const estado = document.getElementById("adminStartupState");
  if (estado) {
    estado.querySelector("span")?.replaceChildren(document.createTextNode(mensaje));
  }
  document.body.classList.toggle("admin-startup-error", error);
}

function eventoAuditoriaVisible(evento = {}) {
  return !ACCIONES_AUDITORIA_OCULTAS.has(evento.accion);
}

function normalizarRolAdmin(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function arregloTieneRolAdmin(valores) {
  if (!Array.isArray(valores)) return false;
  return valores.some((valor) => ROLES_ADMIN_VALIDOS.has(normalizarRolAdmin(valor)));
}

function objetoTieneRolAdmin(valores = {}) {
  if (!valores || typeof valores !== "object") return false;
  return Object.entries(valores).some(([clave, valor]) => {
    if (valor !== true) return false;
    return ROLES_ADMIN_VALIDOS.has(normalizarRolAdmin(clave));
  });
}

function datosUsuarioSonAdmin(datos = {}) {
  if (!datos || typeof datos !== "object") return false;

  const camposRol = [
    datos.rol,
    datos.role,
    datos.tipoRol,
    datos.tipoUsuario,
    datos.perfil,
    datos.cargoSistema,
    datos.claims?.role,
    datos.claims?.rol,
    datos.claims?.userRole
  ];

  if (camposRol.some((valor) => ROLES_ADMIN_VALIDOS.has(normalizarRolAdmin(valor)))) {
    return true;
  }

  return (
    datos.admin === true ||
    datos.esAdmin === true ||
    datos.isAdmin === true ||
    datos.permisos?.admin === true ||
    datos.claims?.admin === true ||
    objetoTieneRolAdmin(datos.roles) ||
    objetoTieneRolAdmin(datos.permisos) ||
    arregloTieneRolAdmin(datos.roles) ||
    arregloTieneRolAdmin(datos.permisosSistema) ||
    arregloTieneRolAdmin(datos.permisos)
  );
}

async function usuarioPuedeAccederAdmin(user) {
  if (!user) return { permitido: false, datos: null };
  if (user.uid === ADMIN_UID) return { permitido: true, datos: { rol: "admin", esAdminPrincipal: true } };

  try {
    const tokenResult = await user.getIdTokenResult().catch(() => ({ claims: {} }));
    const claims = tokenResult?.claims || {};
    const snapUsuario = await getDoc(doc(db, "usuarios", user.uid));
    if (!snapUsuario.exists()) return { permitido: false, datos: null };
    const datos = { ...snapUsuario.data(), claims };
    return {
      permitido: datosUsuarioSonAdmin(datos),
      datos
    };
  } catch (error) {
    console.error("No se pudo verificar el rol de administrador:", error);
    return { permitido: false, datos: null, error };
  }
}

onAuthStateChanged(auth, async (user) => {
  console.log("[ADMIN] Cambio de autenticación", { autenticado: Boolean(user) });
  try {
    if (!user) {
      actualizarEstadoArranque("Sesión no encontrada. Redirigiendo al inicio de sesión…", true);
      window.location.href = "login.html";
      return;
    }

    console.log("[ADMIN] Usuario autenticado", user.uid);
    actualizarEstadoArranque("Verificando rol de administrador…");
    const accesoAdmin = await usuarioPuedeAccederAdmin(user);
    if (!accesoAdmin.permitido) {
      console.warn("[ADMIN] Rol no autorizado", accesoAdmin.datos?.rol || "sin rol");
      actualizarEstadoArranque("Acceso restringido. Redirigiendo al Centro de Control…", true);
      alert("Acceso restringido al administrador.");
      window.location.href = "dashboard.html";
      return;
    }

    console.log("[ADMIN] Rol confirmado");
    adminActual = user;
    adminDatosActual = accesoAdmin.datos || { rol: "admin" };
    document.body.classList.remove("bloqueado", "admin-startup-error");
    document.getElementById("adminStartupState")?.setAttribute("hidden", "");
    console.log("[ADMIN] Iniciando render");
    renderizarAccesoMotorPatrones();
    await renderizarAccesoConocimientoSofia();
    configurarFiltros();
    await cargarResumen();
    await cargarCodigosMedicoAdmin();
    await cargarUsuariosAdmin();
    await cargarCatalogoManualFormatosAdmin();
    await cargarPacientesAdmin();
    await cargarReportesUsuariosAdmin();
    await cargarAvisosAdmin();
    await cargarMensajesAdmin();
    await cargarAuditoria();
    console.log("[ADMIN] Render principal completado");

  } catch (error) {
    console.error("[ADMIN] Error durante el arranque", error);
    document.body.classList.add("bloqueado");
    document.getElementById("adminStartupState")?.removeAttribute("hidden");
    actualizarEstadoArranque("No se pudo iniciar el Centro de Control. Revisa la consola para el detalle.", true);
  }
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
  document.getElementById("btnActualizarCatalogoManualAdmin")?.addEventListener("click", cargarCatalogoManualFormatosAdmin);
  document.getElementById("formCrearFormatoManualAdmin")?.addEventListener("submit", crearFormatoManualAdmin);
  document.getElementById("formCrearPaqueteFormatosAdmin")?.addEventListener("submit", crearPaqueteFormatosAdmin);
  configurarCreadorVisualFormatosAdmin();
  document.getElementById("btnAutorizarFrayVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin(FORMAT_PERMISSION_FRAY, true));
  document.getElementById("btnRetirarFrayVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin(FORMAT_PERMISSION_FRAY, false));
  document.getElementById("btnAutorizarNavarroVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin(FORMAT_PERMISSION_NAVARRO, true));
  document.getElementById("btnRetirarNavarroVisibles")?.addEventListener("click", () => aplicarFormatoUsuariosVisiblesAdmin(FORMAT_PERMISSION_NAVARRO, false));

  ["filtroFormatosAdmin", "filtroFormatosRolAdmin", "filtroFormatosInstitucionAdmin"].forEach((id) => {
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
  document.querySelectorAll("[data-cerrar-vista-corroboracion]").forEach((elemento) => {
    elemento.addEventListener("click", cerrarVistaCorroboracionAdmin);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cerrarVistaCorroboracionAdmin();
  });
}

function cerrarVistaCorroboracionAdmin() {
  const modal = document.getElementById("vistaCorroboracionAdmin");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("vista-corroboracion-abierta");
}

function mostrarVistaCorroboracionAdmin() {
  const modal = document.getElementById("vistaCorroboracionAdmin");
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("vista-corroboracion-abierta");
}

function valorCorroboracion(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sin registro";
  if (typeof valor?.toDate === "function") return formatearFechaAdmin(valor);
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function renderizarDocumentosCorroboracion(registros = []) {
  if (!registros.length) return "<p class=\"admin-muted\">Sin documentos en esta colección.</p>";
  return `<ul class="vista-corroboracion-lista">${registros.slice(0, 40).map((registro) => {
    const datos = registro.data || {};
    const resumen = datos.notaRapida || datos.titulo || datos.nombre || datos.archivoNombre || datos.descripcion || "Documento registrado";
    return `<li><strong>${escaparHTML(resumen)}</strong><small>ID: ${escaparHTML(registro.id)}</small></li>`;
  }).join("")}</ul>`;
}

function fechaNotaImportadaCorroboracion(nota = {}) {
  const fecha = nota.fechaNotaInput || nota.importacionDocx?.originalDocumentDate || "";
  const hora = nota.horaNotaInput || nota.importacionDocx?.originalDocumentTime || "";
  if (fecha && hora) return `${fecha} ${hora}`;
  if (fecha) return fecha;
  return "Fecha clínica sin registro";
}

async function cargarNotasImportadasCorroboracion(uidMedico) {
  const pacientesImportados = usuariosAdmin.filter((usuario) => (
    usuario.rol === "paciente"
    && usuario.ownerUid === uidMedico
    && usuario.origenTraspasoPacientesDocx === true
  ));

  try {
    const pacientes = await Promise.all(pacientesImportados.map(async (paciente) => {
      const snap = await getDocs(collection(db, "usuarios", paciente.id, "notasMedicas"));
      const notas = snap.docs
        .map((docNota) => ({ id: docNota.id, ...docNota.data() }))
        .filter((nota) => nota.importacionDocx?.importMethod === "docx-patient-transfer")
        .sort((a, b) => `${b.fechaNotaInput || ""} ${b.horaNotaInput || ""}`.localeCompare(`${a.fechaNotaInput || ""} ${a.horaNotaInput || ""}`));
      return {
        id: paciente.id,
        nombre: obtenerNombrePacienteParaMostrar(paciente) || "Paciente sin nombre",
        notas
      };
    }));
    return {
      pacientes,
      totalNotas: pacientes.reduce((total, paciente) => total + paciente.notas.length, 0)
    };
  } catch (error) {
    return { pacientes: [], totalNotas: 0, error: error?.code || "sin_acceso" };
  }
}

function renderizarNotasImportadasCorroboracion(importacion) {
  if (importacion?.error) {
    return `<p class="admin-muted">No disponible: ${escaparHTML(importacion.error)}</p>`;
  }
  if (!importacion?.pacientes?.length) {
    return "<p class=\"admin-muted\">No hay pacientes importados asociados a este profesional.</p>";
  }

  return `
    <p class="admin-muted">Las notas se conservan en el expediente de cada paciente, asociado a este profesional. Esta vista solo muestra identificación y fecha; no expone el contenido clínico.</p>
    <div class="vista-corroboracion-colecciones">
      ${importacion.pacientes.map((paciente) => `
        <article>
          <h4>${escaparHTML(paciente.nombre)} <span>${paciente.notas.length}</span></h4>
          ${paciente.notas.length ? `<ul class="vista-corroboracion-lista">${paciente.notas.map((nota) => `
            <li><strong>${escaparHTML(fechaNotaImportadaCorroboracion(nota))}</strong><small>${escaparHTML(nota.tipoNota || "Nota de evolución")} · ${escaparHTML(nota.importacionDocx?.sourceFileName || "Documento fuente preservado")}</small></li>
          `).join("")}</ul>` : "<p class=\"admin-muted\">Sin notas de esta importación.</p>"}
        </article>
      `).join("")}
    </div>
  `;
}

function obtenerResultadoVistaPrevia(resultados = [], nombreColeccion = "") {
  return resultados.find((resultado) => resultado.nombre === nombreColeccion) || {
    nombre: nombreColeccion,
    registros: [],
    error: "sin_datos"
  };
}

function contarRegistrosVistaPrevia(resultados = [], nombresColecciones = []) {
  return nombresColecciones.reduce((total, nombreColeccion) => {
    const resultado = obtenerResultadoVistaPrevia(resultados, nombreColeccion);
    return total + (Array.isArray(resultado.registros) ? resultado.registros.length : 0);
  }, 0);
}

function categoriaRolVistaPrevia(usuario = {}) {
  if (datosUsuarioSonAdmin(usuario)) return "admin";
  const rol = normalizarRolAdmin(usuario.rol || usuario.role || usuario.tipoRol || "");
  if (rol === "paciente") return "paciente";
  if (rol.includes("psicolog")) return "psicologia";
  if (usuarioEsProfesionalTipoMedico(usuario.rol || usuario.role || "")) return "profesional";
  return "usuario";
}

function resumenFormatosVistaPrevia(usuario = {}) {
  const catalogoInstitucional = FORMATOS_INSTITUCIONALES.flatMap((formato) => formato.valores || []);
  const permisosEfectivos = resolverPermisosEfectivosFormatos({
    usuario,
    catalogoFormatos: catalogoInstitucional
  });
  const formatosEfectivos = permisosEfectivos.formatosPermitidos === "*"
    ? catalogoInstitucional
    : permisosEfectivos.formatosPermitidos || [];
  const formatosManualesAsignados = Array.isArray(usuario.formatosManualesAsignados)
    ? usuario.formatosManualesAsignados
    : [];
  const paquetesAsignadosIds = new Set(Array.isArray(usuario.paquetesFormatosAsignados)
    ? usuario.paquetesFormatosAsignados
    : []);
  const paquetesAsignados = paquetesFormatosAdmin.filter((paquete) => (
    paquetesAsignadosIds.has(paquete.id) ||
    (Array.isArray(paquete.asignadoUserUids) && paquete.asignadoUserUids.includes(usuario.id))
  ));
  const items = new Map();

  FORMATOS_INSTITUCIONALES.forEach((formato) => {
    const tieneAcceso = permisosEfectivos.accesoGlobal ||
      (formato.valores || []).some((formatoId) => formatosEfectivos.includes(formatoId));
    if (tieneAcceso) {
      items.set(`institucional:${formato.id}`, {
        nombre: formato.nombre || formato.id,
        tipo: "Institucional"
      });
    }
  });

  formatosManualesAsignados.forEach((formatoId) => {
    const formatoManual = formatosManualesAdmin.find((formato) => formato.id === formatoId);
    const formatoInstitucional = FORMATOS_INSTITUCIONALES.find((formato) => (
      formato.id === formatoId || (formato.valores || []).includes(formatoId)
    ));
    const claveAsignacion = formatoInstitucional
      ? `institucional:${formatoInstitucional.id}`
      : `asignado:${formatoId}`;
    items.set(claveAsignacion, {
      nombre: formatoManual?.nombre || formatoInstitucional?.nombre || formatoId,
      tipo: formatoManual ? "Manual" : formatoInstitucional ? "Institucional" : "Asignado"
    });
  });

  paquetesAsignados.forEach((paquete) => {
    items.set(`paquete:${paquete.id}`, {
      nombre: paquete.nombre || paquete.id,
      tipo: "Paquete"
    });
  });

  return {
    accesoGlobal: permisosEfectivos.accesoGlobal === true,
    cuentaActiva: permisosEfectivos.cuentaActiva !== false,
    origen: permisosEfectivos.origen || "sin_acceso",
    items: [...items.values()],
    total: permisosEfectivos.accesoGlobal
      ? Math.max(catalogoFormatosParaPaquetesAdmin().length, items.size)
      : items.size
  };
}

function modulosVistaPreviaUsuario(usuario = {}, resultados = [], importacionDocx = null, formatos = {}) {
  const categoria = categoriaRolVistaPrevia(usuario);
  const totalAgenda = contarRegistrosVistaPrevia(resultados, ["agenda"]);
  const totalNotas = contarRegistrosVistaPrevia(resultados, ["notasMedicas", "notasRapidas"]) + (importacionDocx?.totalNotas || 0);
  const totalSeguimiento = contarRegistrosVistaPrevia(resultados, ["tratamientos", "registrosDiarios"]);
  const totalEscalas = contarRegistrosVistaPrevia(resultados, ["resultadosEscalas"]);
  const pacientesAsignados = usuariosAdmin.filter((item) => (
    normalizarRolAdmin(item.rol) === "paciente" && item.ownerUid === usuario.id
  )).length;
  const comunes = [
    { icono: "RC", nombre: "Rehabilitación cognitiva", descripcion: "Ejercicios de memoria, atención y control ejecutivo.", etiqueta: "Disponible" },
    { icono: "RESP", nombre: "Asistente de respiración", descripcion: "Guía visual de respiración y regulación fisiológica.", etiqueta: "Disponible" },
    { icono: "FORO", nombre: "Foro Cognición", descripcion: "Comunidad y espacios de comunicación correspondientes al rol.", etiqueta: "Comunidad" }
  ];

  if (categoria === "paciente") {
    return [
      { icono: "SALUD", nombre: "Mi Salud", descripcion: "Tratamiento, registros diarios y metas de seguimiento.", etiqueta: "Principal", conteo: totalSeguimiento },
      { icono: "AGENDA", nombre: "Mi agenda", descripcion: "Citas y actividades registradas para la cuenta.", etiqueta: "Paciente", conteo: totalAgenda },
      { icono: "ESC", nombre: "Escalas y seguimiento", descripcion: "Resultados de escalas y evolución personal.", etiqueta: "Clínico", conteo: totalEscalas },
      ...comunes
    ];
  }

  if (categoria === "profesional" || categoria === "psicologia") {
    return [
      { icono: "MED", nombre: categoria === "psicologia" ? "Panel clínico" : "Panel médico", descripcion: "Pacientes, expedientes y herramientas clínicas permitidas para este perfil.", etiqueta: etiquetaRolUsuario(usuario.rol), conteo: pacientesAsignados },
      { icono: "AGENDA", nombre: "Agenda profesional", descripcion: "Citas y actividades del profesional.", etiqueta: "Clínico", conteo: totalAgenda },
      { icono: "NOTAS", nombre: "Notas clínicas", descripcion: "Notas asociadas disponibles desde el perfil profesional.", etiqueta: "Clínico", conteo: totalNotas },
      { icono: "FMT", nombre: "Formatos clínicos", descripcion: "Formatos institucionales, manuales y paquetes asignados.", etiqueta: formatos.accesoGlobal ? "Acceso global" : "Con permiso", conteo: formatos.total || 0 },
      { icono: "ST", nombre: "Estadística médica", descripcion: "Análisis de variables, escalas, tablas y gráficas.", etiqueta: "Profesional" },
      { icono: "CLIN", nombre: "Calculadoras y escalas", descripcion: "Instrumentos clínicos y cálculos médicos.", etiqueta: "Profesional" },
      ...comunes
    ];
  }

  if (categoria === "admin") {
    return [
      { icono: "ADM", nombre: "Centro de Control", descripcion: "Usuarios, reportes, avisos, formatos y auditoría.", etiqueta: "Admin", conteo: usuariosAdmin.length },
      { icono: "FMT", nombre: "Formatos clínicos", descripcion: "Catálogo completo y administración de permisos.", etiqueta: "Acceso global", conteo: formatos.total || 0 },
      { icono: "MED", nombre: "Panel médico", descripcion: "Herramientas clínicas disponibles para perfiles autorizados.", etiqueta: "Admin" },
      { icono: "ST", nombre: "Estadística médica", descripcion: "Análisis clínico y herramientas de datos.", etiqueta: "Admin" },
      ...comunes
    ];
  }

  return [
    { icono: "PERFIL", nombre: "Mi perfil", descripcion: "Información básica y configuración de la cuenta.", etiqueta: "Cuenta" },
    ...comunes
  ];
}

function renderizarModuloVistaPrevia(modulo = {}) {
  const tieneConteo = Number.isFinite(Number(modulo.conteo));
  return `
    <article class="vista-previa-modulo">
      <div class="vista-previa-modulo-top">
        <span class="vista-previa-modulo-icono">${escaparHTML(modulo.icono || "APP")}</span>
        <span class="vista-previa-modulo-etiqueta">${escaparHTML(modulo.etiqueta || "Disponible")}</span>
      </div>
      <h4>${escaparHTML(modulo.nombre || "Módulo")}</h4>
      <p>${escaparHTML(modulo.descripcion || "")}</p>
      ${tieneConteo ? `<strong class="vista-previa-modulo-conteo">${Number(modulo.conteo)} registros visibles</strong>` : ""}
      <button type="button" disabled aria-disabled="true" title="Las acciones están bloqueadas en vista previa">Abrir · bloqueado en vista previa</button>
    </article>
  `;
}

function resumenRegistroVistaPrevia(registro = {}) {
  const datos = registro.data || {};
  return datos.notaRapida || datos.titulo || datos.nombre || datos.archivoNombre || datos.descripcion || "Registro disponible";
}

function renderizarActividadVistaPrevia(resultado = {}) {
  if (resultado.error) {
    return `<p class="admin-muted">No disponible: ${escaparHTML(resultado.error)}</p>`;
  }
  if (!resultado.registros?.length) {
    return "<p class=\"admin-muted\">Sin registros para esta cuenta.</p>";
  }
  return `
    <ul class="vista-previa-actividad-lista">
      ${resultado.registros.slice(0, 3).map((registro) => `<li>${escaparHTML(resumenRegistroVistaPrevia(registro))}</li>`).join("")}
    </ul>
    ${resultado.registros.length > 3 ? `<small>Y ${resultado.registros.length - 3} registros adicionales.</small>` : ""}
  `;
}

function renderizarVistaPerspectivaUsuario(usuario = {}, resultados = [], importacionDocx = null) {
  const formatos = resumenFormatosVistaPrevia(usuario);
  const modulos = modulosVistaPreviaUsuario(usuario, resultados, importacionDocx, formatos);
  const nombre = usuario.nombre || usuario.email || "Usuario";
  const rol = etiquetaRolUsuario(usuario.rol || usuario.role || "sin_rol");
  const estado = usuario.estado || usuario.status || (usuario.activo === false ? "desactivado" : "activo");
  const totalRegistros = resultados.reduce((total, resultado) => total + (resultado.registros?.length || 0), 0);
  const institucion = usuario.institucion || usuario.unidad || usuario.institucionPaciente || "Sin institución registrada";

  return `
    <section class="vista-previa-usuario-shell" data-vista-previa-usuario>
      <div class="vista-previa-usuario-cintillo" role="status">
        <strong>VISTA PREVIA ADMINISTRATIVA · SOLO LECTURA</strong>
        <span>Perspectiva de ${escaparHTML(nombre)}. La sesión del administrador permanece activa y todas las acciones de la cuenta están bloqueadas.</span>
      </div>

      <header class="vista-previa-usuario-topbar">
        <div class="vista-previa-marca">
          <span class="vista-previa-marca-icono">C</span>
          <div><strong>COGNICIÓN</strong><small>Plataforma clínica digital</small></div>
        </div>
        <div class="vista-previa-identidad">
          <span>${escaparHTML(rol)}</span>
          <strong>${escaparHTML(nombre)}</strong>
          <small>${escaparHTML(usuario.email || "Sin correo")}</small>
        </div>
      </header>

      <div class="vista-previa-usuario-layout">
        <nav class="vista-previa-usuario-nav" aria-label="Pantallas de la vista previa">
          <button type="button" class="activo" data-vista-previa-pagina="inicio" aria-pressed="true">Inicio</button>
          <button type="button" data-vista-previa-pagina="perfil" aria-pressed="false">Perfil</button>
          <button type="button" data-vista-previa-pagina="actividad" aria-pressed="false">Actividad</button>
          <button type="button" data-vista-previa-pagina="formatos" aria-pressed="false">Formatos y permisos</button>
          <p><strong>Interacciones bloqueadas</strong><span>Esta navegación solo cambia la pantalla representada dentro de la vista previa.</span></p>
        </nav>

        <div class="vista-previa-usuario-paginas">
          <section data-vista-previa-panel="inicio" aria-hidden="false">
            <div class="vista-previa-hero">
              <span>PLATAFORMA CLÍNICA DIGITAL</span>
              <h3>Hola, ${escaparHTML(nombre)}</h3>
              <p>Esta es la representación administrativa de los módulos visibles de acuerdo con el rol y los permisos actuales de la cuenta.</p>
            </div>
            <div class="vista-previa-resumen">
              <article><span>Rol efectivo</span><strong>${escaparHTML(rol)}</strong></article>
              <article><span>Estado</span><strong>${escaparHTML(valorCorroboracion(estado))}</strong></article>
              <article><span>Información asociada</span><strong>${totalRegistros} registros</strong></article>
              <article><span>Formatos disponibles</span><strong>${formatos.accesoGlobal ? "Acceso global" : formatos.total}</strong></article>
            </div>
            <div class="vista-previa-seccion-titulo">
              <div><span>CENTRO DE TRABAJO</span><h3>Tu espacio de trabajo</h3></div>
              <small>${modulos.length} módulos visibles para este perfil</small>
            </div>
            <div class="vista-previa-modulos-grid">
              ${modulos.map(renderizarModuloVistaPrevia).join("")}
            </div>
          </section>

          <section data-vista-previa-panel="perfil" hidden aria-hidden="true">
            <div class="vista-previa-seccion-titulo"><div><span>CUENTA</span><h3>Mi perfil</h3></div><small>Vista de datos actuales</small></div>
            <dl class="vista-previa-perfil-grid">
              <div><dt>Nombre</dt><dd>${escaparHTML(valorCorroboracion(usuario.nombre))}</dd></div>
              <div><dt>Correo</dt><dd>${escaparHTML(valorCorroboracion(usuario.email))}</dd></div>
              <div><dt>Rol</dt><dd>${escaparHTML(rol)}</dd></div>
              <div><dt>Estado de cuenta</dt><dd>${escaparHTML(valorCorroboracion(estado))}</dd></div>
              <div><dt>Institución o unidad</dt><dd>${escaparHTML(institucion)}</dd></div>
              <div><dt>Cédula profesional</dt><dd>${escaparHTML(valorCorroboracion(usuario.cedulaProfesional || usuario.cedula))}</dd></div>
            </dl>
            <div class="vista-previa-bloqueo-acciones">
              <button type="button" disabled aria-disabled="true">Guardar cambios · bloqueado</button>
              <span>La vista previa nunca modifica el perfil consultado.</span>
            </div>
          </section>

          <section data-vista-previa-panel="actividad" hidden aria-hidden="true">
            <div class="vista-previa-seccion-titulo"><div><span>INFORMACIÓN ASOCIADA</span><h3>Actividad de la cuenta</h3></div><small>${totalRegistros} registros consultados</small></div>
            <div class="vista-previa-actividad-grid">
              ${resultados.map((resultado) => `
                <article>
                  <header><h4>${escaparHTML(resultado.nombre)}</h4><span>${resultado.registros?.length || 0}</span></header>
                  ${renderizarActividadVistaPrevia(resultado)}
                </article>
              `).join("")}
              ${importacionDocx ? `
                <article>
                  <header><h4>Notas importadas</h4><span>${importacionDocx.totalNotas || 0}</span></header>
                  <p class="admin-muted">${importacionDocx.error ? `No disponible: ${escaparHTML(importacionDocx.error)}` : `${importacionDocx.pacientes?.length || 0} pacientes asociados a esta importación.`}</p>
                </article>
              ` : ""}
            </div>
          </section>

          <section data-vista-previa-panel="formatos" hidden aria-hidden="true">
            <div class="vista-previa-seccion-titulo"><div><span>ACCESO EFECTIVO</span><h3>Formatos y permisos</h3></div><small>${formatos.accesoGlobal ? "Acceso global" : `${formatos.total} asignaciones`}</small></div>
            <div class="vista-previa-permisos-resumen">
              <span>Cuenta ${formatos.cuentaActiva ? "activa" : "inactiva"}</span>
              <span>Origen: ${escaparHTML(formatos.origen)}</span>
              <span>Solo consulta administrativa</span>
            </div>
            <div class="vista-previa-formatos-grid">
              ${formatos.accesoGlobal ? `<article><strong>Todos los formatos</strong><span>Acceso global por rol administrativo</span></article>` : ""}
              ${formatos.items.map((formato) => `<article><strong>${escaparHTML(formato.nombre)}</strong><span>${escaparHTML(formato.tipo)}</span></article>`).join("")}
              ${!formatos.accesoGlobal && !formatos.items.length ? `<p class="admin-muted">Este perfil no tiene formatos asignados.</p>` : ""}
            </div>
            <div class="vista-previa-bloqueo-acciones">
              <button type="button" disabled aria-disabled="true">Crear o editar formato · bloqueado</button>
              <span>Los permisos mostrados se calcularon con el perfil actual del usuario.</span>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function configurarNavegacionVistaPreviaUsuario(contenedor) {
  const botones = [...contenedor.querySelectorAll("[data-vista-previa-pagina]")];
  const paneles = [...contenedor.querySelectorAll("[data-vista-previa-panel]")];
  botones.forEach((boton) => {
    boton.addEventListener("click", () => {
      const pagina = boton.dataset.vistaPreviaPagina;
      botones.forEach((item) => {
        const activo = item === boton;
        item.classList.toggle("activo", activo);
        item.setAttribute("aria-pressed", String(activo));
      });
      paneles.forEach((panel) => {
        const activo = panel.dataset.vistaPreviaPanel === pagina;
        panel.hidden = !activo;
        panel.setAttribute("aria-hidden", String(!activo));
      });
    });
  });
}

async function abrirVistaUsuarioAdmin(uidUsuario, modo = "corroboracion") {
  const usuario = usuariosAdmin.find((item) => item.id === uidUsuario);
  if (!usuario || uidUsuario === adminActual?.uid) return;
  const acceso = await usuarioPuedeAccederAdmin(adminActual);
  if (!acceso.permitido) {
    alert("No tienes permisos administrativos para abrir esta vista.");
    return;
  }

  const titulo = document.getElementById("vistaCorroboracionTitulo");
  const meta = document.getElementById("vistaCorroboracionMeta");
  const contenido = document.getElementById("vistaCorroboracionContenido");
  if (!titulo || !meta || !contenido) return;
  const esVistaPrevia = modo === "vista_previa";
  titulo.textContent = esVistaPrevia
    ? `Vista previa: ${usuario.nombre || usuario.email || "Cuenta consultada"}`
    : usuario.nombre || usuario.email || "Cuenta consultada";
  meta.textContent = `${usuario.email || "Sin correo"} · UID: ${usuario.id} · Solo lectura`;
  contenido.innerHTML = `<p>${esVistaPrevia ? "Preparando la vista previa del perfil..." : "Cargando información de la cuenta..."}</p>`;
  mostrarVistaCorroboracionAdmin();

  await registrarAuditoriaAdmin(
    esVistaPrevia ? "abrir_vista_previa_usuario_admin" : "abrir_vista_corroboracion_admin",
    esVistaPrevia
      ? "El administrador abrió una vista previa de usuario de solo lectura."
      : "El administrador abrió una vista de corroboración de solo lectura.",
    {
    pacienteUid: usuario.rol === "paciente" ? usuario.id : "",
    pacienteNombre: usuario.rol === "paciente" ? usuario.nombre || "" : "",
      detalles: {
        usuarioObjetivoUid: usuario.id,
        usuarioObjetivoNombre: usuario.nombre || usuario.email || "",
        modo: esVistaPrevia ? "vista_previa_usuario" : "corroboracion",
        soloLectura: true,
        suplantacionSesion: false
      }
    }
  );

  const [resultados, importacionDocx] = await Promise.all([
    Promise.all(COLECCIONES_VISTA_CORROBORACION.map(async (nombreColeccion) => {
    try {
      const snap = await getDocs(collection(db, "usuarios", uidUsuario, nombreColeccion));
      return { nombre: nombreColeccion, registros: snap.docs.map((item) => ({ id: item.id, data: item.data() })) };
    } catch (error) {
      return { nombre: nombreColeccion, registros: [], error: error?.code || "sin_acceso" };
    }
    })),
    usuarioEsProfesionalTipoMedico(usuario.rol) || usuario.rol === "psicologo"
      ? cargarNotasImportadasCorroboracion(uidUsuario)
      : Promise.resolve(null)
  ]);

  if (esVistaPrevia) {
    contenido.innerHTML = renderizarVistaPerspectivaUsuario(usuario, resultados, importacionDocx);
    configurarNavegacionVistaPreviaUsuario(contenido);
  } else {
    contenido.innerHTML = `
      <section class="vista-corroboracion-perfil">
        <h3>Perfil</h3>
        <dl>
          <dt>Nombre</dt><dd>${escaparHTML(valorCorroboracion(usuario.nombre))}</dd>
          <dt>Correo</dt><dd>${escaparHTML(valorCorroboracion(usuario.email))}</dd>
          <dt>Rol</dt><dd>${escaparHTML(valorCorroboracion(usuario.rol))}</dd>
          <dt>Estado</dt><dd>${escaparHTML(valorCorroboracion(usuario.estado || "activo"))}</dd>
        </dl>
      </section>
      <section>
        <h3>Información asociada</h3>
        <div class="vista-corroboracion-colecciones">
          ${resultados.map((resultado) => `
            <article>
              <h4>${escaparHTML(resultado.nombre)} <span>${resultado.registros.length}</span></h4>
              ${resultado.error ? `<p class="admin-muted">No disponible: ${escaparHTML(resultado.error)}</p>` : renderizarDocumentosCorroboracion(resultado.registros)}
            </article>
          `).join("")}
        </div>
      </section>
      ${importacionDocx ? `
        <section>
          <h3>Pacientes y notas importadas <span>${importacionDocx.totalNotas || 0} notas · ${importacionDocx.pacientes?.length || 0} pacientes</span></h3>
          ${renderizarNotasImportadasCorroboracion(importacionDocx)}
        </section>
      ` : ""}
    `;
  }

  await registrarAuditoriaAdmin(
    esVistaPrevia ? "consultar_datos_vista_previa_usuario_admin" : "consultar_datos_vista_corroboracion_admin",
    esVistaPrevia
      ? "El administrador consultó datos en una vista previa de usuario de solo lectura."
      : "El administrador consultó datos en una vista de corroboración de solo lectura.",
    {
    pacienteUid: usuario.rol === "paciente" ? usuario.id : "",
    pacienteNombre: usuario.rol === "paciente" ? usuario.nombre || "" : "",
      detalles: {
        usuarioObjetivoUid: usuario.id,
        coleccionesConsultadas: resultados.map((item) => item.nombre),
        notasImportadasConsultadas: Boolean(importacionDocx),
        modo: esVistaPrevia ? "vista_previa_usuario" : "corroboracion",
        soloLectura: true,
        suplantacionSesion: false
      }
    }
  );
}

window.abrirVistaCorroboracionAdmin = async function(uidUsuario) {
  return abrirVistaUsuarioAdmin(uidUsuario, "corroboracion");
};

window.abrirVistaPreviaUsuarioAdmin = async function(uidUsuario) {
  return abrirVistaUsuarioAdmin(uidUsuario, "vista_previa");
};

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
    [ROL_ENFERMERIA_SALUD_MENTAL]: "Todos los Lic. en Enfermeria / Asesores en Salud Mental",
    psicologo: "Todos los psicologos",
    personal_salud: "Todos los medicos, enfermeria/asesoria y psicologos",
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
                <li>${escaparHTML(lectura.nombre || lectura.email || lectura.uid || "Usuario")} · ${escaparHTML(lectura.rol || "sin rol")} · ${escaparHTML(lectura.leidoEn || "")}</li>
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

function renderizarAccesoMotorPatrones() {
  if (!datosUsuarioSonAdmin(adminDatosActual || {})) return;
  const navegacion = document.querySelector(".admin-section-nav");
  const principal = document.querySelector("main.admin-contenedor");
  if (!navegacion || !principal || document.getElementById("seccionMotorPatronesAdmin")) return;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.adminSection = "seccionMotorPatronesAdmin";
  boton.textContent = "Motor de Descubrimiento de Patrones";
  navegacion.appendChild(boton);

  const seccion = document.createElement("section");
  seccion.id = "seccionMotorPatronesAdmin";
  seccion.className = "card tabla-card admin-section patrones-admin";
  seccion.innerHTML = `
    <div class="tabla-header"><div><h2>Motor de Descubrimiento de Patrones</h2><p>Texto clínico · solo lectura. Solo conserva frases con el umbral confirmado.</p></div><div class="patrones-acciones"><button id="btnAnalizarPatronesTexto" type="button">Analizar textos</button><button id="btnReintentarPatronesTexto" type="button" hidden>Reintentar lectura</button><button id="btnExportarPatronesExcel" type="button" disabled>Exportar Excel</button><button id="btnExportarPatronesCsv" type="button" disabled>Exportar CSV</button><button id="btnLimpiarPatronesTexto" type="button">Limpiar resultados temporales</button></div></div>
    <div class="patrones-filtros-principales"><div class="patrones-conectores" aria-label="Filtro de conectores"><span class="patrones-control-label">Conectores</span><button id="btnExcluirConectores" type="button" aria-pressed="true">Excluir conectores</button><button id="btnIncluirConectores" type="button" aria-pressed="false">Incluir conectores</button><small>Oculta patrones formados únicamente por palabras funcionales.</small></div><div class="patrones-preposiciones" aria-label="Filtro de preposiciones"><span class="patrones-control-label">Preposiciones</span><button id="btnExcluirPreposiciones" type="button" aria-pressed="true">Excluir preposiciones</button><button id="btnIncluirPreposiciones" type="button" aria-pressed="false">Incluir preposiciones</button><small>Modifica solo la firma léxica; conserva la frase original.</small></div><div class="patrones-umbral" aria-label="Configuración del umbral de patrones"><label for="umbralPatronesInput">Umbral de patrón</label><button id="btnUmbralPatronesMenos" type="button" aria-label="Disminuir umbral">−</button><input id="umbralPatronesInput" type="number" min="2" max="1000" step="1" inputmode="numeric" value="3" aria-describedby="ayudaUmbralPatrones"><button id="btnUmbralPatronesMas" type="button" aria-label="Aumentar umbral">+</button><span id="ayudaUmbralPatrones">Mostrar únicamente frases con frecuencia ≥ umbral.</span></div></div>
    <p id="estadoPatronesTexto" class="estado-patrones" aria-live="polite">Módulo listo. No se han leído textos clínicos.</p>
    <div class="patrones-resumen"><span>Umbral actual: <strong id="umbralPatronesTexto">3 apariciones</strong></span><span>Patrones disponibles: <strong id="patronesDisponiblesPatronesTexto">0</strong></span><span>Patrones visibles: <strong id="patronesVisiblesPatronesTexto">0</strong></span><span>Ocultos por conectores: <strong id="patronesOcultosConectoresPatronesTexto">0</strong></span><span>Modificados por preposiciones: <strong id="patronesModificadosPreposicionesPatronesTexto">0</strong></span><span>Ocultos por umbral: <strong id="patronesOcultosUmbralPatronesTexto">0</strong></span><span>Frecuencia máxima: <strong id="frecuenciaMaximaPatronesTexto">0</strong></span><span>Frecuencia media: <strong id="frecuenciaMediaPatronesTexto">0</strong></span><span>Documentos revisados: <strong id="documentosPatronesTexto">0</strong></span><span>Lotes procesados: <strong id="lotesPatronesTexto">0</strong></span><span>Candidatas temporales: <strong id="candidatasPatronesTexto">0</strong></span><span>Tiempo: <strong id="tiempoPatronesTexto">0 ms</strong></span></div>
    <div class="filtros-auditoria patrones-filtros"><input id="filtroPatronBusqueda" placeholder="Buscar frase o palabra"><input id="filtroPatronMedico" placeholder="UID médico"><input id="filtroPatronPaciente" placeholder="UID paciente"><input id="filtroPatronInstitucion" placeholder="Institución"><input id="filtroPatronServicio" placeholder="Servicio / atención"><input id="filtroPatronDesde" type="date" aria-label="Fecha desde"><input id="filtroPatronHasta" type="date" aria-label="Fecha hasta"></div>
    <div class="tabla-scroll"><table><thead><tr><th>Frase original</th><th>Frase normalizada</th><th>Firma léxica</th><th>Frecuencia total</th><th>Notas</th><th>Pacientes</th><th>Médicos</th><th>Primera aparición</th><th>Última aparición</th><th>Palabras</th></tr></thead><tbody id="tablaPatronesTexto"><tr><td colspan="10">Sin resultados temporales.</td></tr></tbody></table></div>`;
  principal.appendChild(seccion);
}

async function renderizarAccesoConocimientoSofia() {
  if (!datosUsuarioSonAdmin(adminDatosActual || {})) return;
  const nav = document.querySelector(".admin-section-nav");
  const main = document.querySelector("main.admin-contenedor");
  if (!nav || !main) return;
  try {
    const modulo = await import("./admin/clinicalKnowledge/clinicalKnowledgeController.js?v=20260814-correlaciones-es-v2");
    await modulo.initializeClinicalKnowledgePanel({ nav, main });
  } catch (error) {
    console.error("[ADMIN] No se pudo preparar Conocimiento registrado por SOFÍA", error);
  }
}

async function cargarMotorPatronesBajoDemanda() {
  if (!adminActual || !datosUsuarioSonAdmin(adminDatosActual || {})) throw new Error("PATTERN_DISCOVERY_FORBIDDEN");
  if (patternModuleInstance) return patternModuleInstance;
  const requestId = patternModuleRequestId;
  if (!patternModulePromise) {
    console.log("[ADMIN] Importando Motor de Patrones tras clic explícito");
    patternModulePromise = import("./admin/patternDiscovery/patternDiscoveryController.js?v=20260802-patterns-v6");
  }
  const modulo = await patternModulePromise;
  if (requestId !== patternModuleRequestId || !document.getElementById("seccionMotorPatronesAdmin")) throw new Error("PATTERN_DISCOVERY_CANCELLED");
  patternModuleInstance = await modulo.inicializarMotorDescubrimientoPatrones({ authUser: adminActual, userRole: "admin" });
  return patternModuleInstance;
}

function destruirMotorPatronesActivo() {
  patternModuleRequestId += 1;
  patternModuleInstance?.destruirMotorDescubrimientoPatrones?.();
  patternModuleInstance = null;
}

function mostrarSeccionAdmin(idSeccion) {
  if (idSeccion !== "seccionMotorPatronesAdmin") destruirMotorPatronesActivo();
  document.querySelectorAll(".admin-section").forEach((seccion) => {
    seccion.style.display = seccion.id === idSeccion ? "block" : "none";
  });
  document.querySelectorAll("[data-admin-section]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.adminSection === idSeccion);
  });
  if (idSeccion === "seccionMotorPatronesAdmin") {
    void cargarMotorPatronesBajoDemanda().catch((error) => {
      console.error("[ADMIN] Error al cargar Motor de Patrones", error);
      document.getElementById("estadoPatronesTexto")?.replaceChildren(document.createTextNode(`No se pudo cargar el módulo: ${error.message || "error desconocido"}`));
    });
  }
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
        <div class="codigo-medico-acciones">
          <span class="estado-codigo ${estado.clase}">${estado.texto}</span>
          ${codigo.usadoPorEmail ? `<small>Usado por: ${escaparHTML(codigo.usadoPorEmail)}</small>` : ""}
          ${codigo.usadoEn ? `<small>Uso: ${escaparHTML(formatearFechaAdmin(codigo.usadoEn))}</small>` : ""}
          <div class="paciente-admin-acciones">
            <button type="button" onclick="cambiarDuracionCodigoMedicoAdmin('${codigo.id}')">Cambiar duración</button>
            <button type="button" ${estado.clase !== "vigente" ? "" : "disabled"} onclick="reactivarCodigoMedicoAdmin('${codigo.id}')">Reactivar código</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function cargarResumen() {
  const snapUsuarios = await getDocs(collection(db, "usuarios"));
  const snapAuditoria = await getDocs(collection(db, "auditoria"));
  let visitas = null;

  try {
    const snapVisitas = await getDocs(collection(db, "visitas"));
    visitas = consolidarVisitasAdmin(snapVisitas.docs.map((docVisita) => docVisita.data()));
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;
    console.warn("No se pudo cargar el resumen de visitas por permisos.");
  }

  let totalUsuarios = 0;
  let totalPacientes = 0;
  let totalMedicos = 0;
  let totalEnfermeriaSaludMental = 0;
  let totalPsicologos = 0;
  let totalInactividad = 0;
  let totalAuditoriaVisible = 0;
  snapUsuarios.forEach((docUsuario) => {
    totalUsuarios++;
    const datos = docUsuario.data();
    if (datos.rol === "paciente") totalPacientes++;
    if (datos.rol === "medico") totalMedicos++;
    if (datos.rol === ROL_ENFERMERIA_SALUD_MENTAL) totalEnfermeriaSaludMental++;
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
  ponerTexto("totalEnfermeriaSaludMental", totalEnfermeriaSaludMental);
  ponerTexto("totalPsicologos", totalPsicologos);
  ponerTexto("totalAuditoria", totalAuditoriaVisible);
  ponerTexto("totalInactividad", totalInactividad);
  if (visitas) {
    ponerTexto("totalVisitas", visitas.total);
    ponerTexto("totalVisitasInvitados", visitas.invitados);
    ponerTexto("totalVisitasRegistrados", visitas.registrados);
    renderizarVisitasAdmin(visitas.items);
    return;
  }

  ["totalVisitas", "totalVisitasInvitados", "totalVisitasRegistrados"].forEach((id) => {
    ponerTexto(id, "No disponible");
  });
  const listaVisitas = document.getElementById("listaVisitasAdmin");
  if (listaVisitas) {
    listaVisitas.innerHTML = "<p class=\"admin-muted\">El resumen de visitas no está disponible con los permisos actuales.</p>";
  }
}

window.cambiarDuracionCodigoMedicoAdmin = async function(codigoId) {
  const codigo = codigosMedicoAdmin.find((item) => item.id === codigoId);
  if (!codigo || !adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) return;
  const horasTexto = prompt("¿Cuántas horas debe permanecer vigente este código?", "24");
  if (horasTexto === null) return;
  const horas = Number(horasTexto);
  if (!Number.isFinite(horas) || horas <= 0 || horas > 168) {
    alert("Indica una duración entre 1 y 168 horas.");
    return;
  }
  const expiraEn = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
  try {
    await updateDoc(doc(db, "codigosAutorizacionMedico", codigoId), { expiraEn, duracionHoras: horas, actualizadoEn: new Date().toISOString(), actualizadoPorUid: adminActual.uid });
    await registrarAuditoriaAdmin("cambiar_duracion_codigo_autorizacion_medico", "El administrador cambio la duracion de un codigo medico.", { detalles: { codigo: codigo.codigo || codigoId, horas, expiraEn } });
    await cargarCodigosMedicoAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_cambiar_duracion_codigo_autorizacion_medico", "No se pudo cambiar la duracion de un codigo medico.", { exito: false, detalles: { codigo: codigo.codigo || codigoId, error: resumenError(error) } });
    alert("No se pudo cambiar la duración: " + error.message);
  }
};

window.reactivarCodigoMedicoAdmin = async function(codigoId) {
  const codigo = codigosMedicoAdmin.find((item) => item.id === codigoId);
  if (!codigo || estadoCodigoMedico(codigo).clase === "vigente" || !adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) return;
  if (!confirm(`¿Reactivar el código ${codigo.codigo || codigoId}? Volverá a estar disponible para un solo uso.`)) return;
  const horasTexto = prompt("¿Cuántas horas debe permanecer vigente desde ahora?", "24");
  if (horasTexto === null) return;
  const horas = Number(horasTexto);
  if (!Number.isFinite(horas) || horas <= 0 || horas > 168) {
    alert("Indica una duración entre 1 y 168 horas.");
    return;
  }
  const ahora = new Date();
  const expiraEn = new Date(ahora.getTime() + horas * 60 * 60 * 1000).toISOString();
  try {
    await updateDoc(doc(db, "codigosAutorizacionMedico", codigoId), {
      usado: false, usadoPorUid: "", usadoPorEmail: "", usadoPorNombre: "", usadoPorRol: "", usadoEn: "",
      reactivadoEn: ahora.toISOString(), reactivadoPorUid: adminActual.uid, duracionHoras: horas,
      expiraEn, actualizadoEn: ahora.toISOString(), actualizadoPorUid: adminActual.uid
    });
    await registrarAuditoriaAdmin("reactivar_codigo_autorizacion_medico", "El administrador reactivo un codigo medico usado.", { detalles: { codigo: codigo.codigo || codigoId, horas, expiraEn, usoAnteriorUid: codigo.usadoPorUid || "" } });
    await cargarCodigosMedicoAdmin();
  } catch (error) {
    await registrarAuditoriaAdmin("error_reactivar_codigo_autorizacion_medico", "No se pudo reactivar un codigo medico.", { exito: false, detalles: { codigo: codigo.codigo || codigoId, error: resumenError(error) } });
    alert("No se pudo reactivar el código: " + error.message);
  }
};

function consolidarVisitasAdmin(registros = []) {
  const unicas = new Map();
  registros.forEach((visita) => {
    const clave = visita.usuarioUid
      ? `usuario:${visita.usuarioUid}`
      : `invitado:${visita.visitanteId || visita.id || `${visita.nombre || "invitado"}:${visita.ultimaRuta || ""}`}`;
    const actual = unicas.get(clave);
    if (!actual || String(visita.ultimaVisitaTexto || "") > String(actual.ultimaVisitaTexto || "")) {
      unicas.set(clave, visita);
    }
  });

  const items = [...unicas.values()].map((visita) => {
    const usuario = visita.usuarioUid ? usuariosAdmin.find((item) => item.id === visita.usuarioUid) : null;
    return {
      ...visita,
      tipo: visita.usuarioUid ? "registrado" : "invitado",
      nombre: usuario?.nombre || visita.nombre || (visita.usuarioUid ? visita.email : "Invitado")
    };
  }).sort((a, b) => String(b.ultimaVisitaTexto || "").localeCompare(String(a.ultimaVisitaTexto || "")));

  return {
    items,
    total: items.length,
    invitados: items.filter((visita) => visita.tipo === "invitado").length,
    registrados: items.filter((visita) => visita.tipo === "registrado").length
  };
}

function renderizarVisitasAdmin(visitas = []) {
  const contenedor = document.getElementById("listaVisitasAdmin");
  if (!contenedor) return;
  if (!visitas.length) {
    contenedor.innerHTML = "<p>No hay visitas registradas todavía.</p>";
    return;
  }
  contenedor.innerHTML = visitas.slice(0, 30).map((visita) => `
    <article class="sesion-usuario-card">
      <div>
        <strong>${escaparHTML(visita.nombre)}</strong>
        <small>${visita.tipo === "registrado" ? "Usuario registrado" : "Invitado"}${visita.rol ? ` · ${escaparHTML(visita.rol)}` : ""}</small>
      </div>
      <div class="sesion-usuario-meta">
        <span>Última visita: ${escaparHTML(formatearFechaAdmin(visita.ultimaVisitaTexto))}</span>
        <span>${escaparHTML(visita.ultimaRuta || "Ruta no disponible")}</span>
      </div>
    </article>
  `).join("");
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
        <span>${escaparHTML(usuario.email || "Sin correo")} · ${escaparHTML(usuario.rol || "sin rol")}</span>
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
          <small>${escaparHTML(usuario.email || usuario.id)} · ${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</small>
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
            <small>${escaparHTML(usuario.email || usuario.id)} · ${escaparHTML(etiquetaRolUsuario(usuario.rol || "sin_rol"))}</small>
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
    <option value="${escaparHTML(usuario.id)}">${escaparHTML(usuario.nombre || usuario.email || usuario.id)} · ${escaparHTML(usuario.rol || "sin rol")}</option>
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
          <p>Preparando conversación con ${escaparHTML(contacto.nombre || contacto.email || contacto.id)}.</p>
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
            <p>${escaparHTML(error.message || "Firestore bloqueo la creación de la conversación.")}</p>
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
    const esCuentaActual = usuario.id === adminActual?.uid;
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
            ${opcionRol(ROL_ENFERMERIA_SALUD_MENTAL, rolActual)}
            ${opcionRol("psicologo", rolActual)}
            ${opcionRol("admin", rolActual)}
          </select>
          ${esAdminActual ? "<small>Administrador principal protegido.</small>" : ""}
        </div>

        ${renderizarControlColaboradorAdmin(usuario)}

        <div class="paciente-admin-acciones">
          ${esCuentaActual
            ? `<button type="button" disabled aria-label="Esta es la cuenta administrativa actual">Cuenta actual</button>`
            : `<button type="button" aria-label="Ver la página como ${escaparHTML(usuario.nombre || usuario.email || "usuario")} en modo solo lectura" onclick="abrirVistaPreviaUsuarioAdmin('${usuario.id}')">Ver como usuario · solo lectura</button>`}
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

  contenedor.querySelectorAll("[data-guardar-colaborador]").forEach((boton) => {
    boton.addEventListener("click", guardarReconocimientoColaboradorAdmin);
  });
  contenedor.querySelectorAll("[data-retirar-colaborador]").forEach((boton) => {
    boton.addEventListener("click", retirarReconocimientoColaboradorAdmin);
  });
}

function renderizarControlColaboradorAdmin(usuario = {}) {
  const actual = usuario.colaborador || {};
  const tipoActual = actual.activo === true && TIPOS_COLABORADOR[actual.tipo] ? actual.tipo : "ninguno";
  const opciones = Object.values(TIPOS_COLABORADOR).map((tipo) => `
    <option value="${escaparHTML(tipo.value || "")}" ${tipoActual === (tipo.value || "ninguno") ? "selected" : ""}>${escaparHTML(tipo.label)}</option>
  `).join("");
  return `
    <div class="reconocimiento-admin-control">
      <h4>Reconocimiento y colaboración</h4>
      <p class="usuario-admin-meta">Estado: <strong>${actual.activo === true ? "Activo" : "Inactivo"}</strong> · Tipo: <strong>${escaparHTML(TIPOS_COLABORADOR[tipoActual]?.label || "No es colaborador")}</strong></p>
      ${actual.fechaAsignacion ? `<small>Fecha de asignación: ${escaparHTML(formatearFechaAdmin(actual.fechaAsignacion))}</small>` : ""}
      ${actual.asignadoPor ? `<small>Asignado por: ${escaparHTML(actual.asignadoPor)}</small>` : ""}
      <label for="colaborador-${escaparHTML(usuario.id)}">Tipo de colaborador</label>
      <select id="colaborador-${escaparHTML(usuario.id)}" data-tipo-colaborador="${escaparHTML(usuario.id)}">${opciones}</select>
      <div class="paciente-admin-acciones">
        <button type="button" data-guardar-colaborador="${escaparHTML(usuario.id)}">Guardar</button>
        <button type="button" class="boton-peligro" data-retirar-colaborador="${escaparHTML(usuario.id)}" ${actual.activo === true ? "" : "disabled"}>Retirar reconocimiento</button>
      </div>
    </div>
  `;
}

function actualizarBloqueColaboradorAdmin(usuario, tarjeta) {
  const control = tarjeta?.querySelector(".reconocimiento-admin-control");
  if (!control) return;
  control.outerHTML = renderizarControlColaboradorAdmin(usuario);
  tarjeta.querySelector("[data-guardar-colaborador]")?.addEventListener("click", guardarReconocimientoColaboradorAdmin);
  tarjeta.querySelector("[data-retirar-colaborador]")?.addEventListener("click", retirarReconocimientoColaboradorAdmin);
}

async function guardarReconocimientoColaboradorAdmin(evento) {
  const boton = evento.currentTarget;
  const tarjeta = boton.closest(".usuario-admin-card");
  const uid = boton.dataset.guardarColaborador || "";
  const usuario = usuariosAdmin.find((item) => item.id === uid);
  const tipo = document.querySelector(`[data-tipo-colaborador="${CSS.escape(uid)}"]`)?.value || "";
  if (!usuario) return;
  if (!tipo) return retirarReconocimientoColaboradorAdmin({ currentTarget: { dataset: { retirarColaborador: uid }, closest: () => tarjeta } });
  const categoria = TIPOS_COLABORADOR[tipo]?.label || tipo;
  if (!confirm(`¿Deseas asignar a este usuario la categoría “${categoria}”?`)) return;
  boton.disabled = true;
  try {
    console.debug("[colaborador] cambio solicitado", usuario.id, tipo);
    await actualizarReconocimientoColaborador({ usuarioId: uid, tipo });
    usuario.colaborador = { activo: true, tipo, fechaAsignacion: new Date(), asignadoPor: adminActual?.uid || "" };
    actualizarBloqueColaboradorAdmin(usuario, tarjeta);
    alert("Reconocimiento actualizado correctamente.");
  } catch (error) {
    alert(`No se pudo actualizar el reconocimiento: ${error.message}`);
    boton.disabled = false;
  }
}

async function retirarReconocimientoColaboradorAdmin(evento) {
  const uid = evento.currentTarget?.dataset?.retirarColaborador || "";
  const usuario = usuariosAdmin.find((item) => item.id === uid);
  const tarjeta = evento.currentTarget?.closest?.(".usuario-admin-card");
  if (!usuario || !confirm("¿Deseas retirar el reconocimiento de colaborador a este usuario?")) return;
  try {
    await actualizarReconocimientoColaborador({ usuarioId: uid, tipo: null });
    usuario.colaborador = { activo: false, tipo: null, fechaAsignacion: null, asignadoPor: null };
    actualizarBloqueColaboradorAdmin(usuario, tarjeta);
    alert("Reconocimiento actualizado correctamente.");
  } catch (error) {
    alert(`No se pudo retirar el reconocimiento: ${error.message}`);
  }
}


function crearSeccionFormatoVisual(tipo = "texto") {
  const id = `seccion_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (tipo === "campos") {
    return { id, tipo, titulo: "Datos de identificación", campos: ["Nombre", "Fecha", "Expediente"] };
  }
  if (tipo === "tabla") {
    return {
      id,
      tipo,
      titulo: "Tabla de registro",
      celdas: [
        ["Columna 1", "Columna 2", "Columna 3"],
        ["", "", ""],
        ["", "", ""]
      ]
    };
  }
  return { id, tipo: "texto", titulo: "Nueva sección", texto: "Escribe aquí el contenido de la sección." };
}

function contenidoTextoFormatoVisual() {
  return formatoVisualEstado.secciones.map((seccion) => {
    if (seccion.tipo === "campos") return `${seccion.titulo}\n${seccion.campos.map((campo) => `${campo}:`).join("\n")}`;
    if (seccion.tipo === "tabla") return `${seccion.titulo}\n${seccion.celdas.map((fila) => fila.join(" | ")).join("\n")}`;
    return `${seccion.titulo}\n${seccion.texto || ""}`;
  }).join("\n\n");
}

function sincronizarContenidoFormatoVisual() {
  const campo = document.getElementById("formatoManualContenido");
  if (campo) campo.value = contenidoTextoFormatoVisual();
}

function renderizarCuerpoSeccionFormatoVisual(seccion) {
  if (seccion.tipo === "campos") {
    return `<div class="formato-visual-campos">${seccion.campos.map((campo, indice) => `
      <div><span contenteditable="true" data-editor-campo="${indice}">${escaparHTML(campo)}</span><i></i></div>
    `).join("")}</div>`;
  }
  if (seccion.tipo === "tabla") {
    return `
      <table class="formato-visual-tabla"><tbody>${seccion.celdas.map((fila, filaIndice) => `
        <tr>${fila.map((celda, columnaIndice) => `<td contenteditable="true" data-editor-celda="${filaIndice}:${columnaIndice}">${escaparHTML(celda)}</td>`).join("")}</tr>
      `).join("")}</tbody></table>
      <div class="formato-visual-tabla-acciones">
        <button type="button" data-accion-seccion="agregar-fila">+ Fila</button>
        <button type="button" data-accion-seccion="agregar-columna">+ Columna</button>
      </div>
    `;
  }
  return `<div class="formato-visual-texto" contenteditable="true" data-editor-texto>${escaparHTML(seccion.texto || "").replace(/\n/g, "<br>")}</div>`;
}

function renderizarCreadorVisualFormatosAdmin() {
  const lienzo = document.getElementById("formatoVisualLienzo");
  const logo = document.getElementById("formatoVisualLogoPreview");
  const contenedor = document.getElementById("formatoVisualSecciones");
  const controlTamano = document.getElementById("formatoVisualLogoTamano");
  if (!lienzo || !logo || !contenedor) return;

  logo.hidden = !formatoVisualEstado.logo.dataUrl;
  if (formatoVisualEstado.logo.dataUrl) logo.src = formatoVisualEstado.logo.dataUrl;
  else logo.removeAttribute("src");
  logo.style.left = `${formatoVisualEstado.logo.x}%`;
  logo.style.top = `${formatoVisualEstado.logo.y}%`;
  logo.style.width = `${formatoVisualEstado.logo.ancho}%`;
  if (controlTamano) controlTamano.value = String(formatoVisualEstado.logo.ancho);

  contenedor.innerHTML = formatoVisualEstado.secciones.length
    ? formatoVisualEstado.secciones.map((seccion, indice) => `
      <section class="formato-visual-seccion" data-seccion-formato="${escaparHTML(seccion.id)}">
        <div class="formato-visual-seccion-controles">
          <span>${escaparHTML(seccion.tipo)}</span>
          <button type="button" data-accion-seccion="subir" ${indice === 0 ? "disabled" : ""} aria-label="Subir sección">↑</button>
          <button type="button" data-accion-seccion="bajar" ${indice === formatoVisualEstado.secciones.length - 1 ? "disabled" : ""} aria-label="Bajar sección">↓</button>
          <button type="button" data-accion-seccion="eliminar" aria-label="Eliminar sección">×</button>
        </div>
        <h3 contenteditable="true" data-editor-titulo>${escaparHTML(seccion.titulo || "Sección")}</h3>
        ${renderizarCuerpoSeccionFormatoVisual(seccion)}
      </section>
    `).join("")
    : "<p class=\"formato-visual-vacio\">Añade una sección para comenzar el diseño.</p>";
  sincronizarContenidoFormatoVisual();
}

function seccionVisualDesdeElemento(elemento) {
  const id = elemento?.closest?.("[data-seccion-formato]")?.dataset?.seccionFormato || "";
  return formatoVisualEstado.secciones.find((seccion) => seccion.id === id) || null;
}

function manejarAccionSeccionFormatoVisual(evento) {
  const boton = evento.target.closest("[data-accion-seccion]");
  if (!boton) return;
  const seccion = seccionVisualDesdeElemento(boton);
  if (!seccion) return;
  const indice = formatoVisualEstado.secciones.findIndex((item) => item.id === seccion.id);
  const accion = boton.dataset.accionSeccion;
  if (accion === "subir" && indice > 0) {
    [formatoVisualEstado.secciones[indice - 1], formatoVisualEstado.secciones[indice]] = [formatoVisualEstado.secciones[indice], formatoVisualEstado.secciones[indice - 1]];
  } else if (accion === "bajar" && indice < formatoVisualEstado.secciones.length - 1) {
    [formatoVisualEstado.secciones[indice + 1], formatoVisualEstado.secciones[indice]] = [formatoVisualEstado.secciones[indice], formatoVisualEstado.secciones[indice + 1]];
  } else if (accion === "eliminar") {
    formatoVisualEstado.secciones.splice(indice, 1);
  } else if (accion === "agregar-fila" && seccion.tipo === "tabla") {
    seccion.celdas.push(Array.from({ length: seccion.celdas[0]?.length || 1 }, () => ""));
  } else if (accion === "agregar-columna" && seccion.tipo === "tabla") {
    seccion.celdas.forEach((fila, filaIndice) => fila.push(filaIndice === 0 ? `Columna ${fila.length + 1}` : ""));
  }
  renderizarCreadorVisualFormatosAdmin();
}

function manejarEdicionSeccionFormatoVisual(evento) {
  const seccion = seccionVisualDesdeElemento(evento.target);
  if (!seccion) return;
  if (evento.target.matches("[data-editor-titulo]")) seccion.titulo = evento.target.innerText.trim();
  if (evento.target.matches("[data-editor-texto]")) seccion.texto = evento.target.innerText;
  if (evento.target.matches("[data-editor-campo]")) seccion.campos[Number(evento.target.dataset.editorCampo)] = evento.target.innerText.trim();
  if (evento.target.matches("[data-editor-celda]")) {
    const [fila, columna] = evento.target.dataset.editorCelda.split(":").map(Number);
    if (seccion.celdas[fila]) seccion.celdas[fila][columna] = evento.target.innerText.trim();
  }
  sincronizarContenidoFormatoVisual();
}

function reiniciarCreadorVisualFormatosAdmin() {
  formatoVisualEstado.logo = { x: 6, y: 4, ancho: 18, dataUrl: "" };
  formatoVisualEstado.secciones = [crearSeccionFormatoVisual("campos"), crearSeccionFormatoVisual("texto")];
  renderizarCreadorVisualFormatosAdmin();
}

function configurarCreadorVisualFormatosAdmin() {
  const lienzo = document.getElementById("formatoVisualLienzo");
  const logo = document.getElementById("formatoVisualLogoPreview");
  const contenedor = document.getElementById("formatoVisualSecciones");
  const archivoLogo = document.getElementById("formatoManualLogo");
  const tamanoLogo = document.getElementById("formatoVisualLogoTamano");
  if (!lienzo || !logo || !contenedor) return;

  document.querySelectorAll("[data-agregar-seccion-formato]").forEach((boton) => {
    boton.addEventListener("click", () => {
      formatoVisualEstado.secciones.push(crearSeccionFormatoVisual(boton.dataset.agregarSeccionFormato));
      renderizarCreadorVisualFormatosAdmin();
    });
  });
  document.getElementById("btnLimpiarDisenoFormato")?.addEventListener("click", () => {
    if (confirm("¿Limpiar el diseño visual actual?")) reiniciarCreadorVisualFormatosAdmin();
  });
  contenedor.addEventListener("click", manejarAccionSeccionFormatoVisual);
  contenedor.addEventListener("input", manejarEdicionSeccionFormatoVisual);
  archivoLogo?.addEventListener("change", () => {
    const archivo = archivoLogo.files?.[0];
    if (!archivo) {
      formatoVisualEstado.logo.dataUrl = "";
      renderizarCreadorVisualFormatosAdmin();
      return;
    }
    const lector = new FileReader();
    lector.addEventListener("load", () => {
      formatoVisualEstado.logo.dataUrl = String(lector.result || "");
      renderizarCreadorVisualFormatosAdmin();
    });
    lector.readAsDataURL(archivo);
  });
  tamanoLogo?.addEventListener("input", () => {
    formatoVisualEstado.logo.ancho = Number(tamanoLogo.value) || 18;
    logo.style.width = `${formatoVisualEstado.logo.ancho}%`;
  });
  logo.addEventListener("pointerdown", (evento) => {
    if (logo.hidden) return;
    const rectLogo = logo.getBoundingClientRect();
    formatoVisualArrastreLogo = { offsetX: evento.clientX - rectLogo.left, offsetY: evento.clientY - rectLogo.top };
    logo.setPointerCapture?.(evento.pointerId);
    evento.preventDefault();
  });
  logo.addEventListener("pointermove", (evento) => {
    if (!formatoVisualArrastreLogo) return;
    const rect = lienzo.getBoundingClientRect();
    const x = ((evento.clientX - rect.left - formatoVisualArrastreLogo.offsetX) / rect.width) * 100;
    const y = ((evento.clientY - rect.top - formatoVisualArrastreLogo.offsetY) / rect.height) * 100;
    formatoVisualEstado.logo.x = Math.max(0, Math.min(100 - formatoVisualEstado.logo.ancho, x));
    formatoVisualEstado.logo.y = Math.max(0, Math.min(92, y));
    logo.style.left = `${formatoVisualEstado.logo.x}%`;
    logo.style.top = `${formatoVisualEstado.logo.y}%`;
  });
  const finalizarArrastre = () => { formatoVisualArrastreLogo = null; };
  logo.addEventListener("pointerup", finalizarArrastre);
  logo.addEventListener("pointercancel", finalizarArrastre);
  reiniciarCreadorVisualFormatosAdmin();
}

function normalizarIdFormatoManual(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function catalogoFormatosParaPaquetesAdmin() {
  const manuales = formatosManualesAdmin.map((formato) => ({
    id: formato.id,
    nombre: formato.nombre || formato.id,
    origen: "manual"
  }));
  const institucionales = FORMATOS_INSTITUCIONALES.map((formato) => ({
    id: formato.id,
    nombre: formato.nombre || formato.id,
    origen: "institucional"
  }));
  return [...manuales, ...institucionales].filter((formato, indice, lista) => lista.findIndex((item) => item.id === formato.id) === indice);
}

function poblarSelectoresCatalogoManualAdmin() {
  const selectorFormatos = document.getElementById("paqueteFormatoFormatos");
  const selectorUsuarios = document.getElementById("paqueteFormatoUsuarios");
  if (selectorFormatos) {
    selectorFormatos.innerHTML = catalogoFormatosParaPaquetesAdmin().map((formato) => `
      <option value="${escaparHTML(formato.id)}">${escaparHTML(formato.nombre)} · ${escaparHTML(formato.origen)}</option>
    `).join("");
  }
  if (selectorUsuarios) {
    selectorUsuarios.innerHTML = usuariosAdmin
      .filter((usuario) => usuario.id !== adminActual?.uid)
      .sort((a, b) => String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""), "es", { sensitivity: "base" }))
      .map((usuario) => `<option value="${escaparHTML(usuario.id)}">${escaparHTML(usuario.nombre || usuario.email || usuario.id)} · ${escaparHTML(usuario.rol || "sin rol")}</option>`)
      .join("");
  }
}

function renderizarCatalogoManualFormatosAdmin() {
  const contenedor = document.getElementById("listaCatalogoManualAdmin");
  if (!contenedor) return;
  const formatos = formatosManualesAdmin.map((formato) => `
    <article class="formato-manual-registro-admin">
      ${formato.logoUrl ? `<img src="${escaparHTML(formato.logoUrl)}" alt="Logo de ${escaparHTML(formato.nombre || formato.id)}">` : ""}
      <div>
        <h4>${escaparHTML(formato.nombre || formato.id)}</h4>
        <small>ID: ${escaparHTML(formato.id)} · Creado: ${escaparHTML(formatearFechaAdmin(formato.creadoEn))}</small>
        <p>${escaparHTML(formato.descripcion || "Sin descripción")}</p>
      </div>
    </article>
  `).join("");
  const paquetes = paquetesFormatosAdmin.map((paquete) => {
    const nombresUsuarios = (paquete.asignadoUserUids || []).map((uid) => usuariosAdmin.find((usuario) => usuario.id === uid)?.nombre || uid);
    return `
      <article class="formato-manual-registro-admin">
        <div>
          <h4>Paquete: ${escaparHTML(paquete.nombre || paquete.id)}</h4>
          <small>Formatos: ${escaparHTML((paquete.formatosIds || []).join(", ") || "Sin formatos")}</small>
          <p>${escaparHTML(paquete.descripcion || "Sin descripción")}</p>
          <small>Usuarios: ${escaparHTML(nombresUsuarios.join(", ") || "Sin asignación")}</small>
        </div>
      </article>
    `;
  }).join("");
  contenedor.innerHTML = formatos + paquetes || "<p>No hay formatos manuales ni paquetes creados.</p>";
}

async function cargarCatalogoManualFormatosAdmin() {
  const contenedor = document.getElementById("listaCatalogoManualAdmin");
  if (contenedor) contenedor.innerHTML = "<p>Cargando catálogo manual...</p>";
  try {
    const [snapFormatos, snapPaquetes] = await Promise.all([
      getDocs(collection(db, "formatosAdministrados")),
      getDocs(collection(db, "paquetesFormatos"))
    ]);
    formatosManualesAdmin = snapFormatos.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id), "es", { sensitivity: "base" }));
    paquetesFormatosAdmin = snapPaquetes.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
    poblarSelectoresCatalogoManualAdmin();
    renderizarCatalogoManualFormatosAdmin();
  } catch (error) {
    if (contenedor) contenedor.innerHTML = `<p class="admin-muted">No se pudo cargar el catálogo manual: ${escaparHTML(error.message)}</p>`;
  }
}

async function crearFormatoManualAdmin(evento) {
  evento.preventDefault();
  if (!adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) return;
  const id = normalizarIdFormatoManual(document.getElementById("formatoManualId")?.value);
  const nombre = document.getElementById("formatoManualNombre")?.value.trim() || "";
  const descripcion = document.getElementById("formatoManualDescripcion")?.value.trim() || "";
  const contenido = document.getElementById("formatoManualContenido")?.value.trim() || "";
  const archivo = document.getElementById("formatoManualLogo")?.files?.[0] || null;
  if (!id || !nombre || !contenido || !formatoVisualEstado.secciones.length) {
    alert("Completa el identificador, nombre y añade al menos una sección al formato.");
    return;
  }
  if (archivo && (!archivo.type.startsWith("image/") || archivo.size > 5 * 1024 * 1024)) {
    alert("El logo debe ser una imagen de máximo 5 MB.");
    return;
  }
  try {
    const existente = await getDoc(doc(db, "formatosAdministrados", id));
    if (existente.exists()) {
      alert("Ya existe un formato con ese identificador.");
      return;
    }
    let logoUrl = "";
    let logoPath = "";
    if (archivo) {
      const almacenamiento = await obtenerStorage();
      logoPath = `formatos-manuales/logos/${id}-${Date.now()}-${normalizarIdFormatoManual(archivo.name)}`;
      const logoRef = ref(almacenamiento, logoPath);
      await uploadBytes(logoRef, archivo, { contentType: archivo.type });
      logoUrl = await getDownloadURL(logoRef);
    }
    const ahora = new Date().toISOString();
    const disenoVisual = {
      version: 1,
      pagina: { tamano: "A4", orientacion: "vertical" },
      logo: { x: formatoVisualEstado.logo.x, y: formatoVisualEstado.logo.y, ancho: formatoVisualEstado.logo.ancho, url: logoUrl, path: logoPath },
      secciones: JSON.parse(JSON.stringify(formatoVisualEstado.secciones))
    };
    await setDoc(doc(db, "formatosAdministrados", id), { id, nombre, descripcion, contenido, disenoVisual, logoUrl, logoPath, activo: true, creadoEn: ahora, creadoPorUid: adminActual.uid, actualizadoEn: ahora });
    await registrarAuditoriaAdmin("crear_formato_manual_admin", "El administrador creó un formato manual visual.", { detalles: { formatoId: id, nombre, tieneLogo: Boolean(logoUrl), totalSecciones: disenoVisual.secciones.length } });
    evento.currentTarget.reset();
    reiniciarCreadorVisualFormatosAdmin();
    await cargarCatalogoManualFormatosAdmin();
    alert("Formato manual creado correctamente.");
  } catch (error) {
    await registrarAuditoriaAdmin("error_crear_formato_manual_admin", "No se pudo crear un formato manual.", { exito: false, detalles: { formatoId: id, error: resumenError(error) } });
    alert("No se pudo crear el formato: " + error.message);
  }
}

async function crearPaqueteFormatosAdmin(evento) {
  evento.preventDefault();
  if (!adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) return;
  const nombre = document.getElementById("paqueteFormatoNombre")?.value.trim() || "";
  const descripcion = document.getElementById("paqueteFormatoDescripcion")?.value.trim() || "";
  const formatosIds = [...(document.getElementById("paqueteFormatoFormatos")?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
  const asignadoUserUids = [...(document.getElementById("paqueteFormatoUsuarios")?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
  if (!nombre || !formatosIds.length || !asignadoUserUids.length) {
    alert("Selecciona nombre, al menos un formato y al menos un usuario.");
    return;
  }
  try {
    const paqueteId = `${normalizarIdFormatoManual(nombre)}_${Date.now()}`;
    const ahora = new Date().toISOString();
    await setDoc(doc(db, "paquetesFormatos", paqueteId), { id: paqueteId, nombre, descripcion, formatosIds, asignadoUserUids, creadoEn: ahora, creadoPorUid: adminActual.uid, actualizadoEn: ahora, activo: true });
    await Promise.all(asignadoUserUids.map((uid) => updateDoc(doc(db, "usuarios", uid), { paquetesFormatosAsignados: arrayUnion(paqueteId), formatosManualesAsignados: arrayUnion(...formatosIds), formatosManualesActualizadosEn: ahora, formatosManualesActualizadosPor: adminActual.uid })));
    await registrarAuditoriaAdmin("crear_paquete_formatos_admin", "El administrador creó y asignó manualmente un paquete de formatos.", { detalles: { paqueteId, formatosIds, asignadoUserUids } });
    evento.currentTarget.reset();
    await cargarCatalogoManualFormatosAdmin();
    alert("Paquete creado y asignado correctamente.");
  } catch (error) {
    await registrarAuditoriaAdmin("error_crear_paquete_formatos_admin", "No se pudo crear o asignar un paquete de formatos.", { exito: false, detalles: { error: resumenError(error) } });
    alert("No se pudo crear el paquete: " + error.message);
  }
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
  const instituciones = [...new Set(usuariosAdmin.filter(usuarioEsActorProfesionalFormato).map(institucionUsuarioFormato).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  selector.innerHTML = `<option value="">Todas las instituciones</option>` + instituciones.map((institucion) => `
    <option value="${escaparHTML(institucion)}">${escaparHTML(institucion)}</option>
  `).join("");
  selector.value = instituciones.includes(valorActual) ? valorActual : "";
}

function usuariosFiltradosFormatosAdmin() {
  const texto = normalizar(document.getElementById("filtroFormatosAdmin")?.value || "");
  const rolFiltro = normalizarRolAdmin(document.getElementById("filtroFormatosRolAdmin")?.value || "");
  const institucion = document.getElementById("filtroFormatosInstitucionAdmin")?.value || "";
  return usuariosAdmin.filter((usuario) => usuarioEsActorProfesionalFormato(usuario) || esAdministradorFormato(usuario)).filter((usuario) => {
    const esAdmin = esAdministradorFormato(usuario);
    const rolUsuario = normalizarRolAdmin(usuario.rol || usuario.role || "");
    const coincideRol = !rolFiltro || (rolFiltro === "admin" ? esAdmin : rolFiltro === "otros" ? !esAdmin && !["medico", "medica", "psicologo", "psicologa"].includes(rolUsuario) : rolUsuario.includes(rolFiltro));
    const institucionUsuario = institucionUsuarioFormato(usuario);
    const coincideInstitucion = !institucion || institucionUsuario === institucion;
    const coincideTexto = !texto || normalizar([
      usuario.nombre,
      usuario.email,
      usuario.cedulaProfesional,
      usuario.cedula,
      usuario.rol,
      usuario.id,
      institucionUsuario
    ].join(" ")).includes(texto);
    return coincideRol && coincideInstitucion && coincideTexto;
  });
}

function renderizarFormatosAdmin() {
  const contenedor = document.getElementById("listaFormatosAdmin");
  if (!contenedor) return;

  const formatosControlables = FORMATOS_INSTITUCIONALES.filter((formato) => formato.requiereAutorizacion);
  const usuarios = usuariosFiltradosFormatosAdmin();

  if (!usuarios.length) {
    contenedor.innerHTML = "<p>No hay medicos o perfiles medicos compatibles con esos filtros.</p>";
    return;
  }

  contenedor.innerHTML = usuarios.map((usuario) => {
    const permisos = permisosFormatosDesdeUsuario(usuario);
    const esAdmin = esAdministradorFormato(usuario);
    const cuentaActiva = usuario.activo !== false && usuario.active !== false && !["desactivado", "suspendido", "eliminado", "disabled", "suspended"].includes(normalizarRolAdmin(usuario.estado || usuario.status || ""));
    const institucionTexto = institucionUsuarioFormato(usuario);
    const controles = formatosControlables.map((formato) => {
      const autorizado = esAdmin ? cuentaActiva : permisos[formato.id] === true;
      const reservadoParaOtroUsuario = Boolean(formato.authorizedUserUid && usuario.id !== formato.authorizedUserUid && !esAdmin);
      return `
        <div class="usuario-admin-meta formato-admin-control">
          <span>${escaparHTML(formato.nombre)}</span>
          <span>${esAdmin ? (cuentaActiva ? "Acceso global" : "Cuenta desactivada") : (reservadoParaOtroUsuario ? `Reservado para ${formato.authorizedUserLabel || "un usuario autorizado"}` : (autorizado ? "Permiso individual" : "Sin acceso"))}</span>
          ${esAdmin
            ? "<small>El acceso global proviene del rol de administrador y no puede retirarse desde permisos individuales.</small>"
            : reservadoParaOtroUsuario
              ? `<small>Este paquete solo puede otorgarse a ${escaparHTML(formato.authorizedUserLabel || "el usuario autorizado")}.</small>`
              : `<button type="button" data-toggle-formato-admin="${escaparHTML(usuario.id)}" data-formato="${escaparHTML(formato.id)}" data-valor="${autorizado ? "false" : "true"}">${autorizado ? "Revocar permiso" : "Otorgar permiso"}</button>`}
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
            <span>${escaparHTML(esAdmin ? "Administrador" : etiquetaRolUsuario(usuario.rol || "sin_rol"))}${esAdmin && !cuentaActiva ? " · Cuenta desactivada" : ""}</span>
            ${esAdmin && cuentaActiva ? "<span>Acceso global a todos los formatos</span>" : ""}
            <span>Institucion: ${escaparHTML(institucionTexto)}</span>
            <span>Cedula: ${escaparHTML(usuario.cedulaProfesional || usuario.cedula || "Sin registro")}</span>
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
  usuarios.filter((usuario) => esAdministradorFormato(usuario)).forEach((usuario) => {
    registrarAuditoriaAdmin("consultar_acceso_global_formatos", "Se consultó el acceso global de un administrador a formatos.", {
      usuarioObjetivoUid: usuario.id,
      origenPermiso: "rol_admin",
      cuentaActiva: usuario.activo !== false && usuario.active !== false
    }).catch(() => {});
  });
}

async function alternarFormatoUsuarioAdmin(evento) {
  const boton = evento.currentTarget;
  const uid = boton.dataset.toggleFormatoAdmin || "";
  const formato = boton.dataset.formato || "";
  const valor = boton.dataset.valor === "true";
  const usuario = usuariosAdmin.find((item) => item.id === uid);
  const definicionFormato = FORMATOS_INSTITUCIONALES.find((item) => item.id === formato);

  if (!uid || !formato || !usuario) return;
  if (esAdministradorFormato(usuario)) {
    console.debug("[CentroControl:Formatos]", { uid: usuario.id, rol: "admin", formatoId: formato, action: "toggle", result: "global-access-preserved" });
    alert("Este usuario conserva acceso a todos los formatos por su rol de administrador.");
    return;
  }
  if (definicionFormato?.authorizedUserUid && uid !== definicionFormato.authorizedUserUid) {
    alert(`Este paquete está reservado para ${definicionFormato.authorizedUserLabel || "el usuario autorizado"}.`);
    return;
  }
  if (!usuarioEsActorProfesionalFormato(usuario)) {
    alert("Los permisos institucionales de formatos solo pueden otorgarse a medicos o perfiles medicos compatibles.");
    return;
  }

  const motivo = prompt(`Motivo administrativo para ${valor ? "otorgar" : "revocar"} este permiso:`, valor ? "Autorizacion institucional vigente" : "Revocacion administrativa") || "";
  const expiraEn = valor ? (prompt("Fecha de expiracion opcional (AAAA-MM-DD). Deja vacio para nunca expirar:", "") || "") : "";
  boton.disabled = true;
  await updateDoc(doc(db, "usuarios", uid), {
    [`permisosFormatos.${formato}`]: valor,
    [`formatPermissionMetadata.${formato}`]: {
      status: valor ? "active" : "revoked",
      reason: motivo,
      expiresAt: expiraEn,
      updatedAt: new Date().toISOString(),
      updatedBy: adminActual?.uid || ""
    },
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
  const definicionFormato = FORMATOS_INSTITUCIONALES.find((item) => item.id === formato);
  if (definicionFormato?.authorizedUserUid) {
    alert(`El paquete ${definicionFormato.nombre} solo puede administrarse desde el perfil de ${definicionFormato.authorizedUserLabel || "su usuario autorizado"}.`);
    return;
  }
  const visibles = usuariosFiltradosFormatosAdmin();
  const usuarios = visibles.filter((usuario) => !esAdministradorFormato(usuario));
  const administradoresOmitidos = visibles.length - usuarios.length;
  if (!usuarios.length) {
    alert(administradoresOmitidos ? "Los usuarios administradores conservan acceso global y no se modifican con casillas individuales." : "No hay usuarios no administradores visibles para actualizar.");
    return;
  }

  const accion = valor ? "autorizar" : "retirar";
  const confirmar = confirm(`¿Deseas ${accion} el formato ${formato} a ${usuarios.length} usuario(s) visibles?`);
  if (!confirmar) return;
  const motivo = prompt(`Motivo administrativo para ${accion} este paquete:`, valor ? "Autorizacion institucional vigente" : "Revocacion administrativa") || "";
  const expiraEn = valor ? (prompt("Fecha de expiracion opcional (AAAA-MM-DD). Deja vacio para nunca expirar:", "") || "") : "";

  await Promise.all(usuarios.map((usuario) => updateDoc(doc(db, "usuarios", usuario.id), {
    [`permisosFormatos.${formato}`]: valor,
    [`formatPermissionMetadata.${formato}`]: {
      status: valor ? "active" : "revoked",
      reason: motivo,
      expiresAt: expiraEn,
      updatedAt: new Date().toISOString(),
      updatedBy: adminActual?.uid || ""
    },
    formatosInstitucionalesActualizadosEn: new Date().toISOString(),
    formatosInstitucionalesActualizadoPor: adminActual?.uid || ""
  })));

  await registrarAuditoriaAdmin(
    valor ? "autorizar_formato_institucional_masivo" : "retirar_formato_institucional_masivo",
    `${valor ? "Autorizo" : "Retiro"} formato ${formato} a ${usuarios.length} usuario(s) visibles`,
    { totalUsuarios: usuarios.length, administradoresOmitidos }
  );
  await cargarUsuariosAdmin();
}
function actualizarResumenUsuariosVista(usuarios = []) {
  ponerTexto("usuariosVistaTotal", usuarios.length);
  ponerTexto("usuariosVistaPacientes", usuarios.filter((usuario) => usuario.rol === "paciente").length);
  ponerTexto("usuariosVistaMedicos", usuarios.filter((usuario) => usuario.rol === "medico").length);
  ponerTexto("usuariosVistaEnfermeriaSaludMental", usuarios.filter((usuario) => usuario.rol === ROL_ENFERMERIA_SALUD_MENTAL).length);
  ponerTexto("usuariosVistaPsicologos", usuarios.filter((usuario) => usuario.rol === "psicologo").length);
  ponerTexto("usuariosVistaAdmin", usuarios.filter((usuario) => usuario.rol === "admin").length);
}

function etiquetaRolUsuario(rol = "") {
  return etiquetaRolClinico(rol);
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
  return `<option value="${rol}" ${rolActual === rol ? "selected" : ""}>${escaparHTML(etiquetaRolUsuario(rol))}</option>`;
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

  if (usuarioEsProfesionalTipoMedico(usuario.rol) || usuario.rol === "psicologo") {
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
    .sort((a, b) => obtenerNombrePacienteParaMostrar(a).localeCompare(obtenerNombrePacienteParaMostrar(b), "es", { sensitivity: "base" }));

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
      textoBusquedaPaciente(paciente),
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
            <h3>${escaparHTML(obtenerNombrePacienteParaMostrar(paciente) || "Paciente sin nombre")}</h3>
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
    const fecha = nota.fecha ? new Date(nota.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false }) : "Sin fecha";
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
      reporte.url,
      reporte.recursoTipo,
      reporte.recursoId,
      reporte.pacienteUid,
      reporte.pacienteNombre,
      reporte.motivoSolicitud
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
      ? reporte.fechaCreacion.toDate().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })
      : reporte.fechaISO
        ? new Date(reporte.fechaISO).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })
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
        ${detalleSolicitudEliminacionHTML(reporte)}
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
    nueva_funcionalidad: "Nueva funcionalidad",
    solicitud_eliminacion: "Solicitud de eliminacion"
  };

  return etiquetas[tipo] || "Reporte";
}

function detalleSolicitudEliminacionHTML(reporte = {}) {
  if (reporte.tipo !== "solicitud_eliminacion" && reporte.categoria !== "solicitud_eliminacion") return "";

  const etiquetas = {
    nota_medica: "Nota medica",
    paciente: "Paciente",
    estudio: "Estudio",
    tratamiento: "Tratamiento",
    usuario: "Usuario"
  };
  const recurso = etiquetas[reporte.recursoTipo] || reporte.recursoTipo || "Registro";
  const esSolicitudPaciente = reporte.recursoTipo === "paciente" && reporte.pacienteUid;
  const esSolicitudNota = reporte.recursoTipo === "nota_medica" && reporte.pacienteUid && reporte.recursoId;

  return `
    <div class="reporte-usuario-detalle">
      <div>
        <strong>Datos de la solicitud</strong>
        <span>${escaparHTML(recurso)}</span>
      </div>
      <div class="reporte-usuario-grid">
        <span>ID del recurso: ${escaparHTML(reporte.recursoId || "Sin ID")}</span>
        <span>Paciente: ${escaparHTML(reporte.pacienteNombre || "Sin nombre")}</span>
        <span>UID paciente: ${escaparHTML(reporte.pacienteUid || "Sin UID")}</span>
        <span>Motivo: ${escaparHTML(reporte.motivoSolicitud || "No indicado")}</span>
      </div>
      ${esSolicitudPaciente ? `<button type="button" class="boton-peligro boton-eliminar-paciente-solicitud" onclick="eliminarPacienteDesdeSolicitudAdmin('${escaparHTML(reporte.id)}')">🗑 Eliminar paciente</button>` : ""}
      ${esSolicitudNota ? `<button type="button" class="boton-peligro boton-eliminar-nota-solicitud" data-eliminar-nota-solicitud="${escaparHTML(reporte.id)}" onclick="eliminarNotaDesdeSolicitudAdmin('${escaparHTML(reporte.id)}')">🗑 Eliminar nota</button>` : ""}
    </div>
  `;
}

function solicitarConfirmacionEliminacionPacienteAdmin(pacienteNombre = "este paciente") {
  const dialogo = document.getElementById("dialogoEliminarPacienteAdmin");
  if (!dialogo) return Promise.resolve(confirm(`Esta acción eliminará permanentemente el paciente ${pacienteNombre} y toda su información clínica.\n\nEsta operación no puede deshacerse.\n\n¿Desea continuar?`));
  dialogo.querySelector("[data-paciente-nombre]").textContent = pacienteNombre;
  dialogo.showModal();
  return new Promise((resolve) => {
    const cerrar = (resultado) => { dialogo.close(); resolve(resultado); };
    dialogo.querySelector("[data-confirmar-eliminacion]").onclick = () => cerrar(true);
    dialogo.querySelector("[data-cancelar-eliminacion]").onclick = () => cerrar(false);
    dialogo.oncancel = () => cerrar(false);
  });
}

function solicitarConfirmacionEliminacionNotaAdmin(pacienteNombre = "este paciente") {
  const dialogo = document.getElementById("dialogoEliminarNotaAdmin");
  if (!dialogo) return Promise.resolve(confirm(`Esta acción eliminará permanentemente la nota seleccionada del expediente de ${pacienteNombre}.\n\nEsta operación no puede deshacerse.\n\n¿Desea continuar?`));
  dialogo.querySelector("[data-nota-paciente-nombre]").textContent = pacienteNombre;
  dialogo.showModal();
  return new Promise((resolve) => {
    const cerrar = (resultado) => { dialogo.close(); resolve(resultado); };
    dialogo.querySelector("[data-confirmar-eliminacion-nota]").onclick = () => cerrar(true);
    dialogo.querySelector("[data-cancelar-eliminacion-nota]").onclick = () => cerrar(false);
    dialogo.oncancel = () => cerrar(false);
  });
}

window.eliminarPacienteDesdeSolicitudAdmin = async function(solicitudId) {
  const solicitud = reportesUsuariosAdmin.find((item) => item.id === solicitudId);
  const uidPaciente = solicitud?.pacienteUid || "";
  if (!solicitud || !uidPaciente || solicitud.recursoTipo !== "paciente") return;
  if (!adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) {
    alert("No tienes permisos administrativos para ejecutar esta acción.");
    return;
  }
  const nombre = solicitud.pacienteNombre || solicitud.usuarioRegistrado?.nombre || "este paciente";
  if (!(await solicitarConfirmacionEliminacionPacienteAdmin(nombre))) return;
  const boton = document.querySelector(`[onclick="eliminarPacienteDesdeSolicitudAdmin('${solicitudId}')"]`);
  if (boton) { boton.disabled = true; boton.textContent = "Eliminando…"; }
  try {
    const eliminar = httpsCallable(await obtenerFunctions(), "eliminarPacienteDefinitivamente");
    await eliminar({ pacienteUid: uidPaciente, pacienteNombre: nombre, solicitudId, motivo: solicitud.motivoSolicitud || "" });
    reportesUsuariosAdmin = reportesUsuariosAdmin.filter((item) => item.pacienteUid !== uidPaciente && item.id !== solicitudId);
    pacientesAdmin = pacientesAdmin.filter((item) => item.id !== uidPaciente);
    delete notasPorPaciente[uidPaciente];
    renderizarReportesUsuariosAdmin();
    renderizarPacientesAdmin();
    await cargarResumen();
    await cargarUsuariosAdmin();
    await cargarAuditoria();
    alert("Paciente eliminado correctamente.");
  } catch (error) {
    if (boton) { boton.disabled = false; boton.textContent = "🗑 Eliminar paciente"; }
    alert("No se pudo eliminar el paciente: " + error.message);
  }
};

window.eliminarNotaDesdeSolicitudAdmin = async function(solicitudId) {
  const solicitud = reportesUsuariosAdmin.find((item) => item.id === solicitudId);
  const uidPaciente = solicitud?.pacienteUid || "";
  const notaId = solicitud?.recursoId || "";
  if (!solicitud || !uidPaciente || !notaId || solicitud.recursoTipo !== "nota_medica") return;
  if (!adminActual || !(await usuarioPuedeAccederAdmin(adminActual)).permitido) {
    alert("No tienes permisos administrativos para ejecutar esta acción.");
    return;
  }

  const nombre = solicitud.pacienteNombre || solicitud.usuarioRegistrado?.nombre || "este paciente";
  if (!(await solicitarConfirmacionEliminacionNotaAdmin(nombre))) return;
  const boton = [...document.querySelectorAll("[data-eliminar-nota-solicitud]")]
    .find((item) => item.dataset.eliminarNotaSolicitud === solicitudId);
  if (boton) { boton.disabled = true; boton.textContent = "Eliminando…"; }

  try {
    const eliminar = httpsCallable(await obtenerFunctions(), "eliminarNotaDesdeSolicitud");
    const respuesta = await eliminar({ solicitudId });
    const resultado = respuesta?.data || {};
    reportesUsuariosAdmin = reportesUsuariosAdmin.filter((item) => item.id !== solicitudId);
    if (Array.isArray(notasPorPaciente[uidPaciente])) {
      const idsEliminados = new Set([notaId, resultado.notaId, resultado.notaIdOriginal].filter(Boolean));
      notasPorPaciente[uidPaciente] = notasPorPaciente[uidPaciente]
        .filter((nota) => !idsEliminados.has(nota.id));
    }
    renderizarReportesUsuariosAdmin();
    renderizarPacientesAdmin();
    await Promise.all([cargarResumen(), cargarAuditoria()]);
    alert("Nota eliminada correctamente.");
  } catch (error) {
    if (boton) { boton.disabled = false; boton.textContent = "🗑 Eliminar nota"; }
    alert("No se pudo eliminar la nota: " + error.message);
  }
};

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
      ? new Date(evento.fechaTexto).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })
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
  return String(valor).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
