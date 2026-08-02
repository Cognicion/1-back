const empty=()=>({rendererInstances:0,activeAnimationFrames:0,continuousRenderReasons:[],resizeObservers:0,mutationObservers:0,eventListeners:0,sceneObjects:0,geometries:0,materials:0,textures:0,atomVisuals:0,bondVisuals:0,forceVisuals:0,labelVisuals:0,initializationCount:0,disposalCount:0,lastRenderAt:null,renderedFrameCount:0});
let diagnostics=empty();
export const resetRendererDiagnostics=()=>{diagnostics=empty();return getRendererDiagnostics();};
export const updateRendererDiagnostics=partial=>{diagnostics={...diagnostics,...partial,continuousRenderReasons:[...(partial.continuousRenderReasons??diagnostics.continuousRenderReasons)]};};
export const getRendererDiagnostics=()=>Object.freeze({...diagnostics,continuousRenderReasons:[...diagnostics.continuousRenderReasons]});
export const validateRendererLifecycle=()=>({valid:diagnostics.rendererInstances<=1&&diagnostics.activeAnimationFrames<=1&&diagnostics.resizeObservers<=1&&diagnostics.eventListeners>=0,diagnostics:getRendererDiagnostics()});
