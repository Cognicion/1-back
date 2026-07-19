function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const MEMBERSHIP_TIERS = Object.freeze({
  BASIC: "basic",
  PLUS: "plus",
  PRO: "pro"
});

export function obtenerNivelMembresia(usuario = {}) {
  const raw = normalizar(
    usuario.membershipTier ||
    usuario.membresia ||
    usuario.plan ||
    usuario.subscriptionTier ||
    usuario.suscripcion ||
    "basic"
  );
  if (["pro", "profesional", "premium"].includes(raw)) return MEMBERSHIP_TIERS.PRO;
  if (["plus", "intermedio"].includes(raw)) return MEMBERSHIP_TIERS.PLUS;
  return MEMBERSHIP_TIERS.BASIC;
}

export function resolverEntitlementsMembresia(usuario = {}) {
  const tier = obtenerNivelMembresia(usuario);
  const isPlus = tier === MEMBERSHIP_TIERS.PLUS || tier === MEMBERSHIP_TIERS.PRO;
  const isPro = tier === MEMBERSHIP_TIERS.PRO;

  return {
    tier,
    canUseGeneralNotes: true,
    canRemoveCognicionBranding: isPlus,
    canUseCustomTitle: isPlus,
    canUseCustomNoteBuilder: isPro,
    canUseAdvancedConfigurations: isPro,
    brandingLabel: tier === MEMBERSHIP_TIERS.BASIC
      ? "Con identidad COGNICION - Membresia Basica"
      : "Sin logos y con titulo personalizado - Beneficio Plus",
    requiresCognicionBranding: !isPlus
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
