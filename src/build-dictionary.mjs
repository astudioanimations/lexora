import fs from "node:fs";

// Rebuild the runtime bonus-word dictionary from a generated level pack.
// Collects every grid + bonus word, dedupes, keeps 3+ letters, sorts, writes
// one word per line. Run AFTER build-level-pack.mjs.
//
//   node build-dictionary.mjs                       # defaults below
//   node build-dictionary.mjs output/level-pack.json ../Lexora/public/dictionary.txt

const inPath = process.argv[2] || "output/level-pack.json";
const outPath = process.argv[3] || "output/dictionary.txt";

const pack = JSON.parse(fs.readFileSync(inPath, "utf8"));
const words = new Set();
for (const lvl of pack) {
  for (const w of [...(lvl.gridWords || []), ...(lvl.bonusWords || [])]) {
    const x = String(w).toLowerCase();
    if (x.length >= 3) words.add(x);
  }
}
const sorted = [...words].sort();
fs.writeFileSync(outPath, sorted.join("\n") + "\n");
console.error(`Wrote ${sorted.length} words -> ${outPath}`);
