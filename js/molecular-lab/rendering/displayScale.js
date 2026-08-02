export const WORLD_UNITS_PER_NM=10;
export const nmToWorldUnits=value=>{if(!Number.isFinite(value))throw new TypeError("nm finito requerido");return value*WORLD_UNITS_PER_NM;};
export const worldUnitsToNm=value=>{if(!Number.isFinite(value))throw new TypeError("unidad visual finita requerida");return value/WORLD_UNITS_PER_NM;};
export const vectorNmToWorld=vector=>({x:nmToWorldUnits(vector.x),y:nmToWorldUnits(vector.y),z:nmToWorldUnits(vector.z)});
export const vectorWorldToNm=vector=>({x:worldUnitsToNm(vector.x),y:worldUnitsToNm(vector.y),z:worldUnitsToNm(vector.z)});
