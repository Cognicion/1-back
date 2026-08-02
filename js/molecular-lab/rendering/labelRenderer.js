export function createLabelLayer(container){const layer=document.createElement("div");layer.className="ml-label-layer";container.append(layer);return {sync(){},dispose(){layer.remove();}};}
