const PROTOCOL_VERSION = "rehab-modes-1.0.0";

export const REHABILITATION_APPLICATION_MODES = {
  training: {
    id: "training",
    label: "Entrenamiento",
    flag: "trainingMode",
    comparableWithStandard: false,
    notice: "Los resultados corresponden a una modalidad de entrenamiento y no son directamente comparables con aplicaciones estandarizadas.",
    defaults: {
      showFullInstructions: true,
      showExamples: true,
      unlimitedPractice: true,
      allowStimulusRepeat: true,
      allowAudioRepeat: true,
      allowVoiceRepeat: true,
      immediateFeedback: true,
      showCorrectAnswer: true,
      showPatientResponse: true,
      showClassification: true,
      allowResponseCorrection: true,
      visualHelp: true,
      freePauses: true,
      allowTrialRestart: true,
      relaxedTiming: true,
      editableConfiguration: true,
      responseMaxSeconds: 60,
      maxRepetitions: null,
      difficulty: "tutorial",
      researchLogging: false
    }
  },
  rehabilitation: {
    id: "rehabilitation",
    label: "Rehabilitacion",
    flag: "rehabilitationMode",
    comparableWithStandard: false,
    notice: "Los resultados corresponden a una modalidad de rehabilitacion y no son directamente comparables con aplicaciones estandarizadas.",
    defaults: {
      showFullInstructions: true,
      showExamples: true,
      allowStimulusRepeat: true,
      allowAudioRepeat: true,
      allowVoiceRepeat: true,
      immediateFeedback: true,
      feedbackPositive: true,
      explainErrors: true,
      adaptiveProgression: true,
      freePauses: true,
      configurableTiming: true,
      editableConfiguration: true,
      responseMaxSeconds: 45,
      maxRepetitions: 3,
      difficulty: "adaptativa",
      recordLearning: true,
      showEvolutionCharts: true,
      researchLogging: false
    }
  },
  clinical: {
    id: "clinical",
    label: "Evaluacion Clinica",
    flag: "clinicalMode",
    comparableWithStandard: true,
    notice: "Aplicacion realizada siguiendo el protocolo clinico configurado.",
    defaults: {
      showFullInstructions: true,
      bibliographicPractice: true,
      allowStimulusRepeat: false,
      allowAudioRepeat: false,
      allowVoiceRepeat: false,
      immediateFeedback: false,
      showCorrectAnswer: false,
      showPatientResponse: false,
      showClassification: false,
      allowResponseCorrection: true,
      visualHelp: false,
      freePauses: false,
      allowTrialRestart: false,
      relaxedTiming: false,
      editableConfiguration: false,
      responseMaxSeconds: 15,
      maxRepetitions: 0,
      difficulty: "protocolo",
      researchLogging: false
    }
  },
  research: {
    id: "research",
    label: "Investigacion",
    flag: "researchMode",
    comparableWithStandard: true,
    notice: "Modalidad de investigacion: se registra informacion tecnica ampliada sin modificar el protocolo.",
    defaults: {
      showFullInstructions: true,
      showExamples: false,
      allowStimulusRepeat: false,
      allowAudioRepeat: false,
      allowVoiceRepeat: false,
      immediateFeedback: false,
      showCorrectAnswer: false,
      showPatientResponse: false,
      showClassification: false,
      visualHelp: false,
      freePauses: false,
      allowTrialRestart: false,
      relaxedTiming: false,
      editableConfiguration: false,
      responseMaxSeconds: 15,
      maxRepetitions: 0,
      difficulty: "protocolo",
      researchLogging: true,
      recordKeyboardEvents: true,
      recordPointerEvents: true,
      recordVisibilityEvents: true,
      recordBrowserInfo: true,
      recordRenderTiming: true
    }
  }
};

class RehabilitationModeManager {
  constructor() {
    this.activities = new Map();
    this.currentMode = "clinical";
    this.protocolVersion = PROTOCOL_VERSION;
    this.events = [];
    this.boundHandlers = null;
  }

  registerActivity(activityId, options = {}) {
    const capabilities = {
      supportsTraining: true,
      supportsRehabilitation: true,
      supportsClinical: true,
      supportsResearch: true,
      activityVersion: "",
      stimulusVersion: "",
      ...options
    };
    this.activities.set(activityId, capabilities);
    return this;
  }

  getAvailableModes(activityId = "") {
    const activity = this.activities.get(activityId) || {};
    return Object.values(REHABILITATION_APPLICATION_MODES).filter((mode) => {
      if (mode.id === "training") return activity.supportsTraining !== false;
      if (mode.id === "rehabilitation") return activity.supportsRehabilitation !== false;
      if (mode.id === "clinical") return activity.supportsClinical !== false;
      if (mode.id === "research") return activity.supportsResearch !== false;
      return true;
    });
  }

  setCurrentMode(modeId, activityId = "") {
    const available = this.getAvailableModes(activityId).map((mode) => mode.id);
    this.currentMode = available.includes(modeId) ? modeId : available[0] || "clinical";
    return this.getCurrentMode();
  }

  getCurrentMode() {
    return REHABILITATION_APPLICATION_MODES[this.currentMode] || REHABILITATION_APPLICATION_MODES.clinical;
  }

  getConfiguration(overrides = {}, activityId = "") {
    const mode = this.getCurrentMode();
    const activity = this.activities.get(activityId) || {};
    return {
      applicationMode: mode.id,
      applicationModeLabel: mode.label,
      protocolVersion: this.protocolVersion,
      comparableWithStandard: mode.comparableWithStandard,
      modalityNotice: mode.notice,
      ...mode.defaults,
      ...activity.defaultConfiguration,
      ...overrides
    };
  }

  getSessionMetadata({ activityId = "", activityVersion = "", stimulusVersion = "", overrides = {} } = {}) {
    const activity = this.activities.get(activityId) || {};
    const mode = this.getCurrentMode();
    const configurationUsed = this.getConfiguration(overrides, activityId);
    return {
      applicationMode: mode.id,
      applicationModeLabel: mode.label,
      configurationUsed,
      protocolVersion: this.protocolVersion,
      activityVersion: activityVersion || activity.activityVersion || "",
      stimulusVersion: stimulusVersion || activity.stimulusVersion || "",
      trainingMode: mode.id === "training",
      rehabilitationMode: mode.id === "rehabilitation",
      clinicalMode: mode.id === "clinical",
      researchMode: mode.id === "research",
      modalityNotice: mode.notice
    };
  }

  attachResearchLogging(target = document) {
    this.detachResearchLogging();
    const push = (type, event = {}) => {
      this.events.push({
        type,
        at: new Date().toISOString(),
        timeStamp: event.timeStamp ?? performance.now(),
        key: event.key,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        visibilityState: document.visibilityState
      });
    };
    this.boundHandlers = {
      keydown: (event) => push("keydown", event),
      pointerdown: (event) => push("pointerdown", event),
      visibilitychange: (event) => push("visibilitychange", event)
    };
    target.addEventListener("keydown", this.boundHandlers.keydown);
    target.addEventListener("pointerdown", this.boundHandlers.pointerdown);
    document.addEventListener("visibilitychange", this.boundHandlers.visibilitychange);
  }

  detachResearchLogging(target = document) {
    if (!this.boundHandlers) return;
    target.removeEventListener("keydown", this.boundHandlers.keydown);
    target.removeEventListener("pointerdown", this.boundHandlers.pointerdown);
    document.removeEventListener("visibilitychange", this.boundHandlers.visibilitychange);
    this.boundHandlers = null;
  }

  getResearchEvents() {
    return [...this.events];
  }

  clearResearchEvents() {
    this.events = [];
  }
}

export const rehabilitationModeManager = new RehabilitationModeManager();
export default rehabilitationModeManager;
