import { Atom } from "./Atom.js"; import { Bond } from "./Bond.js";
export class Molecule {
  #atoms = new Map(); #bonds = new Map();
  addAtom(atom) { if (!(atom instanceof Atom) || this.#atoms.has(atom.id)) throw new Error("Átomo inválido o duplicado"); this.#atoms.set(atom.id,atom); return atom; }
  removeAtom(id) { if (!this.#atoms.delete(id)) return false; [...this.#bonds.values()].filter(b=>b.atomAId===id||b.atomBId===id).forEach(b=>this.#bonds.delete(b.id)); return true; }
  getAtom(id) { return this.#atoms.get(id); } getAtoms() { return [...this.#atoms.values()]; }
  addBond(bond) { if (!(bond instanceof Bond) || !this.#atoms.has(bond.atomAId) || !this.#atoms.has(bond.atomBId) || this.hasBond(bond.atomAId,bond.atomBId)) throw new Error("Enlace inválido, duplicado o con átomo inexistente"); this.#bonds.set(bond.id,bond); return bond; }
  removeBond(id) { return this.#bonds.delete(id); } getBond(id) { return this.#bonds.get(id); } getBonds() { return [...this.#bonds.values()]; }
  getBondsForAtom(id) { return this.getBonds().filter(b=>b.atomAId===id||b.atomBId===id); } getNeighbors(id) { return this.getBondsForAtom(id).map(b=>this.getAtom(b.atomAId===id?b.atomBId:b.atomAId)); }
  hasBond(a,b) { return this.getBonds().some(x=>Bond.key(x.atomAId,x.atomBId)===Bond.key(a,b)); }
  totalFormalCharge() { return this.getAtoms().reduce((sum,a)=>sum+a.formalCharge_e,0); }
  clone() { const copy=new Molecule(); this.getAtoms().forEach(a=>copy.addAtom(a.clone())); this.getBonds().forEach(b=>copy.addBond(b.clone())); return copy; }
  toJSON() { return { atoms:this.getAtoms().map(a=>a.toJSON()), bonds:this.getBonds().map(b=>b.toJSON()), totalCharge:this.totalFormalCharge() }; }
  validateIntegrity() { const errors=[]; this.getBonds().forEach(b=>{if(!this.getAtom(b.atomAId)||!this.getAtom(b.atomBId)) errors.push(`Referencia inválida: ${b.id}`); if(b.atomAId===b.atomBId) errors.push(`Autoenlace: ${b.id}`);}); const keys=new Set(); this.getBonds().forEach(b=>{if(keys.has(b.key())) errors.push(`Enlace duplicado: ${b.key()}`); keys.add(b.key());}); return {valid:errors.length===0,errors}; }
}
