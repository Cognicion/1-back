import { db } from "../firebase.js";

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECCION_CONVERSACIONES = "mensajesConversaciones";
const ADMIN_PRINCIPAL_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";

function crearMensajeConversacion(usuarioActual, texto = "") {
  const fechaISO = new Date().toISOString();
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    texto,
    autorUid: usuarioActual.uid,
    autorNombre: usuarioActual.nombre || usuarioActual.email || "",
    autorRol: usuarioActual.rol || "",
    vistosPor: {
      [usuarioActual.uid]: {
        uid: usuarioActual.uid,
        nombre: usuarioActual.nombre || usuarioActual.email || "",
        vistoEn: fechaISO
      }
    },
    fechaISO
  };
}

function ordenarMensajes(lista = []) {
  const unicos = new Map();
  lista.forEach((mensaje) => {
    const clave = mensaje.id || `${mensaje.autorUid || ""}_${mensaje.fechaISO || ""}_${mensaje.texto || ""}`;
    if (clave && !unicos.has(clave)) unicos.set(clave, mensaje);
  });
  return Array.from(unicos.values())
    .sort((a, b) => String(a.fechaISO || "").localeCompare(String(b.fechaISO || "")));
}

export function idConversacionParaUsuarios(uidA = "", uidB = "") {
  return [uidA, uidB].filter(Boolean).sort().join("__");
}

export async function listarUsuariosParaMensajes(uidActual = "") {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs
    .map((docUsuario) => ({ id: docUsuario.id, ...docUsuario.data() }))
    .filter((usuario) => usuario.id !== uidActual)
    .sort((a, b) => String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""), "es", { sensitivity: "base" }));
}

export async function buscarUsuariosParaMensajes(texto = "", uidActual = "") {
  const busqueda = String(texto || "").trim();
  if (!busqueda) return listarUsuariosParaMensajes(uidActual);

  const resultados = new Map();
  const agregar = (usuario) => {
    if (!usuario?.id || usuario.id === uidActual || resultados.has(usuario.id)) return;
    resultados.set(usuario.id, usuario);
  };

  try {
    const snapUid = await getDoc(doc(db, "usuarios", busqueda));
    if (snapUid.exists()) agregar({ id: snapUid.id, ...snapUid.data() });
  } catch (error) {
    console.warn("No se pudo buscar usuario por UID:", error);
  }

  if (busqueda.includes("@")) {
    const emailNormalizado = busqueda.toLowerCase();
    const consultas = [
      query(collection(db, "usuarios"), where("email", "==", busqueda)),
      query(collection(db, "usuarios"), where("email", "==", emailNormalizado)),
      query(collection(db, "usuarios"), where("correo", "==", busqueda)),
      query(collection(db, "usuarios"), where("correo", "==", emailNormalizado))
    ];

    const snaps = await Promise.allSettled(consultas.map((consulta) => getDocs(consulta)));
    snaps.forEach((resultado) => {
      if (resultado.status !== "fulfilled") return;
      resultado.value.docs.forEach((docUsuario) => agregar({ id: docUsuario.id, ...docUsuario.data() }));
    });
  }

  if (!resultados.size) {
    try {
      const usuarios = await listarUsuariosParaMensajes(uidActual);
      const normalizado = busqueda
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      usuarios
        .filter((usuario) => `${usuario.nombre || ""} ${usuario.email || ""} ${usuario.correo || ""} ${usuario.rol || ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(normalizado))
        .forEach(agregar);
    } catch (error) {
      console.warn("No se pudo hacer busqueda amplia de usuarios:", error);
    }
  }

  return Array.from(resultados.values())
    .sort((a, b) => String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""), "es", { sensitivity: "base" }));
}

export async function listarAdminsParaMensajes(uidActual = "") {
  const esAdmin = (usuario = {}) => {
    const rol = String(usuario.rol || "").toLowerCase().trim();
    return ["admin", "administrador", "superadmin"].includes(rol);
  };

  try {
    const qAdmins = query(collection(db, "usuarios"), where("rol", "==", "admin"));
    const snap = await getDocs(qAdmins);
    const admins = snap.docs
      .map((docUsuario) => ({ id: docUsuario.id, ...docUsuario.data() }))
      .filter((usuario) => usuario.id !== uidActual);

    if (admins.length) return admins;
  } catch (error) {
    console.warn("No se pudo consultar administradores por rol exacto:", error);
  }

  try {
    const snapUsuarios = await getDocs(collection(db, "usuarios"));
    const admins = snapUsuarios.docs
      .map((docUsuario) => ({ id: docUsuario.id, ...docUsuario.data() }))
      .filter((usuario) => usuario.id !== uidActual && esAdmin(usuario));
    if (admins.length) return admins;
  } catch (error) {
    console.warn("No se pudo consultar lista general de usuarios para administradores:", error);
  }

  try {
    const snapAdmin = await getDoc(doc(db, "usuarios", ADMIN_PRINCIPAL_UID));
    if (snapAdmin.exists() && snapAdmin.id !== uidActual) {
      return [{ id: snapAdmin.id, ...snapAdmin.data(), rol: snapAdmin.data().rol || "admin" }];
    }
  } catch (error) {
    console.warn("No se pudo leer administrador principal:", error);
  }

  return uidActual === ADMIN_PRINCIPAL_UID ? [] : [{
    id: ADMIN_PRINCIPAL_UID,
    uid: ADMIN_PRINCIPAL_UID,
    nombre: "Administrador",
    email: "",
    rol: "admin"
  }];
}

export async function agregarContactoMensaje(uidActual, contacto) {
  const fecha = new Date().toISOString();
  await setDoc(doc(db, "usuarios", uidActual, "contactosMensajes", contacto.id), {
    uid: contacto.id,
    nombre: contacto.nombre || contacto.email || contacto.id,
    email: contacto.email || "",
    rol: contacto.rol || "",
    agregadoEn: fecha
  }, { merge: true });
}

export async function listarContactosMensajes(uidActual = "") {
  const snap = await getDocs(collection(db, "usuarios", uidActual, "contactosMensajes"));
  return snap.docs
    .map((docContacto) => ({ id: docContacto.id, ...docContacto.data() }))
    .sort((a, b) => String(a.nombre || a.email || "").localeCompare(String(b.nombre || b.email || ""), "es", { sensitivity: "base" }));
}

export async function obtenerOCrearConversacion(usuarioActual, contacto) {
  const id = idConversacionParaUsuarios(usuarioActual.uid, contacto.id || contacto.uid);
  const ref = doc(db, COLECCION_CONVERSACIONES, id);
  let snap = null;
  const ahora = new Date().toISOString();

  const participantes = {
    [usuarioActual.uid]: {
      uid: usuarioActual.uid,
      nombre: usuarioActual.nombre || usuarioActual.email || "",
      email: usuarioActual.email || "",
      rol: usuarioActual.rol || ""
    },
    [contacto.id || contacto.uid]: {
      uid: contacto.id || contacto.uid,
      nombre: contacto.nombre || contacto.email || "",
      email: contacto.email || "",
      rol: contacto.rol || ""
    }
  };

  try {
    snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        participantIds: Object.keys(participantes),
        participantes,
        ultimoMensaje: "",
        ultimoMensajeEn: ahora,
        creadoEn: ahora,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(ref, { participantes, updatedAt: serverTimestamp() }, { merge: true });
    }
  } catch (error) {
    console.warn("No se pudo crear o leer la conversacion; se usara conversacion local hasta enviar mensaje:", error);
  }

  return {
    id,
    ...(snap?.exists?.() ? snap.data() : {}),
    participantes,
    participantIds: Object.keys(participantes),
    ultimoMensaje: snap?.exists?.() ? snap.data().ultimoMensaje || "" : "",
    ultimoMensajeEn: snap?.exists?.() ? snap.data().ultimoMensajeEn || ahora : ahora
  };
}

export async function listarConversacionesMensajes(uidActual = "") {
  const qConversaciones = query(
    collection(db, COLECCION_CONVERSACIONES),
    where("participantIds", "array-contains", uidActual)
  );
  const snap = await getDocs(qConversaciones);
  return snap.docs
    .map((docConversacion) => ({ id: docConversacion.id, ...docConversacion.data() }))
    .filter((conversacion) => {
      const estadoUsuario = conversacion.estadosUsuarios?.[uidActual] || {};
      return !estadoUsuario.eliminado && !estadoUsuario.archivado;
    })
    .sort((a, b) => String(b.ultimoMensajeEn || "").localeCompare(String(a.ultimoMensajeEn || "")));
}

export async function actualizarEstadoConversacionUsuario(conversacionId, uidActual, cambios = {}) {
  if (!conversacionId || !uidActual) return;
  await setDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId), {
    estadosUsuarios: {
      [uidActual]: {
        ...cambios,
        actualizadoEn: new Date().toISOString()
      }
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function archivarConversacionMensaje(conversacionId, uidActual) {
  return actualizarEstadoConversacionUsuario(conversacionId, uidActual, {
    archivado: true,
    eliminado: false,
    archivadoEn: new Date().toISOString()
  });
}

export async function eliminarConversacionMensaje(conversacionId, uidActual) {
  return actualizarEstadoConversacionUsuario(conversacionId, uidActual, {
    eliminado: true,
    archivado: false,
    eliminadoEn: new Date().toISOString()
  });
}

export async function listarMensajesConversacion(conversacionId = "") {
  const mensajes = [];

  try {
    const snap = await getDocs(collection(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes"));
    mensajes.push(...snap.docs.map((docMensaje) => ({ id: docMensaje.id, ...docMensaje.data() })));
  } catch (error) {
    console.warn("No se pudo leer subcoleccion de mensajes; se usara respaldo del documento:", error);
  }

  try {
    const snapConversacion = await getDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId));
    const datos = snapConversacion.exists() ? snapConversacion.data() : {};
    const respaldo = Array.isArray(datos.mensajesFallback) ? datos.mensajesFallback : [];
    mensajes.push(...respaldo.map((mensaje) => ({ ...mensaje, origenFallback: true })));
  } catch (error) {
    console.warn("No se pudo leer respaldo de mensajes:", error);
  }

  return ordenarMensajes(mensajes);
}

export async function enviarMensajeConversacion(conversacionId, usuarioActual, texto = "") {
  const mensaje = crearMensajeConversacion(usuarioActual, texto);
  const resumen = {
    ultimoMensaje: texto,
    ultimoMensajePor: usuarioActual.uid,
    ultimoMensajeEn: mensaje.fechaISO,
    updatedAt: serverTimestamp()
  };

  try {
    const docMensaje = await addDoc(collection(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes"), {
      ...mensaje,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId), resumen).catch((error) => {
      console.warn("El mensaje se guardo, pero no se pudo actualizar el resumen de la conversacion:", error);
    });
    return { ...mensaje, id: docMensaje.id };
  } catch (errorSubcoleccion) {
    console.warn("La subcoleccion de mensajes fue bloqueada; guardando mensaje en respaldo de la conversacion:", errorSubcoleccion);
    try {
      await setDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId), {
        mensajesFallback: arrayUnion(mensaje),
        ...resumen
      }, { merge: true });
      return { ...mensaje, origenFallback: true };
    } catch (errorFallback) {
      console.error("No se pudo guardar mensaje ni en subcoleccion ni en respaldo:", errorFallback);
      throw errorFallback;
    }
  }
}

export async function marcarMensajesConversacionVistos(conversacionId, uidActual, datosUsuario = {}) {
  const mensajes = await listarMensajesConversacion(conversacionId);
  const ahora = new Date().toISOString();
  const pendientes = mensajes.filter((mensaje) => mensaje.autorUid !== uidActual && !mensaje.vistosPor?.[uidActual]);

  await Promise.allSettled(pendientes
    .filter((mensaje) => !mensaje.origenFallback)
    .map((mensaje) => updateDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes", mensaje.id), {
      [`vistosPor.${uidActual}`]: {
        uid: uidActual,
        nombre: datosUsuario.nombre || datosUsuario.email || "",
        vistoEn: ahora
      }
    })));

  await setDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId), {
    lecturasUsuarios: {
      [uidActual]: {
        leidoEn: ahora,
        uid: uidActual,
        nombre: datosUsuario.nombre || datosUsuario.email || ""
      }
    },
    updatedAt: serverTimestamp()
  }, { merge: true }).catch((error) => {
    console.warn("No se pudo actualizar lectura general de conversacion:", error);
  });

  return mensajes;
}
