export function renderLongitudinalChart(container, series = [], options = {}) {
  if (!container) return;
  const validSeries = series.map((item) => ({
    label: String(item.label || item.metric || "Medida"),
    unit: String(item.unit || ""),
    points: (Array.isArray(item.points) ? item.points : []).map((point) => ({
      phase: String(point.phase || ""),
      value: finiteOrNull(point.value)
    })).filter((point) => point.phase && point.value !== null)
  })).filter((item) => item.points.length);
  if (!validSeries.length) {
    container.innerHTML = '<p class="adhd-empty">Aún no hay al menos dos mediciones comparables.</p>';
    return;
  }
  const width = 720;
  const height = 180;
  const padding = 38;
  const colors = ["#2f7a57", "#4b6fae", "#b36a3c", "#7d5ba6", "#88752d"];
  const panels = validSeries.map((item, seriesIndex) => {
    const values = item.points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum || Math.max(1, Math.abs(maximum) * 0.1);
    const points = item.points.map((point, index) => {
      const x = padding + (index * ((width - (padding * 2)) / Math.max(1, item.points.length - 1)));
      const y = height - padding - (((point.value - minimum) / span) * (height - (padding * 2)));
      return { ...point, x, y };
    });
    const color = colors[seriesIndex % colors.length];
    return `
      <section class="adhd-chart-panel">
        <h4><i style="--series-color:${color}"></i>${escapeHtml(item.label)}${item.unit ? ` (${escapeHtml(item.unit)})` : ""}</h4>
        <svg class="adhd-longitudinal-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${item.label}: ${options.label || "evolución longitudinal"}`)}" preserveAspectRatio="xMidYMid meet">
          <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="adhd-chart-axis" />
          <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke" />
          ${points.map((point) => `<g><circle cx="${point.x}" cy="${point.y}" r="5" fill="${color}"/><text x="${point.x}" y="${point.y - 11}" text-anchor="middle">${formatNumber(point.value)}</text><text x="${point.x}" y="${height - 12}" text-anchor="middle">${escapeHtml(point.phase)}</text></g>`).join("")}
        </svg>
      </section>`;
  }).join("");
  container.innerHTML = `
    <div class="adhd-chart-grid">${panels}</div>
    <p class="adhd-chart-note">Cada panel usa su propia escala y unidad. Solo se muestran medidas con versión y configuración comparables; no son percentiles ni normas poblacionales.</p>`;
}

function formatNumber(value) {
  return Math.abs(value) >= 100 ? Math.round(value).toLocaleString("es-MX") : Math.round(value * 100) / 100;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
}
