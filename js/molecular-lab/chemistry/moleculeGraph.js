export class MoleculeGraph {
  constructor(molecule) { this.molecule=molecule; }
  neighbors(id) { return this.molecule.getNeighbors(id).map(atom=>atom.id); }
  degree(id) { return this.neighbors(id).length; }
  bondOrderSum(id) { return this.molecule.getBondsForAtom(id).reduce((sum,b)=>sum+b.order,0); }
  connectedComponents() { const seen=new Set(), components=[]; for(const atom of this.molecule.getAtoms()){if(seen.has(atom.id))continue; const stack=[atom.id],component=[]; while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);component.push(id);stack.push(...this.neighbors(id));}components.push(component);} return components; }
  duplicateEdges() { const seen=new Set(), dup=[]; this.molecule.getBonds().forEach(b=>{if(seen.has(b.key()))dup.push(b.key());seen.add(b.key());}); return dup; }
  invalidReferences() { return this.molecule.getBonds().filter(b=>!this.molecule.getAtom(b.atomAId)||!this.molecule.getAtom(b.atomBId)); }
  hasCycle() { const visited=new Set(); const visit=(id,parent)=>{visited.add(id);for(const next of this.neighbors(id)){if(!visited.has(next)&&visit(next,id))return true;if(next!==parent)return true;}return false;}; return this.molecule.getAtoms().some(a=>!visited.has(a.id)&&visit(a.id,null)); }
}
