import { obtenerFunctions } from "../firebase.js";

// Loaded only from Agenda settings. No credentials or channel data in storage.
export async function initializeWhatsAppSettings(root, { signal, call: injectedCall } = {}) {
  const status = root.querySelector("[data-bot-status]");
  let call = injectedCall;
  const form = root.querySelector("[data-bot-form]");
  const field = name => form.elements.namedItem(name);
  const show = text => { if (!signal?.aborted) status.textContent = text; };
  let pending = false;
  async function execute(data) {
    if (pending || signal?.aborted) return;
    pending = true;
    root.querySelectorAll("button").forEach(x => { x.disabled = true; });
    try {
      const result = await call(data);
      if (signal?.aborted) return;
      const x = result.settings || {}, r = x.reminders || {};
      field("enabled").checked = x.enabled === true;
      field("label").value = x.label || "";
      field("displayName").value = x.displayName || x.label || "";
      field("specialty").value = x.specialty || "";
      field("slug").value = x.slug || "";
      field("aliases").value = (x.aliases || []).join(", ");
      field("location").value = x.location || "";
      field("acceptsNewPatients").checked = x.acceptsNewPatients !== false;
      root.querySelector("[data-bot-services]").replaceChildren();
      (x.services?.length ? x.services : [{ id: "consulta", label: "Consulta", durationMinutes: 60 }]).forEach(addService);
      field("reminders").checked = r.enabled === true;
      field("advance").value = r.advanceMinutes || 1440;
      field("start").value = r.startHour ?? 9; field("end").value = r.endHour ?? 20;
      field("unconfirmed").checked = r.onlyUnconfirmed === true;
      field("template").value = r.template?.name || ""; field("language").value = r.template?.language || "es_MX";
      root.querySelector("[data-bot-admin]").hidden = !result.admin;
      if (result.channel.mode && channelForm?.elements?.mode) { channelForm.elements.mode.value = result.channel.mode; showChannelMode(); }
      const template = result.templateStatus === 'not_checked' ? 'sin comprobar en esta consulta' : result.templateStatus;
      const mode = result.channel.mode === "production" ? `oficial ···${result.channel.numberSuffix || "----"}` : "piloto restringido";
      const recipients = result.channel.mode === "pilot" ? ` ${result.channel.authorizedRecipientCount || 0} destinatarios piloto.` : "";
      show(`${data.action === 'linkAppointment' ? 'Vinculación autorizada. ' : ''}Canal: ${result.channel.configured ? result.channel.enabled ? `${mode} habilitado` : `${mode} detenido` : "sin configurar"}.${recipients} Profesional: ${x.enabled ? "habilitado" : "detenido"}. Plantilla: ${template}; se comprueba nuevamente antes de enviar. Cobro automático deshabilitado.`);
    } catch {
      show("No se pudo leer o guardar la configuración. Comprueba la Function, autorización, canal y jornada. No se confirmó ningún cambio.");
    } finally {
      pending = false;
      if (!signal?.aborted) root.querySelectorAll("button").forEach(x => { x.disabled = false; });
    }
  }
  function addService(service = { id: `servicio_${Date.now()}`, label: "", durationMinutes: 60 }) {
    const row = document.createElement("div"); row.className = "integration-row"; row.dataset.serviceId = service.id;
    for (const [key, label, type, value, required] of [["label", "Servicio", "text", service.label, true], ["duration", "Minutos", "number", service.durationMinutes, true], ["modality", "Modalidad", "text", service.modality || "", false]]) {
      const wrap = document.createElement("label"); wrap.textContent = label;
      const input = document.createElement("input"); input.dataset.serviceField = key; input.type = type; input.value = value; input.required = required;
      if (type === "number") { input.min = 5; input.max = 480; } else input.maxLength = key === "modality" ? 40 : 24;
      wrap.append(input); row.append(wrap);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Quitar";
    remove.addEventListener("click", () => row.remove(), { signal }); row.append(remove);
    root.querySelector("[data-bot-services]").append(row);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const services = [...root.querySelectorAll("[data-service-id]")].map(row => ({ id: row.dataset.serviceId, label: row.querySelector('[data-service-field="label"]').value.trim(), durationMinutes: Number(row.querySelector('[data-service-field="duration"]').value), ...(row.querySelector('[data-service-field="modality"]').value.trim() ? { modality:row.querySelector('[data-service-field="modality"]').value.trim() } : {}) }));
    execute({ action: "save", settings: { enabled: field("enabled").checked, label: field("label").value.trim(), displayName:field("displayName").value.trim(), specialty:field("specialty").value.trim(), slug:field("slug").value.trim().toLowerCase(), aliases:field("aliases").value.split(",").map(value=>value.trim()).filter(Boolean), location:field("location").value.trim(), acceptsNewPatients:field("acceptsNewPatients").checked, services, reminders: { enabled: field("reminders").checked, advanceMinutes: Number(field("advance").value), startHour: Number(field("start").value), endHour: Number(field("end").value), onlyUnconfirmed: field("unconfirmed").checked, template: field("template").value.trim() ? { name: field("template").value.trim(), language: field("language").value.trim() } : null } } });
  }, { signal });
  root.querySelector("[data-bot-add]").addEventListener("click", () => { if (root.querySelectorAll("[data-service-id]").length < 10) addService(); }, { signal });
  root.querySelector("[data-bot-stop]").addEventListener("click", () => execute({ action: "stop" }), { signal });
  root.querySelector("[data-bot-reload]").addEventListener("click", () => execute({ action: "get" }), { signal });
  root.querySelector("[data-bot-template]").addEventListener("click", () => execute({ action: "checkTemplate" }), { signal });
  root.querySelector("[data-bot-stop-channel]").addEventListener("click", () => execute({ action: "stopChannel" }), { signal });
  root.querySelector("[data-bot-link]").addEventListener("submit", event => {
    event.preventDefault(); const f = event.currentTarget.elements;
    const data = { action: 'linkAppointment', appointmentId: f.appointmentId.value.trim(), phone: f.phone.value.trim(), confirm: f.confirm.checked };
    f.phone.value = ''; f.confirm.checked = false; execute(data);
  }, { signal });
  const channelForm=root.querySelector("[data-bot-channel]");
  const channelData = () => { const f=channelForm.elements,mode=f.mode.value; return {enabled:f.channelEnabled.checked,mode,phoneNumberId:f.phoneId.value.trim(),wabaId:f.wabaId.value.trim(),graphVersion:f.graphVersion.value.trim(),officialNumberSuffix:f.numberSuffix.value.trim(),professionalIds:f.professionals.value.split(/[,\s]+/).filter(Boolean),allowedPhones:f.phones.value.split(/[,\s]+/).filter(Boolean)}; };
  const showChannelMode = () => { const pilot=channelForm.elements.mode.value==='pilot';root.querySelectorAll('[data-pilot-channel]').forEach(node=>{node.hidden=!pilot;});root.querySelector('[data-production-channel]').hidden=pilot; };
  channelForm.elements.mode.addEventListener('change',showChannelMode,{signal});showChannelMode();
  root.querySelector('[data-bot-inspect]').addEventListener('click',async()=>{
    if(pending||signal?.aborted)return;pending=true;root.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    try{const result=await call({action:'inspectChannel',channel:channelData()});show(result.verified?`Meta confirmó Cloud API conectada para ···${result.numberSuffix}. Suscripción de app: ${result.subscribed?'activa':'pendiente'}.`:`Meta no confirmó esos activos (${result.code||'sin detalle'}). No se guardó ningún cambio.`);}catch{show('No fue posible verificar los activos en Meta. No se guardó ningún cambio.');}finally{pending=false;if(!signal?.aborted)root.querySelectorAll('button').forEach(button=>{button.disabled=false;});}
  },{signal});
  root.querySelector('[data-bot-handoffs]').addEventListener('click',async()=>{
    if(pending||signal?.aborted)return;pending=true;root.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    try{
      const result=await call({action:'listHandoffs'}),list=root.querySelector('[data-bot-handoff-list]');list.replaceChildren();
      if(!result.tickets?.length){const empty=document.createElement('p');empty.className='agenda-hint';empty.textContent='No hay solicitudes activas.';list.append(empty);return;}
      result.tickets.forEach(ticket=>{const row=document.createElement('div');row.className='integration-row';const summary=document.createElement('span');const when=ticket.requestedAt?new Date(ticket.requestedAt).toLocaleString('es-MX'):'hora no disponible';summary.textContent=`···${ticket.numberSuffix||'----'} · ${ticket.reason} · ${when}`;const resolve=document.createElement('button');resolve.type='button';resolve.textContent='Marcar atendida';resolve.addEventListener('click',()=>execute({action:'resolveHandoff',subject:ticket.subject,confirm:true}),{signal});row.append(summary,resolve);list.append(row);});
    }catch{show('No fue posible consultar las solicitudes humanas.');}finally{pending=false;if(!signal?.aborted)root.querySelectorAll('button').forEach(button=>{button.disabled=false;});}
  },{signal});
  channelForm.addEventListener("submit", event => {
    event.preventDefault(); const f = event.currentTarget.elements;
    const data = { action: "configureChannel", channel: channelData() };
    f.phones.value = ""; execute(data);
  }, { signal });
  try {
    if (!call) {
      const [{ httpsCallable }, functions] = await Promise.all([import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"), obtenerFunctions()]);
      const remote = httpsCallable(functions, "configureWhatsAppBot"); call = async data => (await remote(data)).data;
    }
    await execute({ action: "get" });
  } catch { show("Configuración de WhatsApp no disponible. No se habilitó la automatización."); }
}
