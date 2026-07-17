export const DICHOTIC_ACTIVITY_VERSION = "0.1.0";
export const DICHOTIC_REQUIRED_TRIALS = 120;
export const DICHOTIC_REQUIRED_BLOCKS = 4;
export const DICHOTIC_TRIALS_PER_BLOCK = 30;

export function normalizeWord(text = "") {
  return String(text)
    .trim()
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:"']/g, "")
    .replace(/\s+/g, " ");
}

export function validateDichoticCorpus(corpus = {}) {
  const issues = [];
  const pairs = Array.isArray(corpus.pairs) ? corpus.pairs : [];
  if (!corpus.corpusVersion) issues.push("El corpus no tiene corpusVersion.");
  if (pairs.length !== DICHOTIC_REQUIRED_TRIALS) issues.push(`El corpus contiene ${pairs.length} pares; se requieren exactamente ${DICHOTIC_REQUIRED_TRIALS}.`);
  const ids = new Set();
  const bloques = new Map();
  pairs.forEach((pair, index) => {
    const global = index + 1;
    if (!pair.trialId) issues.push(`Ensayo ${global}: falta trialId.`);
    if (ids.has(pair.trialId)) issues.push(`Ensayo ${global}: trialId repetido ${pair.trialId}.`);
    ids.add(pair.trialId);
    if (!pair.leftWord) issues.push(`Ensayo ${global}: falta leftWord.`);
    if (!pair.rightWord) issues.push(`Ensayo ${global}: falta rightWord.`);
    if (!pair.leftAudio) issues.push(`Ensayo ${global}: falta leftAudio.`);
    if (!pair.rightAudio) issues.push(`Ensayo ${global}: falta rightAudio.`);
    if (normalizeWord(pair.leftWord) && normalizeWord(pair.leftWord) === normalizeWord(pair.rightWord)) issues.push(`Ensayo ${global}: palabra izquierda y derecha son identicas.`);
    const blockNumber = Number(pair.blockNumber);
    const trialNumber = Number(pair.trialNumber);
    if (!Number.isInteger(blockNumber) || blockNumber < 1 || blockNumber > DICHOTIC_REQUIRED_BLOCKS) issues.push(`Ensayo ${global}: blockNumber invalido.`);
    if (!Number.isInteger(trialNumber) || trialNumber < 1 || trialNumber > DICHOTIC_TRIALS_PER_BLOCK) issues.push(`Ensayo ${global}: trialNumber invalido.`);
    if (!bloques.has(blockNumber)) bloques.set(blockNumber, []);
    bloques.get(blockNumber).push(pair);
  });
  for (let block = 1; block <= DICHOTIC_REQUIRED_BLOCKS; block += 1) {
    const count = bloques.get(block)?.length || 0;
    if (count !== DICHOTIC_TRIALS_PER_BLOCK) issues.push(`Bloque ${block}: contiene ${count} ensayos; se requieren ${DICHOTIC_TRIALS_PER_BLOCK}.`);
  }
  return {
    ok: issues.length === 0,
    issues,
    isProvisional: /provisional/i.test(String(corpus.status || corpus.corpusVersion || "")),
    corpusType: corpus.corpusType || "",
    clinicallyValidated: corpus.clinicallyValidated === true,
    authorizedMaterial: corpus.authorizedMaterial === true,
    totalPairs: pairs.length
  };
}

export function classifyDichoticResponse(trial = {}, rawResponse = "", options = {}) {
  const normalizedResponse = normalizeWord(rawResponse);
  const normalizedRightWord = normalizeWord(trial.rightWord);
  const normalizedLeftWord = normalizeWord(trial.leftWord);
  const words = normalizedResponse ? normalizedResponse.split(/\s+/).filter(Boolean) : [];
  if (options.technicalFailure) return baseClassification("technical_failure", rawResponse, normalizedResponse);
  if (options.unintelligible) return baseClassification("unintelligible", rawResponse, normalizedResponse);
  if (!normalizedResponse) return baseClassification("omission", rawResponse, normalizedResponse);
  if (words.length > 1) return { ...baseClassification("multiple_response", rawResponse, normalizedResponse), isMultipleResponse: true };
  if (normalizedResponse === normalizedRightWord) return baseClassification("correct", rawResponse, normalizedResponse);
  if (normalizedResponse === normalizedLeftWord) return baseClassification("left_ear_intrusion", rawResponse, normalizedResponse);
  return baseClassification("non_presented_word", rawResponse, normalizedResponse);
}

export function scoreDichoticTrial({ sessionId, trial, rawResponse = "", timing = {}, scoring = {}, context = {} }) {
  const classified = classifyDichoticResponse(trial, rawResponse, scoring);
  return {
    sessionId,
    trialId: trial.trialId,
    blockNumber: trial.blockNumber,
    trialNumber: trial.trialNumber,
    globalTrialNumber: ((Number(trial.blockNumber) - 1) * DICHOTIC_TRIALS_PER_BLOCK) + Number(trial.trialNumber),
    leftWord: trial.leftWord,
    rightWord: trial.rightWord,
    leftAudioId: trial.leftAudioId || trial.leftAudio,
    rightAudioId: trial.rightAudioId || trial.rightAudio,
    scheduledStartTime: timing.scheduledStartTime ?? null,
    actualStartTime: timing.actualStartTime ?? null,
    synchronizationErrorMs: timing.synchronizationErrorMs ?? null,
    leftAudioLoaded: Boolean(timing.leftAudioLoaded),
    rightAudioLoaded: Boolean(timing.rightAudioLoaded),
    audioPlaybackCompleted: Boolean(timing.audioPlaybackCompleted),
    responseWindowStartedAt: timing.responseWindowStartedAt ?? null,
    responseStartedAt: timing.responseStartedAt ?? null,
    responseEndedAt: timing.responseEndedAt ?? null,
    responseLatencyMs: timing.responseLatencyMs ?? null,
    rawResponse,
    recognitionConfidence: scoring.recognitionConfidence ?? null,
    scoringMethod: scoring.scoringMethod || "manual",
    manuallyReviewed: Boolean(scoring.manuallyReviewed),
    scorerId: scoring.scorerId || "",
    headphonesVerified: Boolean(context.headphonesVerified),
    volumeSetting: context.volumeSetting ?? null,
    corpusVersion: context.corpusVersion || "",
    activityVersion: DICHOTIC_ACTIVITY_VERSION,
    ...classified
  };
}

export function calculateDichoticMetrics(trials = []) {
  const totalTrials = trials.length;
  const technicalFailures = trials.filter((t) => t.isTechnicalFailure).length;
  const validTrials = totalTrials - technicalFailures;
  const correctResponses = trials.filter((t) => t.isCorrect).length;
  const leftEarIntrusions = trials.filter((t) => t.isLeftEarIntrusion).length;
  const nonPresentedWords = trials.filter((t) => t.isNonPresentedWord).length;
  const omissions = trials.filter((t) => t.isOmission).length;
  const unintelligibleResponses = trials.filter((t) => t.isUnintelligible).length;
  const multipleResponses = trials.filter((t) => t.isMultipleResponse).length;
  const totalErrors = leftEarIntrusions + nonPresentedWords + omissions + unintelligibleResponses + multipleResponses;
  return {
    totalTrials,
    validTrials,
    technicalFailures,
    correctResponses,
    totalErrors,
    leftEarIntrusions,
    nonPresentedWords,
    omissions,
    unintelligibleResponses,
    multipleResponses,
    accuracyRate: ratio(correctResponses, validTrials),
    accuracyPercentage: percent(correctResponses, validTrials),
    errorRate: ratio(totalErrors, validTrials),
    errorPercentage: percent(totalErrors, validTrials),
    leftEarIntrusionRate: ratio(leftEarIntrusions, validTrials),
    nonPresentedWordRate: ratio(nonPresentedWords, validTrials),
    omissionRate: ratio(omissions, validTrials),
    meanCorrectLatencyMs: mean(trials.filter((t) => t.isCorrect).map((t) => t.responseLatencyMs).filter(Number.isFinite)),
    meanLeftIntrusionLatencyMs: mean(trials.filter((t) => t.isLeftEarIntrusion).map((t) => t.responseLatencyMs).filter(Number.isFinite)),
    blockResults: calculateDichoticBlocks(trials)
  };
}

export function calculateDichoticBlocks(trials = []) {
  return Array.from({ length: DICHOTIC_REQUIRED_BLOCKS }, (_, index) => {
    const blockNumber = index + 1;
    const blockTrials = trials.filter((t) => Number(t.blockNumber) === blockNumber);
    const technicalFailures = blockTrials.filter((t) => t.isTechnicalFailure).length;
    const valid = blockTrials.length - technicalFailures;
    const correct = blockTrials.filter((t) => t.isCorrect).length;
    const left = blockTrials.filter((t) => t.isLeftEarIntrusion).length;
    const nonPresented = blockTrials.filter((t) => t.isNonPresentedWord).length;
    const omissions = blockTrials.filter((t) => t.isOmission).length;
    return {
      blockNumber,
      totalTrials: blockTrials.length,
      correctResponses: correct,
      leftEarIntrusions: left,
      nonPresentedWords: nonPresented,
      omissions,
      unintelligibleResponses: blockTrials.filter((t) => t.isUnintelligible).length,
      technicalFailures,
      accuracyPercentage: percent(correct, valid),
      errorPercentage: percent(left + nonPresented + omissions, valid)
    };
  });
}

export function dichoticTrialsToCsv(trials = []) {
  const cols = ["sessionId","blockNumber","trialNumber","leftWord","rightWord","rawResponse","normalizedResponse","classification","isCorrect","isLeftEarIntrusion","isNonPresentedWord","isOmission","isTechnicalFailure","responseLatencyMs","scoringMethod","manuallyReviewed","corpusVersion"];
  return [cols.join(","), ...trials.map((trial) => cols.map((col) => csv(trial[col])).join(","))].join("\n");
}

function baseClassification(classification, rawResponse, normalizedResponse) {
  return {
    rawResponse,
    normalizedResponse,
    classification,
    isCorrect: classification === "correct",
    isLeftEarIntrusion: classification === "left_ear_intrusion",
    isNonPresentedWord: classification === "non_presented_word",
    isOmission: classification === "omission",
    isUnintelligible: classification === "unintelligible",
    isMultipleResponse: classification === "multiple_response",
    isTechnicalFailure: classification === "technical_failure"
  };
}

function ratio(n, d) { return d > 0 ? n / d : null; }
function percent(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }
function mean(arr) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null; }
function csv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}
