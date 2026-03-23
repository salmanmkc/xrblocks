import {Container} from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import {UICardBehavior} from '../behaviors/UICardBehavior';
import {DEFAULT_MANIPULATION_PANEL_PROPS} from '../constants/ManipulationPanelConstants';
import {DEFAULT_CARD_PROPS} from '../constants/UICardConstants';
import {XRUI} from '../mixins/XRUI';
import {
  ManipulationPanel,
  ManipulationPanelProperties,
} from '../primitives/ManipulationPanel';
import {ManipulationLayer} from '../primitives/layers/ManipulationLayer';
import {UX} from '../types/UXTypes';

/**
 * Properties for initializing a UICard.
 * Extends ManipulationPanelProperties with spatial positioning, behavior setup, and standard layout anchors.
 */
export type UICardOutProperties = ManipulationPanelProperties & {
  /** Optional name for scene graph identification. */
  name?: string;

  /** 3D World position. */
  position?: THREE.Vector3;
  /** 3D World rotation. */
  rotation?: THREE.Quaternion;

  /** List of behavior modifiers to attach (e.g., BillboardBehavior, HeadLeashBehavior). */
  behaviors?: UICardBehavior[];

  /** Enables debug outlines/logging if applicable. */
  debug?: boolean;

  /** Initial visibility state. */
  visible?: boolean;

  /** Layout Property: absolute bounding width in meters. */
  sizeX?: number;
  /** Layout Property: absolute bounding height in meters. */
  sizeY?: number;
  /** Layout Anchor: 'left', 'right', 'center', or a floating ratio 0.0-1.0. */
  anchorX?: 'left' | 'right' | 'center' | number;
  /** Layout Anchor: 'bottom', 'top', 'center', or a floating ratio 0.0-1.0. */
  anchorY?: 'bottom' | 'top' | 'center' | number;
  /** Resolution adapter scaling physical size onto panel dimensions. */
  pixelSize?: number;
};

/**
 * UICard
 * The **Physical World** bridge. It serves as the root container anchoring UI menus in 3D scene space.
 * Inherits from ManipulationPanel via the XRUI mixin to handle grabbable spatial operations and bounding borders.
 */
export class UICard extends XRUI(ManipulationPanel) {
  public name: string = 'UICard';

  private behaviors: UICardBehavior[] = [];

  public get isDragging(): boolean {
    return this.behaviors.some(
      (b) =>
        'isDragging' in b && Boolean((b as {isDragging?: boolean}).isDragging)
    );
  }

  // Base layout properties (exposed for behaviors to calculate layout overrides).
  public readonly cardPixelSize: number;
  public readonly baseWidth?: number;
  public readonly baseHeight?: number;
  public readonly baseSizeX?: number;
  public readonly baseSizeY?: number;
  public readonly anchorX?: number;
  public readonly anchorY?: number;
  public readonly basePosition?: THREE.Vector3;

  /**
   * Constructs a new UICard.
   * Initializes layouts, transparent bounding wrappers, and mounts attached behaviors.
   */
  constructor(config: UICardOutProperties) {
    const {
      name,
      position,
      rotation,
      behaviors,
      visible,
      ...userContainerProps
    } = config;

    super({
      ...DEFAULT_CARD_PROPS,
      ...userContainerProps,
      cursorSpotlightColor:
        DEFAULT_MANIPULATION_PANEL_PROPS.cursorSpotlightColor,
      cursorRadius: DEFAULT_MANIPULATION_PANEL_PROPS.cursorRadius,
      cursorSpotlightBlur: DEFAULT_MANIPULATION_PANEL_PROPS.cursorSpotlightBlur,
      manipulationEdgeWidth:
        DEFAULT_MANIPULATION_PANEL_PROPS.manipulationEdgeWidth,
      manipulationEdgeColor:
        DEFAULT_MANIPULATION_PANEL_PROPS.manipulationEdgeColor,
      manipulationMargin: 0, // Set by layout method later.
      manipulationCornerRadius: 0, // Set by layout method later.

      // Force transparency and pointer events passthrough on root.
      pointerEvents: 'none',
      backgroundColor: undefined,
      borderColor: undefined,
      borderWidth: undefined,
      borderRadius: undefined,
    });

    this.cardPixelSize = config.pixelSize ?? DEFAULT_CARD_PROPS.pixelSize;
    if (userContainerProps.width !== undefined)
      this.baseWidth = userContainerProps.width as number;
    if (userContainerProps.height !== undefined)
      this.baseHeight = userContainerProps.height as number;
    this.baseSizeX = config.sizeX ?? DEFAULT_CARD_PROPS.sizeX;
    this.baseSizeY = config.sizeY ?? DEFAULT_CARD_PROPS.sizeY;

    this.name = name || 'UICard';

    // Parse Anchors for position compensation.
    let ax = 0.5;
    let ay = 0.5;

    const rawAx = userContainerProps.anchorX ?? DEFAULT_CARD_PROPS.anchorX;
    const rawAy = userContainerProps.anchorY ?? DEFAULT_CARD_PROPS.anchorY;

    if (rawAx === 'left') ax = 0.0;
    else if (rawAx === 'right') ax = 1.0;
    else if (typeof rawAx === 'number') ax = rawAx;

    if (rawAy === 'bottom') ay = 0.0;
    else if (rawAy === 'top') ay = 1.0;
    else if (typeof rawAy === 'number') ay = rawAy;

    this.anchorX = ax;
    this.anchorY = ay;

    // Setup initial position (store base position before applying layout offsets).
    if (position) {
      this.basePosition = position.clone();
    } else {
      this.basePosition = new THREE.Vector3();
    }

    if (position) {
      this.position.copy(position);
    }
    if (rotation) {
      this.quaternion.copy(rotation);
    }

    if (visible !== undefined) {
      this.visible = visible;
    }

    if (behaviors) {
      behaviors.forEach((b) => this.addBehavior(b));
    }

    // Overwrite the raycast of the uikit to not return false.
    this.raycast = () => {};

    // Override intersection logic to correctly target the inner ManipulationLayer.
    // Use local cast to unknown here because bundled '@xrblocks' types might fit outdated interfaces.
    const ux = this.ux as unknown as UX;
    if (ux && ux.isRelevantIntersection) {
      ux.isRelevantIntersection = (intersection: THREE.Intersection) => {
        return (
          (intersection.object as ManipulationLayer) &&
          intersection.object.parent === this
        );
      };
    }
  }

  /**
   * Displays the card.
   * Triggers ToggleAnimationBehavior triggers if available; otherwise toggles `.visible` directly.
   */
  show() {
    // Check for ToggleAnimationBehavior (duck typing).
    const animBehavior = this.behaviors.find(
      (b) =>
        'playShow' in b &&
        typeof (b as {playShow?: () => void}).playShow === 'function'
    ) as (UICardBehavior & {playShow: () => void}) | undefined;
    if (animBehavior) {
      animBehavior.playShow();
    } else {
      this.visible = true;
    }
  }

  /**
   * Hides the card.
   * Triggers ToggleAnimationBehavior trigger if available; otherwise toggles `.visible` directly.
   */
  hide() {
    const animBehavior = this.behaviors.find(
      (b) =>
        'playHide' in b &&
        typeof (b as {playHide?: () => void}).playHide === 'function'
    ) as (UICardBehavior & {playHide: () => void}) | undefined;
    if (animBehavior) {
      animBehavior.playHide();
    } else {
      this.visible = false;
    }
  }

  /**
   * Toggles the card's visibility.
   * Defers to ToggleAnimationBehavior if present.
   */
  toggle() {
    const animBehavior = this.behaviors.find(
      (b) =>
        'toggle' in b &&
        typeof (b as {toggle?: () => void}).toggle === 'function'
    ) as (UICardBehavior & {toggle: () => void}) | undefined;
    if (animBehavior) {
      animBehavior.toggle();
    } else {
      if (this.visible) this.hide();
      else this.show();
    }
  }

  init(xrCoreInstance?: xb.Core) {
    super.init(xrCoreInstance);
  }

  /**
   * Attaches a behavior modifier to the card and triggers its setup cycle.
   */
  addBehavior(behavior: UICardBehavior) {
    this.behaviors.push(behavior);
    if (behavior.onAttach) behavior.onAttach(this);
    if (behavior.update) behavior.update();
  }

  /**
   * Detaches a behavior modifier and calls its disposal logic to release event hooks.
   */
  removeBehavior(behavior: UICardBehavior) {
    const index = this.behaviors.indexOf(behavior);
    if (index !== -1) {
      this.behaviors.splice(index, 1);
      if (behavior.dispose) behavior.dispose();
    }
  }

  update() {
    const time = xb.getDeltaTime();

    // Call XRUI mixin update.
    super.update();

    // Safely call Container.update if mixed in.
    if (Container.prototype['update']) {
      Container.prototype['update'].call(this, time);
    }

    for (const behavior of this.behaviors) {
      if (behavior.update) behavior.update();
    }
  }

  dispose() {
    for (const behavior of this.behaviors) {
      if (behavior.dispose) behavior.dispose();
    }
    this.behaviors = [];
    super.dispose();
  }
}
