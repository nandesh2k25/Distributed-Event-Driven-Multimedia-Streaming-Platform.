import { describe, expect, it } from 'vitest';
import { describeCatalogClientContract } from './catalog-client.contract.js';
import { createInMemoryCatalog } from './in-memory-catalog.js';

describeCatalogClientContract({ describe, it, expect }, 'in-memory adapter', async () => {
  const catalog = createInMemoryCatalog();
  let seq = 0;
  return {
    client: catalog,
    seedTrack: async (t) => {
      const id = `seeded-${++seq}`;
      catalog.addTrack({ id, title: t.title, status: t.status ?? 'READY', storageKey: t.storageKey ?? null });
      return id;
    }
  };
});
