/** Catálogo centralizado de funciones existentes, sin HTML ni datos sensibles. */
export const FEATURE_TIPS = Object.freeze([
  { id: "import-patient-notes", text: "Puedes importar notas previas de tus pacientes desde un archivo DOCX.", icon: "↥", route: "medico.html", pages: ["dashboard", "medico", "nota"], categories: ["clinica", "medico", "nota"], priority: 3, enabled: true },
  { id: "patient-folders", text: "Puedes organizar a tus pacientes mediante carpetas desde el Panel Médico.", icon: "▣", route: "medico.html", pages: ["dashboard", "medico", "pacientes"], categories: ["clinica", "medico"], priority: 3, enabled: true },
  { id: "patient-record-sections", text: "Puedes consultar notas, diagnósticos, tratamientos y estudios desde el expediente.", icon: "▤", route: "paciente.html", pages: ["paciente"], categories: ["expediente", "notas", "tratamiento"], priority: 4, enabled: true },
  { id: "patient-timeline", text: "Puedes revisar la evolución del paciente mediante la línea de tiempo.", icon: "◷", route: "linea-tiempo.html", pages: ["paciente", "historia"], categories: ["cronologia", "historia"], priority: 4, enabled: true },
  { id: "patient-visibility", text: "Puedes modificar qué apartados son visibles en el resumen del paciente.", icon: "◌", route: "paciente.html", pages: ["paciente"], categories: ["permisos", "expediente"], priority: 2, enabled: true },
  { id: "patient-export", text: "Puedes exportar información del expediente desde los módulos compatibles.", icon: "⇩", route: "paciente.html", pages: ["paciente", "historia"], categories: ["exportacion"], priority: 2, enabled: true },
  { id: "note-manual-diagnosis", text: "Puedes añadir un diagnóstico manual desde la nota clínica.", icon: "⌁", route: "nota.html", pages: ["nota"], categories: ["diagnosticos", "notas"], priority: 4, enabled: true },
  { id: "note-dictation", text: "El dictado por voz puede ayudarte a estructurar una nota clínica.", icon: "◉", route: "nota-por-voz.html", pages: ["nota"], categories: ["dictado", "notas"], priority: 3, enabled: true },
  { id: "note-outcome", text: "Puedes guardar pronóstico y destino usando las opciones del formulario.", icon: "✓", route: "nota.html", pages: ["nota"], categories: ["notas", "tratamiento"], priority: 2, enabled: true },
  { id: "history-structure", text: "La historia clínica organiza antecedentes y datos relevantes del paciente.", icon: "▥", route: "historia.html", pages: ["historia"], categories: ["historia", "antecedentes"], priority: 4, enabled: true },
  { id: "diagnosis-equivalences", text: "Puedes agrupar equivalencias entre CIE-10, CIE-11 y DSM-5.", icon: "⊕", route: "paciente.html", pages: ["paciente", "diagnosticos"], categories: ["diagnosticos", "cie10", "cie11", "dsm5"], priority: 3, enabled: true },
  { id: "manual-diagnosis-catalog", text: "Puedes registrar diagnósticos manuales cuando no estén en el catálogo.", icon: "＋", route: "paciente.html", pages: ["paciente", "diagnosticos"], categories: ["diagnosticos"], priority: 3, enabled: true },
  { id: "treatment-interactions", text: "Puedes revisar advertencias e interacciones de los medicamentos registrados.", icon: "⚕", route: "paciente.html", pages: ["paciente", "tratamiento"], categories: ["tratamiento", "interacciones", "farmacologia"], priority: 4, enabled: true },
  { id: "treatment-history", text: "El historial permite consultar cambios previos del tratamiento.", icon: "◴", route: "paciente.html", pages: ["paciente", "tratamiento"], categories: ["tratamiento", "historial"], priority: 3, enabled: true },
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
