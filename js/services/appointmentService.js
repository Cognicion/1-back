// Pure domain shared by the existing UI and the internal server-side service.
// Transport/mutations remain server-side; do not import Admin SDK in the browser.
export { normalizarEvento, intervaloEvento, overlaps, appointmentState, validateState, getAvailability } from '../../functions/appointments/domain.mjs';
