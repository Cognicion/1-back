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

function valoresPerfilUsuario(perfil = {}) {
  if (!perfil || typeof perfil !== "object") return [];
  const valores = [
    perfil.rol,
    perfil.role,
    perfil.rolUsuario,
    perfil.tipoRol,
    perfil.tipoUsuario,
    perfil.tipoCuenta,
    perfil.tipoProfesional,
    perfil.profesion,
    perfil.profession,
    perfil.especialidad,
    perfil.specialty,
    perfil.cargo,
    perfil.perfilClinico,
    perfil.perfilProfesional,
    perfil.professionalProfile?.type,
    perfil.professionalProfile?.role,
    perfil.professionalProfile?.profession,
    perfil.clinicalProfile?.type,
    perfil.clinicalProfile?.role,
    perfil.clinicalProfile?.profession
  ];

  if (Array.isArray(perfil.roles)) valores.push(...perfil.roles);
  if (Array.isArray(perfil.capacidades)) valores.push(...perfil.capacidades);
  if (Array.isArray(perfil.capabilities)) valores.push(...perfil.capabilities);
  if (perfil.roles && typeof perfil.roles === "object" && !Array.isArray(perfil.roles)) {
    Object.entries(perfil.roles).forEach(([rol, activo]) => {
      if (activo) valores.push(rol);
    });
  }
  if (perfil.capacidades && typeof perfil.capacidades === "object" && !Array.isArray(perfil.capacidades)) {
    Object.entries(perfil.capacidades).forEach(([capacidad, activo]) => {
      if (activo) valores.push(capacidad);
    });
  }
  if (perfil.capabilities && typeof perfil.capabilities === "object" && !Array.isArray(perfil.capabilities)) {
    Object.entries(perfil.capabilities).forEach(([capacidad, activo]) => {
      if (activo) valores.push(capacidad);
    });
  }

  return valores.filter(Boolean);
}

export function isAdministrator(perfil = "") {
  const valores = typeof perfil === "object"
    ? valoresPerfilUsuario(perfil)
    : [perfil];
  if (typeof perfil === "object" && (
    perfil.admin === true ||
    perfil.esAdmin === true ||
    perfil.isAdmin === true ||
    perfil.permisos?.admin === true ||
    perfil.claims?.admin === true ||
    perfil.roles?.admin === true
  )) {
    return true;
  }
  return valores.some((valor) => [
    "admin",
    "administrador",
    "superadmin",
    "admin_principal",
    "administrador_principal"
  ].includes(normalizarRol(valor)));
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
  if (normalizado.includes("medico") || normalizado.includes("medica")) return true;
  return [
    "medico",
    "medica",
    "psiquiatra",
    "psiquiatria",
    "medico_general",
    "medicina_general",
    "medicina_interna",
    "internista",
    "pediatra",
    "pediatria",
    "paidopsiquiatra",
    "paidopsiquiatria",
    "doctor",
    "doctora"
  ].includes(normalizado) || usuarioEsEnfermeriaSaludMental(normalizado);
}

export function usuarioEsPersonalClinico(rol = "") {
  const normalizado = normalizarRol(rol);
  return usuarioEsProfesionalTipoMedico(normalizado) ||
    normalizado === "psicologo" ||
    normalizado.includes("psicolog");
}

export function hasClinicalProfessionalProfile(perfil = "") {
  if (typeof perfil !== "object" || perfil === null) {
    return usuarioEsPersonalClinico(perfil);
  }

  const valores = valoresPerfilUsuario(perfil);
  const tieneRolClinico = valores.some((valor) => usuarioEsPersonalClinico(valor));
  if (tieneRolClinico && !isAdministrator(perfil)) return true;

  const clinicoExplicito =
    perfil.perfilClinicoHabilitado === true ||
    perfil.clinicalProfileEnabled === true ||
    perfil.perfilMedicoVerificado === true ||
    perfil.medicoVerificado === true ||
    perfil.professionalProfile?.enabled === true ||
    perfil.clinicalProfile?.enabled === true;

  const tieneDatosProfesionales = Boolean(
    perfil.cedulaProfesional ||
    perfil.cedula ||
    perfil.cedulaEspecialidad ||
    perfil.perfilProfesionalActualizado
  );

  if (isAdministrator(perfil)) {
    return clinicoExplicito || (tieneRolClinico && tieneDatosProfesionales);
  }

  return tieneRolClinico || clinicoExplicito;
}

export function canUseMedicalAgenda(perfil = {}) {
  return hasClinicalProfessionalProfile(perfil);
}

export function canManagePlatform(perfil = {}) {
  return isAdministrator(perfil);
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
