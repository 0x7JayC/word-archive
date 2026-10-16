'use client';

import { useEffect, useState } from 'react';
import Home from '@/components/Home';
import Welcome from '@/components/Welcome';
import { getStore } from '@/lib/store';

export default function Page() {
  const [state, setState] = useState<'loading' | 'welcome' | 'home' | 'error'>('loading');

  useEffect(() => {
    getStore().getMeta()
      .then((m) => setState(m.onboardedAt ? 'home' : 'welcome'))
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') return <main className="page"><p className="muted" role="status">Opening your archive…</p></main>;
  if (state === 'error') {
    return (
      <main className="page">
        <h1 className="page-title">This browser can&apos;t store your words</h1>
        <p className="muted">Private browsing or blocked site storage stops the demo from saving anything. Open this page in a normal window, or allow site data for it, then reload.</p>
      </main>
    );
  }
  if (state === 'welcome') return <Welcome onDone={() => setState('home')} />;
  return <Home />;
}
