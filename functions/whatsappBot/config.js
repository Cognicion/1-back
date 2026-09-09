const { createHash, createHmac } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const subjectId = (key, phoneId, phone) => {
  if (typeof key !== 'string' || key.length < 32) throw Error('identity-key-required');
  return createHmac('sha256', key).update(`${phoneId}:${phone}`).digest('hex');
};
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const isPilotChannel = c => c?.mode === 'pilot' || (c?.mode !== 'production' && c?.pilot === true);
const baseChannelReady = c => c?.enabled === true && /^\d{5,30}$/.test(c.phoneNumberId || '') && /^\d{5,30}$/.test(c.wabaId || '') && /^v\d{2}\.0$/.test(c.graphVersion || '');
const pilotChannelReady = c => Array.isArray(c.professionalIds) && c.professionalIds.length > 0 && c.professionalIds.length <= 10 && c.professionalIds.every(safeId) && Array.isArray(c.allowedSubjects) && c.allowedSubjects.length > 0 && c.allowedSubjects.length <= 10 && c.allowedSubjects.every(value => /^[a-f0-9]{64}$/.test(value));
const productionChannelReady = c => c?.mode === 'production' && c?.pilot === false && /^\d{4}$/.test(c.officialNumberSuffix || '') && c?.assetVerified === true && c?.subscribed === true;
const channelReady = c => baseChannelReady(c) && (isPilotChannel(c) ? pilotChannelReady(c) : productionChannelReady(c));
const channelAllowsSubject = (c, subject) => /^[a-f0-9]{64}$/.test(subject || '') && (!isPilotChannel(c) || c.allowedSubjects?.includes(subject));
const channelAllowsProfessional = (c, uid) => safeId(uid) && (!isPilotChannel(c) || c.professionalIds?.includes(uid));
const professionalReady = p => p?.enabled === true && Array.isArray(p.services) && p.services.length > 0 && p.services.length <= 10 && p.services.every(s => safeId(s.id) && typeof s.label === 'string' && s.label.length > 0 && s.label.length <= 24 && Number.isInteger(s.durationMinutes) && s.durationMinutes >= 5 && s.durationMinutes <= 480);
const slugReady = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
const directoryEntryReady = p => professionalReady(p) && slugReady(p.slug) && typeof (p.displayName || p.label) === 'string' && (p.displayName || p.label).trim().length > 1 && (p.displayName || p.label).trim().length <= 80 && typeof p.specialty === 'string' && p.specialty.trim().length > 1 && p.specialty.trim().length <= 80 && Array.isArray(p.aliases) && p.aliases.length <= 12 && p.aliases.every(alias => typeof alias === 'string' && alias.trim().length > 0 && alias.trim().length <= 80);
module.exports = { hash, subjectId, safeId, channelReady, professionalReady, directoryEntryReady, slugReady, isPilotChannel, channelAllowsSubject, channelAllowsProfessional };
