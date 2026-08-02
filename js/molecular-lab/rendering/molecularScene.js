import * as THREE from "three"; import { createGrid } from "./gridRenderer.js";
export function createMolecularScene(){const scene=new THREE.Scene(),moleculeGroup=new THREE.Group(),forceGroup=new THREE.Group(),grid=createGrid();scene.add(grid,moleculeGroup,forceGroup);return {scene,moleculeGroup,forceGroup,grid};}
