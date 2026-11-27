// Disables each guard in src/plan.ts in turn and confirms the tests go red.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FILE = new URL("../src/plan.ts", import.meta.url);
const original = readFileSync(FILE, "utf8");

const probes = [
  ["transparent is paper", "out[i] = l * a + 255 * (1 - a);", "out[i] = l;"],
  ["blur clamps at edges", "const c = Math.min(len - 1, Math.max(0, i));", "const c = Math.max(0, i);"],
  ["only dark side is a line", "small[i]! - large[i]! < -threshold ? 1 : 0", "Math.abs(small[i]! - large[i]!) > -threshold ? 1 : 0"],
  ["specks are removed", "if (blob.length < minSize) {", "if (false) {"],
  ["diagonals join", "for (let dx = -1; dx <= 1; dx++) {", "for (let dx = 0; dx <= 0; dx++) {"],
  ["work size is capped", "if (long <= WORK_EDGE) return", "if (true) return"],
  ["bad detail falls back", "return table[d] ?? table[3];", "return table[d];"],
  ["page turns for landscape", "picture.width > picture.height ?", "false ?"],
  ["picture fits inside margins", "const k = Math.min(boxW / picture.width, boxH / picture.height);", "const k = Math.max(boxW / picture.width, boxH / picture.height);"],
  ["megapixel ceiling", "megapixels(s) > MAX_MEGAPIXELS", "false"],
];

let bad = 0;
try {
  for (const [name, from, to] of probes) {
    const n = original.split(from).length - 1;
    if (n !== 1) throw new Error(`${name}: anchor matched ${n} times`);
    writeFileSync(FILE, original.replace(from, to));
    let red = false;
    try {
      execSync("npx vitest run", { stdio: "ignore", timeout: 120000 });
    } catch {
      red = true;
    }
    console.log(`${red ? "red  " : "GREEN"}  ${name}`);
    if (!red) bad++;
  }
} finally {
  writeFileSync(FILE, original);
}
if (bad) {
  console.error(`${bad} guard(s) not covered`);
  process.exit(1);
}
console.log("every guard is covered");
