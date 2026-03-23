import {InProperties, RenderContext, WithSignal} from '@pmndrs/uikit';
import {effect} from '@preact/signals-core';
import * as THREE from 'three';
import {ManipulationPanelFragmentShader} from '../../shaders/ManipulationPanel.frag';
import {
  createManipulationUniforms,
  updateManipulationUniforms,
} from '../../utils/ManipulationPanelUtils';
import {
  PanelLayer,
  PanelLayerProperties,
  PanelShaderMaterial,
  SignalProperties,
  WritableSignalProperties,
} from './PanelLayer';

/**
 * Properties for configuring a ManipulationLayer.
 * These map directly to uniforms used by ManipulationPanelFragmentShader.
 */
export type ManipulationLayerProperties = PanelLayerProperties & {
  /** Margin for the manipulation bounding box frame expansion (usually for edge rendering, shadow casting safety, etc.) */
  u_manipulation_margin?: number;
  /** Corner radius of the selection frame. */
  u_manipulation_corner_radius?: number;
  /** Spotlight color overlay usually triggered on focus or cursor hover. */
  u_cursor_spotlight_color?: THREE.ColorRepresentation;

  /** Width of the selection edge highlight. */
  u_manipulation_edge_width?: number;
  /** Color of the selection edge highlight. */
  u_manipulation_edge_color?: THREE.ColorRepresentation;

  // Dynamic
  /** UV coordinate of the primary cursor. */
  u_cursor_uv?: THREE.Vector2;
  /** Intensity/toggle for primary cursor spotlight glow effect. */
  u_show_glow?: number;
  /** UV coordinate of the secondary cursor. */
  u_cursor_uv_2?: THREE.Vector2;
  /** Intensity/toggle for secondary cursor spotlight glow effect. */
  u_show_glow_2?: number;
  /** Debug flag to visualize bounds. */
  u_debug?: number;

  /** Radius of the spotlight in pixels. */
  u_cursor_radius?: number; // Pixels
  /** Blur radius of the spotlight in pixels. */
  u_cursor_spotlight_blur?: number; // Pixels
};

/**
 * Layer responsible for rendering interactive manipulation effects.
 * Includes cursor spotlights and edge selection highlights.
 */
export class ManipulationLayer extends PanelLayer<ManipulationLayerProperties> {
  name = 'ManipulationLayer';

  constructor(
    inputProperties: InProperties<ManipulationLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<ManipulationLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<ManipulationLayerProperties>;
      defaults?: WithSignal<ManipulationLayerProperties>;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: ManipulationPanelFragmentShader,
      uniforms: {
        ...createManipulationUniforms(),
      },
    });

    super(material, inputProperties, initialClasses, {
      ...config,
      defaultOverrides: {
        positionType: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 'auto',
        height: 'auto',
        ...config.defaultOverrides,
      } as InProperties<ManipulationLayerProperties>,
    });

    // Sync Signals to Uniforms.
    // This effect runs whenever any of the bound properties change on the component,
    // translating them into updated float/vec/color values in the material uniforms.
    effect(() => {
      const signalProps = (
        this.properties as unknown as {
          signal: SignalProperties<ManipulationLayerProperties>;
        }
      ).signal;
      updateManipulationUniforms(this.material.uniforms, {
        u_manipulation_margin: signalProps.u_manipulation_margin?.value,
        u_manipulation_corner_radius:
          signalProps.u_manipulation_corner_radius?.value,
        u_manipulation_edge_width: signalProps.u_manipulation_edge_width?.value,
        u_manipulation_edge_color: signalProps.u_manipulation_edge_color?.value,
        u_cursor_spotlight_color: signalProps.u_cursor_spotlight_color?.value,
        u_cursor_radius: signalProps.u_cursor_radius?.value,
        u_cursor_spotlight_blur: signalProps.u_cursor_spotlight_blur?.value,
        u_debug: signalProps.u_debug?.value,
        u_cursor_uv: signalProps.u_cursor_uv?.value,
        u_show_glow: signalProps.u_show_glow?.value,
        u_cursor_uv_2: signalProps.u_cursor_uv_2?.value,
        u_show_glow_2: signalProps.u_show_glow_2?.value,
      });
    });
  }

  updateCursor(uv: THREE.Vector2 | null, index: number = 0) {
    const signalProps = (
      this.properties as unknown as {
        signal: WritableSignalProperties<ManipulationLayerProperties>;
      }
    ).signal;
    if (index === 0) {
      if (signalProps.u_cursor_uv)
        signalProps.u_cursor_uv.value = uv ?? undefined;
      if (signalProps.u_show_glow)
        signalProps.u_show_glow.value = uv ? 1.0 : 0.0;
    } else if (index === 1) {
      if (signalProps.u_cursor_uv_2)
        signalProps.u_cursor_uv_2.value = uv ?? undefined;
      if (signalProps.u_show_glow_2)
        signalProps.u_show_glow_2.value = uv ? 1.0 : 0.0;
    }
  }
}
