export async function mountLegacyCalculator(container, item, context = {}) {
  const ui = await import("../components/calculadorasNota.js");
  if (item.id === "calculadora-benzodiacepinas") {
    return ui.montarCalculadoraNota(container, "benzodiacepinas");
  }
  if (item.kind === "medical") {
    const data = await import("../data/calculadorasMedicas.js");
    const calc = data.CALCULADORAS_MEDICAS.find((entry) => entry.id === item.id);
    if (!calc) throw new Error(`Calculadora médica no encontrada: ${item.id}`);
    return ui.montarCalculadoraMedicaLegacy(container, calc, data, context);
  }
  const data = await import("../data/calculadorasPediatricas.js");
  const calc = data.CALCULADORAS_PEDIATRICAS.find((entry) => entry.id === item.id);
  if (!calc) throw new Error(`Calculadora pediátrica no encontrada: ${item.id}`);
  return ui.montarCalculadoraPediatricaLegacy(container, calc, data, context);
}
