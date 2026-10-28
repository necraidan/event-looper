import { useCallback, useEffect, useState } from 'react';

export const SPEEDS = [0.5, 1, 2, 4] as const;

/** Delay between two steps at ×1. */
const STEP_DURATION = 1800;

export function usePlayer(total: number) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  const last = Math.max(0, total - 1);
  const atEnd = index >= last;

  // Playback stops by itself on the last step.
  const isPlaying = playing && !atEnd;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), STEP_DURATION / speed);
    return () => clearTimeout(timer);
  }, [isPlaying, index, last, speed]);

  const current = Math.min(index, last);
  // Not clamped to `last`: callers may target a step of a longer replay that is not rendered yet.
  const go = useCallback((i: number) => setIndex(Math.max(0, i)), []);

  const reset = useCallback(() => {
    setIndex(0);
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (atEnd) {
      setIndex(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [atEnd]);

  return {
    index: current,
    playing: isPlaying,
    speed,
    setSpeed,
    togglePlay,
    pause: () => setPlaying(false),
    next: () => go(Math.min(current + 1, last)),
    prev: () => go(current - 1),
    first: () => go(0),
    last: () => go(last),
    go,
    reset,
  };
}

export type Player = ReturnType<typeof usePlayer>;
