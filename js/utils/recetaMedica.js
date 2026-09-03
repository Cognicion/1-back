export function resolverDireccionConsultorioReceta(perfil = {}) {
  const mostrarDireccionConsultorioReceta = perfil?.mostrarDireccionConsultorioReceta === true;
  const direccionRegistrada = String(perfil?.direccionConsultorio || "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    direccionConsultorio: mostrarDireccionConsultorioReceta ? direccionRegistrada : "",
    mostrarDireccionConsultorioReceta
  };
}
