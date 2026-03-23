import {Signal, signal} from '@preact/signals-core';
import * as THREE from 'three';
import {ShaderPanel, ShaderPanelProperties} from './ShaderPanel';
import {ManipulationLayer} from './layers/ManipulationLayer';

/**
 * Properties for configuring a ManipulationPanel.
 */
export type ManipulationPanelProperties = ShaderPanelProperties & {
  /** Radius of the cursor spotlight effect. */
  cursorRadius?: number;
  /** Color of the cursor spotlight. */
  cursorSpotlightColor?: THREE.ColorRepresentation;
  /** Blurring radius of the cursor spotlight. */
  cursorSpotlightBlur?: number;
  /** Margin for the manipulation area. */
  manipulationMargin?: number;
  /** Corner radius for the manipulation area. */
  manipulationCornerRadius?: number;
  /** Width of the manipulation edge/border. */
  manipulationEdgeWidth?: number;
  /** Color of the manipulation edge/border. */
  manipulationEdgeColor?: THREE.ColorRepresentation;
  /** Enable debug rendering. */
  debug?: boolean;
};

/**
 * A panel that renders interactive manipulation effects like cursor spotlights and edge highlights.
 * It uses a `ManipulationLayer` to draw these effects using custom shaders.
 */
export class ManipulationPanel extends ShaderPanel<ManipulationPanelProperties> {
  name = 'ManipulationPanel';

  /** The layer responsible for rendering the manipulation shader. */
  protected manipulationLayer: ManipulationLayer;

  // Internal signals storing property values to trigger shader updates on change.
  private readonly _cursorRadius: Signal<number | undefined>;
  private readonly _cursorSpotlightColor: Signal<
    THREE.ColorRepresentation | undefined
  >;
  private readonly _cursorSpotlightBlur: Signal<number | undefined>;
  private readonly _manipulationMargin: Signal<number | undefined>;
  private readonly _manipulationCornerRadius: Signal<number | undefined>;
  private readonly _manipulationEdgeWidth: Signal<number | undefined>;
  private readonly _manipulationEdgeColor: Signal<
    THREE.ColorRepresentation | undefined
  >;
  private readonly _debug: Signal<number | undefined>;

  // Dynamic signals for live cursor tracking (supports up to 2 cursors).
  private readonly _cursorUV = signal<THREE.Vector2 | undefined>(undefined);
  private readonly _showGlow = signal<number>(0);
  private readonly _cursorUV2 = signal<THREE.Vector2 | undefined>(undefined);
  private readonly _showGlow2 = signal<number>(0);

  constructor(properties: ManipulationPanelProperties) {
    super(properties);

    this._cursorRadius = signal(properties.cursorRadius);
    this._cursorSpotlightColor = signal(properties.cursorSpotlightColor);
    this._cursorSpotlightBlur = signal(properties.cursorSpotlightBlur);
    this._manipulationMargin = signal(properties.manipulationMargin);
    this._manipulationCornerRadius = signal(
      properties.manipulationCornerRadius
    );
    this._manipulationEdgeWidth = signal(properties.manipulationEdgeWidth);
    this._manipulationEdgeColor = signal(properties.manipulationEdgeColor);
    this._debug = signal(properties.debug ? 1.0 : 0.0);

    this.manipulationLayer = new ManipulationLayer({
      u_manipulation_margin: this._manipulationMargin,
      u_manipulation_corner_radius: this._manipulationCornerRadius,
      u_cursor_spotlight_color: this._cursorSpotlightColor,
      u_cursor_radius: this._cursorRadius,
      u_cursor_spotlight_blur: this._cursorSpotlightBlur,
      u_manipulation_edge_width: this._manipulationEdgeWidth,
      u_manipulation_edge_color: this._manipulationEdgeColor,
      u_debug: this._debug,
      u_cursor_uv: this._cursorUV,
      u_show_glow: this._showGlow,
      u_cursor_uv_2: this._cursorUV2,
      u_show_glow_2: this._showGlow2,
    });

    this.addLayer(this.manipulationLayer);
    this.manipulationLayer.setProperties({
      zIndexOffset: -20,
    });
  }

  /**
   * Updates the cursor position and visibility.
   * @param uv - The UV coordinates of the cursor, or null to hide.
   * @param index - The cursor index (0 or 1).
   */
  setCursor(uv: THREE.Vector2 | null, index: number = 0) {
    this.manipulationLayer.updateCursor(uv, index);
  }

  /** Sets the margin for the manipulation area. */
  setManipulationMargin(value: number) {
    this._manipulationMargin.value = value;
  }

  /** Sets the corner radius for the manipulation area. */
  setManipulationCornerRadius(value: number) {
    this._manipulationCornerRadius.value = value;
  }

  /** Sets the color of the cursor spotlight. */
  setCursorSpotlightColor(value: THREE.ColorRepresentation) {
    this._cursorSpotlightColor.value = value;
  }

  /** Sets the blurring radius of the cursor spotlight. */
  setCursorSpotlightBlur(value: number) {
    this._cursorSpotlightBlur.value = value;
  }

  /** Sets the radius of the cursor spotlight effect. */
  setCursorRadius(value: number) {
    this._cursorRadius.value = value;
  }

  /** Sets the width of the manipulation edge highlight. */
  setManipulationEdgeWidth(value: number) {
    this._manipulationEdgeWidth.value = value;
  }

  /** Sets the color of the manipulation edge highlight. */
  setManipulationEdgeColor(value: THREE.ColorRepresentation) {
    this._manipulationEdgeColor.value = value;
  }
}
