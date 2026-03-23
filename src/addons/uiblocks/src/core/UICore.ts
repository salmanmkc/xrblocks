import * as xb from 'xrblocks';
import {AdditiveUICard} from './components/additive/AdditiveUICard';
import {UICard, UICardOutProperties} from './components/UICard';

/**
 * UICore: The central entry point for the UI system.
 * Manages the lifecycle of UICards.
 */
export class UICore {
  private _cards: UICard[] = [];
  private _root: xb.Script;

  /**
   * @param root - The xrblocks Script to attach UI components to.
   */
  constructor(root: xb.Script) {
    this._root = root;
  }

  /**
   * Creates and registers a new UICard.
   * @param config - The configuration for the new card.
   * @returns The created UICard instance.
   */
  createCard(config: UICardOutProperties): UICard {
    const card = new UICard(config);
    this.register(card);
    // Auto-add to root
    if (this._root && this._root.add) {
      this._root.add(card);
    }
    return card;
  }

  /**
   * Creates and registers a new AdditiveUICard.
   * @param config - The configuration for the new card.
   * @returns The created AdditiveUICard instance.
   */
  createAdditiveCard(config: UICardOutProperties): AdditiveUICard {
    const card = new AdditiveUICard(config);
    this.register(card);
    // Auto-add to root
    if (this._root && this._root.add) {
      this._root.add(card);
    }
    return card;
  }

  /**
   * Register an existing card to be managed.
   * @param card - The card to register.
   */
  register(card: UICard) {
    if (!this._cards.includes(card)) {
      this._cards.push(card);
    }
  }

  /**
   * Unregister and dispose a specific card.
   * @param card - The card to remove.
   */
  unregister(card: UICard) {
    const index = this._cards.indexOf(card);
    if (index > -1) {
      this._cards.splice(index, 1);
      // Auto-remove from root
      if (this._root && this._root.remove) {
        this._root.remove(card);
      }
      if (card.dispose) card.dispose();
    }
  }

  /**
   * Clear all managed cards.
   */
  clear() {
    const cardsToClear = [...this._cards];
    for (const card of cardsToClear) {
      // Auto-remove from root
      if (this._root && this._root.remove) {
        this._root.remove(card);
      }
      if (card.dispose) card.dispose();
    }
    this._cards = [];
  }

  /**
   * Dispose all.
   */
  dispose() {
    this.clear();
  }

  get cards(): ReadonlyArray<UICard> {
    return this._cards;
  }
}
