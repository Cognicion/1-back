import { db } from "../firebase.js";

import {
  addDoc,
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

  const snapUsuarios = await getDocs(collection(db, "usuarios"));
  return snapUsuarios.docs
    .map((docUsuario) => ({ id: docUsuario.id, ...docUsuario.data() }))
    .filter((usuario) => usuario.id !== uidActual && esAdmin(usuario));
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
  const snap = await getDoc(ref);
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

  return { id, ...(snap.exists() ? snap.data() : {}), participantes, participantIds: Object.keys(participantes) };
}

export async function listarConversacionesMensajes(uidActual = "") {
  const qConversaciones = query(
    collection(db, COLECCION_CONVERSACIONES),
    where("participantIds", "array-contains", uidActual)
  );
  const snap = await getDocs(qConversaciones);
  return snap.docs
    .map((docConversacion) => ({ id: docConversacion.id, ...docConversacion.data() }))
    .sort((a, b) => String(b.ultimoMensajeEn || "").localeCompare(String(a.ultimoMensajeEn || "")));
}

export async function listarMensajesConversacion(conversacionId = "") {
  const snap = await getDocs(collection(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes"));
  return snap.docs
    .map((docMensaje) => ({ id: docMensaje.id, ...docMensaje.data() }))
    .sort((a, b) => String(a.fechaISO || "").localeCompare(String(b.fechaISO || "")));
}

export async function enviarMensajeConversacion(conversacionId, usuarioActual, texto = "") {
  const mensaje = {
    texto,
    autorUid: usuarioActual.uid,
    autorNombre: usuarioActual.nombre || usuarioActual.email || "",
    autorRol: usuarioActual.rol || "",
    vistosPor: {
      [usuarioActual.uid]: {
        uid: usuarioActual.uid,
        nombre: usuarioActual.nombre || usuarioActual.email || "",
        vistoEn: new Date().toISOString()
      }
    },
    fechaISO: new Date().toISOString(),
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes"), mensaje);
  await updateDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId), {
    ultimoMensaje: texto,
    ultimoMensajePor: usuarioActual.uid,
    ultimoMensajeEn: mensaje.fechaISO,
    updatedAt: serverTimestamp()
  });
}

export async function marcarMensajesConversacionVistos(conversacionId, uidActual, datosUsuario = {}) {
  const mensajes = await listarMensajesConversacion(conversacionId);
  const ahora = new Date().toISOString();
  const pendientes = mensajes.filter((mensaje) => mensaje.autorUid !== uidActual && !mensaje.vistosPor?.[uidActual]);

  await Promise.all(pendientes.map((mensaje) =>
    updateDoc(doc(db, COLECCION_CONVERSACIONES, conversacionId, "mensajes", mensaje.id), {
      [`vistosPor.${uidActual}`]: {
        uid: uidActual,
        nombre: datosUsuario.nombre || datosUsuario.email || "",
        vistoEn: ahora
      }
    })
  ));

  return mensajes;
}
