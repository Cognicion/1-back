const { isProfessional, isAdmin } = require('../clinicalAnalytics/access');
const { professionalReady, directoryEntryReady, isPilotChannel } = require('./config');

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function publicEntry(uid, professional, control) {
  const label = String(professional.displayName || professional.label || '').trim();
  return {
    uid,
    enabled: true,
    label,
    displayName: label,
    specialty: String(professional.specialty || '').trim(),
    slug: professional.slug || '',
    aliases: Array.isArray(professional.aliases) ? professional.aliases : [],
    services: professional.services,
    reminders: professional.reminders || { enabled:false },
    timeZone: control.policy.timeZone,
    modalities: [...new Set(professional.services.map(service => service.modality).filter(Boolean))],
    location: typeof professional.location === 'string' ? professional.location : '',
    acceptsNewPatients: professional.acceptsNewPatients !== false
  };
}

async function loadDirectory({ db, channel, limit = 50 }) {
  const pilot = isPilotChannel(channel);
  const snapshots = pilot
    ? await Promise.all(channel.professionalIds.map(uid => db.doc(`whatsappBotProfessionals/${uid}`).get()))
    : (await db.collection('whatsappBotProfessionals').where('enabled','==',true).limit(limit + 1).get()).docs;
  if (snapshots.length > limit) throw Error('directory-limit-exceeded');
  const entries = {};
  await Promise.all(snapshots.map(async snapshot => {
    if (!snapshot.exists) return;
    const uid = snapshot.id, professional = snapshot.data() || {};
    const [controlSnapshot, profileSnapshot, tombstone] = await Promise.all([
      db.doc(`appointmentControls/${uid}`).get(),
      db.doc(`usuarios/${uid}`).get(),
      db.doc(`accountDeletionTombstones/${uid}`).get()
    ]);
    const control = controlSnapshot.data(), profile = profileSnapshot.data();
    const roleReady = isProfessional(profile) || (pilot && isAdmin(profile));
    const entryReady = pilot ? professionalReady(professional) : directoryEntryReady(professional);
    const bookingReady = controlSnapshot.exists && control?.enabled === true && control?.policy?.bookingEnabled === true && typeof control?.policy?.timeZone === 'string' && control.policy.timeZone && control?.policy?.payment?.required !== true;
    if (!tombstone.exists && roleReady && entryReady && bookingReady) entries[uid] = publicEntry(uid, professional, control);
  }));
  return entries;
}

function resolveProfessional(professionals, query) {
  const needle = normalize(query);
  if (!needle) return { type:'none', matches:[] };
  const list = Object.values(professionals);
  const names = entry => [entry.displayName, entry.label, entry.slug, ...(entry.aliases || [])].map(normalize).filter(Boolean);
  const exact = list.filter(entry => names(entry).includes(needle));
  if (exact.length === 1) return { type:'exact', matches:exact };
  if (exact.length > 1) return { type:'ambiguous', matches:exact };
  const tokens = needle.split(/\s+/).filter(Boolean);
  const partial = list.filter(entry => names(entry).some(name => tokens.every(token => name.split(/\s+/).some(part => part.startsWith(token)) || name.includes(token))));
  return { type:partial.length === 1 ? 'partial' : partial.length > 1 ? 'ambiguous' : 'none', matches:partial };
}

module.exports = { loadDirectory, resolveProfessional, normalize };
