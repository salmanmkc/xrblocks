import * as THREE from 'three';
import * as xb from 'xrblocks';
import {UICardBehavior} from './UICardBehavior';

/**
 * BillboardMode
 * 'cylindrical' - Restrict rotation to position locks on the Y-axis.
 * 'spherical' - Full dimensional look-at view framing.
 */
export type BillboardMode = 'cylindrical' | 'spherical';

/**
 * Configuration parameters for BillboardBehavior setup options.
 */
export interface BillboardConfig {
  /** The lock axis framing approach configuration. */
  mode?: BillboardMode;
  /** Smoothing lerp value coefficient mapping framerate increments. */
  lerpFactor?: number;
}

/**
 * BillboardBehavior
 * Makes a `UICard` automatically face the user's camera view.
 * Dynamically resolves continuous frames updating smoothly into calculated thresholds.
 */
export class BillboardBehavior extends UICardBehavior<BillboardConfig> {
  private _targetPos = new THREE.Vector3();
  private _dummy = new THREE.Object3D();

  /**
   * Constructs a new BillboardBehavior.
   */
  constructor(config: BillboardConfig = {}) {
    super({
      mode: config.mode ?? 'cylindrical',
      lerpFactor: config.lerpFactor ?? 0.1,
    });
  }

  update() {
    if (!this.card || !xb.core?.camera) return;
    if (this.card.isDragging) return;

    const camera = xb.core.camera;
    const cardObj = this.card;

    // Use dummy object to calculate target rotation.
    this._dummy.position.copy(cardObj.position);

    if (this.properties.mode === 'spherical') {
      this._dummy.lookAt(camera.position);
    } else if (this.properties.mode === 'cylindrical') {
      this._targetPos.set(
        camera.position.x,
        cardObj.position.y,
        camera.position.z
      );
      this._dummy.lookAt(this._targetPos);
    }

    // Smoothly rotate towards target.
    // Adjust lerp speed based on delta to be somewhat framerate independent.
    // Using a simple lerp factor for "feel" as requested.
    // A higher lerpFactor means faster (1.0 = instant).
    const lerpFactor = this.properties.lerpFactor ?? 0.1;
    const smoothFactor = 1 - Math.exp(-lerpFactor * xb.getDeltaTime() * 60);

    cardObj.quaternion.slerp(this._dummy.quaternion, smoothFactor);
  }
}
