// Heroes stay visible behind walls without the walls fading or vanishing:
// walls mark the stencil buffer, a hero clears it wherever the hero itself
// is seen, and a flat-coloured copy of the hero is drawn only where it is
// behind something (depth test reversed) that a wall marked.
// Shared by the game (src/view3d.js) and the prototype (proto3d/main.js).
import * as THREE from 'three';

export function markOccluder(mat) {
  for (const m of [].concat(mat)) {
    m.stencilWrite = true;
    m.stencilRef = 1;
    m.stencilFunc = THREE.AlwaysStencilFunc;
    m.stencilZPass = THREE.ReplaceStencilOp;
  }
}

export function silhouetteMaterial(color, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  });
}

// Adds the silhouette copies to a (skinned) model; returns their material.
export function addSilhouette(root, color) {
  const mat = silhouetteMaterial(color);
  const skinned = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.silhouette) return;
    for (const m of [].concat(o.material)) {
      m.stencilWrite = true;
      m.stencilRef = 0;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
    skinned.push(o);
  });
  for (const o of skinned) {
    const s = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
    if (o.isSkinnedMesh) s.bind(o.skeleton, o.bindMatrix);
    s.position.copy(o.position); s.quaternion.copy(o.quaternion); s.scale.copy(o.scale);
    s.renderOrder = 20;
    s.frustumCulled = false;
    s.castShadow = s.receiveShadow = false;
    s.userData.silhouette = true;
    o.parent.add(s);
  }
  return mat;
}
