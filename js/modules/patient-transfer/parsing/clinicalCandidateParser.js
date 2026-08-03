function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitClinicalLines(text = "") {
  return String(text || "")
    .split(/\n|(?:^|\s)[\-•]\s+|;\s+/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((line) => line.length >= 3);
}

function statusForDiagnosis(text = "") {
  const normalized = normalizeText(text);
  if (/\b(?:a descartar|descartar)\b/.test(normalized)) return "A descartar";
  if (/\b(?:probable|posible|sugestivo de)\b/.test(normalized)) return "Probable";
  if (/\bantecedente de\b/.test(normalized)) return "Antecedente";
  if (/\ben remision\b/.test(normalized)) return "Remisión";
  if (/\b(?:se descarta|sin datos de|niega)\b/.test(normalized)) return "Descartado";
  return "Confirmado";
}

function statusForTreatment(text = "") {
  const normalized = normalizeText(text);
  if (/\b(?:suspendio|suspender|suspendido|se suspende)\b/.test(normalized)) return "Suspende";
  if (/\b(?:recibio|previamente|previo|antecedente|en \d{4}|durante \d+ meses|instauro manejo|manejo a base de)\b/.test(normalized)) return "Antecedente";
  if (/\b(?:inicio|iniciar|se inicia)\b/.test(normalized)) return "Inicia";
  if (/\b(?:aumento|aumentar|subir|incrementar)\b/.test(normalized)) return "Aumenta";
  if (/\b(?:disminuyo|disminuir|bajar|reducir)\b/.test(normalized)) return "Disminuye";
  return "Continúa";
}

function detectCodingSystem(code = "") {
  if (!code) return "";
  if (/^[A-Z]\d{2}(?:\.\d+)?$/i.test(code)) return "CIE-10";
  if (/^[A-Z0-9]{2,}(?:\.[A-Z0-9]+)+$/i.test(code)) return "CIE-11";
  return "";
}

function cleanDiagnosisLabel(line = "", code = "") {
  return line
    .replace(code, "")
    .replace(/\b(?:cie-?10|cie-?11|dsm-?5)\b/gi, "")
    .replace(/^\s*[:\-–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMedicationLine(line = "") {
  const normalized = normalizeText(line);
  if (/\b(?:niega|sin uso de|no usa|no toma)\b/.test(normalized)) return null;
  const doseMatch = line.match(/\b(\d+(?:[.,]\d+)?|¼|½|¾|1½)\s*(mg|mcg|g|ml|gotas?|ui)\b/i);
  const route = line.match(/\b(v[ií]a oral|oral|vo|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/i)?.[1] || "";
  const frequency = line.match(/\b(cada\s+\d+\s*horas?|una vez al d[ií]a|dos veces al d[ií]a|tres veces al d[ií]a|por la ma[nñ]ana|por la noche|al acostarse|prn|si es necesario|al d[ií]a|diario)\b/i)?.[1] || "";
  const medicationSource = line
    .replace(/^\s*(?:se\s+)?(?:inicio|inicia|iniciar|continua|continuar|suspendio|suspender|suspendido|aumentar|aumento|disminuir|disminuyo|ajustar|ajusto)\s+/i, "")
    .replace(/^\s*(?:con|manejo con|tratamiento con)\s+/i, "");
  const nameMatch = medicationSource.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s\-]{2,}?)(?=\s+\d|\s+¼|\s+½|\s+¾|\s+1½|\s+v[ií]a|\s+oral|\s+cada|\s*$)/i);
  const name = (nameMatch?.[1] || medicationSource.split(/\s+/).slice(0, 3).join(" ")).replace(/[,.;:]$/g, "").trim();
  if (!name || (!doseMatch && line.length > 120)) return null;
  return {
    medicationName: name,
    dose: doseMatch?.[1]?.replace(",", ".") || "",
    doseUnit: doseMatch?.[2] || "",
    route,
    frequencyRaw: frequency,
    statusSuggestion: statusForTreatment(line),
    sourceText: line
  };
}

function extractHistoricalDiagnosisCandidates(text = "", documentId = "") {
  return splitClinicalLines(text).flatMap((line, index) => {
    const match = line.match(/\bdiagn[oó]stico\s+de\s+([^.;,\n]+?)(?:\s+(?:diagnosticado|en|desde)\b|$)/i);
    if (!match) return [];
    return [{
      id: `${documentId || "doc"}-dx-hx-${index}`,
      rawText: line,
      code: "",
      codingSystem: "",
      normalizedLabel: match[1].trim(),
      sourceSection: "antecedente_narrativo",
      sourceLocation: { documentId, lineIndex: index },
      statusSuggestion: "Antecedente",
      temporality: "historical",
      negated: /\b(?:niega|sin datos de|se descarta)\b/i.test(line),
      confirmedByDoctor: false
    }];
  });
}

function expandMedicationCandidates(line = "", documentId = "", sourceSection = "tratamiento", index = 0) {
  const parsed = parseMedicationLine(line);
  const normalized = normalizeText(line);
  const listMatch = line.match(/\b(clonazepam|paroxetina|lamotrigina|quetiapina|risperidona|olanzapina|sertralina|fluoxetina|valproato|litio)\b(?:[\s, y]+(?:clonazepam|paroxetina|lamotrigina|quetiapina|risperidona|olanzapina|sertralina|fluoxetina|valproato|litio)\b)+/ig);
  if (!listMatch) return parsed ? [{ id: `${documentId || "doc"}-tx-${index}`, ...parsed, sourceSection, sourceLocation: { documentId, lineIndex: index }, confirmedByDoctor: false }] : [];
  const names = [...new Set(line.match(/\b(clonazepam|paroxetina|lamotrigina|quetiapina|risperidona|olanzapina|sertralina|fluoxetina|valproato|litio)\b/ig) || [])];
  return names.map((name, itemIndex) => ({
    id: `${documentId || "doc"}-tx-${index}-${itemIndex}`,
    medicationName: name,
    dose: "",
    doseUnit: "",
    route: "",
    frequencyRaw: "",
    statusSuggestion: /\b(?:recibio|previamente|previo|antecedente|en \d{4}|instauro manejo|manejo a base de)\b/.test(normalized) ? "Antecedente" : statusForTreatment(line),
    sourceText: line,
    sourceSection,
    sourceLocation: { documentId, lineIndex: index },
    confirmedByDoctor: false
  }));
}

export function extractClinicalCandidates(document = {}) {
  const sections = document.sections || {};
  const diagnosesText = [sections.diagnosticos, sections.analisis]
    .filter(Boolean)
    .join("\n");
  const treatmentsText = [sections.tratamiento, sections.plan]
    .filter(Boolean)
    .join("\n");
  const narrativeText = [sections.padecimientoActual, sections.antecedentesPersonales, sections.motivoConsulta]
    .filter(Boolean)
    .join("\n");

  const diagnoses = splitClinicalLines(diagnosesText).map((line, index) => {
    const code = line.match(/\b([A-Z]\d{2}(?:\.\d+)?|[A-Z0-9]{2,}(?:\.[A-Z0-9]+)+)\b/i)?.[1] || "";
    return {
      id: `${document.id || "doc"}-dx-${index}`,
      rawText: line,
      code,
      codingSystem: detectCodingSystem(code),
      normalizedLabel: cleanDiagnosisLabel(line, code),
      sourceSection: sections.diagnosticos ? "diagnosticos" : "analisis",
      sourceLocation: { documentId: document.id || "", lineIndex: index },
      statusSuggestion: statusForDiagnosis(line),
      temporality: /\b(?:antecedente|previo|previamente)\b/i.test(line) ? "historical" : "current",
      negated: /\b(?:niega|sin datos de|se descarta)\b/i.test(line),
      confirmedByDoctor: false
    };
  }).filter((candidate) => candidate.normalizedLabel)
    .concat(extractHistoricalDiagnosisCandidates(narrativeText, document.id || ""));

  const treatments = splitClinicalLines(treatmentsText)
    .flatMap((line, index) => expandMedicationCandidates(line, document.id || "", sections.tratamiento ? "tratamiento" : "plan", index))
    .concat(splitClinicalLines(narrativeText).flatMap((line, index) => expandMedicationCandidates(line, document.id || "", "antecedente_narrativo", index)));

  return { diagnoses, treatments };
}
