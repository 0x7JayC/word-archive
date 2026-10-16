import { Suspense } from 'react';
import ImportQueue from '@/components/ImportQueue';

export const metadata = { title: 'Import · Word Archive' };

export default function ImportPage() {
  return (
    <Suspense fallback={<main className="page"><p className="muted" role="status">Loading…</p></main>}>
      <ImportQueue />
    </Suspense>
  );
}
