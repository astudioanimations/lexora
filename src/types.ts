// ---- Lexora data contract ----
// Matches the validated level-pack.json produced by the build-time generator.

export type Orientation = "across" | "down" | "none";

export interface PlacedWord {
  answer: string;
  orientation: Orientation;
  startx: number; // 1-indexed column
  starty: number; // 1-indexed row
}

export interface LevelScore {
  placed: number;
  total: number;
  placementRate: number;
  connected: boolean;
  rows: number;
  cols: number;
  density: number;
}

export interface Level {
  tier: "easy" | "medium" | "hard";
  anchor: string;
  wheelLetters: string;   // sorted letters of the anchor
  gridWords: string[];    // words the player must place to clear the level
  bonusWords: string[];   // valid extra finds (pre-computed subset)
  score: LevelScore;
  rows: number;
  cols: number;
  table: string[][];      // rows x cols, "-" = empty
  words: PlacedWord[];    // placement of each gridWord
  levelNumber: number;
}

// Runtime cell model used by the board renderer.
export interface Cell {
  row: number;            // 0-indexed
  col: number;            // 0-indexed
  letter: string;         // the correct letter for this cell
  filled: boolean;        // has the player revealed it?
  wordIds: number[];      // indices into level.words that cross this cell
}
