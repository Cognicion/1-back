import { profileUrl, agendaUrl } from "../services/professionalsDirectoryLogic.js";
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function portrait(p) {
  const frame = element("div", "", "professional-photo");
  const fallback = element("span", "Sin fotografía", "professional-avatar");
  fallback.setAttribute("role", "img"); fallback.setAttribute("aria-label", "Fotografía no disponible");
  frame.append(fallback);
  let url;
  try { url = new URL(p.photoUrl); } catch { return frame; }
  if (url.protocol !== "https:" || url.username || url.password) return frame;
  const img = document.createElement("img");
  img.alt = "Fotografía de " + p.displayName;
  img.loading = "lazy"; img.decoding = "async"; img.width = 400; img.height = 400;
  img.referrerPolicy = "no-referrer";
  img.addEventListener("load", () => { fallback.hidden = true; }, { once: true });
  img.addEventListener("error", () => { img.remove(); fallback.hidden = false; }, { once: true });
  img.src = url.href; frame.append(img);
  return frame;
}
export function chips(values = []) {
  const list = element("ul", "", "professional-chips");
  values.forEach(v => list.append(element("li", v)));
  return list;
}
export function link(label, href) { const a = element("a", label, "professional-button"); a.href = href; return a; }
export function bookingLink(p, label = "Agendar") { return agendaUrl(p) ? link(label, agendaUrl(p)) : element("p", "Agendamiento no disponible."); }
export function renderCards(root, profiles) {
  root.replaceChildren(...profiles.map(p => {
    const card = element("article", "", "professional-card"), content = element("div", "", "professional-card-content");
    content.append(element("h3", p.displayName || "Profesional"), element("p", (p.specialties || []).join(" · ")), chips((p.clinicalExperience || []).slice(0, 4)));
    const actions = element("div", "", "professional-actions");
    actions.append(link("Ver perfil", profileUrl(p)), bookingLink(p));
    content.append(actions); card.append(portrait(p), content); return card;
  }));
}

