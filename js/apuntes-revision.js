export const CODIGO_CONFLICTO_APUNTE = "apuntes/conflicto-version";
export const CODIGO_APUNTE_ELIMINADO = "apuntes/eliminado";

export function validarRevisionApunte({ existe, fechaActualizacion }, fechaEsperada) {
  if (!existe) {
    const error = new Error("El apunte ya no existe.");
    error.code = CODIGO_APUNTE_ELIMINADO;
    throw error;
  }

  if (String(fechaActualizacion ?? "") !== String(fechaEsperada ?? "")) {
    const error = new Error("El apunte cambió desde otra ventana.");
    error.code = CODIGO_CONFLICTO_APUNTE;
    throw error;
  }
}

export function esConflictoApunte(error) {
  return error?.code === CODIGO_CONFLICTO_APUNTE || error?.code === CODIGO_APUNTE_ELIMINADO;
}

export function esErrorConexionApunte(error, enLinea = globalThis.navigator?.onLine) {
  const codigo = String(error?.code || "").toLowerCase();
  const mensaje = String(error?.message || "").toLowerCase();
  return enLinea === false
    || codigo === "unavailable"
    || codigo.endsWith("/unavailable")
    || /client is offline|network request failed|sin conexi[oó]n/.test(mensaje);
}
