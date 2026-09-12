export const OPPORTUNITY_SCORE_FORMULA = Object.freeze({
  impact: 0.24,
  revenuePotential: 0.12,
  synergy: 0.16,
  scalability: 0.12,
  readiness: 0.16,
  urgency: 0.08,
  effort: -0.06,
  technicalComplexity: -0.03,
  regulatoryComplexity: -0.03
});

const asArray = (value) => Array.isArray(value) ? value : [];
const active = (item) => item?.archived !== true && item?.status !== "archived" && item?.estado !== "Archivado";
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function calculateReadiness(checklist = []) {
  const items = asArray(checklist).filter((item) => item && item.label);
  if (!items.length) return { value: null, completed: 0, total: 0, status: "not_evaluated" };
  const completed = items.filter((item) => item.completed === true).length;
  return {
    value: Math.round((completed / items.length) * 100),
    completed,
    total: items.length,
    status: "measured"
  };
}

export function calculateOpportunityScore(opportunity = {}, formula = OPPORTUNITY_SCORE_FORMULA) {
  const readiness = calculateReadiness(opportunity.readinessChecklist).value;
  const values = {
    impact: number(opportunity.impact, 0),
    revenuePotential: number(opportunity.revenuePotential, 0),
    synergy: number(opportunity.synergy, 0),
    scalability: number(opportunity.scalability, 0),
    readiness: readiness === null ? 0 : readiness / 20,
    urgency: number(opportunity.urgency, 0),
    effort: number(opportunity.effort, 0),
    technicalComplexity: number(opportunity.technicalComplexity, 0),
    regulatoryComplexity: number(opportunity.regulatoryComplexity, 0)
  };
  const raw = Object.entries(formula).reduce((total, [field, weight]) => total + values[field] * weight, 0);
  return {
    value: Math.round(clamp(raw * 20) * 10) / 10,
    status: "heuristic",
    inputs: values,
    formula
  };
}

export function calculateCoverage(areas = [], assignments = []) {
  const relevantAreas = asArray(areas).filter(active);
  if (!relevantAreas.length) return { value: null, covered: 0, partial: 0, uncovered: 0, total: 0, status: "not_evaluated" };
  const activeAssignments = asArray(assignments).filter(active);
  let covered = 0;
  let partial = 0;
  for (const area of relevantAreas) {
    const related = activeAssignments.filter((assignment) => assignment.areaId === area.id);
    const hasOwner = Boolean(area.ownerId) || related.some((assignment) => assignment.raci?.responsibleId || assignment.responsibleId);
    const hasBackup = Boolean(area.backupId) || related.some((assignment) => assignment.raci?.backupId || assignment.backupId);
    if (hasOwner && hasBackup) covered += 1;
    else if (hasOwner || String(area.coverage || "").toLowerCase() === "parcial") partial += 1;
  }
  const uncovered = relevantAreas.length - covered - partial;
  return {
    value: Math.round(((covered + partial * 0.5) / relevantAreas.length) * 100),
    covered,
    partial,
    uncovered,
    total: relevantAreas.length,
    status: "derived"
  };
}

export function calculateBusFactor(assignments = [], knowledge = []) {
  const functions = asArray(assignments).filter(active).map((item) => ({
    id: item.id,
    name: item.name || item.functionName || "Función sin nombre",
    people: [...new Set([
      item.raci?.responsibleId,
      item.responsibleId,
      item.raci?.executorId,
      item.executorId,
      item.raci?.backupId,
      item.backupId,
      ...asArray(item.personIds)
    ].filter(Boolean))],
    documented: item.documentationStatus === "Completa"
  }));
  for (const capability of asArray(knowledge).filter(active)) {
    functions.push({
      id: capability.id,
      name: capability.name || "Capacidad sin nombre",
      people: [...new Set(asArray(capability.personIds).filter(Boolean))],
      documented: capability.documentationStatus === "Completa"
    });
  }
  const evaluated = functions.filter((item) => item.people.length > 0);
  const singlePoints = evaluated.filter((item) => item.people.length === 1);
  return {
    value: evaluated.length ? Math.min(...evaluated.map((item) => item.people.length)) : null,
    evaluated: evaluated.length,
    singlePoints,
    undocumentedSinglePoints: singlePoints.filter((item) => !item.documented),
    status: evaluated.length ? "approximate" : "not_evaluated"
  };
}

export function calculateWorkload(members = [], assignments = [], projects = []) {
  const activeMembers = asArray(members).filter(active);
  return activeMembers.map((member) => {
    const responsibilities = asArray(assignments).filter((item) => active(item) && [
      item.responsibleId,
      item.executorId,
      item.approverId,
      item.backupId,
      item.raci?.responsibleId,
      item.raci?.executorId,
      item.raci?.approverId,
      item.raci?.backupId,
      ...asArray(item.personIds)
    ].includes(member.id));
    const activeProjects = asArray(projects).filter((item) => active(item) && !["Completado", "Cancelado", "Pausado"].includes(item.status) && [item.ownerId, item.responsibleId, ...asArray(item.collaboratorIds)].includes(member.id));
    const critical = responsibilities.filter((item) => ["Alta", "Crítica", "Critica"].includes(item.criticality)).length;
    const score = responsibilities.length + activeProjects.length * 1.5 + critical * 1.5;
    const declared = member.workload || member.loadLevel || "No evaluada";
    const overloaded = declared === "Saturada" || number(member.workloadPercent, 0) > 100 || score >= 10;
    return { memberId: member.id, name: member.name, responsibilities: responsibilities.length, projects: activeProjects.length, critical, score, declared, overloaded };
  });
}

export function detectGaps(data = {}) {
  const areas = asArray(data.areas).filter(active);
  const assignments = asArray(data.assignments).filter(active);
  const projects = asArray(data.projects).filter(active);
  const risks = asArray(data.risks).filter(active);
  const talentNeeds = asArray(data.talentNeeds).filter(active);
  return [
    ...areas.filter((item) => !item.ownerId).map((item) => ({ severity: item.priority === "Crítica" ? "Crítica" : "Alta", type: "area_owner", message: `Área sin responsable: ${item.name}`, entityId: item.id })),
    ...assignments.filter((item) => !(item.responsibleId || item.raci?.responsibleId)).map((item) => ({ severity: "Alta", type: "function_owner", message: `Función sin responsable: ${item.name}`, entityId: item.id })),
    ...assignments.filter((item) => (item.responsibleId || item.raci?.responsibleId) && !(item.backupId || item.raci?.backupId)).map((item) => ({ severity: "Media", type: "function_backup", message: `Función sin backup: ${item.name}`, entityId: item.id })),
    ...projects.filter((item) => !item.ownerId).map((item) => ({ severity: item.priority === "Crítica" ? "Crítica" : "Alta", type: "project_owner", message: `Proyecto sin owner: ${item.name}`, entityId: item.id })),
    ...risks.filter((item) => ["Crítica", "Critica", "Alta"].includes(item.severity) && !item.mitigation).map((item) => ({ severity: "Crítica", type: "risk_mitigation", message: `Riesgo crítico sin mitigación: ${item.name}`, entityId: item.id })),
    ...talentNeeds.filter((item) => item.urgency === "Crítica" && !["Buscando", "Entrevistando", "Seleccionado", "Incorporado"].includes(item.status)).map((item) => ({ severity: "Alta", type: "talent_search", message: `Perfil crítico sin búsqueda activa: ${item.name || item.profile}`, entityId: item.id }))
  ];
}

export function buildInsights(data = {}) {
  const insights = [];
  const busFactor = calculateBusFactor(data.assignments, data.capabilities);
  const workload = calculateWorkload(data.members, data.assignments, data.projects);
  if (busFactor.singlePoints.length) insights.push(`${busFactor.singlePoints.length} funciones o capacidades dependen de una sola persona.`);
  const overloaded = workload.filter((item) => item.overloaded);
  if (overloaded.length) insights.push(`${overloaded.length} personas presentan un indicador administrativo de sobrecarga.`);
  const blocked = asArray(data.projects).filter((item) => active(item) && item.status === "Bloqueado");
  if (blocked.length) insights.push(`${blocked.length} proyectos están marcados como bloqueados.`);
  const uncovered = calculateCoverage(data.areas, data.assignments).uncovered;
  if (uncovered) insights.push(`${uncovered} áreas no tienen cobertura identificable con los datos actuales.`);
  return insights;
}

export function calculateOrganizationMetrics(data = {}) {
  const coverage = calculateCoverage(data.areas, data.assignments);
  const busFactor = calculateBusFactor(data.assignments, data.capabilities);
  const workload = calculateWorkload(data.members, data.assignments, data.projects);
  const gaps = detectGaps(data);
  return {
    coverage,
    busFactor,
    workload,
    gaps,
    activeAreas: asArray(data.areas).filter(active).length,
    activeMembers: asArray(data.members).filter(active).length,
    activeProjects: asArray(data.projects).filter((item) => active(item) && !["Completado", "Cancelado"].includes(item.status)).length,
    blockedProjects: asArray(data.projects).filter((item) => active(item) && item.status === "Bloqueado").length,
    activeObjectives: asArray(data.objectives).filter((item) => active(item) && item.status === "Activo").length,
    opportunities: asArray(data.opportunities).filter(active).length,
    criticalRisks: asArray(data.risks).filter((item) => active(item) && ["Crítica", "Critica"].includes(item.severity)).length,
    priorityTalent: asArray(data.talentNeeds).filter((item) => active(item) && ["Alta", "Crítica"].includes(item.urgency)).length,
    insights: buildInsights(data)
  };
}

export function simulateOrganization(data = {}, scenario = {}) {
  const clone = typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  const before = calculateOrganizationMetrics(clone);
  if (scenario.type === "hire" && scenario.name) {
    clone.members = [...asArray(clone.members), { id: `simulation-member-${Date.now()}`, name: scenario.name, status: "active", simulated: true }];
  }
  if (scenario.type === "assign_owner" && scenario.areaId && scenario.personId) {
    clone.areas = asArray(clone.areas).map((area) => area.id === scenario.areaId ? { ...area, ownerId: scenario.personId } : area);
  }
  if (scenario.type === "create_area" && scenario.name) {
    clone.areas = [...asArray(clone.areas), { id: `simulation-area-${Date.now()}`, name: scenario.name, status: "Planeada", simulated: true }];
  }
  if (scenario.type === "add_backup" && scenario.assignmentId && scenario.personId) {
    clone.assignments = asArray(clone.assignments).map((item) => item.id === scenario.assignmentId ? { ...item, backupId: scenario.personId } : item);
  }
  return { before, after: calculateOrganizationMetrics(clone), data: clone, scenario };
}
