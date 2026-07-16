import { generarNotaAutomatica } from "./notaAutomatica.js";
import { PROVIDER_STATUS } from "./transcriptionProviders.js";

export class NoteGenerationProvider {
  constructor(config = {}) { this.config = config; this.status = PROVIDER_STATUS.NOT_CONFIGURED; }
  capability() { return { status: this.status }; }
  generate() { throw new Error("NoteGenerationProvider.generate debe implementarse."); }
}

export class RuleBasedNoteGenerationProvider extends NoteGenerationProvider {
  constructor(config = {}) { super(config); this.status = PROVIDER_STATUS.AVAILABLE; }
  capability() {
    return { id: "rule_based_local", status: this.status, configured: true, isExternalAI: false,
      notice: "Motor local conservador por reglas. No es una IA externa y requiere revisión clínica." };
  }
  generate(transcript, patient = {}, options = {}) { return generarNotaAutomatica(transcript, patient, options); }
}

export class ExternalNoteGenerationProvider extends NoteGenerationProvider {
  constructor(config = {}) { super(config); this.status = config.backendEndpoint ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.NOT_CONFIGURED; }
  capability() {
    return { id: "external_backend", status: this.status, configured: Boolean(this.config.backendEndpoint), isExternalAI: true,
      notice: "Proveedor externo no configurado. Debe conectarse desde backend o Cloud Functions, nunca con claves en el navegador." };
  }
}

export function createNoteGenerationProvider(config = {}) {
  if (config.provider === "external") return new ExternalNoteGenerationProvider(config.external || {});
  return new RuleBasedNoteGenerationProvider(config.local || {});
}
