import { createVector3, isFiniteVector3 } from "../math/vector3.js";
export class Atom {
  constructor({ id, elementId, isotopeMass_u = null, position_nm, formalCharge_e = 0, oxidationState = null, fixed = false, metadata = {} }) { if (!id || !elementId) throw new TypeError("Atom requiere id y elementId"); this.id=id; this.elementId=elementId; this.isotopeMass_u=isotopeMass_u; this.position_nm=createVector3(position_nm.x,position_nm.y,position_nm.z); this.formalCharge_e=formalCharge_e; this.oxidationState=oxidationState; this.fixed=Boolean(fixed); this.metadata={...metadata}; }
  setPosition(position) { if (this.fixed) throw new Error(`Átomo fijo: ${this.id}`); this.position_nm=createVector3(position.x,position.y,position.z); }
  validate() { return { valid: isFiniteVector3(this.position_nm), errors: isFiniteVector3(this.position_nm)?[]:["Coordenadas no finitas"] }; }
  clone() { return new Atom(this.toJSON()); }
  toJSON() { return { id:this.id, elementId:this.elementId, isotopeMass_u:this.isotopeMass_u, position_nm:{...this.position_nm}, formalCharge_e:this.formalCharge_e, oxidationState:this.oxidationState, fixed:this.fixed, metadata:{...this.metadata} }; }
}
