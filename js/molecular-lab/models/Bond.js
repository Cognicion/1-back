const ORDERS = Object.freeze([1,2,3]);
export class Bond {
  constructor({ id, atomAId, atomBId, order, type = "covalent", origin = "user", confidence = null, metadata = {} }) { if (!id || !atomAId || !atomBId || atomAId===atomBId) throw new TypeError("Enlace inválido"); if (!ORDERS.includes(order)) throw new RangeError("Orden de enlace permitido: 1, 2 o 3"); this.id=id; this.atomAId=atomAId; this.atomBId=atomBId; this.order=order; this.type=type; this.origin=origin; this.confidence=confidence; this.metadata={...metadata}; }
  static key(a,b) { return [a,b].sort().join("--"); }
  key() { return Bond.key(this.atomAId,this.atomBId); }
  clone() { return new Bond(this.toJSON()); }
  toJSON() { return { id:this.id, atomAId:this.atomAId, atomBId:this.atomBId, order:this.order, type:this.type, origin:this.origin, confidence:this.confidence, metadata:{...this.metadata} }; }
}
