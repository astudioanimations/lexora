import fs from "node:fs";
import wordListPath from "word-list";

// ============================================================
// Lexora — real curated RUNTIME dictionary builder
// ------------------------------------------------------------
// Produces public/dictionary.txt: the broad, curated word set the client uses
// to validate bonus words a player swipes that aren't in a level's pre-computed
// list. This WIDENS bonus-word discovery well beyond the ~2,700-word pack-derived
// starter.
//
// Correctness scoping (why this stays compact):
//   * A wheel holds the sorted letters of a 6-8 letter anchor, so any formable
//     word is 3-8 letters. Words <3 or >8 can NEVER be submitted → excluded.
//   * That single constraint shrinks a ~275k-word list to a tight, relevant set.
//
// Curation filters (same spirit as the level generator):
//   * lowercase a-z only, length 3-8
//   * minus profanity  (data/profanity.txt)
//   * minus names      (inline list + optional data/names.txt)
//   * UNION with every grid+bonus word already in the pack, so nothing that can
//     legitimately appear on a board is ever rejected as a bonus find.
//
// Run from the Lexora project root:
//   node src/build-runtime-dictionary.mjs
//   (optional) node src/build-runtime-dictionary.mjs public/level-pack.json public/dictionary.txt
// ============================================================

const packPath = process.argv[2] || "public/level-pack.json";
const outPath  = process.argv[3] || "public/dictionary.txt";

// ---- load the base English word list (from the installed word-list package) ----
const base = fs.readFileSync(wordListPath, "utf8")
  .split("\n").map((w) => w.trim().toLowerCase());

// ---- profanity ----
let profanity = new Set();
try {
  profanity = new Set(
    fs.readFileSync("data/profanity.txt", "utf8")
      .split("\n").map((w) => w.trim().toLowerCase()).filter((w) => w && !w.includes(" "))
  );
} catch { console.error("! data/profanity.txt not found — skipping profanity filter"); }

// ---- names (inline + optional dataset) ----
const INLINE_NAMES = `
ali ana anna anne ben bree cal dan dave don eli emma erin eve gia hank hong ivan jack
jake jan jen joe jon josh kate leo liam lisa liv lou lucy mark matt mel mia mike nan
nick nico nina paul pete rob rome roy sam sara sean tina tito tom tony
eric vera noah han alec saul theo juan jose pedro oscar owen aaron ellen brian kevin
jason gary larry barry jenny cindy betty kathy peggy sally harry jerry terry beth noel
enzo otto vince walt carl fred greg keith neil dean dale glen todd chad brett cody kurt
`;
let namesSrc = INLINE_NAMES;
try { namesSrc += "\n" + fs.readFileSync("data/names.txt", "utf8"); } catch { /* optional */ }
const names = new Set(namesSrc.trim().split(/\s+/).map((w) => w.toLowerCase()).filter(Boolean));

// ---- filter ----
const isAlpha = (w) => /^[a-z]+$/.test(w);
const dict = new Set();
for (const w of base) {
  if (w.length < 3 || w.length > 8) continue;
  if (!isAlpha(w)) continue;
  if (profanity.has(w) || names.has(w)) continue;
  dict.add(w);
}
const afterFilter = dict.size;

// ---- union with everything already in the shipped pack ----
let packAdded = 0;
try {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  for (const lvl of pack) {
    for (const w of [...(lvl.gridWords || []), ...(lvl.bonusWords || [])]) {
      const x = String(w).toLowerCase();
      if (x.length >= 3 && x.length <= 8 && !dict.has(x)) { dict.add(x); packAdded++; }
    }
  }
} catch { console.error(`! ${packPath} not found — writing dictionary without pack union`); }

// ---- write ----
const sorted = [...dict].sort();
fs.writeFileSync(outPath, sorted.join("\n") + "\n");

const bytes = fs.statSync(outPath).size;
console.error(`word-list base entries           : ${base.length}`);
console.error(`after length/alpha/profanity/name: ${afterFilter}`);
console.error(`+ pack words not already present : ${packAdded}`);
console.error(`TOTAL runtime dictionary words   : ${sorted.length}`);
console.error(`wrote ${outPath} (${(bytes/1024).toFixed(0)} KB uncompressed; Cloudflare gzips on the wire)`);
