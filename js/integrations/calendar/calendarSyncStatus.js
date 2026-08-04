export const CALENDAR_SYNC_STATUS = Object.freeze({
  PENDING: "pending", SYNCED: "synced", ERROR: "error", CONFLICT: "conflict", DELETED: "deleted"
});

export function createPendingCalendarSync(existing = {}, provider = "google") {
  return {
    ...existing,
    provider,
    status: CALENDAR_SYNC_STATUS.PENDING,
    lastAttemptAt: null,
    errorCode: null,
    errorMessage: null,
    retryCount: Number(existing.retryCount || 0)
  };
}
