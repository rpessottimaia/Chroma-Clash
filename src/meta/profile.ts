import { DECK } from '../config';
import { STARTER_DECK, isCardId, type CardId } from '../core/cards';

/** What persists between sessions on this device: the player's deck and their record. */
export interface Profile {
  deck: CardId[];
  wins: number;
  losses: number;
  /** Highest rally speed reached, as a multiple of the starting speed. */
  bestSpeed: number;
}

const KEY = 'chroma-clash:profile:v1';

/** Keep only known, unique cards within the size limits; fall back to the starter deck. */
export function normalizeDeck(ids: readonly string[]): CardId[] {
  const deck = [...new Set(ids)].filter(isCardId).slice(0, DECK.max);
  return deck.length >= DECK.min ? deck : [...STARTER_DECK];
}

export function loadProfile(): Profile {
  const fresh: Profile = { deck: [...STARTER_DECK], wins: 0, losses: 0, bestSpeed: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      deck: normalizeDeck(Array.isArray(p.deck) ? p.deck : []),
      wins: Number(p.wins) || 0,
      losses: Number(p.losses) || 0,
      bestSpeed: Number(p.bestSpeed) || 0,
    };
  } catch {
    return fresh;
  }
}

export function saveProfile(p: Profile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage can be blocked (private mode); the deck just won't persist.
  }
}
