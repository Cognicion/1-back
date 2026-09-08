const { createHash, createHmac } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const subjectId = (key, phoneId, phone) => {
  if (typeof key !== 'string' || key.length < 32) throw Error('identity-key-required');
  return createHmac('sha256', key).update(`${phoneId}:${phone}`).digest('hex');
};
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const channelReady = c => c?.enabled === true && c?.pilot === true && /^\d{5,30}$/.test(c.phoneNumberId || '') && /^\d{5,30}$/.test(c.wabaId || '') && /^v\d{2}\.0$/.test(c.graphVersion || '') && Array.isArray(c.professionalIds) && c.professionalIds.length > 0 && c.professionalIds.length <= 10 && c.professionalIds.every(safeId);
const professionalReady = p => p?.enabled === true && Array.isArray(p.services) && p.services.length > 0 && p.services.length <= 10 && p.services.every(s => safeId(s.id) && typeof s.label === 'string' && s.label.length > 0 && s.label.length <= 24 && Number.isInteger(s.durationMinutes) && s.durationMinutes >= 5 && s.durationMinutes <= 480);
module.exports = { hash, subjectId, safeId, channelReady, professionalReady };
