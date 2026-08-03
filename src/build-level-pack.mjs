import fs from "node:fs";
import clg from "crossword-layout-generator";

console.log = () => {}; // silence library's internal debug chatter

// ============================================================
// 1. Word source: frequency list + real dictionary + blocklists
// ============================================================
const freqRaw = fs.readFileSync("data/en_50k.txt", "utf8").split("\n").filter(Boolean);
const realWords = new Set(
  fs.readFileSync("node_modules/word-list/words.txt", "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean)
);
const profanity = new Set(
  fs.readFileSync("data/profanity.txt", "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter((w) => w && !w.includes(" "))
);

// ---- Names blocklist (GENERATION-TIME filter) ---------------------------------
// Applied inside isCleanWord(), so a blocked name is never eligible as an
// anchor/grid/bonus word. Because it filters BEFORE layout, it can NEVER break a
// crossword — unlike subtracting names from a finished pack (which was shown to
// over-filter and orphan grid words). The only cost of over-blocking here is
// losing a token that is both a name and a common word (e.g. rose, grace); for
// v1 that trade is fine.
//
// v1.1 changes vs. the original list:
//   * Added the 4 confirmed leaks: eric, vera, noah, han (were missing).
//   * Added a focused set of name-dominant tokens.
//   * Made it loadable from data/names.txt so a real dataset (e.g. SSA + ONS
//     given names, lowercased) can be dropped in without editing this file.
const INLINE_NAMES = `
ali ana anna anne ben bree cal dan dave don eli emma erin eve gia hank hong ivan jack
jake jan jen joe jon josh kate leo liam lisa liv lou lucy mark matt mel mia mike nan
nick nico nina paul pete rob rome roy sam sara sean tina tito tom tony
eric vera noah han alec saul theo juan jose pedro oscar owen aaron ellen brian kevin
jason gary larry barry jenny cindy betty kathy peggy sally harry jerry terry beth noel
enzo otto vince walt carl fred greg keith neil dean dale glen todd chad brett cody kurt
`;
let namesSrc = INLINE_NAMES;
try {
  namesSrc += "\n" + fs.readFileSync("data/names.txt", "utf8"); // optional real dataset
  console.error("Loaded additional names from data/names.txt");
} catch { /* optional file — inline list is fine on its own */ }
const NAMES = new Set(namesSrc.trim().split(/\s+/).map((w) => w.toLowerCase()).filter(Boolean));

// Interjections/fillers that legitimately appear in broad dictionaries but make poor
// puzzle words (erm, ooh, huh...).
const INTERJECTIONS = new Set(`
erm umm uhh hmm ooh aah huh eek ugh meh yep nah nope duh wow gah argh
`.trim().split(/\s+/));

function isCleanWord(w) {
  return /^[a-z]+$/.test(w) && w.length >= 3 && w.length <= 8 &&
    realWords.has(w) && !profanity.has(w) && !NAMES.has(w) && !INTERJECTIONS.has(w);
}

const seen = new Set();
const dictOrdered = [];
for (const line of freqRaw) {
  const [word] = line.split(" ");
  if (!word) continue;
  const w = word.toLowerCase();
  if (isCleanWord(w) && !seen.has(w)) { seen.add(w); dictOrdered.push(w); }
}
console.error(`Clean frequency-ordered dictionary: ${dictOrdered.length} words`);

function letterCounts(word) {
  const c = {};
  for (const ch of word) c[ch] = (c[ch] || 0) + 1;
  return c;
}
const dictWithBags = dictOrdered.map((w, i) => ({ word: w, bag: letterCounts(w), rank: i }));

function isSubBag(wordBag, containerBag) {
  for (const ch in wordBag) if ((containerBag[ch] || 0) < wordBag[ch]) return false;
  return true;
}

// ============================================================
// 2. Difficulty tiers — early levels common/short, later rarer/longer
//    v1.1: scaled to 300 launch levels (was 170 = 50/60/60).
//    Rank-window upper bounds widened modestly to keep comfortable candidate
//    headroom at the higher level counts; low-end (the tier "floor") preserved.
// ============================================================
const TIERS = [
  { name: "intro",  anchorLen: [6, 6], rankWindow: [100, 1200],  poolSize: 6,  levels: 20 },
  { name: "easy",   anchorLen: [6, 6], rankWindow: [150, 2200],  poolSize: 8,  levels: 40 },
  { name: "rising", anchorLen: [6, 7], rankWindow: [500, 3500],  poolSize: 10, levels: 55 },
  { name: "medium", anchorLen: [7, 7], rankWindow: [900, 5000],  poolSize: 11, levels: 65 },
  { name: "hard",   anchorLen: [7, 8], rankWindow: [2000, 8000], poolSize: 13, levels: 60 },
  { name: "expert", anchorLen: [8, 8], rankWindow: [3000, 12000],poolSize: 14, levels: 60 },
];

const commonPool = dictWithBags.slice(0, 12000); // matching pool: common enough to be fair grid words

function findMatches(bag, anchorWord) {
  const matches = [];
  for (const cand of commonPool) {
    if (cand.word === anchorWord) continue;
    if (isSubBag(cand.bag, bag)) matches.push(cand);
  }
  return matches.sort((a, b) => a.rank - b.rank);
}

// ============================================================
// 3. Layout scoring + trimming
// ============================================================
function scoreLayout(layout, wordsIn) {
  const placed = layout.result.filter((r) => r.orientation !== "none");
  const placementRate = placed.length / wordsIn.length;
  const cellOwner = new Map();
  const parent = placed.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  placed.forEach((w, idx) => {
    let x = w.startx, y = w.starty;
    for (let k = 0; k < w.answer.length; k++) {
      const key = `${x},${y}`;
      if (cellOwner.has(key)) union(idx, cellOwner.get(key));
      else cellOwner.set(key, idx);
      if (w.orientation === "across") x++; else y++;
    }
  });
  const connected = placed.length > 0 && new Set(placed.map((_, i) => find(i))).size === 1;
  const gridArea = layout.rows * layout.cols;
  const density = gridArea > 0 ? cellOwner.size / gridArea : 0;
  return { placed: placed.length, total: wordsIn.length, placementRate, connected, rows: layout.rows, cols: layout.cols, density };
}

// trim fully-blank border rows/cols from table + rebase word coordinates
function trimLayout(layout) {
  const table = layout.table;
  const isBlank = (c) => c === "" || c === "-";
  const rows = table.length, cols = table[0].length;
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1;
  const rowBlank = (r) => table[r].every(isBlank);
  const colBlank = (c) => table.every((row) => isBlank(row[c]));
  while (top <= bottom && rowBlank(top)) top++;
  while (bottom >= top && rowBlank(bottom)) bottom--;
  while (left <= right && colBlank(left)) left++;
  while (right >= left && colBlank(right)) right--;
  const newTable = table.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
  const words = layout.result
    .filter((r) => r.orientation !== "none")
    .map((r) => ({ answer: r.answer, orientation: r.orientation, startx: r.startx - left, starty: r.starty - top }));
  return { rows: newTable.length, cols: newTable[0].length, table: newTable, words };
}

// ============================================================
// 4. Generate-many-keep-best: try a few input-order permutations per anchor
//    (the generator is deterministic per input order, but order-sensitive —
//    confirmed empirically before writing this).
// ============================================================
function shuffled(arr, seed) {
  const a = [...arr];
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bestLayoutForAnchor(anchor, poolSize, attempts = 4) {
  const matches = findMatches(anchor.bag, anchor.word);
  if (matches.length < Math.max(4, poolSize - 4)) return null; // not enough derivable words
  const gridWordsFull = [anchor, ...matches].slice(0, poolSize);
  const bonusWords = matches.filter((m) => !gridWordsFull.includes(m));
  let best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = attempt === 0 ? gridWordsFull : shuffled(gridWordsFull, attempt * 7919 + gridWordsFull.length);
    const input = order.map((w) => ({ clue: "", answer: w.word }));
    let layout;
    try { layout = clg.generateLayout(input); } catch (e) { continue; }
    const score = scoreLayout(layout, input);
    if (score.placementRate < 1.0 || !score.connected) continue; // strict bar, per findings.md
    if (!best || score.density > best.score.density) best = { layout, score };
  }
  if (!best) return null;
  const trimmed = trimLayout(best.layout);
  return { anchor: anchor.word, wheelLetters: anchor.word.split("").sort().join(""), gridWords: gridWordsFull.map((w) => w.word), bonusWords: bonusWords.map((w) => w.word), score: best.score, ...trimmed };
}

// ============================================================
// 5. Build the level pack, tier by tier
// ============================================================
const levelPack = [];
const usedAnchors = new Set();
const tierStats = [];

for (const tier of TIERS) {
  const candidates = dictWithBags.filter(
    (d) => d.word.length >= tier.anchorLen[0] && d.word.length <= tier.anchorLen[1] &&
           d.rank >= tier.rankWindow[0] && d.rank <= tier.rankWindow[1] && !usedAnchors.has(d.word)
  );
  let produced = 0, scanned = 0;
  for (const anchor of candidates) {
    if (produced >= tier.levels) break;
    scanned++;
    const lvl = bestLayoutForAnchor(anchor, tier.poolSize);
    if (!lvl) continue;
    usedAnchors.add(anchor.word);
    levelPack.push({ tier: tier.name, ...lvl });
    produced++;
  }
  tierStats.push({ tier: tier.name, target: tier.levels, produced, scanned, candidatePoolSize: candidates.length });
  console.error(`Tier ${tier.name}: produced ${produced}/${tier.levels} (scanned ${scanned}/${candidates.length} candidates)`);
}

levelPack.forEach((lvl, i) => { lvl.levelNumber = i + 1; });

fs.mkdirSync("output", { recursive: true });
fs.writeFileSync("output/level-pack.json", JSON.stringify(levelPack, null, 2));
fs.writeFileSync("output/tier-stats.json", JSON.stringify(tierStats, null, 2));
console.error(`\nTotal levels produced: ${levelPack.length}`);
console.error("Wrote output/level-pack.json and output/tier-stats.json");
