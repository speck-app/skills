#!/usr/bin/env node
// datacheck.mjs: is there real data in the artifacts?
//
//   node datacheck.mjs <artifact-dir> [repo-root]
//
// Three things, and only these:
//   contact   emails, phone numbers, street addresses, coordinates. Exit 1, unless the address or
//             number is in a reserved shape: mail at example.com, .test or .invalid, a 555-01xx
//             phone number. Those are how a prototype fills an email column, and are not listed.
//   prodfile  files in the repo whose names say production data. Schema fine, rows not. Listed.
//   ask       person-name candidates and money-shaped values. Questions for the author, exit 0.
//
// It does not care about labels, microcopy or screen structure: those are the interface and they
// belong in the prototype. A prompt for judgment, not a gate.
import { readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { execFileSync } from "node:child_process";

const TEXT = new Set([".md", ".txt", ".html", ".css", ".js", ".mjs", ".json"]);
// Production data, by the shape of a data file: a database, a dump, a backup, an export. Anchored
// on data extensions so source files named for the feature (src/export.ts, Export.tsx) stay out.
const DATA_EXT = "csv|tsv|json|jsonl|ndjson|sql|xlsx?|parquet|gz|zip|tar|sqlite3?|db|dump|bak";
const PROD = new RegExp([
  String.raw`\.(sqlite3?|db|dump|bak)$`,
  String.raw`(^|/)[^/]*[-_](export|dump|backup)\.(${DATA_EXT})$`,
  String.raw`(^|/)(dump|backup|export|snapshot)s?([-_.][^/]*)?\.(${DATA_EXT})$`,
  String.raw`(^|/)(prod|production)[-_.][^/]*\.(${DATA_EXT})$`,
  String.raw`(^|/)(backups?|dumps?)/`,
].join("|"), "i");
const MONEY = /(?<![\w.])(?:[$£€¥]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\.\d{2}\s?(?:USD|EUR|GBP|CAD|AUD)|\d[\d.]*(?:,\d{2})?\s?[€£$¥])(?![\w])/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;
// A US-shaped number, or an international one written with its + prefix.
const PHONE = /(?<![\d-])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)|(?<![\w+])\+\d{1,3}[ .-]?\(?\d{1,4}\)?(?:[ .-]?\d{2,4}){2,4}(?!\d)/g;
const ADDRESS = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/g;
const LATLON = /(?<![\w.])-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}(?![\w.])/g;

// Not contact details at all: a retina image name (logo@2x.png) has an email's shape.
const IMAGE_SUFFIX = /@\d+x\.(png|jpe?g|webp|svg|gif|avif)$/i;
// Contact details in the shapes set aside for examples. Allowed, and not listed.
function reserved(label, m) {
  if (label === "email") {
    const domain = m.split("@")[1].toLowerCase();
    return domain === "example.com" || domain.endsWith(".example.com") || /\.(test|invalid)$/.test(domain);
  }
  if (label === "phone") return /55501\d\d$/.test(m.replace(/\D/g, ""));
  return false;
}

// A capitalised word used as a person, two ways. After "by", "from", "with" or "and" in prose. Or
// as the value of a name-like key in JS or JSON, quoted or not, with any of the three quotes, one
// or two capitalised words. Case-sensitive on the name so ALL-CAPS labels and CamelCase stay out.
// Text between tags is not a signal: that is where every button label lives.
const PROSE_NAME = /\b(?:by|from|with|and|By|From|With|And)\s+([A-Z][a-z]{2,11})\b/g;
const KEYS = "name|firstName|first_name|author|user|member|kid|child|person|owner|assignee|who|from|to";
const KEY_NAME = new RegExp(String.raw`(?<![\w$.])(["'${"`"}]?)(${KEYS})\1\s*:\s*(["'${"`"}])([A-Z][a-z]{1,15}(?: [A-Z][a-z]{1,15})?)\3`, "g");
const STOP = new Set(`today tonight yesterday tomorrow monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thurs fri sat sun january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec delivery cooking dinner lunch breakfast settings history nothing loading prototype download default open close save cancel delete remove change edit view show hide start about after before the this that these those there their them then they each every both some any one two three four five six seven eight nine ten first second next last you your his her our its who what when where why how not but for and with postgres swift swiftui xcode react node astro tailwind supabase sqlite json manage places plan vote votes note notes comment comments total done undo export import me everyone anyone nobody someone all none unassigned home work`.split(/\s+/));

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

const USAGE = "usage: node datacheck.mjs <artifact-dir> [repo-root]";
const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) { console.log(USAGE); process.exit(0); }
const [dirArg, repoArg] = argv;
if (!dirArg) { console.error(USAGE); process.exit(2); }
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

// The app's own name is not a person, wherever it turns up.
let appName = null;
try { appName = JSON.parse(readFileSync(join(dir, "entry.json"), "utf8")).name?.toLowerCase() ?? null; } catch {}
const isName = (tok) => tok.toLowerCase() !== appName && !tok.split(" ").every((w) => STOP.has(w.toLowerCase()));

const hard = new Set();
const ask = new Map();
const addAsk = (tok, rel) => ask.set(tok, (ask.get(tok) ?? new Set()).add(rel));
for (const f of walk(dir)) {
  if (!TEXT.has(extname(f).toLowerCase())) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(dir, f);
  for (const [label, rx] of [["email", EMAIL], ["phone", PHONE], ["address", ADDRESS], ["latlon", LATLON]]) {
    for (const m of new Set(text.match(rx) ?? [])) {
      if (label === "email" && IMAGE_SUFFIX.test(m)) continue;
      if (reserved(label, m)) continue;
      hard.add(`${"contact".padEnd(8)} ${m.slice(0, 44).padEnd(44)}  in ${rel}`);
    }
  }
  for (const m of new Set(text.match(MONEY) ?? [])) addAsk(m, rel);
  for (const m of text.matchAll(PROSE_NAME)) if (isName(m[1])) addAsk(m[1], rel);
  for (const m of text.matchAll(KEY_NAME)) {
    // entry.json's own name field is the app's name.
    if (rel === "entry.json" && m[2] === "name") continue;
    if (isName(m[4])) addAsk(m[4], rel);
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
  console.log("\n  Contact details are invented, in reserved shapes only: mail at example.com, .test or .invalid,\n  phone numbers in the 555-01xx block, no street addresses or coordinates.\n");
}
if (ask.size) {
  console.log("ASK THE AUTHOR. Person names and amounts in the artifacts:");
  for (const [tok, files] of [...ask].sort()) console.log(`    ${tok.padEnd(16)} in ${[...files].sort().join(", ")}`);
  console.log("\n  Are the names invented, or real people? Are the amounts illustrative? Batch it into one question.\n  Invented placeholders are fine to keep.\n");
}
if (!hard.size && !ask.size && !prod.length) console.log("nothing to flag.");
process.exit(hard.size ? 1 : 0);
