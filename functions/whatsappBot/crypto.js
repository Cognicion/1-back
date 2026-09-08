// Reuses the existing KMS key via envelope encryption. AAD binds ciphertext to
// its document/purpose; plaintext is never stored, logged or put in task names.
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
function createKmsCipher({ credential, keyName, fetchImpl = fetch }) {
  async function kms(operation, value) {
    const name = keyName();
    if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(name || '')) throw Error('kms-not-configured');
    const token = await credential.getAccessToken();
    const r = await fetchImpl(`https://cloudkms.googleapis.com/v1/${name}:${operation}`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ [operation === 'encrypt' ? 'plaintext' : 'ciphertext']: value }) });
    if (!r.ok) throw Error('kms-unavailable');
    const result = await r.json();
    return result[operation === 'encrypt' ? 'ciphertext' : 'plaintext'];
  }
  return {
    async seal(value, aad) {
      const key = randomBytes(32), iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(aad));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return { v: 1, wrappedKey: await kms('encrypt', key.toString('base64')), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
    },
    async open(value, aad) {
      if (value?.v !== 1) throw Error('invalid-ciphertext');
      const key = Buffer.from(await kms('decrypt', value.wrappedKey), 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]).toString());
    }
  };
}
module.exports = { createKmsCipher };
