import { auth, obtenerStorage } from "../firebase.js";
import { actualizarUsuario } from "./usuarios.js";

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validarArchivoFotoPerfil(file) {
  if (!file) throw new Error("Selecciona una imagen.");
  if (!PROFILE_PHOTO_ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
  }
  if (file.size <= 0) throw new Error("La imagen está vacía.");
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("La imagen supera el tamaño máximo de 5 MB.");
  }
  return file;
}

export function obtenerInicialesPerfil(nombre = "") {
  return String(nombre || "DR")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join("")
    .toUpperCase() || "DR";
}

export function renderizarFotoPerfil(contenedor, { url = "", nombre = "", alt = "Foto de perfil" } = {}) {
  if (!contenedor) return;
  const iniciales = obtenerInicialesPerfil(nombre);
  contenedor.replaceChildren();

  if (!url) {
    contenedor.textContent = iniciales;
    return;
  }

  const imagen = document.createElement("img");
  imagen.src = url;
  imagen.alt = alt;
  imagen.loading = "lazy";
  imagen.decoding = "async";
  imagen.addEventListener("error", () => {
    contenedor.replaceChildren();
    contenedor.textContent = iniciales;
  }, { once: true });
  contenedor.appendChild(imagen);
}

export async function subirFotoPerfil(uid, file) {
  const usuarioActual = auth.currentUser;
  if (!uid || !usuarioActual || usuarioActual.uid !== uid) {
    throw new Error("La sesión no permite actualizar esta foto de perfil.");
  }

  validarArchivoFotoPerfil(file);
  const storage = await obtenerStorage();
  const { getDownloadURL, ref, uploadBytes } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js"
  );
  const storagePath = `usuarios/${uid}/perfil/foto-perfil`;
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: "public,max-age=3600"
  });
  const actualizadaEn = new Date().toISOString();
  const downloadUrl = await getDownloadURL(snapshot.ref);
  const separador = downloadUrl.includes("?") ? "&" : "?";
  const url = `${downloadUrl}${separador}v=${encodeURIComponent(actualizadaEn)}`;

  await actualizarUsuario(uid, {
    fotoProfesional: url,
    fotoPerfilStoragePath: storagePath,
    fotoPerfilActualizada: actualizadaEn
  });

  try {
    const { updateProfile } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    await updateProfile(usuarioActual, { photoURL: url });
  } catch (error) {
    console.warn("La foto se guardó, pero no se pudo sincronizar con Firebase Auth.", error?.code || error?.name || "error");
  }

  globalThis.dispatchEvent?.(new CustomEvent("cognicion:profile-photo-updated", {
    detail: { uid, url, storagePath, actualizadaEn }
  }));

  return { url, storagePath, actualizadaEn };
}
