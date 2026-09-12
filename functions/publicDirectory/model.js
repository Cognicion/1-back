"use strict";
const text = (v, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const list = v => Array.isArray(v) ? [...new Set(v.map(x => text(x, 160)).filter(Boolean))].slice(0, 40) : [];
const validSlug = v => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 64;
function photo(v) {
  try { const u = new URL(text(v, 2048)); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; }
  catch { return ""; }
}
function records(v, keys) {
  return Array.isArray(v) ? v.slice(0, 30).map(row => Object.fromEntries(keys.map(k => [k, text(row?.[k], k === "description" ? 2000 : 240)]))).filter(row => Object.values(row).some(Boolean)) : [];
}
/** Explicit publication consent. Never spread a private user document. */
function publicProfile(raw = {}, agendaServices = null) {
  const p = raw.publicDirectory || {};
  if (p.publicProfile !== true || !validSlug(p.profileSlug)) return null;
  const configured = Array.isArray(agendaServices?.services);
  return {
    id: p.profileSlug, profileSlug: p.profileSlug, agendaProfessionalId: p.profileSlug,
    displayName: text(raw.nombre, 240), professionalTitle: text(p.professionalTitle, 160),
    photoUrl: p.publishPhoto === true ? photo(raw.fotoProfesional) : "",
    specialties: list(Array.isArray(raw.especialidad) ? raw.especialidad : [raw.especialidad]),
    biography: text(raw.descripcionProfesional),
    professionalLicense: p.publishLicense === true ? text(raw.cedulaProfesional, 100) : "",
    clinicalExperience: list(p.clinicalExperience), populations: list(p.populations),
    services: configured ? list(agendaServices.services.map(s => s.label || s.name)) : list(p.services),
    modalities: configured ? list(agendaServices.services.map(s => s.modality)) : list(p.modalities),
    languages: list(p.languages),
    education: records(p.education, ["title", "institution", "year", "description"]),
    professionalExperience: records(p.professionalExperience, ["position", "institution", "startYear", "endYear", "description"]),
    publicProfile: true, acceptingPatients: configured ? agendaServices.acceptsNewPatients !== false : p.acceptingPatients === true,
    featured: p.featured === true, displayOrder: Number.isFinite(p.displayOrder) ? p.displayOrder : 0
  };
}
module.exports = { publicProfile, validSlug };

