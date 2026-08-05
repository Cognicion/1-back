import { calcularIMC } from "../../../utils/imc.js";
import { EntityFactory } from "../engine/EntityFactory.js";
import { EntityNormalizer } from "../engine/EntityNormalizer.js";
import { EntityValidationEngine } from "../engine/EntityValidationEngine.js";
import { parseVitalSigns } from "../parsers/vitalSignsParser.js";
import { clinicalImportLogger } from "../utils/logger.js";

const normalizer = new EntityNormalizer();
const validator = new EntityValidationEngine();

function toEntity(candidate) {
  const entity = EntityFactory.fromCandidate(candidate);
  normalizer.normalize(entity);
  const validation = validator.validate(entity);
  entity.metadata = { ...entity.metadata, validation };
  clinicalImportLogger.info("vitalParser:validation", JSON.stringify({ entityId: entity.id, vitalType: entity.value?.vitalType, valid: validation.valid }));
  return entity;
}

function legacyVital(entity) {
  const source = entity.value || {};
  const rawValue = source.rawValue || entity.evidence?.[0]?.rawText || "";
  if (source.vitalType === "bloodPressure") return { ...source.value, unit: source.unit || "mmHg", rawValue };
  return { value: source.value, unit: source.unit || "", rawValue };
}

export function toLegacyVitalSignsCandidate(entities = [], fields = {}) {
  const vitalSigns = {};
  entities.forEach((entity) => { vitalSigns[entity.value.vitalType] = legacyVital(entity); });
  const weight = vitalSigns.weight?.value;
  const height = vitalSigns.height?.value;
  if (Number.isFinite(Number(weight)) && Number.isFinite(Number(height)) && Number(height) > 0) {
    const calculated = calcularIMC(Number(weight), Number(height));
    if (calculated !== null) {
      vitalSigns.bmiCalculated = { value: calculated, unit: "kg/m²", source: "peso_talla" };
      if (vitalSigns.bmi?.value !== undefined) vitalSigns.bmiDifference = Number(Math.abs(vitalSigns.bmi.value - calculated).toFixed(2));
    }
  }
  const first = entities[0];
  return {
    id: first?.id || `vitals-${fields.blockIndex ?? 0}`,
    sourceType: first?.metadata?.sourceType || "table",
    sourceLocation: { blockIndex: first?.evidence?.[0]?.block ?? fields.blockIndex ?? null, ...(fields.sourceLocation || {}) },
    include: true,
    vitalSigns,
    entities,
    requiresReview: entities.some((entity) => entity.metadata?.validation?.valid === false || entity.requiresReview),
    date: fields.fecha || first?.value?.date || "",
    time: fields.hora || first?.value?.time || ""
  };
}

export function adaptVitalSignsCandidates(args = {}) {
  const tableBlocks = (args.blocks || []).filter((block) => block.type === "table");
  if (tableBlocks.length) {
    return tableBlocks.map((block) => {
      const candidates = parseVitalSigns({ ...args, blocks: [block] });
      const entities = candidates.map(toEntity);
      return toLegacyVitalSignsCandidate(entities, { sourceLocation: block.source, blockIndex: block.source?.blockIndex, fecha: args.date, hora: args.time });
    }).filter((candidate) => candidate.entities.length);
  }
  const candidates = parseVitalSigns(args);
  if (!candidates.length) return [];
  return [toLegacyVitalSignsCandidate(candidates.map(toEntity), { fecha: args.date, hora: args.time })];
}

export function adaptVitalSignsParser(args = {}) {
  return parseVitalSigns(args).map(toEntity);
}

export class VitalSignsAdapter {
  adapt(args = {}) { return adaptVitalSignsCandidates(args); }
  parse(args = {}) { return adaptVitalSignsParser(args); }
  toLegacy(entities = [], fields = {}) { return toLegacyVitalSignsCandidate(entities, fields); }
}

export { parseVitalSigns };
