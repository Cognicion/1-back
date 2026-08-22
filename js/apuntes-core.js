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

function idCarpetaSeguro(valor) {
  return String(valor ?? "").trim();
}

/** Devuelve un padre existente y sin ciclos; los datos antiguos sin padre quedan en la raíz. */
export function normalizarCarpetaPadreId(carpetaPadreId, carpetas, idPropio = "") {
  const candidato = idCarpetaSeguro(carpetaPadreId);
  const propio = idCarpetaSeguro(idPropio);
  if (!candidato || candidato === propio) return "";

  const porId = new Map((carpetas || []).map((carpeta) => [idCarpetaSeguro(carpeta.id), carpeta]));
  if (!porId.has(candidato)) return "";

  const visitados = new Set(propio ? [propio] : []);
  let actual = candidato;
  while (actual) {
    if (visitados.has(actual)) return "";
    visitados.add(actual);
    const carpeta = porId.get(actual);
    const siguiente = idCarpetaSeguro(carpeta?.carpetaPadreId);
    actual = siguiente && porId.has(siguiente) ? siguiente : "";
  }
  return candidato;
}

/** Organiza las carpetas en un árbol estable y tolerante a referencias antiguas o cíclicas. */
export function jerarquizarCarpetas(carpetas = []) {
  const base = ordenarCarpetas(carpetas).map((carpeta) => ({
    ...carpeta,
    id: idCarpetaSeguro(carpeta.id),
    carpetaPadreId: normalizarCarpetaPadreId(carpeta.carpetaPadreId, carpetas, carpeta.id),
    hijas: []
  })).filter((carpeta) => carpeta.id);
  const porId = new Map(base.map((carpeta) => [carpeta.id, carpeta]));
  const raiz = [];

  base.forEach((carpeta) => {
    const padre = carpeta.carpetaPadreId && porId.get(carpeta.carpetaPadreId);
    if (padre) padre.hijas.push(carpeta);
    else raiz.push(carpeta);
  });
  return raiz;
}

export function aplanarCarpetasJerarquicas(carpetas = []) {
  const resultado = [];
  const recorrer = (nodos, profundidad = 0) => {
    nodos.forEach((carpeta) => {
      resultado.push({ ...carpeta, profundidad });
      recorrer(carpeta.hijas || [], profundidad + 1);
    });
  };
  recorrer(jerarquizarCarpetas(carpetas));
  return resultado;
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

export function nombreCarpetaDisponible(nombre, carpetas, idIgnorado = "", carpetaPadreId = "") {
  const candidato = claveTexto(nombre);
  if (!candidato) return false;
  const padreNormalizado = idCarpetaSeguro(carpetaPadreId);
  return !carpetas.some((carpeta) => (
    carpeta.id !== idIgnorado
    && idCarpetaSeguro(carpeta.carpetaPadreId) === padreNormalizado
    && claveTexto(carpeta.nombre) === candidato
  ));
}
