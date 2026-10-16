import Link from 'next/link';

export default function ActionBar({ drafts }: { drafts: number }) {
  return (
    <nav className="actionbar" aria-label="Archive actions">
      <span className="demo-pill" title="Everything is stored only in this browser. Nothing is uploaded.">Demo mode</span>
      <Link className="btn" href="/data">My data</Link>
      <Link className="btn" href="/import">{drafts ? `Import (${drafts} to review)` : 'Import'}</Link>
      <Link className="btn btn-primary" href="/add">Add a word</Link>
    </nav>
  );
}
