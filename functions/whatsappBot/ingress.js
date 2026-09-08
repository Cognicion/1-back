const { Timestamp } = require('firebase-admin/firestore');
const { channelReady, subjectId } = require('./config');
function createWorkPreparer({ db, cipher, identityKey, now = Date.now }) {
  return async (entries, payload) => {
    const config = (await db.doc('whatsappBotConfig/channel').get()).data();
    const work = new Map();
    if (!channelReady(config)) return work;
    const messages = new Map(), statuses = new Map();
    for (const entry of payload?.entry || []) {
      if (String(entry.id) !== config.wabaId) continue;
      for (const change of entry.changes || []) {
        const value = change.value;
        if (change.field !== 'messages' || value?.messaging_product !== 'whatsapp' || value.metadata?.phone_number_id !== config.phoneNumberId) continue;
        for (const m of value.messages || []) messages.set(m.id, m);
        for (const s of value.statuses || []) statuses.set(s.id + ':' + s.status, s);
      }
    }
    for (const [key, event] of entries) {
      if (event.eventType === 'message') {
        const m = messages.get(event.messageId);
        if (!m || !/^\d{8,15}$/.test(m.from || '') || !/^wamid\./.test(m.id || '')) continue;
        const at = Number(m.timestamp) * 1000;
        // Reject stale/synthetic panel samples before any action or send.
        if (!Number.isFinite(at) || at < now() - 24 * 3600000 || at > now() + 300000) continue;
        const subject = subjectId(identityKey(), config.phoneNumberId, m.from);
        if (!config.allowedSubjects?.includes(subject)) continue;
        const text = m.type === 'text' ? m.text?.body : '';
        const choice = m.type === 'interactive' ? m.interactive?.button_reply?.id || m.interactive?.list_reply?.id : m.type === 'button' ? m.button?.payload : '';
        if (text && (typeof text !== 'string' || text.length > 200) || choice && (typeof choice !== 'string' || choice.length > 200)) continue;
        const encrypted = await cipher.seal({ phone: m.from, text: text || '', choice: choice || '', at }, key);
        work.set(key, { kind: 'inbound', state: 'pending', subject, phoneNumberId: config.phoneNumberId, wabaId: config.wabaId, dueAt: now(), attempts: 0, encrypted, expiresAt: Timestamp.fromMillis(now() + 86400000) });
      } else if (event.eventType.startsWith('status.')) {
        const s = statuses.get(event.messageId + ':' + event.eventType.slice(7));
        if (!s) continue;
        const encrypted = await cipher.seal({ messageId: s.id, status: s.status, correlation: /^[a-f0-9]{64}$/.test(s.biz_opaque_callback_data || '') ? s.biz_opaque_callback_data : null }, key);
        work.set(key, { kind: 'status', state: 'pending', dueAt: now(), attempts: 0, encrypted, phoneNumberId: config.phoneNumberId, wabaId: config.wabaId, expiresAt: Timestamp.fromMillis(now() + 86400000) });
      }
    }
    return work;
  };
}
module.exports = { createWorkPreparer };
