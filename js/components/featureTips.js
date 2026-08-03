/** Catálogo centralizado de funciones existentes, sin HTML ni datos sensibles. */
export const FEATURE_TIPS = Object.freeze([
  { id: "import-patient-notes", text: "Puedes importar notas previas de tus pacientes desde un archivo DOCX.", icon: "↥", route: "medico.html", pages: ["dashboard", "medico", "nota"], categories: ["clinica", "medico", "nota"], priority: 3, enabled: true },
  { id: "patient-folders", text: "Puedes organizar a tus pacientes mediante carpetas desde el Panel Médico.", icon: "▣", route: "medico.html", pages: ["dashboard", "medico", "pacientes"], categories: ["clinica", "medico"], priority: 3, enabled: true },
  { id: "timeline", text: "Puedes revisar la evolución de un paciente desde la línea de tiempo.", icon: "◷", route: "linea-tiempo.html", pages: ["dashboard", "paciente", "historia", "nota"], categories: ["clinica", "paciente", "historia"], priority: 3, enabled: true },
  { id: "sofia", text: "SOFÍA puede ayudarte a organizar conocimiento y documentación.", icon: "✦", route: "sofia.html", pages: ["dashboard", "sofia", "nota"], categories: ["general", "sofia", "nota"], priority: 2, enabled: true },
  { id: "manual-diagnosis", text: "Puedes añadir diagnósticos manuales y decidir si se incorporan a la Biblioteca.", icon: "⌁", route: "diagnosticos.html", pages: ["dashboard", "paciente", "nota", "diagnosticos"], categories: ["clinica"], priority: 2, enabled: true },
  { id: "personal-notes", text: "Puedes registrar recordatorios y pendientes desde Mis apuntes.", icon: "✎", route: "apuntes.html", pages: ["dashboard", "apuntes", "agenda"], categories: ["general", "apuntes", "agenda"], priority: 2, enabled: true },
  { id: "pharmacology", text: "Puedes consultar interacciones dentro del Laboratorio de Farmacología.", icon: "⚕", route: "laboratorio-farmacologia.html", pages: ["dashboard", "paciente", "laboratorio-farmacologia"], categories: ["farmacologia", "clinica"], priority: 2, enabled: true },
  { id: "clinical-scales", text: "Puedes aplicar y consultar escalas clínicas desde el módulo de Escalas.", icon: "▤", route: "escalas.html", pages: ["dashboard", "escalas", "paciente"], categories: ["escalas", "clinica"], priority: 2, enabled: true },
  { id: "neurophysiology", text: "El Laboratorio de Neurofisiología permite explorar sinapsis y modelos bioeléctricos.", icon: "⌬", route: "laboratorio-neurofisiologia.html", pages: ["dashboard", "laboratorio-neurofisiologia"], categories: ["neurofisiologia"], priority: 1, enabled: true },
  { id: "control-center", text: "Puedes revisar actividad, permisos y reportes desde el Centro de Control.", icon: "⚙", route: "admin.html", pages: ["dashboard", "admin"], categories: ["admin"], roles: ["admin"], priority: 1, enabled: true },
  { id: "themes", text: "Puedes cambiar entre los temas Claro, Oscuro y Biocelular.", icon: "◐", route: "configuracion.html", pages: ["dashboard", "configuracion"], categories: ["general", "configuracion"], priority: 1, enabled: true }
]);

export function getFeatureTips({ pageId, pageCategories = [], role = "" } = {}) {
  const categories = new Set(pageCategories);
  const scoped = FEATURE_TIPS.filter((tip) => {
    if (!tip.enabled) return false;
    if (tip.roles?.length && role && !tip.roles.includes(role)) return false;
    if (tip.roles?.length && !role) return false;
    const pageMatch = tip.pages?.includes(pageId) || tip.categories?.some((category) => categories.has(category));
    return pageMatch || tip.categories?.includes("general");
  });
  return [...scoped].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
