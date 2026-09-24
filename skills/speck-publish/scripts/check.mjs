#!/usr/bin/env node
// check.mjs: does the prototype load without an error, and does it fit at 320 px?
//
//   node check.mjs <prototype.html> [--width N]
//
// Headless Chrome cannot report console errors from the command line, so this prepends a script to
// a temporary copy (in the system temp directory, removed afterwards) that records window.onerror, unhandled rejections and console.error, and after
// load writes them and the document's scroll width onto <html> as attributes. --dump-dom then hands
// the attributes back. Two renders: the app's own width (1120 unless --width) and 320. It does not
// click anything; the workflow says to drive the prototype by hand after this passes.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { findChrome, noChrome, runChrome, ChromeError, fileUrl, HIDE_CHROME, injectHead } from "./browser.mjs";

const USAGE = "usage: node check.mjs <prototype.html> [--width N]";
const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) { console.log(USAGE); process.exit(0); }
// A flag's value is not a positional: --width 640 proto.html names proto.html.
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!positional.length) { console.error(USAGE); process.exit(2); }
const file = resolve(positional[0]);
if (!existsSync(file)) { console.error(`no such file: ${file}`); process.exit(2); }

const wAt = args.indexOf("--width");
let width = 1120;
if (wAt !== -1) {
  width = Number(args[wAt + 1]);
  if (Number.isNaN(width)) { console.error("width must be a number"); process.exit(2); }
  if (!Number.isInteger(width) || width < 320 || width > 1600) {
    console.error(`width ${width} must be an integer between 320 and 1600`);
    process.exit(2);
  }
}

const chrome = findChrome();
if (!chrome) noChrome();

// report() fires immediately from the error handlers and the console.error override, not only on a
// timer, so an error thrown at any point before the dump reaches the attributes. The load+400ms call
// is what measures overflow once layout has settled; the fixed 3600ms call is a last snapshot taken
// before the 4000ms --virtual-time-budget below dumps the DOM.
const HOOK = `<script>
(function(){
  var errs=[];
  function report(){
    var d=document.documentElement;
    d.setAttribute("data-speck-errors",JSON.stringify(errs));
    d.setAttribute("data-speck-overflow",String(d.scrollWidth>window.innerWidth));
  }
  window.addEventListener("error",function(e){errs.push(String(e.message||e.error||e));report()});
  window.addEventListener("unhandledrejection",function(e){errs.push("unhandled rejection: "+String(e.reason));report()});
  var ce=console.error; console.error=function(){errs.push(Array.prototype.map.call(arguments,String).join(" "));report(); ce.apply(console,arguments)};
  window.addEventListener("load",function(){setTimeout(report,400)});
  setTimeout(report,3600);
})();
</script>`;

const src = readFileSync(file, "utf8");
const work = mkdtempSync(join(tmpdir(), "speck-check-"));
const temp = join(work, "prototype.html");

function render(w) {
  const dom = runChrome(chrome, [`--window-size=${w},${Math.round(w * 10 / 16)}`, "--virtual-time-budget=4000", "--dump-dom", fileUrl(temp)]);
  const errs = JSON.parse((dom.match(/data-speck-errors="([^"]*)"/)?.[1] ?? "[]").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const overflow = /data-speck-overflow="true"/.test(dom);
  return { errs, overflow, reported: /data-speck-errors=/.test(dom) };
}

// The temp directory is removed before any exit, success or failure: compute the problems inside
// try/finally, then decide the exit code once cleanup has already happened.
let problems, failed;
try {
  writeFileSync(temp, injectHead(src, HOOK + HIDE_CHROME));
  problems = [];
  const wide = render(width);
  if (!wide.reported) problems.push(`the page never finished loading at ${width} px (a script that blocks, or an error before the hook ran)`);
  for (const e of wide.errs) problems.push(`error at ${width} px: ${e}`);
  const narrow = render(320);
  for (const e of narrow.errs) if (!wide.errs.includes(e)) problems.push(`error at 320 px: ${e}`);
  if (narrow.overflow) problems.push("horizontal overflow at 320 px: something is wider than the viewport");
} catch (e) {
  if (!(e instanceof ChromeError)) throw e;
  failed = e;
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failed) { console.error(failed.message); process.exit(1); }
if (problems.length) {
  console.error(`${file}:\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`ok: no errors at ${width} px or 320 px, nothing overflows`);
