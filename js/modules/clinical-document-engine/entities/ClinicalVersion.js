export class ClinicalVersion {
  constructor({ number = 1, parserVersion = "", change = "create" } = {}) {
    this.number = number;
    this.parserVersion = parserVersion;
    this.change = change;
  }

  next(change = "update") { return new ClinicalVersion({ number: this.number + 1, parserVersion: this.parserVersion, change }); }
}
