import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('legacy admin dashboard anomaly URL redirects to the existing permission-guarded page', async () => {
  const [legacyRoute, canonicalRoute] = await Promise.all([
    readFile(new URL('../app/(admin)/admin/dashboard/anomalies/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/(admin)/admin/anomalies/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(legacyRoute, /redirect\('\/admin\/anomalies'\)/);
  assert.match(canonicalRoute, /requireRRAPermission\("transaction\.read"\)/);
});
