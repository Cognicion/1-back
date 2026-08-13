export function withoutUndefinedValues(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => withoutUndefinedValues(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, withoutUndefinedValues(item)])
      .filter(([, item]) => item !== undefined)
  );
}

export function sanitizeFirestorePayload(payload = {}) {
  return withoutUndefinedValues(payload) || {};
}
