export type RoadmapAction =
  | { type: 'status'; id: string; status: string }
  | { type: 'reflect'; id: string; text: string }
  | { type: 'edit'; id: string }
  | { type: 'delete'; id: string };

export function mountRoadmap(
  container: HTMLElement,
  words: unknown[],
  updated: string,
  opts?: { onAction?: (action: RoadmapAction) => void }
): () => void;
