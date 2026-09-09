const { createHash, randomUUID } = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
    mirrorAppointments: value.mirrorAppointments === true
  };
}

function hasRequiredScopes(scopes) {
  return REQUIRED_SCOPES.every(scope => Array.isArray(scopes) && scopes.includes(scope));
}

function safeGoogleError(status, body = {}) {
  const providerReason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '');
  if (status === 401 || body?.error === 'invalid_grant') return new GoogleCalendarError('reauthorization-required', { status });
  if (status === 404) return new GoogleCalendarError('event-not-found', { status });
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
    return request(uid, connectionData, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  }

  return { connection, freeBusy, insertEvent, updateEvent, deleteEvent };
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

function googleEventProjection(appointment, appointmentId, eventId) {
  const start = timestampMillis(appointment.startAt);
  const end = timestampMillis(appointment.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !appointment.timeZone) throw new GoogleCalendarError('invalid-appointment-interval');
  const recurrence = recurrenceRules(appointment);
  return {
    id: eventId,
    summary: 'Consulta',
    start: { dateTime: new Date(start).toISOString(), timeZone: appointment.timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone: appointment.timeZone },
    extendedProperties: { private: { cognicionAppointmentId: appointmentId } },
    ...(recurrence.length ? { recurrence } : {})
  };
}

function createGoogleCalendarRuntime({ db, credential, fetchImpl = fetch, now = Date.now }) {
  const client = createCalendarClient({ db, credential, fetchImpl, now });
  const secrets = [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET];

  const availabilityProvider = Object.freeze({
    async isRequired({ doctorUid }) {
      const { integration } = await client.connection(doctorUid);
      return integration.enabled && integration.useForAvailability;
    },
    async getBusy({ doctorUid, startAt, endAt, timeZone }) {
      const { data, integration } = await client.connection(doctorUid);
      if (!integration.enabled || !integration.useForAvailability) return [];
      if (!data || data.connectionStatus !== 'connected') throw new GoogleCalendarError(data?.connectionStatus === 'reauthorization_required' ? 'reauthorization-required' : 'external-availability-unavailable');
      try {
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
    if (Object.keys(requested).some(key => !['useForAvailability', 'mirrorAppointments'].includes(key)) ||
        typeof requested.useForAvailability !== 'boolean' || typeof requested.mirrorAppointments !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Configuración inválida.');
    }
    const ref = db.doc(`googleCalendarConnections/${uid}`);
    const snapshot = await ref.get();
    const connection = snapshot.exists ? snapshot.data() || {} : null;
    if (!connection || connection.connectionStatus !== 'connected' || !connection.encryptedRefreshToken || !hasRequiredScopes(connection.scopes)) {
      throw new HttpsError('failed-precondition', 'Google Calendar no está conectado con los permisos requeridos.');
    }
    const integration = {
      enabled: requested.useForAvailability || requested.mirrorAppointments,
      useForAvailability: requested.useForAvailability,
      mirrorAppointments: requested.mirrorAppointments
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
    await ref.set({ integration, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
    return { integration, selectedCalendar: connection.selectedCalendarId || 'primary' };
  });

  async function enqueueAppointmentChange(event) {
    const { doctorUid, appointmentId } = event.params;
    const after = event.data?.after?.exists ? event.data.after.data() || {} : null;
    const before = event.data?.before?.exists ? event.data.before.data() || {} : null;
    const source = after || before;
    if (!source || source.type !== 'appointment') return;
    const { data: connection, integration } = await client.connection(doctorUid);
    if (!integration.enabled || !integration.mirrorAppointments || connection?.connectionStatus !== 'connected') return;
    const sourceVersion = appointmentSourceVersion(after || { ...before, status: 'cancelada' });
    const jobId = digest(`${doctorUid}:${appointmentId}:${sourceVersion}`);
    const linkRef = db.doc(`googleCalendarAppointmentLinks/${digest(`${doctorUid}:${appointmentId}`)}`);
    const jobRef = db.doc(`googleCalendarSyncJobs/${jobId}`);
    const current = Timestamp.fromMillis(now());
    await db.runTransaction(async tx => {
      const currentAppointment = await tx.get(db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`));
      if (after && (!currentAppointment.exists || appointmentSourceVersion(currentAppointment.data()) !== sourceVersion)) return;
      if (!after && currentAppointment.exists) return;
      if ((await tx.get(jobRef)).exists) return;
      tx.create(jobRef, {
        professionalUid: doctorUid,
        appointmentId,
        sourceVersion,
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
        syncState: 'pending',
        updatedAt: current
      }, { merge: true });
    });
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

  async function processJob(jobId) {
    const job = await claimJob(jobId);
    if (!job) return;
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
      const projection = googleEventProjection(effective, job.appointmentId, eventId);
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
        updatedAt: Timestamp.fromMillis(now())
      }, { merge: true });
      await finishJob(job, 'synced');
    } catch (error) {
      const code = error?.code === 'reauthorization-required' ? 'reauthorization-required' : String(error?.code || 'google-calendar-sync-failed');
      const terminal = code === 'reauthorization-required' || !error?.retryable || job.attemptCount >= MAX_ATTEMPTS;
      const state = code === 'reauthorization-required' ? 'reauthorization_required' : terminal ? 'failed' : 'retry';
      const nextAttemptAt = Timestamp.fromMillis(now() + Math.min(15 * 60000, 2 ** job.attemptCount * 15000));
      await linkRef.set({ syncState: state, lastErrorCode: code, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
      if (state === 'retry') await finishJob(job, state, { code, nextAttemptAt });
      else await finishJob(job, state, { code });
      logger.warn('[GOOGLE_CALENDAR_SYNC] Trabajo no sincronizado.', { code, retryable: state === 'retry', attempt: job.attemptCount });
    }
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

  const functionOptions = { region: REGION, secrets, timeoutSeconds: 120, memory: '256MiB', maxInstances: 4 };
  return {
    availabilityProvider,
    secrets,
    exports: {
      updateGoogleCalendarSettings: updateSettings,
      googleCalendarAppointmentChanged: onDocumentWritten({ region: REGION, document: 'usuarios/{doctorUid}/agenda/{appointmentId}', retry: true }, enqueueAppointmentChange),
      googleCalendarSyncJobCreated: onDocumentCreated({ ...functionOptions, document: 'googleCalendarSyncJobs/{jobId}', retry: true }, async event => processJob(event.params.jobId)),
      googleCalendarSyncDrain: onSchedule({ ...functionOptions, schedule: 'every 5 minutes', timeZone: 'UTC' }, runDueJobs)
    },
    test: { client, processJob, runDueJobs, enqueueAppointmentChange }
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
