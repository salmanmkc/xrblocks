import {reversePainterSortStable} from '@pmndrs/uikit';
import * as THREE from 'three';

type MaybeHasGroupOrder = {
  groupOrder?: number;
};

const EPSILON = 0.0001;

/**
 * Sorts intersections for raycasting on UI elements.
 * Sorting order: Distance (Ascending) -\> Render Order (Descending) -\> UI Hierarchy (Descending) -\> ID (Descending).
 * @param a - First intersection item.
 * @param b - Second intersection item.
 * @returns Numeric offset for native sort comparison.
 */
export function raycastSortFunction(
  a: THREE.Intersection,
  b: THREE.Intersection
) {
  // 1. Sort by Distance (Ascending) - Closer objects intersect first
  const distDiff = a.distance - b.distance;
  if (Math.abs(distDiff) > EPSILON) {
    return distDiff;
  }

  // 2. Sort by Render Order (Descending) - Higher renderOrder sits on top
  if (a.object.renderOrder !== b.object.renderOrder) {
    return b.object.renderOrder - a.object.renderOrder;
  }

  // 3. Sort by UIKit Hierarchy depth/sorting (Stable painter sort)
  const itemA = {
    object: a.object,
    z: a.distance,
    renderOrder: a.object.renderOrder,
    groupOrder: (a.object as MaybeHasGroupOrder).groupOrder ?? 0,
    id: a.object.id,
  };
  const itemB = {
    object: b.object,
    z: b.distance,
    renderOrder: b.object.renderOrder,
    groupOrder: (b.object as MaybeHasGroupOrder).groupOrder ?? 0,
    id: b.object.id,
  };
  const uikitResult = -reversePainterSortStable(
    itemA as THREE.RenderItem,
    itemB as THREE.RenderItem
  );
  if (Math.abs(uikitResult) > EPSILON) {
    return uikitResult;
  }

  // 4. Fallback: Sort by ID (Descending) to preserve deterministic order
  return b.object.id - a.object.id;
}
