import {UICard} from '../components/UICard';

/**
 * UICardBehavior
 * Abstract base class for attaching executable layout or spatial modifier logics to a `UICard`.
 * Offers lifecycles for attaching, on-frame ticks updates, and disposes.
 */
export abstract class UICardBehavior<T = unknown> {
  protected card: UICard | null = null;
  protected properties: T;

  constructor(properties: T = {} as T) {
    this.properties = properties;
  }

  /**
   * Called when the behavior is attached to the card.
   */
  onAttach(card: UICard) {
    this.card = card;
  }

  /**
   * Called every frame.
   */
  abstract update(): void;

  /**
   * Cleanup.
   */
  dispose(): void {}
}
