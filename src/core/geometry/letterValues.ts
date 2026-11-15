// Standard English Scrabble letter values (SPEC §2.1, §5.3 amendment).
export const SCRABBLE_LETTER_VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

// Accented letters use their base letter (first character after NFD); letters with no A–Z base (Ø, Æ) and punctuation get null.
export function letterValue(char: string): number | null {
  const base = char.toUpperCase().normalize("NFD").charAt(0);
  return Object.hasOwn(SCRABBLE_LETTER_VALUES, base) ? SCRABBLE_LETTER_VALUES[base]! : null;
}
