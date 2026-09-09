const { createHash, randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { Timestamp } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
const { isAdmin, isProfessional } = require('../clinicalAnalytics/access');
const {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  GOOGLE_CALENDAR_KMS_KEY_NAME,
  REGION,
  REQUIRED_SCOPES
} = require('./config');
const { GoogleCredentialError, kmsRequest, refreshAccessToken } = require('./credentials');

const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const JOB_TTL_MS = 30 * 86400000;
const MAX_ATTEMPTS = 5;
const WATCH_LIFETIME_MS = 6 * 24 * 3600000;
const WATCH_RENEW_EARLY_MS = 12 * 3600000;
const GOOGLE_WEBHOOK_URL = 'https://us-central1-cognicion-57052.cloudfunctions.net/googleCalendarWebhook';
const TERMINAL = new Set(['synced', 'failed', 'reauthorization_required', 'cancelled', 'superseded']);
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const timestampMillis = value => typeof value?.toMillis === 'function' ? value.toMillis() : value instanceof Date ? value.getTime() : Number(value);

class GoogleCalendarError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(code);
    this.name = 'GoogleCalendarError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function integrationSettings(value = {}) {
  return {
    enabled: value.enabled === true,
    useForAvailability: value.useForAvailability === true,
    mirrorAppointments: value.mirrorAppointments === true,
    allowGoogleReschedule: value.allowGoogleReschedule === true,
    allowGoogleCancel: value.allowGoogleCancel === true
  };
}

function hasRequiredScopes(scopes) {
  return REQUIRED_SCOPES.every(scope => Array.isArray(scopes) && scopes.includes(scope));
}

function safeGoogleError(status, body = {}) {
  const providerReason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '');
  if (status === 401 || body?.error === 'invalid_grant') return new GoogleCalendarError('reauthorization-required', { status });
  if (status === 404) return new GoogleCalendarError('event-not-found', { status });
  if (status === 410) return new GoogleCalendarError('sync-token-invalid', { status });
  if (status === 429 || providerReason === 'rateLimitExceeded' || providerReason === 'userRateLimitExceeded') return new GoogleCalendarError('google-rate-limited', { status, retryable: true });
  if (status >= 500) return new GoogleCalendarError('google-temporarily-unavailable', { status, retryable: true });
  if (status === 403) return new GoogleCalendarError('google-calendar-forbidden', { status });
  return new GoogleCalendarError('google-calendar-request-failed', { status });
}

async function responseBody(response) {
  if (response.status === 204) return null;
  try { return await response.json(); } catch { return {}; }
}

function createCalendarClient({ db, credential, fetchImpl = fetch, now = Date.now }) {
  const accessCache = new Map();
  const keyName = () => GOOGLE_CALENDAR_KMS_KEY_NAME.value();

  async function markReauthorization(uid) {
    await db.doc(`googleCalendarConnections/${uid}`).set({
      connectionStatus: 'reauthorization_required',
      updatedAt: Timestamp.fromMillis(now())
    }, { merge: true });
    accessCache.delete(uid);
  }

  async function connection(uid) {
    const snapshot = await db.doc(`googleCalendarConnections/${uid}`).get();
    const data = snapshot.exists ? snapshot.data() || {} : null;
    return { data, integration: integrationSettings(data?.integration) };
  }

  async function access(uid, currentConnection = null) {
    const cached = accessCache.get(uid);
    if (cached && cached.expiresAt > now() + 60000) return cached.token;
    const data = currentConnection || (await connection(uid)).data;
    if (!data || data.connectionStatus !== 'connected' || !data.encryptedRefreshToken || !hasRequiredScopes(data.scopes)) {
      throw new GoogleCalendarError(data?.connectionStatus === 'reauthorization_required' ? 'reauthorization-required' : 'google-calendar-not-connected');
    }
    try {
      const refreshToken = await kmsRequest({
        keyName: keyName(),
        operation: 'decrypt',
        value: Buffer.from(data.encryptedRefreshToken, 'base64'),
        credential,
        fetchImpl
      });
      const token = await refreshAccessToken({
        refreshToken,
        clientId: GOOGLE_CALENDAR_CLIENT_ID.value(),
        clientSecret: GOOGLE_CALENDAR_CLIENT_SECRET.value(),
        fetchImpl
      });
      accessCache.set(uid, { token: token.accessToken, expiresAt: now() + Math.max(300, token.expiresIn) * 1000 });
      return token.accessToken;
    } catch (error) {
      if (error?.code === 'reauthorization-required') await markReauthorization(uid);
      throw error;
    }
  }

  async function request(uid, connectionData, path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${GOOGLE_API}${path}`, {
        ...options,
        signal: options.signal || AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${await access(uid, connectionData)}`, 'content-type': 'application/json', ...(options.headers || {}) }
      });
    } catch (error) {
      if (error instanceof GoogleCalendarError || error instanceof GoogleCredentialError) throw error;
      throw new GoogleCalendarError('google-network-failed', { retryable: true });
    }
    const body = await responseBody(response);
    if (!response.ok) {
      const error = safeGoogleError(response.status, body);
      if (error.code === 'reauthorization-required') await markReauthorization(uid);
      throw error;
    }
    return body;
  }

  async function freeBusy({ uid, connectionData, calendarId, timeMin, timeMax, timeZone }) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const body = await request(uid, connectionData, '/freeBusy', {
          method: 'POST',
          body: JSON.stringify({ timeMin, timeMax, timeZone, items: [{ id: calendarId }] })
        });
        const calendar = body?.calendars?.[calendarId];
        const calendarErrors = Array.isArray(calendar?.errors) ? calendar.errors : [];
        if (!calendar) throw new GoogleCalendarError('google-calendar-not-found');
        if (calendarErrors.length) {
          const retryable = calendarErrors.some(item => item?.reason === 'internalError');
          throw new GoogleCalendarError(retryable ? 'google-temporarily-unavailable' : 'google-calendar-not-found', { retryable });
        }
        return (calendar.busy || []).map(interval => ({ start: interval.start, end: interval.end, source: 'google' }));
      } catch (error) {
        lastError = error;
        if (!error?.retryable || attempt === 1) break;
      }
    }
    throw lastError;
  }

  async function insertEvent({ uid, connectionData, calendarId, event }) {
    try { return await request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(event) }); }
    catch (error) { if (error?.code === 'event-not-found') throw new GoogleCalendarError('google-calendar-not-found', { status: error.status }); throw error; }
  }
  async function updateEvent({ uid, connectionData, calendarId, eventId, event }) {
    const { id, ...mutable } = event;
    return request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(mutable) });
  }
  async function deleteEvent({ uid, connectionData, calendarId, eventId }) {
    try { return await request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' }); }
    catch (error) { if (error?.code === 'sync-token-invalid') throw new GoogleCalendarError('event-not-found', { status: error.status }); throw error; }
  }

  async function listEvents({ uid, connectionData, calendarId, syncToken = null, pageToken = null }) {
    const query = new URLSearchParams({
      maxResults: '250',
      showDeleted: 'true',
      singleEvents: 'false',
      fields: 'items(id,status,updated,etag,start,end,extendedProperties/private),nextPageToken,nextSyncToken'
    });
    if (syncToken) query.set('syncToken', syncToken);
    if (pageToken) query.set('pageToken', pageToken);
    return request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`, { method: 'GET' });
  }

  async function listBusyExceptEvent({ uid, connectionData, calendarId, startAt, endAt, eventId }) {
    const query = new URLSearchParams({
      timeMin: new Date(startAt).toISOString(),
      timeMax: new Date(endAt).toISOString(),
      singleEvents: 'true',
      showDeleted: 'false',
      fields: 'items(id,status,start,end)'
    });
    const body = await request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`, { method: 'GET' });
    return (body?.items || []).filter(event => event?.id !== eventId && event?.status !== 'cancelled').flatMap(event => {
      const start = event?.start?.dateTime, end = event?.end?.dateTime;
      return start && end ? [{ start, end, source: 'google' }] : [];
    });
  }

  async function watchEvents({ uid, connectionData, calendarId, channelId, channelToken, expiration }) {
    return request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      method: 'POST',
      body: JSON.stringify({ id: channelId, type: 'web_hook', address: GOOGLE_WEBHOOK_URL, token: channelToken, expiration: String(expiration) })
    });
  }

  async function stopWatch({ uid, connectionData, channelId, resourceId }) {
    return request(uid, connectionData, '/channels/stop', { method: 'POST', body: JSON.stringify({ id: channelId, resourceId }) });
  }

  return { connection, freeBusy, insertEvent, updateEvent, deleteEvent, listEvents, listBusyExceptEvent, watchEvents, stopWatch };
}

function appointmentSourceVersion(data = {}) {
  const projection = {
    type: data.type || null,
    status: data.status || data.estado || null,
    startAt: timestampMillis(data.startAt) || null,
    endAt: timestampMillis(data.endAt) || null,
    timeZone: data.timeZone || null,
    recurrence: data.recurrence || null,
    startDate: data.startDate || null,
    startTime: data.startTime || null,
    endDate: data.endDate || null,
    endTime: data.endTime || null,
    durationMinutes: Number(data.durationMinutes || 0)
  };
  return digest(JSON.stringify(projection));
}

function recurrenceRules(data) {
  if (data.recurrence === 'weekly') return ['RRULE:FREQ=WEEKLY'];
  if (data.recurrence === 'biweekly') return ['RRULE:FREQ=WEEKLY;INTERVAL=2'];
  if (data.recurrence !== 'monthly') return [];
  const anchor = Number(String(data.startDate).slice(8, 10));
  const rules = [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${anchor}`];
  // COGNICIÓN clamps anchors 29–31 to the last day of shorter months and
  // recovers the anchor afterwards. RFC5545 recurrence sets are unions, so a
  // supplemental last-day rule preserves that domain behavior in Google.
  if (anchor === 29 || anchor === 30) rules.push('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  if (anchor === 31) rules.push('RRULE:FREQ=YEARLY;BYMONTH=2,4,6,9,11;BYMONTHDAY=-1');
  return rules;
}

function googleEventProjection(appointment, appointmentId, eventId, sourceVersion = appointmentSourceVersion(appointment)) {
  const start = timestampMillis(appointment.startAt);
  const end = timestampMillis(appointment.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !appointment.timeZone) throw new GoogleCalendarError('invalid-appointment-interval');
  const recurrence = recurrenceRules(appointment);
  return {
    id: eventId,
    summary: 'Consulta',
    start: { dateTime: new Date(start).toISOString(), timeZone: appointment.timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone: appointment.timeZone },
    extendedProperties: { private: { cognicionAppointmentId: appointmentId, cognicionSyncVersion: sourceVersion } },
    ...(recurrence.length ? { recurrence } : {})
  };
}

function createGoogleCalendarRuntime({ db, credential, fetchImpl = fetch, now = Date.now, appointmentService = null }) {
  const client = createCalendarClient({ db, credential, fetchImpl, now });
  const secrets = [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET];

  const availabilityProvider = Object.freeze({
    async isRequired({ doctorUid }) {
      const { integration } = await client.connection(doctorUid);
      return integration.enabled && integration.useForAvailability;
    },
    async getBusy({ doctorUid, startAt, endAt, timeZone, excludeGoogleEventId = null }) {
      const { data, integration } = await client.connection(doctorUid);
      if (!integration.enabled || !integration.useForAvailability) return [];
      if (!data || data.connectionStatus !== 'connected') throw new GoogleCalendarError(data?.connectionStatus === 'reauthorization_required' ? 'reauthorization-required' : 'external-availability-unavailable');
      try {
        if (excludeGoogleEventId) {
          return await client.listBusyExceptEvent({
            uid: doctorUid,
            connectionData: data,
            calendarId: data.selectedCalendarId || 'primary',
            startAt,
            endAt,
            eventId: excludeGoogleEventId
          });
        }
        return await client.freeBusy({
          uid: doctorUid,
          connectionData: data,
          calendarId: data.selectedCalendarId || 'primary',
          timeMin: new Date(startAt).toISOString(),
          timeMax: new Date(endAt).toISOString(),
          timeZone
        });
      } catch (error) {
        if (error?.code === 'reauthorization-required') throw error;
        throw new GoogleCalendarError('external-availability-unavailable', { status: error?.status, retryable: error?.retryable });
      }
    }
  });

  async function assertProfessional(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Autenticación requerida.');
    const profile = await db.doc(`usuarios/${request.auth.uid}`).get();
    if (!profile.exists || (!isProfessional(profile.data()) && !isAdmin(profile.data(), request.auth))) throw new HttpsError('permission-denied', 'Integración no autorizada.');
    return request.auth.uid;
  }

  const updateSettings = onCall({ region: REGION, secrets }, async request => {
    const uid = await assertProfessional(request);
    const requested = request.data || {};
    if (Object.keys(requested).some(key => !['useForAvailability', 'mirrorAppointments', 'allowGoogleReschedule', 'allowGoogleCancel'].includes(key)) ||
        typeof requested.useForAvailability !== 'boolean' || typeof requested.mirrorAppointments !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Configuración inválida.');
    }
    const ref = db.doc(`googleCalendarConnections/${uid}`);
    const snapshot = await ref.get();
    const connection = snapshot.exists ? snapshot.data() || {} : null;
    if (!connection || connection.connectionStatus !== 'connected' || !connection.encryptedRefreshToken || !hasRequiredScopes(connection.scopes)) {
      throw new HttpsError('failed-precondition', 'Google Calendar no está conectado con los permisos requeridos.');
    }
    const currentIntegration = integrationSettings(connection.integration);
    if (requested.allowGoogleReschedule !== undefined && typeof requested.allowGoogleReschedule !== 'boolean') throw new HttpsError('invalid-argument', 'Configuración inválida.');
    if (requested.allowGoogleCancel !== undefined && typeof requested.allowGoogleCancel !== 'boolean') throw new HttpsError('invalid-argument', 'Configuración inválida.');
    const integration = {
      enabled: requested.useForAvailability || requested.mirrorAppointments,
      useForAvailability: requested.useForAvailability,
      mirrorAppointments: requested.mirrorAppointments,
      allowGoogleReschedule: requested.allowGoogleReschedule === undefined ? currentIntegration.allowGoogleReschedule : requested.allowGoogleReschedule === true,
      allowGoogleCancel: requested.allowGoogleCancel === undefined ? currentIntegration.allowGoogleCancel : requested.allowGoogleCancel === true
    };
    if (integration.enabled) {
      try {
        await client.freeBusy({
          uid,
          connectionData: connection,
          calendarId: connection.selectedCalendarId || 'primary',
          timeMin: new Date(now()).toISOString(),
          timeMax: new Date(now() + 60000).toISOString(),
          timeZone: 'UTC'
        });
      } catch (error) {
        throw new HttpsError('failed-precondition', 'No se pudo validar el calendario seleccionado.', { calendarCode: String(error?.code || 'google-calendar-unavailable') });
      }
    }
    if (integration.enabled) await ensureWatch(uid, connection);
    await ref.set({ integration, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
    if (integration.mirrorAppointments) await enqueueReconcile(uid, connection.selectedCalendarId || 'primary');
    return { integration, selectedCalendar: connection.selectedCalendarId || 'primary' };
  });

  const watchKeyFor = (uid, calendarId) => digest(`google-watch:${uid}:${calendarId}`);
  const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  };

  async function enqueueInboundSync({ watchKey, professionalUid, calendarId, resourceState = 'exists' }) {
    const watchRef = db.doc(`googleCalendarWatchChannels/${watchKey}`);
    const current = Timestamp.fromMillis(now());
    return db.runTransaction(async tx => {
      const watch = await tx.get(watchRef);
      if (!watch.exists || watch.data()?.status !== 'active') return null;
      const sequence = Number(watch.data().syncSequence || 0) + 1;
      const jobId = digest(`google-inbound:${watchKey}:${sequence}`);
      const jobRef = db.doc(`googleCalendarSyncJobs/${jobId}`);
      tx.update(watchRef, { syncSequence: sequence, lastNotificationAt: current, lastResourceState: resourceState, updatedAt: current });
      tx.create(jobRef, {
        kind: 'inbound',
        professionalUid,
        calendarId,
        watchKey,
        state: 'pending',
        attemptCount: 0,
        nextAttemptAt: current,
        createdAt: current,
        expiresAt: Timestamp.fromMillis(now() + JOB_TTL_MS)
      });
      return jobId;
    });
  }

  async function ensureWatch(uid, connectionData = null, { force = false } = {}) {
    const connection = connectionData || (await client.connection(uid)).data;
    if (!connection || connection.connectionStatus !== 'connected') throw new GoogleCalendarError('google-calendar-not-connected');
    const calendarId = connection.selectedCalendarId || 'primary';
    const watchKey = watchKeyFor(uid, calendarId);
    const watchRef = db.doc(`googleCalendarWatchChannels/${watchKey}`);
    const existingSnapshot = await watchRef.get();
    const existing = existingSnapshot.exists ? existingSnapshot.data() || {} : null;
    if (!force && existing?.status === 'active' && timestampMillis(existing.renewAt) > now()) return existing;
    const channelId = randomUUID();
    const channelToken = randomBytes(32).toString('base64url');
    const requestedExpiration = now() + WATCH_LIFETIME_MS;
    const watched = await client.watchEvents({ uid, connectionData: connection, calendarId, channelId, channelToken, expiration: requestedExpiration });
    if (!watched?.resourceId) throw new GoogleCalendarError('google-watch-invalid-response', { retryable: true });
    const expirationMillis = Number(watched.expiration) || requestedExpiration;
    const next = {
      professionalUid: uid,
      calendarId,
      channelId,
      resourceId: watched.resourceId,
      channelToken,
      expiration: Timestamp.fromMillis(expirationMillis),
      renewAt: Timestamp.fromMillis(Math.max(now(), expirationMillis - WATCH_RENEW_EARLY_MS)),
      status: 'active',
      syncToken: existing?.calendarId === calendarId ? existing.syncToken || null : null,
      syncSequence: Number(existing?.syncSequence || 0),
      createdAt: existing?.createdAt || Timestamp.fromMillis(now()),
      updatedAt: Timestamp.fromMillis(now())
    };
    await watchRef.set(next, { merge: false });
    if (existing?.status === 'active' && existing.channelId && existing.resourceId && existing.channelId !== channelId) {
      try { await client.stopWatch({ uid, connectionData: connection, channelId: existing.channelId, resourceId: existing.resourceId }); }
      catch (error) { logger.warn('[GOOGLE_CALENDAR_WATCH] Canal previo no detenido.', { code: String(error?.code || 'stop-failed') }); }
    }
    await enqueueInboundSync({ watchKey, professionalUid: uid, calendarId, resourceState: 'sync' });
    return next;
  }

  async function stopWatches(uid, connectionData = null) {
    const snapshot = await db.collection('googleCalendarWatchChannels').where('professionalUid', '==', uid).limit(10).get();
    for (const document of snapshot.docs) {
      const watch = document.data() || {};
      if (watch.status === 'active' && connectionData?.connectionStatus === 'connected') {
        try { await client.stopWatch({ uid, connectionData, channelId: watch.channelId, resourceId: watch.resourceId }); }
        catch (error) { logger.warn('[GOOGLE_CALENDAR_WATCH] No se pudo detener canal.', { code: String(error?.code || 'stop-failed') }); }
      }
      await document.ref.set({ status: 'stopped', stoppedAt: Timestamp.fromMillis(now()), updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
    }
  }

  async function enqueueReconcile(uid, calendarId, cursor = '') {
    const id = digest(`google-reconcile:${uid}:${calendarId}:${cursor || 'first'}`);
    const ref = db.doc(`googleCalendarSyncJobs/${id}`);
    const current = Timestamp.fromMillis(now());
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return;
      tx.create(ref, { kind: 'reconcile', professionalUid: uid, calendarId, cursor: cursor || null, state: 'pending', attemptCount: 0, nextAttemptAt: current, createdAt: current, expiresAt: Timestamp.fromMillis(now() + JOB_TTL_MS) });
    });
  }

  async function enqueueOutbound({ doctorUid, appointmentId, after = null, before = null, forceKey = null }) {
    const source = after || before;
    if (!source || source.type !== 'appointment') return;
    const { data: connection, integration } = await client.connection(doctorUid);
    if (!integration.enabled || !integration.mirrorAppointments || connection?.connectionStatus !== 'connected') return;
    const sourceVersion = appointmentSourceVersion(after || { ...before, status: 'cancelada' });
    const jobId = digest(`${doctorUid}:${appointmentId}:${sourceVersion}:${forceKey || 'normal'}`);
    const linkRef = db.doc(`googleCalendarAppointmentLinks/${digest(`${doctorUid}:${appointmentId}`)}`);
    const jobRef = db.doc(`googleCalendarSyncJobs/${jobId}`);
    const current = Timestamp.fromMillis(now());
    await db.runTransaction(async tx => {
      const currentAppointment = await tx.get(db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`));
      if (after && (!currentAppointment.exists || appointmentSourceVersion(currentAppointment.data()) !== sourceVersion)) return;
      if (!after && currentAppointment.exists) return;
      if ((await tx.get(jobRef)).exists) return;
      tx.create(jobRef, {
        kind: 'outbound',
        professionalUid: doctorUid,
        appointmentId,
        sourceVersion,
        forceKey: forceKey || null,
        state: 'pending',
        attemptCount: 0,
        nextAttemptAt: current,
        createdAt: current,
        expiresAt: Timestamp.fromMillis(now() + JOB_TTL_MS)
      });
      tx.set(linkRef, {
        professionalUid: doctorUid,
        appointmentId,
        googleCalendarId: connection.selectedCalendarId || 'primary',
        sourceVersion,
        lastCognicionUpdated: current,
        syncState: 'pending',
        updatedAt: current
      }, { merge: true });
    });
  }

  async function enqueueAppointmentChange(event) {
    const { doctorUid, appointmentId } = event.params;
    const after = event.data?.after?.exists ? event.data.after.data() || {} : null;
    const before = event.data?.before?.exists ? event.data.before.data() || {} : null;
    return enqueueOutbound({ doctorUid, appointmentId, after, before });
  }

  async function claimJob(jobId) {
    const ref = db.doc(`googleCalendarSyncJobs/${jobId}`);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;
      const job = snapshot.data() || {};
      if (TERMINAL.has(job.state)) return null;
      const due = timestampMillis(job.nextAttemptAt) || 0;
      const leaseUntil = timestampMillis(job.leaseUntil) || 0;
      if (due > now() || (job.state === 'processing' && leaseUntil > now())) return null;
      const lease = randomUUID();
      tx.update(ref, {
        state: 'processing',
        lease,
        leaseUntil: Timestamp.fromMillis(now() + 120000),
        attemptCount: Number(job.attemptCount || 0) + 1,
        lastAttemptAt: Timestamp.fromMillis(now())
      });
      return { ...job, id: jobId, lease, attemptCount: Number(job.attemptCount || 0) + 1 };
    });
  }

  async function finishJob(job, state, extra = {}) {
    const ref = db.doc(`googleCalendarSyncJobs/${job.id}`);
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current || current.lease !== job.lease) return;
      tx.update(ref, {
        state,
        lease: null,
        leaseUntil: null,
        completedAt: Timestamp.fromMillis(now()),
        expiresAt: Timestamp.fromMillis(now() + JOB_TTL_MS),
        ...extra
      });
    });
  }

  async function failJob(job, error, linkRef = null) {
    const code = error?.code === 'reauthorization-required' ? 'reauthorization-required' : String(error?.code || 'google-calendar-sync-failed');
    const terminal = code === 'reauthorization-required' || !error?.retryable || job.attemptCount >= MAX_ATTEMPTS;
    const state = code === 'reauthorization-required' ? 'reauthorization_required' : terminal ? 'failed' : 'retry';
    const nextAttemptAt = Timestamp.fromMillis(now() + Math.min(15 * 60000, 2 ** job.attemptCount * 15000));
    if (linkRef) await linkRef.set({ syncState: state, lastErrorCode: code, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
    if (state === 'retry') await finishJob(job, state, { code, nextAttemptAt });
    else await finishJob(job, state, { code });
    logger.warn('[GOOGLE_CALENDAR_SYNC] Trabajo no sincronizado.', { code, retryable: state === 'retry', attempt: job.attemptCount, kind: job.kind || 'outbound' });
  }

  async function processOutboundJob(job) {
    const linkId = digest(`${job.professionalUid}:${job.appointmentId}`);
    const linkRef = db.doc(`googleCalendarAppointmentLinks/${linkId}`);
    try {
      const [appointmentSnapshot, linkSnapshot, connectionResult] = await Promise.all([
        db.doc(`usuarios/${job.professionalUid}/agenda/${job.appointmentId}`).get(),
        linkRef.get(),
        client.connection(job.professionalUid)
      ]);
      const appointment = appointmentSnapshot.exists ? appointmentSnapshot.data() || {} : null;
      const link = linkSnapshot.exists ? linkSnapshot.data() || {} : {};
      const { data: connection, integration } = connectionResult;
      if (!integration.enabled || !integration.mirrorAppointments) {
        await finishJob(job, 'cancelled', { code: 'mirror-disabled' });
        return;
      }
      if (!connection || connection.connectionStatus !== 'connected') throw new GoogleCalendarError(connection?.connectionStatus === 'reauthorization_required' ? 'reauthorization-required' : 'google-calendar-not-connected');
      const effective = appointment || { status: 'cancelada' };
      if (appointment && appointmentSourceVersion(appointment) !== job.sourceVersion) {
        await finishJob(job, 'superseded');
        return;
      }
      const calendarId = connection.selectedCalendarId || 'primary';
      if (link.lastInboundSourceVersion && link.lastInboundSourceVersion === job.sourceVersion) {
        await linkRef.set({ syncState: 'synced', sourceVersion: job.sourceVersion, lastSyncedAt: Timestamp.fromMillis(now()), updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
        await finishJob(job, 'synced', { code: 'google-echo-suppressed' });
        return;
      }
      const deterministicEventId = digest(`${job.professionalUid}:${job.appointmentId}`);
      const eventId = link.googleEventId || deterministicEventId;
      const cancelled = !appointment || (appointment.status || appointment.estado) === 'cancelada';
      if (cancelled) {
        if (link.googleEventId) {
          try { await client.deleteEvent({ uid: job.professionalUid, connectionData: connection, calendarId: link.googleCalendarId || calendarId, eventId: link.googleEventId }); }
          catch (error) { if (error?.code !== 'event-not-found') throw error; }
        }
        await linkRef.set({
          professionalUid: job.professionalUid,
          appointmentId: job.appointmentId,
          googleCalendarId: link.googleCalendarId || calendarId,
          googleEventId: link.googleEventId || null,
          sourceVersion: job.sourceVersion,
          syncState: 'cancelled',
          lastSyncedAt: Timestamp.fromMillis(now()),
          updatedAt: Timestamp.fromMillis(now())
        }, { merge: true });
        await finishJob(job, 'synced');
        return;
      }
      const projection = googleEventProjection(effective, job.appointmentId, eventId, job.sourceVersion);
      const insertDeterministic = async () => {
        const replacement = googleEventProjection(effective, job.appointmentId, deterministicEventId);
        try { return await client.insertEvent({ uid: job.professionalUid, connectionData: connection, calendarId, event: replacement }); }
        catch (error) {
          if (error?.status !== 409) throw error;
          return client.updateEvent({ uid: job.professionalUid, connectionData: connection, calendarId, eventId: deterministicEventId, event: replacement });
        }
      };
      let saved;
      if (link.googleEventId) {
        try { saved = await client.updateEvent({ uid: job.professionalUid, connectionData: connection, calendarId: link.googleCalendarId || calendarId, eventId: link.googleEventId, event: projection }); }
        catch (error) {
          if (error?.code !== 'event-not-found') throw error;
          saved = await insertDeterministic();
        }
      } else {
        saved = await insertDeterministic();
      }
      const savedEventId = saved?.id || eventId;
      await linkRef.set({
        professionalUid: job.professionalUid,
        appointmentId: job.appointmentId,
        googleCalendarId: calendarId,
        googleEventId: savedEventId,
        sourceVersion: job.sourceVersion,
        syncState: 'synced',
        lastSyncedAt: Timestamp.fromMillis(now()),
        lastSyncOrigin: 'cognicion',
        lastGoogleUpdated: saved?.updated || null,
        lastGoogleEtag: saved?.etag || null,
        updatedAt: Timestamp.fromMillis(now())
      }, { merge: true });
      await finishJob(job, 'synced');
    } catch (error) {
      await failJob(job, error, linkRef);
    }
  }

  function civilParts(instant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    const value = type => parts.find(part => part.type === type)?.value;
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }

  async function applyInboundEvent(job, event, connection, integration) {
    if (!event?.id) return;
    let appointmentId = event?.extendedProperties?.private?.cognicionAppointmentId || null;
    let linkId = appointmentId ? digest(`${job.professionalUid}:${appointmentId}`) : null;
    let linkRef = linkId ? db.doc(`googleCalendarAppointmentLinks/${linkId}`) : null;
    let linkSnapshot = linkRef ? await linkRef.get() : null;
    if (!linkSnapshot?.exists) {
      const matches = await db.collection('googleCalendarAppointmentLinks').where('googleEventId', '==', event.id).limit(2).get();
      linkSnapshot = matches.docs.find(document => document.data()?.professionalUid === job.professionalUid && document.data()?.googleCalendarId === job.calendarId) || null;
      if (!linkSnapshot) return;
      linkRef = linkSnapshot.ref;
      appointmentId = linkSnapshot.data()?.appointmentId || null;
    }
    if (!appointmentId) return;
    const link = linkSnapshot.data() || {};
    if (link.professionalUid !== job.professionalUid || link.appointmentId !== appointmentId || link.googleCalendarId !== job.calendarId || link.googleEventId !== event.id) return;
    const eventUpdated = String(event.updated || '');
    if ((link.lastGoogleEtag && link.lastGoogleEtag === event.etag) || (link.lastGoogleUpdated && link.lastGoogleUpdated === eventUpdated)) return;
    if (typeof appointmentService !== 'function') throw new GoogleCalendarError('appointment-service-unavailable', { retryable: true });
    const service = await appointmentService();
    const integrationContext = { kind: 'google-calendar', linkId, googleEventId: event.id, calendarId: job.calendarId, googleUpdated: eventUpdated || null, googleEtag: event.etag || null };
    if (event.status === 'cancelled') {
      if (!integration.allowGoogleCancel) {
        const appointment = await db.doc(`usuarios/${job.professionalUid}/agenda/${appointmentId}`).get();
        if (appointment.exists) await enqueueOutbound({ doctorUid: job.professionalUid, appointmentId, after: appointment.data() || {}, forceKey: `restore:${eventUpdated}` });
        return;
      }
      await service.cancelAppointment({ doctorUid: job.professionalUid, appointmentId, requestId: `gcal-cancel-${digest(`${event.id}:${eventUpdated}`).slice(0, 48)}`, input: {}, integration: integrationContext });
      return;
    }
    if (!integration.allowGoogleReschedule || !event?.start?.dateTime || !event?.end?.dateTime) {
      const appointment = await db.doc(`usuarios/${job.professionalUid}/agenda/${appointmentId}`).get();
      if (appointment.exists) await enqueueOutbound({ doctorUid: job.professionalUid, appointmentId, after: appointment.data() || {}, forceKey: `restore:${eventUpdated}` });
      return;
    }
    const appointmentSnapshot = await db.doc(`usuarios/${job.professionalUid}/agenda/${appointmentId}`).get();
    if (!appointmentSnapshot.exists) return;
    const appointment = appointmentSnapshot.data() || {};
    const startAt = Date.parse(event.start.dateTime), endAt = Date.parse(event.end.dateTime);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt || !appointment.timeZone) throw new GoogleCalendarError('invalid-google-event-interval');
    if (timestampMillis(appointment.startAt) === startAt && timestampMillis(appointment.endAt) === endAt) {
      await linkRef.set({ lastGoogleUpdated: eventUpdated || null, lastGoogleEtag: event.etag || null, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
      return;
    }
    const start = civilParts(startAt, appointment.timeZone), end = civilParts(endAt, appointment.timeZone);
    try {
      await service.rescheduleAppointment({
        doctorUid: job.professionalUid,
        appointmentId,
        requestId: `gcal-reschedule-${digest(`${event.id}:${eventUpdated}`).slice(0, 48)}`,
        integration: integrationContext,
        input: { startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, timeZone: appointment.timeZone }
      });
    } catch (error) {
      if (error?.code === 'conflict') {
        await linkRef.set({ syncState: 'conflict', lastErrorCode: 'google-interval-conflict', updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
        return;
      }
      throw error;
    }
  }

  async function processInboundJob(job) {
    try {
      const [watchSnapshot, connectionResult] = await Promise.all([db.doc(`googleCalendarWatchChannels/${job.watchKey}`).get(), client.connection(job.professionalUid)]);
      const watch = watchSnapshot.exists ? watchSnapshot.data() || {} : null;
      const { data: connection, integration } = connectionResult;
      if (!watch || watch.status !== 'active' || watch.professionalUid !== job.professionalUid || watch.calendarId !== job.calendarId || !integration.enabled) {
        await finishJob(job, 'cancelled', { code: 'watch-inactive' });
        return;
      }
      if (!connection || connection.connectionStatus !== 'connected') throw new GoogleCalendarError('google-calendar-not-connected');
      let syncToken = watch.syncToken || null, pageToken = null, finalToken = null, recovered = false;
      for (;;) {
        let page;
        try { page = await client.listEvents({ uid: job.professionalUid, connectionData: connection, calendarId: job.calendarId, syncToken, pageToken }); }
        catch (error) {
          if (error?.code !== 'sync-token-invalid' || !syncToken) throw error;
          syncToken = null; pageToken = null; recovered = true;
          continue;
        }
        for (const event of page?.items || []) await applyInboundEvent(job, event, connection, integration);
        pageToken = page?.nextPageToken || null;
        finalToken = page?.nextSyncToken || finalToken;
        if (!pageToken) break;
      }
      await watchSnapshot.ref.set({ syncToken: finalToken || null, lastSyncAt: Timestamp.fromMillis(now()), lastSyncRecovery: recovered, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
      await finishJob(job, 'synced');
    } catch (error) { await failJob(job, error); }
  }

  async function processReconcileJob(job) {
    try {
      let query = db.collection(`usuarios/${job.professionalUid}/agenda`).orderBy('__name__').limit(100);
      if (job.cursor) query = query.startAfter(job.cursor);
      const appointments = await query.get();
      for (const document of appointments.docs) {
        const appointment = document.data() || {};
        if (appointment.type === 'appointment') await enqueueOutbound({ doctorUid: job.professionalUid, appointmentId: document.id, after: appointment });
      }
      if (appointments.size === 100) await enqueueReconcile(job.professionalUid, job.calendarId, appointments.docs.at(-1).id);
      await finishJob(job, 'synced');
    } catch (error) { await failJob(job, error); }
  }

  async function processJob(jobId) {
    const job = await claimJob(jobId);
    if (!job) return;
    if (job.kind === 'inbound') return processInboundJob(job);
    if (job.kind === 'reconcile') return processReconcileJob(job);
    return processOutboundJob(job);
  }

  async function runDueJobs() {
    const snapshot = await db.collection('googleCalendarSyncJobs')
      .where('state', 'in', ['pending', 'retry', 'processing'])
      .where('nextAttemptAt', '<=', Timestamp.fromMillis(now()))
      .orderBy('nextAttemptAt')
      .limit(40)
      .get();
    for (const document of snapshot.docs) await processJob(document.id);
  }

  const googleCalendarWebhook = onRequest({ region: REGION, timeoutSeconds: 30, memory: '256MiB', maxInstances: 4 }, async (request, response) => {
    if (request.method !== 'POST') { response.status(405).end(); return; }
    const channelId = request.get('x-goog-channel-id');
    const resourceId = request.get('x-goog-resource-id');
    const channelToken = request.get('x-goog-channel-token');
    const resourceState = request.get('x-goog-resource-state') || 'exists';
    if (!channelId || !resourceId || !channelToken) { response.status(404).end(); return; }
    const snapshot = await db.collection('googleCalendarWatchChannels').where('channelId', '==', channelId).limit(1).get();
    const document = snapshot.docs[0];
    const watch = document?.data() || null;
    if (!watch || watch.status !== 'active' || !safeEqual(watch.resourceId, resourceId) || !safeEqual(watch.channelToken, channelToken)) { response.status(404).end(); return; }
    try {
      await enqueueInboundSync({ watchKey: document.id, professionalUid: watch.professionalUid, calendarId: watch.calendarId, resourceState });
      response.status(204).end();
    } catch (error) {
      logger.warn('[GOOGLE_CALENDAR_WEBHOOK] Trabajo durable no creado.', { code: String(error?.code || 'enqueue-failed') });
      response.status(503).end();
    }
  });

  async function runWatchMaintenance() {
    const snapshot = await db.collection('googleCalendarWatchChannels').where('status', '==', 'active').where('renewAt', '<=', Timestamp.fromMillis(now())).orderBy('renewAt').limit(30).get();
    for (const document of snapshot.docs) {
      const watch = document.data() || {};
      try {
        const connection = (await client.connection(watch.professionalUid)).data;
        if (!connection || !integrationSettings(connection.integration).enabled) { await document.ref.set({ status: 'stopped', updatedAt: Timestamp.fromMillis(now()) }, { merge: true }); continue; }
        await ensureWatch(watch.professionalUid, connection, { force: true });
      } catch (error) { logger.warn('[GOOGLE_CALENDAR_WATCH] Renovación pendiente.', { code: String(error?.code || 'renew-failed') }); }
    }
  }

  async function onConnected(uid) {
    const connection = (await client.connection(uid)).data;
    const integration = integrationSettings(connection?.integration);
    if (!connection || !integration.enabled) return;
    await ensureWatch(uid, connection);
    if (integration.mirrorAppointments) await enqueueReconcile(uid, connection.selectedCalendarId || 'primary');
  }

  async function authorizeIntegration({ tx, integration, doctorUid, action, appointmentId }) {
    if (!integration || integration.kind !== 'google-calendar' || !['reschedule', 'cancel'].includes(action)) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    const expected = digest(`${doctorUid}:${appointmentId}`);
    if (integration.linkId !== expected) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    const [link, connection] = await Promise.all([tx.get(db.doc(`googleCalendarAppointmentLinks/${expected}`)), tx.get(db.doc(`googleCalendarConnections/${doctorUid}`))]);
    const linkData = link.exists ? link.data() || {} : null, connectionData = connection.exists ? connection.data() || {} : null;
    const integrationConfig = integrationSettings(connectionData?.integration);
    const allowed = action === 'reschedule' ? integrationConfig.allowGoogleReschedule : integrationConfig.allowGoogleCancel;
    if (!linkData || !connectionData || connectionData.connectionStatus !== 'connected' || !allowed || linkData.professionalUid !== doctorUid || linkData.appointmentId !== appointmentId || linkData.googleEventId !== integration.googleEventId || linkData.googleCalendarId !== integration.calendarId) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    return { profileAuthorized: true };
  }

  async function onIntegrationMutation({ tx, integration, doctorUid, appointmentId, next }) {
    const linkRef = db.doc(`googleCalendarAppointmentLinks/${integration.linkId}`);
    tx.set(linkRef, { professionalUid: doctorUid, appointmentId, googleEventId: integration.googleEventId, googleCalendarId: integration.calendarId, sourceVersion: appointmentSourceVersion(next), lastInboundSourceVersion: appointmentSourceVersion(next), lastSyncOrigin: 'google', lastGoogleUpdated: integration.googleUpdated || null, lastGoogleEtag: integration.googleEtag || null, syncState: 'synced', updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
  }

  const functionOptions = { region: REGION, secrets, timeoutSeconds: 120, memory: '256MiB', maxInstances: 4 };
  return {
    availabilityProvider,
    secrets,
    exports: {
      updateGoogleCalendarSettings: updateSettings,
      googleCalendarAppointmentChanged: onDocumentWritten({ region: REGION, document: 'usuarios/{doctorUid}/agenda/{appointmentId}', retry: true }, enqueueAppointmentChange),
      googleCalendarSyncJobCreated: onDocumentCreated({ ...functionOptions, document: 'googleCalendarSyncJobs/{jobId}', retry: true }, async event => processJob(event.params.jobId)),
      googleCalendarSyncDrain: onSchedule({ ...functionOptions, schedule: 'every 5 minutes', timeZone: 'UTC' }, runDueJobs),
      googleCalendarWebhook,
      googleCalendarWatchRenewal: onSchedule({ ...functionOptions, schedule: 'every 6 hours', timeZone: 'UTC' }, runWatchMaintenance)
    },
    authorizeIntegration,
    onIntegrationMutation,
    stopWatches,
    onConnected,
    test: { client, processJob, runDueJobs, runWatchMaintenance, enqueueAppointmentChange, enqueueOutbound, enqueueReconcile, applyInboundEvent, ensureWatch }
  };
}

module.exports = {
  createGoogleCalendarRuntime,
  createCalendarClient,
  GoogleCalendarError,
  integrationSettings,
  appointmentSourceVersion,
  googleEventProjection,
  safeGoogleError
};
