// Same reasoning as lie-stub.js: jszip requires "setimmediate" (an IE-era
// polyfill package that, like "immediate", creates <script> elements and
// uses new Function() as a legacy scheduling trick) unconditionally in
// lib/utils.js -- but Node/Electron has had native setImmediate for over a
// decade, and Obsidian plugins run with Node integration enabled. The real
// setimmediate package only *defines* global.setImmediate if it's missing,
// so this stub does the same thing correctly with zero legacy shim code.
if (typeof globalThis.setImmediate === "undefined") {
	globalThis.setImmediate = function (callback, ...args) {
		return setTimeout(() => callback(...args), 0);
	};
	globalThis.clearImmediate = function (handle) {
		clearTimeout(handle);
	};
}
