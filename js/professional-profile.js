import { getProfessional, traceDirectoryError } from "./services/professionalsService.js";
import { profileSlugFromSearch, profileUrl } from "./services/professionalsDirectoryLogic.js";
import { element, portrait, chips, bookingLink } from "./components/professionalCards.js";
const root = document.getElementById("professionalProfile"), status = document.getElementById("profileStatus");
function section(title, body) { const node = element("section", "", "professional-section"); node.append(element("h2", title), body); root.append(node); }
function metadata(p) {
  document.title = p.displayName + " | COGNICIÓN";
  const description = p.biography.slice(0, 160) || "Conoce el perfil profesional de " + p.displayName + " en COGNICIÓN.";
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = document.title;
  document.querySelector('meta[property="og:description"]').content = description;
  const url = new URL(profileUrl(p), location.href).href;
  document.querySelector('meta[property="og:url"]').content = url;
  document.querySelector('link[rel="canonical"]').href = url;
  if (p.photoUrl) document.querySelector('meta[property="og:image"]').content = p.photoUrl;
}
async function load() {
  try {
    const slug = profileSlugFromSearch(location.search), p = slug ? await getProfessional(slug) : null;
    if (!p) { status.textContent = "Este perfil no existe o no está publicado."; document.title = "Perfil no disponible | COGNICIÓN"; return; }
    status.textContent = "";
    const head = element("section", "", "professional-profile-header"), summary = element("div");
    summary.append(element("h1", p.displayName), element("p", p.professionalTitle), chips(p.specialties));
    if (p.professionalLicense) summary.append(element("p", "Cédula profesional: " + p.professionalLicense));
    summary.append(bookingLink(p, "Agendar cita"), element("p", p.acceptingPatients ? "Acepta nuevos pacientes." : "No acepta nuevos pacientes actualmente."));
    head.append(portrait(p), summary); root.append(head);
    if (p.biography) section("Sobre mí", element("p", p.biography));
    [["clinicalExperience", "Áreas de experiencia clínica"], ["populations", "Población atendida"], ["services", "Servicios"], ["modalities", "Modalidades de consulta"], ["languages", "Idiomas"]].forEach(([key, title]) => { if (p[key]?.length) section(title, chips(p[key])); });
    if (p.education?.length) {
      const list = element("div");
      p.education.forEach(item => {
        const row = element("article"); row.append(element("h3", item.title), element("p", [item.institution, item.year].filter(Boolean).join(" · ")), element("p", item.description)); list.append(row);
      }); section("Formación académica", list);
    }
    if (p.professionalExperience?.length) {
      const list = element("div");
      p.professionalExperience.forEach(item => {
        const row = element("article"); row.append(element("h3", item.position), element("p", [item.institution, [item.startYear, item.endYear].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")), element("p", item.description)); list.append(row);
      }); section("Experiencia profesional", list);
    }
    metadata(p);
  } catch { traceDirectoryError(); status.textContent = "No fue posible cargar el perfil en este momento."; }
  finally { root.setAttribute("aria-busy", "false"); }
}
void load();

