import { nmToWorldUnits,worldUnitsToNm,vectorNmToWorld,vectorWorldToNm } from "../rendering/displayScale.js";
export function validateDisplayScale(){const vector={x:.1,y:-.2,z:.3},roundTrip=vectorWorldToNm(vectorNmToWorld(vector));return {valid:Math.abs(worldUnitsToNm(nmToWorldUnits(.1))-.1)<1e-12&&Object.keys(vector).every(key=>Math.abs(vector[key]-roundTrip[key])<1e-12),roundTrip};}
