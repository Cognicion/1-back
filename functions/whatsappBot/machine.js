const { hash, professionalReady } = require('./config');
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const dateInZone = (now, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0,10);
const fullDate = (date, time, zone) => `${new Intl.DateTimeFormat('es-MX', { timeZone:'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date(date+'T12:00:00Z'))}, ${time} (${zone})`;
// Deterministic administrative states. Choice IDs are tied to one inbound job;
// a bare "sí", old button or arbitrary appointment ID never authorizes a write.
async function transition({ session = {}, message, jobId, channel, recipient, professionals, api, now }) {
  const s = structuredClone(session);
  const text = normalize(message.text);
  const token = hash(jobId).slice(0,20);
  let content;
  const reply = (body, choices = []) => {
    s.choices = choices.map((x,i) => ({ ...x, id: `${token}:${i}` }));
    s.choiceExpiresAt = now + 15 * 60000;
    content = { text: body, choices: s.choices.map(({id,title,description}) => ({id,title,...(description ? {description}: {})})) };
  };
  const menu = body => { s.step='menu'; delete s.pending; reply(body || 'Agenda COGNICIÓN. Elige una acción. No envíes información clínica.', ['agendar','confirmar','reprogramar','cancelar','recordatorios','ayuda','salir'].map(value => ({ title:value, value }))); };
  const choice = message.choice && now <= (s.choiceExpiresAt || 0) ? s.choices?.find(x => x.id === message.choice) : null;
  if (message.choice && !choice) { menu('Esa opción venció o ya fue utilizada. Elige una acción nueva.'); return { session:s, content }; }
  const command = s.step === 'menu' && choice ? choice.value : text;
  if (command === 'salir') { s.step='closed'; delete s.pending; reply('Sesión cerrada. Escribe menú cuando quieras continuar.'); return {session:s,content}; }
  if (command === 'dejar de recibir recordatorios') { await api.consent(false); menu('Recordatorios desactivados. Puedes continuar gestionando tus citas.'); return {session:s,content}; }
  if (['hola','menu','ayuda'].includes(command)) { menu(command === 'ayuda' ? 'Usa agendar, confirmar, reprogramar o cancelar. Sólo puedes gestionar citas vinculadas a este canal.' : undefined); return {session:s,content}; }
  if (command === 'recordatorios') { s.step='consentOnly'; reply('¿Autorizas recordatorios administrativos por WhatsApp? Puedes retirarlo escribiendo dejar de recibir recordatorios.', [{title:'Autorizar',value:true},{title:'No autorizar',value:false}]); return {session:s,content}; }
  if (s.step === 'consentOnly' && choice) { await api.consent(choice.value); menu(choice.value ? 'Consentimiento registrado.' : 'Recordatorios desactivados.'); return {session:s,content}; }
  async function services() {
    const p = professionals[s.doctorUid];
    if (!professionalReady(p)) { menu('El profesional no tiene servicios de reserva habilitados.'); return; }
    s.step = 'service'; reply('Elige servicio / modalidad.', p.services.map(x => ({title:x.label, value:x.id})));
  }
  async function appointments() {
    const list = await api.list(s.doctorUid);
    if (!list.length) { menu('No hay citas futuras vinculadas a este canal. Las citas creadas por otra vía requieren vinculación por el profesional.'); return; }
    s.step='appointment'; reply('Elige tu cita.', list.map(x => ({title: `${x.startDate} ${x.startTime}`, description: x.timeZone, value:x})));
  }
  async function begin(action) {
    s.action=action; delete s.pending; delete s.appointmentId;
    const ids = channel.professionalIds.filter(id => professionalReady(professionals[id]));
    if (!ids.length) { menu('No hay profesionales habilitados en este canal.'); return; }
    if (ids.length > 1) { s.step='professional'; reply('Elige profesional.', ids.map(id => ({title:professionals[id].label, value:id}))); return; }
    s.doctorUid=ids[0];
    if (action === 'create') await services(); else await appointments();
  }
  async function slots(value) {
    const p = professionals[s.doctorUid];
    const zone = p.timeZone;
    if (!zone) throw Error('configuration-required');
    const today = dateInZone(now,zone);
    const date = value === 'hoy' || value === 'proximos' ? today : value === 'manana' ? addDays(today,1) : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10) !== date || date < today || date > addDays(today,90)) { reply('Indica una fecha válida AAAA-MM-DD, hoy, mañana o próximos (hasta 90 días).'); return; }
    let found=[];
    for (let i=0;i<(value==='proximos'?7:1) && found.length<8;i++) {
      const result = await api.slots(s.doctorUid, addDays(date,i), s.service.durationMinutes, s.appointmentId);
      if (!result.available) throw Error('availability-unavailable');
      found.push(...result.slots);
    }
    found=found.slice(0,8);
    if (!found.length) { s.step='date'; reply('No hay horarios reservables en ese rango. Escribe otra fecha o próximos.'); return; }
    s.step='slot'; reply('Horarios disponibles. El horario se valida nuevamente al guardar.', found.map(x => ({title:`${x.startDate} ${x.startTime}`, description: `${x.durationMinutes} min · ${x.timeZone}`, value:x})));
  }
  const summary = () => { s.step='review'; reply(`${s.action==='reschedule'?'Reprogramar':'Reservar'}: ${s.service.label}. ${fullDate(s.pending.startDate,s.pending.startTime,s.pending.timeZone)}. Duración ${s.pending.durationMinutes} minutos. Sin pago previo. ¿Confirmas esta operación?`, [{title:'Confirmar operación',value:'apply'},{title:'Volver al menú',value:'menu'}]); };
  try {
    if (['agendar','confirmar','reprogramar','cancelar'].includes(command)) {
      await begin({agendar:'create',confirmar:'confirm',reprogramar:'reschedule',cancelar:'cancel'}[command]);
    } else if (s.step === 'professional' && choice) {
      s.doctorUid=choice.value; if(s.action==='create') await services(); else await appointments();
    } else if (s.step === 'appointment' && choice) {
      const a=choice.value; s.appointmentId=a.id;
      if (s.action === 'reschedule') { s.service={id:null,label:'Cita',durationMinutes:a.durationMinutes}; s.step='date'; reply('Indica nueva fecha AAAA-MM-DD, hoy, mañana o próximos. Tu cita original se conserva hasta guardar.'); }
      else if (s.action==='confirm' && a.confirmation==='confirmed') menu('Esa cita ya está confirmada.');
      else { s.step='manageReview'; reply(`${s.action==='cancel'?'Cancelar':'Confirmar'} la cita del ${fullDate(a.startDate,a.startTime,a.timeZone)}. ¿Autorizas esta operación?`, [{title:'Confirmar operación',value:'apply'},{title:'Volver al menú',value:'menu'}]); }
    } else if (s.step==='service') {
      const configured=professionals[s.doctorUid].services;
      const matches=choice
        ? configured.filter(x=>x.id===choice.value)
        : configured.filter(x=>normalize(x.label)===text||normalize(x.id)===text);
      if(matches.length!==1) await services();
      else {s.service=matches[0];s.step='date';reply('Indica una fecha: hoy, mañana, próximos o AAAA-MM-DD.');}
    } else if (s.step==='date') await slots(text);
    else if (s.step==='slot' && choice) {
      s.pending=choice.value;
      if(s.action==='reschedule') summary(); else {s.step='name';reply('Indica tu nombre administrativo (2–80 caracteres). No incluyas diagnósticos ni datos clínicos.');}
    } else if(s.step==='name') {
      if(typeof message.text!=='string'||message.text.trim().length<2||message.text.trim().length>80) reply('Indica únicamente un nombre de 2–80 caracteres.');
      else {s.name=message.text.trim();s.step='consent';reply('¿Autorizas recordatorios administrativos para esta cita?', [{title:'Autorizar',value:true},{title:'No autorizar',value:false}]);}
    } else if(s.step==='consent' && choice) { await api.consent(choice.value); summary(); }
    else if(['review','manageReview'].includes(s.step) && choice) {
      if(choice.value!=='apply') menu();
      else {
        const input = s.step==='review' ? {startDate:s.pending.startDate,endDate:s.pending.startDate,startTime:s.pending.startTime,durationMinutes:s.pending.durationMinutes,...(s.action==='create'?{patientName:s.name,ubicacion:s.service.label}:{})} : {};
        await api.perform(s.action,s.doctorUid,jobId,input,s.appointmentId);
        menu(s.action==='create'?'Cita guardada en COGNICIÓN.':s.action==='reschedule'?'Cita reprogramada. Se conserva la misma cita.':s.action==='cancel'?'Cita cancelada.':'Cita confirmada.');
      }
    } else menu('No se realizó ninguna operación. Elige una opción vigente.');
  } catch(e) {
    const code=e.code||e.message;
    if(code==='conflict') { s.step='date'; delete s.pending; reply('Ese horario acaba de ocuparse. Tu cita original, si existe, se conserva. Escribe próximos u otra fecha.'); }
    else if(['payment-not-configured','payment-not-verified'].includes(code)) menu('Pago no configurado o pendiente de verificación. No es posible completar esta modalidad; contacta al profesional.');
    else if(code==='external-availability-unavailable') { s.step='date'; delete s.pending; reply('No fue posible comprobar toda la disponibilidad en este momento. Intenta de nuevo en unos minutos.'); }
    else if(['permission-denied','configuration-required','outside-booking-horizon','unsupported-recurrence','terminal-appointment'].includes(code)) menu('No se puede completar esta operación con la configuración o autorización actual. Contacta al profesional.');
    else throw e; // infrastructure failure keeps durable work pending; no false success
  }
  return {session:s,content};
}
module.exports={transition,dateInZone,addDays,fullDate};
