import { Suspense } from 'react';
import WordForm from '@/components/WordForm';

export const metadata = { title: 'Add a word · Word Archive' };

export default function AddPage() {
  return (
    <Suspense fallback={<main className="page"><p className="muted" role="status">Loading…</p></main>}>
      <WordForm />
    </Suspense>
  );
}
