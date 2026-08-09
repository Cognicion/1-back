export async function runVitalSignsAndDiagnosesIndependently({
  persistVitalSigns,
  persistDiagnoses,
  onDomainError = null
} = {}) {
  const results = {
    vitalSigns: null,
    diagnoses: null
  };
  const errors = [];
  const attempts = [
    { domain: "vital-signs", resultKey: "vitalSigns", run: persistVitalSigns },
    { domain: "diagnoses", resultKey: "diagnoses", run: persistDiagnoses }
  ];

  for (const attempt of attempts) {
    if (typeof attempt.run !== "function") continue;
    try {
      results[attempt.resultKey] = await attempt.run();
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught || "Error de persistencia"));
      errors.push({ domain: attempt.domain, error });
      if (typeof onDomainError === "function") {
        try {
          await onDomainError({ domain: attempt.domain, error });
        } catch {
          // La observabilidad nunca debe impedir el siguiente dominio.
        }
      }
    }
  }

  return { results, errors };
}
