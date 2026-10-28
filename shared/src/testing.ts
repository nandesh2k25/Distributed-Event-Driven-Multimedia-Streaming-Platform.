// Test support for packages that depend on @music/shared. Kept out of the main entry so production
// code never pulls in vitest or the in-memory adapters.
export * from './catalog/in-memory-catalog.js';
export * from './catalog/catalog-client.contract.js';
