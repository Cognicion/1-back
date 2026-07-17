export const ROL_ENFERMERIA_SALUD_MENTAL = "enfermeria_salud_mental";

export const ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL = "Lic. en Enfermeria / Asesor(a) en Salud Mental";

export function normalizarRol(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function usuarioEsEnfermeriaSaludMental(rol = "") {
  const normalizado = normalizarRol(rol);
  return normalizado === ROL_ENFERMERIA_SALUD_MENTAL ||
    normalizado === "enfermeriasaludmental" ||
    normalizado === "lic_en_enfermeria_asesor_a_en_salud_mental" ||
    normalizado === "lic_en_enfermeria_asesor_en_salud_mental" ||
    normalizado === "enfermeria" ||
    normalizado === "asesor_salud_mental";
}

export function usuarioEsProfesionalTipoMedico(rol = "") {
  const normalizado = normalizarRol(rol);
  return normalizado === "medico" || usuarioEsEnfermeriaSaludMental(normalizado);
}

export function usuarioEsPersonalClinico(rol = "") {
  const normalizado = normalizarRol(rol);
  return usuarioEsProfesionalTipoMedico(normalizado) || normalizado === "psicologo";
}

export function etiquetaRolClinico(rol = "") {
  if (usuarioEsEnfermeriaSaludMental(rol)) return ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL;
  const normalizado = normalizarRol(rol);
  const etiquetas = {
    paciente: "Paciente",
    medico: "Medico",
    psicologo: "Psicologo",
    admin: "Admin",
    sin_rol: "Sin rol"
  };
  return etiquetas[normalizado] || rol || "Sin rol";
}
