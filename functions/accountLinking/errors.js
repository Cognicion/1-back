"use strict";

class AccountLinkingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountLinkingError";
    this.code = code;
    this.details = details;
  }
}

module.exports = { AccountLinkingError };
