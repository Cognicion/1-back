import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const profileHtml = read("perfil-profesional.html");
const settingsHtml = read("configuracion.html");
const profileJs = read("js/perfil-profesional.js");
const settingsJs = read("js/configuracion.js");
const medicalPanelJs = read("js/medico.js");
const service = read("js/services/profilePhotoService.js");

assert.match(profileHtml, /id="archivoFotoPerfil"[^>]+type="file"/, "Perfil profesional permite seleccionar una imagen");
assert.match(settingsHtml, /id="fotoPerfilConfiguracion"[^>]+type="file"/, "Configuración permite seleccionar una imagen");
assert.doesNotMatch(profileHtml, /Fotografia URL|Fotografía URL/, "Ya no se solicita una URL manual");
assert.match(profileJs, /subirFotoPerfil\(medicoUid, file, \{/, "Perfil profesional usa el servicio compartido");
assert.match(settingsJs, /subirFotoPerfil\(user\.uid, file, \{/, "Configuración usa el servicio compartido");
assert.match(service, /PROFILE_PHOTO_MAX_BYTES = 5 \* 1024 \* 1024/, "La carga limita imágenes a 5 MB");
assert.match(service, /PROFILE_PHOTO_UPLOAD_TIMEOUT_MS = 25 \* 1000/, "La carga no puede quedar esperando indefinidamente");
assert.match(service, /uploadBytesResumable/, "La carga informa progreso y puede cancelarse");
assert.match(service, /profile-photo\/storage-unavailable/, "La falta de Storage devuelve un error comprensible");
assert.match(service, /image\/jpeg.*image\/png.*image\/webp/, "La carga limita los formatos admitidos");
assert.match(service, /usuarios\/\$\{uid\}\/perfil\/foto-perfil/, "La foto usa una ruta estable por usuario");
assert.match(service, /fotoProfesional: url/, "La URL se guarda en el perfil de Firestore");
assert.match(service, /updateProfile\(usuarioActual, \{ photoURL: url \}\)/, "La foto se sincroniza con Firebase Auth");
assert.match(medicalPanelJs, /datos\.fotoProfesional \|\| user\.photoURL/, "El Panel Médico muestra la foto guardada");
assert.match(medicalPanelJs, /addEventListener\("error"/, "El avatar vuelve a iniciales si la imagen falla");

console.log("profile-photo-static.test.mjs OK");
