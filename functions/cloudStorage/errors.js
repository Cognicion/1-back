"use strict";

class CloudStorageDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CloudStorageDomainError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new CloudStorageDomainError(code, message, details);
}

function assertDomain(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}

module.exports = {
  CloudStorageDomainError,
  assertDomain,
  fail
};
