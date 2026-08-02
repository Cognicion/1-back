import { calculateEnergyTerms } from "./energyTerms.js";
export function calculateMolecularEnergy(molecule,settings={}){const started=performance.now();const result=calculateEnergyTerms(molecule,settings);return {...result,diagnostics:{...result.diagnostics,calculationTime_ms:performance.now()-started}};}
