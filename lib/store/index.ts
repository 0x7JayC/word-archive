import { LocalStore } from './local';
import type { Store } from './types';

export type { Store } from './types';

let instance: Store | null = null;

/** Demo mode until the cloud adapter exists (Phase 0). The UI only ever talks to this interface. */
export function getStore(): Store {
  if (!instance) instance = new LocalStore();
  return instance;
}
