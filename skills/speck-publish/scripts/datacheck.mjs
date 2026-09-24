#!/usr/bin/env node
// datacheck.mjs: is there real data in the artifacts?
//
//   node datacheck.mjs <artifact-dir> [repo-root]
//
// Three things, and only these:
//   contact   emails, phone numbers, street addresses, coordinates. Must not appear. Exit 1.
//   prodfile  files in the repo whose names say production data. Schema fine, rows not. Listed.
//   ask       person-name candidates and money-shaped values. Questions for the author, exit 0.
//
// It does not care about labels, microcopy or screen structure: those are the interface and they
// belong in the prototype. A prompt for judgment, not a gate.
import { readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";

const TEXT = new Set([".md", ".txt", ".html", ".css", ".js", ".mjs", ".json"]);
const PROD = /(^|\/)(dump|backup|backups|prod|production|export|exports|snapshot)s?[-_./]|\.(dump|bak)$|(^|\/)[^/]*-(export|dump|backup|prod)\.[a-z]+$|\.(sqlite3?|db)$/i;
const MONEY = /(?<![\w.])(?:[$£€¥]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\.\d{2}\s?(?:USD|EUR|GBP|CAD|AUD)|\d[\d.]*(?:,\d{2})?\s?[€£$¥])(?![\w])/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;
const PHONE = /(?<![\d-])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\d])/g;
const ADDRESS = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/g;
const LATLON = /(?<![\w.])-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}(?![\w.])/g;
// A capitalised word used as a person: after "by", "from", "with", "and"; alone between tags; or as
// a name-shaped JSON value. Case-sensitive on the name so ALL-CAPS labels and CamelCase stay out.
const NAME = /(?:\b(?:by|from|with|and|By|From|With|And)\s+([A-Z][a-z]{2,11})\b)|(?:>\s*([A-Z][a-z]{2,11})\s*<)|(?:"(?:name|author|user|member|kid|child|person)"\s*:\s*"([A-Z][a-z]{2,11})")/g;
const STOP = new Set(`today tonight yesterday tomorrow monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december delivery cooking dinner lunch breakfast settings history nothing loading prototype download default open close save cancel delete remove change edit view show hide start about after before the this that these those there their them then they each every both some any one two three four five six seven eight nine ten first second next last you your his her our its who what when where why how not but for and with postgres swift swiftui xcode react node astro tailwind supabase sqlite json manage places plan vote votes note notes comment comments total done undo export import`.split(/\s+/));

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

const [dirArg, repoArg] = process.argv.slice(2);
if (!dirArg) { console.error("usage: node datacheck.mjs <artifact-dir> [repo-root]"); process.exit(2); }
const dir = dirArg;
if (!isDir(dir)) { console.error(`no such directory: ${dir}`); process.exit(2); }
let repo = repoArg;
if (!repo) {
  try { repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); } catch { repo = process.cwd(); }
}
const repoExists = isDir(repo);

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (n === ".git" || n === "node_modules") continue;
    const f = join(d, n);
    let st;
    try { st = lstatSync(f); } catch { continue; }
    st.isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}
// Sees only what git tracks (staged or committed), on purpose: a signal for what ships, not a raw
// walk of everything sitting in the working tree.
function tracked(r) {
  try { return execFileSync("git", ["-C", r, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean); }
  catch { return walk(r).map((f) => relative(r, f)); }
}

const hard = new Set();
const ask = new Map();
for (const f of walk(dir)) {
  if (!TEXT.has(extname(f).toLowerCase())) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(dir, f);
  for (const [label, rx] of [["contact", EMAIL], ["contact", PHONE], ["contact", ADDRESS], ["contact", LATLON]]) {
    for (const m of new Set(text.match(rx) ?? [])) hard.add(`${label.padEnd(8)} ${m.slice(0, 44).padEnd(44)}  in ${rel}`);
  }
  for (const m of new Set(text.match(MONEY) ?? [])) ask.set(m, (ask.get(m) ?? new Set()).add(rel));
  for (const m of text.matchAll(NAME)) {
    const tok = m[1] || m[2] || m[3];
    if (tok && !STOP.has(tok.toLowerCase())) ask.set(tok, (ask.get(tok) ?? new Set()).add(rel));
  }
}
const prod = repoExists ? tracked(repo).filter((p) => PROD.test(p)) : [];

console.log(`artifacts : ${dir}\nrepo      : ${repo}\n`);
if (!repoExists) console.log(`repo root does not exist, skipping the production-file scan: ${repo}\n`);
if (prod.length) {
  console.log("production-looking files in this repo. Schema is fine to read; rows are not:");
  for (const p of prod.slice(0, 20)) console.log(`    ${p}`);
  console.log();
}
if (hard.size) {
  console.log("MUST FIX. Contact details in the artifacts:");
  for (const line of [...hard].sort()) console.log(`  ${line}`);
  console.log("\n  Contact details must not appear, invented or not.\n");
}
if (ask.size) {
  console.log("ASK THE AUTHOR. Person names and amounts in the artifacts:");
  for (const [tok, files] of [...ask].sort()) console.log(`    ${tok.padEnd(16)} in ${[...files].sort().join(", ")}`);
  console.log("\n  Are the names invented, or real people? Are the amounts illustrative? Batch it into one question.\n  Invented placeholders are fine to keep.\n");
}
if (!hard.size && !ask.size && !prod.length) console.log("nothing to flag.");
process.exit(hard.size ? 1 : 0);
