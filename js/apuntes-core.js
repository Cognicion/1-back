export const SIN_CARPETA = "__sin_carpeta__";

export function normalizarTexto(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

function claveTexto(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

export function obtenerTituloVisibleApunte(titulo) {
  return normalizarTexto(titulo) || "Sin título";
}

export function crearVistaPreviaApunte(texto, maximo = 120) {
  const limpio = normalizarTexto(texto);
  if (!limpio) return "Sin contenido";
  return limpio.length > maximo ? `${limpio.slice(0, maximo).trim()}…` : limpio;
}

export function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function filtrarApuntes(apuntes, busqueda) {
  const termino = claveTexto(busqueda);
  if (!termino) return [...apuntes];

  return apuntes.filter((apunte) => {
    const titulo = claveTexto(apunte.titulo);
    const contenido = claveTexto(apunte.contenido);
    return titulo.includes(termino) || contenido.includes(termino);
  });
}

export function ordenarCarpetas(carpetas) {
  return [...carpetas].sort((a, b) => String(a.nombre ?? "").localeCompare(
    String(b.nombre ?? ""),
    "es",
    { sensitivity: "base", numeric: true }
  ));
}

export function agruparApuntes(apuntes, carpetas) {
  const carpetasOrdenadas = ordenarCarpetas(carpetas);
  const idsValidos = new Set(carpetasOrdenadas.map((carpeta) => carpeta.id));
  const grupos = carpetasOrdenadas.map((carpeta) => ({
    id: carpeta.id,
    nombre: normalizarTexto(carpeta.nombre) || "Carpeta sin nombre",
    esSistema: false,
    apuntes: apuntes.filter((apunte) => apunte.carpetaId === carpeta.id)
  }));

  grupos.push({
    id: SIN_CARPETA,
    nombre: "Sin carpeta",
    esSistema: true,
    apuntes: apuntes.filter((apunte) => !apunte.carpetaId || !idsValidos.has(apunte.carpetaId))
  });

  return grupos;
}

export function nombreCarpetaDisponible(nombre, carpetas, idIgnorado = "") {
  const candidato = claveTexto(nombre);
  if (!candidato) return false;
  return !carpetas.some((carpeta) => (
    carpeta.id !== idIgnorado
    && claveTexto(carpeta.nombre) === candidato
  ));
}
