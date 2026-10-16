import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // The roadmap UI is plain browser JavaScript carried over from Prophetic Words (tested separately).
    ignores: ['.next/**', 'node_modules/**', 'lib/roadmap/app.js', 'lib/roadmap/shell.js', 'next-env.d.ts'],
  },
];

export default config;
