import { getProfessionalsPage, traceDirectoryError } from "./services/professionalsService.js";
import { FILTERS, filterOptions, filterProfessionals } from "./services/professionalsDirectoryLogic.js";
import { element, renderCards } from "./components/professionalCards.js";
const form = document.getElementById("directoryFilters"), status = document.getElementById("directoryStatus");
const grid = document.getElementById("directoryGrid"), more = document.getElementById("directoryMore");
let profiles = [], cursor = "", busy = false;
Object.entries(FILTERS).forEach(([key, title]) => {
  const label = element("label", title), select = element("select"); select.name = key;
  select.append(new Option("Todas las opciones", "")); label.append(select); form.append(label);
});
const label = element("label", "Nuevos pacientes"), accepting = element("select"); accepting.name = "acceptingPatients";
accepting.append(new Option("Todos", ""), new Option("Acepta nuevos pacientes", "true"), new Option("No acepta nuevos pacientes", "false"));
label.append(accepting); form.append(label);
function render() {
  const values = Object.fromEntries(new FormData(form)), matches = filterProfessionals(profiles, values.search, values);
  renderCards(grid, matches);
  status.textContent = matches.length ? matches.length + " profesionales encontrados." : "No encontramos profesionales con estos filtros.";
  if (cursor) status.textContent += " Los filtros se aplican a los perfiles cargados; puedes cargar más.";
}
async function load() {
  if (busy) return;
  busy = true; more.disabled = true; grid.setAttribute("aria-busy", "true"); status.textContent = "Cargando profesionales…";
  try {
    const result = await getProfessionalsPage(cursor);
    profiles = [...new Map([...profiles, ...result.professionals].map(p => [p.id, p])).values()]; cursor = result.nextCursor;
    Object.keys(FILTERS).forEach(key => {
      const select = form.elements.namedItem(key), selected = select.value;
      select.replaceChildren(new Option("Todas las opciones", ""), ...filterOptions(profiles, key).map(v => new Option(v, v))); select.value = selected;
    });
    more.hidden = !cursor; more.textContent = "Cargar más profesionales"; render();
  } catch {
    traceDirectoryError(); status.textContent = "No fue posible cargar el directorio en este momento.";
    more.hidden = false; more.textContent = "Reintentar";
  } finally { busy = false; more.disabled = false; grid.setAttribute("aria-busy", "false"); }
}
form.addEventListener("submit", e => e.preventDefault());
form.addEventListener("input", render);
form.addEventListener("reset", () => setTimeout(render, 0));
more.addEventListener("click", load);
void load();

