import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBusFactor,
  calculateCoverage,
  calculateOpportunityScore,
  calculateOrganizationMetrics,
  calculateReadiness,
  detectGaps,
  simulateOrganization
} from "../js/admin/organization/services/organization-metrics.js";

test("readiness no inventa un porcentaje sin checklist", () => {
  assert.deepEqual(calculateReadiness([]), { value: null, completed: 0, total: 0, status: "not_evaluated" });
  assert.equal(calculateReadiness([{ label: "Producto", completed: true }, { label: "Ventas", completed: false }]).value, 50);
});

test("cobertura pondera parcial y conserva estado no evaluado", () => {
  assert.equal(calculateCoverage([], []).value, null);
  const result = calculateCoverage([
    { id: "a", ownerId: "p1", backupId: "p2" },
    { id: "b", ownerId: "p1" },
    { id: "c" }
  ], []);
  assert.equal(result.value, 50);
  assert.deepEqual([result.covered, result.partial, result.uncovered], [1, 1, 1]);
});

test("Bus Factor identifica conocimiento concentrado y riesgo documental", () => {
  const result = calculateBusFactor([
    { id: "f1", name: "Arquitectura", responsibleId: "p1", documentationStatus: "Ausente" },
    { id: "f2", name: "Producto", responsibleId: "p1", backupId: "p2", documentationStatus: "Completa" }
  ], []);
  assert.equal(result.value, 1);
  assert.equal(result.singlePoints.length, 1);
  assert.equal(result.undocumentedSinglePoints.length, 1);
});

test("score de oportunidad es trazable y readiness deriva de gates", () => {
  const result = calculateOpportunityScore({
    impact: 5,
    revenuePotential: 4,
    synergy: 5,
    scalability: 4,
    urgency: 3,
    effort: 2,
    technicalComplexity: 2,
    regulatoryComplexity: 3,
    readinessChecklist: [{ label: "Producto", completed: true }, { label: "Contratos", completed: false }]
  });
  assert.equal(result.status, "heuristic");
  assert.equal(result.inputs.readiness, 2.5);
  assert.ok(result.value > 0 && result.value <= 100);
  assert.ok(result.formula.impact > 0);
});

test("gaps separa falta de owner, backup y mitigación", () => {
  const gaps = detectGaps({
    areas: [{ id: "a", name: "Ventas", priority: "Alta" }],
    assignments: [{ id: "f", name: "Arquitectura", responsibleId: "p1" }],
    projects: [{ id: "pr", name: "Hospitales", priority: "Crítica" }],
    risks: [{ id: "r", name: "Regulación", severity: "Crítica" }]
  });
  assert.deepEqual(new Set(gaps.map((gap) => gap.type)), new Set(["area_owner", "function_backup", "project_owner", "risk_mitigation"]));
});

test("simulador no muta datos reales", () => {
  const data = { areas: [{ id: "a", name: "Tecnología" }], members: [{ id: "p", name: "Aldo" }], assignments: [], projects: [] };
  const result = simulateOrganization(data, { type: "assign_owner", areaId: "a", personId: "p" });
  assert.equal(data.areas[0].ownerId, undefined);
  assert.equal(result.data.areas[0].ownerId, "p");
});

test("métricas distinguen cero observado de no evaluado", () => {
  const result = calculateOrganizationMetrics({ members: [], areas: [], assignments: [], projects: [], risks: [], opportunities: [], talentNeeds: [], objectives: [], capabilities: [] });
  assert.equal(result.coverage.value, null);
  assert.equal(result.busFactor.value, null);
  assert.equal(result.criticalRisks, 0);
});
