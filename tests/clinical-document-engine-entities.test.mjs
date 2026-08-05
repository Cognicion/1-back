import assert from "node:assert/strict";
import { ClinicalEntity } from "../js/modules/clinical-document-engine/entities/ClinicalEntity.js";
import { ClinicalIdentity } from "../js/modules/clinical-document-engine/entities/ClinicalIdentity.js";
import { ClinicalHistory } from "../js/modules/clinical-document-engine/entities/ClinicalHistory.js";
import { ClinicalRelationship } from "../js/modules/clinical-document-engine/entities/ClinicalRelationship.js";
import { ClinicalEntityEngine } from "../js/modules/clinical-document-engine/engine/ClinicalEntityEngine.js";
import { EntityFactory } from "../js/modules/clinical-document-engine/engine/EntityFactory.js";
import { EntityNormalizer } from "../js/modules/clinical-document-engine/engine/EntityNormalizer.js";
import { EntityMatcher } from "../js/modules/clinical-document-engine/engine/EntityMatcher.js";
import { EntityDeduplicator } from "../js/modules/clinical-document-engine/engine/EntityDeduplicator.js";
import { toLegacyDiagnosisCandidate } from "../js/modules/clinical-document-engine/adapters/diagnosisAdapter.js";
import { toLegacyMedicationCandidate } from "../js/modules/clinical-document-engine/adapters/medicationAdapter.js";

const diagnosis = {
  id: "dx-1",
  candidateType: "diagnosis",
  diagnosisName: "Trastorno depresivo recurrente",
  normalizedDiagnosis: "trastorno depresivo recurrente",
  code: "F33.2",
  system: "CIE-10",
  status: "Confirmado",
  confidence: "HIGH",
  evidence: [{ documentId: "doc-1", rawText: "Trastorno depresivo recurrente F33.2" }],
  metadata: { sourceSection: "diagnosticos", parser: "midc.diagnosisParser" },
  parserVersion: "1.0"
};
const medication = {
  id: "med-1",
  candidateType: "medication",
  medicationName: "Sertralina",
  normalizedMedicationName: "sertralina",
  strength: 50,
  strengthUnit: "mg",
  route: "oral",
  frequency: "onceDaily",
  schedule: [{ time: "08:00", quantity: 1, unit: "tableta" }],
  status: "Continúa",
  confidence: "HIGH",
  evidence: [{ documentId: "doc-1", rawText: "Sertralina 50 mg vía oral" }],
  metadata: { sourceSection: "medicamentos", rawMedicationText: "Sertralina 50 mg vía oral" },
  parserVersion: "1.0"
};

const dxEntity = EntityFactory.fromCandidate(diagnosis);
assert.ok(dxEntity instanceof ClinicalEntity);
assert.equal(dxEntity.entityType, "diagnosis");
assert.equal(dxEntity.identity.key, "diagnosis:code:F33.2");
assert.equal(dxEntity.evidence[0].documentId, "doc-1");
assert.notEqual(dxEntity.value, diagnosis);

const medEntity = EntityFactory.fromCandidate(medication);
assert.equal(medEntity.entityType, "medication");
assert.equal(medEntity.value.schedule[0].time, "08:00");
assert.notEqual(medEntity.value.schedule, medication.schedule);

new EntityNormalizer().normalize(dxEntity);
assert.equal(dxEntity.normalizedValue, "trastorno depresivo recurrente");
assert.equal(toLegacyDiagnosisCandidate(dxEntity).code, "F33.2");
assert.equal(toLegacyMedicationCandidate(medEntity).schedule[0].administrationUnit, "tableta");

const history = new ClinicalHistory();
history.record("create", dxEntity.id, { source: "test" });
assert.equal(history.list(dxEntity.id).length, 1);

const relationship = new ClinicalRelationship({ fromId: "patient-1", fromType: "patient", toId: dxEntity.id, toType: "diagnosis", type: "presenta" });
assert.equal(relationship.type, "presenta");
const engine = new ClinicalEntityEngine();
const createdDiagnosis = engine.create(diagnosis).entity;
const createdMedication = engine.create(medication).entity;
const attached = engine.relate({ from: createdDiagnosis, to: createdMedication, type: "tratadoCon", confidence: "HIGH" });
assert.equal(attached.toId, createdMedication.id);
assert.equal(createdDiagnosis.relationships.length, 1);

const matcher = new EntityMatcher();
assert.equal(matcher.match(createdDiagnosis, EntityFactory.fromCandidate({ ...diagnosis, id: "dx-2" })).matched, true);
const deduped = new EntityDeduplicator(matcher).deduplicate([createdDiagnosis, EntityFactory.fromCandidate({ ...diagnosis, id: "dx-3" }), createdMedication]);
assert.equal(deduped.entities.length, 2);
assert.equal(deduped.duplicates.length, 1);

console.log("clinical-document-engine-entities: ok");
