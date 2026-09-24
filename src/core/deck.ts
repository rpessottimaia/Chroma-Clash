import { CARDS, type Card, type CardId } from './cards';
import { DECK } from '../config';
import { shuffle, type Rng } from './rng';

/** A deck feeding a fixed number of power slots. Throwing spends the armed slot, which refills from the draw pile. */
export class Deck {
  readonly slots: CardId[] = [];
  armed = 0;
  private drawPile: CardId[];
  private discard: CardId[] = [];

  constructor(cards: CardId[], private readonly rng: Rng) {
    if (cards.length < DECK.slots) throw new Error(`A deck needs at least ${DECK.slots} cards`);
    this.drawPile = shuffle(cards, rng);
    for (let i = 0; i < DECK.slots; i++) this.slots.push(this.draw());
  }

  get armedCard(): Card {
    return CARDS[this.slots[this.armed]];
  }

  get drawCount(): number {
    return this.drawPile.length;
  }

  /** Cycle 1 -> 2 -> 3 -> 1. */
  cycle(): void {
    this.armed = (this.armed + 1) % this.slots.length;
  }

  arm(index: number): void {
    if (index >= 0 && index < this.slots.length) this.armed = index;
  }

  /** Spend the armed card and refill its slot from the deck. */
  spend(): Card {
    const id = this.slots[this.armed];
    this.discard.push(id);
    this.slots[this.armed] = this.draw();
    return CARDS[id];
  }

  private draw(): CardId {
    if (this.drawPile.length === 0) {
      this.drawPile = shuffle(this.discard, this.rng);
      this.discard = [];
    }
    return this.drawPile.pop()!;
  }
}
