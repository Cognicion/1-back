import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario
} from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";
import {
  agregarContactoMensaje,
  archivarConversacionMensaje,
  buscarUsuariosParaMensajes,
  eliminarConversacionMensaje,
  listarAdminsParaMensajes,
  listarContactosMensajes,
  listarConversacionesMensajes,
  listarMensajesConversacion,
  listarUsuariosParaMensajes,
  marcarMensajesConversacionVistos,
  obtenerOCrearConversacion,
  enviarMensajeConversacion
} from "./services/mensajes.js";

aplicarAparienciaGuardada();
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

let avisosDashboardActuales = [];
let avisosLeidosDashboard = new Set();
let usuarioDashboardActual = null;
let rolDashboardActual = "";
let usuariosMensajesDashboard = [];
let contactosMensajesDashboard = [];
let conversacionesMensajesDashboard = [];
let conversacionActivaDashboard = null;
let mensajesConversacionActiva = [];
const CLAVE_LECTURAS_AVISOS_DASHBOARD = "cognicion_lecturas_avisos_dashboard";
const CLAVE_LECTURAS_RESPUESTAS_REPORTES = "cognicion_lecturas_respuestas_reportes";
const CLAVE_ESTADO_AVISOS_DASHBOARD = "cognicion_estado_avisos_dashboard";
window.alternarModuloAvisos = function(forzarAbierto = null) {
  const modulo = document.getElementById("avisosDashboardModulo");
  const boton = document.getElementById("btnToggleAvisosDashboard");
  if (!modulo) return;
  const debeAbrir = forzarAbierto === null ? modulo.classList.contains("colapsado") : Boolean(forzarAbierto);
  modulo.classList.toggle("colapsado", !debeAbrir);
  boton?.setAttribute("aria-expanded", String(debeAbrir));
  if (boton) boton.textContent = debeAbrir ? "Contraer" : "Expandir";
};

window.alternarMensajes = async function(forzarAbierto = null) {
  const panel = document.getElementById("mensajesPanel");
  const boton = document.getElementById("mensajesButton");
  if (!panel) return;

  const abrir = forzarAbierto === null ? !panel.classList.contains("abierto") : Boolean(forzarAbierto);
  panel.classList.toggle("abierto", abrir);
  panel.setAttribute("aria-hidden", String(!abrir));
  boton?.setAttribute("aria-expanded", String(abrir));

  if (abrir) {
    await cargarDatosMensajesDashboard();
    renderizarConversacionesDashboard();
  }
};

window.alternarNotificaciones = function() {
  const dropdown = document.getElementById("notificationsDropdown");
  const boton = document.getElementById("notificationsButton");
  const panelAvisos = document.getElementById("avisosDashboardModulo");
  const abierto = !panelAvisos?.classList.contains("abierto");

  dropdown?.classList.remove("abierto");
  dropdown?.setAttribute("aria-hidden", "true");
  boton?.setAttribute("aria-expanded", String(Boolean(abierto)));
  panelAvisos?.classList.toggle("abierto", abierto);
  panelAvisos?.classList.remove("colapsado");
  panelAvisos?.setAttribute("aria-hidden", String(!abierto));
};

document.addEventListener("click", (evento) => {
  const panelAvisos = document.getElementById("avisosDashboardModulo");
  const botonAvisos = document.getElementById("notificationsButton");
  if (!panelAvisos?.classList.contains("abierto")) return;
  if (panelAvisos.contains(evento.target) || botonAvisos?.contains(evento.target)) return;
  panelAvisos.classList.remove("abierto");
  panelAvisos.setAttribute("aria-hidden", "true");
  botonAvisos?.setAttribute("aria-expanded", "false");
});

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
  if (evento.key === "Escape") {
    window.cerrarProximamente();
    window.alternarMensajes?.(false);
    document.getElementById("avisosDashboardModulo")?.classList.remove("abierto");
    document.getElementById("avisosDashboardModulo")?.setAttribute("aria-hidden", "true");
    document.getElementById("notificationsButton")?.setAttribute("aria-expanded", "false");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const datos = await obtenerUsuario(user.uid);
  await sincronizarAparienciaUsuario(user.uid);
  usuarioDashboardActual = { uid: user.uid, email: user.email || "", nombre: datos?.nombre || user.email || "", rol: datos?.rol || "" };
  const rolUsuario = String(datos?.rol || "").toLowerCase().trim();
  rolDashboardActual = rolUsuario;

  const tarjetaSofia = document.getElementById("tarjetaSofia");

  if (tarjetaSofia && rolUsuario === "admin") {
    tarjetaSofia.style.display = "";
  }

  if (datos) {
    document.getElementById("bienvenida").innerText =
      "Bienvenido, " + datos.nombre;
  } else {
    document.getElementById("bienvenida").innerText =
      "Bienvenido";
  }

  await cargarAvisosDashboard(rolUsuario, user.uid);
  await cargarDatosMensajesDashboard();
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

async function obtenerLecturasAvisosDashboard(avisos = [], uidUsuario = "") {
  const lecturasLocales = cargarLecturasLocalesAvisosDashboard();
  const lecturas = await Promise.all(avisos.map(async (aviso) => {
    if (lecturasLocales[uidUsuario]?.[aviso.id]) return [aviso.id, true];

    if (aviso.origen === "respuesta_reporte") {
      return [aviso.id, false];
    }

    const lecturaEnDocumento = Boolean(aviso.lecturasUsuarios?.[uidUsuario]?.leido);
    if (lecturaEnDocumento) return [aviso.id, true];

    try {
      const snap = await getDoc(doc(db, "avisosGlobales", aviso.id, "lecturas", uidUsuario));
      return [aviso.id, snap.exists()];
    } catch (error) {
      console.warn("No se pudo revisar lectura de aviso:", aviso.id, error);
      return [aviso.id, false];
    }
  }));

  return new Set(lecturas.filter(([, leido]) => leido).map(([id]) => id));
}

function cargarObjetoLocalDashboard(clave = "") {
  try {
    const datos = JSON.parse(localStorage.getItem(clave) || "{}");
    return datos && typeof datos === "object" ? datos : {};
  } catch (error) {
    return {};
  }
}

function cargarLecturasLocalesAvisosDashboard() {
  const lecturasGenerales = cargarObjetoLocalDashboard(CLAVE_LECTURAS_AVISOS_DASHBOARD);
  const lecturasRespuestas = cargarObjetoLocalDashboard(CLAVE_LECTURAS_RESPUESTAS_REPORTES);
  const combinadas = { ...lecturasRespuestas };

  Object.entries(lecturasGenerales).forEach(([uid, lecturas]) => {
    combinadas[uid] = {
      ...(combinadas[uid] || {}),
      ...(lecturas && typeof lecturas === "object" ? lecturas : {})
    };
  });

  return combinadas;
}

function guardarLecturaLocalAvisoDashboard(uidUsuario = "", idAviso = "") {
  if (!uidUsuario || !idAviso) return;
  const datos = cargarObjetoLocalDashboard(CLAVE_LECTURAS_AVISOS_DASHBOARD);
  datos[uidUsuario] = {
    ...(datos[uidUsuario] || {}),
    [idAviso]: new Date().toISOString()
  };
  localStorage.setItem(CLAVE_LECTURAS_AVISOS_DASHBOARD, JSON.stringify(datos));
}

function guardarLecturaLocalRespuestaReporte(uidUsuario = "", idAviso = "") {
  guardarLecturaLocalAvisoDashboard(uidUsuario, idAviso);
}

function estadosLocalesAvisosDashboard() {
  return cargarObjetoLocalDashboard(CLAVE_ESTADO_AVISOS_DASHBOARD);
}

function guardarEstadoLocalAvisoDashboard(idAviso = "", cambios = {}) {
  if (!idAviso || !usuarioDashboardActual?.uid) return;
  const estados = estadosLocalesAvisosDashboard();
  const uid = usuarioDashboardActual.uid;
  estados[uid] = {
    ...(estados[uid] || {}),
    [idAviso]: {
      ...(estados[uid]?.[idAviso] || {}),
      ...cambios,
      actualizadoEn: new Date().toISOString()
    }
  };
  localStorage.setItem(CLAVE_ESTADO_AVISOS_DASHBOARD, JSON.stringify(estados));
}

function avisoOcultoParaUsuarioDashboard(aviso = {}) {
  const estado = estadosLocalesAvisosDashboard()[usuarioDashboardActual?.uid]?.[aviso.id] || {};
  return Boolean(estado.archivado || estado.eliminado);
}

function renderizarAvisosDashboard() {
  const contenedor = document.getElementById("listaAvisosDashboard");
  const badge = document.getElementById("notificationBadge");
  if (!contenedor) return;

  const avisosVisibles = avisosDashboardActuales.filter((aviso) => !avisoOcultoParaUsuarioDashboard(aviso));
  const noLeidos = avisosVisibles.filter((aviso) => !avisosLeidosDashboard.has(aviso.id));
  if (badge) {
    badge.textContent = noLeidos.length;
    badge.style.display = noLeidos.length ? "inline-flex" : "none";
  }

  if (!avisosVisibles.length) {
    contenedor.innerHTML = `<article class="aviso-dashboard-item"><strong>Sin avisos nuevos</strong><p>Cuando haya comunicados o notificaciones relevantes apareceran aqui.</p></article>`;
    return;
  }

  contenedor.innerHTML = avisosVisibles.map((aviso) => {
    const leido = avisosLeidosDashboard.has(aviso.id);
    return `
      <article class="aviso-dashboard-item ${leido ? "leido" : "no-leido"}">
        <div class="aviso-dashboard-top">
          <strong>${escaparHTML(aviso.titulo || "Aviso")}</strong>
          <span>${leido ? "Leido" : "Nuevo"}</span>
        </div>
        <p>${escaparHTML(aviso.mensaje || aviso.descripcion || "")}</p>
        <span class="aviso-dashboard-meta">${escaparHTML(textoDestinatarioAvisoDashboard(aviso))} · ${escaparHTML(aviso.creadoEn || "")}</span>
        <div class="card-actions aviso-acciones">
          <button type="button" class="ghost-button mini" ${leido ? "disabled" : ""} data-marcar-aviso-leido="${escaparHTML(aviso.id)}">
            ${leido ? "Ya leido" : "Marcar como leido"}
          </button>
          <button type="button" class="ghost-button mini" data-archivar-aviso-dashboard="${escaparHTML(aviso.id)}">Archivar</button>
          <button type="button" class="ghost-button mini" data-eliminar-aviso-dashboard="${escaparHTML(aviso.id)}">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");

}

async function cargarRespuestasReportesComoAvisos(uidUsuario = "") {
  if (!uidUsuario) return [];

  try {
    const qReportes = query(collection(db, "reportesUsuarios"), where("usuarioUid", "==", uidUsuario));
    const snap = await getDocs(qReportes);
    const reportes = snap.docs.map((docReporte) => ({ id: docReporte.id, ...docReporte.data() }));
    const respuestasPorReporte = await Promise.all(reportes.map(async (reporte) => {
      const respuestas = [];
      if (reporte.respuestaAdminUltima?.mensaje) respuestas.push(reporte.respuestaAdminUltima);

      try {
        const snapRespuestas = await getDocs(collection(db, "reportesUsuarios", reporte.id, "respuestas"));
        snapRespuestas.docs.forEach((docRespuesta) => respuestas.push({ id: docRespuesta.id, ...docRespuesta.data() }));
      } catch (error) {
        console.warn("No se pudieron leer respuestas del reporte:", reporte.id, error);
      }

      const respuestasUnicas = new Map();
      respuestas.forEach((respuesta) => {
        const clave = `${respuesta.fechaISO || ""}_${respuesta.mensaje || ""}`;
        if (respuesta.mensaje && !respuestasUnicas.has(clave)) respuestasUnicas.set(clave, respuesta);
      });

      return Array.from(respuestasUnicas.values()).map((respuesta) => ({
        reporte,
        respuesta
      }));
    }));

    return respuestasPorReporte.flat().map(({ reporte, respuesta }) => ({
      id: `respuesta_reporte_${reporte.id}_${respuesta.fechaISO || respuesta.id || reporte.respondidoEn || ""}`,
      idAviso: `respuesta_reporte_${reporte.id}`,
      titulo: `Respuesta a tu reporte: ${reporte.titulo || "Reporte enviado"}`,
      mensaje: respuesta.mensaje || "",
      destinatarioTipo: "usuario",
      destinatarioUid: uidUsuario,
      activo: true,
      origen: "respuesta_reporte",
      reporteId: reporte.id,
      creadoEn: respuesta.fechaISO || reporte.respondidoEn || reporte.fechaActualizacionISO || "",
      adminNombre: respuesta.adminNombre || "Administrador"
    }));
  } catch (error) {
    console.warn("No se pudieron cargar respuestas de reportes como avisos:", error);
    return [];
  }
}

async function marcarAvisoLeidoDashboard(idAviso, boton = null) {
  if (!idAviso || !usuarioDashboardActual?.uid) return;
  const aviso = avisosDashboardActuales.find((item) => item.id === idAviso);

  const lectura = {
    uid: usuarioDashboardActual.uid,
    nombre: usuarioDashboardActual.nombre || "",
    email: usuarioDashboardActual.email || "",
    rol: rolDashboardActual || "",
    leido: true,
    leidoEn: new Date().toISOString()
  };

  if (boton) {
    boton.disabled = true;
    boton.textContent = "Guardando...";
  }

  if (aviso?.origen === "respuesta_reporte") {
    guardarLecturaLocalRespuestaReporte(usuarioDashboardActual.uid, idAviso);
    avisosLeidosDashboard.add(idAviso);
    renderizarAvisosDashboard();
    return;
  }

  const escrituraSubcoleccion = setDoc(
    doc(db, "avisosGlobales", idAviso, "lecturas", usuarioDashboardActual.uid),
    lectura,
    { merge: true }
  );

  const escrituraDocumento = updateDoc(doc(db, "avisosGlobales", idAviso), {
    [`lecturasUsuarios.${usuarioDashboardActual.uid}`]: lectura
  });

  const resultados = await Promise.allSettled([escrituraSubcoleccion, escrituraDocumento]);
  const exitos = resultados.filter((resultado) => resultado.status === "fulfilled");

  if (!exitos.length) {
    console.warn("No se pudo marcar el aviso en Firestore; se guardara lectura local:", resultados.map((resultado) => resultado.reason));
    guardarLecturaLocalAvisoDashboard(usuarioDashboardActual.uid, idAviso);
    avisosLeidosDashboard.add(idAviso);
    renderizarAvisosDashboard();
    return;
  }

  avisosLeidosDashboard.add(idAviso);
  avisosDashboardActuales = avisosDashboardActuales.map((aviso) => aviso.id === idAviso
    ? {
        ...aviso,
        lecturasUsuarios: {
          ...(aviso.lecturasUsuarios || {}),
          [usuarioDashboardActual.uid]: lectura
        }
      }
    : aviso);
  renderizarAvisosDashboard();
}


document.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-marcar-aviso-leido]");
  if (!boton) return;
  evento.preventDefault();
  evento.stopPropagation();
  marcarAvisoLeidoDashboard(boton.dataset.marcarAvisoLeido, boton);
});

document.addEventListener("click", (evento) => {
  const botonArchivar = evento.target.closest("[data-archivar-aviso-dashboard]");
  const botonEliminar = evento.target.closest("[data-eliminar-aviso-dashboard]");
  if (!botonArchivar && !botonEliminar) return;
  evento.preventDefault();
  evento.stopPropagation();

  const idAviso = botonArchivar?.dataset.archivarAvisoDashboard || botonEliminar?.dataset.eliminarAvisoDashboard || "";
  if (!idAviso) return;
  if (botonEliminar && !confirm("Eliminar este aviso de tu bandeja?")) return;

  guardarEstadoLocalAvisoDashboard(idAviso, botonEliminar
    ? { eliminado: true, archivado: false }
    : { archivado: true, eliminado: false });
  renderizarAvisosDashboard();
});

async function cargarAvisosDashboard(rolUsuario, uidUsuario) {
  const contenedor = document.getElementById("listaAvisosDashboard");
  if (!contenedor) return;
  contenedor.innerHTML = "<p>Cargando avisos...</p>";

  try {
    const qAvisos = query(collection(db, "avisosGlobales"), orderBy("creadoEn", "desc"), limit(30));
    const [snap, respuestasReportes] = await Promise.all([
      getDocs(qAvisos).catch((error) => {
        console.warn("No se pudieron cargar avisosGlobales:", error);
        return { docs: [] };
      }),
      cargarRespuestasReportesComoAvisos(uidUsuario)
    ]);
    avisosDashboardActuales = [
      ...snap.docs
      .map((docAviso) => ({ id: docAviso.id, ...docAviso.data() }))
      .filter((aviso) => !aviso.eliminado && !aviso.archivado && aviso.activo !== false && avisoVisibleParaUsuario(aviso, rolUsuario, uidUsuario)),
      ...respuestasReportes
    ]
      .sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")))
      .slice(0, 8);

    avisosLeidosDashboard = await obtenerLecturasAvisosDashboard(avisosDashboardActuales, uidUsuario);
    renderizarAvisosDashboard();
  } catch (error) {
    console.error("Error al cargar avisos:", error);
    contenedor.innerHTML = `<article class="aviso-dashboard-item"><strong>Avisos no disponibles</strong><p>No se pudieron cargar los avisos por el momento.</p></article>`;
  }
}

function otroParticipanteConversacion(conversacion = {}) {
  const participantes = conversacion.participantes || {};
  const otroUid = (conversacion.participantIds || Object.keys(participantes)).find((uid) => uid !== usuarioDashboardActual?.uid);
  return participantes[otroUid] || { uid: otroUid, nombre: "Contacto" };
}

function actualizarBadgeMensajesDashboard() {
  const badge = document.getElementById("mensajesBadge");
  if (!badge || !usuarioDashboardActual?.uid) return;

  const noLeidas = conversacionesMensajesDashboard.filter((conversacion) => {
    if (conversacion.ultimoMensajePor === usuarioDashboardActual.uid) return false;
    const leidoEn = conversacion.lecturasUsuarios?.[usuarioDashboardActual.uid]?.leidoEn || "";
    return !leidoEn || String(leidoEn) < String(conversacion.ultimoMensajeEn || "");
  }).length;

  badge.textContent = noLeidas;
  badge.style.display = noLeidas ? "inline-flex" : "none";
}

function integrarConversacionLocal(conversacion) {
  if (!conversacion?.id) return;
  conversacionesMensajesDashboard = [
    conversacion,
    ...conversacionesMensajesDashboard.filter((item) => item.id !== conversacion.id)
  ];
}

async function cargarDatosMensajesDashboard() {
  if (!usuarioDashboardActual?.uid) return;
  const [usuarios, contactos, conversaciones] = await Promise.allSettled([
    usuariosMensajesDashboard.length ? Promise.resolve(usuariosMensajesDashboard) : listarUsuariosParaMensajes(usuarioDashboardActual.uid),
    listarContactosMensajes(usuarioDashboardActual.uid),
    listarConversacionesMensajes(usuarioDashboardActual.uid)
  ]);

  if (usuarios.status === "fulfilled") {
    usuariosMensajesDashboard = usuarios.value;
  } else {
    console.warn("No se pudo cargar la lista general de usuarios para mensajes:", usuarios.reason);
  }

  if (contactos.status === "fulfilled") {
    contactosMensajesDashboard = contactos.value;
  } else {
    console.warn("No se pudieron cargar contactos de mensajes:", contactos.reason);
  }

  if (conversaciones.status === "fulfilled") {
    conversacionesMensajesDashboard = conversaciones.value;
  } else {
    console.warn("No se pudieron cargar conversaciones:", conversaciones.reason);
  }

  actualizarBadgeMensajesDashboard();
}

function contenedorMensajes() {
  return document.getElementById("mensajesVista");
}

function renderizarConversacionesDashboard() {
  const panel = document.getElementById("mensajesPanel");
  const contenedor = contenedorMensajes();
  panel?.classList.remove("con-chat");
  conversacionActivaDashboard = null;
  mensajesConversacionActiva = [];
  if (!contenedor) return;

  if (!conversacionesMensajesDashboard.length) {
    contenedor.innerHTML = `
      <div class="mensajes-contacto">
        <strong>Sin conversaciones todavia</strong>
        <span>Agrega un contacto, inicia una conversacion o habla con el admin.</span>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = conversacionesMensajesDashboard.map((conversacion) => {
    const otro = otroParticipanteConversacion(conversacion);
    const leidoEn = conversacion.lecturasUsuarios?.[usuarioDashboardActual.uid]?.leidoEn || "";
    const noLeida = conversacion.ultimoMensajePor !== usuarioDashboardActual.uid
      && (!leidoEn || String(leidoEn) < String(conversacion.ultimoMensajeEn || ""));
    return `
      <button type="button" class="mensajes-conversacion-item ${noLeida ? "activa" : ""}" data-abrir-conversacion="${escaparHTML(conversacion.id)}">
        <strong>${escaparHTML(otro.nombre || otro.email || "Contacto")}</strong>
        <span>${escaparHTML(otro.rol || "usuario")} ${noLeida ? "· nuevo" : ""}</span>
        <span>${escaparHTML(conversacion.ultimoMensaje || "Conversacion iniciada")}</span>
      </button>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-abrir-conversacion]").forEach((boton) => {
    boton.addEventListener("click", () => abrirConversacionDashboard(boton.dataset.abrirConversacion));
  });
}

function renderizarContactosDashboard() {
  const panel = document.getElementById("mensajesPanel");
  const contenedor = contenedorMensajes();
  panel?.classList.remove("con-chat");
  if (!contenedor) return;

  if (!contactosMensajesDashboard.length) {
    contenedor.innerHTML = `<div class="mensajes-contacto"><strong>Sin contactos</strong><span>Usa “Agregar contacto” para buscar usuarios registrados.</span></div>`;
    return;
  }

  contenedor.innerHTML = contactosMensajesDashboard.map((contacto) => `
    <div class="mensajes-contacto">
      <strong>${escaparHTML(contacto.nombre || contacto.email || contacto.id)}</strong>
      <span>${escaparHTML(contacto.email || "")} · ${escaparHTML(contacto.rol || "usuario")}</span>
      <button type="button" data-iniciar-contacto="${escaparHTML(contacto.id || contacto.uid)}">Iniciar conversacion</button>
    </div>
  `).join("");

  contenedor.querySelectorAll("[data-iniciar-contacto]").forEach((boton) => {
    boton.addEventListener("click", () => iniciarConversacionConUsuarioDashboard(boton.dataset.iniciarContacto));
  });
}

function renderizarAgregarContactoDashboard() {
  const panel = document.getElementById("mensajesPanel");
  const contenedor = contenedorMensajes();
  panel?.classList.remove("con-chat");
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="mensajes-buscador">
      <input id="buscarContactoMensaje" placeholder="Buscar por nombre, correo o UID">
      <div id="resultadosContactoMensaje"></div>
    </div>
  `;

  const input = document.getElementById("buscarContactoMensaje");
  const resultados = document.getElementById("resultadosContactoMensaje");
  let temporizadorBusqueda = null;

  const pintarResultados = (usuarios = [], texto = "") => {
    if (!usuarios.length) {
      resultados.innerHTML = texto
        ? `<div class="mensajes-contacto"><span>No se encontraron usuarios con esa busqueda. Intenta con correo completo o UID.</span></div>`
        : `<div class="mensajes-contacto"><span>Escribe un nombre, correo o UID para buscar usuarios. Tambien puedes usar "Hablar con admin".</span></div>`;
      return;
    }

    resultados.innerHTML = usuarios.map((usuario) => `
      <div class="mensajes-contacto">
        <strong>${escaparHTML(usuario.nombre || usuario.email || usuario.correo || usuario.id)}</strong>
        <span>${escaparHTML(usuario.email || usuario.correo || "")} · ${escaparHTML(usuario.rol || "usuario")}</span>
        <button type="button" data-agregar-contacto="${escaparHTML(usuario.id)}">Agregar contacto</button>
      </div>
    `).join("");

    resultados.querySelectorAll("[data-agregar-contacto]").forEach((boton) => {
      boton.addEventListener("click", async () => {
        const usuario = usuarios.find((item) => item.id === boton.dataset.agregarContacto)
          || usuariosMensajesDashboard.find((item) => item.id === boton.dataset.agregarContacto);
        if (!usuario) return;
        await agregarContactoMensaje(usuarioDashboardActual.uid, usuario);
        usuariosMensajesDashboard = [
          usuario,
          ...usuariosMensajesDashboard.filter((item) => item.id !== usuario.id)
        ];
        await cargarDatosMensajesDashboard();
        renderizarContactosDashboard();
      });
    });
  };

  const pintar = async () => {
    const textoOriginal = input?.value || "";
    const texto = normalizarTextoMensaje(textoOriginal);
    let usuarios = usuariosMensajesDashboard
      .filter((usuario) => !texto || normalizarTextoMensaje(`${usuario.nombre || ""} ${usuario.email || ""} ${usuario.correo || ""} ${usuario.rol || ""}`).includes(texto))
      .slice(0, 20);

    if (texto && !usuarios.length) {
      resultados.innerHTML = `<div class="mensajes-contacto"><span>Buscando usuarios...</span></div>`;
      try {
        usuarios = await buscarUsuariosParaMensajes(textoOriginal, usuarioDashboardActual.uid);
        usuarios.forEach((usuario) => {
          if (!usuariosMensajesDashboard.some((item) => item.id === usuario.id)) usuariosMensajesDashboard.push(usuario);
        });
      } catch (error) {
        console.warn("No se pudo buscar usuario para mensajes:", error);
        usuarios = [];
      }
    }

    pintarResultados(usuarios, texto);
  };

  input?.addEventListener("input", () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(pintar, 250);
  });
  pintar();
}
function normalizarTextoMensaje(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function iniciarConversacionConUsuarioDashboard(uidContacto) {
  const contacto = usuariosMensajesDashboard.find((usuario) => usuario.id === uidContacto)
    || contactosMensajesDashboard.find((usuario) => usuario.id === uidContacto || usuario.uid === uidContacto);
  if (!contacto || !usuarioDashboardActual?.uid) return;

  await agregarContactoMensaje(usuarioDashboardActual.uid, contacto).catch((error) => {
    console.warn("No se pudo guardar el contacto antes de iniciar conversacion:", error);
  });
  const conversacion = await obtenerOCrearConversacion(usuarioDashboardActual, contacto);
  integrarConversacionLocal(conversacion);
  await cargarDatosMensajesDashboard();
  integrarConversacionLocal(conversacion);
  await abrirConversacionDashboard(conversacion.id);
}

async function hablarConAdminDashboard() {
  if (!usuarioDashboardActual?.uid) return;
  const contenedor = contenedorMensajes();
  if (contenedor) {
    contenedor.innerHTML = `
      <div class="mensajes-contacto">
        <strong>Buscando administrador...</strong>
        <span>Preparando una conversacion directa y privada.</span>
      </div>
    `;
  }

  try {
    const admins = await listarAdminsParaMensajes(usuarioDashboardActual.uid);
    const admin = admins[0];
    if (!admin) {
      if (contenedor) {
        contenedor.innerHTML = `
          <div class="mensajes-contacto">
            <strong>No hay administrador disponible</strong>
            <span>No se encontro una cuenta con rol de administrador para iniciar mensaje directo.</span>
          </div>
        `;
      }
      return;
    }

    const contactoAdmin = {
      id: admin.id,
      uid: admin.id,
      nombre: admin.nombre || admin.email || "Administrador",
      email: admin.email || "",
      rol: admin.rol || "admin"
    };

    await agregarContactoMensaje(usuarioDashboardActual.uid, contactoAdmin).catch((error) => {
      console.warn("No se pudo guardar el admin como contacto; se intentara abrir conversacion directa:", error);
    });
    const conversacion = await obtenerOCrearConversacion(usuarioDashboardActual, contactoAdmin);
    integrarConversacionLocal(conversacion);
    await cargarDatosMensajesDashboard();
    integrarConversacionLocal(conversacion);
    await abrirConversacionDashboard(conversacion.id);
  } catch (error) {
    console.error("No se pudo iniciar conversacion con admin:", error);
    if (contenedor) {
      contenedor.innerHTML = `
        <div class="mensajes-contacto">
          <strong>No se pudo abrir la conversacion</strong>
          <span>${escaparHTML(error.message || "Revisa permisos de mensajes en Firestore.")}</span>
        </div>
      `;
    }
  }
}

async function abrirConversacionDashboard(conversacionId) {
  const panel = document.getElementById("mensajesPanel");
  const contenedor = contenedorMensajes();
  if (!contenedor || !conversacionId) return;

  conversacionActivaDashboard = conversacionesMensajesDashboard.find((conv) => conv.id === conversacionId)
    || { id: conversacionId, participantes: {}, participantIds: [] };

  mensajesConversacionActiva = await marcarMensajesConversacionVistos(conversacionId, usuarioDashboardActual.uid, usuarioDashboardActual);
  const mensajesActualizados = await listarMensajesConversacion(conversacionId);
  mensajesConversacionActiva = mensajesActualizados;

  await updateDoc(doc(db, "mensajesConversaciones", conversacionId), {
    [`lecturasUsuarios.${usuarioDashboardActual.uid}`]: {
      leidoEn: new Date().toISOString(),
      uid: usuarioDashboardActual.uid,
      nombre: usuarioDashboardActual.nombre || ""
    }
  }).catch((error) => console.warn("No se pudo actualizar lectura de conversacion:", error));

  panel?.classList.add("con-chat");
  const otro = otroParticipanteConversacion(conversacionActivaDashboard);
  contenedor.innerHTML = `
    <div class="mensajes-contacto">
      <strong>${escaparHTML(otro.nombre || otro.email || "Contacto")}</strong>
      <span>${escaparHTML(otro.rol || "usuario")} · visto por usuario/admin cuando aparece “Visto”.</span>
      <div class="card-actions">
        <button type="button" data-volver-conversaciones>Volver a conversaciones</button>
        <button type="button" data-archivar-conversacion-dashboard="${escaparHTML(conversacionId)}">Archivar</button>
        <button type="button" data-eliminar-conversacion-dashboard="${escaparHTML(conversacionId)}">Eliminar</button>
      </div>
    </div>
    <div id="mensajesHiloDashboard">
      ${mensajesActualizados.length ? mensajesActualizados.map((mensaje) => renderMensajeDashboard(mensaje, otro.uid)).join("") : `<p class="avisos-resumen-rapido">Escribe el primer mensaje.</p>`}
    </div>
  `;

  contenedor.querySelector("[data-volver-conversaciones]")?.addEventListener("click", async () => {
    await cargarDatosMensajesDashboard();
    renderizarConversacionesDashboard();
  });
  contenedor.querySelector("[data-archivar-conversacion-dashboard]")?.addEventListener("click", async () => {
    await archivarConversacionMensaje(conversacionId, usuarioDashboardActual.uid);
    conversacionesMensajesDashboard = conversacionesMensajesDashboard.filter((item) => item.id !== conversacionId);
    renderizarConversacionesDashboard();
    actualizarBadgeMensajesDashboard();
  });
  contenedor.querySelector("[data-eliminar-conversacion-dashboard]")?.addEventListener("click", async () => {
    if (!confirm("Eliminar esta conversacion de tu bandeja?")) return;
    await eliminarConversacionMensaje(conversacionId, usuarioDashboardActual.uid);
    conversacionesMensajesDashboard = conversacionesMensajesDashboard.filter((item) => item.id !== conversacionId);
    renderizarConversacionesDashboard();
    actualizarBadgeMensajesDashboard();
  });
  contenedor.scrollTop = contenedor.scrollHeight;
  await cargarDatosMensajesDashboard();
}

function renderMensajeDashboard(mensaje, otroUid = "") {
  const propio = mensaje.autorUid === usuarioDashboardActual?.uid;
  const vistoPorOtro = propio && otroUid && mensaje.vistosPor?.[otroUid];
  return `
    <div class="mensaje-burbuja ${propio ? "propio" : ""}">
      ${escaparHTML(mensaje.texto || "")}
      <small>${escaparHTML(mensaje.autorNombre || "")} · ${escaparHTML(mensaje.fechaISO || "")}${vistoPorOtro ? " · Visto" : ""}</small>
    </div>
  `;
}

window.enviarMensajeDashboard = async function() {
  const campo = document.getElementById("mensajeTexto");
  const texto = campo?.value.trim() || "";
  if (!texto || !conversacionActivaDashboard?.id) return;
  await enviarMensajeConversacion(conversacionActivaDashboard.id, usuarioDashboardActual, texto);
  campo.value = "";
  await abrirConversacionDashboard(conversacionActivaDashboard.id);
};

document.querySelectorAll("[data-mensajes-vista]").forEach((boton) => {
  boton.addEventListener("click", async () => {
    await cargarDatosMensajesDashboard();
    const vista = boton.dataset.mensajesVista;
    if (vista === "contactos") renderizarContactosDashboard();
    if (vista === "agregar") renderizarAgregarContactoDashboard();
    if (vista === "conversaciones") renderizarConversacionesDashboard();
  });
});

document.querySelector("[data-mensajes-admin]")?.addEventListener("click", async (evento) => {
  evento.preventDefault();
  await cargarDatosMensajesDashboard();
  await hablarConAdminDashboard();
});
