// Entry point for the integration-test bundle: the real plugin class plus
// the in-memory obsidian stub's test helpers. build-harness.mjs redirects
// main.ts's `obsidian` import to the stub, so both resolve to one module
// instance and share the recorded notices.
export { default as ManuscriptExportPlugin } from "../src/main";
export { App, Vault, MetadataCache, TFile, TFolder, notices, resetNotices } from "./obsidian-stub";
