const { defineSecret, defineString } = require('firebase-functions/params');

const GOOGLE_CALENDAR_CLIENT_ID = defineSecret('GOOGLE_CALENDAR_CLIENT_ID');
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret('GOOGLE_CALENDAR_CLIENT_SECRET');
const GOOGLE_CALENDAR_KMS_KEY_NAME = defineString('GOOGLE_CALENDAR_KMS_KEY_NAME', { default: '' });

const REGION = 'us-central1';
const REQUIRED_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events'
]);

module.exports = {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  GOOGLE_CALENDAR_KMS_KEY_NAME,
  REGION,
  REQUIRED_SCOPES
};
