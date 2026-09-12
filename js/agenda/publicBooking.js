import { getProfessional } from "../services/professionalsService.js";
import { validSlug } from "../services/professionalsDirectoryLogic.js";
import { element, link } from "../components/professionalCards.js";
import { obtenerFunctions } from "../firebase.js";
const root = document.createElement("main"); root.id = "publicAgenda"; root.className = "professional-shell";
document.body.append(root); document.body.classList.remove("bloqueado");
root.append(link("Volver al directorio", "directorio.html"), element("h1", "Agendar cita"));
const status = element("p", "Cargando profesional…"); status.setAttribute("role", "status"); root.append(status);
let callable;
async function command(payload) {
  callable ||= Promise.all([obtenerFunctions(), import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")])
    .then(([functions, { httpsCallable }]) => httpsCallable(functions, "managePublicAppointment", { timeout: 60000 }));
  return (await (await callable)(payload)).data;
}
function field(form, title, name, type = "text") {
  const label = element("label", title), input = element("input");
  input.name = name; input.type = type; input.required = true; label.append(input); form.append(label); return input;
}
async function start() {
  const slug = new URLSearchParams(location.search).get("professional");
  const p = validSlug(slug) ? await getProfessional(slug) : null;
  if (!p) { status.textContent = "Este profesional no existe o no está publicado."; return; }
  root.append(element("h2", p.displayName));
  if (!p.acceptingPatients) { status.textContent = "Este profesional no acepta nuevos pacientes actualmente."; return; }
  const form = element("form", "", "professional-booking"), date = field(form, "Fecha", "date", "date");
  const search = element("button", "Consultar disponibilidad"); search.type = "button";
  const zone = element("p"), slotLabel = element("label", "Horario disponible"), slots = element("select");
  slots.required = true; slots.name = "time"; slots.disabled = true; slotLabel.append(slots); form.append(search, zone, slotLabel);
  const name = field(form, "Nombre completo", "patientName"); name.maxLength = 160; name.autocomplete = "name";
  const phone = field(form, "Teléfono con código de país", "patientPhone", "tel"); phone.pattern = "\\+?[0-9]{8,15}"; phone.autocomplete = "tel";
  const consentLabel = element("label"), consent = element("input"); consent.type = "checkbox"; consent.required = true;
  consentLabel.append(consent, document.createTextNode(" Acepto el uso de mis datos para gestionar esta cita. "), link("Aviso de privacidad", "aviso-privacidad.html"));
  const submit = element("button", "Confirmar cita"); submit.type = "submit"; submit.disabled = true;
  form.append(consentLabel, submit); root.append(form); status.textContent = "Elige una fecha para consultar los horarios disponibles.";
  let busy = false, selectedDate = "", retry = null, completed = false;
  const disable = value => {
    busy = value; [...form.elements].forEach(control => { control.disabled = value; });
    if (!value) { slots.disabled = !slots.options.length; submit.disabled = !slots.options.length; }
  };
  date.addEventListener("input", () => { slots.replaceChildren(); slots.disabled = true; submit.disabled = true; selectedDate = ""; });
  search.addEventListener("click", async () => {
    if (busy || completed || !date.reportValidity()) return;
    disable(true); slots.replaceChildren(); status.textContent = "Consultando disponibilidad…";
    try {
      const result = await command({ action: "slots", agendaProfessionalId: slug, date: date.value });
      selectedDate = date.value; zone.textContent = "Horarios en " + result.timeZone + ".";
      slots.replaceChildren(...result.slots.map(slot => new Option(slot.startTime, slot.startTime)));
      status.textContent = result.slots.length ? "Selecciona un horario y confirma tus datos." : "No hay horarios disponibles para esta fecha.";
    } catch { status.textContent = "No fue posible consultar la disponibilidad. Puedes reintentar."; }
    finally { disable(false); }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || completed || date.value !== selectedDate || !slots.value || !form.reportValidity()) return;
    const payload = { action: "create", agendaProfessionalId: slug, date: date.value, time: slots.value, patientName: name.value.trim(), patientPhone: phone.value, consent: consent.checked };
    const fingerprint = JSON.stringify(payload);
    if (retry && retry.fingerprint !== fingerprint) { status.textContent = "Hay una solicitud pendiente de confirmar. Reintenta con los mismos datos antes de cambiar la cita."; return; }
    retry ||= { fingerprint, requestId: crypto.randomUUID() };
    disable(true); status.textContent = "Confirmando cita…";
    try {
      const result = await command({ ...payload, requestId: retry.requestId });
      if (result.result !== "applied") throw Error("unconfirmed");
      completed = true; status.textContent = "Tu cita quedó registrada en Agenda."; form.reset(); form.hidden = true; retry = null;
    } catch {
      status.textContent = "No se pudo confirmar la cita. Reintenta con los mismos datos; la solicitud no se duplicará.";
      console.warn("[COGNICION][DIRECTORY] Confirmación pendiente.");
    } finally { if (!completed) disable(false); }
  });
}
void start().catch(() => { status.textContent = "No fue posible cargar el agendamiento en este momento."; });

