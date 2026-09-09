class GoogleCredentialError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(code);
    this.name = 'GoogleCredentialError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function kmsRequest({ keyName, operation, value, credential, fetchImpl = fetch }) {
  if (!keyName) throw new GoogleCredentialError('google-calendar-kms-not-configured');
  const token = await credential.getAccessToken();
  const response = await fetchImpl(`https://cloudkms.googleapis.com/v1/${keyName}:${operation}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${token.access_token || token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ [operation === 'encrypt' ? 'plaintext' : 'ciphertext']: Buffer.from(value).toString('base64') })
  });
  if (!response.ok) throw new GoogleCredentialError(`google-calendar-kms-${operation}-failed`, { status: response.status, retryable: response.status >= 500 });
  const body = await response.json();
  const encoded = body[operation === 'encrypt' ? 'ciphertext' : 'plaintext'];
  if (!encoded) throw new GoogleCredentialError(`google-calendar-kms-${operation}-empty`);
  return Buffer.from(encoded, 'base64').toString(operation === 'encrypt' ? 'base64' : 'utf8');
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret, fetchImpl = fetch }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok || !body.access_token) {
    const invalidGrant = body?.error === 'invalid_grant';
    throw new GoogleCredentialError(invalidGrant ? 'reauthorization-required' : 'google-token-refresh-failed', {
      status: response.status,
      retryable: !invalidGrant && (response.status === 429 || response.status >= 500)
    });
  }
  return { accessToken: body.access_token, expiresIn: Number(body.expires_in || 3600) };
}

module.exports = { GoogleCredentialError, kmsRequest, refreshAccessToken };
