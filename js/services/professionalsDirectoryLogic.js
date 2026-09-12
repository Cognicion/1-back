export const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
export const validSlug = v => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 64;
export const generateSlug = v => normalizeSearch(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-$/, "");
export const FILTERS = { specialties: "Especialidad", clinicalExperience: "Área clínica", populations: "Población", modalities: "Modalidad", languages: "Idioma" };
export function filterProfessionals(profiles, search = "", filters = {}) {
  const tokens = normalizeSearch(search).split(" ").filter(Boolean);
  return profiles.filter(p => p.publicProfile === true && tokens.every(token => normalizeSearch([
    p.displayName, ...(p.specialties || []), ...(p.clinicalExperience || []), ...(p.services || []), ...(p.populations || [])
  ].join(" ")).includes(token)) && Object.keys(FILTERS).every(key => !filters[key] || (p[key] || []).some(v => normalizeSearch(v) === normalizeSearch(filters[key])))
    && (!filters.acceptingPatients || p.acceptingPatients === (filters.acceptingPatients === "true")));
}
export function filterOptions(profiles, key) {
  const values = new Map();
  profiles.filter(p => p.publicProfile === true).flatMap(p => p[key] || []).forEach(v => values.set(normalizeSearch(v), v));
  return [...values.values()].sort((a, b) => a.localeCompare(b, "es"));
}
export const profileUrl = p => validSlug(p.profileSlug) ? "profesional.html?slug=" + encodeURIComponent(p.profileSlug) : "";
export const agendaUrl = p => validSlug(p.agendaProfessionalId) ? "agenda.html?professional=" + encodeURIComponent(p.agendaProfessionalId) : "";
export function profileSlugFromSearch(search) { const value = new URLSearchParams(search).get("slug"); return validSlug(value) ? value : null; }

