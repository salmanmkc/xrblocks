import * as THREE from 'three';

import {Depth} from '../../depth/Depth';
import {isBVHReady} from '../../utils/BVHRaycast';
import {disposeMaterial} from '../../utils/ThreeDisposal';

/**
 * Reusable snapshot of the depth mesh for detectors that raycast against it.
 *
 * The detectors project model landmarks into world space by raycasting the
 * depth mesh, once per landmark. Doing that against the live mesh is unsafe
 * because detection is asynchronous and the mesh keeps refreshing underneath,
 * so each detection works against a clone.
 *
 * Cloning per detection is expensive: it allocates fresh position, uv, normal
 * and index buffers and then walks every vertex twice to recompute bounds. It
 * is also usually wasted, because the depth mesh only changes when the view or
 * the scene does. The clone is therefore cached and reused until the source
 * geometry's position attribute bumps its version, which three.js does
 * whenever the depth mesh refreshes.
 *
 * The clone also carries a BVH when `three-mesh-bvh` is reachable, which turns
 * the per-landmark raycasts from a walk over every triangle into a tree
 * descent. Caching means that build amortises across detections rather than
 * running on every one.
 */
export class DepthMeshSnapshotCache {
  private snapshot: THREE.Mesh | null = null;
  private sourceGeometry: THREE.BufferGeometry | null = null;
  private sourceVersion = -1;

  /**
   * Returns a depth mesh clone that is safe to raycast against, reusing the
   * previous one when the source has not changed.
   *
   * @param depth - The depth subsystem holding the live depth mesh.
   * @returns A cloned mesh positioned to match the live depth mesh.
   */
  get(depth: Depth): THREE.Mesh {
    const depthMesh = depth.depthMesh!;
    const geometry = depth.options.depthMesh.updateFullResolutionGeometry
      ? depthMesh.geometry
      : depthMesh.downsampledGeometry || depthMesh.geometry;

    // Both BufferAttribute and InterleavedBufferAttribute carry a `version`
    // that three.js bumps on `needsUpdate = true`, but the union type does not
    // expose it. Cast to read.
    const version = (
      geometry.attributes.position as unknown as {version: number}
    ).version;

    if (
      this.snapshot &&
      this.sourceGeometry === geometry &&
      this.sourceVersion === version
    ) {
      // Positions are unchanged, so the clone and its BVH are still valid.
      // Only the world transform needs refreshing, which is cheap.
      this.copyTransform(depthMesh, this.snapshot);
      return this.snapshot;
    }

    this.dispose();

    const clonedGeometry = geometry.clone();
    clonedGeometry.computeBoundingSphere();
    clonedGeometry.computeBoundingBox();
    if (isBVHReady()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (clonedGeometry as any).computeBoundsTree();
    }

    const snapshot = new THREE.Mesh(
      clonedGeometry,
      new THREE.MeshBasicMaterial()
    );
    this.copyTransform(depthMesh, snapshot);

    this.snapshot = snapshot;
    this.sourceGeometry = geometry;
    this.sourceVersion = version;
    return snapshot;
  }

  /** Frees the cached clone, its BVH, and its material. */
  dispose() {
    if (!this.snapshot) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.snapshot.geometry as any).disposeBoundsTree?.();
    this.snapshot.geometry.dispose();
    disposeMaterial(this.snapshot.material);
    this.snapshot = null;
    this.sourceGeometry = null;
    this.sourceVersion = -1;
  }

  private copyTransform(from: THREE.Object3D, to: THREE.Object3D) {
    from.getWorldPosition(to.position);
    from.getWorldQuaternion(to.quaternion);
    from.getWorldScale(to.scale);
    to.updateMatrixWorld(true);
  }
}
