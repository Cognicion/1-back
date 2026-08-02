import { buildBenchmark } from "./benchmarkMolecules.js";
import { calculateMeasurement } from "../state/measurementController.js";
import { captureGeometrySnapshot, restoreGeometrySnapshot } from "../state/geometrySnapshots.js";
import { getRendererDiagnostics, resetRendererDiagnostics, updateRendererDiagnostics, validateRendererLifecycle } from "../rendering/rendererDiagnostics.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
export function runPhase4cTests(){const results=[],test=(name,fn)=>{try{fn();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}};
  test("medición de distancia nm/Å",()=>{const result=calculateMeasurement(buildBenchmark("H2"),["H2-atom-1","H2-atom-2"]);assert(result.valid&&result.values.nm>0&&Math.abs(result.values.angstrom-result.values.nm*10)<1e-12,"distancia incorrecta");});
  test("medición angular",()=>{const result=calculateMeasurement(buildBenchmark("H2O"),["H2O-atom-2","H2O-atom-1","H2O-atom-3"]);assert(result.valid&&result.values.rad>0&&result.values.degrees>0,"ángulo incorrecto");});
  test("diedro degenerado controlado",()=>{const molecule=buildBenchmark("C2H2"),ids=molecule.getAtoms().slice(0,4).map(atom=>atom.id),result=calculateMeasurement(molecule,ids);assert(!result.valid&&result.warnings.length,"diedro degenerado no informado");});
  test("snapshot restaura sin alterar topología",()=>{const molecule=buildBenchmark("H2O"),before=molecule.toJSON(),snapshot=captureGeometrySnapshot(molecule,"test"),atom=molecule.getAtoms()[0];atom.setPosition({x:.2,y:.2,z:.2});const restored=restoreGeometrySnapshot(snapshot,molecule,(id,position)=>molecule.getAtom(id).setPosition(position));assert(restored.valid&&molecule.getBonds().length===before.bonds.length,"snapshot inválido");});
  test("snapshot rechaza átomo ausente",()=>{const molecule=buildBenchmark("H2"),snapshot=captureGeometrySnapshot(molecule,"test");molecule.removeAtom("H2-atom-1");assert(!restoreGeometrySnapshot(snapshot,molecule,()=>{}).valid,"átomo ausente aceptado");});
  test("diagnóstico conserva razones independientes",()=>{resetRendererDiagnostics();updateRendererDiagnostics({rendererInstances:1,continuousRenderReasons:["camera","drag"],activeAnimationFrames:1,resizeObservers:1});updateRendererDiagnostics({continuousRenderReasons:["camera"]});const report=validateRendererLifecycle();assert(report.valid&&getRendererDiagnostics().continuousRenderReasons.length===1,"razones no aisladas");});
  return {passed:results.every(result=>result.passed),results};
}
