import {
  BaseOutProperties,
  Image,
  ImageProperties,
  InProperties,
  RenderContext,
  WithSignal,
  abortableEffect,
} from '@pmndrs/uikit';
import {Signal} from '@preact/signals-core';
import {ColorRepresentation, MeshBasicMaterial, Texture} from 'three';
import {XRUI} from '../mixins/XRUI';

/**
 * Properties for initializing a UIImage.
 * Extends standard \@pmndrs/uikit ImageProperties with tint color overlays.
 */
export type UIImageProperties = ImageProperties & {
  /** Optional tint color overlay representation (HEX, CSS, or THREE.Color) */
  color?: ColorRepresentation | Signal<ColorRepresentation | undefined>;
};

export type UIImageSrc =
  | string
  | Texture
  | Signal<string | Texture | undefined>
  | undefined;

/**
 * UIImage
 * A wrapper component for rendering layout mapped static 2D images or textures.
 * Inherits from standard \@pmndrs/uikit `Image` and overrides updates to correctly sync responsive standard layouts over to internal basic map items properly.
 */
export class UIImage extends XRUI(Image) {
  name = 'UIImage';

  /**
   * Constructs a new UIImage.
   * Forces reactivity chains maintaining material transparencies against opacity changes via internal signals accurately.
   *
   * @param src - The visual source mapping (URL string, Texture, or Signal).
   * @param properties - Optional layout, sizing, and styling properties overriding defaults.
   * @param initialClasses - Optional styling class array identifiers for batch design applying rules.
   * @param config - Optional render contexts or template static mappings defaults triggers.
   */
  constructor(
    src: UIImageSrc,
    properties?: UIImageProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: UIImageProperties;
      defaults?: WithSignal<ImageProperties>;
    }
  ) {
    super(
      {
        src: src,
        ...properties,
      },
      initialClasses,
      // Use the `never` type to forcefully satisfy the strict generic parameter
      // requirements of the `\@pmndrs/uikit` primitive Image class constructor,
      // avoiding `any` overrides and TypeScript generic inference mismatches.
      config as never
    );

    // Force opacity and color on material.
    abortableEffect(() => {
      const {opacity, color} = this.properties.value;
      if (this.material) {
        if (opacity != null) {
          this.material.transparent = true;
          this.material.opacity = Number(opacity);
        }
        if (color != null) {
          const mat = this.material as MeshBasicMaterial;
          mat.color.set(
            color as unknown as Parameters<typeof mat.color.set>[0]
          );
        }
        this.material.needsUpdate = true;
      }
    }, this.abortSignal);
  }

  /** Updates the visual src binding (URL string or THREE.Texture). */
  setSrc(src: UIImageSrc) {
    this.setProperties({src});
  }

  /** Updates optional tint overlay color dynamically. */
  setColor(color: ColorRepresentation) {
    this.setProperties({color});
  }

  /** Updates image opacity (0.0 - 1.0) on underlying material setup. */
  setOpacity(opacity: number) {
    this.setProperties({opacity});
  }

  /** Updates edge corner curves of the bounding layout mapping setup. */
  setBorderRadius(borderRadius: number) {
    this.setProperties({borderRadius});
  }
}
