import { sugerirTipoNota, NOTE_TYPE_RULES } from "../../importacionDocx/noteTypeDetector.js";

export function parseNoteMetadata({ text = "", sections = {}, fields = {} } = {}) {
  const detectedType = sugerirTipoNota({ textoPlano: text, secciones: sections });
  const suggestedType = detectedType.confianza > 0
    ? detectedType
    : { key: "tipo_no_reconocido", label: "Tipo no reconocido", confianza: 0, candidatos: [] };
  return {
    suggestedType,
    documentDate: fields.fecha?.value || "",
    documentHour: fields.hora?.value || "",
    service: fields.servicio?.value || "",
    attendingDoctor: fields.medicoTratante?.value || "",
    assignedDoctor: fields.medicoAdscrito?.value || ""
  };
}

export { NOTE_TYPE_RULES };
