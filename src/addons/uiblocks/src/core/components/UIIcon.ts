import {
  BaseOutProperties,
  InProperties,
  RenderContext,
  Svg,
  SvgOutProperties,
  WithSignal,
} from '@pmndrs/uikit';
import {computed, signal, Signal} from '@preact/signals-core';
import {ColorRepresentation} from 'three';
import {XRUI} from '../mixins/XRUI';

const SVG_BASE_PATH =
  'https://cdn.jsdelivr.net/gh/marella/material-symbols@v0.33.0/svg/{{weight}}/{{style}}/{{icon}}.svg';

function extractValue<T>(val: T | Signal<T> | undefined): T | undefined {
  if (val === undefined) return undefined;
  if (val instanceof Signal) return val.value;
  return val as T;
}

/**
 * Properties for initializing a UIIcon.
 * Extends standard `@pmndrs/uikit` SvgOutProperties with Material Symbols generation rules.
 */
export type UIIconOutProperties = SvgOutProperties & {
  /** The snake_case name of the Material Symbol icon (e.g., 'favorite', 'settings') */
  icon?: string;
  /** Font Weight override: standard increments 100-700 (standard is 400). Supports string representation as well. */
  iconWeight?: number | string;
  /** Font Style style override: 'outlined', 'rounded', 'sharp' */
  iconStyle?: string;
  /** Fill state override: 0 (unfilled) or 1 (filled) */
  iconFill?: number;
};

export type UIIconProperties = InProperties<UIIconOutProperties>;

/**
 * UIIcon
 * A reactive Material Symbol loader and renderer.
 * Automatically resolves `icon`, `iconStyle`, and `iconWeight` into structured CDN queries to fetch standard SVGs and mirrors them into `@pmndrs/uikit` Svg components.
 */
export class UIIcon extends XRUI(Svg)<SvgOutProperties> {
  name = 'UIIcon';

  private iconSignal: Signal<string | undefined>;
  private iconWeightSignal: Signal<number | string | undefined>;
  private iconStyleSignal: Signal<string | undefined>;
  private iconFillSignal: Signal<number | undefined>;

  /**
   * Constructs a new UIIcon.
   * Resolves static parameter states into reactive compute graph query paths dynamically on inputs.
   *
   * @param properties - Optional layout, sizing, and styling properties overriding defaults.
   * @param initialClasses - Optional styling class array identifiers for batch design applying rules.
   * @param config - Optional render contexts and template static defaults mappings.
   */
  constructor(
    icon: string | Signal<string | undefined>,
    properties?: UIIconProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: UIIconProperties;
      defaults?: WithSignal<UIIconOutProperties>;
    }
  ) {
    // Extract initial values into reactive Preact signal vertices.
    // Facilitates dynamic URL formatting queries strictly bound onto computed string updates.
    const iconSignal = signal(
      extractValue(icon ?? properties?.icon ?? config?.defaultOverrides?.icon)
    );
    const styleSignal = signal(
      extractValue(properties?.iconStyle ?? config?.defaultOverrides?.iconStyle)
    );
    const weightSignal = signal(
      extractValue(
        properties?.iconWeight ?? config?.defaultOverrides?.iconWeight
      )
    );
    const fillSignal = signal(
      extractValue(properties?.iconFill ?? config?.defaultOverrides?.iconFill)
    ) as Signal<number | undefined>;

    // Compute SVG CDN query string formatting dynamically from binding graph vertices triggers.
    const svgPath = computed(() => {
      let finalIcon = iconSignal.value ?? 'question_mark';
      const finalStyle = styleSignal.value ?? 'outlined';
      const finalWeight = weightSignal.value ?? 400;
      const finalFill = fillSignal.value ?? 0;

      if (finalFill === 1) {
        finalIcon += '-fill';
      }

      return SVG_BASE_PATH.replace('{{style}}', finalStyle)
        .replace('{{icon}}', finalIcon)
        .replace('{{weight}}', String(finalWeight));
    });

    // Pass the context and bindings directly into the SVG super constructor.
    // Overrides 'src' parameter to feed directly using computed ReadonlySignal passing to Svg tree.
    super(properties, initialClasses, {
      ...config,
      defaultOverrides: {
        src: svgPath,
        ...config?.defaultOverrides,
      },
    });

    this.iconSignal = iconSignal;
    this.iconStyleSignal = styleSignal;
    this.iconWeightSignal = weightSignal;
    this.iconFillSignal = fillSignal;
  }

  /** Updates the Material Symbol string lookup (e.g., 'home'). */
  setIcon(icon: string) {
    this.iconSignal.value = icon;
  }

  /** Updates font style ('outlined', 'rounded', 'sharp'). */
  setIconStyle(style: string) {
    this.iconStyleSignal.value = style;
  }

  /** Updates weight (e.g., 100, 400, 700). */
  setIconWeight(weight: number | string) {
    this.iconWeightSignal.value = weight;
  }

  /** Updates fill state (0 or 1). */
  setIconFill(fill: number) {
    this.iconFillSignal.value = fill;
  }

  /** Updates optional tint overlay color dynamically. */
  setColor(color: ColorRepresentation) {
    this.setProperties({color});
  }

  /** Updates optional tint overlay color dynamically. */
  setOpacity(opacity: number) {
    this.setProperties({opacity});
  }

  /**
   * Overridden updater pushing updates correctly into underlying Preact signals that structure query generators dynamically.
   */
  setProperties(props: UIIconProperties) {
    super.setProperties(props);
    if (props.icon !== undefined)
      this.iconSignal.value = extractValue(props.icon) as string | undefined;
    if (props.iconStyle !== undefined)
      this.iconStyleSignal.value = extractValue(props.iconStyle) as
        | string
        | undefined;
    if (props.iconWeight !== undefined)
      this.iconWeightSignal.value = extractValue(props.iconWeight) as
        | number
        | string
        | undefined;
    if (props.iconFill !== undefined)
      this.iconFillSignal.value = extractValue(props.iconFill) as
        | number
        | undefined;
  }
}
