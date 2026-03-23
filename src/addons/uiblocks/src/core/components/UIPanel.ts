import * as THREE from 'three';
import {XRUI} from '../mixins/XRUI';
import {
  GradientPanel,
  GradientPanelProperties,
} from '../primitives/GradientPanel';

/**
 * Properties for initializing a UIPanel.
 * Extends GradientPanelProperties with standard interaction event hooks.
 */
export type UIPanelProperties = GradientPanelProperties & {
  /** Callback triggered when a controller pointer enters the panel’s bounding volume. */
  onHoverEnter?: (controller: THREE.Object3D) => void;
  /** Callback triggered when a controller pointer exits the panel’s bounding volume. */
  onHoverExit?: (controller: THREE.Object3D) => void;
  /** Callback triggered when a click/select selection concludes on this panel. */
  onClick?: () => void;
};

/**
 * UIPanel
 * A unified component for both layout arrangement and visual styling.
 * Supports background gradients, shadows, borders, and flexbox styles.
 *
 * It is also the default entry point for capturing laser pointer Interactions via the XRUI mixin.
 */
export class UIPanel extends XRUI(GradientPanel) {
  // Internal callback storage.
  private _onHoverEnter?: (controller: THREE.Object3D) => void;
  private _onHoverExit?: (controller: THREE.Object3D) => void;

  // Custom click handler (not part of Script interface).
  onClick?: () => void;

  /**
   * Constructs a new UIPanel.
   * Forces transparency support default for standard overlays and registers internal callbacks for standard beam clicks.
   */
  constructor(properties: UIPanelProperties = {}) {
    // Handle Interaction Defaults.
    const superProps = {
      ...properties,
      pointerEvents: properties.pointerEvents ?? 'none',
    };

    super(superProps);

    // Overwrite the raycast of the uikit to not return false.
    this.raycast = () => {};

    // Assign Callbacks.
    this._onHoverEnter = properties.onHoverEnter;
    this._onHoverExit = properties.onHoverExit;
    this.onClick = properties.onClick;
  }

  /**
   * Internal hook triggered by Mixin beam listeners to trigger user pointer enter hooks.
   */
  onHoverEnter(controller: THREE.Object3D) {
    if (this._onHoverEnter) this._onHoverEnter(controller);
    return true;
  }

  /**
   * Internal hook triggered by Mixin beam listeners to trigger user pointer exit hooks.
   */
  onHoverExit(controller: THREE.Object3D) {
    if (this._onHoverExit) this._onHoverExit(controller);
    return true;
  }

  /**
   * Internal hook triggered by Mixin beam listeners on select releases to trigger click triggers.
   */
  onObjectSelectEnd() {
    if (this.onClick) this.onClick();
    return true;
  }
}
