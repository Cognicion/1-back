function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const MEMBERSHIP_TYPES = Object.freeze({
  FREE: "gratuita",
  PRO: "pro"
});

// Alias conservado para consumidores existentes. El catálogo canónico solo
// contiene dos membresías: gratuita y Pro.
export const MEMBERSHIP_TIERS = MEMBERSHIP_TYPES;

function esAdministrador(usuario = {}) {
  if (!usuario || typeof usuario !== "object") return false;
  const rol = normalizar(usuario.rol || usuario.role || "").replace(/[\s_-]+/g, "");
  return usuario.admin === true
    || usuario.esAdmin === true
    || usuario.isAdmin === true
    || usuario.permisos?.admin === true
    || usuario.claims?.admin === true
    || ["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"].includes(rol);
}

export function obtenerNivelMembresia(usuario = {}) {
  const canonica = normalizar(usuario.tipoMembresia || "");
  if (canonica === MEMBERSHIP_TYPES.PRO) return MEMBERSHIP_TYPES.PRO;
  if ([MEMBERSHIP_TYPES.FREE, "gratis", "free"].includes(canonica)) return MEMBERSHIP_TYPES.FREE;

  const legacy = normalizar(
    usuario.membershipTier
    || usuario.membresia
    || usuario.plan
    || usuario.subscriptionTier
    || usuario.suscripcion
    || usuario.planCuentaProfesional
    || usuario.modalidadRegistroProfesional
    || ""
  );
  if (["pro", "profesional", "premium", "plus", "intermedio", "profesional_codigo"].includes(legacy)) {
    return MEMBERSHIP_TYPES.PRO;
  }
  return MEMBERSHIP_TYPES.FREE;
}

export const obtenerTipoMembresia = obtenerNivelMembresia;

export function usuarioTieneMembresiaPro(usuario = {}) {
  return obtenerTipoMembresia(usuario) === MEMBERSHIP_TYPES.PRO;
}

export function resolverEntitlementsMembresia(usuario = {}) {
  const tier = obtenerTipoMembresia(usuario);
  const isPro = tier === MEMBERSHIP_TYPES.PRO;
  const isAdmin = esAdministrador(usuario);
  const accesoCompletoProducto = isPro || isAdmin;

  return {
    tier,
    tipoMembresia: tier,
    isFree: !isPro,
    isPro,
    canUseGeneralNotes: true,
    canAccessAllNonAdminFeatures: accesoCompletoProducto,
    canManagePlatform: isAdmin,
    canRemoveCognicionBranding: accesoCompletoProducto,
    canUseCustomTitle: accesoCompletoProducto,
    canUseCustomNoteBuilder: accesoCompletoProducto,
    canUseAdvancedConfigurations: accesoCompletoProducto,
    brandingLabel: accesoCompletoProducto
      ? "Funciones Pro habilitadas"
      : "Con identidad COGNICION - Membresía gratuita",
    requiresCognicionBranding: !accesoCompletoProducto
  };
}

export function sanitizarTituloPersonalizado(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function validarTituloPersonalizado(value = "") {
  const titulo = sanitizarTituloPersonalizado(value);
  if (!titulo) return { valid: false, message: "Escribe un titulo para la nota." };
  const prohibidos = /\b(fray|bernardino|navarro|imss|issste|secretaria de salud|hospital psiquiatrico)\b/i;
  if (prohibidos.test(titulo)) {
    return { valid: false, message: "El titulo no puede sugerir una institucion no autorizada." };
  }
  return { valid: true, title: titulo };
}
