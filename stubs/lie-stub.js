// Obsidian only runs on Electron (Chromium), which always has a native
// Promise -- jszip's real dependency on "lie" (a Promise polyfill, which
// itself pulls in "immediate", an IE-era shim that creates <script>
// elements and uses new Function() to emulate setImmediate) is dead code
// here: jszip only requires "lie" inside an `if (typeof Promise ===
// "undefined")` branch that can never be true in this environment. A
// bundler can't prove that statically, so it ships the whole legacy shim
// anyway unless aliased away, which is what this file is for -- it
// replaces "lie" with the native Promise jszip would have used regardless,
// removing genuinely dead, security-review-flagged code from the bundle.
module.exports = Promise;
