import {
  ORGANIZATION_COLLECTIONS,
  archiveEntity,
  createInitialStructure,
  exportCollectionCsv,
  exportOrganizationJson,
  loadOrganization,
  saveEntity
} from "./services/organization-service.js";
import {
  OPPORTUNITY_SCORE_FORMULA,
  calculateOpportunityScore,
  calculateOrganizationMetrics,
  calculateReadiness,
  simulateOrganization
} from "./services/organization-metrics.js";

const TABS = [
  ["summary", "Resumen"], ["map", "Mapa"], ["members", "Equipo"], ["areas", "Áreas"],
  ["responsibilities", "Responsabilidades"], ["projects", "Proyectos"], ["expansion", "Expansión"],
  ["talent", "Talento"], ["risks", "Riesgos"], ["objectives", "Objetivos"],
  ["decisions", "Decisiones"], ["history", "Historial"], ["simulator", "Simulador"]
];

const STATUS = {
  members: ["Activo", "Parcial", "Asesor", "Inactivo"],
  areas: ["Cubierta", "Parcial", "Descubierta", "Externalizada", "En búsqueda", "Planeada"],
  projects: ["Idea", "Evaluación", "Planeado", "Activo", "Bloqueado", "Validación", "Producción", "Pausado", "Cancelado", "Completado"],
  talentNeeds: ["Detectado", "Por definir", "Buscando", "Entrevistando", "Seleccionado", "Incorporado", "Pausado"],
  objectives: ["Planeado", "Activo", "En riesgo", "Cumplido", "Cancelado"],
  alliances: ["Prospecto", "Contacto", "Conversación", "Negociación", "Activo", "Pausado", "Finalizado"],
  businessLines: ["Idea", "Evaluación", "Validación", "Activa", "Pausada"],
  risks: ["Abierto", "En mitigación", "Aceptado", "Resuelto"],
  opportunities: ["Hacer ahora", "Preparar", "Investigar", "Esperar", "Descartado"]
};

const ENTITY = {
  members: { singular: "persona", title: "Equipo", fields: [["name", "Nombre", "text", true], ["userId", "UID de usuario (si existe)"], ["memberType", "Tipo", "select", false, ["Fundador", "Socio", "Empleado", "Colaborador", "Asesor", "Consultor", "Externo"]], ["title", "Cargo / título"], ["areaIds", "Áreas (IDs)", "list"], ["projectIds", "Proyectos (IDs)", "list"], ["skills", "Habilidades", "list"], ["knowledge", "Conocimiento especializado", "list"], ["decisionAuthority", "Autoridad de decisión", "textarea"], ["availability", "Disponibilidad aproximada"], ["workload", "Carga", "select", false, ["No evaluada", "Baja", "Media", "Alta", "Saturada"]], ["backupId", "Backup (ID)"], ["status", "Estado", "select", false, STATUS.members], ["joinedAt", "Fecha de incorporación", "date"], ["notes", "Notas administrativas", "textarea"]] },
  areas: { singular: "área", title: "Áreas", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["mission", "Misión", "textarea"], ["ownerId", "Responsable (ID)"], ["backupId", "Backup (ID)"], ["coverage", "Cobertura", "select", false, STATUS.areas], ["maturity", "Madurez (1-5)", "number"], ["priority", "Prioridad", "select", false, ["Baja", "Media", "Alta", "Crítica"]], ["currentCapacity", "Capacidad actual"], ["desiredCapacity", "Capacidad deseada"], ["documentationStatus", "Documentación", "select", false, ["No evaluada", "Ausente", "Parcial", "Completa"]], ["projectIds", "Proyectos (IDs)", "list"]] },
  roles: { singular: "rol", title: "Roles", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["areaId", "Área (ID)"], ["decisionScope", "Ámbito de decisión", "textarea"], ["future", "Rol futuro", "checkbox"]] },
  assignments: { singular: "responsabilidad", title: "Responsabilidades", fields: [["name", "Función", "text", true], ["areaId", "Área (ID)"], ["projectId", "Proyecto (ID)"], ["responsibleId", "Responsable principal (ID)"], ["executorId", "Ejecutor (ID)"], ["approverId", "Aprobador (ID)"], ["consultedIds", "Consultados (IDs)", "list"], ["informedIds", "Informados (IDs)", "list"], ["backupId", "Backup (ID)"], ["criticality", "Criticidad", "select", false, ["Baja", "Media", "Alta", "Crítica"]], ["load", "Carga relativa", "select", false, ["Baja", "Media", "Alta", "Saturada"]], ["delegation", "Tratamiento", "select", false, ["Mantener", "Delegar", "Automatizar", "Externalizar", "Documentar primero", "Formar backup"]], ["documentationStatus", "Documentación", "select", false, ["Ausente", "Parcial", "Completa"]]] },
  projects: { singular: "proyecto", title: "Proyectos", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["ownerId", "Owner (ID)"], ["responsibleId", "Responsable (ID)"], ["collaboratorIds", "Colaboradores (IDs)", "list"], ["areaId", "Área (ID)"], ["status", "Estado", "select", false, STATUS.projects], ["phase", "Fase"], ["priority", "Prioridad", "select", false, ["Baja", "Media", "Alta", "Crítica"]], ["impact", "Impacto (1-5)", "number"], ["complexity", "Complejidad (1-5)", "number"], ["risk", "Riesgo (1-5)", "number"], ["startDate", "Inicio", "date"], ["deadline", "Deadline", "date"], ["dependencies", "Dependencias", "list"], ["blockers", "Bloqueadores", "list"], ["progress", "Progreso real (%)", "number"]] },
  opportunities: { singular: "oportunidad", title: "Oportunidades", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["category", "Categoría"], ["status", "Prioridad", "select", false, STATUS.opportunities], ["ownerId", "Responsable (ID)"], ["impact", "Impacto estratégico (1-5)", "number"], ["revenuePotential", "Potencial ingresos (1-5, heurístico)", "number"], ["synergy", "Sinergia (1-5)", "number"], ["scalability", "Escalabilidad (1-5)", "number"], ["urgency", "Urgencia (1-5)", "number"], ["effort", "Esfuerzo (1-5)", "number"], ["technicalComplexity", "Complejidad técnica (1-5)", "number"], ["regulatoryComplexity", "Complejidad regulatoria (1-5)", "number"], ["dependencies", "Dependencias", "list"], ["readinessChecklist", "Gates (uno por línea; prefijo [x] si completo)", "checklist"]] },
  talentNeeds: { singular: "perfil", title: "Talento faltante", fields: [["name", "Perfil", "text", true], ["areaId", "Área (ID)"], ["reason", "Problema que resuelve", "textarea"], ["projectIds", "Proyectos desbloqueados (IDs)", "list"], ["skills", "Habilidades requeridas", "list"], ["urgency", "Urgencia", "select", false, ["Baja", "Media", "Alta", "Crítica"]], ["impact", "Impacto (1-5)", "number"], ["engagementType", "Tipo", "select", false, ["Socio", "Empleado", "Consultor", "Freelance", "Proveedor", "Asesor"]], ["budget", "Presupuesto aproximado opcional"], ["idealDate", "Fecha ideal", "date"], ["status", "Estado", "select", false, STATUS.talentNeeds], ["searchOwnerId", "Responsable de búsqueda (ID)"]]},
  risks: { singular: "riesgo", title: "Riesgos", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["type", "Tipo", "select", false, ["Tecnológico", "Financiero", "Legal", "Regulatorio", "Clínico", "Operativo", "Comercial", "Reputacional", "Seguridad", "Dependencia", "Personal", "Mercado", "Proveedor"]], ["probability", "Probabilidad (1-5)", "number"], ["impact", "Impacto (1-5)", "number"], ["severity", "Severidad", "select", false, ["Informativa", "Media", "Alta", "Crítica"]], ["ownerId", "Responsable (ID)"], ["mitigation", "Estrategia de mitigación", "textarea"], ["reviewDate", "Fecha de revisión", "date"], ["projectIds", "Proyectos relacionados (IDs)", "list"], ["status", "Estado", "select", false, STATUS.risks]] },
  objectives: { singular: "objetivo", title: "Objetivos", fields: [["name", "Título", "text", true], ["description", "Descripción", "textarea"], ["ownerId", "Responsable (ID)"], ["dueDate", "Fecha", "date"], ["status", "Estado", "select", false, STATUS.objectives], ["priority", "Prioridad", "select", false, ["Baja", "Media", "Alta", "Crítica"]], ["keyResults", "Resultados clave", "list"], ["projectIds", "Proyectos relacionados (IDs)", "list"], ["progress", "Progreso real (%)", "number"]] },
  decisions: { singular: "decisión", title: "Decisiones", fields: [["name", "Título", "text", true], ["date", "Fecha", "date"], ["context", "Contexto", "textarea"], ["problem", "Problema", "textarea"], ["alternatives", "Alternativas", "list"], ["decision", "Decisión", "textarea", true], ["ownerId", "Responsable (ID)"], ["participantIds", "Participantes (IDs)", "list"], ["reason", "Motivo", "textarea"], ["expectedConsequences", "Consecuencias esperadas", "textarea"], ["reviewDate", "Fecha de revisión", "date"], ["observedResult", "Resultado observado", "textarea"], ["relatedType", "Entidad relacionada"], ["relatedId", "ID relacionado"]] },
  capabilities: { singular: "capacidad", title: "Capacidades", fields: [["name", "Capacidad", "text", true], ["currentLevel", "Nivel actual (1-5)", "number"], ["requiredLevel", "Nivel requerido (1-5)", "number"], ["personIds", "Personas disponibles (IDs)", "list"], ["documentationStatus", "Documentación", "select", false, ["Ausente", "Parcial", "Completa"]], ["externalCapacity", "Capacidad externa", "textarea"]] },
  businessLines: { singular: "línea", title: "Líneas de negocio", fields: [["name", "Nombre", "text", true], ["targetCustomer", "Cliente objetivo"], ["problem", "Problema", "textarea"], ["valueProposition", "Propuesta de valor", "textarea"], ["monetization", "Monetización"], ["maturity", "Madurez (1-5)", "number"], ["ownerIds", "Responsables (IDs)", "list"], ["productIds", "Productos (IDs)", "list"], ["status", "Estado", "select", false, STATUS.businessLines], ["hypothesis", "Hipótesis principal"], ["evidence", "Evidencia", "textarea"], ["hypothesisStatus", "Estado de hipótesis", "select", false, ["Sin probar", "Evaluando", "Validada", "Refutada", "Inconclusa"]]] },
  alliances: { singular: "alianza", title: "Alianzas", fields: [["name", "Nombre", "text", true], ["type", "Tipo"], ["status", "Estado", "select", false, STATUS.alliances], ["ownerId", "Responsable (ID)"], ["opportunityIds", "Oportunidades (IDs)", "list"], ["projectIds", "Proyectos (IDs)", "list"], ["notes", "Notas", "textarea"]] },
  products: { singular: "producto", title: "Productos", fields: [["name", "Nombre", "text", true], ["description", "Descripción", "textarea"], ["ownerId", "Owner (ID)"], ["areaId", "Área (ID)"], ["projectIds", "Proyectos (IDs)", "list"], ["businessLineIds", "Líneas de negocio (IDs)", "list"], ["status", "Estado", "select", false, ["Idea", "Validación", "Activo", "Producción", "Pausado", "Retirado"]]] },
  hypotheses: { singular: "hipótesis", title: "Hipótesis de negocio", fields: [["name", "Hipótesis", "text", true], ["businessLineId", "Línea de negocio (ID)"], ["evidence", "Evidencia", "textarea"], ["experiment", "Experimento", "textarea"], ["result", "Resultado", "textarea"], ["status", "Estado", "select", false, ["Sin probar", "Evaluando", "Validada", "Refutada", "Inconclusa"]]] }
};

const INITIAL_AREAS = ["Tecnología", "Producto", "IA", "Clínica", "Investigación", "Negocios", "Ventas", "Marketing", "Finanzas", "Administración", "Legal", "Regulación", "Ciberseguridad", "Diseño", "Datos", "Operaciones", "Recursos humanos"];
let singleton = null;

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const text = (value, fallback = "No evaluado") => value === undefined || value === null || value === "" ? fallback : String(value);
const activeItems = (items = []) => items.filter((item) => !item.archived);

function ensureStyles() {
  if (document.querySelector("link[data-organization-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/admin-organization.css?v=20260912-organizacion-v1";
  link.dataset.organizationStyles = "true";
  document.head.appendChild(link);
}

function download(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

class OrganizationApp {
  constructor({ host, authUser, organizationId }) {
    this.host = host;
    this.authUser = authUser;
    this.organizationId = organizationId;
    this.data = Object.fromEntries(ORGANIZATION_COLLECTIONS.map((key) => [key, []]));
    this.tab = "summary";
    this.query = "";
    this.busy = false;
    this.simulation = null;
  }

  async init() {
    ensureStyles();
    this.renderShell();
    await this.reload();
    return this;
  }

  renderShell() {
    this.host.innerHTML = `
      <div class="organization-shell">
        <div class="organization-toolbar">
          <label class="organization-search"><span>Buscar</span><input type="search" data-org-search placeholder="Persona, área, rol, proyecto, riesgo…" aria-label="Buscar en la organización"></label>
          <div class="organization-toolbar-actions">
            <button type="button" data-org-export-json>Exportar JSON</button>
            <button type="button" data-org-export-csv>CSV de vista</button>
            <button type="button" data-org-refresh>Actualizar</button>
          </div>
        </div>
        <nav class="organization-tabs" aria-label="Vistas de organización">${TABS.map(([id, label]) => `<button type="button" data-org-tab="${id}" aria-selected="${id === this.tab}">${label}</button>`).join("")}</nav>
        <div data-org-status class="organization-status" role="status"></div>
        <div data-org-content class="organization-content"></div>
      </div>
      <dialog class="organization-dialog" data-org-dialog aria-labelledby="organizationDialogTitle"><form method="dialog" data-org-form></form></dialog>`;
    this.host.setAttribute("aria-busy", "true");
    this.host.querySelector("[data-org-search]").addEventListener("input", (event) => { this.query = event.target.value.trim().toLowerCase(); this.render(); });
    this.host.querySelector("[data-org-refresh]").addEventListener("click", () => this.reload());
    this.host.querySelector("[data-org-export-json]").addEventListener("click", () => download(`cognicion-organizacion-${new Date().toISOString().slice(0, 10)}.json`, exportOrganizationJson(this.data), "application/json"));
    this.host.querySelector("[data-org-export-csv]").addEventListener("click", () => {
      const type = this.primaryEntityForTab();
      download(`cognicion-${type}.csv`, exportCollectionCsv(this.data[type] || []), "text/csv;charset=utf-8");
    });
    this.host.querySelector(".organization-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-org-tab]");
      if (!button) return;
      this.tab = button.dataset.orgTab;
      this.host.querySelectorAll("[data-org-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
      this.render();
    });
  }

  async reload() {
    if (this.busy) return;
    this.busy = true;
    this.setStatus("Cargando datos organizacionales…");
    this.host.setAttribute("aria-busy", "true");
    try {
      this.data = await loadOrganization(this.organizationId);
      this.render();
      this.setStatus("Datos actualizados.");
    } catch (error) {
      const offline = !navigator.onLine;
      this.setStatus(offline ? "Firestore no está disponible sin conexión. Reintenta al recuperar conectividad." : `No se pudieron leer los datos: ${error.message || "error desconocido"}`, true);
      this.renderEmptyError();
      throw error;
    } finally {
      this.busy = false;
      this.host.setAttribute("aria-busy", "false");
    }
  }

  setStatus(message, error = false) {
    const node = this.host.querySelector("[data-org-status]");
    node.textContent = message;
    node.classList.toggle("is-error", error);
  }

  renderEmptyError() {
    this.host.querySelector("[data-org-content]").innerHTML = `<div class="organization-empty"><strong>No hay datos disponibles.</strong><p>La pantalla conserva este estado para distinguir un error de una organización vacía.</p><button type="button" data-org-retry>Reintentar</button></div>`;
    this.host.querySelector("[data-org-retry]")?.addEventListener("click", () => this.reload());
  }

  primaryEntityForTab() {
    return ({ summary: "areas", map: "members", responsibilities: "assignments", expansion: "opportunities", talent: "talentNeeds", history: "organizationEvents", simulator: "areas" })[this.tab] || this.tab;
  }

  render() {
    const content = this.host.querySelector("[data-org-content]");
    if (!content) return;
    if (this.query) content.innerHTML = this.renderSearch();
    else if (this.tab === "summary") content.innerHTML = this.renderDashboard();
    else if (this.tab === "map") content.innerHTML = this.renderMap();
    else if (this.tab === "areas") content.innerHTML = this.renderAreas();
    else if (this.tab === "responsibilities") content.innerHTML = this.renderResponsibilities();
    else if (this.tab === "expansion") content.innerHTML = this.renderExpansion();
    else if (this.tab === "talent") content.innerHTML = this.renderTalent();
    else if (this.tab === "risks") content.innerHTML = this.renderRisks();
    else if (this.tab === "history") content.innerHTML = this.renderHistory();
    else if (this.tab === "simulator") content.innerHTML = this.renderSimulator();
    else content.innerHTML = this.renderEntity(this.tab);
    this.bindContentEvents();
  }

  metricCard(label, value, description, tone = "") {
    return `<article class="organization-metric ${tone}" tabindex="0" title="${escapeHtml(description)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(description)}</small></article>`;
  }

  renderDashboard() {
    const metrics = calculateOrganizationMetrics(this.data);
    const noData = ORGANIZATION_COLLECTIONS.every((key) => !(this.data[key] || []).length);
    return `<section class="organization-dashboard" aria-labelledby="orgOverviewTitle">
      <div class="organization-view-heading"><div><span class="organization-kicker">Estado actual</span><h3 id="orgOverviewTitle">${escapeHtml(this.data.organization?.name || "COGNICIÓN Labs")}</h3><p>Los porcentajes solo aparecen cuando existen registros suficientes. “No evaluado” no equivale a cero.</p></div>${noData ? '<button type="button" data-org-initialize>Crear estructura inicial</button>' : ""}</div>
      <div class="organization-metrics">
        ${this.metricCard("Cobertura", metrics.coverage.value === null ? "No evaluada" : `${metrics.coverage.value}%`, "Áreas cubiertas + 0.5 × áreas parciales, dividido entre áreas activas.")}
        ${this.metricCard("Áreas activas", metrics.activeAreas, "Áreas no archivadas registradas.")}
        ${this.metricCard("Áreas descubiertas", metrics.coverage.total ? metrics.coverage.uncovered : "No evaluado", "Áreas activas sin responsable ni cobertura parcial.", metrics.coverage.uncovered ? "is-warning" : "")}
        ${this.metricCard("Personas activas", metrics.activeMembers, "Miembros no archivados.")}
        ${this.metricCard("Indicador de sobrecarga", metrics.workload.length ? metrics.workload.filter((item) => item.overloaded).length : "No evaluado", "Carga declarada saturada, >100%, o combinación heurística de funciones, proyectos y criticidad.", metrics.workload.some((item) => item.overloaded) ? "is-warning" : "")}
        ${this.metricCard("Bus Factor mínimo", metrics.busFactor.value ?? "No evaluado", "Menor número de personas asociadas a una función o capacidad evaluada.", metrics.busFactor.value === 1 ? "is-danger" : "")}
        ${this.metricCard("Conocimiento BF=1", metrics.busFactor.singlePoints.length || (metrics.busFactor.status === "not_evaluated" ? "No evaluado" : 0), "Funciones/capacidades con una sola persona asociada.")}
        ${this.metricCard("Proyectos activos", metrics.activeProjects, "Proyectos no archivados ni completados/cancelados.")}
        ${this.metricCard("Proyectos bloqueados", metrics.blockedProjects, "Proyectos cuyo estado registrado es Bloqueado.", metrics.blockedProjects ? "is-warning" : "")}
        ${this.metricCard("Oportunidades", metrics.opportunities, "Oportunidades no archivadas registradas.")}
        ${this.metricCard("Talento prioritario", metrics.priorityTalent, "Perfiles con urgencia alta o crítica.")}
        ${this.metricCard("Riesgos críticos", metrics.criticalRisks, "Riesgos con severidad crítica registrada.", metrics.criticalRisks ? "is-danger" : "")}
      </div>
      <div class="organization-dashboard-grid">
        <article class="organization-panel"><div class="organization-panel-title"><h4>Alertas organizacionales</h4><span>${metrics.gaps.length}</span></div>${metrics.gaps.length ? `<ul class="organization-alert-list">${metrics.gaps.slice(0, 10).map((gap) => `<li data-severity="${escapeHtml(gap.severity)}"><strong>${escapeHtml(gap.severity)}</strong><span>${escapeHtml(gap.message)}</span></li>`).join("")}</ul>` : '<p class="organization-empty-copy">Sin alertas derivables. Esto puede significar que faltan datos; no implica ausencia de riesgo.</p>'}</article>
        <article class="organization-panel"><div class="organization-panel-title"><h4>Insights explicables</h4><span>Reglas</span></div>${metrics.insights.length ? `<ul class="organization-insight-list">${metrics.insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="organization-empty-copy">Aún no hay datos suficientes para producir insights.</p>'}</article>
      </div>
    </section>`;
  }

  renderSearch() {
    const groups = Object.entries(ENTITY).map(([type, config]) => {
      const matches = activeItems(this.data[type] || []).filter((item) => JSON.stringify(item).toLowerCase().includes(this.query));
      return matches.length ? `<section class="organization-search-group"><h3>${escapeHtml(config.title)} <span>${matches.length}</span></h3>${matches.map((item) => this.entityCard(type, item)).join("")}</section>` : "";
    }).join("");
    return groups || `<div class="organization-empty"><strong>Sin coincidencias</strong><p>No se encontraron resultados para “${escapeHtml(this.query)}”.</p></div>`;
  }

  renderEntity(type, embedded = false) {
    const config = ENTITY[type];
    if (!config) return `<div class="organization-empty">Vista no disponible.</div>`;
    const items = activeItems(this.data[type] || []);
    return `<section class="organization-entity-view"><div class="organization-view-heading"><div><span class="organization-kicker">Catálogo editable</span><h3>${escapeHtml(config.title)}</h3><p>${items.length ? `${items.length} registros activos.` : "Sin registros. No se asume cobertura."}</p></div><button type="button" data-org-new="${type}">Crear ${escapeHtml(config.singular)}</button></div><div class="organization-card-grid">${items.length ? items.map((item) => this.entityCard(type, item)).join("") : '<div class="organization-empty"><strong>Sin datos</strong><p>Crea el primer registro cuando dispongas de información real.</p></div>'}</div></section>${embedded ? "" : ""}`;
  }

  entityCard(type, item) {
    const config = ENTITY[type];
    const name = item.name || item.title || item.profile || "Sin nombre";
    const status = item.status || item.coverage || item.severity || item.memberType || "No evaluado";
    const details = config.fields.filter(([key]) => !["name", "title", "description", "notes"].includes(key) && item[key] !== undefined && item[key] !== "").slice(0, 4);
    return `<article class="organization-entity-card"><div><span class="organization-chip">${escapeHtml(status)}</span><h4>${escapeHtml(name)}</h4>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div><dl>${details.map(([key, label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(Array.isArray(item[key]) ? item[key].join(", ") : text(item[key]))}</dd></div>`).join("")}</dl><div class="organization-card-actions"><button type="button" data-org-edit="${type}" data-id="${escapeHtml(item.id)}">Editar</button><button type="button" class="is-quiet" data-org-archive="${type}" data-id="${escapeHtml(item.id)}">Archivar</button></div></article>`;
  }

  renderResponsibilities() {
    const metrics = calculateOrganizationMetrics(this.data);
    const members = Object.fromEntries((this.data.members || []).map((item) => [item.id, item.name]));
    const areas = Object.fromEntries((this.data.areas || []).map((item) => [item.id, item.name]));
    const rows = activeItems(this.data.assignments || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(areas[item.areaId] || "Sin área")}</td><td>${escapeHtml(members[item.responsibleId] || "Sin responsable")}</td><td>${escapeHtml(members[item.executorId] || "—")}</td><td>${escapeHtml(members[item.approverId] || "—")}</td><td>${escapeHtml(members[item.backupId] || "Sin backup")}</td><td>${escapeHtml(item.load || "No evaluada")}</td><td>${escapeHtml(item.delegation || "No evaluado")}</td><td><button type="button" data-org-edit="assignments" data-id="${escapeHtml(item.id)}">Editar</button></td></tr>`).join("");
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">RACI adaptada</span><h3>Mapa de responsabilidades</h3><p>Responsable, ejecución, aprobación, consulta, información y backup permanecen separados.</p></div><button type="button" data-org-new="assignments">Crear responsabilidad</button></div>
      <div class="organization-summary-strip"><span>Bus Factor mínimo <strong>${metrics.busFactor.value ?? "No evaluado"}</strong></span><span>Sin responsable <strong>${metrics.gaps.filter((item) => item.type === "function_owner").length}</strong></span><span>Sin backup <strong>${metrics.gaps.filter((item) => item.type === "function_backup").length}</strong></span><span>Riesgo documental <strong>${metrics.busFactor.undocumentedSinglePoints.length}</strong></span></div>
      <div class="organization-table-wrap"><table><thead><tr><th>Función</th><th>Área</th><th>Responsable</th><th>Ejecutor</th><th>Aprobador</th><th>Backup</th><th>Carga</th><th>Delegación</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9">Sin responsabilidades registradas.</td></tr>'}</tbody></table></div>
      <details class="organization-secondary"><summary>Roles y capacidades</summary><div class="organization-two-columns">${this.renderEntity("roles", true)}${this.renderEntity("capabilities", true)}</div></details></section>`;
  }

  renderAreas() {
    const members = Object.fromEntries((this.data.members || []).map((item) => [item.id, item.name]));
    const areas = activeItems(this.data.areas || []);
    const rows = areas.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(members[item.ownerId] || "Sin responsable")}</td><td>${escapeHtml(members[item.backupId] || "Sin backup")}</td><td><span class="organization-chip">${escapeHtml(item.coverage || "No evaluada")}</span></td><td>${escapeHtml(text(item.maturity))}</td><td>${escapeHtml(text(item.currentCapacity))}</td><td>${escapeHtml(text(item.priority))}</td><td>${escapeHtml(item.desiredCapacity || "No evaluada")}</td><td><button type="button" data-org-edit="areas" data-id="${escapeHtml(item.id)}">Editar</button></td></tr>`).join("");
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Cobertura organizacional</span><h3>Matriz de áreas</h3><p>Cobertura, madurez, capacidad y necesidad se mantienen como dimensiones independientes.</p></div><button type="button" data-org-new="areas">Crear área</button></div><div class="organization-table-wrap"><table><thead><tr><th>Área</th><th>Responsable</th><th>Backup</th><th>Cobertura</th><th>Madurez</th><th>Capacidad actual</th><th>Prioridad</th><th>Capacidad deseada</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9">Sin áreas registradas.</td></tr>'}</tbody></table></div></section>`;
  }

  renderRisks() {
    const risks = activeItems(this.data.risks || []);
    const cells = [];
    for (let probability = 5; probability >= 1; probability -= 1) {
      for (let impact = 1; impact <= 5; impact += 1) {
        const items = risks.filter((item) => Number(item.probability) === probability && Number(item.impact) === impact);
        const level = probability * impact >= 16 ? "critical" : probability * impact >= 10 ? "high" : probability * impact >= 5 ? "medium" : "low";
        cells.push(`<div class="organization-risk-cell" data-level="${level}" title="Probabilidad ${probability} × Impacto ${impact}"><span>${probability}×${impact}</span>${items.map((item) => `<button type="button" data-org-edit="risks" data-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join("")}</div>`);
      }
    }
    const unevaluated = risks.filter((item) => !Number(item.probability) || !Number(item.impact));
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Probabilidad × impacto</span><h3>Matriz de riesgos</h3><p>La severidad visual deriva exclusivamente de valores registrados 1–5.</p></div><button type="button" data-org-new="risks">Registrar riesgo</button></div><div class="organization-risk-layout"><div class="organization-risk-axis-y">Probabilidad 5 → 1</div><div class="organization-risk-matrix">${cells.join("")}</div><div class="organization-risk-axis-x">Impacto 1 → 5</div></div>${unevaluated.length ? `<div class="organization-panel"><h4>Sin evaluación completa</h4>${unevaluated.map((item) => `<button type="button" data-org-edit="risks" data-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join("")}</div>` : ""}</section>`;
  }

  renderExpansion() {
    const opportunities = activeItems(this.data.opportunities || []).map((item) => ({ ...item, score: calculateOpportunityScore(item), readiness: calculateReadiness(item.readinessChecklist) })).sort((a, b) => b.score.value - a.score.value);
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Radar de expansión</span><h3>Oportunidades y preparación</h3><p>Scores heurísticos con fórmula visible; no son proyecciones financieras.</p></div><button type="button" data-org-new="opportunities">Crear oportunidad</button></div>
      <details class="organization-formula"><summary>Fórmula de priorización</summary><code>${escapeHtml(Object.entries(OPPORTUNITY_SCORE_FORMULA).map(([key, value]) => `${key} × ${value}`).join(" + "))}</code><p>Los valores 1–5 se ponderan; readiness usa checklist real. Los factores de esfuerzo y complejidad restan.</p></details>
      <div class="organization-opportunity-grid">${opportunities.length ? opportunities.map((item) => `<article class="organization-opportunity"><div><span class="organization-chip">${escapeHtml(item.status || "Sin clasificar")}</span><h4>${escapeHtml(item.name)}</h4></div><div class="organization-score"><strong>${item.score.value}</strong><span>/100 heurístico</span></div><div class="organization-readiness"><span>Preparación</span><strong>${item.readiness.value === null ? "No evaluada" : `${item.readiness.value}%`}</strong><div><i style="width:${item.readiness.value || 0}%"></i></div><small>${item.readiness.total ? `${item.readiness.completed}/${item.readiness.total} gates completos` : "Sin checklist real"}</small></div><button type="button" data-org-edit="opportunities" data-id="${escapeHtml(item.id)}">Revisar</button></article>`).join("") : '<div class="organization-empty"><strong>Sin oportunidades</strong><p>Registra oportunidades para comparar impacto, esfuerzo y gates.</p></div>'}</div>
      <details class="organization-secondary"><summary>Productos, líneas, hipótesis y alianzas</summary><div class="organization-two-columns">${this.renderEntity("products", true)}${this.renderEntity("businessLines", true)}${this.renderEntity("hypotheses", true)}${this.renderEntity("alliances", true)}</div></details></section>`;
  }

  renderTalent() {
    const needs = activeItems(this.data.talentNeeds || []);
    const cards = needs.map((item) => `<article class="organization-entity-card"><span class="organization-chip">${escapeHtml(item.urgency || "No evaluada")}</span><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.reason || "Motivo no documentado")}</p><strong>Desbloquea ${Array.isArray(item.projectIds) ? item.projectIds.length : 0} proyectos registrados</strong><small>Indicador administrativo, no recomendación infalible.</small><div class="organization-card-actions"><button type="button" data-org-edit="talentNeeds" data-id="${escapeHtml(item.id)}">Editar</button></div></article>`).join("");
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Mapa de talento</span><h3>Perfiles y gaps de capacidades</h3><p>Prioriza perfiles por funciones y proyectos que desbloquean.</p></div><button type="button" data-org-new="talentNeeds">Registrar perfil</button></div><div class="organization-card-grid">${cards || '<div class="organization-empty">Sin perfiles registrados.</div>'}</div><details class="organization-secondary" open><summary>Inventario de capacidades</summary>${this.renderEntity("capabilities", true)}</details></section>`;
  }

  renderHistory() {
    const events = [...(this.data.organizationEvents || [])].sort((a, b) => String(b.timestamp?.toDate?.()?.toISOString?.() || b.timestamp || "").localeCompare(String(a.timestamp?.toDate?.()?.toISOString?.() || a.timestamp || "")));
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Memoria organizacional</span><h3>Historial</h3><p>Eventos compactos de auditoría; no se guardan snapshots completos en cada cambio.</p></div></div><ol class="organization-timeline">${events.length ? events.map((item) => `<li><time>${escapeHtml(item.timestamp?.toDate?.()?.toLocaleString?.("es-MX") || "Fecha pendiente del servidor")}</time><strong>${escapeHtml(item.action || "evento")}</strong><span>${escapeHtml(item.summary || item.entityType || "")}</span></li>`).join("") : '<li><strong>Sin eventos</strong><span>Los cambios del módulo aparecerán aquí.</span></li>'}</ol></section>`;
  }

  renderMap() {
    const nodes = [
      ...activeItems(this.data.members || []).map((item) => ({ ...item, type: "members", label: item.name, links: [...(item.areaIds || []), ...(item.projectIds || [])] })),
      ...activeItems(this.data.areas || []).map((item) => ({ ...item, type: "areas", label: item.name, links: [item.ownerId, item.backupId, ...(item.projectIds || [])].filter(Boolean) })),
      ...activeItems(this.data.projects || []).map((item) => ({ ...item, type: "projects", label: item.name, links: [item.ownerId, item.responsibleId, item.areaId, ...(item.collaboratorIds || [])].filter(Boolean) })),
      ...activeItems(this.data.opportunities || []).map((item) => ({ ...item, type: "opportunities", label: item.name, links: [item.ownerId, ...(item.dependencies || [])].filter(Boolean) })),
      ...activeItems(this.data.products || []).map((item) => ({ ...item, type: "products", label: item.name, links: [item.ownerId, item.areaId, ...(item.projectIds || [])].filter(Boolean) }))
    ].slice(0, 80);
    const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
    const edges = nodes.flatMap((node) => node.links.filter((id) => nodeMap[id]).map((id) => [node.id, id]));
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Mapa interactivo</span><h3>COGNICIÓN Labs</h3><p>Relaciones registradas entre personas, áreas, proyectos y oportunidades.</p></div><div class="organization-map-controls"><button type="button" data-map-zoom="out" aria-label="Alejar">−</button><button type="button" data-map-zoom="reset">Restablecer</button><button type="button" data-map-zoom="in" aria-label="Acercar">+</button></div></div>
      <div class="organization-map-legend" aria-label="Mostrar u ocultar categorías"><button type="button" aria-pressed="true" data-map-filter="members">Personas</button><button type="button" aria-pressed="true" data-map-filter="areas">Áreas</button><button type="button" aria-pressed="true" data-map-filter="projects">Proyectos</button><button type="button" aria-pressed="true" data-map-filter="opportunities">Oportunidades</button><button type="button" aria-pressed="true" data-map-filter="products">Productos</button></div>
      <div class="organization-map-viewport"><div class="organization-map-canvas" data-map-canvas style="--map-scale:1"><div class="organization-map-center">COGNICIÓN LABS</div>${nodes.map((node, index) => { const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2; const ring = 220 + (index % 3) * 150; const x = 500 + Math.cos(angle) * ring; const y = 430 + Math.sin(angle) * ring; return `<button type="button" class="organization-map-node" data-type="${node.type}" data-org-edit="${node.type}" data-id="${escapeHtml(node.id)}" style="left:${Math.round(x)}px;top:${Math.round(y)}px">${escapeHtml(node.label || "Sin nombre")}</button>`; }).join("")}<svg viewBox="0 0 1000 860" aria-hidden="true">${edges.map(([from, to]) => { const a = nodes.findIndex((n) => n.id === from); const b = nodes.findIndex((n) => n.id === to); const point = (index) => { const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2; const ring = 220 + (index % 3) * 150; return [500 + Math.cos(angle) * ring, 430 + Math.sin(angle) * ring]; }; const [x1,y1]=point(a); const [x2,y2]=point(b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }).join("")}</svg></div></div>${nodes.length ? "" : '<div class="organization-empty">No hay nodos para mostrar.</div>'}</section>`;
  }

  renderSimulator() {
    const result = this.simulation;
    const members = activeItems(this.data.members || []);
    const areas = activeItems(this.data.areas || []);
    const assignments = activeItems(this.data.assignments || []);
    const comparison = result ? `<div class="organization-simulation-result"><h4>Impacto estimado</h4><table><thead><tr><th>Métrica</th><th>Antes</th><th>Después</th></tr></thead><tbody><tr><td>Cobertura</td><td>${result.before.coverage.value ?? "No evaluada"}${result.before.coverage.value !== null ? "%" : ""}</td><td>${result.after.coverage.value ?? "No evaluada"}${result.after.coverage.value !== null ? "%" : ""}</td></tr><tr><td>Áreas descubiertas</td><td>${result.before.coverage.uncovered}</td><td>${result.after.coverage.uncovered}</td></tr><tr><td>Bus Factor mínimo</td><td>${result.before.busFactor.value ?? "No evaluado"}</td><td>${result.after.busFactor.value ?? "No evaluado"}</td></tr><tr><td>Personas con indicador de sobrecarga</td><td>${result.before.workload.filter((i) => i.overloaded).length}</td><td>${result.after.workload.filter((i) => i.overloaded).length}</td></tr></tbody></table><button type="button" data-org-convert-plan>Convertir simulación en plan</button><p>La conversión solo abre un formulario editable; nunca modifica datos reales automáticamente.</p></div>` : "";
    return `<section><div class="organization-view-heading"><div><span class="organization-kicker">Entorno aislado</span><h3>Simulador organizacional</h3><p>Evalúa escenarios en memoria. Nada se persiste sin una confirmación posterior.</p></div></div><form class="organization-simulator" data-org-simulator><label>Escenario<select name="type"><option value="hire">Incorporar perfil/persona</option><option value="create_area">Crear área</option><option value="assign_owner">Asignar responsable de área</option><option value="add_backup">Formar backup</option></select></label><label>Nombre / perfil<input name="name" placeholder="Ej. Especialista regulatorio"></label><label>Área<select name="areaId"><option value="">Seleccionar</option>${areas.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join("")}</select></label><label>Persona<select name="personId"><option value="">Seleccionar</option>${members.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join("")}</select></label><label>Función<select name="assignmentId"><option value="">Seleccionar</option>${assignments.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join("")}</select></label><button type="submit">Simular sin guardar</button></form>${comparison}</section>`;
  }

  bindContentEvents() {
    this.host.querySelectorAll("[data-org-new]").forEach((button) => button.addEventListener("click", () => this.openForm(button.dataset.orgNew)));
    this.host.querySelectorAll("[data-org-edit]").forEach((button) => button.addEventListener("click", () => this.openForm(button.dataset.orgEdit, button.dataset.id)));
    this.host.querySelectorAll("[data-org-archive]").forEach((button) => button.addEventListener("click", () => this.archive(button.dataset.orgArchive, button.dataset.id)));
    this.host.querySelector("[data-org-initialize]")?.addEventListener("click", () => this.initialize());
    this.host.querySelector("[data-org-simulator]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const scenario = Object.fromEntries(new FormData(event.currentTarget).entries());
      this.simulation = simulateOrganization(this.data, scenario);
      this.render();
    });
    this.host.querySelector("[data-org-convert-plan]")?.addEventListener("click", () => {
      const scenario = this.simulation?.scenario || {};
      if (scenario.type === "hire") this.openForm("talentNeeds", null, { name: scenario.name, status: "Detectado" });
      else if (scenario.type === "create_area") this.openForm("areas", null, { name: scenario.name, coverage: "Planeada" });
      else this.openForm("assignments", scenario.assignmentId, scenario.type === "add_backup" ? { backupId: scenario.personId } : undefined);
    });
    let scale = 1;
    this.host.querySelectorAll("[data-map-zoom]").forEach((button) => button.addEventListener("click", () => {
      scale = button.dataset.mapZoom === "reset" ? 1 : Math.max(0.55, Math.min(1.8, scale + (button.dataset.mapZoom === "in" ? 0.15 : -0.15)));
      this.host.querySelector("[data-map-canvas]")?.style.setProperty("--map-scale", scale);
    }));
    this.host.querySelectorAll("[data-map-filter]").forEach((button) => button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") !== "false";
      button.setAttribute("aria-pressed", String(!pressed));
      this.host.querySelectorAll(`.organization-map-node[data-type="${button.dataset.mapFilter}"]`).forEach((node) => { node.hidden = pressed; });
    }));
  }

  renderField(field, item) {
    const [key, label, type = "text", required = false, options = []] = field;
    const value = item?.[key];
    if (type === "textarea" || type === "list" || type === "checklist") {
      const formatted = type === "checklist" ? (value || []).map((entry) => `${entry.completed ? "[x] " : "[ ] "}${entry.label}`).join("\n") : Array.isArray(value) ? value.join("\n") : value || "";
      return `<label>${escapeHtml(label)}<textarea name="${key}" ${required ? "required" : ""} data-value-type="${type}">${escapeHtml(formatted)}</textarea></label>`;
    }
    if (type === "select") return `<label>${escapeHtml(label)}<select name="${key}" ${required ? "required" : ""}><option value="">No evaluado</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
    if (type === "checkbox") return `<label class="organization-checkbox"><input name="${key}" type="checkbox" ${value ? "checked" : ""}> ${escapeHtml(label)}</label>`;
    return `<label>${escapeHtml(label)}<input name="${key}" type="${type}" value="${escapeHtml(value ?? "")}" ${required ? "required" : ""} ${type === "number" ? 'min="0" max="100" step="0.1"' : ""}></label>`;
  }

  openForm(type, id = null, defaults = {}) {
    const config = ENTITY[type];
    if (!config) return;
    const item = { ...(id ? (this.data[type] || []).find((entry) => entry.id === id) : {}), ...defaults };
    const dialog = this.host.querySelector("[data-org-dialog]");
    const form = dialog.querySelector("[data-org-form]");
    form.innerHTML = `<div class="organization-dialog-header"><div><span class="organization-kicker">${id ? "Editar" : "Nuevo registro"}</span><h3 id="organizationDialogTitle">${escapeHtml(config.singular)}</h3></div><button type="button" data-dialog-close aria-label="Cerrar">×</button></div><div class="organization-form-grid">${config.fields.map((field) => this.renderField(field, item)).join("")}</div><div class="organization-dialog-actions"><button type="button" class="is-quiet" data-dialog-close>Cancelar</button><button type="submit">Guardar</button></div>`;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const raw = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll('[data-value-type="list"]').forEach((field) => { raw[field.name] = field.value.split(/\n|,/).map((value) => value.trim()).filter(Boolean); });
      form.querySelectorAll('[data-value-type="checklist"]').forEach((field) => { raw[field.name] = field.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ completed: /^\[x\]/i.test(line), label: line.replace(/^\[[ x]\]\s*/i, "") })); });
      form.querySelectorAll('input[type="number"]').forEach((field) => { raw[field.name] = field.value === "" ? null : Number(field.value); });
      form.querySelectorAll('input[type="checkbox"]').forEach((field) => { raw[field.name] = field.checked; });
      await this.persist(type, id, raw, dialog);
    };
    form.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.showModal();
  }

  async persist(type, id, payload, dialog) {
    try {
      dialog.querySelector('button[type="submit"]').disabled = true;
      this.setStatus("Guardando cambio…");
      await saveEntity({ organizationId: this.organizationId, type, id, payload, actorUid: this.authUser.uid });
      dialog.close();
      await this.reload();
    } catch (error) {
      this.setStatus(error.code === "permission-denied" ? "Permiso denegado por Firestore." : `No se pudo guardar: ${error.message}`, true);
    } finally {
      const button = dialog.querySelector('button[type="submit"]');
      if (button) button.disabled = false;
    }
  }

  async archive(type, id) {
    if (!confirm("Archivar este registro? Se conservará para el historial y dejará de aparecer en vistas activas.")) return;
    try {
      await archiveEntity({ organizationId: this.organizationId, type, id, actorUid: this.authUser.uid });
      await this.reload();
    } catch (error) {
      this.setStatus(`No se pudo archivar: ${error.message}`, true);
    }
  }

  async initialize() {
    if (!confirm("Crear la organización COGNICIÓN Labs y un catálogo inicial de áreas en estado Planeada/Descubierta? No se crearán personas ni datos reales.")) return;
    try {
      await createInitialStructure({ organizationId: this.organizationId, actorUid: this.authUser.uid, areas: INITIAL_AREAS });
      await this.reload();
    } catch (error) {
      this.setStatus(error.message === "ORGANIZATION_ALREADY_INITIALIZED" ? "La estructura ya existe; no se duplicó." : `No se pudo inicializar: ${error.message}`, true);
    }
  }
}

export async function inicializarOrganizacion({ authUser, organizationId = "cognicion-labs" } = {}) {
  if (!authUser?.uid) throw new Error("ORGANIZATION_AUTH_REQUIRED");
  const host = document.getElementById("organizacionAdminApp");
  if (!host) throw new Error("ORGANIZATION_HOST_MISSING");
  if (singleton) return singleton;
  singleton = new OrganizationApp({ host, authUser, organizationId });
  return singleton.init();
}
