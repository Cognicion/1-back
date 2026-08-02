import { degreesToRadians, nmToAngstrom, radiansToDegrees } from "../data/unitDefinitions.js";
import { cross, dot, magnitude, subtract } from "../math/vector3.js";

const finite = value => Number.isFinite(value);
const invalid = (type, atomIds, warning) => ({ type, atomIds:[...atomIds], value:null, units:[], valid:false, warnings:[warning], timestamp:Date.now(), moleculeRevision:null });
const positions = (molecule, atomIds) => atomIds.map(id => molecule.getAtom(id)?.position_nm);

export function calculateMeasurement(molecule, atomIds) {
  const ids=[...atomIds], type=ids.length===2?"distance":ids.length===3?"angle":ids.length===4?"dihedral":null;
  if (!type) return invalid("unresolved",ids,"Seleccione dos, tres o cuatro átomos.");
  const points=positions(molecule,ids);
  if (points.some(point => !point)) return invalid(type,ids,"Uno o más átomos ya no existen.");
  try {
    if(type==="distance") { const value=magnitude(subtract(points[0],points[1])); return {type,atomIds:ids,value,units:["nm","Å"],values:{nm:value,angstrom:nmToAngstrom(value)},valid:finite(value),warnings:[],timestamp:Date.now(),moleculeRevision:null}; }
    const ab=subtract(points[0],points[1]), cb=subtract(points[2],points[1]), denominator=magnitude(ab)*magnitude(cb);
    if(denominator===0) return invalid(type,ids,"Ángulo indefinido: vector de longitud cero.");
    const angle=Math.acos(Math.min(1,Math.max(-1,dot(ab,cb)/denominator)));
    if(type==="angle") return {type,atomIds:ids,value:angle,units:["rad","°"],values:{rad:angle,degrees:radiansToDegrees(angle)},valid:finite(angle),warnings:[],timestamp:Date.now(),moleculeRevision:null};
    const b0=subtract(points[1],points[0]),b1=subtract(points[2],points[1]),b2=subtract(points[3],points[2]),n1=cross(b0,b1),n2=cross(b1,b2),b1Length=magnitude(b1);
    if(!b1Length||magnitude(n1)===0||magnitude(n2)===0)return invalid(type,ids,"Diedro degenerado o colineal.");
    const x=dot(n1,n2), y=dot(cross(n1,n2),b1)/b1Length, value=Math.atan2(y,x);
    return {type,atomIds:ids,value,units:["rad","°"],values:{rad:value,degrees:radiansToDegrees(value)},signConvention:"atan2((n1×n2)·b1/|b1|, n1·n2), rango [-π, π]",valid:finite(value),warnings:[],timestamp:Date.now(),moleculeRevision:null};
  } catch(error) { return invalid(type,ids,error.message); }
}

export function createMeasurementController({state,onChange}) { let atomIds=[]; const publish=()=>{state.measurement=calculateMeasurement(state.molecule,atomIds);onChange?.(state.measurement);return state.measurement;}; return { selectAtom(id){atomIds=[...atomIds.filter(item=>item!==id),id].slice(-4);return publish();}, clear(){atomIds=[];state.measurement=null;onChange?.(null);}, getAtomIds:()=>[...atomIds], refresh:publish, markStale(){if(state.measurement)state.measurement={...state.measurement,valid:false,warnings:[...state.measurement.warnings,"Medición obsoleta: cambiaron las coordenadas."]};onChange?.(state.measurement);} }; }
