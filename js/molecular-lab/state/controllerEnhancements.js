import { captureGeometrySnapshot, restoreGeometrySnapshot } from "./geometrySnapshots.js";

export function enhanceMolecularLabController(controller,state,view) {
  const render=()=>view.render(state);
  const invalidate=()=>{state.energyStale=true;state.forcesStale=true;if(state.measurement)state.measurement={...state.measurement,valid:false,warnings:[...state.measurement.warnings,"Medición obsoleta: cambiaron las coordenadas."]};};
  const updateAtomPosition=(id,position,{allowFixed=false}={})=>{const atom=state.molecule.getAtom(id);if(!atom)throw new Error(`Átomo inexistente: ${id}`);if(atom.fixed&&!allowFixed)throw new Error(`Átomo fijo: ${id}`);const fixed=atom.fixed;try{if(fixed)atom.fixed=false;controller.updateAtomPosition(id,position);}finally{atom.fixed=fixed;}invalidate();};
  const captureSnapshot=reason=>{const snapshot=captureGeometrySnapshot(state.molecule,reason);state.geometrySnapshots[reason]=snapshot;return snapshot;};
  const restoreSnapshot=reason=>{const result=restoreGeometrySnapshot(state.geometrySnapshots[reason],state.molecule,updateAtomPosition);if(result.valid){invalidate();render();}return result;};
  const minimize=settings=>{captureSnapshot("minimization");const result=controller.minimize(settings);state.minimization={status:result.status,result};return result;};
  const loadBenchmark=name=>{controller.loadBenchmark(name);state.geometrySnapshots.benchmark=captureGeometrySnapshot(state.molecule,"benchmark");invalidate();render();};
  return {...controller,updateAtomPosition,captureSnapshot,restoreSnapshot,minimize,loadBenchmark};
}
