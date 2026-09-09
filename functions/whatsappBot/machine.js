const { hash, professionalReady } = require('./config');
const { resolveProfessional, normalize:normalizeSearch } = require('./directory');

const dateInZone = (now, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0,10);
const fullDate = (date, time, zone) => `${new Intl.DateTimeFormat('es-MX', { timeZone:'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date(date+'T12:00:00Z'))}, ${time} (${zone})`;
const emergencyPattern = /\b(suicid\w*|autoles\w*|quitarme la vida|hacerme dano|hacerme daño|sobredosis|convulsion\w*|inconsciente|no puedo respirar|emergencia medica|urgencia medica)\b/i;
const clinicalPattern = /\b(diagnost\w*|dosis|efecto advers\w*|interaccion\w*|sintoma\w*|tratamiento\w*|receta\w*|medicamento\w*|farmaco\w*|fármaco\w*|interpretar? (?:un )?estudio)\b/i;

// Deterministic administrative states. Choice IDs are tied to one inbound job;
// a bare "sí", old button or arbitrary appointment ID never authorizes a write.
async function transition({ session = {}, message, jobId, channel, recipient, professionals, api, now }) {
  const s = structuredClone(session);
  const text = String(message.text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const rawText = String(message.text || '').trim();
  const token = hash(jobId).slice(0,20);
  const events = [];
  let content, recipientPatch = null;
  const reply = (body, choices = []) => {
    s.choices = choices.slice(0,10).map((x,i) => ({ ...x, id: `${token}:${i}` }));
    s.choiceExpiresAt = now + 15 * 60000;
    content = { text: body, choices: s.choices.map(({id,title,description}) => ({id,title,...(description ? {description}: {})})) };
  };
  const menuChoices = ['agendar','mis citas','confirmar','reprogramar','cancelar','recordatorios','hablar con alguien','ayuda','salir'].map(value => ({ title:value, value }));
  const menu = body => {
    s.step='menu'; delete s.pending; delete s.action; delete s.appointmentId;
    reply(body || 'Hola, soy Sofía, asistente administrativa de COGNICIÓN. Puedo ayudarte con citas y recordatorios. No realizo evaluación clínica.', menuChoices);
  };
  const close = body => { s.step='closed'; delete s.pending; reply(body || 'Sesión cerrada. Escribe menú cuando quieras continuar.'); };
  const choice = message.choice && now <= (s.choiceExpiresAt || 0) ? s.choices?.find(x => x.id === message.choice) : null;
  if (message.choice && !choice) { events.push('stale_choice'); menu('Esa opción venció o ya fue utilizada. Elige una acción nueva.'); return { session:s, content, events }; }
  const command = s.step === 'menu' && choice ? choice.value : text;

  if (emergencyPattern.test(rawText)) {
    s.step='handoff'; delete s.pending; delete s.doctorUid;
    recipientPatch={handoff:{active:true,reason:'emergency-signal',requestedAt:now}};
    events.push('emergency_signal','handoff_requested');
    reply('Este canal es sólo administrativo y no puede evaluar una urgencia. Si hay peligro inmediato, llama ahora a los servicios de emergencia de tu localidad o acude a urgencias; no esperes una respuesta por WhatsApp. También registré una solicitud para que el equipo humano dé seguimiento administrativo.');
    return {session:s,content,events,recipientPatch};
  }
  if (clinicalPattern.test(rawText)) {
    s.step='handoff'; delete s.pending; delete s.doctorUid;
    recipientPatch={handoff:{active:true,reason:'clinical-request',requestedAt:now}};
    events.push('clinical_redirect','handoff_requested');
    reply('Soy Sofía y este canal es sólo administrativo. No puedo diagnosticar, indicar dosis ni recomendar cambios de tratamiento. Registré tu solicitud para atención humana; si es urgente o hay riesgo inmediato, contacta servicios de emergencia de tu localidad.');
    return {session:s,content,events,recipientPatch};
  }
  if (recipient?.handoff?.active) {
    if (command === 'salir') close('Sesión cerrada. La solicitud de atención humana permanece registrada.');
    else reply('Tu solicitud de atención humana está registrada. Mientras siga activa no realizaré cambios de citas. Si hay una urgencia, contacta los servicios de emergencia de tu localidad.');
    events.push('handoff_waiting');
    return {session:s,content,events};
  }
  if (command === 'salir') { close(); return {session:s,content,events}; }
  if (command === 'dejar de recibir recordatorios') { await api.consent(false); events.push('reminder_opt_out'); menu('Recordatorios desactivados. Puedes continuar gestionando tus citas.'); return {session:s,content,events}; }
  if (['hablar con alguien','secretaria','secretaría','persona','asesor'].includes(command) || /\b(hablar|contactar|comunicarme)\b.*\b(alguien|persona|secretaria|secretaría|asesor)\b/.test(command)) {
    s.step='handoff'; delete s.pending; delete s.doctorUid;
    recipientPatch={handoff:{active:true,reason:'user-request',requestedAt:now}};
    events.push('handoff_requested');
    reply('Registré tu solicitud para hablar con el equipo humano. Mientras siga activa no realizaré cambios de citas. Si hay una urgencia, contacta los servicios de emergencia de tu localidad.');
    return {session:s,content,events,recipientPatch};
  }
  if (['hola','inicio','menu','ayuda'].includes(command)) { menu(command === 'ayuda' ? 'Puedo agendar, mostrar, confirmar, reprogramar o cancelar citas y gestionar recordatorios. Las operaciones críticas siempre piden confirmación.' : undefined); return {session:s,content,events}; }
  if (command === 'recordatorios') { s.step='consentOnly'; reply('¿Autorizas recordatorios administrativos por WhatsApp? Puedes retirar el permiso escribiendo dejar de recibir recordatorios.', [{title:'Autorizar',value:true},{title:'No autorizar',value:false}]); return {session:s,content,events}; }
  if (s.step === 'consentOnly' && choice) { await api.consent(choice.value); events.push(choice.value?'reminder_opt_in':'reminder_opt_out'); menu(choice.value ? 'Consentimiento registrado.' : 'Recordatorios desactivados.'); return {session:s,content,events}; }

  const professionalIds = () => Object.keys(professionals).filter(id => professionalReady(professionals[id]) && (s.action!=='create'||professionals[id].acceptsNewPatients!==false)).sort((left,right)=>left===s.doctorUid?-1:right===s.doctorUid?1:professionals[left].label.localeCompare(professionals[right].label,'es'));
  const professionalChoices = ids => ids.slice(0,10).map(id => ({title:professionals[id].label.slice(0,24),description:professionals[id].specialty||undefined,value:id}));
  const askProfessional = body => { s.step='professional'; reply(body || 'Elige profesional o escribe su nombre, apellido o alias.', professionalChoices(professionalIds())); };
  async function services() {
    const p = professionals[s.doctorUid];
    if (!professionalReady(p)) { menu('El profesional no tiene servicios de reserva habilitados.'); return; }
    s.step = 'service';
    const specialty = p.specialty ? ` (${p.specialty})` : '';
    reply(`Elegiste ${p.label}${specialty}. Selecciona servicio o modalidad.`, p.services.map(x => ({title:x.label,description:x.modality||undefined,value:x.id})));
  }
  async function appointmentsList() {
    const list = await api.list(s.doctorUid);
    if (!list.length) { menu('No hay citas futuras vinculadas a este canal con ese profesional. Las citas creadas por otra vía requieren vinculación explícita.'); return; }
    if (s.action === 'list') {
      events.push('appointments_listed');
      menu(`Tus próximas citas con ${professionals[s.doctorUid].label}:\n${list.map(item => `• ${fullDate(item.startDate,item.startTime,item.timeZone)}${item.confirmation==='confirmed'?' · confirmada':''}`).join('\n')}`);
      return;
    }
    s.step='appointment'; reply('Elige tu cita.', list.map(x => ({title: `${x.startDate} ${x.startTime}`, description: x.timeZone, value:x})));
  }
  async function selectProfessional(id) {
    if (!professionals[id]) { askProfessional('Ese profesional no está disponible para reserva. Elige una opción vigente.'); return; }
    s.doctorUid=id;
    if (s.action === 'create') await services(); else await appointmentsList();
  }
  async function begin(action, query='') {
    s.action=action; delete s.pending; delete s.appointmentId;
    const ids = professionalIds();
    if (!ids.length) { menu('No hay profesionales con reserva disponible en este momento.'); return; }
    if (query) {
      const resolution=resolveProfessional(professionals,query);
      events.push(resolution.type==='none'?'professional_not_found':resolution.type==='ambiguous'?'professional_ambiguous':'professional_resolved');
      if(resolution.matches.length===1) { await selectProfessional(resolution.matches[0].uid); return; }
      if(resolution.matches.length>1) { s.step='professional'; reply('Encontré más de una coincidencia. Elige el profesional correcto.',professionalChoices(resolution.matches.map(item=>item.uid))); return; }
      askProfessional('No encontré una coincidencia única. Elige una opción o escribe otro nombre, apellido o alias.'); return;
    }
    if (ids.length > 1) { askProfessional(); return; }
    await selectProfessional(ids[0]);
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
    events.push('slots_shown');
    s.step='slot'; reply('Horarios disponibles. La disponibilidad se valida nuevamente al guardar.', found.map(x => ({title:`${x.startDate} ${x.startTime}`, description: `${x.durationMinutes} min · ${x.timeZone}`, value:x})));
  }
  const summary = () => { s.step='review'; reply(`${s.action==='reschedule'?'Reprogramar':'Reservar'} con ${professionals[s.doctorUid].label}: ${s.service.label}. ${fullDate(s.pending.startDate,s.pending.startTime,s.pending.timeZone)}. Duración ${s.pending.durationMinutes} minutos. ¿Confirmas esta operación?`, [{title:'Confirmar operación',value:'apply'},{title:'Volver al menú',value:'menu'}]); };
  try {
    const actionMatch = typeof command === 'string' && command.match(/^(agendar|mis citas|confirmar|reprogramar|cancelar)(?:\s+(?:con\s+)?(.+))?$/);
    if (actionMatch) {
      const actions={agendar:'create','mis citas':'list',confirmar:'confirm',reprogramar:'reschedule',cancelar:'cancel'};
      events.push(`${actions[actionMatch[1]]}_started`);
      await begin(actions[actionMatch[1]],actionMatch[2]||'');
    } else if (s.step === 'professional') {
      if (choice) await selectProfessional(choice.value);
      else {
        const resolution=resolveProfessional(professionals,rawText);
        events.push(resolution.type==='none'?'professional_not_found':resolution.type==='ambiguous'?'professional_ambiguous':'professional_resolved');
        if(resolution.matches.length===1) await selectProfessional(resolution.matches[0].uid);
        else if(resolution.matches.length>1) { s.step='professional'; reply('Ese texto coincide con varios profesionales. Elige uno.',professionalChoices(resolution.matches.map(item=>item.uid))); }
        else askProfessional('No encontré ese profesional. Elige una opción o escribe otro nombre, apellido o alias.');
      }
    } else if (s.step === 'appointment' && choice) {
      const a=choice.value; s.appointmentId=a.id;
      if (s.action === 'reschedule') { s.service={id:null,label:'Cita',durationMinutes:a.durationMinutes}; s.step='date'; reply('Indica nueva fecha AAAA-MM-DD, hoy, mañana o próximos. Tu cita original se conserva hasta guardar.'); }
      else if (s.action==='confirm' && a.confirmation==='confirmed') menu('Esa cita ya está confirmada.');
      else { s.step='manageReview'; reply(`${s.action==='cancel'?'Cancelar':'Confirmar'} la cita del ${fullDate(a.startDate,a.startTime,a.timeZone)}. ¿Autorizas esta operación?`, [{title:'Confirmar operación',value:'apply'},{title:'Volver al menú',value:'menu'}]); }
    } else if (s.step==='service') {
      const configured=professionals[s.doctorUid].services;
      const matches=choice ? configured.filter(x=>x.id===choice.value) : configured.filter(x=>normalizeSearch(x.label)===normalizeSearch(text)||normalizeSearch(x.id)===normalizeSearch(text));
      if(matches.length!==1) await services();
      else {s.service=matches[0];s.step='date';reply('Indica una fecha: hoy, mañana, próximos o AAAA-MM-DD.');}
    } else if (s.step==='date') await slots(text);
    else if (s.step==='slot' && choice) {
      s.pending=choice.value;
      if(s.action==='reschedule') summary(); else {s.step='name';reply('Indica tu nombre administrativo (2–80 caracteres). No incluyas diagnósticos ni datos clínicos.');}
    } else if(s.step==='name') {
      if(typeof message.text!=='string'||message.text.trim().length<2||message.text.trim().length>80) reply('Indica únicamente un nombre de 2–80 caracteres.');
      else {s.name=message.text.trim();s.step='consent';reply('¿Autorizas recordatorios administrativos para esta cita?', [{title:'Autorizar',value:true},{title:'No autorizar',value:false}]);}
    } else if(s.step==='consent' && choice) { await api.consent(choice.value); events.push(choice.value?'reminder_opt_in':'reminder_opt_out'); summary(); }
    else if(['review','manageReview'].includes(s.step) && choice) {
      if(choice.value!=='apply') menu();
      else {
        const input = s.step==='review' ? {startDate:s.pending.startDate,endDate:s.pending.startDate,startTime:s.pending.startTime,durationMinutes:s.pending.durationMinutes,...(s.action==='create'?{patientName:s.name,ubicacion:s.service.label}:{})} : {};
        await api.perform(s.action,s.doctorUid,jobId,input,s.appointmentId);
        events.push(`${s.action}_completed`);
        menu(s.action==='create'?'Cita guardada en COGNICIÓN.':s.action==='reschedule'?'Cita reprogramada. Se conserva la misma cita.':s.action==='cancel'?'Cita cancelada.':'Cita confirmada.');
      }
    } else menu('No se realizó ninguna operación. Elige una opción vigente.');
  } catch(e) {
    const code=e.code||e.message;
    events.push('operation_failed');
    if(code==='conflict') { s.step='date'; delete s.pending; reply('Ese horario acaba de ocuparse. Tu cita original, si existe, se conserva. Escribe próximos u otra fecha.'); }
    else if(['payment-not-configured','payment-not-verified'].includes(code)) menu('El pago no está configurado o verificado. No se creó ningún cobro ni cita; contacta al profesional.');
    else if(['external-availability-unavailable','availability-unavailable'].includes(code)) { s.step='date'; delete s.pending; reply('No fue posible comprobar toda la disponibilidad en este momento. No se guardó ningún cambio. Intenta de nuevo en unos minutos.'); }
    else if(['permission-denied','configuration-required','outside-booking-horizon','unsupported-recurrence','terminal-appointment'].includes(code)) menu('No se puede completar esta operación con la configuración o autorización actual. No se guardó ningún cambio; contacta al profesional.');
    else throw e; // infrastructure failure keeps durable work pending; no false success
  }
  return {session:s,content,events,recipientPatch};
}
module.exports={transition,dateInZone,addDays,fullDate,emergencyPattern,clinicalPattern};
