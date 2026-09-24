#!/usr/bin/env node
// check.mjs: does the prototype load without an error, and does it fit at 320 px?
//
//   node check.mjs <prototype.html> [--width N]
//
// Headless Chrome cannot report console errors from the command line, so this prepends a script to
// a temporary copy that records window.onerror, unhandled rejections and console.error, and after
// load writes them and the document's scroll width onto <html> as attributes. --dump-dom then hands
// the attributes back. Two renders: the app's own width (1120 unless --width) and 320. It does not
// click anything; the workflow says to drive the prototype by hand after this passes.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { findChrome, noChrome, runChrome, HIDE_CHROME, injectHead } from "./browser.mjs";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help") || !args.filter((a) => !a.startsWith("--")).length) {
  console.error("usage: node check.mjs <prototype.html> [--width N]");
  process.exit(2);
}
const file = resolve(args.find((a) => !a.startsWith("--")));
const wAt = args.indexOf("--width");
const width = wAt === -1 ? 1120 : Number(args[wAt + 1]);

const chrome = findChrome();
if (!chrome) noChrome();

const HOOK = `<script>
(function(){
  var errs=[];
  window.addEventListener("error",function(e){errs.push(String(e.message||e.error||e))});
  window.addEventListener("unhandledrejection",function(e){errs.push("unhandled rejection: "+String(e.reason))});
  var ce=console.error; console.error=function(){errs.push(Array.prototype.map.call(arguments,String).join(" ")); ce.apply(console,arguments)};
  function report(){
    var d=document.documentElement;
    d.setAttribute("data-speck-errors",JSON.stringify(errs));
    d.setAttribute("data-speck-overflow",String(d.scrollWidth>window.innerWidth));
  }
  window.addEventListener("load",function(){setTimeout(report,400)});
  setTimeout(report,2500);
})();
</script>`;

const src = readFileSync(file, "utf8");
const temp = join(dirname(file), `.check-${process.pid}.html`);
writeFileSync(temp, injectHead(src, HOOK + HIDE_CHROME));

function render(w) {
  const dom = runChrome(chrome, [`--window-size=${w},${Math.round(w * 10 / 16)}`, "--virtual-time-budget=4000", "--dump-dom", `file://${temp}`]);
  const errs = JSON.parse((dom.match(/data-speck-errors="([^"]*)"/)?.[1] ?? "[]").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const overflow = /data-speck-overflow="true"/.test(dom);
  return { errs, overflow, reported: /data-speck-errors=/.test(dom) };
}

try {
  const problems = [];
  const wide = render(width);
  if (!wide.reported) problems.push(`the page never finished loading at ${width} px (a script that blocks, or an error before the hook ran)`);
  for (const e of wide.errs) problems.push(`error at ${width} px: ${e}`);
  const narrow = render(320);
  for (const e of narrow.errs) if (!wide.errs.includes(e)) problems.push(`error at 320 px: ${e}`);
  if (narrow.overflow) problems.push("horizontal overflow at 320 px: something is wider than the viewport");
  if (problems.length) {
    console.error(`${file}:\n  ` + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`ok: no errors at ${width} px or 320 px, nothing overflows`);
} finally {
  rmSync(temp, { force: true });
}
