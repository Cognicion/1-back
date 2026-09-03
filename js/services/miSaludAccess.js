import {
  isAdministrator,
  usuarioEsPersonalClinico,
  usuarioEsProfesionalTipoMedico
} from "../utils/roles.js";

const rolDelActor = (actor = {}) => String(actor?.rol || actor?.role || "").trim();

/**
 * Centraliza el acceso de interfaz a Mi Salud. La autorización de datos
 * continúa aplicándose en Firestore; esta función solo evita que un admin
 * sea rechazado antes de abrir una vista previa permitida por las reglas.
 */
export function resolverAccesoMiSalud({ actor = {}, pacientePreview = "" } = {}) {
  const administrador = isAdministrator(actor);
  const rol = rolDelActor(actor);
  const vistaPrevia = Boolean(pacientePreview);

  if (vistaPrevia) {
    const personalClinico = usuarioEsPersonalClinico(rol);
    const permitido = administrador || personalClinico;
    return {
      permitido,
      vistaPrevia: true,
      administrador,
      requiereRelacionClinica: permitido && !administrador,
      mensaje: permitido ? "" : "La vista previa de Mi Salud es solo para personal clinico o administradores."
    };
  }

  const permitido = administrador || rol === "paciente" || usuarioEsProfesionalTipoMedico(rol);
  return {
    permitido,
    vistaPrevia: false,
    administrador,
    requiereRelacionClinica: false,
    mensaje: permitido ? "" : "Este modulo esta disponible para pacientes, personal clinico y administradores."
  };
}
